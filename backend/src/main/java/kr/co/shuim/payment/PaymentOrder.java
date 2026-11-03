package kr.co.shuim.payment;

import java.util.UUID;

/** Only the minimum order/receipt identifiers needed for fulfillment and reconciliation. */
public record PaymentOrder(String id, String userId, String communityId, String provider, String color, int amount,
                           String sku, UUID requestId, String providerOrderId, String paymentKey, String status,
                           long createdAt, long updatedAt, Long startsAt, Long expiresAt) {
    PaymentOrder change(String status, String receipt, String key, Long start, Long end, long now) {
        return new PaymentOrder(id, userId, communityId, provider, color, amount, sku, requestId, receipt, key,
            status, createdAt, now, start, end);
    }
}
