package kr.co.shuim.community;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/safety-reports")
public class SafetyReportController {
    private final AuthService auth;
    private final SafetyReportService reports;
    public SafetyReportController(AuthService auth, SafetyReportService reports) { this.auth = auth; this.reports = reports; }

    private DbUser current(HttpServletRequest req) {
        return auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인이 필요해요"));
    }

    private DbUser admin(HttpServletRequest req) {
        DbUser user = current(req);
        if (!auth.isAdmin(user)) throw ApiException.forbidden("관리자만 볼 수 있어요");
        return user;
    }

    @PostMapping
    public Map<String, Object> submit(@RequestBody Map<String, String> body, HttpServletRequest req) {
        String id = reports.submit(current(req), body.getOrDefault("kind", ""), body.get("targetId"), body.get("detail"));
        return Map.of("ok", true, "id", id);
    }

    @GetMapping
    public Map<String, List<SafetyReportService.Report>> list(HttpServletRequest req) {
        admin(req);
        return Map.of("reports", reports.list());
    }

    @PostMapping("/{id}/review")
    public Map<String, Object> review(@PathVariable String id, @RequestBody Map<String, String> body, HttpServletRequest req) {
        reports.review(admin(req), id, body.getOrDefault("action", ""));
        return Map.of("ok", true);
    }
}
