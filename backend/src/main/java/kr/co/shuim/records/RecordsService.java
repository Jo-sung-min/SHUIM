package kr.co.shuim.records;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.common.Db;
import kr.co.shuim.records.RecordsDtos.*;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * 로그인 계정의 개인 기록(기록·오늘 한 일·메모·목표·일정·사용자 카테고리·카드 순서).
 * 화면은 목록 전체를 들고 있다가 통째로 저장하므로(frontend/lib/storage.ts) 메모·목표·일정은 "계정의 목록을 이것으로 교체"가 기본 단위다.
 */
@Service
public class RecordsService {
    static final String ORDER_KEY = "category_order";
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public RecordsService(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    private static LocalDateTime ts(Long ms) { return ms == null ? null : LocalDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneOffset.UTC); }

    /* ---------- 읽기 ---------- */

    public Snapshot load(String userId) {
        return new Snapshot(loadJournal(userId), loadLog(userId), loadMemos(userId), loadGoals(userId), loadSchedule(userId), loadCategories(userId), loadOrder(userId));
    }

    Map<String, Map<String, Entry>> loadJournal(String userId) {
        Map<String, Map<String, Entry>> out = new TreeMap<>();
        jdbc.sql("SELECT date, cat, score, delta, note FROM journal_entries WHERE user_id = ? ORDER BY date, cat").param(userId).query((RowCallbackHandler) rs -> {
            Integer delta = rs.getObject("delta", Integer.class);
            out.computeIfAbsent(Db.date(rs, "date"), k -> new LinkedHashMap<>())
                .put(rs.getString("cat"), new Entry(rs.getInt("score"), delta, rs.getString("note")));
        });
        return out;
    }

    Map<String, DayLog> loadLog(String userId) {
        Map<String, DayLog> out = new TreeMap<>();
        jdbc.sql("SELECT date, did FROM day_logs WHERE user_id = ? ORDER BY date").param(userId).query((RowCallbackHandler) rs -> {
            List<String> did = Db.textArray(rs, "did");
            if (!did.isEmpty()) out.put(Db.date(rs, "date"), new DayLog(did));
        });
        return out;
    }

    List<Memo> loadMemos(String userId) {
        return jdbc.sql("SELECT id, cat, text, pinned, created_at, updated_at FROM memos WHERE user_id = ? ORDER BY created_at DESC").param(userId)
            .query((rs, i) -> new Memo(rs.getString("id"), rs.getString("cat"), rs.getString("text"), rs.getBoolean("pinned"), Db.msReq(rs, "created_at"), Db.msReq(rs, "updated_at"))).list();
    }

    List<Goal> loadGoals(String userId) {
        record Row(String id, String title, String cat, String why, String due, long createdAt, Long doneAt) {}
        List<Row> rows = jdbc.sql("SELECT id, title, cat, why, due, created_at, done_at FROM goals WHERE user_id = ? ORDER BY created_at DESC").param(userId)
            .query((rs, i) -> new Row(rs.getString("id"), rs.getString("title"), rs.getString("cat"), rs.getString("why"), Db.date(rs, "due"), Db.msReq(rs, "created_at"), Db.ms(rs, "done_at"))).list();
        if (rows.isEmpty()) return List.of();
        Map<String, List<GoalStep>> steps = new HashMap<>();
        jdbc.sql("SELECT s.goal_id, s.id, s.text, s.done FROM goal_steps s JOIN goals g ON g.id = s.goal_id WHERE g.user_id = ? ORDER BY s.position, s.id").param(userId)
            .query((RowCallbackHandler) rs -> steps.computeIfAbsent(rs.getString("goal_id"), k -> new ArrayList<>()).add(new GoalStep(rs.getString("id"), rs.getString("text"), rs.getBoolean("done"))));
        return rows.stream().map(r -> new Goal(r.id(), r.title(), r.cat(), r.why(), steps.getOrDefault(r.id(), new ArrayList<>()), r.due(), r.createdAt(), r.doneAt())).toList();
    }

    List<ScheduleItem> loadSchedule(String userId) {
        return jdbc.sql("SELECT id, date, time, title, cat, done FROM schedule_items WHERE user_id = ? ORDER BY date, time NULLS LAST, id").param(userId)
            .query((rs, i) -> {
                java.time.LocalTime t = rs.getObject("time", java.time.LocalTime.class);
                return new ScheduleItem(rs.getString("id"), Db.date(rs, "date"), t == null ? null : t.format(RecordsLogic.HHMM), rs.getString("title"), rs.getString("cat"), rs.getBoolean("done"));
            }).list();
    }

