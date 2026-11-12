package kr.co.shuim.beach;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

/** Opt-in disposable local database only. Never uses application DB_URL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class BeachFirePostgresTest {
    private static JdbcClient jdbc;
    private static DataSourceTransactionManager manager;
    private static BeachFireRepository repository;

    @BeforeAll
    static void setup() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        manager = new DataSourceTransactionManager(source);
        repository = new BeachFireRepository(jdbc, manager);
    }

    private static String community() {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id, nick, is_anonymous) VALUES (?, '불씨 테스트', TRUE)").param(id).update();
        jdbc.sql("INSERT INTO communities (id, slug, name, name_key, kind, created_by) VALUES (?, ?, ?, ?, 'interest', ?)")
            .param(id).param(id).param(id.substring(0, 20)).param(id.substring(0, 20)).param(id).update();
        return id;
    }

    private static void cleanup(String id) {
        // V48 부터 모닥불은 소로우 행에 묶여 있지 않으므로 직접 지운다.
        jdbc.sql("DELETE FROM beach_fire_wood_requests WHERE community_id = ?").param(id).update();
        jdbc.sql("DELETE FROM beach_fires WHERE community_id = ?").param(id).update();
        jdbc.sql("DELETE FROM communities WHERE id = ?").param(id).update();
        jdbc.sql("DELETE FROM users WHERE id = ?").param(id).update();
    }

    @Test
    void thePublicSpaceKeepsADurableFireWithoutACircleRow() {
        String space = kr.co.shuim.common.SpaceMaps.PUBLIC_ID, visitor = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id, nick, is_anonymous) VALUES (?, '공용 불씨 테스트', TRUE)").param(visitor).update();
        cleanup(space);
        try {
            long now = 1_000_000;
            var fire = new BeachFireService(repository, () -> now);
            assertEquals(BeachFireService.INITIAL_LOGS, fire.snapshot(space).logs());
            assertEquals(BeachFireService.INITIAL_LOGS + 1, fire.addWood(space, visitor, UUID.randomUUID().toString()).logs());
            // 다른 서버 인스턴스도 같은 공용 모닥불을 본다.
            assertEquals(BeachFireService.INITIAL_LOGS + 1, new BeachFireService(new BeachFireRepository(jdbc, manager), () -> now).snapshot(space).logs());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM communities WHERE id = ?").param(space).query(Long.class).single());
        } finally {
            cleanup(space);
            jdbc.sql("DELETE FROM users WHERE id = ?").param(visitor).update();
        }
    }

    @Test
    void separateServiceInstancesSerializeWoodAndPaymentOrdersInPostgres() throws Exception {
        String community = community();
        long now = 1_000_000;
        var first = new BeachFireService(repository, () -> now);
        var second = new BeachFireService(new BeachFireRepository(jdbc, manager), () -> now);
        String woodRequest = UUID.randomUUID().toString();
        String order = "web:" + UUID.randomUUID();
        try (var workers = Executors.newFixedThreadPool(8)) {
            List<Callable<BeachFireService.FireView>> additions = new ArrayList<>();
            for (int i = 0; i < 16; i++) {
                var instance = i % 2 == 0 ? first : second;
                additions.add(() -> instance.addWood(community, community, woodRequest));
            }
            for (var result : workers.invokeAll(additions)) assertEquals(4, result.get().logs());
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM beach_fire_wood_requests WHERE community_id = ?").param(community).query(Long.class).single());
            List<Callable<BeachFireService.Activation>> payments = new ArrayList<>();
            for (int i = 0; i < 16; i++) {
                var instance = i % 2 == 0 ? first : second;
                payments.add(() -> instance.activateColor(community, community, "aurora", order));
            }
            for (var result : workers.invokeAll(payments)) {
                assertEquals(now, result.get().startsAt());
                assertEquals(now + BeachFireService.COLOR_DURATION_MS, result.get().expiresAt());
            }
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM beach_fire_colors WHERE community_id = ?").param(community).query(Long.class).single());
        } finally { cleanup(community); }
    }

    @Test
    void fulfillmentAndRefundJoinOuterPaymentTransactionsAndRollbackTogether() {
        String community = community();
        var service = new BeachFireService(repository, () -> 1_000_000L);
        String order = "ait:" + UUID.randomUUID();
        var tx = new TransactionTemplate(manager);
        try {
            assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(status -> {
                service.activateColor(community, community, "rose", order);
                throw new IllegalStateException("payment state write failed");
            }));
            assertTrue(repository.grant(order).isEmpty());
            assertEquals("amber", service.snapshot(community).color());
            var activated = service.activateColor(community, community, "rose", order);
            assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(status -> {
                service.revokeColor(order);
                throw new IllegalStateException("refund state write failed");
            }));
            assertEquals("rose", service.snapshot(community).color());
            assertEquals(activated.expiresAt(), service.snapshot(community).colorExpiresAt());
        } finally { cleanup(community); }
    }
}
