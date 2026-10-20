"use client";

/**
 * 계정 (프로토타입): 계정 목록과 세션을 이 기기의 localStorage에 저장한다.
 * 비밀번호는 SHA-256(salt + password)로만 저장. 서버가 생기면 이 파일의 함수를 API 호출로 바꾸면 된다.
 * 첫 번째로 가입한 계정이 관리자가 된다.
 */

import { SESSION_KEY, adoptGuestData, readShared, uid, writeShared } from "./storage";
import { loadCommunity, saveCommunity } from "./community";

export type Role = "admin" | "user";

export interface Account {
  id: string;
  email: string; // 소문자
  nick: string;
  salt: string;
  hash: string;
  role: Role;
  createdAt: number;
}

const ACCOUNTS_KEY = "maeum-accel:accounts:v1";

const loadAccounts = () => readShared<Account[]>(ACCOUNTS_KEY, []);
const saveAccounts = (a: Account[]) => writeShared(ACCOUNTS_KEY, a);

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function currentUser(): Account | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const userId = raw ? (JSON.parse(raw) as { userId?: string }).userId : null;
    if (!userId) return null;
    return loadAccounts().find((a) => a.id === userId) ?? null;
  } catch {
    return null;
  }
}

/** 관리자 여부. 아직 가입한 계정이 하나도 없으면(순수 데모) 누구나 관리자 화면을 볼 수 있다. */
export function isAdmin(): boolean {
  const accounts = loadAccounts();
  if (accounts.length === 0) return true;
  return currentUser()?.role === "admin";
}

export const hasAnyAccount = () => loadAccounts().length > 0;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(email: string, nick: string, password: string): string | null {
  if (!EMAIL_RE.test(email.trim())) return "이메일 형식을 확인해요.";
  const n = nick.trim();
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자로 해요.";
  if (password.length < 6) return "비밀번호는 6자 이상으로 해요.";
  return null;
}

function setSession(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, at: Date.now() }));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

/** 외침·피드의 "나" 닉네임을 계정 닉네임으로 맞춤 */
function syncCommunityNick(nick: string) {
  const s = loadCommunity();
  if (s.me.nick !== nick) saveCommunity({ ...s, me: { ...s.me, nick } });
}

export async function signUp(email: string, nick: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const err = validate(email, nick, password);
  if (err) return { ok: false, error: err };
  const accounts = loadAccounts();
  const e = email.trim().toLowerCase();
  if (accounts.some((a) => a.email === e)) return { ok: false, error: "이미 가입한 이메일이에요." };
  const salt = randomHex(16);
  const hash = await hashPassword(salt, password);
  const account: Account = { id: uid(), email: e, nick: nick.trim(), salt, hash, role: accounts.length === 0 ? "admin" : "user", createdAt: Date.now() };
  saveAccounts([...accounts, account]);
  adoptGuestData(account.id); // 가입 전 이 기기에서 쓰던 기록을 새 계정으로 가져옴
  setSession(account.id);
  syncCommunityNick(account.nick);
  return { ok: true, account };
}

export async function signIn(email: string, password: string): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const account = loadAccounts().find((a) => a.email === e);
  if (!account) return { ok: false, error: "가입되지 않은 이메일이에요." };
  const hash = await hashPassword(account.salt, password);
  if (hash !== account.hash) return { ok: false, error: "비밀번호가 맞지 않아요." };
  setSession(account.id);
  syncCommunityNick(account.nick);
  return { ok: true, account };
}

export function signOut() {
  setSession(null);
}

export function updateNick(nick: string): string | null {
  const n = nick.trim();
  if (n.length < 2 || n.length > 12) return "닉네임은 2~12자로 해요.";
  const me = currentUser();
  if (!me) return "로그인이 필요해요.";
  saveAccounts(loadAccounts().map((a) => (a.id === me.id ? { ...a, nick: n } : a)));
  syncCommunityNick(n);
  return null;
}

export const accountCount = () => loadAccounts().length;
