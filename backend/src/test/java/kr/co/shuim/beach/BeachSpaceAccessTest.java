package kr.co.shuim.beach;

import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.common.SpaceCapacity;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 공용 공간은 누구나, 소로우 공간은 그 멤버만. 소로우 공간의 풍경은 멤버가 늘수록 하나씩 열린다. */
class BeachSpaceAccessTest {
    private final AuthService auth = mock(AuthService.class);
    private final BlockService blocks = mock(BlockService.class);
    private final CircleService circles = mock(CircleService.class);
    private final BeachService beach = new BeachService(new BeachFireService(new TestFireRepository()));
    private final BeachController controller = new BeachController(auth, blocks, beach, circles);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    private static DbUser user(String id, boolean blocked) {
        return new DbUser(id, null, id, "user", false, blocked ? 1L : null, null, 0);
    }

    private void actor(DbUser user) {
        when(auth.requireUser(any(), any())).thenReturn(user);
        when(auth.currentUser(any())).thenReturn(Optional.of(user));
    }

    private void circle(String id, int members, boolean privateTest) {
        when(circles.byId(id)).thenReturn(new CircleService.Circle(id, id, "함께 소로우", "life", null, false, "open", "public",
            "", "", "owner", 0, 0, members, 0, false, privateTest, false, privateTest ? 4 : SpaceCapacity.MAX));
        when(circles.member(eq(id), any())).thenReturn(Optional.of(new CircleService.Member("member", "active", false, false)));
    }

    private Map<String, Object> enter(String spaceId, String mapId) {
        return controller.enter(new BeachController.EnterBody(spaceId, null, mapId), request, new MockHttpServletResponse());
    }

    private int enterStatus(String spaceId, String mapId) {
        return assertThrows(ApiException.class, () -> enter(spaceId, mapId)).status();
    }

    @Test
    void theOrderOfOpeningCoversEveryMapOnce() {
        assertEquals(Arrays.stream(BeachMap.values()).map(BeachMap::id).toList(), SpaceMaps.ORDER);
    }

    @Test
    void mapsOpenOneByOneEachTimeTheCircleOutgrowsAFullMap() {
        assertEquals(List.of(0, 21, 41, 61, 81, 101), SpaceMaps.ORDER.stream().map(SpaceMaps::membersToOpen).toList());
        assertTrue(SpaceMaps.open("beach", 0));
        assertFalse(SpaceMaps.open("uyuni", 20));
        assertTrue(SpaceMaps.open("uyuni", 21));
        assertFalse(SpaceMaps.open("baikal", 100));
        assertTrue(SpaceMaps.open("baikal", 101));
        assertThrows(IllegalArgumentException.class, () -> SpaceMaps.membersToOpen("moon"));
    }

    @Test
    void anyoneEntersEveryMapOfThePublicSpaceWithoutJoiningACircle() {
        actor(user("stranger", false));
        for (BeachMap map : BeachMap.values()) {
            Map<String, Object> entered = enter(SpaceMaps.PUBLIC_ID, map.id());
            assertEquals(SpaceMaps.PUBLIC_ID, entered.get("communityId"));
            assertEquals(map.id(), entered.get("mapId"));
            assertEquals(true, entered.get("shared"));
            assertEquals(Map.of("id", SpaceMaps.PUBLIC_ID, "slug", "", "name", SpaceMaps.PUBLIC_NAME), entered.get("community"));
            assertEquals(SpaceCapacity.MAX, entered.get("capacity"));
            assertEquals(1, controller.count(SpaceMaps.PUBLIC_ID, map.id(), request).get("count"));
        }
        verifyNoInteractions(circles);
    }

