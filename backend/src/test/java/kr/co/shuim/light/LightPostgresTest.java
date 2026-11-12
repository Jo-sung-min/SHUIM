package kr.co.shuim.light;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.auth.AccountDeletionService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Dates;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityService;
import kr.co.shuim.community.Model.Gift;
import kr.co.shuim.community.Model.Light;
import kr.co.shuim.community.Model.RankRow;
import kr.co.shuim.community.Model.Store;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.PointsService;
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
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Only an explicitly supplied disposable local database is allowed. Never reads DB_URL. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class LightPostgresTest {
    private static JdbcClient jdbc;
    private static TransactionTemplate tx;
    /** 23:59 KST: one minute later is the next Korean day. */
    private final AtomicLong clock = new AtomicLong(Instant.parse("2026-11-03T14:59:00Z").toEpochMilli());
    private final List<String> users = new ArrayList<>(), posts = new ArrayList<>(), circles = new ArrayList<>();
    private LightService light;
    private CommunityService community;

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }
    @BeforeEach void setup() {
        light = new LightService(jdbc, clock::get);
        community = new CommunityService(jdbc, new ObjectMapper(), mock(S3Service.class), new MockEnvironment(), false,
            new BlockService(jdbc), new BadgeService(jdbc), new PointsService(jdbc), light);
    }
    @AfterEach void cleanup() {
        for (String id : users) jdbc.sql("DELETE FROM light_gifts WHERE from_user=? OR to_user=?").param(id).param(id).update();
        for (String id : posts) {
            jdbc.sql("DELETE FROM light_gifts WHERE post_id=?").param(id).update();
            jdbc.sql("DELETE FROM reports WHERE target_id=?").param(id).update();
            jdbc.sql("DELETE FROM shout_posts WHERE id=?").param(id).update();
        }
        for (String id : circles) jdbc.sql("DELETE FROM communities WHERE id=?").param(id).update();
        for (String id : users) jdbc.sql("DELETE FROM users WHERE id=?").param(id).update();
        jdbc.sql("DELETE FROM weekly_batches WHERE week=?::date").param(Dates.currentWeekKey()).update();
    }

    private DbUser user(String nick, boolean guest) {
        String id = UUID.randomUUID().toString(); users.add(id);
        jdbc.sql("INSERT INTO users(id,nick,is_anonymous) VALUES (?,?,?)").param(id).param(nick).param(guest).update();
        return new DbUser(id, null, nick, "user", guest, null, null, clock.get());
    }
    private DbUser member(String nick) { return user(nick, false); }
    private String post(String authorId, String cat) {
        String id = UUID.randomUUID().toString(); posts.add(id);
        jdbc.sql("INSERT INTO shout_posts(id,author_id,cat,text) VALUES (?,?,?,'오늘의 불행')").param(id).param(authorId).param(cat).update();
        return id;
    }
    private String post(DbUser author) { return post(author.id(), "misfortune"); }
    private LightService.Account wallet(DbUser user) { return tx.execute(status -> light.me(user)); }
    /** Every action happens a millisecond after the last, so "latest first" history is unambiguous. */
    private LightService.Account daily(DbUser user) { clock.incrementAndGet(); return tx.execute(status -> light.claimDaily(user)); }
    private Store give(DbUser from, String post, Object amount, String requestId) {
        clock.incrementAndGet();
        return tx.execute(status -> community.giveLight(from, post, amount, requestId));
    }
    private Store give(DbUser from, String post, int amount) { return give(from, post, amount, UUID.randomUUID().toString()); }
    private int status(Runnable action) { return assertThrows(ApiException.class, action::run).status(); }
    private long count(String sql, Object... params) { return jdbc.sql(sql).params(params).query(Long.class).single(); }

    @Test void dailyLightArrivesOncePerKoreanDayAndRepeatedTapsChangeNothing() {
        var a = member("가");
        assertFalse(wallet(a).dailyClaimed());
        assertEquals(0, wallet(a).balance());
        assertEquals(LightPolicy.DAILY_LIGHT, daily(a).balance());
        assertTrue(daily(a).dailyClaimed());
        assertEquals(LightPolicy.DAILY_LIGHT, wallet(a).balance());
        assertEquals(1, count("SELECT count(*) FROM light_ledger WHERE user_id=?", a.id()));
        clock.addAndGet(60_000); // 한국 시간 자정이 지났다
        assertFalse(wallet(a).dailyClaimed());
        assertEquals(2L * LightPolicy.DAILY_LIGHT, daily(a).balance());
        assertEquals(List.of("daily", "daily"), wallet(a).history().stream().map(LightService.Entry::reason).toList());
    }

    @Test void givingMovesLightToTheAuthorAndTheWeeklyRankingFollowsAtOnce() {
        var giver = member("주는 이"); var author = member("받는 이"); var cheered = member("힘내요 많은 이");
        String lit = post(author), plain = post(cheered);
        for (int i = 0; i < 3; i++) jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id) VALUES (?,'post',?)").param(member("응원 " + i).id()).param(plain).update();
        daily(giver);

        Store before = tx.execute(status -> community.refreshCurrentWeek(giver));
        assertEquals(List.of(cheered.id(), author.id()), rows(before).stream().map(RankRow::userId).filter(id -> id.equals(cheered.id()) || id.equals(author.id())).toList());

        Store after = give(giver, lit, 3);
        assertEquals(7, wallet(giver).balance());
        assertEquals(3, wallet(giver).totalGiven());
        assertEquals(3, wallet(author).balance());
        assertEquals(3, wallet(author).totalReceived());
        assertEquals(3, after.posts().stream().filter(p -> p.id().equals(lit)).findFirst().orElseThrow().light());
        // 빛 3 이 힘내요 3 을 앞선다
        assertEquals(List.of(author.id(), cheered.id()), rows(after).stream().map(RankRow::userId).filter(id -> id.equals(cheered.id()) || id.equals(author.id())).toList());
        assertEquals(3, rows(after).stream().filter(r -> r.userId().equals(author.id())).findFirst().orElseThrow().light());
        Light week = after.weekly().get(Dates.currentWeekKey()).light();
        assertTrue(week.total() >= 3 && week.count() >= 1 && week.givers() >= 1);
        Gift seen = after.gifts().stream().filter(g -> lit.equals(g.postId())).findFirst().orElseThrow();
        assertEquals(List.of(giver.id(), author.id(), 3), List.of(seen.by(), seen.to(), seen.amount()));
        // 받는 사람도 같은 순위를 보고, 원장에는 상대 이름이 남는다
        assertEquals(3, rows(tx.execute(status -> community.loadStore(author))).stream().filter(r -> r.userId().equals(author.id())).findFirst().orElseThrow().light());
        var sent = wallet(giver).history().getFirst(); var received = wallet(author).history().getFirst();
        assertEquals(List.of("gift_sent", -3, 7L, "받는 이"), List.of(sent.reason(), sent.amount(), sent.balanceAfter(), sent.nick()));
        assertEquals(List.of("gift_received", 3, 3L, "주는 이"), List.of(received.reason(), received.amount(), received.balanceAfter(), received.nick()));
        // 받은 빛은 다시 다른 사람에게 줄 수 있다
        give(author, plain, 2);
        assertEquals(1, wallet(author).balance());
        assertEquals(2, wallet(cheered).balance());
    }
    private List<RankRow> rows(Store store) { return store.weekly().get(Dates.currentWeekKey()).rows(); }

    @Test void theSameRequestIsAppliedOnceEvenWhenRetriedConcurrentlyOrReplayedByAnotherAccount() throws Exception {
        var giver = member("주는 이"); var other = member("다른 이"); var author = member("받는 이");
        String post = post(author), request = UUID.randomUUID().toString();
        daily(giver); daily(other);
        try (var workers = Executors.newFixedThreadPool(8)) {
            var jobs = new ArrayList<Callable<Void>>();
            for (int i = 0; i < 16; i++) jobs.add(() -> { give(giver, post, 2, request); return null; });
            for (var result : workers.invokeAll(jobs)) result.get();
        }
        assertEquals(8, wallet(giver).balance());
        assertEquals(2, wallet(author).balance());
        assertEquals(1, count("SELECT count(*) FROM light_gifts WHERE post_id=?", post));
        assertEquals(400, status(() -> give(other, post, 2, request)));
        assertEquals(LightPolicy.DAILY_LIGHT, wallet(other).balance());
        assertEquals(2, count("SELECT count(*) FROM light_ledger WHERE gift_id=?::uuid", request));
    }

    @Test void amountsBalanceAndTheSamePersonDailyLimitAreEnforcedByTheServer() {
        var giver = member("주는 이"); var author = member("받는 이"); var second = member("또 다른 이");
        String post = post(author), another = post(author.id(), "free"), elsewhere = post(second);
        for (Object bad : new Object[] {0, -5, 11, 2.5, "3"}) assertEquals(400, status(() -> give(giver, post, bad, UUID.randomUUID().toString())));
        assertEquals(400, status(() -> give(giver, post, 1, "not-a-uuid")));
        assertEquals(409, status(() -> give(giver, post, 1))); // 잔액 0
        daily(giver);
        clock.addAndGet(60_000);
        daily(giver); // 다음 날: 잔액 20, 오늘 준 빛 0
        give(giver, post, 7);
        assertEquals(409, status(() -> give(giver, another, 5))); // 같은 사람의 다른 글도 같은 한도
        give(giver, another, 3);
        assertEquals(409, status(() -> give(giver, post, 1)));
        give(giver, elsewhere, 10); // 다른 사람에게는 줄 수 있다
        assertEquals(409, status(() -> give(giver, elsewhere, 1)));
        assertEquals(0, wallet(giver).balance());
        assertEquals(10, wallet(author).balance());
        // 둘이 주고받기를 되풀이해도 하루에 쌓이는 빛은 늘지 않는다
        String mine = post(giver);
        give(author, mine, 10);
        assertEquals(409, status(() -> give(giver, post, 10)));
        assertEquals(409, status(() -> give(author, mine, 1)));
        assertEquals(10, wallet(giver).totalReceived());
        clock.addAndGet(24 * 60 * 60_000L);
        give(giver, post, 10); // 날이 바뀌면 다시
        assertEquals(20, wallet(author).totalReceived());
    }

    @Test void onlyMembersGiveAndOnlyVisiblePlazaPostsOfOtherMembersReceive() {
        var giver = member("주는 이"); var author = member("받는 이"); var guest = user("손님", true);
        daily(giver);
        String ok = post(author);
        assertEquals(400, status(() -> give(giver, post(giver), 1)));              // 내 글
        assertEquals(404, status(() -> give(giver, "missing-post", 1)));
        assertEquals(400, status(() -> give(giver, post(guest.id(), "misfortune"), 1))); // 비회원의 글
        assertEquals(400, status(() -> give(giver, post("u1", "misfortune"), 1)));       // 샘플 계정의 글
        assertEquals(401, status(() -> give(guest, ok, 1)));
        assertEquals(401, status(() -> wallet(guest)));
        assertEquals(401, status(() -> daily(guest)));
        assertEquals(403, status(() -> wallet(new DbUser("u1", null, "샘플", "user", false, null, null, 0))));

        String hidden = post(author);
        jdbc.sql("UPDATE shout_posts SET hidden=TRUE WHERE id=?").param(hidden).update();
        assertEquals(404, status(() -> give(giver, hidden, 1)));
        String flagged = post(author);
        for (int i = 0; i < 5; i++) jdbc.sql("INSERT INTO reports(id,reporter_id,target_kind,target_id,reason) VALUES (?,?,'post',?,'abuse')")
            .param(UUID.randomUUID().toString()).param(member("신고 " + i).id()).param(flagged).update();
        assertEquals(404, status(() -> give(giver, flagged, 1)));
        // 소로우 사연은 보낸 사람이 가려져 있다: 빛으로도 드러나지 않게 없는 글처럼 답한다
        String circle = UUID.randomUUID().toString(); circles.add(circle);
        jdbc.sql("INSERT INTO communities(id,slug,name,name_key,kind,visibility,created_by) VALUES (?,?,?,?,'interest','public',?)")
            .param(circle).param(circle).param("빛 테스트 소로우").param(circle.substring(0, 24)).param(author.id()).update();
        String story = post(author);
        jdbc.sql("UPDATE shout_posts SET community_id=? WHERE id=?").param(circle).param(story).update();
        assertEquals(404, status(() -> give(giver, story, 1)));

        jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(author.id()).param(giver.id()).update();
        assertEquals(403, status(() -> give(giver, ok, 1)));
        jdbc.sql("DELETE FROM user_blocks WHERE blocker_id=?").param(author.id()).update();

        var suspended = member("정지된 이");
        daily(suspended);
        jdbc.sql("UPDATE users SET blocked_at=now(),blocked_reason='test' WHERE id=?").param(suspended.id()).update();
        var suspendedNow = new DbUser(suspended.id(), null, suspended.nick(), "user", false, 1L, "test", 0);
        assertEquals(403, status(() -> give(suspendedNow, ok, 1)));
        assertEquals(400, status(() -> give(giver, post(suspended), 1))); // 정지된 계정은 받지도 못한다

        assertEquals(LightPolicy.DAILY_LIGHT, wallet(giver).balance());
        assertEquals(0, wallet(author).balance());
        assertEquals(0, count("SELECT count(*) FROM light_gifts WHERE from_user=?", giver.id()));
        give(giver, ok, 1);
        assertEquals(1, wallet(author).balance());
    }

    @Test void oppositeGiftsNeverDeadlockAndRollbacksLeaveNoTrace() throws Exception {
        var a = member("가"); var b = member("나");
        String postA = post(a), postB = post(b);
        daily(a); daily(b);
        assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(status -> {
            light.give(a, postB, 4, UUID.randomUUID().toString());
            throw new IllegalStateException("rollback");
        }));
        assertEquals(LightPolicy.DAILY_LIGHT, wallet(a).balance());
        assertEquals(0, count("SELECT count(*) FROM light_gifts WHERE from_user=?", a.id()));
        // 서로에게 동시에: 지갑을 id 순서로 잠그므로 교착 없이 모두 끝난다 (커뮤니티 잠금 없이 LightService 만으로)
        try (var workers = Executors.newFixedThreadPool(8)) {
            var jobs = new ArrayList<Callable<Void>>();
            for (int i = 0; i < 5; i++) {
                jobs.add(() -> { tx.executeWithoutResult(status -> light.give(a, postB, 1, UUID.randomUUID().toString())); return null; });
                jobs.add(() -> { tx.executeWithoutResult(status -> light.give(b, postA, 1, UUID.randomUUID().toString())); return null; });
            }
            for (var result : workers.invokeAll(jobs)) result.get();
        }
        for (DbUser user : List.of(a, b)) {
            var wallet = wallet(user);
            assertEquals(List.of(10L, 5L, 5L), List.of(wallet.balance(), wallet.totalGiven(), wallet.totalReceived()));
            assertEquals(11, count("SELECT count(*) FROM light_ledger WHERE user_id=?", user.id()));
            // 원장의 합이 언제나 잔액이다
            assertEquals(10, count("SELECT COALESCE(sum(amount),0) FROM light_ledger WHERE user_id=?", user.id()));
        }
    }

    @Test void aLeavingGiverKeepsTheGiftInPlaceAndALeavingAuthorTakesItAway() {
        var deletion = new AccountDeletionService(jdbc, mock(S3Service.class));
        var giver = member("떠나는 이"); var author = member("남는 이"); var watcher = member("지켜보는 이");
        String post = post(author);
        daily(giver); daily(watcher);
        give(giver, post, 4);
        give(watcher, post, 1);
        assertEquals(Boolean.TRUE, tx.execute(status -> deletion.deleteAccount(giver.id())));
        assertEquals(5, wallet(author).balance());
        Store store = tx.execute(status -> community.refreshCurrentWeek(author));
        assertEquals(5, store.posts().stream().filter(p -> p.id().equals(post)).findFirst().orElseThrow().light());
        assertEquals(List.of(watcher.id()), store.gifts().stream().filter(g -> post.equals(g.postId())).map(Gift::by).toList());
        assertNull(wallet(author).history().stream().filter(e -> e.amount() == 4).findFirst().orElseThrow().nick());

        assertEquals(Boolean.TRUE, tx.execute(status -> deletion.deleteAccount(author.id())));
        assertEquals(0, count("SELECT count(*) FROM light_gifts WHERE post_id=? OR to_user=?", post, author.id()));
        assertEquals(0, count("SELECT count(*) FROM light_wallets WHERE user_id IN (?,?)", giver.id(), author.id()));
        var left = wallet(watcher);
        assertEquals(List.of(9L, 1L), List.of(left.balance(), left.totalGiven()));
        var sent = left.history().getFirst();
        assertEquals("gift_sent", sent.reason());
        assertNull(sent.nick());
    }

    @Test void theMigrationOnlyAddsAndLeavesTheOldMockDonationDataAlone() {
        assertEquals(3, count("SELECT count(*) FROM information_schema.columns WHERE table_name='weekly_batches' AND column_name IN ('fund_total','fund_count','fund_donors')"));
        assertEquals(3, count("SELECT count(*) FROM information_schema.columns WHERE table_name='weekly_batches' AND column_name IN ('light_total','light_count','light_givers')"));
        assertEquals(1, count("SELECT count(*) FROM information_schema.tables WHERE table_name='donations'"));
        var giver = member("주는 이"); var author = member("받는 이");
        assertThrows(Exception.class, () -> jdbc.sql("INSERT INTO light_gifts(id,from_user,to_user,amount,given_on,created_at) VALUES (?,?,?,1,current_date,0)")
            .param(UUID.randomUUID()).param(giver.id()).param(giver.id()).update()); // 자기 자신에게는 DB 도 막는다
        assertThrows(Exception.class, () -> jdbc.sql("INSERT INTO light_wallets(user_id,balance,updated_at) VALUES (?,-1,0)").param(author.id()).update());
    }
}
