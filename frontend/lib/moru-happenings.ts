/**
 * 방 안의 작은 사건 (docs/MORU_HAPPENINGS.md): 날아드는 것 · 물어 온 것 · 화분 · 먼저 묻는 한마디.
 * 순수 규칙만 둔다: 저장소나 브라우저에 기대지 않는다 (scripts/moru-happenings.test.mjs 가 이 파일과 moru-rules.ts 만 읽어 확인한다).
 * 저장은 lib/moru-keep.ts, 그림은 components/MoruHappenings.tsx.
 *
 * 지키는 선: 잃는 것이 없다. 물을 거른 날에도 화분은 시들지 않고, 놓친 것·답하지 않은 물음은 아무 일도 아니다.
 */
import { unitHash, type Land, type MoodStage, type Weather } from "./moru-rules";

/* ---------- 주운 것들: 날아든 것 넷, 물어 온 것 일곱 ---------- */

export type KeepKind = "drift" | "gift";
export interface KeepItem { id: string; name: string; kind: KeepKind; from: string }
export const KEEP_ITEMS: KeepItem[] = [
  { id: "leaf", name: "나뭇잎", kind: "drift", from: "비 오는 날이나 숲이 보이는 맑은 낮에 날아들어요" },
  { id: "petal", name: "꽃잎", kind: "drift", from: "도시가 보이는 맑은 낮에 날아들어요" },
  { id: "snowflake", name: "눈송이", kind: "drift", from: "눈 오는 날에 날아들어요" },
  { id: "starlight", name: "별빛", kind: "drift", from: "맑은 밤에 내려와요" },
  { id: "acorn", name: "도토리", kind: "gift", from: "친구가 물어 와요" },
  { id: "pebble", name: "조약돌", kind: "gift", from: "친구가 물어 와요" },
  { id: "pinecone", name: "솔방울", kind: "gift", from: "친구가 물어 와요" },
  { id: "shell", name: "조개껍데기", kind: "gift", from: "친구가 물어 와요" },
  { id: "button", name: "단추", kind: "gift", from: "친구가 물어 와요" },
  { id: "feather", name: "깃털", kind: "gift", from: "모링이 제 깃털을 골라 줘요" },
  { id: "clover", name: "네잎클로버", kind: "gift", from: "아주 가끔 물어 와요" },
];
export const keepItem = (id: string): KeepItem | undefined => KEEP_ITEMS.find((item) => item.id === id);

/** 하루에 잡아 둘 수 있는 날아든 것. 다 잡은 날은 더 날아들지 않는다 (방이 조용해진다) */
export const DRIFT_KEEP_MAX = 5;
/** 날아든 것이 방을 지나가는 시간(초) */
export const DRIFT_SECONDS = 11;
/** 오늘의 하늘에 날아드는 것: 눈 오는 날은 눈송이, 비 오는 날은 젖은 나뭇잎, 맑은 밤은 별빛, 맑은 낮은 숲이면 나뭇잎·도시면 꽃잎 */
export function driftKind(sky: { weather: Weather; land: Land; night: boolean }): string {
  if (sky.weather === "snow") return "snowflake";
  if (sky.weather === "rain") return "leaf";
  if (sky.night) return "starlight";
  return sky.land === "forest" ? "leaf" : "petal";
}
/** 다음에 날아들 때까지(ms): 처음은 18~32초, 그 뒤는 70~130초. quick 은 개발 확인용 */
export function driftDelay(first: boolean, quick = false, random: () => number = Math.random): number {
  if (quick) return 3000;
  return first ? 18_000 + random() * 14_000 : 70_000 + random() * 60_000;
}
/** 날아든 것이 떨어지기 시작하는 가로 자리(%)와 흔들림: 가장자리의 버튼을 가리지 않게 16~84% */
export function driftPath(random: () => number = Math.random): { x: number; sway: number } {
  return { x: Math.round(16 + random() * 68), sway: Math.round((random() < 0.5 ? -1 : 1) * (18 + random() * 22)) };
}

