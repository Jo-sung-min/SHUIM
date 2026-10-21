package kr.co.shuim.upload;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public ObjectDeletionWorker(JdbcClient jdbc, S3Service s3) { this.jdbc = jdbc; this.s3 = s3; }

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