    List<Category> loadCategories(String userId) {
        return jdbc.sql("SELECT id, label, emoji, hint, color FROM user_categories WHERE user_id = ? ORDER BY sort_order, id").param(userId)
            .query((rs, i) -> new Category(rs.getString("id"), rs.getString("label"), rs.getString("emoji"), rs.getString("hint"), rs.getString("color"))).list();
    }

    List<String> loadOrder(String userId) {
        Optional<String> raw = jdbc.sql("SELECT value FROM user_settings WHERE user_id = ? AND key = ?").param(userId).param(ORDER_KEY).query(String.class).optional();
        if (raw.isEmpty()) return List.of();
        try {
            return RecordsLogic.cleanOrder(json.readValue(raw.get(), new TypeReference<List<String>>() {}));
        } catch (Exception e) {
            return List.of();
        }
    }

    /* ---------- 하루 기록 ---------- */

    /** 그 날의 기록(record)과 오늘 한 일(did)을 저장. null 인 쪽은 건드리지 않는다 */
    @Transactional
    public void saveDay(String userId, LocalDate date, DayInput in) {
        if (in.record() != null) writeDay(userId, date, RecordsLogic.cleanDay(in.record()));
        if (in.did() != null) writeDid(userId, date, RecordsLogic.cleanDid(in.did()));
    }

    private void writeDay(String userId, LocalDate date, Map<String, Entry> day) {
        jdbc.sql("DELETE FROM journal_entries WHERE user_id = ? AND date = ?").param(userId).param(date).update();
        for (var e : day.entrySet()) {
            jdbc.sql("INSERT INTO journal_entries (user_id, date, cat, score, delta, note) VALUES (?, ?, ?, ?, ?, ?)")
                .param(userId).param(date).param(e.getKey()).param(e.getValue().score()).param(e.getValue().delta()).param(e.getValue().note()).update();
        }
    }

    private void writeDid(String userId, LocalDate date, List<String> did) {
        if (did.isEmpty()) {
            jdbc.sql("DELETE FROM day_logs WHERE user_id = ? AND date = ?").param(userId).param(date).update();
            return;
        }
        jdbc.sql("INSERT INTO day_logs (user_id, date, did) VALUES (?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET did = EXCLUDED.did")
            .param(userId).param(date).param(did.toArray(String[]::new)).update();
    }

    /* ---------- 목록 교체 ---------- */

    @Transactional
    public void replaceJournal(String userId, Map<String, Map<String, Entry>> journal, Map<String, DayLog> log) {
        if (journal != null) {
            jdbc.sql("DELETE FROM journal_entries WHERE user_id = ?").param(userId).update();
            for (var e : RecordsLogic.cleanJournal(journal).entrySet()) writeDay(userId, LocalDate.parse(e.getKey()), e.getValue());
        }
        if (log != null) {
            jdbc.sql("DELETE FROM day_logs WHERE user_id = ?").param(userId).update();
            for (var e : RecordsLogic.cleanLog(log).entrySet()) writeDid(userId, LocalDate.parse(e.getKey()), e.getValue());
        }
    }

