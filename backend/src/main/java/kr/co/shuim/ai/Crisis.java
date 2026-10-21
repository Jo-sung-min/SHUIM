package kr.co.shuim.ai;

import java.util.List;
import java.util.regex.Pattern;

/** 기록에서 많이 힘든 신호가 보이면 도움 받을 곳을 먼저 보여주기 위한 간단한 키워드 감지 (진단이 아니라 안전장치) */
public final class Crisis {
    private Crisis() {}

    private static final List<Pattern> PATTERNS = List.of(
        Pattern.compile("죽고\\s*싶"),
        Pattern.compile("자살"),
        Pattern.compile("사라지고\\s*싶"),
        Pattern.compile("끝내고\\s*싶"),
        Pattern.compile("생을\\s*끝"),
        Pattern.compile("극단적"),
        Pattern.compile("살기\\s*싫"),
        Pattern.compile("없어지고\\s*싶"),
        Pattern.compile("자해")
    );

    public static boolean hasSignal(String text) {
        if (text == null) return false;
        for (Pattern p : PATTERNS) if (p.matcher(text).find()) return true;
        return false;
    }
}
