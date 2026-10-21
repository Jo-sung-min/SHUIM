package kr.co.shuim.common;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** 날짜 키(YYYY-MM-DD)와 주 키(그 주 월요일). 한국 사용자 기준이라 서울 시간대로 계산한다 */
public final class Dates {
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private Dates() {}

    public static String todayKey() { return LocalDate.now(ZONE).toString(); }

    public static String addDays(String key, int n) { return LocalDate.parse(key).plusDays(n).toString(); }

    public static String weekKeyOf(long epochMs) {
        LocalDate d = Instant.ofEpochMilli(epochMs).atZone(ZONE).toLocalDate();
        return d.with(DayOfWeek.MONDAY).toString();
    }

    public static String currentWeekKey() { return weekKeyOf(System.currentTimeMillis()); }
}
