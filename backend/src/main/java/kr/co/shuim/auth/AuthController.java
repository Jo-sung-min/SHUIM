package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.config.ApiException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
public class AuthController {
    private final AuthService auth;
    private final KakaoLoginService kakao;
    private final PolicyConsentService policies;

    public AuthController(AuthService auth, KakaoLoginService kakao, PolicyConsentService policies) {
        this.auth = auth;
        this.kakao = kakao;
        this.policies = policies;
    }

    static Map<String, Object> publicUser(DbUser u) {
        if (u == null || u.anonymous()) return null;
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.id());
        m.put("email", u.email());
        m.put("nick", u.nick());
        m.put("role", u.role());
        m.put("createdAt", u.createdAt());
        return m;
    }

    /** GET /api/auth/me — 로그인한 계정(익명 제외), 관리자 여부, 카카오 로그인이 켜져 있는지 */
    @GetMapping("/api/auth/me")
    public Map<String, Object> me(HttpServletRequest req) {
        Optional<DbUser> u = auth.currentUser(req);
        Map<String, Object> out = new HashMap<>();
        out.put("user", publicUser(u.orElse(null)));
        out.put("admin", auth.isAdmin(u.orElse(null)));
        out.put("configured", true);
        out.put("kakao", kakao.configured()); // KAKAO_CLIENT_ID 가 비어 있으면 false → 프론트가 버튼을 숨긴다
        out.put("anonymousId", u.filter(DbUser::anonymous).map(DbUser::id).orElse(null));
        return out;
    }

    /** POST /api/auth/signup | login | logout | nick */
    @PostMapping("/api/auth/{action}")
    @Transactional
    public Map<String, Object> post(@PathVariable String action, @RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest req, HttpServletResponse res) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String email = text(b, "email");
        String nick = text(b, "nick");
        String password = text(b, "password");
        switch (action) {
            case "signup" -> {
                String version = text(b, "signupConsentVersion");
                policies.validateVersion(version);
                if (!(b.get("aiDisclosureAccepted") instanceof Boolean aiAccepted)) {
                    throw ApiException.badRequest("AI 정보 제공 동의 여부를 선택해 주세요.");
                }
                DbUser u = auth.signUp(req, res, email, nick, password);
                policies.accept(u, version, aiAccepted);
                return Map.of("user", publicUser(u), "admin", auth.isAdmin(u));
            }
            case "login" -> {
                DbUser u = auth.signIn(req, res, email, password);
                return Map.of("user", publicUser(u), "admin", auth.isAdmin(u));
            }
            case "logout" -> {
                auth.signOut(req, res);
                return Map.of("ok", true);
            }
            case "nick" -> {
                DbUser u = auth.currentUser(req).orElse(null);
                if (u == null || u.anonymous()) throw ApiException.unauthorized("로그인이 필요해요");
                String err = auth.updateNick(u, nick);
                if (err != null) throw ApiException.badRequest(err);
                return Map.of("user", publicUser(u.withNick(nick.strip())));
            }
            default -> throw ApiException.notFound("not found");
        }
    }

    private static String text(Map<String, Object> body, String key) {
        return body.get(key) instanceof String value ? value : "";
    }
}
