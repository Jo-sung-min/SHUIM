package kr.co.shuim.message;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.config.ApiException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class MessageController {
    private final AuthService auth;
    private final MessageService messages;

    public MessageController(AuthService auth, MessageService messages) {
        this.auth = auth;
        this.messages = messages;
    }

    /** 읽기·읽음 처리는 세션이 있을 때만. 세션 없는 요청마다 익명 회원을 만들지 않는다 */
    private DbUser current(HttpServletRequest req) {
        return auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized("로그인이 필요해요"));
    }

    /** GET /api/messages — 내 대화 목록 + 읽지 않은 수 (세션이 없으면 빈 목록이라 탭 표시는 0) */
    @GetMapping("/api/messages")
    public Map<String, Object> list(HttpServletRequest req) {
        DbUser me = auth.currentUser(req).orElse(null);
        if (me == null) return Map.of("conversations", List.of(), "unread", 0);
        return Map.of("conversations", messages.listConversations(me), "unread", messages.unreadMessageCount(me));
    }

    /** POST /api/messages { toUserId, text } — 메시지 보내기 (대화가 없으면 만든다) */
    @PostMapping("/api/messages")
    public MessageService.Sent send(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
        // 메시지는 가입 회원만 보낸다 (쿠키만 지우면 생기는 익명 계정으로 차단을 피해 보내지 못하게)
        DbUser me = auth.currentUser(req).orElseThrow(() -> ApiException.unauthorized(MessageService.LOGIN_TO_SEND));
        Map<String, Object> b = body == null ? Map.of() : body;
        return messages.sendMessage(me, String.valueOf(b.getOrDefault("toUserId", "")), String.valueOf(b.getOrDefault("text", "")));
    }

    /** GET /api/messages/{id}?after=<ms> — 대화 내용 (after 이후 것만도 가능) */
    @GetMapping("/api/messages/{id}")
    public MessageService.Thread thread(@PathVariable String id, @RequestParam(required = false) Long after, HttpServletRequest req) {
        DbUser me = current(req);
        return messages.getThread(me, id, after != null && after > 0 ? after : null);
    }

    /** POST /api/messages/{id} — 읽음 처리 */
    @PostMapping("/api/messages/{id}")
    public Map<String, Object> read(@PathVariable String id, HttpServletRequest req) {
        messages.markRead(current(req), id);
        return Map.of("ok", true);
    }
}
