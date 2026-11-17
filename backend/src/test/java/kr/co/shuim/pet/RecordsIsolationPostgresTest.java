package kr.co.shuim.pet;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.records.RecordsService;
import kr.co.shuim.records.RecordsDtos.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** 전역 id 를 쓰는 개인 기록(메모·목표·일정)이 다른 계정의 행을 바꾸지 못하는지, 묶음 저장이 값을 그대로 지키는지. 일회용 루프백 DB 만 쓴다 */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class RecordsIsolationPostgresTest {
    JdbcClient jdbc; TransactionTemplate tx; PetService pets; RecordsService records; String schema, victim, attacker;
    final String date = "2026-11-11";
    final PetService.Answers full = new PetService.Answers("지쳤어", 3, "일", "오늘은 잠깐 쉬었어요.", "휴식");

    @BeforeEach void setup() {
        schema = "rec_test_" + UUID.randomUUID().toString().replace("-", "");
        var ds = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        var mapper = new ObjectMapper();
        pets = new PetService(jdbc, mapper, Clock.fixed(Instant.parse("2026-11-10T22:00:00Z"), ZoneId.of("Asia/Seoul")));
        records = new RecordsService(jdbc, mapper);
        victim = user("victim"); attacker = user("attacker");
    }
    @AfterEach void cleanup() {
        if (jdbc != null && schema.matches("rec_test_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    String user(String nick) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,?,'user',false)").param(id).param(nick).update();
        return id;
    }
    static String petMemoId(String uid, String date) {
        return UUID.nameUUIDFromBytes(("sorow-pet:" + uid + ":" + date).getBytes(StandardCharsets.UTF_8)).toString();
    }
    String ownerOf(String table, String id) {
        return jdbc.sql("SELECT user_id FROM " + table + " WHERE id = ?").param(id).query(String.class).optional().orElse(null);
    }

    @Test void recordsSyncCannotClaimSomeoneElsesPetDiaryId() {
        String stolen = petMemoId(victim, date);
        tx.executeWithoutResult(s -> records.replaceMemos(attacker, List.of(new Memo(stolen, "mind", "선점", false, 1L, 1L), new Memo("own1", "mind", "내 메모", false, 2L, 2L))));
        assertNull(ownerOf("memos", stolen));
        assertEquals(List.of("own1"), records.load(attacker).memos().stream().map(Memo::id).toList());
        // 피해자의 마음기록은 정상 저장되고 피해자에게만 보인다
        tx.execute(s -> pets.journal(victim, new PetService.JournalInput(date, full)));
        assertEquals(victim, ownerOf("memos", stolen));
        assertEquals(full, tx.execute(s -> pets.get(victim)).answers());
        assertTrue(records.load(attacker).memos().stream().noneMatch(m -> m.id().equals(stolen)));
        // 내 마음기록 id 는 목록 교체 뒤에도 그대로 남는다
        tx.executeWithoutResult(s -> records.replaceMemos(victim, records.load(victim).memos()));
        assertEquals(victim, ownerOf("memos", stolen));
    }

    @Test void petDiaryNeverOverwritesAnotherAccountsRow() {
        String stolen = petMemoId(victim, date);
        // 예전 서버에서 이미 남이 차지한 행이 있어도 덮어쓰지 않고 실패한다 (마음밥도 지급되지 않음)
        jdbc.sql("INSERT INTO memos (id, user_id, cat, text) VALUES (?, ?, 'mind', '공격자 행')").param(stolen).param(attacker).update();
        ApiException e = assertThrows(ApiException.class, () -> tx.execute(s -> pets.journal(victim, new PetService.JournalInput(date, full))));
        assertEquals(409, e.status());
        assertEquals("공격자 행", jdbc.sql("SELECT text FROM memos WHERE id = ?").param(stolen).query(String.class).single());
        assertEquals(attacker, ownerOf("memos", stolen));
        assertNull(tx.execute(s -> pets.get(victim)).answers().note());
    }

    @Test void conflictingIdsFromAnotherAccountAreDroppedNotOverwritten() {
        tx.executeWithoutResult(s -> {
            records.replaceMemos(victim, List.of(new Memo("m-shared", "money", "피해자 메모", true, 1000L, 2000L)));
            records.replaceGoals(victim, List.of(new Goal("g-shared", "피해자 목표", "work", "", List.of(new GoalStep("st-shared", "피해자 단계", false)), null, 1000L, null)));
            records.replaceSchedule(victim, List.of(new ScheduleItem("sc-shared", "2026-11-20", "09:00", "피해자 일정", "body", false)));
        });
        tx.executeWithoutResult(s -> {
            records.replaceMemos(attacker, List.of(new Memo("m-shared", "mind", "덮어쓰기", false, 1L, 1L)));
            records.replaceGoals(attacker, List.of(new Goal("g-shared", "덮어쓰기", "mind", "", List.of(new GoalStep("st-new", "끼워넣기", true)), null, 1L, null),
                new Goal("g-mine", "내 목표", "mind", "", List.of(new GoalStep("st-shared", "겹친 단계", true), new GoalStep("st-mine", "내 단계", true)), null, 1L, null)));
            records.replaceSchedule(attacker, List.of(new ScheduleItem("sc-shared", "2026-11-21", null, "덮어쓰기", "etc", true)));
        });
        assertEquals("피해자 메모", records.load(victim).memos().get(0).text());
        Goal g = records.load(victim).goals().get(0);
        assertEquals("피해자 목표", g.title());
        assertEquals(List.of("st-shared"), g.steps().stream().map(GoalStep::id).toList());
        assertEquals("피해자 일정", records.load(victim).schedule().get(0).title());
        // 공격자 쪽에는 겹치지 않은 것만 남는다
        assertTrue(records.load(attacker).memos().isEmpty());
        assertEquals(List.of("g-mine"), records.load(attacker).goals().stream().map(Goal::id).toList());
        assertEquals(List.of("st-mine"), records.load(attacker).goals().get(0).steps().stream().map(GoalStep::id).toList());
        assertTrue(records.load(attacker).schedule().isEmpty());
    }

    @Test void batchedReplaceKeepsEveryValue() {
        Map<String, Map<String, Entry>> journal = new LinkedHashMap<>();
        Map<String, Entry> d1 = new LinkedHashMap<>();
        d1.put("mind", new Entry(-3, null, "불안"));
        d1.put("c_k1", new Entry(2, 1, ""));
        journal.put("2026-10-01", d1);
        journal.put("2026-10-02", Map.of("money", new Entry(5, -2, "주식")));
        journal.put("2019-12-31", Map.of("money", new Entry(1, null, "범위 밖")));
        Map<String, DayLog> log = Map.of("2026-10-01", new DayLog(List.of("산책", "독서", "물 마시기")));
        long t = 1_760_000_000_123L;
        var snap = new Snapshot(journal, log,
            List.of(new Memo("m1", "money", "메모, \"따옴표\" {중괄호}", true, t, t + 1)),
            List.of(new Goal("g1", "목표", "work", "왜", List.of(new GoalStep("s1", "첫째", true), new GoalStep("s2", "둘째", false)), "2026-12-31", t, t + 5)),
            List.of(new ScheduleItem("sc1", "2026-11-20", "19:30", "일정", "body", true), new ScheduleItem("sc2", "2026-11-21", null, "시간 없음", "etc", false)),
            null, null);
        tx.executeWithoutResult(s -> records.replace(victim, snap));
        var loaded = records.load(victim);
        assertEquals(Set.of("2026-10-01", "2026-10-02"), loaded.journal().keySet());
        assertEquals(new Entry(-3, null, "불안"), loaded.journal().get("2026-10-01").get("mind"));
        assertEquals(new Entry(2, 1, ""), loaded.journal().get("2026-10-01").get("c_k1"));
        assertEquals(new Entry(5, -2, "주식"), loaded.journal().get("2026-10-02").get("money"));
        assertEquals(List.of("산책", "독서", "물 마시기"), loaded.log().get("2026-10-01").did());
        assertEquals(new Memo("m1", "money", "메모, \"따옴표\" {중괄호}", true, t, t + 1), loaded.memos().get(0));
        Goal g = loaded.goals().get(0);
        assertEquals(new Goal("g1", "목표", "work", "왜", g.steps(), "2026-12-31", t, t + 5), g);
        assertEquals(List.of(new GoalStep("s1", "첫째", true), new GoalStep("s2", "둘째", false)), g.steps());
        assertEquals(snap.schedule(), loaded.schedule());
        // 하루 저장도 같은 경로를 쓴다
        tx.executeWithoutResult(s -> records.saveDay(victim, LocalDate.parse("2026-10-02"), new DayInput(Map.of("body", new Entry(1, null, null)), null)));
        assertEquals(Map.of("body", new Entry(1, null, "")), records.load(victim).journal().get("2026-10-02"));
    }
}
