package kr.co.shuim.beach;

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
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BeachFireworksTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final AuthService auth = mock(AuthService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = new BeachService(clock::get, new BeachFireService(new TestFireRepository(), clock::get));
    private final BeachController controller = new BeachController(auth, mock(BlockService.class), beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private DbUser user(String id, String role, boolean anonymous, Long blockedAt) {
        return new DbUser(id, id + "@example.com", id, role, anonymous, blockedAt, null, 0);
    }
    private void actor(DbUser user) {
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(user));
        when(auth.requireUser(any(), any())).thenReturn(user);
    }
    private BeachRoom.Presence visitor(String room, String user) { return beach.enter(room, user, user, Set.of()); }
    private BeachRoom.Presence visitor(String room, String user, String map) { return beach.enter(room, user, user, Set.of(), null, map); }
    private BeachRoom.FireworkLaunch launch(BeachRoom.Presence visitor, String requestId) {
        return controller.fireworks(new BeachController.FireworksBody(visitor.ticket(), requestId), request);
    }
    private BeachRoom.FireworkLaunch launch(BeachRoom.Presence visitor, String requestId, String variant) {
        return controller.fireworks(new BeachController.FireworksBody(visitor.ticket(), requestId, variant), request);
    }
    private BeachRoom.TickResult poll(BeachRoom.Presence visitor) {
        return controller.tick(new BeachController.TickBody(visitor.ticket(), null, null, null, false, null), request);
    }
    private void advance(long millis, BeachRoom.Presence... visitors) {
        while (millis > 0) {
            long step = Math.min(millis, 5_000); clock.addAndGet(step); millis -= step;
            for (var visitor : visitors) poll(visitor);
        }
    }

    @BeforeEach
    void setup() {
        when(auth.isAdmin(any())).thenCallRealMethod();
        for (String room : List.of("room", "other")) {
            when(circles.byId(room)).thenReturn(new CircleService.Circle(room, room, "함께", "life", null, false,
                "open", "public", "", "", "operator", 0, 0, 1, 0, false));
            when(circles.member(eq(room), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
        actor(user("operator", "admin", false, null));
    }

    @Test
    void onlyAuthenticatedAdministratorsReceiveTheIndependentFireworksControl() {
        for (var user : List.of(user("regular", "user", false, null), user("guest", "admin", true, null),
            user("operator", "admin", false, null))) {
            actor(user);
            var entry = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
            assertEquals(auth.isAdmin(user), entry.get("fireworksControl"));
            assertEquals(List.of(), entry.get("fireworks"));
            assertEquals(0L, entry.get("fireworksCooldownUntil"));
        }
    }

    @Test
    void everyVisitorAndLateJoinerSeesTheSameServerEventOnlyInItsRoom() {
        var admin = visitor("room", "operator");
        var observer = visitor("room", "observer");
        var elsewhere = visitor("other", "operator");
        var result = launch(admin, UUID.randomUUID().toString());
        assertEquals(12_000, result.event().durationMs());
        assertEquals("festival", result.event().variant());
        assertEquals(clock.get(), result.event().startedAt());
        assertEquals(clock.get(), result.serverTime());
        assertEquals(clock.get() + 15_000, result.cooldownUntil());
        assertTrue(result.event().seed() > 0);
        assertNotNull(UUID.fromString(result.event().id()));
        assertEquals(List.of(result.event()), poll(observer).fireworks());
        assertEquals(List.of(), poll(elsewhere).fireworks());
        assertEquals(0, poll(elsewhere).fireworksCooldownUntil());
        var late = controller.enter(new BeachController.EnterBody("room"), request, new MockHttpServletResponse());
        assertEquals(List.of(result.event()), late.get("fireworks"));
        assertEquals(result.cooldownUntil(), late.get("fireworksCooldownUntil"));
    }

    @Test
    void allThreeVariantsReachObserversAndRetriesCannotChangeTheOriginalStyle() {
        var admin = visitor("room", "operator");
        var observer = visitor("room", "observer");
        for (String variant : List.of("festival", "songi", "love")) {
            String requestId = UUID.randomUUID().toString();
            var result = launch(admin, requestId, variant);
            assertEquals(variant, result.event().variant());
            assertEquals(12_000, result.event().durationMs());
            assertEquals(clock.get() + 15_000, result.cooldownUntil());
            assertEquals(List.of(result.event()), poll(observer).fireworks());
            for (String retryVariant : List.of("festival", "songi", "love")) {
                var retry = launch(admin, requestId, retryVariant);
                assertEquals(result.event(), retry.event());
                assertEquals(result.cooldownUntil(), retry.cooldownUntil());
            }
            advance(15_000, admin, observer);
            assertEquals(result.event(), launch(admin, requestId, "love").event());
            assertEquals(List.of(), poll(observer).fireworks(), "an expired variant retry does not create a new show");
        }
    }

    @Test
    void malformedJsonVariantsCannotConsumeTheCooldownOrOverwriteAnIdempotentRequest() throws Exception {
        var admin = visitor("room", "operator");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String requestId = UUID.randomUUID().toString();
        for (String invalid : List.of("null", "\"\"", "\"Festival\"", "\"love \"", "\"custom\"", "7", "true", "{}", "[]")) {
            mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + admin.ticket() + "\",\"requestId\":\"" + requestId + "\",\"variant\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        }
        assertEquals(List.of(), beach.fireworks("room").events());
        assertEquals(0, beach.fireworks("room").cooldownUntil());
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON)
            .content("{\"ticket\":\"" + admin.ticket() + "\",\"requestId\":\"" + requestId + "\",\"variant\":\"songi\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.event.variant").value("songi"));
        assertEquals(400, assertThrows(ApiException.class, () -> launch(admin, requestId, "unknown")).status());
        assertEquals("songi", launch(admin, requestId, "love").event().variant());
    }

    @Test
    void retriesStayIdempotentAfterExpiryAndCannotReplaceANewerEventOrExtendItsCooldown() {
        var admin = visitor("room", "operator");
        String id = UUID.randomUUID().toString();
        var first = launch(admin, id);
        advance(8_000, admin);
        assertEquals(first.event(), launch(admin, id.toUpperCase()).event());
        assertEquals(first.cooldownUntil(), poll(admin).fireworksCooldownUntil());
        advance(7_000, admin);
        assertEquals(List.of(), poll(admin).fireworks(), "expired events are not replayed by polling");
        assertEquals(first.event(), launch(admin, id).event());
        assertEquals(List.of(), poll(admin).fireworks(), "retrying an old request does not reactivate its animation");
        var second = launch(admin, UUID.randomUUID().toString());
        var delayedRetry = launch(admin, id);
        assertEquals(first.event(), delayedRetry.event());
        assertEquals(second.cooldownUntil(), delayedRetry.cooldownUntil());
        assertEquals(List.of(second.event()), poll(admin).fireworks(), "out-of-order retries cannot replace current room state");
        assertTrue(second.event().startedAt() > first.event().startedAt());
    }

    @Test
    void animationExpiresExactlyAtTwelveSecondsWhileRoomCooldownLastsFifteen() {
        var admin = visitor("room", "operator");
        var first = launch(admin, UUID.randomUUID().toString());
        advance(11_999, admin);
        assertEquals(List.of(first.event()), poll(admin).fireworks());
        advance(1, admin);
        assertEquals(List.of(), poll(admin).fireworks());
        assertEquals(429, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString())).status());
        advance(2_999, admin);
        assertEquals(429, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString())).status());
        advance(1, admin);
        assertNotEquals(first.event().id(), launch(admin, UUID.randomUUID().toString()).event().id());
    }

    @Test
    void currentRoleMembershipAndAccountRestrictionsAreRecheckedEvenForRetries() {
        var admin = visitor("room", "operator");
        String id = UUID.randomUUID().toString();
        var first = launch(admin, id);
        for (var denied : List.of(user("operator", "user", false, null), user("operator", "admin", true, null),
            user("operator", "admin", false, 1L))) {
            actor(denied);
            assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, id)).status());
        }
        actor(user("operator", "admin", false, null));
        when(circles.member("room", "operator")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, id)).status());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, id)).status());
        assertEquals(List.of(first.event()), beach.fireworks("room").events());
    }

    @Test
    void missingSessionsForeignTicketsAndExpiredVisitsCannotLaunch() {
        var admin = visitor("room", "operator");
        var foreign = visitor("other", "someone-else");
        actor(null);
        assertEquals(401, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString())).status());
        actor(user("operator", "admin", false, null));
        assertEquals(403, assertThrows(ApiException.class, () -> launch(foreign, UUID.randomUUID().toString())).status());
        for (String ticket : new String[]{null, "", "unknown"}) {
            assertEquals(410, assertThrows(ApiException.class, () -> controller.fireworks(new BeachController.FireworksBody(ticket, UUID.randomUUID().toString()), request)).status());
        }
        beach.leave(admin.ticket());
        assertEquals(410, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString())).status());
        var expired = visitor("room", "operator");
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> launch(expired, UUID.randomUUID().toString())).status());
        assertEquals(List.of(), beach.fireworks("room").events());
        assertEquals(List.of(), beach.fireworks("other").events());
    }

    @Test
    void concurrentRetriesCreateOneEventAndDifferentRequestsShareTheRoomCooldown() throws Exception {
        var admin = visitor("room", "operator");
        String id = UUID.randomUUID().toString();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            List<CompletableFuture<BeachRoom.FireworkLaunch>> results = new ArrayList<>();
            for (int i = 0; i < 16; i++) results.add(CompletableFuture.supplyAsync(() -> {
                try { start.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
                return beach.launchFireworks(admin.ticket(), "operator", id);
            }, executor));
            start.countDown();
            var first = results.getFirst().get().event();
            for (var result : results) assertEquals(first, result.get().event());
            assertEquals(List.of(first), poll(admin).fireworks());
        }
        var secondAdmin = visitor("room", "other-admin");
        assertEquals(429, assertThrows(ApiException.class, () -> beach.launchFireworks(secondAdmin.ticket(), "other-admin", UUID.randomUUID().toString())).status());
    }

    @Test
    void ordinaryPollsUseCurrentServerTimeAndPreserveTheEventAcrossResponseWrappers() {
        var admin = visitor("room", "operator");
        var event = launch(admin, UUID.randomUUID().toString()).event();
        var first = poll(admin);
        clock.addAndGet(500);
        clearInvocations(auth, circles);
        var cached = poll(admin);
        assertEquals(first.fire().serverTime(), cached.fire().serverTime(), "the persistent fire snapshot still uses its existing cache");
        assertEquals(clock.get(), cached.serverTime(), "animation time must not inherit the cached fire's older timestamp");
        assertEquals(List.of(event), cached.withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true).fireworks());
        verifyNoInteractions(auth, circles);
    }

    @Test
    void jsonValidationRejectsBadKeysAndForgedPermissionsCannotSelectAnotherRoom() throws Exception {
        var admin = visitor("room", "operator");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String invalid : List.of("null", "\"\"", "\"1-1-1-1-1\"", "\"not-a-uuid\"", "7", "true", "{}", "[]")) {
            mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + admin.ticket() + "\",\"requestId\":" + invalid + "}"))
                .andExpect(status().isBadRequest());
        }
        String forged = """
            {"ticket":"%s","requestId":"%s","communityId":"other","fireworksControl":true,
             "lightingControl":true,"admin":true,"seed":5,"durationMs":999999,"startedAt":0}
            """.formatted(admin.ticket(), UUID.randomUUID());
        actor(user("operator", "user", false, null));
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(forged))
            .andExpect(status().isForbidden());
        actor(user("operator", "admin", false, null));
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(forged))
            .andExpect(status().isOk()).andExpect(jsonPath("$.event.durationMs").value(12000))
            .andExpect(jsonPath("$.event.variant").value("festival"))
            .andExpect(jsonPath("$.event.startedAt").value(clock.get()))
            .andExpect(jsonPath("$.serverTime").value(clock.get()))
            .andExpect(jsonPath("$.cooldownUntil").value(clock.get() + 15000));
        assertEquals(List.of(), beach.fireworks("other").events());
        advance(12_000, admin);
        mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON).content("{\"ticket\":\"" + admin.ticket() + "\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.fireworks.length()").value(0))
            .andExpect(jsonPath("$.fireworksCooldownUntil").value(1_015_000));
    }

    @Test
    void uyuniAdministratorLaunchIsSharedWithOrdinaryAndLateSpectatorsButNeverOtherMapsOrCommunities() throws Exception {
        var admin = visitor("room", "operator", "uyuni");
        var observer = visitor("room", "observer", "uyuni");
        var coast = visitor("room", "operator", "beach");
        var forest = visitor("room", "observer", "bamboo");
        var elsewhere = visitor("other", "observer", "uyuni");
        String requestId = UUID.randomUUID().toString();
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String body = """
            {"ticket":"%s","requestId":"%s","variant":"festival","mapId":"beach","communityId":"other"}
            """.formatted(admin.ticket(), requestId);
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.event.variant").value("festival"))
            .andExpect(jsonPath("$.event.durationMs").value(12000))
            .andExpect(jsonPath("$.event.startedAt").value(clock.get()));
        var show = beach.fireworks("room", "uyuni").events().getFirst();
        actor(user("observer", "user", false, null));
        assertEquals(List.of(show), poll(observer).fireworks(), "watching the shared show does not require an administrator role");
        for (var other : List.of(coast, forest, elsewhere)) {
            assertTrue(poll(other).fireworks().isEmpty());
            assertEquals(0, poll(other).fireworksCooldownUntil());
        }
        advance(5_000, admin, observer, coast, forest, elsewhere);
        var late = controller.enter(new BeachController.EnterBody("room", null, "uyuni"), request, new MockHttpServletResponse());
        assertEquals(false, late.get("fireworksControl"));
        assertEquals(List.of(show), late.get("fireworks"));
        assertEquals(7_000, show.startedAt() + show.durationMs() - (long) late.get("serverTime"));
        actor(user("operator", "admin", false, null));
        var coastShow = launch(coast, requestId, "songi");
        assertNotEquals(show.id(), coastShow.event().id(), "same retry UUID in a different map does not alias another room's show");
        assertEquals(List.of(show), poll(observer).fireworks());
        assertEquals(List.of(coastShow.event()), poll(coast).fireworks());
        assertTrue(poll(elsewhere).fireworks().isEmpty());
    }

    @Test
    void uyuniLaunchRechecksAdministratorMembershipPrivateAccessAndVisitOwnershipEvenForRetries() throws Exception {
        var admin = visitor("room", "operator", "uyuni");
        var ordinary = visitor("room", "ordinary", "uyuni");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        String requestId = UUID.randomUUID().toString();
        String ordinaryBody = """
            {"ticket":"%s","requestId":"%s","variant":"festival","fireworksControl":true,"admin":true}
            """.formatted(ordinary.ticket(), requestId);
        actor(user("ordinary", "user", false, null));
        mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(ordinaryBody))
            .andExpect(status().isForbidden());
        assertTrue(beach.fireworks("room", "uyuni").events().isEmpty());
        actor(user("operator", "admin", false, null));
        assertEquals(403, assertThrows(ApiException.class, () -> launch(ordinary, requestId)).status(), "an administrator still cannot use another person's visit");
        var first = launch(admin, requestId);
        for (var denied : List.of(user("operator", "user", false, null), user("operator", "admin", true, null),
            user("operator", "admin", false, 1L))) {
            actor(denied);
            assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, requestId)).status());
        }
        actor(null);
        assertEquals(401, assertThrows(ApiException.class, () -> launch(admin, requestId)).status());
        actor(user("operator", "admin", false, null));
        when(circles.member("room", "operator")).thenReturn(Optional.empty());
        assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, requestId)).status());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "pending", false, false)));
        assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, requestId)).status());
        when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        doThrow(ApiException.notFound("찾을 수 없어요.")).when(circles).requireAccess(any(), any());
        assertEquals(404, assertThrows(ApiException.class, () -> launch(admin, requestId)).status());
        assertEquals(List.of(first.event()), beach.fireworks("room", "uyuni").events(), "denied retries never replace or restart the accepted show");
        assertEquals(first.cooldownUntil(), beach.fireworks("room", "uyuni").cooldownUntil());
    }

    @Test
    void uyuniRetriesAndExpirationPreserveIndependentWishLanternsAndSpectatorSnapshots() {
        var admin = visitor("room", "operator", "uyuni");
        var observer = visitor("room", "observer", "uyuni");
        String requestId = UUID.randomUUID().toString();
        var lantern = beach.launchUyuniMoment(observer.ticket(), "observer", UUID.randomUUID().toString(), "lantern", null, "rose", "함께 쉬어요", Set.of());
        var first = launch(admin, requestId, "festival");
        advance(3_000, admin, observer);
        var retry = launch(admin, requestId.toUpperCase(), "love");
        assertEquals(first.event(), retry.event());
        assertEquals(first.cooldownUntil(), retry.cooldownUntil());
        var snapshot = poll(observer).withCareCapabilities(new BeachRoom.CareCapabilities(false, false), true);
        assertEquals(List.of(first.event()), snapshot.fireworks());
        assertEquals(List.of(lantern.event()), snapshot.uyuniMoments());
        assertEquals(clock.get(), snapshot.serverTime());
        advance(9_000, admin, observer);
        assertTrue(poll(observer).fireworks().isEmpty());
        assertEquals(List.of(lantern.event()), poll(observer).uyuniMoments());
        assertEquals(first.event(), launch(admin, requestId).event(), "an expired retry is still the original response");
        assertTrue(poll(observer).fireworks().isEmpty(), "the response does not restart the expired show");
        assertEquals(429, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString())).status());
        advance(3_000, admin, observer);
        var next = launch(admin, UUID.randomUUID().toString());
        assertNotEquals(first.event().id(), next.event().id());
        assertEquals(List.of(next.event()), poll(observer).fireworks());
        assertEquals(List.of(lantern.event()), poll(observer).uyuniMoments());
    }

    @Test
    void newUyuniVariantsRoundTripThroughLaunchTickAndLateEnterWithTheOriginalTimingAndRetryIdentity() throws Exception {
        var admin = visitor("room", "operator", "uyuni");
        var observer = visitor("room", "observer", "uyuni");
        var coast = visitor("room", "observer", "beach");
        var forest = visitor("room", "observer", "bamboo");
        var elsewhere = visitor("other", "observer", "uyuni");
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String variant : List.of("bloom", "saturn", "willow", "stardust")) {
            actor(user("operator", "admin", false, null));
            String requestId = UUID.randomUUID().toString();
            long startedAt = clock.get();
            String body = """
                {"ticket":"%s","requestId":"%s","variant":"%s"}
                """.formatted(admin.ticket(), requestId, variant);
            mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.event.variant").value(variant))
                .andExpect(jsonPath("$.event.durationMs").value(12000))
                .andExpect(jsonPath("$.event.startedAt").value(startedAt))
                .andExpect(jsonPath("$.serverTime").value(startedAt))
                .andExpect(jsonPath("$.cooldownUntil").value(startedAt + 15000));
            var event = beach.fireworks("room", "uyuni").events().getFirst();
            advance(5_000, admin, observer, coast, forest, elsewhere);
            var retry = launch(admin, requestId.toUpperCase(), "festival");
            assertEquals(event, retry.event(), "a changed retry cannot restyle or restart the accepted Uyuni show");
            assertEquals(startedAt + 15000, retry.cooldownUntil());
            actor(user("observer", "user", false, null));
            mvc.perform(post("/api/beach/tick").contentType(MediaType.APPLICATION_JSON)
                .content("{\"ticket\":\"" + observer.ticket() + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fireworks.length()").value(1))
                .andExpect(jsonPath("$.fireworks[0].id").value(event.id()))
                .andExpect(jsonPath("$.fireworks[0].variant").value(variant))
                .andExpect(jsonPath("$.fireworks[0].startedAt").value(startedAt));
            mvc.perform(post("/api/beach/enter").contentType(MediaType.APPLICATION_JSON)
                .content("{\"communityId\":\"room\",\"mapId\":\"uyuni\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fireworksControl").value(false))
                .andExpect(jsonPath("$.fireworks.length()").value(1))
                .andExpect(jsonPath("$.fireworks[0].id").value(event.id()))
                .andExpect(jsonPath("$.fireworks[0].variant").value(variant))
                .andExpect(jsonPath("$.fireworks[0].startedAt").value(startedAt))
                .andExpect(jsonPath("$.fireworks[0].durationMs").value(12000))
                .andExpect(jsonPath("$.serverTime").value(startedAt + 5000));
            for (var other : List.of(coast, forest, elsewhere)) {
                assertTrue(poll(other).fireworks().isEmpty());
                assertEquals(0, poll(other).fireworksCooldownUntil());
            }
            advance(7_000, admin, observer, coast, forest, elsewhere);
            assertTrue(poll(observer).fireworks().isEmpty());
            actor(user("operator", "admin", false, null));
            assertEquals(event, launch(admin, requestId, variant).event());
            assertTrue(poll(observer).fireworks().isEmpty(), "an expired retry must not replay the show");
            assertEquals(429, assertThrows(ApiException.class, () -> launch(admin, UUID.randomUUID().toString(), variant)).status());
            advance(3_000, admin, observer, coast, forest, elsewhere);
        }
    }

    @Test
    void newVariantsRejectBeachAndBambooTicketsDespiteForgedMapAndKeepAllOriginalVariantsWorking() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();
        for (String map : List.of("beach", "bamboo")) {
            var admin = visitor("room", "operator", map);
            String requestId = UUID.randomUUID().toString();
            for (String variant : List.of("bloom", "saturn", "willow", "stardust")) {
                String forged = """
                    {"ticket":"%s","requestId":"%s","variant":"%s","mapId":"uyuni"}
                    """.formatted(admin.ticket(), requestId, variant);
                mvc.perform(post("/api/beach/fireworks").contentType(MediaType.APPLICATION_JSON).content(forged))
                    .andExpect(status().isBadRequest());
            }
            assertTrue(beach.fireworks("room", map).events().isEmpty());
            assertEquals(0, beach.fireworks("room", map).cooldownUntil());
            for (String variant : List.of("festival", "songi", "love")) {
                var accepted = launch(admin, requestId, variant);
                assertEquals(variant, accepted.event().variant());
                assertEquals(12_000, accepted.event().durationMs());
                assertEquals(clock.get() + 15_000, accepted.cooldownUntil());
                for (String denied : List.of("bloom", "saturn", "willow", "stardust")) {
                    String originalId = requestId;
                    assertEquals(400, assertThrows(ApiException.class, () -> launch(admin, originalId, denied)).status(),
                        "an existing request identity cannot bypass the ticket's map restriction");
                }
                assertEquals(List.of(accepted.event()), poll(admin).fireworks());
                advance(15_000, admin);
                requestId = UUID.randomUUID().toString();
            }
        }
    }

    @Test
    void newUyuniVariantsStillRequireAnOwnedVisitAndCurrentAdministratorMembership() {
        var admin = visitor("room", "operator", "uyuni");
        var foreign = visitor("room", "someone-else", "uyuni");
        for (String variant : List.of("bloom", "saturn", "willow", "stardust")) {
            String requestId = UUID.randomUUID().toString();
            actor(user("operator", "user", false, null));
            assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, requestId, variant)).status());
            actor(user("operator", "admin", false, null));
            assertEquals(403, assertThrows(ApiException.class, () -> launch(foreign, requestId, variant)).status());
            when(circles.member("room", "operator")).thenReturn(Optional.empty());
            assertEquals(403, assertThrows(ApiException.class, () -> launch(admin, requestId, variant)).status());
            when(circles.member("room", "operator")).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
        }
        assertTrue(beach.fireworks("room", "uyuni").events().isEmpty());
        assertEquals(0, beach.fireworks("room", "uyuni").cooldownUntil());
    }
}
