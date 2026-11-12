/**
 * 감정구슬의 순수 규칙 (docs/EMOTION_ORBS.md): 다섯 구슬의 이름과 빛깔, 그날의 기분 → 구슬, 머문 시간, 구슬이 놓일 자리,
 * 보관함에 적는 말, 서버가 준 값 읽기. 저장소·브라우저·엔진에 기대지 않는다 (scripts/emotion-orbs.test.mjs 가 이 파일만 읽는다).
 * 서버와 주고받기는 lib/keepsakes.ts, 맵별 자리 목록은 lib/beach/emotion-orb-spots.ts, 맵 안의 빛구슬은 lib/beach/emotion-orb.ts.
 */

/** 그날의 기분 단계 (lib/moru-rules.ts 의 MoodStage 와 같다): 1 울적해 · 2 가라앉아 · 3 고요해 · 4 가벼워 · 5 행복해 */
export type OrbMood = 1 | 2 | 3 | 4 | 5;
export const ORB_CALM: OrbMood = 3;

export interface OrbKind {
  mood: OrbMood;
  id: "deep" | "rain" | "mist" | "sprout" | "sun";
  /** 구슬의 이름: 빛의 이름으로 짓는다 */
  name: string;
  /** 그날의 기분: 캐릭터가 쓰는 말 그대로 (lib/moru.ts 의 MOOD_NAMES) */
  feeling: string;
  /** 구슬을 주운 순간의 한 줄. 기록을 말하고 사람을 판정하지 않는다 */
  line: string;
  /** 빛깔: 밝은 속, 몸, 짙은 가장자리, 둘레에 번지는 빛 */
  light: string;
  body: string;
  deep: string;
  glow: string;
}

/**
 * 다섯 구슬. 귀함은 모두 같다: 드문 구슬도, 구슬로 받는 것도 없다.
 * 화면에는 "우울"이라는 낱말을 쓰지 않는다 (docs/MORU_MOOD_SYNC.md 8장). 이름을 바꾸려면 여기 한 곳만 고친다.
 */
export const ORB_KINDS: Record<OrbMood, OrbKind> = {
  1: { mood: 1, id: "deep", name: "깊은 물빛 구슬", feeling: "울적해", line: "깊이 가라앉은 날의 마음이 고운 물빛으로 남았어요.", light: "#a9c4ff", body: "#4f72d6", deep: "#22367f", glow: "#6f93ff" },
  2: { mood: 2, id: "rain", name: "빗물빛 구슬", feeling: "가라앉아", line: "조금 무거웠던 날의 마음이 빗물빛으로 남았어요.", light: "#d5ecfb", body: "#7fb2d9", deep: "#41749c", glow: "#9fd0f2" },
  3: { mood: 3, id: "mist", name: "안개빛 구슬", feeling: "고요해", line: "고요히 지나간 날의 마음이 안개빛으로 남았어요.", light: "#fbfdfc", body: "#cfdcd9", deep: "#8ea3a1", glow: "#e6f2ee" },
  4: { mood: 4, id: "sprout", name: "새싹빛 구슬", feeling: "가벼워", line: "조금 가벼웠던 날의 마음이 새싹빛으로 남았어요.", light: "#eefbc4", body: "#a9d86c", deep: "#5f9a3a", glow: "#c8ee8b" },
  5: { mood: 5, id: "sun", name: "햇살빛 구슬", feeling: "행복해", line: "환했던 날의 마음이 햇살빛으로 남았어요.", light: "#fff3c2", body: "#ffc163", deep: "#e0843a", glow: "#ffd98a" },
};
export const ORB_MOODS: readonly OrbMood[] = [1, 2, 3, 4, 5];
export const isOrbMood = (value: unknown): value is OrbMood => value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

/**
 * 구슬의 기분: 홈의 캐릭터가 그날 띠는 기분과 같다. "마음 닮기"를 꺼 두었거나 오늘 기록에 위험 신호가 있으면 닮지 않고 고요.
 * stage 는 moodOf(기록, 오늘).stage (오늘 기록 전이면 여운이나 고요가 이미 들어 있다)
 */
export function orbMood(stage: number | null | undefined, opts: { syncOn: boolean; crisis: boolean }): OrbMood {
  if (!opts.syncOn || opts.crisis || !isOrbMood(stage)) return ORB_CALM;
  return stage;
}

/* ---------- 머문 시간 ---------- */

/** 오늘 맵에 머물러야 하는 시간 (서버 app.orbs.stay-seconds 의 기본값과 같다) */
export const ORB_STAY_MS = 600_000;
/** 머무는 중이라는 신호의 간격. 서버는 한 번에 45초까지만 더한다 */
export const ORB_BEAT_MS = 30_000;
/** 이 거리(m) 안에서 주울 수 있다 */
export const ORB_REACH = 2.6;

