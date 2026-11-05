package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class BeachMapTest {
    private final AtomicLong clock = new AtomicLong(1_000_000);
    private final BeachFireService fire = mock(BeachFireService.class);
    private final BeachService service = new BeachService(clock::get, fire);

    @BeforeEach void fireState() {
        when(fire.snapshot(anyString())).thenAnswer(call -> new BeachFireService.FireView(
            3, 12, .25, "amber", null, clock.get(), clock.get() + 60_000, null, 0));
    }

    private BeachRoom.Presence enter(String map, String user) { return service.enter("room", user, user, Set.of(), null, map); }
    private BeachRoom.TickResult tick(BeachRoom.Presence p) { return service.tick(p.ticket(), 7, 12, .5, false, null, null); }

    @Test void uyuniPromenadeExtendsOnlyTheFrontBoundaryAndStillClampsInvalidCoordinates() {
        var salt = enter("uyuni", "walker");
        var coast = enter("beach", "walker");
        assertTrue(salt.z() >= 2.8 && salt.z() < 4, "The arrival point stays beside the existing hotel approach.");
        service.tick(salt.ticket(), 0, -45, .5, true, null, null);
        service.tick(coast.ticket(), 0, -45, .5, true, null, null);
        assertEquals(-45, salt.z());
        assertEquals(-1, coast.z());
        service.tick(salt.ticket(), 100, -100, .5, true, null, null);
        assertEquals(22, salt.x()); assertEquals(-50, salt.z());
        service.tick(salt.ticket(), Double.NaN, Double.NEGATIVE_INFINITY, .5, false, null, null);
        assertEquals(22, salt.x()); assertEquals(-50, salt.z());
        service.tick(salt.ticket(), -100, 100, .5, true, null, null);
        assertEquals(-22, salt.x()); assertEquals(55, salt.z());
    }

    @Test void uyuniSuspendAndExpiredResumeKeepTheNewPromenadePosition() {
        var salt = enter("uyuni", "returning-walker");
        service.tick(salt.ticket(), -6, -45, .5, true, null, null, null, false, 1L);
        service.suspend(salt.ticket(), -6, -48, .75, 2L);
        assertEquals(-48, salt.z());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        var restored = service.enter("room", "returning-walker", "returning-walker", Set.of(), null, "uyuni", salt.ticket(), 3L);
        assertTrue(restored.resumed());
        assertEquals(-6, restored.presence().x()); assertEquals(-48, restored.presence().z());
        assertEquals("standing", service.tick(restored.presence().ticket(), -6, -48, .75, false, null, null, null, false, 4L).selfRest().pose());
        assertEquals(-48, restored.presence().z());
        verifyNoInteractions(fire);
    }

    @Test void theSameCommunityAndMemberHaveIndependentPlayersCareCountsAndVisitScopes() {
        var coast = enter("beach", "same-member"); var coastFriend = enter("beach", "coast-friend");
        var salt = enter("uyuni", "same-member"); var saltFriend = enter("uyuni", "salt-friend");
        assertNotEquals(coast.ticket(), salt.ticket());
        assertEquals("beach", service.requireVisit(coast.ticket(), "same-member").mapId());
        assertEquals("uyuni", service.requireVisit(salt.ticket(), "same-member").mapId());
        assertEquals(2, service.count("room")); assertEquals(2, service.count("room", "uyuni"));
        assertEquals(Set.of(coastFriend.pid()), tick(coast).players().stream().map(BeachRoom.PlayerView::pid).collect(Collectors.toSet()));
        assertEquals(Set.of(saltFriend.pid()), tick(salt).players().stream().map(BeachRoom.PlayerView::pid).collect(Collectors.toSet()));
        assertEquals("gone", service.tick(coast.ticket(), 7, 12, 0, false, "salt-friend", "comfort").care());
        assertTrue(tick(saltFriend).events().isEmpty());
        assertEquals("sent", service.tick(coast.ticket(), 7, 12, 0, false, "coast-friend", "comfort").care());
        assertEquals(1, tick(coastFriend).received().comfort());
        assertEquals(0, tick(saltFriend).received().comfort());
        assertEquals("sent", service.tick(salt.ticket(), 7, 12, 0, false, "salt-friend", "comfort").care());
        assertEquals(1, tick(saltFriend).received().comfort());
        assertEquals(1, tick(coastFriend).received().comfort());
    }

    @Test void eachMapKeepsItsOwnOneHundredPlaces() {
        for (int i = 0; i < 100; i++) enter("beach", "coast-" + i);
        assertEquals(409, assertThrows(ApiException.class, () -> enter("beach", "overflow")).status());
        for (int i = 0; i < 100; i++) enter("uyuni", "salt-" + i);
        assertEquals(409, assertThrows(ApiException.class, () -> enter("uyuni", "overflow")).status());
        assertEquals(100, service.count("room", "beach")); assertEquals(100, service.count("room", "uyuni"));
        service.enter("another", "elsewhere", "별도", Set.of(), null, "uyuni");
        assertEquals(1, service.count("another", "uyuni"));
    }

    @Test void uyuniNeverReadsTheFireDatabaseAndReturnsFreshDisabledStateOnEveryPoll() {
        var salt = enter("uyuni", "member");
        for (int i = 0; i < 100; i++) {
            clock.incrementAndGet();
            var state = tick(salt);
            var empty = new BeachFireService.FireView(0, 12, 0, "amber", null, clock.get(), null, null, 0, false, null);
            assertEquals(empty, state.fire());
            assertEquals(clock.get(), state.serverTime());
            assertEquals(empty, service.fire("room", "uyuni"));
        }
        verifyNoInteractions(fire);
    }

    @Test void uyuniHasEightStargazingSlotsIndependentOfTheBeachAndRejectsBeachOnlyFacilities() {
        var salt = enter("uyuni", "restrictions");
        tick(salt);
        for (String spot : List.of("hut-pine", "hut-wave", "hut-sunset", "fire-benches", "onsen-benches", "onsen-float")) {
            for (String action : List.of("lie", "sit", "stand"))
                assertEquals(400, assertThrows(ApiException.class, () -> service.rest(salt.ticket(), action, spot)).status());
        }
        assertEquals(400, assertThrows(ApiException.class, () -> service.rest(salt.ticket(), "sit", "starlight")).status());
        for (String map : List.of("beach", "uyuni")) {
            for (int slot = 0; slot < 8; slot++) {
                var p = enter(map, map + slot); tick(p);
                var lying = service.rest(p.ticket(), "lie", "starlight");
                assertEquals(slot, lying.slot()); assertEquals("lying", lying.pose());
                assertEquals(lying, service.rest(p.ticket(), "lie", null));
                assertEquals(lying, service.tick(p.ticket(), -20, 50, 0, true, null, null).selfRest());
            }
            var extra = enter(map, map + "extra"); tick(extra);
            assertEquals(409, assertThrows(ApiException.class, () -> service.rest(extra.ticket(), "lie", null)).status());
        }
        var otherRoom = new BeachRoom(clock::get, false, BeachMap.UYUNI);
        var direct = otherRoom.enter("direct", "직접", Set.of());
        otherRoom.tick(direct.ticket(), 7, 12, .75, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> otherRoom.rest(direct.ticket(), "sit", "fire-benches")).status());
        assertEquals(0, otherRoom.rest(direct.ticket(), "lie", null).slot());
        assertEquals(new BeachRoom.RestPresence("standing", null, null, 7, 12, .75), otherRoom.rest(direct.ticket(), "stand", null));
    }

    @Test void uyuniRejectsWoodAndPowderBeforeAnyMutationEvenAtTheFormerFirePosition() {
        var salt = enter("uyuni", "member");
        service.tick(salt.ticket(), 0, 12, 0, false, null, null);
        String id = UUID.randomUUID().toString();
        assertEquals(400, assertThrows(ApiException.class, () -> service.addWood(salt.ticket(), "member", id)).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.addPowder(salt.ticket(), "member", id, "rose")).status());
        assertEquals(403, assertThrows(ApiException.class, () -> service.addWood(salt.ticket(), "other", id)).status());
        clock.addAndGet(BeachRoom.IDLE_MS + 1);
        assertEquals(410, assertThrows(ApiException.class, () -> service.addPowder(salt.ticket(), "member", id, "rose")).status());
        verifyNoInteractions(fire);
    }

    @Test void lightingFireworksCooldownAndRetryIdsBelongToTheMapNotJustTheCommunity() {
        var coast = enter("beach", "operator"); var salt = enter("uyuni", "operator");
        var selected = service.setLighting(salt.ticket(), "operator", "night");
        assertEquals(selected, tick(salt).lighting());
        assertEquals(BeachRoom.AUTO_LIGHTING, tick(coast).lighting());
        assertEquals(selected, service.lighting("room", "uyuni"));
        assertEquals(BeachRoom.AUTO_LIGHTING, service.lighting("room"));
        String retryId = UUID.randomUUID().toString();
        var saltShow = service.launchFireworks(salt.ticket(), "operator", retryId, "love");
        assertEquals(List.of(saltShow.event()), tick(salt).fireworks());
        assertTrue(tick(coast).fireworks().isEmpty());
        assertEquals(0, tick(coast).fireworksCooldownUntil());
        var coastShow = service.launchFireworks(coast.ticket(), "operator", retryId, "songi");
        assertNotEquals(saltShow.event().id(), coastShow.event().id());
        assertEquals("songi", coastShow.event().variant());
        assertEquals(saltShow.event(), service.launchFireworks(salt.ticket(), "operator", retryId, "festival").event());
        var late = enter("uyuni", "late");
        assertEquals(selected, tick(late).lighting());
        assertEquals(List.of(saltShow.event()), tick(late).fireworks());
        assertEquals(List.of(coastShow.event()), service.fireworks("room").events());
    }

    @Test void leavingAndExpiryOnlyReleaseTheTicketOwningMap() {
        var coast = enter("beach", "same"); var salt = enter("uyuni", "same");
        service.leave(salt.ticket());
        assertNull(tick(salt)); assertNotNull(tick(coast));
        assertEquals(1, service.count("room", "beach")); assertEquals(0, service.count("room", "uyuni"));
        var freshSalt = enter("uyuni", "same");
        clock.addAndGet(9_000); tick(coast); clock.addAndGet(1_001);
        assertNull(tick(freshSalt)); assertNotNull(tick(coast));
        assertEquals(410, assertThrows(ApiException.class, () -> service.rest(freshSalt.ticket(), "lie", null)).status());
        assertEquals(1, service.count("room")); assertEquals(0, service.count("room", "uyuni"));
    }

    @Test void bambooTrailIsItsOwnRoomWithPavilionSeatsAndNoOtherFacilities() {
        var forest = enter("bamboo", "walker");
        var coast = enter("beach", "walker");
        assertTrue(forest.z() >= 2.8 && forest.z() < 4, "The trailhead reuses the shared arrival point.");
        assertEquals("bamboo", service.requireVisit(forest.ticket(), "walker").mapId());
        assertEquals(1, service.count("room", "bamboo")); assertEquals(1, service.count("room", "beach"));
        service.tick(forest.ticket(), 0, -40, .5, true, null, null);
        assertEquals(-4, forest.z(), "the forest only has a little room behind its entrance");
        assertEquals(1, tick(coast).count());
        assertTrue(tick(forest).players().isEmpty(), "the same member on the beach is not in the forest");
        var empty = new BeachFireService.FireView(0, 12, 0, "amber", null, clock.get(), null, null, 0, false, null);
        assertEquals(empty, tick(forest).fire());
        for (String spot : List.of("starlight", "hut-pine", "fire-benches", "onsen-benches", "hotel-dawn"))
            assertEquals(400, assertThrows(ApiException.class, () -> service.rest(forest.ticket(), "lie", spot)).status(), spot);
        service.tick(forest.ticket(), 30.58 - .3, 48.3 + .2, 0, false, null, null);
        assertEquals(400, assertThrows(ApiException.class, () -> service.rest(forest.ticket(), "sit", "pavilion-wind")).status(), "mirrored x is far from the meadow pavilion");
        service.tick(forest.ticket(), -30.58 + .3, 48.3 + .2, 0, false, null, null);
        var seated = service.rest(forest.ticket(), "sit", "pavilion-wind");
        assertEquals(new BeachRoom.RestPresence("sitting", "pavilion-wind", 0, -30.58, 48.3, -Math.PI / 2), seated);
        assertEquals(seated, service.tick(forest.ticket(), 0, 0, 0, true, null, null).selfRest(), "ticks cannot move a seated visitor");
        assertEquals(400, assertThrows(ApiException.class, () -> service.rest(coast.ticket(), "sit", "pavilion-wind")).status(), "pavilions are not on the beach");
        String id = UUID.randomUUID().toString();
        assertEquals(400, assertThrows(ApiException.class, () -> service.addWood(forest.ticket(), "walker", id)).status());
        verify(fire, never()).addWood(anyString(), anyString(), anyString());
    }

    @Test void absentMapUsesTheLegacyBeachAndUnsupportedNamesCannotCreateAliases() {
        service.enter("room", "legacy", "기존", Set.of());
        enter("beach", "explicit");
        assertEquals(2, service.count("room")); assertEquals(2, service.count("room", "beach"));
        for (String invalid : List.of("", "UYUNI", "uyuni ", "room:uyuni", "beach/../uyuni", "other")) {
            assertEquals(400, assertThrows(ApiException.class, () -> enter(invalid, "forged")).status());
            assertEquals(400, assertThrows(ApiException.class, () -> service.count("room", invalid)).status());
            assertEquals(400, assertThrows(ApiException.class, () -> service.fire("room", invalid)).status());
            assertEquals(400, assertThrows(ApiException.class, () -> service.lighting("room", invalid)).status());
            assertEquals(400, assertThrows(ApiException.class, () -> service.fireworks("room", invalid)).status());
        }
        assertEquals(0, service.count("room", "uyuni")); verifyNoInteractions(fire);
    }
}
