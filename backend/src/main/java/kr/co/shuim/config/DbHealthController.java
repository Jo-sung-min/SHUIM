package kr.co.shuim.config;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** GET /api/db — DB 연결 상태 확인 (연결 여부, 서버 버전, 지연 시간). 비밀번호는 절대 반환하지 않음. */
@RestController
public class DbHealthController {
    private final JdbcClient jdbc;

    public DbHealthController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping("/api/db")
    public ResponseEntity<Map<String, Object>> health() {
        long t0 = System.currentTimeMillis();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("configured", true);
        try {
            jdbc.sql("select now()::text as now, version() as version, current_database() as db, current_user as usr").query(rs -> {
                out.put("ok", true);
                out.put("latencyMs", System.currentTimeMillis() - t0);
                out.put("database", rs.getString("db"));
                out.put("user", rs.getString("usr"));
                out.put("serverTime", rs.getString("now"));
                out.put("version", rs.getString("version").split(" on ")[0]);
            });
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? String.valueOf(e) : e.getMessage();
            out.put("ok", false);
            out.put("latencyMs", System.currentTimeMillis() - t0);
            out.put("error", msg);
            if (msg.toLowerCase().contains("max clients reached")) out.put("hint", "Supabase 풀러 5432(세션 모드)는 동시 접속 15개 한도예요. DB_URL 포트를 6543(트랜잭션 모드)으로 바꾸세요.");
            else if (msg.toLowerCase().contains("password authentication failed")) out.put("hint", "비밀번호가 틀렸어요. Supabase › Settings › Database 에서 재설정한 값인지 확인하세요.");
            else if (msg.toLowerCase().contains("timeout")) out.put("hint", "연결 시간 초과예요. 네트워크/방화벽 또는 리전을 확인하세요.");
            return ResponseEntity.status(500).body(out);
        }
    }
}
