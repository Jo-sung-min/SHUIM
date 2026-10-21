package kr.co.shuim.community;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.HashSet;

@Service
public class BlockService {
    private final JdbcClient jdbc;
    public BlockService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public List<String> blockedIds(String userId) {
        return jdbc.sql("SELECT blocked_id FROM user_blocks WHERE blocker_id = ? ORDER BY created_at").param(userId).query(String.class).list();
    }

    public Set<String> excludedIds(String userId) {
        return new HashSet<>(jdbc.sql("SELECT CASE WHEN blocker_id = ? THEN blocked_id ELSE blocker_id END FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?")
            .param(userId).param(userId).param(userId).query(String.class).list());
    }

    public void assertInteractionAllowed(String userId, String otherId) {
        if (jdbc.sql("SELECT count(*) FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)")
            .param(userId).param(otherId).param(otherId).param(userId).query(Long.class).single() > 0) {
            throw ApiException.forbidden("차단된 사용자와는 소통할 수 없어요.");
        }
    }

    @Transactional
    public List<String> block(DbUser user, String targetId) {
        if (user.id().equals(targetId)) throw ApiException.badRequest("자신은 차단할 수 없어요.");
        if (jdbc.sql("SELECT count(*) FROM users WHERE id = ?").param(targetId).query(Long.class).single() == 0) throw ApiException.notFound("사용자를 찾을 수 없어요.");
        jdbc.sql("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING").param(user.id()).param(targetId).update();
        jdbc.sql("DELETE FROM follows WHERE (follower_id = ? AND creator_id = ?) OR (follower_id = ? AND creator_id = ?)")
            .param(user.id()).param(targetId).param(targetId).param(user.id()).update();
        return blockedIds(user.id());
    }

    public List<String> unblock(DbUser user, String targetId) {
        jdbc.sql("DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?").param(user.id()).param(targetId).update();
        return blockedIds(user.id());
    }
}
