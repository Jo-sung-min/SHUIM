package kr.co.shuim.pet;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.records.RecordsService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.concurrent.Executors;
import static org.junit.jupiter.api.Assertions.*;

/** Disposable loopback database only. Never reads application credentials. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PetPostgresTest {
    JdbcClient jdbc; TransactionTemplate tx; PetService pets; RecordsService records; String schema, uid;
    final String date = "2026-11-11";
    final PetService.Answers full = new PetService.Answers("지쳤어", 3, "일", "오늘은 잠깐 쉬었어요.", "휴식");
    @BeforeEach void setup() {
        schema = "moru_test_" + UUID.randomUUID().toString().replace("-", "");
        var ds = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        var mapper = new ObjectMapper();
        pets = new PetService(jdbc, mapper, Clock.fixed(Instant.parse("2026-11-10T22:00:00Z"), ZoneId.of("Asia/Seoul")));
        records = new RecordsService(jdbc, mapper);
        uid = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,'moru test','user',false)").param(uid).update();
    }
    @AfterEach void cleanup() {
        if (jdbc != null && schema.matches("moru_test_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    PetService.View write() { return tx.execute(s -> pets.journal(uid, new PetService.JournalInput(date, full))); }
    @Test void changingAppearancePreservesProgressAndIsIdempotent() {
        var before = tx.execute(s -> pets.get(uid));
        var changed = tx.execute(s -> pets.appearance(uid, new PetService.AppearanceInput("noa")));
        assertEquals("noa", changed.appearance());
        assertEquals(before.name(), changed.name()); assertEquals(before.xp(), changed.xp());
        assertEquals(before.food(), changed.food()); assertEquals(before.points(), changed.points());
        assertEquals(before.homeId(), changed.homeId());
        assertEquals(changed, tx.execute(s -> pets.appearance(uid, new PetService.AppearanceInput("noa"))));
        assertEquals("noa", tx.execute(s -> pets.get(uid)).appearance());
    }
    @Test void visitsAndRecordsPayOnlyOnceAndPurchasesAreIdempotent() throws Exception {
        try (var pool = Executors.newFixedThreadPool(4)) {
            var visits = pool.invokeAll(List.of(
                () -> tx.execute(s -> pets.get(uid)), () -> tx.execute(s -> pets.get(uid)),
                () -> tx.execute(s -> pets.get(uid)), () -> tx.execute(s -> pets.get(uid))));
            for (var visit : visits) visit.get();
        }
        assertEquals(10, tx.execute(s -> pets.get(uid)).points());
        assertEquals(30, write().points());
        assertEquals(30, write().points());
        jdbc.sql("UPDATE user_pets SET xp=60,visit_points=60 WHERE user_id=?").param(uid).update();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var buys = pool.invokeAll(List.of(
                () -> tx.execute(s -> pets.home(uid, new PetService.HomeInput(1))),
                () -> tx.execute(s -> pets.home(uid, new PetService.HomeInput(1)))));
            for (var buy : buys) buy.get();
        }
        var current = tx.execute(s -> pets.get(uid));
        assertEquals(0, current.points()); assertEquals(1, current.homeId());
        assertEquals(List.of(0,1), current.ownedHomes());
        assertEquals(0, tx.execute(s -> pets.home(uid, new PetService.HomeInput(0))).points());
        assertEquals(1, tx.execute(s -> pets.home(uid, new PetService.HomeInput(1))).homeId());
        assertThrows(Exception.class, () -> tx.execute(s -> pets.home(uid, new PetService.HomeInput(2))));
        assertEquals(0, tx.execute(s -> pets.get(uid)).points());
    }
    @Test void repeatedAndConcurrentSavesHaveOneRewardAndOneMemo() throws Exception {
        try (var pool = Executors.newFixedThreadPool(4)) {
            var results = pool.invokeAll(List.of(this::write, this::write, this::write, this::write));
            int rewards = 0;
            for (var result : results) rewards += ((PetService.View) result.get()).reward();
            assertEquals(5, rewards);
        }
        var view = tx.execute(s -> pets.get(uid));
        assertEquals(14, view.food()); assertEquals(20, view.xp()); assertEquals(5, view.earned());
        assertEquals(1L, jdbc.sql("SELECT count(*) FROM memos WHERE user_id=?").param(uid).query(Long.class).single());
        assertEquals(full, view.answers());
    }
    @Test void repeatedFeedClicksUseCompareAndSet() {
        var click = new PetService.FeedInput(date, 0);
        var first = tx.execute(s -> pets.feed(uid, click));
        var duplicate = tx.execute(s -> pets.feed(uid, click));
        assertEquals(8, first.food()); assertEquals(first, duplicate);
    }
    @Test void notebookRoundtripPreservesFormAndDeletionCannotFarmRewards() {
        write();
        var memos = records.load(uid).memos();
        tx.executeWithoutResult(s -> records.replaceMemos(uid, memos));
        assertEquals(full, tx.execute(s -> pets.get(uid)).answers());
        tx.executeWithoutResult(s -> records.replaceMemos(uid, List.of()));
        assertNull(tx.execute(s -> pets.get(uid)).answers().note());
        assertEquals(0, write().reward());
        assertEquals(14, tx.execute(s -> pets.get(uid)).food());
    }
    @Test void rollbackCannotPayForAnUnsavedDiaryAndOwnersStayIsolated() {
        tx.executeWithoutResult(s -> { pets.journal(uid, new PetService.JournalInput(date, full)); s.setRollbackOnly(); });
        assertEquals(9, tx.execute(s -> pets.get(uid)).food());
        assertTrue(records.load(uid).memos().isEmpty());
        write();
        String other = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,'other','user',false)").param(other).update();
        assertNull(tx.execute(s -> pets.get(other)).answers().note());
        assertEquals(9, tx.execute(s -> pets.get(other)).food());
    }
}
