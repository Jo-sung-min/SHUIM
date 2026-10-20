/**
 * 세션 인증 (서버 전용). 쿠키에 토큰을 두고 DB(auth_sessions)에는 SHA-256 해시만 저장.
 * 로그인하지 않은 방문자도 익명 유저 행을 만들어 외침·힘내요를 쓸 수 있게 한다. 가입하면 그 익명 유저가 정식 계정으로 승격된다.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getPool } from "../db";
import { randomNick } from "../community-core";
import { uid } from "../dates";

const COOKIE = "shuim_session";
const TTL_MS = 90 * 24 * 3600 * 1000;

export interface DbUser {
  id: string;
  email: string | null;
  nick: string;
  role: "admin" | "user";
  isAnonymous: boolean;
  blockedAt: number | null;
  blockedReason: string | null;
  createdAt: number;
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const hashPassword = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 64).toString("hex");

function rowToUser(r: Record<string, unknown>): DbUser {
  return {
    id: String(r.id),
    email: (r.email as string | null) ?? null,
    nick: String(r.nick),
    role: r.role === "admin" ? "admin" : "user",
    isAnonymous: Boolean(r.is_anonymous),
    blockedAt: r.blocked_at ? new Date(r.blocked_at as string).getTime() : null,
    blockedReason: (r.blocked_reason as string | null) ?? null,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

function pool() {
  const p = getPool();
  if (!p) throw new Error("DB_URL이 설정되지 않았어요");
  return p;
}

async function setSessionCookie(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_MS);
  await pool().query("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [sha256(token), userId, expires]);
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

/** 쿠키의 세션으로 유저를 찾는다. 없거나 만료면 null */
export async function currentUser(): Promise<DbUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const r = await pool().query(
    `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  return r.rows[0] ? rowToUser(r.rows[0]) : null;
}

/** 유저가 없으면 익명 유저를 만들어 세션을 발급한다 (외침 읽기·쓰기에 필요) */
export async function requireUser(): Promise<DbUser> {
  const u = await currentUser();
  if (u) return u;
  const id = uid();
  const r = await pool().query(
    "INSERT INTO users (id, nick, role, is_anonymous) VALUES ($1, $2, 'user', TRUE) RETURNING *",
    [id, randomNick()]
  );
  await setSessionCookie(id);
  return rowToUser(r.rows[0]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(email: string, nick: string, password: string): string | null {
  if (!EMAIL_RE.test(email.trim())) return "이메일 형식을 확인해요.";
  const n = nick.trim();
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자로 해요.";
  if (password.length < 6) return "비밀번호는 6자 이상으로 해요.";
  return null;
}

/** 가입: 현재 익명 유저가 있으면 그 행을 승격, 아니면 새로 만든다. 비밀번호를 가진 첫 계정이 관리자. */
export async function signUp(email: string, nick: string, password: string): Promise<{ ok: true; user: DbUser } | { ok: false; error: string }> {
  const err = validateSignup(email, nick, password);
  if (err) return { ok: false, error: err };
  const e = email.trim().toLowerCase();
  const db = pool();
  if ((await db.query("SELECT 1 FROM users WHERE email = $1", [e])).rowCount) return { ok: false, error: "이미 가입한 이메일이에요." };
  const firstReal = (await db.query("SELECT 1 FROM users WHERE password_hash IS NOT NULL LIMIT 1")).rowCount === 0;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const cur = await currentUser();
  let row;
  if (cur && cur.isAnonymous) {
    row = (
      await db.query(
        `UPDATE users SET email = $2, nick = $3, password_hash = $4, password_salt = $5, role = $6, is_anonymous = FALSE WHERE id = $1 RETURNING *`,
        [cur.id, e, nick.trim(), hash, salt, firstReal ? "admin" : "user"]
      )
    ).rows[0];
  } else {
    row = (
      await db.query(
        `INSERT INTO users (id, email, nick, password_hash, password_salt, role, is_anonymous) VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
        [uid(), e, nick.trim(), hash, salt, firstReal ? "admin" : "user"]
      )
    ).rows[0];
    await setSessionCookie(row.id);
  }
  return { ok: true, user: rowToUser(row) };
}

export async function signIn(email: string, password: string): Promise<{ ok: true; user: DbUser } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const r = await pool().query("SELECT * FROM users WHERE email = $1", [e]);
  const row = r.rows[0];
  if (!row || !row.password_hash) return { ok: false, error: "가입되지 않은 이메일이에요." };
  const hash = hashPassword(password, row.password_salt);
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(row.password_hash))) return { ok: false, error: "비밀번호가 맞지 않아요." };
  await signOut();
  await setSessionCookie(row.id);
  return { ok: true, user: rowToUser(row) };
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await pool().query("DELETE FROM auth_sessions WHERE token_hash = $1", [sha256(token)]);
  store.delete(COOKIE);
}

export async function updateNick(user: DbUser, nick: string): Promise<string | null> {
  const n = nick.trim();
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자로 해요.";
  await pool().query("UPDATE users SET nick = $2 WHERE id = $1", [user.id, n]);
  return null;
}

/** 관리자 여부. 비밀번호를 가진 계정이 하나도 없으면(순수 데모) 누구나 관리자 화면을 볼 수 있다. */
export async function isAdmin(user: DbUser | null): Promise<boolean> {
  if (user?.role === "admin" && !user.isAnonymous) return true;
  const any = (await pool().query("SELECT 1 FROM users WHERE password_hash IS NOT NULL LIMIT 1")).rowCount;
  return any === 0;
}