const GIFT_POOL = ["acorn", "pebble", "pinecone", "shell", "button"];
export const CLOVER_CHANCE = 0.06;
/** 오늘 친구가 물어 온 것: 계정과 날짜로 정해서 하루 동안 같다. 모링은 제 깃털도 고른다. 네잎클로버는 6% */
export function giftOf(who: string, date: string, appearance = "moru"): string {
  if (unitHash(`${who}|${date}|clover`) < CLOVER_CHANCE) return "clover";
  const pool = appearance === "moring" ? [...GIFT_POOL, "feather", "feather"] : GIFT_POOL;
  return pool[Math.min(pool.length - 1, Math.floor(unitHash(`${who}|${date}|gift`) * pool.length))];
}

/* ---------- 화분: 하루 한 번 물을 주면 일곱 번 만에 꽃이 핀다 ---------- */

/** 0 씨앗 · 1 싹 · 2 잎 · 3 봉오리 · 4 꽃 */
export type PlantStage = 0 | 1 | 2 | 3 | 4;
export const BLOOM_WATERS = 7;
export const PLANT_STAGE_NAMES: Record<PlantStage, string> = { 0: "씨앗", 1: "싹", 2: "잎", 3: "봉오리", 4: "꽃" };
export function plantStage(waters: number): PlantStage {
  if (waters >= BLOOM_WATERS) return 4;
  if (waters >= 5) return 3;
  if (waters >= 3) return 2;
  if (waters >= 1) return 1;
  return 0;
}
export const FLOWER_COLORS = ["pink", "yellow", "violet", "sky", "white"] as const;
export type FlowerColor = (typeof FLOWER_COLORS)[number];
export const FLOWER_NAMES: Record<FlowerColor, string> = { pink: "분홍 꽃", yellow: "노랑 꽃", violet: "보라 꽃", sky: "하늘빛 꽃", white: "흰 꽃" };
/** n번째 화분의 꽃 색: 계정마다 다르고, 이어지는 두 화분은 같은 색이 아니다 */
export function flowerColor(who: string, seed: number): FlowerColor {
  const start = Math.floor(unitHash(`${who}|flower`) * FLOWER_COLORS.length);
  const step = 1 + Math.floor(unitHash(`${who}|flower-step`) * (FLOWER_COLORS.length - 1)); // 1~4: 다섯 색을 한 바퀴 돈다
  return FLOWER_COLORS[(start + step * Math.max(0, Math.floor(seed))) % FLOWER_COLORS.length];
}

/* ---------- 이 기기에 남는 상태 ---------- */

