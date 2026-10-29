"use client";

/**
 * 계정 클라이언트. 세션은 httpOnly 쿠키, 계정 정보는 /api/auth 에서 온다.
 * 로그인한 계정 id를 localStorage(SESSION_KEY)에도 적어 두어 기록·메모 같은 개인 데이터가 계정별로 분리되게 한다.
 */
import { SESSION_KEY, adoptGuestData, clearAccountCache, flushRecords, resetRecordsSync, sessionUserId } from "./storage";
import { resetCommunityCache } from "./community";
import { IS_AIT, tossLogin } from "./ait";

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
  /** 서버에 KAKAO_CLIENT_ID 가 있어 카카오 로그인이 켜져 있는지 (false 면 버튼 숨김) */
  kakao: boolean;
  /** 앱인토스 미니앱의 토스 로그인이 서버에서 켜져 있는지 (mTLS 인증서가 있을 때) */
  toss: boolean;
  /** 로그인 전 방문자의 익명 유저 id (서버가 세션으로 만든 것, 없으면 빠진다) */
  anonymousId?: string;
}

function syncSessionKey(user: Account | null) {
  try {
    const before = sessionUserId();
    if (before !== (user?.id ?? null)) {
      resetCommunityCache();
      for (let index = window.localStorage.length - 1; index >= 0; index--) {
        const key = window.localStorage.key(index);
        if (key?.startsWith("sorow:community-terms:")) window.localStorage.removeItem(key);
      }
    }
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

/** A recovered connection must re-read the session instead of keeping an outage result. */
export function resetAuthCache() {
  meCache = null;
}

/** 현재 계정 (익명은 null). 결과는 짧게 캐시하고, 로그인·로그아웃 시 갱신 */
export async function fetchMe(force = false): Promise<Me> {
  if (meCache && !force) return meCache;
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    const json = (await res.json()) as Me;
    // Java omits null fields, so a valid guest response has no `user` property.
    if (!res.ok || !json || json.configured !== true || typeof json.admin !== "boolean" || typeof json.kakao !== "boolean") throw new Error("계정 연결을 확인하지 못했어요.");
    meCache = { user: json.user ?? null, admin: Boolean(json.admin), configured: true, kakao: Boolean(json.kakao), toss: Boolean(json.toss), anonymousId: json.anonymousId ?? undefined };
  } catch {
    // A network failure is not a logout. Keep the local account namespace and do not cache this failure.
    return { user: null, admin: false, configured: false, kakao: false, toss: false };
  }
  // 미니앱: 토스에서 연결을 끊으면 서버가 계정을 지운다. 세션이 사라졌으면 이 기기에 남은 그 계정의 기록도 지운다 (출시 체크리스트)
  if (IS_AIT && !meCache.user) {
    const previous = sessionUserId();
    if (previous) clearAccountCache(previous);
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

export async function signUp(email: string, nick: string, password: string, consent: { signupConsentVersion: string; aiDisclosureAccepted: boolean }): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const err = validate(email, nick, password);
  if (err) return { ok: false, error: err };
  const r = await post<{ user: Account | null; admin: boolean }>("/api/auth/signup", { email, nick, password, ...consent });
  if (r.error || !r.user) return { ok: false, error: r.error ?? "가입하지 못했어요" };
  meCache = { user: r.user, admin: Boolean(r.admin), configured: true, kakao: meCache?.kakao ?? false, toss: meCache?.toss ?? false };
  resetRecordsSync();
  syncSessionKey(r.user);
  adoptGuestData(r.user.id); // 가입 전 이 기기에서 쓰던 기록을 새 계정으로 (서버에도 한 번 올린다)
  return { ok: true, account: r.user };
}

export async function signIn(email: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const r = await post<{ user: Account | null; admin: boolean }>("/api/auth/login", { email, password });
  if (r.error || !r.user) return { ok: false, error: r.error ?? "로그인하지 못했어요" };
  meCache = { user: r.user, admin: Boolean(r.admin), configured: true, kakao: meCache?.kakao ?? false, toss: meCache?.toss ?? false };
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

export async function deleteAccount(confirmation: string, expectedUserId: string): Promise<void> {
  if (sessionUserId() !== expectedUserId) throw new Error("다른 탭에서 계정이 변경되었어요. 이 페이지를 새로고침한 뒤 다시 확인해 주세요.");
  // A destructive request must be bound to the account the person actually reviewed.
  // Discard queued writes; deletion removes existing server data without uploading extra private records first.
  resetRecordsSync();
  const response = await fetch("/api/auth/account", {
    method: "DELETE", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation, expectedUserId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) throw new Error(result.error || "삭제 결과를 확인하지 못했어요. 계정 상태를 다시 확인해 주세요.");
  resetRecordsSync();
  clearAccountCache(expectedUserId);
  syncSessionKey(null);
  meCache = null;
}

/**
 * 미니앱 "토스로 시작하기": TossAuth.login() 의 인가 코드를 서버로 보낸다.
 * 처음 온 사람이 가입 안내에 아직 동의하지 않았으면 consentRequired — 동의를 저장한 뒤 다시 부르면 된다 (두 번째부터는 토스 화면 없이 코드가 온다)
 */
export async function signInWithToss(): Promise<{ ok: true; account: Account } | { ok: false; error: string; consentRequired?: boolean }> {
  let code: { authorizationCode: string; referrer: string };
  try {
    code = await tossLogin();
  } catch {
    return { ok: false, error: "토스 로그인을 마치지 못했어요. 다시 시도해 주세요." };
  }
  const r = await post<{ user: Account | null; admin: boolean; consentRequired?: boolean }>("/api/auth/toss", code);
  if (r.consentRequired) return { ok: false, error: r.error ?? "가입 안내를 확인해 주세요.", consentRequired: true };
  if (r.error || !r.user) return { ok: false, error: r.error ?? "로그인하지 못했어요" };
  meCache = { user: r.user, admin: Boolean(r.admin), configured: true, kakao: false, toss: true };
  resetRecordsSync();
  syncSessionKey(r.user);
  adoptGuestData(r.user.id); // 로그인 전 이 기기에서 쓰던 기록을 계정으로
  return { ok: true, account: r.user };
}

/** "카카오로 시작하기": 서버가 state 쿠키를 심고 카카오 동의 화면으로 보낸다. 끝나면 /?kakao=1 로 돌아온다 */
export function startKakaoLogin() {
  window.location.href = "/api/auth/kakao";
}

/** 카카오 콜백에서 돌아왔을 때(/?kakao=1): 세션 쿠키는 이미 있으니 계정을 읽고, 가입 때처럼 이 기기의 게스트 기록을 계정으로 옮긴다 */
export async function completeKakaoLogin(): Promise<Me> {
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
