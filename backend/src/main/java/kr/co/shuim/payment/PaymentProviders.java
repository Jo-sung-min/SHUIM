package kr.co.shuim.payment;

import com.fasterxml.jackson.databind.JsonNode;
import kr.co.shuim.auth.TossMtlsClient;
import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** The only code that interprets provider responses. Unknown states always fail closed. */
@Service
public class PaymentProviders {
    public enum State { PAID, PENDING, FAILED, REFUNDED }
    public record Verified(State state, String receipt, Long determinedAt) {}
    private final RestClient web;
    private final RestClient ait;
    private final String clientKey;
    private final String secret;
    private final String webBase;
    private final String aitBase;
    private final Map<String, String> skus;

    @Autowired
    public PaymentProviders(RestClient.Builder builder,
                            @Value("${app.payments.toss.client-key:}") String clientKey,
                            @Value("${app.payments.toss.secret-key:}") String secret,
                            @Value("${app.payments.toss.api-base:https://api.tosspayments.com}") String webBase,
                            @Value("${app.toss.api-base:https://apps-in-toss-api.toss.im}") String aitBase,
                            @Value("${app.toss.mtls-cert:}") String cert,
                            @Value("${app.toss.mtls-key:}") String key,
                            @Value("${app.payments.ait.rose-sku:}") String rose,
                            @Value("${app.payments.ait.aurora-sku:}") String aurora,
                            @Value("${app.payments.ait.ocean-sku:}") String ocean,
                            @Value("${app.payments.ait.violet-sku:}") String violet) {
        this(webClient(builder.clone()), TossMtlsClient.create(builder.clone(), cert, key), clientKey, secret,
            webBase, aitBase, Map.of("rose", rose.strip(), "aurora", aurora.strip(), "ocean", ocean.strip(), "violet", violet.strip()));
    }

    PaymentProviders(RestClient web, RestClient ait, String clientKey, String secret, String webBase, String aitBase, Map<String, String> skus) {
        this.web = web; this.ait = ait; this.clientKey = clientKey.strip(); this.secret = secret.strip();
        this.webBase = webBase.replaceAll("/+$", ""); this.aitBase = aitBase.replaceAll("/+$", ""); this.skus = Map.copyOf(skus);
    }

