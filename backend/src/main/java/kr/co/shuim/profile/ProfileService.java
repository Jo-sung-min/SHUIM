package kr.co.shuim.profile;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.profile.BadgeService.EarnedBadge;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;

/**
 * 프로필. 공개: 닉네임·사진·소개·칭호·위로 배지·숫자(위로글·리스너·리스닝). 비공개(본인만): 이름·전화번호·이메일.
 * 리스너 = 나를 팔로우하는 사람(follows.creator_id = 나), 리스닝 = 내가 팔로우하는 사람(follows.follower_id = 나).
 * 내가 위로한 횟수(누른 힘내요, 쓴 댓글 수 등)는 숫자로 공개하지 않는다.
 */
@Service
public class ProfileService {
    private static final Pattern URL = Pattern.compile("^(/|https?://)");
    public static final int LIST_PAGE = 50;
    private final JdbcClient jdbc;
    private final BlockService blocks;
    private final BadgeService badges;

    public ProfileService(JdbcClient jdbc, BlockService blocks, BadgeService badges) {
        this.jdbc = jdbc;
        this.blocks = blocks;
        this.badges = badges;
    }

    /** followers = 리스너 수, following = 리스닝 수 (JSON 이름은 화면 코드와 맞추려고 그대로 둔다) */
    public record Stats(int followers, int following, int feedPosts, int shoutPosts) {}

    public record PublicProfile(String id, String nick, String avatarUrl, String bio, boolean isCreator, String creatorBio,
                                boolean blocked, long createdAt, Stats stats, boolean isFollowing, boolean followsMe,
                                String title, List<EarnedBadge> badges) {}

    public record ProfileInput(String nick, String bio, String avatarUrl, String name, String phone) {}

    /** 리스너·리스닝 목록 한 줄 */
    public record ListUser(String id, String nick, String avatarUrl, String title, boolean viewerListens, boolean listensToViewer) {}

    public Optional<PublicProfile> getPublicProfile(String viewerId, String userId) {
        if (viewerId != null && blocks.excludedIds(viewerId).contains(userId)) return Optional.empty();
        record U(String id, String nick, Long blockedAt, long createdAt) {}
        Optional<U> u = jdbc.sql("SELECT id, nick, blocked_at, created_at FROM users WHERE id = ?").param(userId)
            .query((rs, i) -> new U(rs.getString("id"), rs.getString("nick"), Db.ms(rs, "blocked_at"), Db.msReq(rs, "created_at"))).optional();
        if (u.isEmpty()) return Optional.empty();
        record P(String avatarUrl, String bio) {}
        Optional<P> p = jdbc.sql("SELECT avatar_url, bio FROM profiles WHERE user_id = ?").param(userId)
            .query((rs, i) -> new P(rs.getString("avatar_url"), rs.getString("bio"))).optional();
        Optional<String> creatorBio = jdbc.sql("SELECT bio FROM creators WHERE user_id = ?").param(userId).query(String.class).optional();
        Stats stats = jdbc.sql("""
            SELECT
              (SELECT count(*) FROM follows WHERE creator_id = :u)::int AS followers,
              (SELECT count(*) FROM follows WHERE follower_id = :u)::int AS following,
              (SELECT count(*) FROM feed_posts WHERE author_id = :u AND hidden = FALSE)::int AS feed_posts,
              (SELECT count(*) FROM shout_posts WHERE author_id = :u AND hidden = FALSE AND community_id IS NULL)::int AS shout_posts
            """).param("u", userId)
            .query((rs, i) -> new Stats(rs.getInt("followers"), rs.getInt("following"), rs.getInt("feed_posts"), rs.getInt("shout_posts"))).single();
        boolean following = viewerId != null && follows(viewerId, userId);
        boolean followsMe = viewerId != null && !viewerId.equals(userId) && follows(userId, viewerId);
        return Optional.of(new PublicProfile(u.get().id(), u.get().nick(), p.map(P::avatarUrl).orElse(null), p.map(P::bio).orElse(""),
            creatorBio.isPresent(), creatorBio.orElse(""), u.get().blockedAt() != null, u.get().createdAt(), stats, following, followsMe,
            badges.titleLabel(userId), badges.earned(userId)));
    }

    private boolean follows(String followerId, String creatorId) {
        return jdbc.sql("SELECT count(*) FROM follows WHERE follower_id = ? AND creator_id = ?").param(followerId).param(creatorId).query(Long.class).single() > 0;
    }

    /** 내 프로필 = 공개 프로필 + 이름·전화·이메일 + 칭호 id·새 배지·배지 전체 목록(선반에 아직 못 얻은 배지를 흐리게 보여 줄 때) */
    public Map<String, Object> getMyProfile(DbUser me) {
        badges.refresh(me.id()); // 주간 랭킹처럼 활동 밖에서 생기는 배지까지 여기서 챙긴다
        PublicProfile pub = getPublicProfile(me.id(), me.id()).orElseThrow();
        record NP(String name, String phone) {}
        Optional<NP> np = jdbc.sql("SELECT name, phone FROM profiles WHERE user_id = ?").param(me.id())
            .query((rs, i) -> new NP(rs.getString("name"), rs.getString("phone"))).optional();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", pub.id());
        m.put("nick", pub.nick());
        m.put("avatarUrl", pub.avatarUrl());
        m.put("bio", pub.bio());
        m.put("isCreator", pub.isCreator());
        m.put("creatorBio", pub.creatorBio());
        m.put("blocked", pub.blocked());
        m.put("createdAt", pub.createdAt());
        m.put("stats", pub.stats());
        m.put("isFollowing", pub.isFollowing());
        m.put("followsMe", false);
        m.put("title", pub.title());
        m.put("badges", pub.badges());
        m.put("titleBadge", badges.titleBadge(me.id()));
        m.put("newBadges", badges.unseen(me.id()));
        m.put("badgeCatalog", Badges.ALL);
        m.put("name", np.map(NP::name).orElse(""));
        m.put("phone", np.map(NP::phone).orElse(""));
        m.put("email", me.email());
        return m;
    }

