package kr.co.shuim.ai;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class AdminAiController {
    private final AuthService auth;
    private final AiModelSettings settings;
    private final OpenAiClient client;

    public AdminAiController(AuthService auth, AiModelSettings settings, OpenAiClient client) {
        this.auth = auth; this.settings = settings; this.client = client;
    }
    public record ModelBody(String model) {}

    private void requireAdmin(HttpServletRequest request) {
        if (!auth.isAdmin(auth.currentUser(request).orElse(null)))
            throw ApiException.forbidden("관리자만 AI 모델을 설정할 수 있어요");
    }

    private ResponseEntity<Map<String, Object>> state() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
            Map.of("model", settings.model(), "configured", client.configured()));
    }

    @GetMapping("/api/admin/ai")
    public ResponseEntity<Map<String, Object>> get(HttpServletRequest request) {
        requireAdmin(request);
        return state();
    }

    @PutMapping("/api/admin/ai")
    public ResponseEntity<Map<String, Object>> update(@RequestBody ModelBody body, HttpServletRequest request) {
        requireAdmin(request);
        settings.save(body.model());
        return state();
    }
}
