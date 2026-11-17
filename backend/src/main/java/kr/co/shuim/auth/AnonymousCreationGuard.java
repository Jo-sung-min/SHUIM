package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ClientKeys;
import kr.co.shuim.config.RateLimiter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 익명 계정 만들기 한도.
 * 속도 제한 필터의 "쿠키 없는 쓰기" 한도는 아무 값이나 넣은 가짜 세션 쿠키로 비켜 갈 수 있고, 그래도 서버는 익명 계정을 새로 만든다.
 * 그래서 실제로 익명 users 행을 만드는 곳(AuthService.requireUser)에서 IP 별 한도와 서비스 전체 한도를 한 번 더 건다.
 * 전체 한도는 Vercel 을 거치지 않고 X-Forwarded-For 를 꾸며 IP 를 바꾸는 경우에도 DB 가 끝없이 커지지 않게 하는 천장이다.
 * 카운터는 이 JVM 메모리에만 있다 (인스턴스 하나 전제, 재시작하면 0부터).
 */
@Component
public class AnonymousCreationGuard {
    static final String MESSAGE = "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";

    private final boolean enabled;
    private final RateLimiter limiter = new RateLimiter(100_000);
    private final RateLimiter.Limit perIp;
    private final RateLimiter.Limit global;

    public AnonymousCreationGuard(@Value("${app.rate-limit.enabled:true}") boolean enabled,
                                  @Value("${app.rate-limit.scale:1}") double scale,
                                  @Value("${app.rate-limit.anon-create-ip:30/1h}") String perIp,
                                  @Value("${app.rate-limit.anon-create-global:3000/1h}") String global) {
        this.enabled = enabled;
        this.perIp = scaled(RateLimiter.Limit.parse(perIp), scale);
        this.global = scaled(RateLimiter.Limit.parse(global), scale);
    }

    private static RateLimiter.Limit scaled(RateLimiter.Limit limit, double scale) {
        return limit == null || !(scale > 0) || scale == 1 ? limit : limit.scaled(scale);
    }

    /** 익명 계정을 하나 더 만들어도 되면 그냥 돌아오고, 한도를 넘었으면 429 */
    public void check(HttpServletRequest req) {
        if (!enabled) return;
        long wait = 0;
        if (perIp != null) wait = Math.max(wait, limiter.take("anon-create|ip|" + ClientKeys.clientIp(req), perIp));
        if (global != null) wait = Math.max(wait, limiter.take("anon-create|all", global));
        if (wait > 0) throw new ApiException(429, MESSAGE);
    }
}
