package kr.co.shuim.points;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class PointsPolicyTest {
    @Test void countsUnicodeCharactersWithoutWhitespaceOrInvisiblePadding() {
        assertFalse(PointsPolicy.meaningful("😀".repeat(10)));
        assertTrue(PointsPolicy.meaningful("😀".repeat(20)));
        assertFalse(PointsPolicy.meaningful("가".repeat(19) + " \n\t\u00a0\u200b"));
        assertTrue(PointsPolicy.meaningful("가 ".repeat(20)));
    }
    @Test void resetsAtKoreanMidnightRatherThanUtcMidnight() {
        assertEquals(LocalDate.of(2026, 11, 3), PointsPolicy.day(Instant.parse("2026-11-03T14:59:59Z").toEpochMilli()));
        assertEquals(LocalDate.of(2026, 11, 4), PointsPolicy.day(Instant.parse("2026-11-03T15:00:00Z").toEpochMilli()));
    }
    @Test void everyRewardSharesTheDailyCapAndWritingHasAnAdditionalEventLimit() {
        assertEquals(20, PointsPolicy.reward(50, 180, false, 3));
        assertEquals(0, PointsPolicy.reward(10, 200, true, 0));
        assertEquals(0, PointsPolicy.reward(10, 30, true, 3));
        assertEquals(10, PointsPolicy.reward(10, 20, true, 2));
    }
}
