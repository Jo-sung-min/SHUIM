"use client";

import { readAlbumPhoto, readOrb, readOrbToday, type AlbumPhoto, type Orb, type OrbMood, type OrbToday } from "./emotion-orbs";
import { uploadImage } from "./upload";

/**
 * 보관함 서버와 주고받기: 감정구슬과 맵 앨범 (docs/EMOTION_ORBS.md 7장).
 * 이 프로젝트는 새 기능을 서버가 알려 줄 때만 보여 준다: 옛 서버(404)나 이 계정에는 없는 기능(익명 401·403)이면
 * 읽는 쪽은 null 을 돌려주고, 화면은 구슬도 앨범도 없는 것처럼 그린다.
 */

interface Reply { status: number; json: Record<string, unknown> }

async function call(path: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown): Promise<Reply> {
  const res = await fetch(path, {
    method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json: json && typeof json === "object" ? json : {} };
}
const missing = (status: number) => status === 401 || status === 403 || status === 404 || status === 405 || status === 501;
const message = (reply: Reply, fallback: string) => (typeof reply.json.error === "string" && reply.json.error ? reply.json.error : fallback);

/* ---------- 감정구슬 ---------- */

export interface OrbShelf { today: OrbToday | null; orbs: Orb[] }

/** 내 구슬과 오늘 상태. 서버가 구슬을 모르면 null */
export async function fetchOrbShelf(): Promise<OrbShelf | null> {
  const reply = await call("/api/orbs");
  if (missing(reply.status) || reply.json.enabled !== true) return null;
  if (reply.status !== 200) throw new Error(message(reply, "보관함을 불러오지 못했어요."));
  const orbs = (Array.isArray(reply.json.orbs) ? reply.json.orbs : []).map(readOrb).filter((orb): orb is Orb => orb !== null);
  return { today: readOrbToday(reply.json.today), orbs };
}

/**
 * 맵에 머무는 중이라는 신호. 오늘 머문 시간을 돌려준다.
 * "gone": 방문 티켓이 끝났다 (다시 들어가면 이어진다) · null: 이 서버·계정에는 구슬이 없다 (이번 방문에서는 그만 묻는다)
 */
export async function beatOrbStay(ticket: string): Promise<OrbToday | "gone" | null> {
  const reply = await call("/api/orbs/stay", "POST", { ticket });
  if (reply.status === 410) return "gone";
  if (missing(reply.status)) return null;
  if (reply.status !== 200) throw new Error(message(reply, "머문 시간을 확인하지 못했어요."));
  return readOrbToday(reply.json);
}

export type OrbClaim = { orb: Orb } | { refused: "taken" | "early" | "gone" | "missing"; message: string };

/** 줍기. 맵·공간·함께 있던 사람은 서버가 방에서 읽는다. 화면은 그날의 기분과 자리 이름만 보낸다 */
export async function claimOrb(ticket: string, mood: OrbMood, spot: { spotId: string | null; spotName: string }): Promise<OrbClaim> {
  const reply = await call("/api/orbs/claim", "POST", { ticket, mood, ...(spot.spotId ? { spotId: spot.spotId } : {}), spotName: spot.spotName });
  if (reply.status === 200) {
    const orb = readOrb(reply.json);
    if (!orb) throw new Error("구슬을 확인하지 못했어요. 보관함에서 확인해 주세요.");
    return { orb };
  }
  if (reply.status === 409) return { refused: "taken", message: message(reply, "오늘의 구슬은 이미 주웠어요.") };
  if (reply.status === 425) return { refused: "early", message: message(reply, "조금 더 머물러 주세요.") };
  if (reply.status === 410) return { refused: "gone", message: "다시 들어온 뒤 주워 주세요." };
  if (missing(reply.status)) return { refused: "missing", message: message(reply, "지금은 주울 수 없어요.") };
  throw new Error(message(reply, "구슬을 줍지 못했어요. 다시 눌러 주세요."));
}

/** 내려놓기: 보관함에서 지운다 (그날 다시 얻을 수는 없다) */
export async function dropOrb(id: string): Promise<void> {
  const reply = await call(`/api/orbs/${encodeURIComponent(id)}`, "DELETE");
  if (reply.status !== 200 && reply.status !== 404) throw new Error(message(reply, "구슬을 내려놓지 못했어요. 다시 시도해 주세요."));
}

/* ---------- 맵 앨범 ---------- */

export interface Album { max: number; photos: AlbumPhoto[] }

/** 내 앨범. 서버가 앨범을 모르면 null */
export async function fetchAlbum(): Promise<Album | null> {
  const reply = await call("/api/album");
  if (missing(reply.status) || reply.json.enabled !== true) return null;
  if (reply.status !== 200) throw new Error(message(reply, "앨범을 불러오지 못했어요."));
  const photos = (Array.isArray(reply.json.photos) ? reply.json.photos : []).map(readAlbumPhoto).filter((photo): photo is AlbumPhoto => photo !== null);
  const max = typeof reply.json.max === "number" && reply.json.max > 0 ? reply.json.max : 100;
  return { max, photos };
}

let albumProbe: Promise<boolean> | null = null;
/** 이 서버·계정에 앨범이 있는지 (맵의 사진 미리보기가 "앨범에 넣기"를 보일지). 한 번 알아내면 이 화면에서는 다시 묻지 않는다 */
export function albumAvailable(): Promise<boolean> {
  albumProbe ??= fetchAlbum().then((album) => album !== null).catch(() => { albumProbe = null; return false; });
  return albumProbe;
}

/**
 * 맵에서 찍은 사진을 앨범에 넣는다: 기존 사진 첨부와 같은 길로 올리고(긴 변 1600px, WebP) 앨범에 적는다.
 * 방문 티켓이 살아 있으면 맵과 공간 이름은 서버가 방문에서 읽는다
 */
export async function addToAlbum(file: File, where: { ticket: string | null; mapId: string }, onProgress?: (percent: number) => void): Promise<AlbumPhoto> {
  const uploaded = await uploadImage(file, { onProgress });
  const reply = await call("/api/album", "POST", { url: uploaded.url, mapId: where.mapId, ...(where.ticket ? { ticket: where.ticket } : {}) });
  if (reply.status !== 200) throw new Error(message(reply, "앨범에 넣지 못했어요. 다시 시도해 주세요."));
  const photo = readAlbumPhoto(reply.json);
  if (!photo) throw new Error("앨범에 넣은 사진을 확인하지 못했어요. 보관함에서 확인해 주세요.");
  return photo;
}

export async function removeAlbumPhoto(id: string): Promise<void> {
  const reply = await call(`/api/album/${encodeURIComponent(id)}`, "DELETE");
  if (reply.status !== 200 && reply.status !== 404) throw new Error(message(reply, "사진을 지우지 못했어요. 다시 시도해 주세요."));
}
