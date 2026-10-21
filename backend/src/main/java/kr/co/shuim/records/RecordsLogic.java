package kr.co.shuim.records;

import kr.co.shuim.records.RecordsDtos.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;

import static kr.co.shuim.common.Korean.cut;

/** 저장 전 정리: 컬럼 길이·점수 범위·날짜 형식에 맞추고, 쓸 수 없는 항목은 버린다 (순수 함수, DB 없음) */
public final class RecordsLogic {
    private RecordsLogic() {}

    public static final int SCORE_MIN = -5, SCORE_MAX = 5;
    public static final int CUSTOM_MAX = 5;
    public static final int ORDER_MAX = 20;
    public static final int DID_MAX = 30;
    public static final int MEMOS_MAX = 2000, GOALS_MAX = 200, STEPS_MAX = 30, SCHEDULE_MAX = 2000, DAYS_MAX = 3660;
    static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]{1,36}$");
    private static final Pattern CAT = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
    private static final Pattern CUSTOM_CAT = Pattern.compile("^c_[a-z0-9]{1,38}$");

    static int clamp(int v) { return Math.max(SCORE_MIN, Math.min(SCORE_MAX, v)); }

    static String str(String s, int max) { return s == null ? "" : cut(s.strip(), max); }

    /** YYYY-MM-DD 면 그대로, 아니면 null */
    public static LocalDate date(String s) {
        if (s == null || s.length() != 10) return null;
        try { return LocalDate.parse(s); } catch (Exception e) { return null; }
    }

    /** HH:mm 이면 그대로, 아니면 null (빈 값도 null) */
    public static LocalTime time(String s) {
        if (s == null || s.isBlank()) return null;
        try { return LocalTime.parse(s.strip(), HHMM); } catch (Exception e) { return null; }
    }

    static boolean okId(String id) { return id != null && ID.matcher(id).matches(); }

    /** 메모·목표·일정 카테고리: 기본 5개 + etc + 사용자 카테고리 id. 모르는 값은 etc */
    static String memoCat(String cat) { return cat != null && CAT.matcher(cat).matches() ? cat : "etc"; }

    /** 하루 기록: 점수 없는 칸은 빼고, 점수는 범위 안으로 */
    public static Map<String, Entry> cleanDay(Map<String, Entry> in) {
        Map<String, Entry> out = new LinkedHashMap<>();
        if (in == null) return out;
        for (var e : in.entrySet()) {
            Entry v = e.getValue();
            if (v == null || v.score() == null || e.getKey() == null || !CAT.matcher(e.getKey()).matches()) continue;
            out.put(e.getKey(), new Entry(clamp(v.score()), v.delta() == null ? null : clamp(v.delta()), str(v.note(), 500)));
        }
        return out;
    }

    public static List<String> cleanDid(List<String> in) {
        List<String> out = new ArrayList<>();
        if (in == null) return out;
        for (String s : in) {
            if (s == null) continue;
            String t = cut(s.strip(), 60);
            if (!t.isEmpty() && !out.contains(t)) out.add(t);
            if (out.size() >= DID_MAX) break;
        }
        return out;
    }

    public static List<Memo> cleanMemos(List<Memo> in) {
        List<Memo> out = new ArrayList<>();
        if (in == null) return out;
        Set<String> seen = new HashSet<>();
        long now = System.currentTimeMillis();
        for (Memo m : in) {
            if (m == null || !okId(m.id()) || !seen.add(m.id())) continue;
            String text = str(m.text(), 2000);
            if (text.isEmpty()) continue;
            long created = m.createdAt() == null ? now : m.createdAt();
            out.add(new Memo(m.id(), memoCat(m.cat()), text, Boolean.TRUE.equals(m.pinned()), created, m.updatedAt() == null ? created : m.updatedAt()));
            if (out.size() >= MEMOS_MAX) break;
        }
        return out;
    }

    public static List<Goal> cleanGoals(List<Goal> in) {
        List<Goal> out = new ArrayList<>();
        if (in == null) return out;
        Set<String> seen = new HashSet<>();
        long now = System.currentTimeMillis();
        for (Goal g : in) {
            if (g == null || !okId(g.id()) || !seen.add(g.id())) continue;
            String title = str(g.title(), 60);
            if (title.isEmpty()) continue;
            List<GoalStep> steps = new ArrayList<>();
            Set<String> stepIds = new HashSet<>();
            if (g.steps() != null) for (GoalStep s : g.steps()) {
                if (s == null || !okId(s.id()) || !stepIds.add(s.id())) continue;
                String t = str(s.text(), 60);
                if (t.isEmpty()) continue;
                steps.add(new GoalStep(s.id(), t, Boolean.TRUE.equals(s.done())));
                if (steps.size() >= STEPS_MAX) break;
            }
            LocalDate due = date(g.due());
            out.add(new Goal(g.id(), title, memoCat(g.cat()), str(g.why(), 100), steps, due == null ? null : due.toString(),
                g.createdAt() == null ? now : g.createdAt(), g.doneAt()));
            if (out.size() >= GOALS_MAX) break;
        }
        return out;
    }

    public static List<ScheduleItem> cleanSchedule(List<ScheduleItem> in) {
        List<ScheduleItem> out = new ArrayList<>();
        if (in == null) return out;
        Set<String> seen = new HashSet<>();
        for (ScheduleItem s : in) {
            if (s == null || !okId(s.id()) || !seen.add(s.id())) continue;
            String title = str(s.title(), 60);
            LocalDate d = date(s.date());
            if (title.isEmpty() || d == null) continue;
            LocalTime t = time(s.time());
            out.add(new ScheduleItem(s.id(), d.toString(), t == null ? null : t.format(HHMM), title, memoCat(s.cat()), Boolean.TRUE.equals(s.done())));
            if (out.size() >= SCHEDULE_MAX) break;
        }
        return out;
    }

    /** 사용자 카테고리만(c_…), 최대 5개 */
    public static List<Category> cleanCategories(List<Category> in) {
        List<Category> out = new ArrayList<>();
        if (in == null) return out;
        Set<String> seen = new HashSet<>();
        for (Category c : in) {
            if (c == null || c.id() == null || !CUSTOM_CAT.matcher(c.id()).matches() || !seen.add(c.id())) continue;
            String label = str(c.label(), 12);
            if (label.isEmpty()) continue;
            String emoji = str(c.emoji(), 16);
            String color = str(c.color(), 40);
            out.add(new Category(c.id(), label, emoji.isEmpty() ? "📌" : emoji, str(c.hint(), 40), color.isEmpty() ? "var(--c-etc)" : color));
            if (out.size() >= CUSTOM_MAX) break;
        }
        return out;
    }

    public static List<String> cleanOrder(List<String> in) {
        List<String> out = new ArrayList<>();
        if (in == null) return out;
        for (String s : in) {
            if (s == null || !CAT.matcher(s).matches() || out.contains(s)) continue;
            out.add(s);
            if (out.size() >= ORDER_MAX) break;
        }
        return out;
    }

    /** 날짜 키가 올바른 것만. 기록이 비어 있는 날은 뺀다 */
    public static Map<String, Map<String, Entry>> cleanJournal(Map<String, Map<String, Entry>> in) {
        Map<String, Map<String, Entry>> out = new TreeMap<>();
        if (in == null) return out;
        for (var e : in.entrySet()) {
            if (date(e.getKey()) == null) continue;
            Map<String, Entry> day = cleanDay(e.getValue());
            if (!day.isEmpty()) out.put(e.getKey(), day);
            if (out.size() >= DAYS_MAX) break;
        }
        return out;
    }

    public static Map<String, List<String>> cleanLog(Map<String, DayLog> in) {
        Map<String, List<String>> out = new TreeMap<>();
        if (in == null) return out;
        for (var e : in.entrySet()) {
            if (date(e.getKey()) == null || e.getValue() == null) continue;
            List<String> did = cleanDid(e.getValue().did());
            if (!did.isEmpty()) out.put(e.getKey(), did);
            if (out.size() >= DAYS_MAX) break;
        }
        return out;
    }
}
