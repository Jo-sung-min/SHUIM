package kr.co.shuim.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.Arrays;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/** 네트워크·DB 없이 확인할 수 있는 부분: 켜짐 여부, referrer, 응답 파싱, 콜백 인증, PEM 키 읽기 */
class TossLoginServiceTest {
    private static final ObjectMapper om = new ObjectMapper();

    private static TossLoginService svc(String cert, String key, String unlinkAuth) {
        return new TossLoginService(null, null, null, null, null, RestClient.builder(), cert, key, unlinkAuth, "https://apps-in-toss-api.toss.im/");
    }

    @Test
    void disabledWithoutCertificate() {
        assertFalse(svc("", "", "").configured());
        assertFalse(svc("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----", "nope", "").configured());
    }

    @Test
    void referrerIsDefaultOrSandbox() {
        assertEquals("DEFAULT", TossLoginService.normalizeReferrer("DEFAULT"));
        assertEquals("SANDBOX", TossLoginService.normalizeReferrer(" sandbox "));
        assertThrows(IllegalArgumentException.class, () -> TossLoginService.normalizeReferrer("PROD"));
        assertThrows(IllegalArgumentException.class, () -> TossLoginService.normalizeReferrer(null));
    }

    @Test
    void readsWrappedAndPlainResponses() throws Exception {
        assertEquals("tok", TossLoginService.successField(om.readTree("{\"resultType\":\"SUCCESS\",\"success\":{\"accessToken\":\"tok\"}}"), "accessToken"));
        assertEquals("443731104", TossLoginService.successField(om.readTree("{\"resultType\":\"SUCCESS\",\"success\":{\"userKey\":443731104}}"), "userKey"));
        assertEquals("1", TossLoginService.successField(om.readTree("{\"userKey\":1}"), "userKey"));
        assertNull(TossLoginService.successField(om.readTree("{\"error\":\"invalid_grant\"}"), "accessToken"));
    }

    @Test
    void unlinkNeedsTheConfiguredAuthorization() {
        assertFalse(svc("", "", "").unlinkAuthorized("Basic abc"));
        TossLoginService s = svc("", "", "Basic c29yb3c6c2VjcmV0");
        assertTrue(s.unlinkAuthorized("Basic c29yb3c6c2VjcmV0"));
        assertFalse(s.unlinkAuthorized("Basic wrong"));
        assertFalse(s.unlinkAuthorized(null));
    }

    @Test
    void readsPkcs8AndPkcs1RsaKeys() throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
        g.initialize(2048);
        RSAPrivateCrtKey key = (RSAPrivateCrtKey) g.generateKeyPair().getPrivate();
        byte[] pkcs8 = key.getEncoded();
        String pem8 = "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(pkcs8) + "\n-----END PRIVATE KEY-----\n";
        assertArrayEquals(pkcs8, TossLoginService.privateKey(pem8).getEncoded());

        // PKCS#8 의 마지막 OCTET STRING 내용이 PKCS#1 이다: 그것만 떼어 RSA PRIVATE KEY 로 감싸 본다
        byte[] pkcs1 = Arrays.copyOfRange(pkcs8, pkcs8.length - pkcs1Length(pkcs8), pkcs8.length);
        String pem1 = "-----BEGIN RSA PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(pkcs1) + "\n-----END RSA PRIVATE KEY-----";
        PrivateKey back = TossLoginService.privateKey(pem1);
        assertArrayEquals(pkcs8, back.getEncoded());
    }

    /** PKCS#8 = 30 len { 02 01 00, 30 0d …, 04 len pkcs1 } 에서 pkcs1 길이 */
    private static int pkcs1Length(byte[] pkcs8) {
        int i = 2 + ((pkcs8[1] & 0x80) != 0 ? (pkcs8[1] & 0x7f) : 0); // 바깥 SEQUENCE 머리
        i += 3 + 15; // version + AlgorithmIdentifier
        int lenByte = pkcs8[i + 1] & 0xff;
        if (lenByte < 0x80) return lenByte;
        int n = lenByte & 0x7f, len = 0;
        for (int k = 0; k < n; k++) len = (len << 8) | (pkcs8[i + 2 + k] & 0xff);
        return len;
    }
}
