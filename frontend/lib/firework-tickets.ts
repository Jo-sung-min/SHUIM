"use client";

/**
 * 폭죽 이용권: 3D 공간에서 불꽃놀이를 한 번 쏠 수 있는 권리.
 * 온기 포인트 1,000 P 로 사거나 후원 기업 멋져요로 받고, 카카오로 새로 가입하면 5장을 선물받는다. 잔액·내역은 서버만 안다(브라우저 캐시 없음).
 */

export type FireworkTicketReason = "points_buy" | "sponsor_cheer" | "kakao_signup" | "launch";
export interface FireworkTicketEntry { id: string; reason: FireworkTicketReason; amount: number; balanceAfter: number; createdAt: number; sponsorName?: string }
export interface FireworkTicketAccount {
  tickets: number;
  points: number;
  ticketPrice: number;
  /** 오늘(한국 시간) 멋져요를 보낸 기업 id */
  cheeredToday: string[];
  cheersLeftToday: number;
  dailyCheers: number;
  history: FireworkTicketEntry[];
}
export interface FireworkTicketPurchase { tickets: number; points: number }

export const FIREWORK_TICKET_PRICE = 1000;
const REASONS: Record<FireworkTicketReason, string> = { points_buy: "온기 포인트로 샀어요", sponsor_cheer: "후원 기업 멋져요로 받았어요", kakao_signup: "카카오 가입 선물로 받았어요", launch: "불꽃놀이를 쏘았어요" };
export const fireworkTicketReason = (reason: string): string => Object.hasOwn(REASONS, reason) ? REASONS[reason as FireworkTicketReason] : "폭죽 이용권";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parseFireworkTicketAccount(value: unknown): FireworkTicketAccount {
  if (!object(value) || !count(value.tickets) || !count(value.points) || !count(value.ticketPrice) || value.ticketPrice <= 0
    || !count(value.cheersLeftToday) || !count(value.dailyCheers)
    || !Array.isArray(value.cheeredToday) || !value.cheeredToday.every((id) => typeof id === "string")
    || !Array.isArray(value.history) || !value.history.every((entry) => object(entry) && typeof entry.id === "string"
      && Object.hasOwn(REASONS, String(entry.reason)) && typeof entry.amount === "number" && Number.isSafeInteger(entry.amount)
      && count(entry.balanceAfter) && count(entry.createdAt) && entry.createdAt > 0
      && (entry.sponsorName === undefined || typeof entry.sponsorName === "string"))) {
    throw new Error("폭죽 이용권 정보를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return value as unknown as FireworkTicketAccount;
}

export class FireworkTicketError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.name = "FireworkTicketError"; this.status = status; }
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new FireworkTicketError(object(body) && typeof body.error === "string" ? body.error : "폭죽 이용권을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", response.status);
  return body;
}

/** 로그인한 가입 회원만. 비회원은 401 (FireworkTicketError.status). */
export async function fetchFireworkTickets(signal?: AbortSignal): Promise<FireworkTicketAccount> {
  return parseFireworkTicketAccount(await request("/api/fireworks/me", { signal }));
}

/** 같은 requestId 로 다시 보내면 두 번 사지 않는다. */
export async function buyFireworkTicket(requestId: string): Promise<FireworkTicketPurchase> {
  const body = await request("/api/fireworks/tickets/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) });
  if (!object(body) || !count(body.tickets) || !count(body.points)) throw new Error("구매 결과를 확인하지 못했어요. 이용권 수를 다시 확인해 주세요.");
  return { tickets: body.tickets, points: body.points };
}
