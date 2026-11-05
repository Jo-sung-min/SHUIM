package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.config.ApiExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BeachUyuniMomentsTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private DbUser user(String id, boolean anonymous, Long blockedAt) {
        return new DbUser(id, id + "@example.com", id, "user", anonymous, blockedAt, null, 0);
    }
    private void actor(DbUser value) {
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(value));
        when(auth.requireUser(any(), any())).thenReturn(value);
    }
    private BeachRoom.Presence visitor(String room, String id, String map) {
        return beach.enter(room, id, id, Set.of(), null, map);
    }
    private BeachRoom.Presence visitor(String id) { return visitor("room", id, "uyuni"); }
    private BeachUyuniMoments.Launch launch(BeachRoom.Presence p, String id, String kind, String letter, String color, String wish) {
        return beach.launchUyuniMoment(p.ticket(), p.userId(), id, kind, letter, color, wish, p.excluded());
    }
    private BeachUyuniMoments.Launch spark(BeachRoom.Presence p) {
        return launch(p, UUID.randomUUID().toString(), "sparkler", "L", null, null);
    }
    private BeachUyuniMoments.Launch lantern(BeachRoom.Presence p) {
        return launch(p, UUID.randomUUID().toString(), "lantern", null, "rose", "다 같이 행복하길");
    }
    private BeachUyuniMoments.Launch submit(BeachRoom.Presence p, String id) {
        return controller.moment(new BeachController.MomentBody(p.ticket(), id, "sparkler", "L", null, null), request);
    }
    private BeachRoom.TickResult poll(BeachRoom.Presence p) {
        return beach.tick(p.ticket(), Double.NaN, Double.NaN, Double.NaN, false, null, null);
    }
    private void advance(long millis, BeachRoom.Presence... visitors) {
        while (millis > 0) {
            long step = Math.min(millis, 5_000); clock.addAndGet(step); millis -= step;
            for (var p : visitors) assertNotNull(poll(p));
        }
    }
    @BeforeEach void setup() {
        actor(user("author", false, null));
        when(blocks.excludedIds(anyString())).thenReturn(Set.of());
        for (String room : List.of("room", "other")) {
            when(circles.byId(room)).thenReturn(new CircleService.Circle(room, room, "함께", "life", null, false,
                "open", "public", "", "", "author", 0, 0, 1, 0, false));
            when(circles.member(eq(room), anyString())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
    }

    @Test void capabilitiesAndLiveEventsAreScopedToTheExactCommunityAndMap() {
        for (String map : List.of("beach", "uyuni", "bamboo")) {
            var enter = controller.enter(new BeachController.EnterBody("room", null, map), request, new MockHttpServletResponse());
            assertEquals(map.equals("uyuni"), enter.get("uyuniMomentsEnabled"));
            assertEquals(List.of(), enter.get("uyuniMoments"));
            assertEquals(BeachUyuniMoments.NO_COOLDOWNS, enter.get("uyuniMomentCooldowns"));
        }
        var author = visitor("author"); var observer = visitor("observer");
        var differentRoom = visitor("other", "observer", "uyuni");
        var beachVisitor = visitor("room", "observer", "beach");
        var forestVisitor = visitor("room", "observer", "bamboo");
        var event = spark(author).event();
        assertEquals(List.of(event), poll(author).uyuniMoments());
        assertEquals(List.of(event), poll(observer).uyuniMoments());
        for (var other : List.of(differentRoom, beachVisitor, forestVisitor)) assertEquals(List.of(), poll(other).uyuniMoments());
        for (var other : List.of(beachVisitor, forestVisitor))
            assertEquals(400, assertThrows(ApiException.class, () -> spark(other)).status());
        advance(5_000, author, observer);
        actor(user("late", false, null));
        var late = controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, new MockHttpServletResponse());
        assertEquals(List.of(event), late.get("uyuniMoments"));
        assertEquals(7_000, event.startedAt() + event.durationMs() - (long) late.get("serverTime"));
    }

    @Test void eventUsesTrustedCurrentPositionCanonicalYawAndOnlyTheRelevantPublicFields() throws Exception {
        var p = visitor("author");
        beach.tick(p.ticket(), 2.125, -17.25, Math.PI * 20 + .7, true, null, null);
        var spark = submit(p, UUID.randomUUID().toString());
        assertEquals(p.pid(), spark.event().fromPid()); assertEquals("author", spark.event().fromNick());
        assertEquals(p.x(), spark.event().x()); assertEquals(p.z(), spark.event().z());
        assertEquals(.7, spark.event().yaw(), 1e-12);
        assertEquals(clock.get(), spark.event().startedAt()); assertEquals(12_000, spark.event().durationMs());
        assertNotNull(UUID.fromString(spark.event().id()));
        var json = new ObjectMapper().valueToTree(spark.event());
        assertEquals(10, json.size()); assertFalse(json.has("wish")); assertFalse(json.has("color"));
        assertFalse(json.has("fromId")); assertFalse(json.has("ticket")); assertFalse(json.has("requestId"));
        var lantern = launch(p, UUID.randomUUID().toString(), "lantern", null, "sky", "  ずっと <3 🌟  ");
        assertEquals("ずっと <3 🌟", lantern.event().wish()); assertEquals(40_000, lantern.event().durationMs());
        assertFalse(new ObjectMapper().valueToTree(lantern.event()).has("letter"));
        assertEquals(clock.get() + 4_000, lantern.cooldowns().sparkler());
        assertEquals(clock.get() + 8_000, lantern.cooldowns().lantern());
    }

    @Test void retriesAreActorScopedPayloadBoundAndNeverRestartAnExpiredAnimation() {
        var author = visitor("author"); var other = visitor("other");
        String id = UUID.randomUUID().toString();
        var first = launch(author, id, "lantern", null, "mint", "  쉬어도 괜찮아  ");
        var retry = launch(author, id.toUpperCase(), "lantern", null, "mint", "쉬어도 괜찮아");
        assertEquals(first.event(), retry.event()); assertEquals(first.cooldowns(), retry.cooldowns());
        assertEquals(409, assertThrows(ApiException.class, () -> launch(author, id, "lantern", null, "rose", "쉬어도 괜찮아")).status());
        assertEquals(409, assertThrows(ApiException.class, () -> launch(author, id, "sparkler", "O", null, null)).status());
        var unrelated = launch(other, id, "sparkler", "V", null, null);
        assertNotEquals(first.event().id(), unrelated.event().id()); assertEquals(other.pid(), unrelated.event().fromPid());
        advance(40_000, author, other);
        assertEquals(List.of(), poll(author).uyuniMoments());
        assertEquals(first.event(), launch(author, id, "lantern", null, "mint", "쉬어도 괜찮아").event());
        assertEquals(List.of(), poll(author).uyuniMoments());
    }

    @Test void independentUserCooldownsSurviveNewTabsAndAllowExactBoundaryActions() {
        var p = visitor("author"); var secondTab = visitor("author"); var other = visitor("other");
        spark(p); lantern(p);
        assertEquals(429, assertThrows(ApiException.class, () -> spark(secondTab)).status());
        assertEquals(429, assertThrows(ApiException.class, () -> lantern(secondTab)).status());
        assertDoesNotThrow(() -> spark(other));
        advance(3_999, p, secondTab);
        assertEquals(429, assertThrows(ApiException.class, () -> spark(p)).status());
        advance(1, p, secondTab); assertDoesNotThrow(() -> spark(secondTab));
        advance(3_999, p, secondTab);
        assertEquals(429, assertThrows(ApiException.class, () -> lantern(p)).status());
        advance(1, p, secondTab); assertDoesNotThrow(() -> lantern(p));
        var snapshot = beach.uyuniMoments(secondTab.ticket());
        assertEquals(clock.get() + 8_000, snapshot.cooldowns().lantern());
    }

    @Test void expirationRemovesOnlyFinishedMomentsAndResponseWrappersPreserveState() {
        var p = visitor("author"); var spark = spark(p).event(); var lantern = lantern(p).event();
        advance(11_999, p); assertEquals(List.of(spark, lantern), poll(p).uyuniMoments());
        advance(1, p); var tick = poll(p); assertEquals(List.of(lantern), tick.uyuniMoments());
        assertEquals(tick.uyuniMoments(), tick.withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true).uyuniMoments());
        assertEquals(tick.uyuniMomentCooldowns(), tick.withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true).uyuniMomentCooldowns());
        assertEquals(clock.get(), tick.serverTime());
        advance(28_000, p); assertTrue(poll(p).uyuniMoments().isEmpty());
    }

    @Test void activeEventsAreBoundedPerKindWithoutDiscardingAnExistingVisitorsMoment() {
        var visitors = new ArrayList<BeachRoom.Presence>();
        for (int i = 0; i < 33; i++) visitors.add(visitor("user-" + i));
        var accepted = new ArrayList<BeachUyuniMoments.Event>();
        for (int i = 0; i < 32; i++) { accepted.add(spark(visitors.get(i)).event()); accepted.add(lantern(visitors.get(i)).event()); }
        assertEquals(accepted, poll(visitors.getLast()).uyuniMoments());
        assertEquals(429, assertThrows(ApiException.class, () -> spark(visitors.getLast())).status());
        assertEquals(429, assertThrows(ApiException.class, () -> lantern(visitors.getLast())).status());
        advance(12_000, visitors.toArray(BeachRoom.Presence[]::new));
        assertDoesNotThrow(() -> spark(visitors.getLast()));
        assertEquals(429, assertThrows(ApiException.class, () -> lantern(visitors.getLast())).status());
        assertEquals(33, poll(visitors.getLast()).uyuniMoments().size());
    }

    @Test void blockFilteringWorksInBothDirectionsIncludingAfterTheSenderLeaves() {
        var author = beach.enter("room", "author", "author", Set.of("blocked-by-author"), null, "uyuni");
        var blockedByAuthor = visitor("blocked-by-author");
        var blockedAuthor = beach.enter("room", "blocked-author", "reader", Set.of("author"), null, "uyuni");
        var friend = visitor("friend"); var event = lantern(author).event();
        assertTrue(poll(blockedByAuthor).uyuniMoments().isEmpty()); assertTrue(poll(blockedAuthor).uyuniMoments().isEmpty());
        assertEquals(List.of(event), poll(friend).uyuniMoments());
        beach.leave(author.ticket());
        assertTrue(poll(blockedByAuthor).uyuniMoments().isEmpty()); assertTrue(poll(blockedAuthor).uyuniMoments().isEmpty());
        assertEquals(List.of(event), poll(friend).uyuniMoments());
    }

    @Test void currentSenderBlocksAlsoHideTheirEarlierMoments() {
        var author = visitor("author"); var reader = visitor("reader");
        var first = submit(author, UUID.randomUUID().toString()).event();
        assertEquals(List.of(first), poll(reader).uyuniMoments());
        when(blocks.excludedIds("author")).thenReturn(Set.of("reader"));
        controller.moment(new BeachController.MomentBody(author.ticket(), UUID.randomUUID().toString(), "lantern", null, "amber", "소원"), request);
        assertTrue(poll(reader).uyuniMoments().isEmpty());
        beach.leave(author.ticket());
        assertTrue(poll(reader).uyuniMoments().isEmpty(), "a newly blocked recipient stays hidden after the author leaves");
    }

    @Test void standingIsRequiredForEveryLaunchAndSuspendedVisitsCannotEmit() {
        var p = visitor("author");
        beach.tick(p.ticket(), 7, 7, 0, false, null, null);
        beach.rest(p.ticket(), "lie", BeachRoom.REST_SPOT);
        assertEquals(409, assertThrows(ApiException.class, () -> spark(p)).status());
        beach.rest(p.ticket(), "stand", null); assertDoesNotThrow(() -> spark(p));
        beach.suspend(p.ticket(), p.x(), p.z(), p.yaw(), null);
        assertEquals(409, assertThrows(ApiException.class, () -> lantern(p)).status());
    }

    @Test void sessionMembershipPrivateAccessOwnershipAndBlockedAccountsAreRecheckedOnRetries() {
        var p = visitor("author"); String id = UUID.randomUUID().toString(); submit(p, id);
        actor(null); assertEquals(401, assertThrows(ApiException.class, () -> submit(p, id)).status());
        actor(user("author", true, null)); assertEquals(403, assertThrows(ApiException.class, () -> submit(p, id)).status());
        actor(user("author", false, 1L)); assertEquals(403, assertThrows(ApiException.class, () -> submit(p, id)).status());
        actor(user("other", false, null)); assertEquals(403, assertThrows(ApiException.class, () -> submit(p, id)).status());
        actor(user("author", false, null));
        when(circles.member("room", "author")).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> submit(p, id)).status());
        when(circles.member("room", "author")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        doThrow(ApiException.notFound("찾을 수 없어요.")).when(circles).requireAccess(any(), any());
        assertEquals(404, assertThrows(ApiException.class, () -> submit(p, id)).status());
    }

    @Test void malformedChoicesWishControlsAndOversizeUnicodeFailWithoutConsumingCooldown() {
        var p = visitor("author"); String id = UUID.randomUUID().toString();
        for (String invalid : new String[]{null, "", "love", "l", " O", "F"})
            assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "sparkler", invalid, null, null)).status());
        for (String invalid : new String[]{null, "", "red", "Amber", "rose "})
            assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "lantern", null, invalid, "소원")).status());
        for (String invalid : new String[]{null, "", "  \u00a0  ", "a\nb", "a\u0000b", "a\u202eb", "a\u2028b", "\u200b", "🌟".repeat(81), "a".repeat(81), "\ud800"})
            assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "lantern", null, "mint", invalid)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "sparkler", "L", "rose", null)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "lantern", "L", "rose", "소원")).status());
        assertEquals(BeachUyuniMoments.NO_COOLDOWNS, beach.uyuniMoments(p.ticket()).cooldowns());
        assertEquals("🌟".repeat(80), launch(p, id, "lantern", null, "violet", " \u00a0" + "🌟".repeat(80) + "\u00a0 ").event().wish());
    }

    @Test void malformedJsonTypesAndForgedCoordinatesNeverReachTheEvent() throws Exception {
        var p = visitor("author");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        var mapper = new ObjectMapper();
        for (String field : List.of("kind", "letter", "color", "wish", "requestId", "ticket")) {
            var body = new java.util.LinkedHashMap<String, Object>(Map.of("ticket", p.ticket(), "requestId", UUID.randomUUID().toString(), "kind", "lantern", "color", "rose", "wish", "소원"));
            body.put(field, 7);
            mvc.perform(post("/api/beach/moments").contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body))).andExpect(status().isBadRequest());
        }
        String body = mapper.writeValueAsString(Map.of("ticket", p.ticket(), "requestId", UUID.randomUUID().toString(),
            "kind", "lantern", "color", "amber", "wish", "<3", "x", 999, "yaw", 123, "fromNick", "forged"));
        mvc.perform(post("/api/beach/moments").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.event.fromNick").value("author"))
            .andExpect(jsonPath("$.event.x").value(p.x())).andExpect(jsonPath("$.event.wish").value("<3"))
            .andExpect(jsonPath("$.event.letter").doesNotExist());
    }

    @Test void missingExpiredAndForeignTicketsCannotEmitAndInvalidRequestIdsDoNotReserveState() {
        var p = visitor("author");
        for (String id : new String[]{null, "", "bad", "1-1-1-1-1", "0".repeat(36)})
            assertEquals(400, assertThrows(ApiException.class, () -> launch(p, id, "sparkler", "L", null, null)).status());
        assertEquals(403, assertThrows(ApiException.class, () -> beach.launchUyuniMoment(p.ticket(), "other", UUID.randomUUID().toString(), "sparkler", "L", null, null, Set.of())).status());
        for (String ticket : new String[]{null, "", "unknown"})
            assertEquals(410, assertThrows(ApiException.class, () -> controller.moment(new BeachController.MomentBody(ticket, UUID.randomUUID().toString(), "sparkler", "L", null, null), request)).status());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> spark(p)).status());
    }

    @Test void concurrentRetriesHaveOneEventAndOneCooldown() throws Exception {
        var p = visitor("author"); String id = UUID.randomUUID().toString(); var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var replies = new ArrayList<CompletableFuture<BeachUyuniMoments.Launch>>();
            for (int i = 0; i < 24; i++) replies.add(CompletableFuture.supplyAsync(() -> {
                try { start.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
                return launch(p, id, "sparkler", "E", null, null);
            }, executor));
            start.countDown(); var first = replies.getFirst().get();
            for (var reply : replies) assertEquals(first, reply.get());
            assertEquals(List.of(first.event()), poll(p).uyuniMoments());
            assertEquals(clock.get() + 4_000, first.cooldowns().sparkler());
        }
    }

    @Test void theShortRetryWindowExpiresWithoutRetainingOrReplayingOldMoments() {
        var p = visitor("author"); String id = UUID.randomUUID().toString();
        var first = launch(p, id, "sparkler", "L", null, null);
        advance(BeachUyuniMoments.REQUEST_TTL_MS - 1, p);
        assertEquals(first.event(), launch(p, id, "sparkler", "L", null, null).event());
        assertTrue(poll(p).uyuniMoments().isEmpty());
        advance(1, p);
        assertNotEquals(first.event().id(), launch(p, id, "sparkler", "L", null, null).event().id());
    }

    @Test void launchesBetweenSnapshotLocksCannotPutEventsOrCooldownsAheadOfTickServerTime() {
        var betweenSnapshots = new java.util.concurrent.atomic.AtomicReference<Runnable>();
        var room = new BeachRoom(clock::get, false, BeachMap.UYUNI) {
            @Override public synchronized FireworksState fireworks() {
                var earlierSnapshot = super.fireworks();
                Runnable launch = betweenSnapshots.getAndSet(null);
                if (launch != null) launch.run();
                return earlierSnapshot;
            }
        };
        var author = room.enter("author", "author", Set.of());
        var observer = room.enter("observer", "observer", Set.of());
        betweenSnapshots.set(() -> {
            clock.incrementAndGet();
            room.launchUyuniMoment(author.ticket(), "author", UUID.randomUUID().toString(), "sparkler", "L", null, null, Set.of());
            room.launchUyuniMoment(author.ticket(), "author", UUID.randomUUID().toString(), "lantern", null, "mint", "함께", Set.of());
        });
        var tick = room.tick(author.ticket(), author.x(), author.z(), author.yaw(), false, null, null);
        assertEquals(clock.get(), tick.serverTime());
        assertEquals(2, tick.uyuniMoments().size(), "the snapshot includes the newly accepted moments");
        assertTrue(tick.uyuniMoments().stream().allMatch(event -> event.startedAt() <= tick.serverTime()));
        assertTrue(tick.uyuniMomentCooldowns().sparkler() <= tick.serverTime() + 4_000);
        assertTrue(tick.uyuniMomentCooldowns().lantern() <= tick.serverTime() + 8_000);
        assertEquals(tick.uyuniMoments(), room.tick(observer.ticket(), observer.x(), observer.z(), observer.yaw(), false, null, null).uyuniMoments());
    }
}
