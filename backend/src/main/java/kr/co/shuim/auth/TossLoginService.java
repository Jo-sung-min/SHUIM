package kr.co.shuim.auth;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 앱인토스 미니앱의 토스 로그인 (서버 쪽). 흐름:
 *   미니앱이 TossAuth.login() 으로 받은 authorizationCode·referrer 를 POST /api/auth/toss 로 보냄
 *   → mTLS 로 generate-token → login-me 로 userKey → users.toss_user_key 로 찾거나, 가입 동의한 익명 행을 승격 → 세션 발급.
 * 토스 AccessToken 은 userKey 를 읽는 데만 쓰고 저장하지 않는다. 이름·전화번호 같은 개인정보는 요청하지 않는다.
 * 인증서(TOSS_MTLS_CERT·KEY)가 없으면 configured() 가 false 이고 /api/auth/me 가 toss: false 를 내린다.
 * 연결 끊기 콜백(unlink)은 콘솔에 넣은 Basic 인증 값이 맞을 때만 그 계정을 지운다.
 */
@Service
public class TossLoginService {
    private static final Logger log = LoggerFactory.getLogger(TossLoginService.class);
    private static final String TOKEN_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
    private static final String ME_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";

    private final JdbcClient jdbc;
    private final AuthService auth;
    private final PolicyConsentService policies;
    private final AccountDeletionService accounts;
    private final TransactionTemplate tx;
    private final RestClient http;
    private final String apiBase;
    private final String unlinkAuth;

    public TossLoginService(JdbcClient jdbc, AuthService auth, PolicyConsentService policies, AccountDeletionService accounts,
                            TransactionTemplate tx, RestClient.Builder builder,
                            @Value("${app.toss.mtls-cert:}") String cert,
                            @Value("${app.toss.mtls-key:}") String key,
                            @Value("${app.toss.unlink-basic-auth:}") String unlinkAuth,
                            @Value("${app.toss.api-base:https://apps-in-toss-api.toss.im}") String apiBase) {
        this.jdbc = jdbc;
        this.auth = auth;
        this.policies = policies;
        this.accounts = accounts;
        this.tx = tx;
        this.apiBase = apiBase.replaceAll("/+$", "");
        this.unlinkAuth = unlinkAuth == null ? "" : unlinkAuth.strip();
        this.http = mtlsClient(builder, cert, key);
    }

    /** 인증서와 키를 읽지 못하면 null (토스 로그인 꺼짐). 잘못 넣은 값은 시작할 때 경고로 남긴다 */
    private static RestClient mtlsClient(RestClient.Builder builder, String cert, String key) {
        if (cert == null || cert.isBlank() || key == null || key.isBlank()) return null;
        try {
            HttpClient client = HttpClient.newBuilder().sslContext(sslContext(pem(cert), pem(key))).connectTimeout(Duration.ofSeconds(10)).build();
            JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
            factory.setReadTimeout(Duration.ofSeconds(15));
            return builder.requestFactory(factory).build();
        } catch (Exception e) {
            log.warn("toss login: mTLS 인증서를 읽지 못해 토스 로그인을 끕니다 ({})", e.toString());
            return null;
        }
    }

    public boolean configured() { return http != null; }

    /* ---------- 로그인 ---------- */

    static final class ConsentRequiredException extends RuntimeException {}

    /** 인가 코드로 로그인한다. 처음 오는 사람이 가입 동의를 아직 안 했으면 ConsentRequiredException */
    public DbUser login(HttpServletRequest req, HttpServletResponse res, String code, String referrer) {
        if (!configured()) throw new IllegalStateException("토스 로그인이 꺼져 있어요");
        String userKey = fetchUserKey(code, normalizeReferrer(referrer));
        String anonId = auth.currentUser(req).filter(DbUser::anonymous).map(DbUser::id).orElse(null);
        String userId = tx.execute(status -> findOrCreateUser(userKey, anonId));
        auth.switchSession(req, res, userId);
        return jdbc.sql("SELECT * FROM users WHERE id = ?").param(userId).query(DbUser.MAPPER).single();
    }

    /** 샌드박스 앱은 소문자로 줄 때가 있어 대문자로 맞춘다. 그 밖의 값은 받지 않는다 */
    static String normalizeReferrer(String referrer) {
        String r = referrer == null ? "" : referrer.strip().toUpperCase();
        if (!r.equals("DEFAULT") && !r.equals("SANDBOX")) throw new IllegalArgumentException("referrer");
        return r;
    }

