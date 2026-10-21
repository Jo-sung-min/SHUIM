package kr.co.shuim.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Node 시절(crypto.scryptSync(pw, saltHex, 64))에 만든 비밀번호 해시가 Java 에서도 같은 값으로 나와야 기존 계정이 로그인된다 */
class AuthServiceHashTest {
    @Test
    void scryptMatchesNodeScryptSync() {
        // node -e "const c=require('crypto'); console.log(c.scryptSync('shuim-test-pw!', '91179ea5ba3098fb84ac8b207dd47afd', 64).toString('hex'))"
        String expected = "11b1cb0f687a7681cb0426688da99fd63336a3391edd20d550a1964719e39642b9f3331cc3256bc23ead81e9e61c3eba9eb869da2aad3172cabd54ceff03cffe";
        assertEquals(expected, AuthService.hashPassword("shuim-test-pw!", "91179ea5ba3098fb84ac8b207dd47afd"));
    }

    @Test
    void sha256Hex() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", AuthService.sha256("abc"));
    }
}
