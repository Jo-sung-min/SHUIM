package kr.co.shuim.keepsake;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.beach.BeachMap;
import kr.co.shuim.beach.BeachService;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.upload.S3Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 보관함 API: 감정구슬과 맵 앨범 (docs/EMOTION_ORBS.md). 모두 본인 것만 읽고 쓴다.
 * 구슬: 맵 화면이 30초마다 stay 로 머무는 중임을 알리고, 오늘 머문 시간이 차면 화면이 구슬을 띄운다. 줍기(claim)에서
 * 서버가 머문 시간과 하루 한 개를 확인하고, 맵·공간·함께 있던 사람을 방에서 직접 읽어 저장한다 (화면이 보낸 값을 믿지 않는다).
 * 그날의 기분만 화면이 계산해 보낸다: 구슬의 값은 모두 같아서 속일 이유가 없다.
 */
@RestController
public class KeepsakeController {
    private final AuthService auth;
    private final BeachService beach;
    private final CircleService circles;
    private final Keepsakes store;
    private final OrbStays stays;
    private final S3Service s3;
    private final long needMs;
    private final int albumMax;

    @Autowired
    public KeepsakeController(AuthService auth, BeachService beach, CircleService circles, Keepsakes store, OrbStays stays, S3Service s3,
                              @Value("${app.orbs.stay-seconds:600}") long staySeconds, @Value("${app.album.max:100}") int albumMax) {
        this.auth = auth;
        this.beach = beach;
        this.circles = circles;
        this.store = store;
        this.stays = stays;
        this.s3 = s3;
        this.needMs = Math.max(1, staySeconds) * 1000;
        this.albumMax = Math.max(1, albumMax);
    }

    public record StayBody(String ticket) {}
    public record ClaimBody(String ticket, Integer mood, String spotId, String spotName) {}
    public record PhotoBody(String url, String ticket, String mapId) {}

