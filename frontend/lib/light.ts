"use client";

import { sessionUserId } from "./storage";

/** 별 지갑 클라이언트. 잔액·내역은 서버가 소유하고, 여기서는 받아서 보여 주기만 한다. */

export interface LightEntry {
  id: string;
  /** daily | gift_sent | gift_received */
  reason: string;
  amount: number;
  balanceAfter: number;
  createdAt: number;
  /** 주고받은 상대 (오늘의 별이거나 상대가 떠났으면 없다) */
  nick?: string | null;
}

export interface LightWallet {
  balance: number;
  totalReceived: number;
  totalGiven: number;
  /** 오늘의 별을 이미 받았는지 */
  dailyClaimed: boolean;
  dailyLight: number;
  maxGift: number;
  perPersonDaily: number;
  history: LightEntry[];
}

const whole = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Never turn an outage or an incomplete response into a zero balance. */
export function parseLightWallet(value: unknown): LightWallet {
  if (!object(value)
    || ![value.balance, value.totalReceived, value.totalGiven, value.dailyLight, value.maxGift, value.perPersonDaily].every(whole)
    || Number(value.dailyLight) <= 0 || Number(value.maxGift) <= 0 || Number(value.perPersonDaily) <= 0
    || typeof value.dailyClaimed !== "boolean"
    || !Array.isArray(value.history) || !value.history.every((entry) => object(entry)
      && typeof entry.id === "string" && typeof entry.reason === "string"
      && typeof entry.amount === "number" && Number.isSafeInteger(entry.amount) && entry.amount !== 0 && whole(entry.balanceAfter)
      && whole(entry.createdAt) && entry.createdAt > 0 && entry.createdAt < 8.64e15
      && (entry.nick === undefined || entry.nick === null || typeof entry.nick === "string"))) {
    throw new Error("별 정보를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return value as unknown as LightWallet;
}

/** 별이 아직 없는 서버(화면이 서버보다 먼저 바뀐 동안)는 404 를 준다. 서버의 영어 오류 대신 기다려 달라고 알린다. */
export const LIGHT_NOT_READY = "별을 준비하고 있어요. 잠시 뒤에 다시 열어 주세요.";

async function request(userId: string, path: string, method: "GET" | "POST", signal?: AbortSignal): Promise<LightWallet> {
  const assertSession = () => {
    if (!userId || sessionUserId() !== userId) throw new Error("계정이 변경되었어요. 화면을 다시 열어 주세요.");
  };
  assertSession();
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", signal });
  const body: unknown = await response.json().catch(() => null);
  assertSession();
  if (response.status === 404) throw new Error(LIGHT_NOT_READY);
  if (!response.ok) throw new Error(object(body) && typeof body.error === "string" ? body.error : "별을 불러오지 못했어요. 다시 시도해 주세요.");
  return parseLightWallet(body);
}

/** Private, server-authoritative data: no browser cache and no locally computed balance. */
export const fetchLight = (userId: string, signal?: AbortSignal) => request(userId, "/api/light/me", "GET", signal);
/** 오늘의 별 받기 (하루 한 번, 다시 눌러도 그대로) */
export const claimDailyLight = (userId: string) => request(userId, "/api/light/daily", "POST");

/** 내역 한 줄의 문구. 모르는 사유도 그냥 글자로만 보여 준다. */
export function lightReason(entry: Pick<LightEntry, "reason" | "nick">): string {
  const nick = typeof entry.nick === "string" && entry.nick.trim() ? entry.nick.trim() : null;
  if (entry.reason === "daily") return "오늘의 별";
  if (entry.reason === "gift_sent") return nick ? `${nick} 님에게 건넸어요` : "별을 건넸어요";
  if (entry.reason === "gift_received") return nick ? `${nick} 님이 건넸어요` : "별을 받았어요";
  return "별";
}

/**
 * 한 번의 "별 주기"에 붙는 요청 번호. 같은 글·같은 양을 다시 보내면(연결 끊김 뒤 재시도) 같은 번호를 써서 두 번 빠져나가지 않고,
 * 성공하면 done() 으로 비워 다음에는 새 번호를 쓴다.
 */
export function giftRequests(newId: () => string = () => crypto.randomUUID()) {
  let pending: { key: string; id: string } | null = null;
  return {
    idFor(postId: string, amount: number): string {
      const key = `${postId}:${amount}`;
      if (pending?.key !== key) pending = { key, id: newId() };
      return pending.id;
    },
    done() { pending = null; },
  };
}
