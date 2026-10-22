package kr.co.shuim.auth;

import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.community.CommunityService;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.community.SafetyReportService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.message.MessageService;
import kr.co.shuim.upload.S3Service;
import kr.co.shuim.upload.ObjectDeletionWorker;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.web.client.RestClient;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in only: requires a dedicated disposable local PostgreSQL, never DB_URL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class AccountSafetyPostgresTest {
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

    private static long count(String sql) { return jdbc.sql(sql).query(Long.class).single(); }

    @Test
    void retryingAFeedRequestCreatesOnePostPerAuthorAndLegacyRequestsStayIndependent() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser first = user("feed-retry-a");
            DbUser second = user("feed-retry-b");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false, new BlockService(jdbc));
            String key = "d489862d-8a8f-4692-b301-59967f816a9c";
            var initial = community.createFeedPost(first, "처음 게시", 0, null, null, null, key);
            String postId = initial.feed().stream().filter(item -> item.authorId().equals(first.id())).findFirst().orElseThrow().id();
            var retry = community.createFeedPost(first, "처음 게시", 0, null, null, null, key.toUpperCase());
            assertEquals(postId, retry.feed().stream().filter(item -> item.authorId().equals(first.id())).findFirst().orElseThrow().id());
            assertEquals(1, count("SELECT count(*) FROM feed_posts WHERE author_id = 'feed-retry-a'"));
            community.createFeedPost(second, "다른 작성자", 0, null, null, null, key);
            assertEquals(1, count("SELECT count(*) FROM feed_posts WHERE author_id = 'feed-retry-b'"));
            community.createFeedPost(first, "키 없는 게시", 0, null, null, null);
            community.createFeedPost(first, "키 없는 게시", 0, null, null, null);
            assertEquals(3, count("SELECT count(*) FROM feed_posts WHERE author_id = 'feed-retry-a'"));
        });
    }

    @Test
    void malformedFeedRequestKeysNeverCreatePosts() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("feed-invalid-key");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false, new BlockService(jdbc));
            for (Object key : java.util.List.of("", "not-a-uuid", "1-1-1-1-1", 42)) {
                assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, "글", 0, null, null, null, key)).status());
            }
            assertEquals(0, count("SELECT count(*) FROM feed_posts WHERE author_id = 'feed-invalid-key'"));
        });
    }

    @Test
    void photoOnlyFeedPagesPersistAndRoundTripWithoutInventingCaptions() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("photo-only-author");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false, new BlockService(jdbc));
            String image = "https://images.example/photo.webp";
            var store = community.createFeedPost(author, null, 0, null, null,
                java.util.List.of(Map.of("image", image, "text", "  "), Map.of("text", "짧은 글")));
            var post = store.feed().stream().filter(item -> item.authorId().equals(author.id())).findFirst().orElseThrow();
            assertEquals("", post.text());
            assertEquals(image, post.image());
            assertEquals(2, post.pages().size());
            assertEquals("", post.pages().get(0).text());
            assertEquals("짧은 글", post.pages().get(1).text());
            assertEquals(1, count("SELECT count(*) FROM feed_posts WHERE author_id = 'photo-only-author' AND text = ''"));
        });
    }

    @Test
    void legacyPhotoOnlyFeedWorksButAnEmptyOrInvalidPhotoPostIsRejected() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser author = user("photo-legacy-author");
            CommunityService community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false, new BlockService(jdbc));
            community.createFeedPost(author, "", 0, null, "https://images.example/photo.jpg", null);
            assertEquals(1, count("SELECT count(*) FROM feed_posts WHERE author_id = 'photo-legacy-author' AND text = ''"));
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, "  ", 0, null, null, java.util.List.of(Map.of("text", "")))).status());
            assertEquals(400, assertThrows(ApiException.class, () -> community.createFeedPost(author, null, 0, null, null, java.util.List.of(Map.of("image", "javascript:alert(1)", "text", "")))).status());
            assertEquals(1, count("SELECT count(*) FROM feed_posts WHERE author_id = 'photo-legacy-author'"));
        });
    }

    @Test
    void deletesAllAccountDataAndReferencesWhilePreservingUnrelatedAccounts() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser deleted = user("delete-a");
            new PolicyConsentService(jdbc, mock(AuthService.class)).accept(deleted, PolicyConsentService.VERSION, true);
            user("delete-b");
            jdbc.sql("INSERT INTO profiles (user_id, name, phone, avatar_url) VALUES ('delete-a', 'private', '01012345678', 'https://cdn.example/feed/2026/delete-a-legacy.png')").update();
            jdbc.sql("INSERT INTO journal_entries (user_id, date, cat, score, note) VALUES ('delete-a', CURRENT_DATE, 'mind', 1, 'private')").update();
            jdbc.sql("INSERT INTO day_logs (user_id, date) VALUES ('delete-a', CURRENT_DATE)").update();
            jdbc.sql("INSERT INTO memos (id, user_id, cat, text) VALUES ('delete-memo', 'delete-a', 'mind', 'private')").update();
            jdbc.sql("INSERT INTO goals (id, user_id, title, cat) VALUES ('delete-goal', 'delete-a', 'private', 'mind')").update();
            jdbc.sql("INSERT INTO goal_steps (id, goal_id, text) VALUES ('delete-step', 'delete-goal', 'private')").update();
            jdbc.sql("INSERT INTO schedule_items (id, user_id, date, title) VALUES ('delete-schedule', 'delete-a', CURRENT_DATE, 'private')").update();
            jdbc.sql("INSERT INTO user_settings (user_id, key, value) VALUES ('delete-a', 'setting', 'private')").update();
            jdbc.sql("INSERT INTO user_categories (user_id, id, label) VALUES ('delete-a', 'category', 'private')").update();
            jdbc.sql("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ('delete-token', 'delete-a', now() + interval '1 day')").update();
            jdbc.sql("INSERT INTO shout_posts (id, author_id, cat, text) VALUES ('delete-post', 'delete-a', 'free', 'private'), ('keep-post', 'delete-b', 'free', 'keep')").update();
            jdbc.sql("INSERT INTO comments (id, post_kind, post_id, author_id, text) VALUES ('delete-comment', 'post', 'keep-post', 'delete-a', 'private'), ('delete-reply', 'post', 'delete-post', 'delete-b', 'reply'), ('keep-comment', 'post', 'keep-post', 'delete-b', 'keep')").update();
            jdbc.sql("INSERT INTO feed_posts (id, author_id, text) VALUES ('delete-feed', 'delete-a', 'private')").update();
            jdbc.sql("INSERT INTO saves (user_id, feed_post_id) VALUES ('delete-b', 'delete-feed')").update();
            jdbc.sql("INSERT INTO cheers (user_id, target_kind, target_id) VALUES ('delete-b', 'post', 'delete-post'), ('delete-b', 'comment', 'delete-reply'), ('delete-b', 'comment', 'delete-comment'), ('delete-a', 'post', 'keep-post')").update();
            jdbc.sql("INSERT INTO reports (id, reporter_id, target_kind, target_id, reason) VALUES ('delete-report', 'delete-b', 'comment', 'delete-reply', 'other')").update();
            jdbc.sql("INSERT INTO donations (id, user_id, amount, message) VALUES ('delete-donation', 'delete-a', 100, 'private')").update();
            jdbc.sql("INSERT INTO conversations (id, user_a, user_b) VALUES ('delete-conv', 'delete-a', 'delete-b')").update();
            jdbc.sql("INSERT INTO messages (id, conversation_id, sender_id, text) VALUES ('delete-msg', 'delete-conv', 'delete-b', 'private')").update();
            jdbc.sql("INSERT INTO safety_reports (id, reporter_id, kind, target_id, detail) VALUES ('delete-safety', 'delete-b', 'message', 'delete-msg', 'private')").update();
            jdbc.sql("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('delete-b', 'delete-a')").update();
            jdbc.sql("INSERT INTO uploaded_objects (object_key, user_id) VALUES ('feed/2026/delete-a-orphan.png', 'delete-a')").update();
            jdbc.sql("INSERT INTO weekly_batches (week, rows) VALUES ('2000-01-03', '[{\"userId\":\"delete-a\",\"nick\":\"private\",\"topPostText\":\"private\"},{\"userId\":\"delete-b\",\"nick\":\"keep\"}]'::jsonb)").update();
            S3Service s3 = mock(S3Service.class);
            when(s3.ownedKeyFromUrl("https://cdn.example/feed/2026/delete-a-legacy.png", "delete-a")).thenReturn("feed/2026/delete-a-legacy.png");
            new AccountDeletionService(jdbc, s3).delete(deleted, "계정 삭제");
            assertEquals(0, count("SELECT count(*) FROM users WHERE id = 'delete-a'"));
            for (String table : new String[]{"profiles", "journal_entries", "day_logs", "memos", "goals", "schedule_items", "user_settings", "user_categories", "auth_sessions", "uploaded_objects", "community_consents", "user_policy_consents"})
                assertEquals(0, count("SELECT count(*) FROM " + table + " WHERE user_id = 'delete-a'"), table);
            assertEquals(0, count("SELECT count(*) FROM comments WHERE id IN ('delete-comment', 'delete-reply')"));
            assertEquals(0, count("SELECT count(*) FROM cheers WHERE target_id LIKE 'delete-%' OR user_id = 'delete-a'"));
            assertEquals(0, count("SELECT count(*) FROM reports WHERE id = 'delete-report'"));
            assertEquals(0, count("SELECT count(*) FROM safety_reports WHERE id = 'delete-safety'"));
            assertEquals(0, count("SELECT count(*) FROM conversations WHERE id = 'delete-conv'"));
            assertEquals(0, count("SELECT count(*) FROM messages WHERE id = 'delete-msg'"));
            assertEquals(0, count("SELECT count(*) FROM goal_steps WHERE id = 'delete-step'"));
            assertEquals(0, count("SELECT count(*) FROM saves WHERE feed_post_id = 'delete-feed'"));
            assertEquals(0, count("SELECT count(*) FROM user_blocks WHERE blocked_id = 'delete-a'"));
            assertEquals(2, count("SELECT count(*) FROM object_deletion_jobs WHERE object_key LIKE '%delete-a-%' AND not_before > now() + interval '1 minute'"));
            String rows = jdbc.sql("SELECT rows::text FROM weekly_batches WHERE week = '2000-01-03'").query(String.class).single();
            assertFalse(rows.contains("private"));
            assertTrue(rows.contains("delete-b"));
            assertEquals(1, count("SELECT count(*) FROM comments WHERE id = 'keep-comment'"));
            verify(s3, never()).deleteObject(anyString());
        });
    }

    @Test
    void aiConsentIsDurableScopedToTheSessionAndCanBeRevoked() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser a = user("policy-a");
            DbUser b = user("policy-b");
            AuthService auth = mock(AuthService.class);
            MockHttpServletRequest request = new MockHttpServletRequest();
            when(auth.currentUser(request)).thenReturn(Optional.of(a));
            PolicyConsentService policies = new PolicyConsentService(jdbc, auth);
            assertFalse(policies.state(a).signupAccepted());
            assertThrows(ApiException.class, () -> policies.requireAiConsent(request));
            policies.accept(a, PolicyConsentService.VERSION, true);
            assertTrue(new PolicyConsentService(jdbc, auth).state(a).aiAccepted());
            assertFalse(policies.state(b).aiAccepted());
            assertDoesNotThrow(() -> policies.requireAiConsent(request));
            policies.accept(a, PolicyConsentService.VERSION, false);
            assertTrue(policies.state(a).signupAccepted());
            assertFalse(policies.state(a).aiAccepted());
            assertEquals(403, assertThrows(ApiException.class, () -> policies.requireAiConsent(request)).status());
            jdbc.sql("UPDATE user_policy_consents SET version = 'old', ai_accepted = TRUE WHERE user_id = 'policy-a'").update();
            assertFalse(policies.state(a).signupAccepted());
            assertFalse(policies.state(a).aiAccepted());
        });
    }

    @Test
    void newKakaoAccountsRequireConsentAndKeepAnonymousAccountHistory() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser anonymous = user("policy-kakao-new");
            PolicyConsentService policies = new PolicyConsentService(jdbc, mock(AuthService.class));
            KakaoLoginService kakao = new KakaoLoginService(jdbc, null, policies, tx, RestClient.builder(), "https://www.sorow.co.kr", "test", "", true);
            KakaoLoginService.Profile profile = new KakaoLoginService.Profile("policy-new-kakao", null, "새계정");
            assertThrows(KakaoLoginService.SignupConsentRequiredException.class, () -> kakao.findOrCreateUser(profile, null));
            assertThrows(KakaoLoginService.SignupConsentRequiredException.class, () -> kakao.findOrCreateUser(profile, anonymous.id()));
            assertEquals(0, count("SELECT count(*) FROM users WHERE kakao_id = 'policy-new-kakao'"));
            policies.accept(anonymous, PolicyConsentService.VERSION, true);
            assertEquals(anonymous.id(), kakao.findOrCreateUser(profile, anonymous.id()));
            assertEquals(1, count("SELECT count(*) FROM users WHERE id = 'policy-kakao-new' AND is_anonymous = FALSE"));
            assertTrue(policies.state(anonymous).aiAccepted());
        });
    }

    @Test
    void existingKakaoLoginDoesNotInheritTheVisitorsAiConsent() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser existing = user("policy-kakao-existing");
            DbUser visitor = user("policy-kakao-visitor");
            jdbc.sql("UPDATE users SET kakao_id = 'policy-existing-kakao', is_anonymous = FALSE WHERE id = 'policy-kakao-existing'").update();
            PolicyConsentService policies = new PolicyConsentService(jdbc, mock(AuthService.class));
            policies.accept(existing, PolicyConsentService.VERSION, false);
            policies.accept(visitor, PolicyConsentService.VERSION, true);
            KakaoLoginService kakao = new KakaoLoginService(jdbc, null, policies, tx, RestClient.builder(), "https://www.sorow.co.kr", "test", "", true);
            KakaoLoginService.Profile profile = new KakaoLoginService.Profile("policy-existing-kakao", null, "기존계정");
            assertEquals(existing.id(), kakao.findOrCreateUser(profile, null));
            assertEquals(existing.id(), kakao.findOrCreateUser(profile, visitor.id()));
            assertFalse(policies.state(existing).aiAccepted());
        });
    }

    @Test
    void signupRollsBackAccountAndSessionIfConsentCannotBeSaved() {
        AuthService auth = new AuthService(jdbc, false, 90);
        PolicyConsentService policies = spy(new PolicyConsentService(jdbc, auth));
        doThrow(new IllegalStateException("consent write unavailable")).when(policies).accept(any(), eq(PolicyConsentService.VERSION), eq(false));
        AuthController target = new AuthController(auth, mock(KakaoLoginService.class), policies);
        ProxyFactory factory = new ProxyFactory(target);
        factory.addAdvice(new TransactionInterceptor(tx.getTransactionManager(), new AnnotationTransactionAttributeSource()));
        AuthController controller = (AuthController) factory.getProxy();
        long sessionsBefore = count("SELECT count(*) FROM auth_sessions");
        assertThrows(IllegalStateException.class, () -> controller.post("signup",
            Map.of("email", "policy-rollback@example.com", "nick", "새회원", "password", "test-password",
                "signupConsentVersion", PolicyConsentService.VERSION, "aiDisclosureAccepted", false),
            new MockHttpServletRequest(), new MockHttpServletResponse()));
        assertEquals(0, count("SELECT count(*) FROM users WHERE email = 'policy-rollback@example.com'"));
        assertEquals(sessionsBefore, count("SELECT count(*) FROM auth_sessions"));
    }

    @Test
    void blockedMessagesDisappearAndBothDirectionsAreRejectedUntilUnblocked() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser a = user("block-a");
            DbUser b = user("block-b");
            BlockService blocks = new BlockService(jdbc);
            MessageService messages = new MessageService(jdbc, blocks, new CommunityConsentService(jdbc));
            String conversation = messages.sendMessage(b, a.id(), "hello").conversationId();
            assertEquals(1, messages.unreadMessageCount(a));
            blocks.block(a, b.id());
            assertEquals(0, messages.unreadMessageCount(a));
            assertTrue(messages.listConversations(a).isEmpty());
            assertEquals(403, assertThrows(ApiException.class, () -> messages.sendMessage(b, a.id(), "again")).status());
            assertThrows(ApiException.class, () -> messages.sendMessage(a, b.id(), "again"));
            assertThrows(ApiException.class, () -> messages.getThread(a, conversation, null));
            // One user cannot remove the other user's block.
            blocks.unblock(b, a.id());
            assertThrows(ApiException.class, () -> messages.sendMessage(b, a.id(), "again"));
            blocks.unblock(a, b.id());
            assertDoesNotThrow(() -> messages.sendMessage(b, a.id(), "again"));
        });
    }

    @Test
    void privateMessagesCanOnlyBeReportedByConversationMembers() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser a = user("report-a");
            DbUser b = user("report-b");
            DbUser outsider = user("report-c");
            MessageService messages = new MessageService(jdbc, new BlockService(jdbc), new CommunityConsentService(jdbc));
            String id = messages.sendMessage(a, b.id(), "hello").message().id();
            SafetyReportService reports = new SafetyReportService(jdbc);
            assertEquals(404, assertThrows(ApiException.class, () -> reports.submit(outsider, "message", id, "test")).status());
            assertNotNull(reports.submit(b, "message", id, "test"));
        });
    }

    @Test
    void messagesRequireCurrentAccountConsent() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            DbUser a = user("consent-a");
            DbUser b = user("consent-b");
            jdbc.sql("UPDATE community_consents SET version = 'old' WHERE user_id = 'consent-a'").update();
            CommunityConsentService consent = new CommunityConsentService(jdbc);
            MessageService messages = new MessageService(jdbc, new BlockService(jdbc), consent);
            assertEquals(409, assertThrows(ApiException.class, () -> messages.sendMessage(a, b.id(), "hello")).status());
            assertThrows(ApiException.class, () -> consent.accept(a, "old"));
            consent.accept(a, CommunityConsentService.CURRENT_VERSION);
            assertDoesNotThrow(() -> messages.sendMessage(a, b.id(), "hello"));
        });
    }

    @Test
    void failedStorageDeletionRemainsQueuedAndSuccessRemovesJob() {
        tx.executeWithoutResult(status -> {
            status.setRollbackOnly();
            String key = "feed/test-deletion-worker.png";
            jdbc.sql("INSERT INTO object_deletion_jobs (object_key) VALUES (?)").param(key).update();
            S3Service s3 = mock(S3Service.class);
            doThrow(new IllegalStateException("offline")).when(s3).deleteObject(key);
            ObjectDeletionWorker worker = new ObjectDeletionWorker(jdbc, s3);
            worker.cleanup();
            assertEquals(1, count("SELECT attempts FROM object_deletion_jobs WHERE object_key = 'feed/test-deletion-worker.png'"));
            assertEquals(1, count("SELECT count(*) FROM object_deletion_jobs WHERE object_key = 'feed/test-deletion-worker.png' AND not_before > now()"));
            jdbc.sql("UPDATE object_deletion_jobs SET not_before = now() WHERE object_key = ?").param(key).update();
            doNothing().when(s3).deleteObject(key);
            worker.cleanup();
            assertEquals(0, count("SELECT count(*) FROM object_deletion_jobs WHERE object_key = 'feed/test-deletion-worker.png'"));
        });
    }

    @Test
    void accountErasureWaitsForEarlierRankingSnapshotAndScrubsItsLateWrite() throws Exception {
        DbUser user = tx.execute(status -> user("race-account"));
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch allowLateWrite = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        S3Service s3 = mock(S3Service.class);
        try {
            var earlierRequest = executor.submit(() -> tx.executeWithoutResult(status -> {
                CommunityService community = new CommunityService(jdbc, new ObjectMapper(), s3, new MockEnvironment(), false, new BlockService(jdbc));
                community.loadStore(user);
                snapshotReady.countDown();
                try {
                    if (!allowLateWrite.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test writer timed out");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                }
                // Represents an upsert made from the earlier snapshot just before its transaction commits.
                jdbc.sql("INSERT INTO weekly_batches (week, rows) VALUES ('2000-02-07', '[{\"userId\":\"race-account\",\"nick\":\"private\",\"topPostText\":\"private\"}]'::jsonb)").update();
            }));
            assertTrue(snapshotReady.await(10, TimeUnit.SECONDS));
            var erasure = executor.submit(() -> tx.executeWithoutResult(status -> new AccountDeletionService(jdbc, s3).delete(user, "계정 삭제")));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            long waiting = 0;
            while (waiting == 0 && System.nanoTime() < deadline) {
                waiting = count("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND classid = '1936683629'::oid AND objid = 1 AND NOT granted");
                if (waiting == 0) Thread.sleep(20);
            }
            assertEquals(1, waiting, "Erasure must wait for the community snapshot transaction");
            assertFalse(erasure.isDone());
            allowLateWrite.countDown();
            earlierRequest.get(10, TimeUnit.SECONDS);
            erasure.get(10, TimeUnit.SECONDS);
            assertEquals(0, count("SELECT count(*) FROM users WHERE id = 'race-account'"));
            assertEquals("[]", jdbc.sql("SELECT rows::text FROM weekly_batches WHERE week = '2000-02-07'").query(String.class).single());
        } finally {
            allowLateWrite.countDown();
            executor.shutdown();
            executor.awaitTermination(15, TimeUnit.SECONDS);
            tx.executeWithoutResult(status -> {
                if (count("SELECT count(*) FROM users WHERE id = 'race-account'") != 0)
                    new AccountDeletionService(jdbc, s3).delete(user, "계정 삭제");
                jdbc.sql("DELETE FROM weekly_batches WHERE week = '2000-02-07'").update();
            });
        }
    }
}
