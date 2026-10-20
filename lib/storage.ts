"use client";

import { CATEGORIES, CategoryId, MemoCat } from "./categories";

/* ---------- 기록(점수+메모) ---------- */

export interface CategoryEntry {
  score: number; // 오늘 위치: -5 ~ +5 (어제 위치 + 오늘 고른 변화, 범위 밖이면 끝에서 멈춤)
  delta?: number; // 오늘 고른 "어제보다" 변화: -3 ~ +3 (입력 UI용, 없으면 score 차이로 계산)
  note: string;
}

export type DayRecord = Partial<Record<CategoryId, CategoryEntry>>;
export type Journal = Record<string, DayRecord>; // key: YYYY-MM-DD

/* ---------- 오늘 한 행동 ---------- */

export interface DayLog {
  did: string[]; // 오늘 한 행동 (짧은 문구)
}
export type LogBook = Record<string, DayLog>;

/* ---------- 메모 ---------- */

export interface Memo {
  id: string;
  cat: MemoCat;
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ---------- 목표 ---------- */

export interface GoalStep {
  id: string;
  text: string;
  done: boolean;
}

export interface Goal {
  id: string;
  title: string;
  cat: MemoCat;
  why: string; // 왜 이 목표인지 (선택)
  steps: GoalStep[];
  due?: string; // YYYY-MM-DD
  createdAt: number;
  doneAt?: number;
}

/* ---------- 일정 ---------- */

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  title: string;
  cat: MemoCat;
  done: boolean;
}

/* ---------- 오늘의 나 브리핑 ---------- */

export interface BriefingData {
  headline: string;
  momentum: { direction: "up" | "flat" | "down"; text: string };
  highlights: string[];
  today: { schedule: string; goals: string };
  nextStep: string;
  question: string;
}

export interface Briefing {
  date: string;
  generatedAt: number;
  source: "ai" | "local";
  crisis: boolean;
  data: BriefingData;
}

/* ---------- 나를 칭찬하기 / 사랑하기 ---------- */

export type MomentMode = "praise" | "love";

export interface MomentData {
  title: string;
  lines: string[];
  closing: string;
}

export interface Moment {
  date: string;
  mode: MomentMode;
  generatedAt: number;
  source: "ai" | "local";
  crisis: boolean;
  data: MomentData;
}

/* ---------- 메모로 나를 점검하기 ---------- */

export interface ReviewData {
  headline: string;
  cautions: { past: string; now: string; note: string }[];
  changes: string[];
  growth: string;
  question: string;
}

export interface Review {
  date: string;
  generatedAt: number;
  source: "ai" | "local";
  crisis: boolean;
  data: ReviewData;
}

/* ---------- 키 & 공통 ---------- */

const K = {
  journal: "maeum-accel:v1",
  log: "maeum-accel:log:v1",
  memos: "maeum-accel:memos:v1",
  goals: "maeum-accel:goals:v1",
  schedule: "maeum-accel:schedule:v1",
  briefing: "maeum-accel:briefing:v1",
  moments: "maeum-accel:moments:v1",
  review: "maeum-accel:review:v1",
  profile: "maeum-accel:profile:v1",
  notif: "maeum-accel:notif:v1",
} as const;
/** 계정과 무관하게 기기 전체에서 공유하는 키 (커뮤니티 샘플 세계, 프롬프트, 계정 목록, 세션) */
export const SESSION_KEY = "maeum-accel:session:v1";
export const PROMPTS_KEY = "maeum-accel:prompts:v1";

/** 로그인한 계정 id (없으면 null = 게스트) */
export function sessionUserId(): string | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? ((JSON.parse(raw) as { userId?: string }).userId ?? null) : null;
  } catch {
    return null;
  }
}

/** 개인 데이터 키를 계정별로 분리. 게스트는 원래 키 그대로(기존 데이터 유지). */
function ns(key: string): string {
  const u = sessionUserId();
  return u ? `${key}:${u}` : key;
}

function readRaw<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeRaw(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장소 사용 불가 시 무시 (프로토타입) */
  }
}

