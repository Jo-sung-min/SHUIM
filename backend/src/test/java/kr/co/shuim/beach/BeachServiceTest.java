package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BeachServiceTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachService service = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));

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
        for (int i = 0; i < 20; i++) enter("circle-a", "u-" + i);
        assertEquals(409, assertThrows(ApiException.class, () -> enter("circle-a", "overflow")).status());
        BeachRoom.Presence b = enter("circle-b", "u-b");
        assertEquals(1, tick(b, null).count());
        assertEquals(20, service.count("circle-a"));
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

    @Test
    void woodRequiresOwnedLiveVisitNearFireAndCannotTargetAnotherCommunity() {
        BeachRoom.Presence a = enter("circle-a", "u-a");
        BeachRoom.Presence b = enter("circle-b", "u-b");
        assertEquals(403, assertThrows(ApiException.class, () -> service.addWood(a.ticket(), "u-b", java.util.UUID.randomUUID().toString())).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.addWood(a.ticket(), "u-a", java.util.UUID.randomUUID().toString())).status());
        service.tick(a.ticket(), 0, 12, 0, false, null, null);
        assertEquals(4, service.addWood(a.ticket(), "u-a", java.util.UUID.randomUUID().toString()).logs());
        assertEquals(3, service.tick(b.ticket(), 0, 12, 0, false, null, null).fire().logs());
        assertEquals(clock.get(), service.tick(a.ticket(), 0, 12, 0, false, null, null).serverTime());
        assertEquals("circle-a", service.requireVisit(a.ticket(), "u-a").communityId());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> service.addWood(a.ticket(), "u-a", java.util.UUID.randomUUID().toString())).status());
    }

    @Test
    void twentyConcurrentVisitorsShareOneFireRead() throws Exception {
        BeachFireService fire = mock(BeachFireService.class);
        BeachFireService.FireView view = new BeachFireService.FireView(3, 12, .25, "amber", null,
            clock.get(), clock.get() + BeachFireService.LOG_BURN_MS, null, 0);
        CountDownLatch reading = new CountDownLatch(1), release = new CountDownLatch(1), start = new CountDownLatch(1);
        when(fire.snapshot("circle-a")).thenAnswer(call -> {
            reading.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return view;
        });
        BeachService cached = new BeachService(clock::get, fire);
        var visitors = new ArrayList<BeachRoom.Presence>();
        for (int i = 0; i < 20; i++) visitors.add(cached.enter("circle-a", "u-" + i, "방문자", Set.of()));
        try (var workers = Executors.newFixedThreadPool(16)) {
            var results = new ArrayList<java.util.concurrent.Future<BeachRoom.TickResult>>();
            for (var visitor : visitors) results.add(workers.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                return cached.tick(visitor.ticket(), 0, 12, 0, true, null, null);
            }));
            start.countDown();
            assertTrue(reading.await(5, TimeUnit.SECONDS));
            release.countDown();
            for (var result : results) assertSame(view, result.get(5, TimeUnit.SECONDS).fire());
        } finally { release.countDown(); }
        verify(fire, times(1)).snapshot("circle-a");
    }

    @Test
    void tickCacheExpiresAcrossInstancesAndOwnWoodInvalidatesOnlyItsRoom() {
        BeachFireService fire = spy(new BeachFireService(new TestFireRepository(), clock::get));
        BeachService cached = new BeachService(clock::get, fire);
        var a = cached.enter("circle-a", "u-a", "가", Set.of());
        var b = cached.enter("circle-b", "u-b", "나", Set.of());
        var first = cached.tick(a.ticket(), 0, 12, 0, false, null, null).fire();
        var other = cached.tick(b.ticket(), 0, 12, 0, false, null, null).fire();
        // A payment/another server can change storage without going through this room cache.
        fire.addWood("circle-a", "remote-user", UUID.randomUUID().toString());
        clock.addAndGet(999);
        assertSame(first, cached.tick(a.ticket(), 0, 12, 0, false, null, null).fire());
        assertEquals(4, cached.fire("circle-a").logs()); // Explicit reads are never cached.
        verify(fire, times(2)).snapshot("circle-a");
        clock.incrementAndGet();
        assertEquals(4, cached.tick(a.ticket(), 0, 12, 0, false, null, null).fire().logs());
        var currentOther = cached.tick(b.ticket(), 0, 12, 0, false, null, null).fire();
        assertNotSame(other, currentOther);
        assertEquals(5, cached.addWood(a.ticket(), "u-a", UUID.randomUUID().toString()).logs());
        assertEquals(5, cached.tick(a.ticket(), 0, 12, 0, false, null, null).fire().logs());
        assertSame(currentOther, cached.tick(b.ticket(), 0, 12, 0, false, null, null).fire());
        verify(fire, times(4)).snapshot("circle-a");
        verify(fire, times(2)).snapshot("circle-b");
        clock.addAndGet(-500); // A backwards clock must not keep a future-dated cached snapshot alive.
        assertEquals(clock.get(), cached.tick(a.ticket(), 0, 12, 0, false, null, null).fire().serverTime());
        verify(fire, times(5)).snapshot("circle-a");
    }

    @Test
    void failedFireReadsAreRetriedAndKnownExpiryRefreshesBeforeTheOneSecondLimit() {
        BeachFireService fire = mock(BeachFireService.class);
        long now = clock.get();
        var burning = new BeachFireService.FireView(1, 12, .01, "rose", now + 500, now, now + 500, now + 500, 0);
        var expired = new BeachFireService.FireView(0, 12, 0, "amber", null, now + 500, null, null, 0);
        when(fire.snapshot("circle-a")).thenThrow(new IllegalStateException("temporary read failure")).thenReturn(burning, expired);
        BeachService cached = new BeachService(clock::get, fire);
        var me = cached.enter("circle-a", "u-a", "가", Set.of());
        assertThrows(IllegalStateException.class, () -> cached.tick(me.ticket(), 0, 12, 0, false, null, null));
        assertSame(burning, cached.tick(me.ticket(), 0, 12, 0, false, null, null).fire());
        clock.addAndGet(499);
        assertSame(burning, cached.tick(me.ticket(), 0, 12, 0, false, null, null).fire());
        clock.incrementAndGet();
        assertSame(expired, cached.tick(me.ticket(), 0, 12, 0, false, null, null).fire());
        verify(fire, times(3)).snapshot("circle-a");
    }
}
