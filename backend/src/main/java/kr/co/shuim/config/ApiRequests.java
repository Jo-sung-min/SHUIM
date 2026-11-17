package kr.co.shuim.config;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Set;
import java.util.regex.Pattern;

/** API 필터들이 같이 쓰는 도구: 클라이언트 IP, 세션 키, 필터에서 바로 내보내는 오류 응답 */
public final class ApiRequests {
    private ApiRequests() {}

    /** 쿠키 이름 (AuthService.COOKIE 와 같다. 필터가 auth 패키지에 기대지 않게 따로 둔다) */
    static final String SESSION_COOKIE = "shuim_session";
    /** 상태 확인 경로. 화면마다 주기적으로 부르므로 제한·비밀 헤더 검사에서 뺀다 */
    static final String HEALTH_PATH = "/api/db";
    private static final Pattern IP_CHARS = Pattern.compile("^[0-9A-Fa-f:.]{2,45}$");

    /** 요청 경로 (컨텍스트 경로 제외) */
    static String path(HttpServletRequest req) {
        String uri = req.getRequestURI();
        String ctx = req.getContextPath();
        if (uri == null) return "";
        return ctx != null && !ctx.isEmpty() && uri.startsWith(ctx) ? uri.substring(ctx.length()) : uri;
    }

    static boolean exempt(HttpServletRequest req) {
        return "OPTIONS".equalsIgnoreCase(req.getMethod()) || HEALTH_PATH.equals(path(req));
    }

    /**
     * 클라이언트 IP: X-Forwarded-For 의 첫 값, 없으면 연결 상대.
     * Vercel 은 XFF 를 실제 클라이언트로 덮어쓰므로 Vercel 을 거친 요청은 믿을 수 있다.
     * EB 로 직접 오는 요청은 XFF 를 꾸밀 수 있으니, 막으려면 ORIGIN_SHARED_SECRET 을 켠다.
     * IPv6 는 한 가입자가 /64 를 통째로 받으므로 /64 로 묶는다.
     */
    static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        String ip = null;
        if (xff != null) {
            int comma = xff.indexOf(',');
            String first = (comma < 0 ? xff : xff.substring(0, comma)).strip();
            if (IP_CHARS.matcher(first).matches()) ip = first;
        }
        if (ip == null) ip = req.getRemoteAddr();
        if (ip == null) return "unknown";
        return ip.indexOf(':') >= 0 ? ipv6Prefix(ip) : ip;
    }

    private static String ipv6Prefix(String ip) {
        String s = ip.startsWith("[") && ip.endsWith("]") ? ip.substring(1, ip.length() - 1) : ip;
        if (!IP_CHARS.matcher(s).matches()) return ip;
        try {
            // 숫자 주소만 넘기므로 DNS 조회는 일어나지 않는다
            byte[] b = InetAddress.getByName(s).getAddress();
            if (b.length != 16) return s;
            return HexFormat.of().formatHex(b, 0, 8) + "::/64";
        } catch (Exception e) {
            return s;
        }
    }

    /** 세션 쿠키나 Bearer 토큰의 SHA-256 앞 16바이트. 없으면 null. DB 는 보지 않는다 */
    static String sessionKey(HttpServletRequest req) {
        String token = null;
        Cookie[] cookies = req.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (SESSION_COOKIE.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
                    token = c.getValue();
                    break;
                }
            }
        }
        if (token == null) {
            String h = req.getHeader("Authorization");
            if (h != null && h.length() > 7 && h.regionMatches(true, 0, "Bearer ", 0, 7)) {
                String t = h.substring(7).strip();
                if (!t.isEmpty()) token = t;
            }
        }
        if (token == null) return null;
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 필터에서 바로 {"error": "..."} 를 쓴다. 미니앱처럼 다른 출처에서 부른 경우에도 화면이 문구를 읽을 수 있게
     * 허용된 출처면 CORS 헤더를 붙인다 (MVC 의 CORS 처리는 필터에서 끊긴 응답에 닿지 않는다).
     */
    static void writeError(HttpServletRequest req, HttpServletResponse res, int status, String message, Set<String> corsOrigins) throws IOException {
        String origin = req.getHeader("Origin");
        if (origin != null && corsOrigins != null && corsOrigins.contains(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.addHeader("Vary", "Origin");
        }
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.setHeader("Cache-Control", "no-store");
        res.getOutputStream().write(("{\"error\":\"" + message.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}").getBytes(StandardCharsets.UTF_8));
    }
}
