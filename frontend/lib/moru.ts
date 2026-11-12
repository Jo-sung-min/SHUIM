"use client";

/**
 * 모루의 성격과 말 (화면 쪽). AI 응답의 말투는 서버 Prompts.companion 이 같은 성격으로 정한다.
 * 조용하고 느린 새싹 친구: 짧은 반말, 서두르거나 평가하지 않는다, 이모지·감탄사 없음,
 * 가끔 한 번만 비·이불·새싹 같은 자기 세계의 말을 곁들인다.
 *
 * 마음밥: 오늘의 기록에서 카테고리 하나를 기록하면 1개, 하루 5개까지 (서버 PetService.rewardRecords).
 * 식사: 한국 시간 08·13·19시에 모루가 스스로 하나씩 먹는다 (서버 PetRules.settle). 밥이 없으면 그 끼니는 건너뛴다.
 */
import { read, write } from "./storage";

export const DAILY_FOOD_MAX = 5;
export const MEALS = [
  { label: "아침", hour: 8 },
  { label: "점심", hour: 13 },
  { label: "저녁", hour: 19 },
] as const;

/** 한국 시간의 지금 시(0~23). 서버의 식사 정산과 같은 시계를 쓴다 */
export function koreaHour(now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}
/** 지금까지 먹었어야 할 끼니 수 (PetRules.due 와 같음) */
export const dueMeals = (hour: number) => (hour >= 19 ? 3 : hour >= 13 ? 2 : hour >= 8 ? 1 : 0);

/** 패드 상태줄 오른쪽: 다음 끼니 */
export function mealStatus(meals: number, food: number, hour = koreaHour()): string {
  if (meals >= 3) return "오늘 식사 끝";
  if (food === 0 && dueMeals(hour) > meals) return "밥 기다리는 중";
  const next = MEALS[meals];
  return `다음 ${next.label} ${next.hour}시`;
}

/** 이름 끝 글자에 받침이 있는지 (한글이 아니면 없다고 본다) */
export function hasBatchim(word: string): boolean {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
/** 부르는 말: 민수 → 민수야, 지민 → 지민아. 이름이 없으면 빈 문자열 */
export const callName = (name: string) => (name.trim() ? `${name.trim()}${hasBatchim(name) ? "아" : "야"}, ` : "");
/** 모루가 / 콩이가 / 별님이 … */
export const subject = (name: string) => `${name}${hasBatchim(name) ? "이" : "가"}`;

/* ---------- 모루의 말 ---------- */

export const IDLE_LINE = "말없이 곁에 있어도 좋아.";
export const HUNGRY_LINE = "배가 조금 고파. 마음 하나 들려줄래?";
export const MEAL_LINES = ["아침 먹었어. 마음밥이 따뜻해.", "점심 잘 먹었어. 네 덕분이야.", "저녁까지 먹었어. 오늘도 고마워."];
export const petLine = (owner: string) => `${callName(owner)}와 줘서 좋아.`;
export function recordLine(gained: number, earned: number): string {
  if (earned >= DAILY_FOOD_MAX && gained > 0) return "오늘 마음 다 들었어. 밥이 다섯 개야.";
  if (gained > 0) return `마음 ${gained}개 받았어. 마음밥 +${gained}`;
  return "네 마음, 잘 간직해 둘게.";
}
export const RESULT_LINE = "다 적었어. 아래에 놓아 둘게.";

/** 칭찬·사랑·정리를 기다리는 동안 방 안의 모루가 돌려 말하는 문장 */
export const PRAISE_WAITING = ["네 하루를 천천히 읽고 있어.", "새싹이 살짝 흔들렸어. 좋은 걸 찾았나 봐.", "네가 지나친 작은 좋은 점을 줍고 있어.", "조금만 기다려 줘. 꼭 말해 주고 싶은 게 있어."];
export const LOVE_WAITING = ["네 옆에 조용히 앉아 있을게.", "이불 반쪽 덮어 줄게. 천천히 들을게.", "네 마음에 닿을 말을 고르고 있어.", "조금만 기다려 줘. 따뜻하게 건넬게."];
export const BRIEFING_WAITING = ["오늘 남긴 마음을 하나씩 펼쳐 보고 있어.", "어디로 움직였는지 천천히 따라가는 중이야.", "작은 한 걸음 하나를 고르고 있어."];

/** 마음 단계에서 한 번에 넣는 마음 (예전 모루 5문항의 선택지) */
export const MOOD_CHIPS = ["편안해", "기뻐", "그저 그래", "지쳤어", "슬퍼", "불안해"];

/** 흐름 보기 위에 놓는 모루의 한 줄 (AI 아님) */
export function flowLine(days: number, recorded: number, ups: number, downs: number): string {
  if (recorded < 2) return "점이 두 개 모이면 흐름이 보여. 천천히 같이 보자.";
  if (ups > downs) return `최근 ${days}일, 올라온 날이 ${ups}번이야. 작은 오르막도 다 봤어.`;
  if (downs > ups) return "내려간 날도 있었지. 그런 날도 들려줘서 고마워.";
  return "크게 흔들리지 않고 지나왔어. 그것도 힘이야.";
}

/* ---------- 홈 밖에서 모루를 그릴 때 쓰는 이름·모습 (계정별, 이 기기) ---------- */

export interface Companion { name: string; appearance: string }
const COMPANION_KEY = "moru:companion:v1";
export const DEFAULT_COMPANION: Companion = { name: "모루", appearance: "moru" };
export const loadCompanion = (): Companion => ({ ...DEFAULT_COMPANION, ...read<Partial<Companion>>(COMPANION_KEY, {}) });
export const saveCompanion = (c: Companion) => write(COMPANION_KEY, c);

/** 끼니를 먹은 걸 처음 보는 순간에만 말하려고, 마지막으로 본 끼니를 계정별로 기억한다 */
const SEEN_MEALS_KEY = "moru:seen-meals:v1";
export function takeNewMeal(date: string, meals: number): number | null {
  const seen = read<{ date?: string; meals?: number }>(SEEN_MEALS_KEY, {});
  write(SEEN_MEALS_KEY, { date, meals });
  const before = seen.date === date ? seen.meals ?? 0 : 0;
  return meals > before && meals > 0 ? meals - 1 : null; // 방금 먹은 끼니의 번호 (0 아침 · 1 점심 · 2 저녁)
}
