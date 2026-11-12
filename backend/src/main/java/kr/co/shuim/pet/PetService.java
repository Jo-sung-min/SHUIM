package kr.co.shuim.pet;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service
public class PetService {
    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public PetService(JdbcClient jdbc, ObjectMapper json) { this(jdbc, json, Clock.system(ZoneId.of("Asia/Seoul"))); }
    PetService(JdbcClient jdbc, ObjectMapper json, Clock clock) { this.jdbc = jdbc; this.json = json; this.clock = clock; }
    public record Answers(String mood, Integer intensity, String reason, String note, String need) {}
    public record JournalInput(String date, Answers answers) {}
    public record View(String name, int food, int xp, int level, int levelStart, int levelEnd,
                       String date, int meals, int earned, Answers answers, int reward,
                       int points, int homeId, List<Integer> ownedHomes, List<PetHomes.Home> homes, String appearance, boolean snacked,
                       int warmth, int clean, int energy, boolean bathed, Boolean lightsOff, boolean glow,
                       List<String> appearances) {}
    /** 고를 수 있는 모습. 화면은 이 목록에 있는 것만 보여 준다 (새 모습을 모르는 옛 서버에서는 고르지 못하게) */
    static final List<String> APPEARANCES = List.of("moru", "noa", "leo", "lumi", "moring");
    private record CareRow(PetRules.Care care, LocalDate careDate, LocalDate bathDate, LocalDate lightsNight, boolean lightsOff) {}
    private record Pet(String name, PetRules.State state) {}
    private static final Answers EMPTY = new Answers(null, null, null, null, null);
    private static final Set<String> MOODS = Set.of("편안해", "기뻐", "그저 그래", "지쳤어", "슬퍼", "불안해", "잘 모르겠어");
    private static final Set<String> REASONS = Set.of("나 자신", "일", "관계", "몸", "돈", "잘 모르겠어");
    private static final Set<String> NEEDS = Set.of("휴식", "위로", "정리", "함께 있기", "조용히 있기", "잘 모르겠어");

