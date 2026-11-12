package kr.co.shuim.sponsor;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.FireworkTicketService;
import kr.co.shuim.points.PointsPolicy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.LongSupplier;

/**
 * 후원 기업·PC 양옆 배너·멋져요·꾸미기 액자. 공개 조회는 게시 중인 것만, 관리자 조회는 전부.
 * 멋져요는 이용권 지갑 → 기업 행 순서로 잠가 하루 한도와 남은 폭죽을 함께 지킨다.
 */
@Service
public class SponsorService {
    public record Contact(String email, String priceLabel) {}
    public record Image(String type, byte[] bytes) {}
    public record PublicBanner(String id, String title, String tagline, String linkUrl, Long imageAt, int position) {}
    public record PublicSponsor(String id, String name, String tagline, String linkUrl, Long logoAt, long amountWon,
                                int fireworksTotal, int fireworksGiven, int remaining, int cheers, int rank, SponsorPolicy.Frame frame) {}
    public record CheerResult(int tickets, PublicSponsor sponsor, int cheersLeftToday) {}
    public record Contribution(String id, long amountWon, int fireworks, String note, long createdAt) {}
    public record AdminBanner(String id, String title, String tagline, String linkUrl, Long imageAt, int position, long startsAt, long endsAt,
                              boolean published, String sponsorId, long clicks, String status, long createdAt, long updatedAt) {}
    public record AdminSponsor(String id, String name, String tagline, String linkUrl, Long logoAt, long amountWon, int fireworksTotal,
                               int fireworksGiven, int remaining, int cheers, boolean published, int position, long createdAt, long updatedAt,
                               List<Contribution> contributions, SponsorPolicy.Frame frame, Long studioKeyAt) {}
    /** 이미지 변경: change=false 면 유지, dataUrl=null 이면 삭제 */
    public record ImageChange(boolean change, String dataUrl) {
        public static final ImageChange KEEP = new ImageChange(false, null);
        public static ImageChange of(boolean present, String dataUrl) { return present ? new ImageChange(true, dataUrl) : KEEP; }
    }
    public record BannerInput(String title, String tagline, String linkUrl, int position, long startsAt, long endsAt, boolean published, String sponsorId, ImageChange image) {}
    /** frame=null 이면 액자는 그대로 둔다 */
    public record SponsorInput(String name, String tagline, String linkUrl, boolean published, int position, ImageChange logo, SponsorPolicy.Frame frame) {}
    /** 꾸미기 화면에 보이는 내 기업 카드. rank 0 = 아직 공개 전 */
    public record StudioSponsor(String id, String name, String tagline, Long logoAt, long amountWon, int rank, SponsorPolicy.Frame frame) {}
    /** 발급 직후에만 키 원문을 돌려준다 (DB 에는 해시만) */
    public record StudioKey(String key, long issuedAt, AdminSponsor sponsor) {}

    private final JdbcClient jdbc;
    private final FireworkTicketService tickets;
    private final LongSupplier clock;

    @Autowired
    public SponsorService(JdbcClient jdbc, FireworkTicketService tickets) { this(jdbc, tickets, System::currentTimeMillis); }
    SponsorService(JdbcClient jdbc, FireworkTicketService tickets, LongSupplier clock) { this.jdbc = jdbc; this.tickets = tickets; this.clock = clock; }

    /* ---------- 공개 ---------- */

    public List<PublicBanner> liveBanners() {
        long now = clock.getAsLong();
        return jdbc.sql("SELECT id,title,tagline,link_url,image_at,position FROM sponsor_banners WHERE published AND starts_at<=? AND ends_at>? ORDER BY position,created_at,id LIMIT ?")
            // The client splits by position parity; keep a few spares so one side cannot starve the other.
            .param(now).param(now).param(SponsorPolicy.SLOTS_PER_SIDE * 6)
            .query((rs, i) -> new PublicBanner(rs.getString("id"), rs.getString("title"), rs.getString("tagline"), rs.getString("link_url"),
                nullableLong(rs, "image_at"), rs.getInt("position"))).list();
    }

    public Optional<Image> bannerImage(String id) {
        UUID key = parse(id);
        if (key == null) return Optional.empty();
        return jdbc.sql("SELECT image_type,image_data FROM sponsor_banners WHERE id=? AND image_data IS NOT NULL").param(key)
            .query((rs, i) -> new Image(rs.getString("image_type"), Base64.getDecoder().decode(rs.getString("image_data")))).optional();
    }

