/**
 * 모루의 순수 규칙: 시계·끼니·하루 리듬·손길 판정. 저장소나 브라우저에 기대지 않는다
 * (scripts/moru-rules.test.mjs 가 이 파일만 읽어 확인한다). 문구와 저장은 lib/moru.ts.
 */

export const DAILY_FOOD_MAX = 5;
export const MEALS = [
  { label: "아침", hour: 8 },
  { label: "점심", hour: 13 },
  { label: "저녁", hour: 19 },
] as const;

/** 한국 시간의 지금 시(0~23). 서버의 식사 정산과 같은 시계를 쓴다 */
export function koreaHour(now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}
/** 지금까지 먹었어야 할 끼니 수 (PetRules.due 와 같음) */
export const dueMeals = (hour: number): number => (hour >= 19 ? 3 : hour >= 13 ? 2 : hour >= 8 ? 1 : 0);

/** 패드 상태줄 오른쪽: 다음 끼니 */
export function mealStatus(meals: number, food: number, hour: number): string {
  if (meals >= 3) return "오늘 식사 끝";
  if (food === 0 && dueMeals(hour) > meals) return "밥 기다리는 중";
  const next = MEALS[meals];
  return `다음 ${next.label} ${next.hour}시`;
}

/* ---------- 상태 네 가지 (docs/MORU_TAMAGOTCHI.md 3장): 0~4 칸. 온기·말끔함·기운은 서버가 지키고, 배부름은 끼니에서 읽는다 ---------- */

export const CARE_MAX = 4;
/** 배부름: 지금까지 먹었어야 할 끼니를 한 번 거를 때마다 두 칸이 빈다 (밥이 생기면 그날 거른 끼니는 바로 채워진다) */
export const fullness = (meals: number, hour: number): number => Math.max(0, CARE_MAX - 2 * Math.max(0, dueMeals(hour) - meals));
/** 방에 굴러다니는 먼지 뭉치: 말끔함에서 빠진 칸만큼, 많아도 셋 */
export const dustCount = (clean: number): number => Math.max(0, Math.min(3, CARE_MAX - clean));

/* ---------- 하루 리듬 (docs/MORU_TAMAGOTCHI.md 2장) ---------- */

/** 0~6 잠 · 7 기상 · 8~14 낮 · 15 낮잠 · 16~18 낮 · 19~21 저녁 · 22~23 졸림 */
export type DayPhase = "sleep" | "wake" | "day" | "nap" | "evening" | "sleepy";
export function dayPhase(hour: number): DayPhase {
  if (hour < 7) return "sleep";
  if (hour < 8) return "wake";
  if (hour === 15) return "nap";
  if (hour < 19) return "day";
  if (hour < 22) return "evening";
  return "sleepy";
}
/** 창밖이 밤인 시간 (창밖 풍경의 기본값을 "비 오는 밤"으로) */
export const isNightOutside = (phase: DayPhase): boolean => phase === "evening" || phase === "sleepy" || phase === "sleep";

/** 밤 하나의 열쇠: 22~23시는 그날, 0~6시는 전날 (자정을 넘어도 같은 밤) */
export function nightKey(dateKey: string, hour: number): string {
  if (hour >= 7) return dateKey;
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}
/** 불이 꺼져 있는지. 졸린 시간에는 꺼 줘야 꺼지고, 한밤에는 모루가 스스로 끄고 잔다. 그 밖의 시간에는 늘 켜져 있다 */
export function lightsOff(phase: DayPhase, chosen: boolean | null): boolean {
  if (phase === "sleepy") return chosen ?? false;
  if (phase === "sleep") return chosen ?? true;
  return false;
}
/** 자는 중인지: 한밤이거나, 졸린 시간에 불을 꺼 줬을 때 */
export const isAsleep = (phase: DayPhase, off: boolean): boolean => phase === "sleep" || (phase === "sleepy" && off);

/* ---------- 손길 ---------- */

export const HUG_MS = 550; // 이만큼 가만히 누르고 있으면 안아 주기
export const MOVE_SLOP = 14; // 이보다 덜 움직이면 톡·길게 누르기로 본다
export const TICKLE_TRAVEL = 110; // 좌우로 문지른 총 거리
export const TICKLE_TURNS = 2; // 방향을 바꾼 횟수
export const STARTLE_TAPS = 6; // 이만큼을
export const STARTLE_MS = 2500; // 이 안에 톡톡 하면 놀란다