    private static RestClient webClient(RestClient.Builder builder) {
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
        var factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(15));
        return builder.requestFactory(factory).build();
    }

    public boolean configured(String provider) {
        if ("web".equals(provider)) return clientKey.matches("(?:test|live)_ck_.+") && secret.matches("(?:test|live)_sk_.+")
            && clientKey.startsWith(secret.substring(0, Math.min(5, secret.length())));
        return "ait".equals(provider) && ait != null && skus.keySet().containsAll(PaymentService.COLORS.keySet())
            && skus.values().stream().allMatch(s -> !s.isBlank() && s.length() <= 200)
            && new HashSet<>(skus.values()).size() == 4;
    }
    public String clientKey() { return clientKey; }
    public String sku(String color) { return skus.get(color); }

    public Verified web(PaymentOrder order, String paymentKey, boolean confirm) {
        if (!configured("web")) throw ApiException.unavailable("웹 결제가 아직 준비되지 않았어요.");
        JsonNode response;
        if (confirm) {
            try {
                response = web.post().uri(webBase + "/v1/payments/confirm").headers(h -> h.setBasicAuth(secret, ""))
                    .header("Idempotency-Key", order.id()).contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("paymentKey", paymentKey, "orderId", order.id(), "amount", order.amount()))
                    .retrieve().body(JsonNode.class);
            } catch (RestClientException uncertain) {
                // A timeout may have happened after approval. Query the same order; never create another charge.
                response = queryWeb(order.id());
            }
        } else response = queryWeb(order.id());
        return parseWeb(response, order, paymentKey);
    }

    private JsonNode queryWeb(String orderId) {
        try {
            return web.get().uri(webBase + "/v1/payments/orders/{id}", orderId).headers(h -> h.setBasicAuth(secret, ""))
                .retrieve().body(JsonNode.class);
        } catch (RestClientException unavailable) {
            throw ApiException.unavailable("결제 결과를 확인 중이에요. 같은 주문으로 다시 확인해 주세요.");
        }
    }

    static Verified parseWeb(JsonNode body, PaymentOrder order, String paymentKey) {
        if (body == null || !order.id().equals(body.path("orderId").asText()) || !paymentKey.equals(body.path("paymentKey").asText())
            || !"KRW".equals(body.path("currency").asText()) || !body.path("totalAmount").isNumber()
            || body.path("totalAmount").decimalValue().compareTo(BigDecimal.valueOf(order.amount())) != 0) {
            throw new ApiException(409, "주문과 결제 정보가 일치하지 않아요.");
        }
        State state = switch (body.path("status").asText()) {
            case "DONE" -> State.PAID;
            case "CANCELED", "PARTIAL_CANCELED" -> State.REFUNDED;
            case "ABORTED", "EXPIRED" -> State.FAILED;
            case "READY", "IN_PROGRESS", "WAITING_FOR_DEPOSIT" -> State.PENDING;
            default -> throw ApiException.unavailable("결제 상태를 확인할 수 없어요.");
        };
        return new Verified(state, order.id(), null);
    }

    public Verified ait(PaymentOrder order, String receipt) {
        if (!configured("ait")) throw ApiException.unavailable("앱인토스 결제가 아직 준비되지 않았어요.");
        try {
            JsonNode body = ait.post().uri(aitBase + "/api-partner/v1/apps-in-toss/order/get-order-status")
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("orderId", receipt)).retrieve().body(JsonNode.class);
            return parseAit(body, order, receipt);
        } catch (RestClientException unavailable) {
            throw ApiException.unavailable("앱인토스 결제 결과를 확인 중이에요. 같은 주문으로 다시 확인해 주세요.");
        }
    }

    static Verified parseAit(JsonNode body, PaymentOrder order, String receipt) {
        if (body == null || !"SUCCESS".equals(body.path("resultType").asText())) throw ApiException.unavailable("앱인토스 결제를 확인하지 못했어요.");
        JsonNode result = body.path("success");
        if (!receipt.equals(result.path("orderId").asText())) throw new ApiException(409, "주문 번호가 일치하지 않아요.");
        String status = result.path("status").asText();
        if (Set.of("MINIAPP_MISMATCH", "NOT_FOUND").contains(status)) throw new ApiException(409, "이 앱의 결제 주문을 찾을 수 없어요.");
        if ("ERROR".equals(status)) throw ApiException.unavailable("앱인토스 결제 상태를 확인 중이에요.");
        if (order.sku() == null || !order.sku().equals(result.path("sku").asText())) throw new ApiException(409, "선택한 불씨팝과 결제 상품이 달라요.");
        State state = switch (status) {
            case "PURCHASED", "PAYMENT_COMPLETED" -> State.PAID;
            case "ORDER_IN_PROGRESS" -> State.PENDING;
            case "FAILED" -> State.FAILED;
            case "REFUNDED" -> State.REFUNDED;
            default -> throw ApiException.unavailable("앱인토스 결제 상태를 확인할 수 없어요.");
        };
        Long at = null;
        if (state == State.PAID) {
            try { at = receiptTime(result.path("statusDeterminedAt").asText()); }
            catch (RuntimeException invalidTime) { throw new ApiException(409, "결제 시각을 확인할 수 없어요."); }
            // Official AIT timestamps have second precision and no offset (KST).
            if (order.startsAt() == null && (at < order.createdAt() / 1000 * 1000 || at > order.createdAt() + PaymentService.INTENT_WINDOW_MS)) {
                throw new ApiException(409, "이 주문의 결제 가능 시간과 영수증 시각이 일치하지 않아요.");
            }
        }
        return new Verified(state, receipt, at);
    }

    static long receiptTime(String value) {
        try { return Instant.parse(value).toEpochMilli(); }
        catch (java.time.format.DateTimeParseException noOffset) {
            return LocalDateTime.parse(value).atZone(ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        }
    }
}
