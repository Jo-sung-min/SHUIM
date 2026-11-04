package kr.co.shuim.quote;

import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

/** Uses an explicitly selected disposable local database, never application DB_URL or .env. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PhilosophyQuotePostgresTest {
    private static JdbcClient jdbc;
    private static TransactionTemplate tx;
    private final AtomicLong clock = new AtomicLong(1_800_000_000_000L);
    private final List<String> ids = new ArrayList<>();
    private PhilosophyQuoteService service;
    private String admin;

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    @BeforeEach void setup() {
        service = new PhilosophyQuoteService(jdbc, clock::get);
        admin = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id,nick,role,is_anonymous) VALUES (?,'명언 검수 테스트','admin',FALSE)").param(admin).update();
    }

    @AfterEach void cleanup() {
        for (String id : ids) jdbc.sql("DELETE FROM philosophy_quotes WHERE id=?").param(id).update();
        jdbc.sql("DELETE FROM users WHERE id=?").param(admin).update();
    }

    private static PhilosophyQuoteService.Content content() {
        return new PhilosophyQuoteService.Content("손에 닿는 하루를 살아가요.", "테스트 저자", "테스트 원문 1장", "https://example.org/source#chapter-1", "오늘", "paraphrase");
    }

    private PhilosophyQuoteService.Quote create() {
        var quote = service.create(content()); ids.add(quote.id()); return quote;
    }

    private PhilosophyQuoteService.Quote update(String id, PhilosophyQuoteService.Content body) {
        return tx.execute(status -> service.update(id, body));
    }

    @Test
    void researchedSeedIdeasStillRequireExplicitEditorialReview() {
        var seeded = jdbc.sql("SELECT id FROM philosophy_quotes WHERE id LIKE 'a7d48a6c-df27-4000-8000-%'").query(String.class).list();
        assertEquals(24, seeded.size());
        assertEquals(24L, jdbc.sql("""
            SELECT count(*) FROM philosophy_quotes WHERE id LIKE 'a7d48a6c-df27-4000-8000-%'
              AND enabled=FALSE AND reviewed_at IS NULL AND reviewed_by IS NULL AND kind='paraphrase'
              AND created_at>0 AND updated_at>0
            """).query(Long.class).single());
        assertTrue(service.randomApproved().isEmpty());
    }

    @Test
    void explicitReviewPersistsTheActorAndOnlyEnabledReviewedRowsReachAi() {
        var pending = create();
        assertFalse(pending.enabled()); assertNull(pending.reviewedAt());
        assertTrue(service.randomApproved().isEmpty());
        var declined = service.setUsage(pending.id(), false, admin, pending.updatedAt());
        assertFalse(declined.enabled()); assertEquals(clock.get(), declined.reviewedAt());
        assertTrue(declined.updatedAt() > pending.updatedAt());
        assertTrue(service.randomApproved().isEmpty());
        var approved = service.setUsage(pending.id(), true, admin, declined.updatedAt());
        assertTrue(approved.enabled()); assertNotNull(approved.reviewedAt());
        assertEquals(admin, jdbc.sql("SELECT reviewed_by FROM philosophy_quotes WHERE id=?").param(approved.id()).query(String.class).single());
        var restarted = new PhilosophyQuoteService(jdbc, clock::get);
        assertEquals(approved, restarted.randomApproved().orElseThrow());
        assertTrue(restarted.list().contains(approved));
        var disabled = service.setUsage(approved.id(), false, admin, approved.updatedAt());
        assertNotNull(disabled.reviewedAt());
        assertTrue(service.randomApproved().isEmpty());
    }

    @Test
    void everyContentFieldChangeClearsApprovalWhileUnchangedSavesPreserveIt() {
        var quote = create();
        var c = content();
        var changes = List.of(
            new PhilosophyQuoteService.Content("다른 문구", c.author(), c.source(), c.sourceUrl(), c.theme(), c.kind()),
            new PhilosophyQuoteService.Content(c.text(), "다른 저자", c.source(), c.sourceUrl(), c.theme(), c.kind()),
            new PhilosophyQuoteService.Content(c.text(), c.author(), "원문 2장", c.sourceUrl(), c.theme(), c.kind()),
            new PhilosophyQuoteService.Content(c.text(), c.author(), c.source(), "https://example.org/other", c.theme(), c.kind()),
            new PhilosophyQuoteService.Content(c.text(), c.author(), c.source(), c.sourceUrl(), "마음", c.kind()),
            new PhilosophyQuoteService.Content(c.text(), c.author(), c.source(), c.sourceUrl(), c.theme(), "translation"));
        for (var changed : changes) {
            quote = update(quote.id(), c);
            quote = service.setUsage(quote.id(), true, admin, quote.updatedAt());
            assertEquals(quote, update(quote.id(), c), "saving the same normalized content must not discard review");
            var edited = update(quote.id(), changed);
            assertFalse(edited.enabled()); assertNull(edited.reviewedAt());
            assertTrue(edited.updatedAt() > quote.updatedAt(), "even mutations during one clock millisecond need distinct versions");
            assertTrue(jdbc.sql("SELECT reviewed_by IS NULL FROM philosophy_quotes WHERE id=?").param(quote.id())
                .query(Boolean.class).single());
            assertTrue(service.randomApproved().isEmpty());
            quote = edited;
        }
    }

    @Test
    void staleReviewCannotApproveContentEditedAfterTheAdminReadIt() {
        var old = create();
        var edited = update(old.id(), new PhilosophyQuoteService.Content("검수 이후 변경", "저자", "원문", "https://example.org", "삶", "translation"));
        assertEquals(409, assertThrows(ApiException.class, () -> service.setUsage(old.id(), true, admin, old.updatedAt())).status());
        assertFalse(service.list().stream().filter(q -> q.id().equals(old.id())).findFirst().orElseThrow().enabled());
        assertTrue(service.randomApproved().isEmpty());
        assertTrue(service.setUsage(edited.id(), true, admin, edited.updatedAt()).enabled());
        assertEquals(404, assertThrows(ApiException.class, () -> service.setUsage("missing", true, admin, 1L)).status());
        assertEquals(404, assertThrows(ApiException.class, () -> update("missing", content())).status());
    }

    @Test
    void simultaneousReviewersCannotReuseTheSameVersion() throws Exception {
        var quote = create();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(12)) {
            var attempts = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 12; i++) attempts.add(executor.submit(() -> {
                assertTrue(start.await(5, TimeUnit.SECONDS));
                try { return service.setUsage(quote.id(), true, admin, quote.updatedAt()).enabled(); }
                catch (ApiException e) { assertEquals(409, e.status()); return false; }
            }));
            start.countDown();
            int succeeded = 0;
            for (var attempt : attempts) if (attempt.get(10, TimeUnit.SECONDS)) succeeded++;
            assertEquals(1, succeeded);
            assertEquals(quote.updatedAt() + 1, service.randomApproved().orElseThrow().updatedAt());
        }
    }

    @Test
    void selectionNeverReturnsPendingOrDisabledRowsAndTheDatabaseRejectsUnreviewedActivation() {
        var pending = create();
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("UPDATE philosophy_quotes SET enabled=TRUE WHERE id=?").param(pending.id()).update());
        var disabled = create(); service.setUsage(disabled.id(), false, admin, disabled.updatedAt());
        var first = create(); service.setUsage(first.id(), true, admin, first.updatedAt());
        var second = create(); service.setUsage(second.id(), true, admin, second.updatedAt());
        var approved = Set.of(first.id(), second.id());
        for (int i = 0; i < 25; i++) assertTrue(approved.contains(service.randomApproved().orElseThrow().id()));
    }
}
