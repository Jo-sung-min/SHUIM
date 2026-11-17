package kr.co.shuim.upload;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ObjectDeletionWorker {
    private static final Logger log = LoggerFactory.getLogger(ObjectDeletionWorker.class);
    private final JdbcClient jdbc;
    private final S3Service s3;
    private final boolean orphanSweep;

    public ObjectDeletionWorker(JdbcClient jdbc, S3Service s3) { this(jdbc, s3, true); }

    @Autowired
    public ObjectDeletionWorker(JdbcClient jdbc, S3Service s3, @Value("${app.s3.orphan-cleanup-enabled:true}") boolean orphanSweep) {
        this.jdbc = jdbc; this.s3 = s3; this.orphanSweep = orphanSweep;
    }

    /**
     * 올렸지만 어디에도 붙지 않은 파일(글 쓰기를 그만둔 사진 등)을 지운다. 발급 뒤 48~72시간 사이의 것만 본다
     * (한 시간마다 돌며 창이 밀리므로 모든 업로드를 한 번 이상 보고, 그 사이 붙은 파일은 건드리지 않는다).
     * 업로드 주소를 저장하는 곳: 프로필 사진, 피드(image·images·pages), 외침 사진, 보관함(map_photos). 새로 생기면 여기에도 더한다.
     * 키 문자열로 찾으므로 CDN 주소·옛 S3 주소 어느 쪽으로 저장돼 있어도 쓰는 중으로 본다.
     */
    @Scheduled(fixedDelayString = "${app.s3.orphan-sweep-delay-ms:3600000}", initialDelay = 300000)
    public void sweepOrphans() {
        if (!orphanSweep || !s3.configured()) return;
        int queued = jdbc.sql(ORPHANS).param(s3.uploadPrefix() + "/%").update();
        if (queued > 0) log.info("Queued {} unattached uploads for deletion", queued);
    }

    /** 고른 고아 파일은 발급 기록(uploaded_objects)에서 빼고 삭제 작업으로 옮긴다 → 같은 파일을 다시 고르지 않는다 */
    static final String ORPHANS = """
        WITH orphans AS (
          DELETE FROM uploaded_objects WHERE object_key IN (
            SELECT o.object_key FROM uploaded_objects o
            WHERE o.created_at < CURRENT_TIMESTAMP - interval '48 hours'
              AND o.created_at >= CURRENT_TIMESTAMP - interval '72 hours'
              AND o.object_key LIKE ?
              AND NOT EXISTS (SELECT 1 FROM profiles p WHERE strpos(p.avatar_url, o.object_key) > 0)
              AND NOT EXISTS (SELECT 1 FROM feed_posts f WHERE strpos(coalesce(f.image, '') || ' ' || array_to_string(f.images, ' ') || ' ' || coalesce(f.pages::text, ''), o.object_key) > 0)
              AND NOT EXISTS (SELECT 1 FROM shout_posts s WHERE strpos(array_to_string(s.images, ' '), o.object_key) > 0)
              AND NOT EXISTS (SELECT 1 FROM map_photos m WHERE m.object_key = o.object_key)
            ORDER BY o.created_at
            LIMIT 200)
          RETURNING object_key)
        INSERT INTO object_deletion_jobs (object_key, not_before)
        SELECT object_key, now() FROM orphans
        ON CONFLICT (object_key) DO NOTHING
        """;

    @Scheduled(fixedDelayString = "${app.s3.cleanup-delay-ms:60000}", initialDelay = 60000)
    public void cleanup() {
        for (String key : jdbc.sql("SELECT object_key FROM object_deletion_jobs WHERE not_before <= now() ORDER BY not_before LIMIT 100").query(String.class).list()) {
            try {
                s3.deleteObject(key);
                jdbc.sql("DELETE FROM object_deletion_jobs WHERE object_key = ?").param(key).update();
            } catch (RuntimeException ex) {
                // Do not log object keys (they include a deleted user identifier).
                log.warn("Account media cleanup failed; queued for retry ({})", ex.getClass().getSimpleName());
                jdbc.sql("UPDATE object_deletion_jobs SET attempts = attempts + 1, not_before = now() + interval '5 minutes' WHERE object_key = ?").param(key).update();
            }
        }
    }

    @Configuration
    @EnableScheduling
    static class Scheduling {}
}
