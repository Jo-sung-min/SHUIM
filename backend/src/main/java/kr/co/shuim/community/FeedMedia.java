package kr.co.shuim.community;

import kr.co.shuim.community.Model.Overlay;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 피드 사진·영상 위에 얹은 글과 영상 정보 정리 (frontend/lib/feed-media.ts 와 같은 규칙) */
public final class FeedMedia {
    private FeedMedia() {}

    public static final double VIDEO_MAX_SECONDS = 30;
    public static final int MAX_OVERLAYS = 5;
    public static final int OVERLAY_MAX_CHARS = 120;
    public static final Set<String> COLORS = Set.of("white", "ink", "cream", "lavender", "sky", "rose", "sage");
    public static final Set<String> FONTS = Set.of("sans", "serif");
    public static final Set<String> ALIGNS = Set.of("left", "center", "right");
    public static final Set<String> STYLES = Set.of("plain", "dim", "solid");

    private static Double number(Object raw) {
        if (!(raw instanceof Number n)) return null;
        double v = n.doubleValue();
        return Double.isFinite(v) ? v : null;
    }

    private static double clamp(double v, double min, double max) { return Math.max(min, Math.min(max, v)); }

    private static String pick(Object raw, Set<String> allowed, String fallback) {
        return raw instanceof String s && allowed.contains(s) ? s : fallback;
    }

    /** 가로/세로 비율. 너무 길쭉하거나 숫자가 아니면 null */
    public static Double ratio(Object raw) {
        Double v = number(raw);
        return v == null || v < 0.2 || v > 5 ? null : Math.round(v * 10000) / 10000.0;
    }

    /** 영상 길이(초). 0 초과 30초(여유 0.5초) 이하만 */
    public static Double duration(Object raw) {
        Double v = number(raw);
        return v == null || v <= 0 || v > VIDEO_MAX_SECONDS + 0.5 ? null : Math.round(v * 100) / 100.0;
    }

    /** 얹은 글 목록: 빈 글은 버리고, 최대 5개·120자, 좌표·크기는 범위 안으로, 색·글꼴·정렬·배경은 정해진 값만 */
    public static List<Overlay> overlays(Object raw) {
        if (!(raw instanceof List<?> items)) return List.of();
        List<Overlay> out = new ArrayList<>();
        for (Object o : items) {
            if (!(o instanceof Map<?, ?> m) || out.size() >= MAX_OVERLAYS) continue;
            if (!(m.get("text") instanceof String s)) continue;
            String text = s.strip().replace("\r", "");
            if (text.isEmpty()) continue;
            if (text.codePointCount(0, text.length()) > OVERLAY_MAX_CHARS) text = text.substring(0, text.offsetByCodePoints(0, OVERLAY_MAX_CHARS));
            Double x = number(m.get("x")), y = number(m.get("y")), size = number(m.get("size"));
            out.add(new Overlay(text,
                clamp(x == null ? 0.5 : x, 0, 1), clamp(y == null ? 0.5 : y, 0, 1), clamp(size == null ? 0.07 : size, 0.03, 0.2),
                pick(m.get("color"), COLORS, "white"), pick(m.get("font"), FONTS, "sans"),
                pick(m.get("align"), ALIGNS, "center"), pick(m.get("style"), STYLES, "plain")));
        }
        return out;
    }
}
