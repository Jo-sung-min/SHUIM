package kr.co.shuim.beach;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import kr.co.shuim.config.ApiException;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * 소로우와 지도마다 하나씩 갖는 프라이빗 공간. 방문·위로·인원수는 공간 사이에 공유하지 않는다.
 * 티켓이 발급된 방을 서버가 기억하므로 tick·leave 요청으로 다른 방을 지정할 수 없다.
 * 방문은 메모리에만 유지하며, 프라이빗 해변에는 샘플 방문자를 만들지 않는다.
 */
@Service
public class BeachService {
    private static final long TICK_FIRE_CACHE_MS = 1_000;
    private final LongSupplier clock;
    private final BeachFireService fire;
    private record RoomKey(String communityId, BeachMap map) {}
    private final ConcurrentHashMap<RoomKey, RoomBinding> rooms = new ConcurrentHashMap<>();
    /** One cache per existing room, shared by all its tickets. Database reads never hold the presence lock. */
    private static final class RoomBinding {
        private final RoomKey key;
        private final BeachRoom room;
        private BeachFireService.FireView cachedFire;
        private long fireReadAt;

        RoomBinding(RoomKey key, BeachRoom room) { this.key = key; this.room = room; }
        String communityId() { return key.communityId(); }
        BeachMap map() { return key.map(); }
        BeachRoom room() { return room; }

        synchronized BeachFireService.FireView tickFire(BeachFireService fire, LongSupplier clock) {
            long now = clock.getAsLong();
            if (!map().hasBeachFacilities()) return emptyFire(now);
            if (cachedFire != null && now >= fireReadAt && now - fireReadAt < TICK_FIRE_CACHE_MS
                && (cachedFire.nextLogBurnAt() == null || now < cachedFire.nextLogBurnAt())
                && (cachedFire.colorExpiresAt() == null || now < cachedFire.colorExpiresAt())
                && (cachedFire.powder() == null || now < cachedFire.powder().expiresAt())) return cachedFire;
            // Set the cache only after a successful read. Its age starts before I/O, not after it.
            BeachFireService.FireView fresh = fire.snapshot(communityId());
            cachedFire = fresh;
            fireReadAt = now;
            return fresh;
        }

        synchronized void invalidateFire() { cachedFire = null; }
    }
    public record Visit(String communityId, String mapId, BeachRoom.Presence presence) {
        public Visit(String communityId, BeachRoom.Presence presence) { this(communityId, BeachMap.BEACH.id(), presence); }
    }
    private final ConcurrentHashMap<String, RoomBinding> tickets = new ConcurrentHashMap<>();
    /** Fixed stripes avoid allocating an unbounded lock per untrusted resume token. */
    private final Object[] resumeLocks = java.util.stream.IntStream.range(0, 64).mapToObj(i -> new Object()).toArray();
    private final AtomicLong lastSweep = new AtomicLong();

    @Autowired
    public BeachService(BeachFireService fire) { this(System::currentTimeMillis, fire); }

    BeachService(LongSupplier clock, BeachFireService fire) { this.clock = clock; this.fire = fire; }

    public BeachRoom.Presence enter(String communityId, String userId, String nick, Set<String> excluded) {
        return enter(communityId, userId, nick, excluded, null);
    }

    public BeachRoom.Presence enter(String communityId, String userId, String nick, Set<String> excluded, String character) {
        return enter(communityId, userId, nick, excluded, character, null);
    }

    public BeachRoom.Presence enter(String communityId, String userId, String nick, Set<String> excluded, String character, String mapId) {
        return enter(communityId, userId, nick, excluded, character, mapId, null, null).presence();
    }

    public BeachRoom.Entry enter(String communityId, String userId, String nick, Set<String> excluded, String character,
                                 String mapId, String resumeTicket, Long sequence) {
        return enter(communityId, userId, nick, excluded, character, mapId, resumeTicket, sequence, BeachRoom.CAPACITY);
    }

    public BeachRoom.Entry enter(String communityId, String userId, String nick, Set<String> excluded, String character,
                                 String mapId, String resumeTicket, Long sequence, int capacity) {
        if (capacity < 1 || capacity > BeachRoom.CAPACITY) throw ApiException.badRequest("입장 정원을 확인해 주세요.");
        BeachMap map = BeachMap.from(mapId);
        BeachRoom.selectedSkin(character);
        BeachRoom.validateSequence(sequence);
        if (resumeTicket != null && !resumeTicket.matches("[0-9a-f]{32}"))
            throw ApiException.badRequest("이전 방문 정보를 다시 확인해 주세요.");
        if (resumeTicket != null) {
            synchronized (resumeLocks[Math.floorMod(resumeTicket.hashCode(), resumeLocks.length)]) {
                return enterScoped(communityId, userId, nick, excluded, character, map, resumeTicket, sequence, capacity);
            }
        }
        return enterScoped(communityId, userId, nick, excluded, character, map, null, sequence, capacity);
    }

