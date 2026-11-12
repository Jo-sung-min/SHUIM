package kr.co.shuim.beach;

import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class BambooGuestbookPostgresTest {
    @Test void newestThirtySurviveRestartsAndRespectPrivacyWithoutRevivingOldNotes() throws Exception {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var jdbc = JdbcClient.create(source);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        String author = UUID.randomUUID().toString(), viewer = UUID.randomUUID().toString();
        String room = UUID.randomUUID().toString(), otherRoom = UUID.randomUUID().toString();
        for (String id : new String[] {author, viewer})
            jdbc.sql("INSERT INTO users (id,nick,is_anonymous) VALUES (?, '방명록 테스트', false)").param(id).update();
        try {
            for (String id : new String[] {room, otherRoom})
                jdbc.sql("INSERT INTO communities (id,slug,name,name_key,kind,created_by) VALUES (?,?,?,?,'interest',?)")
                    .param(id).param(id).param(id.substring(0,18)).param(id.substring(0,18)).param(author).update();
            UUID key = UUID.randomUUID();
            Callable<BambooGuestbook.Entry> send = () -> tx.execute(s -> new BambooGuestbook(jdbc).write(room,author,key,"달", "오늘 밤 🌙"));
            try (var pool = Executors.newFixedThreadPool(2)) {
                var a = pool.submit(send); var b = pool.submit(send);
                assertEquals(a.get().id(), b.get().id());
            }
            var restarted = new BambooGuestbook(jdbc);
            assertEquals(1, restarted.list(room,viewer,null).entries().size());
            assertFalse(restarted.list(room,viewer,null).entries().getFirst().mine());
            assertTrue(restarted.list(otherRoom,viewer,null).entries().isEmpty());
            assertEquals(409, assertThrows(ApiException.class, () -> tx.execute(s -> restarted.write(room,author,key,"별","다른 글"))).status());
            assertEquals(429, assertThrows(ApiException.class, () -> tx.execute(s -> restarted.write(room,author,UUID.randomUUID(),"달","다음 글"))).status());
            jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(author).param(viewer).update();
            assertTrue(restarted.list(room,viewer,null).entries().isEmpty());
            for(int i=0; i<30; i++) jdbc.sql("INSERT INTO bamboo_guestbook(community_id,author_id,request_id,display_name,story) VALUES (?,?,?,'나','기록')")
                .param(room).param(viewer).param(UUID.randomUUID()).update();
            var first = restarted.list(room,viewer,null);
            assertEquals(30, first.entries().size());
            assertNull(first.nextCursor());
            long oldestOnBoard = Long.parseLong(first.entries().getLast().id());
            assertTrue(restarted.list(room,viewer,oldestOnBoard).entries().isEmpty());
            // Even a blocked author's new post occupies a space on the shared board.
            jdbc.sql("INSERT INTO bamboo_guestbook(community_id,author_id,request_id,display_name,story) VALUES (?,?,?,'달','비공개')")
                .param(room).param(author).param(UUID.randomUUID()).update();
            var visible = restarted.list(room,viewer,null).entries();
            assertEquals(29, visible.size());
            assertTrue(visible.stream().allMatch(entry -> Long.parseLong(entry.id()) > oldestOnBoard));
            jdbc.sql("DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?").param(author).param(viewer).update();
            var updated = restarted.list(room,viewer,null).entries();
            assertEquals(30, updated.size());
            assertEquals("비공개", updated.getFirst().story());
            assertEquals(first.entries().subList(0, 29), updated.subList(1, 30));
        } finally {
            jdbc.sql("DELETE FROM communities WHERE id IN (?,?)").param(room).param(otherRoom).update();
            jdbc.sql("DELETE FROM users WHERE id IN (?,?)").param(author).param(viewer).update();
        }
    }

    @Test void thePublicBambooForestKeepsItsGuestbookWithoutACircleRow() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var jdbc = JdbcClient.create(source);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
        String space = kr.co.shuim.common.SpaceMaps.PUBLIC_ID, author = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id,nick,is_anonymous) VALUES (?, '공용 방명록 테스트', false)").param(author).update();
        try {
            var book = new BambooGuestbook(jdbc);
            var written = tx.execute(s -> book.write(space, author, UUID.randomUUID(), "달", "누구나 쉬어 가요"));
            assertEquals(written.id(), book.list(space, author, null).entries().getFirst().id());
            assertEquals(0L, jdbc.sql("SELECT count(*) FROM communities WHERE id = ?").param(space).query(Long.class).single());
        } finally {
            // 글쓴이를 지우면 방명록 글도 함께 지워진다 (author_id 의 ON DELETE CASCADE).
            jdbc.sql("DELETE FROM users WHERE id = ?").param(author).update();
        }
    }
}
