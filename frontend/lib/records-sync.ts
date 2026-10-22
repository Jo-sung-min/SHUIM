"use client";

/**
 * 로그인 계정의 개인 기록을 서버(/api/records)와 맞추는 층.
 *
 * - 화면은 그대로 localStorage(계정별 키)를 동기적으로 읽고 쓴다 (lib/storage.ts).
 * - 로그인 상태면: 페이지가 열릴 때 서버에서 받아 localStorage 를 덮어쓰고(syncRecords), 쓸 때마다 서버로 보낸다(push).
 * - 보내기는 키별로 합쳐서 순서대로 하나씩 보낸다. 실패하면(오프라인 등) "못 보낸 부분" 표시를 남겨 두고,
 *   다음 동기화 때 localStorage 의 그 부분을 통째로 다시 보낸 뒤에야 서버 데이터를 받는다 — 서버가 로컬의 최신 변경을 덮지 않도록.
 * - 익명 상태면 아무것도 하지 않는다 (기록은 이 기기에만).
 */

export type Section = "journal" | "memos" | "goals" | "schedule" | "categories";

interface Push {
  userId: string;
  key: string; // 같은 키는 아직 안 보낸 것끼리 합친다 (예: 같은 날짜의 기록)
  path: string;
  method: "PUT" | "POST" | "DELETE";
  body?: unknown;
  pendingImportRaw?: string;
}

const DIRTY_KEY = "maeum-accel:dirty:v1";
const GUEST_IMPORT_KEY = "maeum-accel:guest-import:v1";

const outbox: Push[] = [];
let flushing: Promise<boolean> | null = null;
let syncing: Promise<boolean> | null = null;
let inFlight: Push | null = null;
let generation = 0;

/* ---------- 바깥에서 꽂아 주는 것 (storage.ts 가 순환 참조 없이 쓰기 위해) ---------- */

export interface SyncHooks {
  /** 로그인한 계정 id (없으면 null) */
  userId: () => string | null;
  /** localStorage 의 한 부분을 서버 본문으로 (못 보낸 변경 다시 보내기용) */
  sectionBody: (section: Section) => Record<string, unknown>;
  /** 서버에서 받은 전체를 localStorage 에 */
  apply: (snapshot: unknown) => void;
}

let hooks: SyncHooks | null = null;
export function installSyncHooks(h: SyncHooks) {
  hooks = h;
}

/* ---------- 못 보낸 부분 표시 (계정별, 새로고침해도 남음) ---------- */

function dirtyKey(uid: string) {
  return `${DIRTY_KEY}:${uid}`;
}
function readDirty(uid: string): Section[] {
  try {
    const raw = window.localStorage.getItem(dirtyKey(uid));
    return raw ? (JSON.parse(raw) as Section[]) : [];
  } catch {
    return [];
  }
}
function markDirty(uid: string, sections: Section[]) {
  try {
    const cur = readDirty(uid);
    const next = [...cur, ...sections.filter((s) => !cur.includes(s))];
    if (next.length !== cur.length) window.localStorage.setItem(dirtyKey(uid), JSON.stringify(next));
  } catch {
    /* noop */
  }
}
function clearDirty(uid: string) {
  try {
    window.localStorage.removeItem(dirtyKey(uid));
  } catch {
    /* noop */
  }
}

/** Persist before consuming guest sources. Conflicting pending content is never overwritten. */
export function stageGuestImport(userId: string, body: Record<string, unknown>): boolean {
  if (hooks?.userId() !== userId) return false;
  try {
    const key = `${GUEST_IMPORT_KEY}:${userId}`;
    const previousRaw = window.localStorage.getItem(key);
    const previous: Record<string, unknown> = previousRaw ? JSON.parse(previousRaw) : {};
    if (!previous || typeof previous !== "object" || Array.isArray(previous)) return false;
    for (const field of Object.keys(body)) {
      if (field in previous && JSON.stringify(previous[field]) !== JSON.stringify(body[field])) return false;
    }
    const next = JSON.stringify({ ...previous, ...body });
    window.localStorage.setItem(key, next);
    return window.localStorage.getItem(key) === next;
  } catch { return false; }
}

function enqueueGuestImport(userId: string): boolean {
  if (hooks?.userId() !== userId) return false;
  try {
    const raw = window.localStorage.getItem(`${GUEST_IMPORT_KEY}:${userId}`);
    if (raw === null) return true;
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    if (!outbox.some((item) => item.userId === userId && item.pendingImportRaw === raw)) {
      const pending = { userId, key: "guest-import", path: "/api/records/import", method: "POST" as const, body, pendingImportRaw: raw };
      // Keep the active request first; the new import must precede ordinary queued writes.
      outbox.splice(inFlight && outbox[0] === inFlight ? 1 : 0, 0, pending);
    }
    return true;
  } catch { return false; }
}

export function startGuestImport(userId: string) {
  if (enqueueGuestImport(userId) && outbox.length) void flushRecords();
}