    private String fetchUserKey(String code, String referrer) {
        if (code == null || code.isBlank() || code.length() > 512) throw new IllegalArgumentException("authorizationCode");
        JsonNode token = http.post().uri(apiBase + TOKEN_PATH).contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("authorizationCode", code, "referrer", referrer)).retrieve().body(JsonNode.class);
        String accessToken = successField(token, "accessToken");
        if (accessToken == null) throw new IllegalStateException("토스 AccessToken 을 받지 못했어요: " + errorOf(token));
        JsonNode me = http.get().uri(apiBase + ME_PATH).headers(h -> h.setBearerAuth(accessToken)).retrieve().body(JsonNode.class);
        String userKey = successField(me, "userKey");
        if (userKey == null || !userKey.matches("\\d{1,32}")) throw new IllegalStateException("토스 userKey 를 받지 못했어요: " + errorOf(me));
        return userKey;
    }

    /** 응답은 {resultType:"SUCCESS", success:{…}} 모양. 감싸지 않은 응답도 받아 준다 */
    static String successField(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode body = node.has("success") ? node.get("success") : node;
        JsonNode v = body.get(field);
        return v == null || v.isNull() ? null : v.asText(null);
    }

    private static String errorOf(JsonNode node) {
        if (node == null) return "빈 응답";
        JsonNode e = node.get("error");
        return e == null ? node.path("resultType").asText("알 수 없음") : e.toString();
    }

    /** 이미 연결한 계정이면 그대로. 새 계정은 가입 동의한 익명 행을 승격한다 (카카오와 같은 규칙) */
    String findOrCreateUser(String userKey, String anonUserId) {
        Optional<String> existing = jdbc.sql("SELECT id FROM users WHERE toss_user_key = ?").param(userKey).query(String.class).optional();
        if (existing.isPresent()) return existing.get();
        if (!policies.hasSignupConsent(anonUserId)) throw new ConsentRequiredException();
        int n = jdbc.sql("UPDATE users SET toss_user_key = ?, is_anonymous = FALSE WHERE id = ? AND is_anonymous = TRUE")
            .param(userKey).param(anonUserId).update();
        if (n > 0) return anonUserId;
        throw new ConsentRequiredException();
    }

    /* ---------- 연결 끊기 콜백 ---------- */

    /** 콘솔에 넣은 Authorization 값과 같을 때만 true. 값을 정하지 않았으면 콜백을 받지 않는다 */
    public boolean unlinkAuthorized(String authorization) {
        if (unlinkAuth.isBlank() || authorization == null) return false;
        return MessageDigest.isEqual(unlinkAuth.getBytes(StandardCharsets.UTF_8), authorization.strip().getBytes(StandardCharsets.UTF_8));
    }

    /** 토스에서 연결을 끊거나 약관 동의를 철회하거나 토스를 떠나면 그 사람의 소로우 계정을 지운다 */
    public boolean unlink(String userKey, String reason) {
        if (userKey == null || !userKey.strip().matches("\\d{1,32}")) return false;
        Optional<String> id = jdbc.sql("SELECT id FROM users WHERE toss_user_key = ?").param(userKey.strip()).query(String.class).optional();
        if (id.isEmpty()) return false;
        boolean deleted = accounts.deleteAccount(id.get());
        log.info("toss unlink: {} ({})", deleted ? "계정 삭제" : "이미 없음", reason);
        return deleted;
    }

    /** 토스 API 의 4xx 는 코드가 만료되었거나 이미 쓴 경우 (invalid_grant) */
    static boolean isClientError(Exception e) {
        return e instanceof RestClientResponseException r && r.getStatusCode().is4xxClientError()
            || e instanceof IllegalArgumentException;
    }

    /* ---------- PEM ---------- */

    /** 값이 PEM 내용이면 그대로, 아니면 파일 경로로 읽는다 (환경변수에 줄바꿈을 \n 으로 넣어도 된다) */
    static String pem(String value) throws Exception {
        String v = value.strip();
        if (v.contains("-----BEGIN")) return v.replace("\\n", "\n");
        return Files.readString(Path.of(v));
    }

    static SSLContext sslContext(String certPem, String keyPem) throws Exception {
        Certificate[] chain = CertificateFactory.getInstance("X.509")
            .generateCertificates(new ByteArrayInputStream(certPem.getBytes(StandardCharsets.US_ASCII))).toArray(Certificate[]::new);
        if (chain.length == 0) throw new IllegalArgumentException("인증서가 비어 있어요");
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        char[] pw = new char[0];
        ks.setKeyEntry("toss", privateKey(keyPem), pw, chain);
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, pw);
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(kmf.getKeyManagers(), null, null);
        return ctx;
    }

    private static final Pattern PEM_BLOCK = Pattern.compile("-----BEGIN ([A-Z ]+)-----([A-Za-z0-9+/=\\s]+)-----END \\1-----");

    /** PKCS#8(BEGIN PRIVATE KEY, RSA·EC) 과 PKCS#1(BEGIN RSA PRIVATE KEY) 을 읽는다 */
    static PrivateKey privateKey(String pem) throws Exception {
        Matcher m = PEM_BLOCK.matcher(pem);
        while (m.find()) {
            String type = m.group(1);
            byte[] der = Base64.getMimeDecoder().decode(m.group(2));
            if (type.equals("RSA PRIVATE KEY")) return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(pkcs1ToPkcs8(der)));
            if (type.equals("PRIVATE KEY")) {
                for (String alg : new String[]{"RSA", "EC"}) {
                    try {
                        return KeyFactory.getInstance(alg).generatePrivate(new PKCS8EncodedKeySpec(der));
                    } catch (Exception ignored) { /* 다음 알고리즘 */ }
                }
            }
        }
        throw new IllegalArgumentException("개인 키를 찾지 못했어요 (PKCS#8 또는 RSA PKCS#1 PEM)");
    }

    /** PrivateKeyInfo { version 0, AlgorithmIdentifier rsaEncryption NULL, OCTET STRING pkcs1 } */
    static byte[] pkcs1ToPkcs8(byte[] pkcs1) {
        byte[] head = {0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00};
        byte[] octet = der(0x04, pkcs1);
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.writeBytes(head);
        body.writeBytes(octet);
        return der(0x30, body.toByteArray());
    }

    private static byte[] der(int tag, byte[] content) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(tag);
        int len = content.length;
        if (len < 0x80) out.write(len);
        else {
            int bytes = len > 0xffffff ? 4 : len > 0xffff ? 3 : len > 0xff ? 2 : 1;
            out.write(0x80 | bytes);
            for (int i = bytes - 1; i >= 0; i--) out.write(len >>> (8 * i));
        }
        out.writeBytes(content);
        return out.toByteArray();
    }
}
