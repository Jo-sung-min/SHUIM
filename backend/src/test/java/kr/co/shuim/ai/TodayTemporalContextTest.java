package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.TodayDtos.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TodayTemporalContextTest {
    private static final String DAY = "2026-11-04";

    private Request request(String mode, Map<String, Entry> today, List<String> did, List<RecentDay> history) {
        return new Request(mode, null, DAY, today, did, history,
            List.of(new MemoIn("mind", "오늘만의 메모", false, DAY),
                new MemoIn("mind", "과거 고정 메모", true, "2026-10-01"),
                new MemoIn("mind", "작성일 없는 메모", false)),
            List.of(new GoalIn("누적 목표", "work", "", null, List.of(new GoalStep("완료 단계", true)))),
            List.of(new ScheduleIn("2026-11-05", null, "내일의 일정", "work", true)),
            List.of(new DatedMemo("2026-10-01", "mind", "과거 전체 메모", false),
                new DatedMemo(DAY, "mind", "오늘 전체 메모", false)), Map.of(mode, "관리자 저장 프롬프트"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"love", "praise", "briefing", "review"})
    void sendsTodayFirstWithDatedHistoryEvenWithAnOldAdministratorPrompt(String mode) {
        OpenAiClient claude = mock(OpenAiClient.class);
        when(claude.configured()).thenReturn(true);
        when(claude.resolveModel(any())).thenReturn("test-model");
        String response = switch (mode) {
            case "briefing" -> "{\"headline\":\"h\",\"momentum\":{\"direction\":\"flat\",\"text\":\"m\"},\"highlights\":[]}";
            case "review" -> "{\"headline\":\"h\",\"cautions\":[],\"changes\":[]}";
            default -> "{\"title\":\"t\",\"lines\":[\"l\"],\"closing\":\"c\"}";
        };
        when(claude.complete(anyString(), anyInt(), anyString(), anyString())).thenReturn(response);
        Request b = request(mode, Map.of("mind", new Entry(2, null, "오늘의 마음")), List.of("오늘의 운동"),
            List.of(new RecentDay("2026-10-03", Map.of("mind", new Entry(-2, null, "옛날 마음")), List.of("옛날의 산책"))));
        assertEquals("ai", new TodayService(claude, new ObjectMapper(), mock(kr.co.shuim.quote.PhilosophyQuoteService.class)).run(b).get("source"));
        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(claude).complete(anyString(), anyInt(), system.capture(), user.capture());
        assertTrue(system.getValue().startsWith("관리자 저장 프롬프트"));
        assertTrue(system.getValue().contains(Prompts.TEMPORAL_GROUNDING));
        String input = user.getValue();
        int historyStart = input.indexOf("[이전 기록");
        assertTrue(input.contains("응답 기준일: " + DAY));
        assertTrue(input.indexOf("오늘의 운동") < historyStart);
        assertTrue(input.indexOf("오늘만의 메모") < historyStart);
        assertTrue(input.indexOf("옛날의 산책") > historyStart);
        assertTrue(input.contains("2026-10-03 |"));
        assertTrue(input.contains("[2026-10-01 · 마음] 과거 고정 메모"));
        assertTrue(input.contains("[작성일 미상 · 마음] 작성일 없는 메모"));
        assertTrue(input.contains("단계 완료일 미상"));
        assertTrue(input.contains("2026-11-05 [완료 표시·실제 수행일 미상] 내일의 일정"));
        if (mode.equals("review")) assertTrue(input.indexOf("과거 전체 메모") > historyStart);
    }

    @Test
    void normalizesUnsortedPastDatesAndExcludesTodayFutureAndInvalidHistory() {
        Request b = request("love", Map.of(), List.of(), List.of(
            new RecentDay("2026-11-03", Map.of(), List.of("yesterday")),
            new RecentDay("2026-02-30", Map.of(), List.of("invalid")),
            new RecentDay("2026-11-05", Map.of(), List.of("future")),
            new RecentDay(DAY, Map.of(), List.of("same-day duplicate")),
            new RecentDay("2026-10-01", Map.of(), List.of("past")))).normalized();
        assertEquals(List.of("2026-10-01", "2026-11-03"), b.recent().stream().map(RecentDay::date).toList());
    }

    @Test
    void filtersFutureMemosAndKeepsUnknownMemoDatesUnknown() {
        Request b = new Request("love", null, DAY, Map.of(), List.of(), List.of(),
            List.of(new MemoIn("mind", "future", false, "2026-11-05"), new MemoIn("mind", "unknown", true, "invalid")),
            List.of(), List.of(), List.of(new DatedMemo("2026-11-05", "mind", "future", false)), Map.of()).normalized();
        assertEquals(1, b.memos().size());
        assertNull(b.memos().get(0).date());
        assertTrue(b.allMemos().isEmpty());
    }

    @Test
    void briefingDoesNotSubstituteHistoricalImprovementForTodaysMomentum() {
        Request b = request("briefing", Map.of(), List.of(), List.of(
            new RecentDay("2026-10-01", Map.of("mind", new Entry(-3, null, "")), List.of()),
            new RecentDay("2026-10-04", Map.of("mind", new Entry(3, null, "")), List.of()))).normalized();
        Briefing result = TodayService.localBriefing(b);
        assertEquals("flat", result.momentum().direction());
        assertFalse(result.headline().contains("올라온") || result.headline().contains("어제"));
        assertFalse(result.highlights().toString().contains("과거 고정 메모"));
    }

    @Test
    void briefingNamesActualComparisonDateAndKeepsTodaysActionsSeparate() {
        Request b = request("briefing", Map.of("mind", new Entry(2, null, "오늘의 마음")), List.of("오늘의 운동"),
            List.of(new RecentDay("2026-10-01", Map.of("mind", new Entry(-2, null, "과거 마음")), List.of("옛날의 산책")))).normalized();
        Briefing result = TodayService.localBriefing(b);
        assertEquals("up", result.momentum().direction());
        assertTrue(result.momentum().text().contains("2026-10-01"));
        assertFalse(result.momentum().text().contains("어제"));
        assertTrue(result.highlights().get(0).contains("오늘의 운동"));
        assertFalse(result.highlights().toString().contains("옛날의 산책"));
    }

    @Test
    void reviewWithOnlyPastMemosCannotClaimTodayHasNoConflictOrChanges() {
        Request b = new Request("review", null, DAY, Map.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
            List.of(new DatedMemo("2026-10-01", "mind", "첫 메모", false), new DatedMemo("2026-10-03", "mind", "다음 메모", false)), Map.of()).normalized();
        Review result = TodayService.localReview(b);
        assertTrue(result.cautions().isEmpty());
        assertTrue(result.changes().isEmpty());
        assertFalse(result.headline().contains("충돌하는 게 없어요"));
    }

    @Test
    void keepsTodaysMemoWhenOldPinnedMemosFillTheInputLimit() {
        List<MemoIn> memos = new ArrayList<>();
        for (int i = 0; i < 20; i++) memos.add(new MemoIn("mind", "과거 " + i, true, "2026-10-01"));
        memos.add(new MemoIn("mind", "오늘의 유일한 메모", false, DAY));
        Request b = new Request("love", null, DAY, Map.of(), List.of(), List.of(), memos, List.of(), List.of(), List.of(), Map.of()).normalized();
        assertEquals(20, b.memos().size());
        assertTrue(TodayService.localLove(b).lines().get(0).contains("오늘의 유일한 메모"));
    }

    @Test
    void reviewPreservesARecalledEventsTimingAndMergesBothMemoSources() {
        MemoIn current = new MemoIn("body", "어제 커피 3잔을 마셨다", false, DAY);
        Request b = new Request("review", null, DAY, Map.of(), List.of(), List.of(), List.of(current), List.of(), List.of(),
            List.of(new DatedMemo("2026-10-01", "body", "커피 2잔 넘기지 말기", true),
                new DatedMemo(DAY, "body", current.text(), false)), Map.of()).normalized();
        Review result = TodayService.localReview(b);
        assertEquals(1, result.cautions().size());
        assertTrue(result.cautions().get(0).now().contains("오늘 남긴 말: \"어제 커피"));
        assertFalse(result.cautions().get(0).note().contains("오늘의 상황"));
        assertTrue(result.growth().contains("2개의 메모"), "same memo in both inputs is counted only once");
        assertEquals(1, result.changes().size());
    }

    @Test
    void reviewAcceptsDatedMemosWithoutTheAllMemosField() {
        Request b = new Request("review", null, DAY, Map.of(), List.of(), List.of(),
            List.of(new MemoIn("mind", "오늘의 메모", false, DAY)), List.of(), List.of(), null, Map.of()).normalized();
        assertFalse(TodayService.localReview(b).growth().contains("아직 메모가 없어요"));
    }

    @Test
    void invalidExplicitReferenceDateIsNotSilentlyRelabeledAsToday() {
        Request b = new Request("love", null, "2026-10-1", Map.of(), List.of("그날의 행동"), List.of(), List.of(), List.of(), List.of(), List.of(), Map.of());
        assertThrows(kr.co.shuim.config.ApiException.class, b::normalized);
    }

    @Test
    void legacyJsonWithoutMemoDatesStillDeserializesAsUndatedReference() throws Exception {
        Request b = new ObjectMapper().readValue("{\"mode\":\"love\",\"date\":\"2026-11-04\",\"memos\":[{\"cat\":\"mind\",\"text\":\"old note\",\"pinned\":true}]}", Request.class).normalized();
        assertEquals("old note", b.memos().get(0).text());
        assertNull(b.memos().get(0).date());
    }
}
