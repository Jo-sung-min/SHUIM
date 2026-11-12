package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.OpenAiClient;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.circle.MailService;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 공용 공간과 소로우 공간을 실제 소로우·멤버·동의 테이블로 확인한다 (V48 까지 적용한 일회용 스키마, 합성 계정만).
 * 멤버 수는 CircleService 가 community_members 의 활성 멤버를 세는 그대로 쓴다.
 */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class SpaceAccessPostgresTest {
    private String schema;
    private JdbcClient jdbc;
    private TransactionTemplate tx;
    private CircleService circles;
    private CommunityConsentService consent;
    private BeachController controller;
    private final AuthService auth = mock(AuthService.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @BeforeEach void setup() {
        schema = "space_access_" + UUID.randomUUID().toString().replace("-", "");
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        var manager = new DataSourceTransactionManager(source);
        tx = new TransactionTemplate(manager);
        circles = new CircleService(jdbc, mock(MailService.class), mock(OpenAiClient.class), new ObjectMapper(), mock(BadgeService.class));
        consent = new CommunityConsentService(jdbc);
        controller = new BeachController(auth, mock(BlockService.class), new BeachService(new BeachFireService(new BeachFireRepository(jdbc, manager))), circles);
        controller.setConsent(consent);
    }

    @AfterEach void cleanup() {
        if (jdbc != null && schema != null && schema.matches("space_access_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }

    private DbUser user() {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous,password_hash) VALUES (?,'공간 테스트','user',FALSE,'synthetic-test-credential')").param(id).update();
        return jdbc.sql("SELECT * FROM users WHERE id=?").param(id).query(DbUser.MAPPER).single();
    }

    private void actor(DbUser user) {
        when(auth.requireUser(any(), any())).thenReturn(user);
        when(auth.currentUser(any())).thenReturn(Optional.of(user));
    }

    private void members(String circleId, int count, String status) {
        for (int i = 0; i < count; i++)
            jdbc.sql("INSERT INTO community_members (community_id, user_id, role, status) VALUES (?, ?, 'member', ?)").param(circleId).param(user().id()).param(status).update();
    }

    private Map<String, Object> enter(String spaceId, String mapId) {
        Map<String, Object> entered = controller.enter(new BeachController.EnterBody(spaceId, null, mapId), request, new MockHttpServletResponse());
        controller.leave(new BeachController.TicketBody((String) entered.get("ticket")));
        return entered;
    }

    private int refused(String spaceId, String mapId) {
        return assertThrows(ApiException.class, () -> enter(spaceId, mapId)).status();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> openMaps(Map<String, Object> circleView) {
        return ((List<Map<String, Object>>) circleView.get("spaceMaps")).stream().filter(m -> Boolean.TRUE.equals(m.get("open"))).map(m -> m.get("id")).toList();
    }

    private int peak(String circleId) {
        return jdbc.sql("SELECT space_member_peak FROM communities WHERE id = ?").param(circleId).query(Integer.class).single();
    }

    @Test void aNewCircleGetsItsOwnBeachAndOpensTheNextMapOnceItOutgrowsTwentyMembers() {
        DbUser owner = user();
        Map<String, Object> created = tx.execute(s -> circles.create(owner, new CircleService.CreateInput("공간 시험", "space-trial", "enjoy", "", "open", "public", null, null, null)));
        String id = (String) created.get("id"), slug = (String) created.get("slug");

        // 소로우를 열면 연 사람 혼자인 그 소로우만의 바닷가가 생긴다.
        assertEquals(1, circles.detail(owner, slug).get("memberCount"));
        assertEquals(List.of("beach"), openMaps(circles.detail(owner, slug)));
        @SuppressWarnings("unchecked") var mine = (List<Map<String, Object>>) circles.mine(owner).get("member");
        assertEquals(List.of("beach"), openMaps(mine.getFirst()));
        actor(owner);
        Map<String, Object> beach = enter(id, "beach");
        assertEquals(false, beach.get("shared"));
        assertEquals(Map.of("id", id, "slug", slug, "name", created.get("name")), beach.get("community"));
        assertEquals(403, refused(id, "uyuni"));

        // 20명까지는 바닷가만. 승인 대기 중인 멤버는 세지 않는다.
        members(id, 19, "active");
        members(id, 5, "pending");
        assertEquals(20, circles.detail(owner, slug).get("memberCount"));
        assertEquals(List.of("beach"), openMaps(circles.detail(owner, slug)));
        assertEquals(403, refused(id, "uyuni"));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count(id, "uyuni", request)).status());

        // 21번째 멤버가 가입하는 순간 우유니가 열리고, 그다음 풍경은 아직 닫혀 있다.
        DbUser newcomer = user();
        Map<String, Object> joined = tx.execute(s -> circles.join(newcomer, slug, null));
        assertEquals(21, joined.get("memberCount"));
        assertEquals(List.of("beach", "uyuni"), openMaps(joined));
        assertEquals("uyuni", enter(id, "uyuni").get("mapId"));
        assertEquals(403, refused(id, "bamboo"));
        assertEquals(21, peak(id));

        // 한 번 열린 풍경은 멤버가 줄어도 닫히지 않는다: 그 멤버가 나가 20명이 되고, 더 줄어도 우유니는 그대로다.
        Map<String, Object> left = tx.execute(s -> circles.leave(newcomer, slug));
        assertEquals(20, left.get("memberCount"));
        assertEquals(List.of("beach", "uyuni"), openMaps(left));
        jdbc.sql("DELETE FROM community_members WHERE community_id = ? AND role = 'member' AND status = 'active'").param(id).update();
        assertEquals(1, circles.detail(owner, slug).get("memberCount"));
        assertEquals(List.of("beach", "uyuni"), openMaps(circles.detail(owner, slug)));
        assertEquals("uyuni", enter(id, "uyuni").get("mapId"));
        assertEquals(403, refused(id, "bamboo"), "닫히지 않을 뿐, 아직 닿지 못한 풍경이 열리지는 않는다");
        assertEquals(21, peak(id));
    }

    @Test void approvingAWaitingMemberOpensTheNextMapAndOtherWaysOfGrowingAreCaughtWhenTheCircleIsOpened() {
        DbUser owner = user(), applicant = user();
        Map<String, Object> created = tx.execute(s -> circles.create(owner, new CircleService.CreateInput("승인 시험", "approve-trial", "enjoy", "", "approve", "public", null, null, null)));
        String id = (String) created.get("id"), slug = (String) created.get("slug");
        members(id, 19, "active");
        actor(owner);

        // 가입 신청만으로는 열리지 않고, 소로우지기가 승인해 21명이 되는 순간 열린다.
        assertEquals(20, tx.execute(s -> circles.join(applicant, slug, null)).get("memberCount"));
        assertEquals(403, refused(id, "uyuni"));
        tx.execute(s -> circles.memberAction(owner, slug, applicant.id(), "approve"));
        assertEquals(21, peak(id));
        assertEquals("uyuni", enter(id, "uyuni").get("mapId"));
        tx.execute(s -> circles.memberAction(owner, slug, applicant.id(), "remove"));
        assertEquals("uyuni", enter(id, "uyuni").get("mapId"), "내보낸 뒤에도 열린 풍경은 그대로다");

        // 가입·승인이 아닌 길로 멤버가 늘어도(예시 데이터처럼) 소로우 화면을 여는 순간 최고치가 남는다.
        members(id, 21, "active");
        assertEquals(21, peak(id));
        assertEquals(List.of("beach", "uyuni", "bamboo"), openMaps(circles.detail(owner, slug)));
        assertEquals(41, peak(id));
        jdbc.sql("DELETE FROM community_members WHERE community_id = ? AND role = 'member'").param(id).update();
        assertEquals(List.of("beach", "uyuni", "bamboo"), openMaps(circles.detail(owner, slug)));
    }

    @Test void circlesThatAlreadyExistStartFromTheMembersTheyHaveWhenTheRuleArrives() {
        // V19·V21·V22 의 예시 소로우는 마이그레이션이 멤버를 넣어 둔다: V48 이 그 수를 최고치로 옮겨 놓았다.
        var rows = jdbc.sql("""
            SELECT c.space_member_peak AS peak,
                   (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active')::int AS active
              FROM communities c""").query((rs, i) -> new int[] { rs.getInt("peak"), rs.getInt("active") }).list();
        assertFalse(rows.isEmpty());
        assertTrue(rows.stream().anyMatch(row -> row[1] > 0));
        for (int[] row : rows) assertEquals(row[1], row[0]);
    }

    @Test void anyoneEntersThePublicSpaceAfterAgreeingToTheRulesButNotACircleTheyNeverJoined() {
        DbUser owner = user(), stranger = user();
        Map<String, Object> created = tx.execute(s -> circles.create(owner, new CircleService.CreateInput("우리끼리", "just-us", "enjoy", "", "open", "public", null, null, null)));
        String id = (String) created.get("id");
        assertEquals(Map.of("id", SpaceMaps.PUBLIC_ID, "name", SpaceMaps.PUBLIC_NAME, "capacity", 20), circles.mine(stranger).get("publicSpace"));

        actor(stranger);
        assertEquals(403, refused(id, "beach"), "다른 소로우의 공간은 멤버가 아니면 들어가지 못한다");
        assertEquals(409, refused(SpaceMaps.PUBLIC_ID, "beach"), "공용 공간은 함께 지킬 약속에 동의한 뒤에 들어간다");
        consent.accept(stranger, CommunityConsentService.CURRENT_VERSION);
        for (BeachMap map : BeachMap.values()) assertEquals(true, enter(SpaceMaps.PUBLIC_ID, map.id()).get("shared"));

        // 소로우의 멤버가 몇 명이든 공용 공간의 풍경은 모두 열려 있고, 두 공간은 서로 다른 방이다.
        actor(owner);
        consent.accept(owner, CommunityConsentService.CURRENT_VERSION);
        Map<String, Object> shared = controller.enter(new BeachController.EnterBody(SpaceMaps.PUBLIC_ID, null, "baikal"), request, new MockHttpServletResponse());
        assertEquals(1, shared.get("count"));
        assertEquals(403, refused(id, "baikal"));

        // 공용 바닷가의 모닥불은 소로우 행 없이도 DB 에 남는다 (V48).
        Map<String, Object> onBeach = controller.enter(new BeachController.EnterBody(SpaceMaps.PUBLIC_ID), request, new MockHttpServletResponse());
        String ticket = (String) onBeach.get("ticket");
        controller.tick(new BeachController.TickBody(ticket, 1.0, 11.0, 0.0, false, null), request);
        assertEquals(BeachFireService.INITIAL_LOGS + 1, controller.wood(new BeachController.WoodBody(ticket, UUID.randomUUID().toString()), request, new MockHttpServletResponse()).logs());
        assertEquals(1L, jdbc.sql("SELECT count(*) FROM beach_fire_wood_requests WHERE community_id = 'public'").query(Long.class).single());
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM communities WHERE id = 'public'").query(Long.class).single());
    }
}
