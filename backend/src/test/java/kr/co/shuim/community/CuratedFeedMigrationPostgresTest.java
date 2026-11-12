package kr.co.shuim.community;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** V35: 샘플 피드만 지우고 명화 큐레이션 10개로 채운다. Opt-in only: dedicated disposable local PostgreSQL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class CuratedFeedMigrationPostgresTest {
    @Test
    void replacesOnlySampleFeedPostsWithTenValidCuratedPosts() throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        String schema = "curated_" + UUID.randomUUID().toString().replace("-", "");
        JdbcClient admin = JdbcClient.create(source);
        try {
            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("34").load().migrate();
            JdbcClient jdbc = JdbcClient.create(source);
            String p = schema + ".";
            // 실제 사용자 글과 그 반응은 남아야 한다
            jdbc.sql("INSERT INTO " + p + "users (id, nick) VALUES ('real-user', '진짜')").update();
            jdbc.sql("INSERT INTO " + p + "feed_posts (id, author_id, text) VALUES ('real-post', 'real-user', '내 글')").update();
            jdbc.sql("INSERT INTO " + p + "cheers (user_id, target_kind, target_id) VALUES ('real-user', 'feed', 'real-post')").update();
            jdbc.sql("INSERT INTO " + p + "cheers (user_id, target_kind, target_id) VALUES ('real-user', 'feed', 'f1')").update();
            jdbc.sql("INSERT INTO " + p + "saves (user_id, feed_post_id) VALUES ('real-user', 'f1')").update();
            long sampleBefore = jdbc.sql("SELECT count(*) FROM " + p + "feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7')").query(Long.class).single();
            assertTrue(sampleBefore > 0);

            // V35 만 검증한다. 뒤 마이그레이션(V39 curated_feed_more)이 큐레이션 글을 더 넣는다
            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("35").load().migrate();

            assertEquals(0L, jdbc.sql("SELECT count(*) FROM " + p + "feed_posts WHERE author_id IN ('u1','u2','u3','u4','u5','u6','u7')").query(Long.class).single());
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM " + p + "feed_posts WHERE id = 'real-post'").query(Long.class).single());
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM " + p + "cheers WHERE target_id = 'real-post'").query(Long.class).single());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM " + p + "cheers WHERE target_kind = 'feed' AND target_id = 'f1'").query(Long.class).single());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM " + p + "saves WHERE feed_post_id = 'f1'").query(Long.class).single());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM " + p + "comments WHERE post_kind = 'feed' AND post_id NOT IN (SELECT id FROM " + p + "feed_posts)").query(Long.class).single());
            assertEquals("소로우", jdbc.sql("SELECT nick FROM " + p + "users WHERE id = 'sorow-curator'").query(String.class).single());

            List<String> pages = jdbc.sql("SELECT pages::text FROM " + p + "feed_posts WHERE author_id = 'sorow-curator' ORDER BY created_at DESC").query(String.class).list();
            assertEquals(10, pages.size());
            ObjectMapper json = new ObjectMapper();
            for (String raw : pages) {
                List<Map<String, Object>> list = json.readValue(raw, new TypeReference<>() {});
                assertEquals(1, list.size());
                Map<String, Object> page = list.get(0);
                assertTrue(String.valueOf(page.get("image")).matches("/feed/curation/(sky|space)-[a-z-]+-v1\\.webp"), raw);
                assertEquals(0.5625, FeedMedia.ratio(page.get("ratio")));
                assertTrue(String.valueOf(page.get("title")).matches("오늘의 (하늘|공간)"));
                // 서버 정리 규칙을 거쳐도 그대로여야 한다 (색·글꼴·크기·길이 모두 허용 범위)
                List<?> rawOverlays = (List<?>) page.get("overlays");
                List<Model.Overlay> cleaned = FeedMedia.overlays(rawOverlays);
                assertEquals(1, cleaned.size());
                Map<?, ?> o = (Map<?, ?>) rawOverlays.get(0);
                assertEquals(o.get("text"), cleaned.get(0).text());
                assertEquals(o.get("font"), cleaned.get(0).font());
                assertEquals(o.get("color"), cleaned.get(0).color());
                assertEquals(((Number) o.get("size")).doubleValue(), cleaned.get(0).size());
            }
        } finally {
            admin.sql("DROP SCHEMA IF EXISTS " + schema + " CASCADE").update();
        }
    }

    /** V50: V39 의 미술관 원본 JPG 주소를 CDN WebP 로 바꾸고, 그 사이 손댄 글은 그대로 둔다 */
    @Test
    void movesMuseumOriginalsToCdnWebpWithoutTouchingEditedPosts() throws Exception {
        DriverManagerDataSource source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        String schema = "curated_cdn_" + UUID.randomUUID().toString().replace("-", "");
        JdbcClient admin = JdbcClient.create(source);
        try {
            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("49").load().migrate();
            JdbcClient jdbc = JdbcClient.create(source);
            String p = schema + ".";
            assertEquals(10L, jdbc.sql("SELECT count(*) FROM " + p + "feed_posts WHERE image LIKE 'https://images.metmuseum.org/CRDImages/%'").query(Long.class).single());
            // 관리자가 이미 다른 그림으로 바꾼 글
            jdbc.sql("UPDATE " + p + "feed_posts SET image = '/feed/curation/edited-v1.webp' WHERE id = 'curation-12'").update();
            String editedPages = jdbc.sql("SELECT pages::text FROM " + p + "feed_posts WHERE id = 'curation-12'").query(String.class).single();

            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("50").load().migrate();

            ObjectMapper json = new ObjectMapper();
            List<Map<String, Object>> rows = jdbc.sql("SELECT id, image, images[1] AS first, cardinality(images) AS n, pages::text AS pages FROM " + p + "feed_posts WHERE id LIKE 'curation-%' AND id >= 'curation-11' AND id <> 'curation-12'").query().listOfRows();
            assertEquals(9, rows.size());
            for (Map<String, Object> row : rows) {
                String image = String.valueOf(row.get("image"));
                assertTrue(image.matches("/feed/curation/met-[0-9]+-v1\\.webp"), image);
                assertEquals(image, row.get("first"));
                assertEquals(1, ((Number) row.get("n")).intValue());
                List<Map<String, Object>> pages = json.readValue(String.valueOf(row.get("pages")), new TypeReference<>() {});
                assertEquals(1, pages.size());
                assertEquals(image, pages.get(0).get("image"));
                assertEquals(0.5625, FeedMedia.ratio(pages.get(0).get("ratio")));
                assertEquals(2, ((List<?>) pages.get(0).get("overlays")).size());
            }
            assertEquals("/feed/curation/edited-v1.webp", jdbc.sql("SELECT image FROM " + p + "feed_posts WHERE id = 'curation-12'").query(String.class).single());
            assertEquals(editedPages, jdbc.sql("SELECT pages::text FROM " + p + "feed_posts WHERE id = 'curation-12'").query(String.class).single());
            assertEquals(1L, jdbc.sql("SELECT count(*) FROM " + p + "feed_posts WHERE pages::text LIKE '%images.metmuseum.org%'").query(Long.class).single());
        } finally {
            admin.sql("DROP SCHEMA IF EXISTS " + schema + " CASCADE").update();
        }
    }
}
