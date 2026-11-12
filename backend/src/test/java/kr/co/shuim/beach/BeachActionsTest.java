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

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachActionsTest {
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

    private BeachRoom.Presence visitor(String id) {
        var p = beach.enter("room", id, id, Set.of());
        beach.tick(p.ticket(), 0, 10, 0, false, null, null);
        return p;
    }

    private BeachRoom.TickResult action(BeachRoom.Presence from, String target, String kind) {
        return controller.tick(new BeachController.TickBody(from.ticket(), 4.0, 10.0, .5, true,
            new BeachController.Care(target, kind)), request);
    }

    private BeachRoom.TickResult poll(BeachRoom.Presence p) {
        return beach.tick(p.ticket(), p.x(), p.z(), p.yaw(), false, null, null);
    }

    @BeforeEach
    void setup() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "operator", 0, 0, 200, 0, false));
        when(circles.member(eq("room"), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
    }

    @Test
    void entryCapabilitiesUseServerRoleAndAnonymousMembersCanWave() {
        for (var user : new DbUser[]{user("member", "user", false, null), user("guest", "user", true, null),
            user("admin", "admin", false, null), user("fake-admin", "admin", true, null)}) {
            actor(user);
            Map<String, Object> entered = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
            assertEquals(new BeachRoom.CareCapabilities(true, "admin".equals(user.role()) && !user.anonymous()), entered.get("careCapabilities"));
        }
    }

    @Test
    void waveReachesSelectedPersonSenderAndNearbyObserversWithoutCountingAsAHugOrComfort() {
        actor(user("sender", "user", true, null));
        var sender = visitor("sender");
        var target = visitor("target");
        var observer = visitor("observer");
        var excluded = beach.enter("room", "excluded", "excluded", Set.of("sender"));
        var otherRoom = beach.enter("elsewhere", "elsewhere", "elsewhere", Set.of());
        var sent = action(sender, target.userId(), "wave");
        assertEquals("sent", sent.care());
        assertEquals(new BeachRoom.CareCapabilities(true, false), sent.careCapabilities());
        assertEquals(1, sent.events().size());
        assertEquals("wave", sent.events().get(0).kind());
        assertEquals(target.userId(), sent.events().get(0).toId());
        var received = poll(target);
        assertEquals(new BeachRoom.Received(0, 0, 1), received.received());
        assertEquals(1, received.events().size());
        assertEquals(1, poll(observer).events().size());
        assertTrue(poll(excluded).events().isEmpty());
        assertTrue(poll(otherRoom).events().isEmpty());
        assertEquals("cooldown", action(sender, target.userId(), "wave").care());
    }

    @Test
    void ordinaryHugIsForbiddenButMovementAndImmediateWaveContinue() {
        actor(user("sender", "user", false, null));
        var sender = visitor("sender");
        var target = visitor("target");
        var denied = action(sender, target.userId(), "hug");
        assertEquals("forbidden", denied.care());
        assertEquals(4, sender.x());
        assertTrue(sender.moving());
        assertNotNull(denied.selfRest());
        assertNotNull(denied.fire());
        assertTrue(denied.events().isEmpty());
        assertEquals(new BeachRoom.Received(0, 0, 0), poll(target).received());
        assertEquals("sent", action(sender, target.userId(), "wave").care(), "denial consumes no cooldown");
    }

    @Test
    void adminHugIsDeliveredButRevokingRoleTakesEffectOnTheVeryNextRequest() {
        var sender = visitor("sender");
        var target = visitor("target");
        actor(user("sender", "admin", false, null));
        assertEquals("sent", action(sender, target.userId(), "hug").care());
        assertEquals(1, poll(target).received().hug());
        actor(user("sender", "user", false, null));
        var denied = action(sender, target.userId(), "hug");
        assertEquals("forbidden", denied.care(), "fresh role is checked even within the normal care cooldown");
        assertEquals(new BeachRoom.CareCapabilities(true, false), denied.careCapabilities());
        assertEquals(1, poll(target).received().hug());
        assertTrue(poll(target).events().isEmpty());
    }

    @Test
    void missingSessionWrongTicketOwnerBlockedAndRemovedMembershipCannotSendActions() {
        var sender = visitor("sender");
        var target = visitor("target");
        for (var actor : new DbUser[]{null, user("other-admin", "admin", false, null), user("sender", "admin", false, 1L)}) {
            actor(actor);
            var denied = action(sender, target.userId(), "hug");
            assertEquals("forbidden", denied.care());
            assertEquals(new BeachRoom.CareCapabilities(false, false), denied.careCapabilities());
        }
        actor(user("sender", "admin", false, null));
        when(circles.member("room", "sender")).thenReturn(Optional.empty());
        assertEquals("forbidden", action(sender, target.userId(), "wave").care());
        assertEquals("forbidden", action(sender, target.userId(), "hug").care());
        assertTrue(poll(target).events().isEmpty());
        assertEquals(new BeachRoom.Received(0, 0, 0), poll(target).received());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> action(sender, target.userId(), "hug")).status());
    }

    @Test
    void forgedClientAdminFieldsDoNotAuthorizeHugAndForbiddenIsAnHttp200Tick() throws Exception {
        actor(user("sender", "user", false, null));
        var sender = visitor("sender");
        var target = visitor("target");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON).content("""
            {"ticket":"%s","x":5,"z":11,"moving":true,"admin":true,"role":"admin",
             "hugAllowed":true,"careCapabilities":{"wave":true,"hug":true},"care":{"to":"%s","kind":"hug"}}
            """.formatted(sender.ticket(), target.userId())))
            .andExpect(status().isOk()).andExpect(jsonPath("$.care").value("forbidden"))
            .andExpect(jsonPath("$.careCapabilities.hug").value(false)).andExpect(jsonPath("$.selfRest.x").value(5));
        assertTrue(poll(target).events().isEmpty());
    }

    @Test
    void normalMovementPollsDoNotReadSessionOrMembershipAndCoreHugsDefaultToDenied() {
        var sender = visitor("sender");
        var target = visitor("target");
        clearInvocations(auth, circles);
        var tick = controller.tick(new BeachController.TickBody(sender.ticket(), 5.0, 11.0, 0.0, true, null), request);
        assertNull(tick.careCapabilities());
        verifyNoInteractions(auth, circles);
        assertEquals("forbidden", beach.tick(sender.ticket(), 5, 11, 0, false, target.userId(), "hug").care());
        assertTrue(poll(target).events().isEmpty());
    }

    @Test
    void waveCannotTargetAnotherRoomOrAnotherTabOfTheSenderAndLegacyComfortStillWorks() {
        actor(user("sender", "user", false, null));
        var sender = visitor("sender");
        var sameAccount = visitor("sender");
        var target = visitor("target");
        beach.enter("elsewhere", "other", "other", Set.of());
        assertEquals("gone", action(sender, "other", "wave").care());
        assertEquals("gone", action(sender, sameAccount.userId(), "wave").care());
        assertEquals("sent", action(sender, target.userId(), "comfort").care());
        assertEquals(new BeachRoom.Received(1, 0, 0), poll(target).received());
    }
}
