package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import kr.co.shuim.common.Db;
import kr.co.shuim.upload.S3Service;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Deletes only the authenticated account. Relational cleanup and object jobs commit together. */
@Service
public class AccountDeletionService {
    private final JdbcClient jdbc;
    private final S3Service s3;

    public AccountDeletionService(JdbcClient jdbc, S3Service s3) {
        this.jdbc = jdbc;
        this.s3 = s3;
    }

    @Transactional
    public void delete(DbUser user, String confirmation) {
        if (user == null) throw ApiException.unauthorized("로그인이 필요해요");
        if (!"계정 삭제".equals(confirmation)) throw ApiException.badRequest("확인란에 계정 삭제를 입력해 주세요.");
        Db.lockCommunity(jdbc);
        String id = user.id();
        // Serializes deletion with concurrent FK-backed writes and upload registration.
        if (jdbc.sql("SELECT id FROM users WHERE id = ? FOR UPDATE").param(id).query(String.class).optional().isEmpty()) {
            throw ApiException.unauthorized("이미 삭제된 계정이에요");
        }
        Set<String> keys = new LinkedHashSet<>(jdbc.sql("SELECT object_key FROM uploaded_objects WHERE user_id = ?")
            .param(id).query(String.class).list());
        // Backfill attached media uploaded before uploaded_objects was introduced.
        List<String> urls = jdbc.sql("""
            SELECT avatar_url AS url FROM profiles WHERE user_id = ? AND avatar_url IS NOT NULL
            UNION SELECT image FROM feed_posts WHERE author_id = ? AND image IS NOT NULL
            UNION SELECT unnest(images) FROM feed_posts WHERE author_id = ?
            UNION SELECT page->>'image' FROM feed_posts, jsonb_array_elements(pages) page
                  WHERE author_id = ? AND page->>'image' IS NOT NULL
            """).param(id).param(id).param(id).param(id).query(String.class).list();
        for (String url : urls) {
            String key = s3.ownedKeyFromUrl(url, id);
            if (key != null) keys.add(key);
        }
        for (String key : keys) {
            // Let already-issued 60-second upload URLs expire before cleanup to prevent re-upload.
            jdbc.sql("INSERT INTO object_deletion_jobs (object_key, not_before) VALUES (?, now() + interval '2 minutes') ON CONFLICT (object_key) DO NOTHING")
                .param(key).update();
        }
        // Polymorphic references have no FK; delete dependent reactions before their targets.
        for (String table : List.of("cheers", "reports")) {
            jdbc.sql("DELETE FROM " + table + " WHERE " + """
                (target_kind = 'post' AND target_id IN (SELECT id FROM shout_posts WHERE author_id = ?))
                OR (target_kind = 'feed' AND target_id IN (SELECT id FROM feed_posts WHERE author_id = ?))
                OR (target_kind = 'comment' AND target_id IN (
                    SELECT id FROM comments WHERE author_id = ?
                    OR (post_kind = 'post' AND post_id IN (SELECT id FROM shout_posts WHERE author_id = ?))
                    OR (post_kind = 'feed' AND post_id IN (SELECT id FROM feed_posts WHERE author_id = ?))))
                """).param(id).param(id).param(id).param(id).param(id).update();
        }
        jdbc.sql("""
            DELETE FROM comments WHERE author_id = ?
            OR (post_kind = 'post' AND post_id IN (SELECT id FROM shout_posts WHERE author_id = ?))
            OR (post_kind = 'feed' AND post_id IN (SELECT id FROM feed_posts WHERE author_id = ?))
            """).param(id).param(id).param(id).update();
        // Remove reports with private evidence from this user's conversations as well.
        jdbc.sql("""
            DELETE FROM safety_reports WHERE reporter_id = ? OR (kind = 'user' AND target_id = ?)
            OR (kind = 'message' AND target_id IN (SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE c.user_a = ? OR c.user_b = ?))
            """).param(id).param(id).param(id).param(id).update();
        jdbc.sql("DELETE FROM conversations WHERE user_a = ? OR user_b = ?").param(id).param(id).update();
        jdbc.sql("DELETE FROM messages WHERE sender_id = ?").param(id).update();
        jdbc.sql("DELETE FROM shout_posts WHERE author_id = ?").param(id).update();
        jdbc.sql("DELETE FROM feed_posts WHERE author_id = ?").param(id).update();
        jdbc.sql("DELETE FROM donations WHERE user_id = ?").param(id).update();
        jdbc.sql("""
            UPDATE weekly_batches w SET rows = COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(w.rows) item
                WHERE item->>'userId' IS DISTINCT FROM ?), '[]'::jsonb),
                fund_total = (SELECT COALESCE(sum(amount), 0) FROM donations WHERE created_at >= w.week AND created_at < w.week + interval '7 days'),
                fund_count = (SELECT count(*) FROM donations WHERE created_at >= w.week AND created_at < w.week + interval '7 days'),
                fund_donors = (SELECT count(DISTINCT user_id) FROM donations WHERE created_at >= w.week AND created_at < w.week + interval '7 days')
            """).param(id).update();
        // Cascades cover profiles, records/goals, settings, sessions, follows/saves, personal blocks and uploads.
        jdbc.sql("DELETE FROM users WHERE id = ?").param(id).update();
    }
}
