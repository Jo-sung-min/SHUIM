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
    @Test void privateSpaceHasFourPlacesPerMapAndOrdinarySpacesStillHaveOneHundred() {
        var service = new BeachService(mock(BeachFireService.class));
        for (String map : new String[]{"beach", "uyuni"}) {
            var first = service.enter("private", "owner", "나", Set.of(), null, map, null, 0L, 4).presence();
            for (int i = 1; i < 4; i++) service.enter("private", "peer-" + i, "동행", Set.of(), null, map, null, 0L, 4);
            assertEquals(409, assertThrows(ApiException.class,
                () -> service.enter("private", "fifth", "초과", Set.of(), null, map, null, 0L, 4)).status());
            assertEquals(first.ticket(), service.enter("private", "owner", "나", Set.of(), null, map, first.ticket(), 1L, 4).presence().ticket());
            assertEquals(4, service.count("private", map));
            for (int i = 0; i < 100; i++) service.enter("ordinary", "user-" + i, "회원", Set.of(), null, map);
            assertEquals(100, service.count("ordinary", map));
        }
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
