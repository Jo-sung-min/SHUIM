package kr.co.shuim.sponsor;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.FireworkTicketService;
import kr.co.shuim.points.PointsService;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** 멋져요 보상(기업이 산 폭죽)은 회원 폭죽이 열려 있고, 가입하고 하루가 지난 계정에만, 계정별 한도 안에서 준다. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class SponsorCheerPostgresTest {
    private static JdbcClient jdbc;
    private SponsorService sponsors;
    private final List<String> sponsorIds = new ArrayList<>();
    private final List<String> userIds = new ArrayList<>();

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
    }
    @BeforeEach void setup() { sponsors = new SponsorService(jdbc, new FireworkTicketService(jdbc, new PointsService(jdbc)), System::currentTimeMillis); }
    @AfterEach void cleanup() {
        for (String id : sponsorIds) jdbc.sql("DELETE FROM sponsors WHERE id=?").param(UUID.fromString(id)).update();
        for (String id : userIds) jdbc.sql("DELETE FROM users WHERE id=?").param(id).update();
    }

    private String sponsor(String name) {
        var input = new SponsorService.SponsorInput(name, "", null, true, 0, SponsorService.ImageChange.KEEP, null);
        String id = sponsors.createSponsor(input, 10_000L, null, null).id();
        sponsorIds.add(id);
        return id;
    }

    private DbUser member(String registeredAgo) {
        String id = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users (id,nick,is_anonymous,registered_at) VALUES (?, '멋져요 테스트', false, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - CAST(? AS INTERVAL))")
            .param(id).param(registeredAgo).update();
        userIds.add(id);
        return new DbUser(id, null, "멋져요 테스트", "user", false, null, null, 0);
    }

    private int given(String sponsorId) {
        return jdbc.sql("SELECT fireworks_given FROM sponsors WHERE id=?").param(UUID.fromString(sponsorId)).query(Integer.class).single();
    }

    @Test void closedMemberFireworksGiveNoRewardAndKeepTheSponsorStock() {
        String id = sponsor("닫힌 폭죽 기업");
        sponsors.setMemberFireworks(false);
        assertEquals(403, assertThrows(ApiException.class, () -> sponsors.cheer(member("3 days"), id)).status());
        assertEquals(0, given(id));
    }

    @Test void freshAccountsWaitADayAndOlderAccountsAreCappedPerMonth() {
        String a = sponsor("첫째 기업"), b = sponsor("둘째 기업");
        assertEquals(403, assertThrows(ApiException.class, () -> sponsors.cheer(member("1 hour"), a)).status());
        assertEquals(0, given(a));

        DbUser old = member("3 days");
        assertEquals(1, sponsors.cheer(old, a).tickets());
        assertEquals(1, given(a));

        sponsors.setMonthlyCheers(1);
        assertEquals(429, assertThrows(ApiException.class, () -> sponsors.cheer(old, b)).status());
        assertEquals(0, given(b));
    }
}
