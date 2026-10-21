"use client";
import { sessionUserId } from "./storage";

export const COMMUNITY_TERMS_VERSION = "2026-10-21";
let pending: Promise<boolean> | null = null;

/** Shown before posting, uploading or sending a message, including anonymous use. */
export function requestCommunityConsent(): Promise<boolean> {
  const key = `sorow:community-terms:${COMMUNITY_TERMS_VERSION}:${sessionUserId() || "guest"}`;
  try { if (localStorage.getItem(key) === "accepted") return Promise.resolve(true); } catch { /* ask again */ }
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent("sorow:community-consent", { detail: (accepted: boolean) => {
      if (accepted) { try { localStorage.setItem(key, "accepted"); } catch { /* consent is valid for this request */ } }
      resolve(accepted);
    } }));
  }).finally(() => { pending = null; });
  return pending;
}

export async function requireCommunityConsent() {
  if (!await requestCommunityConsent()) throw new Error("커뮤니티 기준에 동의한 뒤 이용할 수 있어요.");
  const response = await fetch("/api/community/consent", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: COMMUNITY_TERMS_VERSION }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "커뮤니티 동의를 저장하지 못했어요. 다시 시도해 주세요.");
  }
}
