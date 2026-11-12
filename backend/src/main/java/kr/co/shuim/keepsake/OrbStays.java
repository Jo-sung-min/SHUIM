package kr.co.shuim.keepsake;

import kr.co.shuim.common.Dates;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 오늘 맵에 머문 시간 (docs/EMOTION_ORBS.md 2장). 방문과 마찬가지로 메모리에만 둔다: 서버가 다시 뜨면 0부터.
 * 맵 화면이 30초마다 "머무는 중"을 알리고, 한 번에 45초까지만 더한다. 90초 넘게 소식이 없던 구간(가려진 탭, 끊긴 연결)은 세지 않는다.
 * 그래서 아무리 자주 알려도 실제 흐른 시간보다 빨리 찰 수 없다. 날짜는 한국 날짜이고 자정이 지나면 0부터 다시 센다.
 */
@Component
public class OrbStays {
    static final long MAX_STEP_MS = 45_000, GAP_MS = 90_000;

    /** found: 오늘 구슬을 이미 주웠는지 (모르면 null. 한 번 확인하면 그날은 DB 를 다시 읽지 않는다) */
    private record Stay(LocalDate day, long ms, long lastAt, Boolean found) {}

    private final ConcurrentHashMap<String, Stay> stays = new ConcurrentHashMap<>();
    private final Clock clock;
    private volatile LocalDate sweptOn;

    @Autowired
    public OrbStays() { this(Clock.system(Dates.ZONE)); }

    OrbStays(Clock clock) { this.clock = clock; }

    public LocalDate today() { return LocalDate.now(clock); }

    /** 머무는 중이라는 신호 하나. 오늘 머문 시간(ms)을 돌려준다 */
    public long beat(String userId) {
        long now = clock.millis();
        LocalDate today = today();
        sweep(today);
        return stays.compute(userId, (id, before) -> {
            if (before == null || !before.day().equals(today)) return new Stay(today, 0, now, null);
            long gap = now - before.lastAt();
            long add = gap <= 0 || gap > GAP_MS ? 0 : Math.min(gap, MAX_STEP_MS);
            return new Stay(today, before.ms() + add, now, before.found());
        }).ms();
    }

    /** 오늘 머문 시간. 신호가 한 번도 없었으면 0 */
    public long stayed(String userId) {
        Stay stay = stays.get(userId);
        return stay != null && stay.day().equals(today()) ? stay.ms() : 0;
    }

    /** 오늘 구슬을 주웠는지 기억해 둔 값 (모르면 null) */
    public Boolean found(String userId) {
        Stay stay = stays.get(userId);
        return stay != null && stay.day().equals(today()) ? stay.found() : null;
    }

    public void remember(String userId, boolean found) {
        LocalDate today = today();
        // 아직 맵의 신호가 없었으면 시계를 돌리지 않는다 (lastAt 0: 첫 신호는 0초부터)
        stays.compute(userId, (id, before) -> before == null || !before.day().equals(today)
            ? new Stay(today, 0, 0, found) : new Stay(today, before.ms(), before.lastAt(), found));
    }

    /** 날이 바뀐 뒤 첫 신호에서 어제의 시간을 치운다 */
    private void sweep(LocalDate today) {
        if (today.equals(sweptOn)) return;
        sweptOn = today;
        stays.values().removeIf(stay -> !stay.day().equals(today));
    }
}
