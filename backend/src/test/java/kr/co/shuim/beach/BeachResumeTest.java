package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BeachResumeTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachRoom room = new BeachRoom(clock::get, false, BeachMap.UYUNI);

    private BeachRoom.Presence enter(String user) { return room.enter(user, user, Set.of()); }
    private BeachRoom.TickResult move(BeachRoom.Presence p, double x, double z, long seq) {
        return room.tick(p.ticket(), x, z, .75, true, null, null, null, false, seq);
    }
    private BeachRoom.Entry resume(BeachRoom.Presence p, long seq) {
        return room.enter(p.userId(), p.nick(), Set.of(), null, p.ticket(), seq);
    }

    @Test
    void quickSwitchKeepsTicketPidAndBedAndStopsMovementWithoutReclaimingASeat() {
        var me = enter("u");
        move(me, -12, 21, 1);
        var bed = room.rest(me.ticket(), "lie", "hotel-dawn");
        room.suspend(me.ticket(), 20, 40, 0, 2L);
        clock.addAndGet(5_000);
        var back = resume(me, 2);
        assertTrue(back.resumed());
        assertSame(me, back.presence());
        assertEquals(bed, BeachRoom.RestPresence.of(back.presence()));
        assertEquals(1, room.count());
        assertFalse(me.moving());
        long fence = me.sequence();
        assertTrue(fence > 2);
        room.suspend(me.ticket(), 20, 40, 0, 2L); // Delayed beacon after reentry.
        assertSame(me, resume(me, 2).presence());
        assertEquals(fence, me.sequence());
        room.rest(me.ticket(), "stand", "hotel-dawn");
        move(me, -11, 21, fence + 1);
        assertEquals(-11, me.x());
    }

    @Test
    void suspendedAndOutOfOrderPollsCannotMoveSendCareDrainInboxOrRenewTheLease() {
        var me = enter("u");
        var friend = enter("v");
        move(me, 8, 20, 10);
        clock.addAndGet(100);
        room.suspend(me.ticket(), 9, 21, .5, 12L);
        long lastSeen = me.lastSeen(), updatedAt = me.updatedAt();
        room.tick(friend.ticket(), 8, 21, 0, false, me.userId(), "wave");
        assertEquals(1, me.pendingEvents());
        clock.addAndGet(4_000);
        var late = room.tick(me.ticket(), -20, -1, 0, true, friend.userId(), "wave", "female", false, 11L);
        assertEquals(12, late.sequence());
        assertNull(late.care());
        assertTrue(late.events().isEmpty());
        assertEquals(1, me.pendingEvents());
        assertEquals(0, friend.receivedComfort());
        assertEquals(9, me.x());
        assertFalse(me.moving());
        assertEquals(lastSeen, me.lastSeen());
        assertEquals(updatedAt, me.updatedAt());
        room.suspend(me.ticket(), -20, -1, 0, 12L);
        assertEquals(lastSeen, me.lastSeen());
        clock.set(lastSeen + BeachRoom.IDLE_MS + 1);
        assertNull(move(me, 1, 1, 13));
        assertEquals(0, room.count());
    }

    @Test
    void expiredBedsReleaseAndResumeAtSafeStandingPositionWithoutFireDatabaseReads() {
        BeachFireService fire = mock(BeachFireService.class);
        BeachService service = new BeachService(clock::get, fire);
        var old = service.enter("c", "u", "u", Set.of(), "pixel-male", "uyuni");
        service.tick(old.ticket(), -12, 21, .75, false, null, null, null, false, 1L);
        service.rest(old.ticket(), "lie", "hotel-dawn");
        service.suspend(old.ticket(), nullNumber(), nullNumber(), nullNumber(), 2L);
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(0, service.count("c", "uyuni"));
        assertNull(service.tick(old.ticket(), 1, 1, 0, true, null, null));
        for (int i = 0; i < 2; i++) {
            var guest = service.enter("c", "other" + i, "v", Set.of(), null, "uyuni");
            service.tick(guest.ticket(), -12, 21, 0, false, null, null);
            assertEquals(i, service.rest(guest.ticket(), "lie", "hotel-dawn").slot());
        }
        var back = service.enter("c", "u", "u", Set.of(), null, "uyuni", old.ticket(), 2L);
        assertTrue(back.resumed());
        assertNotEquals(old.ticket(), back.presence().ticket());
        assertNotEquals(old.pid(), back.presence().pid());
        assertEquals(-12, back.presence().x());
        assertEquals(21, back.presence().z());
        assertEquals(.75, back.presence().yaw());
        assertEquals(2, back.presence().skin());
        assertEquals("standing", BeachRoom.RestPresence.of(back.presence()).pose());
        assertEquals(3, service.count("c", "uyuni"));
        service.leave(old.ticket()); // An old unload must not remove the replacement.
        assertNotNull(service.requireVisit(back.presence().ticket(), "u"));
        verifyNoInteractions(fire);
    }

    private static double nullNumber() { return Double.NaN; }

    @Test
    void concurrentExpiredResumeRetriesCreateExactlyOneReplacementAndExplicitLeaveForgetsAliases() throws Exception {
        var old = enter("u");
        move(old, 11, 25, 1);
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        CountDownLatch start = new CountDownLatch(1);
        var tickets = new HashSet<String>();
        try (var pool = Executors.newFixedThreadPool(12)) {
            var jobs = new ArrayList<java.util.concurrent.Future<BeachRoom.Entry>>();
            for (int i = 0; i < 40; i++) jobs.add(pool.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                return resume(old, 1);
            }));
            start.countDown();
            for (var job : jobs) {
                var entry = job.get(5, TimeUnit.SECONDS);
                assertTrue(entry.resumed());
                tickets.add(entry.presence().ticket());
            }
        }
        assertEquals(1, tickets.size());
        assertEquals(1, room.count());
        room.leave(tickets.iterator().next());
        assertEquals(0, room.resumeTicketCount());
        assertFalse(resume(old, 1).resumed());
    }

    @Test
    void resumeIsBoundToOwnerCommunityAndMapAndRechecksFreshBlocks() {
        BeachService service = new BeachService(clock::get, mock(BeachFireService.class));
        var old = service.enter("a", "u", "u", Set.of(), null, "uyuni");
        assertEquals(403, assertThrows(ApiException.class, () -> service.enter("a", "other", "other", Set.of(), null, "uyuni", old.ticket(), 0L)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> service.enter("b", "u", "u", Set.of(), null, "uyuni", old.ticket(), 0L)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> service.enter("a", "u", "u", Set.of(), null, "beach", old.ticket(), 0L)).status());
        var friend = service.enter("a", "v", "v", Set.of(), null, "uyuni");
        service.tick(friend.ticket(), 0, 9, 0, false, "u", "wave");
        var back = service.enter("a", "u", "new nick", Set.of("v"), "female", "uyuni", old.ticket(), 0L);
        assertSame(old, back.presence());
        assertEquals("new nick", old.nick());
        assertEquals(Set.of("v"), old.excluded());
        assertEquals(0, old.pendingEvents());
        var snapshot = service.tick(old.ticket(), 0, 9, 0, false, null, null, null, false, old.sequence() + 1);
        assertTrue(snapshot.players().isEmpty());
        assertEquals(1, old.skin());
    }

    @Test
    void bookmarkGraceIsMeasuredFromLastPresenceNotLateSweepAndHasAFixedMemoryLimit() {
        var expired = enter("expired");
        clock.addAndGet(BeachRoom.RESUME_MS + 1);
        var fresh = resume(expired, 0);
        assertFalse(fresh.resumed());
        room.leave(fresh.presence().ticket());
        var oldest = enter("oldest");
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        room.sweep();
        for (int batch = 0; batch <= BeachRoom.MAX_RESUME_TICKETS / BeachRoom.CAPACITY; batch++) {
            for (int i = 0; i < BeachRoom.CAPACITY; i++) {
                enter("batch-" + batch + "-" + i);
            }
            clock.addAndGet(BeachRoom.IDLE_MS + 1);
            room.sweep();
        }
        assertEquals(BeachRoom.MAX_RESUME_TICKETS, room.resumeTicketCount());
        assertFalse(resume(oldest, 0).resumed());
        clock.addAndGet(BeachRoom.RESUME_MS + 1);
        room.sweep();
        assertEquals(0, room.resumeTicketCount());
    }

    @Test
    void fullRoomCanResumeLiveVisitorButCannotReclaimCapacityFromSomeoneElse() {
        var me = enter("u");
        for (int i = 0; i < BeachRoom.CAPACITY - 1; i++) enter("v" + i);
        assertSame(me, resume(me, 0).presence());
        assertEquals(20, room.count());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        for (int i = 0; i < BeachRoom.CAPACITY; i++) enter("new" + i);
        assertEquals(409, assertThrows(ApiException.class, () -> resume(me, 0)).status());
        assertEquals(20, room.count());
    }

    @Test
    void movementTimestampChangesOnlyWithStateAndSequenceStopsReorderingAndDuplicateCare() {
        var me = enter("u");
        var friend = enter("v");
        clock.addAndGet(100);
        var first = move(me, 10, 20, 3);
        long movedAt = me.updatedAt();
        clock.addAndGet(100);
        move(me, 10, 20, 4);
        assertEquals(movedAt, me.updatedAt());
        move(me, -20, -1, 2);
        assertEquals(10, me.x());
        assertEquals(4, me.sequence());
        assertEquals(movedAt, me.updatedAt());
        assertEquals("sent", room.tick(me.ticket(), 10, 20, .75, true, "v", "wave", null, false, 5L).care());
        clock.addAndGet(4_000);
        assertNull(room.tick(me.ticket(), 10, 20, .75, true, "v", "wave", null, false, 5L).care());
        assertEquals(1, room.tick(friend.ticket(), 0, 0, 0, false, null, null).received().wave());
        assertEquals(movedAt, first.players().stream().filter(p -> p.id().equals("v")).findFirst().orElseThrow().updatedAt() + 100);
        assertEquals(movedAt, BeachRoom.PlayerView.of(me).updatedAt());
        room.tick(me.ticket(), -20, -1, 0, true, null, null); // Legacy poll after sequence mode.
        assertEquals(10, me.x());
        assertEquals(400, assertThrows(ApiException.class, () -> move(me, 0, 0, -1)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> move(me, 0, 0, Long.MAX_VALUE)).status());
    }

    @Test
    void delayedEntryCannotUndoANewerSuspensionOrStopNewMovement() {
        var me = enter("u");
        move(me, 10, 20, 1);
        room.suspend(me.ticket(), 11, 21, .75, 2L);
        resume(me, 2);
        move(me, 12, 22, 4);
        long movedAt = me.updatedAt();
        assertSame(me, resume(me, 2).presence());
        assertTrue(me.moving());
        assertEquals(movedAt, me.updatedAt());
        clock.addAndGet(100);
        room.suspend(me.ticket(), 13, 23, .75, 5L);
        long lastSeen = me.lastSeen();
        clock.addAndGet(100);
        resume(me, 2);
        move(me, -20, -1, 6);
        assertEquals(13, me.x());
        assertEquals(lastSeen, me.lastSeen());
        resume(me, 6);
        move(me, 14, 24, me.sequence() + 1);
        assertEquals(14, me.x());
    }

    @Test
    void unknownTokenRetryReusesTheLastCapacitySlotAfterALostResponse() throws Exception {
        BeachFireService fire = mock(BeachFireService.class);
        BeachService restarted = new BeachService(clock::get, fire);
        for (int i = 0; i < BeachRoom.CAPACITY - 1; i++) restarted.enter("c", "v" + i, "v", Set.of(), null, "uyuni");
        String unknown = "0123456789abcdef0123456789abcdef";
        var first = restarted.enter("c", "u", "u", Set.of(), null, "uyuni", unknown, 20L);
        assertFalse(first.resumed());
        assertEquals(20, restarted.count("c", "uyuni"));
        try (var pool = Executors.newFixedThreadPool(12)) {
            var jobs = new ArrayList<java.util.concurrent.Future<BeachRoom.Entry>>();
            for (int i = 0; i < 40; i++) jobs.add(pool.submit(() ->
                restarted.enter("c", "u", "u", Set.of(), null, "uyuni", unknown, 20L)));
            for (var job : jobs) {
                var retried = job.get(5, TimeUnit.SECONDS);
                assertFalse(retried.resumed(), "Unknown historical position must not restore the old camera.");
                assertSame(first.presence(), retried.presence());
                assertEquals(first.presence().sequence(), retried.presence().sequence());
            }
        }
        assertEquals(20, restarted.count("c", "uyuni"));
        assertEquals(403, assertThrows(ApiException.class, () ->
            restarted.enter("c", "other", "other", Set.of(), null, "uyuni", unknown, 20L)).status());
        assertEquals(403, assertThrows(ApiException.class, () ->
            restarted.enter("other-circle", "u", "u", Set.of(), null, "uyuni", unknown, 20L)).status());
        assertEquals(403, assertThrows(ApiException.class, () ->
            restarted.enter("c", "u", "u", Set.of(), null, "beach", unknown, 20L)).status());
        assertNull(restarted.tick(unknown, 10, 20, 0, false, null, null));
        assertEquals(410, assertThrows(ApiException.class, () -> restarted.requireVisit(unknown, "u")).status());
        verifyNoInteractions(fire);
    }

    @Test
    void unknownTokenFirstRequestsRacingAcrossMapsCanOnlyBindOneRoom() throws Exception {
        BeachService restarted = new BeachService(clock::get, mock(BeachFireService.class));
        String unknown = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var jobs = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (String map : Set.of("beach", "uyuni")) jobs.add(pool.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try {
                    restarted.enter("c", "u", "u", Set.of(), null, map, unknown, 7L);
                    return 200;
                } catch (ApiException e) { return e.status(); }
            }));
            start.countDown();
            Set<Integer> statuses = new HashSet<>();
            for (var job : jobs) statuses.add(job.get(5, TimeUnit.SECONDS));
            assertEquals(Set.of(200, 403), statuses);
        }
        assertEquals(1, restarted.count("c", "beach") + restarted.count("c", "uyuni"));
    }

    @Test
    void unknownAliasExpiresInThirtySecondsWhileTheRealNewTicketKeepsNormalResumeHistory() {
        String unknown = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        var first = room.enter("u", "u", Set.of(), null, unknown, 9L);
        assertFalse(first.resumed());
        move(first.presence(), 15, 30, first.presence().sequence() + 1);
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        var lateRetry = room.enter("u", "u", Set.of(), null, unknown, 9L);
        assertFalse(lateRetry.resumed());
        assertEquals(15, lateRetry.presence().x());
        assertEquals(1, room.count());
        clock.addAndGet(BeachRoom.UNKNOWN_RESUME_RETRY_MS);
        room.sweep();
        assertFalse(room.retainsTicket(unknown));
        var realTicketResume = resume(lateRetry.presence(), lateRetry.presence().sequence());
        assertTrue(realTicketResume.resumed());
        assertEquals(15, realTicketResume.presence().x());
        assertEquals(30, realTicketResume.presence().z());
    }

    @Test
    void olderResumeCannotReplaceNewerIdentityBlocksOrFilterItsInbox() {
        var me = enter("u");
        var friend = enter("allowed");
        move(me, 10, 20, 1);
        room.enter("u", "older", Set.of(), "male", me.ticket(), 2L);
        room.enter("u", "latest", Set.of("blocked"), "female", me.ticket(), 6L);
        room.tick(friend.ticket(), 10, 20, 0, false, "u", "wave");
        assertEquals(1, me.pendingEvents());
        long updatedAt = me.updatedAt(), lastSeen = me.lastSeen();
        clock.addAndGet(100);
        room.enter("u", "older", Set.of("allowed"), "male", me.ticket(), 2L);
        assertEquals("latest", me.nick());
        assertEquals(Set.of("blocked"), me.excluded());
        assertEquals(1, me.skin());
        assertEquals(1, me.pendingEvents());
        assertEquals(updatedAt, me.updatedAt());
        assertEquals(lastSeen, me.lastSeen());
    }

    @Test
    void clockRollbackDoesNotKeepAHiddenVisitorOrBookmarkForever() {
        var me = enter("u");
        room.suspend(me.ticket(), 2, 20, 0, 1L);
        clock.addAndGet(-1);
        assertEquals(0, room.count());
        assertFalse(resume(me, 1).resumed());
    }
}
