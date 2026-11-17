package kr.co.shuim.sponsor;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class BannerClickDedupTest {
    private final LocalDate today = LocalDate.of(2026, 11, 17);

    @Test
    void countsOncePerBannerSessionOrIpPerDay() {
        BannerClickDedup clicks = new BannerClickDedup();
        assertTrue(clicks.first("b1", today, "s1", "1.1.1.1"));
        assertFalse(clicks.first("b1", today, "s1", "1.1.1.1"), "the same visitor again");
        assertFalse(clicks.first("b1", today, "s2", "1.1.1.1"), "a fresh cookie from the same address");
        assertFalse(clicks.first("b1", today, "s1", "2.2.2.2"), "the same session from another address");
        assertTrue(clicks.first("b2", today, "s1", "1.1.1.1"), "another banner counts separately");
        assertTrue(clicks.first("b1", today.plusDays(1), "s1", "1.1.1.1"), "a new day starts over");
        assertFalse(clicks.first("b1", today, null, null));
    }
}
