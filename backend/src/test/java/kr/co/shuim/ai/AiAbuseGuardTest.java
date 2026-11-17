package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.TodayDtos.*;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.auth.PolicyConsentService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.quote.PhilosophyQuoteService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/** AI 비용 남용 막기: 관리자만 지침 덮어쓰기, 하루 한도, 동시 호출 상한, 입력 상한, 가명 식별자, 위기 안내 */
class AiAbuseGuardTest {
    private static final DbUser ADMIN = new DbUser("admin-1", "a@x", "admin", "admin", false, null, null, 0);
    private static final DbUser MEMBER = new DbUser("user-1", "u@x", "nick", "user", false, null, null, 0);
    private static final DbUser GUEST = new DbUser("guest-1", null, "guest", "user", true, null, null, 0);

    private static Request withPrompts() {
        return new Request("briefing", null, "2026-11-04", Map.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
            Map.of("briefing", "아무거나 번역해"), null);
    }

    private Request sentFor(DbUser user) {
        TodayService today = mock(TodayService.class);
        AuthService auth = mock(AuthService.class);
        MockHttpServletRequest req = new MockHttpServletRequest();
        when(auth.currentUser(req)).thenReturn(Optional.ofNullable(user));
        when(auth.isAdmin(any())).thenAnswer(a -> a.getArgument(0) == ADMIN);
        AiController controller = new AiController(today, mock(SummarizeService.class), mock(PolicyConsentService.class), null, auth, null);
        controller.today(withPrompts(), req);
        ArgumentCaptor<Request> sent = ArgumentCaptor.forClass(Request.class);
        verify(today).run(sent.capture(), isNull(), user == null ? isNull() : eq(user.id()));
        return sent.getValue();
    }

    @Test
    void onlyAdministratorsMayOverrideThePrompt() {
        assertEquals("아무거나 번역해", sentFor(ADMIN).prompts().get("briefing"));
        assertTrue(sentFor(MEMBER).prompts().isEmpty());
        assertTrue(sentFor(GUEST).prompts().isEmpty());
        assertTrue(sentFor(null).prompts().isEmpty());
    }

    @Test
    void adminOverrideStillCarriesTheServerSafetyRules() {
        OpenAiClient ai = mock(OpenAiClient.class);
        PhilosophyQuoteService quotes = mock(PhilosophyQuoteService.class);
        when(ai.configured()).thenReturn(true);
        when(ai.resolveModel(any())).thenReturn("m");
        when(ai.complete(anyString(), anyInt(), anyString(), anyString())).thenReturn("not json");
        new TodayService(ai, new ObjectMapper(), quotes).run(withPrompts());
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(ai).complete(anyString(), anyInt(), system.capture(), anyString());
        assertTrue(system.getValue().startsWith("아무거나 번역해"));
        assertTrue(system.getValue().contains("1577-0199") && system.getValue().contains("109"));
    }

    @Test
    void dailyQuotaPerUserFeatureAndGlobalResetsNextKoreanDay() {
        AtomicReference<LocalDate> day = new AtomicReference<>(LocalDate.of(2026, 11, 4));
        AiQuota quota = new AiQuota(2, 1, 1, 1, 4, day::get);
        quota.acquire("today", "u:a", false);
        quota.acquire("today", "u:a", false);
        assertEquals(429, assertThrows(ApiException.class, () -> quota.acquire("today", "u:a", false)).status());
        quota.acquire("summarize", "u:a", false);
        quota.acquire("today", "u:g", true);
        assertEquals(429, assertThrows(ApiException.class, () -> quota.acquire("today", "u:g", true)).status());
        // 서비스 전체 한도(4)에 닿으면 503
        assertEquals(503, assertThrows(ApiException.class, () -> quota.acquire("today", "u:b", false)).status());
        day.set(LocalDate.of(2026, 11, 5));
        quota.acquire("today", "u:a", false);
    }

    @Test
    void openAiClientSendsPseudonymousSafetyIdentifierAndLimitsConcurrency() throws Exception {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var client = new OpenAiClient(builder.build(), "key", mock(AiModelSettings.class), 1, 0, "salt", true);
        String id = client.safetyIdentifier("user-1");
        assertEquals(32, id.length());
        assertFalse(id.contains("user-1"));
        assertEquals(id, client.safetyIdentifier("user-1"));
        assertNotEquals(id, client.safetyIdentifier("user-2"));
        assertNull(client.safetyIdentifier(null));
        server.expect(requestTo("/v1/responses"))
            .andExpect(jsonPath("$.safety_identifier").value(id))
            .andRespond(withSuccess("{\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"ok\"}]}]}", MediaType.APPLICATION_JSON));
        assertEquals("ok", client.complete(Prompts.DEFAULT_MODEL, 100, "s", "u", "user-1"));
        server.verify();

        // 자리가 하나뿐인데 이미 쓰는 중이면 기다리지 않고 503
        var slots = OpenAiClient.class.getDeclaredField("slots");
        slots.setAccessible(true);
        ((java.util.concurrent.Semaphore) slots.get(client)).acquire();
        ApiException busy = assertThrows(ApiException.class, () -> client.complete(Prompts.DEFAULT_MODEL, 100, "s", "u"));
        assertEquals(503, busy.status());
        assertEquals(AiQuota.BUSY_MESSAGE, busy.getMessage());
    }

