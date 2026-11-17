package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 3D 공간의 정원 독점, 살아 있는 방문의 자격 다시 보기, 소원 풍등 내리기, 빈 방 정리 */
class BeachModerationTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private static DbUser user(String id, Long blockedAt) { return new DbUser(id, id + "@example.com", id, "user", false, blockedAt, null, 0); }
    private void actor(DbUser value) { when(auth.currentUser(any())).thenReturn(Optional.ofNullable(value)); }
    private BeachRoom.TickResult tick(BeachRoom.Presence p) {
        return controller.tick(new BeachController.TickBody(p.ticket(), 0.0, 3.0, 0.0, false, null), request);
    }

    @BeforeEach
    void setup() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        when(blocks.excludedIds(anyString())).thenReturn(Set.of());
    }

    @Test
    void oneAccountKeepsAtMostTwoVisitsPerRoomSoItCannotFillTheCapacity() {
        BeachRoom room = new BeachRoom(clock::get, false);
        room.setCapacity(5);
        BeachRoom.Presence first = room.enter("u-farm", "a", Set.of(), null);
        for (int i = 0; i < 10; i++) { clock.addAndGet(10); room.enter("u-farm", "a", Set.of(), null); }
        assertEquals(BeachRoom.MAX_VISITS_PER_USER, room.count());
        assertNull(room.presence(first.ticket()), "the oldest visit gives way to the newest");
        // 다른 사람은 여전히 들어올 수 있다
        assertDoesNotThrow(() -> room.enter("u-other", "b", Set.of(), null));
    }

    @Test
    void aLiveVisitIsDroppedOnceItsAccountIsSuspendedAndNewBlocksHideOthers() {
        actor(user("u-me", null));
        BeachRoom.Presence me = beach.enter("public", "u-me", "나", Set.of());
        BeachRoom.Presence other = beach.enter("public", "u-other", "너", Set.of());
        assertEquals(1, tick(me).players().size());

        // 새로 차단한 사람은 다음 다시 보기에서 사라진다
        when(blocks.excludedIds("u-me")).thenReturn(Set.of("u-other"));
        clock.addAndGet(5_000); beach.tick(other.ticket(), 1, 3, 0, false, null, null);
        assertEquals(1, tick(me).players().size(), "the recheck runs only once per interval");
        for (int i = 0; i < 12; i++) { clock.addAndGet(5_000); beach.tick(other.ticket(), 1, 3, 0, false, null, null); tick(me); }
        assertEquals(0, tick(me).players().size());

        // 관리자가 정지하면 tick 만 보내던 방문도 내보낸다
        actor(user("u-me", 5L));
        for (int i = 0; i < 12 && beach.communityIdForTicket(me.ticket()) != null; i++) {
            clock.addAndGet(5_000);
            try { tick(me); } catch (ApiException e) { assertEquals(403, e.status()); }
        }
        assertNull(beach.communityIdForTicket(me.ticket()));
    }

    @Test
    void aVisitWhoseSessionEndedMustEnterAgain() {
        actor(user("u-me", null));
        BeachRoom.Presence me = beach.enter("public", "u-me", "나", Set.of());
        actor(null);
        ApiException gone = null;
        for (int i = 0; i < 13 && gone == null; i++) {
            clock.addAndGet(5_000);
            try { tick(me); } catch (ApiException e) { gone = e; }
        }
        assertNotNull(gone);
        assertEquals(410, gone.status());
        assertNull(beach.communityIdForTicket(me.ticket()));
    }

    @Test
    void lanternsCanBeTakenDownByTheirAuthorOrAnAdministratorButNotByOthers() {
        BeachRoom.Presence me = beach.enter("public", "u-me", "나", Set.of(), null, "uyuni");
        BeachRoom.Presence other = beach.enter("public", "u-other", "너", Set.of(), null, "uyuni");
        var lantern = beach.launchUyuniMoment(me.ticket(), "u-me", UUID.randomUUID().toString(), "lantern", null, "rose", "다 같이 행복하길", Set.of());
        String id = lantern.event().id();
        assertFalse(beach.removeOwnLantern(other.ticket(), "u-other", id));
        assertEquals(1, beach.uyuniMoments(other.ticket()).events().size());
        assertTrue(beach.removeOwnLantern(me.ticket(), "u-me", id));
        assertTrue(beach.uyuniMoments(other.ticket()).events().isEmpty());

        clock.addAndGet(BeachUyuniMoments.LANTERN_COOLDOWN_MS + 1);
        String second = beach.launchUyuniMoment(me.ticket(), "u-me", UUID.randomUUID().toString(), "lantern", null, "sky", "내일도 맑기를", Set.of()).event().id();
        actor(new DbUser("admin", "a@example.com", "운영", "admin", false, null, null, 0));
        assertEquals(true, controller.adminRemoveLantern(second, request).get("removed"));
        assertTrue(beach.uyuniMoments(other.ticket()).events().isEmpty());
        actor(user("u-other", null));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.adminRemoveLantern(second, request)).status());
    }

    @Test
    void offensiveWishesAreRefused() {
        BeachRoom.Presence me = beach.enter("public", "u-me", "나", Set.of(), null, "uyuni");
        var refused = assertThrows(ApiException.class, () -> beach.launchUyuniMoment(me.ticket(), "u-me", UUID.randomUUID().toString(),
            "lantern", null, "rose", "씨 발", Set.of()));
        assertEquals(400, refused.status());
    }

    @Test
    void emptyRoomsAreForgottenAfterTheirResumeWindow() {
        BeachRoom.Presence me = beach.enter("circle-1", "u-me", "나", Set.of());
        assertEquals(1, beach.roomCount());
        beach.leave(me.ticket());
        clock.addAndGet(BeachRoom.RESUME_MS + 5_000);
        beach.enter("public", "u-other", "너", Set.of());
        assertEquals(1, beach.roomCount(), "only the occupied room remains");
    }

    @Test
    void guestbookTextRejectsInvisibleDirectionControls() {
        ObjectNode input = new ObjectMapper().createObjectNode();
        input.put("name", "달‮밤");
        assertThrows(ApiException.class, () -> BambooGuestbookController.text(input, "name", 24, false));
        input.put("name", "👩‍👩‍👧");
        assertDoesNotThrow(() -> BambooGuestbookController.text(input, "name", 24, false));
    }
}
