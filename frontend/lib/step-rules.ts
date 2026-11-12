/**
 * 작은 한 걸음 (기록 탭 › 나 돌보기)의 순수 규칙: 행동 목록, 카드 고르기, 기록의 모양, 모루의 말.
 * 브라우저 API 도 import 도 없다 (scripts/step-rules.test.mjs 가 이 파일을 그대로 읽어 검사한다). 저장은 lib/steps.ts.
 *
 * 기운을 고르면 그 기운에 맞는 아주 작은 행동 세 장을 보여 주고, 하나를 해 본 뒤 "하기 전보다 어때?"를 한 번 묻는다.
 * 소로우는 의료 서비스가 아니다: 효과를 약속하는 말, 진단·치료 표현은 쓰지 않는다. 못 해도 잃는 것이 없고 탓하는 말도 없다.
 * 기획과 근거: docs/LOG_CONTENT_PLAN.md
 */

/** 1 꼼짝하기 싫어 · 2 조금은 움직일 수 있어 · 3 괜찮아 */
export type StepEnergy = 1 | 2 | 3;
export type StepKind = "body" | "out" | "tidy" | "joy" | "people" | "rest";
/** 하기 전보다: -1 더 가라앉았어 · 0 그대로야 · 1 조금 나아 */
export type StepAfter = -1 | 0 | 1;

export interface Step {
  id: string;
  /** 카드에 보이는 문장 */
  text: string;
  /** "오늘 한 일"에 남는 짧은 이름. 추천 칩(ACTION_PRESETS)과 같은 말이면 그 칩이 켜진다 */
  did: string;
  energy: StepEnergy;
  kind: StepKind;
  /** 걸리는 시간(분, 어림) */
  min: number;
  /** 1분 숨 고르기 시트로 한다 */
  breath?: boolean;
  /** 앱 안의 다른 화면에서 하는 일 */
  href?: string;
}

export const STEP_TEXT_MAX = 40;
export const KIND_LABEL: Record<StepKind, string> = { body: "몸", out: "바깥", tidy: "정돈", joy: "즐거움", people: "사람", rest: "쉼" };
export const ENERGY_OPTIONS: { value: StepEnergy; label: string; hint: string }[] = [
  { value: 1, label: "꼼짝하기 싫어", hint: "누워서도 되는 것만 볼게요" },
  { value: 2, label: "조금은 움직일 수 있어", hint: "방 안에서 되는 것으로" },
  { value: 3, label: "괜찮아", hint: "문밖까지도 괜찮은 날" },
];
export const AFTER_OPTIONS: { value: StepAfter; label: string }[] = [
  { value: -1, label: "더 가라앉았어" },
  { value: 0, label: "그대로야" },
  { value: 1, label: "조금 나아" },
];
export const afterLabel = (after: StepAfter): string => AFTER_OPTIONS.find((o) => o.value === after)?.label ?? "";

/** 숨 고르기는 "꼼짝하기 싫어"의 첫 장으로 늘 먼저 보인다 */
export const BREATH_STEP_ID = "breath";

