package kr.co.shuim.pet;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Pure economy rules. All calendar boundaries use Asia/Seoul on the server. */
public final class PetRules {
    private PetRules() {}
    public static final int[] LEVELS = {0, 20, 60, 110, 170, 240, 320, 420, 550, 720};
    public record State(int food, int xp, LocalDate date, int meals) {}
    public static int due(int hour) { return hour >= 19 ? 3 : hour >= 13 ? 2 : hour >= 8 ? 1 : 0; }
    public static State settle(State s, LocalDate today, int hour) {
        if (today.isBefore(s.date())) return s;
        long days = ChronoUnit.DAYS.between(s.date(), today);
        int food = s.food(), xp = s.xp(), meals = s.meals();
        if (days > 0) {
            int eaten = (int) Math.min(food, 3L - meals + (days - 1) * 3);
            food -= eaten;
            xp = Math.min(720, xp + eaten * 2);
            meals = 0; // Missed meals never become a debt.
        }
        int eaten = Math.min(food, Math.max(0, due(hour) - meals));
        return new State(food - eaten, Math.min(720, xp + eaten * 2), today, meals + eaten);
    }
    public static State feed(State s) {
        if (s.meals() >= 3 || s.food() == 0) return s;
        return new State(s.food() - 1, Math.min(720, s.xp() + 2), s.date(), s.meals() + 1);
    }
    /** 간식: 마음밥 하나를 끼니와 따로 먹는다 (끼니 수는 그대로, 경험치 +1). 하루 한 번인지는 서비스가 장부로 지킨다 */
    public static State snack(State s) {
        if (s.food() == 0) return s;
        return new State(s.food() - 1, Math.min(720, s.xp() + 1), s.date(), s.meals());
    }
    /* ---------- 돌봄 상태 (2단계): 온기·말끔함·기운, 0~4 칸. 낮아도 잃는 것은 없다 ---------- */
    public static final int CARE_MAX = 4;
    public static final int WARM_DAILY = 3;
    public record Care(int warmth, int clean, int energy, int warmthToday) {}
    /** 날짜가 바뀌면: 온기는 하루에 절반, 말끔함은 하루에 한 칸(먼지 한 뭉치). 기운은 어젯밤 불을 꺼 줬으면 가득, 아니면 스스로 자서 절반 */
    public static Care careRollover(Care c, long days, boolean sleptDark) {
        if (days <= 0) return c;
        int warmth = days >= 3 ? 0 : c.warmth() >> (int) days;
        int clean = (int) Math.max(0, c.clean() - Math.min(days, CARE_MAX));
        return new Care(warmth, clean, sleptDark ? CARE_MAX : 2, 0);
    }
    /** 안아 주기·간질이기·말 걸기·간식: 온기 한 칸, 하루 세 칸까지 (이미 가득이면 오늘 몫을 쓰지 않는다) */
    public static Care warm(Care c) {
        if (c.warmth() >= CARE_MAX || c.warmthToday() >= WARM_DAILY) return c;
        return new Care(c.warmth() + 1, c.clean(), c.energy(), c.warmthToday() + 1);
    }
    /** 먼지 한 뭉치 치우기 */
    public static Care dust(Care c) { return c.clean() >= CARE_MAX ? c : new Care(c.warmth(), c.clean() + 1, c.energy(), c.warmthToday()); }
    public static Care bath(Care c) { return new Care(c.warmth(), CARE_MAX, c.energy(), c.warmthToday()); }
    public static Care rested(Care c, boolean dark) { return new Care(c.warmth(), c.clean(), dark ? CARE_MAX : 2, c.warmthToday()); }
    /** 셋 다 가득이면 반짝인다 */
    public static boolean glow(Care c) { return c.warmth() == CARE_MAX && c.clean() == CARE_MAX && c.energy() == CARE_MAX; }
    /** 불을 끄고 켤 수 있는 밤의 열쇠: 22~23시는 그날, 0~6시는 전날. 그 밖의 시간에는 밤이 아니다(null) */
    public static LocalDate night(LocalDate today, int hour) { return hour >= 22 ? today : hour < 7 ? today.minusDays(1) : null; }
    public static int level(int xp) {
        int level = 1;
        while (level < LEVELS.length && xp >= LEVELS[level]) level++;
        return level;
    }
    public static int reward(int previousMask, int nextMask) {
        return Integer.bitCount(nextMask & ~previousMask & 31);
    }
    /**
     * 오늘의 기록: 기록한 카테고리 수만큼 하루 보상 칸(5개)을 앞에서부터 채운 새 칸. 이미 받은 칸은 그대로 두고,
     * 기록을 지워 수가 줄어도 거두지 않는다 (예전 5문항으로 받은 칸도 같은 다섯 칸 안에 센다).
     */
    public static int fillRecords(int mask, int recorded) {
        int next = mask & 31;
        int target = Math.max(0, Math.min(5, recorded));
        for (int bit = 0; bit < 5 && Integer.bitCount(next) < target; bit++) next |= 1 << bit;
        return next;
    }
}
