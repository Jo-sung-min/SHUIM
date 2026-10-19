import { CATEGORIES, CategoryId } from "./categories";
import type { Journal } from "./storage";

export interface Point {
  date: string;
  level: number | null; // 그날 점수
  accel: number | null; // 직전 기록 대비 변화량
}

/** 최근 n일의 날짜 키 목록 (오래된 순) */
export function lastNDays(n: number, from = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(from.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function levelOf(j: Journal, date: string, cat: CategoryId | "all"): number | null {
  const day = j[date];
  if (!day) return null;
  if (cat !== "all") return day[cat]?.score ?? null;
  const scores = CATEGORIES.map((c) => day[c.id]?.score).filter((s): s is number => typeof s === "number");
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/**
 * 가속도 = 직전 기록일 대비 점수 변화.
 * 사람은 위치보다 변화를 느낀다는 아이디어를 그대로 수치로 옮긴 것.
 */
export function series(j: Journal, dates: string[], cat: CategoryId | "all"): Point[] {
  let prev: number | null = null;
  return dates.map((date) => {
    const level = levelOf(j, date, cat);
    let accel: number | null = null;
    if (level !== null && prev !== null) accel = Math.round((level - prev) * 10) / 10;
    if (level !== null) prev = level;
    return { date, level, accel };
  });
}

export function biggestShifts(points: Point[], k = 2) {
  const withAccel = points.filter((p) => p.accel !== null && p.accel !== 0) as (Point & { accel: number })[];
  const drops = [...withAccel].sort((a, b) => a.accel - b.accel).filter((p) => p.accel < 0).slice(0, k);
  const rises = [...withAccel].sort((a, b) => b.accel - a.accel).filter((p) => p.accel > 0).slice(0, k);
  return { drops, rises };
}

/** 최근 변화가 잦은지(흔들림) 측정: 가속도 절댓값 평균 */
export function volatility(points: Point[]): number {
  const a = points.map((p) => p.accel).filter((v): v is number => v !== null);
  if (!a.length) return 0;
  return Math.round((a.reduce((s, v) => s + Math.abs(v), 0) / a.length) * 10) / 10;
}
