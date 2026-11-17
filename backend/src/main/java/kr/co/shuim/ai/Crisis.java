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
        Pattern.compile("자해"),
        // 흔한 우회 표현. 놓치는 것보다 조금 더 걸리는 편이 낫다 ("힘들어 죽겠다" 같은 관용구는 걸지 않는다)
        Pattern.compile("살고\\s*싶지\\s*않"),
        Pattern.compile("그만\\s*살고\\s*싶"),
        Pattern.compile("살\\s*이유가\\s*없"),
        Pattern.compile("살아갈\\s*이유가\\s*없"),
        Pattern.compile("살\\s*가치가\\s*없"),
        Pattern.compile("죽어\\s*버리고\\s*싶"),
        Pattern.compile("죽어\\s*버릴"),
        Pattern.compile("죽어야\\s*겠"),
        Pattern.compile("죽고만\\s*싶"),
        Pattern.compile("(죽는|죽을)\\s*방법"),
        Pattern.compile("뛰어\\s*내리"),
        Pattern.compile("투신(하고|할|하려)"),
        Pattern.compile("목숨을?\\s*끊"),
        Pattern.compile("목을\\s*매(달|고|려|자)|목\\s*매달"),
        Pattern.compile("손목을?\\s*(긋|그었|그을)"),
        Pattern.compile("(생|삶)을\\s*(마감|포기)"),
        Pattern.compile("삶을\\s*끝"),
        Pattern.compile("다\\s*끝내\\s*버리"),
        Pattern.compile("유서"),
        Pattern.compile("번개탄"),
        Pattern.compile("수면제를?\\s*(모으|모아|한꺼번에|많이)"),
        Pattern.compile("내가\\s*없(으면|어지면)[^.!?\\n]{0,12}(편할|편해|나을|행복할)")
    );

    public static boolean hasSignal(String text) {
        if (text == null) return false;
        for (Pattern p : PATTERNS) if (p.matcher(text).find()) return true;
        return false;
    }
}