/** 가로로 문지른 정도: 총 이동 거리와 방향을 바꾼 횟수 (3px 미만의 떨림은 무시) */
export function rubStats(xs: number[]): { travel: number; turns: number } {
  let travel = 0, turns = 0, direction = 0, anchor = xs[0] ?? 0;
  for (const x of xs) {
    const step = x - anchor;
    if (Math.abs(step) < 3) continue;
    const next = Math.sign(step);
    if (direction !== 0 && next !== direction) turns++;
    direction = next;
    travel += Math.abs(step);
    anchor = x;
  }
  return { travel, turns };
}
export const isTickle = (stats: { travel: number; turns: number }): boolean => stats.travel >= TICKLE_TRAVEL && stats.turns >= TICKLE_TURNS;
/** 방금까지의 톡 시각들로 보아 놀랄 만큼 빨리 두드렸는지 */
export const isStartle = (tapTimes: number[], now: number): boolean => tapTimes.filter((t) => now - t <= STARTLE_MS).length >= STARTLE_TAPS;
/** 위쪽 3할을 누르면 새싹 (새싹이 있는 모습일 때만) */
export const touchSpot = (yRatio: number, hasSprout: boolean): "sprout" | "body" => (hasSprout && yRatio < 0.3 ? "sprout" : "body");

