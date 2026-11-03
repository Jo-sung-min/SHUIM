package kr.co.shuim.beach;

import kr.co.shuim.beach.BeachRoom.CareEvent;
import kr.co.shuim.beach.BeachRoom.PlayerView;
import kr.co.shuim.beach.BeachRoom.Presence;
import kr.co.shuim.beach.BeachRoom.TickResult;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class BeachRoomTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);

    private BeachRoom room() { return new BeachRoom(clock::get, false); }

    private static TickResult at(BeachRoom room, Presence p, double x, double z) {
        return room.tick(p.ticket(), x, z, 0, false, null, null);
    }

    private static TickResult care(BeachRoom room, Presence from, Presence to, String kind) {
        return room.tick(from.ticket(), from.x(), from.z(), from.yaw(), false, to.userId(), kind, null, true);
    }

    private static List<String> pids(TickResult r) { return r.players().stream().map(PlayerView::pid).toList(); }

    @Test
    void twoUsersSeeEachOtherButNotThemselves() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        assertEquals(12, a.pid().length());
        assertEquals(32, a.ticket().length());
        assertNotEquals(a.pid(), a.ticket());
        assertTrue(a.x() >= -1.5 && a.x() <= 1.5 && a.z() >= 2.8 && a.z() <= 4);
        assertEquals(Math.atan2(a.x(), a.z() - 12), a.yaw());
        assertEquals(BeachRoom.skinOf("u-a"), a.skin());
        assertTrue(a.skin() >= 0 && a.skin() < 2);

        TickResult ra = at(room, a, 1, 10);
        assertEquals(List.of(b.pid()), pids(ra));
        assertEquals(2, ra.count());
        assertNull(ra.care());
        assertTrue(ra.events().isEmpty());
        PlayerView view = at(room, b, 2, 10).players().get(0);
        assertEquals(a.pid(), view.pid());
        assertEquals("u-a", view.id());
        assertEquals("가", view.nick());
        assertEquals(1, view.x());
        assertEquals(10, view.z());
    }

    @Test
    void sameUserTwiceGetsTwoPresencesThatSeeEachOther() {
        BeachRoom room = room();
        Presence tab1 = room.enter("u-a", "가", Set.of());
        Presence tab2 = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        assertNotEquals(tab1.ticket(), tab2.ticket());
        assertNotEquals(tab1.pid(), tab2.pid());
        TickResult r = at(room, tab1, 0, 10);
        assertEquals(Set.of(tab2.pid(), b.pid()), Set.copyOf(pids(r)));
        assertEquals(3, r.count());
        assertEquals(Set.of(tab1.pid(), tab2.pid()), Set.copyOf(pids(at(room, b, 0, 10))));
    }

    @Test
    void characterSelectionIsSharedAndOmittedTicksPreserveIt() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of(), "male");
        Presence b = room.enter("u-b", "나", Set.of(), "female");
        assertEquals(0, a.skin());
        assertEquals(1, b.skin());
        assertEquals(1, at(room, a, 0, 10).players().get(0).skin());
        assertEquals(0, at(room, b, 1, 10).players().get(0).skin());

        room.tick(a.ticket(), 0, 10, 0, false, null, null, "female");
        assertEquals(1, at(room, b, 1, 10).players().get(0).skin());
        at(room, a, 0, 10); // Old clients may omit the new field.
        assertEquals(1, a.skin());
        room.tick(a.ticket(), 0, 10, 0, false, null, null, "male");
        assertEquals(0, at(room, b, 1, 10).players().get(0).skin());
        assertEquals(1, b.skin(), "changing one presence never changes another player");
    }

    @Test
    void invalidCharacterCannotEnterOrChangeExistingPresence() {
        BeachRoom room = room();
        assertEquals(400, assertThrows(ApiException.class, () -> room.enter("u-a", "가", Set.of(), "other")).status());
        assertEquals(0, room.count());
        Presence a = room.enter("u-a", "가", Set.of(), "male");
        double oldX = a.x();
        assertEquals(400, assertThrows(ApiException.class,
            () -> room.tick(a.ticket(), 18, 10, 0, false, null, null, "")).status());
        assertEquals(0, a.skin());
        assertEquals(oldX, a.x());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertNull(room.tick(a.ticket(), 0, 10, 0, false, null, null, "female"));
        assertEquals(0, room.count(), "a selection cannot revive an expired ticket");
    }

    @Test
    void positionsAreClampedToBounds() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        at(room, a, 100, -50);
        assertEquals(BeachRoom.MAX_X, a.x());
        assertEquals(BeachRoom.MIN_Z, a.z());
        at(room, a, -100, 500);
        assertEquals(BeachRoom.MIN_X, a.x());
        assertEquals(BeachRoom.MAX_Z, a.z());
        PlayerView v = at(room, b, 0, 10).players().get(0);
        assertEquals(BeachRoom.MIN_X, v.x());
        assertEquals(BeachRoom.MAX_Z, v.z());
        // NaN 은 이전 값 유지
        room.tick(a.ticket(), Double.NaN, Double.NaN, Double.NaN, true, null, null);
        assertEquals(BeachRoom.MIN_X, a.x());
        assertTrue(a.moving());
    }

    @Test
    void unknownOrLeftTicketReturnsNull() {
        BeachRoom room = room();
        assertNull(room.tick("nope", 0, 0, 0, false, null, null));
        assertNull(room.tick(null, 0, 0, 0, false, null, null));
        Presence a = room.enter("u-a", "가", Set.of());
        assertNotNull(at(room, a, 0, 10));
        room.leave(a.ticket());
        assertNull(at(room, a, 0, 10));
        assertEquals(0, room.count());
        room.leave("nope"); // 조용히 지나간다
    }

    @Test
    void idlePresenceIsSweptAfterTenSeconds() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        assertEquals(2, room.count());
        clock.addAndGet(9_000);
        at(room, b, 0, 10);
        assertEquals(2, room.count());
        clock.addAndGet(1_001); // a 는 10초 넘게 조용, b 는 1초 전에 tick
        TickResult rb = at(room, b, 0, 10);
        assertTrue(rb.players().isEmpty());
        assertEquals(1, rb.count());
        assertEquals(1, room.count());
        assertNull(at(room, a, 0, 10));
        assertNull(room.presence(a.ticket()));
        assertNotNull(room.presence(b.ticket()));
    }

    @Test
    void careHasGlobalAndPerTargetCooldowns() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        Presence c = room.enter("u-c", "다", Set.of());
        at(room, a, 0, 10);
        at(room, b, 2, 10);
        at(room, c, 4, 10);

        assertEquals("sent", care(room, a, b, "comfort").care());
        clock.addAndGet(500);
        assertEquals("cooldown", care(room, a, b, "comfort").care());   // 누구에게든 1초
        assertEquals("cooldown", care(room, a, c, "hug").care());
        clock.addAndGet(1_000);                                           // +1.5초
        assertEquals("cooldown", care(room, a, b, "hug").care());        // 같은 사람 3초
        assertEquals("sent", care(room, a, c, "hug").care());            // 다른 사람은 됨
        clock.addAndGet(1_600);                                           // +3.1초
        assertEquals("sent", care(room, a, b, "hug").care());
        TickResult rb = at(room, b, 2, 10);
        assertEquals(1, rb.received().comfort());
        assertEquals(1, rb.received().hug());
        assertEquals(1, at(room, c, 4, 10).received().hug());
        assertThrows(ApiException.class, () -> care(room, a, b, "kiss"));
        assertThrows(ApiException.class, () -> room.tick(a.ticket(), 0, 10, 0, false, "u-b", null));
    }

    @Test
    void careToUnknownUserIsGone() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b = room.enter("u-b", "나", Set.of());
        at(room, b, 0, 10);
        assertEquals("gone", room.tick(a.ticket(), 0, 10, 0, false, "u-nobody", "comfort").care());
        assertEquals("gone", room.tick(a.ticket(), 0, 10, 0, false, "u-a", "comfort").care()); // 나 자신(탭 하나)도 없음
        room.leave(b.ticket());
        assertEquals("gone", room.tick(a.ticket(), 0, 10, 0, false, "u-b", "comfort").care());
        assertEquals(0, a.lastCareTo().size());
    }

    @Test
    void careReachesTargetSenderAndNearbyBystandersOnce() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of());
        Presence b1 = room.enter("u-b", "나", Set.of());
        Presence b2 = room.enter("u-b", "나", Set.of()); // 같은 사람의 둘째 탭, 멀리 있어도 받는다
        Presence near = room.enter("u-c", "다", Set.of());
        Presence far = room.enter("u-d", "라", Set.of());
        at(room, a, 0, 10);
        at(room, b1, 10, 0);
        at(room, b2, 14, 20);
        at(room, near, 0, 0);    // b1 에서 10 m, b2 에서는 20 m 밖
        at(room, far, -14, 20);  // 받는 두 사람 모두 20 m 밖

        TickResult ra = care(room, a, b1, "hug");
        assertEquals("sent", ra.care());
        assertEquals(2, ra.events().size()); // 받는 presence 마다 하나 (b1, b2)
        assertEquals(Set.of(b1.pid(), b2.pid()), Set.of(ra.events().get(0).toPid(), ra.events().get(1).toPid()));
        CareEvent e = ra.events().stream().filter(x -> x.toPid().equals(b1.pid())).findFirst().orElseThrow();
        assertEquals("hug", e.kind());
        assertEquals(a.pid(), e.fromPid());
        assertEquals("u-a", e.fromId());
        assertEquals("가", e.fromNick());
        assertEquals("u-b", e.toId());
        assertEquals("나", e.toNick());
        assertEquals(clock.get(), e.at());

        TickResult rb1 = at(room, b1, 10, 0);
        assertEquals(2, rb1.events().size());
        assertEquals(1, rb1.received().hug());
        assertEquals(0, rb1.received().comfort());
        TickResult rb2 = at(room, b2, 14, 20);
        assertEquals(2, rb2.events().size());
        assertEquals(1, rb2.received().hug());
        // 구경꾼: b1 근처는 b1 것만, b2 는 멀어서 못 본다
        TickResult rn = at(room, near, 0, 0);
        assertEquals(1, rn.events().size());
        assertEquals(b1.pid(), rn.events().get(0).toPid());
        assertEquals(0, rn.received().hug());
        assertTrue(at(room, far, -14, 20).events().isEmpty());
        // 한 번 가져가면 비어 있다
        assertTrue(at(room, b1, 10, 0).events().isEmpty());
        assertTrue(at(room, a, 0, 10).events().isEmpty());
    }

    @Test
    void blockedUsersAreInvisibleBothWaysAndCannotBeCared() {
        BeachRoom room = room();
        Presence a = room.enter("u-a", "가", Set.of("u-b"));
        Presence b = room.enter("u-b", "나", Set.of("u-a"));
        Presence c = room.enter("u-c", "다", Set.of());
        at(room, a, 0, 10);
        at(room, b, 1, 10);
        at(room, c, 2, 10);
        assertEquals(List.of(c.pid()), pids(at(room, a, 0, 10)));
        assertEquals(List.of(c.pid()), pids(at(room, b, 1, 10)));
        assertEquals(Set.of(a.pid(), b.pid()), Set.copyOf(pids(at(room, c, 2, 10))));
        assertEquals(3, at(room, c, 2, 10).count());
        assertEquals("gone", care(room, a, b, "comfort").care());
        assertEquals("gone", care(room, b, a, "hug").care());
        assertEquals(0, a.receivedHug() + b.receivedComfort());
        // 한쪽만 목록을 가진 경우도 (차단은 서로 적용) 양쪽 다 막힌다
        Presence d = room.enter("u-d", "라", Set.of());
        Presence e = room.enter("u-e", "마", Set.of("u-d"));
        at(room, d, 3, 10);
        at(room, e, 4, 10);
        assertFalse(pids(at(room, d, 3, 10)).contains(e.pid()));
        assertFalse(pids(at(room, e, 4, 10)).contains(d.pid()));
        assertEquals("gone", care(room, d, e, "comfort").care());
        assertEquals("gone", care(room, e, d, "comfort").care());
        // 차단한 사이면 구경꾼으로도 효과를 못 본다
        assertEquals("sent", care(room, c, a, "comfort").care());
        assertTrue(at(room, b, 1, 10).events().isEmpty());
        assertEquals(1, at(room, a, 0, 10).events().size());
    }

    @Test
    void simulatedVisitorsAppearMoveAndNeverExpire() {
        BeachRoom room = new BeachRoom(clock::get, true);
        assertEquals(3, room.count());
        Presence a = room.enter("u-a", "가", Set.of());
        TickResult r1 = at(room, a, 0, 10);
        assertEquals(4, r1.count());
        assertEquals(3, r1.players().size());
        assertEquals(Set.of("bot-1", "bot-2", "bot-3"), r1.players().stream().map(PlayerView::id).collect(java.util.stream.Collectors.toSet()));
        assertEquals(Set.of("바람", "파도", "조개"), r1.players().stream().map(PlayerView::nick).collect(java.util.stream.Collectors.toSet()));
        PlayerView bot1 = r1.players().stream().filter(p -> p.id().equals("bot-1")).findFirst().orElseThrow();
        assertEquals(1, bot1.skin());
        for (PlayerView p : r1.players()) {
            assertTrue(p.x() >= BeachRoom.MIN_X && p.x() <= BeachRoom.MAX_X);
            assertTrue(p.z() >= BeachRoom.MIN_Z && p.z() <= BeachRoom.MAX_Z);
        }
        clock.addAndGet(5_000);
        TickResult r2 = at(room, a, 0, 10);
        PlayerView bot1Later = r2.players().stream().filter(p -> p.id().equals("bot-1")).findFirst().orElseThrow();
        assertEquals(bot1.pid(), bot1Later.pid());
        assertTrue(Math.abs(bot1.x() - bot1Later.x()) + Math.abs(bot1.z() - bot1Later.z()) > 0.5, "bots move over time");
        // 사람은 10초 뒤 사라져도 가짜 방문자는 남는다
        clock.addAndGet(20_000);
        assertEquals(3, room.count());
        assertNull(at(room, a, 0, 10));
        // 가짜 방문자에게도 위로를 보낼 수 있다
        Presence b = room.enter("u-b", "나", Set.of());
        TickResult rb = room.tick(b.ticket(), 0, 10, 0, false, "bot-2", "comfort");
        assertEquals("sent", rb.care());
        assertEquals(1, rb.events().size());
        assertEquals("bot-2", rb.events().get(0).toId());
        assertEquals("파도", rb.events().get(0).toNick());
        PlayerView bot2 = rb.players().stream().filter(p -> p.id().equals("bot-2")).findFirst().orElseThrow();
        assertEquals(0, bot2.skin());
        assertTrue(rb.players().stream().allMatch(p -> p.skin() == 0 || p.skin() == 1));
    }

    @Test
    void onlyNearestFortyAreReturnedSortedByDistance() {
        BeachRoom room = room();
        List<Presence> all = new ArrayList<>();
        for (int i = 0; i < 45; i++) all.add(room.enter("u-" + i, "n" + i, Set.of()));
        for (int i = 0; i < 45; i++) at(room, all.get(i), -13 + i * 0.5, 10); // 0번이 맨 왼쪽, 0.5 m 간격
        Presence me = all.get(0);
        TickResult r = at(room, me, -13, 10);
        assertEquals(45, r.count());
        assertEquals(BeachRoom.MAX_PLAYERS, r.players().size());
        double prev = -1;
        for (PlayerView p : r.players()) {
            double d = Math.hypot(p.x() - me.x(), p.z() - me.z());
            assertTrue(d >= prev, "sorted by distance");
            prev = d;
        }
        List<String> ids = r.players().stream().map(PlayerView::id).toList();
        assertEquals("u-1", ids.get(0));
        assertEquals("u-40", ids.get(39));
        assertFalse(ids.contains("u-41"));
        assertFalse(ids.contains("u-44"));
        assertFalse(ids.contains("u-0"));
    }

    @Test
    void capacityIsOneHundredAndLeavingOrExpiringFreesSpace() {
        BeachRoom room = room();
        Presence first = room.enter("u-first", "닉", Set.of());
        for (int i = 1; i < BeachRoom.CAPACITY; i++) room.enter("u-" + i, "닉", Set.of());
        assertEquals(100, room.count());
        assertEquals(409, assertThrows(ApiException.class, () -> room.enter("overflow", "닉", Set.of())).status());
        room.leave(first.ticket());
        assertNotNull(room.enter("replacement", "닉", Set.of()));
        assertEquals(100, room.count());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertNotNull(room.enter("new-visit", "닉", Set.of()));
        assertEquals(1, room.count());
    }

    @Test
    void simultaneousEntriesCannotExceedCapacity() throws Exception {
        BeachRoom room = room();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> entries = new ArrayList<>();
        try (var executor = Executors.newFixedThreadPool(16)) {
            for (int i = 0; i < 160; i++) {
                String id = "u-" + i;
                entries.add(executor.submit(() -> {
                    start.await();
                    try {
                        room.enter(id, "닉", Set.of());
                        return true;
                    } catch (ApiException e) {
                        assertEquals(409, e.status());
                        return false;
                    }
                }));
            }
            start.countDown();
            int admitted = 0;
            for (Future<Boolean> result : entries) if (result.get()) admitted++;
            assertEquals(100, admitted);
            assertEquals(100, room.count());
        }
    }

    @Test
    void capacityAlsoIncludesAnySimulatedVisitors() {
        BeachRoom room = new BeachRoom(clock::get, true);
        for (int i = 0; i < 97; i++) room.enter("u-" + i, "닉", Set.of());
        assertEquals(100, room.count());
        assertEquals(409, assertThrows(ApiException.class, () -> room.enter("overflow", "닉", Set.of())).status());
    }
}
