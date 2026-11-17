package kr.co.shuim.outing;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OutingControllerTest {
    @Test void anonymousAndBlockedAccountsCannotReadOrChangeProgress() {
        var auth = mock(AuthService.class); var outings = mock(OutingService.class);
        var controller = new OutingController(auth, outings); var req = new MockHttpServletRequest();
        assertEquals(401, assertThrows(ApiException.class, () -> controller.get(req)).status());
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("guest", null, "g", "user", true, null, null, 0)));
        assertThrows(ApiException.class, () -> controller.start(new OutingService.StartInput("park-bench"), req));
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("blocked", null, "b", "user", false, 1L, "", 0)));
        assertThrows(ApiException.class, () -> controller.complete(new OutingService.CompleteInput("token", "note"), req));
        verifyNoInteractions(outings);
    }
    @Test void onlyTheAuthenticatedSessionOwnsTheOutingAndResponsesAreNotCached() {
        var auth = mock(AuthService.class); var outings = mock(OutingService.class); var req = new MockHttpServletRequest();
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("owner", null, "o", "user", false, null, null, 0)));
        var controller = new OutingController(auth, outings);
        assertEquals("no-store", controller.get(req).getHeaders().getCacheControl());
        verify(outings).get("owner");
        var start = new OutingService.StartInput("sea-waves"); controller.start(start, req); verify(outings).start("owner", start);
        var end = new OutingService.CompleteInput("server-token", "my private letter"); controller.complete(end, req); verify(outings).complete("owner", end);
    }
}