    /** 보관함은 가입한 회원의 것이다. 익명 참여자와 이용이 제한된 계정에는 구슬도 앨범도 없다 */
    private DbUser member(HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 이용해 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 이용해 주세요.");
        if (me.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        return me;
    }

    private static <T> ResponseEntity<T> personal(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private boolean foundToday(String userId, LocalDate today) {
        Boolean known = stays.found(userId);
        if (known != null) return known;
        boolean found = store.foundOn(userId, today);
        stays.remember(userId, found);
        return found;
    }

    private Map<String, Object> today(String userId, long stayMs) {
        LocalDate today = stays.today();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("day", today.toString());
        out.put("stayMs", stayMs);
        out.put("needMs", needMs);
        out.put("found", foundToday(userId, today));
        return out;
    }

    private String spaceName(String spaceId) {
        if (SpaceMaps.isPublic(spaceId)) return SpaceMaps.PUBLIC_NAME;
        try { return clip(circles.byId(spaceId).name(), 80); } catch (ApiException e) { return "소로우"; }
    }

    /** GET /api/orbs → { enabled, today: { day, stayMs, needMs, found }, orbs: [...] } */
    @GetMapping("/api/orbs")
    public ResponseEntity<Map<String, Object>> orbs(HttpServletRequest req) {
        DbUser me = member(req);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", true);
        out.put("today", today(me.id(), stays.stayed(me.id())));
        out.put("orbs", store.orbs(me.id()));
        return personal(out);
    }

    /** POST /api/orbs/stay { ticket } → { day, stayMs, needMs, found }. 내 방문 티켓이 살아 있을 때만 시간이 쌓인다 */
    @PostMapping("/api/orbs/stay")
    public ResponseEntity<Map<String, Object>> stay(@RequestBody(required = false) StayBody body, HttpServletRequest req) {
        DbUser me = member(req);
        beach.requireVisit(body == null ? null : body.ticket(), me.id());
        return personal(today(me.id(), stays.beat(me.id())));
    }

    /** POST /api/orbs/claim { ticket, mood: 1~5, spotId?, spotName? } → 주운 구슬. 아직 덜 머물렀으면 425, 오늘 이미 주웠으면 409 */
    @PostMapping("/api/orbs/claim")
    public ResponseEntity<Keepsakes.Orb> claim(@RequestBody(required = false) ClaimBody body, HttpServletRequest req) {
        DbUser me = member(req);
        if (body == null || body.mood() == null || body.mood() < 1 || body.mood() > 5)
            throw ApiException.badRequest("구슬을 다시 주워 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        // 425: 아직 이르다. 409(오늘 이미 주웠다)와 화면이 구별할 수 있게 한다
        if (stays.stayed(me.id()) < needMs) throw new ApiException(425, "구슬이 아직 여물지 않았어요. 조금 더 머물러 주세요.");
        String spotId = body.spotId() != null && body.spotId().matches("[a-z0-9-]{1,40}") ? body.spotId() : null;
        List<Keepsakes.Companion> beside = beach.companions(body.ticket()).stream()
            .map(c -> new Keepsakes.Companion(c.userId(), clip(c.nick(), 60))).toList();
        Keepsakes.Orb orb;
        try {
            orb = store.claim(me.id(), stays.today(), body.mood(), visit.mapId(), visit.communityId(), spaceName(visit.communityId()),
                spotId, clip(body.spotName(), 40), beside);
        } catch (ApiException e) {
            if (e.status() == 409) stays.remember(me.id(), true);
            throw e;
        }
        stays.remember(me.id(), true);
        return personal(orb);
    }

    /** DELETE /api/orbs/{id}: 내려놓기. 그날 다시 얻을 수는 없다 */
    @DeleteMapping("/api/orbs/{id}")
    public Map<String, Object> removeOrb(@PathVariable long id, HttpServletRequest req) {
        DbUser me = member(req);
        if (!store.removeOrb(me.id(), id)) throw ApiException.notFound("이미 내려놓은 구슬이에요.");
        return Map.of("ok", true);
    }

    /** GET /api/album → { enabled, max, photos: [...] } */
    @GetMapping("/api/album")
    public ResponseEntity<Map<String, Object>> album(HttpServletRequest req) {
        DbUser me = member(req);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", true);
        out.put("max", albumMax);
        out.put("photos", store.photos(me.id()));
        return personal(out);
    }

    /**
     * POST /api/album { url, ticket?, mapId } → 넣은 사진. url 은 내가 방금 올린 사진이어야 한다 (/api/upload/presign).
     * 방문 티켓이 살아 있으면 맵과 공간 이름은 서버가 방문에서 읽고, 아니면 화면이 보낸 맵만 적는다.
     */
    @PostMapping("/api/album")
    public ResponseEntity<Keepsakes.Photo> addPhoto(@RequestBody(required = false) PhotoBody body, HttpServletRequest req) {
        DbUser me = member(req);
        String url = body == null ? null : body.url();
        String key = s3.ownedKeyFromUrl(url, me.id());
        if (key == null || !key.matches(".+\\.(?:jpg|png|webp)") || url.length() > 1200)
            throw ApiException.badRequest("내가 올린 사진만 앨범에 넣을 수 있어요.");
        String mapId, space = "";
        try {
            BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
            mapId = visit.mapId();
            space = spaceName(visit.communityId());
        } catch (ApiException gone) {
            mapId = BeachMap.from(body.mapId()).id();
        }
        return personal(store.addPhoto(me.id(), key, url, mapId, space, albumMax));
    }

    /** DELETE /api/album/{id}: 앨범에서 빼고 사진 파일도 지운다 */
    @DeleteMapping("/api/album/{id}")
    public Map<String, Object> removePhoto(@PathVariable long id, HttpServletRequest req) {
        DbUser me = member(req);
        if (!store.removePhoto(me.id(), id)) throw ApiException.notFound("이미 지운 사진이에요.");
        return Map.of("ok", true);
    }

    /** 화면이 보낸 짧은 이름: 제어 문자를 빼고 길이를 맞춘다 */
    static String clip(String value, int max) {
        if (value == null) return "";
        String clean = value.codePoints().filter(c -> !Character.isISOControl(c))
            .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString().strip();
        return clean.codePointCount(0, clean.length()) <= max ? clean : clean.substring(0, clean.offsetByCodePoints(0, max)).strip();
    }
}