export const STEPS: Step[] = [
  // 꼼짝하기 싫어: 누운 자리나 손 닿는 데서 끝나는 것
  { id: BREATH_STEP_ID, text: "1분 숨 고르기", did: "숨 고르기", energy: 1, kind: "rest", min: 1, breath: true },
  { id: "water", text: "물 한 잔 마시기", did: "물 한 잔", energy: 1, kind: "body", min: 1 },
  { id: "curtain", text: "커튼 걷기", did: "커튼 걷음", energy: 1, kind: "out", min: 1 },
  { id: "lie-stretch", text: "누운 채로 기지개 한 번", did: "기지개", energy: 1, kind: "body", min: 1 },
  { id: "window", text: "창문 열고 숨 세 번", did: "창문 엶", energy: 1, kind: "out", min: 1 },
  { id: "song", text: "좋아하는 노래 한 곡 틀기", did: "노래 한 곡", energy: 1, kind: "joy", min: 3 },
  { id: "sit-up", text: "일어나 앉아 보기", did: "일어나 앉음", energy: 1, kind: "body", min: 1 },
  { id: "sky", text: "창밖 하늘 열까지 세며 보기", did: "하늘 봄", energy: 1, kind: "out", min: 1 },
  { id: "photo", text: "사진첩에서 좋아하는 사진 한 장 보기", did: "좋아하는 사진 봄", energy: 1, kind: "joy", min: 1 },
  { id: "light", text: "방 불 하나 켜기", did: "불 켬", energy: 1, kind: "tidy", min: 1 },
  { id: "bite", text: "뭐라도 한 입 먹기", did: "한 입 먹음", energy: 1, kind: "body", min: 2 },
  { id: "warm-hands", text: "따뜻한 물에 손 잠깐 담그기", did: "손 씻음", energy: 1, kind: "rest", min: 2 },
  { id: "pillow", text: "베개 뒤집어 시원한 쪽으로 눕기", did: "잠깐 쉼", energy: 1, kind: "rest", min: 1 },
  // 조금은 움직일 수 있어: 방 안에서 되는 것
  { id: "wash-face", text: "세수하기", did: "세수", energy: 2, kind: "body", min: 2 },
  { id: "blanket", text: "이불 개기", did: "이불 갬", energy: 2, kind: "tidy", min: 1 },
  { id: "desk-three", text: "책상 위 세 가지만 제자리에", did: "집 정리", energy: 2, kind: "tidy", min: 2 },
  { id: "hello", text: "누군가에게 안부 한 줄 보내기", did: "안부 보냄", energy: 2, kind: "people", min: 2 },
  { id: "shower", text: "따뜻한 물로 씻기", did: "샤워", energy: 2, kind: "body", min: 10 },
  { id: "trash", text: "눈에 보이는 쓰레기 하나 버리기", did: "집 정리", energy: 2, kind: "tidy", min: 1 },
  { id: "cup", text: "컵 하나만 씻기", did: "설거지", energy: 2, kind: "tidy", min: 1 },
  { id: "teeth", text: "양치하기", did: "양치", energy: 2, kind: "body", min: 3 },
  { id: "clothes", text: "옷 갈아입기", did: "옷 갈아입음", energy: 2, kind: "body", min: 2 },
  { id: "sunlight", text: "창가에서 햇빛 2분 쬐기", did: "햇빛 쬠", energy: 2, kind: "out", min: 2 },
  { id: "shoulders", text: "어깨 돌리고 기지개 켜기", did: "스트레칭", energy: 2, kind: "body", min: 1 },
  { id: "meal", text: "간단하게라도 밥 챙겨 먹기", did: "밥 챙겨 먹음", energy: 2, kind: "body", min: 15 },
  { id: "tea", text: "따뜻한 차 한 잔 우리기", did: "차 한 잔", energy: 2, kind: "joy", min: 3 },
  { id: "phone-away", text: "폰을 손 닿지 않는 곳에 10분 두기", did: "폰 멀리 둠", energy: 2, kind: "rest", min: 10 },
  // 괜찮아: 문밖이나 조금 더 긴 것
  { id: "walk-5", text: "집 앞까지 5분 걷기", did: "산책", energy: 3, kind: "out", min: 5 },
  { id: "task-5", text: "미뤄 둔 일 5분만 하기", did: "미룬 일 5분", energy: 3, kind: "tidy", min: 5 },
  { id: "comfort", text: "외침에 위로 한마디 남기기", did: "위로 한마디", energy: 3, kind: "people", min: 3, href: "/c/home" },
  { id: "call", text: "보고 싶은 사람에게 전화 걸기", did: "전화함", energy: 3, kind: "people", min: 5 },
  { id: "read", text: "책 두 쪽 읽기", did: "책 읽음", energy: 3, kind: "joy", min: 5 },
  { id: "walk-15", text: "동네 한 바퀴 15분 걷기", did: "산책", energy: 3, kind: "out", min: 15 },
  { id: "tidy-10", text: "한 군데만 10분 정리하기", did: "집 정리", energy: 3, kind: "tidy", min: 10 },
  { id: "move-5", text: "몸을 5분 움직이기", did: "운동", energy: 3, kind: "body", min: 5 },
  { id: "meet", text: "누군가와 밥 약속 잡기", did: "약속 잡음", energy: 3, kind: "people", min: 3 },
  { id: "laundry", text: "빨래 돌리기", did: "빨래", energy: 3, kind: "tidy", min: 5 },
  { id: "cook", text: "먹고 싶은 것 하나 해 먹기", did: "밥 챙겨 먹음", energy: 3, kind: "body", min: 20 },
  { id: "drink-out", text: "밖에 나가 마실 것 하나 사 오기", did: "바깥 나감", energy: 3, kind: "out", min: 10 },
  { id: "plant", text: "화분이나 창가 한 번 돌보기", did: "창가 돌봄", energy: 3, kind: "joy", min: 3 },
];

export const stepById = (id: string): Step | undefined => STEPS.find((s) => s.id === id);

/** 직접 쓴 한 걸음. 빈 글이면 null */
export function customStep(text: string, energy: StepEnergy): Step | null {
  const t = text.trim().slice(0, STEP_TEXT_MAX);
  return t ? { id: "custom", text: t, did: t, energy, kind: "rest", min: 2 } : null;
}

/** 문자열 → [0, 1). 날짜와 기운으로 하루 동안 같은 순서를 만든다 (FNV-1a) */
export function stepHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 방금 "더 가라앉았어"를 골랐으면 다음에는 한 단계 쉬운 것을 보여 준다 */
export function easedEnergy(energy: StepEnergy, lastAfter: StepAfter | null): StepEnergy {
  return lastAfter === -1 && energy > 1 ? ((energy - 1) as StepEnergy) : energy;
}

