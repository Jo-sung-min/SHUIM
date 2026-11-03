"use client";

import { sessionUserId } from "./storage";

export interface PointEntry {
  id: string;
  reason: string;
  amount: number;
  balanceAfter: number;
  createdAt: number;
}

export interface PointsWallet {
  balance: number;
  totalEarned: number;
  todayEarned: number;
  dailyLimit: number;
  writingEarnedToday: number;
  writingDailyLimit: number;
  rules: string[];
  history: PointEntry[];
}

const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Never turn an outage or an incomplete response into a zero balance. */
export function parsePointsWallet(value: unknown): PointsWallet {
  if (!object(value)
    || ![value.balance, value.totalEarned, value.todayEarned, value.dailyLimit, value.writingEarnedToday, value.writingDailyLimit].every(whole)
    || Number(value.dailyLimit) <= 0 || Number(value.writingDailyLimit) <= 0
    || Number(value.todayEarned) > Number(value.dailyLimit) || Number(value.writingEarnedToday) > Number(value.writingDailyLimit)
    || !Array.isArray(value.rules) || !value.rules.every((rule) => typeof rule === "string")
    || !Array.isArray(value.history) || !value.history.every((entry) => object(entry)
      && typeof entry.id === "string" && typeof entry.reason === "string"
      && whole(entry.amount) && whole(entry.balanceAfter)
      && whole(entry.createdAt) && entry.createdAt > 0 && entry.createdAt < 8.64e15)) {
    throw new Error("포인트 정보를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return value as unknown as PointsWallet;
}

/** Private, server-authoritative data: no browser cache, local awards or persisted ledger. */
export async function fetchPoints(userId: string, signal?: AbortSignal): Promise<PointsWallet> {
  const assertSession = () => {
    if (!userId || sessionUserId() !== userId) throw new Error("계정이 변경되었어요. 화면을 다시 열어 주세요.");
  };
  assertSession();
  const response = await fetch("/api/points/me", { credentials: "same-origin", cache: "no-store", signal });
  const body: unknown = await response.json().catch(() => null);
  assertSession();
  if (!response.ok) throw new Error(object(body) && typeof body.error === "string" ? body.error : "포인트를 불러오지 못했어요. 다시 시도해 주세요.");
  return parsePointsWallet(body);
}

const REASONS: Record<string, string> = {
  comfort_write: "위로 한마디를 남겼어요",
  comfort_accepted: "글쓴이가 내 위로를 채택했어요",
  cheers_5: "힘내요 5개를 받았어요",
  cheers_15: "힘내요 15개를 받았어요",
  cheers_30: "힘내요 30개를 받았어요",
};
export const pointReason = (reason: string): string => Object.hasOwn(REASONS, reason) ? REASONS[reason] : "온기 포인트 적립";

/** Auth refreshes also update a timestamp. Only a different identity invalidates another tab. */
export function pointsSessionChanged(before: string | null, after: string | null): boolean {
  const identity = (value: string | null) => {
    try {
      const parsed: unknown = JSON.parse(value ?? "null");
      return object(parsed) && typeof parsed.userId === "string" ? parsed.userId : null;
    } catch { return null; }
  };
  return identity(before) !== identity(after);
}
