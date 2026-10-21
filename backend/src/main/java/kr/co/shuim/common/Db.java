package kr.co.shuim.common;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;

/** ResultSet 도우미. TIMESTAMP(시간대 없음) 컬럼은 DB 가 UTC 로 저장하므로 UTC 로 읽어 epoch ms 로 바꾼다 */
public final class Db {
    private Db() {}

    /** Serialize community snapshots with erasure; callers hold a Spring transaction. */
    public static void lockCommunity(JdbcClient jdbc) {
        jdbc.sql("SELECT pg_advisory_xact_lock(1936683629, 1)").query(rs -> {});
    }

    public static Long ms(ResultSet rs, String col) throws SQLException {
        LocalDateTime t = rs.getObject(col, LocalDateTime.class);
        return t == null ? null : t.toInstant(ZoneOffset.UTC).toEpochMilli();
    }

    public static long msReq(ResultSet rs, String col) throws SQLException {
        Long v = ms(rs, col);
        return v == null ? 0L : v;
    }

    public static String date(ResultSet rs, String col) throws SQLException {
        LocalDate d = rs.getObject(col, LocalDate.class);
        return d == null ? null : d.toString();
    }

    public static List<String> textArray(ResultSet rs, String col) throws SQLException {
        Array a = rs.getArray(col);
        if (a == null) return new ArrayList<>();
        Object arr = a.getArray();
        if (arr instanceof String[] s) return new ArrayList<>(Arrays.asList(s));
        return new ArrayList<>();
    }

    /** hidden 같은 불리언: TS 서버는 false 를 undefined 로 비웠다 */
    public static Boolean trueOrNull(ResultSet rs, String col) throws SQLException {
        return rs.getBoolean(col) ? Boolean.TRUE : null;
    }
}
