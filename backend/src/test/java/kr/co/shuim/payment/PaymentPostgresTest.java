package kr.co.shuim.payment;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.beach.BeachFireRepository;
import kr.co.shuim.beach.BeachFireService;
import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Dedicated disposable local PostgreSQL only; never reads application DB_URL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PaymentPostgresTest {
    private static JdbcClient jdbc;
    private static DataSourceTransactionManager manager;
    @BeforeAll static void setup() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source); manager = new DataSourceTransactionManager(source);
    }
    private static DbUser member() {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id,nick,is_anonymous,toss_user_key) VALUES (?,'결제 테스트',FALSE,?)")
            .param(id).param(Long.toUnsignedString(UUID.randomUUID().getLeastSignificantBits())).update();
        jdbc.sql("INSERT INTO communities (id,slug,name,name_key,kind,created_by) VALUES (?,?,?,?, 'interest',?)")
            .param(id).param(id).param(id.substring(0,20)).param(id.substring(0,20)).param(id).update();
        return new DbUser(id, null, "결제 테스트", "user", false, null, null, 0);
    }
    private static void cleanup(String id) {
        jdbc.sql("DELETE FROM beach_fire_payment_orders WHERE user_id=?").param(id).update();
        jdbc.sql("DELETE FROM communities WHERE id=?").param(id).update();
        jdbc.sql("DELETE FROM users WHERE id=?").param(id).update();
    }
    private static PaymentProviders providers() {
        var providers = mock(PaymentProviders.class);
        when(providers.configured(anyString())).thenReturn(true);
        when(providers.clientKey()).thenReturn("test_ck_mock");
        when(providers.sku(anyString())).thenAnswer(call -> "sku-" + call.getArgument(0));
        when(providers.ait(any(), anyString())).thenAnswer(call -> new PaymentProviders.Verified(PaymentProviders.State.PAID, call.getArgument(1), System.currentTimeMillis()));
        return providers;
    }
    private static String create(PaymentService service, DbUser user) {
        return (String) service.create(user, user.id(), "rose", "ait", UUID.randomUUID().toString()).get("orderId");
    }

    @Test void springChoosesTheDatabaseConstructorAndConcurrentServicesGrantOneReceiptOnce() throws Exception {
        DbUser user = member();
        try (var context = new AnnotationConfigApplicationContext(); var workers = Executors.newFixedThreadPool(8)) {
            context.registerBean(JdbcClient.class, () -> jdbc);
            context.registerBean(DataSourceTransactionManager.class, () -> manager);
            context.register(PaymentRepository.class);
            context.refresh();
            var repository = context.getBean(PaymentRepository.class);
            var fire = new BeachFireService(new BeachFireRepository(jdbc, manager));
            var providers = providers();
            var one = new PaymentService(repository, providers, fire);
            var two = new PaymentService(new PaymentRepository(jdbc, manager), providers, fire);
            String order = create(one, user), receipt = UUID.randomUUID().toString();
            var requests = new ArrayList<java.util.concurrent.Callable<Long>>();
            for (int i = 0; i < 16; i++) {
                var service = i % 2 == 0 ? one : two;
                requests.add(() -> (Long) service.confirmAit(user.id(), order, receipt).get("startsAt"));
            }
            Long expected = null;
            for (var result : workers.invokeAll(requests)) {
                if (expected == null) expected = result.get();
                assertEquals(expected, result.get());
            }
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM beach_fire_colors WHERE community_id=?").param(user.id()).query(Long.class).single());
            String another = create(one, user);
            assertEquals(409, assertThrows(ApiException.class, () -> two.confirmAit(user.id(), another, receipt)).status());
            assertNull(repository.find(another).orElseThrow().providerOrderId());
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM beach_fire_payment_orders WHERE user_id=? AND status='PAID'").param(user.id()).query(Long.class).single());
        } finally { cleanup(user.id()); }
    }

    @Test void grantFailureRollsBackPaidStateAndRetryFulfillsThePersistedReceipt() {
        DbUser user = member();
        var repository = new PaymentRepository(jdbc, manager);
        var providers = providers();
        var realFire = new BeachFireService(new BeachFireRepository(jdbc, manager));
        var faultyFire = spy(realFire);
        doAnswer(call -> { call.callRealMethod(); throw new IllegalStateException("simulated failure after grant"); })
            .when(faultyFire).activateColor(anyString(), anyString(), anyString(), anyString());
        var faulty = new PaymentService(repository, providers, faultyFire);
        try {
            String order = create(faulty, user), receipt = UUID.randomUUID().toString();
            assertThrows(IllegalStateException.class, () -> faulty.confirmAit(user.id(), order, receipt));
            assertEquals("CREATED", repository.find(order).orElseThrow().status());
            assertEquals(receipt, repository.find(order).orElseThrow().providerOrderId());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM beach_fire_colors WHERE community_id=?").param(user.id()).query(Long.class).single());
            var restarted = new PaymentService(repository, providers, realFire);
            assertEquals(true, restarted.confirmAit(user.id(), order, receipt).get("verified"));
            when(providers.ait(any(), eq(receipt))).thenReturn(new PaymentProviders.Verified(PaymentProviders.State.REFUNDED, receipt, null));
            assertEquals("REFUNDED", restarted.reconcile(user.id(), order).get("status"));
            assertEquals("amber", realFire.snapshot(user.id()).color());
            assertNotNull(jdbc.sql("SELECT revoked_at FROM beach_fire_colors WHERE community_id=?").param(user.id()).query(Long.class).single());
        } finally { cleanup(user.id()); }
    }

    @Test void receiptIdentitySurvivesAccountDeletionAndCannotBeReplayed() {
        DbUser user = member();
        var repository = new PaymentRepository(jdbc, manager);
        var service = new PaymentService(repository, providers(), new BeachFireService(new BeachFireRepository(jdbc, manager)));
        String order = create(service, user), receipt = UUID.randomUUID().toString();
        try {
            service.confirmAit(user.id(), order, receipt);
            jdbc.sql("DELETE FROM communities WHERE id=?").param(user.id()).update();
            jdbc.sql("DELETE FROM users WHERE id=?").param(user.id()).update();
            PaymentOrder retained = repository.find(order).orElseThrow();
            assertNull(retained.userId()); assertNull(retained.communityId());
            assertEquals(receipt, retained.providerOrderId());
        } finally { jdbc.sql("DELETE FROM beach_fire_payment_orders WHERE id=?").param(order).update(); cleanup(user.id()); }
    }

    @Test void deletedPayersSharedEffectIsStillRevokedAfterAProviderVerifiedRefund() {
        DbUser owner = member();
        String payerId = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id,nick,is_anonymous,toss_user_key) VALUES (?,'다른 구매자',FALSE,?)")
            .param(payerId).param(Long.toUnsignedString(UUID.randomUUID().getLeastSignificantBits())).update();
        DbUser payer = new DbUser(payerId, null, "다른 구매자", "user", false, null, null, 0);
        var repository = new PaymentRepository(jdbc, manager);
        var providers = providers();
        var fire = new BeachFireService(new BeachFireRepository(jdbc, manager));
        var service = new PaymentService(repository, providers, fire);
        String order = (String) service.create(payer, owner.id(), "rose", "ait", UUID.randomUUID().toString()).get("orderId");
        String receipt = UUID.randomUUID().toString();
        try {
            service.confirmAit(payer.id(), order, receipt);
            jdbc.sql("DELETE FROM users WHERE id=?").param(payerId).update();
            jdbc.sql("UPDATE beach_fire_payment_orders SET updated_at=? WHERE id=?").param(System.currentTimeMillis() - 600_000).param(order).update();
            when(providers.ait(any(), eq(receipt))).thenReturn(new PaymentProviders.Verified(PaymentProviders.State.REFUNDED, receipt, null));
            service.reconcileDue();
            assertEquals("REFUNDED", repository.find(order).orElseThrow().status());
            assertEquals("amber", fire.snapshot(owner.id()).color());
        } finally {
            jdbc.sql("DELETE FROM beach_fire_payment_orders WHERE id=?").param(order).update();
            jdbc.sql("DELETE FROM users WHERE id=?").param(payerId).update();
            cleanup(owner.id());
        }
    }
}
