/**
 * 1:1 메시지 (서버 전용). 대화는 두 사람 한 쌍에 하나. 폴링으로 새 메시지를 가져온다(웹소켓 없음).
 */
import { getPool } from "../db";
import { uid } from "../dates";
import type { DbUser } from "./auth";

export interface ConversationSummary {
  id: string;
  other: { id: string; nick: string; avatarUrl: string | null; blocked: boolean };
  lastText: string | null;
  lastAt: number | null;
  lastFromMe: boolean;
  unread: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  at: number;
  readAt: number | null;
}

function db() {
  const p = getPool();
  if (!p) throw new Error("DB_URL이 설정되지 않았어요");
  return p;
}
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);

export async function listConversations(me: DbUser): Promise<ConversationSummary[]> {
  const r = await db().query(
    `SELECT c.id, c.last_message_at,
            u.id AS other_id, u.nick AS other_nick, u.blocked_at AS other_blocked, p.avatar_url,
            lm.text AS last_text, lm.sender_id AS last_sender,
            (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL)::int AS unread
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN LATERAL (SELECT text, sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
      WHERE c.user_a = $1 OR c.user_b = $1
      ORDER BY c.last_message_at DESC NULLS LAST`,
    [me.id]
  );
  return r.rows.map((x) => ({
    id: x.id,
    other: { id: x.other_id, nick: x.other_nick, avatarUrl: x.avatar_url ?? null, blocked: Boolean(x.other_blocked) },
    lastText: x.last_text ?? null,
    lastAt: ms(x.last_message_at),
    lastFromMe: x.last_sender === me.id,
    unread: x.unread,
  }));
}

export async function unreadMessageCount(me: DbUser): Promise<number> {
  const r = await db().query(
    `SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user_a = $1 OR c.user_b = $1) AND m.sender_id <> $1 AND m.read_at IS NULL`,
    [me.id]
  );
  return r.rows[0]?.n ?? 0;
}

async function conversationFor(me: DbUser, otherId: string): Promise<{ id: string; created: boolean }> {
  const [a, b] = me.id < otherId ? [me.id, otherId] : [otherId, me.id];
  const q = db();
  const ex = await q.query("SELECT id FROM conversations WHERE user_a = $1 AND user_b = $2", [a, b]);
  if (ex.rows[0]) return { id: ex.rows[0].id, created: false };
  const id = uid();
  await q.query("INSERT INTO conversations (id, user_a, user_b) VALUES ($1, $2, $3) ON CONFLICT (user_a, user_b) DO NOTHING", [id, a, b]);
  const again = await q.query("SELECT id FROM conversations WHERE user_a = $1 AND user_b = $2", [a, b]);
  return { id: again.rows[0].id, created: true };
}

async function assertMember(me: DbUser, conversationId: string) {
  const r = await db().query("SELECT user_a, user_b FROM conversations WHERE id = $1", [conversationId]);
  const c = r.rows[0];
  if (!c || (c.user_a !== me.id && c.user_b !== me.id)) throw new Error("대화를 찾을 수 없어요");
  return c.user_a === me.id ? c.user_b : c.user_a;
}

export async function getThread(me: DbUser, conversationId: string, after?: number): Promise<{ otherId: string; other: { id: string; nick: string; avatarUrl: string | null }; messages: Message[] }> {
  const otherId = await assertMember(me, conversationId);
  const q = db();
  const [u, m] = await Promise.all([
    q.query("SELECT u.id, u.nick, p.avatar_url FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1", [otherId]),
    after
      ? q.query("SELECT * FROM messages WHERE conversation_id = $1 AND created_at > to_timestamp($2 / 1000.0) ORDER BY created_at", [conversationId, after])
      : q.query("SELECT * FROM (SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 200) t ORDER BY created_at", [conversationId]),
  ]);
  return {
    otherId,
    other: { id: u.rows[0].id, nick: u.rows[0].nick, avatarUrl: u.rows[0].avatar_url ?? null },
    messages: m.rows.map((x) => ({ id: x.id, senderId: x.sender_id, text: x.text, at: ms(x.created_at)!, readAt: ms(x.read_at) })),
  };
}

export async function markRead(me: DbUser, conversationId: string) {
  await assertMember(me, conversationId);
  await db().query("UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL", [conversationId, me.id]);
}

export async function sendMessage(me: DbUser, toUserId: string, text: string): Promise<{ conversationId: string; message: Message }> {
  if (me.blockedAt) throw new Error("차단된 계정은 메시지를 보낼 수 없어요.");
  if (toUserId === me.id) throw new Error("자기 자신에게는 보낼 수 없어요.");
  const t = text.trim();
  if (!t) throw new Error("내용이 비어 있어요");
  const q = db();
  const to = (await q.query("SELECT id, blocked_at FROM users WHERE id = $1", [toUserId])).rows[0];
  if (!to) throw new Error("받는 사람을 찾을 수 없어요");
  if (to.blocked_at) throw new Error("차단된 사용자에게는 보낼 수 없어요.");
  const { id: conversationId } = await conversationFor(me, toUserId);
  const id = uid();
  const r = await q.query("INSERT INTO messages (id, conversation_id, sender_id, text) VALUES ($1, $2, $3, $4) RETURNING *", [id, conversationId, me.id, t.slice(0, 1000)]);
  await q.query("UPDATE conversations SET last_message_at = now() WHERE id = $1", [conversationId]);
  const x = r.rows[0];
  return { conversationId, message: { id: x.id, senderId: x.sender_id, text: x.text, at: ms(x.created_at)!, readAt: null } };
}
