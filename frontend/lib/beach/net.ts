"use client";

import type { BeachCharacter } from "./appearance";
import type { MapId } from "./maps";
import type { RoomMusicState } from "./room-music";

/**
 * 바닷가 서버와 주고받기. 각 소로우에 멤버 전용 방(/api/beach, BeachRoom)이 하나씩 있다.
 *  - enter: 세션으로 한 번 인증하고 티켓을 받는다 (여기서만 DB 를 쓴다)
 *  - tick: 내 위치와 받은 행동을 주고받는다. 행동을 보낼 때는 서버가 현재 로그인·권한도 확인한다.
 *  - leave: 나간다 (탭을 닫을 때도 keepalive 로 보낸다)
 * 10초 이상 소식이 없으면 active 자리를 해제하고, 30분 이내에는 인증된 재입장으로 최근 위치를 복원한다.
 */
export interface EnterResponse {
  resumed?: boolean;
  sequence?: number;
  selfRest?: RestPresence;
  mapId: MapId;
  communityId: string;
  community: { id: string; slug: string; name: string };
  capacity: number;
  ticket: string;
  me: { pid: string; id: string; nick: string; skin: number };
  spawn: { x: number; z: number; yaw: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  count: number;
  fire: FireState;
  fireEnabled?: boolean;
  restEnabled?: boolean;
  bedEnabled?: boolean;
  benchEnabled?: boolean;
  onsenEnabled?: boolean;
  /** Bamboo-trail pavilions: shared edge seats claimed through the rest API. */
  pavilionEnabled?: boolean;
  festival?: BambooFestivalState;
  careCapabilities?: CareCapabilities;
  lighting?: RoomLighting | null;
  lightingControl?: boolean;
  music?: RoomMusicState;
  musicControl?: boolean;
  fireworksControl?: boolean;
  /** Administrators launch for free with every style; members spend firework tickets. */
  fireworksFree?: boolean;
  /** The member's remaining firework tickets (absent for administrators). */
  fireworkTickets?: number;
  fireworks?: FireworkEvent[];
  fireworksCooldownUntil?: number;
  uyuniMomentsEnabled?: boolean;
  uyuniMoments?: UyuniMoment[];
  uyuniMomentCooldowns?: UyuniMomentCooldowns;
  serverTime?: number;
}

export type SparklerLetter = "L" | "O" | "V" | "E" | "heart" | "star";
export type WishLanternColor = "amber" | "rose" | "mint" | "sky" | "violet";
export type UyuniMomentInput = { kind: "sparkler"; letter: SparklerLetter }
  | { kind: "lantern"; color: WishLanternColor; wish: string };
export interface UyuniMoment {
  id: string; kind: "sparkler" | "lantern"; fromPid: string; fromNick: string;
  x: number; z: number; yaw: number; startedAt: number; durationMs: number;
  letter?: SparklerLetter; color?: WishLanternColor; wish?: string;
}
export interface UyuniMomentCooldowns { sparkler: number; lantern: number }
export interface UyuniMomentLaunch { event: UyuniMoment; serverTime: number; cooldowns: UyuniMomentCooldowns }

const isSparklerLetter = (value: unknown): value is SparklerLetter => ["L", "O", "V", "E", "heart", "star"].includes(value as string);
const isWishLanternColor = (value: unknown): value is WishLanternColor => ["amber", "rose", "mint", "sky", "violet"].includes(value as string);
const validWish = (value: unknown): value is string => typeof value === "string" && value === value.trim()
  && Array.from(value).length >= 1 && Array.from(value).length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);

