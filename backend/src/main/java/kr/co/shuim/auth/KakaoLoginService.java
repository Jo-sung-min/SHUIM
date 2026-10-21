package kr.co.shuim.auth;

import com.fasterxml.jackson.databind.JsonNode;
import kr.co.shuim.common.Ids;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

/**
 * 카카오 로그인 (OAuth 2.0 인가 코드). 흐름:
 *   /api/auth/oauth/kakao → kauth.kakao.com 동의 화면 → redirect-uri(/api/auth/oauth/kakao/callback?code&state)
 *   → 토큰 교환 → kapi.kakao.com/v2/user/me → users.kakao_id 로 찾거나 만들고 세션 쿠키 발급 → 앱으로 돌아감.
 * 로그인 전 익명 유저로 활동하던 중이면 그 행을 카카오 계정으로 승격해 외침·힘내요가 이어진다.
 */
@Service
public class KakaoLoginService {
    private static final Logger log = LoggerFactory.getLogger(KakaoLoginService.class);
    private static final int STATE_TTL_MIN = 10;

    private final JdbcClient jdbc;
    private final AuthService auth;
    private final RestClient http;
    private final String appOrigin;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    public KakaoLoginService(JdbcClient jdbc, AuthService auth, RestClient.Builder builder,
                             @Value("${app.origin}") String appOrigin,
                             @Value("${app.oauth.kakao.client-id:}") String clientId,
                             @Value("${app.oauth.kakao.client-secret:}") String clientSecret,
                             @Value("${app.oauth.kakao.redirect-uri:}") String redirectUri) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.http = builder.build();
        this.appOrigin = appOrigin.replaceAll("/+$", "");
        this.clientId = clientId == null ? "" : clientId.strip();
        this.clientSecret = clientSecret == null ? "" : clientSecret.strip();
        this.redirectUri = redirectUri == null ? "" : redirectUri.strip();
    }

    public boolean configured() { return !clientId.isBlank() && !redirectUri.isBlank(); }

    /** 돌아갈 경로는 앱 안의 경로만 (열린 리다이렉트 방지) */
    static String safeReturnTo(String v) {
        if (v == null || v.isBlank() || !v.startsWith("/") || v.startsWith("//") || v.length() > 500) return "/";
        return v;
    }

    public URI appUri(String path) { return URI.create(appOrigin + path); }

    public URI failureUri(String reason) {
        return UriComponentsBuilder.fromUriString(appOrigin + "/auth").queryParam("oauthError", reason).build().encode().toUri();
    }

    /** 동의 화면 주소. state 를 DB 에 남겨 콜백에서 검증한다 */
    @Transactional
    public URI authorizationUri(String returnTo, String anonUserId) {
        String state = Ids.randomHex(24);
        jdbc.sql("INSERT INTO oauth_states (state, provider, return_to, anon_user_id, expires_at) VALUES (?, 'kakao', ?, ?, ?)")
            .param(state).param(safeReturnTo(returnTo)).param(anonUserId).param(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(STATE_TTL_MIN)).update();
        return UriComponentsBuilder.fromUriString("https://kauth.kakao.com/oauth/authorize")
            .queryParam("response_type", "code")
            .queryParam("client_id", clientId)
            .queryParam("redirect_uri", redirectUri)
            .queryParam("state", state)
            .build().encode().toUri();
    }

    private record State(String returnTo, String anonUserId) {}

    private Optional<State> consumeState(String state) {
        if (state == null || state.isBlank()) return Optional.empty();
        Optional<State> s = jdbc.sql("DELETE FROM oauth_states WHERE state = ? AND provider = 'kakao' AND expires_at > ? RETURNING return_to, anon_user_id")
            .param(state).param(LocalDateTime.now(ZoneOffset.UTC))
            .query((rs, i) -> new State(rs.getString("return_to"), rs.getString("anon_user_id"))).optional();
        jdbc.sql("DELETE FROM oauth_states WHERE expires_at < ?").param(LocalDateTime.now(ZoneOffset.UTC).minusHours(1)).update();
        return s;
    }

    private record Profile(String kakaoId, String email, String nick) {}

    private Profile fetchProfile(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("redirect_uri", redirectUri);
        form.add("code", code);
        if (!clientSecret.isBlank()) form.add("client_secret", clientSecret);
        JsonNode token = http.post().uri("https://kauth.kakao.com/oauth/token")
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
        String accessToken = text(token, "access_token");
        if (accessToken == null) throw new IllegalStateException("카카오 액세스 토큰을 받지 못했어요");
        JsonNode me = http.get().uri("https://kapi.kakao.com/v2/user/me")
            .headers(h -> h.setBearerAuth(accessToken)).retrieve().body(JsonNode.class);
        String id = text(me, "id");
        if (id == null || id.isBlank()) throw new IllegalStateException("카카오 회원번호를 받지 못했어요");
        JsonNode account = me.path("kakao_account");
        String email = text(account, "email");
        String nick = text(me.path("properties"), "nickname");
        if (nick == null) nick = text(account.path("profile"), "nickname");
        return new Profile(id, email == null ? null : email.strip().toLowerCase(), nick == null ? null : nick.strip());
    }

    /** 콜백 처리. 성공하면 세션 쿠키를 내려주고 돌아갈 앱 주소를, 실패하면 /auth?oauthError=… 를 돌려준다 */
    public URI complete(String code, String state, String providerError, jakarta.servlet.http.HttpServletResponse res) {
        Optional<State> st = consumeState(state);
        if (st.isEmpty()) return failureUri("invalid_state");
        if (providerError != null || code == null || code.isBlank()) return failureUri("cancelled");
        try {
            Profile p = fetchProfile(code);
            String userId = findOrCreateUser(p, st.get().anonUserId());
            auth.issueSession(res, userId);
            return appUri(st.get().returnTo());
        } catch (Exception e) {
            log.warn("kakao login failed: {}", e.toString());
            return failureUri("provider_failed");
        }
    }

    @Transactional
    protected String findOrCreateUser(Profile p, String anonUserId) {
        Optional<String> existing = jdbc.sql("SELECT id FROM users WHERE kakao_id = ?").param(p.kakaoId()).query(String.class).optional();
        if (existing.isPresent()) return existing.get();
        String nick = p.nick() == null || p.nick().length() < 2 ? null : (p.nick().length() > 12 ? p.nick().substring(0, 12) : p.nick());
        String email = p.email() != null && jdbc.sql("SELECT count(*) FROM users WHERE email = ?").param(p.email()).query(Long.class).single() == 0 ? p.email() : null;
        // 로그인 전 익명 유저로 쓰던 글·힘내요를 이어받도록 그 행을 승격
        if (anonUserId != null) {
            int n = jdbc.sql("UPDATE users SET kakao_id = ?, email = COALESCE(?, email), nick = COALESCE(?, nick), is_anonymous = FALSE WHERE id = ? AND is_anonymous = TRUE")
                .param(p.kakaoId()).param(email).param(nick).param(anonUserId).update();
            if (n > 0) return anonUserId;
        }
        String id = Ids.uid();
        jdbc.sql("INSERT INTO users (id, email, nick, role, is_anonymous, kakao_id) VALUES (?, ?, ?, 'user', FALSE, ?)")
            .param(id).param(email).param(nick == null ? kr.co.shuim.community.CommunityLogic.randomNick() : nick).param(p.kakaoId()).update();
        return id;
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText(null);
    }
}
