package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BeachBaikalTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.BAIKAL);
    private final BeachFireService fire = mock(BeachFireService.class);
    private final BeachService service = new BeachService(clock::get, fire);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final TestFireworkTickets tickets = new TestFireworkTickets();
    private final BeachController controller = new BeachController(auth, blocks, service, circles, tickets);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private static final String[] SPOTS = {"baikal-sofa", "baikal-side", "baikal-hearth", "baikal-chair", "baikal-porch"};
    /** The client's cabin furniture, as world {x, z, yaw} per seat in slot order: long sofa and armchair face +X, side sofa and hearth stools face -Z, porch bench faces +X. */
    private static final double[][][] WORLD = {
        {{-23, 3.8, -Math.PI / 2}, {-23, 5.3, -Math.PI / 2}, {-23, 6.8, -Math.PI / 2}, {-23, 8.3, -Math.PI / 2}},
        {{-23.6, 11, 0}, {-22, 11, 0}, {-20.4, 11, 0}},
        {{-24.6, 1.4, 0}, {-22.2, 1.4, 0}},
        {{-18.6, 12.2, -Math.PI / 2}},
        {{-14.6, 8.6, -Math.PI / 2}, {-14.6, 10.2, -Math.PI / 2}}};
    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null, null, false, 1L);
        return p;
    }
    private static BeachRoom.Pavilion pavilion(String spotId) {
        return BeachRoom.PAVILIONS.stream().filter(p -> p.spot().equals(spotId) && p.map() == BeachMap.BAIKAL).findFirst().orElseThrow();
    }
    private void actor(String id, String role) {
        var user = id == null ? null : new DbUser(id, id + "@example.com", id, role, false, null, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }
    @BeforeEach void setup() {
        actor("member", "user"); when(auth.isAdmin(any())).thenCallRealMethod();
        when(blocks.excludedIds(anyString())).thenReturn(Set.of());
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "operator", 0, 0, 1, 0, false));
        when(circles.member(eq("room"), anyString())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
    }

    @Test void arrivalTurnsSlightlyLeftTowardTheCabinAndTheLakeBoundsDoNotReuseTheBeach() {
        assertEquals(BeachMap.BAIKAL, BeachMap.from("baikal"));
        assertTrue(BeachMap.BAIKAL.hasPavilions());
        assertFalse(BeachMap.BAIKAL.hasStarlight()); assertFalse(BeachMap.BAIKAL.hasBeds()); assertFalse(BeachMap.BAIKAL.hasBeachFacilities());
        assertEquals(-140, BeachMap.BAIKAL.minZ()); assertEquals(70, BeachMap.BAIKAL.maxZ());
        assertEquals(-120, BeachMap.BAIKAL.minX()); assertEquals(120, BeachMap.BAIKAL.maxX());
        var p = room.enter("new", "new", Set.of());
        assertTrue(p.x() >= -1.5 && p.x() < 1.5); assertTrue(p.z() >= 39.5 && p.z() < 40.5);
        assertEquals(0.17, p.yaw());
        room.tick(p.ticket(), 1000, -1000, .2, true, null, null);
        assertEquals(120, p.x()); assertEquals(-140, p.z());
        room.tick(p.ticket(), -1000, 1000, .2, true, null, null);
        assertEquals(-120, p.x()); assertEquals(70, p.z());
        room.tick(p.ticket(), Double.NaN, Double.POSITIVE_INFINITY, .2, true, null, null);
        assertEquals(-120, p.x()); assertEquals(70, p.z());
    }

    @Test void allTwelveSeatsMatchTheClientAndEachPieceOfFurnitureHasItsOwnCapacity() {
        var cabin = BeachRoom.PAVILIONS.stream().filter(p -> p.map() == BeachMap.BAIKAL).toList();
        assertEquals(5, cabin.size()); assertEquals(12, cabin.stream().mapToInt(p -> p.seats().length).sum());
        for (int place = 0; place < SPOTS.length; place++) {
            String spotId = SPOTS[place]; var pavilion = pavilion(spotId); var occupants = new ArrayList<BeachRoom.Presence>();
            assertEquals(WORLD[place].length, pavilion.seats().length, spotId);
            for (int slot = 0; slot < WORLD[place].length; slot++) {
                double[] expected = WORLD[place][slot]; var seat = BeachRoom.pavilionSeat(pavilion, slot);
                assertEquals(expected[0], seat.x(), 1e-9, spotId + slot); assertEquals(expected[1], seat.z(), 1e-9, spotId + slot);
                assertEquals(expected[2], seat.yaw(), 1e-9, spotId + slot);
                var p = visitor(spotId + slot, expected[0] + .1, expected[1] + .1);
                var seated = room.rest(p.ticket(), "sit", spotId);
                assertEquals(slot, seated.slot()); assertEquals("sitting", seated.pose()); assertNull(seated.bunkerId());
                assertEquals(expected[0], seated.x(), 1e-9); assertEquals(expected[1], seated.z(), 1e-9); assertEquals(expected[2], seated.yaw(), 1e-9);
                assertEquals(seated, room.rest(p.ticket(), "sit", spotId), "retry preserves the assigned seat");
                assertEquals(seated, room.tick(p.ticket(), 70, 120, 1.2, true, null, null, null, false, 2L).selfRest());
                occupants.add(p);
            }
            double[] first = WORLD[place][0]; var extra = visitor(spotId + "extra", first[0], first[1]);
            var full = assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "sit", spotId));
            assertEquals(409, full.status()); assertEquals("가까운 자리가 모두 차 있어요. 벤치의 다른 자리로 다가가 주세요.", full.getMessage());
            var stood = room.rest(occupants.get(0).ticket(), "stand", null);
            assertEquals("standing", stood.pose()); assertEquals(first[0] + .1, stood.x(), 1e-9);
            assertEquals(first[1] + .1, stood.z(), 1e-9); assertEquals(.75, stood.yaw());
            assertEquals(0, room.rest(extra.ticket(), "sit", spotId).slot());
            if (occupants.size() > 1) {
                room.leave(occupants.get(1).ticket());
                double[] second = WORLD[place][1]; var replacement = visitor(spotId + "replacement", second[0], second[1]);
                assertEquals(1, room.rest(replacement.ticket(), "sit", spotId).slot());
                room.leave(replacement.ticket());
            }
            occupants.forEach(p -> room.leave(p.ticket()));
            room.leave(extra.ticket());
            assertEquals(0, room.count());
        }
    }

    @Test void seatsRequireTheCabinMapAndTwoPointFiveMetreApproach() {
        double[] chair = WORLD[3][0]; var near = visitor("near", chair[0] + 2.5, chair[1]);
        assertEquals(0, room.rest(near.ticket(), "sit", "baikal-chair").slot());
        var second = visitor("second", chair[0] + 1, chair[1]);
        assertEquals(409, assertThrows(ApiException.class, () -> room.rest(second.ticket(), "sit", "baikal-chair")).status());
        var far = visitor("far", chair[0] + 2.501, chair[1]);
        var away = assertThrows(ApiException.class, () -> room.rest(far.ticket(), "sit", "baikal-chair"));
        assertEquals(400, away.status()); assertEquals("벤치 가까이에서 앉아 주세요.", away.getMessage());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "lie", "baikal-chair")).status());
        double[] sofa = WORLD[0][3]; var sofaFar = visitor("sofa-far", sofa[0], sofa[1] + 2.501);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(sofaFar.ticket(), "sit", "baikal-sofa")).status());
        assertEquals(3, room.rest(visitor("sofa-near", sofa[0], sofa[1] + 2.5).ticket(), "sit", "baikal-sofa").slot());
        var here = visitor("here", 0, 49);
        for (String spotId : List.of("cloud-pool-1", "cloud-lounge", "pavilion-island", "hall-tier-1", "pond-bench-sw", "pavilion-wind"))
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(here.ticket(), "sit", spotId)).status(), spotId);
        for (BeachMap other : List.of(BeachMap.BEACH, BeachMap.UYUNI, BeachMap.BAMBOO, BeachMap.GARDEN, BeachMap.CLOUDSPA)) {
            var elsewhere = new BeachRoom(clock::get, false, other); var p = elsewhere.enter("u", "u", Set.of());
            elsewhere.tick(p.ticket(), chair[0], chair[1], 0, false, null, null);
            for (String spotId : SPOTS)
                assertEquals(400, assertThrows(ApiException.class, () -> elsewhere.rest(p.ticket(), "sit", spotId)).status(), other + " " + spotId);
        }
    }

    @Test void backgroundResumePreservesSeatingThenExpiryReleasesTheSeatAndRestoresTheApproach() {
        var p = visitor("returning", -22.7, 4); var seated = room.rest(p.ticket(), "sit", "baikal-sofa");
        assertEquals(0, seated.slot());
        room.suspend(p.ticket(), 40, -60, 0, 2L);
        clock.addAndGet(5_000);
        var quick = room.enter("returning", "returning", Set.of(), null, p.ticket(), 3L);
        assertSame(p, quick.presence()); assertEquals(seated, BeachRoom.RestPresence.of(p));
        clock.addAndGet(BeachRoom.IDLE_MS + 1); room.sweep();
        var restored = room.enter("returning", "returning", Set.of(), null, p.ticket(), 4L);
        assertTrue(restored.resumed()); assertNotEquals(p.ticket(), restored.presence().ticket());
        var state = BeachRoom.RestPresence.of(restored.presence());
        assertEquals("standing", state.pose()); assertNull(state.bunkerId());
        assertEquals(-22.7, state.x()); assertEquals(4, state.z()); assertEquals(.75, state.yaw());
        assertEquals(seated.slot(), room.rest(restored.presence().ticket(), "sit", "baikal-sofa").slot());
    }

    @Test void eachMapKeepsItsOwnTwentyVisitorsAndRemoteSeats() {
        var p = service.enter("room", "same", "same", Set.of(), null, "baikal");
        var spa = service.enter("room", "same", "same", Set.of(), null, "cloudspa");
        service.tick(p.ticket(), -23, 4, 0, false, null, null); service.rest(p.ticket(), "sit", "baikal-sofa");
        var observer = service.enter("room", "observer", "observer", Set.of(), null, "baikal");
        var seen = service.tick(observer.ticket(), -20, 5, 0, false, null, null).players();
        assertEquals(1, seen.size()); assertEquals(p.pid(), seen.get(0).pid()); assertEquals("baikal-sofa", seen.get(0).spotId());
        assertTrue(service.tick(spa.ticket(), -20, 5, 0, false, null, null).players().isEmpty());
        for (int i = 2; i < 20; i++) service.enter("room", "visitor" + i, "visitor", Set.of(), null, "baikal");
        assertEquals(20, service.count("room", "baikal")); assertEquals(1, service.count("room", "cloudspa"));
        assertEquals(409, assertThrows(ApiException.class, () -> service.enter("room", "overflow", "o", Set.of(), null, "baikal")).status());
        service.enter("another", "overflow", "o", Set.of(), null, "baikal"); assertEquals(1, service.count("another", "baikal"));
    }

    @Test void unsupportedFacilitiesCannotMutateAnotherMapsState() {
        var p = service.enter("room", "member", "member", Set.of(), null, "baikal");
        String id = UUID.randomUUID().toString();
        for (String spotId : List.of("starlight", "hut-pine", "hotel-dawn", "fire-benches", "onsen-benches", "pavilion-wind", "hall-tier-1", "pond-bench-sw", "bunker-dawn-sofa", "cloud-pool-1", "cloud-lounge"))
            assertEquals(400, assertThrows(ApiException.class, () -> service.rest(p.ticket(), "sit", spotId)).status(), spotId);
        assertEquals(400, assertThrows(ApiException.class, () -> service.addWood(p.ticket(), "member", id)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.addPowder(p.ticket(), "member", id, "rose")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.launchUyuniMoment(p.ticket(), "member", id, "sparkler", "L", null, null, Set.of())).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.launchGardenMoment(p.ticket(), "member", id, "duck", Set.of())).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.bunker(p.ticket(), "member", "enter", "dawn", 1L)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.tick(p.ticket(), 0, 0, 0, false, null, null, null, false, 1L, "dawn")).status());
        var state = service.tick(p.ticket(), 0, 40, 0, false, null, null);
        assertTrue(state.uyuniMoments().isEmpty()); assertTrue(state.gardenMoments().isEmpty()); assertEquals(0, state.fire().logs());
        assertEquals(BeachRoom.AUTO_LIGHTING, state.lighting());
        verifyNoInteractions(fire);
    }

    @Test void entryShowsOnlySupportedFacilitiesWithRealTimeLightingAndRequiresCurrentMembership() {
        var entered = controller.enter(new BeachController.EnterBody("room", null, "baikal"), request, new MockHttpServletResponse());
        assertEquals("baikal", entered.get("mapId")); assertEquals(20, entered.get("capacity")); assertEquals(true, entered.get("pavilionEnabled"));
        for (String capability : List.of("restEnabled", "bedEnabled", "bunkerEnabled", "benchEnabled", "onsenEnabled", "fireEnabled", "uyuniMomentsEnabled", "gardenMomentsEnabled", "lightingControl", "fireworksFree"))
            assertEquals(false, entered.get(capability), capability);
        assertEquals(true, entered.get("fireworksControl")); assertEquals(0, entered.get("fireworkTickets"));
        assertEquals(BeachRoom.AUTO_LIGHTING, entered.get("lighting")); assertEquals(BeachRoom.AUTO_LIGHTING, service.lighting("room", "baikal"));
        @SuppressWarnings("unchecked") Map<String, Object> spawn = (Map<String, Object>) entered.get("spawn");
        assertEquals(0.17, spawn.get("yaw"));
        double z = (Double) spawn.get("z"); assertTrue(z >= 39.5 && z < 40.5);
        assertEquals(Map.of("minX", -120.0, "maxX", 120.0, "minZ", -140.0, "maxZ", 70.0), entered.get("bounds"));
        when(circles.member("room", "member")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.enter(new BeachController.EnterBody("room", null, "baikal"), request, new MockHttpServletResponse())).status());
    }
}
