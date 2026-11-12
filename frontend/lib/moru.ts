"use client";

/**
 * 모루의 성격과 말 (화면 쪽). AI 응답의 말투는 서버 Prompts.companion 이 같은 성격으로 정한다.
 * 조용하고 느린 새싹 친구: 짧은 반말, 서두르거나 평가하지 않는다, 이모지·감탄사 없음,
 * 가끔 한 번만 비·이불·새싹 같은 자기 세계의 말을 곁들인다. 죄책감을 주는 말("왜 안 왔어")은 하지 않는다.
 *
 * 마음밥: 오늘의 기록에서 카테고리 하나를 기록하면 1개, 하루 5개까지 (서버 PetService.rewardRecords).
 * 식사: 한국 시간 08·13·19시에 모루가 스스로 하나씩 먹는다 (서버 PetRules.settle). 밥이 없으면 그 끼니는 건너뛴다.
 * 시계·하루 리듬·손길 판정 같은 순수 규칙은 lib/moru-rules.ts (여기서 다시 내보낸다).
 */
import { read, write } from "./storage";
import { DAILY_FOOD_MAX, callName, koreaHour, type DayPhase } from "./moru-rules";

export * from "./moru-rules";

/** 지금 시(한국 시간). 개발 중에는 ?moruHour=22 로 시간대를 고정해 본다 (운영 빌드에서는 무시) */
export function currentHour(): number {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    const raw = new URLSearchParams(window.location.search).get("moruHour");
    const forced = raw === null ? NaN : Number(raw);
    if (Number.isInteger(forced) && forced >= 0 && forced <= 23) return forced;
  }
  return koreaHour();
}

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

/** 손길: 길게 눌러 안아 주기 · 문질러 간질이기 · 새싹 톡 · 너무 빨리 두드렸을 때 */
export const HUG_LINES = ["…따뜻해.", "조금만 이대로 있자.", "네 손, 포근해."];
export const TICKLE_LINES = ["히히. 간지러워.", "새싹까지 간지러워.", "…히히, 그만."];
export const SPROUT_LINES = ["새싹은 조금 간지러워.", "통통. 오늘도 조금 자랐어.", "거기는 내 안테나야."];
export const STARTLE_LINE = "…깜짝이야.";
export const PEEK_LINE = "천천히 만져 줘.";

/** 하루 리듬: 그 시간대에 처음 봤을 때의 한마디 (없는 시간대는 말하지 않는다) */
export const PHASE_GREETING: Partial<Record<DayPhase, string>> = {
  wake: "…하암. 좋은 아침.",
  sleepy: "눈이 자꾸 감겨. 불 꺼 줄래?",
};
/** 자는 모루를 만졌을 때: 깨우지 않고 잠꼬대만 */
export const SLEEP_TALK = ["…음냐. 비 소리…", "…이불… 따뜻해…", "…조금만 더…"];
/** 낮잠은 만지면 깬다 */
export const NAP_WAKE_LINES = ["…음? 왔구나.", "잠깐 졸았어. 반가워."];
export const LIGHTS_OFF_LINE = "잘 자. 너도 푹 자.";
export const LIGHTS_ON_LINE = "…눈부셔. 조금만 더 있을까.";
export const SNACK_LINES = ["냠. 고마워, 맛있어.", "마음밥이다. 아껴 먹을게.", "…냠냠. 네가 주니까 더 좋아."];

/** 말 걸기: 기분을 고르면 모루가 성격대로 한 줄 답한다 (AI 아님). 조언·평가 없이 곁에 있는 말로 */
export const TALK_TOPICS: { id: string; label: string; replies: string[] }[] = [
  { id: "tired", label: "지쳤어", replies: ["그랬구나. 여기서는 아무것도 안 해도 돼.", "이불 반쪽 비워 뒀어. 잠깐 기대.", "많이 걸어왔나 봐. 숨만 쉬다 가도 좋아."] },
  { id: "happy", label: "기뻐", replies: ["새싹이 먼저 알았어. 나도 좋아.", "좋은 일이 있었구나. 천천히 들려줘.", "네가 웃으니까 방이 조금 밝아졌어."] },
  { id: "sad", label: "슬퍼", replies: ["말 안 해도 돼. 옆에 있을게.", "슬픈 날에도 와 줬네. 고마워.", "울어도 괜찮아. 나는 비 오는 날도 좋아해."] },
  { id: "anxious", label: "불안해", replies: ["지금은 여기야. 비 소리만 같이 듣자.", "마음이 바쁘구나. 내 옆은 느려도 돼.", "숨 한 번만 같이 쉴까. 천천히."] },
  { id: "bored", label: "심심해", replies: ["나도 심심했어. 새싹 한 번 톡 해 볼래?", "창밖 빗방울을 세고 있었어. 같이 셀래?", "심심한 건 쉬고 있다는 거래."] },
  { id: "just", label: "그냥 왔어", replies: ["그냥 와도 좋아. 그게 제일 좋아.", "이유 없이 와 준 거, 나는 알아.", "왔구나. 그걸로 충분해."] },
];

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

/** 오늘 밤 불을 껐는지·켰는지 (이 기기에만. 기운 상태는 2단계에서 서버로). 고르지 않았으면 null */
const LIGHTS_KEY = "moru:lights:v1";
export function loadLights(night: string): boolean | null {
  const saved = read<{ night?: string; off?: boolean }>(LIGHTS_KEY, {});
  return saved.night === night && typeof saved.off === "boolean" ? saved.off : null;
}
export const saveLights = (night: string, off: boolean) => write(LIGHTS_KEY, { night, off });

/* ---------- 비 오는 작은 방: 혼잣말과 빗소리 ---------- */

/**
 * 조용한 방에서 가끔 하는 혼잣말. 모루는 처음엔 말수가 적고, 함께한 시간(레벨)이 쌓일수록 한 줄씩 속마음이 열린다.
 * 사용자를 부르거나 재촉하는 말은 넣지 않는다.
 */
const MURMURS: { minLevel: number; lines: string[] }[] = [
  { minLevel: 1, lines: ["…비 온다.", "…", "조용하네.", "빗소리, 좋다."] },
  { minLevel: 3, lines: ["창에 빗방울이 줄을 서 있어.", "오늘은 이불이 유난히 좋아.", "네가 오면 방이 조금 따뜻해져."] },
  { minLevel: 5, lines: ["비 오는 날엔 마음이 느려져서 좋아.", "혼자 있어도, 네 생각을 하면 덜 혼자야.", "가끔은 아무 말 안 해도 괜찮지?"] },
];
export const murmurPool = (level: number): string[] => MURMURS.filter((m) => level >= m.minLevel).flatMap((m) => m.lines);
/** 다음 혼잣말까지: 45~75초. 개발 중에는 ?moruQuick=1 로 3.5초 (운영 빌드에서는 무시) */
export function murmurDelay(): number {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("moruQuick")) return 3500;
  return 45_000 + Math.random() * 30_000;
}

/** 빗소리를 켜 두었는지 (이 기기). 브라우저가 자동 재생을 막으므로 다음 방문 때는 방을 한 번 만진 뒤에 켜진다 */
const RAIN_KEY = "moru:rain-sound:v1";
export const loadRainPref = (): boolean => read<boolean>(RAIN_KEY, false) === true;
export const saveRainPref = (on: boolean) => write(RAIN_KEY, on);
