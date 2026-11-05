package kr.co.shuim.points;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.PrivateCircleAccess;
import kr.co.shuim.common.Db;
import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;

/** Server-owned earnings. Hooks join the community transaction; clients cannot supply amounts. */
@Service
public class PointsService {
    public record History(String id, String reason, int amount, long balanceAfter, long createdAt) {}
    public record Account(long balance, long totalEarned, long todayEarned, int dailyLimit,
                          int writingEarnedToday, int writingDailyLimit, List<String> rules, List<History> history) {}
    private record Wallet(long balance, long totalEarned) {}
    private record Daily(long earned, int writing) {}
    private record Content(String kind, String id, String author, String text, boolean hidden, long reports,
                           String postKind, String postId, String parentId, String communityId, String visibility, long createdAt) {}
    private final JdbcClient jdbc;
    private final LongSupplier clock;

    @Autowired
    public PointsService(JdbcClient jdbc) { this(jdbc, System::currentTimeMillis); }
    PointsService(JdbcClient jdbc, LongSupplier clock) { this.jdbc = jdbc; this.clock = clock; }

    @Transactional
    public Account me(DbUser user) {
        if (user == null || user.anonymous()) throw ApiException.unauthorized("로그인하면 온기 포인트를 볼 수 있어요.");
        if (user.blocked() || !registered(user.id())) throw ApiException.forbidden("현재 계정에서는 온기 포인트를 이용할 수 없어요.");
        long now = clock.getAsLong();
        Wallet wallet = lockWallet(user.id(), now);
        Daily daily = daily(user.id(), PointsPolicy.day(now));
        List<History> history = jdbc.sql("""
            SELECT id,reason,amount,balance_after,created_at FROM point_ledger
            WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30
            """).param(user.id()).query((rs, i) -> new History(rs.getString("id"), rs.getString("reason"),
                rs.getInt("amount"), rs.getLong("balance_after"), rs.getLong("created_at"))).list();
        // Intentionally no content IDs or links: a private/removed source must not leak through history.
        return new Account(wallet.balance(), wallet.totalEarned(), daily.earned(), PointsPolicy.DAILY_LIMIT,
            daily.writing(), PointsPolicy.WRITING_DAILY_LIMIT, PointsPolicy.RULES, history);
    }

    @Transactional
    public void commentCreated(String commentId) {
        Db.lockCommunity(jdbc);
        Content comment = content("comment", commentId);
        if (comment == null || comment.parentId() != null || !PointsPolicy.meaningful(comment.text())) return;
        long now = clock.getAsLong();
        Content post = content(comment.postKind(), comment.postId());
        if (post == null || Objects.equals(comment.author(), post.author()) || !visible(comment) || !canAccess(post, comment.author(), now)) return;
        award(comment.author(), "write:" + post.kind() + ":" + post.id() + ":" + comment.author(), "comfort_write", PointsPolicy.WRITING_POINTS, true, now);
    }

