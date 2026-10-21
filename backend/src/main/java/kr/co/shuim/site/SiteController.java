package kr.co.shuim.site;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Map;

/** 사이트 설정 API. 읽기는 공개(프론트 generateMetadata 가 서버에서 부른다), 쓰기는 관리자만 */
@RestController
public class SiteController {
    private final AuthService auth;
    private final SiteSettingsService site;

    public SiteController(AuthService auth, SiteSettingsService site) {
        this.auth = auth;
        this.site = site;
    }

    /** GET /api/site → { title?, description?, faviconAt?, ogAt? } (없는 값은 빠진다 = 기본값) */
    @GetMapping("/api/site")
    public ResponseEntity<Map<String, Object>> get() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic()).body(site.summary());
    }

    /** PUT /api/site { title?, description?, favicon?: dataUrl|null, og?: dataUrl|null } — 보낸 키만 바꾼다. null 이면 기본값으로 */
    @PutMapping("/api/site")
    public Map<String, Object> update(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElse(null);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 바꿀 수 있어요");
        Map<String, Object> b = body == null ? Map.of() : body;
        if (b.containsKey("title")) site.setText("title", str(b.get("title")));
        if (b.containsKey("description")) site.setText("description", str(b.get("description")));
        if (b.containsKey("favicon")) site.setImage("favicon", str(b.get("favicon")));
        if (b.containsKey("og")) site.setImage("og", str(b.get("og")));
        return site.summary();
    }

    /** GET /api/site/favicon — 관리자가 올린 파비콘 바이트 (없으면 404 → 프론트는 /favicon.svg 를 쓴다) */
    @GetMapping("/api/site/favicon")
    public ResponseEntity<byte[]> favicon() { return image("favicon"); }

    /** GET /api/site/og — 관리자가 올린 공유(OG) 이미지 */
    @GetMapping("/api/site/og")
    public ResponseEntity<byte[]> og() { return image("og"); }

    private ResponseEntity<byte[]> image(String kind) {
        SiteSettingsService.Image img = site.image(kind).orElseThrow(() -> ApiException.notFound("not found"));
        // 주소에 ?v=<updatedAt> 이 붙어 바뀌면 다른 주소가 되므로 오래 캐시해도 된다
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(img.type()))
            .cacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
            .body(img.bytes());
    }

    private static String str(Object o) { return o instanceof String s ? s : null; }
}
