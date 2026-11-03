"use client";

/**
 * 바닷가 서버와 주고받기. 서버는 메모리 방(/api/beach, BeachRoom) 하나다.
 *  - enter: 세션으로 한 번 인증하고 티켓을 받는다 (여기서만 DB 를 쓴다)
 *  - tick:  내 위치를 올리고 다른 사람들·받은 위로를 내려받는다 (티켓만으로, 움직일 땐 0.5초, 서 있으면 1.5초마다)
 *  - leave: 나간다 (탭을 닫을 때도 keepalive 로 보낸다)
 * 티켓이 만료되면(10초 넘게 tick 이 없었을 때) 410 이 오고, 화면은 다시 enter 한다.
 */
export interface EnterResponse {
  ticket: string;
  me: { pid: string; id: string; nick: string; skin: number };
  spawn: { x: number; z: number; yaw: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  count: number;
}

export interface RemotePlayer {
  pid: string;
  id: string;
  nick: string;
  skin: number;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
}

export type CareKind = "comfort" | "hug";

export interface CareEvent {
  kind: CareKind;
  fromPid: string;
  fromId: string;
  fromNick: string;
  toPid: string;
  toId: string;
  toNick: string;
  at: number;
}

export interface TickRequest {
  ticket: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  care?: { to: string; kind: CareKind };
}

export interface TickResponse {
  players: RemotePlayer[];
  events: CareEvent[];
  count: number;
  received: { comfort: number; hug: number };
  care?: "sent" | "cooldown" | "gone";
}

/** 티켓이 더는 유효하지 않다 (오래 자리를 비웠거나 서버가 다시 떴다) */
export class BeachGone extends Error {
  constructor() {
    super("바닷가에서 나와 있었어요. 다시 들어가요.");
    this.name = "BeachGone";
  }
}

async function post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  if (res.status === 410) throw new BeachGone();
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
  return json;
}

export const enterBeach = () => post<EnterResponse>("/api/beach/enter", {});
export const tickBeach = (body: TickRequest) => post<TickResponse>("/api/beach/tick", body);

/** 나가기. 화면을 닫는 중에도 끝까지 가도록 keepalive. 실패해도 10초 뒤 서버가 알아서 치운다 */
export function leaveBeach(ticket: string): void {
  post("/api/beach/leave", { ticket }, { keepalive: true }).catch(() => {});
}

/** 지금 바닷가에 있는 사람 수 (홈 카드용) */
export async function fetchBeachCount(): Promise<number> {
  try {
    const res = await fetch("/api/beach/count", { credentials: "same-origin", cache: "no-store" });
    const json = (await res.json()) as { count?: number };
    return res.ok && typeof json.count === "number" ? json.count : 0;
  } catch {
    return 0;
  }
}
