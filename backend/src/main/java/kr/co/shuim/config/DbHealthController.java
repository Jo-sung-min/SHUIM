package kr.co.shuim.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * GET /api/db — 연결 상태 확인. 화면마다 30초마다 부르므로 결과를 10초 캐시하고,
 * 응답에는 프런트가 읽는 configured·ok(와 지연 시간)만 담는다. DB 계정·버전·오류 원문은 서버 로그에만 남긴다.
 */
@RestController
public class DbHealthController {
    private static final Logger log = LoggerFactory.getLogger(DbHealthController.class);
    static final long CACHE_MS = 10_000;

    private final JdbcClient jdbc;
    private final LongSupplier clock;
    private volatile Result cached;
    private int probes;

    record Result(boolean ok, long latencyMs, long at) {}

    @org.springframework.beans.factory.annotation.Autowired // 생성자가 둘이라 스프링이 쓸 것을 밝혀 둔다 (없으면 기동 실패)
    public DbHealthController(JdbcClient jdbc) { this(jdbc, System::currentTimeMillis); }

    DbHealthController(JdbcClient jdbc, LongSupplier clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/api/db")
    public ResponseEntity<Map<String, Object>> health() {
        Result r = result();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured", true);
        out.put("ok", r.ok());
        out.put("latencyMs", r.latencyMs());
        return ResponseEntity.status(r.ok() ? 200 : 500).cacheControl(CacheControl.noStore()).body(out);
    }

    Result result() {
        Result r = cached;
        long now = clock.getAsLong();
        if (r != null && now - r.at() < CACHE_MS) return r;
        synchronized (this) {
            r = cached;
            now = clock.getAsLong();
            if (r != null && now - r.at() < CACHE_MS) return r;
            r = probe(now);
            probes++;
            cached = r;
            return r;
        }
    }

    /** 실제로 DB 를 친 횟수 (테스트용) */
    synchronized int probes() { return probes; }

    private Result probe(long t0) {
        try {
            jdbc.sql("select 1").query(Integer.class).single();
            return new Result(true, clock.getAsLong() - t0, t0);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
            String hint = msg.contains("max clients reached") ? " (Supabase 세션 모드 한도: DB_URL 포트를 6543 으로)"
                : msg.contains("password authentication failed") ? " (DB 비밀번호 확인)"
                : msg.contains("timeout") ? " (연결 시간 초과: 네트워크·리전 확인)" : "";
            log.warn("DB 상태 확인 실패: {}{}", e.getClass().getSimpleName(), hint);
            return new Result(false, clock.getAsLong() - t0, t0);
        }
    }
}
