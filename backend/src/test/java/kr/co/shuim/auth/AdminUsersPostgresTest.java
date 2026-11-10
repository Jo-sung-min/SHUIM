package kr.co.shuim.auth;

import kr.co.shuim.admin.AdminUsersService;
import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Entirely isolated schema in the opt-in disposable loopback database; never uses application credentials. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class AdminUsersPostgresTest {
    private static final String SCHEMA = "admin_users_" + UUID.randomUUID().toString().replace("-", "");
    private static JdbcClient jdbc;
    private static AdminUsersService service;

    @BeforeAll static void setup() {
        String url = System.getenv("SOROW_TEST_DATABASE_URL");
        var base = new DriverManagerDataSource(url, "sorow_test", "");
        Flyway.configure().dataSource(base).schemas(SCHEMA).defaultSchema(SCHEMA).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(new DriverManagerDataSource(url + "?currentSchema=" + SCHEMA, "sorow_test", ""));
        service = new AdminUsersService(jdbc);
    }

    @AfterAll static void cleanup() {
        if (jdbc != null) jdbc.sql("DROP SCHEMA " + SCHEMA + " CASCADE").update();
    }

    private static void add(String id, String nick, String method, String created, String registered, boolean anonymous) {
        jdbc.sql("""
            INSERT INTO users (id,nick,is_anonymous,created_at,registered_at,password_hash,kakao_id,toss_user_key)
            VALUES (?,?,?,?::timestamp,?::timestamp,?,?,?)
            """).params(id, nick, anonymous, created, registered, "email".equals(method) ? "test-hash" : null,
                "kakao".equals(method) ? "k-" + id : null, "toss".equals(method) ? "t-" + id : null).update();
    }

    @Test void registeredOnlyProjectionKeepsMethodsDatesStatusAndLiteralNicknameSearch() {
        add("list-old", "조회 100%_!", "email", "2025-01-01 00:00:00", null, false);
        add("list-new", "조회 신규", "toss", "2024-01-01 00:00:00", "2026-11-05 00:00:00", false);
        add("list-kakao", "조회 차단", "kakao", "2026-01-01 00:00:00", null, false);
        add("list-anon", "조회 익명", null, "2026-11-05 00:00:00", null, true);
        add("list-demo", "조회 예제", null, "2026-11-05 00:00:00", null, false);
        jdbc.sql("UPDATE users SET blocked_at=CURRENT_TIMESTAMP WHERE id='list-kakao'").update();
        var page = service.list(" 조회 ", 0);
        assertEquals(3, page.total());
        assertEquals(List.of("list-new", "list-kakao", "list-old"), page.users().stream().map(AdminUsersService.User::id).toList());
        assertEquals(List.of("toss"), page.users().getFirst().signupMethods());
        assertNotNull(page.users().getFirst().registeredAt());
        assertNull(page.users().get(1).registeredAt());
        assertEquals("blocked", page.users().get(1).status());
        assertEquals("list-old", service.list("100%_!", 0).users().getFirst().id());
        assertEquals(0, service.list("%' OR TRUE --", 0).total());
    }

    @Test void pagingUsesStableIdOrderAndDoesNotReturnMoreThanOnePage() {
        for (int i = 0; i < 33; i++) add("page-" + String.format("%02d", i), "페이지 회원", "email", "2026-10-01 00:00:00", null, false);
        var first = service.list("페이지", 0);
        var second = service.list("페이지", 1);
        assertEquals(33, first.total()); assertEquals(30, first.users().size()); assertEquals(3, second.users().size());
        assertEquals("page-32", first.users().getFirst().id()); assertEquals("page-02", second.users().getFirst().id());
        assertTrue(first.users().stream().noneMatch(user -> second.users().contains(user)));
    }

    @Test void memberTypesPersistWithoutGrantingAdminOrChangingStatusAndCannotTargetVisitors() {
        add("type-member", "유형 회원", "email", "2026-01-01 00:00:00", null, false);
        add("type-admin", "유형 관리자", "toss", "2026-01-01 00:00:00", null, false);
        add("type-visitor", "유형 방문자", null, "2026-01-01 00:00:00", null, true);
        jdbc.sql("UPDATE users SET role='admin',blocked_at=CURRENT_TIMESTAMP WHERE id='type-admin'").update();
        for (String type : List.of("partner", "keeper", "member")) {
            var changed = service.setMemberType("type-member", type);
            assertEquals(type, changed.memberType()); assertFalse(changed.admin()); assertEquals("active", changed.status());
            var admin = service.setMemberType("type-admin", type);
            assertTrue(admin.admin()); assertEquals("blocked", admin.status());
        }
        assertEquals("member", new AdminUsersService(jdbc).list("유형 회원", 0).users().getFirst().memberType());
        assertEquals(404, assertThrows(ApiException.class, () -> service.setMemberType("type-visitor", "partner")).status());
        assertEquals(404, assertThrows(ApiException.class, () -> service.setMemberType("missing", "partner")).status());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE users SET member_type='admin' WHERE id='type-member'").update());
    }

    @Test void migrationKeepsHistoricDatesUnknownAndTypesOrdinary() {
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM users WHERE registered_at IS NOT NULL AND id IN ('demo','seed-breeze')").query(Long.class).single());
        add("history", "이전 회원", "email", "2024-01-01 00:00:00", null, false);
        var user = service.list("이전 회원", 0).users().getFirst();
        assertNull(user.registeredAt()); assertEquals("member", user.memberType());
    }

    @Test void emailNewSignupAndAnonymousUpgradeRecordTheRealRegistrationWithoutReplacingCreationTime() {
        var auth = new AuthService(jdbc, false, 30);
        var fresh = auth.signUp(new MockHttpServletRequest(), new MockHttpServletResponse(), "date-new@example.test", "새가입", "test-password");
        assertNotNull(registeredAt(fresh.id()));
        add("date-anon", "가입전", null, "2024-01-01 00:00:00", null, true);
        var mocked = spy(auth);
        var request = new MockHttpServletRequest();
        doReturn(java.util.Optional.of(new DbUser("date-anon", null, "가입전", "user", true, null, null, 0))).when(mocked).currentUser(request);
        var promoted = mocked.signUp(request, new MockHttpServletResponse(), "date-upgrade@example.test", "가입후", "test-password");
        assertEquals("date-anon", promoted.id());
        assertTrue(registeredAt(promoted.id()).isAfter(LocalDateTime.parse("2024-01-01T00:00:00")));
        assertEquals(LocalDateTime.parse("2024-01-01T00:00:00"), jdbc.sql("SELECT created_at FROM users WHERE id='date-anon'").query(LocalDateTime.class).single());
    }

    @Test void providerPromotionDatesOnlyTheFirstRegistrationAndRepeatLoginPreservesIt() {
        add("date-kakao", "카카오전", null, "2024-01-01 00:00:00", null, true);
        add("date-toss", "토스전", null, "2024-01-01 00:00:00", null, true);
        var policies = mock(PolicyConsentService.class);
        when(policies.hasSignupConsent("date-kakao")).thenReturn(true);
        when(policies.hasSignupConsent("date-toss")).thenReturn(true);
        var kakao = new KakaoLoginService(jdbc, null, policies, null, null, RestClient.builder(), "https://example.test", "test", "", false);
        var toss = new TossLoginService(jdbc, null, policies, null, null, RestClient.builder(), "", "", "", "https://example.test");
        assertEquals("date-kakao", kakao.findOrCreateUser(new KakaoLoginService.Profile("date-k-key", null, "카카오후"), "date-kakao").userId());
        assertEquals("date-toss", toss.findOrCreateUser("date-t-key", "date-toss"));
        LocalDateTime kakaoAt = registeredAt("date-kakao"), tossAt = registeredAt("date-toss");
        assertNotNull(kakaoAt); assertNotNull(tossAt);
        kakao.findOrCreateUser(new KakaoLoginService.Profile("date-k-key", null, "다른닉"), null);
        toss.findOrCreateUser("date-t-key", null);
        assertEquals(kakaoAt, registeredAt("date-kakao")); assertEquals(tossAt, registeredAt("date-toss"));
    }

    private static LocalDateTime registeredAt(String id) {
        return jdbc.sql("SELECT registered_at FROM users WHERE id=?").param(id).query(LocalDateTime.class).single();
    }
}
