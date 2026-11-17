package kr.co.shuim.outing;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;

class OutingRulesTest {
    private final LocalDate day = LocalDate.of(2026, 11, 17);
    @Test void onlyOneDailyRewardAndClockRewindCannotFarmGrowth() {
        var first = OutingRules.complete(0, null, day);
        assertEquals(1, first.days()); assertTrue(first.rewarded());
        assertFalse(OutingRules.complete(first.days(), first.lastRewardDate(), day).rewarded());
        assertFalse(OutingRules.complete(first.days(), first.lastRewardDate(), day.minusDays(1)).rewarded());
    }
    @Test void oneHundredDistinctDaysUnlockEverythingAndThenCap() {
        var growth = new OutingRules.Growth(0, null, false);
        for (int d = 0; d < 100; d++) growth = OutingRules.complete(growth.days(), growth.lastRewardDate(), day.plusDays(d));
        assertEquals(100, growth.days()); assertEquals(7, OutingRules.level(growth.days()));
        assertFalse(OutingRules.complete(100, growth.lastRewardDate(), day.plusDays(100)).rewarded());
        for (var activity : OutingRules.ACTIVITIES) assertTrue(OutingRules.unlocked(activity, 1000, 2000));
    }
    @Test void absenceDoesNotDecayOrGrantUnplayedDays() {
        var growth = OutingRules.complete(14, day, day.plusYears(1));
        assertEquals(15, growth.days());
    }
    @Test void eachMilestoneNeedsBothAffectionAndExperience() {
        for (var activity : OutingRules.ACTIVITIES) {
            int d = activity.day();
            assertTrue(OutingRules.unlocked(activity, d * 10, d * 20));
            if (d > 0) {
                assertFalse(OutingRules.unlocked(activity, d * 10 - 1, d * 20));
                assertFalse(OutingRules.unlocked(activity, d * 10, d * 20 - 1));
            }
        }
        assertEquals(1, OutingRules.level(6)); assertEquals(2, OutingRules.level(7));
        assertEquals(6, OutingRules.level(99)); assertEquals(7, OutingRules.level(100));
    }
    @Test void rewardRequiresElapsedServerTimeAndSessionExpires() {
        var a = OutingRules.activity("park-bench"); Instant start = Instant.parse("2026-11-17T14:59:55Z");
        assertThrows(ApiException.class, () -> OutingRules.requireReady(a, start, start.minusSeconds(1)));
        assertThrows(ApiException.class, () -> OutingRules.requireReady(a, start, start.plusSeconds(11)));
        assertDoesNotThrow(() -> OutingRules.requireReady(a, start, start.plusSeconds(12)));
        assertThrows(ApiException.class, () -> OutingRules.requireReady(a, start, start.plusSeconds(1801)));
        assertEquals(day.plusDays(1), start.plusSeconds(12).atZone(OutingRules.ZONE).toLocalDate());
    }
    @Test void unknownActionsAndOversizeNotesAreRejected() {
        assertThrows(ApiException.class, () -> OutingRules.activity(null));
        assertThrows(ApiException.class, () -> OutingRules.activity("fake-action"));
        assertThrows(ApiException.class, () -> OutingRules.note("a".repeat(241)));
        assertEquals("", OutingRules.note(null)); assertEquals("hello", OutingRules.note(" hello "));
    }
}
