package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/beach/guestbook")
public class BambooGuestbookController {
    private final BambooGuestbook store;
    private final AuthService auth;
    private final BeachService beach;
    private final CircleService circles;

    public BambooGuestbookController(BambooGuestbook store, AuthService auth, BeachService beach, CircleService circles) {
        this.store = store; this.auth = auth; this.beach = beach; this.circles = circles;
    }

    private record Reader(String community, DbUser user) {}
    private Reader reader(String ticket, HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("다시 로그인해 주세요."));
        if (user.blocked()) throw ApiException.forbidden("이용이 제한된 계정이에요.");
        var visit = beach.requireVisit(ticket, user.id());
        if (!BeachMap.BAMBOO.id().equals(visit.mapId())) throw ApiException.forbidden("대나무숲에서 방명록을 열어 주세요.");
        // 공용 공간의 방명록은 그 방에 들어와 있는 누구나, 소로우 공간의 방명록은 지금도 멤버인 사람만 연다.
        if (SpaceMaps.isPublic(visit.communityId())) return new Reader(visit.communityId(), user);
        var circle = circles.byId(visit.communityId());
        circles.requireActiveMember(circle, user);
        return new Reader(circle.id(), user);
    }

    public record PageRequest(String ticket, Long before) {}

    @PostMapping("/list")
    public ResponseEntity<BambooGuestbook.Page> list(@RequestBody PageRequest page, HttpServletRequest request) {
        var reader = reader(page.ticket(), request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(store.list(reader.community(), reader.user().id(), page.before()));
    }

    @PostMapping
    public BambooGuestbook.Entry write(@RequestBody JsonNode body, HttpServletRequest request) {
        var reader = reader(body.path("ticket").textValue(), request);
        if (reader.user().anonymous()) throw ApiException.forbidden("가입한 계정으로 방명록을 남겨 주세요.");
        String name = text(body, "name", 24, false), story = text(body, "story", 500, true);
        String key = body.path("requestId").asText("");
        UUID requestId;
        try { requestId = UUID.fromString(key); } catch (IllegalArgumentException ex) { throw ApiException.badRequest("다시 저장해 주세요."); }
        if (!requestId.toString().equalsIgnoreCase(key)) throw ApiException.badRequest("다시 저장해 주세요.");
        return store.write(reader.community(), reader.user().id(), requestId, name, story);
    }

    static String text(JsonNode body, String field, int max, boolean multiline) {
        JsonNode node = body.path(field);
        String value = node.isTextual() ? node.textValue().replace("\r\n", "\n").strip() : "";
        if (value.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))
                || value.codePointCount(0, value.length()) > max
                || value.codePoints().anyMatch(c -> Character.isISOControl(c) && !(multiline && c == '\n')))
            throw ApiException.badRequest((multiline ? "이야기는" : "이름은") + " 1~" + max + "자로 적어 주세요.");
        return value;
    }
}
