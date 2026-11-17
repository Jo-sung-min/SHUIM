package kr.co.shuim.points;

import kr.co.shuim.config.ApiException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/** 이용권을 쓴 요청 번호는 원장에 남아, 다른 사람·다른 방·재시작 뒤에 다시 보내도 새로 쏘지 않는다. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class FireworkTicketReusePostgresTest {
    @Test void aSpentRequestIdOnlyReplaysForTheSameUserAndRoom() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        var jdbc = JdbcClient.create(source);
        String me = UUID.randomUUID().toString(), other = UUID.randomUUID().toString();
        for (String id : new String[] {me, other})
            jdbc.sql("INSERT INTO users (id,nick,is_anonymous) VALUES (?, '이용권 테스트', false)").param(id).update();
        try {
            var tickets = new FireworkTicketService(jdbc, new PointsService(jdbc));
            tickets.grantKakaoSignup(me);
            tickets.grantKakaoSignup(other);
            String requestId = UUID.randomUUID().toString();
            AtomicInteger launches = new AtomicInteger(), replays = new AtomicInteger();

            var first = tickets.consume(me, requestId, "public", "beach", "bloom", launches::incrementAndGet, replays::incrementAndGet);
            assertEquals(4, first.tickets());
            // 같은 사람·같은 방의 재시도는 방의 기억으로만 답하고 다시 차감하지 않는다
            assertEquals(4, tickets.consume(me, requestId, "public", "beach", "bloom", launches::incrementAndGet, replays::incrementAndGet).tickets());
            assertEquals(1, replays.get());
            // 다른 지도, 다른 소로우, 다른 사람은 409 이고 새로 쏘지 않는다
            assertEquals(409, assertThrows(ApiException.class, () -> tickets.consume(me, requestId, "public", "uyuni", "bloom", launches::incrementAndGet, replays::incrementAndGet)).status());
            assertEquals(409, assertThrows(ApiException.class, () -> tickets.consume(me, requestId, "circle-x", "beach", "bloom", launches::incrementAndGet, replays::incrementAndGet)).status());
            assertEquals(409, assertThrows(ApiException.class, () -> tickets.consume(other, requestId, "public", "beach", "bloom", launches::incrementAndGet, replays::incrementAndGet)).status());
            // 재시도 응답을 줄 수 없는 옛 호출은 언제나 409
            assertEquals(409, assertThrows(ApiException.class, () -> tickets.consume(me, requestId, "public", "beach", "bloom", launches::incrementAndGet)).status());
            assertEquals(1, launches.get());
            assertEquals(4, tickets.balance(me));
            assertEquals(5, tickets.balance(other));
        } finally {
            jdbc.sql("DELETE FROM users WHERE id IN (?,?)").param(me).param(other).update();
        }
    }
}
