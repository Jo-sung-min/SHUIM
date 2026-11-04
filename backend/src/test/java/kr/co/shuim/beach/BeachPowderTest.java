package kr.co.shuim.beach;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BeachPowderTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final TestFireRepository repository = new TestFireRepository();
    private final BeachFireService fire = new BeachFireService(repository, clock::get);
    private String key() { return UUID.randomUUID().toString(); }

    @Test
    void freeRainbowOverlayExpiresWithoutChangingPaidGrantsOrFuel() throws Exception {
        fire.activateColor("a", "one", "rose", "web:paid-one");
        fire.activateColor("a", "two", "ocean", "web:paid-two");
        var grants = List.copyOf(repository.grants("a"));
        var before = fire.snapshot("a");
        String requestId = key();
        var next = fire.addPowder("a", "one", requestId, "rainbow");
        assertTrue(next.powderEnabled());
        assertEquals("rainbow", next.powder().color());
        assertNotEquals(requestId, next.powder().id(), "public event IDs do not expose the retry key");
        UUID.fromString(next.powder().id());
        assertEquals(clock.get(), next.powder().startedAt());
        assertEquals(clock.get() + 90_000, next.powder().expiresAt());
        assertEquals(before.color(), next.color());
        assertEquals(before.colorExpiresAt(), next.colorExpiresAt());
        assertEquals(before.queueEndsAt(), next.queueEndsAt());
        assertEquals(before.queuedPops(), next.queuedPops());
        assertEquals(before.logs(), next.logs());
        assertEquals(before.intensity(), next.intensity());
        assertEquals(before.nextLogBurnAt(), next.nextLogBurnAt());
        assertEquals(grants, repository.grants("a"));
        assertEquals(next.powder(), fire.addWood("a", "one", key()).powder());
        clock.addAndGet(90_000);
        var expired = fire.snapshot("a");
        assertNull(expired.powder());
        assertEquals("rose", expired.color());
        assertEquals(grants, repository.grants("a"));
        var json = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL).valueToTree(expired);
        assertTrue(json.has("powder") && json.get("powder").isNull(), "expiration is explicit despite global non-null JSON settings");
    }

    @Test
    void retriesDoNotReplayOrExtendEffectsAndCooldownIsSharedAcrossUsers() {
        String requestId = key();
        var first = fire.addPowder("a", "one", requestId, "rose");
        clock.addAndGet(2_000);
        assertEquals(first.powder(), fire.addPowder("a", "one", requestId.toUpperCase(), "rose").powder());
        assertEquals(429, assertThrows(ApiException.class, () -> fire.addPowder("a", "two", key(), "ocean")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> fire.addPowder("a", "one", requestId, "violet")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> fire.addPowder("b", "one", requestId, "rose")).status());
        clock.addAndGet(8_000);
        var replacement = fire.addPowder("a", "two", requestId, "aurora");
        assertNotEquals(first.powder().id(), replacement.powder().id(), "another account has its own retry keys");
        assertEquals(replacement.powder(), fire.addPowder("a", "one", requestId, "rose").powder(), "an old retry returns current state instead of replaying its old color");
        clock.addAndGet(90_000);
        assertNull(fire.addPowder("a", "one", requestId, "rose").powder(), "a retry after the effect ends does not retoss");
        assertNull(fire.snapshot("b").powder());
    }

    @Test
    void concurrentDifferentRequestsHaveOneWinnerAndDuplicateRequestsShareOneEvent() throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(16)) {
            var tasks = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 16; i++) {
                String user = "user-" + i;
                tasks.add(workers.submit(() -> {
                    assertTrue(start.await(5, TimeUnit.SECONDS));
                    try { fire.addPowder("a", user, key(), "rainbow"); return true; }
                    catch (ApiException e) { assertEquals(429, e.status()); return false; }
                }));
            }
            start.countDown();
            int winners = 0;
            for (var task : tasks) if (task.get(5, TimeUnit.SECONDS)) winners++;
            assertEquals(1, winners);
            String requestId = key();
            var retries = new ArrayList<java.util.concurrent.Callable<BeachFireService.PowderView>>();
            for (int i = 0; i < 16; i++) retries.add(() -> fire.addPowder("b", "one", requestId, "violet").powder());
            var expected = fire.addPowder("b", "one", requestId, "violet").powder();
            for (var result : workers.invokeAll(retries)) assertEquals(expected, result.get());
        }
    }

    @Test
    void unlitFireMustHaveWoodAddedBeforeANewPowderEffect() {
        fire.snapshot("a");
        clock.addAndGet(BeachFireService.INITIAL_LOGS * BeachFireService.LOG_BURN_MS);
        assertEquals(0, fire.snapshot("a").logs());
        assertEquals(409, assertThrows(ApiException.class, () -> fire.addPowder("a", "one", key(), "ocean")).status());
        assertNull(fire.snapshot("a").powder());
        fire.addWood("a", "one", key());
        assertEquals("ocean", fire.addPowder("a", "one", key(), "ocean").powder().color());
    }

    @Test
    void malformedIdsAndColorsDoNotEvenReadOrInitializeTheDurableFire() {
        var untouched = mock(BeachFireRepository.class);
        var service = new BeachFireService(untouched, clock::get);
        for (String id : new String[]{null, "", "1-1-1-1-1", "bad"}) {
            assertEquals(400, assertThrows(ApiException.class, () -> service.addPowder("a", "one", id, "rainbow")).status());
        }
        for (String color : new String[]{null, "", "amber", "RAINBOW", "paid"}) {
            assertEquals(400, assertThrows(ApiException.class, () -> service.addPowder("a", "one", key(), color)).status());
        }
        verifyNoInteractions(untouched);
    }

    @Test
    void visitOwnershipRangeRoomIsolationAndCacheInvalidationAreEnforced() {
        var beach = new BeachService(clock::get, fire);
        var owner = beach.enter("a", "one", "하나", Set.of());
        var observer = beach.enter("a", "two", "둘", Set.of());
        var other = beach.enter("b", "other", "다른 방", Set.of());
        assertEquals(403, assertThrows(ApiException.class, () -> beach.addPowder(owner.ticket(), "two", key(), "rose")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> beach.addPowder(owner.ticket(), "one", key(), "rose")).status());
        beach.tick(owner.ticket(), 0, 12, 0, false, null, null);
        assertNull(beach.tick(observer.ticket(), 1, 12, 0, false, null, null).fire().powder());
        String requestId = key();
        var result = beach.addPowder(owner.ticket(), "one", requestId, "rainbow");
        assertEquals(result.powder(), beach.tick(observer.ticket(), 1, 12, 0, false, null, null).fire().powder());
        assertEquals(result.powder(), beach.fire("a").powder());
        assertNull(beach.tick(other.ticket(), 1, 12, 0, false, null, null).fire().powder());
        beach.leave(owner.ticket());
        var renewed = beach.enter("a", "one", "하나", Set.of());
        beach.tick(renewed.ticket(), 0, 12, 0, false, null, null);
        assertEquals(result.powder(), beach.addPowder(renewed.ticket(), "one", requestId, "rainbow").powder());
        assertEquals(410, assertThrows(ApiException.class, () -> beach.addPowder(owner.ticket(), "one", requestId, "rainbow")).status());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> beach.addPowder(renewed.ticket(), "one", key(), "rainbow")).status());
    }

    @Test
    void powderExpiryInvalidatesAStillFreshOneSecondFireCache() {
        var beach = new BeachService(clock::get, fire);
        var p = beach.enter("a", "one", "하나", Set.of());
        beach.tick(p.ticket(), 0, 12, 0, false, null, null);
        var effect = beach.addPowder(p.ticket(), "one", key(), "rainbow");
        clock.set(effect.powder().expiresAt() - 500);
        var renewed = beach.enter("a", "one", "하나", Set.of());
        assertNotNull(beach.tick(renewed.ticket(), 0, 12, 0, false, null, null).fire().powder());
        clock.addAndGet(500);
        assertNull(beach.tick(renewed.ticket(), 0, 12, 0, false, null, null).fire().powder());
    }

    @Test
    void retryMemoryIsBoundedAndExpiredRecordsAreReclaimed() {
        var effects = new BeachFirePowder(clock::get);
        var base = new BeachFireService.FireView(3, 12, .25, "amber", null, clock.get(),
            clock.get() + BeachFireService.LOG_BURN_MS, null, 0);
        for (int i = 0; i < BeachFirePowder.MAX_REQUESTS; i++) effects.add("room-" + i, "one", UUID.randomUUID(), "rose", base);
        assertEquals(503, assertThrows(ApiException.class,
            () -> effects.add("overflow", "one", UUID.randomUUID(), "rose", base)).status());
        clock.addAndGet(BeachFirePowder.RETRY_MS + 1);
        assertNull(effects.snapshot("room-0", base).powder());
        // The original logs have burned out while retry records expired; test the
        // reclaimed request slot with fresh fuel rather than the stale snapshot.
        assertNotNull(effects.add("overflow", "one", UUID.randomUUID(), "rose", fire.snapshot("overflow")).powder());
    }
}
