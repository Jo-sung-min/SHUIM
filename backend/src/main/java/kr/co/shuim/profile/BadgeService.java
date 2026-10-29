package kr.co.shuim.profile;

import kr.co.shuim.common.Db;
import kr.co.shuim.profile.Badges.Badge;
import kr.co.shuim.profile.Badges.Counts;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 위로 배지 획득 기록과 대표 칭호.
 * 판정은 활동(댓글·힘내요·글·리스너)이 생길 때와 내 프로필을 열 때 다시 계산해 새로 얻은 것만 넣는다.
 */
@Service
public class BadgeService {
    private final JdbcClient jdbc;

    public BadgeService(JdbcClient jdbc) { this.jdbc = jdbc; }

    /** 공개용: 이름·설명·얻은 시각 (조건 숫자는 없다) */
    public record EarnedBadge(String id, String name, String desc, long earnedAt) {}

    Counts counts(String userId) {
        return jdbc.sql("""
            SELECT
              (SELECT count(*) FROM comments WHERE author_id = :u AND hidden = FALSE)::int AS comments,
              (SELECT count(*) FROM cheers WHERE user_id = :u)::int AS cheers_sent,
              (SELECT count(*) FROM cheers ch JOIN comments c ON ch.target_kind = 'comment' AND ch.target_id = c.id
                 WHERE c.author_id = :u AND c.hidden = FALSE AND ch.user_id <> :u)::int AS cheers_on_comments,
              EXISTS (SELECT 1 FROM comments WHERE author_id = :u AND hidden = FALSE
                        AND EXTRACT(HOUR FROM created_at + INTERVAL '9 hours') < 5) AS night_comment,
              (SELECT count(*) FROM shout_posts WHERE author_id = :u AND hidden = FALSE)::int AS shout_posts,
              (SELECT count(*) FROM feed_posts WHERE author_id = :u AND hidden = FALSE)::int AS feed_posts,
              (SELECT count(*) FROM follows WHERE creator_id = :u)::int AS listeners,
              EXISTS (SELECT 1 FROM weekly_batches w, jsonb_array_elements(w.rows) r
                        WHERE w.finalized AND r->>'userId' = :u AND (r->>'rank')::int <= 10) AS weekly_top10
            """).param("u", userId)
            .query((rs, i) -> new Counts(rs.getInt("comments"), rs.getInt("cheers_sent"), rs.getInt("cheers_on_comments"), rs.getBoolean("night_comment"),
                rs.getInt("shout_posts"), rs.getInt("feed_posts"), rs.getInt("listeners"), rs.getBoolean("weekly_top10"))).single();
    }

    /** 다시 판정해서 새로 얻은 배지만 저장하고 그 id 를 돌려준다. 이미 얻은 배지는 조건이 사라져도 남긴다 */
    public List<String> refresh(String userId) {
        if (userId == null) return List.of();
        Set<String> have = new HashSet<>(jdbc.sql("SELECT badge_id FROM user_badges WHERE user_id = ?").param(userId).query(String.class).list());
        List<String> added = new ArrayList<>();
        for (String id : Badges.earned(counts(userId))) {
            if (have.contains(id)) continue;
            int n = jdbc.sql("INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?) ON CONFLICT DO NOTHING").param(userId).param(id).update();
            if (n > 0) added.add(id);
        }
        return added;
    }

    /** 얻은 배지 (선반 순서) */
    public List<EarnedBadge> earned(String userId) {
        Map<String, Long> at = new HashMap<>();
        jdbc.sql("SELECT badge_id, earned_at FROM user_badges WHERE user_id = ?").param(userId)
            .query((RowCallbackHandler) rs -> { at.put(rs.getString("badge_id"), Db.msReq(rs, "earned_at")); });
        List<EarnedBadge> out = new ArrayList<>();
        for (Badge b : Badges.ALL) if (at.containsKey(b.id())) out.add(new EarnedBadge(b.id(), b.name(), b.desc(), at.get(b.id())));
        return out;
    }

    /** 아직 축하 시트를 보지 않은 배지 */
    public List<EarnedBadge> unseen(String userId) {
        Set<String> ids = new HashSet<>(jdbc.sql("SELECT badge_id FROM user_badges WHERE user_id = ? AND seen_at IS NULL").param(userId).query(String.class).list());
        return earned(userId).stream().filter(b -> ids.contains(b.id())).toList();
    }

    public void markSeen(String userId) {
        jdbc.sql("UPDATE user_badges SET seen_at = now() WHERE user_id = ? AND seen_at IS NULL").param(userId).update();
    }

    /** 대표 칭호로 고른 배지 id (얻은 배지일 때만) */
    public String titleBadge(String userId) {
        return jdbc.sql("""
            SELECT p.title_badge FROM profiles p JOIN user_badges b ON b.user_id = p.user_id AND b.badge_id = p.title_badge
             WHERE p.user_id = ?""").param(userId).query(String.class).optional().orElse(null);
    }

    /** 칭호 이름 (없으면 null) */
    public String titleLabel(String userId) {
        String id = titleBadge(userId);
        return id == null ? null : Badges.byId(id).map(Badge::name).orElse(null);
    }

    /** 모든 사용자의 칭호 이름 (외침·댓글·피드 닉네임 옆 표시용) */
    public Map<String, String> allTitles() {
        Map<String, String> out = new HashMap<>();
        jdbc.sql("""
            SELECT p.user_id, p.title_badge FROM profiles p JOIN user_badges b ON b.user_id = p.user_id AND b.badge_id = p.title_badge
             WHERE p.title_badge IS NOT NULL""").query((RowCallbackHandler) rs -> {
            String user = rs.getString("user_id");
            Badges.byId(rs.getString("title_badge")).ifPresent(b -> out.put(user, b.name()));
        });
        return out;
    }

    /** 칭호 고르기. null·빈 값이면 해제. 얻지 않은 배지면 메시지를 돌려준다 */
    public String setTitle(String userId, String badgeId) {
        String id = badgeId == null || badgeId.isBlank() ? null : badgeId.strip();
        if (id != null) {
            if (Badges.byId(id).isEmpty()) return "없는 배지예요.";
            boolean has = jdbc.sql("SELECT count(*) FROM user_badges WHERE user_id = ? AND badge_id = ?").param(userId).param(id).query(Long.class).single() > 0;
            if (!has) return "아직 얻지 않은 배지예요.";
        }
        jdbc.sql("""
            INSERT INTO profiles (user_id, title_badge, updated_at) VALUES (?, ?, now())
            ON CONFLICT (user_id) DO UPDATE SET title_badge = EXCLUDED.title_badge, updated_at = now()""")
            .param(userId).param(id).update();
        return null;
    }
}