/** Only finite, bounded room events may create a drawing or a wish texture. */
export function readUyuniMoment(value: unknown): UyuniMoment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as UyuniMoment;
  if (!Object.keys(event).every(key => ["id", "kind", "fromPid", "fromNick", "x", "z", "yaw", "startedAt", "durationMs", "letter", "color", "wish"].includes(key))
    || typeof event.id !== "string" || !UUID_PATTERN.test(event.id)
    || typeof event.fromPid !== "string" || !event.fromPid || event.fromPid.length > 100
    || typeof event.fromNick !== "string" || Array.from(event.fromNick).length > 100
    || ![event.x, event.z, event.yaw].every(Number.isFinite) || Math.abs(event.x) > 22 || event.z < -50 || event.z > 55 || Math.abs(event.yaw) > Math.PI + 0.001
    || !isTime(event.startedAt) || event.startedAt > Number.MAX_SAFE_INTEGER - 40_000) return null;
  const base = { id: event.id.toLowerCase(), kind: event.kind, fromPid: event.fromPid, fromNick: event.fromNick,
    x: event.x, z: event.z, yaw: event.yaw, startedAt: event.startedAt, durationMs: event.durationMs };
  if (event.kind === "sparkler" && event.durationMs === 12_000 && isSparklerLetter(event.letter) && event.color == null && event.wish == null)
    return { ...base, letter: event.letter };
  if (event.kind === "lantern" && event.durationMs === 40_000 && isWishLanternColor(event.color) && validWish(event.wish) && event.letter == null)
    return { ...base, color: event.color, wish: event.wish };
  return null;
}

function readMomentCooldowns(value: unknown, serverTime: number): UyuniMomentCooldowns | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as UyuniMomentCooldowns;
  return isTime(state.sparkler) && isTime(state.lantern)
    && state.sparkler <= serverTime + 4_000 && state.lantern <= serverTime + 8_000
    ? { sparkler: state.sparkler, lantern: state.lantern } : null;
}

