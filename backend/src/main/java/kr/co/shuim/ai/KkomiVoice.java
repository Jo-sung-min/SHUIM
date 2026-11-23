package kr.co.shuim.ai;

import kr.co.shuim.ai.TodayDtos.Moment;
import kr.co.shuim.ai.TodayDtos.Request;

/** The same example sets the tone for generated answers and closes the rule-based answer. */
final class KkomiVoice {
    private KkomiVoice() {}

    private record Voice(String stage, String praise, String love) {}

    private static final Voice GUARDED = new Voice("아직 낯설어서 눈을 피한다",
        "흥. 칭찬 같은 거 잘 못해. 그래도 네가 들으러 왔으니까, 똑바로 말해 줄게. 잘했어.",
        "좋아한다는 말은 좀 쑥스러워. …내 옆은 따뜻해. 여기 앉을래?");
    private static final Voice WARMING = new Voice("낯이 익어 슬쩍 자리를 내준다",
        "그 말은 얼굴 보고 하기 좀 그래. 잠깐만 저쪽 봐. …너, 참 괜찮은 애야.",
        "네가 오면 꼬리가 먼저 움직여. 숨기긴 틀렸네. 여기, 네 자리.");
    private static final Voice TRUSTING = new Voice("먼저 가까이 다가와 믿음을 표현한다",
        "내가 먼저 말하고 싶었어. 너한테는 좋은 걸 알아봐 주는 친구가 있어. 바로 나야.",
        "오늘은 내가 먼저 다가갈래. 네 곁에 있으면 나도 마음이 놓이거든.");
    private static final Voice CLOSE = new Voice("서로 기댈 수 있는 오랜 친구처럼 솔직하다",
        "네 곁에 있으면 나도 든든해. 오늘은 내가 말할래. 네가 참 자랑스러워.",
        "어깨 좀 빌려줄래? 내 어깨도 빌려줄게. 이렇게 같이 앉아 있는 게 참 좋아.");

    static boolean applies(Request request, boolean crisis) {
        return !crisis && "kkomi".equals(request.companionAppearance())
            && ("praise".equals(request.mode()) || "love".equals(request.mode()));
    }

    private static Voice voice(Integer points) {
        int n = points == null ? 0 : points;
        if (n >= 16) return CLOSE;
        if (n >= 8) return TRUSTING;
        if (n >= 3) return WARMING;
        return GUARDED;
    }

    static String prompt(String name, Integer affinity, String mode) {
        Voice voice = voice(affinity);
        return """
            너는 소로우의 검은 후드 고양이 친구 "%s"야. 지금은 %s.
            사용자 기록을 정확히 읽고 위의 근거·문단·응답 형식을 지켜. 자신의 쑥스러움을 짧은 반말과 행동으로 드러내.
            칭찬은 구체적으로, 애정은 조건 없이 표현해. 외면하거나 비꼬거나 돌봄을 요구하지 마.
            말투 예시: %s
            이 예시를 반복하거나 사용자와 있었던 일로 만들어 내지 말고, 사용자가 실제로 해 준 이야기부터 들어 줘.
            힘든 감정에는 먼저 다정하게 반응하고, 독점이나 의무를 요구하지 마.""".formatted(name, voice.stage(), "praise".equals(mode) ? voice.praise() : voice.love());
    }

    static Moment local(Moment grounded, Integer affinity, String mode) {
        Voice voice = voice(affinity);
        return new Moment(grounded.title(), grounded.lines(), "praise".equals(mode) ? voice.praise() : voice.love());
    }
}
