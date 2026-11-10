package kr.co.shuim.community;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.upload.S3Service;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 릴스(영상 글)와 얹은 글 저장. Opt-in only: requires a dedicated disposable local PostgreSQL, never DB_URL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class FeedVideoPostgresTest {
    private static final String CDN = "https://cdn.example/feed/2026/11/10/";
    private static JdbcClient jdbc;
    private static TransactionTemplate tx;

    @BeforeAll
    static void setup() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(dataSource);
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    private static DbUser user(String id) {
        jdbc.sql("INSERT INTO users (id, nick, is_anonymous) VALUES (?, ?, TRUE)").param(id).param(id).update();
        DbUser user = new DbUser(id, null, id, "user", true, null, null, 0);
        new CommunityConsentService(jdbc).accept(user, CommunityConsentService.CURRENT_VERSION);
        return user;
    }

    /** 우리 버킷 주소이면서 파일 이름이 그 사용자 것일 때만 키를 돌려주는 S3 흉내 */
    private static S3Service ownS3() {
        S3Service s3 = mock(S3Service.class);
        when(s3.ownedKeyFromUrl(anyString(), anyString())).thenAnswer(call -> {
            String url = call.getArgument(0), userId = call.getArgument(1);
            return url.startsWith(CDN + userId + "-") ? "feed/2026/11/10/" + url.substring(CDN.length()) : null;
        });
        return s3;
    }

    private static Map<String, Object> reel(String userId, Object duration) {
        return Map.of("video", CDN + userId + "-abc.mp4", "image", CDN + userId + "-cover.webp", "text", "퇴근길 하늘",
            "duration", duration, "ratio", 0.5625, "muted", true,
            "overlays", List.of(Map.of("text", "오늘은 여기까지", "x", 0.5, "y", 0.4, "size", 0.08, "color", "cream", "font", "serif", "align", "center", "style", "dim")));
    }

    @Test
    void reelWithOverlaysRoundTripsAndDeletingItRemovesTheVideo() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("reel-author");
            S3Service s3 = ownS3();
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), s3, new MockEnvironment(), false, new BlockService(jdbc));
            var store = community.createFeedPost(author, null, 0, null, null, List.of(reel(author.id(), 24.5)), "0b8f6f8e-4a60-4f69-9df5-2bb0b1d0c111");
            var post = store.feed().stream().filter(item -> item.authorId().equals(author.id())).findFirst().orElseThrow();
            var page = post.pages().get(0);
            assertEquals(CDN + "reel-author-abc.mp4", page.video());
            assertEquals(CDN + "reel-author-cover.webp", post.image());
            assertEquals(24.5, page.duration());
            assertEquals(0.5625, page.ratio());
            assertEquals(Boolean.TRUE, page.muted());
            assertEquals(List.of(new Model.Overlay("오늘은 여기까지", 0.5, 0.4, 0.08, "cream", "serif", "center", "dim")), page.overlays());
            assertEquals("퇴근길 하늘", post.text());

            community.deleteFeedPost(author, post.id());
            verify(s3).deleteUploadedImage(CDN + "reel-author-abc.mp4");
            verify(s3).deleteUploadedImage(CDN + "reel-author-cover.webp");
        });
    }

    @Test
    void reelsMustUseTheAuthorsOwnShortMp4WithACoverAndStandAlone() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("reel-rules");
            user("reel-other");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), ownS3(), new MockEnvironment(), false, new BlockService(jdbc));
            var other = new java.util.HashMap<>(reel("reel-other", 10));
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, List.of(other))).status());
            var external = new java.util.HashMap<>(reel(author.id(), 10));
            external.put("video", "https://videos.example/reel-rules-abc.mp4");
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, List.of(external))).status());
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, List.of(reel(author.id(), 45)))).status());
            var noCover = new java.util.HashMap<>(reel(author.id(), 10));
            noCover.remove("image");
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, List.of(noCover))).status());
            var noRatio = new java.util.HashMap<>(reel(author.id(), 10));
            noRatio.remove("ratio");
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, List.of(noRatio))).status());
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null,
                List.of(reel(author.id(), 10), Map.of("image", CDN + "reel-rules-photo.webp", "text", "")))).status());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM feed_posts WHERE author_id = 'reel-rules'").query(Long.class).single());
        });
    }

    @Test
    void photoOverlaysNeedARatioAndTextOnlyPagesNeverKeepThem() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("overlay-photo");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), ownS3(), new MockEnvironment(), false, new BlockService(jdbc));
            var overlay = List.of(Map.of("text", "괜찮아", "x", 0.2, "y", 0.8, "size", 0.06, "color", "white", "font", "sans", "align", "left", "style", "plain"));
            var store = community.createFeedPost(author, null, 0, null, null, List.of(
                Map.of("image", "https://images.example/a.webp", "text", "", "ratio", 0.8, "overlays", overlay),
                Map.of("image", "https://images.example/b.webp", "text", "", "overlays", overlay),
                Map.of("text", "글만", "ratio", 1, "overlays", overlay)));
            var pages = store.feed().stream().filter(item -> item.authorId().equals(author.id())).findFirst().orElseThrow().pages();
            assertEquals(1, pages.get(0).overlays().size());
            assertEquals(0.8, pages.get(0).ratio());
            assertNull(pages.get(1).overlays());
            assertNull(pages.get(2).overlays());
            assertNull(pages.get(2).ratio());
            assertNull(pages.get(0).video());
            String raw = jdbc.sql("SELECT pages::text FROM feed_posts WHERE author_id = 'overlay-photo'").query(String.class).single();
            assertFalse(raw.contains("\"video\""), "photo pages stay compact in jsonb");
        });
    }
}