export function clearGuestImport(userId: string) {
  try { window.localStorage.removeItem(`${GUEST_IMPORT_KEY}:${userId}`); } catch { /* Storage unavailable. */ }
  for (let index = outbox.length - 1; index >= 0; index--) {
    if (outbox[index].userId === userId && outbox[index].pendingImportRaw && outbox[index] !== inFlight) outbox.splice(index, 1);
  }
}

/* ---------- 보내기 ---------- */

async function send(p: Push): Promise<Response> {
  return fetch(p.path, {
    method: p.method,
    headers: p.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: p.body === undefined ? undefined : JSON.stringify(p.body),
    credentials: "same-origin",
  });
}

/**
 * 큐에 넣고 바로 보내기 시작. 로그인 상태가 아니면 아무것도 하지 않는다.
 * sections: 실패했을 때 다음 동기화에서 통째로 다시 보낼 부분. 게스트 import는 별도의 영속 POST 경로를 쓴다.
 */
export function pushRecords(sections: Section[], key: string, method: Push["method"], path: string, body?: unknown) {
  const uid = hooks?.userId() ?? null;
  if (!uid) return;
  markDirty(uid, sections);
  const p: Push = { userId: uid, key, path, method, body };
  const i = outbox.findIndex((x) => x.key === key && x !== inFlight);
  if (i >= 0) outbox[i] = p;
  else outbox.push(p);
  void flushRecords();
}

/** 큐를 비운다. 전부 보냈으면 true. 401(로그아웃됨)이면 버리고 false, 네트워크 실패면 남겨 두고 false */
export function flushRecords(): Promise<boolean> {
  if (flushing) return flushing;
  let completed = false;
  flushing = (async () => {
    const uid = hooks?.userId() ?? null;
    const startedGeneration = generation;
    if (!uid) return false;
    while (outbox.length) {
      const p = outbox[0];
      if (generation !== startedGeneration || hooks?.userId() !== uid || p.userId !== uid) return false;
      inFlight = p;
      try {
        const res = await send(p);
        if (generation !== startedGeneration || hooks?.userId() !== uid) return false;
        if (res.status === 401) {
          outbox.length = 0;
          return false;
        }
        if (!res.ok) throw new Error(`records push ${res.status}`);
        if (p.pendingImportRaw) {
          const key = `${GUEST_IMPORT_KEY}:${uid}`;
          if (window.localStorage.getItem(key) === p.pendingImportRaw) window.localStorage.removeItem(key);
        }
      } catch {
        return false;
      } finally {
        inFlight = null;
      }
      if (outbox[0] === p) outbox.shift();
    }
    if (uid) clearDirty(uid);
    completed = true;
    return true;
  })().finally(() => {
    flushing = null;
    // A failed send stays queued until the next write/sync or explicit retry.
    // Retrying here after failure would spin continuously while offline.
    if (completed && outbox.length) void flushRecords(); // 성공 직후 새로 들어온 것만
  });
  return flushing;
}

/* ---------- 받기 ---------- */

/**
 * 로그인 상태면 서버 데이터를 받아 localStorage 에 넣는다. 받아서 넣었으면 true.
 * 먼저 못 보낸 변경을 보내고, 그게 실패하면 받지 않는다 (로컬이 더 새것일 수 있으니).
 */
export function syncRecords(): Promise<boolean> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (typeof window === "undefined" || !hooks) return false;
    const uid = hooks.userId();
    if (!uid) return false;
    const startedGeneration = generation;
    // A durable import is replayed before GET, including after a refresh lost the memory queue.
    if (!enqueueGuestImport(uid)) return false;
    // 지난번에 못 보낸 부분이 있으면 localStorage 의 그 부분을 통째로, 먼저
    const dirty = readDirty(uid);
    if (dirty.length) {
      const body: Record<string, unknown> = {};
      for (const s of dirty) Object.assign(body, hooks.sectionBody(s));
      outbox.push({ userId: uid, key: "resend", path: "/api/records", method: "PUT", body });
    }
    if (outbox.length) {
      const sent = await flushRecords();
      if (!sent) return false;
    }
    try {
      if (generation !== startedGeneration || hooks.userId() !== uid) return false;
      // Failed cleanup or a newer staged snapshot must not be overwritten by a server pull.
      if (window.localStorage.getItem(`${GUEST_IMPORT_KEY}:${uid}`) !== null) return false;
      const res = await fetch("/api/records", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return false;
      const snapshot = await res.json();
      if (outbox.length || hooks.userId() !== uid || generation !== startedGeneration) return false; // 받는 사이에 또 바뀌었으면 이번엔 건너뜀
      if (window.localStorage.getItem(`${GUEST_IMPORT_KEY}:${uid}`) !== null) return false;
      hooks.apply(snapshot);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** 로그아웃·계정 전환: 보내던 것 버림 */
export function resetRecordsSync() {
  generation++;
  outbox.length = 0;
}
