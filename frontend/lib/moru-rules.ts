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
