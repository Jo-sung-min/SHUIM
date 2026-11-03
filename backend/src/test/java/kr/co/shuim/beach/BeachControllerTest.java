package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class BeachControllerTest {
    private static DbUser user(String id, Long blockedAt) {
        return new DbUser(id, null, "닉", "user", true, blockedAt, null, 0);
    }

    private static BeachController controller(AuthService auth, BlockService blocks) {
        return new BeachController(auth, blocks, new BeachService(new org.springframework.mock.env.MockEnvironment(), false));
    }

    @Test
    void enterReturnsTicketMeSpawnBoundsAndCount() {
        AuthService auth = mock(AuthService.class);
        BlockService blocks = mock(BlockService.class);
        when(auth.requireUser(any(), any())).thenReturn(user("u-1", null));
        when(blocks.excludedIds("u-1")).thenReturn(Set.of("u-x"));
        BeachController c = controller(auth, blocks);
        Map<String, Object> out = c.enter(new MockHttpServletRequest(), new MockHttpServletResponse());
        assertEquals(Set.of("ticket", "me", "spawn", "bounds", "count"), out.keySet());
        assertEquals(32, ((String) out.get("ticket")).length());
        @SuppressWarnings("unchecked") Map<String, Object> me = (Map<String, Object>) out.get("me");
        assertEquals(Set.of("pid", "id", "nick", "skin"), me.keySet());
        assertEquals("u-1", me.get("id"));
        assertEquals("닉", me.get("nick"));
        @SuppressWarnings("unchecked") Map<String, Object> spawn = (Map<String, Object>) out.get("spawn");
        assertEquals(Set.of("x", "z", "yaw"), spawn.keySet());
        @SuppressWarnings("unchecked") Map<String, Object> bounds = (Map<String, Object>) out.get("bounds");
        assertEquals(Map.of("minX", -28.0, "maxX", 28.0, "minZ", -2.0, "maxZ", 30.0), bounds);
        assertEquals(1, out.get("count"));
        // 들어올 때 받은 차단 목록이 presence 에 남는다 (tick 에서는 DB 를 보지 않는다)
        BeachRoom.TickResult r = c.tick(new BeachController.TickBody((String) out.get("ticket"), 1.0, 2.0, null, null,
            new BeachController.Care("u-x", "hug")));
        assertEquals("gone", r.care());
        assertEquals(0, r.received().comfort());
        verify(blocks, times(1)).excludedIds("u-1");
        verifyNoMoreInteractions(blocks);
    }

    @Test
    void blockedAccountsCannotEnter() {
        AuthService auth = mock(AuthService.class);
        BlockService blocks = mock(BlockService.class);
        when(auth.requireUser(any(), any())).thenReturn(user("u-1", 1L));
        ApiException e = assertThrows(ApiException.class, () -> controller(auth, blocks).enter(new MockHttpServletRequest(), new MockHttpServletResponse()));
        assertEquals(403, e.status());
        verifyNoInteractions(blocks);
    }

    @Test
    void unknownTicketIsGoneAndLeaveIsAlwaysOk() {
        BeachController c = controller(mock(AuthService.class), mock(BlockService.class));
        ApiException e = assertThrows(ApiException.class, () -> c.tick(new BeachController.TickBody("nope", 0.0, 0.0, 0.0, false, null)));
        assertEquals(410, e.status());
        assertEquals(BeachController.GONE, e.getMessage());
        assertEquals(410, assertThrows(ApiException.class, () -> c.tick(null)).status());
        assertEquals(Map.of("ok", true), c.leave(new BeachController.TicketBody("nope")));
        assertEquals(Map.of("ok", true), c.leave(null));
        assertEquals(Map.of("count", 0), c.count());
    }
}
