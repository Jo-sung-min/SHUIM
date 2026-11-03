package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class BeachFireServiceTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final TestFireRepository repository = new TestFireRepository();
    private final BeachFireService service = new BeachFireService(repository, clock::get);
    private String key() { return UUID.randomUUID().toString(); }

    @Test
    void fuelBurnsOnServerClockAndSurvivesServiceRestartWithoutRefilling() {
        var first = service.snapshot("a");
        assertEquals(3, first.logs());
        assertEquals(12, first.maxLogs());
        assertEquals(.25, first.intensity());
        assertEquals(clock.get() + BeachFireService.LOG_BURN_MS, first.nextLogBurnAt());
        clock.addAndGet(BeachFireService.LOG_BURN_MS);
        assertEquals(2, new BeachFireService(repository, clock::get).snapshot("a").logs());
        clock.addAndGet(2 * BeachFireService.LOG_BURN_MS);
        var empty = service.snapshot("a");
        assertEquals(0, empty.logs());
        assertEquals(0, empty.intensity());
        assertNull(empty.nextLogBurnAt());
        assertEquals(3, service.snapshot("b").logs());
        assertEquals(1, service.addWood("a", "u", key()).logs());
    }

    @Test
    void woodRetryIsIdempotentAcrossRestartAndCooldownAppliesAcrossTabs() {
        String request = key();
        assertEquals(4, service.addWood("a", "u", request).logs());
        assertEquals(4, service.addWood("a", "u", request.toUpperCase()).logs());
        assertEquals(429, assertThrows(ApiException.class, () -> service.addWood("a", "u", key())).status());
        clock.addAndGet(3_000);
        var restarted = new BeachFireService(repository, clock::get);
        assertEquals(4, restarted.addWood("a", "u", request).logs());
        assertEquals(5, restarted.addWood("a", "u", key()).logs());
        assertEquals(4, restarted.addWood("b", "u", request).logs());
    }

    @Test
    void simultaneousWoodRequestsCannotExceedCapacityAndDuplicatesOnlyAddOnce() throws Exception {
        try (var workers = Executors.newFixedThreadPool(12)) {
            String sameRequest = key();
            List<Callable<Integer>> retryWork = new ArrayList<>();
            for (int i = 0; i < 20; i++) retryWork.add(() -> service.addWood("same", "u", sameRequest).logs());
            for (var result : workers.invokeAll(retryWork)) assertEquals(4, result.get());
            List<Callable<Boolean>> fillWork = new ArrayList<>();
            for (int i = 0; i < 30; i++) {
                String user = "u-" + i;
                fillWork.add(() -> {
                    try { service.addWood("fill", user, key()); return true; }
                    catch (ApiException e) { assertEquals(409, e.status()); return false; }
                });
            }
            int added = 0;
            for (var result : workers.invokeAll(fillWork)) if (result.get()) added++;
            assertEquals(9, added);
            assertEquals(12, service.snapshot("fill").logs());
        }
    }

    @Test
    void eachConfirmedOrderGetsExactlyOneImmutable24HourWindow() {
        long start = clock.get();
        var first = service.activateColor("a", "u", "rose", "web:first");
        assertEquals(start, first.startsAt());
        assertEquals(start + BeachFireService.COLOR_DURATION_MS, first.expiresAt());
        assertEquals("rose", first.fire().color());
        clock.addAndGet(5_000);
        var retry = service.activateColor("a", "u", "rose", "web:first");
        assertEquals(first.startsAt(), retry.startsAt());
        assertEquals(first.expiresAt(), retry.expiresAt());
        var second = service.activateColor("a", "other", "ocean", "ait:second");
        assertEquals(first.expiresAt(), second.startsAt());
        assertEquals(second.startsAt() + BeachFireService.COLOR_DURATION_MS, second.expiresAt());
        assertEquals("rose", second.fire().color());
        assertEquals(1, second.fire().queuedPops());
        assertEquals(second.expiresAt(), second.fire().queueEndsAt());
        assertEquals("amber", service.snapshot("b").color());
        clock.set(first.expiresAt());
        assertEquals("ocean", service.snapshot("a").color());
        assertEquals(0, service.snapshot("a").queuedPops());
        clock.set(second.expiresAt());
        assertEquals("amber", service.snapshot("a").color());
        assertNull(service.snapshot("a").colorExpiresAt());
        assertNull(service.snapshot("a").queueEndsAt());
    }

    @Test
    void refundsNeverShiftOtherCustomersWindowsOrLetWebhookReplayReactivate() {
        var first = service.activateColor("a", "u", "rose", "web:first");
        var second = service.activateColor("a", "v", "violet", "web:second");
        service.revokeColor("web:first");
        service.revokeColor("web:first");
        assertEquals("amber", service.snapshot("a").color());
        assertEquals(second.expiresAt(), service.snapshot("a").queueEndsAt());
        assertEquals("amber", service.activateColor("a", "u", "rose", "web:first").fire().color());
        clock.set(first.expiresAt());
        assertEquals("violet", service.snapshot("a").color());
        assertEquals(second.startsAt(), service.activateColor("a", "v", "violet", "web:second").startsAt());
        service.revokeColor("web:second");
        assertEquals("amber", service.snapshot("a").color());
        service.revokeColor("web:unknown");
    }

    @Test
    void invalidRequestsAndCrossCommunityPaymentReuseNeverMutateFire() {
        for (String bad : List.of("", "1-1-1-1-1", "not-a-uuid")) assertEquals(400,
            assertThrows(ApiException.class, () -> service.addWood("a", "u", bad)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.activateColor("a", "u", "amber", "web:x")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.activateColor("a", "u", "rose", "x".repeat(201))).status());
        service.activateColor("a", "u", "rose", "web:one");
        assertEquals(409, assertThrows(ApiException.class, () -> service.activateColor("b", "u", "rose", "web:one")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> service.activateColor("a", "other", "rose", "web:one")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> service.activateColor("a", "u", "ocean", "web:one")).status());
        assertEquals("amber", service.snapshot("b").color());
    }
}
