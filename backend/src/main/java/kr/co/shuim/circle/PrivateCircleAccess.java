package kr.co.shuim.circle;

import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.HashSet;
import java.util.Set;

/** Private test circles never inherit author, keeper, or administrator visibility bypasses. */
public final class PrivateCircleAccess {
    private PrivateCircleAccess() {}

    /** Arguments are internal SQL identifiers/expressions, never request values. Bind viewer values separately. */
    public static String visibleTo(String circleAlias, String viewerSql) {
        return "(NOT " + circleAlias + ".private_test OR EXISTS (SELECT 1 FROM community_private_members pm "
            + "JOIN users pv ON pv.id=pm.user_id WHERE pm.community_id=" + circleAlias + ".id AND pm.user_id="
            + viewerSql + " AND pv.is_anonymous=FALSE AND pv.blocked_at IS NULL))";
    }

    public static boolean canAccess(JdbcClient jdbc, String circleId, String viewerId) {
        if (circleId == null) return true;
        return jdbc.sql("SELECT " + visibleTo("c", ":viewer") + " FROM communities c WHERE c.id=:circle")
            .param("viewer", viewerId == null ? "" : viewerId).param("circle", circleId)
            .query(Boolean.class).optional().orElse(false);
    }

    public static Set<String> inaccessibleCircles(JdbcClient jdbc, String viewerId) {
        return new HashSet<>(jdbc.sql("SELECT c.id FROM communities c WHERE NOT " + visibleTo("c", ":viewer"))
            .param("viewer", viewerId == null ? "" : viewerId).query(String.class).list());
    }

    /** Applies even to hidden content, deletes, moderation and an original author removed from the allowlist. */
    public static void requireTarget(JdbcClient jdbc, String viewerId, String kind, String id) {
        if (!"post".equals(kind) && !"comment".equals(kind)) return;
        String target = "post".equals(kind) ? "p.id=:id"
            : "EXISTS (SELECT 1 FROM comments child WHERE child.id=:id AND child.post_kind='post' AND child.post_id=p.id)";
        boolean denied = jdbc.sql("SELECT EXISTS (SELECT 1 FROM shout_posts p JOIN communities c ON c.id=p.community_id "
            + "WHERE " + target + " AND NOT " + visibleTo("c", ":viewer") + ")")
            .param("id", id).param("viewer", viewerId == null ? "" : viewerId).query(Boolean.class).single();
        if (denied) throw ApiException.notFound("글을 찾을 수 없어요");
    }
}