    /** Only a new cheer action can create a checkpoint; removing a cheer never removes a checkpoint. */
    @Transactional
    public void cheerAdded(String kind, String id, String voterId) {
        if (!List.of("comment", "feed").contains(kind)) return;
        Db.lockCommunity(jdbc);
        Content target = content(kind, id);
        long now = clock.getAsLong();
        if (target == null || !registered(voterId) || voterId.equals(target.author()) || !canAccess(target, voterId, now)) return;
        if ("comment".equals(kind) && (target.parentId() != null || !PointsPolicy.meaningful(target.text()))) return;
        Content root = "comment".equals(kind) ? content(target.postKind(), target.postId()) : target;
        if ("comment".equals(kind) && target.author().equals(root.author())) return;
        jdbc.sql("UPDATE cheers SET points_eligible=TRUE WHERE target_kind=? AND target_id=? AND user_id=?")
            .param(kind).param(id).param(voterId).update();
        long count = eligibleCheerCount(target, root, now);
        for (int threshold : PointsPolicy.MILESTONES) {
            if (count < threshold) continue;
            int added = jdbc.sql("INSERT INTO point_cheer_checkpoints(target_kind,target_id,milestone) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                .param(kind).param(id).param(threshold).update();
            if (added > 0) award(target.author(), "cheer:" + kind + ":" + id + ":" + threshold,
                "cheers_" + threshold, PointsPolicy.milestonePoints(threshold), false, now);
        }
    }

    @Transactional
    public void acceptComment(DbUser user, String postId, String commentId) {
        Db.lockCommunity(jdbc);
        if (user == null || user.anonymous() || user.blocked() || !registered(user.id())) throw ApiException.forbidden("로그인한 작성자만 위로를 채택할 수 있어요.");
        Content post = content("post", postId);
        long now = clock.getAsLong();
        if (post == null || !canAccess(post, user.id(), now)) throw ApiException.notFound("외침을 찾을 수 없어요.");
        if (!user.id().equals(post.author())) throw ApiException.forbidden("이 외침의 작성자만 위로를 채택할 수 있어요.");
        var previous = jdbc.sql("SELECT comment_id FROM comment_acceptances WHERE post_id=?").param(postId).query(String.class).optional();
        if (previous.isPresent()) {
            if (previous.get().equals(commentId)) return;
            throw new ApiException(409, "이미 위로를 채택했어요. 다른 댓글로 바꿀 수 없어요.");
        }
        Content comment = content("comment", commentId);
        if (comment == null || !"post".equals(comment.postKind()) || !postId.equals(comment.postId())
            || comment.parentId() != null || user.id().equals(comment.author()) || !canAccess(comment, user.id(), now)) {
            throw ApiException.badRequest("이 외침의 다른 회원이 남긴 최상위 위로 댓글을 골라 주세요.");
        }
        jdbc.sql("INSERT INTO comment_acceptances(post_id,comment_id,recipient_id,accepted_at) VALUES (?,?,?,?)")
            .param(postId).param(commentId).param(comment.author()).param(now).update();
        award(comment.author(), "accept:" + postId, "comfort_accepted", PointsPolicy.ACCEPTED_POINTS, false, now);
    }

    private void award(String userId, String eventKey, String reason, int requested, boolean writing, long now) {
        Wallet wallet = lockWallet(userId, now);
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM point_ledger WHERE event_key=?)").param(eventKey).query(Boolean.class).single()) return;
        LocalDate day = PointsPolicy.day(now);
        Daily daily = daily(userId, day);
        int amount = PointsPolicy.reward(requested, daily.earned(), writing, daily.writing());
        long balance = Math.addExact(wallet.balance(), amount);
        jdbc.sql("INSERT INTO point_ledger(id,user_id,event_key,reason,amount,balance_after,earned_on,created_at) VALUES (?,?,?,?,?,?,?,?)")
            .param(UUID.randomUUID()).param(userId).param(eventKey).param(reason).param(amount).param(balance).param(day).param(now).update();
        jdbc.sql("UPDATE point_wallets SET balance=?,total_earned=?,updated_at=? WHERE user_id=?")
            .param(balance).param(Math.addExact(wallet.totalEarned(), amount)).param(now).param(userId).update();
    }