    /** 저장. 문제가 있으면 메시지를 돌려준다. titleBadge 가 null 이면 칭호는 건드리지 않는다("" = 해제) */
    public String updateMyProfile(DbUser me, ProfileInput in, String titleBadge) {
        if (titleBadge != null) {
            String err = badges.setTitle(me.id(), titleBadge);
            if (err != null) return err;
        }
        if (in.nick() == null && in.bio() == null && in.avatarUrl() == null && in.name() == null && in.phone() == null) return null; // 칭호만 바꿀 때
        if (in.nick() != null) {
            String n = in.nick().strip();
            if (n.length() < 2 || n.length() > 12) return "닉네임은 2~12자로 해요.";
            jdbc.sql("UPDATE users SET nick = ? WHERE id = ?").param(n).param(me.id()).update();
        }
        String bio = in.bio() == null ? "" : in.bio().strip();
        if (bio.length() > 160) bio = bio.substring(0, 160);
        String avatar = null;
        if (in.avatarUrl() != null && URL.matcher(in.avatarUrl().strip()).find()) {
            avatar = in.avatarUrl().strip();
            if (avatar.length() > 500) avatar = avatar.substring(0, 500);
        }
        String name = in.name() == null ? "" : in.name().strip();
        if (name.length() > 20) name = name.substring(0, 20);
        String phone = in.phone() == null ? "" : in.phone().replaceAll("[^0-9-]", "");
        if (phone.length() > 14) phone = phone.substring(0, 14);
        String digits = phone.replaceAll("\\D", "");
        if (!digits.isEmpty() && (digits.length() < 10 || digits.length() > 11)) return "전화번호는 숫자 10~11자리로 입력해요.";
        jdbc.sql("""
            INSERT INTO profiles (user_id, name, phone, bio, avatar_url, updated_at) VALUES (?, ?, ?, ?, ?, now())
            ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = now()
            """).param(me.id()).param(name).param(digits).param(bio).param(avatar).update();
        return null;
    }

    /**
     * 리스너(listeners: 이 사람을 듣는 사람) 또는 리스닝(listening: 이 사람이 듣는 사람) 목록. 최근 순, LIST_PAGE 개씩.
     * 보는 사람과 서로 차단한 사람, 운영 차단된 사람은 뺀다.
     */
    public List<ListUser> listPeople(String viewerId, String userId, boolean listeners, int offset) {
        Set<String> excluded = viewerId == null ? Set.of() : blocks.excludedIds(viewerId);
        if (excluded.contains(userId)) return List.of();
        String sql = listeners
            ? "SELECT f.follower_id AS uid, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.creator_id = ? AND u.blocked_at IS NULL ORDER BY f.created_at DESC LIMIT ? OFFSET ?"
            : "SELECT f.creator_id AS uid, f.created_at FROM follows f JOIN users u ON u.id = f.creator_id WHERE f.follower_id = ? AND u.blocked_at IS NULL ORDER BY f.created_at DESC LIMIT ? OFFSET ?";
        List<String> ids = jdbc.sql(sql).param(userId).param(LIST_PAGE + 1).param(Math.max(0, offset)).query((rs, i) -> rs.getString("uid")).list();
        ids = ids.stream().filter(id -> !excluded.contains(id)).toList();
        if (ids.isEmpty()) return List.of();
        Map<String, String> titles = badges.allTitles();
        Set<String> viewerFollows = viewerId == null ? Set.of() : new HashSet<>(jdbc.sql("SELECT creator_id FROM follows WHERE follower_id = ?").param(viewerId).query(String.class).list());
        Set<String> followViewer = viewerId == null ? Set.of() : new HashSet<>(jdbc.sql("SELECT follower_id FROM follows WHERE creator_id = ?").param(viewerId).query(String.class).list());
        record Row(String id, String nick, String avatar) {}
        Map<String, Row> rows = new HashMap<>();
        jdbc.sql("SELECT u.id, u.nick, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id IN (:ids)").param("ids", ids)
            .query((rs, i) -> new Row(rs.getString("id"), rs.getString("nick"), rs.getString("avatar_url"))).list()
            .forEach(r -> rows.put(r.id(), r));
        List<ListUser> out = new ArrayList<>();
        for (String id : ids) {
            Row r = rows.get(id);
            if (r == null) continue;
            out.add(new ListUser(r.id(), r.nick(), r.avatar(), titles.get(id), viewerFollows.contains(id), followViewer.contains(id)));
        }
        return out;
    }
}
