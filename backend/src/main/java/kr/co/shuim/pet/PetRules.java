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
