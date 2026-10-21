package kr.co.shuim.message;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.auth.DbUser;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class MessageController {
    private final AuthService auth;
    private final MessageService messages;

    public MessageController(AuthService auth, MessageService messages) {
        this.auth = auth;
        this.messages = messages;
    }

    /** GET /api/messages — 내 대화 목록 + 읽지 않은 수 */
    @GetMapping("/api/messages")
    public Map<String, Object> list(HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        return Map.of("conversations", messages.listConversations(me), "unread", messages.unreadMessageCount(me));
    }

    /** POST /api/messages { toUserId, text } — 메시지 보내기 (대화가 없으면 만든다) */
    @PostMapping("/api/messages")
    public MessageService.Sent send(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        Map<String, Object> b = body == null ? Map.of() : body;
        return messages.sendMessage(me, String.valueOf(b.getOrDefault("toUserId", "")), String.valueOf(b.getOrDefault("text", "")));
    }

    /** GET /api/messages/{id}?after=<ms> — 대화 내용 (after 이후 것만도 가능) */
    @GetMapping("/api/messages/{id}")
    public MessageService.Thread thread(@PathVariable String id, @RequestParam(required = false) Long after, HttpServletRequest req, HttpServletResponse res) {
        DbUser me = auth.requireUser(req, res);
        return messages.getThread(me, id, after != null && after > 0 ? after : null);
    }

    /** POST /api/messages/{id} — 읽음 처리 */
    @PostMapping("/api/messages/{id}")
    public Map<String, Object> read(@PathVariable String id, HttpServletRequest req, HttpServletResponse res) {
        messages.markRead(auth.requireUser(req, res), id);
        return Map.of("ok", true);
    }
}
