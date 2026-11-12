package kr.co.shuim.common;

import java.util.List;

/**
 * 공용 공간과 소로우 공간이 함께 쓰는 풍경 규칙.
 * 공용 공간은 누구나 들어오고 모든 풍경이 처음부터 열려 있다.
 * 소로우 공간은 그 소로우의 멤버만 들어오고, 멤버가 풍경 하나의 정원(20명)을 넘을 때마다 다음 풍경이 하나씩 열린다.
 */
public final class SpaceMaps {
    /** 공용 공간의 방 id. 소로우 id(uid, lc-…)와 겹치지 않는다. */
    public static final String PUBLIC_ID = "public";
    public static final String PUBLIC_NAME = "공용 공간";
    /** 풍경이 열리는 순서 (BeachMap 과 같은 id). */
    public static final List<String> ORDER = List.of("beach", "uyuni", "bamboo", "garden", "cloudspa", "baikal");
    /** 멤버가 이만큼 늘 때마다 다음 풍경이 열린다: 20명까지는 바닷가만, 21명부터 우유니, 41명부터 대나무숲 … */
    public static final int MEMBERS_PER_MAP = SpaceCapacity.MAX;

    private SpaceMaps() {}

    public static boolean isPublic(String spaceId) { return PUBLIC_ID.equals(spaceId); }

    /** 이 풍경이 열리는 활성 멤버 수. 첫 풍경은 소로우를 열자마자 열린다. */
    public static int membersToOpen(String mapId) {
        int index = ORDER.indexOf(mapId);
        if (index < 0) throw new IllegalArgumentException("unknown map: " + mapId);
        return index == 0 ? 0 : index * MEMBERS_PER_MAP + 1;
    }

    public static boolean open(String mapId, int members) { return members >= membersToOpen(mapId); }
}
