package kr.co.shuim.records;

import kr.co.shuim.records.RecordsDtos.*;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** 저장 전 정리가 DB 제약(점수 범위, 컬럼 길이, 날짜 형식)을 지키는지 */
class RecordsLogicTest {
    @Test
    void dayScoresAreClampedAndEmptyCellsDropped() {
        Map<String, Entry> in = new LinkedHashMap<>();
        in.put("mind", new Entry(9, -7, " 불안함 "));
        in.put("c_abc12", new Entry(2, null, null));
        in.put("body", new Entry(null, 1, "점수 없음"));
        in.put("bad cat!", new Entry(1, null, ""));
        Map<String, Entry> out = RecordsLogic.cleanDay(in);
        assertEquals(List.of("mind", "c_abc12"), new ArrayList<>(out.keySet()));
        assertEquals(new Entry(5, -5, "불안함"), out.get("mind"));
        assertEquals(new Entry(2, null, ""), out.get("c_abc12"));
    }

    @Test
    void didIsTrimmedDedupedAndCapped() {
        assertEquals(List.of("산책", "운동"), RecordsLogic.cleanDid(Arrays.asList(" 산책 ", "", null, "산책", "운동")));
    }

    @Test
    void memosNeedIdAndTextAndUnknownCatBecomesEtc() {
        List<Memo> out = RecordsLogic.cleanMemos(List.of(
            new Memo("m1", "money", "주식은 저녁에만", null, 1000L, null),
            new Memo("m1", "work", "같은 id", true, 2000L, 2000L),
            new Memo("", "mind", "id 없음", false, 1L, 1L),
            new Memo("m2", "???", "  ", false, 1L, 1L),
            new Memo("m3", "nope cat", "기타로", true, 3L, 4L)
        ));
        assertEquals(2, out.size());
        assertEquals(new Memo("m1", "money", "주식은 저녁에만", false, 1000L, 1000L), out.get(0));
        assertEquals(new Memo("m3", "etc", "기타로", true, 3L, 4L), out.get(1));
    }

    @Test
    void goalsCutTitleAndValidateDue() {
        String longTitle = "가".repeat(80);
        Goal g = RecordsLogic.cleanGoals(List.of(new Goal("g1", longTitle, "work", null,
            List.of(new GoalStep("s1", "이력서", true), new GoalStep("s1", "중복", false), new GoalStep("s2", "", false)), "2026-13-40", null, null))).get(0);
        assertEquals(60, g.title().length());
        assertEquals("", g.why());
        assertNull(g.due());
        assertNotNull(g.createdAt());
        assertEquals(1, g.steps().size());
        assertTrue(g.steps().get(0).done());
    }

    @Test
    void scheduleNeedsDateAndNormalizesTime() {
        List<ScheduleItem> out = RecordsLogic.cleanSchedule(List.of(
            new ScheduleItem("s1", "2026-10-21", "9:5", "형식 나쁜 시간", "body", null),
            new ScheduleItem("s2", "2026-10-21", "19:00", "저녁 산책", "body", true),
            new ScheduleItem("s3", "10/21", null, "날짜 나쁨", "etc", false)
        ));
        assertEquals(2, out.size());
        assertNull(out.get(0).time());
        assertEquals("19:00", out.get(1).time());
        assertTrue(out.get(1).done());
    }

    @Test
    void onlyCustomCategoriesAreKeptAndCapped() {
        List<Category> in = new ArrayList<>();
        in.add(new Category("mind", "마음", "🫧", "", "var(--c-mind)"));
        for (int i = 0; i < 7; i++) in.add(new Category("c_k" + i, "취미" + i, null, null, null));
        List<Category> out = RecordsLogic.cleanCategories(in);
        assertEquals(RecordsLogic.CUSTOM_MAX, out.size());
        assertEquals("c_k0", out.get(0).id());
        assertEquals("📌", out.get(0).emoji());
        assertEquals("var(--c-etc)", out.get(0).color());
    }

    @Test
    void journalDropsBadDatesAndEmptyDays() {
        Map<String, Map<String, Entry>> in = new HashMap<>();
        in.put("2026-10-20", Map.of("mind", new Entry(1, null, "")));
        in.put("2026-10-21", Map.of("mind", new Entry(null, null, "")));
        in.put("oops", Map.of("mind", new Entry(1, null, "")));
        assertEquals(Set.of("2026-10-20"), RecordsLogic.cleanJournal(in).keySet());
        assertEquals(List.of("mind"), RecordsLogic.cleanOrder(Arrays.asList("mind", "mind", "bad id", null)));
    }
}
