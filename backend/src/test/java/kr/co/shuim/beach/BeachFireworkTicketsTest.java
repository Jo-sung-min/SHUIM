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

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Registered members launch with firework tickets; the room cooldown and retries never cost a second ticket. */
class BeachFireworkTicketsTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final TestFireworkTickets tickets = new TestFireworkTickets();
    private final BeachController controller = new BeachController(auth, mock(BlockService.class), beach, circles, tickets);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private static DbUser user(String id, String role, boolean anonymous) {
        return new DbUser(id, id + "@example.com", id, role, anonymous, null, null, 0);
    }
    private void actor(DbUser user) {
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }
    private BeachRoom.Presence visitor(String room, String user, String map) { return beach.enter(room, user, user, Set.of(), null, map); }
    private BeachRoom.FireworkLaunch launch(BeachRoom.Presence visitor, String requestId, String variant) {
        return controller.fireworks(new BeachController.FireworksBody(visitor.ticket(), requestId, variant), request);
    }
    private BeachRoom.TickResult poll(BeachRoom.Presence visitor) {
        return controller.tick(new BeachController.TickBody(visitor.ticket(), null, null, null, false, null), request);
    }
    /** Visits expire after ten silent seconds, so time passes in polled steps. */
    private void advance(long millis, BeachRoom.Presence... visitors) {
        while (millis > 0) {
            long step = Math.min(millis, 5_000); clock.addAndGet(step); millis -= step;
            for (var visitor : visitors) poll(visitor);
        }
    }

    @BeforeEach
    void setup() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        when(circles.byId("room")).thenReturn(new CircleService.Circle("room", "room", "함께", "life", null, false,
            "open", "public", "", "", "operator", 0, 0, 1, 0, false));
        when(circles.member(eq("room"), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        actor(user("member", "user", false));
    }

    @Test
    void registeredMembersGetTheControlWithTheirTicketCountWhileAdministratorsStayFree() {
        tickets.grant("member", 2);
        Map<String, Object> member = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(true, member.get("fireworksControl"));
        assertEquals(false, member.get("fireworksFree"));
        assertEquals(2, member.get("fireworkTickets"));

        actor(user("operator", "admin", false));
        Map<String, Object> admin = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(true, admin.get("fireworksControl"));
        assertEquals(true, admin.get("fireworksFree"));
        assertFalse(admin.containsKey("fireworkTickets"));

        actor(user("guest", "user", true));
        Map<String, Object> guest = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(false, guest.get("fireworksControl"));
    }

    @Test
    void oneTicketBuysOneLaunchAndTheNextAttemptIsRefusedBeforeTouchingTheRoom() {
        tickets.grant("member", 1);
        var me = visitor("room", "member", "garden");
        var observer = visitor("room", "observer", "garden");
        var result = launch(me, UUID.randomUUID().toString(), "bloom");
        assertEquals("bloom", result.event().variant());
        assertEquals(0, result.tickets());
        assertEquals(List.of("room/garden/bloom"), tickets.launches);
        assertEquals(List.of(result.event()), poll(observer).fireworks());

        advance(BeachRoom.FIREWORK_COOLDOWN_MS + 1, me, observer);
        var refused = assertThrows(ApiException.class, () -> launch(me, UUID.randomUUID().toString(), "bloom"));
        assertEquals(402, refused.status());
        assertEquals(0, tickets.balance("member"));
        assertEquals(result.cooldownUntil(), poll(observer).fireworksCooldownUntil());
    }

    @Test
    void theRoomCooldownRejectsWithoutSpendingTheTicket() {
        tickets.grant("member", 1);
        tickets.grant("second", 1);
        var first = visitor("room", "member", "beach");
        launch(first, UUID.randomUUID().toString(), "festival");
        actor(user("second", "user", false));
        var second = visitor("room", "second", "beach");
        var cooldown = assertThrows(ApiException.class, () -> launch(second, UUID.randomUUID().toString(), "willow"));
        assertEquals(429, cooldown.status());
        assertEquals(1, tickets.balance("second"));
        assertEquals(0, tickets.balance("member"));
        advance(BeachRoom.FIREWORK_COOLDOWN_MS, first, second);
        assertEquals(0, launch(second, UUID.randomUUID().toString(), "willow").tickets());
    }

    @Test
    void retryingTheSameRequestReturnsTheOriginalEventWithoutASecondCharge() {
        tickets.grant("member", 1);
        var me = visitor("room", "member", "uyuni");
        String requestId = UUID.randomUUID().toString();
        var first = launch(me, requestId, "stardust");
        clock.addAndGet(3_000);
        var retried = launch(me, requestId, "stardust");
        assertEquals(first.event(), retried.event());
        assertEquals(0, retried.tickets());
        assertEquals(1, tickets.launches.size());
    }

    @Test
    void songiStaysAnAdministratorStyleAndAdministratorsNeverPayOrSeeACount() {
        tickets.grant("member", 1);
        var me = visitor("room", "member", "bamboo");
        var denied = assertThrows(ApiException.class, () -> launch(me, UUID.randomUUID().toString(), "songi"));
        assertEquals(403, denied.status());
        assertEquals(1, tickets.balance("member"));
        assertEquals(List.of(), poll(me).fireworks());

        actor(user("operator", "admin", false));
        var admin = visitor("room", "operator", "bamboo");
        var result = launch(admin, UUID.randomUUID().toString(), "songi");
        assertEquals("songi", result.event().variant());
        assertNull(result.tickets());
        assertEquals(0, tickets.launches.size());
    }

    @Test
    void malformedRequestIdsAndGuestsAreRejectedBeforeAnyCharge() {
        tickets.grant("member", 1);
        var me = visitor("room", "member", "beach");
        assertEquals(400, assertThrows(ApiException.class, () -> launch(me, "not-a-uuid", "festival")).status());
        assertEquals(1, tickets.balance("member"));
        actor(user("guest", "user", true));
        var guest = visitor("room", "guest", "beach");
        assertEquals(403, assertThrows(ApiException.class, () -> launch(guest, UUID.randomUUID().toString(), "festival")).status());
    }
}
