package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class BeachRestTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false);

    private BeachRoom.Presence visitor(String id) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), 7, 12, .75, false, null, null);
        return p;
    }

    @Test
    void eightPlacesFaceInwardRetriesAreIdempotentAndTheNinthIsFull() {
        Set<Integer> slots = new HashSet<>();
        for (int i = 0; i < 8; i++) {
            var p = visitor("guest-" + i);
            var rest = room.rest(p.ticket(), "lie", "starlight");
            assertEquals("lying", rest.pose());
            assertEquals("starlight", rest.spotId());
            assertEquals(i, rest.slot());
            double angle = i * Math.PI / 4;
            assertEquals(7 + Math.sin(angle) * 2.65, rest.x(), 1e-10);
            assertEquals(7 + Math.cos(angle) * 2.65, rest.z(), 1e-10);
            assertEquals(angle, rest.yaw(), 1e-10);
            assertEquals(rest, room.rest(p.ticket(), "lie", null));
            slots.add(rest.slot());
        }
        assertEquals(8, slots.size());
        var extra = visitor("extra");
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "lie", null)).status());
        var tick = room.tick(extra.ticket(), 7, 12, 0, false, null, null);
        assertEquals(8, tick.players().size());
        assertTrue(tick.players().stream().allMatch(p -> p.pose().equals("lying") && p.spotId().equals("starlight") && !p.moving()));
        assertEquals("standing", tick.selfRest().pose());
        assertNull(tick.selfRest().slot());
        assertNull(tick.selfRest().spotId());
    }

    @Test
    void lyingRejectsStaleMovementUntilExplicitStandAndRestoresPreviousLocation() {
        var p = visitor("one");
        var rest = room.rest(p.ticket(), "lie", null);
        var stale = room.tick(p.ticket(), -20, 30, -2, true, null, null, "female");
        assertEquals(rest, stale.selfRest());
        assertEquals(rest.x(), p.x());
        assertEquals(rest.z(), p.z());
        assertEquals(rest.yaw(), p.yaw());
        assertFalse(p.moving());
        assertEquals(1, p.skin(), "character changes are allowed while lying");

        var standing = room.rest(p.ticket(), "stand", null);
        assertEquals(new BeachRoom.RestPresence("standing", null, null, 7, 12, .75), standing);
        assertEquals(standing, room.rest(p.ticket(), "stand", "starlight"));
        var moving = room.tick(p.ticket(), 8, 13, 1.25, true, null, null);
        assertEquals("standing", moving.selfRest().pose());
        assertEquals(8, moving.selfRest().x());
        assertTrue(p.moving());
        var next = visitor("two");
        assertEquals(0, room.rest(next.ticket(), "lie", null).slot(), "standing releases the place");
    }

    @Test
    void leavingAndExpiringReleasePlacesWithoutRevivingOldTickets() {
        List<BeachRoom.Presence> guests = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            var p = visitor("guest-" + i);
            guests.add(p);
            room.rest(p.ticket(), "lie", null);
        }
        room.leave(guests.get(3).ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(guests.get(3).ticket(), "lie", null)).status());
        var replacement = visitor("replacement");
        assertEquals(3, room.rest(replacement.ticket(), "lie", null).slot());
        clock.addAndGet(9_000);
        for (int i = 1; i < 8; i++) if (i != 3) room.tick(guests.get(i).ticket(), 0, 0, 0, true, null, null);
        room.tick(replacement.ticket(), 0, 0, 0, true, null, null);
        clock.addAndGet(1_001);
        var fresh = visitor("fresh");
        assertEquals(0, room.rest(fresh.ticket(), "lie", null).slot());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(guests.get(0).ticket(), "stand", null)).status());
        assertNull(room.tick(guests.get(0).ticket(), 7, 7, 0, false, null, null));
    }

    @Test
    void concurrentClaimsNeverShareAPlaceOrExceedEight() throws Exception {
        List<BeachRoom.Presence> guests = new ArrayList<>();
        for (int i = 0; i < 20; i++) guests.add(visitor("guest-" + i));
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(24)) {
            var tasks = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var p : guests) tasks.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try { return room.rest(p.ticket(), "lie", null).slot(); }
                catch (ApiException e) { assertEquals(409, e.status()); return -1; }
            }));
            start.countDown();
            Set<Integer> slots = new HashSet<>();
            int occupied = 0, full = 0;
            for (var task : tasks) {
                int slot = task.get(5, TimeUnit.SECONDS);
                if (slot < 0) full++;
                else { occupied++; assertTrue(slots.add(slot), "no duplicate slot"); }
            }
            assertEquals(8, occupied);
            assertEquals(12, full);
        }
    }

    @Test
    void invalidActionsSpotsDistanceAndTicketsNeverReserveAPlace() {
        var far = room.enter("far", "멀리", Set.of());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "lie", null)).status());
        var close = visitor("close");
        for (String action : new String[]{null, "", "sleep", "Lie"})
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(close.ticket(), action, null)).status());
        for (String spot : List.of("", "unknown", "STARLIGHT"))
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(close.ticket(), "lie", spot)).status());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest("missing", "lie", null)).status());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(null, "stand", null)).status());
        room.tick(close.ticket(), 12.5, 7, 0, false, null, null);
        assertEquals(0, room.rest(close.ticket(), "lie", null).slot(), "the inclusive 5.5m boundary is usable");
    }

    @Test
    void eachRoomOwnsItsEightPlacesAndServiceTickPreservesSelfRest() {
        var service = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
        for (int i = 0; i < 8; i++) {
            var p = service.enter("circle-a", "a-" + i, "가", Set.of());
            service.tick(p.ticket(), 7, 12, 0, false, null, null);
            assertEquals(i, service.rest(p.ticket(), "lie", null).slot());
        }
        var b = service.enter("circle-b", "b", "나", Set.of());
        service.tick(b.ticket(), 7, 12, 0, false, null, null);
        var rest = service.rest(b.ticket(), "lie", null);
        assertEquals(0, rest.slot());
        var tick = service.tick(b.ticket(), -20, 20, 0, true, null, null);
        assertEquals(rest, tick.selfRest());
        assertTrue(tick.players().isEmpty());
        assertNotNull(tick.fire());
        service.leave(b.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> service.rest(b.ticket(), "lie", null)).status());
    }

    @Test
    void eachHutHasThreeIndependentBedsWithSharedPosesAndTheCircleIsUnchanged() {
        String[] spots = {"hut-pine", "hut-wave", "hut-sunset"};
        double[] xs = {-13, 0, 13}, zs = {24.8, 26.8, 24.8};
        for (int h = 0; h < 3; h++) {
            final String spot = spots[h];
            for (int i = 0; i < 3; i++) {
                var p = visitor(spot + i);
                room.tick(p.ticket(), xs[h], zs[h] - 1.2, .4, false, null, null);
                var rest = room.rest(p.ticket(), "lie", spot);
                assertEquals(i, rest.slot());
                assertEquals(spot, rest.spotId());
                assertEquals(xs[h] + (i - 1) * 1.9, rest.x(), 1e-10);
                assertEquals(zs[h] + 1.5, rest.z(), 1e-10);
                assertEquals(Math.PI, rest.yaw(), 1e-10);
                assertEquals(rest, room.rest(p.ticket(), "lie", spot));
                assertEquals(rest, room.tick(p.ticket(), -20, 0, 0, true, null, null).selfRest());
                assertEquals(409, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "starlight")).status());
            }
            var extra = visitor(spot + "extra");
            room.tick(extra.ticket(), xs[h], zs[h] - 1.2, 0, false, null, null);
            assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "lie", spot)).status());
            var observed = room.tick(extra.ticket(), xs[h], zs[h] - 1.2, 0, false, null, null);
            assertEquals(3, observed.players().stream().filter(p -> spot.equals(p.spotId()) && "lying".equals(p.pose())).count());
        }
        var circle = visitor("circle");
        assertEquals(0, room.rest(circle.ticket(), "lie", null).slot());
    }

    @Test
    void bedReleaseExpiryDistanceAndRoomIsolationPreserveOwnership() {
        var p = visitor("one");
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "hut-pine")).status());
        room.tick(p.ticket(), -13, 21.8, .5, false, null, null);
        room.rest(p.ticket(), "lie", "hut-pine");
        var stood = room.rest(p.ticket(), "stand", null);
        assertEquals(new BeachRoom.RestPresence("standing", null, null, -13, 21.8, .5), stood);
        assertEquals(0, room.rest(p.ticket(), "lie", "hut-pine").slot());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        var fresh = visitor("fresh");
        room.tick(fresh.ticket(), -13, 21.8, 0, false, null, null);
        assertEquals(0, room.rest(fresh.ticket(), "lie", "hut-pine").slot());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "stand", null)).status());
        var separate = new BeachRoom(clock::get, false);
        var other = separate.enter("other", "other", Set.of());
        separate.tick(other.ticket(), -13, 21.8, 0, false, null, null);
        assertEquals(0, separate.rest(other.ticket(), "lie", "hut-pine").slot());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(other.ticket(), "lie", "hut-pine")).status());
        room.leave(fresh.ticket());
        var last = visitor("last");
        room.tick(last.ticket(), -13, 21.8, 0, false, null, null);
        assertEquals(0, room.rest(last.ticket(), "lie", "hut-pine").slot());
    }

    @Test
    void simultaneousBedClaimsNeverShareOneDuvet() throws Exception {
        var guests = new ArrayList<BeachRoom.Presence>();
        for (int i = 0; i < 12; i++) {
            var p = visitor("bed-" + i);
            room.tick(p.ticket(), 0, 23.8, 0, false, null, null);
            guests.add(p);
        }
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(12)) {
            var claims = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var p : guests) claims.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try { return room.rest(p.ticket(), "lie", "hut-wave").slot(); }
                catch (ApiException e) { assertEquals(409, e.status()); return -1; }
            }));
            start.countDown();
            var used = new HashSet<Integer>();
            int full = 0;
            for (var claim : claims) {
                int slot = claim.get(5, TimeUnit.SECONDS);
                if (slot < 0) full++; else assertTrue(used.add(slot));
            }
            assertEquals(Set.of(0, 1, 2), used);
            assertEquals(9, full);
        }
    }

    @Test
    void deeperBedsUseTheirActualFeetForReachAndStandingRestoresTheRearInteriorPosition() {
        var p = visitor("deep-bed");
        double bedZ = 28.3;
        room.tick(p.ticket(), 0, bedZ - BeachRoom.REST_REACH - .001, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "hut-wave")).status());
        room.tick(p.ticket(), 0, bedZ - BeachRoom.REST_REACH, 0, false, null, null);
        assertEquals(bedZ, room.rest(p.ticket(), "lie", "hut-wave").z(), 1e-10);
        room.rest(p.ticket(), "stand", null);
        room.tick(p.ticket(), 0, 31.9, .4, false, null, null);
        assertEquals(31.9, p.z(), 1e-10, "the expanded interior is no longer clamped at the old back boundary");
        assertEquals(bedZ, room.rest(p.ticket(), "lie", "hut-wave").z(), 1e-10);
        var standing = room.rest(p.ticket(), "stand", null);
        assertEquals(31.9, standing.z(), 1e-10);
        assertEquals(.4, standing.yaw(), 1e-10);
    }

    @Test
    void theHiddenSpaRemainsInsideTheSharedMovementBounds() {
        var p = visitor("spa-guest");
        assertEquals(44, room.tick(p.ticket(), 0, 44, 0, true, null, null).selfRest().z());
        assertEquals(52.2, room.tick(p.ticket(), 0, 52.2, 0, true, null, null).selfRest().z());
        assertEquals(60, room.tick(p.ticket(), 0, 60, 0, true, null, null).selfRest().z(), "the stairs up to the upper baths");
        assertEquals(63, room.tick(p.ticket(), 0, 150, 0, true, null, null).selfRest().z());
    }
}
