package kr.co.shuim.beach;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

/** A durable-in-this-test store shared between service instances, with per-community locks. */
final class TestFireRepository extends BeachFireRepository {
    private final Map<String, Row> rows = new ConcurrentHashMap<>();
    private final Map<String, Grant> grants = new ConcurrentHashMap<>();
    private record Request(String community, String user, UUID id) {}
    private final Map<Request, Long> requests = new ConcurrentHashMap<>();
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public Row read(String community, long initial) { return rows.computeIfAbsent(community, id -> new Row(id, initial)); }
    public Optional<Grant> grant(String order) { return Optional.ofNullable(grants.get(order)); }
    public List<Grant> grants(String community) {
        return grants.values().stream().filter(g -> g.communityId().equals(community) && g.revokedAt() == null)
            .sorted(Comparator.comparingLong(Grant::startsAt)).toList();
    }
    public <T> T locked(String community, long initial, Function<LockedFire, T> work) {
        synchronized (locks.computeIfAbsent(community, ignored -> new Object())) {
            read(community, initial);
            return work.apply(new LockedFire() {
                public Row row() { return rows.get(community); }
                public void fuelUntil(long value) { rows.put(community, new Row(community, value)); }
                public boolean hasWoodRequest(String user, UUID request) { return requests.containsKey(new Request(community, user, request)); }
                public Long lastWoodAt(String user) {
                    return requests.entrySet().stream().filter(e -> e.getKey().community().equals(community) && e.getKey().user().equals(user))
                        .map(Map.Entry::getValue).max(Long::compareTo).orElse(null);
                }
                public void recordWood(String user, UUID request, long at) { requests.put(new Request(community, user, request), at); }
                public Optional<Grant> grant(String order) { return TestFireRepository.this.grant(order); }
                public List<Grant> grants() { return TestFireRepository.this.grants(community); }
                public void insertGrant(Grant grant) {
                    if (grants.putIfAbsent(grant.providerOrderId(), grant) != null) throw new IllegalStateException("duplicate provider order");
                }
                public void revokeGrant(String order, long at) {
                    grants.computeIfPresent(order, (key, g) -> g.revokedAt() != null ? g : new Grant(g.providerOrderId(), g.communityId(),
                        g.userId(), g.color(), g.startsAt(), g.expiresAt(), at));
                }
            });
        }
    }
}