    @Transactional
    public void replaceMemos(String userId, List<Memo> memos) {
        jdbc.sql("DELETE FROM memos WHERE user_id = ?").param(userId).update();
        for (Memo m : RecordsLogic.cleanMemos(memos)) {
            jdbc.sql("INSERT INTO memos (id, user_id, cat, text, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .param(m.id()).param(userId).param(m.cat()).param(m.text()).param(m.pinned()).param(ts(m.createdAt())).param(ts(m.updatedAt())).update();
        }
    }

    @Transactional
    public void replaceGoals(String userId, List<Goal> goals) {
        jdbc.sql("DELETE FROM goals WHERE user_id = ?").param(userId).update(); // goal_steps 는 CASCADE
        for (Goal g : RecordsLogic.cleanGoals(goals)) {
            jdbc.sql("INSERT INTO goals (id, user_id, title, cat, why, due, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .param(g.id()).param(userId).param(g.title()).param(g.cat()).param(g.why()).param(g.due() == null ? null : LocalDate.parse(g.due()))
                .param(ts(g.createdAt())).param(ts(g.doneAt())).update();
            int pos = 0;
            for (GoalStep s : g.steps()) {
                jdbc.sql("INSERT INTO goal_steps (id, goal_id, position, text, done) VALUES (?, ?, ?, ?, ?)")
                    .param(s.id()).param(g.id()).param(pos++).param(s.text()).param(s.done()).update();
            }
        }
    }

    @Transactional
    public void replaceSchedule(String userId, List<ScheduleItem> items) {
        jdbc.sql("DELETE FROM schedule_items WHERE user_id = ?").param(userId).update();
        for (ScheduleItem s : RecordsLogic.cleanSchedule(items)) {
            jdbc.sql("INSERT INTO schedule_items (id, user_id, date, time, title, cat, done) VALUES (?, ?, ?, ?, ?, ?, ?)")
                .param(s.id()).param(userId).param(LocalDate.parse(s.date())).param(RecordsLogic.time(s.time())).param(s.title()).param(s.cat()).param(s.done()).update();
        }
    }

    /** 사용자 카테고리 목록과 카드 순서. null 인 쪽은 건드리지 않는다 */
    @Transactional
    public void saveCategories(String userId, List<Category> categories, List<String> order) {
        if (categories != null) {
            jdbc.sql("DELETE FROM user_categories WHERE user_id = ?").param(userId).update();
            int pos = 0;
            for (Category c : RecordsLogic.cleanCategories(categories)) {
                jdbc.sql("INSERT INTO user_categories (user_id, id, label, emoji, hint, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)")
                    .param(userId).param(c.id()).param(c.label()).param(c.emoji()).param(c.hint()).param(c.color()).param(pos++).update();
            }
        }
        if (order != null) writeOrder(userId, RecordsLogic.cleanOrder(order));
    }

    private void writeOrder(String userId, List<String> order) {
        String value;
        try { value = json.writeValueAsString(order); } catch (Exception e) { throw new IllegalStateException(e); }
        jdbc.sql("INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, now()) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()")
            .param(userId).param(ORDER_KEY).param(value).update();
    }

    /* ---------- 묶음 ---------- */

    /** PUT /api/records: 본문에 있는 부분만 통째로 교체 (샘플 채우기, 못 보낸 변경 다시 보내기) */
    @Transactional
    public void replace(String userId, Snapshot s) {
        if (s.journal() != null || s.log() != null) replaceJournal(userId, s.journal(), s.log());
        if (s.memos() != null) replaceMemos(userId, s.memos());
        if (s.goals() != null) replaceGoals(userId, s.goals());
        if (s.schedule() != null) replaceSchedule(userId, s.schedule());
        if (s.categories() != null || s.order() != null) saveCategories(userId, s.categories(), s.order());
    }

    /** 가입·로그인 직후: 이 기기에서 게스트로 쓰던 데이터를, 계정에 아직 아무것도 없는 부분에만 넣는다. 채운 부분 이름을 돌려준다 */
    @Transactional
    public List<String> importIfEmpty(String userId, Snapshot s) {
        List<String> filled = new ArrayList<>();
        boolean hasJournal = count("journal_entries", userId) > 0 || count("day_logs", userId) > 0;
        if (!hasJournal && (notEmpty(s.journal()) || notEmpty(s.log()))) {
            replaceJournal(userId, s.journal() == null ? Map.of() : s.journal(), s.log() == null ? Map.of() : s.log());
            filled.add("journal");
        }
        if (notEmpty(s.memos()) && count("memos", userId) == 0) { replaceMemos(userId, s.memos()); filled.add("memos"); }
        if (notEmpty(s.goals()) && count("goals", userId) == 0) { replaceGoals(userId, s.goals()); filled.add("goals"); }
        if (notEmpty(s.schedule()) && count("schedule_items", userId) == 0) { replaceSchedule(userId, s.schedule()); filled.add("schedule"); }
        boolean hasCats = count("user_categories", userId) > 0 || jdbc.sql("SELECT count(*) FROM user_settings WHERE user_id = ? AND key = ?").param(userId).param(ORDER_KEY).query(Long.class).single() > 0;
        if (!hasCats && (notEmpty(s.categories()) || notEmpty(s.order()))) { saveCategories(userId, s.categories(), s.order()); filled.add("categories"); }
        return filled;
    }

    /** 전체 삭제 (나 › 전체 삭제) */
    @Transactional
    public void clear(String userId) {
        for (String t : List.of("journal_entries", "day_logs", "memos", "goals", "schedule_items", "user_categories", "user_settings")) {
            jdbc.sql("DELETE FROM " + t + " WHERE user_id = ?").param(userId).update();
        }
    }

    private long count(String table, String userId) {
        return jdbc.sql("SELECT count(*) FROM " + table + " WHERE user_id = ?").param(userId).query(Long.class).single();
    }

    private static boolean notEmpty(Map<?, ?> m) { return m != null && !m.isEmpty(); }

    private static boolean notEmpty(List<?> l) { return l != null && !l.isEmpty(); }
}
