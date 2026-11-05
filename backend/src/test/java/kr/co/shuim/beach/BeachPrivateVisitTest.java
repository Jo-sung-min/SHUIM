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

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachPrivateVisitTest {
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService beach = new BeachService(new BeachFireService(new TestFireRepository()));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest req = new MockHttpServletRequest();
    private final DbUser owner = user("owner", false, false);

    private static DbUser user(String id, boolean anonymous, boolean blocked) {
        return new DbUser(id, null, "테스트", "user", anonymous, blocked ? 1L : null, null, 1);
    }
    private CircleService.Circle circle(String id, boolean restricted) {
        return new CircleService.Circle(id, id, "테스트 소로우", "rest", null, false, restricted ? "invite" : "open",
            restricted ? "members" : "public", "", "", owner.id(), 0, 1, 2, 0, false, restricted, restricted, restricted ? 4 : 100);
    }
    private String enter(String id, boolean restricted) {
        when(auth.requireUser(any(), any())).thenReturn(owner);
        when(auth.currentUser(any())).thenReturn(Optional.of(owner));
        when(circles.byId(id)).thenReturn(circle(id, restricted));
        when(circles.member(id, owner.id())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        when(blocks.excludedIds(owner.id())).thenReturn(Set.of());
        return (String) controller.enter(new BeachController.EnterBody(id), req, new MockHttpServletResponse()).get("ticket");
    }
    private BeachController.TickBody tick(String ticket) { return new BeachController.TickBody(ticket, 7.0, 7.0, 0.0, true, null); }
    private BeachController.RestBody stand(String ticket) { return new BeachController.RestBody(ticket, "stand", null); }
    private void rejectsBoth(String ticket, int status) {
        long before = beach.requireVisit(ticket, owner.id()).presence().updatedAt();
        assertEquals(status, assertThrows(ApiException.class, () -> controller.tick(tick(ticket), req)).status());
        assertEquals(status, assertThrows(ApiException.class, () -> controller.rest(stand(ticket), req)).status());
        assertEquals(before, beach.requireVisit(ticket, owner.id()).presence().updatedAt());
    }

    @Test void privateTicksAndRestRecheckSessionTicketOwnershipBlockAndCurrentAllowlist() {
        String ticket = enter("private", true);
        when(auth.currentUser(any())).thenReturn(Optional.empty()); rejectsBoth(ticket, 401);
        when(auth.currentUser(any())).thenReturn(Optional.of(user("owner", true, false))); rejectsBoth(ticket, 401);
        when(auth.currentUser(any())).thenReturn(Optional.of(user("other-allowed-peer", false, false))); rejectsBoth(ticket, 403);
        when(auth.currentUser(any())).thenReturn(Optional.of(user("owner", false, true))); rejectsBoth(ticket, 403);
        when(auth.currentUser(any())).thenReturn(Optional.of(owner));
        doThrow(ApiException.notFound("소로우를 찾을 수 없어요")).when(circles).requireAccess(any(), any()); rejectsBoth(ticket, 404);
        doNothing().when(circles).requireAccess(any(), any());
        when(circles.member("private", owner.id())).thenReturn(Optional.empty()); rejectsBoth(ticket, 403);
        when(circles.member("private", owner.id())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        assertNotNull(controller.tick(tick(ticket), req));
        assertEquals("standing", controller.rest(stand(ticket), req).pose());
    }

    @Test void privateRestHttpRouteRequiresCurrentSessionAndDoesNotReleaseSeatOnRejection() throws Exception {
        String ticket = enter("private", true);
        controller.tick(tick(ticket), req);
        assertEquals("lying", controller.rest(new BeachController.RestBody(ticket, "lie", null), req).pose());
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        mvc.perform(post("/api/beach/rest").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + ticket + "\",\"action\":\"stand\"}"))
            .andExpect(status().isUnauthorized());
        assertEquals("lying", BeachRoom.RestPresence.of(beach.requireVisit(ticket, owner.id()).presence()).pose());
        // Best-effort cleanup can still release a ticket after logout and returns no room state.
        controller.leave(new BeachController.TicketBody(ticket));
        assertEquals(410, assertThrows(ApiException.class, () -> beach.requireVisit(ticket, owner.id())).status());
    }

    @Test void ordinaryPollingAndRestDoNotAddAuthenticationOrCircleDatabaseReads() {
        String ticket = enter("ordinary", false);
        clearInvocations(auth, circles, blocks);
        for (int i = 0; i < 100; i++) assertNotNull(controller.tick(tick(ticket), req));
        assertEquals("standing", controller.rest(stand(ticket), req).pose());
        verifyNoInteractions(auth, circles, blocks);
        assertEquals(410, assertThrows(ApiException.class, () -> controller.tick(tick("unknown"), req)).status());
        assertEquals(410, assertThrows(ApiException.class, () -> controller.rest(stand("unknown"), req)).status());
        verifyNoInteractions(auth, circles, blocks);
    }
}
