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
import kr.co.shuim.common.SpaceCapacity;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.community.CommunityConsentService;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.points.FireworkTickets;
import org.springframework.core.io.Resource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
 * 함께 쉬는 공간(공용 공간과 소로우 공간)의 방문과 공유 모닥불 API. 방문은 메모리, 모닥불과 구매 효과는 DB에 저장한다.
 * 위치 폴링은 방문 티켓을 쓰고, 장작을 넣을 때는 로그인과 현재 입장 자격도 확인한다.
 */
@RestController
public class BeachController {
    static final String GONE = "바닷가에서 나와 있었어요. 다시 들어와 주세요.";

    private final AuthService auth;
    private final BlockService blocks;
    private final BeachService beach;
    private final CircleService circles;
    private final RoomMusicRecordings recordings;
    /** Null keeps the legacy administrator-only fireworks (tests without a ticket store). */
    private final FireworkTickets tickets;
    // Privacy is immutable after creation. All live visits are admitted here; restart clears both indexes.
    private final Set<String> privateCommunities = ConcurrentHashMap.newKeySet();

    public BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles) {
        this(auth, blocks, beach, circles, null, null);
    }

    BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles, RoomMusicRecordings recordings) {
        this(auth, blocks, beach, circles, recordings, null);
    }

    public BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles, FireworkTickets tickets) {
        this(auth, blocks, beach, circles, null, tickets);
    }

    @Autowired
    BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles, RoomMusicRecordings recordings, FireworkTickets tickets) {
        this.auth = auth;
        this.blocks = blocks;
        this.beach = beach;
        this.circles = circles;
        this.recordings = recordings;
        this.tickets = tickets;
    }

    /**
     * 회원 폭죽(이용권으로 쏘기)은 아직 닫혀 있다: 운영 설정 app.fireworks.members-enabled 가 켜질 때까지 관리자만 쏘고,
     * 회원에게는 발사 버튼·이용권 잔액이 내려가지 않는다. 직접 만든(테스트) 컨트롤러는 열린 상태로 시작한다.
     */
    private boolean memberFireworks = true;

    /** 공용 공간에 들어올 때 확인하는 커뮤니티 이용규칙 동의. 직접 만든(테스트) 컨트롤러는 동의 저장소 없이 시작한다. */
    private CommunityConsentService consent;

    @Autowired(required = false)
    void setConsent(CommunityConsentService consent) { this.consent = consent; }

    @Value("${app.fireworks.members-enabled:false}")
    void setMemberFireworks(boolean enabled) { this.memberFireworks = enabled; }

    /** Registered members launch with tickets (once opened); administrators keep the free control. Without a ticket store only administrators may. */
    private boolean fireworksAllowed(DbUser me) {
        return auth.isAdmin(me) || (memberFireworks && tickets != null && !me.anonymous() && !me.blocked());
    }

    /** { to: 유저 id, kind: "comfort" | "hug" | "wave" } */
    public record Care(String to, String kind) {}
    /** character changes the map's permitted appearance; omitting it preserves the current choice. */
    public record TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care, String character,
                           @JsonDeserialize(using = SequenceDeserializer.class) Long sequence,
                           @JsonDeserialize(using = MomentTextDeserializer.class) String bunkerId) {
        public TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care, String character, Long sequence) {
            this(ticket, x, z, yaw, moving, care, character, sequence, null);
        }
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
                              @JsonDeserialize(using = SequenceDeserializer.class) Long sequence,
                              @JsonDeserialize(using = MomentTextDeserializer.class) String bunkerId) {
        public SuspendBody(String ticket, Double x, Double z, Double yaw, Long sequence) { this(ticket, x, z, yaw, sequence, null); }
    }
    public record BoardBody(@JsonDeserialize(using = MomentTextDeserializer.class) String ticket,
                            @JsonDeserialize(using = MomentTextDeserializer.class) String action,
                            @JsonDeserialize(using = MomentTextDeserializer.class) String tableId,
                            @JsonDeserialize(using = SequenceDeserializer.class) Long cell,
                            @JsonDeserialize(using = SequenceDeserializer.class) Long version) {
    }
    public record BunkerBody(@JsonDeserialize(using = MomentTextDeserializer.class) String ticket,
                             @JsonDeserialize(using = MomentTextDeserializer.class) String action,
                             @JsonDeserialize(using = MomentTextDeserializer.class) String bunkerId,
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
    public record GardenMomentBody(
        @JsonDeserialize(using = MomentTextDeserializer.class) String ticket,
        @JsonDeserialize(using = MomentTextDeserializer.class) String requestId,
        @JsonDeserialize(using = MomentTextDeserializer.class) String kind) {}
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

    /**
     * 방이 속한 공간. 공용 공간은 누구나 들어오고 모든 풍경이 열려 있다.
     * 소로우 공간은 그 소로우의 멤버만 들어오고, 멤버가 늘수록 풍경이 하나씩 열린다 (SpaceMaps).
     */
    record Space(String id, String slug, String name, int capacity, boolean privateTest, boolean shared, CircleService.Circle circle) {
        static final Space PUBLIC = new Space(SpaceMaps.PUBLIC_ID, "", SpaceMaps.PUBLIC_NAME, SpaceCapacity.MAX, false, true, null);
        static Space of(CircleService.Circle circle) {
            return new Space(circle.id(), circle.slug(), circle.name(), circle.spaceCapacity(), circle.privateTest(), false, circle);
        }
        boolean opens(BeachMap map) { return shared || circle.opensMap(map.id()); }
    }

    /** 공용 공간이면 이용이 제한되지 않은 누구나, 소로우 공간이면 그 소로우의 승인된 멤버만. */
    private Space requireSpace(String spaceId, DbUser me) {
        if (spaceId == null || spaceId.isBlank()) throw ApiException.badRequest("함께 쉴 소로우를 골라 주세요.");
        if (me.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        if (SpaceMaps.isPublic(spaceId.strip())) return Space.PUBLIC;
        CircleService.Circle circle = circles.byId(spaceId.strip());
        circles.requireAccess(circle, me);
        if (circles.member(circle.id(), me.id()).filter(CircleService.Member::active).isEmpty()) {
            throw ApiException.forbidden("이 소로우의 멤버만 바닷가에 들어갈 수 있어요.");
        }
        return Space.of(circle);
    }

    /** 소로우 공간의 풍경은 멤버 수에 따라 열린다. 아직 닫힌 풍경은 방도 인원수도 내주지 않는다. */
    private static void requireOpenMap(Space space, BeachMap map) {
        if (space.opens(map)) return;
        throw ApiException.forbidden("이 풍경은 소로우 멤버가 " + SpaceMaps.membersToOpen(map.id()) + "명이 되면 열려요. 지금은 공용 공간에서 만날 수 있어요.");
    }

    /** Public position/rest requests keep the existing ticket-only path without auth/database reads. */
    private DbUser requirePrivateVisit(String ticket, HttpServletRequest req) {
        String communityId = beach.communityIdForTicket(ticket);
        if (communityId == null || !privateCommunities.contains(communityId)) return null;
        DbUser me = req == null ? null : auth.currentUser(req).orElse(null);
        if (me == null || me.anonymous()) throw ApiException.unauthorized("비공개 소로우에 참여한 계정으로 다시 로그인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(ticket, me.id());
        requireSpace(visit.communityId(), me);
        return me;
    }

    /**
     * POST /api/beach/enter { communityId, character?, mapId?: "beach" | "uyuni" | "bamboo" | "garden" | "cloudspa" | "baikal" } → map-scoped ticket, capabilities and state.
     * communityId 가 "public" 이면 공용 공간(이용규칙에 동의한 누구나), 아니면 그 소로우의 승인된 멤버만 들어갈 수 있다.
     * 소로우 공간에서 아직 열리지 않은 풍경은 403, 정원 초과는 409.
     */
    @PostMapping("/api/beach/enter")
    public Map<String, Object> enter(@RequestBody(required = false) EnterBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        Space space = requireSpace(body == null ? null : body.communityId(), me);
        BeachMap map = BeachMap.from(body.mapId());
        requireOpenMap(space, map);
        // 소로우 가입이 이용규칙 동의를 거치듯, 처음 보는 사람들과 만나는 공용 공간도 같은 동의를 먼저 받는다.
        if (space.shared() && consent != null && !consent.accepted(me))
            throw new ApiException(409, "함께 지킬 약속에 동의한 뒤 공용 공간에 들어올 수 있어요.");
        if (space.privateTest()) privateCommunities.add(space.id());
        Set<String> excluded = blocks.excludedIds(me.id());
        BeachRoom.Entry entry = beach.enter(space.id(), me.id(), me.nick(), excluded, body.character(), map.id(), body.resumeTicket(), body.sequence(), space.capacity());
        BeachRoom.Presence p = entry.presence();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ticket", p.ticket());
        out.put("resumed", entry.resumed());
        out.put("selfRest", BeachRoom.RestPresence.of(p));
        out.put("sequence", p.sequence());
        out.put("communityId", space.id());
        out.put("mapId", map.id());
        out.put("community", Map.of("id", space.id(), "slug", space.slug(), "name", space.name()));
        out.put("shared", space.shared());
        out.put("capacity", space.capacity());
        out.put("restEnabled", map.hasStarlight());
        out.put("bedEnabled", map.hasBeds());
        out.put("bunkerEnabled", map == BeachMap.UYUNI && !me.anonymous());
        out.put("pavilionEnabled", map.hasPavilions());
        out.put("benchEnabled", map.hasBeachFacilities());
        out.put("onsenEnabled", map.hasBeachFacilities());
        out.put("fireEnabled", map.hasBeachFacilities());
        out.put("careCapabilities", new BeachRoom.CareCapabilities(true, auth.isAdmin(me)));
        out.put("lightingControl", auth.isAdmin(me));
        out.put("lighting", beach.lighting(space.id(), map.id()));
        out.put("musicControl", auth.isAdmin(me));
        boolean fireworksFree = auth.isAdmin(me);
        out.put("fireworksControl", fireworksAllowed(me));
        out.put("fireworksFree", fireworksFree);
        if (!fireworksFree && fireworksAllowed(me)) out.put("fireworkTickets", tickets.balance(me.id()));
        BeachRoom.FireworksState fireworks = beach.fireworks(space.id(), map.id());
        out.put("fireworks", fireworks.events());
        out.put("fireworksCooldownUntil", fireworks.cooldownUntil());
        BeachUyuniMoments.State moments = beach.uyuniMoments(p.ticket());
        out.put("uyuniMomentsEnabled", map == BeachMap.UYUNI && !me.anonymous());
        out.put("uyuniMoments", moments.events());
        out.put("uyuniMomentCooldowns", moments.cooldowns());
        BeachGardenMoments.State pond = beach.gardenMoments(p.ticket());
        out.put("gardenMomentsEnabled", map == BeachMap.GARDEN && !me.anonymous());
        out.put("gardenMoments", pond.events());
        out.put("gardenMomentCooldowns", pond.cooldowns());
        out.put("me", Map.of("pid", p.pid(), "id", p.userId(), "nick", p.nick(), "skin", p.skin()));
        out.put("spawn", Map.of("x", p.x(), "z", p.z(), "yaw", p.yaw()));
        out.put("bounds", Map.of("minX", map.minX(), "maxX", map.maxX(), "minZ", map.minZ(), "maxZ", map.maxZ()));
        out.put("count", beach.count(space.id(), map.id()));
        BeachFireService.FireView fire = beach.fire(space.id(), map.id());
        out.put("fire", fire);
        BeachRoom.MusicState playback = beach.music(space.id(), map.id());
        out.put("music", playback.music());
        out.put("serverTime", playback.serverTime());
        if (map == BeachMap.BAMBOO) out.put("festival", p.festivalAt(fire.serverTime()));
        return out;
    }

    /**
     * POST /api/beach/tick { ticket, x, z, yaw, moving, care?: { to, kind }, character? }
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
                    requireSpace(visit.communityId(), actor);
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
            Boolean.TRUE.equals(body.moving()), denied ? null : careTo, careKind, body.character(), capabilities != null && capabilities.hug(), body.sequence(), body.bunkerId());
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

    /** POST /api/beach/board: sit at a lodge's game table, place a stone, leave, or start again. */
    @PostMapping("/api/beach/board")
    public BeachBoardGames.View board(@RequestBody(required = false) BoardBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 이용해 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 이용해 주세요.");
        if (body == null) throw ApiException.badRequest("게임 동작을 다시 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        if (body.cell() != null && (body.cell() < 0 || body.cell() > 1024)) throw ApiException.badRequest("둘 자리를 다시 골라 주세요.");
        return beach.board(body.ticket(), me.id(), body.action(), body.tableId(), body.cell() == null ? null : body.cell().intValue(), body.version());
    }

    @PostMapping("/api/beach/bunker")
    public BeachRoom.RestPresence bunker(@RequestBody(required = false) BunkerBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 지하 쉼터를 이용해 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 지하 쉼터를 이용해 주세요.");
        if (body == null) throw ApiException.badRequest("지하 쉼터의 출입을 다시 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        return beach.bunker(body.ticket(), me.id(), body.action(), body.bunkerId(), body.sequence());
    }

    /** POST /api/beach/lighting { ticket, mode: auto|day|sunset|night|rainy-night }. Rain is garden-only. */
    @PostMapping("/api/beach/lighting")
    public BeachRoom.Lighting lighting(@RequestBody(required = false) LightingBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("관리자 계정으로 로그인해 주세요."));
        if (body == null) throw ApiException.badRequest("방의 시간 설정을 다시 골라 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 방의 시간을 바꿀 수 있어요.");
        return beach.setLighting(body.ticket(), me.id(), body.mode());
    }

    @PostMapping("/api/beach/music")
    public BeachRoom.MusicState music(@RequestBody(required = false) MusicBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("관리자 계정으로 로그인해 주세요."));
        if (body == null) throw ApiException.badRequest("재생할 음악을 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        if (!auth.isAdmin(me)) throw ApiException.forbidden("관리자만 방의 음악을 재생하거나 정지할 수 있어요.");
        return beach.changeMusic(body.ticket(), me.id(), body.action(), body.trackId(), body.expectedVersion());
    }

    @GetMapping("/api/beach/music/audio")
    public ResponseEntity<Resource> musicAudio(@RequestParam(required = false) String communityId,
                                               @RequestParam(required = false) String mapId,
                                               @RequestParam(required = false) String trackId,
                                               HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("음악을 들으려면 공간에 다시 들어와 주세요."));
        Space space = requireSpace(communityId, me);
        if (mapId == null) throw ApiException.badRequest("이용할 지도를 다시 골라 주세요.");
        beach.requireMusicListener(space.id(), mapId, me.id());
        RoomMusicTrack selected = RoomMusicTrack.from(trackId);
        // Spring handles byte ranges and conditional GET/HEAD after the same visit check.
        var response = ResponseEntity.ok().contentType(MediaType.valueOf("audio/mpeg"))
            .cacheControl(CacheControl.noCache().cachePrivate())
            .varyBy(HttpHeaders.COOKIE, HttpHeaders.AUTHORIZATION)
            .header(HttpHeaders.ACCEPT_RANGES, "bytes").eTag(selected.sha256);
        if ("HEAD".equals(req.getMethod())) return response.contentLength(selected.bytes).build();
        return response.body(recordings.resource(selected));
    }

    /**
     * POST /api/beach/fireworks { ticket, requestId: UUID, variant? }. A room-wide, retry-safe launch.
     * Administrators launch for free with every style; registered members spend one firework ticket and cannot use the Songi message.
     */
    @PostMapping("/api/beach/fireworks")
    public BeachRoom.FireworkLaunch fireworks(@RequestBody(required = false) FireworksBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 불꽃놀이를 쏠 수 있어요."));
        if (body == null) throw ApiException.badRequest("불꽃놀이 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        String variant = BeachRoom.requireFireworkVariant(body.selectedVariant());
        if (auth.isAdmin(me)) return beach.launchFireworks(body.ticket(), me.id(), body.requestId(), variant);
        if (!memberFireworks) throw ApiException.forbidden("불꽃놀이는 아직 준비 중이에요.");
        if (!fireworksAllowed(me)) throw ApiException.forbidden("가입한 회원만 불꽃놀이를 쏠 수 있어요.");
        if ("songi".equals(variant))
            throw ApiException.forbidden("송이에게 보내는 문구 불꽃은 관리자만 띄울 수 있어요.");
        FireworkTickets.Consumed<BeachRoom.FireworkLaunch> consumed = tickets.consume(me.id(), body.requestId(), visit.communityId(), visit.mapId(), variant,
            () -> beach.launchFireworks(body.ticket(), me.id(), body.requestId(), variant));
        return consumed.result().withTickets(consumed.tickets());
    }

    /** A registered current member can launch only from their own standing Uyuni visit. */
    @PostMapping("/api/beach/moments")
    public BeachUyuniMoments.Launch moment(@RequestBody(required = false) MomentBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 함께 띄워 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 함께 띄워 주세요.");
        if (body == null) throw ApiException.badRequest("함께 띄울 내용을 다시 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        return beach.launchUyuniMoment(body.ticket(), me.id(), body.requestId(), body.kind(), body.letter(), body.color(), body.wish(), blocks.excludedIds(me.id()));
    }

    public record FestivalBody(String ticket, java.util.UUID requestId, String choice) {}

    @PostMapping("/api/beach/garden-moments")
    public BeachGardenMoments.Launch gardenMoment(@RequestBody(required = false) GardenMomentBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인한 뒤 함께 띄워 주세요."));
        if (me.anonymous()) throw ApiException.forbidden("가입한 계정으로 함께 띄워 주세요.");
        if (body == null) throw ApiException.badRequest("연못에 띄울 내용을 다시 확인해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        return beach.launchGardenMoment(body.ticket(), me.id(), body.requestId(), body.kind(), blocks.excludedIds(me.id()));
    }

    @PostMapping("/api/beach/festival")
    public BeachRoom.FestivalChange festival(@RequestBody FestivalBody body, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("대나무숲에 다시 들어와 주세요."));
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
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
            body.z() == null ? Double.NaN : body.z(), body.yaw() == null ? Double.NaN : body.yaw(), body.sequence(), body.bunkerId());
        return Map.of("ok", true);
    }

    public Map<String, Object> count(String communityId, HttpServletRequest req) { return count(communityId, null, req); }

    /** GET /api/beach/count?communityId=...&mapId=beach|uyuni (공용 공간은 누구나, 소로우 공간은 그 멤버만) */
    @GetMapping("/api/beach/count")
    public Map<String, Object> count(@RequestParam(required = false) String communityId,
                                   @RequestParam(required = false) String mapId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 바닷가를 이용해 주세요."));
        Space space = requireSpace(communityId, me);
        BeachMap map = BeachMap.from(mapId);
        requireOpenMap(space, map);
        return Map.of("communityId", space.id(), "mapId", map.id(), "count", beach.count(space.id(), map.id()), "capacity", space.capacity());
    }

    public BeachFireService.FireView fire(String communityId, HttpServletRequest req) { return fire(communityId, null, req); }

    @GetMapping("/api/beach/fire")
    public BeachFireService.FireView fire(@RequestParam(required = false) String communityId,
                                          @RequestParam(required = false) String mapId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 모닥불을 이용해 주세요."));
        Space space = requireSpace(communityId, me);
        return beach.fire(space.id(), mapId);
    }

    @PostMapping("/api/beach/fire/wood")
    public BeachFireService.FireView wood(@RequestBody(required = false) WoodBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        if (body == null) throw ApiException.badRequest("장작 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        return beach.addWood(body.ticket(), me.id(), body.requestId());
    }

    @PostMapping("/api/beach/fire/powder")
    public BeachFireService.FireView powder(@RequestBody(required = false) PowderBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        if (body == null) throw ApiException.badRequest("색가루 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireSpace(visit.communityId(), me);
        return beach.addPowder(body.ticket(), me.id(), body.requestId(), body.color());
    }
}
