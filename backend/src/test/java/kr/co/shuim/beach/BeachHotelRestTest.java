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
import static org.mockito.Mockito.*;

class BeachHotelRestTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.UYUNI);
    private static final String[] HOTELS = {"hotel-dawn", "hotel-dusk"};
    private static final double[] CENTER_X = {-12, 12}, CENTER_Z = {23, 29};

    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null);
        return p;
    }

    @Test void eachHotelHasTwoIndependentBedsWithExactCoordinatesAndRetrySafePresence() {
        for (int hotel = 0; hotel < HOTELS.length; hotel++) {
            String spot = HOTELS[hotel];
            for (int slot = 0; slot < 2; slot++) {
                var p = visitor(spot + slot, CENTER_X[hotel], CENTER_Z[hotel] - 4);
                var rest = room.rest(p.ticket(), "lie", spot);
                assertEquals(new BeachRoom.RestPresence("lying", spot, slot,
                    CENTER_X[hotel] + (slot - .5) * 3, CENTER_Z[hotel] + 1.5, Math.PI), rest);
                assertEquals(rest, room.rest(p.ticket(), "lie", spot));
                assertEquals(rest, room.tick(p.ticket(), -20, 50, -2, true, null, null).selfRest());
                assertFalse(p.moving());
                assertEquals(409, assertThrows(ApiException.class,
                    () -> room.rest(p.ticket(), "lie", "starlight")).status());
            }
            var extra = visitor(spot + "extra", CENTER_X[hotel], CENTER_Z[hotel] - 4);
            var full = assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "lie", spot));
            assertEquals(409, full.status());
            assertTrue(full.getMessage().contains("호텔"));
            var visible = room.tick(extra.ticket(), CENTER_X[hotel], CENTER_Z[hotel], 0, false, null, null);
            assertEquals(2, visible.players().stream().filter(p -> spot.equals(p.spotId())
                && "lying".equals(p.pose()) && !p.moving()).count());
        }
        var stars = visitor("stars", 7, 12);
        assertEquals(0, room.rest(stars.ticket(), "lie", "starlight").slot());
    }

    @Test void hotelClaimsRequireBothTheInteriorRectangleAndCenterDistanceIncludingBoundaries() {
        double[][] accepted = {{-4.35, 0}, {4.35, 0}, {0, -4.5}, {0, 4.45}, {3.3, 4.4}};
        double[][] rejected = {{-4.35001, 0}, {4.35001, 0}, {0, -4.50001}, {0, 4.45001},
            {4, 4}, {3.3, 4.40001}, {0, -5.4}};
        for (int hotel = 0; hotel < HOTELS.length; hotel++) {
            String spot = HOTELS[hotel];
            var p = visitor(spot, CENTER_X[hotel], CENTER_Z[hotel]);
            for (double[] offset : rejected) {
                room.tick(p.ticket(), CENTER_X[hotel] + offset[0], CENTER_Z[hotel] + offset[1], .75, false, null, null);
                var error = assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", spot));
                assertEquals(400, error.status());
                assertTrue(error.getMessage().contains("호텔"));
            }
            for (double[] offset : accepted) {
                double x = CENTER_X[hotel] + offset[0], z = CENTER_Z[hotel] + offset[1];
                room.tick(p.ticket(), x, z, .75, false, null, null);
                assertEquals(0, room.rest(p.ticket(), "lie", spot).slot());
                assertEquals(new BeachRoom.RestPresence("standing", null, null, x, z, .75),
                    room.rest(p.ticket(), "stand", spot));
            }
        }
    }

    @Test void standingLeavingAndIdleExpiryReleaseBedsAndPreserveTheSavedInteriorPosition() {
        var first = visitor("first", -12, 19);
        var second = visitor("second", -12, 19);
        room.rest(first.ticket(), "lie", "hotel-dawn");
        assertEquals(1, room.rest(second.ticket(), "lie", "hotel-dawn").slot());
        var standing = room.rest(first.ticket(), "stand", null);
        assertEquals(new BeachRoom.RestPresence("standing", null, null, -12, 19, .75), standing);
        assertEquals(standing, room.rest(first.ticket(), "stand", "hotel-dawn"));
        assertEquals(0, room.rest(first.ticket(), "lie", "hotel-dawn").slot());
        room.leave(first.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(first.ticket(), "lie", "hotel-dawn")).status());
        var replacement = visitor("replacement", -12, 19);
        assertEquals(0, room.rest(replacement.ticket(), "lie", "hotel-dawn").slot());
        clock.addAndGet(9_000);
        room.tick(replacement.ticket(), 0, 0, 0, true, null, null);
        clock.addAndGet(1_001);
        var fresh = visitor("fresh", -12, 19);
        assertEquals(1, room.rest(fresh.ticket(), "lie", "hotel-dawn").slot());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(second.ticket(), "stand", null)).status());
        assertNull(room.tick(second.ticket(), -12, 19, 0, false, null, null));
    }

    @Test void simultaneousHotelClaimsNeverShareABedOrExceedTwo() throws Exception {
        var guests = new ArrayList<BeachRoom.Presence>();
        for (int i = 0; i < 16; i++) guests.add(visitor("guest-" + i, -12, 19));
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(16)) {
            var tasks = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var p : guests) tasks.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try { return room.rest(p.ticket(), "lie", "hotel-dawn").slot(); }
                catch (ApiException error) { assertEquals(409, error.status()); return -1; }
            }));
            start.countDown();
            Set<Integer> occupied = new HashSet<>();
            int full = 0;
            for (var task : tasks) {
                int slot = task.get(5, TimeUnit.SECONDS);
                if (slot < 0) full++;
                else assertTrue(occupied.add(slot), "only one visitor owns each bed");
            }
            assertEquals(Set.of(0, 1), occupied);
            assertEquals(14, full);
        }
    }

    @Test void hotelBedsStayInTheirCommunityAndUyuniTicketWithoutFireDatabaseAccess() {
        BeachFireService fire = mock(BeachFireService.class);
        var service = new BeachService(clock::get, fire);
        for (String community : List.of("circle-a", "circle-b")) {
            for (int slot = 0; slot < 2; slot++) {
                var p = service.enter(community, "same-" + slot, "방문자", Set.of(), null, "uyuni");
                service.tick(p.ticket(), -12, 19, .75, false, null, null);
                var rest = service.rest(p.ticket(), "lie", "hotel-dawn");
                assertEquals(slot, rest.slot());
                assertEquals(rest, service.tick(p.ticket(), 0, 12, 0, true, null, null).selfRest());
                assertEquals(community, service.requireVisit(p.ticket(), "same-" + slot).communityId());
                assertEquals("uyuni", service.requireVisit(p.ticket(), "same-" + slot).mapId());
            }
        }
        var beach = service.enter("circle-a", "coast", "바닷가", Set.of(), null, "beach");
        assertEquals(400, assertThrows(ApiException.class, () -> service.rest(beach.ticket(), "lie", "hotel-dawn")).status());
        assertEquals(2, service.count("circle-a", "uyuni"));
        assertEquals(2, service.count("circle-b", "uyuni"));
        assertEquals(1, service.count("circle-a", "beach"));
        verifyNoInteractions(fire);
    }

    @Test void hotelSpotsAndActionsCannotBeUsedOnTheWrongMapOrWithAnotherRoomsTicket() {
        var salt = visitor("salt", -12, 19);
        var coast = new BeachRoom(clock::get, false, BeachMap.BEACH);
        var sea = coast.enter("sea", "바다", Set.of());
        for (String spot : HOTELS) {
            for (String action : List.of("lie", "sit", "stand"))
                assertEquals(400, assertThrows(ApiException.class, () -> coast.rest(sea.ticket(), action, spot)).status());
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(salt.ticket(), "sit", spot)).status());
        }
        for (String spot : List.of("hut-pine", "hut-wave", "hut-sunset", "fire-benches", "onsen-benches", "onsen-float"))
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(salt.ticket(), "lie", spot)).status());
        assertEquals(410, assertThrows(ApiException.class, () -> coast.rest(salt.ticket(), "lie", "hotel-dawn")).status());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(sea.ticket(), "lie", "hotel-dawn")).status());
        assertEquals(0, room.rest(salt.ticket(), "lie", "hotel-dawn").slot());
    }
}
