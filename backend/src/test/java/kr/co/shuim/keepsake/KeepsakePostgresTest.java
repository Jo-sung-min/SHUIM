package kr.co.shuim.keepsake;

import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

/** Disposable loopback database only. Never reads application credentials. */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class KeepsakePostgresTest {
    JdbcClient jdbc; TransactionTemplate tx; Keepsakes store; String schema, me, friend, leaver, stranger;
    final LocalDate day = LocalDate.parse("2026-11-13");

    @BeforeEach void setup() {
        schema = "orb_test_" + UUID.randomUUID().toString().replace("-", "");
        var ds = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL") + "?currentSchema=" + schema, "sorow_test", "");
        Flyway.configure().dataSource(ds).schemas(schema).defaultSchema(schema).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        store = new Keepsakes(jdbc);
        me = user("나"); friend = user("가람"); leaver = user("떠날 사람"); stranger = user("남");
    }
    @AfterEach void cleanup() {
        if (jdbc != null && schema.matches("orb_test_[a-f0-9]{32}")) jdbc.sql("DROP SCHEMA " + schema + " CASCADE").update();
    }
    String user(String nick) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick,role,is_anonymous) VALUES (?,?,'user',false)").param(id).param(nick).update();
        return id;
    }
    Keepsakes.Orb claim(LocalDate on, int mood, List<Keepsakes.Companion> beside) {
        return tx.execute(s -> store.claim(me, on, mood, "garden", "public", "공용 공간", "bench-ne", "호숫가 벤치", beside));
    }

    boolean drop(String who, String photoId) {
        return Boolean.TRUE.equals(tx.execute(s -> store.removePhoto(who, Long.parseLong(photoId))));
    }

    @Test void oneOrbADayKeepsThePlaceTheMoodAndWhoWasThere() {
        assertFalse(store.foundOn(me, day));
        var orb = claim(day, 2, List.of(new Keepsakes.Companion(friend, "가람"), new Keepsakes.Companion(leaver, "떠날 사람"),
            new Keepsakes.Companion(me, "나"), new Keepsakes.Companion("no-such-account", "유령")));
        assertEquals("2026-11-13", orb.day()); assertEquals(2, orb.mood());
        assertEquals("garden", orb.mapId()); assertTrue(orb.shared()); assertEquals("공용 공간", orb.spaceName());
        assertEquals("bench-ne", orb.spotId()); assertEquals("호숫가 벤치", orb.spotName());
        // 나 자신은 세지 않고, 계정이 없는 이름은 적지 않되 수에는 남는다
        assertEquals(3, orb.companionCount());
        assertEquals(List.of("가람", "떠날 사람"), orb.companions().stream().map(Keepsakes.Companion::nick).toList());
        assertTrue(store.foundOn(me, day));
        assertEquals(409, assertThrows(ApiException.class, () -> claim(day, 5, List.of())).status());
        assertEquals(2, store.orbs(me).getFirst().mood());
        assertTrue(store.orbs(friend).isEmpty());

        // 닉네임을 바꿔도 그때의 이름이 남는다
        jdbc.sql("UPDATE users SET nick='새 이름' WHERE id=?").param(friend).update();
        assertEquals("가람", store.orbs(me).getFirst().companions().getFirst().nick());
        // 탈퇴하면 이름은 지워지고 수만 남는다. 나중에 차단한 사람도 가려진다
        jdbc.sql("DELETE FROM users WHERE id=?").param(leaver).update();
        assertEquals(List.of("가람"), store.orbs(me).getFirst().companions().stream().map(Keepsakes.Companion::nick).toList());
        assertEquals(3, store.orbs(me).getFirst().companionCount());
        jdbc.sql("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES (?,?)").param(friend).param(me).update();
        assertTrue(store.orbs(me).getFirst().companions().isEmpty());
    }

    @Test void twoDevicesClaimingAtOnceLeaveOneOrb() throws Exception {
        Callable<Object> pick = () -> { try { return claim(day, 3, List.of()); } catch (ApiException e) { return e; } };
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(pick); var b = pool.submit(pick);
            long conflicts = List.of(a.get(), b.get()).stream().filter(r -> r instanceof ApiException e && e.status() == 409).count();
            assertEquals(1, conflicts);
        }
        assertEquals(1, store.orbs(me).size());
    }

    @Test void aLaidDownOrbLeavesTheShelfButKeepsItsDay() {
        var first = claim(day, 1, List.of());
        claim(day.plusDays(1), 4, List.of());
        assertEquals(List.of("2026-11-14", "2026-11-13"), store.orbs(me).stream().map(Keepsakes.Orb::day).toList());
        assertFalse(store.removeOrb(stranger, Long.parseLong(first.id())));
        assertTrue(store.removeOrb(me, Long.parseLong(first.id())));
        assertFalse(store.removeOrb(me, Long.parseLong(first.id())));
        assertEquals(List.of("2026-11-14"), store.orbs(me).stream().map(Keepsakes.Orb::day).toList());
        assertTrue(store.foundOn(me, day));
        assertEquals(409, assertThrows(ApiException.class, () -> claim(day, 5, List.of())).status());
    }

    @Test void theAlbumTakesOnlyMyUploadsUpToTheLimitAndQueuesDeletion() {
        String mine = "feed/2026/11/13/" + me + "-aaaa.webp", second = "feed/2026/11/13/" + me + "-bbbb.webp", third = "feed/2026/11/13/" + me + "-cccc.webp";
        String theirs = "feed/2026/11/13/" + stranger + "-dddd.webp";
        for (String key : List.of(mine, second, third)) jdbc.sql("INSERT INTO uploaded_objects(object_key,user_id) VALUES (?,?)").param(key).param(me).update();
        jdbc.sql("INSERT INTO uploaded_objects(object_key,user_id) VALUES (?,?)").param(theirs).param(stranger).update();

        var photo = tx.execute(s -> store.addPhoto(me, mine, "https://cdn/" + mine, "garden", "공용 공간", 2));
        assertEquals("garden", photo.mapId()); assertEquals("공용 공간", photo.spaceName());
        // 같은 사진을 다시 넣어도 한 장이다
        assertEquals(photo.id(), tx.execute(s -> store.addPhoto(me, mine, "https://cdn/" + mine, "beach", "", 2)).id());
        assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> store.addPhoto(me, theirs, "https://cdn/" + theirs, "garden", "", 2))).status());
        assertEquals(400, assertThrows(ApiException.class, () -> tx.execute(s -> store.addPhoto(me, "feed/x/unknown.webp", "https://cdn/x", "garden", "", 2))).status());
        tx.execute(s -> store.addPhoto(me, second, "https://cdn/" + second, "uyuni", "", 2));
        assertEquals(409, assertThrows(ApiException.class, () -> tx.execute(s -> store.addPhoto(me, third, "https://cdn/" + third, "uyuni", "", 2))).status());
        assertEquals(List.of("uyuni", "garden"), store.photos(me).stream().map(Keepsakes.Photo::mapId).toList());
        assertTrue(store.photos(stranger).isEmpty());

        assertFalse(drop(stranger, photo.id()));
        assertTrue(drop(me, photo.id()));
        assertFalse(drop(me, photo.id()));
        assertEquals(List.of(mine), jdbc.sql("SELECT object_key FROM object_deletion_jobs").query(String.class).list());
        assertEquals(1, store.photos(me).size());
        tx.execute(s -> store.addPhoto(me, third, "https://cdn/" + third, "baikal", "", 2));

        // 탈퇴하면 구슬과 앨범이 함께 사라진다
        claim(day, 3, List.of());
        jdbc.sql("DELETE FROM users WHERE id=?").param(me).update();
        assertEquals(0, jdbc.sql("SELECT count(*) FROM emotion_orbs").query(Integer.class).single());
        assertEquals(0, jdbc.sql("SELECT count(*) FROM map_photos").query(Integer.class).single());
    }
}
