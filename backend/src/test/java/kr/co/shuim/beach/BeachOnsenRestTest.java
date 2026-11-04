package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachOnsenRestTest {
    private static final String SEATS = "onsen-benches", FLOATS = "onsen-float";
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false);
    private double[] point(String spot, int slot) {
        double angle = Math.toRadians(15 + slot * 30);
        return FLOATS.equals(spot) ? new double[]{(slot - 1) * 2.4, 43.3}
            : new double[]{Math.cos(angle) * 3.55, 45 + Math.sin(angle) * 3.55};
    }
    private BeachRoom.Presence visitor(String id, double x, double z) {
        var presence = room.enter(id, id, Set.of());
        room.tick(presence.ticket(), x, z, .75, false, null, null);
        return presence;
    }

    @Test
    void allSixSeatsAndThreeFloatingPlacesMatchTheClientAndRemainDistinct() {
        for (String spot : new String[]{SEATS, FLOATS}) {
            int capacity = SEATS.equals(spot) ? 6 : 3;
            for (int slot = capacity - 1; slot >= 0; slot--) {
                var p = point(spot, slot);
                var guest = visitor(spot + slot, p[0], p[1]);
                var rest = room.rest(guest.ticket(), SEATS.equals(spot) ? "sit" : "lie", spot);
                assertEquals(slot, rest.slot());
                assertEquals(SEATS.equals(spot) ? "sitting" : "lying", rest.pose());
                assertEquals(p[0], rest.x(), 1e-10); assertEquals(p[1], rest.z(), 1e-10);
                assertEquals(0, rest.yaw());
                assertEquals(rest, room.rest(guest.ticket(), SEATS.equals(spot) ? "sit" : "lie", spot));
            }
        }
        var watcher = visitor("watcher", 0, 45);
        var players = room.tick(watcher.ticket(), 0, 45, 0, false, null, null).players();
        assertEquals(6, players.stream().filter(p -> SEATS.equals(p.spotId()) && "sitting".equals(p.pose())).count());
        assertEquals(3, players.stream().filter(p -> FLOATS.equals(p.spotId()) && "lying".equals(p.pose())).count());
    }

    @Test
    void theNearestAvailablePlaceMustBeWithinTwoPointTwoMeters() {
        var guest = visitor("boundary", 0, 41.1);
        assertEquals(1, room.rest(guest.ticket(), "lie", FLOATS).slot());
        var extra = visitor("extra", 0, 41.1);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "lie", FLOATS)).status(),
            "occupied nearby water does not teleport a guest to a distant empty slot");
        room.rest(guest.ticket(), "stand", null);
        room.tick(guest.ticket(), 0, 41.099, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "lie", FLOATS)).status());
        room.tick(guest.ticket(), 0, 12, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "sit", SEATS)).status());
    }

    @Test
    void restingBlocksMovementAndStandingReturnsInsideThePoolAwayFromTheRimAndSeats() {
        for (String spot : new String[]{SEATS, FLOATS}) {
            var p = point(spot, 0);
            var guest = visitor(spot, p[0], p[1]);
            String action = SEATS.equals(spot) ? "sit" : "lie";
            var rest = room.rest(guest.ticket(), action, spot);
            assertEquals(rest, room.tick(guest.ticket(), -20, 20, -2, true, null, null, "female-3d").selfRest());
            assertFalse(guest.moving());
            assertEquals(3, guest.skin());
            var standing = room.rest(guest.ticket(), "stand", null);
            assertEquals("standing", standing.pose());
            assertNull(standing.spotId()); assertNull(standing.slot());
            assertTrue(Math.hypot(standing.x(), standing.z() - 45) <= 2.7 + 1e-9);
            assertEquals(.75, standing.yaw());
            assertEquals(standing, room.rest(guest.ticket(), "stand", spot));
            var next = visitor(spot + "next", p[0], p[1]);
            assertEquals(0, room.rest(next.ticket(), action, spot).slot());
        }
    }

    @Test
    void mismatchedActionsAndCrossSpotClaimsCannotChangeAnExistingPose() {
        var guest = visitor("guest", 0, 43.3);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "sit", FLOATS)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "lie", SEATS)).status());
        var rest = room.rest(guest.ticket(), "lie", FLOATS);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "sit", SEATS)).status());
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(guest.ticket(), "lie", "starlight")).status());
        assertEquals(rest, room.tick(guest.ticket(), 0, 12, 0, true, null, null).selfRest());
    }

    @Test
    void simultaneousClaimsNeverShareASlotAndLeavingOrExpiryReleasesIt() throws Exception {
        var guests = new ArrayList<BeachRoom.Presence>();
        for (int slot = 0; slot < 3; slot++) {
            var p = point(FLOATS, slot);
            for (int copy = 0; copy < 4; copy++) guests.add(visitor(slot + "-" + copy, p[0], p[1]));
        }
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(12)) {
            var claims = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var guest : guests) claims.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try { return room.rest(guest.ticket(), "lie", FLOATS).slot(); }
                catch (ApiException e) { assertEquals(409, e.status()); return -1; }
            }));
            start.countDown();
            var used = new HashSet<Integer>(); int full = 0;
            for (var claim : claims) { int slot = claim.get(5, TimeUnit.SECONDS); if (slot < 0) full++; else assertTrue(used.add(slot)); }
            assertEquals(3, used.size()); assertEquals(9, full);
        }
        for (var guest : guests) room.leave(guest.ticket());
        var replacement = visitor("replacement", 0, 43.3);
        assertEquals(1, room.rest(replacement.ticket(), "lie", FLOATS).slot());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        var fresh = visitor("fresh", 0, 43.3);
        assertEquals(1, room.rest(fresh.ticket(), "lie", FLOATS).slot());
        assertEquals(410, assertThrows(ApiException.class, () -> room.rest(replacement.ticket(), "stand", null)).status());
    }

    @Test
    void ordinaryVisitTicketsCanUseTheEndpointAndClaimsStayWithinTheirRoom() throws Exception {
        var auth = mock(AuthService.class);
        var service = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
        var controller = new BeachController(auth, mock(BlockService.class), service, mock(CircleService.class));
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String id : new String[]{"room", "other"}) {
            var guest = service.enter(id, "member", "member", Set.of());
            service.tick(guest.ticket(), 0, 43.3, 0, false, null, null);
            mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + guest.ticket() + "\",\"action\":\"lie\",\"spotId\":\"onsen-float\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.slot").value(1)).andExpect(jsonPath("$.pose").value("lying"));
            assertTrue(service.tick(guest.ticket(), 0, 0, 0, false, null, null).players().isEmpty());
        }
        verifyNoInteractions(auth);
    }
}
