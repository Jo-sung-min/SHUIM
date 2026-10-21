package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
public class AuthController {
    private final AuthService auth;

    public AuthController(AuthService auth) { this.auth = auth; }

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

    /** GET /api/auth/me — 로그인한 계정(익명 제외)과 관리자 여부 */
    @GetMapping("/api/auth/me")
    public Map<String, Object> me(HttpServletRequest req) {
        Optional<DbUser> u = auth.currentUser(req);
        Map<String, Object> out = new HashMap<>();
        out.put("user", publicUser(u.orElse(null)));
        out.put("admin", auth.isAdmin(u.orElse(null)));
        out.put("configured", true);
        out.put("anonymousId", u.filter(DbUser::anonymous).map(DbUser::id).orElse(null));
        return out;
    }

    /** POST /api/auth/signup | login | logout | nick */
    @PostMapping("/api/auth/{action}")
    public Map<String, Object> post(@PathVariable String action, @RequestBody(required = false) Map<String, String> body,
                                    HttpServletRequest req, HttpServletResponse res) {
        Map<String, String> b = body == null ? Map.of() : body;
        String email = b.getOrDefault("email", "");
        String nick = b.getOrDefault("nick", "");
        String password = b.getOrDefault("password", "");
        switch (action) {
            case "signup" -> {
                DbUser u = auth.signUp(req, res, email, nick, password);
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
}
