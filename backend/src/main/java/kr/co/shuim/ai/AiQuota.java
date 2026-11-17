package kr.co.shuim.ai;

import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * AI 호출 하루 한도 (한국 날짜 기준). 사용자·기능별 한도와 서비스 전체 하루 한도를 함께 본다.
 * 백엔드 인스턴스가 하나라 메모리 카운터로 충분하다 (재시작하면 그날 카운트가 0 부터 다시 시작한다).
 * 여러 대로 늘리면 DB·Redis 카운터로 옮겨야 한다.
 */
@Component
public class AiQuota {
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final String LIMIT_MESSAGE = "오늘은 AI 요청을 많이 했어요. 내일 다시 시도해 주세요.";
    static final String BUSY_MESSAGE = "지금 요청이 많아요. 잠시 후 다시 시도해 주세요.";

    private final int todayLimit, todayAnonLimit, summarizeLimit, summarizeAnonLimit, globalLimit;
    private final Supplier<LocalDate> clock;
    private final Map<String, AtomicInteger> counts = new ConcurrentHashMap<>();
    private final AtomicInteger global = new AtomicInteger();
    private volatile LocalDate day;

    @Autowired // 생성자가 둘이라 스프링이 고를 생성자를 밝혀 둔다 (없으면 기동 실패)
    public AiQuota(@Value("${app.ai.daily-limit.today:30}") int todayLimit,
                   @Value("${app.ai.daily-limit.today-anonymous:12}") int todayAnonLimit,
                   @Value("${app.ai.daily-limit.summarize:20}") int summarizeLimit,
                   @Value("${app.ai.daily-limit.summarize-anonymous:8}") int summarizeAnonLimit,
                   @Value("${app.ai.daily-limit.global:5000}") int globalLimit) {
        this(todayLimit, todayAnonLimit, summarizeLimit, summarizeAnonLimit, globalLimit, () -> LocalDate.now(KST));
    }

    AiQuota(int todayLimit, int todayAnonLimit, int summarizeLimit, int summarizeAnonLimit, int globalLimit, Supplier<LocalDate> clock) {
        this.todayLimit = todayLimit;
        this.todayAnonLimit = todayAnonLimit;
        this.summarizeLimit = summarizeLimit;
        this.summarizeAnonLimit = summarizeAnonLimit;
        this.globalLimit = globalLimit;
        this.clock = clock;
        this.day = clock.get();
    }

    /**
     * 한 번 쓴 것으로 센다. 한도를 넘으면 429(개인) 또는 503(전체)을 던진다.
     * feature: "today" | "summarize", key: 사용자 id (없으면 접속 주소), anonymous: 가입 전 방문자
     */
    public void acquire(String feature, String key, boolean anonymous) {
        rollover();
        boolean summarize = "summarize".equals(feature);
        int limit = summarize ? (anonymous ? summarizeAnonLimit : summarizeLimit) : (anonymous ? todayAnonLimit : todayLimit);
        AtomicInteger used = counts.computeIfAbsent(feature + ":" + (key == null ? "-" : key), k -> new AtomicInteger());
        if (used.incrementAndGet() > limit) {
            used.decrementAndGet();
            throw new ApiException(429, LIMIT_MESSAGE);
        }
        if (global.incrementAndGet() > globalLimit) {
            global.decrementAndGet();
            used.decrementAndGet();
            throw ApiException.unavailable(BUSY_MESSAGE);
        }
    }

    private void rollover() {
        LocalDate now = clock.get();
        if (now.equals(day)) return;
        synchronized (this) {
            if (now.equals(day)) return;
            counts.clear();
            global.set(0);
            day = now;
        }
    }
}
