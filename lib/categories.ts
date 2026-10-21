export type BuiltinCategoryId = "mind" | "body" | "relation" | "money" | "work";
/** 기본 5개 + 사용자가 추가한 카테고리("c_…"). 저장은 전부 id 로 한다. */
export type CategoryId = BuiltinCategoryId | (string & {});
/** 메모·목표·일정에서 쓰는 카테고리 (기록 카테고리 + 기타) */
export type MemoCat = CategoryId | "etc";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  hint: string;
  color: string; // CSS variable name
}

/** 기본 카테고리. 마음을 다스리는 앱답게 마음 → 몸 → 관계 → 돈 → 일 순서 */
export const CATEGORIES: Category[] = [
  { id: "mind", label: "마음", emoji: "🫧", hint: "오늘 든 생각, 감정…", color: "var(--c-mind)" },
  { id: "body", label: "몸", emoji: "🌙", hint: "잠, 떨림, 식사, 운동…", color: "var(--c-body)" },
  { id: "relation", label: "관계", emoji: "🤝", hint: "연인, 가족, 친구…", color: "var(--c-relation)" },
  { id: "money", label: "돈", emoji: "💰", hint: "자산, 지출, 주식, 전세…", color: "var(--c-money)" },
  { id: "work", label: "일·커리어", emoji: "💼", hint: "회사, 이직, 사이드 프로젝트…", color: "var(--c-work)" },
];

/** 사용자 카테고리용 이모지·색 후보 */
export const CUSTOM_EMOJIS = ["🌱", "📚", "🎨", "🏃", "🧘", "🎮", "🍀", "✈️", "🐾", "☕", "🎵", "🛠️"];
export const CUSTOM_COLORS = ["var(--c-mind)", "var(--c-body)", "var(--c-relation)", "var(--c-money)", "var(--c-work)", "var(--c-etc)"];
export const CUSTOM_MAX = 5;
export const isCustomCategory = (id: string) => id.startsWith("c_");
export const newCategoryId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
/** 사용자가 정한 순서(id 배열)대로 정렬. 순서에 없는 카테고리는 기본 순서로 뒤에 붙는다 */
export function orderCategories(cats: Category[], order: string[]): Category[] {
  if (!order.length) return cats;
  const rank = new Map(order.map((id, i) => [id, i]));
  return cats
    .map((c, i) => ({ c, key: rank.has(c.id) ? rank.get(c.id)! : order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.c);
}
/** 기본 + 사용자 카테고리 */
export const allCategories = (custom: Category[] = []): Category[] => [...CATEGORIES, ...custom.filter((c) => isCustomCategory(c.id))];

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

/** id 로 찾기. 사용자 카테고리는 extra 로 넘기고, 못 찾으면 이름 대신 id 를 보여주는 임시 카테고리 */
export const categoryById = (id: CategoryId, extra: Category[] = []): Category =>
  CATEGORIES.find((c) => c.id === id) ?? extra.find((c) => c.id === id) ?? { id, label: id, emoji: "📌", hint: "", color: "var(--c-etc)" };
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
