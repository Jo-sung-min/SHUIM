package kr.co.shuim.community;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 계정별 하루 횟수 한도 (한국 시간 자정에 초기화).
 * 백엔드는 인스턴스 하나라 프로세스 안 카운터로 충분하다. 재시작하면 0부터 다시 센다.
 */
public final class DailyCaps {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final ConcurrentHashMap<String, AtomicInteger> counts = new ConcurrentHashMap<>();
    private volatile LocalDate day = LocalDate.now(KST);

    /** 한도 안이면 하나를 쓰고 true, 넘으면 쓰지 않고 false */
    public boolean tryTake(String kind, String userId, int limit) {
        LocalDate today = LocalDate.now(KST);
        if (!today.equals(day)) {
            synchronized (this) {
                if (!today.equals(day)) {
                    counts.clear();
                    day = today;
                }
            }
        }
        AtomicInteger n = counts.computeIfAbsent(kind + ":" + userId, k -> new AtomicInteger());
        if (n.incrementAndGet() > limit) {
            n.decrementAndGet();
            return false;
        }
        return true;
    }
}
