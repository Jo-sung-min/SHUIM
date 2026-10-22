package kr.co.shuim.auth;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.common.Ids;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Optional;

/**
 * 카카오 로그인 (OAuth 2.0 인가 코드, 서버 사이드). 흐름:
 *   GET /api/auth/kakao → state 를 httpOnly 쿠키(5분)에 두고 kauth.kakao.com 동의 화면으로 302
 *   → 카카오가 <app.origin>/api/auth/kakao/callback?code&state 로 돌려보냄 (프론트 프록시를 거쳐 백엔드로)
 *   → state 검증 → 토큰 교환 → kapi.kakao.com/v2/user/me → users.kakao_id 로 찾거나 만들고 세션 쿠키 발급 → 앱 홈으로.
 * 로그인 전 익명 유저로 활동하던 중이면 그 행을 카카오 계정으로 승격해 외침·힘내요가 이어진다.
 * KAKAO_CLIENT_ID 가 비어 있으면 configured() 가 false 이고 /api/auth/me 가 kakao: false 를 내려 버튼이 숨겨진다.
 * HTTP 는 ai/ClaudeClient 와 같이 JDK HttpClient 위의 RestClient 를 쓴다.
 */
@Service
public class KakaoLoginService {
    private static final Logger log = LoggerFactory.getLogger(KakaoLoginService.class);
    static final String STATE_COOKIE = "shuim_kakao_state";
    static final String CALLBACK_PATH = "/api/auth/kakao/callback";
    private static final Duration STATE_TTL = Duration.ofMinutes(5);
    private static final String AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
    private static final String TOKEN_URL = "https://kauth.kakao.com/oauth/token";
    private static final String ME_URL = "https://kapi.kakao.com/v2/user/me";

    private final JdbcClient jdbc;
    private final AuthService auth;
    private final PolicyConsentService policies;
    private final TransactionTemplate tx;
    private final RestClient http;
    private final String appOrigin;
    private final String clientId;
    private final String clientSecret;
    private final boolean secureCookie;

