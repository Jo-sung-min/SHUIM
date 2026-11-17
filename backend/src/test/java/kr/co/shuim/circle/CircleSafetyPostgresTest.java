package kr.co.shuim.circle;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.OpenAiClient;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.auth.PolicyConsentService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.function.Executable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 소로우 AI 동의·지기 권한·익명 계정 제한: 합성 계정만, 따로 받은 일회용 루프백 DB 의 새 스키마에서. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_(test|wt_[a-z0-9_]+)")
class CircleSafetyPostgresTest {
    private String schema;
    private JdbcClient jdbc;
    private TransactionTemplate tx;
    private CircleService circles;
    private OpenAiClient ai;
    private PolicyConsentService policies;
    private DbUser keeper, writer;
    private String slug;

    @BeforeEach void setup() {
        schema = "circle_safety_" + UUID.randomUUID().toString().replace("-", "");
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        ai = mock(OpenAiClient.class);
        when(ai.configured()).thenReturn(true);
        when(ai.resolveModel(any())).thenReturn("test-model");
        when(ai.complete(any(), anyInt(), any(), any())).thenAnswer(inv -> {
            // AI 를 기다리는 동안 DB 트랜잭션이 열려 있으면 안 된다
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            return "{\"text\":\"다듬은 사연이에요\",\"masked\":[]}";
        });
        circles = new CircleService(jdbc, mock(MailService.class), ai, new ObjectMapper(), mock(BadgeService.class));
        policies = new PolicyConsentService(jdbc, null);
        circles.setPolicies(policies);
        keeper = user(false);
        writer = user(false);
        slug = "safety-" + UUID.randomUUID().toString().substring(0, 8);
        tx.execute(s -> circles.create(keeper, new CircleService.CreateInput("안전 확인", slug, "rest", "", "open", "members", null, null, null)));
        tx.execute(s -> circles.join(writer, slug, null));
    }

    @AfterEach void cleanup() {
        if (jdbc != null && schema != null && schema.matches("circle_safety_[a-f0-9]{32}")) {
            jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
        }
    }

