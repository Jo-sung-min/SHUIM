package kr.co.shuim.pet;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.records.RecordsDtos;
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
    @Test void moringCanBeChosenAndTheViewListsEveryAppearance() {
        var view = tx.execute(s -> pets.appearance(uid, new PetService.AppearanceInput("moring")));
        assertEquals("moring", view.appearance());
        assertEquals(List.of("moru", "noa", "leo", "lumi", "moring"), view.appearances());
        assertThrows(Exception.class, () -> tx.execute(s -> pets.appearance(uid, new PetService.AppearanceInput("dragon"))));
        assertEquals("moring", tx.execute(s -> pets.get(uid)).appearance());
    }
    @Test void visitsAndRecordsPayOnlyOnceAndPurchasesAreIdempotent() throws Exception {
        try (var pool = Executors.newFixedThreadPool(4)) {
            var visits = pool.invokeAll(List.of(
                () -> tx.execute(s -> pets.get(uid)), () -> tx.execute(s -> pets.get(uid)),
                () -> tx.execute(s -> pets.get(uid)), () -> tx.execute(s -> pets.get(uid))));
            for (var visit : visits) visit.get();
        }
        // 방을 열면 날씨 도감 포인트(처음 본 하늘마다 +5)도 함께 들어온다
        assertEquals(10 + ledger("weather:%"), tx.execute(s -> pets.get(uid)).points());
        assertEquals(30 + ledger("weather:%"), write().points());
        assertEquals(30 + ledger("weather:%"), write().points());
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
    static Map<String, RecordsDtos.Entry> cats(String... ids) {
        var out = new LinkedHashMap<String, RecordsDtos.Entry>();
        for (String id : ids) out.put(id, new RecordsDtos.Entry(1, 1, "조금 나아졌어"));
        return out;
    }
    @Test void todaysRecordsFeedMoruOncePerCategoryUpToFive() {
        var withPet = new RecordsService(jdbc, new ObjectMapper(), pets);
        var today = LocalDate.parse(date);
        var start = tx.execute(s -> pets.get(uid));
        assertEquals(9, start.food()); assertEquals(0, start.earned()); assertEquals(10 + ledger("weather:%"), start.points());
        tx.executeWithoutResult(s -> withPet.saveDay(uid, today, new RecordsDtos.DayInput(cats("mind", "body", "work"), null)));
        var three = tx.execute(s -> pets.get(uid));
        assertEquals(12, three.food()); assertEquals(3, three.earned()); assertEquals(12, three.xp()); assertEquals(22 + ledger("weather:%"), three.points());
        // Saving the same day again, or after deleting an entry, never pays twice.
        tx.executeWithoutResult(s -> withPet.saveDay(uid, today, new RecordsDtos.DayInput(cats("mind"), null)));
        tx.executeWithoutResult(s -> withPet.saveDay(uid, today, new RecordsDtos.DayInput(cats("mind", "body", "work"), null)));
        assertEquals(12, tx.execute(s -> pets.get(uid)).food());
        // Seven categories still stop at five; a past date earns nothing.
        tx.executeWithoutResult(s -> withPet.saveDay(uid, today, new RecordsDtos.DayInput(cats("mind", "body", "work", "money", "relation", "c_a", "c_b"), null)));
        tx.executeWithoutResult(s -> withPet.saveDay(uid, today.minusDays(1), new RecordsDtos.DayInput(cats("mind", "body"), null)));
        var five = tx.execute(s -> pets.get(uid));
        assertEquals(14, five.food()); assertEquals(5, five.earned()); assertEquals(30 + ledger("weather:%"), five.points());
        // The older five-question diary shares the same five slots.
        assertEquals(0, write().reward());
        assertEquals(14, tx.execute(s -> pets.get(uid)).food());
    }
    @Test void journalRowsWrittenElsewhereAreSettledOnTheNextVisit() {
        jdbc.sql("INSERT INTO journal_entries (user_id, date, cat, score, delta, note) VALUES (?, ?, 'mind', 1, 1, ''), (?, ?, 'body', 0, 0, '')")
            .param(uid).param(LocalDate.parse(date)).param(uid).param(LocalDate.parse(date)).update();
        var view = tx.execute(s -> pets.get(uid));
        assertEquals(2, view.reward()); assertEquals(11, view.food()); assertEquals(2, view.earned());
        assertEquals(0, tx.execute(s -> pets.get(uid)).reward());
    }
    PetService at(String instant) { return new PetService(jdbc, new ObjectMapper(), Clock.fixed(Instant.parse(instant), ZoneId.of("Asia/Seoul"))); }
    PetService.View care(PetService service, String action) { return tx.execute(s -> service.care(uid, new PetService.CareInput(action))); }
    @Test void careStatesFollowTouchDustBathAndANightWithTheLightsOff() {
        var start = tx.execute(s -> pets.get(uid)); // 2026-11-11 07:00 KST
        assertEquals(2, start.warmth()); assertEquals(3, start.clean()); assertEquals(3, start.energy());
        assertFalse(start.bathed()); assertNull(start.lightsOff()); assertFalse(start.glow());
        for (String action : List.of("hug", "tickle", "talk", "hug")) care(pets, action);
        assertEquals(4, tx.execute(s -> pets.get(uid)).warmth());
        assertEquals(4, care(pets, "dust").clean());
        assertTrue(care(pets, "bath").bathed());
        assertThrows(Exception.class, () -> care(pets, "bath"));
        assertThrows(Exception.class, () -> care(pets, "lightsOff"), "7 a.m. is not night");
        assertThrows(Exception.class, () -> care(pets, "fly"));
        // 23:00 the same day: lights off for the night.
        var night = at("2026-11-11T14:00:00Z");
        assertEquals(Boolean.TRUE, care(night, "lightsOff").lightsOff());
        // 08:00 next morning: warmth halves, one dust returns, energy is full, and the day is settled only once.
        var morning = at("2026-11-11T23:00:00Z");
        var next = tx.execute(s -> morning.get(uid));
        assertEquals(2, next.warmth()); assertEquals(3, next.clean()); assertEquals(4, next.energy());
        assertFalse(next.bathed()); assertNull(next.lightsOff());
        assertEquals(2, tx.execute(s -> morning.get(uid)).warmth());
        // Filling all three once that day adds exactly one growth point.
        care(morning, "hug"); care(morning, "talk");
        int before = tx.execute(s -> morning.get(uid)).xp();
        var glowing = care(morning, "dust");
        assertTrue(glowing.glow()); assertEquals(before + 1, glowing.xp());
        assertEquals(before + 1, care(morning, "tickle").xp());
        // Two days away without lights off: nothing is lost but the states are low, never negative.
        var later = tx.execute(s -> at("2026-11-13T23:00:00Z").get(uid));
        assertEquals(1, later.warmth()); assertEquals(2, later.clean()); assertEquals(2, later.energy());
    }
    @Test void lightsChosenAfterMidnightSetTodaysEnergyDirectly() {
        tx.execute(s -> pets.get(uid));
        var lateNight = at("2026-11-11T16:30:00Z"); // 2026-11-12 01:30 KST, the day has already rolled over
        assertEquals(2, tx.execute(s -> lateNight.get(uid)).energy());
        var off = care(lateNight, "lightsOff");
        assertEquals(4, off.energy()); assertEquals(Boolean.TRUE, off.lightsOff());
        var on = care(lateNight, "lightsOn");
        assertEquals(2, on.energy()); assertEquals(Boolean.FALSE, on.lightsOff());
    }
    @Test void snackIsOncePerDayAndNeverCountsAsAMeal() throws Exception {
        var start = tx.execute(s -> pets.get(uid));
        assertFalse(start.snacked());
        int succeeded = 0;
        try (var pool = Executors.newFixedThreadPool(2)) {
            var taps = pool.invokeAll(List.<java.util.concurrent.Callable<PetService.View>>of(
                () -> tx.execute(s -> pets.snack(uid)), () -> tx.execute(s -> pets.snack(uid))));
            for (var tap : taps) { try { tap.get(); succeeded++; } catch (java.util.concurrent.ExecutionException expected) { /* 두 번째는 거절 */ } }
        }
        assertEquals(1, succeeded);
        var after = tx.execute(s -> pets.get(uid));
        assertEquals(start.food() - 1, after.food()); assertEquals(start.xp() + 1, after.xp());
        assertEquals(start.meals(), after.meals()); assertEquals(start.points(), after.points());
        assertTrue(after.snacked());
        assertThrows(Exception.class, () -> tx.execute(s -> pets.snack(uid)));
        // An empty pantry refuses the snack and leaves today's one snack unused.
        String other = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,'other','user',false)").param(other).update();
        tx.execute(s -> pets.get(other));
        jdbc.sql("UPDATE user_pets SET food=0 WHERE user_id=?").param(other).update();
        assertThrows(Exception.class, () -> tx.execute(s -> pets.snack(other)));
        assertFalse(tx.execute(s -> pets.get(other)).snacked());
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
    int ledger(String like) {
        return jdbc.sql("SELECT COALESCE(SUM(amount), 0) FROM pet_point_ledger WHERE user_id = ? AND event_key LIKE ?").param(uid).param(like).query(Integer.class).single();
    }
    @Test void todaysChoresArePickedOnceAndFinishingAllPaysOnce() {
        var start = tx.execute(s -> pets.get(uid));
        assertEquals(3, start.tasks().size());
        assertEquals("record", start.tasks().get(0).id());
        assertTrue(start.tasks().stream().noneMatch(PetService.Task::done));
        assertFalse(start.tasksRewarded());
        PetService.View last = start;
        for (var task : start.tasks()) {
            assertFalse(last.tasksRewarded());
            last = switch (task.id()) {
                case "record" -> write();
                case "snack" -> tx.execute(s -> pets.snack(uid));
                default -> care(pets, task.id());
            };
        }
        assertTrue(last.tasks().stream().allMatch(PetService.Task::done));
        assertTrue(last.tasksRewarded());
        assertEquals(PetDays.TASK_POINTS, ledger("tasks:%"));
        // 같은 날 다시 열어도 할 일은 그대로, 더 해도 다시 주지 않는다
        var again = tx.execute(s -> pets.get(uid));
        assertEquals(start.tasks().stream().map(PetService.Task::id).toList(), again.tasks().stream().map(PetService.Task::id).toList());
        care(pets, "hug"); write();
        assertEquals(PetDays.TASK_POINTS, ledger("tasks:%"));
        assertEquals(last.xp(), tx.execute(s -> pets.get(uid)).xp());
    }
    @Test void weatherBookRecordsEachSkyOnceAndPaysOnce() {
        var first = tx.execute(s -> pets.get(uid));
        assertNotNull(first.sky());
        var entry = first.sky().weather() + "-" + first.sky().land();
        assertTrue(PetDays.WEATHERS.contains(entry));
        assertTrue(first.weatherSeen().contains(entry));
        assertTrue(first.newWeather().contains(entry));
        var second = tx.execute(s -> pets.get(uid));
        assertTrue(second.newWeather().isEmpty());
        assertEquals(first.weatherSeen(), second.weatherSeen());
        assertEquals(first.newWeather().size() * PetDays.WEATHER_POINTS, ledger("weather:%"));
        // 다른 날의 하늘은 새 칸이 될 수 있고, 이미 본 칸은 다시 주지 않는다
        var later = at("2026-11-20T03:00:00Z");
        var other = tx.execute(s -> later.get(uid));
        assertEquals(other.weatherSeen().size() * PetDays.WEATHER_POINTS, ledger("weather:%"));
    }
}
