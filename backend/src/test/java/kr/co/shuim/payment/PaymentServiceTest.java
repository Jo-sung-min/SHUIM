package kr.co.shuim.payment;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.beach.BeachFireService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.dao.DuplicateKeyException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentServiceTest {
    private static final long NOW = 1_793_664_000_000L;
    private final MemoryRepository repository = new MemoryRepository();
    private final PaymentProviders providers = mock(PaymentProviders.class);
    private final BeachFireService fire = mock(BeachFireService.class);
    private PaymentService service;
    private final DbUser user = new DbUser("u1", null, "이름", "user", false, null, null, 0);
    private final BeachFireService.FireView view = new BeachFireService.FireView(3, 12, 0.25, "amber", null, NOW, NOW + 600_000, null, 0);

    @BeforeEach void setup() {
        service = new PaymentService(repository, providers, fire, () -> NOW, true);
        when(providers.configured(anyString())).thenReturn(true);
        when(providers.clientKey()).thenReturn("test_ck_public");
        when(providers.sku(anyString())).thenAnswer(call -> "sku-" + call.getArgument(0));
        when(fire.snapshot(anyString())).thenReturn(view);
        when(fire.activateColor(anyString(), anyString(), anyString(), anyString()))
            .thenAnswer(call -> new BeachFireService.Activation(call.getArgument(2), NOW, NOW + 86_400_000, view));
        when(providers.web(any(), anyString(), anyBoolean())).thenAnswer(call -> new PaymentProviders.Verified(PaymentProviders.State.PAID, ((PaymentOrder) call.getArgument(0)).id(), null));
        when(providers.ait(any(), anyString())).thenAnswer(call -> new PaymentProviders.Verified(PaymentProviders.State.PAID, call.getArgument(1), NOW + 1000));
    }
    private String create(String provider) { return (String) service.create(user, "c1", "rose", provider, UUID.randomUUID().toString()).get("orderId"); }

    @Test void creationIsIdempotentAndRejectsConflictingReuseOfARequest() {
        String request = UUID.randomUUID().toString();
        var first = service.create(user, "c1", "rose", "web", request);
        var retry = service.create(user, "c1", "rose", "web", request.toUpperCase());
        assertEquals(first.get("orderId"), retry.get("orderId"));
        assertEquals(1000, first.get("amount"));
        assertTrue(((String) first.get("customerKey")).matches("[A-Za-z0-9_-]{2,50}"));
        assertEquals(409, assertThrows(ApiException.class, () -> service.create(user, "c1", "ocean", "web", request)).status());
    }

    @Test void replayedCheckoutReturnsPaidResultInsteadOfAuthorizingAnotherAitPurchase() {
        String request = UUID.randomUUID().toString();
        var first = service.create(user, "c1", "rose", "ait", request);
        service.confirmAit(user.id(), (String) first.get("orderId"), "already-paid");
        var retry = service.create(user, "c1", "rose", "ait", request);
        assertEquals("PAID", retry.get("status"));
        assertEquals("already-paid", retry.get("providerOrderId"));
        assertEquals(true, ((Map<?, ?>) retry.get("result")).get("verified"));
        String expiredRequest = UUID.randomUUID().toString();
        service.create(user, "c1", "rose", "ait", expiredRequest);
        var later = new PaymentService(repository, providers, fire, () -> NOW + PaymentService.INTENT_WINDOW_MS + 1, true);
        var expired = later.create(user, "c1", "rose", "ait", expiredRequest);
        assertEquals("CREATED", expired.get("status"));
        assertEquals(NOW + PaymentService.INTENT_WINDOW_MS, expired.get("intentExpiresAt"));
        assertFalse(expired.containsKey("result"));
    }

    @Test void wrongOwnerAndTamperedAmountNeverCallPaymentProviderOrGrant() {
        String id = create("web");
        clearInvocations(providers, fire);
        assertEquals(403, assertThrows(ApiException.class, () -> service.confirmWeb("other-user", id, "pay", 1000)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.confirmWeb(user.id(), id, "pay", 1)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.confirmWeb(user.id(), id, "pay", null)).status());
        verifyNoInteractions(providers, fire);
    }

    @Test void parallelRetriesAndServiceRestartGrantExactlyOnce() throws Exception {
        String id = create("web");
        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = new ArrayList<java.util.concurrent.Callable<Map<String, Object>>>();
            for (int i = 0; i < 16; i++) tasks.add(() -> service.confirmWeb(user.id(), id, "pay", 1000));
            for (var future : executor.invokeAll(tasks)) assertEquals(NOW + 86_400_000, future.get().get("expiresAt"));
        }
        verify(fire, times(1)).activateColor(eq("c1"), eq(user.id()), eq("rose"), eq("web:" + id));
        var restarted = new PaymentService(repository, providers, fire, () -> NOW + 5000, true);
        assertEquals(NOW, restarted.confirmWeb(user.id(), id, "pay", 1000).get("startsAt"));
        assertEquals(409, assertThrows(ApiException.class, () -> restarted.confirmWeb(user.id(), id, "different-key", 1000)).status());
    }

    @Test void sameAitReceiptCannotBeUsedByTwoLocalOrdersOrAcknowledgedAgainstWrongPaidOrder() {
        String first = create("ait"), second = create("ait");
        assertEquals(true, service.confirmAit(user.id(), first, "receipt-one").get("verified"));
        assertEquals(409, assertThrows(ApiException.class, () -> service.confirmAit(user.id(), second, "receipt-one")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> service.confirmAit(user.id(), first, "receipt-two")).status());
        verify(fire, times(1)).activateColor(anyString(), anyString(), anyString(), anyString());
    }

    @Test void providerFailuresAndPendingStatesNeverGrantAndRefundsCannotReactivate() {
        String pending = create("ait");
        when(providers.ait(any(), eq("pending"))).thenReturn(new PaymentProviders.Verified(PaymentProviders.State.PENDING, "pending", NOW));
        assertEquals(409, assertThrows(ApiException.class, () -> service.confirmAit(user.id(), pending, "pending")).status());
        verify(fire, never()).activateColor(anyString(), anyString(), anyString(), anyString());
        String paid = create("web");
        service.confirmWeb(user.id(), paid, "pay-refund", 1000);
        when(providers.web(any(), eq("pay-refund"), eq(false))).thenReturn(new PaymentProviders.Verified(PaymentProviders.State.REFUNDED, paid, null));
        assertEquals("REFUNDED", service.reconcile(user.id(), paid).get("status"));
        verify(fire).revokeColor("web:" + paid);
        assertEquals(409, assertThrows(ApiException.class, () -> service.confirmWeb(user.id(), paid, "pay-refund", 1000)).status());
        assertEquals("REFUNDED", repository.find(paid).orElseThrow().status());
    }

    @Test void unconfiguredProviderHasNoSuccessfulCheckoutAndHistoryNeverCrossesUsers() {
        create("web");
        assertTrue(service.orders("other-user", "c1").isEmpty());
        when(providers.configured("web")).thenReturn(false);
        assertEquals(false, service.catalog(user, "c1", "web").get("available"));
        assertEquals(503, assertThrows(ApiException.class, () -> create("web")).status());
    }

    @Test void springDefaultsToSalesPausedWithoutAFlag() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(PaymentRepository.class, () -> repository);
            context.registerBean(PaymentProviders.class, () -> providers);
            context.registerBean(BeachFireService.class, () -> fire);
            context.register(PaymentService.class);
            context.refresh();
            var defaultService = context.getBean(PaymentService.class);
            assertEquals(false, defaultService.catalog(user, "c1", "web").get("available"));
            assertEquals(503, assertThrows(ApiException.class, () -> defaultService.create(user, "c1", "rose", "web", UUID.randomUUID().toString())).status());
        }
    }

    @Test void salesPausedBlocksBothNewOrderTypesEvenWithConfiguredProviders() {
        var paused = new PaymentService(repository, providers, fire, () -> NOW, false);
        for (String provider : List.of("web", "ait")) {
            var catalog = paused.catalog(user, "c1", provider);
            assertEquals(false, catalog.get("available"));
            assertEquals(List.of(), catalog.get("products"));
            assertEquals(503, assertThrows(ApiException.class, () -> paused.create(user, "c1", "rose", provider, UUID.randomUUID().toString())).status());
        }
        assertTrue(repository.data.isEmpty());
        verify(providers, never()).web(any(), anyString(), anyBoolean());
        verify(providers, never()).ait(any(), anyString());
        verify(fire, never()).activateColor(anyString(), anyString(), anyString(), anyString());
    }

    @Test void salesPausedNeverApprovesWebPaymentButCanRecoverAnAlreadyPaidOrder() {
        String id = create("web");
        var paused = new PaymentService(repository, providers, fire, () -> NOW, false);
        when(providers.web(any(), eq("pay"), eq(false)))
            .thenReturn(new PaymentProviders.Verified(PaymentProviders.State.PENDING, id, null));
        assertEquals(409, assertThrows(ApiException.class, () -> paused.confirmWeb(user.id(), id, "pay", 1000)).status());
        verify(fire, never()).activateColor(anyString(), anyString(), anyString(), anyString());
        when(providers.web(any(), eq("pay"), eq(false)))
            .thenReturn(new PaymentProviders.Verified(PaymentProviders.State.PAID, id, null));
        assertEquals(true, paused.confirmWeb(user.id(), id, "pay", 1000).get("verified"));
        assertEquals(true, paused.confirmWeb(user.id(), id, "pay", 1000).get("verified"));
        verify(providers, never()).web(any(), anyString(), eq(true));
        verify(fire, times(1)).activateColor(eq("c1"), eq(user.id()), eq("rose"), eq("web:" + id));
    }

    @Test void salesPausedPreservesExistingAitReceiptsAndVerifiedRefunds() {
        String id = create("ait");
        var paused = new PaymentService(repository, providers, fire, () -> NOW, false);
        assertEquals(true, paused.confirmAit(user.id(), id, "old-receipt").get("verified"));
        assertEquals(true, paused.confirmAit(user.id(), id, "old-receipt").get("verified"));
        when(providers.ait(any(), eq("old-receipt")))
            .thenReturn(new PaymentProviders.Verified(PaymentProviders.State.REFUNDED, "old-receipt", null));
        assertEquals("REFUNDED", paused.reconcile(user.id(), id).get("status"));
        var grant = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(fire, times(1)).activateColor(eq("c1"), eq(user.id()), eq("rose"), grant.capture());
        verify(fire).revokeColor(grant.getValue());
        assertEquals(409, assertThrows(ApiException.class, () -> paused.confirmAit(user.id(), id, "old-receipt")).status());
    }

    static class MemoryRepository extends PaymentRepository {
        final Map<String, PaymentOrder> data = new HashMap<>();
        @Override public synchronized PaymentOrder create(PaymentOrder order) {
            var existing = data.values().stream().filter(o -> Objects.equals(o.userId(), order.userId()) && o.requestId().equals(order.requestId())).findFirst();
            if (existing.isPresent()) return existing.get();
            data.put(order.id(), order); return order;
        }
        @Override public synchronized Optional<PaymentOrder> find(String id) { return Optional.ofNullable(data.get(id)); }
        @Override public synchronized <T> T locked(String id, Function<PaymentOrder, T> work) { return work.apply(data.get(id)); }
        @Override public synchronized void save(PaymentOrder order) {
            if (data.values().stream().anyMatch(o -> !o.id().equals(order.id()) && (
                order.providerOrderId() != null && o.provider().equals(order.provider()) && order.providerOrderId().equals(o.providerOrderId())
                || order.paymentKey() != null && order.paymentKey().equals(o.paymentKey())))) throw new DuplicateKeyException("receipt");
            data.put(order.id(), order);
        }
        @Override public synchronized List<PaymentOrder> list(String userId, String communityId) {
            return data.values().stream().filter(o -> Objects.equals(o.userId(), userId) && Objects.equals(o.communityId(), communityId)).toList();
        }
        @Override public boolean tossLinked(String userId) { return true; }
    }
}
