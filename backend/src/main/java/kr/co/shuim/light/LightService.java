package kr.co.shuim.light;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.CommunityLogic;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.PointsPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * 별 지갑. 서버가 잔액을 소유하고, 클라이언트는 "어느 글에 몇 별"만 고른다 (받는 사람은 글이 정한다).
 * 주기는 한 트랜잭션에서 두 지갑을 id 순서로 잠가 옮기고, 요청 번호(= light_gifts.id)가 같은 요청은 한 번만 반영한다.
 */
@Service
public class LightService {
    public record Entry(String id, String reason, int amount, long balanceAfter, long createdAt, String nick) {}
    public record Account(long balance, long totalReceived, long totalGiven, boolean dailyClaimed,
                          int dailyLight, int maxGift, int perPersonDaily, List<Entry> history) {}
    private record Wallet(long balance, long totalReceived, long totalGiven) {}
    private record Target(String author, boolean circle, boolean hidden, long reports) {}

    private final JdbcClient jdbc;
    private final LongSupplier clock;

    @Autowired
    public LightService(JdbcClient jdbc) { this(jdbc, System::currentTimeMillis); }
    public LightService(JdbcClient jdbc, LongSupplier clock) { this.jdbc = jdbc; this.clock = clock; }

    @Transactional
    public Account me(DbUser user) {
        requireMember(user, "로그인하면 별을 모을 수 있어요.");
        long now = clock.getAsLong();
        return account(user.id(), lock(user.id(), now), now);
    }

    /** 오늘의 별. 하루(한국 시간)에 한 번만 들어가고, 다시 눌러도 그대로다. */
    @Transactional
    public Account claimDaily(DbUser user) {
        requireMember(user, "로그인하면 오늘의 별을 받을 수 있어요.");
        long now = clock.getAsLong();
        Wallet wallet = lock(user.id(), now);
        String eventKey = dailyKey(user.id(), LightPolicy.day(now));
        if (!recorded(eventKey)) {
            long balance = Math.addExact(wallet.balance(), LightPolicy.DAILY_LIGHT);
            ledger(user.id(), eventKey, "daily", LightPolicy.DAILY_LIGHT, balance, null, now);
            jdbc.sql("UPDATE light_wallets SET balance=?,updated_at=? WHERE user_id=?").param(balance).param(now).param(user.id()).update();
            wallet = new Wallet(balance, wallet.totalReceived(), wallet.totalGiven());
        }
        return account(user.id(), wallet, now);
    }

    /** 광장 글에 별 주기 → 글쓴이 지갑으로. 금액·잔액·하루 한도는 모두 여기서 검사한다. */
    @Transactional
    public void give(DbUser user, String postId, Object rawAmount, Object rawRequestId) {
        requireMember(user, "로그인하면 별을 줄 수 있어요.");
        UUID giftId = LightPolicy.requestKey(rawRequestId);
        int amount = LightPolicy.giftAmount(rawAmount);
        long now = clock.getAsLong();
        // 없는 글·소로우 사연·가려진 글은 같은 말로 거절한다 (소로우 사연은 보낸 사람이 드러나면 안 된다).
        Target post = postId == null || postId.isBlank() ? null : jdbc.sql("""
            SELECT p.author_id, p.community_id IS NOT NULL AS circle, p.hidden,
                   (SELECT count(*) FROM reports r WHERE r.target_kind='post' AND r.target_id=p.id
                      AND (p.reviewed_at IS NULL OR r.created_at>p.reviewed_at)) AS reports
            FROM shout_posts p WHERE p.id=?
            """).param(postId).query((rs, i) -> new Target(rs.getString("author_id"), rs.getBoolean("circle"),
                rs.getBoolean("hidden"), rs.getLong("reports"))).optional().orElse(null);
        if (post == null || post.circle() || post.hidden() || post.reports() >= CommunityLogic.REPORT_THRESHOLD) {
            throw ApiException.notFound("별을 줄 수 있는 글을 찾지 못했어요.");
        }
        String to = post.author();
        if (user.id().equals(to)) throw ApiException.badRequest("내 글에는 별을 줄 수 없어요.");
        if (!registered(to)) throw ApiException.badRequest("가입한 이웃의 글에만 별을 줄 수 있어요.");
        if (blocked(user.id(), to)) throw ApiException.forbidden("차단된 사용자와는 소통할 수 없어요.");

        // 두 지갑을 언제나 id 순서로 잠근다 → 서로에게 동시에 줘도 교착이 없다.
        boolean giverFirst = user.id().compareTo(to) < 0;
        Wallet first = lock(giverFirst ? user.id() : to, now);
        Wallet second = lock(giverFirst ? to : user.id(), now);
        Wallet giver = giverFirst ? first : second, receiver = giverFirst ? second : first;

        var existing = jdbc.sql("SELECT from_user FROM light_gifts WHERE id=?").param(giftId).query((rs, i) -> String.valueOf(rs.getString(1))).optional();
        if (existing.isPresent()) {
            if (existing.get().equals(user.id())) return; // 같은 요청의 재시도: 이미 반영됐다
            throw ApiException.badRequest("요청을 확인하지 못했어요. 다시 시도해 주세요.");
        }
        LocalDate day = LightPolicy.day(now);
        long givenToday = jdbc.sql("SELECT COALESCE(sum(amount),0) FROM light_gifts WHERE from_user=? AND to_user=? AND given_on=?")
            .param(user.id()).param(to).param(day).query(Long.class).single();
        int left = LightPolicy.leftForPerson(givenToday);
        if (amount > left) {
            throw new ApiException(409, left == 0 ? "이분께는 오늘 줄 수 있는 별을 다 건넸어요." : "이분께는 오늘 " + left + "별까지 더 줄 수 있어요.");
        }
        if (giver.balance() < amount) throw new ApiException(409, "별이 부족해요.");

        jdbc.sql("INSERT INTO light_gifts(id,from_user,to_user,post_id,amount,given_on,created_at) VALUES (?,?,?,?,?,?,?)")
            .param(giftId).param(user.id()).param(to).param(postId).param(amount).param(day).param(now).update();
        long giverBalance = giver.balance() - amount, receiverBalance = Math.addExact(receiver.balance(), amount);
        ledger(user.id(), "gift:" + giftId + ":out", "gift_sent", -amount, giverBalance, giftId, now);
        ledger(to, "gift:" + giftId + ":in", "gift_received", amount, receiverBalance, giftId, now);
        jdbc.sql("UPDATE light_wallets SET balance=?,total_given=total_given+?,updated_at=? WHERE user_id=?")
            .param(giverBalance).param(amount).param(now).param(user.id()).update();
        jdbc.sql("UPDATE light_wallets SET balance=?,total_received=total_received+?,updated_at=? WHERE user_id=?")
            .param(receiverBalance).param(amount).param(now).param(to).update();
    }

