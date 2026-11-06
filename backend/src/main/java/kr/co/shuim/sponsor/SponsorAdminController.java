package kr.co.shuim.sponsor;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 관리자: 배너·후원 기업 CRUD, 후원액 충전, 안내 설정. 모두 no-store. */
@RestController
public class SponsorAdminController {
    private final AuthService auth;
    private final SponsorService sponsors;

    public SponsorAdminController(AuthService auth, SponsorService sponsors) { this.auth = auth; this.sponsors = sponsors; }

    private DbUser requireAdmin(HttpServletRequest request) {
        DbUser me = auth.currentUser(request).orElse(null);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 후원 설정을 볼 수 있어요.");
        return me;
    }

    private static <T> ResponseEntity<T> fresh(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }

    @GetMapping("/api/admin/sponsors/banners")
    public ResponseEntity<Map<String, Object>> banners(HttpServletRequest request) {
        requireAdmin(request);
        return fresh(Map.of("banners", sponsors.adminBanners()));
    }

    @PostMapping("/api/admin/sponsors/banners")
    public ResponseEntity<Map<String, Object>> createBanner(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        return fresh(Map.of("banner", sponsors.createBanner(bannerInput(body))));
    }

    @PutMapping("/api/admin/sponsors/banners/{id}")
    public ResponseEntity<Map<String, Object>> updateBanner(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        return fresh(Map.of("banner", sponsors.updateBanner(id, bannerInput(body))));
    }

    @DeleteMapping("/api/admin/sponsors/banners/{id}")
    public ResponseEntity<Map<String, Object>> deleteBanner(@PathVariable String id, HttpServletRequest request) {
        requireAdmin(request);
        sponsors.deleteBanner(id);
        return fresh(Map.of("deleted", true));
    }

    @GetMapping("/api/admin/sponsors")
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        requireAdmin(request);
        return fresh(Map.of("sponsors", sponsors.adminSponsors()));
    }

    @PostMapping("/api/admin/sponsors")
    public ResponseEntity<Map<String, Object>> createSponsor(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        DbUser me = requireAdmin(request);
        Map<String, Object> b = body == null ? Map.of() : body;
        Long amount = b.get("amountWon") == null ? null : lng(b.get("amountWon"), "후원 금액");
        return fresh(Map.of("sponsor", sponsors.createSponsor(sponsorInput(b), amount, str(b.get("note")), me.id())));
    }

    @PutMapping("/api/admin/sponsors/{id}")
    public ResponseEntity<Map<String, Object>> updateSponsor(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        return fresh(Map.of("sponsor", sponsors.updateSponsor(id, sponsorInput(body == null ? Map.of() : body))));
    }

    @DeleteMapping("/api/admin/sponsors/{id}")
    public ResponseEntity<Map<String, Object>> deleteSponsor(@PathVariable String id, HttpServletRequest request) {
        requireAdmin(request);
        sponsors.deleteSponsor(id);
        return fresh(Map.of("deleted", true));
    }

    /** POST /api/admin/sponsors/{id}/contributions { amountWon, note? } → 1,000원마다 폭죽 1개 충전 */
    @PostMapping("/api/admin/sponsors/{id}/contributions")
    public ResponseEntity<Map<String, Object>> contribute(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        DbUser me = requireAdmin(request);
        Map<String, Object> b = body == null ? Map.of() : body;
        return fresh(Map.of("sponsor", sponsors.contribute(id, lng(b.get("amountWon"), "후원 금액"), str(b.get("note")), me.id())));
    }

    @GetMapping("/api/admin/sponsors/settings")
    public ResponseEntity<Map<String, Object>> settings(HttpServletRequest request) {
        requireAdmin(request);
        return fresh(settings(sponsors.contact()));
    }

    @PutMapping("/api/admin/sponsors/settings")
    public ResponseEntity<Map<String, Object>> updateSettings(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest request) {
        requireAdmin(request);
        Map<String, Object> b = body == null ? Map.of() : body;
        return fresh(settings(sponsors.updateContact(str(b.get("contactEmail")), str(b.get("priceLabel")))));
    }

    private static Map<String, Object> settings(SponsorService.Contact contact) {
        return Map.of("contactEmail", contact.email(), "priceLabel", contact.priceLabel());
    }

    static SponsorService.BannerInput bannerInput(Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        return new SponsorService.BannerInput(
            SponsorPolicy.text(str(b.get("title")), SponsorPolicy.NAME_MAX, "제목은", true),
            SponsorPolicy.tagline(str(b.get("tagline"))),
            SponsorPolicy.link(str(b.get("linkUrl")), true),
            position(b.get("position")),
            lng(b.get("startsAt"), "게시 시작 시각"),
            lng(b.get("endsAt"), "게시 종료 시각"),
            bool(b.get("published"), true),
            blankToNull(str(b.get("sponsorId"))),
            SponsorService.ImageChange.of(b.containsKey("image"), str(b.get("image"))));
    }

    static SponsorService.SponsorInput sponsorInput(Map<String, Object> b) {
        return new SponsorService.SponsorInput(
            SponsorPolicy.name(str(b.get("name"))),
            SponsorPolicy.tagline(str(b.get("tagline"))),
            SponsorPolicy.link(str(b.get("linkUrl")), false),
            bool(b.get("published"), true),
            position(b.get("position")),
            SponsorService.ImageChange.of(b.containsKey("logo"), str(b.get("logo"))));
    }

    private static String str(Object o) { return o instanceof String s ? s : null; }
    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.strip(); }
    private static boolean bool(Object o, boolean fallback) { return o instanceof Boolean b ? b : fallback; }
    private static int position(Object o) {
        if (o == null) return 0;
        if (!(o instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue()) || n.longValue() < 0 || n.longValue() > 1_000) throw ApiException.badRequest("노출 순서는 0 이상의 정수로 넣어 주세요.");
        return n.intValue();
    }
    private static long lng(Object o, String label) {
        if (!(o instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue()) || n.longValue() < 0) throw ApiException.badRequest(label + "을 다시 확인해 주세요.");
        return n.longValue();
    }
}