function readUyuniMomentsState(response: { uyuniMoments?: unknown; uyuniMomentCooldowns?: unknown; serverTime?: unknown }) {
  if (response.uyuniMoments === undefined && response.uyuniMomentCooldowns === undefined)
    return { events: [] as UyuniMoment[], cooldowns: { sparkler: 0, lantern: 0 }, supported: false };
  const error = () => new Error("빛과 소원등을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (!Array.isArray(response.uyuniMoments) || response.uyuniMoments.length > 64 || !isTime(response.serverTime)) throw error();
  const cooldowns = readMomentCooldowns(response.uyuniMomentCooldowns, response.serverTime);
  if (!cooldowns) throw error();
  const unique = new Map<string, UyuniMoment>();
  for (const value of response.uyuniMoments) {
    const event = readUyuniMoment(value);
    if (!event || event.startedAt > response.serverTime) throw error();
    const previous = unique.get(event.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw error();
    if (response.serverTime < event.startedAt + event.durationMs) unique.set(event.id, event);
  }
  const events = Array.from(unique.values()).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  if (events.filter(e => e.kind === "sparkler").length > 32 || events.filter(e => e.kind === "lantern").length > 32) throw error();
  return { events, cooldowns, supported: true };
}

export type FireworkVariant = "festival" | "songi" | "love" | "bloom" | "saturn" | "willow" | "stardust" | "offbeat" | "aurora" | "jewels";
export interface FireworkEvent { id: string; seed: number; startedAt: number; durationMs: number; variant?: FireworkVariant }
export interface FireworkLaunch { event: FireworkEvent; serverTime: number; cooldownUntil: number; tickets?: number }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isFireworkVariant = (value: unknown): value is FireworkVariant =>
  typeof value === "string" && ["festival", "songi", "love", "bloom", "saturn", "willow", "stardust", "offbeat", "aurora", "jewels"].includes(value);
const MAX_FIREWORK_COOLDOWN_MS = 21_000;
const fireworkCooldownMs = (event: FireworkEvent) => event.durationMs + 3_000;

/** Only a bounded server event can allocate fireworks particles. */
export function readFireworkEvent(value: unknown): FireworkEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as FireworkEvent;
  if (![4, 5].includes(Object.keys(event).length) || !Object.keys(event).every(key => ["id", "seed", "startedAt", "durationMs", "variant"].includes(key))
    || typeof event.id !== "string" || !UUID_PATTERN.test(event.id)
    || !Number.isSafeInteger(event.seed) || event.seed < 1 || event.seed >= 2_147_483_647
    || !isTime(event.startedAt) || event.startedAt > Number.MAX_SAFE_INTEGER - MAX_FIREWORK_COOLDOWN_MS
    || (event.durationMs !== 12_000 && !(event.variant === "songi" && event.durationMs === 18_000))
    || (Object.hasOwn(event, "variant") && !isFireworkVariant(event.variant))) return null;
  return { id: event.id.toLowerCase(), seed: event.seed, startedAt: event.startedAt, durationMs: event.durationMs, variant: event.variant ?? "festival" };
}

function readFireworksState(response: { fireworks?: unknown; fireworksCooldownUntil?: unknown; serverTime?: unknown }) {
  if (response.fireworks === undefined && response.fireworksCooldownUntil === undefined) return { fireworks: [], fireworksCooldownUntil: 0, supported: false };
  if (!Array.isArray(response.fireworks) || response.fireworks.length > 2 || !isTime(response.serverTime)
    || !isTime(response.fireworksCooldownUntil) || response.fireworksCooldownUntil > response.serverTime + MAX_FIREWORK_COOLDOWN_MS) {
    throw new Error("불꽃놀이 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const unique = new Map<string, FireworkEvent>();
  for (const value of response.fireworks) {
    const event = readFireworkEvent(value);
    if (!event || event.startedAt > response.serverTime || response.fireworksCooldownUntil < event.startedAt + fireworkCooldownMs(event)) {
      throw new Error("불꽃놀이 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    const previous = unique.get(event.id);
    if (previous && (previous.seed !== event.seed || previous.startedAt !== event.startedAt || previous.variant !== event.variant)) throw new Error("불꽃놀이 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    if (response.serverTime < event.startedAt + event.durationMs) unique.set(event.id, event);
  }
  return { fireworks: Array.from(unique.values()).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)),
    fireworksCooldownUntil: response.fireworksCooldownUntil, supported: true };
}

export type RoomLightingMode = "auto" | "day" | "sunset" | "night";
export interface RoomLighting { mode: RoomLightingMode; hour: number | null; version: number }

/** Only the server's supported time presets can replace a room's clock. */
export function readRoomLighting(value: unknown): RoomLighting | null {
  if (!value || typeof value !== "object") return null;
  const state = value as RoomLighting;
  const hours: Record<RoomLightingMode, number | null> = { auto: null, day: 12, sunset: 18, night: 20 };
  if (!Object.prototype.hasOwnProperty.call(hours, state.mode) || state.hour !== hours[state.mode]
    || !Number.isSafeInteger(state.version) || state.version < 0) return null;
  return { mode: state.mode, hour: state.hour, version: state.version };
}

/** A shared rest slot is assigned by the server, never claimed locally. */
export interface RestPresence {
  pose: "standing" | "lying" | "sitting";
  spotId: string | null;
  slot: number | null;
  x: number;
  z: number;
  yaw: number;
}

export type FireColor = "amber" | "rose" | "aurora" | "ocean" | "violet";
export type PopColor = Exclude<FireColor, "amber">;
export type PowderColor = PopColor | "rainbow";
export interface FirePowder {
  id: string;
  color: PowderColor;
  startedAt: number;
  expiresAt: number;
}
export interface FireState {
  logs: number;
  maxLogs: number;
  intensity: number;
  color: FireColor;
  colorExpiresAt?: number | null;
  serverTime: number;
  nextLogBurnAt?: number | null;
  queueEndsAt?: number | null;
  queuedPops: number;
  powderEnabled?: boolean;
  powder?: FirePowder | null;
}

export interface RemotePlayer {
  updatedAt?: number;
  festival?: BambooFestivalState;
  pid: string;
  id: string;
  nick: string;
  skin: number;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  pose?: RestPresence["pose"];
  spotId?: string | null;
  slot?: number | null;
}

export type BambooToy = "balloon" | "fan" | "propeller";
export interface PropellerFlight { id: string; x: number; z: number; yaw: number; startedAt: number; durationMs: number }
export interface BambooFestivalState { held: BambooToy | null; flight: PropellerFlight | null; balloonHue?: number | null }

function readFestival(value: BambooFestivalState | undefined): BambooFestivalState | undefined {
  if (!value || (value.held !== null && !["balloon", "fan", "propeller"].includes(value.held))) return undefined;
  const f = value.flight;
  if (f !== null && (!f || !UUID_PATTERN.test(f.id) || !isTime(f.startedAt) || f.durationMs !== 6000
    || ![f.x, f.z, f.yaw].every(Number.isFinite) || Math.abs(f.x) > 44 || f.z < -4 || f.z > 115)) return undefined;
  if (value.balloonHue != null && (!Number.isInteger(value.balloonHue) || value.balloonHue < 0 || value.balloonHue >= 360))
    return { ...value, balloonHue: null };
  return value;
}

export async function chooseBambooToy(ticket: string, requestId: string, choice: BambooToy | "put-away") {
  const result = await post<{ festival: BambooFestivalState; serverTime: number }>("/api/beach/festival",
    { ticket, requestId, choice }, { signal: AbortSignal.timeout(8000) });
  if (!isTime(result.serverTime) || !readFestival(result.festival)) throw new Error("축제 소품을 확인하지 못했어요. 다시 눌러 주세요.");
  return result;
}

export type CareKind = "comfort" | "hug" | "wave";

export interface CareCapabilities {
  wave: boolean;
  hug: boolean;
}

/** Missing or malformed permission data never grants a new action. */
function readCareCapabilities(value: unknown): CareCapabilities {
  if (!value || typeof value !== "object") return { wave: false, hug: false };
  const data = value as Record<string, unknown>;
  return { wave: data.wave === true, hug: data.hug === true };
}

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
  sequence?: number;
  ticket: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  character?: BeachCharacter;
  care?: { to: string; kind: CareKind };
}

export interface TickResponse {
  sequence?: number;
  players: RemotePlayer[];
  events: CareEvent[];
  count: number;
  received: { comfort: number; hug: number; wave?: number };
  care?: "sent" | "cooldown" | "gone" | "forbidden";
  careCapabilities?: CareCapabilities | null;
  fire: FireState;
  selfRest?: RestPresence;
  lighting?: RoomLighting | null;
  music?: RoomMusicState;
  fireworks?: FireworkEvent[];
  fireworksCooldownUntil?: number;
  uyuniMoments?: UyuniMoment[];
  uyuniMomentCooldowns?: UyuniMomentCooldowns;
  serverTime?: number;
}

export interface BeachCount {
  mapId: MapId;
  communityId: string;
  count: number;
  capacity: number;
}

/** 입장 자격 변경이나 만석은 자동 재시도로 숨기지 않고 안내한다. */
export class BeachUnavailable extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BeachUnavailable";
    this.status = status;
  }
}

/** 티켓이 더는 유효하지 않다 (오래 자리를 비웠거나 서버가 다시 떴다) */
export class BeachGone extends Error {
  constructor() {
    super("바닷가에서 나와 있었어요. 다시 들어가요.");
    this.name = "BeachGone";
  }
}

/** A temporary shared action cooldown does not make the room unavailable. */
export class BeachCooldown extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeachCooldown";
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
  if (!res.ok) {
    const message = json.error ?? `요청 실패 (${res.status})`;
    if (res.status === 429) throw new BeachCooldown(message);
    // 402: the member has no firework ticket left (the scene opens the ticket sheet).
    if ([400, 401, 402, 403, 404, 409].includes(res.status)) throw new BeachUnavailable(message, res.status);
    throw new Error(message);
  }
  return json;
}

