"use client";

/**
 * 홈 "나를 위한 시간" 등록부.
 * - 기본 4칸(정리·칭찬·사랑·분석)은 AI 호출이라 홈이 직접 다루고(ai 종류), 여기서는 모양·순서만 정한다.
 * - 그 밖의 칸은 카탈로그(CARE_CATALOG)에서 사용자가 "추가하기"로 고른다. 종류:
 *     link   — 앱 안 화면으로 이동 (메모·목표·일정·외침·위로·흐름)
 *     breath — 1분 숨 고르기 시트
 *   새 종류를 더하려면 CareKind 에 추가하고 홈의 runCare 에서 처리하면 된다.
 * - 고른 칸과 "오늘 했음" 기록은 이 기기의 localStorage(계정별)에만 둔다. 서버 동기화는 아직 하지 않는다.
 */
import { read, write } from "./storage";
import { todayKey } from "./dates";

export type CareTone = "briefing" | "praise" | "love" | "review" | "mint" | "plum";
export type CareKind = "ai" | "link" | "breath";
export type CareIconName = "sparkle" | "star" | "heart" | "note" | "flag" | "calendar" | "bubble" | "reels" | "chart" | "lotus" | "leaf" | "book";

export interface CareAction {
  id: string;
  label: string;
  /** 추가하기 시트에 보이는 한 줄 설명 */
  desc: string;
  kind: CareKind;
  icon: CareIconName;
  tone: CareTone;
  /** link 종류의 이동 경로 */
  href?: string;
}

/** 기본 4칸 (순서 고정, 뺄 수 없음). 실제 동작은 app/page.tsx 의 press() */
export const CARE_BUILTIN: CareAction[] = [
  { id: "briefing", label: "정리하기", desc: "오늘 기록을 AI 가 한 번 정리해요", kind: "ai", icon: "sparkle", tone: "briefing" },
  { id: "praise", label: "칭찬받기", desc: "오늘의 나를 칭찬하는 말", kind: "ai", icon: "star", tone: "praise" },
  { id: "love", label: "사랑받기", desc: "나를 사랑하는 법 한 가지", kind: "ai", icon: "heart", tone: "love" },
  { id: "review", label: "분석하기", desc: "메모 전체로 그때와 오늘을 비교", kind: "ai", icon: "note", tone: "review" },
];

/** 추가할 수 있는 칸 */
export const CARE_CATALOG: CareAction[] = [
  { id: "breath", label: "숨 고르기", desc: "1분 동안 천천히 숨 쉬어요", kind: "breath", icon: "lotus", tone: "mint" },
  { id: "memo", label: "메모 남기기", desc: "스쳐 가는 마음을 한 줄로", kind: "link", icon: "book", tone: "plum", href: "/memo" },
  { id: "goals", label: "목표 한 걸음", desc: "목표의 다음 단계 하나 체크", kind: "link", icon: "flag", tone: "review", href: "/goals" },
  { id: "schedule", label: "오늘 일정", desc: "다가오는 일정 보기", kind: "link", icon: "calendar", tone: "briefing", href: "/schedule" },
  { id: "summary", label: "흐름 보기", desc: "최근 7·14·30일의 마음 흐름", kind: "link", icon: "chart", tone: "praise", href: "/summary" },
  { id: "shout", label: "외침 읽기", desc: "다른 사람의 이야기에 힘내요 하나", kind: "link", icon: "bubble", tone: "love", href: "/shout" },
  { id: "feed", label: "위로 보기", desc: "위로 피드 한 바퀴", kind: "link", icon: "reels", tone: "mint", href: "/feed" },
];

export const careById = (id: string): CareAction | undefined => CARE_BUILTIN.find((c) => c.id === id) ?? CARE_CATALOG.find((c) => c.id === id);

const EXTRAS_KEY = "maeum-accel:care-extras:v1";
const DONE_KEY = "maeum-accel:care-done:v1";

/** 사용자가 추가한 칸의 id 목록 (고른 순서) */
export const loadCareExtras = (): string[] => read<string[]>(EXTRAS_KEY, []).filter((id) => CARE_CATALOG.some((c) => c.id === id));
export const saveCareExtras = (ids: string[]) => write(EXTRAS_KEY, ids);

/** 추가한 칸을 오늘 눌렀는지 (빨간 점은 안 누른 칸에만) */
export function careDoneToday(id: string, today = todayKey()): boolean {
  return read<Record<string, string>>(DONE_KEY, {})[id] === today;
}
export function markCareDone(id: string, today = todayKey()) {
  const all = read<Record<string, string>>(DONE_KEY, {});
  // 지난 날짜는 치워 작게 유지
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) if (v === today) next[k] = v;
  next[id] = today;
  write(DONE_KEY, next);
}
