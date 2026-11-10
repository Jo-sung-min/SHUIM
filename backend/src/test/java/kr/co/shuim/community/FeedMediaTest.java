package kr.co.shuim.community;

import kr.co.shuim.community.Model.Overlay;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 사진·영상 위에 얹은 글과 영상 길이·비율 정리 */
class FeedMediaTest {
    @Test
    void overlaysAreClampedWhitelistedAndCapped() {
        Map<String, Object> wild = new HashMap<>();
        wild.put("text", "  오늘은 여기까지  ");
        wild.put("x", 3);
        wild.put("y", -1);
        wild.put("size", 9);
        wild.put("color", "#ff0000");
        wild.put("font", "comic");
        wild.put("align", "justify");
        wild.put("style", "neon");
        List<Overlay> out = FeedMedia.overlays(List.of(wild));
        assertEquals(List.of(new Overlay("오늘은 여기까지", 1, 0, 0.2, "white", "sans", "center", "plain")), out);

        List<Object> many = new ArrayList<>();
        for (int i = 0; i < 8; i++) many.add(Map.of("text", "글" + i, "x", 0.5, "y", 0.5, "size", 0.07, "color", "rose", "font", "serif", "align", "left", "style", "dim"));
        many.add(0, Map.of("text", "   "));
        many.add(0, "not a map");
        List<Overlay> capped = FeedMedia.overlays(many);
        assertEquals(FeedMedia.MAX_OVERLAYS, capped.size());
        assertEquals(new Overlay("글0", 0.5, 0.5, 0.07, "rose", "serif", "left", "dim"), capped.get(0));
        assertEquals(List.of(), FeedMedia.overlays("text"));
        assertEquals(List.of(), FeedMedia.overlays(null));
    }

    @Test
    void longOverlayTextIsCutByCharactersNotBytes() {
        String text = "가".repeat(FeedMedia.OVERLAY_MAX_CHARS + 10);
        assertEquals(FeedMedia.OVERLAY_MAX_CHARS, FeedMedia.overlays(List.of(Map.of("text", text))).get(0).text().length());
    }

    @Test
    void durationAndRatioRejectOutOfRangeValues() {
        assertEquals(30.0, FeedMedia.duration(30));
        assertEquals(30.4, FeedMedia.duration(30.4));
        assertNull(FeedMedia.duration(31));
        assertNull(FeedMedia.duration(0));
        assertNull(FeedMedia.duration("12"));
        assertNull(FeedMedia.duration(Double.NaN));
        assertEquals(0.5625, FeedMedia.ratio(0.5625));
        assertNull(FeedMedia.ratio(0.1));
        assertNull(FeedMedia.ratio(9));
        assertNull(FeedMedia.ratio(null));
    }
}
