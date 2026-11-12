package kr.co.shuim.light;

import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.PointsPolicy;

import java.time.LocalDate;
import java.util.UUID;

/** 빛의 숫자 규칙. 화면은 이 값을 /api/light/me 로 받아 쓴다. */
public final class LightPolicy {
    private LightPolicy() {}
    /** 오늘의 빛: 하루 한 번 받는 양 */
    public static final int DAILY_LIGHT = 10;
    /** 한 번에 줄 수 있는 가장 큰 양 */
    public static final int MAX_GIFT = 10;
    /** 같은 사람에게 하루에 줄 수 있는 양. 둘이 주고받기를 반복해도 이 이상 쌓이지 않는다. */
    public static final int PER_PERSON_DAILY = 10;

    public static LocalDate day(long now) { return PointsPolicy.day(now); }

    /** The client only picks a whole amount from 1 to MAX_GIFT; anything else is rejected, never rounded. */
    public static int giftAmount(Object raw) {
        long value = raw instanceof Integer || raw instanceof Long || raw instanceof Short ? ((Number) raw).longValue() : -1;
        if (value < 1 || value > MAX_GIFT) throw ApiException.badRequest("빛은 한 번에 1~" + MAX_GIFT + "빛까지 줄 수 있어요.");
        return (int) value;
    }

    /** How much more this giver may hand to the same person today. */
    public static int leftForPerson(long givenToday) {
        return (int) Math.max(0, PER_PERSON_DAILY - givenToday);
    }

    public static UUID requestKey(Object raw) {
        try {
            if (!(raw instanceof String text) || text.length() != 36) throw new IllegalArgumentException();
            UUID key = UUID.fromString(text);
            if (!key.toString().equalsIgnoreCase(text)) throw new IllegalArgumentException();
            return key;
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("요청을 확인하지 못했어요. 다시 시도해 주세요.");
        }
    }
}
