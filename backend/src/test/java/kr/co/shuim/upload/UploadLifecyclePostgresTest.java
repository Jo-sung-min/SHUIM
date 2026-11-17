package kr.co.shuim.upload;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import kr.co.shuim.profile.ProfileService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 업로드 발급 한도, 프로필 사진 주소 검사·옛 사진 정리, 붙지 않은 업로드 정리. 일회용 루프백 DB 만 쓴다 */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class UploadLifecyclePostgresTest {
    static final String CDN = "https://cdn.example.com";
    JdbcClient jdbc; String schema, uid, other; S3Service s3; ProfileService profiles;

    @BeforeEach void setup() {
        schema = "upl_test_" + UUID.randomUUID().toString().replace("-", "");
        var ds = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(ds);
        s3 = new S3Service("ap-northeast-2", "test-bucket", "upload", "test-key", "test-secret", CDN, jdbc);
        profiles = new ProfileService(jdbc, new BlockService(jdbc), new BadgeService(jdbc), s3);
        uid = user(); other = user();
    }
    @AfterEach void cleanup() {
        if (s3 != null) s3.close();
        if (jdbc != null && schema.matches("upl_test_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    String user() {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,'upload test','user',false)").param(id).update();
        return id;
    }
    DbUser me(String id, boolean anonymous) { return new DbUser(id, null, "upload test", "user", anonymous, null, null, 0L); }
    void issued(String key, String owner, String age) {
        jdbc.sql("INSERT INTO uploaded_objects (object_key, user_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP - CAST(? AS interval))").param(key).param(owner).param(age).update();
    }
    List<String> jobs() { return jdbc.sql("SELECT object_key FROM object_deletion_jobs ORDER BY object_key").query(String.class).list(); }
    String avatar(String id) { return jdbc.sql("SELECT avatar_url FROM profiles WHERE user_id = ?").param(id).query(String.class).optional().orElse(null); }
    ProfileService.ProfileInput avatarInput(String url) { return new ProfileService.ProfileInput(null, "", url, "", ""); }

    @Test void dailyPresignQuotaIsPerUserAndLowerForAnonymousSessions() {
        var quota = new UploadQuota(jdbc, 3, 1, 2, 0);
        for (int i = 0; i < 2; i++) issued("upload/" + uid + "-p" + i + ".webp", uid, "1 hour");
        issued("upload/" + uid + "-old.webp", uid, "25 hours");
        quota.check(me(uid, false), "image/webp");
        assertThrows(ApiException.class, () -> quota.check(me(uid, true), "image/webp"));
        issued("upload/" + uid + "-p2.webp", uid, "1 minute");
        assertEquals(429, assertThrows(ApiException.class, () -> quota.check(me(uid, false), "image/jpeg")).status());
        // 사진과 영상은 따로 센다
        quota.check(me(uid, false), "video/mp4");
        issued("upload/" + uid + "-v.mp4", uid, "1 minute");
        assertEquals(429, assertThrows(ApiException.class, () -> quota.check(me(uid, false), "video/mp4")).status());
        assertEquals(429, assertThrows(ApiException.class, () -> quota.check(me(other, true), "video/mp4")).status());
        quota.check(me(other, false), "image/webp");
    }

    @Test void avatarAcceptsOnlyOurMediaAndQueuesTheReplacedUpload() {
        String first = CDN + "/upload/2026/11/17/" + uid + "-aaaa.webp";
        String second = CDN + "/upload/2026/11/17/" + uid + "-bbbb.webp";
        assertNull(profiles.updateMyProfile(me(uid, false), avatarInput(first), null));
        assertEquals(first, avatar(uid));
        assertEquals("프로필 사진을 다시 올려 주세요.", profiles.updateMyProfile(me(uid, false), avatarInput("https://tracker.example.net/p.gif"), null));
        assertEquals("프로필 사진을 다시 올려 주세요.", profiles.updateMyProfile(me(uid, false), avatarInput("//tracker.example.net/p.gif"), null));
        assertEquals(first, avatar(uid));
        // 같은 사진을 다시 보내면 그대로 두고 아무것도 지우지 않는다
        assertNull(profiles.updateMyProfile(me(uid, false), avatarInput(first), null));
        assertTrue(jobs().isEmpty());
        // 바꾸면 옛 사진이 삭제 작업에 들어간다
        assertNull(profiles.updateMyProfile(me(uid, false), avatarInput(second), null));
        assertEquals(List.of("upload/2026/11/17/" + uid + "-aaaa.webp"), jobs());
        // 피드에서도 쓰는 사진은 지우지 않는다
        jdbc.sql("INSERT INTO feed_posts (id, author_id, text, image, images) VALUES ('f1', ?, '', ?, ARRAY[?])").param(uid).param(second).param(second).update();
        assertNull(profiles.updateMyProfile(me(uid, false), avatarInput(null), null));
        assertNull(avatar(uid));
        assertEquals(1, jobs().size());
        // 예전에 저장된 외부 주소는 그대로 보내면 저장이 막히지 않는다 (정리는 운영 SQL 로)
        jdbc.sql("UPDATE profiles SET avatar_url = 'https://legacy.example.net/a.png' WHERE user_id = ?").param(other).update();
        jdbc.sql("INSERT INTO profiles (user_id, avatar_url) VALUES (?, 'https://legacy.example.net/a.png') ON CONFLICT (user_id) DO NOTHING").param(other).update();
        assertNull(profiles.updateMyProfile(me(other, false), avatarInput("https://legacy.example.net/a.png"), null));
        // 남의 업로드는 지우지 않는다
        String theirs = CDN + "/upload/2026/11/17/" + uid + "-cccc.webp";
        assertNull(profiles.updateMyProfile(me(other, false), avatarInput(theirs), null));
        assertNull(profiles.updateMyProfile(me(other, false), avatarInput(null), null));
        assertEquals(1, jobs().size());
    }

    @Test void unattachedUploadsAreSweptOnceAfterTheGracePeriod() {
        String orphan = "upload/2026/11/14/" + uid + "-orphan.webp";
        String inFeed = "upload/2026/11/14/" + uid + "-feed.webp";
        String inPages = "upload/2026/11/14/" + uid + "-reel.mp4";
        String inShout = "upload/2026/11/14/" + uid + "-shout.webp";
        String avatar = "upload/2026/11/14/" + uid + "-avatar.webp";
        String album = "upload/2026/11/14/" + uid + "-album.webp";
        String fresh = "upload/2026/11/17/" + uid + "-fresh.webp";
        for (String k : List.of(orphan, inFeed, inPages, inShout, avatar, album)) issued(k, uid, "50 hours");
        issued(fresh, uid, "1 hour");
        jdbc.sql("INSERT INTO feed_posts (id, author_id, text, images, pages) VALUES ('f1', ?, '', ARRAY[?], CAST(? AS jsonb))")
            .param(uid).param(CDN + "/" + inFeed).param("[{\"video\":\"https://test-bucket.s3.ap-northeast-2.amazonaws.com/" + inPages + "\"}]").update();
        jdbc.sql("INSERT INTO shout_posts (id, author_id, cat, text, images) VALUES ('s1', ?, 'free', '', ARRAY[?])").param(uid).param(CDN + "/" + inShout).update();
        jdbc.sql("INSERT INTO profiles (user_id, avatar_url) VALUES (?, ?)").param(uid).param(CDN + "/" + avatar).update();
        jdbc.sql("INSERT INTO map_photos (user_id, object_key, url, map_id) VALUES (?, ?, ?, 'm')").param(uid).param(album).param(CDN + "/" + album).update();
        var worker = new ObjectDeletionWorker(jdbc, s3, true);
        worker.sweepOrphans();
        assertEquals(List.of(orphan), jobs());
        jdbc.sql("DELETE FROM object_deletion_jobs").update();
        worker.sweepOrphans();
        assertTrue(jobs().isEmpty());
        new ObjectDeletionWorker(jdbc, s3, false).sweepOrphans();
        assertTrue(jobs().isEmpty());
    }
}
