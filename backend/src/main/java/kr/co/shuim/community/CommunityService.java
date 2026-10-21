package kr.co.shuim.community;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.common.Ids;
import kr.co.shuim.community.Model.*;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.upload.S3Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Pattern;

/**
 * 커뮤니티 저장소. 화면이 쓰는 Store 모양을 그대로 만들어 돌려주고, 변경은 SQL 로 처리한 뒤 다시 전체를 읽어 돌려준다.
 * (lib/server/community.ts 를 옮긴 것)
 */
@Service
public class CommunityService {
    private static final List<String> SAMPLE_USER_IDS = List.of("u1", "u2", "u3", "u4", "u5", "u6", "u7");
    private static final Pattern URL = Pattern.compile("^(/|https?://)");

    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final S3Service s3;
    private final boolean simulate;

    public CommunityService(JdbcClient jdbc, ObjectMapper json, S3Service s3, Environment env,
                            @Value("${app.community.simulate:true}") boolean simulate) {
        this.jdbc = jdbc;
        this.json = json;
        this.s3 = s3;
        this.simulate = simulate && !Arrays.asList(env.getActiveProfiles()).contains("prod");
    }

    /* ---------- 읽기 ---------- */

    @Transactional
    public Store loadStore(DbUser me) {
        Map<String, List<String>> cheerMap = new HashMap<>();
        jdbc.sql("SELECT user_id, target_kind, target_id FROM cheers ORDER BY created_at").query(rs -> {
            cheerMap.computeIfAbsent(rs.getString("target_kind") + ":" + rs.getString("target_id"), k -> new ArrayList<>()).add(rs.getString("user_id"));
        });
        Map<String, List<Report>> reportMap = new HashMap<>();
        jdbc.sql("SELECT reporter_id, target_kind, target_id, reason, created_at FROM reports ORDER BY created_at").query(rs -> {
            reportMap.computeIfAbsent(rs.getString("target_kind") + ":" + rs.getString("target_id"), k -> new ArrayList<>())
                .add(new Report(rs.getString("reporter_id"), rs.getString("reason"), Db.msReq(rs, "created_at")));
        });
        Map<String, List<String>> saveMap = new HashMap<>();
        jdbc.sql("SELECT user_id, feed_post_id FROM saves ORDER BY created_at").query(rs -> {
            saveMap.computeIfAbsent(rs.getString("feed_post_id"), k -> new ArrayList<>()).add(rs.getString("user_id"));
        });
        Map<String, List<String>> followerMap = new HashMap<>();
        List<String> following = new ArrayList<>();
        jdbc.sql("SELECT follower_id, creator_id FROM follows ORDER BY created_at").query(rs -> {
            followerMap.computeIfAbsent(rs.getString("creator_id"), k -> new ArrayList<>()).add(rs.getString("follower_id"));
            if (rs.getString("follower_id").equals(me.id())) following.add(rs.getString("creator_id"));
        });

        List<User> allUsers = jdbc.sql("SELECT id, nick, role, blocked_at, blocked_reason FROM users")
            .query((rs, i) -> new User(rs.getString("id"), rs.getString("nick"), "admin".equals(rs.getString("role")) ? "admin" : "user", Db.ms(rs, "blocked_at"), rs.getString("blocked_reason"))).list();
        User meUser = allUsers.stream().filter(u -> u.id().equals(me.id())).findFirst().orElse(new User(me.id(), me.nick(), me.role(), null, null));
        List<User> users = new ArrayList<>(allUsers.stream().filter(u -> !u.id().equals(me.id())).toList());

        List<Post> posts = jdbc.sql("SELECT * FROM shout_posts").query((rs, i) -> new Post(
            rs.getString("id"), rs.getString("cat"), rs.getString("text"), rs.getString("author_id"), Db.msReq(rs, "created_at"),
            listOf(cheerMap, "post:" + rs.getString("id")), reportsOf(reportMap, "post:" + rs.getString("id")), Db.trueOrNull(rs, "hidden"), Db.ms(rs, "reviewed_at"))).list();
        List<Comment> comments = new ArrayList<>(jdbc.sql("SELECT * FROM comments").query((rs, i) -> new Comment(
            rs.getString("id"), rs.getString("post_id"), rs.getString("text"), rs.getString("author_id"), Db.msReq(rs, "created_at"),
            listOf(cheerMap, "comment:" + rs.getString("id")), reportsOf(reportMap, "comment:" + rs.getString("id")), Db.trueOrNull(rs, "hidden"), Db.ms(rs, "reviewed_at"))).list());
        List<FeedPost> feed = jdbc.sql("SELECT * FROM feed_posts").query((rs, i) -> {
            String id = rs.getString("id");
            String image = rs.getString("image");
            String title = rs.getString("title");
            String text = rs.getString("text");
            List<String> images = Db.textArray(rs, "images");
            if (images.isEmpty() && image != null) images = new ArrayList<>(List.of(image));
            List<FeedPage> pages = parsePages(rs.getString("pages"));
            if (pages.isEmpty()) pages = List.of(new FeedPage(image, title, text));
            return new FeedPost(id, title, text, rs.getInt("bg"), image, images, pages, rs.getString("author_id"), Db.msReq(rs, "created_at"),
                listOf(cheerMap, "feed:" + id), reportsOf(reportMap, "feed:" + id), listOf(saveMap, id), Db.trueOrNull(rs, "hidden"), Db.ms(rs, "reviewed_at"));
        }).list();
        Map<String, Creator> creators = new LinkedHashMap<>();
        jdbc.sql("SELECT user_id, bio, since FROM creators").query(rs -> {
            creators.put(rs.getString("user_id"), new Creator(rs.getString("bio"), listOf(followerMap, rs.getString("user_id")), Db.msReq(rs, "since")));
        });
        List<Donation> donations = jdbc.sql("SELECT * FROM donations ORDER BY created_at DESC").query((rs, i) ->
            new Donation(rs.getString("id"), rs.getString("user_id"), rs.getInt("amount"), rs.getString("message"), Db.msReq(rs, "created_at"))).list();
        Map<String, WeeklyBatch> weekly = new LinkedHashMap<>();
        jdbc.sql("SELECT * FROM weekly_batches").query(rs -> {
            String week = Db.date(rs, "week");
            weekly.put(week, new WeeklyBatch(week, Db.msReq(rs, "computed_at"), rs.getBoolean("finalized"), parseRows(rs.getString("rows")),
                new Fund(rs.getLong("fund_total"), rs.getInt("fund_count"), rs.getInt("fund_donors"))));
        });

        Store store = new Store(meUser, users, posts, comments, feed, creators, following, donations, weekly);

        // 프로토타입: 샘플 유저의 자동 답글
        if (simulate) {
            for (Comment c : CommunityLogic.pendingSimulatedReplies(store, SAMPLE_USER_IDS)) {
                boolean isPost = store.posts().stream().anyMatch(p -> p.id().equals(c.postId()));
                jdbc.sql("INSERT INTO comments (id, post_kind, post_id, author_id, text) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING")
                    .param(c.id()).param(isPost ? "post" : "feed").param(c.postId()).param(c.authorId()).param(c.text()).update();
                store.comments().add(c);
            }
        }

        // 주간 집계 (지난 주 확정, 이번 주 잠정)
        for (CommunityLogic.WeekTodo w : CommunityLogic.weeksNeedingCompute(store)) {
            WeeklyBatch b = CommunityLogic.computeWeekly(store, w.week(), w.finalized());
            upsertWeekly(b);
            store.weekly().put(w.week(), b);
        }
        return store;
    }

