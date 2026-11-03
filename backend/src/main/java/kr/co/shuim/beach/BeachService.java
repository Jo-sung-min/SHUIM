package kr.co.shuim.beach;

import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * 소로우마다 하나씩 갖는 프라이빗 해변. 방문·위로·인원수는 해변 사이에 공유하지 않는다.
 * 티켓이 발급된 방을 서버가 기억하므로 tick·leave 요청으로 다른 방을 지정할 수 없다.
 * 방문은 메모리에만 유지하며, 프라이빗 해변에는 샘플 방문자를 만들지 않는다.
 */
@Service
public class BeachService {
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, BeachRoom> rooms = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, BeachRoom> tickets = new ConcurrentHashMap<>();
    private final AtomicLong lastSweep = new AtomicLong();

    public BeachService() { this(System::currentTimeMillis); }

    BeachService(LongSupplier clock) { this.clock = clock; }

    public BeachRoom.Presence enter(String communityId, String userId, String nick, Set<String> excluded) {
        sweepTickets();
        BeachRoom room = rooms.computeIfAbsent(communityId, id -> new BeachRoom(clock, false));
        BeachRoom.Presence presence = room.enter(userId, nick, excluded);
        tickets.put(presence.ticket(), room);
        return presence;
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind) {
        BeachRoom room = ticket == null ? null : tickets.get(ticket);
        if (room == null) return null;
        BeachRoom.TickResult result = room.tick(ticket, x, z, yaw, moving, careTo, careKind);
        if (result == null) tickets.remove(ticket, room);
        return result;
    }

    public void leave(String ticket) {
        if (ticket == null) return;
        BeachRoom room = tickets.remove(ticket);
        if (room != null) room.leave(ticket);
    }

    public int count(String communityId) {
        BeachRoom room = rooms.get(communityId);
        return room == null ? 0 : room.count();
    }

    /** 새 방문이 쌓일 때 만료된 티켓의 방 참조도 함께 정리한다. */
    private void sweepTickets() {
        long now = clock.getAsLong(), last = lastSweep.get();
        if (now - last >= BeachRoom.SWEEP_EVERY_MS && lastSweep.compareAndSet(last, now)) {
            tickets.entrySet().removeIf(entry -> entry.getValue().presence(entry.getKey()) == null);
        }
    }
}
