package kr.co.shuim.beach;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.circle.CircleService;
import kr.co.shuim.circle.CircleLogic;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.community.CommunityConsentService;
import org.springframework.beans.factory.annotation.Autowired;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
public class BambooGuestbookController {
    private final BambooGuestbook store;
    private final AuthService auth;
    private final BeachService beach;
    private final CircleService circles;
    /** 쓰기 전에 확인하는 커뮤니티 이용규칙 동의. 직접 만든(테스트) 컨트롤러는 동의 저장소 없이 시작한다 */
    private CommunityConsentService consent;

    public BambooGuestbookController(BambooGuestbook store, AuthService auth, BeachService beach, CircleService circles) {
        this.store = store; this.auth = auth; this.beach = beach; this.circles = circles;
    }

    @Autowired(required = false)
    void setConsent(CommunityConsentService consent) { this.consent = consent; }

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

    @PostMapping("/api/beach/guestbook/list")
    public ResponseEntity<BambooGuestbook.Page> list(@RequestBody PageRequest page, HttpServletRequest request) {
        var reader = reader(page.ticket(), request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(store.list(reader.community(), reader.user().id(), page.before()));
    }

    @PostMapping("/api/beach/guestbook")
    public BambooGuestbook.Entry write(@RequestBody JsonNode body, HttpServletRequest request) {
        var reader = reader(body.path("ticket").textValue(), request);
        if (reader.user().anonymous()) throw ApiException.forbidden("가입한 계정으로 방명록을 남겨 주세요.");
        // 다른 이용자 글쓰기와 같이 커뮤니티 이용규칙 동의와 금칙어를 확인한다.
        if (consent != null) consent.requireAccepted(reader.user());
        String name = text(body, "name", 24, false), story = text(body, "story", 500, true);
        if (CircleLogic.offensive(name) || CircleLogic.offensive(story)) throw ApiException.badRequest("쓸 수 없는 말이 들어 있어요. 고쳐서 다시 남겨 주세요.");
        String key = body.path("requestId").asText("");
        UUID requestId;
        try { requestId = UUID.fromString(key); } catch (IllegalArgumentException ex) { throw ApiException.badRequest("다시 저장해 주세요."); }
        if (!requestId.toString().equalsIgnoreCase(key)) throw ApiException.badRequest("다시 저장해 주세요.");
        return store.write(reader.community(), reader.user().id(), requestId, name, story);
    }

    /** DELETE /api/beach/guestbook/{id} → { deleted }. 작성자가 자기 메모를 지운다 (방문 티켓 없이, 로그인한 작성자만) */
    @DeleteMapping("/api/beach/guestbook/{id}")
    public java.util.Map<String, Object> delete(@PathVariable String id, HttpServletRequest request) {
        var user = auth.currentUser(request).orElseThrow(() -> ApiException.unauthorized("다시 로그인해 주세요."));
        return java.util.Map.of("deleted", store.deleteOwn(user.id(), entryId(id)));
    }

    /** DELETE /api/admin/beach/guestbook/{id} → { deleted }. 관리자가 신고된 메모를 지운다 */
    @DeleteMapping("/api/admin/beach/guestbook/{id}")
    public java.util.Map<String, Object> adminDelete(@PathVariable String id, HttpServletRequest request) {
        if (!auth.isAdmin(auth.currentUser(request).orElse(null))) throw ApiException.forbidden("관리자만 방명록을 지울 수 있어요.");
        return java.util.Map.of("deleted", store.deleteAny(entryId(id)));
    }

    private static long entryId(String id) {
        try {
            long value = Long.parseLong(id);
            if (value > 0) return value;
        } catch (NumberFormatException ignored) { }
        throw ApiException.badRequest("지울 메모를 다시 골라 주세요.");
    }

    static String text(JsonNode body, String field, int max, boolean multiline) {
        JsonNode node = body.path(field);
        String value = node.isTextual() ? node.textValue().replace("\r\n", "\n").strip() : "";
        // 소원 풍등과 같은 기준: 제어문자, 보이지 않는 방향 바꿈(Cf, 이모지 결합 ZWJ/ZWNJ 제외), 줄·문단 구분자, 짝 없는 서로게이트를 거절한다.
        if (value.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))
                || value.codePointCount(0, value.length()) > max
                || value.codePoints().anyMatch(c -> Character.isISOControl(c) && !(multiline && c == '\n'))
                || value.codePoints().anyMatch(c -> Character.getType(c) == Character.SURROGATE
                    || Character.getType(c) == Character.LINE_SEPARATOR || Character.getType(c) == Character.PARAGRAPH_SEPARATOR
                    || (Character.getType(c) == Character.FORMAT && c != 0x200c && c != 0x200d)))
            throw ApiException.badRequest((multiline ? "이야기는" : "이름은") + " 1~" + max + "자로 적어 주세요.");
        return value;
    }
}
