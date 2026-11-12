package kr.co.shuim.light;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class LightPolicyTest {
    @Test void giftAmountsAreWholeNumbersFromOneToTheMaximumAndNeverRounded() {
        assertEquals(1, LightPolicy.giftAmount(1));
        assertEquals(LightPolicy.MAX_GIFT, LightPolicy.giftAmount((long) LightPolicy.MAX_GIFT));
        for (Object bad : Arrays.asList(0, -1, LightPolicy.MAX_GIFT + 1, 3.0, 2.5, "3", null, true, Long.MAX_VALUE, Double.NaN)) {
            assertEquals(400, assertThrows(ApiException.class, () -> LightPolicy.giftAmount(bad)).status(), String.valueOf(bad));
        }
    }

    @Test void theSamePersonLimitCountsDownAndNeverGoesNegative() {
        assertEquals(LightPolicy.PER_PERSON_DAILY, LightPolicy.leftForPerson(0));
        assertEquals(3, LightPolicy.leftForPerson(LightPolicy.PER_PERSON_DAILY - 3));
        assertEquals(0, LightPolicy.leftForPerson(LightPolicy.PER_PERSON_DAILY));
        assertEquals(0, LightPolicy.leftForPerson(LightPolicy.PER_PERSON_DAILY + 50L));
    }

    @Test void dayBoundariesFollowKoreanMidnight() {
        assertEquals(LocalDate.parse("2026-11-12"), LightPolicy.day(Instant.parse("2026-11-12T14:59:59Z").toEpochMilli()));
        assertEquals(LocalDate.parse("2026-11-13"), LightPolicy.day(Instant.parse("2026-11-12T15:00:00Z").toEpochMilli()));
    }

    @Test void requestKeysMustBeCanonicalUuids() {
        UUID id = UUID.randomUUID();
        assertEquals(id, LightPolicy.requestKey(id.toString()));
        assertEquals(id, LightPolicy.requestKey(id.toString().toUpperCase()));
        for (Object bad : Arrays.asList(null, "", "1-1-1-1-1", id.toString().replace("-", ""), id + " ", 7)) {
            assertEquals(400, assertThrows(ApiException.class, () -> LightPolicy.requestKey(bad)).status(), String.valueOf(bad));
        }
    }
}