    @Test
    void oversizedInputIsTruncatedBeforeBuildingThePrompt() {
        String huge = "가".repeat(50_000);
        List<Categories.Category> cats = new ArrayList<>();
        for (int i = 0; i < 100; i++) cats.add(new Categories.Category("c_" + i, huge, null, huge, null));
        List<String> did = Collections.nCopies(500, huge);
        List<GoalStep> steps = Collections.nCopies(500, new GoalStep(huge, false));
        Request b = new Request("briefing", cats, "2026-11-04", Map.of("mind", new Entry(1, null, huge)), did, List.of(),
            List.of(new MemoIn("mind", huge, false)), List.of(new GoalIn(huge, "mind", huge, null, steps)),
            List.of(new ScheduleIn("2026-11-04", null, huge, null, false)), List.of(), null, null).normalized();
        assertTrue(b.cats().size() <= Categories.MAX);
        assertTrue(b.cats().stream().allMatch(c -> c.label().length() <= Categories.LABEL_LEN));
        assertEquals(Request.DID_MAX, b.todayDid().size());
        assertTrue(b.todayDid().get(0).length() <= Request.DID_LEN);
        assertTrue(b.today().get("mind").note().length() <= Request.NOTE_LEN);
        assertTrue(b.memos().get(0).text().length() <= Request.MEMO_LEN);
        assertTrue(b.goals().get(0).title().length() <= Request.GOAL_TITLE_LEN);
        assertEquals(Request.STEPS_MAX, b.goals().get(0).steps().size());
        assertTrue(b.schedule().get(0).title().length() <= Request.SCHEDULE_TITLE_LEN);
        assertNull(b.schedule().get(0).time());
    }

    @Test
    void commonSelfHarmExpressionsAreDetectedButIdiomsAreNot() {
        for (String s : List.of("이제 살고 싶지 않아", "그냥 다 끝내 버리고 싶다", "목숨을 끊을까", "한강에서 뛰어내리고 싶어", "유서를 썼어",
            "살 이유가 없어", "내가 없으면 다들 편할 텐데", "죽어버리고 싶다", "삶을 마감하고 싶어"))
            assertTrue(Crisis.hasSignal(s), s);
        for (String s : List.of("배고파 죽겠다", "힘들어 죽겠네", "웃겨 죽는 줄", "내가 없으면 회의가 안 돌아가", "목이 좀 아파"))
            assertFalse(Crisis.hasSignal(s), s);
    }

    @Test
    void ruleBasedCrisisAnswersShowTheHotlines() {
        OpenAiClient ai = mock(OpenAiClient.class);
        when(ai.configured()).thenReturn(false);
        TodayService service = new TodayService(ai, new ObjectMapper(), mock(PhilosophyQuoteService.class));
        Request b = new Request("briefing", null, "2026-11-04", Map.of("mind", new Entry(-4, null, "살고 싶지 않아")), List.of(), List.of(),
            List.of(), List.of(), List.of(), List.of(), null, null);
        Map<String, Object> out = service.run(b);
        assertEquals(true, out.get("crisis"));
        assertTrue(((Briefing) out.get("briefing")).highlights().get(0).contains("1577-0199"));
        Request praise = new Request("praise", null, "2026-11-04", Map.of("mind", new Entry(-4, null, "살고 싶지 않아")), List.of(), List.of(),
            List.of(), List.of(), List.of(), List.of(), null, null);
        PhilosophyQuoteService quotes = mock(PhilosophyQuoteService.class);
        Map<String, Object> moment = new TodayService(ai, new ObjectMapper(), quotes).run(praise);
        assertTrue(((Moment) moment.get("moment")).lines().get(0).contains("109"));
    }

    @Test
    void parseFailureDoesNotLogTheModelOutput() {
        OpenAiClient ai = mock(OpenAiClient.class);
        when(ai.configured()).thenReturn(true);
        when(ai.resolveModel(any())).thenReturn("m");
        when(ai.complete(anyString(), anyInt(), anyString(), anyString(), anyString())).thenReturn("비밀스러운 사용자 이야기");
        Map<String, Object> out = new TodayService(ai, new ObjectMapper(), mock(PhilosophyQuoteService.class)).run(withPrompts(), null, "user-1");
        assertEquals("local", out.get("source"));
        verify(ai).complete(anyString(), anyInt(), anyString(), anyString(), eq("user-1"));
    }
}