    private DbUser user(boolean anonymous) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous,password_hash) VALUES (?,'안전 테스트','user',?,'synthetic-test-credential')").param(id).param(anonymous).update();
        return reload(id);
    }

    private DbUser reload(String id) { return jdbc.sql("SELECT * FROM users WHERE id=?").param(id).query(DbUser.MAPPER).single(); }

    private void consent(DbUser u, boolean aiOk) { policies.accept(u, PolicyConsentService.VERSION, aiOk); }

    private static ApiException fails(Executable action) { return assertThrows(ApiException.class, action); }

    private String submit() {
        return (String) tx.execute(s -> circles.submit(writer, slug, "free", "회사에서 김철수 팀장님 때문에 힘들어요")).get("id");
    }

    @Test void previewNeedsTheWritersAiConsent() {
        ApiException e = fails(() -> circles.preview(writer, slug, "오늘 너무 힘들었어요"));
        assertEquals(403, e.status());
        assertEquals(CircleService.AI_CONSENT_NEEDED, e.getMessage());
        verify(ai, never()).complete(any(), anyInt(), any(), any());

        consent(writer, true);
        CircleService.Draft d = circles.preview(writer, slug, "오늘 너무 힘들었어요" + "가".repeat(10_000));
        assertEquals("ai", d.source());
        // OpenAI 로는 상한(1200자)까지만 간다
        verify(ai).complete(any(), anyInt(), any(), argThat(text -> text.length() <= CircleLogic.STORY_MAX + 10));
    }

    @Test void keeperDraftNeedsBothConsentsAndRunsOutsideATransaction() {
        String id = submit();
        consent(keeper, true);
        ApiException e = fails(() -> circles.draft(keeper, slug, id));
        assertEquals(CircleService.AUTHOR_AI_CONSENT_NEEDED, e.getMessage());
        verify(ai, never()).complete(any(), anyInt(), any(), any());

        consent(writer, true);
        consent(keeper, false);
        assertEquals(CircleService.AI_CONSENT_NEEDED, fails(() -> circles.draft(keeper, slug, id)).getMessage());

        consent(keeper, true);
        CircleService.Draft d = circles.draft(keeper, slug, id);
        assertEquals("ai", d.source());
        assertEquals("다듬은 사연이에요", jdbc.sql("SELECT ai_draft FROM submissions WHERE id=?").param(id).query(String.class).single());
    }

    @Test void aiUseHasAnHourlyLimit() {
        circles.setAiHourlyLimit(2);
        consent(writer, true);
        circles.preview(writer, slug, "첫 번째 사연이에요");
        circles.preview(writer, slug, "두 번째 사연이에요");
        assertEquals(429, fails(() -> circles.preview(writer, slug, "세 번째 사연이에요")).status());
    }

    @Test void blockedKeeperLosesKeeperPowers() {
        jdbc.sql("UPDATE users SET blocked_at = now() WHERE id=?").param(keeper.id()).update();
        DbUser blocked = reload(keeper.id());
        assertEquals(403, fails(() -> circles.members(blocked, slug)).status());
        assertEquals(403, fails(() -> circles.queue(blocked, slug, "pending")).status());
        assertEquals(403, fails(() -> circles.members(null, slug)).status());
    }

    @Test void keeperCannotUnhideReportedPostOrResetReports() {
        String id = submit();
        tx.execute(s -> circles.decide(keeper, slug, id, "publish", null, null, null));
        String postId = jdbc.sql("SELECT post_id FROM submissions WHERE id=?").param(id).query(String.class).single();
        jdbc.sql("INSERT INTO reports(id, reporter_id, target_kind, target_id, reason) VALUES (?, ?, 'post', ?, 'abuse')")
            .param(UUID.randomUUID().toString()).param(writer.id()).param(postId).update();
        // 운영진이 숨긴 상태
        jdbc.sql("UPDATE shout_posts SET hidden = TRUE WHERE id=?").param(postId).update();

        ApiException e = fails(() -> tx.execute(s -> circles.toggleHidden(keeper, slug, postId)));
        assertEquals(403, e.status());
        assertEquals(true, jdbc.sql("SELECT hidden FROM shout_posts WHERE id=?").param(postId).query(Boolean.class).single());

        // 지기가 숨기기만 하는 것은 되고, 신고 확인(reviewed_at)은 건드리지 않는다
        jdbc.sql("UPDATE shout_posts SET hidden = FALSE WHERE id=?").param(postId).update();
        Map<String, Object> out = tx.execute(s -> circles.toggleHidden(keeper, slug, postId));
        assertEquals(true, out.get("hidden"));
        assertEquals(true, jdbc.sql("SELECT reviewed_at IS NULL FROM shout_posts WHERE id=?").param(postId).query(Boolean.class).single());
    }

    @Test void anonymousAccountsCannotOpenCircles() {
        DbUser anon = user(true);
        ApiException e = fails(() -> tx.execute(s -> circles.create(anon, new CircleService.CreateInput("익명 소로우", "anon-circle", "rest", "", "open", "public", null, null, null))));
        assertEquals(401, e.status());
        assertEquals(CircleService.CREATE_NEEDS_ACCOUNT, e.getMessage());
        assertEquals(401, fails(() -> CircleService.requireRegisteredToCreate(null)).status());
    }

    @Test void cookielessReadsReturnEmptyLists() {
        Map<String, Object> mine = circles.mine(null);
        assertEquals(List.of(), mine.get("member"));
        assertEquals(List.of(), mine.get("listening"));
        assertEquals(List.of(), circles.mySubmissions(null));
    }

    @Test void membersOnlyCircleWithPostsCannotTurnPublic() {
        String id = submit();
        tx.execute(s -> circles.decide(keeper, slug, id, "publish", null, null, null));
        assertEquals(400, fails(() -> tx.execute(s -> circles.update(keeper, slug, Map.of("visibility", "public")))).status());
        assertEquals("members", circles.bySlug(slug).visibility());
    }
}
