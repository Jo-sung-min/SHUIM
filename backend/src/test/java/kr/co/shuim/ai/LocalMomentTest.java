package kr.co.shuim.ai;

import kr.co.shuim.ai.TodayDtos.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** AI 키가 없을 때의 칭찬받기·사랑받기: 반말, 넉넉한 칭찬, 조건 없는 사랑(조언·숙제 없음) */
class LocalMomentTest {
    private static Request req(String mode, List<RecentDay> recent, List<String> todayDid) {
        return new Request(mode, null, "2026-10-26", Map.of(), todayDid, recent, List.of(), List.of(), List.of(), List.of(), Map.of()).normalized();
    }

    private static final List<RecentDay> RECENT = List.of(
        new RecentDay("2026-10-24", Map.of("mind", new Entry(-3, null, "불안함")), List.of("산책")),
        new RecentDay("2026-10-25", Map.of("mind", new Entry(0, null, "조금 괜찮아짐")), List.of("일찍 잠"))
    );

    private static long sentences(String s) {
        return s.chars().filter(ch -> ch == '.').count();
    }

    @Test
    void praiseIsThreeLongGentleThemes() {
        Moment m = TodayService.localPraise(req("praise", RECENT, List.of("운동")));
        assertEquals(3, m.lines().size(), "주제는 딱 3개: " + m.lines());
        for (String l : m.lines()) {
            assertTrue(sentences(l) >= 3, "주제마다 길게(3문장 이상): " + l);
            assertFalse(l.endsWith("요."), "반말이어야 해: " + l);
            assertFalse(l.contains("최고") || l.contains("대단한 거야") || l.contains("박수"), "억지로 띄우지 않기: " + l);
        }
        assertTrue(m.lines().get(0).contains("운동"), "해낸 행동을 짚는다");
        assertTrue(m.lines().get(1).contains("불안함"), "힘든 날의 기록을 짚는다");
        assertFalse(m.closing().contains("=="));
    }

    @Test
    void praiseStillHasThreeThemesWithNoRecords() {
        Moment m = TodayService.localPraise(req("praise", List.of(), List.of()));
        assertEquals(3, m.lines().size());
        assertTrue(m.lines().get(2).contains("칭찬받기를 눌렀다는"));
    }

    @Test
    void loveIsUnconditionalWithoutAdvice() {
        Moment m = TodayService.localLove(req("love", RECENT, List.of()));
        assertTrue(m.lines().size() >= 3 && m.lines().size() <= 5, m.lines().toString());
        assertTrue(m.title().contains("사랑해"));
        for (String l : m.lines()) {
            assertFalse(l.contains("해봐") || l.contains("해 봐") || l.contains("해보는"), "조언 금지: " + l);
            assertFalse(l.endsWith("요."), "반말이어야 해: " + l);
        }
        assertTrue(m.lines().stream().anyMatch(l -> l.contains("불안함")), "기록 속 마음 메모를 짚는다");
    }
}
