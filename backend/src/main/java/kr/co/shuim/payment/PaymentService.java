package kr.co.shuim.payment;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.beach.BeachFireService;
import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;

@Service
public class PaymentService {
    public static final int PRICE = 1000;
    public static final long INTENT_WINDOW_MS = 30 * 60_000L;
    public static final Map<String, String> COLORS = Map.of("rose", "로즈빛", "aurora", "오로라", "ocean", "블루 웨이브", "violet", "라벤더");
    private static final List<String> COLOR_ORDER = List.of("rose", "aurora", "ocean", "violet");
    private final PaymentRepository repository;
    private final PaymentProviders providers;
    private final BeachFireService fire;
    private final LongSupplier clock;
    private final boolean salesEnabled;

    @Autowired
    public PaymentService(PaymentRepository repository, PaymentProviders providers, BeachFireService fire,
                          @Value("${app.payments.sales-enabled:false}") boolean salesEnabled) {
        this(repository, providers, fire, System::currentTimeMillis, salesEnabled);
    }
    PaymentService(PaymentRepository repository, PaymentProviders providers, BeachFireService fire, LongSupplier clock, boolean salesEnabled) {
        this.repository = repository; this.providers = providers; this.fire = fire; this.clock = clock; this.salesEnabled = salesEnabled;
    }

    public Map<String, Object> catalog(DbUser user, String communityId, String platform) {
        platform(platform);
        String reason = unavailableReason(user, platform);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("price", PRICE); result.put("currency", "KRW"); result.put("durationHours", 24);
        result.put("available", reason == null);
        if (reason != null) result.put("reason", reason);
        result.put("products", !salesEnabled ? List.of() : COLOR_ORDER.stream().map(color -> {
            Map<String, Object> product = new LinkedHashMap<>();
            product.put("color", color); product.put("name", COLORS.get(color) + " 불씨팝"); product.put("price", PRICE);
            if ("ait".equals(platform) && providers.sku(color) != null && !providers.sku(color).isBlank()) product.put("sku", providers.sku(color));
            return product;
        }).toList());
        result.put("fire", fire.snapshot(communityId));
        return result;
    }

