package kr.co.shuim.outing;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/outings")
public class OutingController {
    private final AuthService auth;
    private final OutingService outings;
    public OutingController(AuthService auth, OutingService outings) { this.auth = auth; this.outings = outings; }
    private String user(HttpServletRequest request) {
        return auth.currentUser(request).filter(u -> !u.anonymous() && !u.blocked())
            .orElseThrow(() -> ApiException.unauthorized("로그인하면 함께한 날과 추억을 간직할 수 있어요.")).id();
    }
    private <T> ResponseEntity<T> result(T data) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data); }
    @GetMapping public ResponseEntity<OutingService.View> get(HttpServletRequest r) { return result(outings.get(user(r))); }
    @PostMapping("/start") public ResponseEntity<OutingService.Session> start(@RequestBody OutingService.StartInput body, HttpServletRequest r) { return result(outings.start(user(r), body)); }
    @PostMapping("/complete") public ResponseEntity<OutingService.View> complete(@RequestBody OutingService.CompleteInput body, HttpServletRequest r) { return result(outings.complete(user(r), body)); }
}