    private static List<String> listOf(Map<String, List<String>> m, String k) {
        List<String> v = m.get(k);
        return v == null ? new ArrayList<>() : v;
    }

    private static List<Report> reportsOf(Map<String, List<Report>> m, String k) {
        List<Report> v = m.get(k);
        return v == null ? new ArrayList<>() : v;
    }

    private List<FeedPage> parsePages(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<Map<String, Object>> list = json.readValue(raw, new TypeReference<>() {});
            List<FeedPage> out = new ArrayList<>();
            for (Map<String, Object> p : list) {
                Object t = p.get("text");
                out.add(new FeedPage(str(p.get("image")), str(p.get("title")), t == null ? "" : String.valueOf(t)));
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    private List<RankRow> parseRows(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return json.readValue(raw, new TypeReference<List<RankRow>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private void upsertWeekly(WeeklyBatch b) {
        try {
            jdbc.sql("""
                INSERT INTO weekly_batches (week, computed_at, finalized, rows, fund_total, fund_count, fund_donors)
                VALUES (?::date, now(), ?, ?::jsonb, ?, ?, ?)
                ON CONFLICT (week) DO UPDATE SET computed_at = now(), finalized = EXCLUDED.finalized, rows = EXCLUDED.rows,
                  fund_total = EXCLUDED.fund_total, fund_count = EXCLUDED.fund_count, fund_donors = EXCLUDED.fund_donors
                """)
                .param(b.week()).param(b.finalized()).param(json.writeValueAsString(b.rows()))
                .param(b.fund().total()).param(b.fund().count()).param(b.fund().donors()).update();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /* ---------- 쓰기 (모두 loadStore 로 끝나 최신 상태를 돌려준다) ---------- */

    private static void assertNotBlocked(DbUser me) {
        if (me.blocked()) throw ApiException.forbidden("차단된 계정은 글과 댓글을 쓸 수 없어요.");
    }

    private static String assertKind(String k) {
        if ("post".equals(k) || "comment".equals(k) || "feed".equals(k)) return k;
        throw ApiException.badRequest("대상 종류가 올바르지 않아요");
    }

    private static String text(Object v, int max) {
        String t = v instanceof String s ? s.strip() : "";
        if (t.isEmpty()) throw ApiException.badRequest("내용이 비어 있어요");
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String str(Object v, int max) {
        if (!(v instanceof String s)) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    @Transactional
    public Store createPost(DbUser me, Object cat, Object body) {
        assertNotBlocked(me);
        if (!(cat instanceof String c) || !CommunityLogic.SHOUT_CAT_IDS.contains(c)) throw ApiException.badRequest("카테고리가 올바르지 않아요");
        jdbc.sql("INSERT INTO shout_posts (id, author_id, cat, text) VALUES (?, ?, ?, ?)").param(Ids.uid()).param(me.id()).param(c).param(text(body, 600)).update();
        return loadStore(me);
    }

    @Transactional
    public Store deletePost(DbUser me, String id) {
        int n = jdbc.sql("DELETE FROM shout_posts WHERE id = ? AND author_id = ?").param(id).param(me.id()).update();
        if (n > 0) jdbc.sql("DELETE FROM comments WHERE post_kind = 'post' AND post_id = ?").param(id).update();
        return loadStore(me);
    }

    @Transactional
    public Store addComment(DbUser me, String postId, Object body) {
        assertNotBlocked(me);
        String kind = jdbc.sql("SELECT count(*) FROM shout_posts WHERE id = ?").param(postId).query(Long.class).single() > 0 ? "post"
            : jdbc.sql("SELECT count(*) FROM feed_posts WHERE id = ?").param(postId).query(Long.class).single() > 0 ? "feed" : null;
        if (kind == null) throw ApiException.notFound("글을 찾을 수 없어요");
        jdbc.sql("INSERT INTO comments (id, post_kind, post_id, author_id, text) VALUES (?, ?, ?, ?, ?)")
            .param(Ids.uid()).param(kind).param(postId).param(me.id()).param(text(body, 300)).update();
        return loadStore(me);
    }

    @Transactional
    public Store deleteComment(DbUser me, String id) {
        jdbc.sql("DELETE FROM comments WHERE id = ? AND author_id = ?").param(id).param(me.id()).update();
        return loadStore(me);
    }

    @Transactional
    public Store toggleCheer(DbUser me, Target target) {
        String kind = assertKind(target.kind());
        int del = jdbc.sql("DELETE FROM cheers WHERE user_id = ? AND target_kind = ? AND target_id = ?").param(me.id()).param(kind).param(target.id()).update();
        if (del == 0) jdbc.sql("INSERT INTO cheers (user_id, target_kind, target_id) VALUES (?, ?, ?)").param(me.id()).param(kind).param(target.id()).update();
        return loadStore(me);
    }

    @Transactional
    public Store report(DbUser me, Target target, Object reason) {
        String kind = assertKind(target.kind());
        if (!(reason instanceof String r) || !CommunityLogic.REPORT_REASON_IDS.contains(r)) throw ApiException.badRequest("신고 사유가 올바르지 않아요");
        jdbc.sql("INSERT INTO reports (id, reporter_id, target_kind, target_id, reason) VALUES (?, ?, ?, ?, ?) ON CONFLICT (reporter_id, target_kind, target_id) DO NOTHING")
            .param(Ids.uid()).param(me.id()).param(kind).param(target.id()).param(r).update();
        return loadStore(me);
    }

    /**
     * 피드 글 작성. pages = [{ image?, title?, text }] 콘텐츠 목록(1~10개).
     * 옛 호출(text/title/images)도 받아서 콘텐츠 하나(또는 사진마다 같은 글)로 바꾼다.
     */
    @Transactional
    @SuppressWarnings("unchecked")
    public Store createFeedPost(DbUser me, Object body, Object bg, Object title, Object images, Object pages) {
        assertNotBlocked(me);
        int bgN = 0;
        if (bg instanceof Number n) bgN = n.intValue();
        else if (bg instanceof String s) try { bgN = Integer.parseInt(s.strip()); } catch (NumberFormatException ignored) { /* 0 */ }
        bgN = Math.max(0, Math.min(CommunityLogic.FEED_BG_COUNT - 1, bgN));

        List<FeedPage> list = new ArrayList<>();
        if (pages instanceof List<?> raw) {
            for (Object o : raw) {
                if (!(o instanceof Map<?, ?> m)) continue;
                Map<String, Object> p = (Map<String, Object>) m;
                String t = str(p.get("text"), 280);
                if (t == null) continue;
                String img = okUrl(p.get("image")) ? str(p.get("image"), 500) : null;
                list.add(new FeedPage(img, str(p.get("title"), 24), t));
            }
        }
        if (list.isEmpty()) {
            String t = text(body, 280);
            List<String> imgs = new ArrayList<>();
            if (images instanceof List<?> l) for (Object u : l) { if (okUrl(u)) imgs.add(str(u, 500)); }
            else if (okUrl(images)) imgs.add(str(images, 500));
            String tt = str(title, 24);
            if (imgs.isEmpty()) list.add(new FeedPage(null, tt, t));
            else for (String img : imgs) list.add(new FeedPage(img, tt, t));
        }
        if (list.size() > CommunityLogic.FEED_MAX_PAGES) list = new ArrayList<>(list.subList(0, CommunityLogic.FEED_MAX_PAGES));
        FeedPage first = list.get(0);
        String[] allImages = list.stream().map(FeedPage::image).filter(Objects::nonNull).toArray(String[]::new);
        jdbc.sql("INSERT INTO creators (user_id, bio) VALUES (?, '') ON CONFLICT (user_id) DO NOTHING").param(me.id()).update();
        try {
            jdbc.sql("INSERT INTO feed_posts (id, author_id, title, text, bg, image, images, pages) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)")
                .param(Ids.uid()).param(me.id()).param(first.title()).param(first.text()).param(bgN).param(first.image())
                .param(allImages).param(json.writeValueAsString(list)).update();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        return loadStore(me);
    }

    private static boolean okUrl(Object u) {
        return u instanceof String s && URL.matcher(s.strip()).find();
    }

    @Transactional
    public Store deleteFeedPost(DbUser me, String id) {
        record Img(String image, List<String> images) {}
        Optional<Img> r = jdbc.sql("DELETE FROM feed_posts WHERE id = ? AND author_id = ? RETURNING image, images").param(id).param(me.id())
            .query((rs, i) -> new Img(rs.getString("image"), Db.textArray(rs, "images"))).optional();
        if (r.isPresent()) {
            jdbc.sql("DELETE FROM comments WHERE post_kind = 'feed' AND post_id = ?").param(id).update();
            Set<String> urls = new LinkedHashSet<>(r.get().images());
            if (r.get().image() != null) urls.add(r.get().image());
            for (String u : urls) s3.deleteUploadedImage(u); // 우리 S3 에 올린 사진이면 함께 삭제
        }
        return loadStore(me);
    }

    @Transactional
    public Store updateBio(DbUser me, Object bio) {
        String b = bio instanceof String s ? s.strip() : "";
        if (b.length() > 80) b = b.substring(0, 80);
        jdbc.sql("INSERT INTO creators (user_id, bio) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio").param(me.id()).param(b).update();
        return loadStore(me);
    }

    @Transactional
    public Store toggleFollow(DbUser me, String creatorId) {
        if (creatorId.equals(me.id())) throw ApiException.badRequest("자기 자신은 팔로우할 수 없어요");
        int del = jdbc.sql("DELETE FROM follows WHERE follower_id = ? AND creator_id = ?").param(me.id()).param(creatorId).update();
        if (del == 0) jdbc.sql("INSERT INTO follows (follower_id, creator_id) VALUES (?, ?)").param(me.id()).param(creatorId).update();
        return loadStore(me);
    }

    @Transactional
    public Store toggleSave(DbUser me, String feedId) {
        int del = jdbc.sql("DELETE FROM saves WHERE user_id = ? AND feed_post_id = ?").param(me.id()).param(feedId).update();
        if (del == 0) jdbc.sql("INSERT INTO saves (user_id, feed_post_id) VALUES (?, ?)").param(me.id()).param(feedId).update();
        return loadStore(me);
    }

    @Transactional
    public Store donate(DbUser me, Object amount, Object message) {
        long amt;
        if (amount instanceof Number n) amt = (long) Math.floor(n.doubleValue());
        else {
            try { amt = (long) Math.floor(Double.parseDouble(String.valueOf(amount))); } catch (NumberFormatException e) { amt = -1; }
        }
        if (amt < 100 || amt > 1_000_000) throw ApiException.badRequest("금액은 100원~1,000,000원이에요");
        String msg = str(message, 60);
        jdbc.sql("INSERT INTO donations (id, user_id, amount, message) VALUES (?, ?, ?, ?)").param(Ids.uid()).param(me.id()).param((int) amt).param(msg).update();
        // 이번 주 잠정 집계를 바로 갱신
        Store store = loadStore(me);
        String week = store.weekly().keySet().stream().max(Comparator.naturalOrder()).orElse(null);
        if (week != null && !store.weekly().get(week).finalized()) {
            WeeklyBatch cur = CommunityLogic.computeWeekly(store, week, false);
            upsertWeekly(cur);
            store.weekly().put(week, cur);
        }
        return store;
    }

    @Transactional
    public Store refreshCurrentWeek(DbUser me) {
        Store store = loadStore(me);
        String week = store.weekly().keySet().stream().max(Comparator.naturalOrder()).orElse(null);
        if (week != null && !store.weekly().get(week).finalized()) {
            WeeklyBatch b = CommunityLogic.computeWeekly(store, week, false);
            upsertWeekly(b);
            store.weekly().put(week, b);
        }
        return store;
    }

    /* ---------- 관리자 ---------- */

    private static String tableOf(String kind) {
        return switch (kind) {
            case "post" -> "shout_posts";
            case "comment" -> "comments";
            default -> "feed_posts";
        };
    }

    @Transactional
    public Store adminHide(DbUser me, Target target) {
        jdbc.sql("UPDATE " + tableOf(assertKind(target.kind())) + " SET hidden = TRUE WHERE id = ?").param(target.id()).update();
        return loadStore(me);
    }

    @Transactional
    public Store adminDismiss(DbUser me, Target target) {
        jdbc.sql("UPDATE " + tableOf(assertKind(target.kind())) + " SET reviewed_at = now() WHERE id = ?").param(target.id()).update();
        return loadStore(me);
    }

    @Transactional
    public Store adminBlock(DbUser me, String userId, Object reason) {
        String r = reason instanceof String s ? (s.length() > 200 ? s.substring(0, 200) : s) : "";
        jdbc.sql("UPDATE users SET blocked_at = now(), blocked_reason = ? WHERE id = ?").param(r).param(userId).update();
        return loadStore(me);
    }

    @Transactional
    public Store adminUnblock(DbUser me, String userId) {
        jdbc.sql("UPDATE users SET blocked_at = NULL, blocked_reason = NULL WHERE id = ?").param(userId).update();
        return loadStore(me);
    }
}
