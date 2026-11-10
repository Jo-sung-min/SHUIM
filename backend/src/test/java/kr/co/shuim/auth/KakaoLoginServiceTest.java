package kr.co.shuim.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.points.FireworkTicketService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.*;

/** 네트워크·DB 없이 확인할 수 있는 부분: 켜짐 여부, Redirect URI, 동의 화면 주소, 프로필 파싱 */
class KakaoLoginServiceTest {
    private static final ObjectMapper om = new ObjectMapper();

    private static KakaoLoginService svc(String clientId) {
        return new KakaoLoginService(null, null, null, null, null, RestClient.builder(), "https://sorow.co.kr/", clientId, "", true);
    }

    private final JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    private final PolicyConsentService policies = mock(PolicyConsentService.class);
    private final FireworkTicketService tickets = mock(FireworkTicketService.class);
    private final KakaoLoginService.Profile profile = new KakaoLoginService.Profile("kakao-1", null, "새친구");

    private KakaoLoginService signupService() {
        TransactionTemplate tx = new TransactionTemplate(mock(PlatformTransactionManager.class));
        return new KakaoLoginService(jdbc, null, policies, tickets, tx, RestClient.builder(), "https://sorow.co.kr/", "k", "", true);
    }

    private void kakaoIdExists(Optional<String> id) {
        when(jdbc.sql(startsWith("SELECT id FROM users")).param(any()).query(String.class).optional()).thenReturn(id);
    }

    private void upgradesAnonymousRow() {
        when(policies.hasSignupConsent("anon-1")).thenReturn(true);
        when(jdbc.sql(startsWith("UPDATE users")).param(any()).param(any()).param(any()).param(any()).update()).thenReturn(1);
    }

    @Test
    void newKakaoSignupGetsTickets() {
        kakaoIdExists(Optional.empty());
        upgradesAnonymousRow();
        assertEquals("anon-1", signupService().signIn(profile, "anon-1"));
        verify(tickets).grantKakaoSignup("anon-1");
    }

    @Test
    void returningKakaoLoginGetsNoTickets() {
        kakaoIdExists(Optional.of("user-1"));
        assertEquals("user-1", signupService().signIn(profile, "anon-1"));
        verifyNoInteractions(tickets);
    }

    @Test
    void ticketFailureDoesNotBlockSignup() {
        kakaoIdExists(Optional.empty());
        upgradesAnonymousRow();
        when(tickets.grantKakaoSignup("anon-1")).thenThrow(new IllegalStateException("db"));
        assertEquals("anon-1", signupService().signIn(profile, "anon-1"));
    }

    @Test
    void disabledWithoutClientId() {
        assertFalse(svc("").configured());
        assertFalse(svc(" ").configured());
        assertTrue(svc("rest-api-key").configured());
    }

    @Test
    void redirectUriFollowsAppOrigin() {
        assertEquals("https://sorow.co.kr/api/auth/kakao/callback", svc("k").redirectUri());
        assertEquals("https://sorow.co.kr/auth?error=kakao", svc("k").failureUri().toString());
    }

    @Test
    void authorizationUriHasRequiredParams() {
        String u = svc("rest-api-key").authorizationUri("st4te").toString();
        assertTrue(u.startsWith("https://kauth.kakao.com/oauth/authorize?"), u);
        assertTrue(u.contains("client_id=rest-api-key"), u);
        assertTrue(u.contains("redirect_uri=https://sorow.co.kr/api/auth/kakao/callback"), u);
        assertTrue(u.contains("response_type=code"), u);
        assertTrue(u.contains("state=st4te"), u);
    }

    @Test
    void parseProfileKeepsOnlyVerifiedEmail() throws Exception {
        JsonNode verified = om.readTree("""
            {"id": 1234567890, "properties": {"nickname": "소로우"},
             "kakao_account": {"email": "Me@Example.com", "is_email_valid": true, "is_email_verified": true}}""");
        KakaoLoginService.Profile p = KakaoLoginService.parseProfile(verified);
        assertEquals("1234567890", p.kakaoId());
        assertEquals("me@example.com", p.email());
        assertEquals("소로우", p.nick());

        JsonNode unverified = om.readTree("""
            {"id": 42, "kakao_account": {"email": "x@example.com", "is_email_valid": true, "is_email_verified": false,
             "profile": {"nickname": "닉"}}}""");
        KakaoLoginService.Profile q = KakaoLoginService.parseProfile(unverified);
        assertEquals("42", q.kakaoId());
        assertNull(q.email());
        assertEquals("닉", q.nick());
    }

    @Test
    void parseProfileWithoutIdFails() throws Exception {
        JsonNode noId = om.readTree("{\"kakao_account\": {}}");
        assertThrows(IllegalStateException.class, () -> KakaoLoginService.parseProfile(noId));
    }
}
