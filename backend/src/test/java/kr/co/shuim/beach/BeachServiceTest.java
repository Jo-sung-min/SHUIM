package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class BeachServiceTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachService service = new BeachService(clock::get);

    private BeachRoom.Presence enter(String circle, String user) {
        return service.enter(circle, user, user, Set.of());
    }

    private BeachRoom.TickResult tick(BeachRoom.Presence me, String target) {
        return service.tick(me.ticket(), 0, 9, 0, false, target, target == null ? null : "comfort");
    }

    @Test
    void eachCircleHasExactlyOneRoomWithIsolatedPlayersCareAndOccupancy() {
        assertEquals(0, service.count("circle-a"));
        BeachRoom.Presence a = enter("circle-a", "u-a");
        BeachRoom.Presence a2 = enter("circle-a", "u-a2");
        BeachRoom.Presence b = enter("circle-b", "u-b");
        assertEquals(2, service.count("circle-a"));
        assertEquals(1, service.count("circle-b"));
        assertEquals(Set.of(a2.pid()), tick(a, null).players().stream().map(BeachRoom.PlayerView::pid).collect(java.util.stream.Collectors.toSet()));
        assertTrue(tick(b, null).players().isEmpty());
        assertEquals("gone", tick(a, "u-b").care());
        assertTrue(tick(b, null).events().isEmpty());
        assertEquals("sent", tick(a, "u-a2").care());
        assertEquals(1, tick(a2, null).received().comfort());
        assertTrue(tick(b, null).events().isEmpty());
    }

    @Test
    void ticketsStayBoundToTheirRoomEvenForTheSameMemberInTwoCircles() {
        BeachRoom.Presence a = enter("circle-a", "same-user");
        BeachRoom.Presence b = enter("circle-b", "same-user");
        assertNotEquals(a.ticket(), b.ticket());
        assertTrue(tick(a, null).players().isEmpty());
        assertTrue(tick(b, null).players().isEmpty());
        service.leave(a.ticket());
        assertNull(tick(a, null));
        assertNotNull(tick(b, null));
        assertEquals(0, service.count("circle-a"));
        assertEquals(1, service.count("circle-b"));
    }

    @Test
    void fullCircleDoesNotUseAnotherCirclesCapacity() {
        for (int i = 0; i < 100; i++) enter("circle-a", "u-" + i);
        assertEquals(409, assertThrows(ApiException.class, () -> enter("circle-a", "overflow")).status());
        BeachRoom.Presence b = enter("circle-b", "u-b");
        assertEquals(1, tick(b, null).count());
        assertEquals(100, service.count("circle-a"));
    }

    @Test
    void expiredTicketsCannotBeUsedAfterNewEntries() {
        BeachRoom.Presence a = enter("circle-a", "u-a");
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        enter("circle-b", "u-b");
        assertNull(tick(a, null));
        assertEquals(0, service.count("circle-a"));
        service.leave("unknown");
        service.leave(null);
    }
}
