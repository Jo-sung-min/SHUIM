package kr.co.shuim.circle;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.OpenAiClient;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** 소로우 묶음 (V36 circle_groups): 합성 계정만, 따로 받은 일회용 루프백 DB 의 새 스키마에서. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class CircleGroupsPostgresTest {
    private String schema;
    private JdbcClient jdbc;
    private TransactionTemplate tx;
    private CircleService circles;
    private DbUser alice, bora;

    @BeforeEach void setup() {
        schema = "circle_groups_" + UUID.randomUUID().toString().replace("-", "");
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        circles = new CircleService(jdbc, mock(MailService.class), mock(OpenAiClient.class), new ObjectMapper(), mock(BadgeService.class));
        alice = user();
        bora = user();
    }

    @AfterEach void cleanup() {
        if (jdbc != null && schema != null && schema.matches("circle_groups_[a-f0-9]{32}")) {
            jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
        }
    }

    private DbUser user() {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous,password_hash) VALUES (?,'묶음 테스트','user',FALSE,'synthetic-test-credential')").param(id).update();
        return jdbc.sql("SELECT * FROM users WHERE id=?").param(id).query(DbUser.MAPPER).single();
    }

    private Map<String, Object> open(DbUser me, String name, String slug, String kind, String group, String icon) {
        return tx.execute(s -> circles.create(me, new CircleService.CreateInput(name, slug, kind, "", "open", "public", null, icon, group)));
    }

    private static int status(Runnable action) { return assertThrows(ApiException.class, action::run).status(); }

    private List<Map<String, Object>> groups(String q) { return circles.groups(null, q); }

    private static Optional<Map<String, Object>> find(List<Map<String, Object>> list, String label) {
        return list.stream().filter(g -> label.equals(g.get("label"))).findFirst();
    }

    @Test void builtinGroupsKeepTheirIdsAndLabels() {
        // 샘플 소로우(V21·V22)가 기본 묶음에 들어 있어서 개수는 늘어난 만큼만 본다
        int before = (Integer) find(groups(null), "즐기는 중").orElseThrow().get("circleCount");
        Map<String, Object> c = open(alice, "그림 일기", "drawing-diary", "enjoy", null, "coffee");
        assertEquals("enjoy", c.get("kind"));
        assertEquals("즐기는 중", c.get("kindLabel"));
        assertEquals("coffee", c.get("icon"));
        List<Map<String, Object>> list = groups(null);
        assertEquals(List.of("enjoy", "live", "love", "work", "study", "rest", "care"), list.stream().map(g -> g.get("id")).toList());
        assertEquals(before + 1, find(list, "즐기는 중").orElseThrow().get("circleCount"));
        assertEquals(400, status(() -> open(alice, "아무거나", "anything", "nope", null, null)));
        assertEquals(400, status(() -> open(alice, "아무거나", "anything", null, null, null)));
    }

    @Test void newGroupsAreCreatedOnceAndMergedBySpacing() {
        Map<String, Object> first = open(alice, "캠핑 초보", "camping-new", null, "캠핑하는 중", "fl:food_cake");
        String id = (String) first.get("kind");
        assertTrue(id.startsWith("g-"));
        assertEquals("캠핑하는 중", first.get("kindLabel"));
        assertEquals("fl:food_cake", first.get("icon"));

        Map<String, Object> second = open(bora, "솔로 캠핑", "solo-camping", "enjoy", "캠핑하는중", null);
        assertEquals(id, second.get("kind"), "같은 이름은 띄어쓰기가 달라도 있는 묶음으로");
        assertEquals("캠핑하는 중", second.get("kindLabel"));
        assertEquals(1, jdbc.sql("SELECT count(*) FROM circle_groups WHERE NOT builtin").query(Long.class).single());

        Map<String, Object> builtin = open(bora, "쉬어 가기", "pause-here", null, "쉬는중", null);
        assertEquals("rest", builtin.get("kind"), "기본 묶음 이름을 쓰면 기본 묶음으로");

        Map<String, Object> camping = find(groups(null), "캠핑하는 중").orElseThrow();
        assertEquals(2, camping.get("circleCount"));
        assertEquals(false, camping.get("builtin"));
        assertEquals(List.of("camping-new", "solo-camping"), circles.browse(id, "").stream().map(c -> c.get("slug")).toList());
        assertEquals(Set.of("캠핑하는 중"), new HashSet<>(circles.browse(id, "").stream().map(c -> c.get("kindLabel")).toList()));
    }

    @Test void badOrAffiliatedGroupNamesAreRefusedAndNothingIsLeftBehind() {
        assertEquals(400, status(() -> open(alice, "모임", "meet-1", null, "ㅅㅂ", null)));
        assertEquals(400, status(() -> open(alice, "모임", "meet-2", null, "시1발 모임", null)));
        assertEquals(400, status(() -> open(alice, "모임", "meet-3", null, "한빛 대학교", null)));
        assertEquals(400, status(() -> open(alice, "모임", "meet-4", null, "가", null)));
        assertEquals(400, status(() -> open(alice, "병신 모임", "meet-5", "enjoy", null, null)));
        assertEquals(0, jdbc.sql("SELECT count(*) FROM circle_groups WHERE NOT builtin").query(Long.class).single());

        open(alice, "뜨개질", "knitting", "enjoy", null, null);
        // 이름이 겹쳐 소로우가 안 열리면 새 묶음도 남지 않는다
        assertEquals(400, status(() -> open(bora, "뜨개질", "knitting-2", null, "실과 바늘", null)));
        assertEquals(0, jdbc.sql("SELECT count(*) FROM circle_groups WHERE NOT builtin").query(Long.class).single());
    }

    @Test void emptyGroupsHideFromTheListButStillMatchSearches() {
        Map<String, Object> c = open(alice, "새벽 러닝", "dawn-run", null, "달리는 중", null);
        assertTrue(find(groups(null), "달리는 중").isPresent());
        tx.executeWithoutResult(s -> circles.close(alice, (String) c.get("slug")));
        assertTrue(find(groups(null), "달리는 중").isEmpty(), "소로우가 다 닫힌 묶음은 목록에서 빠진다");
        Map<String, Object> searched = find(groups("달리는"), "달리는 중").orElseThrow();
        assertEquals(0, searched.get("circleCount"));
        assertTrue(groups("즐기는").stream().anyMatch(g -> "enjoy".equals(g.get("id"))));
        assertEquals(List.of(), groups("가".repeat(21)));
    }

    @Test void openSampleCirclesGetListedFluentIcons() {
        List<Map<String, Object>> list = circles.browse("", "");
        assertEquals(27, list.size(), "V21·V22 의 열린 소로우 27개");
        for (Map<String, Object> c : list) {
            String icon = (String) c.get("icon");
            assertNotNull(icon, c.get("slug") + " 에 아이콘이 들어가야 한다");
            assertEquals(icon, CircleLogic.normalizeIcon(icon), c.get("slug") + " 의 아이콘은 아이콘 찾기 목록에 있어야 한다");
        }
        assertEquals(27, list.stream().map(c -> c.get("icon")).distinct().count(), "소로우마다 다른 아이콘");
    }

    @Test void iconsMustBeLegacyOrListedFluentNames() {
        assertNull(open(alice, "아이콘 없음", "no-icon", "enjoy", null, "fl:../../etc").get("icon"));
        Map<String, Object> c = open(bora, "아이콘", "has-icon", "enjoy", null, "fl:weather_partly_cloudy_day");
        assertEquals("fl:weather_partly_cloudy_day", c.get("icon"));
        Map<String, Object> updated = tx.execute(s -> circles.update(bora, "has-icon", Map.of("icon", "fl:food_cake")));
        assertEquals("fl:food_cake", updated.get("icon"));
        Map<String, Object> cleared = tx.execute(s -> circles.update(bora, "has-icon", Map.of("icon", "fl:nope")));
        assertNull(cleared.get("icon"));
    }
}
