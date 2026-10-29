"use client";

import { IS_AIT } from "./ait";

/**
 * 미니앱 빌드에서만: 화면 코드가 쓰는 fetch("/api/…") 를 백엔드(NEXT_PUBLIC_API_ORIGIN)로 바로 보내고 세션 토큰을 붙인다.
 * 미니앱은 *.tossmini.com 에서 열려 백엔드와 출처가 달라 쿠키 세션을 쓸 수 없다. 그래서
 *   - 요청마다 X-Session-Transport: bearer 와 (있으면) Authorization: Bearer <토큰>
 *   - 서버가 세션을 만들거나 지우면 응답 헤더 X-Session-Token 으로 알려 주고, 여기서 저장하거나 지운다 (빈 값 = 지움)
 * 호출부 40여 곳은 그대로 두고 이 한 곳만 바꾼다. 웹 빌드에서는 아무것도 하지 않는다.
 * 모듈을 읽는 순간 설치되도록 layout 의 AitRuntime 이 가장 먼저 import 한다 (첫 화면의 fetch 보다 앞선다).
 */
export const SESSION_TOKEN_KEY = "sorow:ait-session";
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_ORIGIN ?? "").replace(/\/+$/, "");

export function readSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveSessionToken(token: string) {
  try {
    if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    else window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* 저장소를 못 쓰면 이번 방문 동안만 로그인이 이어지지 않는다 */
  }
}

/** /api/… 경로면 백엔드 주소를 붙인 URL, 아니면 null */
function apiUrl(url: string): string | null {
  if (url.startsWith("/api/")) return API_ORIGIN + url;
  try {
    const u = new URL(url);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/") ? API_ORIGIN + u.pathname + u.search : null;
  } catch {
    return null;
  }
}

function install() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const target = apiUrl(raw);
    if (!target) return original(input, init);
    const base = input instanceof Request ? new Request(target, input) : null;
    const headers = new Headers(init?.headers ?? base?.headers);
    headers.set("X-Session-Transport", "bearer");
    const token = readSessionToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await original(base ?? target, { ...init, headers, credentials: "omit" });
    const issued = res.headers.get("X-Session-Token");
    if (issued !== null) saveSessionToken(issued);
    return res;
  };
}

if (IS_AIT && typeof window !== "undefined" && API_ORIGIN) install();
