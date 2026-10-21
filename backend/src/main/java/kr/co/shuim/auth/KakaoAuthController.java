package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/** 카카오 로그인 두 엔드포인트. 둘 다 브라우저가 직접 이동하는 주소라 JSON 대신 302 로 답한다 */
@RestController
public class KakaoAuthController {
    private final KakaoLoginService kakao;

    public KakaoAuthController(KakaoLoginService kakao) { this.kakao = kakao; }

    /** GET /api/auth/kakao — state 쿠키를 심고 카카오 동의 화면으로. 키가 없으면 /auth?error=kakao */
    @GetMapping("/api/auth/kakao")
    public ResponseEntity<Void> start(HttpServletResponse res) {
        if (!kakao.configured()) return redirect(kakao.failureUri());
        return redirect(kakao.begin(res));
    }

    /** GET /api/auth/kakao/callback?code&state — 카카오가 돌려보내는 곳. 세션 쿠키를 내려주고 앱으로 보낸다 */
    @GetMapping("/api/auth/kakao/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         @RequestParam(required = false) String error,
                                         HttpServletRequest req, HttpServletResponse res) {
        return redirect(kakao.complete(req, res, code, state, error));
    }

    private static ResponseEntity<Void> redirect(URI to) {
        return ResponseEntity.status(HttpStatus.FOUND).location(to).build();
    }
}
