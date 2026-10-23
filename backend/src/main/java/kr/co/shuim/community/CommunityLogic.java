package kr.co.shuim.community;

import kr.co.shuim.common.Dates;
import kr.co.shuim.community.Model.*;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/** lib/community-core.ts 의 순수 계산 로직(가시성, 주간 집계, 샘플 자동 답글)을 그대로 옮긴 것 */
public final class CommunityLogic {
    private CommunityLogic() {}

    public static final List<String> SHOUT_CAT_IDS = List.of("misfortune", "anxiety", "money", "work", "relation", "body", "small-win", "free");
    public static final List<String> REPORT_REASON_IDS = List.of("not_comfort", "abuse", "spam", "other");
    public static final int REPORT_THRESHOLD = 5;
    public static final int FEED_BG_COUNT = 6;
    public static final int FEED_MAX_PAGES = 10;
    public static final int SHOUT_MAX_IMAGES = 4;

    /** 요청의 사진 주소 목록을 정리: 문자열·500자 이하·accept 통과만, 중복 제거, 최대 max 장 (null·문자열 하나도 받는다) */
    public static List<String> cleanImageList(Object raw, int max, java.util.function.Predicate<String> accept) {
        List<?> items = raw instanceof List<?> l ? l : raw == null ? List.of() : List.of(raw);
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (Object o : items) {
            if (!(o instanceof String s)) continue;
            String u = s.strip();
            if (u.isEmpty() || u.length() > 500 || !accept.test(u)) continue;
            out.add(u);
            if (out.size() >= max) break;
        }
        return new ArrayList<>(out);
    }
    public static final int[] RANK_SHARES = {25, 18, 14, 11, 9, 7, 6, 4, 3, 3};
    public static final long PROVISIONAL_TTL = 5 * 60 * 1000L;

    /* ---------- 닉네임 ---------- */

    private static final String[] NICK_A = {"조용한", "느린", "따뜻한", "고요한", "작은", "흐린", "맑은", "푸른", "낮은", "깊은"};
    private static final String[] NICK_B = {"바람", "구름", "파도", "숲", "달", "강", "안개", "돌", "눈", "빛"};

