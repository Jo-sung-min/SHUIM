package kr.co.shuim.community;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.message.MessageService;
import kr.co.shuim.upload.S3Service;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Only a disposable loopback database; never loads the application's .env or DB_URL. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class CommunityGuestSnapshotPostgresTest {
    private static JdbcClient jdbc, control;
    private static DriverManagerDataSource source;
    private static TransactionTemplate tx;
    private static String schema;
    private CommunityService community;

    @BeforeAll static void database() {
        String url = System.getenv("SOROW_TEST_DATABASE_URL");
        control = JdbcClient.create(new DriverManagerDataSource(url, "sorow_test", ""));
        schema = "guest_snapshot_" + UUID.randomUUID().toString().replace("-", "");
        control.sql("CREATE SCHEMA " + schema).update();
        source = new DriverManagerDataSource(url + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    @AfterAll static void dropSchema() {
        if (control != null && schema != null) control.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }

    @BeforeEach void setup() {
        community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false, new BlockService(jdbc));
        community.configureSnapshot(new DataSourceTransactionManager(source), 60_000);
    }

    private DbUser user(boolean anonymous, int ageHours) {
        String id = "t" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        LocalDateTime created = LocalDateTime.now(ZoneOffset.UTC).minusHours(ageHours);
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous,created_at,registered_at) VALUES (?,?,'user',?,?,?)")
            .param(id).param("nick-" + id.substring(1, 6)).param(anonymous).param(created).param(anonymous ? null : created).update();
        jdbc.sql("INSERT INTO community_consents(user_id, version) VALUES (?, 'test') ON CONFLICT DO NOTHING").param(id).update();
        return new DbUser(id, null, "nick", "user", anonymous, null, null, System.currentTimeMillis());
    }

    private String post(DbUser author) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO shout_posts(id,author_id,cat,text) VALUES (?,?,'free','hello')").param(id).param(author.id()).update();
        return id;
    }

    private long userCount() {
        return jdbc.sql("SELECT count(*) FROM users").query(Long.class).single();
    }

    @Test
    void guestReadCreatesNoRowsAndOnlyListsReferencedPeople() {
        DbUser author = user(false, 48);
        DbUser lurker = user(false, 48);
        String p = post(author);
        long before = userCount();
        Model.Store store = community.viewerStore(CommunityService.GUEST);
        assertEquals(before, userCount());
        assertEquals(CommunityService.GUEST_ID, store.me().id());
        assertTrue(store.posts().stream().anyMatch(x -> x.id().equals(p)));
        assertTrue(store.users().stream().anyMatch(u -> u.id().equals(author.id()) && u.role() == null && u.blockedReason() == null));
        assertFalse(store.users().stream().anyMatch(u -> u.id().equals(lurker.id())));
    }

    @Test
    void writesInvalidateTheCachedSnapshotImmediately() {
        DbUser author = user(false, 48);
        community.viewerStore(CommunityService.GUEST); // 캐시 채우기 (TTL 60초)
        tx.execute(status -> community.createPost(author, "free", "새 글이에요", null));
        assertTrue(community.viewerStore(CommunityService.GUEST).posts().stream().anyMatch(x -> x.text().equals("새 글이에요")));
    }

    @Test
    void throwawayReportsDoNotAutoHideButOldMembersDo() {
        DbUser author = user(false, 48);
        String p = post(author);
        for (int i = 0; i < CommunityLogic.REPORT_THRESHOLD; i++) {
            DbUser reporter = user(i % 2 == 0, i % 2 == 0 ? 100 : 1); // 익명이거나 가입한 지 하루가 안 됨
            tx.execute(status -> community.report(reporter, new Model.Target("post", p), "abuse"));
        }
        Model.Post seen = community.viewerStore(CommunityService.GUEST).posts().stream().filter(x -> x.id().equals(p)).findFirst().orElseThrow();
        assertFalse(CommunityLogic.isFlagged(seen));
        assertTrue(seen.reports().isEmpty());
        for (int i = 0; i < CommunityLogic.REPORT_THRESHOLD; i++) {
            DbUser reporter = user(false, 48);
            tx.execute(status -> community.report(reporter, new Model.Target("post", p), "abuse"));
        }
        seen = community.viewerStore(CommunityService.GUEST).posts().stream().filter(x -> x.id().equals(p)).findFirst().orElseThrow();
        assertTrue(CommunityLogic.isFlagged(seen));
    }

    @Test
    void adminsCannotBlockThemselvesOrOtherAdmins() {
        DbUser admin = user(false, 48);
        DbUser other = user(false, 48);
        jdbc.sql("UPDATE users SET role='admin' WHERE id IN (?, ?)").param(admin.id()).param(other.id()).update();
        DbUser me = new DbUser(admin.id(), null, "nick", "admin", false, null, null, 0L);
        assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> community.adminBlock(me, me.id(), "x"))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> community.adminBlock(me, other.id(), "x"))).status());
        assertEquals(404, assertThrows(ApiException.class, () -> tx.execute(s -> community.adminBlock(me, "missing-user", "x"))).status());
    }

    @Test
    void circleAndSpaceSafetyReportsAreStored() {
        DbUser reporter = user(false, 48);
        DbUser writer = user(false, 48);
        String circle = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO communities(id,slug,name,name_key,kind,created_by) VALUES (?,?,?,?,'interest',?)")
            .param(circle).param("slug-" + circle.substring(0, 8)).param("소로우").param("key-" + circle.substring(0, 8)).param(writer.id()).update();
        long entry = jdbc.sql("INSERT INTO bamboo_guestbook(community_id,author_id,request_id,display_name,story) VALUES (?,?,?::uuid,'이름','이야기') RETURNING id")
            .param(circle).param(writer.id()).param(UUID.randomUUID().toString()).query(Long.class).single();
        SafetyReportService reports = new SafetyReportService(jdbc);
        String byCircle = reports.submit(reporter, "circle", "slug-" + circle.substring(0, 8), "소개가 불쾌해요");
        String bySpace = reports.submit(reporter, "space", "guestbook:" + entry, "방명록 욕설");
        String byLantern = reports.submit(reporter, "space", "lantern:abc-123", "소원등 문구");
        assertEquals(circle, jdbc.sql("SELECT target_id FROM safety_reports WHERE id = ?").param(byCircle).query(String.class).single());
        DbUser admin = new DbUser(user(false, 48).id(), null, "admin", "admin", false, null, null, 0L);
        assertEquals(400, assertThrows(ApiException.class, () -> reports.review(admin, byCircle, "block")).status());
        assertEquals(400, assertThrows(ApiException.class, () -> reports.review(admin, byLantern, "block")).status());
        reports.review(admin, bySpace, "block");
        assertNotNull(jdbc.sql("SELECT blocked_at FROM users WHERE id = ?").param(writer.id()).query(LocalDateTime.class).single());
        reports.review(admin, byCircle, "dismiss");
    }

    @Test
    void messagePollingAfterIsCappedAndSaysThereIsMore() {
        DbUser a = user(false, 48), b = user(false, 48);
        String conversation = UUID.randomUUID().toString();
        String lo = a.id().compareTo(b.id()) < 0 ? a.id() : b.id(), hi = lo.equals(a.id()) ? b.id() : a.id();
        jdbc.sql("INSERT INTO conversations(id,user_a,user_b) VALUES (?,?,?)").param(conversation).param(lo).param(hi).update();
        LocalDateTime base = LocalDateTime.now(ZoneOffset.UTC).minusHours(1);
        for (int i = 0; i < 205; i++) {
            jdbc.sql("INSERT INTO messages(id,conversation_id,sender_id,text,created_at) VALUES (?,?,?,?,?)")
                .param(UUID.randomUUID().toString()).param(conversation).param(b.id()).param("m" + i).param(base.plusSeconds(i)).update();
        }
        MessageService messages = new MessageService(jdbc, new BlockService(jdbc), new CommunityConsentService(jdbc));
        // after 는 아주 이른 시각으로 (시험 DB 세션 시간대와 무관하게 전부 '이후'가 되게)
        MessageService.Thread page = messages.getThread(a, conversation, 1L);
        assertEquals(200, page.messages().size());
        assertEquals("m0", page.messages().get(0).text());
        assertEquals("m199", page.messages().get(199).text());
        assertEquals(Boolean.TRUE, page.more());
        assertNull(messages.getThread(a, conversation, null).more());
        DbUser anon = user(true, 1);
        assertEquals(401, assertThrows(ApiException.class, () -> messages.sendMessage(anon, a.id(), "hi")).status());
    }
}
