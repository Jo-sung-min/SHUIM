package kr.co.shuim.light;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.community.CommunityController;
import kr.co.shuim.community.CommunityService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LightControllerTest {
    private final DbUser member = new DbUser("member", null, "회원", "user", false, null, null, 0);
    private final DbUser guest = new DbUser("guest", null, "손님", "user", true, null, null, 0);

    @Test void walletAndDailyLightUseOnlyTheSignedInAccountAndNeverCreateGuestSessions() {
        var auth = mock(AuthService.class); var light = mock(LightService.class); var req = new MockHttpServletRequest();
        var controller = new LightController(auth, light);
        when(auth.currentUser(req)).thenReturn(Optional.empty());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.me(req)).status());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.daily(req)).status());
        verifyNoInteractions(light);
        when(auth.currentUser(req)).thenReturn(Optional.of(member));
        assertEquals("no-store", controller.me(req).getHeaders().getCacheControl());
        controller.daily(req);
        verify(light).me(member); verify(light).claimDaily(member); verify(auth, never()).requireUser(any(), any());
    }

    @Test void givingPassesOnlyThePostAmountAndRequestIdAfterLoginAndConsent() {
        var auth = mock(AuthService.class); var community = mock(CommunityService.class); var consent = mock(CommunityConsentService.class);
        var req = new MockHttpServletRequest(); var res = new MockHttpServletResponse();
        var controller = new CommunityController(auth, community, consent);
        Map<String, Object> body = Map.of("postId", "post", "amount", 3, "requestId", "request", "to", "someone-else", "balance", 9999);

        when(auth.requireUser(req, res)).thenReturn(guest);
        assertEquals(401, assertThrows(ApiException.class, () -> controller.post("light.give", body, req, res)).status());
        verifyNoInteractions(consent, community);

        when(auth.requireUser(req, res)).thenReturn(member);
        doThrow(new ApiException(409, "동의 필요")).when(consent).requireAccepted(member);
        assertEquals(409, assertThrows(ApiException.class, () -> controller.post("light.give", body, req, res)).status());
        verifyNoInteractions(community);

        doNothing().when(consent).requireAccepted(member);
        controller.post("light.give", body, req, res);
        verify(community).giveLight(member, "post", 3, "request"); // 받는 사람·잔액은 클라이언트가 정하지 못한다
    }

    @Test void theOldWonDonationRequestIsRetiredInsteadOfSilentlyAccepted() {
        var auth = mock(AuthService.class); var community = mock(CommunityService.class); var consent = mock(CommunityConsentService.class);
        var req = new MockHttpServletRequest(); var res = new MockHttpServletResponse();
        when(auth.requireUser(req, res)).thenReturn(member);
        var controller = new CommunityController(auth, community, consent);
        assertEquals(410, assertThrows(ApiException.class, () -> controller.post("donate", Map.of("amount", 3000), req, res)).status());
        verifyNoInteractions(community);
    }
}
