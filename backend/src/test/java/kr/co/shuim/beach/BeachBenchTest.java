package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class BeachBenchTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false);
    private static final String BENCH = "fire-benches";
    private static final double S = Math.sqrt(3);
    private static final double[][] SEATS = {
        {2 - S / 4, 12 + 2 * S + .25}, {2 + S / 4, 12 + 2 * S - .25},
        {4, 12.5}, {4, 11.5},
        {2 + S / 4, 12 - 2 * S + .25}, {2 - S / 4, 12 - 2 * S - .25},
        {-2 + S / 4, 12 - 2 * S - .25}, {-2 - S / 4, 12 - 2 * S + .25},
        {-4, 11.5}, {-4, 12.5},
        {-2 - S / 4, 12 + 2 * S - .25}, {-2 + S / 4, 12 + 2 * S + .25}
    };

    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null);
        return p;
    }

    @Test
    void twelveSeatsUseTheNearestPlaceAndObserversSeeSittingAtEachBench() {
        for (int slot = 11; slot >= 0; slot--) {
            var p = visitor("seat-" + slot, SEATS[slot][0], SEATS[slot][1]);
            var seated = room.rest(p.ticket(), "sit", BENCH);
            assertEquals(slot, seated.slot(), "nearest seat, rather than first numbered vacancy");
            assertEquals("sitting", seated.pose());
            assertEquals(BENCH, seated.spotId());
            assertEquals(SEATS[slot][0], seated.x(), 1e-10);
            assertEquals(SEATS[slot][1], seated.z(), 1e-10);
            assertEquals(Math.PI / 6 + (slot / 2) * Math.PI / 3, seated.yaw(), 1e-10);
            assertEquals(seated, room.rest(p.ticket(), "sit", BENCH));
        }
        var observer = visitor("observer", 4, 12);
        var seen = room.tick(observer.ticket(), 4, 12, 0, false, null, null).players();
        assertEquals(12, seen.size());
        assertTrue(seen.stream().allMatch(p -> "sitting".equals(p.pose()) && BENCH.equals(p.spotId()) && !p.moving()));
        assertEquals(12, seen.stream().map(BeachRoom.PlayerView::slot).distinct().count());
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(observer.ticket(), "sit", BENCH)).status());
    }

    @Test
    void occupiedNearbySeatsNeverTeleportToVacanciesAtAnotherBench() {
        var nearest = visitor("nearest", 4, 11.6);
        assertEquals(3, room.rest(nearest.ticket(), "sit", BENCH).slot());
        var second = visitor("second", 4, 11.6);
        assertEquals(2, room.rest(second.ticket(), "sit", BENCH).slot());
        var extra = visitor("extra", 4, 12);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "sit", BENCH)).status());
        assertEquals("standing", room.tick(extra.ticket(), 4, 12, 0, false, null, null).selfRest().pose());
        room.tick(extra.ticket(), -4, 11.5, 0, false, null, null);
        assertEquals(8, room.rest(extra.ticket(), "sit", BENCH).slot(), "another bench requires walking there first");
    }

    @Test
    void reachIncludesExactlyTwoPointTwoFiveMetersAndDistinguishesFullFromFar() {
        var p = visitor("boundary", 6.25, 12.5);
        assertEquals(2, room.rest(p.ticket(), "sit", BENCH).slot());
        var extra = visitor("only-one-nearby", 6.25, 12.5);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "sit", BENCH)).status(),
            "the other seat of this bench is outside reach");
        room.rest(p.ticket(), "stand", null);
        room.tick(p.ticket(), 6.25001, 12.5, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", BENCH)).status());
        room.tick(p.ticket(), 0, 12, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", BENCH)).status(),
            "being at the fire does not put a seat within reach");
    }

    @Test
    void sittingIgnoresStaleMovementAndStandingRestoresLocationAndReleasesTheSeat() {
        var p = visitor("seated", 4, 11.6);
        var seated = room.rest(p.ticket(), "sit", BENCH);
        assertEquals(seated, room.tick(p.ticket(), -20, 30, -2, true, null, null, "female").selfRest());
        assertEquals(1, p.skin());
        assertFalse(p.moving());
        assertEquals(seated, room.rest(p.ticket(), "sit", BENCH));
        var standing = room.rest(p.ticket(), "stand", null);
        assertEquals(new BeachRoom.RestPresence("standing", null, null, 4, 11.6, .75), standing);
        assertEquals(standing, room.rest(p.ticket(), "stand", BENCH));
        var next = visitor("next", 4, 11.6);
        assertEquals(3, room.rest(next.ticket(), "sit", BENCH).slot());
        assertEquals("standing", room.tick(p.ticket(), 5, 12, 1, true, null, null).selfRest().pose());
        assertTrue(p.moving());
    }

    @Test
    void leavingExpiryAndCommunityIsolationPreserveSlotOwnershipThroughTheService() {
        var service = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
        var a = service.enter("circle-a", "a", "가", Set.of());
        service.tick(a.ticket(), 4, 11.5, 0, false, null, null);
        var seated = service.rest(a.ticket(), "sit", BENCH);
        assertEquals(3, seated.slot());
        assertEquals(seated, service.tick(a.ticket(), -20, 20, 0, true, null, null).selfRest());
        var b = service.enter("circle-b", "b", "나", Set.of());
        service.tick(b.ticket(), 4, 11.5, 0, false, null, null);
        assertEquals(3, service.rest(b.ticket(), "sit", BENCH).slot());
        assertTrue(service.tick(b.ticket(), 4, 11.5, 0, false, null, null).players().isEmpty());
        service.leave(a.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> service.rest(a.ticket(), "sit", BENCH)).status());
        var replacement = service.enter("circle-a", "replacement", "다", Set.of());
        service.tick(replacement.ticket(), 4, 11.5, 0, false, null, null);
        assertEquals(3, service.rest(replacement.ticket(), "sit", BENCH).slot());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        var fresh = service.enter("circle-a", "fresh", "라", Set.of());
        service.tick(fresh.ticket(), 4, 11.5, 0, false, null, null);
        assertEquals(3, service.rest(fresh.ticket(), "sit", BENCH).slot());
        assertEquals(410, assertThrows(ApiException.class, () -> service.rest(replacement.ticket(), "stand", null)).status());
        assertNull(service.tick(replacement.ticket(), 4, 11.5, 0, false, null, null));
    }

    @Test
    void invalidActionSpotPairsCannotReserveOrChangeAPose() {
        var p = visitor("one", 4, 11.5);
        for (String spot : new String[]{null, "starlight", "hut-pine", "hut-wave", "hut-sunset", ""})
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", spot)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", BENCH)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "Sit", BENCH)).status());
        var seated = room.rest(p.ticket(), "sit", BENCH);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "starlight")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "hut-wave")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", BENCH)).status());
        assertEquals(seated, room.rest(p.ticket(), "sit", BENCH));
        room.rest(p.ticket(), "stand", null);
        room.tick(p.ticket(), 7, 12, 0, false, null, null);
        var lying = room.rest(p.ticket(), "lie", "starlight");
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", BENCH)).status());
        assertEquals(lying, room.rest(p.ticket(), "lie", "starlight"));
    }

    @Test
    void simultaneousRequestsGiveEachBenchOnlyTwoSeatsAndRetryEachTicketIdempotently() throws Exception {
        var guests = new ArrayList<BeachRoom.Presence>();
        for (int bench = 0; bench < 6; bench++) {
            double[] first = SEATS[bench * 2], second = SEATS[bench * 2 + 1];
            for (int i = 0; i < 4; i++) guests.add(visitor("bench-" + bench + "-" + i,
                (first[0] + second[0]) / 2, (first[1] + second[1]) / 2));
        }
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(24)) {
            var claims = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var p : guests) claims.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try {
                    var result = room.rest(p.ticket(), "sit", BENCH);
                    assertEquals(result, room.rest(p.ticket(), "sit", BENCH));
                    return result.slot();
                } catch (ApiException e) { assertEquals(409, e.status()); return -1; }
            }));
            start.countDown();
            var used = new HashSet<Integer>();
            int full = 0;
            for (var claim : claims) {
                int slot = claim.get(5, TimeUnit.SECONDS);
                if (slot < 0) full++; else assertTrue(used.add(slot), "no shared seats");
            }
            assertEquals(12, used.size());
            assertEquals(12, full);
        }
    }
}
