package kr.co.shuim.profile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityConsentService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
public class ProfileController {
    private final AuthService auth;
    private final ProfileService profiles;
    private final BadgeService badges;
    private final BlockService blocks;
    private final JdbcClient jdbc;
    private final CommunityConsentService consent;

    public ProfileController(AuthService auth, ProfileService profiles, BadgeService badges, BlockService blocks, JdbcClient jdbc, CommunityConsentService consent) {
        this.auth = auth;
        this.profiles = profiles;
        this.badges = badges;
        this.blocks = blocks;
        this.jdbc = jdbc;
        this.consent = consent;
    }

    /** GET /api/profile — 내 프로필(비공개 필드·칭호·새 배지 포함) */
    @GetMapping("/api/profile")
    public Map<String, Object> mine(HttpServletRequest req, HttpServletResponse res) {
        return profiles.getMyProfile(auth.requireUser(req, res));
    }

    /** PUT /api/profile { nick?, bio?, avatarUrl?, name?, phone?, titleBadge? } — titleBadge "" 이면 칭호 해제 */
    @PutMapping("/api/profile")
    public Map<String, Object> update(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        Map<String, Object> b = body == null ? Map.of() : body;
        if (b.containsKey("nick") || b.containsKey("bio") || b.containsKey("avatarUrl") || b.containsKey("titleBadge")) consent.requireAccepted(me);
        String err = profiles.updateMyProfile(me, new ProfileService.ProfileInput(
            s(b.get("nick")), s(b.get("bio")), s(b.get("avatarUrl")), s(b.get("name")), s(b.get("phone"))), s(b.get("titleBadge")));
        if (err != null) throw ApiException.badRequest(err);
        return profiles.getMyProfile(me);
    }

    /** POST /api/profile/badges/seen — 새 배지 축하 시트를 봤다 */
    @PostMapping("/api/profile/badges/seen")
    public Map<String, Object> badgesSeen(HttpServletRequest req, HttpServletResponse res) {
        badges.markSeen(auth.requireUser(req, res).id());
        return Map.of("ok", true);
    }

    private static String s(Object o) { return o instanceof String str ? str : null; }

    /** GET /api/profile/{id}/listeners?offset= — 이 사람을 듣는 리스너 목록 */
    @GetMapping("/api/profile/{id}/listeners")
    public Map<String, Object> listeners(@PathVariable String id, @RequestParam(defaultValue = "0") int offset, HttpServletRequest req) {
        return people(id, true, offset, req);
    }

    /** GET /api/profile/{id}/listening?offset= — 이 사람이 듣는(리스닝 중인) 사람 목록 */
    @GetMapping("/api/profile/{id}/listening")
    public Map<String, Object> listening(@PathVariable String id, @RequestParam(defaultValue = "0") int offset, HttpServletRequest req) {
        return people(id, false, offset, req);
    }

    private Map<String, Object> people(String id, boolean listeners, int offset, HttpServletRequest req) {
        String viewer = auth.currentUser(req).map(DbUser::id).orElse(null);
        profiles.getPublicProfile(viewer, id).orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없어요"));
        List<ProfileService.ListUser> list = profiles.listPeople(viewer, id, listeners, offset);
        boolean hasMore = list.size() > ProfileService.LIST_PAGE;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("users", hasMore ? list.subList(0, ProfileService.LIST_PAGE) : list);
        out.put("hasMore", hasMore);
        out.put("nextOffset", offset + ProfileService.LIST_PAGE);
        return out;
    }

    /** "==강조==" 표시를 떼고 앞부분만 (원글 미리보기) */
    private static String snippet(String text, int max) {
        String t = text == null ? "" : text.replaceAll("==([^=\\n](?:[^=]|=(?!=))*?)==", "$1").replaceAll("\\s+", " ").strip();
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }

