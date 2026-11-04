package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.TodayDtos.*;
import kr.co.shuim.quote.PhilosophyQuoteService;
import kr.co.shuim.quote.PhilosophyQuoteService.Quote;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TodayPhilosophyTest {
    private final ClaudeClient claude = mock(ClaudeClient.class);
    private final PhilosophyQuoteService quotes = mock(PhilosophyQuoteService.class);
    private final TodayService service = new TodayService(claude, new ObjectMapper(), quotes);
    private static final Quote QUOTE = new Quote("q-one", "작은 시작에도 삶의 방향이 담길 수 있다.", "고전의 저자",
        "고전의 한 장", "https://example.org/classic", "작은 실천", "paraphrase", true, 1L, 1, 2);

    private Request request(String mode, String note) {
        return new Request(mode, null, "2026-11-04", Map.of("mind", new Entry(2, null, note)), List.of("오늘 산책"),
            List.of(new RecentDay("2026-11-01", Map.of("mind", new Entry(-1, null, "과거의 걱정")), List.of())),
            List.of(), List.of(), List.of(), List.of(), Map.of(mode, "관리자 말투 지침"));
    }

    private void configureAi(String mode) {
        when(claude.configured()).thenReturn(true);
        when(claude.resolveModel(any())).thenReturn("test-model");
        String answer = switch (mode) {
            case "briefing" -> "{\"headline\":\"h\",\"momentum\":{\"text\":\"m\",\"direction\":\"flat\"},\"highlights\":[]}";
            case "review" -> "{\"headline\":\"h\",\"cautions\":[],\"changes\":[]}";
            default -> "{\"title\":\"t\",\"lines\":[\"공감\",\"위로\",\"사랑\"],\"closing\":\"c\",\"quote\":{\"author\":\"가짜 저자\"}}";
        };
        when(claude.complete(anyString(), anyInt(), anyString(), anyString())).thenReturn(answer);
    }

    @ParameterizedTest
    @ValueSource(strings = {"love", "praise"})
    void chosenReferenceIsSeparateFromTodayAndOverridesCannotRemoveGrounding(String mode) {
        configureAi(mode);
        when(quotes.randomApproved()).thenReturn(Optional.of(QUOTE));
        Map<String, Object> result = service.run(request(mode, "오늘은 마음이 편안해"));
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claude).complete(anyString(), anyInt(), system.capture(), user.capture());
        assertTrue(system.getValue().startsWith("관리자 말투 지침"));
        assertTrue(system.getValue().contains(Prompts.TEMPORAL_GROUNDING));
        assertTrue(system.getValue().contains("사용자의 기록과도 구분해"));
        assertTrue(system.getValue().contains("정확한 발언처럼 따옴표로 직접 인용하지 마"));
        assertTrue(system.getValue().contains("기존 3문단 순서와 JSON 형식"));
        assertTrue(user.getValue().contains(QUOTE.text()));
        assertTrue(user.getValue().indexOf("오늘 산책") < user.getValue().indexOf("[함께 읽을 철학 문장"));
        assertEquals("ai", result.get("source"));
        Map<?, ?> reference = (Map<?, ?>) result.get("quote");
        assertEquals(QUOTE.id(), reference.get("id"));
        assertEquals(QUOTE.author(), reference.get("author"), "metadata comes from the reviewed DB entry, not model output");
        assertFalse(reference.containsKey("reviewedAt") || reference.containsKey("reviewed_by"));
        verify(quotes, times(1)).randomApproved();
    }

    @ParameterizedTest
    @ValueSource(strings = {"briefing", "review"})
    void otherModesDoNotSelectOrReceivePhilosophyQuotes(String mode) {
        configureAi(mode);
        Map<String, Object> result = service.run(request(mode, "오늘의 기록"));
        assertEquals("ai", result.get("source"));
        assertFalse(result.containsKey("quote"));
        verifyNoInteractions(quotes);
    }

    @Test
    void noApprovedQuotePreservesTheExistingAnswerWithoutInventingAReference() {
        configureAi("love");
        when(quotes.randomApproved()).thenReturn(Optional.empty());
        Map<String, Object> result = service.run(request("love", "오늘의 기록"));
        assertFalse(result.containsKey("quote"));
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claude).complete(anyString(), anyInt(), anyString(), user.capture());
        assertFalse(user.getValue().contains("[함께 읽을 철학 문장"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"love", "praise"})
    void localFallbackUsesTheSameReviewedReferenceAndKeepsTodaysFacts(String mode) {
        when(quotes.randomApproved()).thenReturn(Optional.of(QUOTE));
        Map<String, Object> result = service.run(request(mode, "오늘의 마음"));
        assertEquals("local", result.get("source"));
        Moment moment = (Moment) result.get("moment");
        assertEquals(3, moment.lines().size());
        assertTrue(moment.lines().get(0).contains("오늘 산책"));
        assertTrue(moment.lines().get(1).contains("풀어 쓴 문장"));
        assertTrue(moment.lines().get(1).contains(QUOTE.text()));
        assertFalse(moment.lines().get(0).contains(QUOTE.text()));
        verify(claude, never()).complete(anyString(), anyInt(), anyString(), anyString());
    }

    @Test
    void failedModelRequestDoesNotSelectASecondUnrelatedReference() {
        configureAi("love");
        when(quotes.randomApproved()).thenReturn(Optional.of(QUOTE));
        when(claude.complete(anyString(), anyInt(), anyString(), anyString())).thenThrow(new IllegalStateException("test provider failure"));
        Map<String, Object> result = service.run(request("love", "오늘의 기록"));
        assertEquals("local", result.get("source"));
        assertEquals(QUOTE.id(), ((Map<?, ?>) result.get("quote")).get("id"));
        verify(quotes, times(1)).randomApproved();
    }

    @Test
    void eachNewGenerationSelectsFromTheCurrentApprovedPool() {
        Quote next = new Quote("q-two", "지금의 자신에게도 다정할 수 있다.", QUOTE.author(), QUOTE.source(), QUOTE.sourceUrl(),
            "자기 수용", "paraphrase", true, 2L, 2, 3);
        when(quotes.randomApproved()).thenReturn(Optional.of(QUOTE), Optional.of(next));
        Map<String, Object> first = service.run(request("love", "오늘의 기록"));
        Map<String, Object> second = service.run(request("love", "오늘의 기록"));
        assertEquals("q-one", ((Map<?, ?>) first.get("quote")).get("id"));
        assertEquals("q-two", ((Map<?, ?>) second.get("quote")).get("id"));
        verify(quotes, times(2)).randomApproved();
    }

    @Test
    void crisisSupportIsNotDisplacedByARandomPhilosophicalMessage() {
        Map<String, Object> result = service.run(request("love", "죽고 싶다"));
        assertEquals(true, result.get("crisis"));
        assertFalse(result.containsKey("quote"));
        verifyNoInteractions(quotes);
    }
}
