package kr.co.shuim.beach;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/** All writers serialize on the community row, including writers on other servers. */
@Repository
public class BeachFireRepository {
    public record Row(String communityId, long fuelUntil) {}
    public record Grant(String providerOrderId, String communityId, String userId, String color,
                        long startsAt, long expiresAt, Long revokedAt) {}

    public interface LockedFire {
        Row row();
        void fuelUntil(long value);
        boolean hasWoodRequest(String userId, UUID requestId);
        Long lastWoodAt(String userId);
        void recordWood(String userId, UUID requestId, long at);
        Optional<Grant> grant(String providerOrderId);
        List<Grant> grants();
        void insertGrant(Grant grant);
        void revokeGrant(String providerOrderId, long at);
    }

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    @Autowired
    public BeachFireRepository(JdbcClient jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
    }

    /** Test repositories supply their own storage/locking, never used by Spring. */
    protected BeachFireRepository() { this.jdbc = null; this.transaction = null; }

    private void initialize(String communityId, long initialFuelUntil) {
        jdbc.sql("INSERT INTO beach_fires (community_id, fuel_until) VALUES (?, ?) ON CONFLICT (community_id) DO NOTHING")
            .param(communityId).param(initialFuelUntil).update();
    }

    public Row read(String communityId, long initialFuelUntil) {
        Optional<Row> existing = findRow(communityId, false);
        if (existing.isPresent()) return existing.get();
        initialize(communityId, initialFuelUntil);
        return findRow(communityId, false).orElseThrow();
    }

    private Optional<Row> findRow(String communityId, boolean lock) {
        return jdbc.sql("SELECT community_id, fuel_until FROM beach_fires WHERE community_id = ?" + (lock ? " FOR UPDATE" : ""))
            .param(communityId).query((rs, i) -> new Row(rs.getString("community_id"), rs.getLong("fuel_until"))).optional();
    }

    public Optional<Grant> grant(String providerOrderId) {
        return jdbc.sql("SELECT * FROM beach_fire_colors WHERE provider_order_id = ?")
            .param(providerOrderId).query(BeachFireRepository::mapGrant).optional();
    }

    public List<Grant> grants(String communityId) {
        return jdbc.sql("SELECT * FROM beach_fire_colors WHERE community_id = ? AND revoked_at IS NULL ORDER BY starts_at, provider_order_id")
            .param(communityId).query(BeachFireRepository::mapGrant).list();
    }

    private static Grant mapGrant(java.sql.ResultSet rs, int ignored) throws java.sql.SQLException {
        return new Grant(rs.getString("provider_order_id"), rs.getString("community_id"), rs.getString("user_id"),
            rs.getString("color"), rs.getLong("starts_at"), rs.getLong("expires_at"), rs.getObject("revoked_at", Long.class));
    }

    /** REQUIRED propagation joins a payment transaction so fulfillment commits atomically with payment. */
    public <T> T locked(String communityId, long initialFuelUntil, Function<LockedFire, T> work) {
        return transaction.execute(status -> {
            initialize(communityId, initialFuelUntil);
            Row initial = findRow(communityId, true).orElseThrow();
            return work.apply(new LockedFire() {
                private Row row = initial;
                public Row row() { return row; }
                public void fuelUntil(long value) {
                    jdbc.sql("UPDATE beach_fires SET fuel_until = ? WHERE community_id = ?").param(value).param(communityId).update();
                    row = new Row(communityId, value);
                }
                public boolean hasWoodRequest(String userId, UUID requestId) {
                    return jdbc.sql("SELECT EXISTS(SELECT 1 FROM beach_fire_wood_requests WHERE community_id = ? AND user_id = ? AND request_id = ?)")
                        .param(communityId).param(userId).param(requestId).query(Boolean.class).single();
                }
                public Long lastWoodAt(String userId) {
                    return jdbc.sql("SELECT added_at FROM beach_fire_wood_requests WHERE community_id = ? AND user_id = ? ORDER BY added_at DESC LIMIT 1")
                        .param(communityId).param(userId).query(Long.class).optional().orElse(null);
                }
                public void recordWood(String userId, UUID requestId, long at) {
                    jdbc.sql("INSERT INTO beach_fire_wood_requests (community_id, user_id, request_id, added_at) VALUES (?, ?, ?, ?)")
                        .param(communityId).param(userId).param(requestId).param(at).update();
                }
                public Optional<Grant> grant(String order) { return BeachFireRepository.this.grant(order); }
                public List<Grant> grants() { return BeachFireRepository.this.grants(communityId); }
                public void insertGrant(Grant grant) {
                    jdbc.sql("INSERT INTO beach_fire_colors (provider_order_id, community_id, user_id, color, starts_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
                        .param(grant.providerOrderId()).param(grant.communityId()).param(grant.userId()).param(grant.color())
                        .param(grant.startsAt()).param(grant.expiresAt()).update();
                }
                public void revokeGrant(String order, long at) {
                    jdbc.sql("UPDATE beach_fire_colors SET revoked_at = ? WHERE provider_order_id = ? AND revoked_at IS NULL")
                        .param(at).param(order).update();
                }
            });
        });
    }
}
