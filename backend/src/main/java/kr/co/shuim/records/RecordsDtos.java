package kr.co.shuim.records;

import java.util.List;
import java.util.Map;

/** /api/records 요청·응답 모양. frontend/lib/storage.ts 의 타입과 같은 필드 이름(null 은 JSON 에서 빠진다) */
public final class RecordsDtos {
    private RecordsDtos() {}

    /** 기록 한 칸: 오늘 위치(-5~+5), 어제보다 변화, 한 줄 */
    public record Entry(Integer score, Integer delta, String note) {}

    /** 오늘 한 행동 */
    public record DayLog(List<String> did) {}

    public record Memo(String id, String cat, String text, Boolean pinned, Long createdAt, Long updatedAt) {}

    public record GoalStep(String id, String text, Boolean done) {}

    public record Goal(String id, String title, String cat, String why, List<GoalStep> steps, String due, Long createdAt, Long doneAt) {}

    public record ScheduleItem(String id, String date, String time, String title, String cat, Boolean done) {}

    /** 사용자가 추가한 기록 카테고리 (frontend/lib/categories.ts 의 Category) */
    public record Category(String id, String label, String emoji, String hint, String color) {}

    /** PUT /api/records/journal/{date}. 둘 다 선택: 없는 쪽은 그대로 둔다 */
    public record DayInput(Map<String, Entry> record, List<String> did) {}

    /** PUT /api/records/categories */
    public record CategoriesInput(List<Category> categories, List<String> order) {}

    /**
     * 전체 묶음. GET 응답이자 PUT /api/records(부분 교체)·POST /api/records/import(비어 있는 부분만 채움)의 본문.
     * journal 은 날짜 → (카테고리 id → Entry), log 는 날짜 → {did}.
     */
    public record Snapshot(
        Map<String, Map<String, Entry>> journal,
        Map<String, DayLog> log,
        List<Memo> memos,
        List<Goal> goals,
        List<ScheduleItem> schedule,
        List<Category> categories,
        List<String> order
    ) {}
}