    @Transactional
    public void recordClick(String id) {
        UUID key = parse(id);
        if (key == null) return;
        long now = clock.getAsLong();
        jdbc.sql("""
            INSERT INTO sponsor_banner_clicks(banner_id,day,count) SELECT id,?,1 FROM sponsor_banners WHERE id=? AND published AND starts_at<=? AND ends_at>?
            ON CONFLICT (banner_id,day) DO UPDATE SET count=sponsor_banner_clicks.count+1
            """).param(PointsPolicy.day(now)).param(key).param(now).param(now).update();
    }

    public List<PublicSponsor> publicSponsors() {
        return jdbc.sql(PUBLIC_SPONSORS + " ORDER BY rank").query(this::publicSponsorRow).list();
    }

    public Optional<Image> sponsorLogo(String id) {
        UUID key = parse(id);
        if (key == null) return Optional.empty();
        return jdbc.sql("SELECT logo_type,logo_data FROM sponsors WHERE id=? AND logo_data IS NOT NULL").param(key)
            .query((rs, i) -> new Image(rs.getString("logo_type"), Base64.getDecoder().decode(rs.getString("logo_data")))).optional();
    }

    public Contact contact() {
        String email = setting("sponsor.contact_email"), price = setting("sponsor.banner_price");
        return new Contact(email == null ? SponsorPolicy.DEFAULT_CONTACT_EMAIL : email, price == null ? SponsorPolicy.DEFAULT_PRICE_LABEL : price);
    }

    /** 멋져요 한 번 = 기업의 남은 폭죽 1개가 내 이용권 1장. 기업당 하루 1번, 하루 DAILY_CHEERS 장. */
    @Transactional
    public CheerResult cheer(DbUser user, String sponsorId) {
        tickets.requireEligible(user);
        UUID key = parse(sponsorId);
        if (key == null) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        long now = clock.getAsLong();
        LocalDate day = PointsPolicy.day(now);
        int balance = tickets.lock(user.id(), now);
        record Locked(boolean published, int remaining) {}
        Locked sponsor = jdbc.sql("SELECT published,fireworks_total-fireworks_given AS remaining FROM sponsors WHERE id=? FOR UPDATE").param(key)
            .query((rs, i) -> new Locked(rs.getBoolean("published"), rs.getInt("remaining"))).optional()
            .orElseThrow(() -> ApiException.notFound("후원 기업을 찾을 수 없어요."));
        if (!sponsor.published()) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        if (sponsor.remaining() <= 0) throw new ApiException(409, "이 기업이 준비한 폭죽이 모두 전해졌어요.");
        int today = jdbc.sql("SELECT count(*) FROM sponsor_cheers WHERE user_id=? AND cheered_on=?").param(user.id()).param(day).query(Integer.class).single();
        if (today >= SponsorPolicy.DAILY_CHEERS) throw new ApiException(429, "오늘 받을 수 있는 폭죽 이용권을 모두 받았어요. 내일 다시 멋져요를 보내 주세요.");
        int inserted = jdbc.sql("INSERT INTO sponsor_cheers(id,sponsor_id,user_id,cheered_on,created_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING")
            .param(UUID.randomUUID()).param(key).param(user.id()).param(day).param(now).update();
        if (inserted == 0) throw new ApiException(409, "오늘은 이미 이 기업에 멋져요를 보냈어요.");
        jdbc.sql("UPDATE sponsors SET fireworks_given=fireworks_given+1,updated_at=? WHERE id=?").param(now).param(key).update();
        int after = tickets.grant(user.id(), "cheer:" + key + ":" + user.id() + ":" + day, key.toString(), balance, now);
        PublicSponsor view = jdbc.sql(PUBLIC_SPONSORS + " ORDER BY rank").query(this::publicSponsorRow).list().stream()
            .filter(s -> s.id().equals(key.toString())).findFirst().orElseThrow(() -> ApiException.notFound("후원 기업을 찾을 수 없어요."));
        return new CheerResult(after, view, SponsorPolicy.DAILY_CHEERS - today - 1);
    }

    /* ---------- 꾸미기 링크 (로그인 없이, 키를 가진 기업 담당자) ---------- */

    public StudioSponsor studio(String key) {
        String hash = SponsorPolicy.studioKeyHash(key);
        if (hash == null) throw studioNotFound();
        return jdbc.sql(STUDIO_SPONSOR).param(hash).query(this::studioRow).optional().orElseThrow(SponsorService::studioNotFound);
    }

