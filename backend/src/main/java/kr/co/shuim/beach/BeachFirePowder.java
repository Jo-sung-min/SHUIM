package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;

/** Short-lived, free visual effects. This store never creates, consumes or changes a paid color grant. */
final class BeachFirePowder {
    static final long DURATION_MS = 90_000, COOLDOWN_MS = 10_000, RETRY_MS = 10 * 60_000;
    static final int MAX_REQUESTS = 10_000;
    static final Set<String> COLORS = Set.of("rose", "aurora", "ocean", "violet", "rainbow");
    private record RequestKey(String userId, UUID requestId) {}
    private record Accepted(String communityId, String color, long forgetAt) {}

    private final LongSupplier clock;
    private final Map<String, BeachFireService.PowderView> rooms = new HashMap<>();
    private final Map<RequestKey, Accepted> requests = new HashMap<>();
    private long lastSweep = Long.MIN_VALUE / 4;

    BeachFirePowder(LongSupplier clock) { this.clock = clock; }

    synchronized BeachFireService.FireView snapshot(String communityId, BeachFireService.FireView base) {
        long now = clock.getAsLong();
        sweep(now, false);
        return overlay(communityId, base, now);
    }

    /** The caller has checked a current visit, membership, range, and read the durable fire outside this lock. */
    synchronized BeachFireService.FireView add(String communityId, String userId, UUID id, String color,
                                               BeachFireService.FireView base) {
        long now = clock.getAsLong();
        sweep(now, false);
        RequestKey key = new RequestKey(userId, id);
        Accepted accepted = requests.get(key);
        if (accepted != null && accepted.forgetAt() <= now) { requests.remove(key); accepted = null; }
        if (accepted != null) {
            if (!accepted.communityId().equals(communityId) || !accepted.color().equals(color)) {
                throw new ApiException(409, "이미 다른 색가루 요청에 사용한 번호예요. 다시 골라 주세요.");
            }
            return overlay(communityId, base, now);
        }
        // The database read is outside this short in-memory lock; recheck its known fuel end against the current clock.
        long fuelEnd = base.nextLogBurnAt() == null ? Long.MIN_VALUE
            : base.nextLogBurnAt() + (base.logs() - 1L) * BeachFireService.LOG_BURN_MS;
        if (base.logs() <= 0 || fuelEnd <= now) throw new ApiException(409, "불씨만 남았어요. 장작을 먼저 넣어 주세요.");
        var previous = rooms.get(communityId);
        if (previous != null && now - previous.startedAt() < COOLDOWN_MS) {
            throw new ApiException(429, "색가루는 10초에 한 번씩 넣을 수 있어요.");
        }
        if (requests.size() >= MAX_REQUESTS) sweep(now, true);
        if (requests.size() >= MAX_REQUESTS) throw new ApiException(503, "색가루를 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.");
        var powder = new BeachFireService.PowderView(UUID.randomUUID().toString(), color, now, now + DURATION_MS);
        rooms.put(communityId, powder);
        requests.put(key, new Accepted(communityId, color, now + RETRY_MS));
        return base.withPowder(powder, now);
    }

    private BeachFireService.FireView overlay(String communityId, BeachFireService.FireView base, long now) {
        var powder = rooms.get(communityId);
        if (powder != null && powder.expiresAt() <= now) { rooms.remove(communityId); powder = null; }
        return base.withPowder(powder, now);
    }

    private void sweep(long now, boolean force) {
        if (!force && now >= lastSweep && now - lastSweep < COOLDOWN_MS) return;
        lastSweep = now;
        requests.values().removeIf(value -> value.forgetAt() <= now);
        rooms.values().removeIf(value -> value.expiresAt() <= now);
    }

    static UUID requestKey(String value, String color) {
        if (!COLORS.contains(color == null ? "" : color)) throw ApiException.badRequest("색가루 색을 골라 주세요.");
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw ApiException.badRequest("색가루 요청을 다시 시도해 주세요.");
        }
        return UUID.fromString(value);
    }
}
