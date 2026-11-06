package kr.co.shuim.circle;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.ClaudeClient;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.function.Executable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Synthetic accounts only, in a fresh schema of an explicitly supplied disposable loopback database. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class CirclePrivatePostgresTest {
    private String schema;
    private JdbcClient jdbc;
    private TransactionTemplate tx;
    private CircleService circles;
    private DbUser owner, peer, outsider, otherAdmin;
    private static final String SLUG = CircleLogic.PRIVATE_TEST_SLUG;

    @BeforeEach void setup() {
        schema = "private_circle_" + UUID.randomUUID().toString().replace("-", "");
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        circles = new CircleService(jdbc, mock(MailService.class), mock(ClaudeClient.class), new ObjectMapper(), mock(BadgeService.class));
        circles.setPrivateTestCreationEnabled(true);
        owner = user("admin", false, false);
        peer = user("user", false, false);
        outsider = user("user", false, false);
        otherAdmin = user("admin", false, false);
    }

    @AfterEach void cleanup() {
        if (jdbc != null && schema != null && schema.matches("private_circle_[a-f0-9]{32}")) {
            jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
        }
    }

    private DbUser user(String role, boolean anonymous, boolean blocked) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous,blocked_at,password_hash) VALUES (?,'정책 테스트',?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END,'synthetic-test-credential')")
            .param(id).param(role).param(anonymous).param(blocked).update();
        return jdbc.sql("SELECT * FROM users WHERE id=?").param(id).query(DbUser.MAPPER).single();
    }
    private Map<String, Object> create() { return tx.execute(s -> circles.createPrivateTest(owner, peer.id())); }
    private String id() { return circles.bySlug(SLUG).id(); }
    private void denied(Executable action) { assertEquals(404, assertThrows(ApiException.class, action).status()); }
    private String ordinary(DbUser author, String slug) {
        return (String) tx.execute(s -> circles.create(author, new CircleService.CreateInput("공개 " + slug, slug, "rest", "", "open", "public", null))).get("id");
    }
    private String post(DbUser author, String circleId) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO shout_posts(id,author_id,cat,text,community_id) VALUES (?,?,'free','격리된 테스트 이야기',?)")
            .param(id).param(author.id()).param(circleId).update();
        return id;
    }
    private void comment(DbUser author, String postId) {
        jdbc.sql("INSERT INTO comments(id,author_id,post_kind,post_id,text) VALUES (?,?,'post',?,'따뜻한 테스트 댓글')")
            .param(UUID.randomUUID().toString()).param(author.id()).param(postId).update();
    }
    private static boolean contains(List<Map<String, Object>> list, String circleId) {
        return list.stream().anyMatch(row -> circleId.equals(row.get("id")));
    }

    @Test void creationIsFixedPrivatePinnedAndExactlyTwoWithoutChangingPrimary() {
        String publicId = ordinary(owner, "public-before");
        Map<String, Object> first = create();
        assertEquals(CircleLogic.PRIVATE_TEST_NAME, first.get("name"));
        assertEquals(true, first.get("privateTest"));
        assertEquals(true, first.get("pinned"));
        assertEquals(4, first.get("spaceCapacity"));
        assertEquals("members", first.get("visibility"));
        assertEquals("invite", first.get("joinMode"));
        assertFalse(first.containsKey("inviteCode"));
        assertEquals(Set.of(owner.id(), peer.id()), new HashSet<>(jdbc.sql("SELECT user_id FROM community_private_members WHERE community_id=?").param(id()).query(String.class).list()));
        assertEquals(2L, jdbc.sql("SELECT count(*) FROM community_members WHERE community_id=? AND status='active'").param(id()).query(Long.class).single());
        assertEquals(400, assertThrows(ApiException.class, () -> circles.setPrimary(owner, SLUG)).status());
        assertEquals(publicId, jdbc.sql("SELECT community_id FROM community_members WHERE user_id=? AND is_primary").param(owner.id()).query(String.class).single());
        assertEquals(first.get("id"), create().get("id"));
        assertEquals(first.get("id"), circles.detail(peer, SLUG).get("id"));
        assertEquals(id(), circles.browse(peer, null, null).getFirst().get("id"));
        assertEquals(id(), ((List<?>) circles.mine(owner).get("member")).stream().map(row -> ((Map<?, ?>) row).get("id")).findFirst().orElseThrow());
    }

    @Test void concurrentAndLostResponseCreationKeepsOnePair() throws Exception {
        try (var pool = Executors.newFixedThreadPool(6)) {
            var requests = new ArrayList<java.util.concurrent.Future<String>>();
            for (int i = 0; i < 12; i++) requests.add(pool.submit(() -> (String) create().get("id")));
            Set<String> ids = new HashSet<>();
            for (var request : requests) ids.add(request.get());
            assertEquals(1, ids.size());
            assertEquals(2L, jdbc.sql("SELECT count(*) FROM community_private_members").query(Long.class).single());
        }
        denied(() -> tx.execute(s -> circles.createPrivateTest(otherAdmin, peer.id())));
        assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> circles.createPrivateTest(owner, outsider.id()))).status());
        assertEquals(2L, jdbc.sql("SELECT count(*) FROM community_private_members").query(Long.class).single());
    }

    @Test void outsidersAndGlobalAdminsCannotReadOrMutateEvenWithStrayKeeperRows() {
        create();
        jdbc.sql("INSERT INTO community_members(community_id,user_id,role,status) VALUES (?,?,'keeper','active')").param(id()).param(otherAdmin.id()).update();
        for (DbUser actor : List.of(outsider, otherAdmin)) {
            assertFalse(circles.canAccess(circles.bySlug(SLUG), actor));
            assertTrue(circles.member(id(), actor.id()).isEmpty());
            List<Executable> attempts = List.of(
                () -> circles.detail(actor, SLUG), () -> circles.join(actor, SLUG, "ANYCODE"),
                () -> circles.leave(actor, SLUG), () -> circles.setPrimary(actor, SLUG),
                () -> circles.toggleFollow(actor, SLUG), () -> circles.verifyStart(actor, SLUG, "a@example.com"),
                () -> circles.verifyConfirm(actor, SLUG, "123456"), () -> circles.members(actor, SLUG),
                () -> circles.memberAction(actor, SLUG, peer.id(), "keeper"),
                () -> circles.update(actor, SLUG, Map.of("notice", "changed")),
                () -> circles.preview(actor, SLUG, "테스트 이야기"), () -> circles.submit(actor, SLUG, "free", "테스트 이야기"),
                () -> circles.queue(actor, SLUG, "pending"), () -> circles.draft(actor, SLUG, "unknown"),
                () -> circles.decide(actor, SLUG, "unknown", "publish", "test", null, null),
                () -> circles.toggleHidden(actor, SLUG, "unknown"));
            attempts.forEach(this::denied);
        }
        denied(() -> circles.detail(null, SLUG));
        assertFalse(circles.canAccess(circles.bySlug(SLUG), user("admin", true, false)));
        jdbc.sql("UPDATE users SET blocked_at=CURRENT_TIMESTAMP WHERE id=?").param(peer.id()).update();
        // Fresh DB eligibility wins even if an already-authenticated snapshot is stale.
        denied(() -> circles.detail(peer, SLUG));
        assertFalse(contains(circles.browse(peer, null, null), id()));
        assertTrue(circles.member(id(), peer.id()).isEmpty());
    }

    @Test void listingsAndAuthorSubmissionsDoNotRevealPrivateCircle() {
        create();
        String publicId = ordinary(owner, "public-list");
        jdbc.sql("INSERT INTO community_members(community_id,user_id,role,status) VALUES (?,?,'member','active')").param(id()).param(outsider.id()).update();
        jdbc.sql("INSERT INTO community_follows(community_id,user_id) VALUES (?,?)").param(id()).param(outsider.id()).update();
        jdbc.sql("INSERT INTO submissions(id,community_id,author_id,cat,text,status) VALUES (?,?,?,'free','old author row','pending')")
            .param(UUID.randomUUID().toString()).param(id()).param(outsider.id()).update();
        comment(peer, post(owner, publicId));
        assertTrue(contains(circles.warmest(peer), id()));
        for (DbUser actor : List.of(outsider, otherAdmin)) {
            assertFalse(contains(circles.browse(actor, null, null), id()));
            assertFalse(contains(circles.warmest(actor), id()));
            assertTrue(circles.mySubmissions(actor).isEmpty());
            for (String group : List.of("member", "listening")) {
                assertFalse(((List<?>) circles.mine(actor).get(group)).stream().anyMatch(row -> id().equals(((Map<?, ?>) row).get("id"))));
            }
        }
        assertFalse(contains(circles.browse(null, null), id()));
        assertFalse(contains(circles.warmest(), id()));
        assertTrue(contains(circles.browse(null, null), publicId));
        assertEquals(publicId, circles.detail(null, "public-list").get("id"));
        assertDoesNotThrow(() -> circles.update(otherAdmin, "public-list", Map.of("notice", "public administration remains available")));
    }

    @Test void privateCommentsDoNotInfluencePublicWarmRankingForOutsiders() {
        // Isolate the ranking from sample comments installed by Flyway in this disposable schema.
        jdbc.sql("DELETE FROM comments").update();
        create();
        String publicId = ordinary(owner, "public-rank");
        comment(owner, post(peer, id()));
        assertTrue(contains(circles.warmest(owner), publicId));
        assertFalse(contains(circles.warmest(outsider), publicId));
    }

    @Test void privatePolicyCannotBeWidenedByOwnerAndOrdinaryCirclesKeepDefaults() {
        create();
        for (var patch : List.of(Map.of("visibility", "public"), Map.of("joinMode", "open"), Map.of("regenerateInvite", true),
            Map.of("privateTest", false), Map.of("pinned", false), Map.of("spaceCapacity", 100))) {
            assertThrows(ApiException.class, () -> tx.execute(s -> circles.update(owner, SLUG, new HashMap<>(patch))));
        }
        for (String action : List.of("approve", "remove", "keeper", "unkeeper")) {
            assertThrows(ApiException.class, () -> circles.memberAction(owner, SLUG, peer.id(), action));
        }
        assertThrows(ApiException.class, () -> circles.leave(peer, SLUG));
        assertThrows(ApiException.class, () -> circles.verifyConfirm(peer, SLUG, "123456"));
        assertEquals(id(), circles.join(peer, SLUG, null).get("id"));
        assertEquals("우리 둘의 안내", circles.update(owner, SLUG, Map.of("notice", "우리 둘의 안내")).get("notice"));
        String publicId = ordinary(owner, "public-default");
        CircleService.Circle publicCircle = circles.byId(publicId);
        assertFalse(publicCircle.privateTest()); assertFalse(publicCircle.pinned()); assertEquals(20, publicCircle.spaceCapacity());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE communities SET space_capacity=101 WHERE id=?").param(publicId).update());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE communities SET space_capacity=0 WHERE id=?").param(publicId).update());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE communities SET visibility='public' WHERE id=?").param(id()).update());
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE communities SET invite_code='BYPASS' WHERE id=?").param(id()).update());
    }

    @Test void onlyRegisteredAvailablePeerAndCurrentAdminCanCreateNoMigrationSeeds() {
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM community_private_members").query(Long.class).single());
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM communities WHERE private_test").query(Long.class).single());
        assertEquals(403, assertThrows(ApiException.class, () -> circles.createPrivateTest(outsider, peer.id())).status());
        for (String invalid : List.of(owner.id(), "unknown", user("user", true, false).id(), user("user", false, true).id())) {
            assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> circles.createPrivateTest(owner, invalid))).status());
        }
        assertThrows(ApiException.class, () -> circles.createPrivateTest(owner, null));
        DbUser demo = user("user", false, false);
        jdbc.sql("UPDATE users SET password_hash=NULL WHERE id=?").param(demo.id()).update();
        assertEquals(400, assertThrows(ApiException.class, () -> circles.createPrivateTest(owner, demo.id())).status());
        assertThrows(ApiException.class, () -> circles.create(owner, new CircleService.CreateInput(CircleLogic.PRIVATE_TEST_NAME, "public-reserved", "rest", "", "open", "public", null)));
        assertThrows(ApiException.class, () -> circles.create(owner, new CircleService.CreateInput("다른 테스트", SLUG, "rest", "", "open", "public", null)));
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM community_private_members").query(Long.class).single());
    }
}