/** 개인 데이터 (계정별) */
export const read = <T,>(key: string, fallback: T): T => readRaw(ns(key), fallback);
export const write = (key: string, value: unknown) => writeRaw(ns(key), value);
/** 기기 공유 데이터 (계정 무관) */
export const readShared = readRaw;
export const writeShared = writeRaw;

/** 회원가입 직후: 게스트로 쓰던 개인 데이터를 새 계정으로 복사 (계정 데이터가 비어 있을 때만) */
export function adoptGuestData(userId: string) {
  const personal = [K.journal, K.log, K.memos, K.goals, K.schedule, K.briefing, K.moments, K.review, K.profile, K.notif];
  try {
    for (const key of personal) {
      const target = `${key}:${userId}`;
      const guest = window.localStorage.getItem(key);
      if (guest && !window.localStorage.getItem(target)) window.localStorage.setItem(target, guest);
    }
  } catch {
    /* noop */
  }
}

export { uid, todayKey, addDays } from "./dates";
import { uid, todayKey, addDays } from "./dates";

/* ---------- 기록 ---------- */

export const loadJournal = () => read<Journal>(K.journal, {});
export const saveJournal = (j: Journal) => write(K.journal, j);

export function saveDay(date: string, day: DayRecord) {
  const j = loadJournal();
  if (Object.keys(day).length === 0) delete j[date];
  else j[date] = day;
  saveJournal(j);
}