export interface PressedFlower { color: FlowerColor; day: string }
export interface Happenings {
  /** 오늘 칸(잡은 것·선물·물음)이 가리키는 한국 날짜 */
  day: string;
  /** 오늘 잡아 둔 날아든 것의 수 */
  caught: number;
  /** 오늘의 선물을 받았는지 */
  gift: boolean;
  /** 오늘 지나간 물음의 때 ("day"·"eve") */
  asked: string[];
  /** 마지막으로 물을 준 날 */
  watered: string | null;
  /** 지금 화분에 준 물의 횟수 (0~7) */
  waters: number;
  /** 몇 번째 화분인지 (꽃 색을 정한다) */
  seed: number;
  /** 주운 것들: 물건 → 개수 */
  shelf: Record<string, number>;
  /** 꽃갈피: 눌러 간직한 꽃 */
  flowers: PressedFlower[];
}
export const SHELF_MAX = 999;
export const FLOWERS_MAX = 60;
export const emptyHappenings = (day: string): Happenings => ({ day, caught: 0, gift: false, asked: [], watered: null, waters: 0, seed: 0, shelf: {}, flowers: [] });

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const count = (value: unknown, max: number): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0);
/** 저장된 값을 믿을 수 있는 모양으로 고치고, 날이 바뀌었으면 오늘 칸을 비운다 (화분과 주운 것들은 그대로) */
export function normalizeHappenings(raw: unknown, today: string): Happenings {
  const base = emptyHappenings(today);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const shelf: Record<string, number> = {};
  if (r.shelf && typeof r.shelf === "object") for (const item of KEEP_ITEMS) {
    const n = count((r.shelf as Record<string, unknown>)[item.id], SHELF_MAX);
    if (n > 0) shelf[item.id] = n;
  }
  const flowers = (Array.isArray(r.flowers) ? r.flowers : [])
    .filter((f): f is PressedFlower => Boolean(f) && typeof f === "object" && FLOWER_COLORS.includes((f as PressedFlower).color) && isDay((f as PressedFlower).day))
    .map((f) => ({ color: f.color, day: f.day })).slice(-FLOWERS_MAX);
  const kept = { watered: isDay(r.watered) ? r.watered : null, waters: count(r.waters, BLOOM_WATERS), seed: count(r.seed, 9999), shelf, flowers };
  if (r.day !== today) return { ...base, ...kept };
  return {
    ...base, ...kept, caught: count(r.caught, DRIFT_KEEP_MAX), gift: r.gift === true,
    asked: (Array.isArray(r.asked) ? r.asked : []).filter((slot): slot is string => slot === "day" || slot === "eve"),
  };
}

const keep = (shelf: Record<string, number>, id: string): Record<string, number> => ({ ...shelf, [id]: Math.min(SHELF_MAX, (shelf[id] ?? 0) + 1) });
/** 오늘 더 날아들 수 있는지 */
export const canDrift = (state: Happenings): boolean => state.caught < DRIFT_KEEP_MAX;
/** 날아든 것을 잡았다. 오늘 다 잡았거나 모르는 물건이면 그대로 */
export function catchDrift(state: Happenings, id: string): Happenings {
  if (!canDrift(state) || keepItem(id)?.kind !== "drift") return state;
  return { ...state, caught: state.caught + 1, shelf: keep(state.shelf, id) };
}
/** 오늘의 선물을 받았다. 하루 한 번 */
export function takeGift(state: Happenings, id: string): Happenings {
  if (state.gift || keepItem(id)?.kind !== "gift") return state;
  return { ...state, gift: true, shelf: keep(state.shelf, id) };
}
export const wateredToday = (state: Happenings, today: string): boolean => state.watered === today;
/** 물 주기: 하루 한 번. 꽃이 핀 뒤에는 더 자라지 않는다. grew 는 이번 물로 모습이 달라졌는지 */
export function waterPlant(state: Happenings, today: string): { state: Happenings; done: boolean; grew: boolean; stage: PlantStage } {
  const before = plantStage(state.waters);
  if (wateredToday(state, today) || before === 4) return { state, done: false, grew: false, stage: before };
  const next = { ...state, watered: today, waters: Math.min(BLOOM_WATERS, state.waters + 1) };
  const stage = plantStage(next.waters);
  return { state: next, done: true, grew: stage !== before, stage };
}
/** 핀 꽃을 꽃갈피로 간직하고 새 씨앗을 심는다. 꽃이 아니면 그대로 */
export function pressFlower(state: Happenings, who: string, today: string): Happenings {
  if (plantStage(state.waters) !== 4) return state;
  return { ...state, waters: 0, watered: state.watered, seed: state.seed + 1, flowers: [...state.flowers, { color: flowerColor(who, state.seed), day: today }].slice(-FLOWERS_MAX) };
}

/* ---------- 먼저 묻는 한마디: 하루 두 번(낮·저녁)까지, 친구가 먼저 말을 건다 ---------- */

