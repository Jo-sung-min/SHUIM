package kr.co.shuim.beach;

import kr.co.shuim.beach.BeachRoom.Companion;
import kr.co.shuim.beach.BeachRoom.Presence;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/** 감정구슬의 "함께 있던 친구": 지금 같은 방에서 서로 보이는 사람들만 */
class BeachCompanionsTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);

    @Test
    void listsOnlyLiveMutuallyVisiblePeopleOncePerAccount() {
        BeachRoom room = new BeachRoom(clock::get, false);
        Presence me = room.enter("u-me", "나", Set.of("u-blocked"));
        room.enter("u-friend", "가람", Set.of());
        room.enter("u-blocked", "막은 사람", Set.of("u-me"));
        room.enter("u-me", "나", Set.of("u-blocked")); // 내 다른 기기
        assertEquals(List.of(new Companion("u-friend", "가람")), room.companions(me.ticket()));

        Presence late = room.enter("u-late", "늦게 온 사람", Set.of());
        assertEquals(Set.of("u-friend", "u-late"), Set.copyOf(room.companions(me.ticket()).stream().map(Companion::userId).toList()));

        // 소식이 끊긴 사람은 더 이상 함께 있는 사람이 아니다
        clock.addAndGet(BeachRoom.IDLE_MS - 1_000);
        room.tick(me.ticket(), 0, 3, 0, false, null, null);
        room.tick(late.ticket(), 1, 3, 0, false, null, null);
        clock.addAndGet(2_000);
        assertEquals(List.of(new Companion("u-late", "늦게 온 사람")), room.companions(me.ticket()));
    }

    @Test
    void unknownOrExpiredTicketsHaveNoCompanions() {
        BeachRoom room = new BeachRoom(clock::get, false);
        Presence me = room.enter("u-me", "나", Set.of());
        room.enter("u-friend", "가람", Set.of());
        assertTrue(room.companions("nope").isEmpty());
        assertTrue(room.companions(null).isEmpty());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertTrue(room.companions(me.ticket()).isEmpty());
    }

    @Test
    void theServiceFindsTheRoomByTicket() {
        BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository()));
        Presence me = beach.enter("public", "u-me", "나", Set.of());
        beach.enter("public", "u-friend", "가람", Set.of());
        beach.enter("other-space", "u-elsewhere", "다른 방", Set.of());
        assertEquals(List.of(new Companion("u-friend", "가람")), beach.companions(me.ticket()));
        assertTrue(beach.companions("unknown").isEmpty());
    }
}
