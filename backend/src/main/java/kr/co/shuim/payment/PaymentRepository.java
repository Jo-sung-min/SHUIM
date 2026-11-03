package kr.co.shuim.payment;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

@Repository
public class PaymentRepository {
    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    @Autowired
    public PaymentRepository(JdbcClient jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
    }
    protected PaymentRepository() { this.jdbc = null; this.transaction = null; }

    public PaymentOrder create(PaymentOrder order) {
        return transaction.execute(status -> {
            jdbc.sql("""
                INSERT INTO beach_fire_payment_orders
                    (id,user_id,community_id,provider,color,amount,sku,request_id,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (user_id,request_id) DO NOTHING
                """).param(order.id()).param(order.userId()).param(order.communityId()).param(order.provider())
                .param(order.color()).param(order.amount()).param(order.sku()).param(order.requestId())
                .param(order.status()).param(order.createdAt()).param(order.updatedAt()).update();
            return jdbc.sql("SELECT * FROM beach_fire_payment_orders WHERE user_id=? AND request_id=?")
                .param(order.userId()).param(order.requestId()).query(PaymentRepository::map).single();
        });
    }

    public Optional<PaymentOrder> find(String id) {
        return jdbc.sql("SELECT * FROM beach_fire_payment_orders WHERE id=?").param(id).query(PaymentRepository::map).optional();
    }

    /** REQUIRED joins BeachFireRepository's transaction: receipt and grant commit or roll back together. */
    public <T> T locked(String id, Function<PaymentOrder, T> work) {
        return transaction.execute(status -> work.apply(jdbc.sql("SELECT * FROM beach_fire_payment_orders WHERE id=? FOR UPDATE")
            .param(id).query(PaymentRepository::map).single()));
    }

    public void save(PaymentOrder order) {
        jdbc.sql("""
            UPDATE beach_fire_payment_orders SET provider_order_id=?,payment_key=?,status=?,updated_at=?,starts_at=?,expires_at=? WHERE id=?
            """).param(order.providerOrderId()).param(order.paymentKey()).param(order.status()).param(order.updatedAt())
            .param(order.startsAt()).param(order.expiresAt()).param(order.id()).update();
    }

    public List<PaymentOrder> list(String userId, String communityId) {
        return jdbc.sql("SELECT * FROM beach_fire_payment_orders WHERE user_id=? AND community_id=? ORDER BY created_at DESC LIMIT 30")
            .param(userId).param(communityId).query(PaymentRepository::map).list();
    }

    public List<PaymentOrder> due(long before, long now) {
        return jdbc.sql("""
            SELECT * FROM beach_fire_payment_orders WHERE (status = 'CREATED' OR (status = 'PAID' AND expires_at > ?)) AND updated_at < ?
                AND (user_id IS NOT NULL OR status = 'PAID') AND community_id IS NOT NULL
                AND (provider_order_id IS NOT NULL OR payment_key IS NOT NULL)
            ORDER BY updated_at LIMIT 20
            """).param(now).param(before).query(PaymentRepository::map).list();
    }

    public boolean tossLinked(String userId) {
        return jdbc.sql("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND toss_user_key IS NOT NULL)")
            .param(userId).query(Boolean.class).single();
    }

    private static PaymentOrder map(ResultSet rs, int ignored) throws SQLException {
        return new PaymentOrder(rs.getString("id"), rs.getString("user_id"), rs.getString("community_id"),
            rs.getString("provider"), rs.getString("color"), rs.getInt("amount"), rs.getString("sku"),
            rs.getObject("request_id", UUID.class), rs.getString("provider_order_id"), rs.getString("payment_key"),
            rs.getString("status"), rs.getLong("created_at"), rs.getLong("updated_at"),
            rs.getObject("starts_at", Long.class), rs.getObject("expires_at", Long.class));
    }
}
