package kr.co.shuim.community;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
public class CommunityConsentService {
    public static final String CURRENT_VERSION = "2026-10-21";
    private final JdbcClient jdbc;
    public CommunityConsentService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void accept(DbUser user, String version) {
        if (!CURRENT_VERSION.equals(version)) throw ApiException.badRequest("최신 커뮤니티 이용규칙을 확인해 주세요.");
        jdbc.sql("INSERT INTO community_consents (user_id, version) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET version = EXCLUDED.version, accepted_at = now()")
            .param(user.id()).param(version).update();
    }

    public void requireAccepted(DbUser user) {
        if (jdbc.sql("SELECT count(*) FROM community_consents WHERE user_id = ? AND version = ?")
            .param(user.id()).param(CURRENT_VERSION).query(Long.class).single() == 0) {
            throw new ApiException(409, "글과 메시지를 보내기 전에 커뮤니티 이용규칙에 동의해 주세요.");
        }
    }
}
