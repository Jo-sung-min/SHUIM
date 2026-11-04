package kr.co.shuim.ai;

import kr.co.shuim.ai.SummarizeService.EntryDay;
import kr.co.shuim.ai.SummarizeService.Request;
import kr.co.shuim.ai.TodayDtos.Entry;
import kr.co.shuim.common.Dates;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SummarizeServiceTest {
    private final ClaudeClient claude = mock(ClaudeClient.class);
    private final SummarizeService service = new SummarizeService(claude);

    private static EntryDay day(String date, int score, String note) {
        return new EntryDay(date, Map.of("mind", new Entry(score, null, note)));
    }

    private void enableAi() {
        when(claude.configured()).thenReturn(true);
        when(claude.resolveModel(null)).thenReturn("test-model");
        when(claude.complete(eq("test-model"), eq(3000), anyString(), anyString())).thenReturn("기록의 흐름");
    }

    private String submittedContext() {
        var captured = ArgumentCaptor.forClass(String.class);
        verify(claude).complete(eq("test-model"), eq(3000), eq(Prompts.SUMMARY), captured.capture());
        return captured.getValue();
    }

    @Test
    void historicalRecordsHaveAnExplicitReferenceAndKeepTheirOriginalEventTiming() {
        enableAi();
        var result = service.run(new Request(List.of(
            day("2025-04-02", 0, "다음 주 면접 예정"),
            day("2025-04-01", -2, "어제 너무 힘들었음")), "mind", 7, null, "2026-11-04"));
        assertEquals("ai", result.get("source"));
        String input = submittedContext();
        assertTrue(input.contains("기준일: 2026-11-04"));
        assertTrue(input.contains("기록 날짜 범위: 2025-04-01 ~ 2025-04-02"));
        assertFalse(input.contains("최근 7일"), "old input must not be relabeled relative to today");
        assertTrue(input.contains("작성일이며 사건 발생일을 확정하지 않아"));
        assertTrue(input.contains("상대 시점은 해당 작성일을 기준으로 해석"));
        assertTrue(input.contains("과거 감정이 오늘도 이어진다거나 예정된 일을 이미 마쳤다고 추정하지 마"));
        assertTrue(input.contains("어제 너무 힘들었음"));
        assertTrue(input.contains("다음 주 면접 예정"));
        assertTrue(input.indexOf("2025-04-01 |") < input.indexOf("2025-04-02 |"));
    }

    @Test
    void legacyRequestsUseTheKoreanCurrentDateWithoutChangingTheRecordDates() {
        enableAi();
        String before = Dates.todayKey();
        service.run(new Request(List.of(day("2025-04-01", 1, "그날의 기록")), "mind", 7, null));
        String after = Dates.todayKey();
        String input = submittedContext();
        assertTrue(input.contains("기준일: " + before) || input.contains("기준일: " + after));
        assertTrue(input.contains("기록 날짜 범위: 2025-04-01 ~ 2025-04-01"));
    }

    @Test
    void localFallbackUsesChronologicalOrderAndNamesTheHistoricalRange() {
        when(claude.configured()).thenReturn(false);
        var result = service.run(new Request(List.of(day("2025-04-03", 2, "조금 편함"),
            day("2025-04-01", -3, "힘듦"), day("2025-04-02", 0, "차분함")), "mind", 7, null, "2026-11-04"));
        String summary = (String) result.get("summary");
        assertEquals("local", result.get("source"));
        assertTrue(summary.contains("2025-04-01 ~ 2025-04-03에 남긴 기록"));
        assertTrue(summary.contains("-3에서 2로, 올라오는 흐름"));
        assertFalse(summary.contains("오늘"));
        verify(claude, never()).complete(any(), anyInt(), any(), any());
    }

    @Test
    void theSixtyDayLimitKeepsTheLatestDatesEvenWhenInputIsReversed() {
        enableAi();
        var days = new ArrayList<EntryDay>();
        var first = LocalDate.of(2025, 1, 1);
        for (int i = 64; i >= 0; i--) days.add(day(first.plusDays(i).toString(), 0, "날짜별 기록"));
        service.run(new Request(days, "mind", 65, null, "2026-11-04"));
        String input = submittedContext();
        assertTrue(input.contains("기록 날짜 범위: 2025-01-06 ~ 2025-03-06"));
        assertFalse(input.contains("2025-01-05"));
        assertTrue(input.indexOf("2025-01-06 |") < input.indexOf("2025-03-06 |"));
        assertEquals(60, input.lines().filter(line -> line.contains(" | ")).count());
    }

    @Test
    void invalidRecordDatesCannotBecomeUndatedCurrentFacts() {
        enableAi();
        service.run(new Request(Arrays.asList(null, day(null, 1, "날짜 없음"), day("오늘", 1, "상대 날짜"),
            day("2026-02-30", 1, "없는 날짜"), day("2026-02-28", 1, "날짜 확인됨")), "mind", 7, null, "2026-11-04"));
        String input = submittedContext();
        assertTrue(input.contains("2026-02-28 |"));
        assertFalse(input.contains("날짜 없음"));
        assertFalse(input.contains("상대 날짜"));
        assertFalse(input.contains("없는 날짜"));
    }

    @Test
    void missingEvidenceOrInvalidReferenceNeverCallsTheModel() {
        for (String date : List.of("", "오늘", "2026-02-30", "2026-1-2")) {
            var request = new Request(List.of(day("2026-01-02", 1, "기록")), "mind", 7, null, date);
            assertEquals(400, assertThrows(ApiException.class, () -> service.run(request)).status());
        }
        assertEquals(400, assertThrows(ApiException.class, () -> service.run(null)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.run(new Request(
            List.of(day("날짜 없음", 1, "기록")), "mind", 7, null, "2026-11-04"))).status());
        var empty = service.run(new Request(List.of(new EntryDay("2026-11-04", Map.of())), "mind", 7, null, "2026-11-04"));
        assertEquals("local", empty.get("source"));
        verifyNoInteractions(claude);
    }

    @Test
    void providerFailureKeepsTheSameHistoricalScopeInTheLocalFallback() {
        enableAi();
        when(claude.complete(anyString(), anyInt(), anyString(), anyString())).thenThrow(new IllegalStateException("test failure"));
        var result = service.run(new Request(List.of(day("2025-04-02", 2, "회복"),
            day("2025-04-01", -1, "힘듦")), "mind", 7, null, "2026-11-04"));
        assertEquals("local", result.get("source"));
        assertTrue(((String) result.get("summary")).contains("2025-04-01 ~ 2025-04-02에 남긴 기록"));
        assertTrue(((String) result.get("summary")).contains("-1에서 2로, 올라오는 흐름"));
    }
}
