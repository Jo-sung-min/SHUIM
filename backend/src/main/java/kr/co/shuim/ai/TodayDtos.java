package kr.co.shuim.ai;

import kr.co.shuim.ai.Categories.Category;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** /api/today 요청·응답 모양 (frontend/app/page.tsx 의 buildPayload 와 lib/storage.ts 의 타입) */
public final class TodayDtos {
    private TodayDtos() {}

    public record Entry(Integer score, Integer delta, String note) {}

    public record RecentDay(String date, Map<String, Entry> record, List<String> did) {}

    public record MemoIn(String cat, String text, Boolean pinned) {}

    public record GoalStep(String text, Boolean done) {}

    public record GoalIn(String title, String cat, String why, String due, List<GoalStep> steps) {}

    public record ScheduleIn(String date, String time, String title, String cat, Boolean done) {}

    public record DatedMemo(String date, String cat, String text, Boolean pinned) {}

    public record Request(String mode, List<Category> categories, String date, Map<String, Entry> today, List<String> todayDid,
                          List<RecentDay> recent, List<MemoIn> memos, List<GoalIn> goals, List<ScheduleIn> schedule,
                          List<DatedMemo> allMemos, Map<String, String> prompts) {

        /** 비어 있는 값은 기본값으로, 목록은 서버가 감당할 길이로 자른다 */
        public Request normalized() {
            List<RecentDay> r = recent == null ? List.of() : recent.stream().filter(x -> x != null && x.date() != null)
                .map(x -> new RecentDay(x.date(), x.record() == null ? Map.of() : clean(x.record()), x.did() == null ? List.of() : x.did())).toList();
            if (r.size() > 7) r = r.subList(r.size() - 7, r.size());
            List<MemoIn> m = memos == null ? List.of() : memos.stream().filter(x -> x != null && x.text() != null).toList();
            if (m.size() > 20) m = m.subList(0, 20);
            List<GoalIn> g = goals == null ? List.of() : goals.stream().filter(x -> x != null && x.title() != null)
                .map(x -> new GoalIn(x.title(), x.cat(), x.why() == null ? "" : x.why(), x.due(), x.steps() == null ? List.of() : x.steps().stream().filter(s -> s != null && s.text() != null).toList())).toList();
            if (g.size() > 8) g = g.subList(0, 8);
            List<ScheduleIn> s = schedule == null ? List.of() : schedule.stream().filter(x -> x != null && x.title() != null).toList();
            if (s.size() > 20) s = s.subList(0, 20);
            List<DatedMemo> all = allMemos == null ? List.of() : allMemos.stream().filter(x -> x != null && x.text() != null && x.date() != null).toList();
            if (all.size() > 300) all = all.subList(all.size() - 300, all.size());
            String md = "praise".equals(mode) || "love".equals(mode) || "review".equals(mode) ? mode : "briefing";
            return new Request(md, Categories.of(categories), date == null ? kr.co.shuim.common.Dates.todayKey() : date,
                today == null ? Map.of() : clean(today), todayDid == null ? List.of() : todayDid, r, m, g, s, all, prompts == null ? Map.of() : prompts);
        }

        private static Map<String, Entry> clean(Map<String, Entry> in) {
            Map<String, Entry> out = new LinkedHashMap<>();
            for (var e : in.entrySet()) if (e.getValue() != null && e.getValue().score() != null) out.put(e.getKey(), e.getValue());
            return out;
        }

        public List<Category> cats() { return categories; }
    }

    /* ---------- 응답 ---------- */

    public record Momentum(String direction, String text) {}

    public record TodayInfo(String schedule, String goals) {}

    public record Briefing(String headline, Momentum momentum, List<String> highlights, TodayInfo today, String nextStep, String question) {}

    public record Moment(String title, List<String> lines, String closing) {}

    public record Caution(String past, String now, String note) {}

    public record Review(String headline, List<Caution> cautions, List<String> changes, String growth, String question) {}

    static <T> List<T> head(List<T> list, int n) {
        return list.size() <= n ? list : new ArrayList<>(list.subList(0, n));
    }
}
