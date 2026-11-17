package kr.co.shuim.auth;

import kr.co.shuim.config.ApiException;
import kr.co.shuim.common.Db;
import kr.co.shuim.upload.S3Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Deletes only the authenticated account. Relational cleanup and object jobs commit together. */
@Service
public class AccountDeletionService {
    private final JdbcClient jdbc;
    private final S3Service s3;
    private final KakaoUnlinkClient kakaoUnlink;

    public AccountDeletionService(JdbcClient jdbc, S3Service s3) {
        this(jdbc, s3, null);
    }

    @Autowired
    public AccountDeletionService(JdbcClient jdbc, S3Service s3, KakaoUnlinkClient kakaoUnlink) {
        this.jdbc = jdbc;
        this.s3 = s3;
        this.kakaoUnlink = kakaoUnlink;
    }

    @Transactional
    public void delete(DbUser user, String confirmation) {
        if (user == null) throw ApiException.unauthorized("로그인이 필요해요");
        if (!"계정 삭제".equals(confirmation)) throw ApiException.badRequest("확인란에 계정 삭제를 입력해 주세요.");
        if (!deleteAccount(user.id())) throw ApiException.unauthorized("이미 삭제된 계정이에요");
    }

    /** 확인 문구 없이 계정 하나를 지운다 (토스 연결 끊기 콜백). 이미 없으면 false */
    @Transactional
    public boolean deleteAccount(String id) {
        Db.lockCommunity(jdbc);
        // Serializes deletion with concurrent FK-backed writes and upload registration.
        if (jdbc.sql("SELECT id FROM users WHERE id = ? FOR UPDATE").param(id).query(String.class).optional().isEmpty()) return false;
        String kakaoId = jdbc.sql("SELECT kakao_id FROM users WHERE id = ?").param(id).query(String.class).optional().orElse(null);
        handOverCreatedCircles(id);
        Set<String> keys = new LinkedHashSet<>(jdbc.sql("SELECT object_key FROM uploaded_objects WHERE user_id = ?")
            .param(id).query(String.class).list());
        // Backfill attached media uploaded before uploaded_objects was introduced.
        List<String> urls = jdbc.sql("""
            SELECT avatar_url AS url FROM profiles WHERE user_id = ? AND avatar_url IS NOT NULL
            UNION SELECT image FROM feed_posts WHERE author_id = ? AND image IS NOT NULL
            UNION SELECT unnest(images) FROM feed_posts WHERE author_id = ?
            UNION SELECT page->>'image' FROM feed_posts, jsonb_array_elements(pages) page
                  WHERE author_id = ? AND page->>'image' IS NOT NULL
            UNION SELECT page->>'video' FROM feed_posts, jsonb_array_elements(pages) page
                  WHERE author_id = ? AND page->>'video' IS NOT NULL
            """).param(id).param(id).param(id).param(id).param(id).query(String.class).list();
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
        unlinkKakaoAfterCommit(kakaoId);
        return true;
    }

    /**
     * communities.created_by 는 users 를 ON DELETE 없이 가리켜, 소로우를 연 사람은 그대로 지우면 FK 오류가 난다.
     * 가장 덜 잃는 쪽으로 넘긴다: 다른 활성 멤버가 있으면 keeper 우선·먼저 들어온 순으로 owner 로 올리고 created_by 를 넘긴다.
     * 남은 멤버가 없으면 관리자 계정에 넘기고 닫는다(closed_at, 사연은 남는다). 관리자도 없으면 그 소로우만 지운다.
     */
    private void handOverCreatedCircles(String id) {
        List<String> circles = jdbc.sql("SELECT id FROM communities WHERE created_by = ?").param(id).query(String.class).list();
        if (circles.isEmpty()) return;
        String admin = jdbc.sql("SELECT id FROM users WHERE role = 'admin' AND NOT is_anonymous AND id <> ? ORDER BY created_at, id LIMIT 1")
            .param(id).query(String.class).optional().orElse(null);
        for (String circle : circles) {
            String heir = jdbc.sql("""
                SELECT user_id FROM community_members WHERE community_id = ? AND user_id <> ? AND status = 'active'
                ORDER BY (role = 'keeper') DESC, joined_at, user_id LIMIT 1
                """).param(circle).param(id).query(String.class).optional().orElse(null);
            if (heir != null) {
                jdbc.sql("UPDATE community_members SET role = 'owner' WHERE community_id = ? AND user_id = ?").param(circle).param(heir).update();
                jdbc.sql("UPDATE communities SET created_by = ? WHERE id = ?").param(heir).param(circle).update();
            } else if (admin != null) {
                jdbc.sql("UPDATE communities SET created_by = ?, closed_at = COALESCE(closed_at, ?) WHERE id = ?")
                    .param(admin).param(System.currentTimeMillis()).param(circle).update();
            } else {
                jdbc.sql("DELETE FROM communities WHERE id = ?").param(circle).update();
            }
        }
    }

    /** 카카오 연결 끊기는 삭제가 확정된 뒤에만 (롤백되면 부르지 않는다) */
    private void unlinkKakaoAfterCommit(String kakaoId) {
        if (kakaoUnlink == null || kakaoId == null || !kakaoUnlink.configured()) return;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() { kakaoUnlink.unlinkLater(kakaoId); }
            });
        } else {
            kakaoUnlink.unlinkLater(kakaoId);
        }
    }
}
