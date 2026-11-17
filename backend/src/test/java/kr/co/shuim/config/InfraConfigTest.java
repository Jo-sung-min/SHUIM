package kr.co.shuim.config;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** DB 주소 TLS·기동 경고·/api/db 캐시 */
class InfraConfigTest {
    @Test
    void remoteDbGetsSslModeRequireButKeepsPoolerParams() {
        DataSourceConfig.Parsed p = DataSourceConfig.parse("postgresql://u:p@aws-0-ap.pooler.supabase.com:5432/postgres", false);
        assertTrue(p.jdbcUrl().contains("prepareThreshold=0"));
        assertTrue(p.jdbcUrl().contains("sslmode=require"));
        assertTrue(p.jdbcUrl().contains(":6543/"));
        assertEquals("u", p.user());
    }

    @Test
    void explicitSslModeAndLocalHostsAreLeftAlone() {
        assertTrue(DataSourceConfig.parse("jdbc:postgresql://db.example.com:5432/x?sslmode=verify-full", false).jdbcUrl().endsWith("?sslmode=verify-full"));
        assertFalse(DataSourceConfig.parse("jdbc:postgresql://db.example.com:5432/x?ssl=false", false).jdbcUrl().contains("sslmode"));
        assertFalse(DataSourceConfig.parse("jdbc:postgresql://127.0.0.1:55473/sorow?user=a", false).jdbcUrl().contains("sslmode"));
        assertFalse(DataSourceConfig.parse("postgresql://a:b@localhost/x", false).jdbcUrl().contains("sslmode"));
        assertFalse(DataSourceConfig.parse("postgresql://a:b@postgres:5432/x", false).jdbcUrl().contains("sslmode"));
    }

    @Test
    void startupWarnsOnlyForRemoteDbWithDevSettings() {
        assertTrue(StartupSafetyCheck.warnings("jdbc:postgresql://localhost/x", "http://localhost:3000", "http://localhost:3000", false, true, false, false).isEmpty());
        var w = StartupSafetyCheck.warnings("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres", "http://localhost:3000", "http://localhost:3000", false, true, false, false);
        assertEquals(5, w.size());
        assertTrue(StartupSafetyCheck.warnings("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres", "https://www.sorow.co.kr", "https://www.sorow.co.kr", true, false, true, true).isEmpty());
    }

    @Test
    void dbHealthIsCachedAndHidesDetails() {
        JdbcClient jdbc = mock(JdbcClient.class, Mockito.RETURNS_DEEP_STUBS);
        when(jdbc.sql(anyString()).query(Integer.class).single()).thenReturn(1);
        AtomicLong now = new AtomicLong(1_000_000);
        DbHealthController c = new DbHealthController(jdbc, now::get);
        var body = c.health().getBody();
        assertEquals(true, body.get("ok"));
        assertEquals(true, body.get("configured"));
        assertFalse(body.containsKey("user"));
        assertFalse(body.containsKey("version"));
        c.health();
        now.addAndGet(5_000);
        c.health();
        assertEquals(1, c.probes());
        now.addAndGet(DbHealthController.CACHE_MS);
        c.health();
        assertEquals(2, c.probes());
    }

    @Test
    void dbHealthFailureHasNoErrorText() {
        JdbcClient jdbc = mock(JdbcClient.class, Mockito.RETURNS_DEEP_STUBS);
        when(jdbc.sql(anyString()).query(Integer.class).single()).thenThrow(new RuntimeException("password authentication failed for user postgres.abc"));
        var res = new DbHealthController(jdbc, System::currentTimeMillis).health();
        assertEquals(500, res.getStatusCode().value());
        assertEquals(false, res.getBody().get("ok"));
        assertEquals(3, res.getBody().size());
    }
}