    public Map<String, Object> create(DbUser user, String communityId, String color, String platform, String requestId) {
        platform(platform);
        if (!COLORS.containsKey(color == null ? "" : color)) throw ApiException.badRequest("불씨팝 색을 골라 주세요.");
        UUID request = requestId(requestId);
        String reason = unavailableReason(user, platform);
        if (reason != null) throw ApiException.unavailable(reason);
        long now = clock.getAsLong();
        String sku = "ait".equals(platform) ? providers.sku(color) : null;
        PaymentOrder order = repository.create(new PaymentOrder("fire_" + UUID.randomUUID(), user.id(), communityId, platform, color,
            PRICE, sku, request, null, null, "CREATED", now, now, null, null));
        if (!communityId.equals(order.communityId()) || !color.equals(order.color()) || !platform.equals(order.provider())) {
            throw new ApiException(409, "같은 요청 번호로 다른 주문을 만들 수 없어요.");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderId", order.id()); out.put("provider", order.provider()); out.put("color", order.color()); out.put("amount", order.amount());
        out.put("status", order.status()); out.put("intentExpiresAt", order.createdAt() + INTENT_WINDOW_MS);
        if (order.providerOrderId() != null) out.put("providerOrderId", order.providerOrderId());
        if (order.paymentKey() != null) out.put("paymentKey", order.paymentKey());
        if (order.providerOrderId() != null || order.paymentKey() != null) out.put("recoveryRequired", true);
        if ("PAID".equals(order.status())) out.put("result", fulfilled(order));
        out.put("orderName", COLORS.get(order.color()) + " 불씨팝 · 24시간");
        if ("web".equals(platform)) {
            out.put("clientKey", providers.clientKey());
            out.put("customerKey", "sorow_" + digest(user.id()).substring(0, 40));
        } else out.put("sku", order.sku());
        var snapshot = fire.snapshot(communityId);
        out.put("expectedStartAt", order.startsAt() != null ? order.startsAt() : Math.max(now, snapshot.queueEndsAt() == null ? now : snapshot.queueEndsAt()));
        return out;
    }

    public Map<String, Object> confirmWeb(String userId, String orderId, String paymentKey, Integer amount) {
        PaymentOrder order = owned(userId, orderId);
        requireProvider(order, "web");
        if (amount == null || amount != PRICE || amount != order.amount()) throw ApiException.badRequest("주문 금액이 일치하지 않아요.");
        identifier(paymentKey, "결제 키");
        if (order.paymentKey() != null && !order.paymentKey().equals(paymentKey)) throw new ApiException(409, "다른 결제 키가 연결된 주문이에요.");
        if ("PAID".equals(order.status())) return fulfilled(order);
        terminal(order);
        if (!providers.configured("web")) throw ApiException.unavailable("웹 결제가 아직 준비되지 않았어요.");
        // Persist the attempted key before HTTP, so approval-with-lost-response survives a restart.
        try {
            order = repository.locked(order.id(), current -> {
                own(current, userId);
                terminal(current);
                if (current.paymentKey() != null && !current.paymentKey().equals(paymentKey)) throw new ApiException(409, "이미 다른 결제 키로 확인 중인 주문이에요.");
                PaymentOrder attempted = current.change(current.status(), current.providerOrderId(), paymentKey, current.startsAt(), current.expiresAt(), clock.getAsLong());
                repository.save(attempted);
                return attempted;
            });
        } catch (DuplicateKeyException duplicate) { throw new ApiException(409, "이미 다른 주문에 연결된 결제예요."); }
        // While sales are off, only recover an already approved payment; never start a new charge.
        PaymentProviders.Verified verified = providers.web(order, paymentKey, salesEnabled);
        return result(finish(order, verified));
    }

    public Map<String, Object> confirmAit(String userId, String orderId, String providerOrderId) {
        PaymentOrder order = owned(userId, orderId);
        requireProvider(order, "ait");
        identifier(providerOrderId, "앱인토스 주문 번호");
        if (order.providerOrderId() != null && !order.providerOrderId().equals(providerOrderId)) throw new ApiException(409, "다른 영수증이 연결된 주문이에요.");
        if ("PAID".equals(order.status())) return fulfilled(order);
        terminal(order);
        if (!providers.configured("ait")) throw ApiException.unavailable("앱인토스 결제가 아직 준비되지 않았어요.");
        try {
            order = repository.locked(order.id(), current -> {
                own(current, userId); terminal(current);
                if (current.providerOrderId() != null && !current.providerOrderId().equals(providerOrderId)) throw new ApiException(409, "이미 다른 영수증을 확인 중인 주문이에요.");
                var attempted = current.change(current.status(), providerOrderId, null, current.startsAt(), current.expiresAt(), clock.getAsLong());
                repository.save(attempted); return attempted;
            });
        } catch (DuplicateKeyException duplicate) { throw new ApiException(409, "이미 다른 주문에 연결된 영수증이에요."); }
        if ("PAID".equals(order.status())) return fulfilled(order);
        PaymentProviders.Verified verified;
        try { verified = providers.ait(order, providerOrderId); }
        catch (ApiException invalid) {
            if (invalid.status() == 400 || invalid.status() == 409) {
                // An invalid SKU/date/receipt must not permanently reserve somebody else's valid receipt.
                repository.locked(order.id(), current -> {
                    if ("CREATED".equals(current.status()) && providerOrderId.equals(current.providerOrderId())) {
                        repository.save(current.change("CREATED", null, null, null, null, clock.getAsLong()));
                    }
                    return null;
                });
            }
            throw invalid;
        }
        return result(finish(order, verified));
    }

    public List<Map<String, Object>> orders(String userId, String communityId) {
        return repository.list(userId, communityId).stream().map(order -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("orderId", order.id()); out.put("provider", order.provider()); out.put("color", order.color());
            out.put("status", order.status()); out.put("amount", order.amount()); out.put("createdAt", order.createdAt());
            if (order.sku() != null) out.put("sku", order.sku());
            if (order.providerOrderId() != null) out.put("providerOrderId", order.providerOrderId());
            if (order.startsAt() != null) { out.put("startsAt", order.startsAt()); out.put("expiresAt", order.expiresAt()); }
            return out;
        }).toList();
    }

