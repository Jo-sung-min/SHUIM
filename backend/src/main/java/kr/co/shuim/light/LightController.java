package kr.co.shuim.light;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** 내 빛 지갑. 빛 주기는 랭킹·글 화면이 바로 갱신되도록 POST /api/community/light.give 로 받는다. */
@RestController
public class LightController {
    private final AuthService auth;
    private final LightService light;
    public LightController(AuthService auth, LightService light) { this.auth = auth; this.light = light; }

    /** GET /api/light/me → 잔액, 받은·건넨 합계, 오늘의 빛을 받았는지, 최근 내역 */
    @GetMapping("/api/light/me")
    public ResponseEntity<LightService.Account> me(HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인하면 빛을 모을 수 있어요."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(light.me(user));
    }

    /** POST /api/light/daily → 오늘의 빛 (하루 한 번) */
    @PostMapping("/api/light/daily")
    public ResponseEntity<LightService.Account> daily(HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인하면 오늘의 빛을 받을 수 있어요."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(light.claimDaily(user));
    }
}