    private BeachRoom.Entry enterScoped(String communityId, String userId, String nick, Set<String> excluded, String character,
                                        BeachMap map, String resumeTicket, Long sequence, int capacity) {
        sweepTickets();
        RoomKey key = new RoomKey(communityId, map);
        RoomBinding original = resumeTicket == null ? null : tickets.get(resumeTicket);
        if (original != null && !original.key.equals(key)) throw ApiException.forbidden("같은 소로우와 지도로 돌아가 주세요.");
        RoomBinding binding = rooms.computeIfAbsent(key, id -> new RoomBinding(id, new BeachRoom(clock, false, id.map())));
        binding.room().setCapacity(capacity);
        BeachRoom.Entry entry = binding.room().enter(userId, nick, excluded, character, resumeTicket, sequence);
        tickets.put(entry.presence().ticket(), binding);
        if (resumeTicket != null && binding.room().retainsTicket(resumeTicket)) tickets.put(resumeTicket, binding);
        return entry;
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, null);
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind, String character) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, character, false);
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind, String character, boolean hugAllowed) {
        return tick(ticket, x, z, yaw, moving, careTo, careKind, character, hugAllowed, null);
    }

    public BeachRoom.TickResult tick(String ticket, double x, double z, double yaw, boolean moving, String careTo, String careKind,
                                     String character, boolean hugAllowed, Long sequence) {
        BeachRoom.validateSequence(sequence);
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) return null;
        BeachRoom.TickResult result = binding.room().tick(ticket, x, z, yaw, moving, careTo, careKind, character, hugAllowed, sequence);
        if (result == null) return null;
        return result.withFire(binding.tickFire(fire, clock));
    }

    public void suspend(String ticket, double x, double z, double yaw, Long sequence) {
        BeachRoom.validateSequence(sequence);
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding != null) binding.room().suspend(ticket, x, z, yaw, sequence);
    }

    public void leave(String ticket) {
        if (ticket == null) return;
        RoomBinding binding = tickets.remove(ticket);
        if (binding != null) binding.room().leave(ticket);
    }

    public BeachRoom.RestPresence rest(String ticket, String action, String spotId) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().rest(ticket, action, spotId);
    }

    public int count(String communityId) {
        return count(communityId, null);
    }

    public int count(String communityId, String mapId) {
        RoomBinding binding = rooms.get(new RoomKey(communityId, BeachMap.from(mapId)));
        return binding == null ? 0 : binding.room().count();
    }

    public BeachFireService.FireView fire(String communityId) { return fire(communityId, null); }

    public BeachFireService.FireView fire(String communityId, String mapId) {
        return BeachMap.from(mapId).hasBeachFacilities() ? fire.snapshot(communityId) : emptyFire(clock.getAsLong());
    }

    private static BeachFireService.FireView emptyFire(long now) {
        return new BeachFireService.FireView(0, BeachFireService.MAX_LOGS, 0, "amber", null, now, null, null, 0, false, null);
    }

    public BeachRoom.Lighting lighting(String communityId) {
        return lighting(communityId, null);
    }

    public BeachRoom.FestivalChange changeFestival(String ticket, String userId, java.util.UUID requestId, String choice) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().changeFestival(ticket, userId, requestId, choice);
    }

    public BeachRoom.Lighting lighting(String communityId, String mapId) {
        RoomBinding binding = rooms.get(new RoomKey(communityId, BeachMap.from(mapId)));
        return binding == null ? BeachRoom.AUTO_LIGHTING : binding.room().lighting();
    }

    BeachRoom.MusicState music(String communityId, String mapId) {
        RoomBinding binding = rooms.get(new RoomKey(communityId, BeachMap.from(mapId)));
        return binding == null ? new BeachRoom.MusicState(BeachRoom.SILENT, clock.getAsLong()) : binding.room().musicSnapshot();
    }

    BeachRoom.MusicState changeMusic(String ticket, String userId, String action, String trackId, Long expectedVersion) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().changeMusic(ticket, userId, action, trackId, expectedVersion);
    }

    void requireMusicListener(String communityId, String mapId, String userId) {
        RoomBinding binding = rooms.get(new RoomKey(communityId, BeachMap.from(mapId)));
        if (binding == null || !binding.room().hasMusicListener(userId))
            throw ApiException.forbidden("이 공간에 들어온 뒤 음악을 들어 주세요.");
    }

    public BeachRoom.FireworksState fireworks(String communityId) {
        return fireworks(communityId, null);
    }

    public BeachRoom.FireworksState fireworks(String communityId, String mapId) {
        RoomBinding binding = rooms.get(new RoomKey(communityId, BeachMap.from(mapId)));
        return binding == null ? new BeachRoom.FireworksState(java.util.List.of(), 0, clock.getAsLong()) : binding.room().fireworks();
    }

    /** Only the owned visit selects a room; the authenticated controller authorizes launches. */
    public BeachUyuniMoments.State uyuniMoments(String ticket) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().uyuniMoments(ticket);
    }

    public BeachUyuniMoments.Launch launchUyuniMoment(String ticket, String userId, String requestId,
            String kind, String letter, String color, String wish, Set<String> excluded) {
        requireVisit(ticket, userId);
        RoomBinding binding = tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().launchUyuniMoment(ticket, userId, requestId, kind, letter, color, wish, excluded);
    }

    /** Only the owned visit selects a room; the authenticated controller authorizes launches. */
    public BeachRoom.FireworkLaunch launchFireworks(String ticket, String userId, String requestId) {
        return launchFireworks(ticket, userId, requestId, null);
    }

    public BeachRoom.FireworkLaunch launchFireworks(String ticket, String userId, String requestId, String variant) {
        requireVisit(ticket, userId);
        RoomBinding binding = tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().launchFireworks(ticket, userId, requestId, variant);
    }

    /** The ticket chooses the room; a client cannot supply a different community ID. */
    public BeachRoom.Lighting setLighting(String ticket, String userId, String mode) {
        requireVisit(ticket, userId);
        RoomBinding binding = tickets.get(ticket);
        if (binding == null) throw ApiException.gone(BeachController.GONE);
        return binding.room().setLighting(mode);
    }

    /** Read only the existing in-memory binding; this does not validate or refresh a visit. */
    String communityIdForTicket(String ticket) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        return binding == null ? null : binding.communityId();
    }

    /** The authenticated user must own an active ticket; a ticket cannot choose another community. */
    public Visit requireVisit(String ticket, String userId) {
        RoomBinding binding = ticket == null ? null : tickets.get(ticket);
        BeachRoom.Presence presence = binding == null ? null : binding.room().presence(ticket);
        if (presence == null) throw ApiException.gone(BeachController.GONE);
        if (!presence.userId().equals(userId)) throw ApiException.forbidden("내 방문에서만 이용할 수 있어요.");
        return new Visit(binding.communityId(), binding.map().id(), presence);
    }

    public BeachFireService.FireView addWood(String ticket, String userId, String requestId) {
        Visit visit = requireVisit(ticket, userId);
        requireFireMap(visit);
        double dx = visit.presence().x() - BeachFireService.FIRE_X;
        double dz = visit.presence().z() - BeachFireService.FIRE_Z;
        if (dx * dx + dz * dz > BeachFireService.WOOD_RADIUS * BeachFireService.WOOD_RADIUS) {
            throw ApiException.badRequest("모닥불 가까이에서 장작을 넣어 주세요.");
        }
        BeachFireService.FireView updated = fire.addWood(visit.communityId(), userId, requestId);
        RoomBinding binding = rooms.get(new RoomKey(visit.communityId(), BeachMap.from(visit.mapId())));
        if (binding != null) binding.invalidateFire();
        return updated;
    }

    public BeachFireService.FireView addPowder(String ticket, String userId, String requestId, String color) {
        Visit visit = requireVisit(ticket, userId);
        requireFireMap(visit);
        double dx = visit.presence().x() - BeachFireService.FIRE_X;
        double dz = visit.presence().z() - BeachFireService.FIRE_Z;
        if (dx * dx + dz * dz > BeachFireService.WOOD_RADIUS * BeachFireService.WOOD_RADIUS) {
            throw ApiException.badRequest("모닥불 가까이에서 색가루를 넣어 주세요.");
        }
        BeachFireService.FireView updated = fire.addPowder(visit.communityId(), userId, requestId, color);
        RoomBinding binding = rooms.get(new RoomKey(visit.communityId(), BeachMap.from(visit.mapId())));
        if (binding != null) binding.invalidateFire();
        return updated;
    }

    private static void requireFireMap(Visit visit) {
        if (!BeachMap.from(visit.mapId()).hasBeachFacilities()) throw ApiException.badRequest("이 지도에는 모닥불이 없어요.");
    }

    /** 새 방문이 쌓일 때 만료된 티켓의 방 참조도 함께 정리한다. */
    private void sweepTickets() {
        long now = clock.getAsLong(), last = lastSweep.get();
        if ((now < last || now - last >= BeachRoom.SWEEP_EVERY_MS) && lastSweep.compareAndSet(last, now)) {
            rooms.values().forEach(binding -> binding.room().sweep());
            tickets.entrySet().removeIf(entry -> !entry.getValue().room().retainsTicket(entry.getKey()));
        }
    }
}
