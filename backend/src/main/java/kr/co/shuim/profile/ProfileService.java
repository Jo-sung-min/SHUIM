package kr.co.shuim.profile;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** 프로필. 공개: 닉네임·사진·소개·활동 수. 비공개(본인만): 이름·전화번호·이메일 */
@Service
public class ProfileService {
    private static final Pattern URL = Pattern.compile("^(/|https?://)");
    private final JdbcClient jdbc;

    public ProfileService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Stats(int followers, int following, int feedPosts, int shoutPosts, int cheers) {}

    public record PublicProfile(String id, String nick, String avatarUrl, String bio, boolean isCreator, String creatorBio,
                                boolean blocked, long createdAt, Stats stats, boolean isFollowing) {}

    public record ProfileInput(String nick, String bio, String avatarUrl, String name, String phone) {}

    public Optional<PublicProfile> getPublicProfile(String viewerId, String userId) {
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
              (SELECT count(*) FROM follows WHERE creator_id = ?)::int AS followers,
              (SELECT count(*) FROM follows WHERE follower_id = ?)::int AS following,
              (SELECT count(*) FROM feed_posts WHERE author_id = ? AND hidden = FALSE)::int AS feed_posts,
              (SELECT count(*) FROM shout_posts WHERE author_id = ? AND hidden = FALSE)::int AS shout_posts,
              (SELECT count(*) FROM cheers ch
                 WHERE (ch.target_kind = 'post' AND ch.target_id IN (SELECT id FROM shout_posts WHERE author_id = ?))
                    OR (ch.target_kind = 'feed' AND ch.target_id IN (SELECT id FROM feed_posts WHERE author_id = ?))
                    OR (ch.target_kind = 'comment' AND ch.target_id IN (SELECT id FROM comments WHERE author_id = ?)))::int AS cheers
            """).param(userId).param(userId).param(userId).param(userId).param(userId).param(userId).param(userId)
            .query((rs, i) -> new Stats(rs.getInt("followers"), rs.getInt("following"), rs.getInt("feed_posts"), rs.getInt("shout_posts"), rs.getInt("cheers"))).single();
        boolean following = viewerId != null
            && jdbc.sql("SELECT count(*) FROM follows WHERE follower_id = ? AND creator_id = ?").param(viewerId).param(userId).query(Long.class).single() > 0;
        return Optional.of(new PublicProfile(u.get().id(), u.get().nick(), p.map(P::avatarUrl).orElse(null), p.map(P::bio).orElse(""),
            creatorBio.isPresent(), creatorBio.orElse(""), u.get().blockedAt() != null, u.get().createdAt(), stats, following));
    }

    /** 내 프로필 = 공개 프로필 + 이름·전화·이메일 */
    public Map<String, Object> getMyProfile(DbUser me) {
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
        m.put("name", np.map(NP::name).orElse(""));
        m.put("phone", np.map(NP::phone).orElse(""));
        m.put("email", me.email());
        return m;
    }

    /** 저장. 문제가 있으면 메시지를 돌려준다 */
    public String updateMyProfile(DbUser me, ProfileInput in) {
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
}
