package kr.co.shuim.points;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FireworkTicketController {
    private final AuthService auth;
    private final FireworkTicketService tickets;
    public FireworkTicketController(AuthService auth, FireworkTicketService tickets) { this.auth = auth; this.tickets = tickets; }
    public record BuyBody(String requestId) {}

    /** GET /api/fireworks/me → 이용권·포인트 잔액, 오늘 멋져요 보낸 기업, 최근 내역 */
    @GetMapping("/api/fireworks/me")
    public ResponseEntity<FireworkTicketService.Account> me(HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인하면 폭죽 이용권을 볼 수 있어요."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(tickets.me(user));
    }

    /** POST /api/fireworks/tickets/buy { requestId } → 온기 포인트 1,000 P 로 이용권 1장 */
    @PostMapping("/api/fireworks/tickets/buy")
    public ResponseEntity<FireworkTicketService.Purchase> buy(@RequestBody(required = false) BuyBody body, HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 이용권을 살 수 있어요."));
        if (body == null) throw ApiException.badRequest("구매 요청을 다시 시도해 주세요.");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(tickets.buy(user, body.requestId()));
    }
}
