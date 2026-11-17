package kr.co.shuim.records;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.common.Db;
import kr.co.shuim.pet.PetService;
import org.springframework.beans.factory.annotation.Autowired;
import kr.co.shuim.records.RecordsDtos.*;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
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
    /** 오늘의 기록 = 모루의 마음밥. 손으로 만든 테스트 인스턴스에서는 없다 */
    private final PetService pets;

    public RecordsService(JdbcClient jdbc, ObjectMapper json) {
        this(jdbc, json, null);
    }

    @Autowired
    public RecordsService(JdbcClient jdbc, ObjectMapper json, PetService pets) {
        this.jdbc = jdbc;
        this.json = json;
        this.pets = pets;
    }

    /** 오늘(한국 시간) 기록이 바뀌었으면 같은 트랜잭션에서 모루에게 마음밥을 준다 (오늘 기록한 카테고리 하나 = 1개, 하루 5개까지) */
    private void feedPet(String userId, LocalDate date) {
        if (pets != null) pets.rewardRecords(userId, date);
    }

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
        if (in.record() != null) {
            writeDay(userId, date, RecordsLogic.cleanDay(in.record()));
            feedPet(userId, date);
        }
        if (in.did() != null) writeDid(userId, date, RecordsLogic.cleanDid(in.did()));
    }

    private void writeDay(String userId, LocalDate date, Map<String, Entry> day) {
        jdbc.sql("DELETE FROM journal_entries WHERE user_id = ? AND date = ?").param(userId).param(date).update();
        insertJournal(userId, Map.of(date.toString(), day));
    }

    private static String text(Object v) { return v == null ? null : String.valueOf(v); }

    /*
     * 여러 행은 배열 매개변수 + unnest 한 문장으로 넣는다 (행마다 왕복하면 큰 목록 하나가 DB 연결을 오래 붙잡는다).
     * 모든 열을 text[] 로 보내고 SQL 에서 형을 바꾼다. 시각은 epoch ms 문자열 → UTC TIMESTAMP (LocalDateTime UTC 와 같은 값).
     */
    private static final String MS_TO_TS = "timestamp 'epoch' + (%s)::bigint * interval '1 millisecond'";

    /** 날짜 → (카테고리 → 기록) 전체를 한 번에 넣는다. 같은 날 행은 미리 지워 둔 상태여야 한다 */
    private void insertJournal(String userId, Map<String, Map<String, Entry>> days) {
        List<String> dates = new ArrayList<>(), cats = new ArrayList<>(), scores = new ArrayList<>(), deltas = new ArrayList<>(), notes = new ArrayList<>();
        for (var d : days.entrySet()) for (var e : d.getValue().entrySet()) {
            dates.add(d.getKey()); cats.add(e.getKey()); scores.add(text(e.getValue().score())); deltas.add(text(e.getValue().delta())); notes.add(e.getValue().note());
        }
        if (dates.isEmpty()) return;
        jdbc.sql("INSERT INTO journal_entries (user_id, date, cat, score, delta, note) "
                + "SELECT ?, d::date, c, s::int, dl::int, n FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(d, c, s, dl, n)")
            .param(userId).param(arr(dates)).param(arr(cats)).param(arr(scores)).param(arr(deltas)).param(arr(notes)).update();
    }

    private static String[] arr(List<String> l) { return l.toArray(String[]::new); }

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
            insertJournal(userId, RecordsLogic.cleanJournal(journal));
            if (pets != null) pets.rewardToday(userId);
        }
        if (log != null) {
            jdbc.sql("DELETE FROM day_logs WHERE user_id = ?").param(userId).update();
            Map<String, List<String>> days = RecordsLogic.cleanLog(log);
            if (!days.isEmpty()) {
                List<String> dates = new ArrayList<>(), dids = new ArrayList<>();
                for (var e : days.entrySet()) {
                    dates.add(e.getKey());
                    try { dids.add(json.writeValueAsString(e.getValue())); } catch (Exception ex) { throw new IllegalStateException(ex); }
                }
                jdbc.sql("INSERT INTO day_logs (user_id, date, did) SELECT ?, d::date, "
                        + "ARRAY(SELECT x.e FROM jsonb_array_elements_text(j::jsonb) WITH ORDINALITY AS x(e, i) ORDER BY x.i) "
                        + "FROM unnest(?::text[], ?::text[]) AS t(d, j)")
                    .param(userId).param(arr(dates)).param(arr(dids)).update();
            }
        }
    }

    @Transactional
    public void replaceMemos(String userId, List<Memo> memos) {
        // Preserve the structured pet form only while its notebook text is unchanged.
        // Deleting/editing the memo also deletes its form; the reward ledger stays intact.
        record PetForm(String text, String answers) {}
        Map<String, PetForm> petForms = new HashMap<>();
        Set<String> owned = new HashSet<>();
        jdbc.sql("SELECT id, text, pet_answers::text AS answers FROM memos WHERE user_id = ?")
            .param(userId).query((RowCallbackHandler) rs -> {
                owned.add(rs.getString("id"));
                if (rs.getString("answers") != null) petForms.put(rs.getString("id"), new PetForm(rs.getString("text"), rs.getString("answers")));
            });
        jdbc.sql("DELETE FROM memos WHERE user_id = ?").param(userId).update();
        // memos.id 는 계정과 무관한 전역 키다. 모루 마음기록 id(UUID v3, 날짜로 계산됨)는 이미 이 계정 것일 때만 받는다 —
        // 남의 마음기록 id 를 먼저 차지해 그 사람의 일기를 가로채거나 저장을 막지 못하게.
        List<Memo> clean = RecordsLogic.cleanMemos(memos).stream()
            .filter(m -> !RecordsLogic.PET_MEMO_ID.matcher(m.id()).matches() || owned.contains(m.id())).toList();
        if (clean.isEmpty()) return;
        List<String> ids = new ArrayList<>(), cats = new ArrayList<>(), texts = new ArrayList<>(), pinned = new ArrayList<>(), created = new ArrayList<>(), updated = new ArrayList<>();
        for (Memo m : clean) {
            ids.add(m.id()); cats.add(m.cat()); texts.add(m.text()); pinned.add(text(m.pinned())); created.add(text(m.createdAt())); updated.add(text(m.updatedAt()));
        }
        // 다른 계정이 가진 id 와 겹치면 그 행은 건드리지 않고 버린다 (DO NOTHING: 남의 행을 바꾸지도, 요청 전체를 실패시키지도 않음)
        jdbc.sql("INSERT INTO memos (id, user_id, cat, text, pinned, created_at, updated_at) "
                + "SELECT i, ?, c, tx, p::boolean, " + MS_TO_TS.formatted("ca") + ", " + MS_TO_TS.formatted("ua") + " "
                + "FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(i, c, tx, p, ca, ua) "
                + "ON CONFLICT (id) DO NOTHING")
            .param(userId).param(arr(ids)).param(arr(cats)).param(arr(texts)).param(arr(pinned)).param(arr(created)).param(arr(updated)).update();
        for (Memo m : clean) {
            PetForm form = petForms.get(m.id());
            if (form != null && form.text().equals(m.text())) {
                jdbc.sql("UPDATE memos SET pet_answers = CAST(? AS jsonb) WHERE id = ? AND user_id = ?")
                    .param(form.answers()).param(m.id()).param(userId).update();
            }
        }
    }

    @Transactional
    public void replaceGoals(String userId, List<Goal> goals) {
        jdbc.sql("DELETE FROM goals WHERE user_id = ?").param(userId).update(); // goal_steps 는 CASCADE
        List<Goal> clean = RecordsLogic.cleanGoals(goals);
        if (clean.isEmpty()) return;
        List<String> ids = new ArrayList<>(), titles = new ArrayList<>(), cats = new ArrayList<>(), whys = new ArrayList<>(), dues = new ArrayList<>(), created = new ArrayList<>(), done = new ArrayList<>();
        for (Goal g : clean) {
            ids.add(g.id()); titles.add(g.title()); cats.add(g.cat()); whys.add(g.why()); dues.add(g.due()); created.add(text(g.createdAt())); done.add(text(g.doneAt()));
        }
        // 전역 키라 다른 계정의 목표 id 와 겹치면 버린다. 실제로 이 계정에 들어간 목표에만 단계를 붙인다 (남의 목표에 단계가 붙지 않게)
        Set<String> inserted = new HashSet<>(jdbc.sql("INSERT INTO goals (id, user_id, title, cat, why, due, created_at, done_at) "
                + "SELECT i, ?, ti, c, w, du::date, " + MS_TO_TS.formatted("ca") + ", " + MS_TO_TS.formatted("dn") + " "
                + "FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(i, ti, c, w, du, ca, dn) "
                + "ON CONFLICT (id) DO NOTHING RETURNING id")
            .param(userId).param(arr(ids)).param(arr(titles)).param(arr(cats)).param(arr(whys)).param(arr(dues)).param(arr(created)).param(arr(done))
            .query(String.class).list());
        List<String> stepIds = new ArrayList<>(), goalIds = new ArrayList<>(), positions = new ArrayList<>(), texts = new ArrayList<>(), dones = new ArrayList<>();
        for (Goal g : clean) {
            if (!inserted.contains(g.id())) continue;
            int pos = 0;
            for (GoalStep s : g.steps()) {
                stepIds.add(s.id()); goalIds.add(g.id()); positions.add(String.valueOf(pos++)); texts.add(s.text()); dones.add(text(s.done()));
            }
        }
        if (stepIds.isEmpty()) return;
        jdbc.sql("INSERT INTO goal_steps (id, goal_id, position, text, done) "
                + "SELECT i, g, p::int, tx, d::boolean FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(i, g, p, tx, d) "
                + "ON CONFLICT (id) DO NOTHING")
            .param(arr(stepIds)).param(arr(goalIds)).param(arr(positions)).param(arr(texts)).param(arr(dones)).update();
    }

    @Transactional
    public void replaceSchedule(String userId, List<ScheduleItem> items) {
        jdbc.sql("DELETE FROM schedule_items WHERE user_id = ?").param(userId).update();
        List<ScheduleItem> clean = RecordsLogic.cleanSchedule(items);
        if (clean.isEmpty()) return;
        List<String> ids = new ArrayList<>(), dates = new ArrayList<>(), times = new ArrayList<>(), titles = new ArrayList<>(), cats = new ArrayList<>(), done = new ArrayList<>();
        for (ScheduleItem s : clean) {
            ids.add(s.id()); dates.add(s.date()); times.add(s.time()); titles.add(s.title()); cats.add(s.cat()); done.add(text(s.done()));
        }
        // 다른 계정의 일정 id 와 겹치면 버린다 (남의 행을 바꾸지 않음)
        jdbc.sql("INSERT INTO schedule_items (id, user_id, date, time, title, cat, done) "
                + "SELECT i, ?, d::date, tm::time, ti, c, dn::boolean FROM unnest(?::text[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[]) AS t(i, d, tm, ti, c, dn) "
                + "ON CONFLICT (id) DO NOTHING")
            .param(userId).param(arr(ids)).param(arr(dates)).param(arr(times)).param(arr(titles)).param(arr(cats)).param(arr(done)).update();
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
