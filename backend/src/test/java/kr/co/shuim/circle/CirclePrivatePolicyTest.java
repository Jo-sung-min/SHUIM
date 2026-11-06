package kr.co.shuim.circle;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CirclePrivatePolicyTest {
    @Test void privateStatusEndpointDoesNotCreateGuestSessionsAndReturnsTheGate() {
        var auth = mock(AuthService.class);
        var service = new CircleService(null, null, null, null, null);
        var controller = new CircleController(auth, service, mock(CommunityConsentService.class));
        var req = mock(HttpServletRequest.class);
        when(auth.currentUser(req)).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.privateTestStatus(req)).status());
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("admin", null, "운영자", "admin", false, null, null, 1)));
        assertEquals(Map.of("enabled", false), controller.privateTestStatus(req));
        service.setPrivateTestCreationEnabled(true);
        assertEquals(Map.of("enabled", true), controller.privateTestStatus(req));
        verify(auth, never()).requireUser(any(), any());
    }

    @Test void privateCreationIsOffByDefaultAndStatusIsOnlyForCurrentRegisteredAdmins() {
        JdbcClient jdbc = mock(JdbcClient.class);
        var service = new CircleService(jdbc, null, null, null, null);
        DbUser admin = new DbUser("admin", null, "운영자", "admin", false, null, null, 1);
        assertEquals(Map.of("enabled", false), service.privateTestStatus(admin));
        assertEquals(503, assertThrows(ApiException.class, () -> service.createPrivateTest(admin, "peer")).status());
        verifyNoInteractions(jdbc);
        for (DbUser denied : new DbUser[]{null,
            new DbUser("member", null, "회원", "user", false, null, null, 1),
            new DbUser("guest", null, "방문자", "admin", true, null, null, 1),
            new DbUser("blocked", null, "제한", "admin", false, 1L, null, 1)}) {
            assertEquals(403, assertThrows(ApiException.class, () -> service.privateTestStatus(denied)).status());
        }
        service.setPrivateTestCreationEnabled(true);
        assertEquals(Map.of("enabled", true), service.privateTestStatus(admin));
        service.setPrivateTestCreationEnabled(false);
        assertEquals(503, assertThrows(ApiException.class, () -> service.createPrivateTest(admin, "peer")).status());
    }

    @Test void privateAccessRequiresBothCurrentEligibilityAndExplicitAllowlist() {
        assertTrue(CircleLogic.canAccessPrivate(false, false, false));
        assertTrue(CircleLogic.canAccessPrivate(true, true, true));
        assertFalse(CircleLogic.canAccessPrivate(true, true, false));
        assertFalse(CircleLogic.canAccessPrivate(true, false, true));
        assertFalse(CircleLogic.canAccessPrivate(true, false, false));
        var legacy = new CircleService.Circle("id", "public", "공개 소로우", "rest", null, false,
            "open", "public", "", "", "owner", 0, 1, 1, 0, false);
        assertFalse(legacy.privateTest()); assertFalse(legacy.pinned()); assertEquals(20, legacy.spaceCapacity());
    }

    @Test void storedLegacyCapacityIsClampedForApiViewsWithoutRaisingPrivateLimits() {
        var service = new CircleService(null, null, null, null, null);
        for (int stored : new int[]{1, 2, 4, 20, 21, 100}) {
            var circle = new CircleService.Circle("id", "room", "소로우", "rest", null, false,
                "open", "public", "", "", "owner", 0, 1, 1, 0, false, stored < 20, false, stored);
            assertEquals(Math.min(stored, 20), circle.spaceCapacity());
            assertEquals(Math.min(stored, 20), service.view(circle).get("spaceCapacity"));
        }
    }

    @Test void readEndpointsForwardAuthenticatedViewerAndAnonymousStaysAnonymous() {
        var auth = mock(AuthService.class);
        var circles = mock(CircleService.class);
        var controller = new CircleController(auth, circles, mock(CommunityConsentService.class));
        var req = mock(HttpServletRequest.class);
        DbUser viewer = new DbUser("viewer", null, "테스트", "user", false, null, null, 1);
        when(auth.currentUser(req)).thenReturn(Optional.of(viewer));
        controller.browse("rest", "", req); controller.warm(req);
        verify(circles).browse(viewer, "rest", ""); verify(circles).warmest(viewer);
        when(auth.currentUser(req)).thenReturn(Optional.empty());
        controller.browse(null, null, req); controller.warm(req);
        verify(circles).browse(null, null, null); verify(circles).warmest(null);
    }

    @Test void privateCreationUsesAuthenticatedOwnerAndOnlyPeerFromRequest() {
        var auth = mock(AuthService.class);
        var circles = mock(CircleService.class);
        var consent = mock(CommunityConsentService.class);
        var controller = new CircleController(auth, circles, consent);
        var req = mock(HttpServletRequest.class);
        var res = mock(HttpServletResponse.class);
        DbUser owner = new DbUser("authenticated-owner", null, "운영자", "admin", false, null, null, 1);
        when(auth.requireUser(req, res)).thenReturn(owner);
        Map<String, Object> response = Map.of("privateTest", true, "spaceCapacity", 4);
        when(circles.createPrivateTest(owner, "selected-peer")).thenReturn(response);
        assertSame(response, controller.createPrivateTest(Map.of("ownerId", "spoofed-owner", "peerId", "selected-peer", "spaceCapacity", 100), req, res));
        verify(consent).requireAccepted(owner);
        verify(circles).createPrivateTest(owner, "selected-peer");
    }
}
