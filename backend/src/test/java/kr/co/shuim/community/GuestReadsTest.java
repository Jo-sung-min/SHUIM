package kr.co.shuim.community;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.message.MessageController;
import kr.co.shuim.message.MessageService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 세션 없는 GET 이 익명 회원을 만들지 않는지, 익명 계정이 DM 을 보내지 못하는지 */
class GuestReadsTest {
    @Test
    void communityGetWithoutSessionUsesTheUnsavedGuestAndNeverCreatesAUser() {
        AuthService auth = mock(AuthService.class);
        CommunityService community = mock(CommunityService.class);
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        CommunityController controller = new CommunityController(auth, community, mock(CommunityConsentService.class));
        controller.get(new MockHttpServletRequest());
        verify(community).viewerStore(CommunityService.GUEST);
        verify(auth, never()).requireUser(any(), any());
        assertFalse(CommunityService.GUEST_ID.isEmpty());
    }

    @Test
    void messageReadsWithoutSessionReturnEmptyOr401WithoutCreatingAUser() {
        AuthService auth = mock(AuthService.class);
        MessageService messages = mock(MessageService.class);
        when(auth.currentUser(any())).thenReturn(Optional.empty());
        MessageController controller = new MessageController(auth, messages);
        assertEquals(Map.of("conversations", List.of(), "unread", 0), controller.list(new MockHttpServletRequest()));
        assertEquals(401, assertThrows(ApiException.class, () -> controller.thread("c", null, new MockHttpServletRequest())).status());
        assertEquals(401, assertThrows(ApiException.class, () -> controller.read("c", new MockHttpServletRequest())).status());
        assertEquals(401, assertThrows(ApiException.class,
            () -> controller.send(Map.of("toUserId", "x", "text", "hi"), new MockHttpServletRequest(), new MockHttpServletResponse())).status());
        verify(auth, never()).requireUser(any(), any());
        verifyNoInteractions(messages);
    }

    @Test
    void anonymousAccountsCannotSendDirectMessages() {
        JdbcClient jdbc = mock(JdbcClient.class);
        CommunityConsentService consent = mock(CommunityConsentService.class);
        MessageService service = new MessageService(jdbc, mock(BlockService.class), consent);
        DbUser anon = new DbUser("anon-1234", null, "익명", "user", true, null, null, 0L);
        ApiException e = assertThrows(ApiException.class, () -> service.sendMessage(anon, "someone", "안녕"));
        assertEquals(401, e.status());
        assertEquals(MessageService.LOGIN_TO_SEND, e.getMessage());
        verifyNoInteractions(jdbc, consent);
    }

    @Test
    void dailyCapsStopAtTheLimitPerKindAndAccount() {
        DailyCaps caps = new DailyCaps();
        for (int i = 0; i < 3; i++) assertTrue(caps.tryTake("post", "a", 3));
        assertFalse(caps.tryTake("post", "a", 3));
        assertFalse(caps.tryTake("post", "a", 3));
        assertTrue(caps.tryTake("post", "b", 3));
        assertTrue(caps.tryTake("comment", "a", 3));
    }
}
