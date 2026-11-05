package kr.co.shuim.community;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.PrivateCircleAccess;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.notify.NotificationController;
import kr.co.shuim.points.PointsService;
import kr.co.shuim.profile.BadgeService;
import kr.co.shuim.profile.ProfileController;
import kr.co.shuim.profile.ProfileService;
import kr.co.shuim.upload.S3Service;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Only a disposable loopback database; never loads the application's .env or DB_URL. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PrivateCircleContentPostgresTest {
    private static JdbcClient jdbc, control;
    private static TransactionTemplate tx;
    private static String schema;
    private CommunityService community;
    private PointsService points;
    private BadgeService badges;
    private BlockService blocks;
    private DbUser owner, peer, outsider, otherAdmin;
    private String circle, post, comment;
    private final List<String> users = new ArrayList<>();
    private final List<String> contentIds = new ArrayList<>();

    @BeforeAll static void database() {
        String url = System.getenv("SOROW_TEST_DATABASE_URL");
        control = JdbcClient.create(new DriverManagerDataSource(url, "sorow_test", ""));
        schema = "private_content_" + UUID.randomUUID().toString().replace("-", "");
        control.sql("CREATE SCHEMA " + schema).update();
        var source = new DriverManagerDataSource(url + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }
    @AfterAll static void dropSchema() {
        if (control != null && schema != null) control.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    @BeforeEach void setup() {
        blocks = new BlockService(jdbc); badges = new BadgeService(jdbc); points = new PointsService(jdbc);
        community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), true, blocks, badges, points);
        owner = user("admin", false); peer = user("user", false); outsider = user("user", false); otherAdmin = user("admin", false);
        circle = UUID.randomUUID().toString();
        jdbc.sql("""
            INSERT INTO communities(id,slug,name,name_key,kind,join_mode,visibility,created_by,private_test,pinned,space_capacity)
            VALUES (?,?,?,?,'life','invite','members',?,TRUE,TRUE,4)
            """).param(circle).param(circle).param("private circle").param(circle.substring(0, 30)).param(owner.id()).update();
        for (var user : List.of(owner, peer, outsider, otherAdmin))
            jdbc.sql("INSERT INTO community_members(community_id,user_id,role,status) VALUES (?,?,'member','active')")
                .param(circle).param(user.id()).update();
        for (var user : List.of(owner, peer))
            jdbc.sql("INSERT INTO community_private_members(community_id,user_id) VALUES (?,?)").param(circle).param(user.id()).update();
        post = post(owner, circle);
        comment = comment(peer, post, null);
    }
    @AfterEach void cleanup() {
        for (String id : contentIds) {
            jdbc.sql("DELETE FROM cheers WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM reports WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM point_cheer_checkpoints WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM comments WHERE id=? OR post_id=?").param(id).param(id).update();
            jdbc.sql("DELETE FROM shout_posts WHERE id=?").param(id).update();
        }
        jdbc.sql("DELETE FROM communities WHERE id=?").param(circle).update();
        for (String id : users) jdbc.sql("DELETE FROM users WHERE id=?").param(id).update();
    }
    private DbUser user(String role, boolean anonymous) {
        String id = UUID.randomUUID().toString(); users.add(id);
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,'privacy fixture',?,?)").param(id).param(role).param(anonymous).update();
        return new DbUser(id, null, "privacy fixture", role, anonymous, null, null, System.currentTimeMillis());
    }
    private String post(DbUser user, String communityId) {
        String id = UUID.randomUUID().toString(); contentIds.add(id);
        jdbc.sql("INSERT INTO shout_posts(id,author_id,cat,text,community_id,images,created_at) VALUES (?,?,'misfortune','PRIVATE ROOT TEXT',?,ARRAY['https://cdn.invalid/private.webp'],?)")
            .param(id).param(user.id()).param(communityId).param(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(2)).update();
        return id;
    }
    private String comment(DbUser user, String parentPost, String parentComment) {
        String id = UUID.randomUUID().toString(); contentIds.add(id);
        jdbc.sql("INSERT INTO comments(id,post_kind,post_id,author_id,text,parent_id,created_at) VALUES (?,'post',?,?,'오늘 하루도 잘 버텨온 당신에게 따뜻한 응원을 보내요',?,?)")
            .param(id).param(parentPost).param(user.id()).param(parentComment).param(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).minusMinutes(1)).update();
        return id;
    }
    private Model.Store store(DbUser viewer) { return tx.execute(status -> community.loadStore(viewer)); }
    private void denied(Runnable action) { assertEquals(404, assertThrows(ApiException.class, () -> tx.executeWithoutResult(status -> action.run())).status()); }
    private AuthService auth(DbUser viewer) {
        AuthService auth = mock(AuthService.class);
        when(auth.currentUser(any())).thenReturn(Optional.ofNullable(viewer));
        return auth;
    }
    @SuppressWarnings("unchecked")
    private List<Map<String,Object>> profileComments(DbUser viewer, String profileId) {
        var profiles = new ProfileService(jdbc, blocks, badges);
        var controller = new ProfileController(auth(viewer), profiles, badges, blocks, jdbc, mock(CommunityConsentService.class));
        return (List<Map<String,Object>>) controller.publicProfile(profileId, new MockHttpServletRequest()).get("comments");
    }
    @SuppressWarnings("unchecked")
    private List<NotificationController.Item> notifications(DbUser viewer) {
        return (List<NotificationController.Item>) new NotificationController(auth(viewer), blocks, jdbc)
            .list(0, new MockHttpServletRequest()).get("items");
    }

    @Test void storeAndDirectContentMutationsRequireAllowlistEvenForOtherAdminsAndActiveMembers() {
        for (var viewer : List.of(outsider, otherAdmin)) {
            var data = store(viewer);
            assertFalse(data.posts().stream().anyMatch(p -> p.id().equals(post)));
            assertFalse(data.comments().stream().anyMatch(c -> c.postId().equals(post)));
            denied(() -> community.addComment(viewer, post, "cannot read"));
            for (var target : List.of(new Model.Target("post", post), new Model.Target("comment", comment))) {
                denied(() -> community.toggleCheer(viewer, target));
                denied(() -> community.report(viewer, target, "spam"));
                denied(() -> community.adminHide(viewer, target));
                denied(() -> community.adminDismiss(viewer, target));
            }
        }
        assertTrue(store(owner).posts().stream().anyMatch(p -> p.id().equals(post)));
        assertTrue(store(peer).comments().stream().anyMatch(c -> c.id().equals(comment)));
        assertEquals(1L, jdbc.sql("SELECT count(*) FROM comments WHERE post_id=?").param(post).query(Long.class).single(), "No sample bot may join this private circle.");
    }

    @Test void removedAuthorOrCommenterCannotUseOwnershipToReadDeleteOrAcceptPrivateContent() {
        jdbc.sql("DELETE FROM community_private_members WHERE community_id=?").param(circle).update();
        assertFalse(store(owner).posts().stream().anyMatch(p -> p.id().equals(post)));
        denied(() -> community.deletePost(owner, post));
        denied(() -> community.deleteComment(peer, comment));
        denied(() -> community.acceptComment(owner, post, comment));
        denied(() -> points.acceptComment(owner, post, comment));
        assertEquals(1L, jdbc.sql("SELECT count(*) FROM shout_posts WHERE id=?").param(post).query(Long.class).single());
    }

    @Test void publicProfilesAndNotificationsHidePrivateSnippetsFromGuestsMembersAndOtherAdmins() {
        String publicPost = post(owner, null);
        String publicComment = comment(peer, publicPost, null);
        for (DbUser viewer : Arrays.asList(null, outsider, otherAdmin)) {
            var rows = profileComments(viewer, peer.id());
            assertFalse(rows.stream().anyMatch(row -> post.equals(row.get("postId"))));
            assertTrue(rows.stream().anyMatch(row -> publicComment.equals(row.get("id"))));
        }
        assertTrue(profileComments(owner, peer.id()).stream().anyMatch(row -> comment.equals(row.get("id"))));
        // A prior outsider participant must not keep receiving content after access is restricted.
        String oldComment = comment(outsider, post, null);
        String reply = comment(peer, post, oldComment);
        assertFalse(notifications(outsider).stream().anyMatch(item -> post.equals(item.postId())));
        assertTrue(notifications(owner).stream().anyMatch(item -> reply.equals(item.id())));
        jdbc.sql("DELETE FROM community_private_members WHERE community_id=? AND user_id=?").param(circle).param(owner.id()).update();
        assertFalse(notifications(owner).stream().anyMatch(item -> post.equals(item.postId())));
    }

    @Test void allowlistRowsDoNotOverrideSuspensionOrGuestStatus() {
        DbUser guest = user("user", true);
        jdbc.sql("INSERT INTO community_private_members(community_id,user_id) VALUES (?,?)").param(circle).param(guest.id()).update();
        assertFalse(PrivateCircleAccess.canAccess(jdbc, circle, guest.id()));
        jdbc.sql("UPDATE users SET blocked_at=now() WHERE id=?").param(peer.id()).update();
        assertFalse(PrivateCircleAccess.canAccess(jdbc, circle, peer.id()));
        assertFalse(store(peer).posts().stream().anyMatch(p -> p.id().equals(post)));
        denied(() -> community.toggleCheer(peer, new Model.Target("post", post)));
    }

    @Test void privateActivitiesDoNotCreatePublicBadgesOrQualifyUnlistedCheerVoters() {
        jdbc.sql("UPDATE community_members SET role='owner' WHERE community_id=? AND user_id=?").param(circle).param(owner.id()).update();
        for (int i = 0; i < 6; i++) {
            DbUser unlisted = user("user", false);
            jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id,points_eligible) VALUES (?,'comment',?,TRUE)").param(unlisted.id()).param(comment).update();
        }
        jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id,points_eligible) VALUES (?,'comment',?,FALSE)").param(owner.id()).param(comment).update();
        tx.executeWithoutResult(status -> points.cheerAdded("comment", comment, owner.id()));
        assertEquals(0L, tx.execute(status -> points.me(peer)).balance());
        assertTrue(badges.refresh(owner.id()).isEmpty());
        assertTrue(badges.refresh(peer.id()).isEmpty());
        assertTrue(badges.earned(owner.id()).isEmpty());
        assertTrue(badges.earned(peer.id()).isEmpty());
    }
}
