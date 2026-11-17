package kr.co.shuim.outing;

import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** The outing service against a real, disposable loopback Postgres with V54 applied. Never reads application credentials. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class OutingPostgresTest {
    static class Ticking extends Clock {
        Instant now = Instant.parse("2026-11-18T01:00:00Z"); // 10:00 in Seoul
        @Override public ZoneId getZone() { return OutingRules.ZONE; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
    JdbcClient jdbc; TransactionTemplate tx; OutingService svc; Ticking clock; String schema, me, other;

    @BeforeEach void setup() {
        schema = "outing_test_" + UUID.randomUUID().toString().replace("-", "");
        var ds = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        clock = new Ticking(); svc = new OutingService(jdbc, clock);
        me = user("나"); other = user("남");
    }
    @AfterEach void cleanup() {
        if (jdbc != null && schema.matches("outing_test_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    String user(String nick) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,?,'user',false)").param(id).param(nick).update();
        return id;
    }
    OutingService.View finish(String who, String action, String note) {
        var session = tx.execute(s -> svc.start(who, new OutingService.StartInput(action)));
        clock.now = clock.now.plusSeconds(30);
        return tx.execute(s -> svc.complete(who, new OutingService.CompleteInput(session.token(), note)));
    }

    @Test void anOutingIsSavedRewardedOnceADayAndSurvivesRetries() {
        var first = tx.execute(s -> svc.get(me));
        assertEquals(0, first.days()); assertEquals(1, first.level()); assertFalse(first.rewardedToday());
        assertTrue(first.unlocked().size() >= 2, first.unlocked().toString());
        assertTrue(first.memories().isEmpty()); assertTrue(first.completedToday().isEmpty());
        assertEquals("2026-11-18", first.date());
        assertEquals("모루", first.companion().name()); assertEquals("moru", first.companion().appearance());
        String a = first.unlocked().get(0), b = first.unlocked().get(1);

        var session = tx.execute(s -> svc.start(me, new OutingService.StartInput(a)));
        assertEquals(36, session.token().length()); assertEquals(a, session.actionId());
        assertTrue(session.readyAt() > session.serverTime());
        // too early: the server's own elapsed time decides
        assertThrows(ApiException.class, () -> tx.execute(s -> svc.complete(me, new OutingService.CompleteInput(session.token(), "일찍"))));
        // a retried start keeps the running session
        assertEquals(session.token(), tx.execute(s -> svc.start(me, new OutingService.StartInput(a))).token());

        clock.now = clock.now.plusSeconds(30);
        var done = tx.execute(s -> svc.complete(me, new OutingService.CompleteInput(session.token(), "바람이 좋았어")));
        assertEquals(1, done.days()); assertTrue(done.rewardedToday());
        assertEquals(10, done.rewardAffinity()); assertEquals(20, done.rewardXp());
        assertEquals(10, done.affinity()); assertEquals(20, done.xp());
        assertEquals(List.of(a), done.completedToday());
        assertEquals(1, done.memories().size());
        assertEquals("바람이 좋았어", done.memories().get(0).note());
        assertEquals("2026-11-18", done.memories().get(0).day());
        assertEquals(a, done.memories().get(0).actionId());

        // a lost response can be retried without a second reward
        var again = tx.execute(s -> svc.complete(me, new OutingService.CompleteInput(session.token(), "바람이 좋았어")));
        assertEquals(1, again.days()); assertEquals(0, again.rewardAffinity()); assertEquals(1, again.memories().size());

        // a second activity on the same day: a memory, no extra growth
        var second = finish(me, b, null);
        assertEquals(1, second.days()); assertEquals(0, second.rewardAffinity());
        assertEquals(2, second.memories().size()); assertEquals(2, second.completedToday().size());

        // repeating an activity the same day keeps one memory, and an empty note does not erase the written one
        var repeat = finish(me, a, "");
        assertEquals(2, repeat.memories().size());
        assertTrue(repeat.memories().stream().anyMatch(m -> m.actionId().equals(a) && m.note().equals("바람이 좋았어")));

        // an unknown or stale token is refused
        assertEquals(410, assertThrows(ApiException.class,
            () -> tx.execute(s -> svc.complete(me, new OutingService.CompleteInput(UUID.randomUUID().toString(), "")))).status());

        // the next Korean day counts again
        clock.now = clock.now.plus(Duration.ofDays(1));
        var nextDay = finish(me, a, "둘째 날");
        assertEquals(2, nextDay.days()); assertEquals(10, nextDay.rewardAffinity()); assertEquals("2026-11-19", nextDay.date());
        assertEquals(3, nextDay.memories().size()); assertEquals(List.of(a), nextDay.completedToday());
        assertEquals(LocalDate.parse("2026-11-19"), jdbc.sql("SELECT last_reward_date FROM outing_progress WHERE user_id=?").param(me).query(LocalDate.class).single());
    }

    @Test void accountsAreSeparateTheCompanionFollowsThePetAndDeletingTheAccountRemovesEverything() {
        var mine = finish(me, tx.execute(s -> svc.get(me)).unlocked().get(0), "내 것");
        assertEquals(1, mine.days());
        jdbc.sql("INSERT INTO user_pets(user_id, meal_date) VALUES (?, ?)").param(other).param(LocalDate.parse("2026-11-18")).update();
        jdbc.sql("UPDATE user_pets SET name='먕먕', appearance='moring' WHERE user_id=?").param(other).update();
        var theirs = tx.execute(s -> svc.get(other));
        assertEquals(0, theirs.days()); assertTrue(theirs.memories().isEmpty());
        assertEquals("먕먕", theirs.companion().name()); assertEquals("moring", theirs.companion().appearance());

        jdbc.sql("DELETE FROM users WHERE id=?").param(me).update();
        assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM outing_progress WHERE user_id=?").param(me).query(Integer.class).single());
        assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM outing_memories WHERE user_id=?").param(me).query(Integer.class).single());
    }
}
