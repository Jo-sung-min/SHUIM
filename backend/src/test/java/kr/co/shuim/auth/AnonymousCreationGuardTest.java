package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.*;

class AnonymousCreationGuardTest {
    private static MockHttpServletRequest from(String ip) {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/community/post");
        req.addHeader("X-Forwarded-For", ip + ", 10.0.0.1");
        // 아무 값이나 넣은 세션 쿠키: 필터의 "쿠키 없는 쓰기" 한도는 비켜 가지만 여기서는 소용없다
        req.setCookies(new jakarta.servlet.http.Cookie(AuthService.COOKIE, "f".repeat(64)));
        return req;
    }

    @Test
    void sameIpIsLimitedEvenWithForgedCookie() {
        AnonymousCreationGuard guard = new AnonymousCreationGuard(true, 1, "2/1h", "100/1h");
        guard.check(from("203.0.113.7"));
        guard.check(from("203.0.113.7"));
        ApiException e = assertThrows(ApiException.class, () -> guard.check(from("203.0.113.7")));
        assertEquals(429, e.status());
        guard.check(from("198.51.100.9")); // 다른 IP 는 따로 센다
    }

    @Test
    void globalCeilingStopsRotatingIps() {
        AnonymousCreationGuard guard = new AnonymousCreationGuard(true, 1, "100/1h", "3/1h");
        guard.check(from("203.0.113.1"));
        guard.check(from("203.0.113.2"));
        guard.check(from("203.0.113.3"));
        assertThrows(ApiException.class, () -> guard.check(from("203.0.113.4")));
    }

    @Test
    void offSwitchAndOffLimitsPassEverything() {
        AnonymousCreationGuard disabled = new AnonymousCreationGuard(false, 1, "1/1h", "1/1h");
        for (int i = 0; i < 5; i++) disabled.check(from("203.0.113.7"));
        AnonymousCreationGuard unlimited = new AnonymousCreationGuard(true, 1, "off", "off");
        for (int i = 0; i < 5; i++) unlimited.check(from("203.0.113.7"));
    }
}
