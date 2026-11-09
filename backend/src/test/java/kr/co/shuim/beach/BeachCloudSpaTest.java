package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachCloudSpaTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.CLOUDSPA);
    private final BeachFireService fire = mock(BeachFireService.class);
    private final BeachService service = new BeachService(clock::get, fire);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final TestFireworkTickets tickets = new TestFireworkTickets();
    private final BeachController controller = new BeachController(auth, blocks, service, circles, tickets);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private static final double[][] POOLS = {{0,66,17}, {-18,34.8,16}, {0,3.6,17}, {18,-27.6,16}, {0,-60.5,20}};
    private static final int[][] OUTWARD = {{1,2,4,5}, {4,5}, {1,2,4,5}, {1,2}, {2,3,4}};
    private BeachRoom.Presence visitor(String id, double x, double z) {
        var p = room.enter(id, id, Set.of());
        room.tick(p.ticket(), x, z, .75, false, null, null, null, false, 1L);
        return p;
    }
    private static BeachRoom.BenchSeat expectedSeat(int place, int slot) {
        if (place == 5) return new BeachRoom.BenchSeat(slot < 3 ? -10.5 : 10.5, 104 + (slot % 3 - 1) * 2,
            slot < 3 ? -Math.PI / 2 : Math.PI / 2);
        double[] pool = POOLS[place]; double angle = slot * Math.PI / 3;
        double yaw = angle + (java.util.Arrays.stream(OUTWARD[place]).anyMatch(s -> s == slot) ? Math.PI : 0);
        return new BeachRoom.BenchSeat(pool[0] + Math.sin(angle) * pool[2], pool[1] + Math.cos(angle) * pool[2],
            Math.atan2(Math.sin(yaw), Math.cos(yaw)));
    }
    private static String spot(int place) { return place == 5 ? "cloud-lounge" : "cloud-pool-" + (place + 1); }
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

    @Test void arrivalFacesTheDescendingPoolsAndBoundsDoNotReuseTheBeach() {
        assertEquals(BeachMap.CLOUDSPA, BeachMap.from("cloudspa"));
        var p = room.enter("new", "new", Set.of());
        assertTrue(p.x() >= -1.5 && p.x() < 1.5); assertTrue(p.z() >= 90.5 && p.z() < 91.5);
        assertEquals(0, p.yaw());
        room.tick(p.ticket(), 1000, -1000, .2, true, null, null);
        assertEquals(76, p.x()); assertEquals(-98, p.z());
        room.tick(p.ticket(), -1000, 1000, .2, true, null, null);
        assertEquals(-76, p.x()); assertEquals(130, p.z());
        room.tick(p.ticket(), Double.NaN, Double.POSITIVE_INFINITY, .2, true, null, null);
        assertEquals(-76, p.x()); assertEquals(130, p.z());
    }

    @Test void allThirtySixSeatsMatchTheClientAndHaveIndependentSixPersonCapacity() {
        assertEquals(6, BeachRoom.PAVILIONS.stream().filter(p -> p.map() == BeachMap.CLOUDSPA).count());
        for (int place = 0; place < 6; place++) {
            String spotId = spot(place); var occupants = new ArrayList<BeachRoom.Presence>();
            for (int slot = 0; slot < 6; slot++) {
                var expected = expectedSeat(place, slot);
                var p = visitor(spotId + slot, expected.x() + .1, expected.z() + .1);
                var seated = room.rest(p.ticket(), "sit", spotId);
                assertEquals(slot, seated.slot()); assertEquals("sitting", seated.pose()); assertNull(seated.bunkerId());
                assertEquals(expected.x(), seated.x(), 1e-9); assertEquals(expected.z(), seated.z(), 1e-9);
                assertEquals(expected.yaw(), seated.yaw(), 1e-9);
                assertEquals(seated, room.rest(p.ticket(), "sit", spotId), "retry preserves the assigned seat");
                assertEquals(seated, room.tick(p.ticket(), 70, 120, 1.2, true, null, null, null, false, 2L).selfRest());
                occupants.add(p);
            }
            var first = expectedSeat(place, 0); var extra = visitor(spotId + "extra", first.x(), first.z());
            assertEquals(409, assertThrows(ApiException.class, () -> room.rest(extra.ticket(), "sit", spotId)).status());
            var stood = room.rest(occupants.get(0).ticket(), "stand", null);
            assertEquals("standing", stood.pose()); assertEquals(first.x() + .1, stood.x(), 1e-9);
            assertEquals(first.z() + .1, stood.z(), 1e-9); assertEquals(.75, stood.yaw());
            assertEquals(0, room.rest(extra.ticket(), "sit", spotId).slot());
            room.leave(occupants.get(1).ticket());
            var second = expectedSeat(place, 1); var replacement = visitor(spotId + "replacement", second.x(), second.z());
            assertEquals(1, room.rest(replacement.ticket(), "sit", spotId).slot());
            occupants.forEach(p -> room.leave(p.ticket()));
            room.leave(extra.ticket()); room.leave(replacement.ticket());
            assertEquals(0, room.count());
        }
    }

    @Test void seatsRequireTheCorrectMapPoseAndTwoPointFiveMetreApproach() {
        var seat = expectedSeat(0, 0); var near = visitor("near", seat.x(), seat.z() + 2.5);
        assertEquals(0, room.rest(near.ticket(), "sit", "cloud-pool-1").slot());
        var far = visitor("far", seat.x(), seat.z() + 2.501);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "sit", "cloud-pool-1")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(far.ticket(), "lie", "cloud-pool-1")).status());
        for (BeachMap other : List.of(BeachMap.BEACH, BeachMap.UYUNI, BeachMap.BAMBOO, BeachMap.GARDEN)) {
            var elsewhere = new BeachRoom(clock::get, false, other); var p = elsewhere.enter("u", "u", Set.of());
            elsewhere.tick(p.ticket(), seat.x(), seat.z(), 0, false, null, null);
            for (int place = 0; place < 6; place++) {
                String spotId = spot(place);
                assertEquals(400, assertThrows(ApiException.class, () -> elsewhere.rest(p.ticket(), "sit", spotId)).status());
            }
        }
    }

    @Test void backgroundResumePreservesSeatingThenExpiryReleasesTheSeatAndRestoresTheApproach() {
        var p = visitor("returning", 10.8, 106.3); var seated = room.rest(p.ticket(), "sit", "cloud-lounge");
        room.suspend(p.ticket(), -70, -30, 0, 2L);
        clock.addAndGet(5_000);
        var quick = room.enter("returning", "returning", Set.of(), null, p.ticket(), 3L);
        assertSame(p, quick.presence()); assertEquals(seated, BeachRoom.RestPresence.of(p));
        clock.addAndGet(BeachRoom.IDLE_MS + 1); room.sweep();
        var restored = room.enter("returning", "returning", Set.of(), null, p.ticket(), 4L);
        assertTrue(restored.resumed()); assertNotEquals(p.ticket(), restored.presence().ticket());
        var state = BeachRoom.RestPresence.of(restored.presence());
        assertEquals("standing", state.pose()); assertNull(state.bunkerId());
        assertEquals(10.8, state.x()); assertEquals(106.3, state.z()); assertEquals(.75, state.yaw());
        assertEquals(seated.slot(), room.rest(restored.presence().ticket(), "sit", "cloud-lounge").slot());
    }

    @Test void eachMapKeepsItsOwnTwentyVisitorsAndRemoteSeats() {
        var p = service.enter("room", "same", "same", Set.of(), null, "cloudspa");
        var garden = service.enter("room", "same", "same", Set.of(), null, "garden");
        service.tick(p.ticket(), 0, 83, 0, false, null, null); service.rest(p.ticket(), "sit", "cloud-pool-1");
        var observer = service.enter("room", "observer", "observer", Set.of(), null, "cloudspa");
        var seen = service.tick(observer.ticket(), 1, 82, 0, false, null, null).players();
        assertEquals(1, seen.size()); assertEquals(p.pid(), seen.get(0).pid()); assertEquals("cloud-pool-1", seen.get(0).spotId());
        assertTrue(service.tick(garden.ticket(), 1, 82, 0, false, null, null).players().isEmpty());
        for (int i = 2; i < 20; i++) service.enter("room", "visitor" + i, "visitor", Set.of(), null, "cloudspa");
        assertEquals(20, service.count("room", "cloudspa")); assertEquals(1, service.count("room", "garden"));
        assertEquals(409, assertThrows(ApiException.class, () -> service.enter("room", "overflow", "o", Set.of(), null, "cloudspa")).status());
        service.enter("another", "overflow", "o", Set.of(), null, "cloudspa"); assertEquals(1, service.count("another", "cloudspa"));
    }

    @Test void unsupportedFacilitiesCannotMutateAnotherMapsState() {
        var p = service.enter("room", "member", "member", Set.of(), null, "cloudspa");
        String id = UUID.randomUUID().toString();
        for (String spotId : List.of("starlight", "hut-pine", "hotel-dawn", "fire-benches", "onsen-benches", "pavilion-wind", "hall-tier-1", "pond-bench-sw", "bunker-dawn-sofa"))
            assertEquals(400, assertThrows(ApiException.class, () -> service.rest(p.ticket(), "sit", spotId)).status(), spotId);
        assertEquals(400, assertThrows(ApiException.class, () -> service.addWood(p.ticket(), "member", id)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.addPowder(p.ticket(), "member", id, "rose")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.launchUyuniMoment(p.ticket(), "member", id, "sparkler", "L", null, null, Set.of())).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.launchGardenMoment(p.ticket(), "member", id, "duck", Set.of())).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.bunker(p.ticket(), "member", "enter", "dawn", 1L)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.tick(p.ticket(), 0, 0, 0, false, null, null, null, false, 1L, "dawn")).status());
        var state = service.tick(p.ticket(), 0, 91, 0, false, null, null);
        assertTrue(state.uyuniMoments().isEmpty()); assertTrue(state.gardenMoments().isEmpty()); assertEquals(0, state.fire().logs());
        verifyNoInteractions(fire);
    }

    @Test void entryShowsOnlySupportedFacilitiesAndRequiresCurrentMembership() {
        var entered = controller.enter(new BeachController.EnterBody("room", null, "cloudspa"), request, new MockHttpServletResponse());
        assertEquals("cloudspa", entered.get("mapId")); assertEquals(20, entered.get("capacity")); assertEquals(true, entered.get("pavilionEnabled"));
        for (String capability : List.of("restEnabled", "bedEnabled", "bunkerEnabled", "benchEnabled", "onsenEnabled", "fireEnabled", "uyuniMomentsEnabled", "gardenMomentsEnabled", "lightingControl", "fireworksFree"))
            assertEquals(false, entered.get(capability), capability);
        assertEquals(true, entered.get("fireworksControl")); assertEquals(0, entered.get("fireworkTickets"));
        assertEquals(new BeachRoom.Lighting("night", 20, 0), entered.get("lighting"));
        when(circles.member("room", "member")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.enter(new BeachController.EnterBody("room", null, "cloudspa"), request, new MockHttpServletResponse())).status());
    }

    @Test void nightDefaultIsSharedAndOnlyTheCurrentAdminCanChangeItOrLaunchFreeFireworks() throws Exception {
        var initial = new BeachRoom.Lighting("night", 20, 0); assertEquals(initial, service.lighting("room", "cloudspa"));
        var p = service.enter("room", "member", "member", Set.of(), null, "cloudspa");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String body = "{\"ticket\":\"" + p.ticket() + "\",\"mode\":\"day\"}";
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        String launch = "{\"ticket\":\"" + p.ticket() + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"variant\":\"festival\"}";
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(launch)).andExpect(status().isPaymentRequired());
        assertEquals(initial, service.lighting("room", "cloudspa"));
        actor("operator", "admin");
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        actor("member", "admin");
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("day")).andExpect(jsonPath("$.version").value(1));
        assertEquals(BeachRoom.AUTO_LIGHTING, service.lighting("room", "garden"));
        assertEquals(400, assertThrows(ApiException.class, () -> service.setLighting(p.ticket(), "member", "rainy-night")).status());
        assertEquals(new BeachRoom.Lighting("auto", null, 2), service.setLighting(p.ticket(), "member", "auto"));
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(launch)).andExpect(status().isOk());
        assertEquals(1, service.fireworks("room", "cloudspa").events().size()); assertTrue(service.fireworks("room", "garden").events().isEmpty());
    }

    @Test void ordinaryMembersCanSpendOneTicketInCloudSpaAndRetryWithoutAnotherCharge() throws Exception {
        tickets.grant("member", 2);
        var p = service.enter("room", "member", "member", Set.of(), null, "cloudspa");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String launch = "{\"ticket\":\"" + p.ticket() + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"variant\":\"festival\"}";
        for (int i = 0; i < 2; i++) mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(launch))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tickets").value(1));
        assertEquals(1, tickets.balance("member")); assertEquals(1, service.fireworks("room", "cloudspa").events().size());
        assertEquals(List.of("room/cloudspa/festival"), tickets.launches);
    }

    @Test void privateRestEndpointRejectsStolenVisitsAndRevokedMembership() throws Exception {
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "invite", "private", "", "", "operator", 0, 0, 1, 0, false, true, true, 4));
        var entered = controller.enter(new BeachController.EnterBody("room", null, "cloudspa"), request, new MockHttpServletResponse());
        assertEquals(4, entered.get("capacity")); String ticket = (String) entered.get("ticket");
        service.tick(ticket, 0, 83, 0, false, null, null);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String body = "{\"ticket\":\"" + ticket + "\",\"action\":\"sit\",\"spotId\":\"cloud-pool-1\"}";
        actor("other", "user"); mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        actor("member", "user"); when(circles.member("room", "member")).thenReturn(Optional.empty());
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        when(circles.member("room", "member")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spotId").value("cloud-pool-1")).andExpect(jsonPath("$.slot").value(0));
    }
}
