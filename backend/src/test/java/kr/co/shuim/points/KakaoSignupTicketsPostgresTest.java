package kr.co.shuim.points;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** Only an explicitly supplied disposable local database is allowed. Never reads DB_URL. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class KakaoSignupTicketsPostgresTest {
    private static JdbcClient jdbc;
    private static TransactionTemplate tx;
    private FireworkTicketService tickets;
    private String user;

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source); tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }
    @BeforeEach void setup() {
        tickets = new FireworkTicketService(jdbc, new PointsService(jdbc), () -> 1_000L);
        user = UUID.randomUUID().toString();
        jdbc.sql("INSERT INTO users(id,nick) VALUES (?,?)").param(user).param("t" + user.substring(0, 8)).update();
    }
    @AfterEach void cleanup() { jdbc.sql("DELETE FROM users WHERE id=?").param(user).update(); }

    private int grant() { return tx.execute(s -> tickets.grantKakaoSignup(user)); }

    @Test void grantsFiveTicketsInOneLedgerRow() {
        assertEquals(5, grant());
        assertEquals(5, tickets.balance(user));
        var row = jdbc.sql("SELECT reason,amount,balance_after FROM firework_ticket_ledger WHERE user_id=?").param(user).query().singleRow();
        assertEquals("kakao_signup", row.get("reason"));
        assertEquals(5, row.get("amount"));
        assertEquals(5, row.get("balance_after"));
    }

    @Test void grantsOnlyOncePerAccount() {
        grant();
        assertEquals(5, grant());
        assertEquals(5, tickets.balance(user));
        assertEquals(1L, jdbc.sql("SELECT count(*) FROM firework_ticket_ledger WHERE user_id=?").param(user).query(Long.class).single());
    }

    @Test void addsToAnExistingBalance() {
        tx.executeWithoutResult(s -> { tickets.lock(user, 1_000L); jdbc.sql("UPDATE firework_ticket_wallets SET balance=2 WHERE user_id=?").param(user).update(); });
        assertEquals(7, grant());
    }
}