    /** Requeries the authenticated provider; the client never supplies a refund state. */
    public Map<String, Object> reconcile(String userId, String orderId) {
        PaymentOrder order = refresh(owned(userId, orderId));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("orderId", order.id()); out.put("status", order.status()); out.put("fire", fire.snapshot(order.communityId()));
        return out;
    }

    public void reconcileDue() {
        if (!providers.configured("web") && !providers.configured("ait")) return;
        long now = clock.getAsLong();
        for (PaymentOrder order : repository.due(now - 5 * 60_000L, now)) {
            if (!providers.configured(order.provider())) continue;
            try { refresh(order); }
            catch (RuntimeException unavailable) {
                // Rotate an unavailable receipt to the back of the queue; do not expose identifiers or provider bodies.
                repository.locked(order.id(), current -> {
                    repository.save(current.change(current.status(), current.providerOrderId(), current.paymentKey(), current.startsAt(), current.expiresAt(), clock.getAsLong()));
                    return null;
                });
            }
        }
    }

    private PaymentOrder refresh(PaymentOrder order) {
        if ("REFUNDED".equals(order.status()) || "FAILED".equals(order.status())) return order;
        if ("web".equals(order.provider()) && order.paymentKey() != null) return finish(order, providers.web(order, order.paymentKey(), false), true);
        if ("ait".equals(order.provider()) && order.providerOrderId() != null) return finish(order, providers.ait(order, order.providerOrderId()), true);
        return order;
    }

    private PaymentOrder finish(PaymentOrder requested, PaymentProviders.Verified verified) {
        return finish(requested, verified, false);
    }

    private PaymentOrder finish(PaymentOrder requested, PaymentProviders.Verified verified, boolean reconciliation) {
        try {
            return repository.locked(requested.id(), current -> {
                boolean deletedPayerGrant = reconciliation && current.userId() == null && current.communityId() != null
                    && current.startsAt() != null && ("PAID".equals(current.status()) || "REFUNDED".equals(current.status()))
                    && Objects.equals(current.providerOrderId(), verified.receipt());
                // A deleted payer can still have an active shared effect; only an existing grant may be reconciled.
                if (!deletedPayerGrant) own(current, requested.userId());
                if (current.providerOrderId() != null && !current.providerOrderId().equals(verified.receipt())) throw new ApiException(409, "이미 다른 영수증이 연결된 주문이에요.");
                if ("REFUNDED".equals(current.status())) return current; // A delayed success must never undo a refund.
                long now = clock.getAsLong();
                if (("PAID".equals(current.status()) && (verified.state() == PaymentProviders.State.PENDING || verified.state() == PaymentProviders.State.FAILED))
                    || ("FAILED".equals(current.status()) && verified.state() != PaymentProviders.State.REFUNDED)) {
                    var unchanged = current.change(current.status(), current.providerOrderId(), current.paymentKey(), current.startsAt(), current.expiresAt(), now);
                    repository.save(unchanged); return unchanged;
                }
                if (verified.state() == PaymentProviders.State.PENDING) {
                    var pending = current.change(current.status(), verified.receipt(), current.paymentKey(), current.startsAt(), current.expiresAt(), now);
                    repository.save(pending); return pending;
                }
                String status = switch (verified.state()) {
                    case PAID -> "PAID"; case REFUNDED -> "REFUNDED"; case FAILED -> "FAILED"; default -> current.status();
                };
                // Reserving the unique receipt happens before granting. A competing order rolls back entirely.
                var reserved = current.change(status, verified.receipt(), current.paymentKey(), current.startsAt(), current.expiresAt(), now);
                repository.save(reserved);
                if (verified.state() == PaymentProviders.State.REFUNDED) { fire.revokeColor(grantKey(reserved)); return reserved; }
                if (verified.state() == PaymentProviders.State.FAILED) return reserved;
                if (current.startsAt() != null) return reserved;
                var activation = fire.activateColor(current.communityId(), current.userId(), current.color(), grantKey(reserved));
                var paid = reserved.change("PAID", reserved.providerOrderId(), reserved.paymentKey(), activation.startsAt(), activation.expiresAt(), now);
                repository.save(paid);
                return paid;
            });
        } catch (DuplicateKeyException duplicate) { throw new ApiException(409, "이미 사용한 결제 영수증이에요."); }
    }

