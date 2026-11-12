package kr.co.shuim.ai;

import kr.co.shuim.ai.Categories.Category;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Comparator;
import java.time.LocalDate;

/** /api/today 요청·응답 모양 (frontend/lib/today-context.ts 와 lib/storage.ts 의 타입) */
public final class TodayDtos {
    private TodayDtos() {}

    public record Entry(Integer score, Integer delta, String note) {}

    public record RecentDay(String date, Map<String, Entry> record, List<String> did) {}

    public record MemoIn(String cat, String text, Boolean pinned, String date) {
        public MemoIn(String cat, String text, Boolean pinned) { this(cat, text, pinned, null); }
    }

    public record GoalStep(String text, Boolean done) {}

    public record GoalIn(String title, String cat, String why, String due, List<GoalStep> steps) {}

    public record ScheduleIn(String date, String time, String title, String cat, Boolean done) {}

    public record DatedMemo(String date, String cat, String text, Boolean pinned) {}

    public record Request(String mode, List<Category> categories, String date, Map<String, Entry> today, List<String> todayDid,
                          List<RecentDay> recent, List<MemoIn> memos, List<GoalIn> goals, List<ScheduleIn> schedule,
                          List<DatedMemo> allMemos, Map<String, String> prompts, String companion) {

        /** 정리·칭찬·사랑의 화자 이름 (사용자가 지어 준 모루의 이름). 비었거나 이상하면 "모루" */
        static String companionName(String raw) {
            if (raw == null) return "모루";
            String name = raw.codePoints().filter(c -> !Character.isISOControl(c) && c != '"' && c != '\\')
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString().strip();
            if (name.isEmpty()) return "모루";
            return name.codePointCount(0, name.length()) > Prompts.COMPANION_MAX ? name.substring(0, name.offsetByCodePoints(0, Prompts.COMPANION_MAX)) : name;
        }

        /** 비어 있는 값은 기본값으로, 목록은 서버가 감당할 길이로 자른다 */
        public Request normalized() {
            if (date != null && !validDate(date)) throw kr.co.shuim.config.ApiException.badRequest("기준 날짜를 다시 확인해 주세요");
            String day = date == null ? kr.co.shuim.common.Dates.todayKey() : date;
            List<RecentDay> r = recent == null ? List.of() : recent.stream().filter(x -> x != null && validDate(x.date()) && x.date().compareTo(day) < 0)
                .sorted(Comparator.comparing(RecentDay::date))
                .map(x -> new RecentDay(x.date(), x.record() == null ? Map.of() : clean(x.record()), x.did() == null ? List.of() : x.did())).toList();
            if (r.size() > 7) r = r.subList(r.size() - 7, r.size());
            List<MemoIn> m = memos == null ? List.of() : memos.stream().filter(x -> x != null && x.text() != null)
                .filter(x -> !validDate(x.date()) || x.date().compareTo(day) <= 0)
                .map(x -> new MemoIn(x.cat(), x.text(), x.pinned(), validDate(x.date()) ? x.date() : null))
                .sorted(Comparator.comparing((MemoIn x) -> !day.equals(x.date())))
                .toList();
            if (m.size() > 20) m = m.subList(0, 20);
            List<GoalIn> g = goals == null ? List.of() : goals.stream().filter(x -> x != null && x.title() != null)
                .map(x -> new GoalIn(x.title(), x.cat(), x.why() == null ? "" : x.why(), x.due(), x.steps() == null ? List.of() : x.steps().stream().filter(s -> s != null && s.text() != null).toList())).toList();
            if (g.size() > 8) g = g.subList(0, 8);
            List<ScheduleIn> s = schedule == null ? List.of() : schedule.stream().filter(x -> x != null && x.title() != null).toList();
            if (s.size() > 20) s = s.subList(0, 20);
            List<DatedMemo> all = allMemos == null ? List.of() : allMemos.stream().filter(x -> x != null && x.text() != null && validDate(x.date()) && x.date().compareTo(day) <= 0)
                .sorted(Comparator.comparing(DatedMemo::date)).toList();
            if (all.size() > 300) all = all.subList(all.size() - 300, all.size());
            String md = "praise".equals(mode) || "love".equals(mode) || "review".equals(mode) ? mode : "briefing";
            return new Request(md, Categories.of(categories), day,
                today == null ? Map.of() : clean(today), todayDid == null ? List.of() : todayDid, r, m, g, s, all, prompts == null ? Map.of() : prompts,
                companionName(companion));
        }

        private static boolean validDate(String value) {
            if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
            try { return LocalDate.parse(value).toString().equals(value); }
            catch (java.time.DateTimeException e) { return false; }
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