    /** 링크로는 액자만 바꾼다. 이름·로고·링크 주소는 관리자만. */
    @Transactional
    public StudioSponsor decorate(String key, SponsorPolicy.Frame frame) {
        String hash = SponsorPolicy.studioKeyHash(key);
        if (hash == null || jdbc.sql("UPDATE sponsors SET frame_style=?,frame_color=?,frame_deco=?,updated_at=? WHERE studio_key_hash=?")
            .param(frame.style()).param(frame.color()).param(frame.deco()).param(clock.getAsLong()).param(hash).update() == 0) throw studioNotFound();
        return studio(key);
    }

    /* ---------- 관리자 ---------- */

    public List<AdminBanner> adminBanners() {
        long now = clock.getAsLong();
        return jdbc.sql(ADMIN_BANNER + " ORDER BY position,created_at,id").query((rs, i) -> adminBanner(rs, now)).list();
    }

    @Transactional
    public AdminBanner createBanner(BannerInput input) {
        long now = clock.getAsLong();
        UUID id = UUID.randomUUID();
        validateBanner(input);
        jdbc.sql("INSERT INTO sponsor_banners(id,title,tagline,link_url,position,starts_at,ends_at,published,sponsor_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?::uuid,?,?)")
            .param(id).param(input.title()).param(input.tagline()).param(input.linkUrl()).param(input.position()).param(input.startsAt()).param(input.endsAt())
            .param(input.published()).param(input.sponsorId()).param(now).param(now).update();
        applyImage("sponsor_banners", "image", id, input.image(), now);
        return adminBanner(id).orElseThrow();
    }

    @Transactional
    public AdminBanner updateBanner(String bannerId, BannerInput input) {
        UUID id = parse(bannerId);
        if (id == null || adminBanner(id).isEmpty()) throw ApiException.notFound("배너를 찾을 수 없어요.");
        long now = clock.getAsLong();
        validateBanner(input);
        jdbc.sql("UPDATE sponsor_banners SET title=?,tagline=?,link_url=?,position=?,starts_at=?,ends_at=?,published=?,sponsor_id=?::uuid,updated_at=? WHERE id=?")
            .param(input.title()).param(input.tagline()).param(input.linkUrl()).param(input.position()).param(input.startsAt()).param(input.endsAt())
            .param(input.published()).param(input.sponsorId()).param(now).param(id).update();
        applyImage("sponsor_banners", "image", id, input.image(), now);
        return adminBanner(id).orElseThrow();
    }

    @Transactional
    public void deleteBanner(String bannerId) {
        UUID id = parse(bannerId);
        if (id == null || jdbc.sql("DELETE FROM sponsor_banners WHERE id=?").param(id).update() == 0) throw ApiException.notFound("배너를 찾을 수 없어요.");
    }

    public List<AdminSponsor> adminSponsors() {
        return jdbc.sql(ADMIN_SPONSOR + " ORDER BY s.position,s.created_at,s.id").query(this::adminSponsorRow).list();
    }