export interface OrbToday { day: string; stayMs: number; needMs: number; found: boolean }

/**
 * 필요한 시간. 개발 확인용 ?orbAfter=초 는 운영 빌드에서 무시한다 (서버는 자기 시계로 따로 확인한다).
 * 서버 값이 이상하면 기본 10분
 */
export function orbNeedMs(serverNeedMs: unknown, devSeconds: string | null, production: boolean): number {
  if (!production && devSeconds !== null && /^\d{1,5}$/.test(devSeconds)) return Math.max(1, Number(devSeconds)) * 1000;
  return typeof serverNeedMs === "number" && Number.isFinite(serverNeedMs) && serverNeedMs > 0 ? serverNeedMs : ORB_STAY_MS;
}
/** 구슬이 생길 때가 됐는지: 오늘 아직 줍지 않았고 머문 시간이 찼다 */
export const orbReady = (today: Pick<OrbToday, "stayMs" | "found"> | null, needMs: number): boolean =>
  today !== null && !today.found && today.stayMs >= needMs;
/** 다음 신호까지: 평소 30초, 개발용으로 시간을 줄였으면 그 4분의 1 (적어도 2초) */
export const orbBeatDelay = (needMs: number): number => Math.max(2_000, Math.min(ORB_BEAT_MS, Math.round(needMs / 4)));

export function readOrbToday(value: unknown): OrbToday | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return null;
  if (typeof v.stayMs !== "number" || !Number.isFinite(v.stayMs) || v.stayMs < 0) return null;
  if (typeof v.needMs !== "number" || !Number.isFinite(v.needMs) || v.needMs <= 0) return null;
  return { day: v.day, stayMs: v.stayMs, needMs: v.needMs, found: v.found === true };
}

/* ---------- 구슬이 놓일 자리 ---------- */

/** 맵의 이름 붙은 자리. r 은 그 자리에 놓인 것(오두막, 연못…)의 반지름: 그만큼 떨어져서 놓는다 */
export interface OrbSpot { id: string; name: string; x: number; z: number; r?: number }
export interface OrbPlace { spotId: string | null; spotName: string; x: number; z: number }

/** 글자에서 0~1 사이 수 (FNV-1a, lib/moru-rules.ts 의 unitHash 와 같은 계산) */
export function orbHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const PLACE_TRIES = 10;
const PLACE_NEAR = 2.5, PLACE_FAR = 5;
/** 엔진이 "설 수 있는 곳"으로 옮겨 준 점이 원래 고른 점에서 이보다 멀면 그 후보는 버린다 */
const PLACE_DRIFT = 2.2;

/**
 * 그날 그 맵의 구슬 자리. 계정·날짜·맵(seed)으로 자리의 순서와 둘레의 점을 정해서 하루 동안 같은 곳이다.
 * settle 은 맵의 충돌 규칙으로 그 점을 설 수 있는 곳으로 옮겨 준다(설 수 없으면 null). 자리마다 열 번 고르고,
 * 어느 자리에도 놓지 못하면 fallback(들어온 자리) 둘레에, 그것도 안 되면 fallback 그대로.
 * avoid 는 구슬을 두지 않는 원(물속, 모닥불), only 는 개발 확인용: 그 id 의 자리만 쓴다
 */
export function pickOrbPlace(spots: readonly OrbSpot[], seed: string, settle: (x: number, z: number) => { x: number; z: number } | null,
  fallback: { x: number; z: number }, opts: { avoid?: readonly { x: number; z: number; r: number }[]; only?: string | null } = {}): OrbPlace {
  const pool = opts.only ? spots.filter((spot) => spot.id === opts.only) : spots;
  const avoid = opts.avoid ?? [];
  const ordered = [...pool].sort((a, b) => orbHash(`${seed}|${a.id}`) - orbHash(`${seed}|${b.id}`) || a.id.localeCompare(b.id));
  const around = (cx: number, cz: number, clear: number, key: string) => {
    for (let k = 0; k < PLACE_TRIES; k++) {
      const angle = orbHash(`${key}|a${k}`) * Math.PI * 2;
      const distance = clear + PLACE_NEAR + orbHash(`${key}|d${k}`) * (PLACE_FAR - PLACE_NEAR);
      const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance;
      const spot = settle(x, z);
      if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) continue;
      if (Math.hypot(spot.x - x, spot.z - z) > PLACE_DRIFT) continue;
      // 옮겨진 뒤에도 그 자리의 물건 안쪽이면 닿을 수 없다
      if (Math.hypot(spot.x - cx, spot.z - cz) < clear + 0.8) continue;
      if (avoid.some((circle) => Math.hypot(spot.x - circle.x, spot.z - circle.z) < circle.r)) continue;
      return { x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100 };
    }
    return null;
  };
  for (const spot of ordered) {
    const at = around(spot.x, spot.z, Math.max(0, spot.r ?? 0), `${seed}|${spot.id}`);
    if (at) return { spotId: spot.id, spotName: spot.name, ...at };
  }
  const near = around(fallback.x, fallback.z, 0, `${seed}|fallback`);
  return { spotId: null, spotName: "", x: near?.x ?? fallback.x, z: near?.z ?? fallback.z };
}

