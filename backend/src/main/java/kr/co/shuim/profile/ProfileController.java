package kr.co.shuim.profile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.community.CommunityConsentService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
public class ProfileController {
    private final AuthService auth;
    private final ProfileService profiles;
    private final JdbcClient jdbc;
    private final CommunityConsentService consent;

    public ProfileController(AuthService auth, ProfileService profiles, JdbcClient jdbc, CommunityConsentService consent) {
        this.auth = auth;
        this.profiles = profiles;
        this.jdbc = jdbc;
        this.consent = consent;
    }

    /** GET /api/profile — 내 프로필(비공개 필드 포함) */
    @GetMapping("/api/profile")
    public Map<String, Object> mine(HttpServletRequest req, HttpServletResponse res) {
        return profiles.getMyProfile(auth.requireUser(req, res));
    }

    /** PUT /api/profile { nick?, bio?, avatarUrl?, name?, phone? } */
    @PutMapping("/api/profile")
    public Map<String, Object> update(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        Map<String, Object> b = body == null ? Map.of() : body;
        if (b.containsKey("nick") || b.containsKey("bio") || b.containsKey("avatarUrl")) consent.requireAccepted(me);
        String err = profiles.updateMyProfile(me, new ProfileService.ProfileInput(
            s(b.get("nick")), s(b.get("bio")), s(b.get("avatarUrl")), s(b.get("name")), s(b.get("phone"))));
        if (err != null) throw ApiException.badRequest(err);
        return profiles.getMyProfile(me);
    }

    private static String s(Object o) { return o instanceof String str ? str : null; }

    /** GET /api/profile/{id} — 공개 프로필 + 그 사람의 위로글·외침 (숨김·차단 제외) */
    @GetMapping("/api/profile/{id}")
    public Map<String, Object> publicProfile(@PathVariable String id, HttpServletRequest req) {
        Optional<DbUser> viewer = auth.currentUser(req);
        ProfileService.PublicProfile profile = profiles.getPublicProfile(viewer.map(DbUser::id).orElse(null), id)
            .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없어요"));
        List<Map<String, Object>> feed = List.of();
        List<Map<String, Object>> shout = List.of();
        if (!profile.blocked()) {
            feed = jdbc.sql("""
                SELECT f.id, f.title, f.text, f.bg, f.image, f.created_at,
                       (SELECT count(*) FROM cheers c WHERE c.target_kind = 'feed' AND c.target_id = f.id)::int AS cheers
                  FROM feed_posts f WHERE f.author_id = ? AND f.hidden = FALSE ORDER BY f.created_at DESC LIMIT 50
                """).param(id).query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("title", rs.getString("title"));
                    m.put("text", rs.getString("text"));
                    m.put("bg", rs.getInt("bg"));
                    m.put("image", rs.getString("image"));
                    m.put("cheers", rs.getInt("cheers"));
                    m.put("createdAt", Db.msReq(rs, "created_at"));
                    return m;
                }).list();
            shout = jdbc.sql("""
                SELECT s.id, s.cat, s.text, s.created_at,
                       (SELECT count(*) FROM cheers c WHERE c.target_kind = 'post' AND c.target_id = s.id)::int AS cheers
                  FROM shout_posts s WHERE s.author_id = ? AND s.hidden = FALSE ORDER BY s.created_at DESC LIMIT 50
                """).param(id).query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("cat", rs.getString("cat"));
                    m.put("text", rs.getString("text"));
                    m.put("cheers", rs.getInt("cheers"));
                    m.put("createdAt", Db.msReq(rs, "created_at"));
                    return m;
                }).list();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("profile", profile);
        out.put("isMe", viewer.map(v -> v.id().equals(id)).orElse(false));
        out.put("feed", feed);
        out.put("shout", shout);
        return out;
    }
}