    public KakaoLoginService(JdbcClient jdbc, AuthService auth, PolicyConsentService policies, TransactionTemplate tx, RestClient.Builder builder,
                             @Value("${app.origin}") String appOrigin,
                             @Value("${app.kakao.client-id:}") String clientId,
                             @Value("${app.kakao.client-secret:}") String clientSecret,
                             @Value("${app.auth.secure-cookie:false}") boolean secureCookie) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.policies = policies;
        this.tx = tx;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory();
        factory.setReadTimeout(Duration.ofSeconds(15));
        this.http = builder.requestFactory(factory).build();
        this.appOrigin = appOrigin.replaceAll("/+$", "");
        this.clientId = clientId == null ? "" : clientId.strip();
        this.clientSecret = clientSecret == null ? "" : clientSecret.strip();
        this.secureCookie = secureCookie;
    }

    /** REST API 키가 있어야 켜진다. Client Secret 은 콘솔에서 "사용함"으로 켠 경우에만 넣는다 */
    public boolean configured() { return !clientId.isBlank(); }

    /** 카카오 콘솔에 등록하는 Redirect URI. 프론트 도메인(app.origin) 기준이라 콜백이 프록시를 거쳐 세션 쿠키가 프론트 출처에 남는다 */
    public String redirectUri() { return appOrigin + CALLBACK_PATH; }

    public URI appUri(String path) { return URI.create(appOrigin + path); }

    public URI failureUri() { return appUri("/auth?error=kakao"); }

    /* ---------- 1단계: 동의 화면으로 ---------- */

    /** state 를 만들어 쿠키에 두고 동의 화면 주소를 돌려준다 */
    public URI begin(HttpServletResponse res) {
        String state = Ids.randomHex(24);
        res.addHeader(HttpHeaders.SET_COOKIE, stateCookie(state, STATE_TTL).toString());
        return authorizationUri(state);
    }

    URI authorizationUri(String state) {
        return UriComponentsBuilder.fromUriString(AUTHORIZE_URL)
            .queryParam("client_id", clientId)
            .queryParam("redirect_uri", redirectUri())
            .queryParam("response_type", "code")
            .queryParam("state", state)
            .build().encode().toUri();
    }

    /** 경로를 /api/auth/kakao 로 좁혀 콜백에만 따라간다. 콜백은 카카오에서 오는 최상위 이동이라 SameSite=Lax 로도 전달된다 */
    private ResponseCookie stateCookie(String value, Duration maxAge) {
        return ResponseCookie.from(STATE_COOKIE, value).httpOnly(true).sameSite("Lax").secure(secureCookie).path("/api/auth/kakao").maxAge(maxAge).build();
    }

    /* ---------- 2단계: 콜백 ---------- */

    /** 콜백 처리. 성공하면 세션 쿠키를 내려주고 앱 홈(/?kakao=1)을, 실패하면 /auth?error=kakao 를 돌려준다 */
    public URI complete(HttpServletRequest req, HttpServletResponse res, String code, String state, String providerError) {
        String expected = readStateCookie(req);
        res.addHeader(HttpHeaders.SET_COOKIE, stateCookie("", Duration.ZERO).toString()); // 한 번 쓴 state 는 지운다
        if (expected == null || state == null
            || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), state.getBytes(StandardCharsets.UTF_8))) {
            log.warn("kakao login: state 불일치");
            return failureUri();
        }
        if (providerError != null || code == null || code.isBlank()) {
            log.info("kakao login: 동의 화면에서 돌아오지 못함 ({})", providerError);
            return failureUri();
        }
        try {
            Profile p = fetchProfile(code);
            String anonId = auth.currentUser(req).filter(DbUser::anonymous).map(DbUser::id).orElse(null);
            String userId = tx.execute(status -> findOrCreateUser(p, anonId));
            auth.switchSession(req, res, userId);
            return appUri("/?kakao=1");
        } catch (SignupConsentRequiredException e) {
            return appUri("/auth?mode=signup&provider=kakao");
        } catch (Exception e) {
            log.warn("kakao login failed: {}", e.toString());
            return failureUri();
        }
    }

    private static String readStateCookie(HttpServletRequest req) {
        Cookie[] cs = req.getCookies();
        if (cs == null) return null;
        for (Cookie c : cs) if (STATE_COOKIE.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) return c.getValue();
        return null;
    }

    /** 카카오 프로필: 회원번호(필수), 이메일(동의했고 인증된 경우만), 닉네임 */
    record Profile(String kakaoId, String email, String nick) {}

    private Profile fetchProfile(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("redirect_uri", redirectUri());
        form.add("code", code);
        if (!clientSecret.isBlank()) form.add("client_secret", clientSecret);
        JsonNode token = http.post().uri(TOKEN_URL).contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
        String accessToken = text(token, "access_token");
        if (accessToken == null) throw new IllegalStateException("카카오 액세스 토큰을 받지 못했어요");
        JsonNode me = http.get().uri(ME_URL).headers(h -> h.setBearerAuth(accessToken)).retrieve().body(JsonNode.class);
        return parseProfile(me);
    }

    /** /v2/user/me 응답에서 필요한 것만. 이메일은 is_email_valid·is_email_verified 가 모두 true 일 때만 믿는다 (남의 이메일을 선점하지 못하게) */
    static Profile parseProfile(JsonNode me) {
        String id = text(me, "id");
        if (id == null || id.isBlank()) throw new IllegalStateException("카카오 회원번호를 받지 못했어요");
        JsonNode account = me.path("kakao_account");
        String email = text(account, "email");
        if (email != null && !(account.path("is_email_valid").asBoolean(false) && account.path("is_email_verified").asBoolean(false))) email = null;
        String nick = text(me.path("properties"), "nickname");
        if (nick == null) nick = text(account.path("profile"), "nickname");
        return new Profile(id, email == null ? null : email.strip().toLowerCase(), nick == null || nick.isBlank() ? null : nick.strip());
    }

    static final class SignupConsentRequiredException extends RuntimeException {}

    /** Existing accounts keep their own consent. New accounts must upgrade the consenting anonymous session. */
    String findOrCreateUser(Profile p, String anonUserId) {
        Optional<String> existing = jdbc.sql("SELECT id FROM users WHERE kakao_id = ?").param(p.kakaoId()).query(String.class).optional();
        if (existing.isPresent()) return existing.get();
        if (!policies.hasSignupConsent(anonUserId)) throw new SignupConsentRequiredException();
        String nick = p.nick() == null || p.nick().length() < 2 ? null : (p.nick().length() > 12 ? p.nick().substring(0, 12) : p.nick());
        // 이미 이메일 계정이 쓰는 주소면 비워 둔다 (users.email UNIQUE)
        String email = p.email() != null && jdbc.sql("SELECT count(*) FROM users WHERE email = ?").param(p.email()).query(Long.class).single() == 0 ? p.email() : null;
        if (anonUserId != null) {
            int n = jdbc.sql("UPDATE users SET kakao_id = ?, email = COALESCE(?, email), nick = COALESCE(?, nick), is_anonymous = FALSE WHERE id = ? AND is_anonymous = TRUE")
                .param(p.kakaoId()).param(email).param(nick).param(anonUserId).update();
            if (n > 0) return anonUserId;
        }
        // If the consenting anonymous row changed concurrently, require another review instead of creating an unrelated account.
        throw new SignupConsentRequiredException();
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText(null);
    }
}
