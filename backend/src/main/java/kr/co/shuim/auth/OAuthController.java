package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Map;

@RestController
public class OAuthController {
    private final AuthService auth;
    private final KakaoLoginService kakao;

    public OAuthController(AuthService auth, KakaoLoginService kakao) {
        this.auth = auth;
        this.kakao = kakao;
    }

    /** GET /api/auth/providers — 어떤 소셜 로그인이 켜져 있는지 (프론트가 버튼을 보일지 결정) */
    @GetMapping("/api/auth/providers")
    public Map<String, Object> providers() {
        return Map.of("kakao", kakao.configured());
    }

    /** GET /api/auth/oauth/kakao?return=/auth?oauth=kakao — 카카오 동의 화면으로 보낸다 */
    @GetMapping("/api/auth/oauth/kakao")
    public ResponseEntity<Void> start(@RequestParam(name = "return", required = false) String returnTo, HttpServletRequest req) {
        if (!kakao.configured()) return redirect(kakao.failureUri("not_configured"));
        String anonId = auth.currentUser(req).filter(DbUser::anonymous).map(DbUser::id).orElse(null);
        return redirect(kakao.authorizationUri(returnTo, anonId));
    }

    /** GET /api/auth/oauth/kakao/callback?code&state — 카카오가 돌려보내는 곳. 세션 쿠키를 내려주고 앱으로 보낸다 */
    @GetMapping("/api/auth/oauth/kakao/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         @RequestParam(required = false) String error,
                                         HttpServletResponse res) {
        return redirect(kakao.complete(code, state, error, res));
    }

    private static ResponseEntity<Void> redirect(URI to) {
        return ResponseEntity.status(HttpStatus.FOUND).location(to).build();
    }
}