    private Account account(String userId, Wallet wallet, long now) {
        // 글 id 는 내보내지 않는다. 상대 닉네임은 광장에 공개된 이름이다.
        List<Entry> history = jdbc.sql("""
            SELECT l.id,l.reason,l.amount,l.balance_after,l.created_at,
                   CASE l.reason WHEN 'gift_sent' THEN receiver.nick WHEN 'gift_received' THEN giver.nick END AS nick
            FROM light_ledger l
            LEFT JOIN light_gifts g ON g.id=l.gift_id
            LEFT JOIN users receiver ON receiver.id=g.to_user
            LEFT JOIN users giver ON giver.id=g.from_user
            WHERE l.user_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 30
            """).param(userId).query((rs, i) -> new Entry(rs.getString("id"), rs.getString("reason"), rs.getInt("amount"),
                rs.getLong("balance_after"), rs.getLong("created_at"), rs.getString("nick"))).list();
        return new Account(wallet.balance(), wallet.totalReceived(), wallet.totalGiven(), recorded(dailyKey(userId, LightPolicy.day(now))),
            LightPolicy.DAILY_LIGHT, LightPolicy.MAX_GIFT, LightPolicy.PER_PERSON_DAILY, history);
    }

    private static String dailyKey(String userId, LocalDate day) { return "daily:" + userId + ":" + day; }

    /** Creates the wallet row when missing and locks it for the rest of the transaction. */
    private Wallet lock(String userId, long now) {
        jdbc.sql("INSERT INTO light_wallets(user_id,updated_at) VALUES (?,?) ON CONFLICT DO NOTHING").param(userId).param(now).update();
        return jdbc.sql("SELECT balance,total_received,total_given FROM light_wallets WHERE user_id=? FOR UPDATE").param(userId)
            .query((rs, i) -> new Wallet(rs.getLong("balance"), rs.getLong("total_received"), rs.getLong("total_given"))).single();
    }

    private void ledger(String userId, String eventKey, String reason, int amount, long balanceAfter, UUID giftId, long now) {
        jdbc.sql("INSERT INTO light_ledger(id,user_id,event_key,reason,amount,balance_after,gift_id,created_at) VALUES (?,?,?,?,?,?,?,?)")
            .param(UUID.randomUUID()).param(userId).param(eventKey).param(reason).param(amount).param(balanceAfter).param(giftId).param(now).update();
    }

    private boolean recorded(String eventKey) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM light_ledger WHERE event_key=?)").param(eventKey).query(Boolean.class).single();
    }

    private void requireMember(DbUser user, String guestMessage) {
        if (user == null || user.anonymous()) throw ApiException.unauthorized(guestMessage);
        if (user.blocked() || !registered(user.id())) throw ApiException.forbidden("현재 계정에서는 별을 이용할 수 없어요.");
    }

    /** A registered, unblocked, non-sample account: the only kind that may hold or receive light. */
    private boolean registered(String id) {
        return id != null && !PointsPolicy.SAMPLE_USERS.contains(id)
            && jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND is_anonymous=FALSE AND blocked_at IS NULL)").param(id).query(Boolean.class).single();
    }

    private boolean blocked(String a, String b) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?))")
            .param(a).param(b).param(b).param(a).query(Boolean.class).single();
    }
}
