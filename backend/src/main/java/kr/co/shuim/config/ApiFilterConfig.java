package kr.co.shuim.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;

import java.util.List;
import java.util.function.BiPredicate;

/**
 * /api/** 앞단 필터: 공유 비밀 헤더 → 속도 제한 → 본문 크기 순으로 싸게 끊는다.
 * 한도 형식은 "개수/기간"(예: 30/10m, 20/1h). off 면 그 키는 세지 않는다.
 * 카운터는 이 JVM 메모리에만 있다(단일 인스턴스 전제, ABUSE-15).
 */
@Configuration
public class ApiFilterConfig {
    private static final Logger log = LoggerFactory.getLogger(ApiFilterConfig.class);

    @Bean
    public FilterRegistrationBean<OriginSecretFilter> originSecretFilter(
        @Value("${app.security.origin-secret:}") String secret, WebConfig web
    ) {
        OriginSecretFilter f = new OriginSecretFilter(secret, web.corsOrigins());
        if (f.active()) log.info("API 공유 비밀 헤더({}) 검사를 켰어요", OriginSecretFilter.HEADER);
        return register(f, Ordered.HIGHEST_PRECEDENCE + 20);
    }

    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilter(
        WebConfig web,
        @Value("${app.rate-limit.enabled:true}") boolean enabled,
        @Value("${app.rate-limit.scale:1}") double scale,
        @Value("${app.rate-limit.max-keys:100000}") int maxKeys,
        @Value("${app.rate-limit.general-ip:6000/1m}") String generalIp,
        @Value("${app.rate-limit.general-session:1200/1m}") String generalSession,
        @Value("${app.rate-limit.auth-ip:30/5m}") String authIp,
        @Value("${app.rate-limit.auth-session:10/1m}") String authSession,
        @Value("${app.rate-limit.ai-ip:100/10m}") String aiIp,
        @Value("${app.rate-limit.ai-session:20/10m}") String aiSession,
        @Value("${app.rate-limit.mail-ip:30/10m}") String mailIp,
        @Value("${app.rate-limit.mail-session:10/10m}") String mailSession,
        @Value("${app.rate-limit.dm-ip:120/1m}") String dmIp,
        @Value("${app.rate-limit.dm-session:30/1m}") String dmSession,
        @Value("${app.rate-limit.report-ip:60/10m}") String reportIp,
        @Value("${app.rate-limit.report-session:20/10m}") String reportSession,
        @Value("${app.rate-limit.upload-ip:120/1m}") String uploadIp,
        @Value("${app.rate-limit.upload-session:30/1m}") String uploadSession,
        @Value("${app.rate-limit.payment-ip:60/1m}") String paymentIp,
        @Value("${app.rate-limit.payment-session:20/1m}") String paymentSession,
        @Value("${app.rate-limit.banner-click-ip:30/1m}") String bannerIp,
        @Value("${app.rate-limit.banner-click-session:10/1m}") String bannerSession,
        @Value("${app.rate-limit.anon-write-ip:20/1h}") String anonWriteIp
    ) {
        List<RateLimitFilter.Rule> rules = List.of(
            rule("general", (m, p) -> true, generalIp, generalSession, scale),
            rule("auth", RateLimitFilter::isAuth, authIp, authSession, scale),
            rule("ai", RateLimitFilter::isAi, aiIp, aiSession, scale),
            rule("mail", RateLimitFilter::isMail, mailIp, mailSession, scale),
            rule("dm", RateLimitFilter::isDm, dmIp, dmSession, scale),
            rule("report", RateLimitFilter::isReport, reportIp, reportSession, scale),
            rule("upload", RateLimitFilter::isUpload, uploadIp, uploadSession, scale),
            rule("payment", RateLimitFilter::isPayment, paymentIp, paymentSession, scale),
            rule("banner-click", RateLimitFilter::isBannerClick, bannerIp, bannerSession, scale)
        );
        RateLimitFilter f = new RateLimitFilter(enabled, new RateLimiter(maxKeys), rules, scaled(anonWriteIp, scale), web.corsOrigins());
        if (!enabled) log.warn("요청 속도 제한이 꺼져 있어요 (RATE_LIMIT_ENABLED=false)");
        return register(f, Ordered.HIGHEST_PRECEDENCE + 30);
    }

    @Bean
    public FilterRegistrationBean<BodySizeFilter> bodySizeFilter(
        WebConfig web,
        @Value("${app.http.max-body-bytes:2097152}") long maxBytes,
        @Value("${app.http.max-large-body-bytes:8388608}") long largeMaxBytes
    ) {
        return register(new BodySizeFilter(maxBytes, largeMaxBytes, web.corsOrigins()), Ordered.HIGHEST_PRECEDENCE + 40);
    }

    static RateLimitFilter.Rule rule(String name, BiPredicate<String, String> matches, String ip, String session, double scale) {
        return new RateLimitFilter.Rule(name, matches, scaled(ip, scale), scaled(session, scale));
    }

    static RateLimiter.Limit scaled(String spec, double scale) {
        RateLimiter.Limit l = RateLimiter.Limit.parse(spec);
        return l == null || !(scale > 0) || scale == 1 ? l : l.scaled(scale);
    }

    private static <F extends jakarta.servlet.Filter> FilterRegistrationBean<F> register(F filter, int order) {
        FilterRegistrationBean<F> r = new FilterRegistrationBean<>(filter);
        r.addUrlPatterns("/api/*");
        r.setOrder(order);
        return r;
    }
}
