package kr.co.shuim.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/**
 * 선택: 프런트 프록시(Vercel)만 API 를 부르게 하는 공유 비밀 헤더 (INFRA-07).
 * ORIGIN_SHARED_SECRET 이 비어 있으면 아무것도 하지 않는다. 설정하면 /api/** 요청(OPTIONS·상태 확인 제외)은
 * X-Sorow-Origin-Secret 헤더가 같아야 한다. 그래야 EB 로 직접 와서 X-Forwarded-For 를 꾸미는 요청도 막힌다.
 */
public class OriginSecretFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Sorow-Origin-Secret";
    static final String MESSAGE = "허용되지 않은 요청이에요.";

    private final byte[] secret;
    private final Set<String> corsOrigins;

    public OriginSecretFilter(String secret, Set<String> corsOrigins) {
        String s = secret == null ? "" : secret.strip();
        this.secret = s.isEmpty() ? null : s.getBytes(StandardCharsets.UTF_8);
        this.corsOrigins = corsOrigins == null ? Set.of() : Set.copyOf(corsOrigins);
    }

    public boolean active() { return secret != null; }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return secret == null || ApiRequests.exempt(req) || !ApiRequests.path(req).startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String got = req.getHeader(HEADER);
        // 길이가 달라도 MessageDigest.isEqual 은 내용과 무관한 시간에 끝난다
        if (got == null || !MessageDigest.isEqual(secret, got.getBytes(StandardCharsets.UTF_8))) {
            ApiRequests.writeError(req, res, 403, MESSAGE, corsOrigins);
            return;
        }
        chain.doFilter(req, res);
    }
}
