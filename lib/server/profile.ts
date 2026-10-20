/**
 * 프로필 (서버 전용). 공개: 닉네임·사진·소개·활동 수. 비공개(본인만): 이름·전화번호.
 */
import { getPool } from "../db";
import type { DbUser } from "./auth";

export interface PublicProfile {
  id: string;
  nick: string;
  avatarUrl: string | null;
  bio: string;
  isCreator: boolean;
  creatorBio: string;
  blocked: boolean;
  createdAt: number;
  stats: { followers: number; following: number; feedPosts: number; shoutPosts: number; cheers: number };
  isFollowing: boolean; // 보는 사람이 팔로우 중인지
}

export interface MyProfile extends PublicProfile {
  name: string;
  phone: string;
  email: string | null;
}

function db() {
  const p = getPool();
  if (!p) throw new Error("DB_URL이 설정되지 않았어요");
  return p;
}

export async function getPublicProfile(viewerId: string | null, userId: string): Promise<PublicProfile | null> {
  const q = db();
  const u = (await q.query("SELECT id, nick, blocked_at, created_at FROM users WHERE id = $1", [userId])).rows[0];
  if (!u) return null;
  const [p, c, stats, following] = await Promise.all([
    q.query("SELECT avatar_url, bio FROM profiles WHERE user_id = $1", [userId]),
    q.query("SELECT bio FROM creators WHERE user_id = $1", [userId]),
    q.query(
      `SELECT
         (SELECT count(*) FROM follows WHERE creator_id = $1)::int AS followers,
         (SELECT count(*) FROM follows WHERE follower_id = $1)::int AS following,
         (SELECT count(*) FROM feed_posts WHERE author_id = $1 AND hidden = FALSE)::int AS feed_posts,
         (SELECT count(*) FROM shout_posts WHERE author_id = $1 AND hidden = FALSE)::int AS shout_posts,
         (SELECT count(*) FROM cheers ch
            WHERE (ch.target_kind = 'post' AND ch.target_id IN (SELECT id FROM shout_posts WHERE author_id = $1))
               OR (ch.target_kind = 'feed' AND ch.target_id IN (SELECT id FROM feed_posts WHERE author_id = $1))
               OR (ch.target_kind = 'comment' AND ch.target_id IN (SELECT id FROM comments WHERE author_id = $1)))::int AS cheers`,
      [userId]
    ),
    viewerId ? q.query("SELECT 1 FROM follows WHERE follower_id = $1 AND creator_id = $2", [viewerId, userId]) : Promise.resolve({ rowCount: 0 }),
  ]);
  const s = stats.rows[0];
  return {
    id: u.id,
    nick: u.nick,
    avatarUrl: p.rows[0]?.avatar_url ?? null,
    bio: p.rows[0]?.bio ?? "",
    isCreator: Boolean(c.rows[0]),
    creatorBio: c.rows[0]?.bio ?? "",
    blocked: Boolean(u.blocked_at),
    createdAt: new Date(u.created_at).getTime(),
    stats: { followers: s.followers, following: s.following, feedPosts: s.feed_posts, shoutPosts: s.shout_posts, cheers: s.cheers },
    isFollowing: Boolean(following.rowCount),
  };
}

export async function getMyProfile(me: DbUser): Promise<MyProfile> {
  const pub = (await getPublicProfile(me.id, me.id))!;
  const r = (await db().query("SELECT name, phone FROM profiles WHERE user_id = $1", [me.id])).rows[0];
  return { ...pub, name: r?.name ?? "", phone: r?.phone ?? "", email: me.email };
}

export interface ProfileInput {
  nick?: string;
  bio?: string;
  avatarUrl?: string | null;
  name?: string;
  phone?: string;
}

export async function updateMyProfile(me: DbUser, input: ProfileInput): Promise<{ error?: string }> {
  const q = db();
  if (input.nick !== undefined) {
    const n = input.nick.trim();
    if (n.length < 2 || n.length > 12) return { error: "닉네임은 2~12자로 해요." };
    await q.query("UPDATE users SET nick = $2 WHERE id = $1", [me.id, n]);
  }
  const bio = (input.bio ?? "").trim().slice(0, 160);
  const avatar = input.avatarUrl && /^(\/|https?:\/\/)/.test(input.avatarUrl.trim()) ? input.avatarUrl.trim().slice(0, 500) : null;
  const name = (input.name ?? "").trim().slice(0, 20);
  const phone = (input.phone ?? "").replace(/[^0-9-]/g, "").slice(0, 14);
  const digits = phone.replace(/\D/g, "");
  if (digits && (digits.length < 10 || digits.length > 11)) return { error: "전화번호는 숫자 10~11자리로 입력해요." };
  await q.query(
    `INSERT INTO profiles (user_id, name, phone, bio, avatar_url, updated_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, bio = EXCLUDED.bio, avatar_url = EXCLUDED.avatar_url, updated_at = now()`,
    [me.id, name, digits, bio, avatar]
  );
  return {};
}