    private Wallet lockWallet(String userId, long now) {
        jdbc.sql("INSERT INTO point_wallets(user_id,updated_at) VALUES (?,?) ON CONFLICT DO NOTHING").param(userId).param(now).update();
        return jdbc.sql("SELECT balance,total_earned FROM point_wallets WHERE user_id=? FOR UPDATE").param(userId)
            .query((rs, i) -> new Wallet(rs.getLong("balance"), rs.getLong("total_earned"))).single();
    }
    private Daily daily(String userId, LocalDate day) {
        return jdbc.sql("SELECT COALESCE(sum(amount),0) AS earned,count(*) FILTER (WHERE reason='comfort_write' AND amount>0) AS writing FROM point_ledger WHERE user_id=? AND earned_on=?")
            .param(userId).param(day).query((rs, i) -> new Daily(rs.getLong("earned"), rs.getInt("writing"))).single();
    }
    private boolean registered(String id) {
        return id != null && !PointsPolicy.SAMPLE_USERS.contains(id) && jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND is_anonymous=FALSE AND blocked_at IS NULL)")
            .param(id).query(Boolean.class).single();
    }
    private boolean visible(Content c) { return c != null && !c.hidden() && c.reports() < 5 && registered(c.author()); }
    private boolean blocked(String a, String b) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))")
            .param(a).param(b).param(b).param(a).query(Boolean.class).single();
    }
    private boolean canAccess(Content c, String viewer, long now) {
        if (!visible(c)) return false;
        // Circle posts hide their author. Reward differences must not reveal that identity via personal blocks.
        boolean anonymousCirclePost = "post".equals(c.kind()) && c.communityId() != null;
        if (!anonymousCirclePost && blocked(viewer, c.author())) return false;
        if ("comment".equals(c.kind())) return canAccess(content(c.postKind(), c.postId()), viewer, now);
        if (c.communityId() != null && !PrivateCircleAccess.canAccess(jdbc, c.communityId(), viewer)) return false;
        if (c.communityId() == null || viewer.equals(c.author())) return true;
        boolean admin = jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND blocked_at IS NULL AND is_anonymous=FALSE)")
            .param(viewer).query(Boolean.class).single();
        if (admin) return true;
        if (c.createdAt() > now) return false;
        return !"members".equals(c.visibility()) || jdbc.sql("SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id=? AND user_id=? AND status='active')")
            .param(c.communityId()).param(viewer).query(Boolean.class).single();
    }

    private Content content(String kind, String id) {
        if (id == null || id.isBlank() || kind == null) return null;
        String table = switch (kind) { case "comment" -> "comments"; case "post" -> "shout_posts"; case "feed" -> "feed_posts"; default -> null; };
        if (table == null) return null;
        String extra = "post".equals(kind) ? ",t.community_id,c.visibility" : ",NULL AS community_id,NULL AS visibility";
        String join = "post".equals(kind) ? " LEFT JOIN communities c ON c.id=t.community_id" : "";
        return jdbc.sql("SELECT t.*" + extra + ",(SELECT count(*) FROM reports r WHERE r.target_kind=:kind AND r.target_id=t.id AND (t.reviewed_at IS NULL OR r.created_at>t.reviewed_at)) AS report_count FROM " + table + " t" + join + " WHERE t.id=:id")
            .param("kind", kind).param("id", id).query((rs, i) -> new Content(kind, rs.getString("id"), rs.getString("author_id"), rs.getString("text"),
                rs.getBoolean("hidden"), rs.getLong("report_count"), "comment".equals(kind) ? rs.getString("post_kind") : null,
                "comment".equals(kind) ? rs.getString("post_id") : null, "comment".equals(kind) ? rs.getString("parent_id") : null,
                rs.getString("community_id"), rs.getString("visibility"), Db.msReq(rs, "created_at"))).optional().orElse(null);
    }

    private long eligibleCheerCount(Content target, Content root, long now) {
        String conditions = "";
        if (root.communityId() == null && !target.author().equals(root.author())) conditions += " AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=u.id AND b.blocked_id=:rootAuthor) OR (b.blocker_id=:rootAuthor AND b.blocked_id=u.id))";
        if (root.communityId() != null) {
            conditions += " AND EXISTS (SELECT 1 FROM communities pc WHERE pc.id=:circle AND " + PrivateCircleAccess.visibleTo("pc", "u.id") + ")";
            if (root.createdAt() > now) conditions += " AND (u.id=:rootAuthor OR u.role='admin')";
            if ("members".equals(root.visibility())) conditions += " AND (u.id=:rootAuthor OR u.role='admin' OR EXISTS(SELECT 1 FROM community_members m WHERE m.community_id=:circle AND m.user_id=u.id AND m.status='active'))";
        }
        var query = jdbc.sql("""
            SELECT count(*) FROM cheers ch JOIN users u ON u.id=ch.user_id
            WHERE ch.target_kind=:kind AND ch.target_id=:id AND ch.points_eligible=TRUE
              AND u.id<>:author AND u.is_anonymous=FALSE AND u.blocked_at IS NULL
              AND u.id NOT IN ('u1','u2','u3','u4','u5','u6','u7')
              AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=u.id AND b.blocked_id=:author) OR (b.blocker_id=:author AND b.blocked_id=u.id))
            """ + conditions).param("kind", target.kind()).param("id", target.id()).param("author", target.author()).param("rootAuthor", root.author());
        if (root.communityId() != null) query = query.param("circle", root.communityId());
        return query.query(Long.class).single();
    }
}
