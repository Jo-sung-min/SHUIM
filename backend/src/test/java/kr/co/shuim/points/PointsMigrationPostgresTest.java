package kr.co.shuim.points;

import kr.co.shuim.auth.DbUser;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Runs the pre-launch migration in a separate disposable schema, preserving other test fixtures. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class PointsMigrationPostgresTest {
    @Test void launchConsumesExistingThresholdsWithoutBackpayingHistoricalCheers() {
        String schema="points_baseline_"+UUID.randomUUID().toString().replace("-","");
        var source=new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL")+"?currentSchema="+schema,"sorow_test","");
        var jdbc=JdbcClient.create(source);
        try {
            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target("24").load().migrate();
            String author=UUID.randomUUID().toString(),feed=UUID.randomUUID().toString();
            jdbc.sql("INSERT INTO users(id,nick,is_anonymous) VALUES (?,'기존 작성자',FALSE)").param(author).update();
            jdbc.sql("INSERT INTO feed_posts(id,author_id,text) VALUES (?,?,'기존 피드')").param(feed).param(author).update();
            for(int i=0;i<30;i++) {
                String voter=UUID.randomUUID().toString();
                jdbc.sql("INSERT INTO users(id,nick,is_anonymous) VALUES (?,'기존 회원',FALSE)").param(voter).update();
                jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id) VALUES (?,'feed',?)").param(voter).param(feed).update();
            }
            Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
            assertEquals(3L,jdbc.sql("SELECT count(*) FROM point_cheer_checkpoints WHERE target_id=?").param(feed).query(Long.class).single());
            assertEquals(0L,jdbc.sql("SELECT count(*) FROM point_ledger").query(Long.class).single());
            var tx=new TransactionTemplate(new DataSourceTransactionManager(source));
            var points=new PointsService(jdbc);
            String voter=UUID.randomUUID().toString();
            jdbc.sql("INSERT INTO users(id,nick,is_anonymous) VALUES (?,'새 회원',FALSE)").param(voter).update();
            tx.executeWithoutResult(status->{
                jdbc.sql("INSERT INTO cheers(user_id,target_kind,target_id) VALUES (?,'feed',?)").param(voter).param(feed).update();
                points.cheerAdded("feed",feed,voter);
            });
            var user=new DbUser(author,null,"기존 작성자","user",false,null,null,0);
            assertEquals(0,tx.execute(status->points.me(user)).balance());
        } finally {
            // The schema name is generated here, never supplied by a caller.
            var admin=JdbcClient.create(new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"),"sorow_test",""));
            admin.sql("DROP SCHEMA IF EXISTS "+schema+" CASCADE").update();
        }
    }
}
