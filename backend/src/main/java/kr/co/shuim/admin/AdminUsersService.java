package kr.co.shuim.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import kr.co.shuim.common.Db;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class AdminUsersService {
    public static final int PAGE_SIZE = 30;
    private static final Set<String> MEMBER_TYPES = Set.of("member", "partner", "keeper");
    // Demo rows have no sign-in method. Neither these nor automatically created visitors are members.
    static final String REGISTERED = "is_anonymous = FALSE AND (password_hash IS NOT NULL OR kakao_id IS NOT NULL OR toss_user_key IS NOT NULL)";
    static final String PROJECTION = """
        id, nick, created_at, registered_at, member_type,
        (role = 'admin') AS admin, (blocked_at IS NOT NULL) AS blocked,
        (password_hash IS NOT NULL) AS email_signup,
        (kakao_id IS NOT NULL) AS kakao_signup, (toss_user_key IS NOT NULL) AS toss_signup
        """;
    private final JdbcClient jdbc;

    public AdminUsersService(JdbcClient jdbc) { this.jdbc = jdbc; }

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record User(String id, String nick, long createdAt, Long registeredAt, List<String> signupMethods,
                       String status, String memberType, boolean admin) {}
    public record Page(List<User> users, long total, int page, int pageSize) {}

    static final RowMapper<User> MAPPER = (rs, row) -> {
        List<String> methods = new ArrayList<>(3);
        if (rs.getBoolean("email_signup")) methods.add("email");
        if (rs.getBoolean("kakao_signup")) methods.add("kakao");
        if (rs.getBoolean("toss_signup")) methods.add("toss");
        return new User(rs.getString("id"), rs.getString("nick"), Db.msReq(rs, "created_at"), Db.ms(rs, "registered_at"),
            List.copyOf(methods), rs.getBoolean("blocked") ? "blocked" : "active", rs.getString("member_type"), rs.getBoolean("admin"));
    };

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page list(String search, int page) {
        String query = search == null ? "" : search.strip();
        if (query.codePointCount(0, query.length()) > 24 || query.codePoints().anyMatch(Character::isISOControl))
            throw ApiException.badRequest("닉네임 검색어는 24자 이내로 입력해 주세요");
        if (page < 0 || page > 100_000) throw ApiException.badRequest("목록의 페이지를 다시 확인해 주세요");
        String pattern = "%" + query.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        String where = " WHERE " + REGISTERED + " AND nick ILIKE ? ESCAPE '!'";
        long total = jdbc.sql("SELECT count(*) FROM users" + where).param(pattern).query(Long.class).single();
        List<User> users = jdbc.sql("SELECT " + PROJECTION + " FROM users" + where
                + " ORDER BY COALESCE(registered_at, created_at) DESC, id DESC LIMIT ? OFFSET ?")
            .params(pattern, PAGE_SIZE, (long) page * PAGE_SIZE).query(MAPPER).list();
        return new Page(users, total, page, PAGE_SIZE);
    }

    /** This single-column update cannot change login/admin authority or reclassify a visitor. */
    public User setMemberType(String id, String memberType) {
        if (memberType == null || !MEMBER_TYPES.contains(memberType))
            throw ApiException.badRequest("일반 회원, 파트너, 소로우지기 중에서 골라 주세요");
        if (id == null || id.isBlank() || id.length() > 36) throw ApiException.notFound("가입 사용자를 찾을 수 없어요");
        return jdbc.sql("UPDATE users SET member_type = ? WHERE id = ? AND " + REGISTERED + " RETURNING " + PROJECTION)
            .params(memberType, id).query(MAPPER).optional().orElseThrow(() -> ApiException.notFound("가입 사용자를 찾을 수 없어요"));
    }
}
