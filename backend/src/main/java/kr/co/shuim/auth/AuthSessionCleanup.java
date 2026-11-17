package kr.co.shuim.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 만료된 auth_sessions 행을 주기적으로 지운다. 한 번에 1000행씩, 한 차례에 최대 20번만 돌아 DB 를 오래 붙잡지 않는다 */
@Component
public class AuthSessionCleanup {
    private static final Logger log = LoggerFactory.getLogger(AuthSessionCleanup.class);
    static final int BATCH = 1000;
    static final int MAX_BATCHES = 20;
    private final JdbcClient jdbc;

    public AuthSessionCleanup(JdbcClient jdbc) { this.jdbc = jdbc; }

    @Scheduled(initialDelayString = "${app.auth.session-cleanup-delay-ms:600000}", fixedDelayString = "${app.auth.session-cleanup-delay-ms:3600000}")
    public void run() {
        try {
            int total = purgeExpired();
            if (total > 0) log.info("expired sessions removed: {}", total);
        } catch (RuntimeException e) {
            log.warn("expired session cleanup failed ({})", e.getClass().getSimpleName());
        }
    }

    /** 지운 행 수 */
    int purgeExpired() {
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = jdbc.sql("DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at <= now() LIMIT ?)")
                .param(BATCH).update();
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    /** 다른 패키지에도 있지만, 이 작업이 그쪽 설정에 기대지 않도록 여기서도 켠다 (중복해도 괜찮다) */
    @Configuration
    @EnableScheduling
    static class Scheduling {}
}