    /**
     * GET /api/profile/{id} — 공개 프로필 + 콘텐츠 탭 (숨김·차단 제외)
     * feed: 위로글, shout: 외침, comments: 내 위로(이 사람이 남긴 위로 댓글, 원글은 앞부분만), saved: 저장함(본인일 때만)
     */
    @GetMapping("/api/profile/{id}")
    public Map<String, Object> publicProfile(@PathVariable String id, HttpServletRequest req) {
        Optional<DbUser> viewer = auth.currentUser(req);
        ProfileService.PublicProfile profile = profiles.getPublicProfile(viewer.map(DbUser::id).orElse(null), id)
            .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없어요"));
        boolean isMe = viewer.map(v -> v.id().equals(id)).orElse(false);
        Set<String> excluded = viewer.map(v -> blocks.excludedIds(v.id())).orElse(Set.of());
        List<Map<String, Object>> feed = List.of();
        List<Map<String, Object>> shout = List.of();
        List<Map<String, Object>> comments = List.of();
        List<Map<String, Object>> saved = List.of();
        if (!profile.blocked()) {
            feed = jdbc.sql("""
                SELECT f.id, f.title, f.text, f.bg, f.image, f.created_at,
                       (SELECT count(*) FROM cheers c WHERE c.target_kind = 'feed' AND c.target_id = f.id)::int AS cheers
                  FROM feed_posts f WHERE f.author_id = ? AND f.hidden = FALSE ORDER BY f.created_at DESC LIMIT 50
                """).param(id).query((rs, i) -> feedRow(rs)).list();
            shout = jdbc.sql("""
                SELECT s.id, s.cat, s.text, s.created_at,
                       (SELECT count(*) FROM cheers c WHERE c.target_kind = 'post' AND c.target_id = s.id)::int AS cheers
                  FROM shout_posts s WHERE s.author_id = ? AND s.hidden = FALSE AND s.community_id IS NULL ORDER BY s.created_at DESC LIMIT 50
                """).param(id).query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("cat", rs.getString("cat"));
                    m.put("text", rs.getString("text"));
                    m.put("cheers", rs.getInt("cheers"));
                    m.put("createdAt", Db.msReq(rs, "created_at"));
                    return m;
                }).list();
            comments = jdbc.sql("""
                SELECT c.id, c.post_kind, c.post_id, c.text, c.created_at,
                       CASE WHEN sp.community_id IS NOT NULL THEN 'c:' || sp.community_id ELSE COALESCE(sp.author_id, fp.author_id) END AS post_author,
                       COALESCE(sp.text, CASE WHEN fp.title IS NOT NULL AND fp.title <> '' THEN fp.title || ' · ' || fp.text ELSE fp.text END) AS post_text,
                       (SELECT count(*) FROM cheers ch WHERE ch.target_kind = 'comment' AND ch.target_id = c.id)::int AS cheers
                  FROM comments c
                  LEFT JOIN shout_posts sp ON c.post_kind = 'post' AND sp.id = c.post_id AND sp.hidden = FALSE
                  LEFT JOIN feed_posts fp ON c.post_kind = 'feed' AND fp.id = c.post_id AND fp.hidden = FALSE
                  LEFT JOIN communities cc ON cc.id = sp.community_id
                 WHERE c.author_id = ? AND c.hidden = FALSE AND (sp.id IS NOT NULL OR fp.id IS NOT NULL)
                   AND (cc.id IS NULL OR (sp.created_at <= now() AND (cc.visibility = 'public'
                        OR EXISTS (SELECT 1 FROM community_members m WHERE m.community_id = cc.id AND m.user_id = ? AND m.status = 'active'))))
                 ORDER BY c.created_at DESC LIMIT 50
                """).param(id).param(viewer.map(DbUser::id).orElse("")).query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("postKind", rs.getString("post_kind"));
                    m.put("postId", rs.getString("post_id"));
                    m.put("postAuthorId", rs.getString("post_author"));
                    m.put("postSnippet", snippet(rs.getString("post_text"), 40));
                    m.put("text", rs.getString("text"));
                    m.put("cheers", rs.getInt("cheers"));
                    m.put("createdAt", Db.msReq(rs, "created_at"));
                    return m;
                }).list().stream().filter(m -> !excluded.contains((String) m.get("postAuthorId"))).map(m -> { m.remove("postAuthorId"); return m; }).toList();
            if (isMe) {
                saved = jdbc.sql("""
                    SELECT f.id, f.title, f.text, f.bg, f.image, f.created_at, f.author_id,
                           (SELECT count(*) FROM cheers c WHERE c.target_kind = 'feed' AND c.target_id = f.id)::int AS cheers
                      FROM saves sv JOIN feed_posts f ON f.id = sv.feed_post_id JOIN users u ON u.id = f.author_id
                     WHERE sv.user_id = ? AND f.hidden = FALSE AND u.blocked_at IS NULL
                     ORDER BY sv.created_at DESC LIMIT 50
                    """).param(id).query((rs, i) -> {
                        Map<String, Object> m = feedRow(rs);
                        m.put("authorId", rs.getString("author_id"));
                        return m;
                    }).list().stream().filter(m -> !excluded.contains((String) m.get("authorId"))).toList();
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("profile", profile);
        out.put("isMe", isMe);
        out.put("feed", feed);
        out.put("shout", shout);
        out.put("comments", comments);
        if (isMe) out.put("saved", saved);
        return out;
    }

    private static Map<String, Object> feedRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", rs.getString("id"));
        m.put("title", rs.getString("title"));
        m.put("text", rs.getString("text"));
        m.put("bg", rs.getInt("bg"));
        m.put("image", rs.getString("image"));
        m.put("cheers", rs.getInt("cheers"));
        m.put("createdAt", Db.msReq(rs, "created_at"));
        return m;
    }
}
