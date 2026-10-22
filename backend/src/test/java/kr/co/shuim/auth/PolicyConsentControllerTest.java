package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.http.MediaType;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PolicyConsentControllerTest {
    private static PolicyConsentService policies() {
        PolicyConsentService policies = mock(PolicyConsentService.class);
        doCallRealMethod().when(policies).validateVersion(any());
        return policies;
    }

    @Test
    void rejectedVersionDoesNotCreateGuestOrConsent() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        PolicyConsentController controller = new PolicyConsentController(auth, policies);
        ApiException error = assertThrows(ApiException.class, () -> controller.post(
            new PolicyConsentController.Request("outdated", true, null), new MockHttpServletRequest(), new MockHttpServletResponse()));
        assertEquals(400, error.status());
        verifyNoInteractions(auth);
        verify(policies, never()).accept(any(), any(), anyBoolean());
    }

    @Test
    void missingAiChoiceDoesNotCreateGuest() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentController controller = new PolicyConsentController(auth, policies());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.post(
            new PolicyConsentController.Request(PolicyConsentService.VERSION, null, null), new MockHttpServletRequest(), new MockHttpServletResponse())).status());
        verifyNoInteractions(auth);
    }

    @Test
    void getReadsTheExistingSessionWithoutCreatingAnAnonymousAccount() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        MockHttpServletRequest request = new MockHttpServletRequest();
        when(auth.currentUser(request)).thenReturn(Optional.empty());
        PolicyConsentService.State expected = new PolicyConsentService.State(PolicyConsentService.VERSION, false, false, null);
        when(policies.state(null)).thenReturn(expected);
        assertEquals(expected, new PolicyConsentController(auth, policies).get(request));
        verify(auth, never()).requireUser(any(), any());
    }

    @Test
    void falseIsAValidOptionalAiChoiceForTheCurrentSession() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        DbUser user = new DbUser("current", null, "익명", "user", true, null, null, 0);
        when(auth.currentUser(request)).thenReturn(Optional.of(user));
        PolicyConsentService.State expected = new PolicyConsentService.State(PolicyConsentService.VERSION, true, false, user.id());
        when(policies.accept(user, PolicyConsentService.VERSION, false)).thenReturn(expected);
        assertEquals(expected, new PolicyConsentController(auth, policies).post(
            new PolicyConsentController.Request(PolicyConsentService.VERSION, false, user.id()), request, response));
    }

    @Test
    void accountChangedInAnotherTabCannotReceiveTheReviewedConsent() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        MockHttpServletRequest request = new MockHttpServletRequest();
        DbUser current = new DbUser("account-b", null, "계정 B", "user", false, null, null, 0);
        when(auth.currentUser(request)).thenReturn(Optional.of(current));
        PolicyConsentController controller = new PolicyConsentController(auth, policies);
        for (String reviewed : new String[]{"account-a", null}) {
            assertEquals(409, assertThrows(ApiException.class, () -> controller.post(
                new PolicyConsentController.Request(PolicyConsentService.VERSION, true, reviewed), request, new MockHttpServletResponse())).status());
        }
        verify(auth, never()).requireUser(any(), any());
        verify(policies, never()).accept(any(), any(), anyBoolean());
    }

    @Test
    void firstTimeVisitorCanExplicitlyReviewANullIdentity() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(auth.currentUser(request)).thenReturn(Optional.empty());
        DbUser guest = new DbUser("new-guest", null, "익명", "user", true, null, null, 0);
        when(auth.requireUser(request, response)).thenReturn(guest);
        new PolicyConsentController(auth, policies).post(
            new PolicyConsentController.Request(PolicyConsentService.VERSION, false, null), request, response);
        verify(policies).accept(guest, PolicyConsentService.VERSION, false);
    }

    @Test
    void missingReviewedIdentityIsRejectedDuringJsonBinding() throws Exception {
        AuthService auth = mock(AuthService.class);
        MockMvcBuilders.standaloneSetup(new PolicyConsentController(auth, policies())).build()
            .perform(post("/api/auth/consent").contentType(MediaType.APPLICATION_JSON)
                .content("{\"signupConsentVersion\":\"2026-10-21\",\"aiDisclosureAccepted\":true}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(auth);
    }

    @Test
    void signupWithoutCurrentRequiredConsentNeverCreatesAnAccount() {
        AuthService auth = mock(AuthService.class);
        AuthController controller = new AuthController(auth, mock(KakaoLoginService.class), policies());
        assertEquals(400, assertThrows(ApiException.class, () -> controller.post("signup",
            Map.of("email", "a@example.com", "nick", "닉네임", "password", "secret1", "aiDisclosureAccepted", true),
            new MockHttpServletRequest(), new MockHttpServletResponse())).status());
        verifyNoInteractions(auth);
    }

    @Test
    void signupUsesBooleanChoiceWithoutTreatingStringFalseAsTrue() {
        AuthService auth = mock(AuthService.class);
        PolicyConsentService policies = policies();
        AuthController controller = new AuthController(auth, mock(KakaoLoginService.class), policies);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        DbUser user = new DbUser("created", "a@example.com", "닉네임", "user", false, null, null, 0);
        when(auth.signUp(request, response, "a@example.com", "닉네임", "secret1")).thenReturn(user);
        controller.post("signup", Map.of("email", "a@example.com", "nick", "닉네임", "password", "secret1",
            "signupConsentVersion", PolicyConsentService.VERSION, "aiDisclosureAccepted", false), request, response);
        verify(policies).accept(user, PolicyConsentService.VERSION, false);
        clearInvocations(auth);
        assertEquals(400, assertThrows(ApiException.class, () -> controller.post("signup",
            Map.of("signupConsentVersion", PolicyConsentService.VERSION, "aiDisclosureAccepted", "false"), request, response)).status());
        verifyNoInteractions(auth);
    }
}
