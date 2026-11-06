package kr.co.shuim.sponsor;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** 공개 조회(배너·후원 기업 순위·이미지)와 회원의 멋져요. */
@RestController
public class SponsorController {
    private final AuthService auth;
    private final SponsorService sponsors;

    public SponsorController(AuthService auth, SponsorService sponsors) { this.auth = auth; this.sponsors = sponsors; }

    /** GET /api/sponsors/banners → 게시 중인 배너(position 순)와 "+" 카드 안내용 연락처 */
    @GetMapping("/api/sponsors/banners")
    public ResponseEntity<Map<String, Object>> banners() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("banners", sponsors.liveBanners());
        out.put("contact", sponsors.contact());
        out.put("slotsPerSide", SponsorPolicy.SLOTS_PER_SIDE);
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(out);
    }

    @GetMapping("/api/sponsors/banners/{id}/image")
    public ResponseEntity<byte[]> bannerImage(@PathVariable String id) { return image(sponsors.bannerImage(id)); }

    /** POST /api/sponsors/banners/{id}/click → 204. 참고용 하루 카운터, 누가 눌렀는지는 남기지 않는다. */
    @PostMapping("/api/sponsors/banners/{id}/click")
    public ResponseEntity<Void> click(@PathVariable String id) {
        sponsors.recordClick(id);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    /** GET /api/sponsors → 공개 후원 기업 순위(누적 후원액↓·멋져요↓) */
    @GetMapping("/api/sponsors")
    public ResponseEntity<Map<String, Object>> list() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sponsors", sponsors.publicSponsors());
        out.put("contact", sponsors.contact());
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(out);
    }

    @GetMapping("/api/sponsors/{id}/logo")
    public ResponseEntity<byte[]> logo(@PathVariable String id) { return image(sponsors.sponsorLogo(id)); }

    /** POST /api/sponsors/{id}/cheer → { tickets, sponsor, cheersLeftToday }. 가입 회원만. */
    @PostMapping("/api/sponsors/{id}/cheer")
    public ResponseEntity<SponsorService.CheerResult> cheer(@PathVariable String id, HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 멋져요를 보낼 수 있어요."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(sponsors.cheer(user, id));
    }

    private static ResponseEntity<byte[]> image(Optional<SponsorService.Image> image) {
        SponsorService.Image img = image.orElseThrow(() -> ApiException.notFound("not found"));
        // 주소에 ?v=<updatedAt> 이 붙어 바뀌면 다른 주소가 되므로 오래 캐시해도 된다
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(img.type()))
            .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic()).body(img.bytes());
    }
}