/**
 * 오늘 이 기운에 보여 줄 카드 세 장. 하루 동안 순서가 같고, "다른 것 보기"(round)를 누를 때마다 다음 세 장으로 넘어간다.
 * 한 묶음 안에서는 갈래(몸·바깥·정돈…)가 겹치지 않게 고르고, 오늘 이미 한 것은 뺀다 (남은 것이 모자라면 다시 넣는다).
 */
export function pickSteps(energy: StepEnergy, date: string, round = 0, doneIds: string[] = []): Step[] {
  const all = STEPS.filter((s) => s.energy === energy);
  const fresh = all.filter((s) => !doneIds.includes(s.id));
  const pool = fresh.length >= 3 ? fresh : all;
  const ordered = [...pool].sort((a, b) => stepHash(`${date}|${a.id}`) - stepHash(`${date}|${b.id}`));
  // 숨 고르기는 맨 앞에
  const breathAt = ordered.findIndex((s) => s.id === BREATH_STEP_ID);
  if (breathAt > 0) ordered.unshift(...ordered.splice(breathAt, 1));
  const rest = [...ordered];
  const pages: Step[][] = [];
  while (rest.length) {
    const page: Step[] = [];
    for (let i = 0; i < rest.length && page.length < 3;) {
      if (page.some((p) => p.kind === rest[i].kind)) i++;
      else page.push(...rest.splice(i, 1));
    }
    while (page.length < 3 && rest.length) page.push(rest.shift()!);
    // 마지막 묶음이 모자라면 앞에서 채운다
    for (const s of ordered) {
      if (page.length >= 3) break;
      if (!page.includes(s)) page.push(s);
    }
    pages.push(page);
  }
  return pages.length ? pages[((round % pages.length) + pages.length) % pages.length] : [];
}

/* ---------- 나중에 할게: "언제 → 무엇을" 한 문장 ---------- */

export const WHEN_OPTIONS: { id: string; label: string; tomorrow?: boolean }[] = [
  { id: "meal", label: "밥 먹고 나서" },
  { id: "wash", label: "씻고 나서" },
  { id: "bed", label: "자기 전에" },
  { id: "morning", label: "내일 아침", tomorrow: true },
];

/* ---------- 이 기기에 남기는 것 ---------- */

/** 카드에서 고른 한 걸음 (목록의 것이든 직접 쓴 것이든 같은 모양으로 남긴다) */
export interface StepRef { id: string; text: string; did: string; breath?: boolean; href?: string }
export interface StepEntry { date: string; stepId: string; text: string; did: string; energy: StepEnergy; after: StepAfter; at: number }
export interface StepPlan { step: StepRef; energy: StepEnergy; when: string; /** 하기로 한 날 (YYYY-MM-DD) */ due: string }
export interface StepDoing { step: StepRef; energy: StepEnergy; date: string; startedAt: number }
export interface StepState { log: StepEntry[]; plan: StepPlan | null; doing: StepDoing | null }

export const STEP_LOG_MAX = 90;
export const EMPTY_STEPS: StepState = { log: [], plan: null, doing: null };

export const refOf = (s: Step): StepRef => ({ id: s.id, text: s.text, did: s.did, ...(s.breath ? { breath: true } : {}), ...(s.href ? { href: s.href } : {}) });
export const planLine = (plan: StepPlan): string => `${plan.when} → ${plan.step.text}`;

const isEnergy = (v: unknown): v is StepEnergy => v === 1 || v === 2 || v === 3;
const isAfter = (v: unknown): v is StepAfter => v === -1 || v === 0 || v === 1;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
function asRef(v: unknown): StepRef | null {
  const r = v as Partial<StepRef> | null;
  if (!r || typeof r.id !== "string" || typeof r.text !== "string" || typeof r.did !== "string" || !r.text.trim() || !r.did.trim()) return null;
  // href 는 목록에 있는 것만 믿는다 (저장된 값으로 엉뚱한 곳에 보내지 않게)
  const known = STEPS.find((s) => s.id === r.id);
  return { id: r.id, text: r.text.slice(0, STEP_TEXT_MAX), did: r.did.slice(0, STEP_TEXT_MAX), ...(known?.breath ? { breath: true } : {}), ...(known?.href ? { href: known.href } : {}) };
}

