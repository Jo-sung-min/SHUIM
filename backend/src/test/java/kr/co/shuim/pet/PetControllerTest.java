package kr.co.shuim.pet;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PetControllerTest {
    @Test void anonymousAndBlockedAccountsCannotReadOrMutatePets() {
        var auth = mock(AuthService.class); var pets = mock(PetService.class);
        var controller = new PetController(auth, pets); var req = new MockHttpServletRequest();
        assertEquals(401, assertThrows(ApiException.class, () -> controller.get(req)).status());
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("guest", null, "g", "user", true, null, null, 0)));
        assertThrows(ApiException.class, () -> controller.feed(new PetService.FeedInput("2026-11-11", 0), req));
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("blocked", null, "b", "user", false, 1L, "", 0)));
        assertThrows(ApiException.class, () -> controller.journal(null, req));
        assertThrows(ApiException.class, () -> controller.snack(req));
        verifyNoInteractions(pets);
    }
    @Test void authenticatedIdentityIsTakenFromSessionAndResponseIsPrivate() {
        var auth = mock(AuthService.class); var pets = mock(PetService.class); var req = new MockHttpServletRequest();
        when(auth.currentUser(req)).thenReturn(Optional.of(new DbUser("owner", null, "o", "user", false, null, null, 0)));
        var response = new PetController(auth, pets).get(req);
        verify(pets).get("owner"); assertEquals("no-store", response.getHeaders().getCacheControl());
        new PetController(auth, pets).snack(req);
        verify(pets).snack("owner");
    }
}
