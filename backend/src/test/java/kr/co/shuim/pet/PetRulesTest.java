package kr.co.shuim.pet;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class PetRulesTest {
    final LocalDate day = LocalDate.of(2026, 11, 11);
    @Test void todaysRecordsFillFiveSlotsOnceAndNeverTakeThemBack() {
        assertEquals(0, PetRules.fillRecords(0, 0));
        assertEquals(0b00111, PetRules.fillRecords(0, 3));
        assertEquals(0b11111, PetRules.fillRecords(0, 9));
        assertEquals(0b00111, PetRules.fillRecords(0b00111, 1)); // 지워도 받은 칸은 그대로
        assertEquals(0b01011, PetRules.fillRecords(0b01001, 3)); // 예전 5문항 칸도 다섯 칸 안에 센다
        assertEquals(1, PetRules.reward(0b01001, PetRules.fillRecords(0b01001, 3)));
    }
    @Test void careStatesDecayGentlyAndNeverBelowZero() {
        var c = new PetRules.Care(4, 4, 3, 3);
        assertEquals(c, PetRules.careRollover(c, 0, true));
        assertEquals(new PetRules.Care(2, 3, 4, 0), PetRules.careRollover(c, 1, true));
        assertEquals(new PetRules.Care(1, 2, 2, 0), PetRules.careRollover(c, 2, false));
        assertEquals(new PetRules.Care(0, 0, 2, 0), PetRules.careRollover(c, 400, false));
    }
    @Test void touchWarmsThreeTimesADayAndAFullHeartSpendsNothing() {
        var c = new PetRules.Care(0, 2, 2, 0);
        for (int i = 0; i < 5; i++) c = PetRules.warm(c);
        assertEquals(3, c.warmth()); assertEquals(3, c.warmthToday());
        var full = new PetRules.Care(4, 2, 2, 0);
        assertEquals(full, PetRules.warm(full));
        assertEquals(3, PetRules.dust(new PetRules.Care(0, 2, 2, 0)).clean());
        assertEquals(4, PetRules.dust(new PetRules.Care(0, 4, 2, 0)).clean());
        assertEquals(4, PetRules.bath(new PetRules.Care(0, 0, 2, 0)).clean());
        assertTrue(PetRules.glow(new PetRules.Care(4, 4, 4, 1)));
        assertFalse(PetRules.glow(new PetRules.Care(4, 3, 4, 1)));
    }
    @Test void aNightRunsFromTenToSevenUnderTheDateItStarted() {
        assertEquals(day, PetRules.night(day, 22)); assertEquals(day, PetRules.night(day, 23));
        assertEquals(day.minusDays(1), PetRules.night(day, 0)); assertEquals(day.minusDays(1), PetRules.night(day, 6));
        assertNull(PetRules.night(day, 7)); assertNull(PetRules.night(day, 21));
    }
    @Test void snackEatsOneFoodWithoutUsingAMealSlot() {
        var s = PetRules.snack(new PetRules.State(3, 10, day, 1));
        assertEquals(2, s.food()); assertEquals(11, s.xp()); assertEquals(1, s.meals());
        var empty = new PetRules.State(0, 10, day, 1);
        assertEquals(empty, PetRules.snack(empty));
        assertEquals(720, PetRules.snack(new PetRules.State(1, 720, day, 3)).xp());
    }
    @Test void automaticMealSlotsAreEightThirteenNineteen() {
        assertEquals(0, PetRules.due(7)); assertEquals(1, PetRules.due(8));
        assertEquals(1, PetRules.due(12)); assertEquals(2, PetRules.due(13));
        assertEquals(2, PetRules.due(18)); assertEquals(3, PetRules.due(19));
    }
    @Test void manualMealReplacesAutomaticMealWithoutDoubleConsumption() {
        var s = PetRules.feed(new PetRules.State(9, 0, day, 0));
        assertEquals(8, s.food());
        s = PetRules.settle(s, day, 8);
        assertEquals(8, s.food()); assertEquals(1, s.meals());
        s = PetRules.settle(s, day, 20);
        assertEquals(6, s.food()); assertEquals(3, s.meals());
        assertEquals(s, PetRules.feed(s)); assertEquals(s, PetRules.settle(s, day, 23));
    }
    @Test void thirtyCompletedDaysAccumulateSixtyExtraMeals() {
        var s = new PetRules.State(9, 0, day, 0);
        for (int i = 0; i < 30; i++) {
            s = PetRules.settle(s, day.plusDays(i), 7);
            s = new PetRules.State(s.food() + 5, Math.min(720, s.xp() + 20), s.date(), s.meals());
            s = PetRules.settle(s, s.date(), 20);
        }
        assertEquals(69, s.food()); assertEquals(3, s.meals()); assertEquals(10, PetRules.level(s.xp()));
    }
    @Test void longAbsenceStopsAtZeroAndNeverCreatesDebt() {
        var s = PetRules.settle(new PetRules.State(9, 50, day, 0), day.plusYears(2), 20);
        assertEquals(0, s.food()); assertEquals(68, s.xp());
        s = PetRules.settle(new PetRules.State(5, s.xp(), s.date(), s.meals()), s.date(), 20);
        assertEquals(2, s.food()); assertEquals(3, s.meals());
    }
    @Test void dateRolloverSettlesPreviousDayOnce() {
        var s = PetRules.settle(new PetRules.State(10, 0, day, 1), day.plusDays(1), 0);
        assertEquals(8, s.food()); assertEquals(0, s.meals());
        assertEquals(s, PetRules.settle(s, s.date(), 0));
    }
    @Test void clocksCannotRewindMeals() {
        var s = new PetRules.State(5, 20, day, 3);
        assertEquals(s, PetRules.settle(s, day.minusDays(1), 20));
        assertEquals(s, PetRules.settle(s, day, 8));
    }
    @Test void rewardsAreIndependentOfMoodAndCannotBeFarmedByDeletingFields() {
        assertEquals(5, PetRules.reward(0, 31)); assertEquals(0, PetRules.reward(31, 31));
        assertEquals(0, PetRules.reward(31, 0)); assertEquals(2, PetRules.reward(7, 31));
        assertEquals(31, PetService.completed(PetService.validate(new PetService.Answers("슬퍼", 5, "잘 모르겠어", "쉬고 싶어", "휴식"))));
        assertEquals(31, PetService.completed(PetService.validate(new PetService.Answers("기뻐", 1, "나 자신", "좋은 하루", "휴식"))));
    }
    @Test void whitespaceAndInvalidAnswersDoNotEarnFood() {
        assertEquals(0, PetService.completed(PetService.validate(new PetService.Answers(null, null, null, "   ", null))));
        assertThrows(ApiException.class, () -> PetService.validate(new PetService.Answers("arbitrary", 1, null, null, null)));
        assertThrows(ApiException.class, () -> PetService.validate(new PetService.Answers(null, 6, null, null, null)));
        assertThrows(ApiException.class, () -> PetService.validate(new PetService.Answers(null, null, null, "x".repeat(501), null)));
    }
}
