package kr.co.shuim.community;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 외침 사진 주소 정리: 허용된 것만, 중복 없이, 최대 장수까지 */
class ShoutImagesTest {
    private static final String MINE = "https://cdn.example.com/feed/u1-";

    @Test
    void keepsOnlyAcceptedUniqueUpToMax() {
        List<Object> raw = Arrays.asList(MINE + "a.webp", "https://evil.example/x.png", MINE + "a.webp", 42, null, "  ", MINE + "b.webp",
            MINE + "c.webp", MINE + "d.webp", MINE + "e.webp");
        List<String> out = CommunityLogic.cleanImageList(raw, CommunityLogic.SHOUT_MAX_IMAGES, u -> u.startsWith(MINE));
        assertEquals(List.of(MINE + "a.webp", MINE + "b.webp", MINE + "c.webp", MINE + "d.webp"), out);
    }

    @Test
    void acceptsNullAndSingleString() {
        assertEquals(List.of(), CommunityLogic.cleanImageList(null, 4, u -> true));
        assertEquals(List.of(MINE + "a.webp"), CommunityLogic.cleanImageList(" " + MINE + "a.webp ", 4, u -> true));
    }

    @Test
    void rejectsOverlongUrls() {
        String longUrl = MINE + "x".repeat(600);
        assertEquals(List.of(), CommunityLogic.cleanImageList(List.of(longUrl), 4, u -> true));
    }
}
