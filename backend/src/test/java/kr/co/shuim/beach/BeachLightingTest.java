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
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachLightingTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private DbUser user(String id, String role, boolean anonymous, Long blockedAt) {
        return new DbUser(id, id + "@example.com", id, role, anonymous, blockedAt, null, 0);
    }

    private void actor(DbUser user) {
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }

    private BeachRoom.Presence visitor(String room, String id) { return beach.enter(room, id, id, Set.of()); }
    private BeachRoom.Lighting change(BeachRoom.Presence p, String mode) {
        return controller.lighting(new BeachController.LightingBody(p.ticket(), mode), request);
    }
    private BeachRoom.TickResult poll(BeachRoom.Presence p) {
        return controller.tick(new BeachController.TickBody(p.ticket(), 0.0, 10.0, 0.0, false, null), request);
    }

    @BeforeEach
    void setup() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        for (String id : List.of("room", "other")) {
            when(circles.byId(id)).thenReturn(new CircleService.Circle(id, id, "함께", "life", null, false,
                "open", "public", "", "", "operator", 0, 0, 1, 0, false));
            when(circles.member(eq(id), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
        actor(user("operator", "admin", false, null));
    }

    @Test
    void entryOnlyExposesControlsToAnAuthenticatedAdmin() {
        for (DbUser user : new DbUser[]{user("regular", "user", false, null), user("guest", "user", true, null),
            user("operator", "admin", false, null), user("anonymous-admin", "admin", true, null)}) {
            actor(user);
            var entered = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
            assertEquals(auth.isAdmin(user), entered.get("lightingControl"));
            assertEquals(BeachRoom.AUTO_LIGHTING, entered.get("lighting"));
        }
    }

    @Test
    void changesReachOtherVisitorsAndLateJoinersButNeverOtherRooms() {
        var admin = visitor("room", "operator");
        var observer = visitor("room", "observer");
        var elsewhere = visitor("other", "operator");
        assertEquals(BeachRoom.AUTO_LIGHTING, poll(observer).lighting());
        var sunset = change(admin, "sunset");
        assertEquals(new BeachRoom.Lighting("sunset", 18, 1), sunset);
        assertEquals(sunset, change(admin, "sunset"), "retrying the same mode is idempotent");
        assertEquals(sunset, poll(observer).lighting());
        assertEquals(BeachRoom.AUTO_LIGHTING, poll(elsewhere).lighting());
        var entered = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(sunset, entered.get("lighting"));
        assertEquals(new BeachRoom.Lighting("night", 20, 2), change(admin, "night"));
        assertEquals(new BeachRoom.Lighting("day", 12, 3), change(admin, "day"));
        assertEquals(new BeachRoom.Lighting("auto", null, 4), change(admin, "auto"));
        assertEquals(new BeachRoom.Lighting("auto", null, 4), poll(observer).lighting());
    }

    @Test
    void revokingRoleMembershipOrAccountAccessTakesEffectImmediately() {
        var admin = visitor("room", "operator");
        var previous = change(admin, "night");
        for (DbUser denied : new DbUser[]{user("operator", "user", false, null), user("operator", "admin", true, null),
            user("operator", "admin", false, 1L)}) {
            actor(denied);
            assertEquals(403, assertThrows(ApiException.class, () -> change(admin, "day")).status());
            assertEquals(previous, poll(admin).lighting());
        }
        actor(user("operator", "admin", false, null));
        when(circles.member("room", "operator")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> change(admin, "day")).status());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> change(admin, "day")).status());
        assertEquals(previous, beach.lighting("room"));
    }

    @Test
    void missingSessionForeignExpiredAndReleasedTicketsCannotChangeLighting() {
        var admin = visitor("room", "operator");
        var other = visitor("other", "someone-else");
        actor(null);
        assertEquals(401, assertThrows(ApiException.class, () -> change(admin, "day")).status());
        actor(user("operator", "admin", false, null));
        assertEquals(403, assertThrows(ApiException.class, () -> change(other, "night")).status());
        for (String ticket : new String[]{null, "", "expired"}) {
            assertEquals(410, assertThrows(ApiException.class, () -> controller.lighting(new BeachController.LightingBody(ticket, "day"), request)).status());
        }
        beach.leave(admin.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> change(admin, "day")).status());
        var fresh = visitor("room", "operator");
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> change(fresh, "day")).status());
        assertEquals(BeachRoom.AUTO_LIGHTING, beach.lighting("room"));
        assertEquals(BeachRoom.AUTO_LIGHTING, beach.lighting("other"));
    }

    @Test
    void jsonContractRejectsInvalidModesAndKeepsExplicitNullForAutomaticTime() throws Exception {
        var admin = visitor("room", "operator");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String invalid : List.of("\"dawn\"", "\"\"", "\"DAY\"", "null", "7", "true", "{}", "[]")) {
            mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + admin.ticket() + "\",\"mode\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        }
        assertEquals(BeachRoom.AUTO_LIGHTING, beach.lighting("room"));
        assertEquals(400, assertThrows(ApiException.class, () -> controller.lighting(null, request)).status());
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + admin.ticket() + "\",\"mode\":\"night\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("night"))
            .andExpect(jsonPath("$.hour").value(20)).andExpect(jsonPath("$.version").value(1));
        String json = mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + admin.ticket() + "\",\"mode\":\"auto\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("auto"))
            .andExpect(jsonPath("$.version").value(2)).andReturn().getResponse().getContentAsString();
        var tree = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        assertTrue(tree.has("hour") && tree.get("hour").isNull());
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + admin.ticket() + "\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.lighting.mode").value("auto"))
            .andExpect(jsonPath("$.lighting.version").value(2));
    }

    @Test
    void forgedPermissionsAndCommunityCannotOverrideTheServerRoleOrTicketRoom() throws Exception {
        var admin = visitor("room", "operator");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String forged = """
            {"ticket":"%s","mode":"night","communityId":"other","admin":true,
             "role":"admin","lightingControl":true,"hour":1,"version":999}
            """.formatted(admin.ticket());
        actor(user("operator", "user", false, null));
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON).content(forged))
            .andExpect(status().isForbidden());
        assertEquals(BeachRoom.AUTO_LIGHTING, beach.lighting("room"));
        actor(user("operator", "admin", false, null));
        mvc.perform(post("/api/beach/lighting").contentType(MediaType.APPLICATION_JSON).content(forged))
            .andExpect(status().isOk()).andExpect(jsonPath("$.hour").value(20)).andExpect(jsonPath("$.version").value(1));
        assertEquals(BeachRoom.AUTO_LIGHTING, beach.lighting("other"));
    }

    @Test
    void regularPollsNeedNoSessionLookupAndResponseWrappersPreserveTheSharedState() {
        var admin = visitor("room", "operator");
        var selected = change(admin, "sunset");
        clearInvocations(auth, circles);
        var tick = poll(admin);
        assertEquals(selected, tick.lighting());
        assertNotNull(tick.fire());
        assertEquals(selected, tick.withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true).lighting());
        verifyNoInteractions(auth, circles);
    }

    @Test
    void aNewServerStartsAutomaticAndAnExplicitResetAdvancesTheExistingRoomVersion() {
        var admin = visitor("room", "operator");
        change(admin, "day");
        var restarted = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
        var fresh = restarted.enter("room", "operator", "운영자", Set.of());
        assertEquals(BeachRoom.AUTO_LIGHTING, restarted.tick(fresh.ticket(), 0, 10, 0, false, null, null).lighting());
        assertEquals(new BeachRoom.Lighting("auto", null, 2), change(admin, "auto"));
    }
}
