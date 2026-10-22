package kr.co.shuim.auth;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The account/session is the authority for policy consent; browser state cannot enable AI processing. */
@Service
public class PolicyConsentService {
    public static final String VERSION = "2026-10-21";
    private final JdbcClient jdbc;
    private final AuthService auth;

    public PolicyConsentService(JdbcClient jdbc, AuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    public record State(String version, boolean signupAccepted, boolean aiAccepted, String userId) {}

    public void validateVersion(String version) {
        if (!VERSION.equals(version)) throw ApiException.badRequest("최신 이용약관과 개인정보 처리 안내를 확인하고 동의해 주세요.");
    }

    public State state(DbUser user) {
        if (user == null) return new State(VERSION, false, false, null);
        return jdbc.sql("SELECT version, ai_accepted FROM user_policy_consents WHERE user_id = ?")
            .param(user.id()).query((rs, row) -> {
                boolean current = VERSION.equals(rs.getString("version"));
                return new State(VERSION, current, current && rs.getBoolean("ai_accepted"), user.id());
            }).optional().orElseGet(() -> new State(VERSION, false, false, user.id()));
    }

    public boolean hasSignupConsent(String userId) {
        return userId != null && jdbc.sql("SELECT count(*) FROM user_policy_consents WHERE user_id = ? AND version = ?")
            .param(userId).param(VERSION).query(Long.class).single() > 0;
    }

    @Transactional
    public State accept(DbUser user, String version, boolean aiAccepted) {
        validateVersion(version);
        if (user == null) throw ApiException.unauthorized("계정 상태를 확인한 뒤 다시 시도해 주세요.");
        jdbc.sql("""
            INSERT INTO user_policy_consents (user_id, version, ai_accepted) VALUES (?, ?, ?)
            ON CONFLICT (user_id) DO UPDATE SET
              accepted_at = CASE WHEN user_policy_consents.version = EXCLUDED.version
                THEN user_policy_consents.accepted_at ELSE now() END,
              version = EXCLUDED.version, ai_accepted = EXCLUDED.ai_accepted, updated_at = now()
            """).param(user.id()).param(version).param(aiAccepted).update();
        return new State(VERSION, true, aiAccepted, user.id());
    }

    public void requireAiConsent(HttpServletRequest req) {
        DbUser user = auth.currentUser(req).orElse(null);
        if (!state(user).aiAccepted()) {
            throw ApiException.forbidden("AI 이용 및 정보 제공 안내를 확인하고 동의해 주세요.");
        }
    }
}
