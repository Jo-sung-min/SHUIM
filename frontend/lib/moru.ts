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
import { DAILY_FOOD_MAX, callName, koreaHour, type DayPhase, type MoodStage } from "./moru-rules";

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

/** 개발 확인용: ?moruLook=moring 으로 모습을, ?moruHome=1 로 공간을 저장 없이 바꿔 본다 (운영 빌드에서는 무시) */
function devParam(name: string): string | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
export const devLook = (): string | null => devParam("moruLook");
/** 개발 확인용: ?moruWeather=rain|snow|clear, ?moruLand=city|forest 로 오늘의 하늘을 바꿔 본다 */
export function devSky(): { weather?: "rain" | "snow" | "clear"; land?: "city" | "forest"; rare?: string } {
  const weather = devParam("moruWeather"), land = devParam("moruLand"), rare = devParam("moruRare");
  return {
    ...(weather === "rain" || weather === "snow" || weather === "clear" ? { weather } : {}),
    ...(land === "city" || land === "forest" ? { land } : {}),
    ...(rare && ["rainbow", "shootingStar", "aurora", "firstSnow"].includes(rare) ? { rare } : {}),
  };
}
/** 오늘의 돌봄 할 일 이름 (서버 PetDays 의 id) */
export const CHORE_NAMES: Record<string, string> = { record: "마음 기록", hug: "안아 주기", tickle: "간질이기", talk: "말 걸기", dust: "먼지 치우기", bath: "목욕", snack: "간식 주기" };
export function devHome(): number | null {
  const raw = devParam("moruHome");
  return raw !== null && /^[0-8]$/.test(raw) ? Number(raw) : null;
}
/** 개발 확인용: ?moruMood=1~5 로 오늘의 기분을 기록과 상관없이 바꿔 본다 (1 울적해 … 5 행복해) */
export function devMood(): MoodStage | null {
  const raw = devParam("moruMood");
  return raw !== null && /^[1-5]$/.test(raw) ? (Number(raw) as MoodStage) : null;
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
/** 돌봄 (2단계): 먼지 치우기 · 목욕 · 푹 잔 아침 · 온기·말끔함·기운이 모두 가득 찼을 때 */
/** 꾸미기: 가구를 놓았을 때 */
export const DECOR_LINES = ["여기 잘 어울린다.", "방이 조금 더 우리 방 같아.", "…마음에 들어."];
export const DUST_LINES = ["방이 조금 넓어졌어.", "먼지가 갔다. 고마워.", "…개운해."];
export const BATH_LINES = ["보글보글. 따뜻해.", "새싹까지 말끔해졌어.", "…비누 냄새, 좋다."];
export const RESTED_GREETING = "푹 잤어. 어젯밤 불 꺼 줘서 고마워.";
export const GLOW_LINE = "오늘은 다 좋아. 네 덕분이야.";

/** 말 걸기: 기분을 고르면 모루가 성격대로 한 줄 답한다 (AI 아님). 조언·평가 없이 곁에 있는 말로 */
export const TALK_TOPICS: { id: string; label: string; replies: string[] }[] = [
  { id: "tired", label: "지쳤어", replies: ["그랬구나. 여기서는 아무것도 안 해도 돼.", "이불 반쪽 비워 뒀어. 잠깐 기대.", "많이 걸어왔나 봐. 숨만 쉬다 가도 좋아."] },
  { id: "happy", label: "기뻐", replies: ["새싹이 먼저 알았어. 나도 좋아.", "좋은 일이 있었구나. 천천히 들려줘.", "네가 웃으니까 방이 조금 밝아졌어."] },
  { id: "sad", label: "슬퍼", replies: ["말 안 해도 돼. 옆에 있을게.", "슬픈 날에도 와 줬네. 고마워.", "울어도 괜찮아. 나는 비 오는 날도 좋아해."] },
  { id: "anxious", label: "불안해", replies: ["지금은 여기야. 비 소리만 같이 듣자.", "마음이 바쁘구나. 내 옆은 느려도 돼.", "숨 한 번만 같이 쉴까. 천천히."] },
  { id: "bored", label: "심심해", replies: ["나도 심심했어. 새싹 한 번 톡 해 볼래?", "창밖 빗방울을 세고 있었어. 같이 셀래?", "심심한 건 쉬고 있다는 거래."] },
  { id: "just", label: "그냥 왔어", replies: ["그냥 와도 좋아. 그게 제일 좋아.", "이유 없이 와 준 거, 나는 알아.", "왔구나. 그걸로 충분해."] },
];
/**
 * 말 걸기에 말 대신 소리로 답하는 친구들: 모루(말랑한 새싹)와 모링(작은 새). 기분마다 그 결의 소리를 낸다.
 * 사람 친구(노아·레오·루미)는 위의 말로 답한다
 */
export const TALK_SOUNDS: Record<string, Record<string, string[]>> = {
  moru: {
    tired: ["몽… 몽…", "말랑… 토닥토닥.", "뭉글… 뭉글…"],
    happy: ["뽀잉! 뽀잉!", "몽글몽글!", "쫀득쫀득~"],
    sad: ["몽…", "토닥… 토닥…", "뭉…"],
    anxious: ["꼬물… 꼬물…", "후우… 몽.", "말랑… 말랑…"],
    bored: ["뿅?", "몽? 뿅뿅?", "뽀잉… 뿅?"],
    just: ["몽글!", "뽀잉~", "몽!"],
  },
  moring: {
    tired: ["삐이…", "쮸우… 쮸.", "삐… 포옥."],
    happy: ["삐약삐약!", "짹짹! 짹!", "쮸잇! 쮸잇!"],
    sad: ["삐…", "쮸우…", "삐이… 삐."],
    anxious: ["삐, 삐…", "쮸… 쮸…", "포르르…"],
    bored: ["짹?", "삐약? 짹짹?", "쮸잇?"],
    just: ["짹!", "삐약!", "쮸잇~"],
  },
};
/** 이 모습의 친구가 이 기분에 하는 답: 소리로 답하는 친구면 소리, 아니면 말 */
export const talkReplies = (appearance: string, topic: { id: string; replies: string[] }): string[] => TALK_SOUNDS[appearance]?.[topic.id] ?? topic.replies;

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

/* ---------- 마음 닮기 (docs/MORU_MOOD_SYNC.md): 오늘의 기분은 내 기록을 닮는다 ----------
   단계는 lib/moru-rules.ts 의 moodOf 가 기록에서 계산한다. 여기는 그 기분의 말과, 닮기를 켜 두었는지(이 기기).
   낮은 날에도 탓하거나 권하지 않고 같이 있다고만 말한다. 사람을 판정하는 말("우울해 보여")은 쓰지 않는다 */

/** 화면에 보이는 기분의 이름: 캐릭터가 자기 기분을 말하는 반말 (기분 칩과 같은 말투) */
export const MOOD_NAMES: Record<MoodStage, string> = { 1: "울적해", 2: "가라앉아", 3: "고요해", 4: "가벼워", 5: "행복해" };
/** 기분에 따른 혼잣말 (고요한 날은 지금까지의 혼잣말 그대로) */
const MOOD_MURMURS: Record<MoodStage, string[]> = {
  1: ["…오늘은 이불 밖이 멀다.", "…", "같이 가라앉아 있자.", "말 안 해도 돼. 나도 그래."],
  2: ["오늘은 마음이 좀 무겁네.", "빗소리만 듣고 있어.", "천천히 있자.", "…후우."],
  3: [],
  4: ["오늘은 새싹이 좀 가벼워.", "창밖이 잘 보여.", "숨이 편하다."],
  5: ["오늘은 그냥 좋아.", "자꾸 콧노래가 나와.", "…흥얼, 흥얼."],
};
/** 오늘 마음을 다 들은 순간, 그날의 기분으로 자리 잡으며 하는 한마디 */
export const MOOD_SETTLE_LINES: Record<MoodStage, string> = {
  1: "들려줘서 고마워. 오늘은 나도 이불 속에 있을게.",
  2: "들려줘서 고마워. 오늘은 나도 같이 가라앉아 있을게.",
  3: "네 마음, 잘 들었어. 오늘은 고요하네.",
  4: "네 마음이 가벼우니까 나도 가벼워.",
  5: "네 마음이 환하니까 나도 그냥 좋아.",
};
/** 닮기가 생긴 뒤 처음 마음을 들은 날에 한 번 */
export const MOOD_INTRO_LINE = "들려줘서 고마워. 이제 나는 네 마음을 닮아 있을게.";
/** 가라앉은 날(1·2단계)의 손길: 웃음은 그대로, 말은 조용히 */
export const LOW_HUG_LINES = ["…고마워. 조금 낫다.", "이대로 조금만 있자.", "네 손, 따뜻해."];
export const LOW_GLOW_LINE = "방이 포근해. 고마워.";
/** 닮기를 켜고 끌 때 */
export const MOOD_ON_LINE = "이제 네 마음을 닮아 있을게.";
export const MOOD_OFF_LINE = "알겠어. 나는 그냥 고요하게 있을게.";
/** 오늘 기록에 많이 힘든 신호가 있는 날: 닮지 않고 곁에 있는다 */
export const MOOD_BESIDE_LINE = "들려줘서 고마워. 오늘은 네 곁에 꼭 있을게.";
/** 오늘의 기분 쪽지의 한 줄: 기록을 말하고 사람을 판정하지 않는다 */
export function moodNoteLine(stage: MoodStage, recorded: boolean): string {
  if (!recorded) {
    if (stage < 3) return "아직 오늘 마음은 못 들었어. 요즘 기록이 조금 내려와 있어서, 나도 그 여운 속이야.";
    if (stage > 3) return "아직 오늘 마음은 못 들었어. 요즘 기록이 조금 올라와 있어서, 나도 그 여운 속이야.";
    return "아직 오늘 마음은 못 들었어. 들려주면 나도 닮아 갈게.";
  }
  return ({
    1: "나는 네가 들려준 마음을 닮아. 기록이 많이 내려와 있어서 나도 이불 속이야. 같이 있자.",
    2: "나는 네가 들려준 마음을 닮아. 요즘 조금 내려와 있더라.",
    3: "나는 네가 들려준 마음을 닮아. 오늘은 크게 흔들리지 않았네.",
    4: "네 마음이 조금 가벼운 날이야. 나도 좋아.",
    5: "네 마음이 환한 날이야. 나도 그냥 좋아.",
  } as Record<MoodStage, string>)[stage];
}
/** 마음 닮기를 켜 두었는지 (이 기기, 계정별). 기본은 켜짐. 끄면 늘 고요해 */
const MOOD_SYNC_KEY = "moru:mood-sync:v1";
export const loadMoodSync = (): boolean => read<boolean>(MOOD_SYNC_KEY, true) !== false;
export const saveMoodSync = (on: boolean) => write(MOOD_SYNC_KEY, on);
/** 닮기를 처음 알리는 한마디를 아직 안 했으면 true 를 돌려주고 했다고 적어 둔다 */
const MOOD_INTRO_KEY = "moru:mood-intro:v1";
export function takeMoodIntro(): boolean {
  if (read<boolean>(MOOD_INTRO_KEY, false) === true) return false;
  write(MOOD_INTRO_KEY, true);
  return true;
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
/** 기운이 낮은 날에는 하품이 섞인다 (탓하는 말은 없다) */
const DROWSY = ["…하암.", "오늘은 조금 졸려."];
/** 오늘의 기분(마음 닮기)에 따라 혼잣말이 달라진다: 울적한 날은 말수가 줄고, 그 밖의 날은 그 기분의 말이 절반쯤 섞인다 */
export function murmurPool(level: number, energy = 4, stage: MoodStage = 3): string[] {
  const base = [...MURMURS.filter((m) => level >= m.minLevel).flatMap((m) => m.lines), ...(energy <= 2 ? DROWSY : [])];
  const mood = MOOD_MURMURS[stage] ?? [];
  if (!mood.length) return base;
  return stage === 1 ? mood : [...mood, ...mood, ...base];
}
/** 다음 혼잣말까지: 45~75초. 개발 중에는 ?moruQuick=1 로 3.5초 (운영 빌드에서는 무시) */
export function murmurDelay(): number {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("moruQuick")) return 3500;
  return 45_000 + Math.random() * 30_000;
}

/** 빗소리를 켜 두었는지 (이 기기). 브라우저가 자동 재생을 막으므로 다음 방문 때는 방을 한 번 만진 뒤에 켜진다 */
const RAIN_KEY = "moru:rain-sound:v1";
export const loadRainPref = (): boolean => read<boolean>(RAIN_KEY, false) === true;
export const saveRainPref = (on: boolean) => write(RAIN_KEY, on);