/** 저장된 값을 믿을 수 있는 모양으로. 어제 "하는 중"이던 것은 치우고, 기록은 최근 90개만 둔다 */
export function normalizeSteps(raw: unknown, today: string): StepState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof StepState, unknown>>;
  const log: StepEntry[] = [];
  for (const item of Array.isArray(r.log) ? r.log : []) {
    const e = item as Partial<StepEntry> | null;
    if (!e || !isDate(e.date) || !isEnergy(e.energy) || !isAfter(e.after) || typeof e.stepId !== "string" || typeof e.text !== "string" || typeof e.did !== "string" || typeof e.at !== "number") continue;
    log.push({ date: e.date, stepId: e.stepId, text: e.text.slice(0, STEP_TEXT_MAX), did: e.did.slice(0, STEP_TEXT_MAX), energy: e.energy, after: e.after, at: e.at });
  }
  const p = r.plan as Partial<StepPlan> | null | undefined;
  const planStep = p ? asRef(p.step) : null;
  const plan = p && planStep && isEnergy(p.energy) && isDate(p.due) && typeof p.when === "string" && p.when.trim() ? { step: planStep, energy: p.energy, when: p.when.slice(0, 20), due: p.due } : null;
  const d = r.doing as Partial<StepDoing> | null | undefined;
  const doingStep = d ? asRef(d.step) : null;
  const doing = d && doingStep && isEnergy(d.energy) && d.date === today && typeof d.startedAt === "number" ? { step: doingStep, energy: d.energy, date: today, startedAt: d.startedAt } : null;
  return { log: log.slice(-STEP_LOG_MAX), plan, doing };
}

export const entriesOn = (state: StepState, date: string): StepEntry[] => state.log.filter((e) => e.date === date);
/** 오늘 마지막으로 고른 "하기 전보다" (없으면 null) */
export function lastAfterOn(state: StepState, date: string): StepAfter | null {
  const today = entriesOn(state, date);
  return today.length ? today[today.length - 1].after : null;
}

/** 한 걸음을 끝냈다: 기록을 더하고, 하는 중이던 것과 (같은 걸음이면) 정해 둔 것을 치운다 */
export function finishStep(state: StepState, step: StepRef, energy: StepEnergy, after: StepAfter, date: string, at: number): StepState {
  const entry: StepEntry = { date, stepId: step.id, text: step.text, did: step.did, energy, after, at };
  const samePlan = state.plan && state.plan.step.id === step.id && state.plan.step.text === step.text;
  return { log: [...state.log, entry].slice(-STEP_LOG_MAX), plan: samePlan ? null : state.plan, doing: null };
}

/** "오늘 한 일"에 이름을 더한다. 이미 있으면 같은 배열을 그대로 돌려준다 */
export function mergeDid(did: string[], label: string): string[] {
  const t = label.trim().slice(0, STEP_TEXT_MAX);
  return !t || did.includes(t) ? did : [...did, t];
}

/** 시작한 지 얼마나 됐는지 (조용히, 분 단위로만) */
export function elapsedLabel(startedAt: number, now: number): string {
  const min = Math.floor(Math.max(0, now - startedAt) / 60000);
  return min < 1 ? "방금 시작했어요" : `${min}분째`;
}

/* ---------- 모루의 말 (정해진 문구, AI 아님). 재촉·평가·탓하는 말은 넣지 않는다 ---------- */

export const STEP_LINES = {
  intro: ["크게 안 해도 돼. 지금 기운만 알려 줘.", "오늘도 왔구나. 아주 작은 것 하나만 같이 고르자."],
  pick: {
    1: ["그런 날이구나. 누워서도 되는 걸로 골랐어.", "꼼짝하기 싫은 날도 있어. 제일 쉬운 것만 가져왔어."],
    2: ["조금이면 충분해. 이 중에 하나만.", "방 안에서 되는 걸로 골랐어. 천천히 봐."],
    3: ["좋아. 하나만 골라 볼까.", "괜찮은 날이구나. 마음 가는 걸로 하나."],
  } as Record<StepEnergy, string[]>,
  eased: ["아까는 힘들었지. 이번엔 더 쉬운 걸로 골랐어."],
  go: ["다녀와. 나는 여기 있을게.", "천천히 해. 기다릴게."],
  after: {
    "-1": ["그랬구나. 오늘은 여기까지도 괜찮아.", "말해 줘서 고마워. 이제 좀 쉬자."],
    "0": ["그대로여도 괜찮아. 한 건 한 거야.", "바로 달라지지 않아도 돼. 했다는 게 남아."],
    "1": ["했구나. 오늘은 그걸로 충분해.", "조금 나아졌다니 나도 좋아.", "작은 한 걸음, 내가 봤어."],
  } as Record<string, string[]>,
  planned: ["정해 뒀어. 그때 여기 있을게.", "알겠어. 지금은 쉬어도 돼."],
  postponed: ["내일 해도 돼. 급할 것 없어."],
  dropped: ["지웠어. 안 해도 괜찮아."],
  stopped: ["그만둬도 괜찮아. 와 준 걸로 충분해."],
  again: ["하나 더 해 볼래? 안 해도 돼."],
};