/** 같은 말을 연달아 하지 않게 고른다 */
export function pickLine(lines: readonly string[], last: string | null, random: () => number = Math.random): string {
  const pool = lines.length > 1 ? lines.filter((line) => line !== last) : lines;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/* ---------- 이름 ---------- */

/** 이름 끝 글자에 받침이 있는지 (한글이 아니면 없다고 본다) */
export function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
/** 부르는 말: 민수 → 민수야, 지민 → 지민아. 이름이 없으면 빈 문자열 */
export const callName = (name: string): string => (name.trim() ? `${name.trim()}${hasBatchim(name) ? "아" : "야"}, ` : "");
/** 모루가 / 콩이가 / 별님이 … */
export const subject = (name: string): string => `${name}${hasBatchim(name) ? "이" : "가"}`;
/** 친근하게 부르는 주어: 먕먕 → 먕먕이가, 모루 → 모루가 */
export const nickSubject = (name: string): string => `${name}${hasBatchim(name) ? "이가" : "가"}`;

/* ---------- 오늘의 하늘: 날씨는 사용자가 고르지 않고 날마다 무작위로 정해진다 ---------- */

export type Weather = "rain" | "snow" | "clear";
export type Land = "city" | "forest";
/** 글자에서 0~1 사이 수 (FNV-1a). 같은 글자면 늘 같은 수 */
export function unitHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
/**
 * 오늘의 날씨와 창밖 풍경: 계정과 날짜(한국 날짜)로 정해서 하루 동안은 같고, 사람마다 다르다.
 * 비 40% · 맑음 35% · 눈 25%. 눈 오는 날은 숲이 조금 더 잦다. 낮·밤은 시계를 따른다 (isNightOutside)
 */
export function dailySky(who: string, date: string): { land: Land; weather: Weather } {
  const w = unitHash(`${who}|${date}|weather`), l = unitHash(`${who}|${date}|land`);
  const weather: Weather = w < 0.4 ? "rain" : w < 0.75 ? "clear" : "snow";
  const land: Land = l < (weather === "snow" ? 0.55 : 0.35) ? "forest" : "city";
  return { land, weather };
}
/** 한국 날짜 (YYYY-MM-DD). 서버가 날짜를 주기 전에도 오늘의 하늘을 정할 수 있게 */
export const koreaDate = (now: Date = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);

/* ---------- 마음 닮기 (docs/MORU_MOOD_SYNC.md): 오늘의 기분은 내 기록을 닮는다 ----------
   기분은 저장하지 않는다. 기록(날짜 → 카테고리 → 오늘 위치 score −5~+5, 한 줄 note)에서 그때그때 계산한다.
   수치는 "어제보다"를 쌓은 값이라 절대값이 아니다: 말할 수 있는 것은 "요즘 내려와 있다"까지다 */

/** 1 울적해 · 2 가라앉아 · 3 고요해(지금까지의 평소) · 4 가벼워 · 5 행복해 */
export type MoodStage = 1 | 2 | 3 | 4 | 5;
export const MOOD_CALM: MoodStage = 3;
/** 기분이 기록에서 읽는 것 (lib/storage 의 CategoryEntry·DayRecord·Journal 과 같은 모양) */
export interface MoodEntry { score: number; note?: string }
export type MoodDay = Record<string, MoodEntry | undefined>;
export type MoodJournal = Record<string, MoodDay | undefined>;
export interface MoodReading {
  stage: MoodStage;
  /** 기분값 −5 ~ +5 (소수 둘째 자리까지) */
  value: number;
  /** 오늘 기록이 있는지. 없으면 지난 기록의 여운이다 */
  recorded: boolean;
  /** 오늘 값 T (마음에 두 배를 준 평균), 흐름 값 R (직전 7일 가운데 기록한 날들의 T 평균). 없으면 null */
  today: number | null;
  trend: number | null;
}

export const MOOD_MIND_WEIGHT = 2; // 마음 칸은 두 배
export const MOOD_TREND_DAYS = 7; // 흐름은 오늘을 뺀 직전 7일
export const MOOD_TREND_SHARE = 0.3; // 기분값에서 흐름이 차지하는 몫
export const MOOD_ECHO_DAYS = 3; // 마지막 기록이 이 안에 있어야 여운이 남는다
export const MOOD_ECHO_SHARE = 0.5; // 기록 전의 여운은 흐름의 절반
const MOOD_LOW_CHIPS = ["슬퍼", "지쳤어", "불안해"];
const MOOD_HIGH_CHIPS = ["기뻐", "편안해"];

/** 날짜 키에서 n일 뒤(음수면 앞)의 날짜 키 */
export function shiftDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}
/** 하루의 값 T: 기록한 카테고리 위치의 가중 평균 (마음 2, 나머지 1). 기록이 없으면 null */
export function moodDayValue(day: MoodDay | undefined): number | null {
  let sum = 0, weight = 0;
  for (const [cat, entry] of Object.entries(day ?? {})) {
    if (!entry || typeof entry.score !== "number" || !Number.isFinite(entry.score)) continue;
    const w = cat === "mind" ? MOOD_MIND_WEIGHT : 1;
    sum += w * Math.max(-5, Math.min(5, entry.score));
    weight += w;
  }
  return weight ? sum / weight : null;
}
/** 마음 칸의 기분 칩: 슬퍼·지쳤어·불안해 −1, 기뻐·편안해 +1, 둘 다 있으면 0 */
export function moodChipShift(note: string | undefined): number {
  const text = note ?? "";
  return (MOOD_HIGH_CHIPS.some((chip) => text.includes(chip)) ? 1 : 0) - (MOOD_LOW_CHIPS.some((chip) => text.includes(chip)) ? 1 : 0);
}
/** 기분값 → 단계: −3 이하 1 · −1 이하 2 · +1 미만 3 · +3 미만 4 · 그 위 5 */
export function moodStageOf(value: number): MoodStage {
  if (value <= -3) return 1;
  if (value <= -1) return 2;
  if (value < 1) return 3;
  if (value < 3) return 4;
  return 5;
}
/**
 * 오늘의 기분. 오늘 기록이 있으면 0.7×오늘 + 0.3×흐름 + 칩 (흐름이 없으면 오늘 + 칩).
 * 아직 안 썼으면 여운: 마지막 기록이 3일 안에 있을 때 흐름의 절반 (그래서 2~4단계 안에서만 움직인다). 그보다 오래 비웠으면 고요해
 */
export function moodOf(journal: MoodJournal | null | undefined, todayKey: string): MoodReading {
  const book = journal ?? {};
  const today = moodDayValue(book[todayKey]);
  const past: number[] = [];
  let lastGap = 0; // 가장 가까운 기록이 며칠 전인지 (없으면 0)
  for (let back = 1; back <= MOOD_TREND_DAYS; back++) {
    const value = moodDayValue(book[shiftDate(todayKey, -back)]);
    if (value === null) continue;
    past.push(value);
    if (!lastGap) lastGap = back;
  }
  const trend = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
  let raw = 0;
  if (today !== null) raw = (trend === null ? today : (1 - MOOD_TREND_SHARE) * today + MOOD_TREND_SHARE * trend) + moodChipShift(book[todayKey]?.mind?.note);
  else if (trend !== null && lastGap <= MOOD_ECHO_DAYS) raw = MOOD_ECHO_SHARE * trend;
  const value = Math.round(Math.max(-5, Math.min(5, raw)) * 100) / 100;
  return { stage: moodStageOf(value), value, recorded: today !== null, today, trend };
}
