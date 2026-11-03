package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = new BeachService(new BeachFireService(new TestFireRepository()));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    private static DbUser user(String id, Long blockedAt) {
        return new DbUser(id, null, "닉", "user", true, blockedAt, null, 0);
    }

    private static CircleService.Circle circle(String id) {
        return new CircleService.Circle(id, id, "함께 소로우", "life", null, false, "open", "public",
            "", "", "u-1", 0, 0, 1, 0, false);
    }

    private void activeMember(String communityId) {
        doReturn(user("u-1", null)).when(auth).requireUser(any(), any());
        when(auth.currentUser(any())).thenReturn(Optional.of(user("u-1", null)));
        when(circles.byId(communityId)).thenReturn(circle(communityId));
        when(circles.member(communityId, "u-1")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
    }

    private Map<String, Object> enter(String id) {
        return controller.enter(new BeachController.EnterBody(id), request, response);
    }

    @Test
    void enterReturnsScopedTicketCommunityCapacitySpawnAndCount() {
        activeMember("circle-a");
        when(blocks.excludedIds("u-1")).thenReturn(Set.of("u-x"));
        Map<String, Object> out = enter("circle-a");
        assertEquals(Set.of("ticket", "communityId", "community", "capacity", "me", "spawn", "bounds", "count", "fire", "serverTime", "restEnabled", "bedEnabled", "careCapabilities"), out.keySet());
        assertEquals(true, out.get("restEnabled"));
        assertEquals(true, out.get("bedEnabled"));
        assertEquals(new BeachRoom.CareCapabilities(true, false), out.get("careCapabilities"));
        assertEquals(32, ((String) out.get("ticket")).length());
        assertEquals("circle-a", out.get("communityId"));
        assertEquals(Map.of("id", "circle-a", "slug", "circle-a", "name", "함께 소로우"), out.get("community"));
        assertEquals(100, out.get("capacity"));
        @SuppressWarnings("unchecked") Map<String, Object> me = (Map<String, Object>) out.get("me");
        assertEquals(Set.of("pid", "id", "nick", "skin"), me.keySet());
        assertEquals("u-1", me.get("id"));
        assertEquals("닉", me.get("nick"));
        @SuppressWarnings("unchecked") Map<String, Object> spawn = (Map<String, Object>) out.get("spawn");
        assertEquals(Set.of("x", "z", "yaw"), spawn.keySet());
        assertTrue((double) spawn.get("z") >= 2.8 && (double) spawn.get("z") <= 4);
        assertEquals(Map.of("minX", -22.0, "maxX", 22.0, "minZ", -1.0, "maxZ", 31.0), out.get("bounds"));
        assertEquals(1, out.get("count"));
        assertEquals(Map.of("communityId", "circle-a", "count", 1, "capacity", 100), controller.count("circle-a", request));
        BeachRoom.TickResult tick = controller.tick(new BeachController.TickBody((String) out.get("ticket"), 1.0, 2.0, null, null,
            new BeachController.Care("u-x", "comfort")), request);
        assertEquals("gone", tick.care());
        assertEquals(0, tick.received().comfort());
        verify(blocks, times(1)).excludedIds("u-1");
        verifyNoMoreInteractions(blocks);
    }

    @Test
    void blockedAccountsCannotEnterOrCount() {
        when(auth.requireUser(any(), any())).thenReturn(user("u-1", 1L));
        when(auth.currentUser(any())).thenReturn(Optional.of(user("u-1", 1L)));
        assertEquals(403, assertThrows(ApiException.class, () -> enter("circle-a")).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-a", request)).status());
        verifyNoInteractions(blocks, circles);
    }

    @Test
    void requestedCharacterIsReturnedAndChangesAreVisibleToOtherVisitors() {
        activeMember("circle-a");
        var out = controller.enter(new BeachController.EnterBody("circle-a", "female"), request, response);
        assertEquals(1, ((Map<?, ?>) out.get("me")).get("skin"));
        String ticket = (String) out.get("ticket");
        var observer = beach.enter("circle-a", "u-observer", "다른 사람", Set.of(), "female");
        controller.tick(new BeachController.TickBody(ticket, null, null, null, false, null, "male"), request);
        assertEquals(0, beach.tick(observer.ticket(), 0, 10, 0, false, null, null).players().get(0).skin());
        controller.tick(new BeachController.TickBody(ticket, null, null, null, false, null), request);
        assertEquals(0, beach.tick(observer.ticket(), 0, 10, 0, false, null, null).players().get(0).skin());
    }

    @Test
    void jsonContractAcceptsLegacyBodiesAndRejectsInvalidCharacterValues() throws Exception {
        activeMember("circle-a");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
            .content("{\"communityId\":\"circle-a\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.me.skin").value(BeachRoom.skinOf("u-1")));
        mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
            .content("{\"communityId\":\"circle-a\",\"character\":\"male\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.me.skin").value(0));
        var existing = beach.enter("circle-a", "u-existing", "기존", Set.of(), "female");
        int before = beach.count("circle-a");
        for (String invalid : List.of("\"other\"", "\"\"", "7", "true", "{}", "[]")) {
            mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
                .content("{\"communityId\":\"circle-a\",\"character\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
            mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + existing.ticket() + "\",\"character\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        }
        assertEquals(before, beach.count("circle-a"));
        assertEquals(1, existing.skin());
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + existing.ticket() + "\",\"character\":\"male\"}"))
            .andExpect(status().isOk());
        assertEquals(0, existing.skin());
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"expired\",\"character\":\"female\"}"))
            .andExpect(status().isGone());
    }

    @Test
    void restEndpointValidatesBodiesReturnsAuthoritativePoseAndKeepsNullStandingFields() throws Exception {
        activeMember("circle-a");
        String ticket = (String) enter("circle-a").get("ticket");
        beach.tick(ticket, 7, 12, .5, false, null, null);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"lie\",\"spotId\":\"starlight\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("lying"))
            .andExpect(jsonPath("$.slot").value(0)).andExpect(jsonPath("$.x").value(7))
            .andExpect(jsonPath("$.z").value(9.65));
        for (String invalid : List.of("\"sleep\"", "\"\"", "null", "7", "true", "{}", "[]")) {
            mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + ticket + "\",\"action\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"stand\",\"spotId\":\"other\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"x\":20,\"z\":20,\"moving\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.selfRest.pose").value("lying"))
            .andExpect(jsonPath("$.selfRest.z").value(9.65));
        String standing = mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"stand\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pose").value("standing"))
            .andExpect(jsonPath("$.x").value(7)).andExpect(jsonPath("$.z").value(12))
            .andReturn().getResponse().getContentAsString();
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(standing);
        assertTrue(json.has("spotId") && json.get("spotId").isNull());
        assertTrue(json.has("slot") && json.get("slot").isNull());
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isGone());
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"missing\",\"action\":\"lie\"}"))
            .andExpect(status().isGone());
    }

    @Test
    void missingCircleNeverFallsBackToSharedBeach() {
        activeMember("circle-a");
        assertEquals(400, assertThrows(ApiException.class, () -> enter(null)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> enter(" ")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.enter(null, request, response)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.count(null, request)).status());
        when(circles.byId("missing")).thenThrow(ApiException.notFound("소로우를 찾을 수 없어요"));
        assertEquals(404, assertThrows(ApiException.class, () -> enter("missing")).status());
        verifyNoInteractions(blocks);
    }

    @Test
    void nonmembersListenersAndPendingMembersCannotEnterOrReadOccupancy() {
        activeMember("circle-a");
        when(circles.member("circle-a", "u-1")).thenReturn(Optional.empty());
        // Public posts and listening never confer membership of the private beach.
        assertEquals(403, assertThrows(ApiException.class, () -> enter("circle-a")).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-a", request)).status());
        when(circles.member("circle-a", "u-1")).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> enter("circle-a")).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-a", request)).status());
        verifyNoInteractions(blocks);
    }

    @Test
    void membershipOfAnotherCircleDoesNotGrantAccess() {
        activeMember("circle-a");
        when(circles.byId("circle-b")).thenReturn(circle("circle-b"));
        assertEquals(403, assertThrows(ApiException.class, () -> enter("circle-b")).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-b", request)).status());
        assertEquals(0, beach.count("circle-b"));
    }

    @Test
    void countRequiresExistingSession() {
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.count("circle-a", request)).status());
        verifyNoInteractions(circles, blocks);
    }

    @Test
    void fullBeachReturnsConflictWithoutOverflowing() {
        activeMember("circle-a");
        for (int i = 0; i < BeachRoom.CAPACITY; i++) beach.enter("circle-a", "u-" + i, "닉", Set.of());
        ApiException e = assertThrows(ApiException.class, () -> enter("circle-a"));
        assertEquals(409, e.status());
        assertEquals(100, beach.count("circle-a"));
    }

    @Test
    void unknownTicketIsGoneAndLeaveIsAlwaysOk() {
        ApiException e = assertThrows(ApiException.class, () -> controller.tick(new BeachController.TickBody("nope", 0.0, 0.0, 0.0, false, null), request));
        assertEquals(410, e.status());
        assertEquals(BeachController.GONE, e.getMessage());
        assertEquals(410, assertThrows(ApiException.class, () -> controller.tick(null, request)).status());
        assertEquals(Map.of("ok", true), controller.leave(new BeachController.TicketBody("nope")));
        assertEquals(Map.of("ok", true), controller.leave(null));
    }

    @Test
    void fireAndWoodRecheckActiveMembershipAndBlockedStatus() {
        activeMember("circle-a");
        var out = enter("circle-a");
        String ticket = (String) out.get("ticket");
        var enterFire = (BeachFireService.FireView) out.get("fire");
        assertEquals(3, enterFire.logs());
        assertEquals(enterFire.serverTime(), out.get("serverTime"));
        beach.tick(ticket, 0, 12, 0, false, null, null);
        assertEquals(4, controller.wood(new BeachController.WoodBody(ticket, java.util.UUID.randomUUID().toString()), request, response).logs());
        assertEquals(4, controller.fire("circle-a", request).logs());
        when(circles.member("circle-a", "u-1")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.wood(new BeachController.WoodBody(ticket, java.util.UUID.randomUUID().toString()), request, response)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.fire("circle-a", request)).status());
        activeMember("circle-a");
        when(auth.requireUser(any(), any())).thenReturn(user("u-1", 1L));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.wood(new BeachController.WoodBody(ticket, java.util.UUID.randomUUID().toString()), request, response)).status());
    }

    @Test
    void freePowderRechecksSessionMembershipOwnershipAndCannotAlterPaidColor() throws Exception {
        activeMember("circle-a");
        String ticket = (String) enter("circle-a").get("ticket");
        beach.tick(ticket, 0, 12, 0, false, null, null);
        String requestId = java.util.UUID.randomUUID().toString();
        var body = new BeachController.PowderBody(ticket, requestId, "rainbow");
        var added = controller.powder(body, request, response);
        assertEquals("amber", added.color());
        assertTrue(added.powderEnabled());
        assertEquals("rainbow", added.powder().color());
        assertEquals(added.powder(), ((BeachFireService.FireView) enter("circle-a").get("fire")).powder());
        assertEquals(added.powder(), controller.fire("circle-a", request).powder());

        when(circles.member("circle-a", "u-1")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.powder(body, request, response)).status());
        activeMember("circle-a");
        when(auth.requireUser(any(), any())).thenReturn(user("u-1", 1L));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.powder(body, request, response)).status());
        when(auth.requireUser(any(), any())).thenReturn(user("different", null));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.powder(body, request, response)).status());
        when(auth.requireUser(any(), any())).thenThrow(ApiException.unauthorized("로그인해 주세요."));
        assertEquals(401, assertThrows(ApiException.class, () -> controller.powder(body, request, response)).status());

        activeMember("circle-a");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/beach/fire/powder").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"requestId\":\"" + requestId + "\",\"color\":\"rainbow\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.powder.color").value("rainbow"))
            .andExpect(jsonPath("$.powderEnabled").value(true)).andExpect(jsonPath("$.color").value("amber"));
        mvc.perform(post("/api/beach/fire/powder").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"requestId\":7,\"color\":\"rainbow\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/beach/fire/powder").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"requestId\":\"" + requestId + "\",\"color\":[]}"))
            .andExpect(status().isBadRequest());
        assertEquals(added.powder(), controller.fire("circle-a", request).powder());
    }
}
