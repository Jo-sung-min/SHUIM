package kr.co.shuim.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class PaymentProvidersTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final long NOW = Instant.parse("2026-11-03T00:00:00Z").toEpochMilli();
    private static final Map<String, String> SKUS = Map.of("rose", "sku-rose", "aurora", "sku-aurora", "ocean", "sku-ocean", "violet", "sku-violet");
    private static PaymentOrder order(String provider) {
        return new PaymentOrder("fire_order_123", "u1", "c1", provider, "rose", 1000, "ait".equals(provider) ? "sku-rose" : null,
            UUID.randomUUID(), null, null, "CREATED", NOW, NOW, null, null);
    }
    private static JsonNode web(String status, int amount, String currency, String id, String key) throws Exception {
        return JSON.readTree(JSON.writeValueAsString(Map.of("status", status, "totalAmount", amount, "currency", currency, "orderId", id, "paymentKey", key)));
    }
    private static JsonNode ait(String envelope, String status, String sku, String receipt, String time) throws Exception {
        return JSON.readTree(JSON.writeValueAsString(Map.of("resultType", envelope, "success", Map.of("status", status, "sku", sku, "orderId", receipt, "statusDeterminedAt", time))));
    }

    @Test void webRequiresExactOrderKeyAmountCurrencyAndKnownStatus() throws Exception {
        PaymentOrder order = order("web");
        assertEquals(PaymentProviders.State.PAID, PaymentProviders.parseWeb(web("DONE", 1000, "KRW", order.id(), "pay-key"), order, "pay-key").state());
        for (JsonNode invalid : new JsonNode[]{web("DONE", 999, "KRW", order.id(), "pay-key"), web("DONE", 1000, "USD", order.id(), "pay-key"),
            web("DONE", 1000, "KRW", "other-order", "pay-key"), web("DONE", 1000, "KRW", order.id(), "other-key")}) {
            assertEquals(409, assertThrows(ApiException.class, () -> PaymentProviders.parseWeb(invalid, order, "pay-key")).status());
        }
        var fractional = JSON.readTree("{\"status\":\"DONE\",\"totalAmount\":1000.01,\"currency\":\"KRW\",\"orderId\":\"fire_order_123\",\"paymentKey\":\"pay-key\"}");
        assertThrows(ApiException.class, () -> PaymentProviders.parseWeb(fractional, order, "pay-key"));
        assertEquals(503, assertThrows(ApiException.class, () -> PaymentProviders.parseWeb(web("UNKNOWN", 1000, "KRW", order.id(), "pay-key"), order, "pay-key")).status());
        assertEquals(PaymentProviders.State.REFUNDED, PaymentProviders.parseWeb(web("PARTIAL_CANCELED", 1000, "KRW", order.id(), "pay-key"), order, "pay-key").state());
        assertEquals(PaymentProviders.State.FAILED, PaymentProviders.parseWeb(web("ABORTED", 1000, "KRW", order.id(), "pay-key"), order, "pay-key").state());
    }

    @Test void lostWebApprovalResponseQueriesTheSameOrderWithNoSecondCharge() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        PaymentOrder order = order("web");
        server.expect(requestTo("https://provider.test/v1/payments/confirm")).andExpect(method(HttpMethod.POST))
            .andExpect(header("Authorization", "Basic dGVzdF9za19zZWNyZXQ6"))
            .andExpect(header("Idempotency-Key", order.id()))
            .andExpect(content().json("{\"paymentKey\":\"pay-key\",\"orderId\":\"fire_order_123\",\"amount\":1000}"))
            .andRespond(withStatus(HttpStatus.GATEWAY_TIMEOUT));
        server.expect(requestTo("https://provider.test/v1/payments/orders/fire_order_123")).andExpect(method(HttpMethod.GET))
            .andRespond(withSuccess("{\"status\":\"DONE\",\"totalAmount\":1000,\"currency\":\"KRW\",\"orderId\":\"fire_order_123\",\"paymentKey\":\"pay-key\"}", MediaType.APPLICATION_JSON));
        var providers = new PaymentProviders(builder.build(), null, "test_ck_public", "test_sk_secret", "https://provider.test", "", SKUS);
        assertEquals(PaymentProviders.State.PAID, providers.web(order, "pay-key", true).state());
        server.verify();
    }

    @Test void aitRequiresSuccessfulEnvelopeMatchingSkuReceiptAndThirtyMinuteIntentWindow() throws Exception {
        var order = order("ait");
        assertEquals(PaymentProviders.State.PAID, PaymentProviders.parseAit(ait("SUCCESS", "PAYMENT_COMPLETED", "sku-rose", "receipt", "2026-11-03T09:00:01+09:00"), order, "receipt").state());
        assertEquals(PaymentProviders.State.PAID, PaymentProviders.parseAit(ait("SUCCESS", "PAYMENT_COMPLETED", "sku-rose", "receipt", "2026-11-03T09:00:01"), order, "receipt").state());
        var milliseconds = new PaymentOrder(order.id(), order.userId(), order.communityId(), order.provider(), order.color(), order.amount(), order.sku(), order.requestId(), null, null, "CREATED", NOW + 650, NOW + 650, null, null);
        assertEquals(PaymentProviders.State.PAID, PaymentProviders.parseAit(ait("SUCCESS", "PAYMENT_COMPLETED", "sku-rose", "receipt", "2026-11-03T09:00:00"), milliseconds, "receipt").state());
        for (JsonNode invalid : new JsonNode[]{ait("FAIL", "PURCHASED", "sku-rose", "receipt", "2026-11-03T00:00:01Z"),
            ait("SUCCESS", "PURCHASED", "sku-ocean", "receipt", "2026-11-03T00:00:01Z"),
            ait("SUCCESS", "PURCHASED", "sku-rose", "other-receipt", "2026-11-03T00:00:01Z"),
            ait("SUCCESS", "PURCHASED", "sku-rose", "receipt", "2026-11-02T23:59:59Z"),
            ait("SUCCESS", "PURCHASED", "sku-rose", "receipt", "2026-11-03T00:30:01Z"),
            ait("SUCCESS", "PURCHASED", "sku-rose", "receipt", "not-a-date"),
            ait("SUCCESS", "MINIAPP_MISMATCH", "sku-rose", "receipt", "2026-11-03T00:00:01Z"),
            ait("SUCCESS", "UNKNOWN", "sku-rose", "receipt", "2026-11-03T00:00:01Z")}) {
            assertThrows(ApiException.class, () -> PaymentProviders.parseAit(invalid, order, "receipt"));
        }
        assertEquals(PaymentProviders.State.REFUNDED, PaymentProviders.parseAit(ait("SUCCESS", "REFUNDED", "sku-rose", "receipt", "2026-11-10T00:00:00Z"), order, "receipt").state());
    }

    @Test void providerConfigurationFailsClosedAndSeparatesTestFromLiveKeys() {
        assertFalse(new PaymentProviders(null, null, "", "", "", "", SKUS).configured("web"));
        assertFalse(new PaymentProviders(null, null, "test_ck_public", "live_sk_secret", "", "", SKUS).configured("web"));
        assertFalse(new PaymentProviders(null, null, "test_ck_public", "test_sk_secret", "", "", SKUS).configured("ait"));
    }
}
