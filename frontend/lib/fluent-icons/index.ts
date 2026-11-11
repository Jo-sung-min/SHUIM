/**
 * 소로우 아이콘으로 고르는 Microsoft Fluent UI System Icons (MIT, ./LICENSE).
 * 233개를 분류 10개로 나눠 두고, 아이콘 찾기를 열거나 그 아이콘을 보여 줄 때 그 분류 조각만 받는다 (첫 화면 번들에 path 가 없다).
 * 저장 id 는 "fl:<이름>" (서버 CircleLogic.normalizeIcon 이 같은 목록으로 받아 준다).
 */
import { FLUENT_CATEGORIES, FLUENT_NAMES, importFluentCategory, type FluentCategoryId } from "./manifest";
import type { FluentIconRow } from "./types";

export { FLUENT_CATEGORIES, FLUENT_SOURCE, type FluentCategoryId } from "./manifest";
export type { FluentIconRow, FluentPath } from "./types";

export const FLUENT_PREFIX = "fl:";
export const fluentId = (name: string) => `${FLUENT_PREFIX}${name}`;
/** "fl:food_cake" → "food_cake", 다른 id 는 null */
export const fluentName = (id?: string | null) => (id && id.startsWith(FLUENT_PREFIX) ? id.slice(FLUENT_PREFIX.length) : null);

let categoryByName: Map<string, FluentCategoryId> | null = null;
export function fluentCategoryOf(name: string): FluentCategoryId | null {
  if (!categoryByName) {
    categoryByName = new Map();
    for (const c of FLUENT_CATEGORIES) for (const n of FLUENT_NAMES[c.id].split(" ")) categoryByName.set(n, c.id);
  }
  return categoryByName.get(name) ?? null;
}

const rows = new Map<string, FluentIconRow>();
const pending = new Map<FluentCategoryId, Promise<FluentIconRow[]>>();
const loaded = new Map<FluentCategoryId, FluentIconRow[]>();

export function loadFluentCategory(id: FluentCategoryId): Promise<FluentIconRow[]> {
  const done = loaded.get(id);
  if (done) return Promise.resolve(done);
  let p = pending.get(id);
  if (!p) {
    p = importFluentCategory(id).then((m) => {
      for (const row of m.default) rows.set(row[0], row);
      loaded.set(id, m.default);
      return m.default;
    });
    // 받다가 끊기면 다음에 다시 받는다
    p.catch(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export const loadAllFluent = () => Promise.all(FLUENT_CATEGORIES.map((c) => loadFluentCategory(c.id)));
/** 이미 받은 아이콘이면 바로 (다시 그릴 때 깜빡이지 않게) */
export const cachedFluentIcon = (name: string) => rows.get(name) ?? null;
export async function loadFluentIcon(name: string): Promise<FluentIconRow | null> {
  const cached = rows.get(name);
  if (cached) return cached;
  const category = fluentCategoryOf(name);
  if (!category) return null;
  await loadFluentCategory(category);
  return rows.get(name) ?? null;
}

/** 찾기: 한글 이름·찾기 낱말·영문 이름에서. 띄어쓰기는 무시한다 */
export function matchFluent(row: FluentIconRow, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  const hay = `${row[1]} ${row[2]} ${row[0].replace(/_/g, " ")}`.toLowerCase();
  return hay.replace(/\s+/g, "").includes(q) || hay.split(/\s+/).some((w) => w.startsWith(q));
}
