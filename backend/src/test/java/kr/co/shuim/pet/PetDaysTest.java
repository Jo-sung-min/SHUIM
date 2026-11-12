package kr.co.shuim.pet;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PetDaysTest {
    /** 화면(frontend/lib/moru-rules.ts 의 unitHash·dailySky)에서 뽑은 값: 서버와 화면이 같은 날씨를 그려야 한다 */
    @Test void hashAndSkyMatchTheFrontend() {
        assertEquals(0.8908105595037341, PetDays.unitHash("a"), 1e-12);
        assertEquals(0.9680085417348891, PetDays.unitHash("user-a|2026-11-12|weather"), 1e-12);
        assertEquals(0.10904798679985106, PetDays.unitHash("abc-123|2026-01-05|land"), 1e-12);
        var a = PetDays.sky("user-a", LocalDate.parse("2026-11-12"), 10, false);
        assertEquals("city", a.land()); assertEquals("snow", a.weather());
        var b = PetDays.sky("3f2b", LocalDate.parse("2026-11-13"), 10, false);
        assertEquals("forest", b.land()); assertEquals("clear", b.weather());
    }
    @Test void skyIsFixedWithinADayAndNightFollowsTheClock() {
        var day = LocalDate.parse("2026-11-12");
        var morning = PetDays.sky("u1", day, 9, false);
        var evening = PetDays.sky("u1", day, 21, false);
        assertEquals(morning.weather(), evening.weather());
        assertEquals(morning.land(), evening.land());
        assertFalse(morning.night()); assertTrue(evening.night()); assertTrue(PetDays.night(3)); assertFalse(PetDays.night(7));
    }
    @Test void rareSkiesFollowTheirWeatherAndTheFirstSnowComesOnce() {
        int seen = 0;
        for (int d = 0; d < 3000; d++) {
            var date = LocalDate.parse("2026-01-01").plusDays(d);
            for (int hour : new int[] {12, 23}) {
                var s = PetDays.sky("rare-" + d, date, hour, false);
                if (s.rare() == null) continue;
                seen++;
                switch (s.rare()) {
                    case "rainbow" -> { assertEquals("clear", s.weather()); assertFalse(s.night()); }
                    case "shootingStar" -> { assertEquals("clear", s.weather()); assertTrue(s.night()); }
                    case "aurora" -> { assertEquals("snow", s.weather()); assertEquals("forest", s.land()); assertTrue(s.night()); }
                    default -> fail("first snow only when the account never saw snow: " + s);
                }
            }
        }
        assertTrue(seen > 50, "rare skies happen sometimes: " + seen);
        for (int d = 0; d < 400; d++) {
            var s = PetDays.sky("snow", LocalDate.parse("2026-01-01").plusDays(d), 12, true);
            if (s.weather().equals("snow")) { assertEquals("firstSnow", s.rare()); return; }
        }
        fail("a snowy day should exist");
    }
    @Test void entriesAreTheWeatherAndAnyRareSky() {
        assertEquals(List.of("rain-city"), PetDays.entries(new PetDays.Sky("city", "rain", false, null)));
        assertEquals(List.of("clear-forest", "rainbow"), PetDays.entries(new PetDays.Sky("forest", "clear", false, "rainbow")));
        assertTrue(PetDays.WEATHERS.containsAll(List.of("rain-city", "snow-forest", "aurora", "firstSnow")));
    }
    @Test void tasksAlwaysIncludeARecordAndSkipWhatCannotBeDone() {
        var day = LocalDate.parse("2026-11-12");
        for (int i = 0; i < 200; i++) {
            var tasks = PetDays.pick("u" + i, day, false, false);
            assertEquals(3, tasks.size());
            assertEquals("record", tasks.get(0));
            assertEquals(3, new HashSet<>(tasks).size());
            assertFalse(tasks.contains("dust")); assertFalse(tasks.contains("snack"));
        }
        assertEquals(PetDays.pick("same", day, true, true), PetDays.pick("same", day, true, true));
        var tasks = List.of("record", "hug", "bath");
        assertEquals(2, PetDays.bit(tasks, "hug")); assertEquals(0, PetDays.bit(tasks, "dust"));
        assertFalse(PetDays.complete(tasks, 0b011)); assertTrue(PetDays.complete(tasks, 0b111));
    }
}
