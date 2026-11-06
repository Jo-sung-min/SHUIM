package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/** Spring-water garden: four hall tiers facing the glass and the island pavilion, mirrored by lib/beach/garden-layout.ts. */
class BeachGardenTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.GARDEN);

    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null);
        return p;
    }

    @Test
    void newcomersStandInsideTheMoonGateAndTheFieldIsWideEnoughForTheLakeAndHall() {
        var p = room.enter("walker", "walker", Set.of());
        assertTrue(p.z() >= -11.5 && p.z() < -10, "spawn z " + p.z());
        assertTrue(Math.abs(p.x()) <= 1.5);
        room.tick(p.ticket(), -100, 200, 0, true, null, null);
        assertEquals(-60, p.x()); assertEquals(100, p.z());
        room.tick(p.ticket(), 100, -100, 0, true, null, null);
        assertEquals(60, p.x()); assertEquals(-30, p.z());
        assertEquals(BeachMap.GARDEN, BeachMap.from("garden"));
        assertTrue(BeachMap.GARDEN.hasPavilions()); assertFalse(BeachMap.GARDEN.hasStarlight());
        assertFalse(BeachMap.GARDEN.hasBeds()); assertFalse(BeachMap.GARDEN.hasBeachFacilities());
        assertEquals(2.8, BeachMap.BAMBOO.spawnMinZ()); assertEquals(4, BeachMap.BEACH.spawnMaxZ());
    }

    @Test
    void hallTiersSeatSixOnABenchRowFacingTheWindowFromTheNearestFreePlace() {
        // hall-tier-1 at (0, 62.6) facing -Z: seats along x at the same row, yaw 0 looks toward the glass.
        double[] seatX = {-10.8, -7.2, -3.6, 3.6, 7.2, 10.8};
        for (int slot = 5; slot >= 0; slot--) {
            var p = visitor("seat-" + slot, seatX[slot] + .4, 63.5);
            var seated = room.rest(p.ticket(), "sit", "hall-tier-1");
            assertEquals(slot, seated.slot(), "nearest bench place");
            assertEquals("sitting", seated.pose());
            assertEquals(seatX[slot], seated.x(), 1e-10);
            assertEquals(62.6, seated.z(), 1e-10);
            assertEquals(0, seated.yaw(), 1e-10);
            assertEquals(seated, room.rest(p.ticket(), "sit", "hall-tier-1"), "retries keep the same seat");
        }
        var late = visitor("late", 3.7, 63.4);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(late.ticket(), "sit", "hall-tier-1")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(late.ticket(), "sit", "hall-tier-2")).status(), "the next tier's bench is out of reach");
    }

    @Test
    void claimsNeedTheVisitorBesideTheBenchAndEachTierIsItsOwnSpot() {
        var far = visitor("far", 0, 70);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "sit", "hall-tier-1")).status());
        var back = visitor("back", -6.5, 77.6);
        var seat = room.rest(back.ticket(), "sit", "hall-tier-4");
        assertEquals(1, seat.slot()); assertEquals(-7.2, seat.x(), 1e-10); assertEquals(77, seat.z(), 1e-10);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(back.ticket(), "sit", "hall-tier-3")).status(), "stand up first");
        var stood = room.rest(back.ticket(), "stand", null);
        assertEquals("standing", stood.pose());
        assertEquals(-6.5, stood.x(), 1e-10); assertEquals(77.6, stood.z(), 1e-10);
        var observer = visitor("observer", -4, 76);
        var seen = room.tick(observer.ticket(), -4, 76, 0, false, null, null).players();
        assertTrue(seen.stream().noneMatch(v -> "sitting".equals(v.pose())), "standing up released the bench");
        for (int tier = 1; tier <= 4; tier++) {
            double z = switch (tier) { case 1 -> 62.6; case 2 -> 67.4; case 3 -> 71.8; default -> 77; };
            var p = visitor("tier-" + tier, 10.5, z + .3);
            var claimed = room.rest(p.ticket(), "sit", "hall-tier-" + tier);
            assertEquals(5, claimed.slot()); assertEquals(z, claimed.z(), 1e-10);
        }
    }

    @Test
    void theIslandPavilionFacesTheBridgeAndOtherMapsCannotClaimGardenSeats() {
        // pavilion-island at (-15, 36) facing -X: the step seats lie on its west edge.
        var seat = BeachRoom.pavilionSeat(BeachRoom.PAVILIONS.get(5), 0);
        assertEquals(-17.42, seat.x(), 1e-10); assertEquals(37.7, seat.z(), 1e-10); assertEquals(Math.PI / 2, seat.yaw(), 1e-10);
        var guest = visitor("guest", -17.3, 37.4);
        assertEquals(0, room.rest(guest.ticket(), "sit", "pavilion-island").slot());
        for (String spot : List.of("starlight", "hut-pine", "fire-benches", "onsen-benches", "onsen-float", "hotel-dawn", "pavilion-moon", "pavilion-summit")) {
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(visitor("x-" + spot, 0, 70).ticket(), "sit", spot)).status(), spot);
        }
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(visitor("lie", -17.3, 37.4).ticket(), "lie", "pavilion-island")).status(), "pavilion seats are for sitting");
        for (BeachMap other : List.of(BeachMap.BEACH, BeachMap.UYUNI, BeachMap.BAMBOO)) {
            var elsewhere = new BeachRoom(clock::get, false, other);
            var p = elsewhere.enter("elsewhere", "e", Set.of());
            elsewhere.tick(p.ticket(), 0, 63, 0, false, null, null);
            assertEquals(400, assertThrows(ApiException.class, () -> elsewhere.rest(p.ticket(), "sit", "hall-tier-1")).status(), other.id());
            assertEquals(400, assertThrows(ApiException.class, () -> elsewhere.rest(p.ticket(), "sit", "pavilion-island")).status(), other.id());
        }
        assertTrue(BeachRoom.pavilionOn(BeachMap.GARDEN, "hall-tier-2"));
        assertFalse(BeachRoom.pavilionOn(BeachMap.BAMBOO, "hall-tier-2"));
        assertTrue(BeachRoom.pavilionOn(BeachMap.BAMBOO, "pavilion-moon"));
        assertFalse(BeachRoom.pavilionOn(BeachMap.GARDEN, "pavilion-moon"));
    }
}
