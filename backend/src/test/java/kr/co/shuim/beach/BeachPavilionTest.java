package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/** Bamboo-mountain pavilions and the summit deck: six shared seats apiece, claimed from the nearest free place. */
class BeachPavilionTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.BAMBOO);
    /** pavilion-moon at (-18, 80) facing +X: seats beside the steps, then the two open sides. */
    private static final double[][] MOON_SEATS = {
        {-15.58, 78.3, -Math.PI / 2}, {-15.58, 81.7, -Math.PI / 2},
        {-18.9, 77.58, 0}, {-17.1, 77.58, 0},
        {-18.9, 82.42, Math.PI}, {-17.1, 82.42, Math.PI}};

    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null);
        return p;
    }

    @Test
    void seatsSurroundThreeOpenEdgesAndMatchTheFrontendTable() {
        for (int slot = 5; slot >= 0; slot--) {
            var p = visitor("seat-" + slot, MOON_SEATS[slot][0] + .3, MOON_SEATS[slot][1] - .2);
            var seated = room.rest(p.ticket(), "sit", "pavilion-moon");
            assertEquals(slot, seated.slot(), "nearest seat, rather than first numbered vacancy");
            assertEquals("sitting", seated.pose());
            assertEquals("pavilion-moon", seated.spotId());
            assertEquals(MOON_SEATS[slot][0], seated.x(), 1e-10);
            assertEquals(MOON_SEATS[slot][1], seated.z(), 1e-10);
            assertEquals(MOON_SEATS[slot][2], seated.yaw(), 1e-10);
            assertEquals(seated, room.rest(p.ticket(), "sit", "pavilion-moon"), "retries keep the same seat");
        }
        var observer = visitor("observer", -19.5, 78.2);
        var seen = room.tick(observer.ticket(), -19.5, 78.2, 0, false, null, null).players();
        assertEquals(6, seen.size());
        assertTrue(seen.stream().allMatch(p -> "sitting".equals(p.pose()) && "pavilion-moon".equals(p.spotId()) && !p.moving()));
        assertEquals(6, seen.stream().map(BeachRoom.PlayerView::slot).distinct().count());
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(observer.ticket(), "sit", "pavilion-moon")).status());
        // The meadow pavilion faces +X, so its step seats sit on its east edge.
        var wind = BeachRoom.pavilionSeat(BeachRoom.PAVILIONS.get(1), 0);
        assertEquals(-30.58, wind.x(), 1e-10); assertEquals(48.3, wind.z(), 1e-10); assertEquals(-Math.PI / 2, wind.yaw(), 1e-10);
        // The summit deck seats a row of six along its north railing, all looking out over the city.
        for (int slot = 0; slot < 6; slot++) {
            var seat = BeachRoom.pavilionSeat(BeachRoom.PAVILIONS.get(4), slot);
            assertEquals(3.75 - 1.5 * slot, seat.x(), 1e-10); assertEquals(102.2, seat.z(), 1e-10); assertEquals(Math.PI, seat.yaw(), 1e-10);
        }
    }

    @Test
    void claimsNeedTheVisitorBesideTheDeckAndNeverTeleportAcrossThePavilion() {
        var far = visitor("far", -18, 75);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "sit", "pavilion-moon")).status());
        assertEquals("standing", room.tick(far.ticket(), -18, 75, 0, false, null, null).selfRest().pose());
        var first = visitor("first", -19.0, 77.7);
        assertEquals(2, room.rest(first.ticket(), "sit", "pavilion-moon").slot());
        var second = visitor("second", -19.0, 77.7);
        assertEquals(3, room.rest(second.ticket(), "sit", "pavilion-moon").slot(), "the other seat on the same side");
        var third = visitor("third", -19.1, 77.6);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(third.ticket(), "sit", "pavilion-moon")).status(),
            "seats beside the steps are out of reach from the south edge");
        room.tick(third.ticket(), -18.6, 82.8, 0, false, null, null);
        assertEquals(4, room.rest(third.ticket(), "sit", "pavilion-moon").slot(), "walking around the deck finds the north edge");
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(third.ticket(), "sit", "pavilion-pine")).status(), "stand up first");
        var stood = room.rest(third.ticket(), "stand", null);
        assertEquals("standing", stood.pose());
        assertEquals(-18.6, stood.x(), 1e-10); assertEquals(82.8, stood.z(), 1e-10);
        assertEquals(4, room.rest(visitor("again", -18.6, 82.8).ticket(), "sit", "pavilion-moon").slot(), "standing up released the seat");
        var viewer = visitor("viewer", 3.6, 101.9);
        assertEquals(0, room.rest(viewer.ticket(), "sit", "pavilion-summit").slot(), "the deck is a fifth seating spot");
    }

    @Test
    void pavilionsExistOnlyInTheBambooForestAndTheForestHasNoOtherRestSpots() {
        var walker = visitor("walker", -18, 80);
        for (String spot : List.of("starlight", "hut-pine", "fire-benches", "onsen-benches", "onsen-float", "hotel-dawn")) {
            for (String action : List.of("lie", "sit"))
                assertEquals(400, assertThrows(ApiException.class, () -> room.rest(walker.ticket(), action, spot)).status(), spot);
        }
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(walker.ticket(), "lie", "pavilion-moon")).status(), "pavilion seats are for sitting");
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(walker.ticket(), "sit", "pavilion-roof")).status());
        for (BeachMap other : List.of(BeachMap.BEACH, BeachMap.UYUNI)) {
            var elsewhere = new BeachRoom(clock::get, false, other);
            var p = elsewhere.enter("elsewhere", "e", Set.of());
            elsewhere.tick(p.ticket(), 1, 45, 0, false, null, null);
            assertEquals(400, assertThrows(ApiException.class, () -> elsewhere.rest(p.ticket(), "sit", "pavilion-moon")).status());
        }
        assertTrue(BeachMap.BAMBOO.hasPavilions()); assertFalse(BeachMap.BAMBOO.hasStarlight()); assertFalse(BeachMap.BAMBOO.hasBeds());
        assertFalse(BeachMap.BAMBOO.hasBeachFacilities());
        assertEquals(-4, BeachMap.BAMBOO.minZ()); assertEquals(115, BeachMap.BAMBOO.maxZ());
        assertEquals(-44, BeachMap.BAMBOO.minX()); assertEquals(44, BeachMap.BAMBOO.maxX());
        assertEquals(BeachRoom.MIN_X, BeachMap.BEACH.minX()); assertEquals(BeachRoom.MAX_Z, BeachMap.UYUNI.maxZ());
        assertEquals(BeachMap.BAMBOO, BeachMap.from("bamboo"));
        room.tick(walker.ticket(), -100, 200, 0, true, null, null);
        assertEquals(-44, walker.x()); assertEquals(115, walker.z());
    }
}
