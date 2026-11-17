package kr.co.shuim.community;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 소로우·3D 공간 신고 종류: 대상 모양을 먼저 확인한다 */
class SafetyReportKindsTest {
    private static final DbUser REPORTER = new DbUser("reporter-1", "r@example.com", "신고자", "user", false, null, null, 0L);

    private static JdbcClient jdbcWithCounts(long count) {
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        when(jdbc.sql(anyString()).param(any()).query(Long.class).single()).thenReturn(count);
        return jdbc;
    }

    @Test
    void spaceTargetsMustBeGuestbookOrLanternIds() {
        SafetyReportService service = new SafetyReportService(jdbcWithCounts(0));
        for (String bad : new String[] {"", "guestbook:abc", "lantern:", "lantern:a b", "other:1", "guestbook:" + "1".repeat(19), "lantern:" + "a".repeat(65)}) {
            ApiException e = assertThrows(ApiException.class, () -> service.submit(REPORTER, "space", bad, "이상한 글이에요"), bad);
            assertEquals(400, e.status(), bad);
        }
        assertNotNull(service.submit(REPORTER, "space", "lantern:3f1c2a9e-1b2c-4d5e-8f90-123456789abc", "소원등 문구가 불쾌해요"));
    }

    @Test
    void missingGuestbookEntryOrCircleIsNotFound() {
        SafetyReportService service = new SafetyReportService(jdbcWithCounts(0));
        assertEquals(404, assertThrows(ApiException.class, () -> service.submit(REPORTER, "space", "guestbook:42", "욕설")).status());
        assertEquals(404, assertThrows(ApiException.class, () -> service.submit(REPORTER, "circle", "", "소개가 불쾌해요")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> service.submit(REPORTER, "post", "x", "다른 종류")).status());
    }
}
