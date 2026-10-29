package kr.co.shuim.notify;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.community.BlockService;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;

/**
 * 알림 전용 API. 예전에는 나 페이지가 알림을 세려고 커뮤니티 전체(외침·댓글·피드)를 내려받아 브라우저에서 계산했다.
 * 같은 규칙(lib/community-core.ts 의 listNotifications)을 SQL 로 옮겨 최근 50개만 돌려준다:
 *   reply_to_comment  내 댓글에 달린 답글
 *   comment_on_post   내 글에 달린 댓글
 *   reply_on_thread   내가 댓글을 단 글에, 그 뒤로 달린 다른 사람의 댓글
 * 숨김 댓글, 운영 차단된 사람, 나와 서로 차단한 사람의 댓글은 뺀다. 읽음 기준(seenAt)은 지금처럼 기기에 둔다.
 */
@RestController
public class NotificationController {
    private static final int LIMIT = 50;
    private final AuthService auth;
    private final BlockService blocks;
    private final JdbcClient jdbc;

    public NotificationController(AuthService auth, BlockService blocks, JdbcClient jdbc) {
        this.auth = auth;
        this.blocks = blocks;
        this.jdbc = jdbc;
    }

    public record Item(String id, String kind, String postKind, String postId, String postText, String actorId, String actorNick, String text, long at, boolean read) {}

    /** GET /api/notifications?seenAt=<ms> → { items, unread } (로그인 전 방문자는 빈 목록) */
    @GetMapping("/api/notifications")
    public Map<String, Object> list(@RequestParam(defaultValue = "0") long seenAt, HttpServletRequest req) {
        Optional<DbUser> me = auth.currentUser(req);
        if (me.isEmpty()) return Map.of("items", List.of(), "unread", 0);
        String uid = me.get().id();
        Set<String> excluded = blocks.excludedIds(uid);
        List<Item> items = jdbc.sql("""
            WITH mine AS (SELECT id, post_id, created_at FROM comments WHERE author_id = :me),
                 first_on AS (SELECT post_id, min(created_at) AS first_at FROM mine GROUP BY post_id)
            SELECT c.id, c.post_kind, c.post_id, c.author_id, u.nick, c.text, c.created_at,
                   CASE WHEN c.parent_id IN (SELECT id FROM mine) THEN 'reply_to_comment'
                        WHEN COALESCE(sp.author_id, fp.author_id) = :me THEN 'comment_on_post'
                        ELSE 'reply_on_thread' END AS kind,
                   COALESCE(sp.text, CASE WHEN fp.title IS NOT NULL AND fp.title <> '' THEN fp.title || ' · ' || fp.text ELSE fp.text END) AS post_text
              FROM comments c
              JOIN users u ON u.id = c.author_id
              LEFT JOIN shout_posts sp ON c.post_kind = 'post' AND sp.id = c.post_id AND sp.hidden = FALSE
              LEFT JOIN feed_posts fp ON c.post_kind = 'feed' AND fp.id = c.post_id AND fp.hidden = FALSE
              LEFT JOIN first_on f ON f.post_id = c.post_id
             WHERE c.author_id <> :me AND c.hidden = FALSE AND u.blocked_at IS NULL
               AND (sp.id IS NOT NULL OR fp.id IS NOT NULL)
               AND (c.parent_id IN (SELECT id FROM mine)
                    OR COALESCE(sp.author_id, fp.author_id) = :me
                    OR (f.first_at IS NOT NULL AND c.created_at > f.first_at))
             ORDER BY c.created_at DESC
             LIMIT :lim
            """).param("me", uid).param("lim", LIMIT * 2)
            .query((rs, i) -> {
                long at = Db.msReq(rs, "created_at");
                return new Item(rs.getString("id"), rs.getString("kind"), rs.getString("post_kind"), rs.getString("post_id"),
                    strip(rs.getString("post_text")), rs.getString("author_id"), rs.getString("nick"), rs.getString("text"), at, at <= seenAt);
            }).list().stream().filter(it -> !excluded.contains(it.actorId())).limit(LIMIT).toList();
        long unread = items.stream().filter(it -> !it.read()).count();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("unread", unread);
        return out;
    }

    /** "==강조==" 표시를 뗀다 (화면의 stripHighlights 와 같은 규칙) */
    static String strip(String text) {
        return text == null ? "" : text.replaceAll("==([^=\\n](?:[^=]|=(?!=))*?)==", "$1");
    }
}
