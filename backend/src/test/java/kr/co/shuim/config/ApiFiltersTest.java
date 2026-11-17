package kr.co.shuim.config;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/** 요청 속도 제한·공유 비밀 헤더·본문 크기 필터 */
class ApiFiltersTest {
    private static final long SEC = 1_000_000_000L;

    private static MockHttpServletRequest req(String method, String path) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, path);
        r.setRemoteAddr("10.0.0.1");
        return r;
    }

    private static MockHttpServletResponse run(jakarta.servlet.Filter f, MockHttpServletRequest r) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(r, res, new MockFilterChain());
        return res;
    }

    private static RateLimitFilter filter(AtomicLong now, List<RateLimitFilter.Rule> rules, String anonWrite) {
        return new RateLimitFilter(true, new RateLimiter(1000, now::get), rules, RateLimiter.Limit.parse(anonWrite), Set.of("https://app.web.tossmini.com"));
    }

    @Test
    void limitSpecParses() {
        RateLimiter.Limit l = RateLimiter.Limit.parse("30/10m");
        assertEquals(30, l.capacity());
        assertEquals(600 * SEC, l.periodNanos());
        assertEquals(3600 * SEC, RateLimiter.Limit.parse("20/1h").periodNanos());
        assertNull(RateLimiter.Limit.parse("off"));
        assertNull(RateLimiter.Limit.parse(""));
        assertThrows(IllegalArgumentException.class, () -> RateLimiter.Limit.parse("30"));
        assertEquals(60, ApiFilterConfig.scaled("30/1m", 2).capacity());
    }

    @Test
    void bucketRefillsAndSweepKeepsPartialBuckets() {
        AtomicLong now = new AtomicLong(0);
        RateLimiter rl = new RateLimiter(1000, now::get);
        RateLimiter.Limit l = RateLimiter.Limit.parse("2/1m");
        assertEquals(0, rl.take("k", l));
        assertEquals(0, rl.take("k", l));
        long wait = rl.take("k", l);
        assertTrue(wait > 29 * SEC && wait <= 30 * SEC, "다음 한 개는 30초 뒤");
        rl.sweep(now.get());
        assertEquals(1, rl.size(), "덜 찬 버킷은 지우지 않아 한도가 일찍 풀리지 않는다");
        now.addAndGet(30 * SEC);
        assertEquals(0, rl.take("k", l));
        now.addAndGet(120 * SEC);
        rl.sweep(now.get());
        assertEquals(0, rl.size(), "다 찬 버킷은 지운다");
    }

    @Test
    void limiterFailsOpenWhenKeysOverflow() {
        AtomicLong now = new AtomicLong(0);
        RateLimiter rl = new RateLimiter(100, now::get);
        RateLimiter.Limit l = RateLimiter.Limit.parse("1/1h");
        for (int i = 0; i < 100; i++) rl.take("k" + i, l);
        assertEquals(0, rl.take("new", l));
        assertEquals(0, rl.take("new", l), "넘친 뒤 새 키는 세지 않는다");
        assertEquals(100, rl.size());
    }

    @Test
    void returns429WithRetryAfterAndCorsForAllowedOrigin() throws Exception {
        AtomicLong now = new AtomicLong(0);
        RateLimitFilter f = filter(now, List.of(ApiFilterConfig.rule("auth", RateLimitFilter::isAuth, "2/1m", "off", 1)), null);
        for (int i = 0; i < 2; i++) assertEquals(200, run(f, req("POST", "/api/auth/login")).getStatus());
        MockHttpServletRequest r = req("POST", "/api/auth/login");
        r.addHeader("Origin", "https://app.web.tossmini.com");
        MockHttpServletResponse res = run(f, r);
        assertEquals(429, res.getStatus());
        assertEquals("30", res.getHeader("Retry-After"));
        assertEquals("https://app.web.tossmini.com", res.getHeader("Access-Control-Allow-Origin"));
        assertTrue(res.getContentAsString(StandardCharsets.UTF_8).contains(RateLimitFilter.MESSAGE));
        // 다른 경로·OPTIONS·토스 연결 끊기 콜백은 이 규칙에 안 걸린다
        assertEquals(200, run(f, req("POST", "/api/community/consent")).getStatus());
        assertEquals(200, run(f, req("OPTIONS", "/api/auth/login")).getStatus());
        assertEquals(200, run(f, req("POST", "/api/auth/toss/unlink")).getStatus());
        // 다른 IP 는 따로 센다 (X-Forwarded-For 첫 값)
        MockHttpServletRequest other = req("POST", "/api/auth/login");
        other.addHeader("X-Forwarded-For", "203.0.113.7, 10.0.0.1");
        assertEquals(200, run(f, other).getStatus());
    }

    @Test
    void sessionBucketIsSeparatePerSession() throws Exception {
        AtomicLong now = new AtomicLong(0);
        RateLimitFilter f = filter(now, List.of(ApiFilterConfig.rule("ai", RateLimitFilter::isAi, "off", "1/10m", 1)), null);
        MockHttpServletRequest a = req("POST", "/api/today");
        a.setCookies(new Cookie(ApiRequests.SESSION_COOKIE, "aaa"));
        assertEquals(200, run(f, a).getStatus());
        MockHttpServletRequest a2 = req("POST", "/api/today");
        a2.setCookies(new Cookie(ApiRequests.SESSION_COOKIE, "aaa"));
        assertEquals(429, run(f, a2).getStatus());
        MockHttpServletRequest b = req("POST", "/api/circles/x/preview");
        b.addHeader("Authorization", "Bearer bbb");
        assertEquals(200, run(f, b).getStatus(), "Bearer 토큰(미니앱)도 따로 센다");
        MockHttpServletRequest b2 = req("POST", "/api/summarize");
        b2.addHeader("Authorization", "Bearer bbb");
        assertEquals(429, run(f, b2).getStatus());
    }

    @Test
    void anonymousWritesAreLimitedPerIp() throws Exception {
        AtomicLong now = new AtomicLong(0);
        RateLimitFilter f = filter(now, List.of(), "2/1h");
        assertEquals(200, run(f, req("POST", "/api/community/consent")).getStatus());
        assertEquals(200, run(f, req("POST", "/api/beach/enter")).getStatus());
        assertEquals(429, run(f, req("POST", "/api/beach/enter")).getStatus());
        assertEquals(200, run(f, req("GET", "/api/community")).getStatus(), "읽기는 세지 않는다");
        MockHttpServletRequest withSession = req("POST", "/api/beach/enter");
        withSession.setCookies(new Cookie(ApiRequests.SESSION_COOKIE, "s"));
        assertEquals(200, run(f, withSession).getStatus(), "세션이 있으면 익명 쓰기가 아니다");
        assertEquals(200, run(f, req("POST", "/api/auth/login")).getStatus(), "로그인 계열은 auth 규칙이 따로 센다");
    }

    @Test
    void tickPollingStaysUnderGeneralSessionLimit() throws Exception {
        AtomicLong now = new AtomicLong(0);
        RateLimitFilter f = filter(now, List.of(ApiFilterConfig.rule("general", (m, p) -> true, "6000/1m", "1200/1m", 1)), null);
        // 같은 세션의 탭 세 개가 10분 동안 250ms 간격으로 tick
        for (int i = 0; i < 3 * 4 * 600; i++) {
            if (i % 3 == 0) now.addAndGet(SEC / 4);
            MockHttpServletRequest r = req("POST", "/api/beach/tick");
            r.setCookies(new Cookie(ApiRequests.SESSION_COOKIE, "s"));
            assertEquals(200, run(f, r).getStatus());
        }
    }

    @Test
    void disabledFilterPassesEverything() throws Exception {
        RateLimitFilter f = new RateLimitFilter(false, new RateLimiter(100), List.of(ApiFilterConfig.rule("all", (m, p) -> true, "1/1h", "1/1h", 1)), null, Set.of());
        for (int i = 0; i < 3; i++) assertEquals(200, run(f, req("GET", "/api/community")).getStatus());
    }

    @Test
    void healthPathIsExempt() throws Exception {
        AtomicLong now = new AtomicLong(0);
        RateLimitFilter f = filter(now, List.of(ApiFilterConfig.rule("all", (m, p) -> true, "1/1h", "1/1h", 1)), null);
        for (int i = 0; i < 3; i++) assertEquals(200, run(f, req("GET", "/api/db")).getStatus());
    }

    @Test
    void routeMatchers() {
        assertTrue(RateLimitFilter.isAi("POST", "/api/circles/abc/submissions/s1/draft"));
        assertFalse(RateLimitFilter.isAi("GET", "/api/today"));
        assertTrue(RateLimitFilter.isMail("POST", "/api/circles/abc/verify/start"));
        assertTrue(RateLimitFilter.isMail("POST", "/api/circles/abc/verify/confirm"));
        assertTrue(RateLimitFilter.isDm("POST", "/api/messages/123"));
        assertTrue(RateLimitFilter.isReport("POST", "/api/community/report"));
        assertTrue(RateLimitFilter.isReport("POST", "/api/safety-reports"));
        assertFalse(RateLimitFilter.isReport("POST", "/api/safety-reports/1/review"));
        assertTrue(RateLimitFilter.isPayment("POST", "/api/beach/fire/payments/reconcile"));
        assertTrue(RateLimitFilter.isPayment("POST", "/api/fireworks/tickets/buy"));
        assertTrue(RateLimitFilter.isBannerClick("POST", "/api/sponsors/banners/b1/click"));
        assertTrue(RateLimitFilter.isUpload("POST", "/api/upload/presign"));
        assertFalse(RateLimitFilter.isUpload("GET", "/api/upload/presign"));
    }

    @Test
    void clientIpUsesFirstForwardedEntryAndGroupsIpv6() {
        MockHttpServletRequest r = req("GET", "/api/x");
        assertEquals("10.0.0.1", ApiRequests.clientIp(r));
        r.addHeader("X-Forwarded-For", " 198.51.100.2 , 10.1.1.1");
        assertEquals("198.51.100.2", ApiRequests.clientIp(r));
        MockHttpServletRequest v6 = req("GET", "/api/x");
        v6.addHeader("X-Forwarded-For", "2001:db8:1:2:aaaa::1");
        MockHttpServletRequest v6b = req("GET", "/api/x");
        v6b.addHeader("X-Forwarded-For", "2001:db8:1:2:bbbb::9");
        assertEquals(ApiRequests.clientIp(v6), ApiRequests.clientIp(v6b));
        MockHttpServletRequest junk = req("GET", "/api/x");
        junk.addHeader("X-Forwarded-For", "evil.example.com");
        assertEquals("10.0.0.1", ApiRequests.clientIp(junk), "IP 가 아닌 값은 무시");
    }

    @Test
    void originSecretRequiredOnlyWhenConfigured() throws Exception {
        OriginSecretFilter off = new OriginSecretFilter("", Set.of());
        assertEquals(200, run(off, req("GET", "/api/community")).getStatus());

        OriginSecretFilter on = new OriginSecretFilter("s3cret", Set.of());
        assertEquals(403, run(on, req("GET", "/api/community")).getStatus());
        MockHttpServletRequest wrong = req("GET", "/api/community");
        wrong.addHeader(OriginSecretFilter.HEADER, "nope");
        assertEquals(403, run(on, wrong).getStatus());
        MockHttpServletRequest ok = req("GET", "/api/community");
        ok.addHeader(OriginSecretFilter.HEADER, "s3cret");
        assertEquals(200, run(on, ok).getStatus());
        assertEquals(200, run(on, req("GET", "/api/db")).getStatus(), "상태 확인은 뺀다");
        assertEquals(200, run(on, req("OPTIONS", "/api/community")).getStatus());
    }

    @Test
    void bodySizeLimitByContentLengthAndChunked() throws Exception {
        BodySizeFilter f = new BodySizeFilter(2048, 8192, Set.of());
        MockHttpServletRequest big = req("POST", "/api/community/post.create");
        big.setContent(new byte[3000]);
        MockHttpServletResponse res = run(f, big);
        assertEquals(413, res.getStatus());
        assertTrue(res.getContentAsString(StandardCharsets.UTF_8).contains(BodySizeFilter.MESSAGE));

        MockHttpServletRequest admin = req("PUT", "/api/site");
        admin.setContent(new byte[3000]);
        assertEquals(200, run(f, admin).getStatus(), "사이트 설정 이미지는 큰 한도");

        // 길이 없는 본문: 읽는 도중 끊는다
        MockHttpServletRequest raw = req("POST", "/api/x");
        raw.setContent(new byte[3000]);
        BodySizeFilter.Limited chunked = new BodySizeFilter.Limited(raw, 2048);
        byte[] buf = new byte[1024];
        var in = chunked.getInputStream();
        assertThrows(BodySizeFilter.TooLarge.class, () -> {
            while (in.read(buf, 0, buf.length) > 0) { /* 끝까지 읽는다 */ }
        });
    }
}