    private Map<String, Object> result(PaymentOrder order) {
        if ("PAID".equals(order.status())) return fulfilled(order);
        if ("REFUNDED".equals(order.status())) throw new ApiException(409, "환불된 결제예요. 불씨팝이 적용되지 않아요.");
        if ("FAILED".equals(order.status())) throw new ApiException(409, "결제가 완료되지 않았어요.");
        throw new ApiException(409, "결제가 아직 진행 중이에요. 잠시 뒤 같은 주문으로 확인해 주세요.");
    }

    private Map<String, Object> fulfilled(PaymentOrder order) {
        if (order.startsAt() == null || order.expiresAt() == null) throw ApiException.unavailable("구매한 불씨팝을 적용 중이에요. 같은 주문으로 다시 확인해 주세요.");
        return Map.of("verified", true, "orderId", order.id(), "color", order.color(), "startsAt", order.startsAt(), "expiresAt", order.expiresAt(), "fire", fire.snapshot(order.communityId()));
    }
    private String unavailableReason(DbUser user, String platform) {
        if (!salesEnabled) return "현재 판매 중인 결제 상품이 없어요.";
        if (user.anonymous()) return "로그인한 뒤 불씨팝을 구매할 수 있어요.";
        if (!providers.configured(platform)) return "ait".equals(platform) ? "앱인토스 결제 상품을 준비 중이에요." : "웹 결제를 준비 중이에요.";
        if ("ait".equals(platform) && !repository.tossLinked(user.id())) return "토스 로그인 후 앱인토스에서 구매해 주세요.";
        return null;
    }
    private PaymentOrder owned(String userId, String id) {
        identifier(id, "주문 번호");
        PaymentOrder order = repository.find(id).orElseThrow(() -> ApiException.notFound("주문을 찾을 수 없어요."));
        own(order, userId); return order;
    }
    private static void own(PaymentOrder order, String userId) {
        if (userId == null || !Objects.equals(userId, order.userId())) throw ApiException.forbidden("내 주문만 확인할 수 있어요.");
        if (order.communityId() == null) throw new ApiException(409, "주문한 소로우가 없어 결제를 처리할 수 없어요.");
    }
    private static void terminal(PaymentOrder order) {
        if ("REFUNDED".equals(order.status()) || "FAILED".equals(order.status())) throw new ApiException(409, "종료된 결제 주문이에요.");
    }
    private static void requireProvider(PaymentOrder order, String provider) {
        if (!provider.equals(order.provider())) throw ApiException.badRequest("주문의 결제 경로가 달라요.");
    }
    private static void platform(String platform) {
        if (!"web".equals(platform) && !"ait".equals(platform)) throw ApiException.badRequest("결제 경로를 확인해 주세요.");
    }
    private static UUID requestId(String value) {
        if (value == null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw ApiException.badRequest("주문 요청 번호를 확인해 주세요.");
        return UUID.fromString(value);
    }
    private static void identifier(String value, String name) {
        if (value == null || value.isBlank() || value.length() > 200 || value.chars().anyMatch(Character::isISOControl)) throw ApiException.badRequest(name + "를 확인해 주세요.");
    }
    static String grantKey(PaymentOrder order) {
        return "web".equals(order.provider()) ? "web:" + order.id() : "ait:" + digest(order.providerOrderId());
    }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
