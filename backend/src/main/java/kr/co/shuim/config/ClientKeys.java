package kr.co.shuim.config;

import jakarta.servlet.http.HttpServletRequest;

/** 다른 패키지에서 속도 제한 필터와 같은 방식으로 클라이언트 IP 키를 얻을 때 쓴다 (ApiRequests.clientIp 와 같음) */
public final class ClientKeys {
    private ClientKeys() {}

    public static String clientIp(HttpServletRequest req) { return ApiRequests.clientIp(req); }
}