    public static String randomNick() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return NICK_A[r.nextInt(NICK_A.length)] + " " + NICK_B[r.nextInt(NICK_B.length)] + " " + (r.nextInt(90) + 10);
    }

    /* ---------- 조회 ---------- */

    public static User userById(Store s, String id) {
        if (s.me().id().equals(id)) return s.me();
        for (User u : s.users()) if (u.id().equals(id)) return u;
        return new User(id, "익명", null, null, null);
    }

    public static List<Report> activeReports(Item item) {
        if (item.reviewedAt() == null) return item.reports();
        return item.reports().stream().filter(r -> r.at() > item.reviewedAt()).toList();
    }

    public static boolean isFlagged(Item item) {
        return !Boolean.TRUE.equals(item.hidden()) && activeReports(item).size() >= REPORT_THRESHOLD;
    }

    public static boolean isVisible(Store s, Item item) {
        if (Boolean.TRUE.equals(item.hidden())) return false;
        return !userById(s, item.authorId()).blocked();
    }

    /* ---------- 주간 집계 ---------- */

    private record Agg(int cheers, int posts, Post top, long first) {}

    public static WeeklyBatch computeWeekly(Store s, String week, boolean finalized) {
        Map<String, Agg> byUser = new LinkedHashMap<>();
        for (Post p : s.posts()) {
            if (!"misfortune".equals(p.cat()) || !week.equals(Dates.weekKeyOf(p.createdAt())) || !isVisible(s, p)) continue;
            int n = p.cheers().size();
            Agg cur = byUser.get(p.authorId());
            if (cur == null) byUser.put(p.authorId(), new Agg(n, 1, p, p.createdAt()));
            else byUser.put(p.authorId(), new Agg(cur.cheers + n, cur.posts + 1, n > cur.top.cheers().size() ? p : cur.top, Math.min(cur.first, p.createdAt())));
        }
        List<Donation> donations = s.donations().stream().filter(d -> week.equals(Dates.weekKeyOf(d.at()))).toList();
        long total = donations.stream().mapToLong(Donation::amount).sum();
        List<Map.Entry<String, Agg>> sorted = new ArrayList<>(byUser.entrySet());
        sorted.sort((a, b) -> b.getValue().cheers != a.getValue().cheers ? Integer.compare(b.getValue().cheers, a.getValue().cheers) : Long.compare(a.getValue().first, b.getValue().first));
        if (sorted.size() > 20) sorted = sorted.subList(0, 20);
        int topN = Math.min(10, sorted.size());
        int shareSum = 0;
        for (int i = 0; i < topN; i++) shareSum += RANK_SHARES[i];
        if (shareSum == 0) shareSum = 1;
        long distributed = 0;
        List<RankRow> rows = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) {
            var e = sorted.get(i);
            Agg v = e.getValue();
            double share = i < 10 ? Math.round((double) RANK_SHARES[i] / shareSum * 1000) / 10.0 : 0;
            long payout = i < 10 ? Math.floorDiv(total * RANK_SHARES[i], shareSum) : 0;
            distributed += payout;
            String topText = v.top.text().length() > 80 ? v.top.text().substring(0, 80) : v.top.text();
            rows.add(new RankRow(i + 1, e.getKey(), userById(s, e.getKey()).nick(), v.cheers, v.posts, v.top.id(), topText, share, payout));
        }
        if (!rows.isEmpty() && total > distributed) {
            RankRow r0 = rows.get(0);
            rows.set(0, new RankRow(r0.rank(), r0.userId(), r0.nick(), r0.cheers(), r0.posts(), r0.topPostId(), r0.topPostText(), r0.share(), r0.payout() + (total - distributed)));
        }
        int donors = (int) donations.stream().map(Donation::by).distinct().count();
        return new WeeklyBatch(week, System.currentTimeMillis(), finalized, rows, new Fund(total, donations.size(), donors));
    }

    public record WeekTodo(String week, boolean finalized) {}

    /** 어떤 주를 (다시) 계산해야 하는지: 지난 주는 확정, 이번 주는 5분마다 잠정 */
    public static List<WeekTodo> weeksNeedingCompute(Store s) {
        String cur = Dates.currentWeekKey();
        Set<String> weeks = new LinkedHashSet<>();
        weeks.add(cur);
        for (Post p : s.posts()) if ("misfortune".equals(p.cat())) weeks.add(Dates.weekKeyOf(p.createdAt()));
        for (Donation d : s.donations()) weeks.add(Dates.weekKeyOf(d.at()));
        List<WeekTodo> out = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (String w : weeks) {
            WeeklyBatch b = s.weekly().get(w);
            if (w.compareTo(cur) < 0) {
                if (b == null || !b.finalized()) out.add(new WeekTodo(w, true));
            } else if (w.equals(cur)) {
                if (b == null || b.finalized() || now - b.computedAt() > PROVISIONAL_TTL) out.add(new WeekTodo(w, false));
            }
        }
        return out;
    }

    /* ---------- 프로토타입: 샘플 유저의 자동 답글 ---------- */

    static final String[] REPLY_POOL = {
        "그 말을 여기 적어둔 것만으로도 오늘 한 걸음이에요.",
        "저도 비슷한 날이 있었어요. 지나가더라고요. 지금은 그냥 지나가는 중이에요.",
        "힘내라는 말 대신, 오늘은 그냥 여기 있어줘서 고마워요.",
        "읽고 한참 멈춰 있었어요. 혼자 아니에요.",
        "오늘 밤은 아무것도 결정하지 말고 그냥 자요. 내일의 당신이 알아서 할 거예요.",
        "이렇게 솔직하게 쓰는 사람은 이미 반은 괜찮아지는 중이에요.",
    };
    static final String[] THREAD_REPLY_POOL = {
        "댓글 읽고 저도 힘이 났어요. 고마워요.",
        "그 말 덕분에 오늘 조금 괜찮아졌어요.",
        "저장해 두고 다시 읽을게요.",
        "맞아요, 그렇게 생각하니 좀 가벼워지네요.",
    };
    static final long SIM_DELAY = 30 * 1000L;

    static <T> T pickBySeed(List<T> arr, String seed) {
        int n = 0;
        for (char ch : seed.toCharArray()) n += ch;
        return arr.get(Math.floorMod(n, arr.size()));
    }

    /** 아직 답글이 없는 내 글·댓글에 붙일 샘플 답글 목록 (저장은 호출자가) */
    public static List<Comment> pendingSimulatedReplies(Store s, List<String> sampleUserIds) {
        String me = s.me().id();
        long now = System.currentTimeMillis();
        List<User> samples = s.users().stream().filter(u -> sampleUserIds.contains(u.id()) && !u.blocked()).toList();
        if (samples.isEmpty()) return List.of();
        List<Comment> added = new ArrayList<>();
        for (Post p : s.posts()) {
            if (!p.authorId().equals(me) || Boolean.TRUE.equals(p.hidden()) || now - p.createdAt() < SIM_DELAY) continue;
            if (s.comments().stream().anyMatch(c -> c.postId().equals(p.id()) && !c.authorId().equals(me))) continue;
            User actor = pickBySeed(samples, p.id());
            added.add(new Comment("sim-" + p.id(), p.id(), pickBySeed(List.of(REPLY_POOL), p.id() + actor.id()), actor.id(), now, new ArrayList<>(), new ArrayList<>(), null, null));
        }
        for (Comment c : s.comments()) {
            if (!c.authorId().equals(me) || now - c.createdAt() < SIM_DELAY) continue;
            String owner = s.posts().stream().filter(p -> p.id().equals(c.postId())).map(Post::authorId).findFirst()
                .orElseGet(() -> s.feed().stream().filter(f -> f.id().equals(c.postId())).map(FeedPost::authorId).findFirst().orElse(null));
            if (owner == null || owner.equals(me)) continue;
            boolean already = s.comments().stream().anyMatch(x -> x.postId().equals(c.postId()) && !x.authorId().equals(me) && x.createdAt() > c.createdAt())
                || added.stream().anyMatch(x -> x.postId().equals(c.postId()));
            if (already) continue;
            User actor = samples.stream().filter(u -> u.id().equals(owner)).findFirst().orElseGet(() -> pickBySeed(samples, c.id()));
            added.add(new Comment("sim-" + c.id(), c.postId(), pickBySeed(List.of(THREAD_REPLY_POOL), c.id()), actor.id(), now, new ArrayList<>(), new ArrayList<>(), null, null));
        }
        return added;
    }
}
