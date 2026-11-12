package kr.co.shuim.common;

import java.util.Locale;
import java.util.regex.Pattern;

/** MBTI 네 글자 (E/I · S/N · T/F · J/P). 사용자가 프로필에 스스로 적는 선택 항목이다 */
public final class Mbti {
    private Mbti() {}

    private static final Pattern TYPE = Pattern.compile("^[EI][SN][TF][JP]$");

    /** 대문자 네 글자로 다듬는다. MBTI 가 아니면(빈 값 포함) null */
    public static String normalize(String raw) {
        if (raw == null) return null;
        String type = raw.strip().toUpperCase(Locale.ROOT);
        return TYPE.matcher(type).matches() ? type : null;
    }
}
