export const BAMBOO_BOARD_COLUMNS = 6;
export const BAMBOO_BOARD_ROWS = 5;
export const BAMBOO_BOARD_CAPACITY = BAMBOO_BOARD_COLUMNS * BAMBOO_BOARD_ROWS;
export interface BambooNote { id: string; name: string; story: string; createdAt: number; mine: boolean }

const date = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});
export const bambooNoteDate = (timestamp: number) => date.format(timestamp).replaceAll("-", ".");

const paperColors = ["#fff0a8", "#ffcfc2", "#d5eac3", "#cfe4ee", "#f4d4e7", "#fbe1ae"];
export function bambooNoteColor(id: string) {
  let index = 0;
  for (const digit of id) index = (index * 10 + Number(digit)) % paperColors.length;
  return paperColors[index];
}

function validNote(value: unknown): value is BambooNote {
  if (!value || typeof value !== "object") return false;
  const n = value as BambooNote;
  return typeof n.id === "string" && /^[1-9]\d{0,18}$/.test(n.id)
    && typeof n.name === "string" && typeof n.story === "string"
    && Number.isSafeInteger(n.createdAt) && n.createdAt >= 0 && n.createdAt < 8.64e15;
}

export function latestBambooNotes(entries: readonly BambooNote[]) {
  // The IDs are PostgreSQL BIGSERIAL values returned as strings to preserve precision.
  const unique = new Map(entries.map(note => [note.id, note]));
  return [...unique.values()].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id)).slice(-BAMBOO_BOARD_CAPACITY);
}

async function request(path: string, body: object, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch("/api/beach/guestbook" + path, { method: "POST", credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(typeof data?.error === "string" ? data.error : "게시판에 연결하지 못했어요. 다시 시도해 주세요.");
  return data;
}

export async function readBambooNotes(ticket: string, signal: AbortSignal): Promise<BambooNote[]> {
  const data = await request("/list", { ticket }, signal);
  if (!Array.isArray(data.entries) || !data.entries.every(validNote)) throw new Error("게시판을 다시 불러와 주세요.");
  return latestBambooNotes(data.entries);
}

export async function postBambooNote(ticket: string, requestId: string, name: string, story: string): Promise<BambooNote> {
  const data = await request("", { ticket, requestId, name, story });
  if (!validNote(data)) throw new Error("붙인 메모를 확인하지 못했어요. 다시 시도해 주세요.");
  return data;
}