/** 연속 기록 일수 (오늘 또는 어제부터 거꾸로) */
export function streak(j: Journal, from = todayKey()): number {
  let d = j[from] ? from : addDays(from, -1);
  let n = 0;
  while (j[d]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/* ---------- 오늘 한 행동 ---------- */

export const loadLog = () => read<LogBook>(K.log, {});
export function saveDayLog(date: string, log: DayLog) {
  const b = loadLog();
  if (log.did.length === 0) delete b[date];
  else b[date] = log;
  write(K.log, b);
}

/* ---------- 메모 ---------- */

export const loadMemos = () => read<Memo[]>(K.memos, []);
export const saveMemos = (m: Memo[]) => write(K.memos, m);

/* ---------- 목표 ---------- */

export const loadGoals = () => read<Goal[]>(K.goals, []);
export const saveGoals = (g: Goal[]) => write(K.goals, g);

export function goalProgress(g: Goal): number {
  if (g.doneAt) return 1;
  if (!g.steps.length) return 0;
  return g.steps.filter((s) => s.done).length / g.steps.length;
}

/* ---------- 일정 ---------- */

export const loadSchedule = () => read<ScheduleItem[]>(K.schedule, []);
export const saveSchedule = (s: ScheduleItem[]) => write(K.schedule, s);

/* ---------- 브리핑 캐시 (하루 1개) ---------- */

export const loadBriefing = () => read<Briefing | null>(K.briefing, null);
export const saveBriefing = (b: Briefing) => write(K.briefing, b);
export function clearBriefing() {
  try {
    window.localStorage.removeItem(K.briefing);
  } catch {
    /* noop */
  }
}

/* ---------- 칭찬/사랑하기 캐시 (모드별 하루 1개) ---------- */

type MomentCache = Partial<Record<MomentMode, Moment>>;
export const loadMoments = () => read<MomentCache>(K.moments, {});
export function saveMoment(m: Moment) {
  write(K.moments, { ...loadMoments(), [m.mode]: m });
}
export function clearMoments() {
  try {
    window.localStorage.removeItem(K.moments);
  } catch {
    /* noop */
  }
}

/* ---------- 점검 캐시 (하루 1개) ---------- */

export const loadReview = () => read<Review | null>(K.review, null);
export const saveReview = (r: Review) => write(K.review, r);

/* ---------- 내 정보 (이름·전화번호) ---------- */

export interface Profile {
  name: string;
  phone: string; // 숫자와 - 만
}
export const loadProfile = () => read<Profile>(K.profile, { name: "", phone: "" });
export const saveProfile = (p: Profile) => write(K.profile, { name: p.name.trim().slice(0, 20), phone: p.phone.replace(/[^0-9-]/g, "").slice(0, 14) });
/** 010-1234-5678 형태로 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/* ---------- 알림 읽음 시각 ---------- */

export const loadNotifSeen = () => read<number>(K.notif, 0);
export const markNotifSeen = () => write(K.notif, Date.now());

/* ---------- 프롬프트 덮어쓰기 (관리자, 기기 공유) ---------- */

/** 관리자 설정: 프롬프트 덮어쓰기 4종 + 사용할 모델(model) */
export type PromptOverrides = Partial<Record<"briefing" | "praise" | "love" | "review" | "model", string>>;
export const loadPrompts = () => readShared<PromptOverrides>(PROMPTS_KEY, {});
export const savePrompts = (p: PromptOverrides) => writeShared(PROMPTS_KEY, p);

/* ---------- 전체 삭제 ---------- */

export function clearAll() {
  // 현재 계정(또는 게스트)의 개인 데이터만 (커뮤니티는 서버 DB)
  for (const k of Object.values(K)) {
    try {
      window.localStorage.removeItem(ns(k));
    } catch {
      /* noop */
    }
  }
}

/* ---------- 데모용 샘플 ---------- */

export function seedSampleData() {
  const notes: Record<CategoryId, string[]> = {
    money: ["계좌 안 봄", "하이닉스 또 빠짐", "전세금 얘기 들음", "지출 줄이기 시작", "앱 하루 한 번만 확인"],
    work: ["일 평소대로", "이력서 한 줄 고침", "공고 3개 저장", "사이드 프로젝트 아이디어", "코드 리뷰 칭찬 받음"],
    relation: ["그 사람이랑 통화", "부모님께 전화", "연락 없음", "만나서 밥 먹음", "솔직하게 얘기함"],
    body: ["잠 4시간", "손 떨림", "산책 20분", "푹 잠", "커피 줄임"],
    mind: ["불안함", "조금 괜찮아짐", "막막함", "할 수 있겠다는 생각", "나를 칭찬해줌"],
  };
  const base: Record<CategoryId, number[]> = {
    money:    [-1, -2, -4, -5, -4, -3, -3, -2, -3, -2, -1, -1, 0, 0],
    work:     [0, 0, -1, -1, 0, 0, 1, 1, 0, 1, 1, 2, 2, 2],
    relation: [1, 0, 0, -1, 1, 2, 2, 1, 2, 3, 2, 3, 3, 4],
    body:     [0, -1, -2, -3, -3, -2, -1, -1, 0, 0, 1, 1, 1, 2],
    mind:     [0, -1, -3, -4, -3, -2, -2, -1, -1, 0, 0, 1, 1, 2],
  };
  const didPool = [
    ["산책"],
    ["계좌 안 봄", "일찍 잠"],
    ["운동"],
    ["사람 만남", "밥 챙겨 먹음"],
    ["책 읽음"],
    ["할 일 하나 끝냄", "폰 멀리 둠"],
    ["집 정리"],
  ];
  const j: Journal = {};
  const log: LogBook = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const idx = 13 - i;
    const day: DayRecord = {};
    for (const c of CATEGORIES) {
      const pool = notes[c.id];
      day[c.id] = { score: base[c.id][idx], note: pool[idx % pool.length] };
    }
    const key = todayKey(d);
    j[key] = day;
    log[key] = { did: didPool[idx % didPool.length] };
  }
  saveJournal(j);
  write(K.log, log);

  const t = Date.now();
  const DAY = 86400000;
  const today = todayKey();
  saveMemos([
    // 오래된 다짐들 (되돌아보기·점검용)
    { id: uid(), cat: "money", text: "주식 수익 100%면 무조건 팔기. 더 오를 것 같아도. 욕심이 수익을 다 먹는다.", pinned: true, createdAt: t - DAY * 365, updatedAt: t - DAY * 365 },
    { id: uid(), cat: "body", text: "커피 3잔 넘기면 손 떨림. 2잔까지만.", pinned: false, createdAt: t - DAY * 200, updatedAt: t - DAY * 200 },
    { id: uid(), cat: "work", text: "이력서는 한 일이 아니라 숫자로 말하기. 매출, 시간, 건수.", pinned: false, createdAt: t - DAY * 150, updatedAt: t - DAY * 150 },
    { id: uid(), cat: "mind", text: "불안할 땐 미래를 재지 말고 오늘 한 걸음만 보기.", pinned: false, createdAt: t - DAY * 90, updatedAt: t - DAY * 90 },
    { id: uid(), cat: "relation", text: "서운하면 돌려 말하지 말고 그날 말하기.", pinned: false, createdAt: t - DAY * 60, updatedAt: t - DAY * 60 },
    // 최근
    { id: uid(), cat: "money", text: "주식은 하루 한 번, 저녁 8시에만 본다. 장중엔 앱 삭제한 셈 치기.", pinned: true, createdAt: t - DAY * 6, updatedAt: t - DAY * 6 },
    { id: uid(), cat: "work", text: "이력서 고치다가 깨달음: 내가 한 일 중 숫자로 말할 수 있는 게 생각보다 많다.", pinned: false, createdAt: t - DAY * 4, updatedAt: t - DAY * 4 },
    { id: uid(), cat: "mind", text: "불안은 미래의 위치를 자꾸 재는 데서 온다. 오늘 한 걸음만 보기.", pinned: true, createdAt: t - DAY * 3, updatedAt: t - DAY * 3 },
    { id: uid(), cat: "body", text: "커피 2잔 이하인 날은 손 떨림이 거의 없었음.", pinned: false, createdAt: t - DAY * 2, updatedAt: t - DAY * 2 },
    { id: uid(), cat: "relation", text: "솔직하게 말했더니 오히려 편해졌다. 다음에도 돌려 말하지 말기.", pinned: false, createdAt: t - DAY, updatedAt: t - DAY },
    { id: uid(), cat: "etc", text: "주말에 한강 자전거. 날씨 좋으면.", pinned: false, createdAt: t - 3600000, updatedAt: t - 3600000 },
    // 오늘 (1년 전 다짐과 맞닿는 상황)
    { id: uid(), cat: "money", text: "오늘 주식 수익 50% 달성. 더 오를 것 같은데 팔까 말까.", pinned: false, createdAt: t - 600000, updatedAt: t - 600000 },
  ]);
  saveGoals([
    {
      id: uid(), title: "이직 준비", cat: "work", why: "지금 자리에서 더 배울 게 없다고 느껴서", createdAt: t - DAY * 10, due: addDays(today, 40),
      steps: [
        { id: uid(), text: "이력서 최신화", done: true },
        { id: uid(), text: "포트폴리오 프로젝트 1개 정리", done: true },
        { id: uid(), text: "공고 10개 리스트업", done: false },
        { id: uid(), text: "지원 3곳", done: false },
      ],
    },
    {
      id: uid(), title: "주식 앱 하루 1번만", cat: "money", why: "자주 볼수록 불안만 커지니까", createdAt: t - DAY * 7,
      steps: [
        { id: uid(), text: "알림 전부 끄기", done: true },
        { id: uid(), text: "홈 화면에서 앱 치우기", done: true },
        { id: uid(), text: "7일 연속 지키기", done: false },
      ],
    },
    {
      id: uid(), title: "일주일에 3번 산책", cat: "body", why: "걷고 나면 머리가 맑아져서", createdAt: t - DAY * 5,
      steps: [
        { id: uid(), text: "월", done: true },
        { id: uid(), text: "수", done: true },
        { id: uid(), text: "금", done: false },
      ],
    },
  ]);
  saveSchedule([
    { id: uid(), date: today, time: "10:00", title: "팀 주간회의", cat: "work", done: false },
    { id: uid(), date: today, time: "19:00", title: "저녁 산책 20분", cat: "body", done: false },
    { id: uid(), date: today, time: "21:00", title: "공고 3개 보기", cat: "work", done: false },
    { id: uid(), date: addDays(today, 1), time: "12:30", title: "친구랑 점심", cat: "relation", done: false },
    { id: uid(), date: addDays(today, 2), title: "전세 계약 서류 확인", cat: "money", done: false },
    { id: uid(), date: addDays(today, 4), time: "15:00", title: "한강 자전거", cat: "etc", done: false },
    { id: uid(), date: addDays(today, -1), time: "20:00", title: "이력서 보내기", cat: "work", done: true },
  ]);
  clearBriefing();
  clearMoments();
}
