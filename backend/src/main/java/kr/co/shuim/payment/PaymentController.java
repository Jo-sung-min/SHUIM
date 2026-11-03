package kr.co.shuim.payment;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class PaymentController {
    private final AuthService auth;
    private final CircleService circles;
    private final PaymentService payments;
    public PaymentController(AuthService auth, CircleService circles, PaymentService payments) {
        this.auth = auth; this.circles = circles; this.payments = payments;
    }
    public record Create(String communityId, String color, String platform, String requestId) {}
    public record Confirm(String orderId, String paymentKey, Integer amount) {}
    public record Ait(String orderId, String providerOrderId) {}
    public record Order(String orderId) {}

    @GetMapping("/api/beach/fire/catalog")
    public Map<String, Object> catalog(@RequestParam String communityId, @RequestParam String platform, HttpServletRequest request) {
        DbUser me = user(request); member(me, communityId); return payments.catalog(me, communityId, platform);
    }
    @PostMapping("/api/beach/fire/orders")
    public Map<String, Object> create(@RequestBody Create body, HttpServletRequest request) {
        DbUser me = user(request); member(me, body.communityId());
        return payments.create(me, body.communityId(), body.color(), body.platform(), body.requestId());
    }
    @GetMapping("/api/beach/fire/orders")
    public Map<String, Object> orders(@RequestParam String communityId, HttpServletRequest request) {
        DbUser me = user(request);
        if (communityId == null || communityId.isBlank()) throw ApiException.badRequest("소로우를 골라 주세요.");
        return Map.of("orders", payments.orders(me.id(), communityId));
    }
    @PostMapping("/api/beach/fire/payments/confirm")
    public Map<String, Object> confirm(@RequestBody Confirm body, HttpServletRequest request) {
        return payments.confirmWeb(user(request).id(), body.orderId(), body.paymentKey(), body.amount());
    }
    @PostMapping({"/api/beach/fire/payments/ait", "/api/beach/fire/payments/restore"})
    public Map<String, Object> ait(@RequestBody Ait body, HttpServletRequest request) {
        return payments.confirmAit(user(request).id(), body.orderId(), body.providerOrderId());
    }
    @PostMapping("/api/beach/fire/payments/reconcile")
    public Map<String, Object> reconcile(@RequestBody Order body, HttpServletRequest request) {
        return payments.reconcile(user(request).id(), body.orderId());
    }
    private DbUser user(HttpServletRequest request) {
        DbUser me = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인 후 결제를 이용해 주세요."));
        if (me.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        return me;
    }
    private void member(DbUser me, String communityId) {
        if (communityId == null || communityId.isBlank()) throw ApiException.badRequest("소로우를 골라 주세요.");
        var circle = circles.byId(communityId);
        if (circles.member(circle.id(), me.id()).filter(CircleService.Member::active).isEmpty()) throw ApiException.forbidden("이 소로우 멤버만 불씨팝을 이용할 수 있어요.");
    }
}