export interface AskAnswer { label: string; reply: string; /** 답했을 때의 몸짓 */ mood: "pet" | "happy"; /** 모링의 얼굴 (말 걸기의 기분 id) */ feel?: string; /** 숨 고르기를 연다 */ breathe?: boolean }
export interface Ask { id: string; text: string; answers: [AskAnswer, AskAnswer]; /** 가라앉은 날에도 물어도 되는 물음 */ gentle?: boolean; /** 이 때에만 */ slot?: "day" | "eve" }
/** 조언·평가 없이, 몸을 한 번 살피게 하는 가벼운 물음. 어느 답을 골라도 탓하지 않는다 */
export const ASKS: Ask[] = [
  { id: "water", text: "오늘 물은 마셨어?", gentle: true, answers: [
    { label: "마셨어", reply: "잘했어. 나도 한 모금 마실게.", mood: "happy", feel: "happy" },
    { label: "아직", reply: "그럼 지금 한 모금만. 기다릴게.", mood: "pet", feel: "just" }] },
  { id: "meal", text: "밥은 먹었어?", answers: [
    { label: "먹었어", reply: "다행이다. 든든하겠다.", mood: "happy", feel: "happy" },
    { label: "아직", reply: "조금이라도 먹자. 나는 마음밥이면 돼.", mood: "pet", feel: "sad" }] },
  { id: "sky", text: "오늘 하늘은 봤어?", slot: "day", answers: [
    { label: "봤어", reply: "나는 창으로만 봐. 같은 하늘이네.", mood: "happy", feel: "just" },
    { label: "아직", reply: "창문만 잠깐 열어 봐. 나도 같이 볼게.", mood: "pet", feel: "bored" }] },
  { id: "sleep", text: "어젯밤엔 잘 잤어?", slot: "day", gentle: true, answers: [
    { label: "잘 잤어", reply: "좋겠다. 오늘은 몸이 가볍겠네.", mood: "happy", feel: "happy" },
    { label: "잘 못 잤어", reply: "그랬구나. 오늘은 느리게 가자.", mood: "pet", feel: "tired" }] },
  { id: "shoulder", text: "어깨, 귀 쪽으로 올라가 있지 않아?", answers: [
    { label: "내렸어", reply: "응. 거기가 편한 자리야.", mood: "happy", feel: "just" },
    { label: "그냥 둘래", reply: "그래도 돼. 생각나면 한 번만.", mood: "pet", feel: "tired" }] },
  { id: "breath", text: "숨 한 번 같이 쉴까?", gentle: true, answers: [
    { label: "좋아", reply: "천천히. 나도 같이 부풀게.", mood: "pet", feel: "anxious", breathe: true },
    { label: "나중에", reply: "응. 언제든 좋아.", mood: "pet", feel: "just" }] },
  { id: "good", text: "오늘 좋았던 게 하나라도 있었어?", slot: "eve", answers: [
    { label: "있었어", reply: "나중에 기록에 적어 줘. 듣고 싶어.", mood: "happy", feel: "happy" },
    { label: "딱히 없어", reply: "그런 날도 있지. 여기 온 걸로 충분해.", mood: "pet", feel: "tired" }] },
  { id: "stay", text: "조금만 곁에 있어도 돼?", gentle: true, answers: [
    { label: "응", reply: "고마워. 말은 안 해도 돼.", mood: "pet", feel: "tired" },
    { label: "나도 그러고 싶었어", reply: "…다행이다. 같이 있자.", mood: "happy", feel: "happy" }] },
];
/** 물음이 나오는 때: 8~16시는 낮, 17~21시는 저녁. 기상 직후·낮잠·졸린 시간·한밤에는 묻지 않는다 */
export function askSlot(hour: number): "day" | "eve" | null {
  if (hour >= 8 && hour <= 16 && hour !== 15) return "day";
  if (hour >= 17 && hour <= 21) return "eve";
  return null;
}
/**
 * 이번 때의 물음 하나: 계정·날짜·때로 정해서 하루 동안 같다. 이미 지나간 때면 null.
 * 가라앉은 날(기분 1·2)에는 조용한 물음만 고르고, 숨 고르기를 열 수 없으면 그 물음은 뺀다
 */
