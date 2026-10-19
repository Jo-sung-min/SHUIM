export type CategoryId = "money" | "work" | "relation" | "body" | "mind";
/** 메모·목표·일정에서 쓰는 카테고리 (기록 카테고리 + 기타) */
export type MemoCat = CategoryId | "etc";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  hint: string;
  color: string; // CSS variable name
}

export const CATEGORIES: Category[] = [
  { id: "money", label: "돈", emoji: "💰", hint: "자산, 지출, 주식, 전세…", color: "var(--c-money)" },
  { id: "work", label: "일·커리어", emoji: "💼", hint: "회사, 이직, 사이드 프로젝트…", color: "var(--c-work)" },
  { id: "relation", label: "관계", emoji: "🤝", hint: "연인, 가족, 친구…", color: "var(--c-relation)" },
  { id: "body", label: "몸", emoji: "🌙", hint: "잠, 떨림, 식사, 운동…", color: "var(--c-body)" },
  { id: "mind", label: "마음", emoji: "🫧", hint: "오늘 든 생각, 감정…", color: "var(--c-mind)" },
];

export interface MemoCategory {
  id: MemoCat;
  label: string;
  emoji: string;
  color: string;
}

export const MEMO_CATEGORIES: MemoCategory[] = [
  ...CATEGORIES.map((c) => ({ id: c.id as MemoCat, label: c.label, emoji: c.emoji, color: c.color })),
  { id: "etc", label: "기타", emoji: "📌", color: "var(--c-etc)" },
];

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
export const memoCatById = (id: MemoCat) =>
  MEMO_CATEGORIES.find((c) => c.id === id) ?? MEMO_CATEGORIES[MEMO_CATEGORIES.length - 1];

export const SCORE_MIN = -5;
export const SCORE_MAX = 5;

/** "오늘 한 일" 빠른 입력용 추천 행동 */
export const ACTION_PRESETS = [
  "산책",
  "운동",
  "일찍 잠",
  "계좌 안 봄",
  "사람 만남",
  "책 읽음",
  "집 정리",
  "밥 챙겨 먹음",
  "할 일 하나 끝냄",
  "폰 멀리 둠",
];
