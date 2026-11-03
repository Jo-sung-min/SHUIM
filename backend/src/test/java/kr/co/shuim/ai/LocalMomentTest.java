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
    void praiseGoesComfortThenEmpathyThenPraise() {
        Moment m = TodayService.localPraise(req("praise", RECENT, List.of("운동")));
        assertEquals(3, m.lines().size(), "딱 3문단: " + m.lines());
        for (String l : m.lines()) {
            assertTrue(sentences(l) >= 3, "문단마다 길게(3문장 이상): " + l);
            assertFalse(l.endsWith("요."), "반말이어야 해: " + l);
            assertFalse(l.contains("최고") || l.contains("대단한 거야") || l.contains("박수"), "억지로 띄우지 않기: " + l);
        }
        assertTrue(m.lines().get(0).contains("불안함") && m.lines().get(0).contains("괜찮아"), "① 힘든 날을 짚으며 위로: " + m.lines().get(0));
        assertTrue(m.lines().get(1).contains("올라온 날"), "② 다시 올라온 날을 알아주는 공감: " + m.lines().get(1));
        assertTrue(m.lines().get(2).contains("운동"), "③ 해낸 행동을 칭찬: " + m.lines().get(2));
        assertFalse(m.closing().contains("=="));
    }

    @Test
    void praiseStillHasThreeThemesWithNoRecords() {
        Moment m = TodayService.localPraise(req("praise", List.of(), List.of()));
        assertEquals(3, m.lines().size());
        assertTrue(m.lines().get(0).contains("손대기 힘들 만큼 지쳐"), "기록이 없으면 부족이 아니라 지침으로 읽는다: " + m.lines().get(0));
        for (String l : m.lines()) assertFalse(l.contains("기록이 많지") || l.contains("기록이 적"), "기록이 부족하다는 말 금지: " + l);
        assertTrue(m.lines().get(2).contains("칭찬받기를 눌렀다는"));
    }

    @Test
    void loveGoesEmpathyThenComfortThenLove() {
        Moment m = TodayService.localLove(req("love", RECENT, List.of()));
        assertEquals(3, m.lines().size(), "딱 3문단: " + m.lines());
        assertTrue(m.title().contains("자격"));
        for (String l : m.lines()) {
            assertTrue(sentences(l) >= 3, "문단마다 길게(3문장 이상): " + l);
            assertFalse(l.contains("해봐") || l.contains("해 봐") || l.contains("해보는"), "조언 금지: " + l);
            assertFalse(l.endsWith("요."), "반말이어야 해: " + l);
        }
        assertTrue(m.lines().get(0).contains("불안함") && m.lines().get(0).contains("힘들었겠구나"), "① 기록 속 마음 메모를 짚으며 공감: " + m.lines().get(0));
        assertTrue(m.lines().get(1).contains("자책하지 않아도"), "② 위로: " + m.lines().get(1));
        assertTrue(m.lines().get(2).contains("사랑받을 자격"), "③ 조건 없는 사랑: " + m.lines().get(2));
    }

    @Test
    void loveStillHasThreeParagraphsWithNoRecords() {
        Moment m = TodayService.localLove(req("love", List.of(), List.of()));
        assertEquals(3, m.lines().size());
        assertTrue(m.lines().get(0).contains("손대기 힘들 만큼 지쳤구나"), "기록이 없으면 부족이 아니라 지침으로 읽는다: " + m.lines().get(0));
        for (String l : m.lines()) assertFalse(l.contains("기록이 많지") || l.contains("기록이 적"), "기록이 부족하다는 말 금지: " + l);
        assertTrue(m.lines().get(1).contains("네 잘못이 아니야"));
    }
}
