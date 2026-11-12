package kr.co.shuim.ai;

import kr.co.shuim.ai.TodayDtos.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Local fallback keeps today's facts separate from historical context. */
class LocalMomentTest {
    private static Request req(String mode, Map<String, Entry> today, List<RecentDay> recent, List<String> todayDid) {
        return new Request(mode, null, "2026-11-04", today, todayDid, recent, List.of(), List.of(), List.of(), List.of(), Map.of(), null).normalized();
    }

    private static final List<RecentDay> RECENT = List.of(
        new RecentDay("2026-10-24", Map.of("mind", new Entry(-3, null, "오래전 불안했던 일")), List.of("오래전 산책")),
        new RecentDay("2026-10-25", Map.of("mind", new Entry(-1, null, "지난날의 걱정")), List.of("예전에 일찍 잠"))
    );

    private static void assertThreeWarmParagraphs(Moment m) {
        assertEquals(3, m.lines().size());
        for (String line : m.lines()) {
            assertTrue(line.chars().filter(ch -> ch == '.').count() >= 3, line);
            assertFalse(line.endsWith("요."), line);
            assertFalse(line.contains("해 봐") || line.contains("해보는"), line);
        }
        assertFalse(m.closing().contains("=="));
    }

    @Test
    void praiseFocusesOnTodaysActionWithoutMixingPreviousActions() {
        Moment m = TodayService.localPraise(req("praise", Map.of(), RECENT, List.of("오늘 운동")));
        assertThreeWarmParagraphs(m);
        assertTrue(m.lines().get(0).contains("오늘 운동"));
        assertTrue(m.lines().get(2).contains("오늘 운동"));
        assertFalse(m.toString().contains("오래전 산책") || m.toString().contains("예전에 일찍 잠"));
        assertFalse(m.toString().contains("오래전 불안했던 일"));
    }

    @Test
    void loveStartsWithTodayAndDatesRelatedHistory() {
        Moment m = TodayService.localLove(req("love", Map.of("mind", new Entry(3, null, "오늘은 마음이 편안해")), RECENT, List.of("책 읽기")));
        assertThreeWarmParagraphs(m);
        assertTrue(m.title().contains("자격"));
        assertTrue(m.lines().get(0).contains("오늘은 마음이 편안해"));
        assertTrue(m.lines().get(0).contains("책 읽기"));
        assertFalse(m.lines().get(0).contains("걱정") || m.lines().get(0).contains("불안"));
        assertTrue(m.lines().get(1).contains("2026-10-25"));
        assertTrue(m.lines().get(1).contains("지난날의 걱정"));
        assertTrue(m.lines().get(2).contains("사랑받을 자격"));
    }

    @Test
    void noTodayEvidenceDoesNotInferExhaustionOrReusePastEvents() {
        for (String mode : List.of("praise", "love")) {
            for (List<RecentDay> history : List.of(RECENT, List.<RecentDay>of())) {
                Request b = req(mode, Map.of(), history, List.of());
                Moment m = mode.equals("love") ? TodayService.localLove(b) : TodayService.localPraise(b);
                assertThreeWarmParagraphs(m);
                assertFalse(m.toString().contains("지쳤구나") || m.toString().contains("손대기 힘들"));
                assertFalse(m.toString().contains("오래전") || m.toString().contains("지난날의 걱정"));
                assertFalse(m.toString().contains("기록이 적") || m.toString().contains("기록이 많지"));
            }
        }
    }

    @Test
    void companionNameIsTrimmedAndFallsBackToMoru() {
        assertEquals("모루", TodayDtos.Request.companionName(null));
        assertEquals("모루", TodayDtos.Request.companionName("  \n "));
        assertEquals("콩이", TodayDtos.Request.companionName(" 콩\"이\n"));
        assertEquals(20, TodayDtos.Request.companionName("가".repeat(40)).length());
    }

    @Test
    void localLoveUsesTodaysMemoEvenWhenNoDailyScoreExists() {
        Request b = new Request("love", null, "2026-11-04", Map.of(), List.of(), RECENT,
            List.of(new MemoIn("mind", "오늘 메모 속 이야기", false, "2026-11-04"),
                new MemoIn("mind", "옛날 고정 메모", true, "2026-10-01")),
            List.of(), List.of(), List.of(), Map.of(), null).normalized();
        Moment m = TodayService.localLove(b);
        assertTrue(m.lines().get(0).contains("오늘 메모 속 이야기"));
        assertFalse(m.toString().contains("옛날 고정 메모"));
    }
}