    @Test
    void thePublicSpaceStillRefusesRestrictedAccountsAndAsksForTheCommunityRulesFirst() {
        actor(user("blocked", true));
        assertEquals(403, enterStatus(SpaceMaps.PUBLIC_ID, "beach"));

        CommunityConsentService consent = mock(CommunityConsentService.class);
        controller.setConsent(consent);
        DbUser newcomer = user("newcomer", false);
        actor(newcomer);
        assertEquals(409, enterStatus(SpaceMaps.PUBLIC_ID, "beach"));
        assertEquals(0, beach.count(SpaceMaps.PUBLIC_ID, "beach"));
        when(consent.accepted(newcomer)).thenReturn(true);
        assertEquals(true, enter(SpaceMaps.PUBLIC_ID, "beach").get("shared"));

        // 소로우 공간은 가입할 때 이미 동의를 받았으므로 다시 묻지 않는다.
        circle("circle-a", 3, false);
        actor(user("member", false));
        assertEquals(false, enter("circle-a", "beach").get("shared"));
        verify(consent, never()).accepted(argThat(u -> "member".equals(u.id())));
    }

    @Test
    void strangersInThePublicSpaceCanComfortEachOtherAndKeepTheirOwnVisit() {
        DbUser sender = user("sender", false);
        actor(sender);
        String ticket = (String) enter(SpaceMaps.PUBLIC_ID, "beach").get("ticket");
        actor(user("target", false));
        enter(SpaceMaps.PUBLIC_ID, "beach");

        actor(sender);
        BeachRoom.TickResult sent = controller.tick(new BeachController.TickBody(ticket, 4.0, 10.0, 0.0, false,
            new BeachController.Care("target", "comfort")), request);
        assertEquals("sent", sent.care());
        assertEquals(2, sent.count());
        // 장작 넣기처럼 방문을 다시 확인하는 동작도 소로우 가입 없이 통과하고, 공용 모닥불에 장작이 쌓인다.
        assertEquals(BeachFireService.INITIAL_LOGS + 1, controller.wood(
            new BeachController.WoodBody(ticket, "00000000-0000-4000-8000-000000000001"), request, new MockHttpServletResponse()).logs());
        assertEquals(BeachFireService.INITIAL_LOGS + 1, beach.fire(SpaceMaps.PUBLIC_ID, "beach").logs());
        verifyNoInteractions(circles);
    }

    @Test
    void aCircleSpaceIsSeparateFromThePublicSpaceAndStaysMembersOnly() {
        circle("circle-a", 3, false);
        actor(user("member", false));
        enter("circle-a", "beach");
        enter(SpaceMaps.PUBLIC_ID, "beach");
        assertEquals(1, beach.count("circle-a", "beach"));
        assertEquals(1, beach.count(SpaceMaps.PUBLIC_ID, "beach"));

        when(circles.member(eq("circle-a"), any())).thenReturn(Optional.empty());
        actor(user("stranger", false));
        assertEquals(403, enterStatus("circle-a", "beach"));
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-a", "beach", request)).status());
    }

    @Test
    void aCircleSpaceOpensOnlyTheMapsItsMembersHaveGrownInto() {
        actor(user("member", false));
        circle("circle-a", 20, false);
        assertEquals("beach", enter("circle-a", "beach").get("mapId"));
        ApiException locked = assertThrows(ApiException.class, () -> enter("circle-a", "uyuni"));
        assertEquals(403, locked.status());
        assertTrue(locked.getMessage().contains("21명"), locked.getMessage());
        assertEquals(403, assertThrows(ApiException.class, () -> controller.count("circle-a", "uyuni", request)).status());
        assertEquals(0, beach.count("circle-a", "uyuni"));

        circle("circle-a", 21, false);
        assertEquals("uyuni", enter("circle-a", "uyuni").get("mapId"));
        assertEquals(403, enterStatus("circle-a", "bamboo"));

        circle("circle-a", 101, false);
        for (BeachMap map : BeachMap.values()) assertEquals(map.id(), enter("circle-a", map.id()).get("mapId"));
    }

    @Test
    void aFixedPrivateTestCircleKeepsEveryMapBecauseItCanNeverGrow() {
        DbUser owner = user("owner", false);
        actor(owner);
        circle("private", 2, true);
        when(blocks.excludedIds("owner")).thenReturn(Set.of());
        for (BeachMap map : BeachMap.values()) assertEquals(map.id(), enter("private", map.id()).get("mapId"));
    }
}
