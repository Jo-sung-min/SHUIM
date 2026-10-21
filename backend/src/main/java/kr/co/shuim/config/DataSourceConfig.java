package kr.co.shuim.config;

import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * DB_URL 하나로 풀을 만든다 (예전 Next 서버와 같은 환경변수).
 *  - jdbc:postgresql://host:port/db?user=..&password=..   (Spring 스타일)
 *  - postgresql://user:password@host:port/db              (Node 스타일)
 * Supabase 풀러(*.pooler.supabase.com)는 5432(세션 모드, 동시 15개)를 6543(트랜잭션 모드)으로 바꾸고,
 * 트랜잭션 모드에선 서버측 prepared statement 를 쓸 수 없으므로 prepareThreshold=0 을 붙인다.
 */
@Configuration
public class DataSourceConfig {
    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Bean
    public DataSource dataSource(
        @Value("${app.db.url:}") String raw,
        @Value("${app.db.pool-max:3}") int poolMax,
        @Value("${app.db.keep-session-mode:false}") boolean keepSessionMode
    ) {
        Parsed p = parse(raw, keepSessionMode);
        if (p == null) throw new IllegalStateException("DB_URL 이 설정되지 않았어요 (backend/.env)");
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(p.jdbcUrl);
        ds.setUsername(p.user);
        ds.setPassword(p.password);
        ds.setPoolName("shuim-db-pool");
        ds.setMaximumPoolSize(Math.max(1, poolMax));
        ds.setMinimumIdle(1);
        ds.setConnectionTimeout(10_000);
        ds.setIdleTimeout(60_000);
        ds.setMaxLifetime(300_000);
        ds.addDataSourceProperty("ApplicationName", "shuim-backend");
        log.info("DB: {}", p.jdbcUrl.replaceAll("password=[^&]*", "password=***"));
        return ds;
    }

    record Parsed(String jdbcUrl, String user, String password) {}

    static Parsed parse(String raw, boolean keepSessionMode) {
        if (raw == null || raw.isBlank()) return null;
        String url = raw.trim();
        if (url.startsWith("jdbc:")) url = url.substring(5);
        URI u;
        try {
            u = new URI(url);
        } catch (Exception e) {
            return null;
        }
        Map<String, String> q = new LinkedHashMap<>();
        if (u.getRawQuery() != null) {
            for (String kv : u.getRawQuery().split("&")) {
                int i = kv.indexOf('=');
                if (i < 0) continue;
                q.put(decode(kv.substring(0, i)), decode(kv.substring(i + 1)));
            }
        }
        String user = q.remove("user");
        String password = q.remove("password");
        if (u.getRawUserInfo() != null) {
            String[] ui = u.getRawUserInfo().split(":", 2);
            if (user == null) user = decode(ui[0]);
            if (password == null && ui.length > 1) password = decode(ui[1]);
        }
        String host = u.getHost();
        int port = u.getPort() > 0 ? u.getPort() : 5432;
        if (host != null && host.endsWith(".pooler.supabase.com")) {
            if (port == 5432 && !keepSessionMode) {
                log.warn("DB_URL 포트 5432(세션 모드)를 6543(트랜잭션 모드)으로 바꿉니다. 세션 모드가 꼭 필요하면 DB_KEEP_SESSION_MODE=true");
                port = 6543;
            }
            if (port == 6543) q.putIfAbsent("prepareThreshold", "0");
        }
        StringBuilder sb = new StringBuilder("jdbc:postgresql://").append(host).append(':').append(port).append(u.getPath() == null || u.getPath().isEmpty() ? "/postgres" : u.getPath());
        if (!q.isEmpty()) {
            sb.append('?');
            boolean first = true;
            for (var e : q.entrySet()) {
                if (!first) sb.append('&');
                first = false;
                sb.append(e.getKey()).append('=').append(e.getValue());
            }
        }
        return new Parsed(sb.toString(), user == null ? "" : user, password == null ? "" : password);
    }

    private static String decode(String s) { return URLDecoder.decode(s, StandardCharsets.UTF_8); }
}
