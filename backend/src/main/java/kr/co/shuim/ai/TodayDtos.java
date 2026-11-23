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
                          List<DatedMemo> allMemos, Map<String, String> prompts, String companion,
                          String companionAppearance, Integer companionAffinity) {

        /** Existing callers that only know the companion's display name. */
        public Request(String mode, List<Category> categories, String date, Map<String, Entry> today, List<String> todayDid,
                       List<RecentDay> recent, List<MemoIn> memos, List<GoalIn> goals, List<ScheduleIn> schedule,
                       List<DatedMemo> allMemos, Map<String, String> prompts, String companion) {
            this(mode, categories, date, today, todayDid, recent, memos, goals, schedule, allMemos, prompts, companion, null, null);
        }

        /** 정리·칭찬·사랑의 화자 이름 (사용자가 지어 준 모루의 이름). 비었거나 이상하면 "모루" */
        static String companionName(String raw) {
            if (raw == null) return "모루";
            String name = raw.codePoints().filter(c -> !Character.isISOControl(c) && c != '"' && c != '\\')
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString().strip();
            if (name.isEmpty()) return "모루";
            return name.codePointCount(0, name.length()) > Prompts.COMPANION_MAX ? name.substring(0, name.offsetByCodePoints(0, Prompts.COMPANION_MAX)) : name;
        }

        /** 관리자가 아닌 요청: 작성 지침 덮어쓰기(prompts)만 빼고 그대로 */
        public Request withoutPrompts() {
            return new Request(mode, categories, date, today, todayDid, recent, memos, goals, schedule, allMemos, Map.of(), companion, companionAppearance, companionAffinity);
        }

        /*
         * 입력 상한. 개수와 함께 항목마다 글자 수도 자른다 (기록 저장 상한 RecordsLogic 보다 넉넉하게 잡아
         * 보통 사용자의 기록은 잘리지 않는다). 프롬프트에 들어가는 길이는 TodayService 가 한 번 더 자른다
         */
        static final int DID_MAX = 30, DID_LEN = 100, NOTE_LEN = 1000, RECORD_KEYS_MAX = 20;
        static final int MEMO_LEN = 2000, ALL_MEMOS_MAX = 300, GOAL_TITLE_LEN = 100, GOAL_WHY_LEN = 300, STEPS_MAX = 30, STEP_LEN = 100;
        static final int SCHEDULE_TITLE_LEN = 100, SHORT_LEN = 40;

        /** 비어 있는 값은 기본값으로, 목록은 서버가 감당할 길이로 자른다 */
        public Request normalized() {
            if (date != null && !validDate(date)) throw kr.co.shuim.config.ApiException.badRequest("기준 날짜를 다시 확인해 주세요");
            String day = date == null ? kr.co.shuim.common.Dates.todayKey() : date;
            List<RecentDay> r = recent == null ? List.of() : recent.stream().filter(x -> x != null && validDate(x.date()) && x.date().compareTo(day) < 0)
                .sorted(Comparator.comparing(RecentDay::date))
                .map(x -> new RecentDay(x.date(), x.record() == null ? Map.of() : clean(x.record()), dids(x.did()))).toList();
            if (r.size() > 7) r = r.subList(r.size() - 7, r.size());
            List<MemoIn> m = memos == null ? List.of() : memos.stream().filter(x -> x != null && x.text() != null)
                .filter(x -> !validDate(x.date()) || x.date().compareTo(day) <= 0)
                .map(x -> new MemoIn(opt(x.cat(), SHORT_LEN), cut(x.text(), MEMO_LEN), x.pinned(), validDate(x.date()) ? x.date() : null))
                .sorted(Comparator.comparing((MemoIn x) -> !day.equals(x.date())))
                .toList();
            if (m.size() > 20) m = m.subList(0, 20);
            List<GoalIn> g = goals == null ? List.of() : goals.stream().filter(x -> x != null && x.title() != null).limit(8)
                .map(x -> new GoalIn(cut(x.title(), GOAL_TITLE_LEN), opt(x.cat(), SHORT_LEN), x.why() == null ? "" : cut(x.why(), GOAL_WHY_LEN), opt(x.due(), SHORT_LEN),
                    x.steps() == null ? List.of() : x.steps().stream().filter(s -> s != null && s.text() != null).limit(STEPS_MAX)
                        .map(s -> new GoalStep(cut(s.text(), STEP_LEN), s.done())).toList())).toList();
            List<ScheduleIn> s = schedule == null ? List.of() : schedule.stream().filter(x -> x != null && x.title() != null).limit(20)
                .map(x -> new ScheduleIn(opt(x.date(), SHORT_LEN), opt(x.time(), SHORT_LEN), cut(x.title(), SCHEDULE_TITLE_LEN), opt(x.cat(), SHORT_LEN), x.done())).toList();
            List<DatedMemo> all = allMemos == null ? List.of() : allMemos.stream().filter(x -> x != null && x.text() != null && validDate(x.date()) && x.date().compareTo(day) <= 0)
                .sorted(Comparator.comparing(DatedMemo::date)).toList();
            if (all.size() > ALL_MEMOS_MAX) all = all.subList(all.size() - ALL_MEMOS_MAX, all.size());
            all = all.stream().map(x -> new DatedMemo(x.date(), opt(x.cat(), SHORT_LEN), cut(x.text(), MEMO_LEN), x.pinned())).toList();
            String md = "praise".equals(mode) || "love".equals(mode) || "review".equals(mode) ? mode : "briefing";
            return new Request(md, Categories.of(categories), day,
                today == null ? Map.of() : clean(today), dids(todayDid), r, m, g, s, all, prompts == null ? Map.of() : prompts,
                companionName(companion), "kkomi".equals(companionAppearance) ? "kkomi" : null,
                companionAffinity == null ? 0 : Math.clamp(companionAffinity, 0, 100));
        }

        private static String cut(String value, int max) { return kr.co.shuim.common.Korean.cut(value, max); }

        /** null 은 null 그대로 (일정 시간·마감일·카테고리는 비어 있음을 뜻한다) */
        private static String opt(String value, int max) { return value == null ? null : cut(value, max); }

        private static List<String> dids(List<String> in) {
            return in == null ? List.of() : in.stream().filter(java.util.Objects::nonNull).limit(DID_MAX).map(d -> cut(d, DID_LEN)).toList();
        }

        private static boolean validDate(String value) {
            if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
            try { return LocalDate.parse(value).toString().equals(value); }
            catch (java.time.DateTimeException e) { return false; }
        }

        private static Map<String, Entry> clean(Map<String, Entry> in) {
            Map<String, Entry> out = new LinkedHashMap<>();
            for (var e : in.entrySet()) {
                if (out.size() >= RECORD_KEYS_MAX) break;
                Entry v = e.getValue();
                if (e.getKey() != null && v != null && v.score() != null)
                    out.put(cut(e.getKey(), SHORT_LEN), v.note() == null || v.note().length() <= NOTE_LEN ? v : new Entry(v.score(), v.delta(), cut(v.note(), NOTE_LEN)));
            }
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
