package kr.co.shuim.points;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityService;
import kr.co.shuim.community.Model.Target;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import kr.co.shuim.upload.S3Service;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Only an explicitly supplied disposable local database is allowed. Never reads DB_URL. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PointsPostgresTest {
    private static JdbcClient jdbc;
    private static TransactionTemplate tx;
    private final AtomicLong clock = new AtomicLong(Instant.parse("2026-11-03T14:59:00Z").toEpochMilli());
    private final List<String> users = new ArrayList<>(), contents = new ArrayList<>(), circles = new ArrayList<>();
    private PointsService points;
    private CommunityService community;
    private static final String COMFORT = "오늘 하루도 여기까지 버텨온 당신에게 따뜻한 응원을 보내요";

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }
    @BeforeEach void setup() {
        points = new PointsService(jdbc, clock::get);
        community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false,
            new BlockService(jdbc), new BadgeService(jdbc), points);
    }
    @AfterEach void cleanup() {
        for (String id : contents) {
            jdbc.sql("DELETE FROM cheers WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM reports WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM point_cheer_checkpoints WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM comments WHERE id=? OR post_id=?").param(id).param(id).update();
            jdbc.sql("DELETE FROM shout_posts WHERE id=?").param(id).update();
            jdbc.sql("DELETE FROM feed_posts WHERE id=?").param(id).update();
        }
        for (String id : circles) jdbc.sql("DELETE FROM communities WHERE id=?").param(id).update();
        for (String id : users) jdbc.sql("DELETE FROM users WHERE id=?").param(id).update();
    }
    private DbUser user(boolean guest) {
        String id = UUID.randomUUID().toString(); users.add(id);
        jdbc.sql("INSERT INTO users(id,nick,is_anonymous) VALUES (?,'포인트 테스트',?)").param(id).param(guest).update();
        return new DbUser(id, null, "포인트 테스트", "user", guest, null, null, clock.get());
    }
    private String post(DbUser author) {
        String id = UUID.randomUUID().toString(); contents.add(id);
        jdbc.sql("INSERT INTO shout_posts(id,author_id,cat,text) VALUES (?,?,'free','오늘의 이야기')").param(id).param(author.id()).update();
        return id;
    }
    private String feed(DbUser author) {
        String id = UUID.randomUUID().toString(); contents.add(id);
        jdbc.sql("INSERT INTO feed_posts(id,author_id,text) VALUES (?,?,'')").param(id).param(author.id()).update();
        return id;
    }
    private String comment(DbUser author, String kind, String post, String text, String parent) {
        String id = UUID.randomUUID().toString(); contents.add(id);
        jdbc.sql("INSERT INTO comments(id,author_id,post_kind,post_id,text,parent_id) VALUES (?,?,?,?,?,?)")
            .param(id).param(author.id()).param(kind).param(post).param(text).param(parent).update();
        return id;
    }
    private void writing(String id) { tx.executeWithoutResult(status -> points.commentCreated(id)); }
    private PointsService.Account account(DbUser user) { return tx.execute(status -> points.me(user)); }
    private void accept(DbUser author, String post, String comment) { tx.executeWithoutResult(status -> points.acceptComment(author, post, comment)); }
    private void cheer(DbUser voter, String kind, String id) {
        tx.executeWithoutResult(status -> {
            jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id) VALUES (?,?,?) ON CONFLICT DO NOTHING").param(voter.id()).param(kind).param(id).update();
            points.cheerAdded(kind, id, voter.id());
        });
    }
    private long rows(String table, String user) { return jdbc.sql("SELECT count(*) FROM " + table + " WHERE user_id=?").param(user).query(Long.class).single(); }

    @Test void writingIsOncePerPostWithThreeDailyAwardsAndNoCarryoverForConsumedEvents() {
        var author=user(false); var writer=user(false);
        String first=post(author);
        writing(comment(writer,"post",first,COMFORT,null));
        writing(comment(writer,"post",first,COMFORT,null));
        for(int i=0;i<2;i++) writing(comment(writer,"post",post(author),COMFORT,null));
        String capped=comment(writer,"post",post(author),COMFORT,null);
        writing(capped);
        assertEquals(30,account(writer).balance());
        assertEquals(3,account(writer).writingEarnedToday());
        assertEquals(4,rows("point_ledger",writer.id()));
        assertTrue(account(writer).history().stream().anyMatch(item -> item.amount()==0));
        clock.addAndGet(60_000);
        writing(capped);
        assertEquals(0,account(writer).todayEarned());
        writing(comment(writer,"feed",feed(author),COMFORT,null));
        assertEquals(40,account(writer).balance());
        assertEquals(1,account(writer).writingEarnedToday());
    }

    @Test void realCommunityHooksPersistTheAdoptionInStoreAndCannotReselectAfterDeletion() {
        var author=user(false); var writer=user(false); var stranger=user(false);
        String post=post(author);
        var store=tx.execute(status -> community.addComment(writer,post,COMFORT,null));
        assertEquals(Boolean.TRUE,store.me().registered());
        assertEquals(Boolean.FALSE,store.users().stream().filter(u->u.id().equals("u1")).findFirst().orElseThrow().registered());
        String comment=store.comments().stream().filter(c->c.postId().equals(post)).findFirst().orElseThrow().id(); contents.add(comment);
        assertEquals(10,account(writer).balance());
        assertEquals(403,assertThrows(ApiException.class,()->accept(stranger,post,comment)).status());
        var accepted=tx.execute(status -> community.acceptComment(author,post,comment));
        assertEquals(comment,accepted.posts().stream().filter(p->p.id().equals(post)).findFirst().orElseThrow().acceptedCommentId());
        accept(author,post,comment);
        assertEquals(60,account(writer).balance());
        tx.executeWithoutResult(status -> community.deleteComment(writer,comment));
        String replacement=comment(stranger,"post",post,COMFORT,null);
        assertEquals(409,assertThrows(ApiException.class,()->accept(author,post,replacement)).status());
        assertEquals(60,account(writer).balance());
    }

    @Test void acceptsOnlyAnAccessibleOtherMembersTopLevelCommentOnTheAuthorsOwnShout() {
        var author=user(false); var writer=user(false); var guest=user(true);
        String post=post(author), other=post(author);
        String root=comment(writer,"post",post,COMFORT,null);
        assertEquals(Boolean.FALSE,tx.execute(status -> community.loadStore(guest)).me().registered());
        for(String invalid:List.of(comment(writer,"post",other,COMFORT,null),comment(writer,"post",post,COMFORT,root),
            comment(author,"post",post,COMFORT,null),comment(guest,"post",post,COMFORT,null))) {
            assertEquals(400,assertThrows(ApiException.class,()->accept(author,post,invalid)).status());
        }
        jdbc.sql("UPDATE comments SET hidden=TRUE WHERE id=?").param(root).update();
        assertEquals(400,assertThrows(ApiException.class,()->accept(author,post,root)).status());
        assertEquals(0,account(writer).balance());
    }

    @Test void registeredUniqueCheerMilestonesPayOnceEvenAfterUnlikesAndKoreanMidnight() {
        var author=user(false); var writer=user(false);
        String comment=comment(writer,"post",post(author),COMFORT,null);
        cheer(writer,"comment",comment); // self
        cheer(user(true),"comment",comment); // guest
        var voters=new ArrayList<DbUser>();
        for(int i=1;i<=30;i++) {
            DbUser voter=user(false); voters.add(voter); cheer(voter,"comment",comment);
            if(i==5) assertEquals(10,account(writer).balance());
            if(i==15) assertEquals(30,account(writer).balance());
        }
        assertEquals(60,account(writer).balance());
        assertEquals(3,rows("point_ledger",writer.id()));
        clock.addAndGet(60_000);
        var last=voters.getLast();
        jdbc.sql("DELETE FROM cheers WHERE user_id=? AND target_id=?").param(last.id()).param(comment).update();
        cheer(last,"comment",comment);
        assertEquals(60,account(writer).balance());
        assertEquals(0,account(writer).todayEarned());
        // Photo-only comfort feed posts use the same unique-voter milestones.
        String feed=feed(writer);
        for(int i=0;i<5;i++) cheer(voters.get(i),"feed",feed);
        assertEquals(70,account(writer).balance());
    }

    @Test void combinedDailyCapTruncatesRewardsAndConsumedAdoptionsNeverMoveToTomorrow() {
        var author=user(false); var writer=user(false);
        for(int i=0;i<3;i++) {
            String post=post(author), comment=comment(writer,"post",post,COMFORT,null);
            writing(comment); accept(author,post,comment);
        }
        assertEquals(180,account(writer).balance());
        String fourth=post(author), fourthComment=comment(writer,"post",fourth,"고마워요",null);
        accept(author,fourth,fourthComment);
        assertEquals(200,account(writer).balance());
        assertTrue(account(writer).history().stream().anyMatch(item->item.reason().equals("comfort_accepted") && item.amount()==20));
        String fifth=post(author), fifthComment=comment(writer,"post",fifth,"응원해요",null);
        accept(author,fifth,fifthComment);
        clock.addAndGet(60_000);
        accept(author,fifth,fifthComment);
        assertEquals(200,account(writer).balance());
        assertEquals(0,account(writer).todayEarned());
        assertEquals(0,account(writer).writingEarnedToday());
    }

    @Test void guestsSamplesRepliesHiddenBlockedAndPrivateInaccessibleSourcesDoNotEarn() {
        var author=user(false); var writer=user(false); var guest=user(true);
        String post=post(author), root=comment(writer,"post",post,COMFORT,null);
        writing(comment(guest,"post",post,COMFORT,null));
        writing(comment(writer,"post",post,"짧아요",null));
        writing(comment(writer,"post",post,COMFORT,root));
        writing(comment(author,"post",post,COMFORT,null));
        assertEquals(0,account(writer).balance());
        jdbc.sql("UPDATE shout_posts SET hidden=TRUE WHERE id=?").param(post).update(); writing(root);
        jdbc.sql("UPDATE shout_posts SET hidden=FALSE WHERE id=?").param(post).update();
        jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(author.id()).param(writer.id()).update(); writing(root);
        jdbc.sql("DELETE FROM user_blocks WHERE blocker_id=?").param(author.id()).update();
        String circle=UUID.randomUUID().toString(); circles.add(circle);
        jdbc.sql("INSERT INTO communities(id,slug,name,name_key,kind,visibility,created_by) VALUES (?,?,?,?,'interest','members',?)")
            .param(circle).param(circle).param("비공개 테스트").param(circle.substring(0,24)).param(author.id()).update();
        jdbc.sql("UPDATE shout_posts SET community_id=?,created_at='2020-01-01' WHERE id=?").param(circle).param(post).update(); writing(root);
        assertEquals(0,account(writer).balance());
        jdbc.sql("INSERT INTO community_members(community_id,user_id,role,status) VALUES (?,?,'member','active')").param(circle).param(writer.id()).update();
        writing(root); assertEquals(10,account(writer).balance());
        assertEquals(401,assertThrows(ApiException.class,()->account(guest)).status());
        var sample=new DbUser("u1",null,"샘플","user",false,null,null,0);
        assertEquals(403,assertThrows(ApiException.class,()->account(sample)).status());
    }

    @Test void rollbackAndConcurrentRetriesNeverDuplicateWalletOrLedger() throws Exception {
        var author=user(false); var writer=user(false);
        String comment=comment(writer,"post",post(author),COMFORT,null);
        assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(status->{points.commentCreated(comment);throw new IllegalStateException("rollback");}));
        assertEquals(0,rows("point_wallets",writer.id()));
        assertEquals(0,rows("point_ledger",writer.id()));
        try(var workers=Executors.newFixedThreadPool(8)) {
            var jobs=new ArrayList<java.util.concurrent.Callable<Void>>();
            for(int i=0;i<16;i++) jobs.add(()->{writing(comment);return null;});
            for(var result:workers.invokeAll(jobs)) result.get();
        }
        assertEquals(10,account(writer).balance()); assertEquals(1,rows("point_ledger",writer.id()));
        String post=jdbc.sql("SELECT post_id FROM comments WHERE id=?").param(comment).query(String.class).single();
        try(var workers=Executors.newFixedThreadPool(8)) {
            var jobs=new ArrayList<java.util.concurrent.Callable<Void>>();
            for(int i=0;i<16;i++) jobs.add(()->{accept(author,post,comment);return null;});
            for(var result:workers.invokeAll(jobs)) result.get();
        }
        assertEquals(60,account(writer).balance()); assertEquals(2,rows("point_ledger",writer.id()));
    }

    @Test void guestReactionsDoNotBecomeEligibleMerelyBecauseTheAccountRegistersLater() {
        var author=user(false); String feed=feed(author); var guest=user(true);
        cheer(guest,"feed",feed);
        jdbc.sql("UPDATE users SET is_anonymous=FALSE WHERE id=?").param(guest.id()).update();
        for(int i=0;i<4;i++) cheer(user(false),"feed",feed);
        assertEquals(0,account(author).balance());
        assertEquals(false,jdbc.sql("SELECT points_eligible FROM cheers WHERE user_id=? AND target_id=?").param(guest.id()).param(feed).query(Boolean.class).single());
        cheer(user(false),"feed",feed);
        assertEquals(10,account(author).balance());
    }

    @Test void rewardsNeverRevealAnonymousCircleAuthorsThroughPersonalBlockRelationships() {
        var author=user(false); var writer=user(false); String post=post(author);
        String circle=UUID.randomUUID().toString(); circles.add(circle);
        jdbc.sql("INSERT INTO communities(id,slug,name,name_key,kind,visibility,created_by) VALUES (?,?,?,?,'interest','public',?)")
            .param(circle).param(circle).param("익명 테스트").param(circle.substring(0,24)).param(author.id()).update();
        jdbc.sql("UPDATE shout_posts SET community_id=?,created_at='2020-01-01' WHERE id=?").param(circle).param(post).update();
        jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(writer.id()).param(author.id()).update();
        String comment=comment(writer,"post",post,COMFORT,null);
        writing(comment); assertEquals(10,account(writer).balance());
        for(int i=0;i<5;i++) {
            var voter=user(false);
            jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(voter.id()).param(author.id()).update();
            cheer(voter,"comment",comment);
        }
        assertEquals(20,account(writer).balance());
        // The comment author's identity is public, so their block relationship still applies.
        var blockedVoter=user(false);
        jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(blockedVoter.id()).param(writer.id()).update();
        cheer(blockedVoter,"comment",comment);
        assertFalse(jdbc.sql("SELECT points_eligible FROM cheers WHERE user_id=? AND target_id=?")
            .param(blockedVoter.id()).param(comment).query(Boolean.class).single());
    }
}
