package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 앱인토스 미니앱의 토스 로그인과, 토스가 부르는 연결 끊기 콜백 */
@RestController
public class TossAuthController {
    private static final Logger log = LoggerFactory.getLogger(TossAuthController.class);
    private final TossLoginService toss;
    private final AuthService auth;

    public TossAuthController(TossLoginService toss, AuthService auth) {
        this.toss = toss;
        this.auth = auth;
    }

    /**
     * POST /api/auth/toss {authorizationCode, referrer} — 성공하면 {user, admin} 과 세션.
     * 처음 온 사람이 가입 안내에 아직 동의하지 않았으면 409 {consentRequired: true}: 동의 후 TossAuth.login() 을 다시 부른다
     */
    @PostMapping("/api/auth/toss")
    public ResponseEntity<Map<String, Object>> login(@RequestBody(required = false) Map<String, Object> body,
                                                     HttpServletRequest req, HttpServletResponse res) {
        if (!toss.configured()) return error(HttpStatus.SERVICE_UNAVAILABLE, "지금은 토스 로그인을 쓸 수 없어요.");
        Map<String, Object> b = body == null ? Map.of() : body;
        try {
            DbUser u = toss.login(req, res, text(b, "authorizationCode"), text(b, "referrer"));
            return ResponseEntity.ok(Map.of("user", AuthController.publicUser(u), "admin", auth.isAdmin(u)));
        } catch (TossLoginService.ConsentRequiredException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "가입 안내를 확인해 주세요.", "consentRequired", true));
        } catch (Exception e) {
            log.warn("toss login failed: {}", e.toString());
            return TossLoginService.isClientError(e)
                ? error(HttpStatus.BAD_REQUEST, "로그인 시간이 지났어요. 다시 시도해 주세요.")
                : error(HttpStatus.BAD_GATEWAY, "토스와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
    }

    /** GET /api/auth/toss/unlink?userKey&referrer — 콘솔에서 GET 으로 정한 경우 */
    @GetMapping("/api/auth/toss/unlink")
    public ResponseEntity<Map<String, Object>> unlinkGet(@RequestParam(required = false) String userKey,
                                                         @RequestParam(required = false) String referrer,
                                                         @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return unlink(userKey, referrer, authorization);
    }

    /** POST /api/auth/toss/unlink {userKey, referrer} — 콘솔에서 POST 로 정한 경우 */
    @PostMapping("/api/auth/toss/unlink")
    public ResponseEntity<Map<String, Object>> unlinkPost(@RequestBody(required = false) Map<String, Object> body,
                                                          @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        Map<String, Object> b = body == null ? Map.of() : body;
        return unlink(text(b, "userKey"), text(b, "referrer"), authorization);
    }

    /** UNLINK · WITHDRAWAL_TERMS · WITHDRAWAL_TOSS 모두 계정을 지운다. 없는 계정도 200 (토스가 다시 보내지 않게) */
    private ResponseEntity<Map<String, Object>> unlink(String userKey, String referrer, String authorization) {
        if (!toss.unlinkAuthorized(authorization)) return error(HttpStatus.UNAUTHORIZED, "unauthorized");
        toss.unlink(userKey, referrer);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    private static String text(Map<String, Object> b, String key) {
        Object v = b.get(key);
        return v == null ? null : String.valueOf(v);
    }
}
