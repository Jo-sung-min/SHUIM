package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BambooFestivalTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.BAMBOO);
    private final BeachRoom.Presence player = room.enter("owner", "달", Set.of());

    @Test void viewersSeeTheHeldToyAndTheSameFlightWhileTheOwnerWalksAway() {
        var viewer = room.enter("viewer", "별", Set.of());
        var blocked = room.enter("blocked", "숲", Set.of("owner"));
        room.tick(player.ticket(), 2.0, 100.0, 0.5, true, null, null);
        for (String toy : new String[]{"balloon", "fan"}) {
            room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), toy);
            var other = room.tick(viewer.ticket(), 0, 0, 0, false, null, null).players().stream()
                .filter(p -> p.pid().equals(player.pid())).findFirst().orElseThrow();
            assertEquals(toy, other.festival().held());
        }
        var id = UUID.randomUUID();
        var launch = room.changeFestival(player.ticket(), player.userId(), id, "propeller").festival().flight();
        room.tick(player.ticket(), 3, 101, 1.2, true, null, null);
        assertEquals(2, launch.x());
        assertEquals(100, launch.z());
        assertEquals(launch, room.changeFestival(player.ticket(), player.userId(), id, "propeller").festival().flight());
        assertEquals(429, assertThrows(ApiException.class,
            () -> room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "propeller")).status());
        var putAway = room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "put-away").festival();
        assertNull(putAway.held()); assertEquals(launch, putAway.flight());
        assertTrue(room.tick(blocked.ticket(), 0, 0, 0, false, null, null).players().stream().noneMatch(p -> p.pid().equals(player.pid())));
        clock.addAndGet(6000);
        assertNull(player.festivalAt(clock.get()).flight());
        assertNotEquals(id, room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "propeller").festival().flight().id());
    }

    @Test void balloonColorIsSharedAndSurvivesRetriesAndTheEndOfAnEarlierPropellerFlight() {
        room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "propeller");
        var requestId = UUID.randomUUID();
        var hue = room.changeFestival(player.ticket(), player.userId(), requestId, "balloon").festival().balloonHue();
        assertNotNull(hue);
        assertTrue(hue >= 0 && hue < 360);
        assertEquals(hue, room.changeFestival(player.ticket(), player.userId(), requestId, "balloon").festival().balloonHue());
        clock.addAndGet(6000);
        var viewer = room.enter("friend", "별", Set.of());
        var seen = room.tick(viewer.ticket(), 0, 0, 0, false, null, null).players().get(0).festival();
        assertEquals("balloon", seen.held());
        assertNull(seen.flight());
        assertEquals(hue, seen.balloonHue());
        assertNull(room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "fan").festival().balloonHue());
    }

    @Test void otherOwnersMapsAndUnknownToysAreRejected() {
        assertEquals(403, assertThrows(ApiException.class,
            () -> room.changeFestival(player.ticket(), "other", UUID.randomUUID(), "fan")).status());
        assertEquals(400, assertThrows(ApiException.class,
            () -> room.changeFestival(player.ticket(), player.userId(), UUID.randomUUID(), "unknown")).status());
        var beach = new BeachRoom(clock::get, false, BeachMap.BEACH);
        var visitor = beach.enter("walker", "밤", Set.of());
        assertEquals(400, assertThrows(ApiException.class,
            () -> beach.changeFestival(visitor.ticket(), visitor.userId(), UUID.randomUUID(), "balloon")).status());
    }
}
