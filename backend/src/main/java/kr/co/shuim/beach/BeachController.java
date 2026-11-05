package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.TextNode;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.springframework.core.io.Resource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 소로우 바닷가의 방문과 공유 모닥불 API. 방문은 메모리, 모닥불과 구매 효과는 DB에 저장한다.
 * 위치 폴링은 방문 티켓을 쓰고, 장작을 넣을 때는 로그인과 현재 멤버 자격도 확인한다.
 */
@RestController
public class BeachController {
    static final String GONE = "바닷가에서 나와 있었어요. 다시 들어와 주세요.";

    private final AuthService auth;
    private final BlockService blocks;
    private final BeachService beach;
    private final CircleService circles;
    private final RoomMusicRecordings recordings;
    // Privacy is immutable after creation. All live visits are admitted here; restart clears both indexes.
    private final Set<String> privateCommunities = ConcurrentHashMap.newKeySet();

    public BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles) {
        this(auth, blocks, beach, circles, null);
    }

    @Autowired
    BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles, RoomMusicRecordings recordings) {
        this.auth = auth;
        this.blocks = blocks;
        this.beach = beach;
        this.circles = circles;
        this.recordings = recordings;
    }

    /** { to: 유저 id, kind: "comfort" | "hug" | "wave" } */
    public record Care(String to, String kind) {}
    /** character 는 3D·픽셀 남녀 캐릭터를 바꿀 때 선택하며, 생략하면 현재 모습 유지 */
    public record TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care, String character,
                           @JsonDeserialize(using = SequenceDeserializer.class) Long sequence) {
        public TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care, String character) {
            this(ticket, x, z, yaw, moving, care, character, null);
        }
        public TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care) {
            this(ticket, x, z, yaw, moving, care, null);
        }
    }
    public record TicketBody(String ticket) {}
    public record EnterBody(String communityId, String character, String mapId, String resumeTicket,
                            @JsonDeserialize(using = SequenceDeserializer.class) Long sequence) {
        public EnterBody(String communityId, String character, String mapId) { this(communityId, character, mapId, null, null); }
        public EnterBody(String communityId, String character, String mapId, String resumeTicket) { this(communityId, character, mapId, resumeTicket, null); }
        public EnterBody(String communityId) { this(communityId, null, null); }
        public EnterBody(String communityId, String character) { this(communityId, character, null); }
    }
    public record SuspendBody(String ticket, Double x, Double z, Double yaw,
                              @JsonDeserialize(using = SequenceDeserializer.class) Long sequence) {}
    /** Jackson's default Long coercion truncates decimals, which would undermine request ordering. */
    public static final class SequenceDeserializer extends StdDeserializer<Long> {
        public SequenceDeserializer() { super(Long.class); }
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT))
                return (Long) context.handleUnexpectedToken(Long.class, parser);
            long value = parser.getLongValue();
            BeachRoom.validateSequence(value);
            return value;
        }
    }
    public record WoodBody(String ticket, String requestId) {}
    public record PowderBody(String ticket, String requestId, String color) {}
    public record RestBody(String ticket, String action, String spotId) {}
    public record LightingBody(String ticket, String mode) {}
    public record MusicBody(String ticket, String action, String trackId,
                            @JsonDeserialize(using = SequenceDeserializer.class) Long expectedVersion) {}
    public record MomentBody(
        @JsonDeserialize(using = MomentTextDeserializer.class) String ticket,
        @JsonDeserialize(using = MomentTextDeserializer.class) String requestId,
        @JsonDeserialize(using = MomentTextDeserializer.class) String kind,
        @JsonDeserialize(using = MomentTextDeserializer.class) String letter,
        @JsonDeserialize(using = MomentTextDeserializer.class) String color,
        @JsonDeserialize(using = MomentTextDeserializer.class) String wish) {}
    /** Wishes and variants are text; JSON numbers/booleans must not be silently coerced. */
    public static final class MomentTextDeserializer extends StdDeserializer<String> {
        public MomentTextDeserializer() { super(String.class); }
        @Override public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_STRING)) return (String) context.handleUnexpectedToken(String.class, parser);
            return parser.getText();
        }
    }
    public record FireworksBody(String ticket, String requestId, JsonNode variant) {
        public FireworksBody(String ticket, String requestId) { this(ticket, requestId, (JsonNode) null); }
        public FireworksBody(String ticket, String requestId, String variant) {
            this(ticket, requestId, variant == null ? null : TextNode.valueOf(variant));
        }
        String selectedVariant() {
            // Absent means the legacy festival preset; explicit null and non-strings are malformed.
            if (variant == null) return null;
            if (!variant.isTextual()) throw ApiException.badRequest("불꽃놀이 종류를 다시 골라 주세요.");
            return variant.textValue();
        }
    }

    private CircleService.Circle requireMember(String communityId, DbUser me) {
        if (communityId == null || communityId.isBlank()) throw ApiException.badRequest("함께 쉴 소로우를 골라 주세요.");
        if (me.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        CircleService.Circle circle = circles.byId(communityId.strip());
        circles.requireAccess(circle, me);
        if (circles.member(circle.id(), me.id()).filter(CircleService.Member::active).isEmpty()) {
            throw ApiException.forbidden("이 소로우의 멤버만 바닷가에 들어갈 수 있어요.");
        }
        return circle;
    }

    /** Public position/rest requests keep the existing ticket-only path without auth/database reads. */
    private DbUser requirePrivateVisit(String ticket, HttpServletRequest req) {
        String communityId = beach.communityIdForTicket(ticket);
        if (communityId == null || !privateCommunities.contains(communityId)) return null;
        DbUser me = req == null ? null : auth.currentUser(req).orElse(null);
        if (me == null || me.anonymous()) throw ApiException.unauthorized("비공개 소로우에 참여한 계정으로 다시 로그인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(ticket, me.id());
        requireMember(visit.communityId(), me);
        return me;
    }

    /**
     * POST /api/beach/enter { communityId, character?, mapId?: "beach" | "uyuni" } → map-scoped ticket, capabilities and state.
     * 이 소로우의 승인된 멤버만 들어갈 수 있다. 정원 초과는 409.
     */
    @PostMapping("/api/beach/enter")
    public Map<String, Object> enter(@RequestBody(required = false) EnterBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        CircleService.Circle circle = requireMember(body == null ? null : body.communityId(), me);
        if (circle.privateTest()) privateCommunities.add(circle.id());
        BeachMap map = BeachMap.from(body.mapId());
        Set<String> excluded = blocks.excludedIds(me.id());
        BeachRoom.Entry entry = beach.enter(circle.id(), me.id(), me.nick(), excluded, body.character(), map.id(), body.resumeTicket(), body.sequence(), circle.spaceCapacity());
        BeachRoom.Presence p = entry.presence();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ticket", p.ticket());
        out.put("resumed", entry.resumed());
        out.put("selfRest", BeachRoom.RestPresence.of(p));
        out.put("sequence", p.sequence());
        out.put("communityId", circle.id());
        out.put("mapId", map.id());
        out.put("community", Map.of("id", circle.id(), "slug", circle.slug(), "name", circle.name()));
        out.put("capacity", circle.spaceCapacity());
        out.put("restEnabled", map.hasStarlight());
        out.put("bedEnabled", map.hasBeds());
        out.put("pavilionEnabled", map.hasPavilions());
        out.put("benchEnabled", map.hasBeachFacilities());
        out.put("onsenEnabled", map.hasBeachFacilities());
        out.put("fireEnabled", map.hasBeachFacilities());
        out.put("careCapabilities", new BeachRoom.CareCapabilities(true, auth.isAdmin(me)));
        out.put("lightingControl", auth.isAdmin(me));
        out.put("lighting", beach.lighting(circle.id(), map.id()));
        out.put("musicControl", auth.isAdmin(me));
        out.put("fireworksControl", auth.isAdmin(me));
        BeachRoom.FireworksState fireworks = beach.fireworks(circle.id(), map.id());
        out.put("fireworks", fireworks.events());
        out.put("fireworksCooldownUntil", fireworks.cooldownUntil());
        BeachUyuniMoments.State moments = beach.uyuniMoments(p.ticket());
        out.put("uyuniMomentsEnabled", map == BeachMap.UYUNI && !me.anonymous());
        out.put("uyuniMoments", moments.events());
        out.put("uyuniMomentCooldowns", moments.cooldowns());
        out.put("me", Map.of("pid", p.pid(), "id", p.userId(), "nick", p.nick(), "skin", p.skin()));
        out.put("spawn", Map.of("x", p.x(), "z", p.z(), "yaw", p.yaw()));
        out.put("bounds", Map.of("minX", map.minX(), "maxX", map.maxX(), "minZ", map.minZ(), "maxZ", map.maxZ()));
        out.put("count", beach.count(circle.id(), map.id()));
        BeachFireService.FireView fire = beach.fire(circle.id(), map.id());
        out.put("fire", fire);
        BeachRoom.MusicState playback = beach.music(circle.id(), map.id());
        out.put("music", playback.music());
        out.put("serverTime", playback.serverTime());
        if (map == BeachMap.BAMBOO) out.put("festival", p.festivalAt(fire.serverTime()));
        return out;
    }

    /**
     * POST /api/beach/tick { ticket, x, z, yaw, moving, care?: { to, kind }, character?: "male" | "female" | "pixel-male" | "female-3d" }
     *   → { players: [{ pid, id, nick, skin, x, z, yaw, moving }], events: [{ kind, fromPid, fromId, fromNick, toPid, toId, toNick, at }],
     *       count, received: { comfort, hug, wave }, care?: "sent" | "cooldown" | "gone" | "forbidden", careCapabilities?: { wave, hug } }
     * 방문 티켓으로 위치를 갱신하고 영속 모닥불 상태를 함께 내려준다. 만료 티켓은 410.
     */
    @PostMapping("/api/beach/tick")
    public BeachRoom.TickResult tick(@RequestBody(required = false) TickBody body, HttpServletRequest req) {
        if (body == null || body.ticket() == null || body.ticket().isBlank()) throw ApiException.gone(GONE);
        DbUser privateActor = requirePrivateVisit(body.ticket(), req);
        String careTo = body.care() == null ? null : body.care().to();
        String careKind = body.care() == null ? null : body.care().kind();
        BeachRoom.CareCapabilities capabilities = null;
        boolean denied = false;
        if (body.care() != null) {
            // Read the current session role, never a client flag or the role at entry.
            // Ordinary position polls retain the existing credential-ticket flow without a database lookup.
            DbUser actor = privateActor != null ? privateActor : auth.currentUser(req).orElse(null);
            boolean ownedMember = privateActor != null;
            if (actor != null && !ownedMember) {
                try {
                    BeachService.Visit visit = beach.requireVisit(body.ticket(), actor.id());
                    requireMember(visit.communityId(), actor);
                    ownedMember = true;
                } catch (ApiException e) {
                    if (e.status() != 403) throw e;
                }
            }
            capabilities = new BeachRoom.CareCapabilities(ownedMember, ownedMember && auth.isAdmin(actor));
            denied = !ownedMember || ("hug".equals(careKind) && !capabilities.hug());
        }
        BeachRoom.TickResult r = beach.tick(body.ticket(),
            body.x() == null ? Double.NaN : body.x(),
            body.z() == null ? Double.NaN : body.z(),
            body.yaw() == null ? Double.NaN : body.yaw(),
            Boolean.TRUE.equals(body.moving()), denied ? null : careTo, careKind, body.character(), capabilities != null && capabilities.hug(), body.sequence());
        if (r == null) throw ApiException.gone(GONE);
        return capabilities == null ? r : r.withCareCapabilities(capabilities, denied);
    }

    /** POST /api/beach/rest: lie on the map's starlight/hut/hotel spots, sit, or stand. Ticket scopes the visit. */
    public BeachRoom.RestPresence rest(RestBody body) { return rest(body, null); }

    @PostMapping("/api/beach/rest")
    public BeachRoom.RestPresence rest(@RequestBody(required = false) RestBody body, HttpServletRequest req) {
        if (body == null || body.ticket() == null || body.ticket().isBlank()) throw ApiException.gone(GONE);
        requirePrivateVisit(body.ticket(), req);
        return beach.rest(body.ticket(), body.action(), body.spotId());
    }

    /** POST /api/beach/lighting { ticket, mode: auto|day|sunset|night }. Shared by this visit's room. */
    @PostMapping("/api/beach/lighting")
    public BeachRoom.Lighting lighting(@RequestBody(required = false) LightingBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("관리자 계정으로 로그인해 주세요."));
        if (body == null) throw ApiException.badRequest("바닷가 시간 설정을 다시 골라 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 바닷가 시간을 바꿀 수 있어요.");
        return beach.setLighting(body.ticket(), me.id(), body.mode());
    }

    @PostMapping("/api/beach/music")
    public BeachRoom.MusicState music(@RequestBody(required = false) MusicBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("관리자 계정으로 로그인해 주세요."));
        if (body == null) throw ApiException.badRequest("재생할 음악을 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 방의 음악을 재생하거나 정지할 수 있어요.");
        return beach.changeMusic(body.ticket(), me.id(), body.action(), body.trackId(), body.expectedVersion());
    }

    @GetMapping("/api/beach/music/audio")
    public ResponseEntity<Resource> musicAudio(@RequestParam(required = false) String communityId,
                                               @RequestParam(required = false) String mapId,
                                               @RequestParam(required = false) String trackId,
                                               HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("음악을 들으려면 공간에 다시 들어와 주세요."));
        CircleService.Circle circle = requireMember(communityId, me);
        if (mapId == null) throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
        beach.requireMusicListener(circle.id(), mapId, me.id());
        RoomMusicTrack selected = RoomMusicTrack.from(trackId);
        // Spring handles byte ranges and conditional GET/HEAD after the same visit check.
        var response = ResponseEntity.ok().contentType(MediaType.valueOf("audio/mp4"))
            .cacheControl(CacheControl.noCache().cachePrivate())
            .varyBy(HttpHeaders.COOKIE, HttpHeaders.AUTHORIZATION)
            .header(HttpHeaders.ACCEPT_RANGES, "bytes").eTag(selected.id);
        if ("HEAD".equals(req.getMethod())) return response.contentLength(selected.bytes).build();
        return response.body(recordings.resource(selected));
    }

    /** POST /api/beach/fireworks { ticket, requestId: UUID, variant? }. A room-wide, retry-safe administrator action. */
    @PostMapping("/api/beach/fireworks")
    public BeachRoom.FireworkLaunch fireworks(@RequestBody(required = false) FireworksBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("관리자 계정으로 로그인해 주세요."));
        if (body == null) throw ApiException.badRequest("불꽃놀이 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 불꽃놀이를 시작할 수 있어요.");
        return beach.launchFireworks(body.ticket(), me.id(), body.requestId(), body.selectedVariant());
    }

    /** A registered current member can launch only from their own standing Uyuni visit. */
    @PostMapping("/api/beach/moments")
    public BeachUyuniMoments.Launch moment(@RequestBody(required = false) MomentBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 함께 띄워 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 함께 띄워 주세요.");
        if (body == null) throw ApiException.badRequest("함께 띄울 내용을 다시 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        return beach.launchUyuniMoment(body.ticket(), me.id(), body.requestId(), body.kind(), body.letter(), body.color(), body.wish(), blocks.excludedIds(me.id()));
    }

    public record FestivalBody(String ticket, java.util.UUID requestId, String choice) {}

    @PostMapping("/api/beach/festival")
    public BeachRoom.FestivalChange festival(@RequestBody FestivalBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("대나무숲에 다시 들어와 주세요."));
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        return beach.changeFestival(body.ticket(), me.id(), body.requestId(), body.choice());
    }

    /** POST /api/beach/leave { ticket } → { ok: true } (모르는 티켓이어도 ok) */
    @PostMapping("/api/beach/leave")
    public Map<String, Object> leave(@RequestBody(required = false) TicketBody body) {
        if (body != null) beach.leave(body.ticket());
        return Map.of("ok", true);
    }

    /** Best-effort hidden-page beacon. Reentry authenticates again; this only stops its ticket. */
    @PostMapping("/api/beach/suspend")
    public Map<String, Object> suspend(@RequestBody(required = false) SuspendBody body) {
        if (body != null) beach.suspend(body.ticket(), body.x() == null ? Double.NaN : body.x(),
            body.z() == null ? Double.NaN : body.z(), body.yaw() == null ? Double.NaN : body.yaw(), body.sequence());
        return Map.of("ok", true);
    }

    public Map<String, Object> count(String communityId, HttpServletRequest req) { return count(communityId, null, req); }

    /** GET /api/beach/count?communityId=...&mapId=beach|uyuni (해당 소로우 멤버만) */
    @GetMapping("/api/beach/count")
    public Map<String, Object> count(@RequestParam(required = false) String communityId,
                                   @RequestParam(required = false) String mapId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 바닷가를 이용해 주세요."));
        CircleService.Circle circle = requireMember(communityId, me);
        BeachMap map = BeachMap.from(mapId);
        return Map.of("communityId", circle.id(), "mapId", map.id(), "count", beach.count(circle.id(), map.id()), "capacity", circle.spaceCapacity());
    }

    public BeachFireService.FireView fire(String communityId, HttpServletRequest req) { return fire(communityId, null, req); }

    @GetMapping("/api/beach/fire")
    public BeachFireService.FireView fire(@RequestParam(required = false) String communityId,
                                          @RequestParam(required = false) String mapId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 모닥불을 이용해 주세요."));
        CircleService.Circle circle = requireMember(communityId, me);
        return beach.fire(circle.id(), mapId);
    }

    @PostMapping("/api/beach/fire/wood")
    public BeachFireService.FireView wood(@RequestBody(required = false) WoodBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        if (body == null) throw ApiException.badRequest("장작 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        return beach.addWood(body.ticket(), me.id(), body.requestId());
    }

    @PostMapping("/api/beach/fire/powder")
    public BeachFireService.FireView powder(@RequestBody(required = false) PowderBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        if (body == null) throw ApiException.badRequest("색가루 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        return beach.addPowder(body.ticket(), me.id(), body.requestId(), body.color());
    }
}