    @Transactional
    public AdminSponsor createSponsor(SponsorInput input, Long firstAmountWon, String note, String adminId) {
        long now = clock.getAsLong();
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO sponsors(id,name,tagline,link_url,published,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
            .param(id).param(input.name()).param(input.tagline()).param(input.linkUrl()).param(input.published()).param(input.position()).param(now).param(now).update();
        applyImage("sponsors", "logo", id, input.logo(), now);
        applyFrame(id, input.frame(), now);
        if (firstAmountWon != null) contribute(id, firstAmountWon, note, adminId, now);
        return adminSponsor(id).orElseThrow();
    }

    @Transactional
    public AdminSponsor updateSponsor(String sponsorId, SponsorInput input) {
        UUID id = parse(sponsorId);
        if (id == null || adminSponsor(id).isEmpty()) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        long now = clock.getAsLong();
        jdbc.sql("UPDATE sponsors SET name=?,tagline=?,link_url=?,published=?,position=?,updated_at=? WHERE id=?")
            .param(input.name()).param(input.tagline()).param(input.linkUrl()).param(input.published()).param(input.position()).param(now).param(id).update();
        applyImage("sponsors", "logo", id, input.logo(), now);
        applyFrame(id, input.frame(), now);
        return adminSponsor(id).orElseThrow();
    }

    @Transactional
    public void deleteSponsor(String sponsorId) {
        UUID id = parse(sponsorId);
        if (id == null || jdbc.sql("DELETE FROM sponsors WHERE id=?").param(id).update() == 0) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
    }

    /** 꾸미기 링크 발급. 다시 발급하면 옛 링크는 열리지 않는다. */
    @Transactional
    public StudioKey issueStudioKey(String sponsorId) {
        UUID id = parse(sponsorId);
        String key = SponsorPolicy.newStudioKey();
        long now = clock.getAsLong();
        if (id == null || jdbc.sql("UPDATE sponsors SET studio_key_hash=?,studio_key_at=?,updated_at=? WHERE id=?")
            .param(SponsorPolicy.studioKeyHash(key)).param(now).param(now).param(id).update() == 0) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        return new StudioKey(key, now, adminSponsor(id).orElseThrow());
    }

    @Transactional
    public AdminSponsor revokeStudioKey(String sponsorId) {
        UUID id = parse(sponsorId);
        if (id == null || jdbc.sql("UPDATE sponsors SET studio_key_hash=NULL,studio_key_at=NULL,updated_at=? WHERE id=?")
            .param(clock.getAsLong()).param(id).update() == 0) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        return adminSponsor(id).orElseThrow();
    }

    /** 후원액을 더하면 1,000원마다 폭죽 1개가 충전된다. 내역은 남고 고칠 수 없다. */
    @Transactional
    public AdminSponsor contribute(String sponsorId, long amountWon, String note, String adminId) {
        UUID id = parse(sponsorId);
        if (id == null || adminSponsor(id).isEmpty()) throw ApiException.notFound("후원 기업을 찾을 수 없어요.");
        contribute(id, amountWon, note, adminId, clock.getAsLong());
        return adminSponsor(id).orElseThrow();
    }

    private void contribute(UUID id, long amountWon, String note, String adminId, long now) {
        int fireworks = SponsorPolicy.fireworksFor(amountWon);
        jdbc.sql("SELECT id FROM sponsors WHERE id=? FOR UPDATE").param(id).query(UUID.class).single();
        jdbc.sql("INSERT INTO sponsor_contributions(id,sponsor_id,amount_won,fireworks,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)")
            .param(UUID.randomUUID()).param(id).param(amountWon).param(fireworks).param(SponsorPolicy.note(note)).param(adminId).param(now).update();
        jdbc.sql("UPDATE sponsors SET amount_won=amount_won+?,fireworks_total=fireworks_total+?,updated_at=? WHERE id=?")
            .param(amountWon).param(fireworks).param(now).param(id).update();
    }

    @Transactional
    public Contact updateContact(String email, String priceLabel) {
        upsert("sponsor.contact_email", SponsorPolicy.email(email));
        upsert("sponsor.banner_price", SponsorPolicy.priceLabel(priceLabel));
        return contact();
    }

    /* ---------- 내부 ---------- */

    private static final String PUBLIC_SPONSORS = """
        SELECT id,name,tagline,link_url,logo_at,amount_won,fireworks_total,fireworks_given,fireworks_total-fireworks_given AS remaining,
               frame_style,frame_color,frame_deco,
               row_number() OVER (ORDER BY amount_won DESC,fireworks_given DESC,created_at,id) AS rank
        FROM sponsors WHERE published
        """;
    private static final String STUDIO_SPONSOR = """
        SELECT s.id,s.name,s.tagline,s.logo_at,s.amount_won,s.frame_style,s.frame_color,s.frame_deco,
               COALESCE((SELECT r.rank FROM (%s) r WHERE r.id=s.id),0) AS rank
        FROM sponsors s WHERE s.studio_key_hash=?
        """.formatted(PUBLIC_SPONSORS);
    private static final String ADMIN_BANNER = """
        SELECT b.*,(SELECT COALESCE(sum(c.count),0) FROM sponsor_banner_clicks c WHERE c.banner_id=b.id) AS clicks FROM sponsor_banners b
        """;
    private static final String ADMIN_SPONSOR = "SELECT s.*,s.fireworks_total-s.fireworks_given AS remaining FROM sponsors s";

    private PublicSponsor publicSponsorRow(ResultSet rs, int i) throws SQLException {
        return new PublicSponsor(rs.getString("id"), rs.getString("name"), rs.getString("tagline"), rs.getString("link_url"), nullableLong(rs, "logo_at"),
            rs.getLong("amount_won"), rs.getInt("fireworks_total"), rs.getInt("fireworks_given"), rs.getInt("remaining"), rs.getInt("fireworks_given"), rs.getInt("rank"), frame(rs));
    }

    private StudioSponsor studioRow(ResultSet rs, int i) throws SQLException {
        return new StudioSponsor(rs.getString("id"), rs.getString("name"), rs.getString("tagline"), nullableLong(rs, "logo_at"),
            rs.getLong("amount_won"), rs.getInt("rank"), frame(rs));
    }

    private static SponsorPolicy.Frame frame(ResultSet rs) throws SQLException {
        return SponsorPolicy.frameOrDefault(rs.getString("frame_style"), rs.getString("frame_color"), rs.getString("frame_deco"));
    }

    private static ApiException studioNotFound() { return ApiException.notFound("꾸미기 링크가 맞지 않아요. 새 링크를 받아 주세요."); }

    private AdminBanner adminBanner(ResultSet rs, long now) throws SQLException {
        boolean published = rs.getBoolean("published");
        long startsAt = rs.getLong("starts_at"), endsAt = rs.getLong("ends_at");
        return new AdminBanner(rs.getString("id"), rs.getString("title"), rs.getString("tagline"), rs.getString("link_url"), nullableLong(rs, "image_at"),
            rs.getInt("position"), startsAt, endsAt, published, rs.getString("sponsor_id"), rs.getLong("clicks"),
            SponsorPolicy.status(published, startsAt, endsAt, now), rs.getLong("created_at"), rs.getLong("updated_at"));
    }

    private Optional<AdminBanner> adminBanner(UUID id) {
        long now = clock.getAsLong();
        return jdbc.sql(ADMIN_BANNER + " WHERE b.id=?").param(id).query((rs, i) -> adminBanner(rs, now)).optional();
    }

    private AdminSponsor adminSponsorRow(ResultSet rs, int i) throws SQLException {
        String id = rs.getString("id");
        List<Contribution> contributions = jdbc.sql("SELECT id,amount_won,fireworks,note,created_at FROM sponsor_contributions WHERE sponsor_id=? ORDER BY created_at DESC,id")
            .param(UUID.fromString(id)).query((r, j) -> new Contribution(r.getString("id"), r.getLong("amount_won"), r.getInt("fireworks"), r.getString("note"), r.getLong("created_at"))).list();
        return new AdminSponsor(id, rs.getString("name"), rs.getString("tagline"), rs.getString("link_url"), nullableLong(rs, "logo_at"), rs.getLong("amount_won"),
            rs.getInt("fireworks_total"), rs.getInt("fireworks_given"), rs.getInt("remaining"), rs.getInt("fireworks_given"), rs.getBoolean("published"),
            rs.getInt("position"), rs.getLong("created_at"), rs.getLong("updated_at"), contributions, frame(rs), nullableLong(rs, "studio_key_at"));
    }

    private Optional<AdminSponsor> adminSponsor(UUID id) {
        return jdbc.sql(ADMIN_SPONSOR + " WHERE s.id=?").param(id).query(this::adminSponsorRow).optional();
    }

    private void validateBanner(BannerInput input) {
        SponsorPolicy.period(input.startsAt(), input.endsAt());
        if (input.sponsorId() != null) {
            UUID sponsor = parse(input.sponsorId());
            if (sponsor == null || adminSponsor(sponsor).isEmpty()) throw ApiException.badRequest("연결할 후원 기업을 다시 골라 주세요.");
        }
    }

    private void applyFrame(UUID id, SponsorPolicy.Frame frame, long now) {
        if (frame == null) return;
        jdbc.sql("UPDATE sponsors SET frame_style=?,frame_color=?,frame_deco=?,updated_at=? WHERE id=?")
            .param(frame.style()).param(frame.color()).param(frame.deco()).param(now).param(id).update();
    }

    private void applyImage(String table, String column, UUID id, ImageChange change, long now) {
        if (change == null || !change.change()) return;
        if (change.dataUrl() == null || change.dataUrl().isBlank()) {
            jdbc.sql("UPDATE " + table + " SET " + column + "_type=NULL," + column + "_data=NULL," + column + "_at=NULL,updated_at=? WHERE id=?").param(now).param(id).update();
            return;
        }
        SponsorPolicy.Image image = SponsorPolicy.decodeImage(change.dataUrl());
        jdbc.sql("UPDATE " + table + " SET " + column + "_type=?," + column + "_data=?," + column + "_at=?,updated_at=? WHERE id=?")
            .param(image.type()).param(image.base64()).param(now).param(now).param(id).update();
    }

    private String setting(String key) {
        return jdbc.sql("SELECT value FROM site_settings WHERE key=?").param(key).query(String.class).optional().orElse(null);
    }

    private void upsert(String key, String value) {
        jdbc.sql("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at")
            .param(key).param(value).param(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC)).update();
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    static UUID parse(String id) {
        if (id == null || id.length() != 36) return null;
        try { return UUID.fromString(id); } catch (IllegalArgumentException e) { return null; }
    }
}
