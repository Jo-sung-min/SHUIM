package kr.co.shuim.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;
import java.util.function.BiPredicate;
import java.util.regex.Pattern;

/**
 * /api/** 요청 속도 제한 (ABUSE-04·INFRA-04·SPACE-07·AI-03·PAY-05·ABUSE-14).
 * 키는 클라이언트 IP 와 세션(쿠키·Bearer 해시) 두 가지. 규칙마다 둘 다 검사하고, 하나라도 넘치면 429.
 *
 * 기본값 근거:
 *  - 바닷가 tick 은 움직일 때 250ms 간격(분당 240, lib/beach/continuity.ts). 탭 셋을 띄워도 분당 720 이라
 *    세션 일반 한도 분당 1200 이면 정상 사용을 막지 않는다.
 *  - 국내 모바일은 통신사 NAT 로 많은 사람이 IP 하나를 같이 쓴다. IP 일반 한도는 홍수만 막는 높은 천장(분당 6000)으로 둔다.
 *  - 비용·스팸이 드는 경로(로그인·AI·메일 인증·쪽지·신고·업로드·결제·배너 클릭)는 따로 좁은 한도를 둔다.
 *  - 쿠키·토큰 없이 오는 쓰기 요청은 매번 익명 계정을 만들 수 있으므로 IP 당 시간 20번으로 묶는다.
 * 모든 한도는 환경변수로 바꿀 수 있고(RATE_LIMIT_*), RATE_LIMIT_ENABLED=false 로 통째로 끈다.
 */
public class RateLimitFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    public static final String MESSAGE = "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";

    /** 규칙 하나: 어떤 요청에 걸리는지와 IP·세션 한도 (null 이면 그 키는 세지 않음) */
    public record Rule(String name, BiPredicate<String, String> matches, RateLimiter.Limit ip, RateLimiter.Limit session) {}

    private static final Pattern AI_CIRCLE = Pattern.compile("^/api/circles/[^/]+/(preview|submissions/[^/]+/draft)$");
    private static final Pattern MAIL = Pattern.compile("^/api/circles/[^/]+/verify/(start|confirm)$");
    private static final Pattern DM = Pattern.compile("^/api/messages(/[^/]+)?$");
    private static final Pattern BANNER_CLICK = Pattern.compile("^/api/sponsors/banners/[^/]+/click$");

    /** 규칙별 요청 판별 (method, path) */
    static boolean isAuth(String m, String p) {
        // 토스 연결 끊기 콜백은 토스 서버가 Basic 인증으로 부르므로 로그인 한도에 넣지 않는다
        return post(m) && p.startsWith("/api/auth/") && !p.equals("/api/auth/toss/unlink");
    }
    static boolean isAi(String m, String p) {
        return post(m) && (p.equals("/api/today") || p.equals("/api/summarize") || AI_CIRCLE.matcher(p).matches());
    }
    static boolean isMail(String m, String p) { return post(m) && MAIL.matcher(p).matches(); }
    static boolean isDm(String m, String p) { return post(m) && DM.matcher(p).matches(); }
    static boolean isReport(String m, String p) {
        return post(m) && (p.equals("/api/safety-reports") || p.equals("/api/community/report"));
    }
    static boolean isUpload(String m, String p) { return post(m) && p.equals("/api/upload/presign"); }
    static boolean isPayment(String m, String p) {
        return post(m) && (p.equals("/api/beach/fire/orders") || p.startsWith("/api/beach/fire/payments/") || p.equals("/api/fireworks/tickets/buy"));
    }
    static boolean isBannerClick(String m, String p) { return post(m) && BANNER_CLICK.matcher(p).matches(); }
    /** 쿠키·토큰 없는 쓰기 (로그인 계열은 isAuth 가 따로 센다) */
    static boolean isWrite(String m) { return !"GET".equalsIgnoreCase(m) && !"HEAD".equalsIgnoreCase(m) && !"OPTIONS".equalsIgnoreCase(m); }

    private static boolean post(String m) { return "POST".equalsIgnoreCase(m); }

    private final boolean enabled;
    private final RateLimiter limiter;
    private final List<Rule> rules;
    private final RateLimiter.Limit anonWriteIp;
    private final Set<String> corsOrigins;

    public RateLimitFilter(boolean enabled, RateLimiter limiter, List<Rule> rules, RateLimiter.Limit anonWriteIp, Set<String> corsOrigins) {
        this.enabled = enabled;
        this.limiter = limiter;
        this.rules = List.copyOf(rules);
        this.anonWriteIp = anonWriteIp;
        this.corsOrigins = corsOrigins == null ? Set.of() : Set.copyOf(corsOrigins);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !enabled || ApiRequests.exempt(req) || !ApiRequests.path(req).startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String method = req.getMethod();
        String path = ApiRequests.path(req);
        String ip = ApiRequests.clientIp(req);
        String session = ApiRequests.sessionKey(req);
        long wait = 0;
        String hit = null;
        for (Rule r : rules) {
            if (!r.matches().test(method, path)) continue;
            if (r.ip() != null) {
                long w = limiter.take(r.name() + "|ip|" + ip, r.ip());
                if (w > wait) { wait = w; hit = r.name() + "/ip"; }
            }
            if (r.session() != null && session != null) {
                long w = limiter.take(r.name() + "|s|" + session, r.session());
                if (w > wait) { wait = w; hit = r.name() + "/session"; }
            }
        }
        if (anonWriteIp != null && session == null && isWrite(method) && !path.startsWith("/api/auth/")) {
            long w = limiter.take("anon-write|ip|" + ip, anonWriteIp);
            if (w > wait) { wait = w; hit = "anon-write/ip"; }
        }
        if (wait > 0) {
            long seconds = Math.max(1, (wait + 999_999_999L) / 1_000_000_000L);
            log.debug("요청 제한 {} {} {} ({}초)", hit, method, path, seconds);
            res.setHeader("Retry-After", String.valueOf(seconds));
            ApiRequests.writeError(req, res, 429, MESSAGE, corsOrigins);
            return;
        }
        chain.doFilter(req, res);
    }
}
