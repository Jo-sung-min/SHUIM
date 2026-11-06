package kr.co.shuim.points;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.sponsor.SponsorPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * 폭죽 이용권 지갑. 온기 포인트 1,000 P 로 사거나(points_buy) 후원 기업 멋져요로 받고(sponsor_cheer) 발사 때 한 장씩 쓴다(launch).
 * 잠금 순서는 언제나 이용권 지갑 → 포인트 지갑/기업 행 이라 교착이 없다.
 */
@Service
public class FireworkTicketService implements FireworkTickets {
    public static final int TICKET_PRICE = 1000;
    public static final String NO_TICKET = "폭죽 이용권이 없어요. 온기 포인트로 사거나 후원 기업 멋져요로 받을 수 있어요.";
    public record Entry(String id, String reason, int amount, int balanceAfter, long createdAt, String sponsorName) {}
    public record Account(int tickets, long points, int ticketPrice, List<String> cheeredToday, int cheersLeftToday, int dailyCheers, List<Entry> history) {}
    public record Purchase(int tickets, long points) {}

    private final JdbcClient jdbc;
    private final PointsService points;
    private final LongSupplier clock;

    @Autowired
    public FireworkTicketService(JdbcClient jdbc, PointsService points) { this(jdbc, points, System::currentTimeMillis); }
    FireworkTicketService(JdbcClient jdbc, PointsService points, LongSupplier clock) { this.jdbc = jdbc; this.points = points; this.clock = clock; }

    @Transactional
    public Account me(DbUser user) {
        requireEligible(user);
        long now = clock.getAsLong();
        LocalDate day = PointsPolicy.day(now);
        int tickets = balance(user.id());
        long balance = jdbc.sql("SELECT balance FROM point_wallets WHERE user_id=?").param(user.id()).query(Long.class).optional().orElse(0L);
        List<String> cheered = jdbc.sql("SELECT sponsor_id::text FROM sponsor_cheers WHERE user_id=? AND cheered_on=? ORDER BY created_at")
            .param(user.id()).param(day).query(String.class).list();
        List<Entry> history = jdbc.sql("""
            SELECT l.id,l.reason,l.amount,l.balance_after,l.created_at,s.name AS sponsor_name
            FROM firework_ticket_ledger l LEFT JOIN sponsors s ON s.id=l.sponsor_id
            WHERE l.user_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 20
            """).param(user.id()).query((rs, i) -> new Entry(rs.getString("id"), rs.getString("reason"), rs.getInt("amount"),
                rs.getInt("balance_after"), rs.getLong("created_at"), rs.getString("sponsor_name"))).list();
        return new Account(tickets, balance, TICKET_PRICE, cheered, Math.max(0, SponsorPolicy.DAILY_CHEERS - cheered.size()), SponsorPolicy.DAILY_CHEERS, history);
    }

    /** One purchase per request id; the point charge and the ticket credit commit together. */
    @Transactional
    public Purchase buy(DbUser user, String requestId) {
        requireEligible(user);
        UUID key = requestKey(requestId, "구매 요청을 다시 시도해 주세요.");
        long now = clock.getAsLong();
        int balance = lock(user.id(), now);
        if (recorded("buy:" + key)) {
            long remaining = jdbc.sql("SELECT balance FROM point_wallets WHERE user_id=?").param(user.id()).query(Long.class).optional().orElse(0L);
            return new Purchase(balance, remaining);
        }
        long remaining = points.spend(user.id(), "buy:" + key, "firework_ticket", TICKET_PRICE, now,
            "온기 포인트가 부족해요. 이용권 1장에 " + TICKET_PRICE + " P 가 필요해요.");
        int tickets = credit(user.id(), "buy:" + key, "points_buy", null, balance, now);
        return new Purchase(tickets, remaining);
    }

    /** Called inside the sponsor cheer transaction after the caller locked this wallet with {@link #lock}. */
    public int grant(String userId, String eventKey, String sponsorId, int lockedBalance, long now) {
        if (recorded(eventKey)) return lockedBalance;
        return credit(userId, eventKey, "sponsor_cheer", sponsorId, lockedBalance, now);
    }

    @Override
    public int balance(String userId) {
        return jdbc.sql("SELECT balance FROM firework_ticket_wallets WHERE user_id=?").param(userId).query(Integer.class).optional().orElse(0);
    }

    @Override
    @Transactional
    public <T> Consumed<T> consume(String userId, String requestId, String communityId, String mapId, String variant, Supplier<T> launcher) {
        UUID key = requestKey(requestId, "불꽃놀이 요청을 다시 시도해 주세요.");
        long now = clock.getAsLong();
        int balance = lock(userId, now);
        String eventKey = "use:" + key;
        // A retried launch is answered by the room's own request memory; the ticket was already spent.
        if (recorded(eventKey)) return new Consumed<>(launcher.get(), balance);
        if (balance < 1) throw new ApiException(402, NO_TICKET);
        T result = launcher.get();
        int after = balance - 1;
        jdbc.sql("INSERT INTO firework_ticket_ledger(id,user_id,event_key,reason,amount,balance_after,community_id,map_id,variant,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .param(UUID.randomUUID()).param(userId).param(eventKey).param("launch").param(-1).param(after)
            .param(communityId).param(mapId).param(variant).param(now).update();
        jdbc.sql("UPDATE firework_ticket_wallets SET balance=?,updated_at=? WHERE user_id=?").param(after).param(now).param(userId).update();
        return new Consumed<>(result, after);
    }

    /** Creates the wallet row when missing and locks it for the rest of the transaction. */
    public int lock(String userId, long now) {
        jdbc.sql("INSERT INTO firework_ticket_wallets(user_id,balance,updated_at) VALUES (?,0,?) ON CONFLICT DO NOTHING").param(userId).param(now).update();
        return jdbc.sql("SELECT balance FROM firework_ticket_wallets WHERE user_id=? FOR UPDATE").param(userId).query(Integer.class).single();
    }

    public void requireEligible(DbUser user) {
        if (user == null || user.anonymous()) throw ApiException.unauthorized("로그인하면 폭죽 이용권을 볼 수 있어요.");
        if (!points.eligible(user)) throw ApiException.forbidden("현재 계정에서는 폭죽 이용권을 이용할 수 없어요.");
    }

    private int credit(String userId, String eventKey, String reason, String sponsorId, int balance, long now) {
        int after = Math.addExact(balance, 1);
        jdbc.sql("INSERT INTO firework_ticket_ledger(id,user_id,event_key,reason,amount,balance_after,sponsor_id,created_at) VALUES (?,?,?,?,?,?,?::uuid,?)")
            .param(UUID.randomUUID()).param(userId).param(eventKey).param(reason).param(1).param(after).param(sponsorId).param(now).update();
        jdbc.sql("UPDATE firework_ticket_wallets SET balance=?,updated_at=? WHERE user_id=?").param(after).param(now).param(userId).update();
        return after;
    }

    private boolean recorded(String eventKey) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM firework_ticket_ledger WHERE event_key=?)").param(eventKey).query(Boolean.class).single();
    }

    static UUID requestKey(String requestId, String message) {
        try {
            if (requestId == null || requestId.length() != 36) throw new IllegalArgumentException();
            UUID key = UUID.fromString(requestId);
            if (!key.toString().equalsIgnoreCase(requestId)) throw new IllegalArgumentException();
            return key;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(message);
        }
    }
}
