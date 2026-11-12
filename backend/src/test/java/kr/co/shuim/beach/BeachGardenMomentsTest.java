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

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachGardenMomentsTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private void actor(String id, boolean anonymous, Long blockedAt) {
        var user = id == null ? null : new DbUser(id, id + "@example.com", id, "user", anonymous, blockedAt, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }
    private BeachRoom.Presence enter(String id) { return beach.enter("room", id, id, Set.of(), null, "garden"); }
    private BeachRoom.TickResult poll(BeachRoom.Presence p) { return beach.tick(p.ticket(), Double.NaN, Double.NaN, Double.NaN, false, null, null); }
    private BeachRoom.RestPresence sit(BeachRoom.Presence p, String spotId) {
        var spot = BeachRoom.PAVILIONS.stream().filter(s -> s.spot().equals(spotId)).findFirst().orElseThrow();
        beach.tick(p.ticket(), spot.x(), spot.z(), 0, false, null, null);
        return beach.rest(p.ticket(), "sit", spotId);
    }
    private BeachGardenMoments.Launch launch(BeachRoom.Presence p, String requestId, String kind) {
        return beach.launchGardenMoment(p.ticket(), p.userId(), requestId, kind, p.excluded());
    }
    private BeachGardenMoments.Launch launch(BeachRoom.Presence p, String kind) { return launch(p, UUID.randomUUID().toString(), kind); }

    @BeforeEach void setup() {
        actor("author", false, null);
        when(blocks.excludedIds(anyString())).thenReturn(Set.of());
        for (String room : List.of("room", "other")) {
            when(circles.byId(room)).thenReturn(new CircleService.Circle(room, room, "함께", "life", null, false,
                "open", "public", "", "", "author", 0, 0, 200, 0, false));
            when(circles.member(eq(room), anyString())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
    }

    @Test void allSixPondBenchesHaveExactlyTwoSharedSeatsAndReleaseOnStandingOrLeaving() {
        var spots = BeachRoom.PAVILIONS.stream().filter(s -> BeachRoom.isPondBenchSpot(s.spot())).toList();
        assertEquals(6, spots.size());
        var centres = Map.of("pond-bench-sw", new double[]{-21.31678586, 9.13041650},
            "pond-bench-se", new double[]{27.05566953, 15.49022060}, "pond-bench-w", new double[]{-34.83661939, 34},
            "pond-bench-e", new double[]{39.92414302, 34}, "pond-bench-nw", new double[]{-30.53993522, 53.43450423},
            "pond-bench-ne", new double[]{27.90771696, 51.75945625});
        for (var spot : spots) {
            assertEquals(centres.get(spot.spot())[0], spot.x()); assertEquals(centres.get(spot.spot())[1], spot.z());
            assertEquals(2, spot.seats().length);
            double toLakeX = -spot.x(), toLakeZ = 34 - spot.z(), distance = Math.hypot(toLakeX, toLakeZ);
            assertEquals(1, Math.hypot(spot.fx(), spot.fz()), 1e-12);
            assertEquals(1, (spot.fx() * toLakeX + spot.fz() * toLakeZ) / distance, 1e-12, "each bench faces the lake centre");
            var first = enter(spot.spot() + "-a"); var second = enter(spot.spot() + "-b"); var third = enter(spot.spot() + "-c");
            var seatA = sit(first, spot.spot()); var seatB = sit(second, spot.spot());
            assertEquals(Set.of(0, 1), Set.of(seatA.slot(), seatB.slot()));
            for (var seat : List.of(seatA, seatB)) {
                var expected = BeachRoom.pavilionSeat(spot, seat.slot());
                assertEquals("sitting", seat.pose()); assertEquals(expected.x(), seat.x()); assertEquals(expected.z(), seat.z()); assertEquals(expected.yaw(), seat.yaw());
                assertEquals(1, (-Math.sin(seat.yaw()) * toLakeX - Math.cos(seat.yaw()) * toLakeZ) / distance, 1e-12,
                    "both seated characters look into the pond");
            }
            assertEquals(1.2, Math.hypot(seatA.x() - seatB.x(), seatA.z() - seatB.z()), 1e-12);
            assertEquals(spot.x(), (seatA.x() + seatB.x()) / 2, 1e-12);
            assertEquals(spot.z(), (seatA.z() + seatB.z()) / 2, 1e-12);
            assertEquals(409, assertThrows(ApiException.class, () -> sit(third, spot.spot())).status());
            beach.rest(first.ticket(), "stand", null);
            assertEquals(seatA.slot(), sit(third, spot.spot()).slot());
            beach.leave(second.ticket());
            var returned = enter(second.userId());
            assertEquals(seatB.slot(), sit(returned, spot.spot()).slot());
            beach.leave(first.ticket()); beach.leave(third.ticket()); beach.leave(returned.ticket());
        }
    }

    @Test void momentsRequireALivePondSeatAndCannotBeLaunchedStandingInTheHallOrOnAnotherMap() {
        var p = enter("author");
        assertEquals(409, assertThrows(ApiException.class, () -> launch(p, "coin")).status());
        beach.tick(p.ticket(), -3.6, 62.6, 0, false, null, null); beach.rest(p.ticket(), "sit", "hall-tier-1");
        assertEquals(409, assertThrows(ApiException.class, () -> launch(p, "duck")).status());
        beach.rest(p.ticket(), "stand", null); sit(p, "pond-bench-sw");
        assertNotNull(launch(p, "duck"));
        beach.rest(p.ticket(), "stand", null);
        assertEquals(409, assertThrows(ApiException.class, () -> launch(p, "coin")).status());
        for (String map : List.of("beach", "bamboo", "uyuni")) {
            var other = beach.enter("room", "author", "author", Set.of(), null, map);
            assertEquals(400, assertThrows(ApiException.class, () -> beach.rest(other.ticket(), "sit", "pond-bench-sw")).status());
            assertEquals(400, assertThrows(ApiException.class, () -> launch(other, "coin")).status());
        }
        beach.leave(p.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> launch(p, "coin")).status());
    }

    @Test void canonicalEventsReachObserversAndLateJoinersOnlyWithinTheGardenRoom() {
        var author = enter("author"); var observer = enter("observer"); sit(author, "pond-bench-w");
        var launched = launch(author, "duck"); var event = launched.event();
        assertEquals(author.pid(), event.pid()); assertEquals(author.x(), event.x()); assertEquals(author.z(), event.z());
        assertEquals(-Math.PI / 2, event.yaw(), 1e-10); assertEquals(90_000, event.durationMs());
        assertEquals(List.of(event), launched.events()); assertEquals(List.of(event), poll(observer).gardenMoments());
        assertEquals(List.of(event), poll(observer).withCareCapabilities(new BeachRoom.CareCapabilities(false, false), false).gardenMoments());
        var entered = controller.enter(new BeachController.EnterBody("room", null, "garden"), request, new MockHttpServletResponse());
        assertEquals(true, entered.get("gardenMomentsEnabled")); assertEquals(List.of(event), entered.get("gardenMoments"));
        var otherRoom = beach.enter("other", "observer", "observer", Set.of(), null, "garden");
        var otherMap = beach.enter("room", "observer", "observer", Set.of(), null, "uyuni");
        assertEquals(List.of(), poll(otherRoom).gardenMoments()); assertEquals(List.of(), poll(otherMap).gardenMoments());
    }

    @Test void retriesKeepTheOriginalEventAcrossTicketsAndDoNotResetCooldowns() {
        var author = enter("author"); sit(author, "pond-bench-sw"); String requestId = UUID.randomUUID().toString();
        var first = launch(author, requestId, "coin");
        assertEquals(first, launch(author, requestId, "coin"));
        assertEquals(409, assertThrows(ApiException.class, () -> launch(author, requestId, "duck")).status());
        assertEquals(429, assertThrows(ApiException.class, () -> launch(author, "coin")).status());
        assertNotNull(launch(author, "duck"), "the two kinds have separate cooldowns");
        beach.leave(author.ticket());
        var returned = enter("author"); sit(returned, "pond-bench-e");
        assertEquals(first.event(), launch(returned, requestId, "coin").event());
        clock.addAndGet(6_001); poll(returned);
        var old = launch(returned, requestId, "coin");
        assertEquals(first.event(), old.event()); assertTrue(old.events().stream().noneMatch(e -> e.id().equals(first.event().id())));
        assertEquals(0, old.cooldowns().coin() > clock.get() ? 1 : 0);
    }

    @Test void activeCountsAreBoundedPerKindAndExpiredEffectsArePrunedByServerTime() {
        for (String kind : List.of("coin", "duck")) {
            int cap = kind.equals("coin") ? 12 : 24;
            for (int i = 0; i < cap; i++) {
                var actor = enter(kind + i); sit(actor, "pond-bench-sw"); launch(actor, kind); beach.leave(actor.ticket());
            }
            var overflow = enter(kind + "-overflow"); sit(overflow, "pond-bench-sw");
            assertEquals(429, assertThrows(ApiException.class, () -> launch(overflow, kind)).status());
            assertEquals(cap, poll(overflow).gardenMoments().stream().filter(e -> e.kind().equals(kind)).count());
            beach.leave(overflow.ticket());
        }
        clock.addAndGet(90_001);
        var observer = enter("fresh"); assertTrue(poll(observer).gardenMoments().isEmpty());
        sit(observer, "pond-bench-sw"); assertNotNull(launch(observer, "duck"));
    }

    @Test void blockedUsersDoNotSeeEachOthersPondEffectsIncludingAfterTheSenderLeaves() {
        var author = enter("author"); var observer = enter("observer"); sit(author, "pond-bench-sw");
        var result = beach.launchGardenMoment(author.ticket(), author.userId(), UUID.randomUUID().toString(), "duck", Set.of("observer"));
        assertEquals(1, result.events().size()); assertTrue(poll(observer).gardenMoments().isEmpty());
        beach.leave(author.ticket()); assertTrue(poll(observer).gardenMoments().isEmpty());
    }

    @Test void httpRequiresCurrentMemberAndOwnedTicketAndIgnoresForgedPositionOrRole() throws Exception {
        var author = enter("author"); sit(author, "pond-bench-sw");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String json = "{\"ticket\":\"" + author.ticket() + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"kind\":\"coin\",\"x\":999,\"z\":999,\"admin\":true}";
        actor(null, false, null);
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isUnauthorized());
        actor("author", true, null);
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        actor("stranger", false, null);
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        actor("author", false, 1L);
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        actor("author", false, null);
        when(circles.member("room", "author")).thenReturn(Optional.empty());
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isForbidden());
        when(circles.member("room", "author")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON).content(json))
            .andExpect(status().isOk()).andExpect(jsonPath("$.event.x").value(author.x())).andExpect(jsonPath("$.event.z").value(author.z()))
            .andExpect(jsonPath("$.events.length()").value(1)).andExpect(jsonPath("$.event.durationMs").value(6_000));
    }

    @Test void malformedKindsAndRequestIdentitiesNeverAllocateAnEffect() throws Exception {
        var author = enter("author"); sit(author, "pond-bench-sw");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String value : List.of("null", "7", "true", "{}", "[]", "\"lantern\"", "\"\"")) {
            mvc.perform(post("/api/beach/garden-moments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + author.ticket() + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"kind\":" + value + "}"))
                .andExpect(status().isBadRequest());
        }
        for (String id : List.of("", "not-a-uuid", "1-1-1-1-1"))
            assertEquals(400, assertThrows(ApiException.class, () -> launch(author, id, "coin")).status());
        assertTrue(poll(author).gardenMoments().isEmpty());
    }
}
