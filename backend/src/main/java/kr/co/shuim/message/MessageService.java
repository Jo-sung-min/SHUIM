package kr.co.shuim.message;

import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.common.Ids;
import kr.co.shuim.config.ApiException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** 1:1 메시지. 대화는 두 사람 한 쌍에 하나. 폴링으로 새 메시지를 가져온다(웹소켓 없음). */
@Service
public class MessageService {
    private final JdbcClient jdbc;

    public MessageService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public record Other(String id, String nick, String avatarUrl, Boolean blocked) {}

    public record ConversationSummary(String id, Other other, String lastText, Long lastAt, boolean lastFromMe, int unread) {}

    public record Message(String id, String senderId, String text, long at, Long readAt) {}

    public record Thread(String otherId, Other other, List<Message> messages) {}

    public record Sent(String conversationId, Message message) {}

    public List<ConversationSummary> listConversations(DbUser me) {
        return jdbc.sql("""
            SELECT c.id, c.last_message_at,
                   u.id AS other_id, u.nick AS other_nick, u.blocked_at AS other_blocked, p.avatar_url,
                   lm.text AS last_text, lm.sender_id AS last_sender,
                   (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL)::int AS unread
              FROM conversations c
              JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
              LEFT JOIN profiles p ON p.user_id = u.id
              LEFT JOIN LATERAL (SELECT text, sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
             WHERE c.user_a = ? OR c.user_b = ?
             ORDER BY c.last_message_at DESC NULLS LAST
            """).param(me.id()).param(me.id()).param(me.id()).param(me.id())
            .query((rs, i) -> new ConversationSummary(
                rs.getString("id"),
                new Other(rs.getString("other_id"), rs.getString("other_nick"), rs.getString("avatar_url"), Db.ms(rs, "other_blocked") != null),
                rs.getString("last_text"), Db.ms(rs, "last_message_at"), me.id().equals(rs.getString("last_sender")), rs.getInt("unread"))).list();
    }

    public int unreadMessageCount(DbUser me) {
        return jdbc.sql("""
            SELECT count(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
             WHERE (c.user_a = ? OR c.user_b = ?) AND m.sender_id <> ? AND m.read_at IS NULL
            """).param(me.id()).param(me.id()).param(me.id()).query(Integer.class).single();
    }

    private String conversationFor(DbUser me, String otherId) {
        String a = me.id().compareTo(otherId) < 0 ? me.id() : otherId;
        String b = a.equals(me.id()) ? otherId : me.id();
        Optional<String> ex = jdbc.sql("SELECT id FROM conversations WHERE user_a = ? AND user_b = ?").param(a).param(b).query(String.class).optional();
        if (ex.isPresent()) return ex.get();
        jdbc.sql("INSERT INTO conversations (id, user_a, user_b) VALUES (?, ?, ?) ON CONFLICT (user_a, user_b) DO NOTHING").param(Ids.uid()).param(a).param(b).update();
        return jdbc.sql("SELECT id FROM conversations WHERE user_a = ? AND user_b = ?").param(a).param(b).query(String.class).single();
    }

    private String assertMember(DbUser me, String conversationId) {
        record C(String a, String b) {}
        Optional<C> c = jdbc.sql("SELECT user_a, user_b FROM conversations WHERE id = ?").param(conversationId)
            .query((rs, i) -> new C(rs.getString("user_a"), rs.getString("user_b"))).optional();
        if (c.isEmpty() || (!c.get().a().equals(me.id()) && !c.get().b().equals(me.id()))) throw ApiException.notFound("대화를 찾을 수 없어요");
        return c.get().a().equals(me.id()) ? c.get().b() : c.get().a();
    }

    public Thread getThread(DbUser me, String conversationId, Long after) {
        String otherId = assertMember(me, conversationId);
        Other other = jdbc.sql("SELECT u.id, u.nick, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?").param(otherId)
            .query((rs, i) -> new Other(rs.getString("id"), rs.getString("nick"), rs.getString("avatar_url"), null)).single();
        List<Message> messages = after != null
            ? jdbc.sql("SELECT * FROM messages WHERE conversation_id = ? AND created_at > to_timestamp(? / 1000.0) ORDER BY created_at")
                .param(conversationId).param(after).query(MSG).list()
            : jdbc.sql("SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 200) t ORDER BY created_at")
                .param(conversationId).query(MSG).list();
        return new Thread(otherId, other, messages);
    }

    private static final org.springframework.jdbc.core.RowMapper<Message> MSG = (rs, i) ->
        new Message(rs.getString("id"), rs.getString("sender_id"), rs.getString("text"), Db.msReq(rs, "created_at"), Db.ms(rs, "read_at"));

    public void markRead(DbUser me, String conversationId) {
        assertMember(me, conversationId);
        jdbc.sql("UPDATE messages SET read_at = now() WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL").param(conversationId).param(me.id()).update();
    }

    @Transactional
    public Sent sendMessage(DbUser me, String toUserId, String text) {
        if (me.blocked()) throw ApiException.badRequest("차단된 계정은 메시지를 보낼 수 없어요.");
        if (toUserId.equals(me.id())) throw ApiException.badRequest("자기 자신에게는 보낼 수 없어요.");
        String t = text == null ? "" : text.strip();
        if (t.isEmpty()) throw ApiException.badRequest("내용이 비어 있어요");
        if (t.length() > 1000) t = t.substring(0, 1000);
        record To(String id, Long blockedAt) {}
        Optional<To> to = jdbc.sql("SELECT id, blocked_at FROM users WHERE id = ?").param(toUserId).query((rs, i) -> new To(rs.getString("id"), Db.ms(rs, "blocked_at"))).optional();
        if (to.isEmpty()) throw ApiException.badRequest("받는 사람을 찾을 수 없어요");
        if (to.get().blockedAt() != null) throw ApiException.badRequest("차단된 사용자에게는 보낼 수 없어요.");
        String conversationId = conversationFor(me, toUserId);
        Message m = jdbc.sql("INSERT INTO messages (id, conversation_id, sender_id, text) VALUES (?, ?, ?, ?) RETURNING *")
            .param(Ids.uid()).param(conversationId).param(me.id()).param(t).query(MSG).single();
        jdbc.sql("UPDATE conversations SET last_message_at = now() WHERE id = ?").param(conversationId).update();
        return new Sent(conversationId, new Message(m.id(), m.senderId(), m.text(), m.at(), null));
    }
}
