package kr.co.shuim.beach;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.community.BlockService;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

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

    public BeachController(AuthService auth, BlockService blocks, BeachService beach, CircleService circles) {
        this.auth = auth;
        this.blocks = blocks;
        this.beach = beach;
        this.circles = circles;
    }

    /** { to: 유저 id, kind: "comfort" | "hug" } */
    public record Care(String to, String kind) {}
    /** character 는 남녀 기본 캐릭터를 바꿀 때 선택하며, 생략하면 현재 모습 유지 */
    public record TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care, String character) {
        public TickBody(String ticket, Double x, Double z, Double yaw, Boolean moving, Care care) {
            this(ticket, x, z, yaw, moving, care, null);
        }
    }
    public record TicketBody(String ticket) {}
    public record EnterBody(String communityId, String character) {
        public EnterBody(String communityId) { this(communityId, null); }
    }
    public record WoodBody(String ticket, String requestId) {}
    public record RestBody(String ticket, String action, String spotId) {}

    private CircleService.Circle requireMember(String communityId, DbUser me) {
        if (communityId == null || communityId.isBlank()) throw ApiException.badRequest("함께 쉴 소로우를 골라 주세요.");
        if (me.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        CircleService.Circle circle = circles.byId(communityId.strip());
        if (circles.member(circle.id(), me.id()).filter(CircleService.Member::active).isEmpty()) {
            throw ApiException.forbidden("이 소로우의 멤버만 바닷가에 들어갈 수 있어요.");
        }
        return circle;
    }

    /**
     * POST /api/beach/enter { communityId, character?: "male" | "female" } → { ticket, communityId, community: { id, slug, name }, capacity, me, spawn, bounds, count }
     * 이 소로우의 승인된 멤버만 들어갈 수 있다. 정원 초과는 409.
     */
    @PostMapping("/api/beach/enter")
    public Map<String, Object> enter(@RequestBody(required = false) EnterBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        CircleService.Circle circle = requireMember(body == null ? null : body.communityId(), me);
        Set<String> excluded = blocks.excludedIds(me.id());
        BeachRoom.Presence p = beach.enter(circle.id(), me.id(), me.nick(), excluded, body.character());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ticket", p.ticket());
        out.put("communityId", circle.id());
        out.put("community", Map.of("id", circle.id(), "slug", circle.slug(), "name", circle.name()));
        out.put("capacity", BeachRoom.CAPACITY);
        out.put("restEnabled", true);
        out.put("me", Map.of("pid", p.pid(), "id", p.userId(), "nick", p.nick(), "skin", p.skin()));
        out.put("spawn", Map.of("x", p.x(), "z", p.z(), "yaw", p.yaw()));
        out.put("bounds", Map.of("minX", BeachRoom.MIN_X, "maxX", BeachRoom.MAX_X, "minZ", BeachRoom.MIN_Z, "maxZ", BeachRoom.MAX_Z));
        out.put("count", beach.count(circle.id()));
        BeachFireService.FireView fire = beach.fire(circle.id());
        out.put("fire", fire);
        out.put("serverTime", fire.serverTime());
        return out;
    }

    /**
     * POST /api/beach/tick { ticket, x, z, yaw, moving, care?: { to, kind }, character?: "male" | "female" }
     *   → { players: [{ pid, id, nick, skin, x, z, yaw, moving }], events: [{ kind, fromPid, fromId, fromNick, toPid, toId, toNick, at }],
     *       count, received: { comfort, hug }, care?: "sent" | "cooldown" | "gone" }
     * 방문 티켓으로 위치를 갱신하고 영속 모닥불 상태를 함께 내려준다. 만료 티켓은 410.
     */
    @PostMapping("/api/beach/tick")
    public BeachRoom.TickResult tick(@RequestBody(required = false) TickBody body) {
        if (body == null || body.ticket() == null || body.ticket().isBlank()) throw ApiException.gone(GONE);
        String careTo = body.care() == null ? null : body.care().to();
        String careKind = body.care() == null ? null : body.care().kind();
        BeachRoom.TickResult r = beach.tick(body.ticket(),
            body.x() == null ? Double.NaN : body.x(),
            body.z() == null ? Double.NaN : body.z(),
            body.yaw() == null ? Double.NaN : body.yaw(),
            Boolean.TRUE.equals(body.moving()), careTo, careKind, body.character());
        if (r == null) throw ApiException.gone(GONE);
        return r;
    }

    /** POST /api/beach/rest { ticket, action: "lie" | "stand", spotId?: "starlight" } */
    @PostMapping("/api/beach/rest")
    public BeachRoom.RestPresence rest(@RequestBody(required = false) RestBody body) {
        if (body == null || body.ticket() == null || body.ticket().isBlank()) throw ApiException.gone(GONE);
        return beach.rest(body.ticket(), body.action(), body.spotId());
    }

    /** POST /api/beach/leave { ticket } → { ok: true } (모르는 티켓이어도 ok) */
    @PostMapping("/api/beach/leave")
    public Map<String, Object> leave(@RequestBody(required = false) TicketBody body) {
        if (body != null) beach.leave(body.ticket());
        return Map.of("ok", true);
    }

    /** GET /api/beach/count?communityId=... → { communityId, count, capacity } (해당 소로우 멤버만) */
    @GetMapping("/api/beach/count")
    public Map<String, Object> count(@RequestParam(required = false) String communityId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 바닷가를 이용해 주세요."));
        CircleService.Circle circle = requireMember(communityId, me);
        return Map.of("communityId", circle.id(), "count", beach.count(circle.id()), "capacity", BeachRoom.CAPACITY);
    }

    @GetMapping("/api/beach/fire")
    public BeachFireService.FireView fire(@RequestParam(required = false) String communityId, HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("소로우에 가입한 뒤 모닥불을 이용해 주세요."));
        CircleService.Circle circle = requireMember(communityId, me);
        return beach.fire(circle.id());
    }

    @PostMapping("/api/beach/fire/wood")
    public BeachFireService.FireView wood(@RequestBody(required = false) WoodBody body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        if (body == null) throw ApiException.badRequest("장작 요청을 다시 시도해 주세요.");
        BeachService.Visit visit = beach.requireVisit(body.ticket(), me.id());
        requireMember(visit.communityId(), me);
        return beach.addWood(body.ticket(), me.id(), body.requestId());
    }
}
