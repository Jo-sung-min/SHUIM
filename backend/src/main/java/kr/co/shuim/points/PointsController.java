package kr.co.shuim.points;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PointsController {
    private final AuthService auth;
    private final PointsService points;
    public PointsController(AuthService auth, PointsService points) { this.auth = auth; this.points = points; }
    @GetMapping("/api/points/me")
    public PointsService.Account me(HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인하면 온기 포인트를 볼 수 있어요."));
        return points.me(user);
    }
}
