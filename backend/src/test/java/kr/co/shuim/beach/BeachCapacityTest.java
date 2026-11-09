package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class BeachCapacityTest {
    @Test void allMapsCapLegacyOrdinaryRoomsAtTwentyAndKeepSmallerPrivateLimits() {
        var service = new BeachService(() -> 1_000_000L, mock(BeachFireService.class));
        for (String map : new String[]{"beach", "uyuni", "bamboo", "garden", "cloudspa", "baikal"}) {
            for (int limit : new int[]{2, 4}) {
                String community = "private-" + limit;
                var first = service.enter(community, "owner", "나", Set.of(), null, map, null, 0L, limit).presence();
                for (int i = 1; i < limit; i++) service.enter(community, "peer-" + i, "동행", Set.of(), null, map, null, 0L, limit);
                assertEquals(409, assertThrows(ApiException.class,
                    () -> service.enter(community, "overflow", "초과", Set.of(), null, map, null, 0L, limit)).status());
                assertEquals(first.ticket(), service.enter(community, "owner", "나", Set.of(), null, map, first.ticket(), 1L, limit).presence().ticket());
                assertEquals(limit, service.count(community, map));
            }
            for (int i = 0; i < 20; i++) service.enter("ordinary", "user-" + i, "회원", Set.of(), null, map, null, 0L, 100);
            assertEquals(20, service.count("ordinary", map));
            assertEquals(409, assertThrows(ApiException.class,
                () -> service.enter("ordinary", "twenty-first", "초과", Set.of(), null, map, null, 0L, 100)).status());
            assertEquals(20, service.count("ordinary", map), "a full map does not over-admit or affect other maps");
        }
    }

    @Test void ordinaryDefaultAdmissionAlsoStopsAtTwenty() {
        var service = new BeachService(() -> 1_000_000L, mock(BeachFireService.class));
        for (int i = 0; i < 20; i++) service.enter("ordinary", "user-" + i, "회원", Set.of());
        assertEquals(20, service.count("ordinary"));
        assertEquals(409, assertThrows(ApiException.class,
            () -> service.enter("ordinary", "twenty-first", "초과", Set.of())).status());
    }

    @Test void simultaneousEntryCannotExceedFourAndExpiredVisitsReleaseCapacity() throws Exception {
        var clock = new AtomicLong(1_000_000);
        var service = new BeachService(clock::get, mock(BeachFireService.class));
        try (var workers = Executors.newFixedThreadPool(12)) {
            var tasks = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 40; i++) {
                final String id = "member-" + i;
                tasks.add(workers.submit(() -> {
                    try { service.enter("private", id, "회원", Set.of(), null, "uyuni", null, 0L, 4); return true; }
                    catch (ApiException full) { assertEquals(409, full.status()); return false; }
                }));
            }
            int accepted = 0;
            for (var task : tasks) if (task.get()) accepted++;
            assertEquals(4, accepted);
            assertEquals(4, service.count("private", "uyuni"));
        }
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        service.enter("private", "newcomer", "회원", Set.of(), null, "uyuni", null, 0L, 4);
        assertEquals(1, service.count("private", "uyuni"));
    }

    @Test void invalidCapacityDoesNotCreateARoom() {
        var service = new BeachService(mock(BeachFireService.class));
        for (int value : new int[]{-1, 0, 101, Integer.MAX_VALUE}) {
            assertEquals(400, assertThrows(ApiException.class,
                () -> service.enter("bad", "user", "회원", Set.of(), null, "beach", null, 0L, value)).status());
        }
        assertEquals(0, service.count("bad"));
    }
}
