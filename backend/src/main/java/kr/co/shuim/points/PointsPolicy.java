package kr.co.shuim.points;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

public final class PointsPolicy {
    private PointsPolicy() {}
    public static final int DAILY_LIMIT = 200, WRITING_DAILY_LIMIT = 3, WRITING_POINTS = 10, ACCEPTED_POINTS = 50;
    public static final List<Integer> MILESTONES = List.of(5, 15, 30);
    public static final Set<String> SAMPLE_USERS = Set.of("u1", "u2", "u3", "u4", "u5", "u6", "u7");
    public static final List<String> RULES = List.of(
        "다른 사람의 글에 공백 제외 20자 이상인 첫 위로 댓글을 쓰면 10P를 받아요. 같은 글에서는 한 번, 하루 최대 3번이에요.",
        "외침 작성자가 내 최상위 댓글을 채택하면 50P를 받아요. 한 글에서 한 번만 채택할 수 있어요.",
        "위로 댓글이나 위로 피드에 서로 다른 회원의 힘내요가 5·15·30개 모이면 각각 10·20·30P를 한 번씩 받아요.",
        "모든 보상을 합쳐 한국 시간 하루 최대 200P예요. 한도를 넘은 보상은 다음 날로 넘어가지 않아요.",
        "내 반응, 비회원·샘플·제한 계정의 활동과 숨겨진 글은 적립에 포함되지 않아요. 포인트는 현금이 아니며 폭죽 이용권(1,000P = 1장)으로만 바꿀 수 있어요.");

    public static LocalDate day(long now) { return Instant.ofEpochMilli(now).atZone(ZoneId.of("Asia/Seoul")).toLocalDate(); }
    public static boolean meaningful(String text) {
        return text != null && text.codePoints().filter(c -> !Character.isWhitespace(c) && !Character.isSpaceChar(c)
            && !Character.isISOControl(c) && Character.getType(c) != Character.FORMAT).limit(20).count() >= 20;
    }
    public static int reward(int requested, long today, boolean writing, int written) {
        if (writing && written >= WRITING_DAILY_LIMIT) return 0;
        return (int) Math.max(0, Math.min(requested, DAILY_LIMIT - today));
    }
    public static int milestonePoints(int milestone) { return switch (milestone) { case 5 -> 10; case 15 -> 20; case 30 -> 30; default -> throw new IllegalArgumentException("Unknown milestone"); }; }
}
