package kr.co.shuim.sponsor;

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

/** Only an explicitly supplied disposable local database is allowed. Never reads DB_URL. */
@EnabledIfEnvironmentVariable(named="SOROW_TEST_DATABASE_URL", matches="jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
class SponsorFramesPostgresTest {
    private static JdbcClient jdbc;
    private SponsorService sponsors;
    private final List<String> created = new ArrayList<>();

    @BeforeAll static void database() {
        var source = new DriverManagerDataSource(System.getenv("SOROW_TEST_DATABASE_URL"), "sorow_test", "");
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = JdbcClient.create(source);
    }
    @BeforeEach void setup() { sponsors = new SponsorService(jdbc, new FireworkTicketService(jdbc, new PointsService(jdbc)), () -> 5_000L); }
    @AfterEach void cleanup() { for (String id : created) jdbc.sql("DELETE FROM sponsors WHERE id=?").param(UUID.fromString(id)).update(); }

    private SponsorService.AdminSponsor sponsor(String name, boolean published, Long amountWon, SponsorPolicy.Frame frame) {
        var input = new SponsorService.SponsorInput(name, "", null, published, 0, SponsorService.ImageChange.KEEP, frame);
        var saved = sponsors.createSponsor(input, amountWon, null, null);
        created.add(saved.id());
        return saved;
    }
    private SponsorService.PublicSponsor shown(String id) {
        return sponsors.publicSponsors().stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow();
    }
    private static int status(Runnable action) { return assertThrows(ApiException.class, action::run).status(); }

    @Test void sponsorsStartInTheDefaultFrameWithNoStudioLink() {
        var plain = sponsor("기본 액자", true, 1_000_000L, null);
        assertEquals(SponsorPolicy.Frame.DEFAULT, plain.frame());
        assertNull(plain.studioKeyAt());
        assertEquals(SponsorPolicy.Frame.DEFAULT, shown(plain.id()).frame());

        var framed = sponsor("금박 액자", true, 2_000_000L, new SponsorPolicy.Frame("gold", "gold", "star"));
        assertEquals(new SponsorPolicy.Frame("gold", "gold", "star"), shown(framed.id()).frame());
    }

    @Test void administratorsChangeOrKeepTheFrameOnUpdate() {
        var saved = sponsor("관리자 액자", true, 1_000_000L, new SponsorPolicy.Frame("wood", "green", "leaf"));
        var kept = sponsors.updateSponsor(saved.id(), new SponsorService.SponsorInput("관리자 액자 2", "", null, true, 0, SponsorService.ImageChange.KEEP, null));
        assertEquals("관리자 액자 2", kept.name());
        assertEquals(new SponsorPolicy.Frame("wood", "green", "leaf"), kept.frame());
        var changed = sponsors.updateSponsor(saved.id(), new SponsorService.SponsorInput("관리자 액자 2", "", null, true, 0, SponsorService.ImageChange.KEEP, new SponsorPolicy.Frame("ink", "ink", "none")));
        assertEquals(new SponsorPolicy.Frame("ink", "ink", "none"), changed.frame());
    }

    @Test void theStudioLinkOpensAndDecoratesOnlyItsOwnSponsor() {
        var mine = sponsor("꾸미는 기업", true, 3_000_000L, null);
        var other = sponsor("다른 기업", true, 1_000_000L, null);
        var issued = sponsors.issueStudioKey(mine.id());
        assertEquals(5_000L, issued.issuedAt());
        assertEquals(5_000L, issued.sponsor().studioKeyAt());
        // 키 원문은 DB 에 없다
        String stored = jdbc.sql("SELECT studio_key_hash FROM sponsors WHERE id=?").param(UUID.fromString(mine.id())).query(String.class).single();
        assertEquals(SponsorPolicy.studioKeyHash(issued.key()), stored);
        assertNotEquals(issued.key(), stored);

        var card = sponsors.studio(issued.key());
        assertEquals(mine.id(), card.id());
        assertEquals("꾸미는 기업", card.name());
        assertEquals(3_000_000L, card.amountWon());
        assertEquals(shown(mine.id()).rank(), card.rank());
        assertTrue(card.rank() > 0);

        var saved = sponsors.decorate(issued.key(), new SponsorPolicy.Frame("aurora", "pink", "sparkle"));
        assertEquals(new SponsorPolicy.Frame("aurora", "pink", "sparkle"), saved.frame());
        assertEquals(new SponsorPolicy.Frame("aurora", "pink", "sparkle"), shown(mine.id()).frame());
        assertEquals(SponsorPolicy.Frame.DEFAULT, shown(other.id()).frame());
        // 액자만 바뀐다
        assertEquals("꾸미는 기업", shown(mine.id()).name());
        assertEquals(3_000_000L, shown(mine.id()).amountWon());
    }

    @Test void reissuingOrRevokingClosesTheOldLink() {
        var mine = sponsor("링크 다시 받기", true, 1_000_000L, null);
        String first = sponsors.issueStudioKey(mine.id()).key();
        String second = sponsors.issueStudioKey(mine.id()).key();
        assertNotEquals(first, second);
        assertEquals(404, status(() -> sponsors.studio(first)));
        assertEquals(404, status(() -> sponsors.decorate(first, new SponsorPolicy.Frame("neon", "teal", "none"))));
        assertEquals(mine.id(), sponsors.studio(second).id());

        assertNull(sponsors.revokeStudioKey(mine.id()).studioKeyAt());
        assertEquals(404, status(() -> sponsors.studio(second)));
        assertEquals(404, status(() -> sponsors.decorate(second, new SponsorPolicy.Frame("neon", "teal", "none"))));
        assertEquals(SponsorPolicy.Frame.DEFAULT, shown(mine.id()).frame());
    }

    @Test void malformedOrUnknownKeysNeverMatch() {
        sponsor("링크 없는 기업", true, 1_000_000L, null);
        assertEquals(404, status(() -> sponsors.studio(null)));
        assertEquals(404, status(() -> sponsors.studio("")));
        assertEquals(404, status(() -> sponsors.studio("%")));
        assertEquals(404, status(() -> sponsors.studio(SponsorPolicy.newStudioKey())));
        assertEquals(404, status(() -> sponsors.issueStudioKey("not-a-uuid")));
        assertEquals(404, status(() -> sponsors.issueStudioKey(UUID.randomUUID().toString())));
        assertEquals(404, status(() -> sponsors.revokeStudioKey(UUID.randomUUID().toString())));
    }

    @Test void anUnpublishedSponsorCanDecorateBeforeGoingPublic() {
        var hidden = sponsor("공개 전 기업", false, 1_000_000L, null);
        String key = sponsors.issueStudioKey(hidden.id()).key();
        assertEquals(0, sponsors.studio(key).rank());
        assertEquals(new SponsorPolicy.Frame("stamp", "coral", "ribbon"), sponsors.decorate(key, new SponsorPolicy.Frame("stamp", "coral", "ribbon")).frame());
        assertTrue(sponsors.publicSponsors().stream().noneMatch(s -> s.id().equals(hidden.id())));
    }

    @Test void theFrameNeverChangesTheRanking() {
        var top = sponsor("순위 1", true, 90_000_000L, null);
        var mid = sponsor("순위 2", true, 80_000_000L, new SponsorPolicy.Frame("gold", "gold", "star"));
        var low = sponsor("순위 3", true, 70_000_000L, new SponsorPolicy.Frame("aurora", "pink", "sparkle"));
        assertTrue(shown(top.id()).rank() < shown(mid.id()).rank());
        assertTrue(shown(mid.id()).rank() < shown(low.id()).rank());
        sponsors.updateSponsor(low.id(), new SponsorService.SponsorInput("순위 3", "", null, true, 0, SponsorService.ImageChange.KEEP, new SponsorPolicy.Frame("neon", "teal", "flame")));
        assertTrue(shown(mid.id()).rank() < shown(low.id()).rank());
    }

    @Test void aFrameValueDroppedFromTheListsFallsBackOnRead() {
        var legacy = sponsor("옛 액자", true, 1_000_000L, null);
        jdbc.sql("UPDATE sponsors SET frame_style='retired',frame_color='teal',frame_deco='gone' WHERE id=?").param(UUID.fromString(legacy.id())).update();
        assertEquals(new SponsorPolicy.Frame("glass", "teal", "none"), shown(legacy.id()).frame());
    }
}
