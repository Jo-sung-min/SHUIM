package kr.co.shuim.beach;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import kr.co.shuim.config.ApiException;

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
    private static final long TICK_FIRE_CACHE_MS = 1_000;
    private final LongSupplier clock;
    private final BeachFireService fire;
    private final ConcurrentHashMap<String, RoomBinding> rooms = new ConcurrentHashMap<>();
    /** One cache per existing room, shared by all its tickets. Database reads never hold the presence lock. */
    private static final class RoomBinding {
        private final String communityId;
        private final BeachRoom room;
        private BeachFireService.FireView cachedFire;
        private long fireReadAt;

        RoomBinding(String communityId, BeachRoom room) { this.communityId = communityId; this.room = room; }
        String communityId() { return communityId; }
        BeachRoom room() { return room; }

        synchronized BeachFireService.FireView tickFire(BeachFireService fire, LongSupplier clock) {
            long now = clock.getAsLong();
            if (cachedFire != null && now >= fireReadAt && now - fireReadAt < TICK_FIRE_CACHE_MS
                && (cachedFire.nextLogBurnAt() == null || now < cachedFire.nextLogBurnAt())
                && (cachedFire.colorExpiresAt() == null || now < cachedFire.colorExpiresAt())) return cachedFire;
            // Set the cache only after a successful read. Its age starts before I/O, not after it.
            BeachFireService.FireView fresh = fire.snapshot(communityId);
            cachedFire = fresh;
            fireReadAt = now;
            return fresh;
        }

        synchronized void invalidateFire() { cachedFire = null; }
    }
    public record Visit(String communityId, BeachRoom.Presence presence) {}
    private final ConcurrentHashMap<String, RoomBinding> tickets = new ConcurrentHashMap<>();
    private final AtomicLong lastSweep = new AtomicLong();

    @Autowired
    public BeachService(BeachFireService fire) { this(System::currentTimeMillis, fire); }

    BeachService(LongSupplier clock, BeachFireService fire) { this.clock = clock; this.fire = fire; }

    public BeachRoom.Presence enter(String communityId, String userId, String nick, Set<String> excluded) {
        sweepTickets();
        RoomBinding binding = rooms.computeIfAbsent(communityId, id -> new RoomBinding(id, new BeachRoom(clock, false)));
        BeachRoom.Presence presence = binding.room().enter(userId, nick, excluded);
        tickets.put(presence.ticket(), binding);
        return presence;
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) return null;
        BeachRoom.TickResult result = binding.room().tick(ticket, x, z, yaw, moving, careTo, careKind);
        if (result == null) { tickets.remove(ticket, binding); return null; }
        return result.withFire(binding.tickFire(fire, clock));
    }

    public void leave(String ticket) {
        if (ticket == null) return;
        RoomBinding binding = tickets.remove(ticket);
        if (binding != null) binding.room().leave(ticket);
    }

    public int count(String communityId) {
        RoomBinding binding = rooms.get(communityId);
        return binding == null ? 0 : binding.room().count();
    }

    public BeachFireService.FireView fire(String communityId) { return fire.snapshot(communityId); }

    /** The authenticated user must own an active ticket; a ticket cannot choose another community. */
    public Visit requireVisit(String ticket, String userId) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        BeachRoom.Presence presence = binding == null ? null : binding.room().presence(ticket);
        if (presence == null) throw ApiException.gone(BeachController.GONE);
        if (!presence.userId().equals(userId)) throw ApiException.forbidden("내 방문에서만 모닥불을 이용할 수 있어요.");
        return new Visit(binding.communityId(), presence);
    }

    public BeachFireService.FireView addWood(String ticket, String userId, String requestId) {
        Visit visit = requireVisit(ticket, userId);
        double dx = visit.presence().x() - BeachFireService.FIRE_X;
        double dz = visit.presence().z() - BeachFireService.FIRE_Z;
        if (dx * dx + dz * dz > BeachFireService.WOOD_RADIUS * BeachFireService.WOOD_RADIUS) {
            throw ApiException.badRequest("모닥불 가까이에서 장작을 넣어 주세요.");
        }
        BeachFireService.FireView updated = fire.addWood(visit.communityId(), userId, requestId);
        RoomBinding binding = rooms.get(visit.communityId());
        if (binding != null) binding.invalidateFire();
        return updated;
    }

    /** 새 방문이 쌓일 때 만료된 티켓의 방 참조도 함께 정리한다. */
    private void sweepTickets() {
        long now = clock.getAsLong(), last = lastSweep.get();
        if (now - last >= BeachRoom.SWEEP_EVERY_MS && lastSweep.compareAndSet(last, now)) {
            tickets.entrySet().removeIf(entry -> entry.getValue().room().presence(entry.getKey()) == null);
        }
    }
}
