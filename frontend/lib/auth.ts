"use client";

/**
 * 계정 클라이언트. 세션은 httpOnly 쿠키, 계정 정보는 /api/auth 에서 온다.
 * 로그인한 계정 id를 localStorage(SESSION_KEY)에도 적어 두어 기록·메모 같은 개인 데이터가 계정별로 분리되게 한다.
 */
import { SESSION_KEY, adoptGuestData, flushRecords, resetRecordsSync } from "./storage";

export type Role = "admin" | "user";

export interface Account {
  id: string;
  email: string | null;
  nick: string;
  role: Role;
  createdAt: number;
}

export interface Me {
  user: Account | null;
  admin: boolean;
  configured: boolean;
}

function syncSessionKey(user: Account | null) {
  try {
    if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: Date.now() }));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

async function post<T>(path: string, body: unknown): Promise<T & { error?: string }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !json.error) json.error = `요청 실패 (${res.status})`;
  return json;
}

let meCache: Me | null = null;

/** 현재 계정 (익명은 null). 결과는 짧게 캐시하고, 로그인·로그아웃 시 갱신 */
export async function fetchMe(force = false): Promise<Me> {
  if (meCache && !force) return meCache;
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    const json = (await res.json()) as Me;
    meCache = { user: json.user ?? null, admin: Boolean(json.admin), configured: json.configured !== false };
  } catch {
    meCache = { user: null, admin: false, configured: false };
  }
  syncSessionKey(meCache.user);
  return meCache;
}

export function validate(email: string, nick: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "이메일 형식을 확인해요.";
  const n = nick.trim();
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자로 해요.";
  if (password.length < 6) return "비밀번호는 6자 이상으로 해요.";
  return null;
}

export async function signUp(email: string, nick: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const err = validate(email, nick, password);
  if (err) return { ok: false, error: err };
  const r = await post<{ user: Account | null; admin: boolean }>("/api/auth/signup", { email, nick, password });
  if (r.error || !r.user) return { ok: false, error: r.error ?? "가입하지 못했어요" };
  meCache = { user: r.user, admin: Boolean(r.admin), configured: true };
  resetRecordsSync();
  syncSessionKey(r.user);
  adoptGuestData(r.user.id); // 가입 전 이 기기에서 쓰던 기록을 새 계정으로 (서버에도 한 번 올린다)
  return { ok: true, account: r.user };
}

export async function signIn(email: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const r = await post<{ user: Account | null; admin: boolean }>("/api/auth/login", { email, password });
  if (r.error || !r.user) return { ok: false, error: r.error ?? "로그인하지 못했어요" };
  meCache = { user: r.user, admin: Boolean(r.admin), configured: true };
  resetRecordsSync();
  syncSessionKey(r.user);
  adoptGuestData(r.user.id); // 게스트 기록은 계정(서버)에 아직 없는 부분에만 들어간다
  return { ok: true, account: r.user };
}

export async function signOut() {
  await flushRecords(); // 아직 서버로 못 보낸 기록이 있으면 먼저
  await post("/api/auth/logout", {});
  meCache = null;
  resetRecordsSync();
  syncSessionKey(null);
}

/** 켜져 있는 소셜 로그인 */
export async function fetchProviders(): Promise<{ kakao: boolean }> {
  try {
    const res = await fetch("/api/auth/providers", { cache: "no-store" });
    const json = (await res.json()) as { kakao?: boolean };
    return { kakao: Boolean(json.kakao) };
  } catch {
    return { kakao: false };
  }
}

/** 카카오 로그인 콜백에서 돌아왔을 때: 서버가 이미 세션 쿠키를 줬으니 계정을 읽고 이 기기의 게스트 기록을 계정으로 옮긴다 */
export async function completeOAuthLogin(): Promise<Me> {
  const m = await fetchMe(true);
  if (m.user) {
    resetRecordsSync();
    syncSessionKey(m.user);
    adoptGuestData(m.user.id);
  }
  return m;
}

export async function updateNick(nick: string): Promise<string | null> {
  const r = await post<{ user?: Account }>("/api/auth/nick", { nick });
  if (r.error) return r.error;
  if (meCache && r.user) meCache = { ...meCache, user: r.user };
  return null;
}
