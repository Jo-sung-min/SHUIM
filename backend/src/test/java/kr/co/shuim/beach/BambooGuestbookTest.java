package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BambooGuestbookTest {
    private final ObjectMapper json = new ObjectMapper();
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = mock(BeachService.class);
    private final BambooGuestbook store = mock(BambooGuestbook.class);
    private final BambooGuestbookController api = new BambooGuestbookController(store, auth, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final DbUser user = new DbUser("visitor", null, "별", "user", false, null, null, 0);
    private final BambooGuestbookController.PageRequest first = new BambooGuestbookController.PageRequest("owned", null);

    @Test void readersMustStillBeMembersInTheirOwnBambooVisit() {
        assertEquals(401, assertThrows(ApiException.class, () -> api.list(first, request)).status());
        when(auth.currentUser(request)).thenReturn(Optional.of(user));
        when(beach.requireVisit("owned", user.id())).thenReturn(new BeachService.Visit("A", "uyuni", null));
        assertEquals(403, assertThrows(ApiException.class, () -> api.list(first, request)).status());
        when(beach.requireVisit("owned", user.id())).thenReturn(new BeachService.Visit("A", "bamboo", null));
        var circle = mock(CircleService.Circle.class);
        when(circle.id()).thenReturn("A"); when(circles.byId("A")).thenReturn(circle);
        when(circles.requireActiveMember(circle, user)).thenThrow(ApiException.forbidden("승인 대기 중"));
        assertEquals(403, assertThrows(ApiException.class, () -> api.list(first, request)).status());
        verifyNoInteractions(store);
    }

    @Test void personalStoriesKeepHangulLineBreaksAndCountEmojiAsOneCharacter() {
        var input = json.createObjectNode().put("name", "  달🌙  ").put("story", "강가에서\r\n다시 만나요.");
        assertEquals("달🌙", BambooGuestbookController.text(input,"name",24,false));
        assertEquals("강가에서\n다시 만나요.", BambooGuestbookController.text(input,"story",500,true));
        input.put("name", "🌿".repeat(24)); assertDoesNotThrow(() -> BambooGuestbookController.text(input,"name",24,false));
        for (String name : new String[] {"🌿".repeat(25), "\u00a0", "이름\n위조"}) {
            input.put("name", name); assertThrows(ApiException.class, () -> BambooGuestbookController.text(input,"name",24,false));
        }
        input.put("story", true); assertThrows(ApiException.class, () -> BambooGuestbookController.text(input,"story",500,true));
    }
}
