package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;

@Service
public class BeachFireService {
    public static final int MAX_LOGS = 12, INITIAL_LOGS = 3;
    public static final long LOG_BURN_MS = 10 * 60_000L, WOOD_COOLDOWN_MS = 3_000L, COLOR_DURATION_MS = 24 * 60 * 60_000L;
    public static final double FIRE_X = 0, FIRE_Z = 12, WOOD_RADIUS = 5;
    public static final Set<String> PAID_COLORS = Set.of("rose", "aurora", "ocean", "violet");

    public record FireView(int logs, int maxLogs, double intensity, String color, Long colorExpiresAt,
                           long serverTime, Long nextLogBurnAt, Long queueEndsAt, int queuedPops) {}
    public record Activation(String color, long startsAt, long expiresAt, FireView fire) {}

    private final BeachFireRepository repository;
    private final LongSupplier clock;

    @Autowired
    public BeachFireService(BeachFireRepository repository) { this(repository, System::currentTimeMillis); }
    BeachFireService(BeachFireRepository repository, LongSupplier clock) { this.repository = repository; this.clock = clock; }

    public FireView snapshot(String communityId) {
        long now = clock.getAsLong();
        return view(repository.read(communityId, initialFuel(now)), repository.grants(communityId), now);
    }

    public FireView addWood(String communityId, String userId, String requestId) {
        UUID key = requestKey(requestId);
        return repository.locked(communityId, initialFuel(clock.getAsLong()), locked -> {
            long now = clock.getAsLong();
            if (locked.hasWoodRequest(userId, key)) return view(locked.row(), locked.grants(), now);
            Long last = locked.lastWoodAt(userId);
            if (last != null && now - last < WOOD_COOLDOWN_MS) throw new ApiException(429, "장작은 3초에 한 번씩 넣을 수 있어요.");
            if (logCount(locked.row().fuelUntil(), now) >= MAX_LOGS) throw new ApiException(409, "장작이 충분해요. 조금 타고 나면 더 넣어 주세요.");
            locked.fuelUntil(Math.max(now, locked.row().fuelUntil()) + LOG_BURN_MS);
            locked.recordWood(userId, key, now);
            return view(locked.row(), locked.grants(), now);
        });
    }

    /** Only verified payment fulfillment calls this method; no client route activates colors. */
    public Activation activateColor(String communityId, String userId, String color, String providerOrderId) {
        if (!PAID_COLORS.contains(color == null ? "" : color)) throw ApiException.badRequest("불씨팝 색을 골라 주세요.");
        validateOrder(providerOrderId);
        return repository.locked(communityId, initialFuel(clock.getAsLong()), locked -> {
            long now = clock.getAsLong();
            var old = locked.grant(providerOrderId);
            if (old.isPresent()) {
                var grant = old.get();
                if (!grant.communityId().equals(communityId) || !Objects.equals(grant.userId(), userId) || !grant.color().equals(color)) {
                    throw new ApiException(409, "이미 다른 불씨팝에 사용한 결제예요.");
                }
                // Refunded orders must never be reactivated by a delayed webhook.
                return new Activation(grant.color(), grant.startsAt(), grant.expiresAt(), view(locked.row(), locked.grants(), now));
            }
            long startsAt = locked.grants().stream().mapToLong(BeachFireRepository.Grant::expiresAt).max().orElse(now);
            startsAt = Math.max(now, startsAt);
            var grant = new BeachFireRepository.Grant(providerOrderId, communityId, userId, color, startsAt,
                Math.addExact(startsAt, COLOR_DURATION_MS), null);
            locked.insertGrant(grant);
            return new Activation(color, grant.startsAt(), grant.expiresAt(), view(locked.row(), locked.grants(), now));
        });
    }

    /** A refund preserves every later purchase's promised start/end times. */
    public void revokeColor(String providerOrderId) {
        validateOrder(providerOrderId);
        var grant = repository.grant(providerOrderId);
        if (grant.isEmpty()) return;
        long now = clock.getAsLong();
        repository.locked(grant.get().communityId(), initialFuel(now), locked -> {
            locked.revokeGrant(providerOrderId, now);
            return null;
        });
    }

    private static long initialFuel(long now) { return now + INITIAL_LOGS * LOG_BURN_MS; }
    private static int logCount(long until, long now) {
        return (int) Math.min(MAX_LOGS, Math.max(0, Math.ceil((until - now) / (double) LOG_BURN_MS)));
    }

    static FireView view(BeachFireRepository.Row row, List<BeachFireRepository.Grant> grants, long now) {
        int logs = logCount(row.fuelUntil(), now);
        double fuel = Math.max(0, Math.min(MAX_LOGS, (row.fuelUntil() - now) / (double) LOG_BURN_MS));
        String color = "amber";
        Long expiresAt = null, queueEndsAt = null;
        int queued = 0;
        for (var grant : grants) {
            if (grant.revokedAt() != null || grant.expiresAt() <= now) continue;
            queueEndsAt = queueEndsAt == null ? grant.expiresAt() : Math.max(queueEndsAt, grant.expiresAt());
            if (grant.startsAt() > now) queued++;
            else { color = grant.color(); expiresAt = grant.expiresAt(); }
        }
        return new FireView(logs, MAX_LOGS, fuel / MAX_LOGS, color, expiresAt, now,
            logs == 0 ? null : row.fuelUntil() - (logs - 1) * LOG_BURN_MS, queueEndsAt, queued);
    }

    private static UUID requestKey(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw ApiException.badRequest("장작 요청을 다시 시도해 주세요.");
        }
        return UUID.fromString(value);
    }
    private static void validateOrder(String value) {
        if (value == null || value.isBlank() || value.length() > 200) throw ApiException.badRequest("결제 주문을 확인할 수 없어요.");
    }
}
