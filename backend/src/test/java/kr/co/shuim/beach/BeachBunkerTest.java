package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.ObjectMapper;
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

class BeachBunkerTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.UYUNI);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService service = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, blocks, service, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private BeachRoom.Presence enter(String user) { return room.enter(user, user, Set.of()); }
    private BeachRoom.TickResult move(BeachRoom.Presence p, double x, double z) {
        return room.tick(p.ticket(), x, z, .75, false, null, null, null, false, p.sequence() + 1, p.bunkerId());
    }
    private BeachRoom.RestPresence transition(BeachRoom.Presence p, String action, String id) {
        return room.bunker(p.ticket(), p.userId(), action, id, p.sequence() + 1);
    }
    private BeachRoom.Presence inside(String user, String id) {
        var p = enter(user); var bunker = BeachBunkers.find(id);
        move(p, bunker.x(), bunker.entryZ()); transition(p, "enter", id); return p;
    }
    private void actor(String id, boolean anonymous) {
        DbUser user = id == null ? null : new DbUser(id, id + "@example.com", id, "user", anonymous, null, null, 0);
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }
    @BeforeEach void setup() {
        actor("author", false);
        when(blocks.excludedIds(anyString())).thenReturn(Set.of());
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "author", 0, 0, 1, 0, false));
        when(circles.member(eq("room"), anyString())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
    }

    @Test void entrancesRequireTheCorrectMapOwnedVisitAndNearbyStandingPosition() {
        var p = enter("author");
        assertEquals(400, assertThrows(ApiException.class, () -> transition(p, "enter", "dawn")).status());
        move(p, -12, 16.2);
        assertEquals(403, assertThrows(ApiException.class, () -> room.bunker(p.ticket(), "other", "enter", "dawn", 2L)).status());
        for (String bad : List.of("unknown", "", "DAWN"))
            assertEquals(400, assertThrows(ApiException.class, () -> transition(p, "enter", bad)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> room.bunker(p.ticket(), p.userId(), "enter", "dawn", null)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> transition(p, "jump", "dawn")).status());
        for (BeachMap map : List.of(BeachMap.BEACH, BeachMap.BAMBOO, BeachMap.GARDEN)) {
            var other = new BeachRoom(clock::get, false, map); var visitor = other.enter("v", "v", Set.of());
            assertEquals(400, assertThrows(ApiException.class, () -> other.bunker(visitor.ticket(), "v", "enter", "dawn", 1L)).status());
            assertEquals(400, assertThrows(ApiException.class, () -> other.tick(visitor.ticket(), 0, 0, 0, false, null, null, null, false, 1L, "dawn")).status());
        }
        var entered = transition(p, "enter", "dawn");
        assertEquals(new BeachRoom.RestPresence("standing", null, null, -12, 17.6, Math.PI, "dawn"), entered);
        assertEquals(409, assertThrows(ApiException.class, () -> transition(p, "enter", "dusk")).status());
    }

    @Test void transitionsFenceDelayedPollsAndBeaconsAndRetriesNeverTeleportAVisitor() {
        var p = enter("author"); move(p, -11.7, 16.6);
        var entered = transition(p, "enter", "dawn"); long enterSequence = p.sequence();
        assertEquals(entered, room.bunker(p.ticket(), p.userId(), "enter", "dawn", enterSequence));
        long updatedAt = p.updatedAt(); clock.addAndGet(100);
        var stale = room.tick(p.ticket(), 20, 40, 0, true, "target", "wave", null, false, enterSequence + 20, null);
        assertEquals(entered, stale.selfRest()); assertEquals(enterSequence + 20, stale.sequence()); assertNull(stale.care());
        assertEquals(clock.get(), p.lastSeen(), "an acknowledged poll repairs a lost transition response without expiring the visitor");
        assertEquals(updatedAt, p.updatedAt(), "a mismatched layer never changes the authoritative pose");
        room.suspend(p.ticket(), 20, 40, 0, enterSequence + 30, null);
        room.suspend(p.ticket(), 20, 40, 0, enterSequence + 31, "dusk");
        move(p, -10, 24);
        assertEquals(-10, p.x()); assertEquals(enterSequence + 21, p.sequence());
        assertEquals(BeachRoom.RestPresence.of(p), room.bunker(p.ticket(), p.userId(), "enter", "dawn", enterSequence));
        assertEquals(409, assertThrows(ApiException.class, () -> room.bunker(p.ticket(), p.userId(), "exit", "dawn", enterSequence)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> transition(p, "exit", "dawn")).status());
        move(p, -12, 16.2); var outside = transition(p, "exit", "dawn"); long exitSequence = p.sequence();
        assertEquals(new BeachRoom.RestPresence("standing", null, null, -11.7, 16.6, .75), outside);
        var lateInside = room.tick(p.ticket(), -12, 30, 0, true, null, null, null, false, exitSequence + 1, "dawn");
        assertEquals(outside, lateInside.selfRest()); assertEquals(exitSequence + 1, lateInside.sequence());
        move(p, -9, 15);
        assertEquals(BeachRoom.RestPresence.of(p), room.bunker(p.ticket(), p.userId(), "exit", "dawn", exitSequence));
    }

    @Test void indoorPositionsStayWithinTheirOwnRoomAndOnlyTheCorrectSofaCanBeClaimed() {
        for (var bunker : BeachBunkers.ALL) {
            var p = inside(bunker.id(), bunker.id());
            move(p, 1000, -1000); assertEquals(bunker.maxX(), p.x()); assertEquals(bunker.minZ(), p.z());
            move(p, -1000, 1000); assertEquals(bunker.minX(), p.x()); assertEquals(bunker.maxZ(), p.z());
            move(p, Double.NaN, Double.NaN); assertEquals(bunker.minX(), p.x()); assertEquals(bunker.maxZ(), p.z());
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", bunker.sofa())).status());
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "lie", "hotel-" + bunker.id())).status());
            assertEquals(400, assertThrows(ApiException.class, () -> room.rest(p.ticket(), "sit", "bunker-" + (bunker.id().equals("dawn") ? "dusk" : "dawn") + "-sofa")).status());
        }
        var surface = enter("surface"); move(surface, -17.3, 23);
        assertEquals(400, assertThrows(ApiException.class, () -> room.rest(surface.ticket(), "sit", "bunker-dawn-sofa")).status());
    }

    @Test void eachRoomHasSixExclusiveSofaPlacesAndStandingOrLeavingReleasesThem() {
        for (var bunker : BeachBunkers.ALL) {
            var occupants = new ArrayList<BeachRoom.Presence>();
            for (int slot = 0; slot < 6; slot++) {
                var p = inside(bunker.id() + slot, bunker.id()); var seat = bunker.seat(slot);
                move(p, seat.x(), seat.z()); var rest = room.rest(p.ticket(), "sit", bunker.sofa());
                assertEquals(new BeachRoom.RestPresence("sitting", bunker.sofa(), slot, seat.x(), seat.z(), seat.yaw(), bunker.id()), rest);
                assertEquals(rest, room.rest(p.ticket(), "sit", bunker.sofa()));
                move(p, bunker.x(), bunker.entryZ()); assertEquals(rest, BeachRoom.RestPresence.of(p));
                assertEquals(409, assertThrows(ApiException.class, () -> transition(p, "exit", bunker.id())).status());
                occupants.add(p);
            }
            var seventh = inside(bunker.id() + "extra", bunker.id()); var seat = bunker.seat(0);
            move(seventh, seat.x(), seat.z());
            assertEquals(409, assertThrows(ApiException.class, () -> room.rest(seventh.ticket(), "sit", bunker.sofa())).status());
            var stood = room.rest(occupants.get(0).ticket(), "stand", null);
            assertEquals(bunker.id(), stood.bunkerId()); assertEquals("standing", stood.pose());
            assertEquals(0, room.rest(seventh.ticket(), "sit", bunker.sofa()).slot());
            room.leave(occupants.get(1).ticket());
            var next = inside(bunker.id() + "next", bunker.id()); var nextSeat = bunker.seat(1);
            move(next, nextSeat.x(), nextSeat.z()); assertEquals(1, room.rest(next.ticket(), "sit", bunker.sofa()).slot());
        }
    }

    @Test void playersAndCareStayOnTheirOwnFloorIncludingOtherTabsOfTheSameUser() {
        var a = inside("a", "dawn"); var b = inside("b", "dawn"); var other = inside("other", "dusk");
        var outside = enter("b"); move(outside, a.x(), a.z());
        var seen = move(a, a.x(), a.z());
        assertEquals(List.of(b.pid()), seen.players().stream().map(BeachRoom.PlayerView::pid).toList());
        assertTrue(move(outside, outside.x(), outside.z()).players().isEmpty());
        for (var target : List.of(other)) {
            var care = room.tick(a.ticket(), a.x(), a.z(), 0, false, target.userId(), "hug", null, true, a.sequence() + 1, "dawn");
            assertEquals("gone", care.care()); assertEquals(0, target.receivedHug());
        }
        var sent = room.tick(a.ticket(), a.x(), a.z(), 0, false, b.userId(), "wave", null, false, a.sequence() + 1, "dawn");
        assertEquals("sent", sent.care()); assertEquals(1, b.pendingEvents()); assertEquals(0, outside.pendingEvents());
        assertEquals(0, other.pendingEvents());
        room.enter(b.userId(), b.nick(), Set.of(a.userId()), null, b.ticket(), b.sequence());
        assertTrue(move(a, a.x(), a.z()).players().isEmpty(), "blocking is preserved inside a shared bunker");
    }

    @Test void quickResumeKeepsTheSeatAndExpiredResumeKeepsTheFloorButReleasesTheSeat() {
        var p = inside("author", "dawn"); move(p, -17.3, 22.8);
        var rest = room.rest(p.ticket(), "sit", "bunker-dawn-sofa");
        room.suspend(p.ticket(), 0, 0, 0, p.sequence() + 1, "dawn"); long sequence = p.sequence();
        clock.addAndGet(5000);
        var quick = room.enter(p.userId(), p.nick(), Set.of(), null, p.ticket(), sequence);
        assertSame(p, quick.presence()); assertEquals(rest, BeachRoom.RestPresence.of(p));
        room.suspend(p.ticket(), 20, 50, 0, p.sequence() + 1, null);
        clock.addAndGet(BeachRoom.IDLE_MS + 1); room.sweep(); assertEquals(0, room.count());
        var restored = room.enter(p.userId(), p.nick(), Set.of(), null, p.ticket(), p.sequence());
        var back = restored.presence(); assertTrue(restored.resumed()); assertNotEquals(p.ticket(), back.ticket());
        assertEquals("dawn", back.bunkerId()); assertEquals("standing", BeachRoom.RestPresence.of(back).pose());
        assertEquals(-17.3, back.x()); assertEquals(22.8, back.z());
        assertEquals(rest.slot(), room.rest(back.ticket(), "sit", "bunker-dawn-sofa").slot());
        room.rest(back.ticket(), "stand", null); move(back, -12, 16.2);
        var returned = transition(back, "exit", "dawn"); assertNull(returned.bunkerId()); assertEquals(16.2, returned.z());
        assertEquals(410, assertThrows(ApiException.class, () -> room.bunker(p.ticket(), p.userId(), "enter", "dawn", p.sequence() + 1)).status());
    }

    @Test void openSkyEffectsCannotBeLaunchedFromEitherBunker() {
        for (var bunker : BeachBunkers.ALL) {
            var p = inside(bunker.id(), bunker.id());
            assertEquals(409, assertThrows(ApiException.class, () -> room.launchFireworks(p.ticket(), p.userId(), UUID.randomUUID().toString(), "festival")).status());
            assertEquals(409, assertThrows(ApiException.class, () -> room.launchUyuniMoment(p.ticket(), p.userId(), UUID.randomUUID().toString(), "sparkler", "L", null, null, Set.of())).status());
            assertEquals(409, assertThrows(ApiException.class, () -> room.launchUyuniMoment(p.ticket(), p.userId(), UUID.randomUUID().toString(), "lantern", null, "rose", "소원", Set.of())).status());
        }
        var outside = enter("outside");
        assertNotNull(room.launchUyuniMoment(outside.ticket(), outside.userId(), UUID.randomUUID().toString(), "sparkler", "L", null, null, Set.of()));
    }

    @Test void rejectedIndoorFireworkDoesNotSpendATicketAndCanRetryOutside() throws Exception {
        var tickets = new TestFireworkTickets(); tickets.grant("author", 1);
        var paidController = new BeachController(auth, blocks, service, circles, tickets);
        var mvc = MockMvcBuilders.standaloneSetup(paidController).setControllerAdvice(new ApiExceptionHandler()).build();
        var p = service.enter("room", "author", "author", Set.of(), null, "uyuni");
        service.tick(p.ticket(), -12, 16.2, .75, false, null, null, null, false, 1L);
        service.bunker(p.ticket(), "author", "enter", "dawn", 2L);
        String body = "{\"ticket\":\"" + p.ticket() + "\",\"requestId\":\"" + UUID.randomUUID() + "\",\"variant\":\"festival\"}";
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        assertEquals(1, tickets.balance("author")); assertTrue(tickets.launches.isEmpty());
        assertTrue(service.fireworks("room", "uyuni").events().isEmpty());
        service.bunker(p.ticket(), "author", "exit", "dawn", 3L);
        for (int i = 0; i < 2; i++) mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.tickets").value(0));
        assertEquals(0, tickets.balance("author")); assertEquals(1, tickets.launches.size());
        assertEquals(1, service.fireworks("room", "uyuni").events().size());
    }

    @Test void httpTransitionsRequireCurrentRegisteredMembershipAndOwnedTicket() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        var p = service.enter("room", "author", "author", Set.of(), null, "uyuni");
        service.tick(p.ticket(), -12, 16.2, .75, false, null, null, null, false, 1L);
        String body = "{\"ticket\":\"" + p.ticket() + "\",\"action\":\"enter\",\"bunkerId\":\"dawn\",\"sequence\":2}";
        actor(null, false); mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        actor("author", true); mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        actor("other", false); mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        actor("author", false); when(circles.member("room", "author")).thenReturn(Optional.empty());
        mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        when(circles.member("room", "author")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        for (String malformed : List.of(body.replace("\"sequence\":2", "\"sequence\":2.5"), body.replace("\"sequence\":2", "\"sequence\":\"2\""),
                body.replace("\"bunkerId\":\"dawn\"", "\"bunkerId\":true")))
            mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(malformed)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/beach/bunker").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.bunkerId").value("dawn")).andExpect(jsonPath("$.z").value(17.6));
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + p.ticket() + "\",\"sequence\":3,\"bunkerId\":\"dawn\",\"x\":-10,\"z\":25}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.selfRest.bunkerId").value("dawn")).andExpect(jsonPath("$.selfRest.x").value(-10));
        mvc.perform(post("/api/beach/suspend").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + p.ticket() + "\",\"sequence\":4,\"bunkerId\":\"dawn\",\"x\":-11,\"z\":24}"))
            .andExpect(status().isOk());
        assertEquals(-11, p.x()); assertEquals("dawn", p.bunkerId());
    }

    @Test void entryCapabilitiesAreExplicitAndGroundJsonRemainsBackwardCompatible() throws Exception {
        var registered = controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, new MockHttpServletResponse());
        assertEquals(true, registered.get("bunkerEnabled"));
        var beach = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(false, beach.get("bunkerEnabled"));
        actor("anonymous", true);
        var anonymous = controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, new MockHttpServletResponse());
        assertEquals(false, anonymous.get("bunkerEnabled"));
        var mapper = new ObjectMapper(); var ground = enter("ground");
        assertFalse(mapper.valueToTree(BeachRoom.RestPresence.of(ground)).has("bunkerId"));
        assertFalse(mapper.valueToTree(BeachRoom.PlayerView.of(ground)).has("bunkerId"));
        var indoor = inside("indoor", "dusk");
        assertEquals("dusk", mapper.valueToTree(BeachRoom.RestPresence.of(indoor)).get("bunkerId").asText());
        assertEquals("dusk", mapper.valueToTree(BeachRoom.PlayerView.of(indoor)).get("bunkerId").asText());
    }
}
