package kr.co.shuim.ai;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.common.Mbti;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * MBTI별로 "위로받고 싶어 하는 방향" (mbti_comfort_guides 표, V51). 칭찬받기·사랑받기의 지침으로 쓴다.
 * 사용자의 MBTI 는 프로필(profiles.mbti)에 본인이 적은 것이고, 로그인한 계정의 세션에서 서버가 직접 읽는다 (요청 본문으로 받지 않는다).
 * 표는 10분 동안 기억해 둔다: 운영 중에 문구를 고치면 다시 배포하지 않아도 10분 안에 반영된다.
 * 지침을 못 읽어도 AI 요청은 그대로 간다 (지침 없이).
 */
@Service
public class MbtiComfortService {
    private static final Logger log = LoggerFactory.getLogger(MbtiComfortService.class);
    private static final long TTL_MS = 10 * 60_000L;

    /** direction: 위로받고 싶어 하는 방향 · praise: 닿는 칭찬 · love: 닿는 사랑의 말 · avoid: 피할 말 */
    public record Guide(String direction, String praise, String love, String avoid) {}

    private final JdbcClient jdbc;
    private final AuthService auth;
    private volatile Map<String, Guide> cache = Map.of();
    private volatile long loadedAt;

    public MbtiComfortService(JdbcClient jdbc, AuthService auth) {
        this.jdbc = jdbc;
        this.auth = auth;
    }

    /** 이 요청을 보낸 계정이 프로필에 적어 둔 MBTI 의 지침. 로그인하지 않았거나 적지 않았으면 비어 있다 */
    public Optional<Guide> guideFor(HttpServletRequest req) {
        try {
            return auth.currentUser(req).flatMap(user -> mbtiOf(user.id())).flatMap(this::guide);
        } catch (RuntimeException e) {
            log.warn("mbti comfort guide unavailable: {}", e.getMessage());
            return Optional.empty();
        }
    }

    Optional<String> mbtiOf(String userId) {
        return jdbc.sql("SELECT mbti FROM profiles WHERE user_id = ? AND mbti IS NOT NULL").param(userId)
            .query(String.class).optional().map(Mbti::normalize);
    }

    public Optional<Guide> guide(String mbti) {
        String type = Mbti.normalize(mbti);
        return type == null ? Optional.empty() : Optional.ofNullable(guides().get(type));
    }

    private Map<String, Guide> guides() {
        long now = System.currentTimeMillis();
        if (!cache.isEmpty() && now - loadedAt < TTL_MS) return cache;
        Map<String, Guide> loaded = new HashMap<>();
        jdbc.sql("SELECT mbti, direction, praise, love, avoid FROM mbti_comfort_guides").query((rs, i) ->
            loaded.put(rs.getString("mbti"), new Guide(rs.getString("direction"), rs.getString("praise"), rs.getString("love"), rs.getString("avoid")))).list();
        cache = Map.copyOf(loaded);
        loadedAt = now;
        return cache;
    }
}
