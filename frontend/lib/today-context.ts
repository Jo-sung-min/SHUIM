import { addDays, todayKey } from "./dates";
import type { Goal, Journal, LogBook, Memo, ScheduleItem } from "./storage";

/** Version the generated answer, not the user's source records. */
export const AI_CONTEXT_VERSION = 3;

export interface TodayRecords {
  journal: Journal;
  log: LogBook;
  memos: Memo[];
  goals: Goal[];
  schedule: ScheduleItem[];
}

function validDate(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [year, month, day] = key.split("-").map(Number);
  return todayKey(new Date(year, month - 1, day)) === key;
}

/** An edit or pin does not move an old memo's contents into today. */
function memoDate(memo: Memo): string | null {
  if (typeof memo.createdAt !== "number" || !Number.isFinite(memo.createdAt)) return null;
  const created = new Date(memo.createdAt);
  return Number.isFinite(created.getTime()) ? todayKey(created) : null;
}

export function buildTodayContext(data: TodayRecords, date: string, includeAllMemos = false) {
  const recentDates = [...new Set([...Object.keys(data.journal), ...Object.keys(data.log)])]
    .filter((key) => validDate(key) && key < date && key >= addDays(date, -7)).sort();
  const datedMemos = data.memos.map((memo) => ({ memo, date: memoDate(memo) }))
    .filter((item) => item.date === null || item.date <= date);
  const presentMemo = ({ memo, date }: typeof datedMemos[number]) => ({ date, cat: memo.cat, text: memo.text, pinned: memo.pinned });
  return {
    date,
    today: data.journal[date] ?? {},
    todayDid: data.log[date]?.did ?? [],
    recent: recentDates.map((key) => ({ date: key, record: data.journal[key] ?? {}, did: data.log[key]?.did ?? [] })),
    memos: [...datedMemos].sort((a, b) => Number(b.date === date) - Number(a.date === date)
      || Number(b.memo.pinned) - Number(a.memo.pinned) || b.memo.updatedAt - a.memo.updatedAt)
      .slice(0, 20).map(presentMemo),
    goals: data.goals.filter((goal) => !goal.doneAt).map((goal) => ({
      title: goal.title, cat: goal.cat, why: goal.why, due: goal.due,
      steps: goal.steps.map((step) => ({ text: step.text, done: step.done })),
    })),
    schedule: data.schedule.filter((item) => validDate(item.date) && item.date >= date && item.date <= addDays(date, 3))
      .sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")))
      .map((item) => ({ date: item.date, time: item.time, title: item.title, cat: item.cat, done: item.done })),
    allMemos: includeAllMemos ? [...datedMemos].sort((a, b) => a.memo.createdAt - b.memo.createdAt).map(presentMemo) : undefined,
  };
}

export function currentAiResult<T extends { date: string; contextVersion?: number }>(value: T | null | undefined, date: string): T | null {
  return value?.date === date && value.contextVersion === AI_CONTEXT_VERSION ? value : null;
}

export function summaryEntries(journal: Journal, date: string, days: number) {
  const first = addDays(date, 1 - days);
  return Object.keys(journal).filter((key) => validDate(key) && key >= first && key <= date).sort()
    .map((key) => ({ date: key, record: journal[key] }));
}
