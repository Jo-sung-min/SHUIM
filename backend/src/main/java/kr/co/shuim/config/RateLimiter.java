package kr.co.shuim.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

/**
 * 메모리 토큰 버킷. 서버가 한 대(EB 단일 인스턴스)라는 전제라 DB·Redis 없이 이 JVM 안에서만 센다.
 * 인스턴스를 늘리면 한도가 대수만큼 느슨해진다(ABUSE-15). 그때는 공용 저장소나 엣지 제한으로 옮긴다.
 *
 * 메모리 상한: 키가 maxKeys 를 넘으면 가득 찬(=오래 안 쓴) 버킷부터 지우고, 그래도 넘치면 새 키는 세지 않고 통과시킨다(fail-open).
 * 버킷은 "다 찼을 때"만 지우므로, 지웠다 다시 만들어도 한도가 일찍 풀리지 않는다.
 */
public final class RateLimiter {
    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);
    private static final long SWEEP_EVERY_NANOS = 60_000_000_000L;

    /** 한 종류의 한도: capacity 개를 periodNanos 동안 모두 다시 채운다 (= 최대 몰아 쓰기 capacity, 평균 capacity/period) */
    public record Limit(double capacity, long periodNanos) {
        public Limit {
            if (!(capacity > 0) || periodNanos <= 0) throw new IllegalArgumentException("bad limit");
        }
        double perNano() { return capacity / periodNanos; }

        public Limit scaled(double scale) { return new Limit(Math.max(1, capacity * scale), periodNanos); }

        /** "30/10m", "6000/1m", "20/1h", "5/30s". 비우거나 off 면 null(제한 없음) */
        public static Limit parse(String spec) {
            if (spec == null) return null;
            String s = spec.strip().toLowerCase(Locale.ROOT);
            if (s.isEmpty() || s.equals("off") || s.equals("none")) return null;
            int slash = s.indexOf('/');
            if (slash <= 0 || slash == s.length() - 1) throw new IllegalArgumentException("한도 형식은 30/10m 처럼 써요: " + spec);
            double count = Double.parseDouble(s.substring(0, slash).strip());
            String p = s.substring(slash + 1).strip();
            char unit = p.charAt(p.length() - 1);
            long n = Long.parseLong(p.substring(0, p.length() - 1).strip());
            long seconds = switch (unit) {
                case 's' -> n;
                case 'm' -> n * 60;
                case 'h' -> n * 3600;
                default -> throw new IllegalArgumentException("기간 단위는 s·m·h 예요: " + spec);
            };
            return new Limit(count, seconds * 1_000_000_000L);
        }
    }

    private static final class Bucket {
        private final Limit limit;
        private double tokens;
        private long updated;

        Bucket(Limit limit, long now) {
            this.limit = limit;
            this.tokens = limit.capacity();
            this.updated = now;
        }

        private void refill(long now) {
            if (now > updated) {
                tokens = Math.min(limit.capacity(), tokens + (now - updated) * limit.perNano());
                updated = now;
            }
        }

        /** 0 이면 통과, 아니면 다음 한 개가 찰 때까지 남은 나노초 */
        synchronized long take(long now) {
            refill(now);
            if (tokens >= 1) {
                tokens -= 1;
                return 0;
            }
            return Math.max(1, (long) Math.ceil((1 - tokens) / limit.perNano()));
        }

        synchronized boolean full(long now) {
            refill(now);
            return tokens >= limit.capacity();
        }
    }

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final LongSupplier nanos;
    private final int maxKeys;
    private final AtomicLong lastSweep;
    private final AtomicLong lastOverflowWarn = new AtomicLong(Long.MIN_VALUE / 2);

    public RateLimiter(int maxKeys) { this(maxKeys, System::nanoTime); }

    RateLimiter(int maxKeys, LongSupplier nanos) {
        this.maxKeys = Math.max(100, maxKeys);
        this.nanos = nanos;
        this.lastSweep = new AtomicLong(nanos.getAsLong());
    }

    /** key 의 버킷에서 한 개를 쓴다. 0 이면 통과, 아니면 다시 시도할 수 있을 때까지 남은 나노초 */
    public long take(String key, Limit limit) {
        long now = nanos.getAsLong();
        maybeSweep(now);
        Bucket b = buckets.get(key);
        if (b == null) {
            if (buckets.size() >= maxKeys) {
                sweep(now);
                if (buckets.size() >= maxKeys) {
                    long last = lastOverflowWarn.get();
                    if (now - last > SWEEP_EVERY_NANOS && lastOverflowWarn.compareAndSet(last, now)) {
                        log.warn("요청 제한 키가 {}개를 넘어 새 키는 세지 않고 통과시켜요", maxKeys);
                    }
                    return 0;
                }
            }
            b = buckets.computeIfAbsent(key, k -> new Bucket(limit, now));
        }
        return b.take(now);
    }

    int size() { return buckets.size(); }

    private void maybeSweep(long now) {
        long last = lastSweep.get();
        if (now - last >= SWEEP_EVERY_NANOS && lastSweep.compareAndSet(last, now)) sweep(now);
    }

    /** 다 찬 버킷(=그동안 안 쓴 키)만 지운다 */
    void sweep(long now) {
        buckets.entrySet().removeIf(e -> e.getValue().full(now));
    }
}
