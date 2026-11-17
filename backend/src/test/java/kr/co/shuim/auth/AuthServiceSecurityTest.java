package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** DB 없이: 입력 길이·이메일 검사(ReDoS), 닉네임 규칙, 로그인 실패 문구 통일과 이메일별 실패 제한 */
class AuthServiceSecurityTest {
    private static final Pattern OLD_EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    @Test
    void adversarialSignupInputsFinishFast() {
        String longEmail = "a@" + "a".repeat(100_000) + "!";
        String dotted = "a@" + "a.".repeat(126);
        assertTimeoutPreemptively(Duration.ofSeconds(1), () -> {
            assertEquals("이메일 형식을 확인해요.", AuthService.validateSignup(longEmail, "닉네임", "secret1"));
            AuthService.validateSignup(dotted, "닉네임", "secret1");
            assertNotNull(AuthService.validateSignup("a@b.co", "가".repeat(100_000), "secret1"));
            assertEquals("비밀번호는 128자 이하로 해요.", AuthService.validateSignup("a@b.co", "닉네임", "p".repeat(100_000)));
        });
    }

    @Test
    void emailCheckMatchesThePreviousRuleOnShortInputs() {
        for (String e : List.of("a@b.co", "a.b@c.d", "a@b.c.d", "a@.bc", "a@bc.", "a@b..c", "@b.co", "a@@b.co", "a@b@c.co",
            "a b@c.co", "a@bco", "a@b.c", "abc", "", "a@b\t.co", "a@.b.c", ".a@b.co", "a@b.c.")) {
            assertEquals(OLD_EMAIL.matcher(e).matches(), AuthService.validEmail(e), e);
        }
    }

    @Test
    void nicknameRules() {
        assertNull(AuthService.nickError("  새벽산책  "));
        assertNull(AuthService.nickError("blue cat"));
        assertEquals("닉네임은 2~12자로 해요.", AuthService.nickError(" a "));
        assertEquals("닉네임은 2~12자로 해요.", AuthService.nickError("열세글자가넘는닉네임입니다요"));
        for (String bad : List.of("닉​네임", "닉‮네임", "닉⁦네임", "닉\u0000네임", "ㅤㅤ", "닉﻿임")) {
            assertEquals("닉네임에 쓸 수 없는 문자가 들어 있어요.", AuthService.nickError(bad), bad);
        }
        for (String staff : List.of("운영자", "소로우 운영자", "관리자입니다", "소로우팀", "소로우 공식", "Admin", "A d m i n", "OFFICIAL", "sorow_bot", "소로우.공식")) {
            assertEquals("운영진으로 오해할 수 있는 닉네임은 쓸 수 없어요.", AuthService.nickError(staff), staff);
        }
    }

    @Test
    void updateNickUsesTheSameRules() {
        AuthService auth = new AuthService(mock(JdbcClient.class, RETURNS_DEEP_STUBS), true, 90);
        DbUser user = new DbUser("u1", "a@b.co", "예전", "user", false, null, null, 0);
        assertEquals("운영진으로 오해할 수 있는 닉네임은 쓸 수 없어요.", auth.updateNick(user, "관리자"));
        assertNull(auth.updateNick(user, "새 닉네임"));
    }

    @Test
    void unknownEmailGetsTheUniformMessageAndRepeatedFailuresAreThrottled() {
        // 조회 결과가 비어 있음 = 없는 이메일
        AuthService auth = new AuthService(mock(JdbcClient.class, RETURNS_DEEP_STUBS), true, 90);
        for (int i = 0; i < AuthService.LOGIN_MAX_FAILURES; i++) {
            ApiException e = assertThrows(ApiException.class, () -> auth.signIn(new MockHttpServletRequest(), new MockHttpServletResponse(), "Nobody@Example.com", "wrong-pw"));
            assertEquals(400, e.status());
            assertEquals(AuthService.LOGIN_FAILED, e.getMessage());
        }
        ApiException limited = assertThrows(ApiException.class, () -> auth.signIn(new MockHttpServletRequest(), new MockHttpServletResponse(), " nobody@example.com ", "wrong-pw"));
        assertEquals(429, limited.status());
        // 다른 이메일은 영향 없음
        assertEquals(400, assertThrows(ApiException.class, () -> auth.signIn(new MockHttpServletRequest(), new MockHttpServletResponse(), "other@example.com", "pw")).status());
    }

    @Test
    void oversizedLoginInputIsRejectedWithoutHashing() {
        AuthService auth = new AuthService(mock(JdbcClient.class, RETURNS_DEEP_STUBS), true, 90);
        assertTimeoutPreemptively(Duration.ofMillis(500), () -> {
            ApiException e = assertThrows(ApiException.class, () -> auth.signIn(new MockHttpServletRequest(), new MockHttpServletResponse(), "a".repeat(300), "pw"));
            assertEquals(AuthService.LOGIN_FAILED, e.getMessage());
        });
    }

    @Test
    void sessionCookieIsSecureByDefault() {
        AuthService auth = new AuthService(mock(JdbcClient.class, RETURNS_DEEP_STUBS), true, 90);
        MockHttpServletResponse res = new MockHttpServletResponse();
        auth.issueSession(res, "u1");
        assertTrue(res.getHeader("Set-Cookie").contains("Secure"));
    }
}
