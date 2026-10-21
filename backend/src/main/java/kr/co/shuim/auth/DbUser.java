package kr.co.shuim.auth;

import kr.co.shuim.common.Db;
import org.springframework.jdbc.core.RowMapper;

/** users 행. anonymous 는 가입 전 방문자 (외침·힘내요는 쓸 수 있고, 가입하면 같은 행이 승격된다) */
public record DbUser(
    String id,
    String email,
    String nick,
    String role,
    boolean anonymous,
    Long blockedAt,
    String blockedReason,
    long createdAt
) {
    public static final RowMapper<DbUser> MAPPER = (rs, i) -> new DbUser(
        rs.getString("id"),
        rs.getString("email"),
        rs.getString("nick"),
        "admin".equals(rs.getString("role")) ? "admin" : "user",
        rs.getBoolean("is_anonymous"),
        Db.ms(rs, "blocked_at"),
        rs.getString("blocked_reason"),
        Db.msReq(rs, "created_at")
    );

    public boolean blocked() { return blockedAt != null; }

    public DbUser withNick(String n) { return new DbUser(id, email, n, role, anonymous, blockedAt, blockedReason, createdAt); }
}