export function pickAsk(who: string, date: string, slot: "day" | "eve" | null, state: Happenings, opts: { stage?: MoodStage; canBreathe?: boolean } = {}): Ask | null {
  if (!slot || state.asked.includes(slot)) return null;
  const low = (opts.stage ?? 3) <= 2;
  const pool = ASKS.filter((ask) => (!ask.slot || ask.slot === slot) && (!low || ask.gentle) && (opts.canBreathe || !ask.answers.some((a) => a.breathe)));
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(unitHash(`${who}|${date}|ask|${slot}`) * pool.length))];
}
/** 이번 때의 물음이 지나갔다 (답했거나, 닫았거나, 그냥 사라졌거나) */
export const markAsked = (state: Happenings, slot: string): Happenings => (state.asked.includes(slot) ? state : { ...state, asked: [...state.asked, slot] });
/** 물음이 답 없이 떠 있는 시간(ms). 지나면 조용히 사라진다 */
export const ASK_STAY_MS = 22_000;

/* ---------- 말 ---------- */

/** 날아든 것을 잡았을 때 */
export const DRIFT_LINES: Record<string, string[]> = {
  leaf: ["잎이 들어왔네. 잘 잡았어.", "바람이 두고 갔나 봐.", "…비 냄새가 나."],
  petal: ["꽃잎이야. 어디서 왔을까.", "가볍다. 잘 받아 뒀어.", "창밖에 꽃이 있나 봐."],
  snowflake: ["눈송이다. 녹기 전에 봤어.", "차가워. 그래도 예쁘다.", "하나도 같은 게 없대."],
  starlight: ["별빛이 길을 잃었나 봐.", "…반짝. 잘 잡았어.", "오늘 밤은 방이 조금 밝아."],
};
/** 물어 온 것을 받았을 때 */
export const GIFT_LINES = ["창가에서 주웠어. 너 주려고.", "이거, 네 생각이 나서.", "작지만 예뻐서. 받아 줘."];
export const CLOVER_LINE = "네 잎이야. 한참 찾았어. 너 가져.";
export const FEATHER_LINE = "내 깃털이야. 제일 고운 걸로 골랐어.";
/** 물을 줬을 때: 모습이 달라진 날의 한마디와 그대로인 날의 한마디 */
export const GROW_LINES: Record<PlantStage, string> = {
  0: "",
  1: "싹이 났어. 작다. …귀엽다.",
  2: "잎이 넓어졌어. 네가 준 물이야.",
  3: "봉오리가 맺혔어. 이제 곧이야.",
  4: "꽃이 폈어. 네가 하루하루 물을 줘서야. 고마워.",
};
export const WATER_LINES = ["흙이 촉촉해졌어.", "잘 마신다.", "천천히 자라는 중이야."];
export const WATERED_LINE = "오늘은 충분히 마셨대. 내일 또 주자.";
export const BLOOMED_LINE = "꽃이 활짝이야. 간직해도 되고, 그냥 두고 봐도 좋아.";
export const PRESS_LINE = "책 사이에 잘 눌러 뒀어. 새 씨앗도 심었어.";
/** 모링의 머리를 긁어 줬을 때 */
export const SCRATCH_LINES = ["…거기, 좋아.", "조금만 더. 눈이 감겨.", "머리 긁어 주는 게 제일 좋아."];
/** 화분의 지금을 한 줄로 */
export function plantStatus(state: Happenings, today: string): string {
  const stage = plantStage(state.waters);
  if (stage === 4) return "꽃이 폈어요";
  const left = BLOOM_WATERS - state.waters;
  return wateredToday(state, today) ? `오늘 물을 줬어요 · 꽃까지 ${left}번` : `물을 기다려요 · 꽃까지 ${left}번`;
}
