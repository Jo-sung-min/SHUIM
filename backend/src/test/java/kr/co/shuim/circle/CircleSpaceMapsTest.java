package kr.co.shuim.circle;

import kr.co.shuim.common.SpaceCapacity;
import kr.co.shuim.common.SpaceMaps;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 화면에 내려 주는 소로우 공간의 풍경 목록과 공용 공간 안내. */
class CircleSpaceMapsTest {
    private static CircleService.Circle circle(int members, boolean privateTest) {
        return new CircleService.Circle("c", "c", "함께 소로우", "life", null, false, "open", "public",
            "", "", "owner", 0, 0, members, 0, false, privateTest, false, SpaceCapacity.MAX);
    }

    private static List<Object> open(CircleService.Circle c) {
        return CircleService.spaceMaps(c).stream().filter(m -> Boolean.TRUE.equals(m.get("open"))).map(m -> m.get("id")).toList();
    }

    @Test void aNewCircleStartsWithTheBeachAndEveryMapSaysWhenItOpens() {
        var maps = CircleService.spaceMaps(circle(1, false));
        assertEquals(SpaceMaps.ORDER, maps.stream().map(m -> m.get("id")).toList());
        assertEquals(List.of(0, 21, 41, 61, 81, 101), maps.stream().map(m -> m.get("members")).toList());
        assertEquals(List.of("beach"), open(circle(1, false)));
        assertEquals(List.of("beach"), open(circle(20, false)));
        assertEquals(List.of("beach", "uyuni"), open(circle(21, false)));
        assertEquals(List.of("beach", "uyuni", "bamboo", "garden"), open(circle(80, false)));
        assertEquals(SpaceMaps.ORDER, open(circle(101, false)));
    }

    @Test void aMapThatOnceOpenedStaysOpenAfterMembersLeave() {
        var shrunk = new CircleService.Circle("c", "c", "함께 소로우", "life", null, false, "open", "public",
            "", "", "owner", 0, 0, 12, 0, false, false, false, SpaceCapacity.MAX, null, null, null, 45);
        assertEquals(List.of("beach", "uyuni", "bamboo"), open(shrunk), "12명으로 줄었어도 45명이던 때 열린 풍경은 그대로다");
        assertTrue(shrunk.opensMap("bamboo"));
        assertFalse(shrunk.opensMap("garden"));
    }

    @Test void aFixedPrivateTestCircleKeepsEveryMapOpen() {
        assertEquals(SpaceMaps.ORDER, open(circle(2, true)));
    }

    @Test void thePublicSpaceIsAnnouncedWithItsRoomIdAndTheSharedCapacity() {
        assertEquals(Map.of("id", "public", "name", "공용 공간", "capacity", SpaceCapacity.MAX), CircleService.publicSpace());
    }
}