    private Pet lock(String uid, ZonedDateTime now) {
        jdbc.sql("INSERT INTO user_pets(user_id, meal_date) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .param(uid).param(now.toLocalDate()).update();
        var pet = jdbc.sql("SELECT name, food, xp, meal_date, meals FROM user_pets WHERE user_id = ? FOR UPDATE")
            .param(uid).query((rs, i) -> new Pet(rs.getString("name"), PetRules.settle(new PetRules.State(
                rs.getInt("food"), rs.getInt("xp"), rs.getObject("meal_date", LocalDate.class), rs.getInt("meals")), now.toLocalDate(), now.getHour()))).single();
        settleCare(uid, now.toLocalDate());
        return pet;
    }
    private CareRow readCare(String uid) {
        return jdbc.sql("SELECT warmth, clean, energy, warmth_today, care_date, bath_date, lights_night, lights_off FROM user_pets WHERE user_id = ?")
            .param(uid).query((rs, i) -> new CareRow(
                new PetRules.Care(rs.getInt("warmth"), rs.getInt("clean"), rs.getInt("energy"), rs.getInt("warmth_today")),
                rs.getObject("care_date", LocalDate.class), rs.getObject("bath_date", LocalDate.class),
                rs.getObject("lights_night", LocalDate.class), rs.getBoolean("lights_off"))).single();
    }
    private void writeCare(String uid, PetRules.Care c) {
        jdbc.sql("UPDATE user_pets SET warmth = ?, clean = ?, energy = ?, warmth_today = ? WHERE user_id = ?")
            .param(c.warmth()).param(c.clean()).param(c.energy()).param(c.warmthToday()).param(uid).update();
    }
    /** 돌봄 상태의 하루 정산. 행을 잠근 뒤에만 부른다. care_date 로 날짜마다 한 번만 깎는다 (저장 없이 끝나는 요청이 있어도 두 번 깎이지 않게) */
    private void settleCare(String uid, LocalDate today) {
        var row = readCare(uid);
        if (row.careDate() != null && !row.careDate().isBefore(today)) return;
        if (row.careDate() != null) {
            boolean sleptDark = row.lightsOff() && today.minusDays(1).equals(row.lightsNight());
            writeCare(uid, PetRules.careRollover(row.care(), java.time.temporal.ChronoUnit.DAYS.between(row.careDate(), today), sleptDark));
        }
        jdbc.sql("UPDATE user_pets SET care_date = ? WHERE user_id = ?").param(today).param(uid).update();
    }
    private int mask(String uid, LocalDate date) {
        return jdbc.sql("SELECT rewarded FROM pet_daily_rewards WHERE user_id = ? AND date = ?")
            .param(uid).param(date).query(Integer.class).optional().orElse(0);
    }
    private String memoId(String uid, LocalDate date) {
        return UUID.nameUUIDFromBytes(("sorow-pet:" + uid + ":" + date).getBytes(StandardCharsets.UTF_8)).toString();
    }
    private Answers answers(String uid, LocalDate date) {
        var raw = jdbc.sql("SELECT pet_answers::text FROM memos WHERE id = ? AND user_id = ? AND pet_answers IS NOT NULL")
            .param(memoId(uid, date)).param(uid).query(String.class).optional();
        if (raw.isEmpty()) return EMPTY;
        try { return json.readValue(raw.get(), Answers.class); }
        catch (Exception e) { throw new IllegalStateException("Invalid stored pet diary", e); }
    }
    private View save(String uid, Pet p, int reward) {
        var s = p.state();
        jdbc.sql("UPDATE user_pets SET name = ?, food = ?, xp = ?, meal_date = ?, meals = ? WHERE user_id = ?")
            .param(p.name()).param(s.food()).param(s.xp()).param(s.date()).param(s.meals()).param(uid).update();
        int level = PetRules.level(s.xp());
        var care = readCare(uid);
        var night = PetRules.night(s.date(), ZonedDateTime.now(clock).getHour());
        int points = jdbc.sql("SELECT visit_points FROM user_pets WHERE user_id=?").param(uid).query(Integer.class).single();
        int homeId = jdbc.sql("SELECT home_id FROM user_pets WHERE user_id=?").param(uid).query(Integer.class).single();
        String appearance = jdbc.sql("SELECT appearance FROM user_pets WHERE user_id=?").param(uid).query(String.class).single();
        return new View(p.name(), s.food(), s.xp(), level, PetRules.LEVELS[level - 1],
            level == 10 ? 720 : PetRules.LEVELS[level], s.date().toString(), s.meals(),
            Integer.bitCount(mask(uid, s.date())), answers(uid, s.date()), reward, points, homeId, owned(uid), PetHomes.ALL, appearance, snacked(uid, s.date()),
            care.care().warmth(), care.care().clean(), care.care().energy(), s.date().equals(care.bathDate()),
            night != null && night.equals(care.lightsNight()) ? Boolean.valueOf(care.lightsOff()) : null, PetRules.glow(care.care()), APPEARANCES);
    }
    private List<Integer> owned(String uid) {
        var result = new ArrayList<Integer>(); result.add(0);
        result.addAll(jdbc.sql("SELECT home_id FROM pet_owned_homes WHERE user_id=? ORDER BY home_id").param(uid).query(Integer.class).list());
        return result;
    }
    private void grant(String uid, String key, int amount) {
        int inserted = jdbc.sql("INSERT INTO pet_point_ledger(user_id,event_key,amount) VALUES (?,?,?) ON CONFLICT DO NOTHING")
            .param(uid).param(key).param(amount).update();
        if (inserted == 1) jdbc.sql("UPDATE user_pets SET visit_points=visit_points+? WHERE user_id=?").param(amount).param(uid).update();
    }
    @Transactional public View get(String uid) {
        var now = ZonedDateTime.now(clock);
        var p = lock(uid, now);
        grant(uid, "visit:" + p.state().date(), 10);
        int reward = fillRecords(uid, p.state().date()); // 기록이 다른 경로로 들어온 날도 여기서 맞춘다
        return save(uid, reward == 0 ? p : fed(p, reward, now), reward);
    }
    /** 새 마음밥: 재고·경험치를 더하고 오늘 아직 못 먹은 끼니를 채운다 (지난 끼니는 빚이 아니다) */
    private static Pet fed(Pet p, int reward, ZonedDateTime now) {
        var s = p.state();
        return new Pet(p.name(), PetRules.settle(new PetRules.State(s.food() + reward, Math.min(720, s.xp() + reward * 4), s.date(), s.meals()), now.toLocalDate(), now.getHour()));
    }
    /** 오늘의 기록에 남은 카테고리 수만큼 보상 칸을 채우고 새로 채운 칸마다 방문포인트 +4. 새로 생긴 마음밥 수를 돌려준다 */
    private int fillRecords(String uid, LocalDate date) {
        int recorded = jdbc.sql("SELECT COUNT(DISTINCT cat) FROM journal_entries WHERE user_id = ? AND date = ?")
            .param(uid).param(date).query(Integer.class).single();
        int old = mask(uid, date), next = PetRules.fillRecords(old, recorded);
        if (next == old) return 0;
        for (int bit = 0; bit < 5; bit++) {
            if ((next & (1 << bit)) != 0 && (old & (1 << bit)) == 0) grant(uid, "journal:" + date + ":" + bit, 4);
        }
        jdbc.sql("INSERT INTO pet_daily_rewards(user_id, date, rewarded) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET rewarded = EXCLUDED.rewarded")
            .param(uid).param(date).param(next).update();
        return PetRules.reward(old, next);
    }
    /**
     * 오늘의 기록이 저장된 직후(같은 트랜잭션): 오늘(한국 시간) 날짜면 모루에게 마음밥을 준다. 지난 날짜는 주지 않는다.
     * 모루 행을 잠그므로 여러 기기에서 동시에 저장해도 한 칸은 한 번만 채워진다.
     */
    @Transactional public int rewardRecords(String uid, LocalDate date) {
        var now = ZonedDateTime.now(clock);
        if (!now.toLocalDate().equals(date)) return 0;
        var p = lock(uid, now);
        int reward = fillRecords(uid, p.state().date());
        if (reward > 0) save(uid, fed(p, reward, now), reward);
        return reward;
    }
    /** 기록 전체 교체(가져오기 등) 뒤: 오늘 날짜 기록만 본다 */
    @Transactional public int rewardToday(String uid) {
        return rewardRecords(uid, ZonedDateTime.now(clock).toLocalDate());
    }
    public record HomeInput(int homeId) {}
    public record AppearanceInput(String appearance) {}
    static String validateAppearance(String value) {
        if (value == null || !APPEARANCES.contains(value))
            throw ApiException.badRequest("친구의 모습을 선택해 주세요.");
        return value;
    }
    @Transactional public View appearance(String uid, AppearanceInput input) {
        String value = validateAppearance(input == null ? null : input.appearance());
        var p = lock(uid, ZonedDateTime.now(clock));
        jdbc.sql("UPDATE user_pets SET appearance=? WHERE user_id=?").param(value).param(uid).update();
        return save(uid, p, 0);
    }
    @Transactional public View home(String uid, HomeInput input) {
        if (input == null) throw ApiException.badRequest("공간을 선택해 주세요.");
        var p = lock(uid, ZonedDateTime.now(clock));
        int points = jdbc.sql("SELECT visit_points FROM user_pets WHERE user_id=?").param(uid).query(Integer.class).single();
        var owned = owned(uid);
        var home = PetHomes.check(input.homeId(), PetRules.level(p.state().xp()), points, owned);
        if (!owned.contains(home.id())) {
            jdbc.sql("INSERT INTO pet_owned_homes(user_id,home_id) VALUES (?,?)").param(uid).param(home.id()).update();
            jdbc.sql("INSERT INTO pet_point_ledger(user_id,event_key,amount) VALUES (?,?,?)")
                .param(uid).param("home:" + home.id()).param(-home.cost()).update();
            jdbc.sql("UPDATE user_pets SET visit_points=visit_points-? WHERE user_id=?").param(home.cost()).param(uid).update();
        }
        jdbc.sql("UPDATE user_pets SET home_id=? WHERE user_id=?").param(home.id()).param(uid).update();
        return save(uid, p, 0);
    }
    /** 오늘 간식을 줬는지: 포인트 장부의 0점짜리 표시 한 줄 (snack:날짜). 열을 늘리지 않고 하루 한 번을 지킨다 */
    private boolean snacked(String uid, LocalDate date) {
        return jdbc.sql("SELECT COUNT(*) FROM pet_point_ledger WHERE user_id = ? AND event_key = ?")
            .param(uid).param("snack:" + date).query(Integer.class).single() > 0;
    }
    /** 간식 주기: 마음밥 하나를 끼니와 따로 직접 준다. 하루 한 번, 경험치 +1 (식사 수와 자동 식사는 그대로) */
    @Transactional public View snack(String uid) {
        var p = lock(uid, ZonedDateTime.now(clock));
        var s = p.state();
        if (s.food() == 0) throw ApiException.badRequest("마음밥이 없어요. 마음을 기록하면 생겨요.");
        int marked = jdbc.sql("INSERT INTO pet_point_ledger(user_id,event_key,amount) VALUES (?,?,0) ON CONFLICT DO NOTHING")
            .param(uid).param("snack:" + s.date()).update();
        if (marked == 0) throw ApiException.badRequest("오늘 간식은 이미 줬어요.");
        writeCare(uid, PetRules.warm(readCare(uid).care()));
        return save(uid, glowBonus(uid, new Pet(p.name(), PetRules.snack(s))), 0);
    }
    /** 온기·말끔함·기운이 모두 가득 찬 날은 한 번 성장 +1 (장부의 0점 표시 glow:날짜 로 하루 한 번) */
    private Pet glowBonus(String uid, Pet p) {
        if (!PetRules.glow(readCare(uid).care())) return p;
        int marked = jdbc.sql("INSERT INTO pet_point_ledger(user_id,event_key,amount) VALUES (?,?,0) ON CONFLICT DO NOTHING")
            .param(uid).param("glow:" + p.state().date()).update();
        if (marked == 0) return p;
        var s = p.state();
        return new Pet(p.name(), new PetRules.State(s.food(), Math.min(720, s.xp() + 1), s.date(), s.meals()));
    }
    public record CareInput(String action) {}
    private static final Set<String> WARM_ACTIONS = Set.of("hug", "tickle", "talk", "breath");
    /**
     * 돌봄: hug·tickle·talk·breath(온기), dust(먼지 한 뭉치), bath(하루 한 번), lightsOff·lightsOn(밤에만).
     * 상한을 넘은 손길은 거절하지 않고 그대로 둔다 (반응은 화면이 하고, 서버는 칸만 지킨다).
     */
    @Transactional public View care(String uid, CareInput in) {
        String action = in == null || in.action() == null ? "" : in.action();
        var now = ZonedDateTime.now(clock);
        var p = lock(uid, now);
        var row = readCare(uid);
        var today = p.state().date();
        if (WARM_ACTIONS.contains(action)) writeCare(uid, PetRules.warm(row.care()));
        else if (action.equals("dust")) writeCare(uid, PetRules.dust(row.care()));
        else if (action.equals("bath")) {
            if (today.equals(row.bathDate())) throw ApiException.badRequest("오늘은 이미 씻었어요.");
            writeCare(uid, PetRules.bath(row.care()));
            jdbc.sql("UPDATE user_pets SET bath_date = ? WHERE user_id = ?").param(today).param(uid).update();
        } else if (action.equals("lightsOff") || action.equals("lightsOn")) {
            var night = PetRules.night(today, now.getHour());
            if (night == null) throw ApiException.badRequest("불은 밤에만 끄고 켤 수 있어요.");
            boolean off = action.equals("lightsOff");
            jdbc.sql("UPDATE user_pets SET lights_night = ?, lights_off = ? WHERE user_id = ?").param(night).param(off).param(uid).update();
            // 자정을 넘긴 뒤라면 오늘의 기운은 이미 정산됐다: 지금 고른 대로 바로 맞춘다
            if (night.isBefore(today)) writeCare(uid, PetRules.rested(row.care(), off));
        } else throw ApiException.badRequest("할 수 없는 돌봄이에요.");
        return save(uid, glowBonus(uid, p), 0);
    }
    public record FeedInput(String date, int meals) {}
    @Transactional public View feed(String uid, FeedInput input) {
        var p = lock(uid, ZonedDateTime.now(clock));
        // Compare-and-set: retrying the same click, including from another tab, cannot eat twice.
        if (input == null || !p.state().date().toString().equals(input.date()) || p.state().meals() != input.meals())
            return save(uid, p, 0);
        return save(uid, new Pet(p.name(), PetRules.feed(p.state())), 0);
    }
    @Transactional public View rename(String uid, String name) {
        if (name == null || name.strip().isEmpty() || name.strip().length() > 20 || name.codePoints().anyMatch(Character::isISOControl))
            throw ApiException.badRequest("이름은 1~20자로 지어 주세요.");
        var p = lock(uid, ZonedDateTime.now(clock));
        return save(uid, new Pet(name.strip(), p.state()), 0);
    }
    static Answers validate(Answers a) {
        if (a == null) throw ApiException.badRequest("마음기록을 입력해 주세요.");
        if (a.mood() != null && !MOODS.contains(a.mood()) || a.reason() != null && !REASONS.contains(a.reason()) || a.need() != null && !NEEDS.contains(a.need()))
            throw ApiException.badRequest("마음기록의 선택지를 확인해 주세요.");
        if (a.intensity() != null && (a.intensity() < 1 || a.intensity() > 5)) throw ApiException.badRequest("감정의 크기를 골라 주세요.");
        String note = a.note() == null || a.note().isBlank() ? null : a.note().strip();
        if (note != null && note.length() > 500) throw ApiException.badRequest("한 조각 기록은 500자까지 남길 수 있어요.");
        return new Answers(a.mood(), a.intensity(), a.reason(), note, a.need());
    }
    static int completed(Answers a) {
        return (a.mood() != null ? 1 : 0) | (a.intensity() != null ? 2 : 0) | (a.reason() != null ? 4 : 0)
            | (a.note() != null ? 8 : 0) | (a.need() != null ? 16 : 0);
    }
    private static String text(String value) { return value == null ? "아직 남기지 않았어요" : value; }
    @Transactional public View journal(String uid, JournalInput input) {
        var now = ZonedDateTime.now(clock);
        if (input == null || !now.toLocalDate().toString().equals(input.date()))
            throw ApiException.badRequest("날짜가 바뀌었어요. 오늘의 방을 다시 열어 주세요.");
        Answers a = validate(input.answers());
        if (completed(a) == 0) throw ApiException.badRequest("마음을 하나만 골라 주세요.");
        var p = lock(uid, now); // Serializes rewards, manual meals and automatic meals across devices.
        var s = p.state();
        int old = mask(uid, s.date()), next = completed(a), reward = PetRules.reward(old, next);
        for (int bit = 0; bit < 5; bit++) {
            if ((next & (1 << bit)) != 0 && (old & (1 << bit)) == 0)
                grant(uid, "journal:" + s.date() + ":" + bit, 4);
        }
        String raw;
        try { raw = json.writeValueAsString(a); } catch (Exception e) { throw new IllegalStateException(e); }
        String memo = "[모루와 마음기록 · " + s.date() + "]\n오늘 마음: " + text(a.mood())
            + "\n감정의 크기: " + (a.intensity() == null ? "아직 남기지 않았어요" : a.intensity() + "/5")
            + "\n마음의 이유: " + text(a.reason()) + "\n오늘의 한 조각: " + text(a.note()) + "\n지금 필요한 것: " + text(a.need());
        jdbc.sql("INSERT INTO memos(id, user_id, cat, text, pet_answers) VALUES (?, ?, 'mind', ?, CAST(? AS jsonb)) "
            + "ON CONFLICT(id) DO UPDATE SET text = EXCLUDED.text, pet_answers = EXCLUDED.pet_answers, updated_at = CURRENT_TIMESTAMP")
            .param(memoId(uid, s.date())).param(uid).param(memo).param(raw).update();
        jdbc.sql("INSERT INTO pet_daily_rewards(user_id, date, rewarded) VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET rewarded = EXCLUDED.rewarded")
            .param(uid).param(s.date()).param(old | next).update();
        // New food can satisfy today's outstanding meals, but never past missed meals.
        var updated = PetRules.settle(new PetRules.State(s.food() + reward, Math.min(720, s.xp() + reward * 4), s.date(), s.meals()), now.toLocalDate(), now.getHour());
        return save(uid, new Pet(p.name(), updated), reward);
    }
}
