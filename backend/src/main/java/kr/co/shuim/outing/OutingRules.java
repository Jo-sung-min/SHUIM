package kr.co.shuim.outing;

import kr.co.shuim.config.ApiException;
import java.time.*;
import java.util.*;

/** Server-owned 100-day journey. Missing days never reduce progress. */
public final class OutingRules {
    private OutingRules() {}
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    public static final int MAX_DAYS = 100;
    public static final List<Integer> MILESTONES = List.of(0, 7, 14, 30, 50, 75, 100);
    public record Activity(String id, String place, int day, int seconds) {}
    public static final List<Activity> ACTIVITIES = List.of(
        new Activity("park-bench", "park", 0, 12),
        new Activity("park-leaves", "park", 0, 12),
        new Activity("park-picnic", "park", 7, 16),
        new Activity("park-boat", "park", 14, 16),
        new Activity("park-fireflies", "park", 50, 20),
        new Activity("park-promise", "park", 100, 20),
        new Activity("sea-waves", "sea", 0, 12),
        new Activity("sea-sand", "sea", 0, 12),
        new Activity("sea-shells", "sea", 7, 16),
        new Activity("sea-letter", "sea", 30, 16),
        new Activity("sea-stars", "sea", 75, 20),
        new Activity("sea-promise", "sea", 100, 20),
        new Activity("mountain-breath", "mountain", 0, 16),
        new Activity("mountain-clouds", "mountain", 0, 12),
        new Activity("mountain-tea", "mountain", 14, 16),
        new Activity("mountain-echo", "mountain", 30, 16),
        new Activity("mountain-sunrise", "mountain", 50, 20),
        new Activity("mountain-stars", "mountain", 75, 20)
    );
    public static Activity activity(String id) {
        return ACTIVITIES.stream().filter(a -> a.id().equals(id)).findFirst()
            .orElseThrow(() -> ApiException.badRequest("함께 할 활동을 다시 골라 주세요."));
    }
    public static int level(int days) {
        int value = Math.max(0, Math.min(MAX_DAYS, days));
        return (int) MILESTONES.stream().filter(d -> value >= d).count();
    }
    public static boolean unlocked(Activity action, int affinity, int xp) {
        return affinity >= action.day() * 10 && xp >= action.day() * 20;
    }
    public record Growth(int days, LocalDate lastRewardDate, boolean rewarded) {}
    public static Growth complete(int days, LocalDate lastRewardDate, LocalDate today) {
        if (days >= MAX_DAYS || (lastRewardDate != null && !today.isAfter(lastRewardDate)))
            return new Growth(Math.min(MAX_DAYS, days), lastRewardDate, false);
        return new Growth(days + 1, today, true);
    }
    public static void requireReady(Activity action, Instant started, Instant now) {
        if (started == null || now.isBefore(started.plusSeconds(action.seconds())))
            throw new ApiException(409, "조금만 더 함께 쉬었다가 추억을 남겨요.");
        if (now.isAfter(started.plus(Duration.ofMinutes(30))))
            throw ApiException.gone("외출이 잠시 멈춰 있었어요. 활동을 다시 시작해 주세요.");
    }
    public static String note(String note) {
        String value = note == null ? "" : note.strip();
        if (value.length() > 240) throw ApiException.badRequest("추억은 240자 안으로 남겨 주세요.");
        return value;
    }
}