/* ---------- 보관함 ---------- */

export interface OrbCompanion { id: string; nick: string }
export interface Orb {
  id: string;
  /** 한국 날짜 YYYY-MM-DD */
  day: string;
  foundAt: number;
  mood: OrbMood;
  mapId: string;
  /** 공용 공간에서 주웠으면 true */
  shared: boolean;
  spaceName: string;
  spotId: string | null;
  spotName: string;
  /** 지금도 이름을 보여 줄 수 있는 사람들 */
  companions: OrbCompanion[];
  /** 그 순간 함께 있던 사람 수 (탈퇴했거나 차단한 사람은 이름 없이 수에만 남는다) */
  companionCount: number;
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

/** 서버가 준 구슬 하나. 모양이 맞지 않으면 null (그 구슬만 건너뛴다) */
export function readOrb(value: unknown): Orb | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id || typeof v.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.day) || !isOrbMood(v.mood)) return null;
  if (typeof v.mapId !== "string" || !v.mapId) return null;
  const companions: OrbCompanion[] = [];
  for (const c of Array.isArray(v.companions) ? v.companions.slice(0, 40) : []) {
    if (c && typeof c === "object" && typeof (c as OrbCompanion).id === "string" && typeof (c as OrbCompanion).nick === "string" && (c as OrbCompanion).nick.trim())
      companions.push({ id: (c as OrbCompanion).id, nick: text((c as OrbCompanion).nick, 60) });
  }
  const count = typeof v.companionCount === "number" && Number.isInteger(v.companionCount) && v.companionCount >= 0 ? v.companionCount : companions.length;
  return {
    id: v.id, day: v.day, foundAt: typeof v.foundAt === "number" && Number.isFinite(v.foundAt) ? v.foundAt : 0, mood: v.mood,
    mapId: v.mapId, shared: v.shared === true, spaceName: text(v.spaceName, 80), spotId: typeof v.spotId === "string" && v.spotId ? v.spotId : null,
    spotName: text(v.spotName, 40), companions, companionCount: Math.max(count, companions.length),
  };
}

/** 빛깔별 개수 (1~5 순서) */
export function orbTally(orbs: readonly Pick<Orb, "mood">[]): Record<OrbMood, number> {
  const tally: Record<OrbMood, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const orb of orbs) tally[orb.mood]++;
  return tally;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 2026-11-13 → "2026년 11월 13일 금요일" (기기의 시간대와 상관없이 그 날짜 그대로) */
export function orbDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 ${weekday}요일`;
}
/** 선반 아래 작은 날짜: "11.13" */
export function orbDayShort(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${m}.${d}`;
}

/** 어디서: "봄물 정원 · 호숫가 벤치 근처". 자리 이름이 없으면 맵 이름만 */
export const orbPlaceLabel = (mapName: string, spotName: string): string => (spotName.trim() ? `${mapName} · ${spotName.trim()} 근처` : mapName);
/** 어느 공간: 공용 공간, 아니면 그때의 소로우 이름 */
export const orbSpaceLabel = (orb: Pick<Orb, "shared" | "spaceName">): string =>
  orb.shared ? "누구나 쉬어 가는 공용 공간에서" : orb.spaceName.trim() ? `${orb.spaceName.trim()} 소로우 공간에서` : "소로우 공간에서";

/** 함께 있던 사람들 아래의 한 줄: 아무도 없었던 날, 이름이 남지 않은 사람 */
export function orbCompanionNote(orb: Pick<Orb, "companions" | "companionCount">): string {
  const unnamed = Math.max(0, orb.companionCount - orb.companions.length);
  if (orb.companionCount === 0) return "혼자 조용히 머문 날이에요.";
  if (unnamed === 0) return "";
  return orb.companions.length ? `그리고 지금은 이름이 남지 않은 ${unnamed}명` : `그때 ${unnamed}명이 함께 있었어요. 지금은 이름이 남아 있지 않아요.`;
}

/* ---------- 앨범 ---------- */

export interface AlbumPhoto { id: string; url: string; mapId: string; spaceName: string; createdAt: number }

/** 서버가 준 사진 하나. 주소가 https 가 아니면 받지 않는다 */
export function readAlbumPhoto(value: unknown): AlbumPhoto | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !v.id || typeof v.url !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(v.url) || typeof v.mapId !== "string") return null;
  return { id: v.id, url: v.url, mapId: v.mapId, spaceName: text(v.spaceName, 80), createdAt: typeof v.createdAt === "number" && Number.isFinite(v.createdAt) ? v.createdAt : 0 };
}
