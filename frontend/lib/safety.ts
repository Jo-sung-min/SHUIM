"use client";
import { showToast } from "./toast";

export const POLICY_VERSION = "2026-10-21";
export interface PolicyConsent { version: string; userId: string | null; signupAccepted: boolean; aiAccepted: boolean }
export interface PolicyConsentInput { signupConsentVersion: string; aiDisclosureAccepted: boolean; expectedUserId: string | null }

export async function fetchPolicyConsent(): Promise<PolicyConsent> {
  const response = await fetch("/api/auth/consent", { credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.signupAccepted !== "boolean" || typeof result.aiAccepted !== "boolean") throw new Error(result.error || "이용 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  return { version: result.version, userId: result.userId ?? null, signupAccepted: result.version === POLICY_VERSION && result.signupAccepted, aiAccepted: result.version === POLICY_VERSION && result.aiAccepted };
}

export async function acceptPolicyConsent(input: PolicyConsentInput): Promise<PolicyConsent> {
  const response = await fetch("/api/auth/consent", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "이용 설정을 저장하지 못했어요. 다시 시도해 주세요.");
  return result as PolicyConsent;
}

export async function fetchBlocks(): Promise<string[]> {
  const response = await fetch("/api/blocks", { credentials: "same-origin", cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "차단 목록을 불러오지 못했어요.");
  return result.userIds;
}

export async function setUserBlocked(userId: string, blocked: boolean) {
  const response = await fetch(blocked ? "/api/blocks" : `/api/blocks/${encodeURIComponent(userId)}`, {
    method: blocked ? "POST" : "DELETE", credentials: "same-origin",
    headers: blocked ? { "Content-Type": "application/json" } : undefined,
    body: blocked ? JSON.stringify({ userId }) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "차단 설정을 바꾸지 못했어요.");
}

/** Consent is stored by account, checked without a dialog, and enforced again by the AI API. */
export async function requestAiProcessing(): Promise<boolean> {
  try {
    const consent = await fetchPolicyConsent();
    if (consent.signupAccepted && consent.aiAccepted) return true;
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/info/ai?next=${encodeURIComponent(next)}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "AI 이용 설정을 확인하지 못했어요.");
  }
  return false;
}
