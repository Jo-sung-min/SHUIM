package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountControllerTest {
    @Test
    void unauthenticatedDeletionNeverCreatesAnAnonymousUser() {
        AuthService auth = mock(AuthService.class);
        AccountDeletionService accounts = mock(AccountDeletionService.class);
        MockHttpServletRequest req = new MockHttpServletRequest();
        when(auth.currentUser(req)).thenReturn(Optional.empty());
        ApiException error = assertThrows(ApiException.class,
            () -> new AccountController(auth, accounts).delete(Map.of("confirmation", "계정 삭제"), req, new MockHttpServletResponse()));
        assertEquals(401, error.status());
        verifyNoInteractions(accounts);
        verify(auth, never()).requireUser(any(), any());
    }

    @Test
    void deletionUsesSessionIdentityAndClearsCookieOnlyAfterSuccess() {
        AuthService auth = mock(AuthService.class);
        AccountDeletionService accounts = mock(AccountDeletionService.class);
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        DbUser guest = new DbUser("guest", null, "guest", "user", true, null, null, 0);
        when(auth.currentUser(req)).thenReturn(Optional.of(guest));
        new AccountController(auth, accounts).delete(Map.of("confirmation", "계정 삭제", "expectedUserId", "guest", "userId", "another-account"), req, res);
        var order = inOrder(accounts, auth);
        order.verify(accounts).delete(guest, "계정 삭제");
        order.verify(auth).signOut(req, res);
    }

    @Test
    void unsuccessfulDeletionPreservesSessionForRetry() {
        AuthService auth = mock(AuthService.class);
        AccountDeletionService accounts = mock(AccountDeletionService.class);
        MockHttpServletRequest req = new MockHttpServletRequest();
        DbUser user = new DbUser("a", null, "nick", "user", false, null, null, 0);
        when(auth.currentUser(req)).thenReturn(Optional.of(user));
        doThrow(ApiException.unavailable("retry")).when(accounts).delete(user, "계정 삭제");
        assertThrows(ApiException.class, () -> new AccountController(auth, accounts).delete(Map.of("confirmation", "계정 삭제", "expectedUserId", "a"), req, new MockHttpServletResponse()));
        verify(auth, never()).signOut(any(), any());
    }

    @Test
    void administratorAccessNeverDependsOnAnEmptyUserDatabase() {
        AuthService auth = new AuthService(null, false, 90);
        assertFalse(auth.isAdmin(null));
        assertFalse(auth.isAdmin(new DbUser("a", null, "guest", "admin", true, null, null, 0)));
        assertFalse(auth.isAdmin(new DbUser("a", "a@example.com", "admin", "admin", false, 1L, null, 0)));
        assertTrue(auth.isAdmin(new DbUser("a", "a@example.com", "admin", "admin", false, null, null, 0)));
    }

    @Test
    void accountChangedInAnotherTabMustNotDeleteTheNewSessionAccount() {
        AuthService auth = mock(AuthService.class);
        AccountDeletionService accounts = mock(AccountDeletionService.class);
        MockHttpServletRequest req = new MockHttpServletRequest();
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("b", null, "account B", "user", false, null, null, 0)));
        AccountController controller = new AccountController(auth, accounts);
        assertEquals(409, assertThrows(ApiException.class,
            () -> controller.delete(Map.of("confirmation", "계정 삭제", "expectedUserId", "a"), req, new MockHttpServletResponse())).status());
        assertEquals(409, assertThrows(ApiException.class,
            () -> controller.delete(Map.of("confirmation", "계정 삭제"), req, new MockHttpServletResponse())).status());
        verifyNoInteractions(accounts);
        verify(auth, never()).signOut(any(), any());
    }
}
