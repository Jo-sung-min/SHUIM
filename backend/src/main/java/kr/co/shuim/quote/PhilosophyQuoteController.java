package kr.co.shuim.quote;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 조회까지 관리자 전용이다. 일반 사용자는 선택된 문구를 AI 응답에서만 만난다. */
@RestController
public class PhilosophyQuoteController {
    private final AuthService auth;
    private final PhilosophyQuoteService quotes;

    public PhilosophyQuoteController(AuthService auth, PhilosophyQuoteService quotes) { this.auth = auth; this.quotes = quotes; }

    public record Usage(Object enabled, Long expectedUpdatedAt) {}

    private DbUser requireAdmin(HttpServletRequest request) {
        DbUser user = auth.currentUser(request).orElse(null);
        if (!auth.isAdmin(user)) throw ApiException.forbidden("관리자만 명언을 검수할 수 있어요");
        return user;
    }

    @GetMapping("/api/admin/quotes")
    public Map<String, List<PhilosophyQuoteService.Quote>> list(HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("quotes", quotes.list());
    }

    @PostMapping("/api/admin/quotes")
    public Map<String, PhilosophyQuoteService.Quote> create(@RequestBody(required = false) PhilosophyQuoteService.Content body,
                                                          HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("quote", quotes.create(body));
    }

    @PutMapping("/api/admin/quotes/{id}")
    public Map<String, PhilosophyQuoteService.Quote> update(@PathVariable String id,
            @RequestBody(required = false) PhilosophyQuoteService.Content body, HttpServletRequest request) {
        requireAdmin(request);
        return Map.of("quote", quotes.update(id, body));
    }

    @PatchMapping("/api/admin/quotes/{id}/usage")
    public Map<String, PhilosophyQuoteService.Quote> usage(@PathVariable String id, @RequestBody(required = false) Usage body,
                                                         HttpServletRequest request) {
        DbUser user = requireAdmin(request);
        if (body == null || !(body.enabled() instanceof Boolean enabled)) throw ApiException.badRequest("사용 여부를 선택해 주세요");
        return Map.of("quote", quotes.setUsage(id, enabled, user.id(), body.expectedUpdatedAt()));
    }
}