function acceptsMap(actual: unknown, requested: MapId): boolean {
  return actual === requested || (requested === "beach" && actual === undefined);
}

function requireMap(mapId: MapId): void {
  if (mapId !== "beach" && mapId !== "uyuni" && mapId !== "bamboo" && mapId !== "garden") throw new BeachUnavailable("다시 쉴 곳을 골라 주세요.", 400);
}

export async function enterBeach(communityId: string, character?: BeachCharacter, mapId: MapId = "beach",
  resume?: { ticket: string; sequence: number }, signal?: AbortSignal): Promise<EnterResponse> {
  requireMap(mapId);
  const response = await post<EnterResponse>("/api/beach/enter", { communityId, character, ...(mapId === "beach" ? {} : { mapId }),
    ...(resume ? { resumeTicket: resume.ticket, sequence: resume.sequence } : {}) },
    { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
  if (!acceptsMap(response.mapId, mapId)) {
    if (typeof response.ticket === "string" && response.ticket) leaveBeach(response.ticket);
    throw new BeachUnavailable("선택한 곳의 입장을 확인하지 못했어요. 소로우에서 다시 골라 주세요.", 409);
  }
  const lighting = readRoomLighting(response.lighting);
  if (response.selfRest != null && !validRestPresence(response.selfRest)) throw new Error("머물던 자리를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (response.sequence !== undefined && (!Number.isSafeInteger(response.sequence) || response.sequence < 0)) throw new Error("방문 순서를 확인하지 못했어요.");
  const fireworks = readFireworksState(response);
  const moments = readUyuniMomentsState(response);
  return { ...response, mapId, fireEnabled: mapId === "beach" && (response.fireEnabled === undefined || response.fireEnabled === true),
    bedEnabled: response.bedEnabled === true, benchEnabled: mapId === "beach" && response.benchEnabled === true,
    careCapabilities: readCareCapabilities(response.careCapabilities), lighting,
    lightingControl: response.lightingControl === true && lighting !== null, onsenEnabled: mapId === "beach" && response.onsenEnabled === true,
    pavilionEnabled: (mapId === "bamboo" || mapId === "garden") && response.pavilionEnabled === true,
    festival: mapId === "bamboo" ? readFestival(response.festival) : undefined,
    fireworksControl: response.fireworksControl === true && fireworks.supported,
    fireworksFree: response.fireworksFree === true,
    fireworkTickets: isTime(response.fireworkTickets) ? response.fireworkTickets : undefined,
    uyuniMomentsEnabled: mapId === "uyuni" && response.uyuniMomentsEnabled === true && moments.supported,
    uyuniMoments: mapId === "uyuni" ? moments.events : [], uyuniMomentCooldowns: moments.cooldowns,
    fireworks: fireworks.fireworks, fireworksCooldownUntil: fireworks.fireworksCooldownUntil };
}

export async function tickBeach(body: TickRequest, signal?: AbortSignal): Promise<TickResponse> {
  const response = await post<TickResponse>("/api/beach/tick", body,
    { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
  if (response.sequence !== undefined && (!Number.isSafeInteger(response.sequence) || response.sequence < 0)) throw new Error("방문 순서를 확인하지 못했어요.");
  if (response.selfRest != null && !validRestPresence(response.selfRest)) throw new Error("쉴 자리의 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  if (response.lighting != null) {
    const lighting = readRoomLighting(response.lighting);
    if (!lighting) throw new Error("방의 시간을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    response.lighting = lighting;
  }
  const fireworks = readFireworksState(response);
  response.fireworks = fireworks.fireworks;
  response.fireworksCooldownUntil = fireworks.fireworksCooldownUntil;
  const moments = readUyuniMomentsState(response);
  response.uyuniMoments = moments.events;
  response.uyuniMomentCooldowns = moments.cooldowns;
  for (const player of response.players ?? []) if (player.festival) player.festival = readFestival(player.festival);
  // Movement-only ticks do not refresh privileges. A confirmed action response does.
  return response.careCapabilities == null ? response : { ...response, careCapabilities: readCareCapabilities(response.careCapabilities) };
}
export async function setBeachLighting(ticket: string, mode: RoomLightingMode): Promise<RoomLighting> {
  const response = await post<unknown>("/api/beach/lighting", { ticket, mode }, { signal: AbortSignal.timeout(8000) });
  const lighting = readRoomLighting(response);
  if (!lighting || lighting.mode !== mode) throw new Error("방의 시간을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return lighting;
}
export async function launchUyuniMoment(ticket: string, requestId: string, input: UyuniMomentInput): Promise<UyuniMomentLaunch> {
  if (!UUID_PATTERN.test(requestId) || !input || (input.kind === "sparkler" ? !isSparklerLetter(input.letter)
    : input.kind !== "lantern" || !isWishLanternColor(input.color) || !validWish(input.wish)))
    throw new Error("글자나 소원등을 다시 골라 주세요. 소원은 80자까지 적을 수 있어요.");
  const response = await post<UyuniMomentLaunch>("/api/beach/moments", { ticket, requestId, ...input }, { signal: AbortSignal.timeout(8000) });
  const event = readUyuniMoment(response?.event);
  const cooldowns = response && isTime(response.serverTime) ? readMomentCooldowns(response.cooldowns, response.serverTime) : null;
  if (!event || !cooldowns || !isTime(response.serverTime) || event.startedAt > response.serverTime
    || event.kind !== input.kind || (input.kind === "sparkler" ? event.letter !== input.letter : event.color !== input.color || event.wish !== input.wish))
    throw new Error("빛과 소원등의 시작을 확인하지 못했어요. 같은 선택으로 다시 눌러 주세요.");
  return { event, serverTime: response.serverTime, cooldowns };
}
export async function launchBeachFireworks(ticket: string, requestId: string, variant: FireworkVariant = "festival"): Promise<FireworkLaunch> {
  if (!isFireworkVariant(variant)) throw new Error("불꽃놀이 종류를 다시 골라 주세요.");
  const response = await post<FireworkLaunch>("/api/beach/fireworks", { ticket, requestId, variant }, { signal: AbortSignal.timeout(8000) });
  const event = readFireworkEvent(response?.event);
  const ticketed = Boolean(response) && Object.hasOwn(response, "tickets");
  if (!response || Object.keys(response).length !== (ticketed ? 4 : 3) || !Object.keys(response).every(key => ["event", "serverTime", "cooldownUntil", "tickets"].includes(key))
    || !event || !isTime(response.serverTime) || !isTime(response.cooldownUntil) || (ticketed && !isTime(response.tickets))
    || event.startedAt > response.serverTime || response.cooldownUntil < event.startedAt + fireworkCooldownMs(event)
    || response.cooldownUntil > response.serverTime + MAX_FIREWORK_COOLDOWN_MS) {
    throw new Error("불꽃놀이 시작을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return { event, serverTime: response.serverTime, cooldownUntil: response.cooldownUntil, ...(ticketed ? { tickets: response.tickets } : {}) };
}
export const addFirewood = (ticket: string, requestId: string) => post<FireState>("/api/beach/fire/wood", { ticket, requestId }, { signal: AbortSignal.timeout(8000) });
export async function addFirePowder(ticket: string, requestId: string, color: PowderColor): Promise<FireState> {
  const state = await post<FireState>("/api/beach/fire/powder", { ticket, requestId, color }, { signal: AbortSignal.timeout(8000) });
  const powder = state?.powder;
  const validPowder = powder === null || Boolean(powder && typeof powder.id === "string" && powder.id && ["rose", "aurora", "ocean", "violet", "rainbow"].includes(powder.color) && Number.isFinite(powder.startedAt) && Number.isFinite(powder.expiresAt) && powder.expiresAt > powder.startedAt);
  if (!state || state.powderEnabled !== true || !validPowder || !Number.isInteger(state.logs) || state.logs < 0 || !Number.isInteger(state.maxLogs) || state.maxLogs <= 0 || !Number.isFinite(state.serverTime)) throw new Error("모닥불의 색을 확인하지 못했어요. 같은 가루로 다시 확인해 주세요.");
  return state;
}

function validRestPresence(value: unknown): value is RestPresence {
  if (!value || typeof value !== "object") return false;
  const state = value as RestPresence;
  if (![state.x, state.z, state.yaw].every(Number.isFinite)) return false;
  if (state.pose === "standing") return state.spotId === null && state.slot === null;
  if (!Number.isInteger(state.slot) || state.slot! < 0) return false;
  if (state.spotId === "onsen-benches" || state.spotId === "onsen-float") {
    const sitting = state.spotId === "onsen-benches";
    if (state.pose !== (sitting ? "sitting" : "lying") || state.slot! >= (sitting ? 6 : 3)) return false;
    const angle = (15 + state.slot! * 30) * Math.PI / 180;
    const x = sitting ? Math.cos(angle) * 3.55 : (state.slot! - 1) * 2.4;
    const z = sitting ? 45 + Math.sin(angle) * 3.55 : 43.3;
    return Math.abs(state.x - x) <= 0.02 && Math.abs(state.z - z) <= 0.02 && Math.abs(state.yaw) < 1e-6;
  }
  if (state.pose === "sitting") {
    return (state.spotId === "fire-benches" && state.slot! < 12)
      || (["pavilion-wind", "pavilion-moon", "pavilion-pine", "pavilion-step", "pavilion-summit",
        "pavilion-island", "hall-tier-1", "hall-tier-2", "hall-tier-3", "hall-tier-4"].includes(state.spotId ?? "") && state.slot! < 6);
  }
  if (state.spotId === "hotel-dawn" || state.spotId === "hotel-dusk") return state.pose === "lying" && state.slot! < 2;
  return state.pose === "lying" && (state.spotId === "starlight" ? state.slot! < 8
    : ["hut-pine", "hut-wave", "hut-sunset"].includes(state.spotId ?? "") && state.slot! < 3);
}

export async function setBeachRest(ticket: string, action: "lie" | "sit" | "stand", spotId = "starlight"): Promise<RestPresence> {
  let state: RestPresence;
  try {
    state = await post<RestPresence>("/api/beach/rest", { ticket, action, ...(action !== "stand" ? { spotId } : {}) }, { signal: AbortSignal.timeout(8000) });
  } catch (cause) {
    if (cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError")) throw new Error("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.");
    throw cause;
  }
  if (!validRestPresence(state) || (action === "stand" ? state.pose !== "standing"
    : state.spotId !== spotId || state.pose !== (action === "sit" ? "sitting" : "lying"))) {
    throw new Error("쉴 자리의 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return state;
}

/** Save the last position before a mobile browser freezes, without replaying any social action. */
export function suspendBeach(body: { ticket: string; sequence: number; x: number; z: number; yaw: number }): void {
  post("/api/beach/suspend", body, { keepalive: true, signal: AbortSignal.timeout(4000) }).catch(() => {});
}

/** Explicit departure forgets the saved visit; backgrounding uses suspend instead. */
export function leaveBeach(ticket: string): void {
  post("/api/beach/leave", { ticket }, { keepalive: true }).catch(() => {});
}

/** 지금 바닷가에 있는 사람 수 (홈 카드용) */
export async function fetchBeachCount(communityId: string, mapId: MapId = "beach"): Promise<BeachCount> {
  requireMap(mapId);
  const res = await fetch(`/api/beach/count?communityId=${encodeURIComponent(communityId)}${mapId === "beach" ? "" : `&mapId=${mapId}`}`, { credentials: "same-origin", cache: "no-store" });
  const json = (await res.json()) as BeachCount & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "함께 쉬는 인원을 확인하지 못했어요.");
  if (!acceptsMap(json.mapId, mapId) || json.communityId !== communityId || !Number.isInteger(json.count) || json.count < 0 || !Number.isInteger(json.capacity) || json.capacity <= 0) throw new Error("함께 쉬는 인원을 확인하지 못했어요.");
  return { ...json, mapId };
}
