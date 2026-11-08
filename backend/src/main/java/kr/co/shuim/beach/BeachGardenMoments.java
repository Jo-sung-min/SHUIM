package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Bounded, ephemeral pond moments. The owning room supplies a confirmed seated actor. */
final class BeachGardenMoments {
    static final int COIN_DURATION_MS = 6_000, DUCK_DURATION_MS = 90_000;
    static final int COIN_COOLDOWN_MS = 3_000, DUCK_COOLDOWN_MS = 15_000;
    static final int MAX_COINS = 12, MAX_DUCKS = 24, MAX_REQUESTS = 1_024;
    static final long REQUEST_TTL_MS = 180_000;
    static final Cooldowns NO_COOLDOWNS = new Cooldowns(0, 0);

    public record Event(String id, String pid, String kind, double x, double z, double yaw, long startedAt, int durationMs) {}
    public record Cooldowns(long coin, long duck) {}
    public record State(List<Event> events, Cooldowns cooldowns, long serverTime) {}
    public record Launch(Event event, List<Event> events, Cooldowns cooldowns, long serverTime) {}
    private record RequestKey(String userId, UUID requestId) {}
    private record Saved(String userId, Set<String> excluded, Event event) {}
    private final LinkedHashMap<String, Saved> active = new LinkedHashMap<>();
    private final LinkedHashMap<RequestKey, Saved> requests = new LinkedHashMap<>();
    private final Map<String, Cooldowns> cooldowns = new LinkedHashMap<>();

    void refreshExclusions(String userId, Set<String> excluded) {
        Set<String> frozen = Set.copyOf(excluded);
        active.replaceAll((id, saved) -> saved.userId().equals(userId) ? new Saved(userId, frozen, saved.event()) : saved);
    }

    State snapshot(String userId, Set<String> excluded, Set<String> blockedSenders, long now) {
        prune(now);
        List<Event> events = active.values().stream()
            .filter(saved -> saved.event().startedAt() <= now && !excluded.contains(saved.userId())
                && !saved.excluded().contains(userId) && !blockedSenders.contains(saved.userId()))
            .map(Saved::event).toList();
        return new State(events, cooldowns.getOrDefault(userId, NO_COOLDOWNS), now);
    }

    Launch launch(BeachRoom.Presence actor, String requestId, String kind, Set<String> blockedSenders, long now) {
        RequestKey key = new RequestKey(actor.userId(), requestUuid(requestId));
        if (!"coin".equals(kind) && !"duck".equals(kind)) throw ApiException.badRequest("소원 동전이나 오리 중에서 골라 주세요.");
        prune(now);
        Saved retry = requests.get(key);
        if (retry != null) {
            if (!retry.event().kind().equals(kind)) throw new ApiException(409, "같은 요청의 내용을 바꿀 수 없어요. 다시 골라 주세요.");
            return result(retry.event(), actor, blockedSenders, now);
        }
        Cooldowns previous = cooldowns.getOrDefault(actor.userId(), NO_COOLDOWNS);
        boolean coin = "coin".equals(kind);
        if (now < (coin ? previous.coin() : previous.duck())) throw new ApiException(429, "물결이 잦아들면 다시 함께 띄워 주세요.");
        if (active.values().stream().filter(saved -> saved.event().kind().equals(kind)).count() >= (coin ? MAX_COINS : MAX_DUCKS)
            || requests.size() >= MAX_REQUESTS || (!cooldowns.containsKey(actor.userId()) && cooldowns.size() >= MAX_REQUESTS))
            throw new ApiException(429, "지금은 연못이 가득해요. 잠시 뒤 다시 띄워 주세요.");
        Event event = new Event(UUID.randomUUID().toString(), actor.pid(), kind, actor.x(), actor.z(),
            Math.atan2(Math.sin(actor.yaw()), Math.cos(actor.yaw())), now, coin ? COIN_DURATION_MS : DUCK_DURATION_MS);
        Saved saved = new Saved(actor.userId(), Set.copyOf(actor.excluded()), event);
        active.put(event.id(), saved); requests.put(key, saved);
        cooldowns.put(actor.userId(), new Cooldowns(coin ? now + COIN_COOLDOWN_MS : previous.coin(),
            coin ? previous.duck() : now + DUCK_COOLDOWN_MS));
        return result(event, actor, blockedSenders, now);
    }

    private Launch result(Event event, BeachRoom.Presence actor, Set<String> blockedSenders, long now) {
        State state = snapshot(actor.userId(), actor.excluded(), blockedSenders, now);
        return new Launch(event, state.events(), state.cooldowns(), now);
    }

    private void prune(long now) {
        active.values().removeIf(saved -> now - saved.event().startedAt() >= saved.event().durationMs());
        requests.values().removeIf(saved -> now - saved.event().startedAt() >= REQUEST_TTL_MS);
        cooldowns.values().removeIf(value -> now >= Math.max(value.coin(), value.duck()));
    }

    private static UUID requestUuid(String value) {
        try {
            if (value == null || value.length() != 36) throw new IllegalArgumentException();
            UUID uuid = UUID.fromString(value);
            if (!uuid.toString().equalsIgnoreCase(value)) throw new IllegalArgumentException();
            return uuid;
        } catch (IllegalArgumentException e) { throw ApiException.badRequest("연못에 띄울 요청을 다시 확인해 주세요."); }
    }
}
