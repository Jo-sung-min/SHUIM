"use client";

export interface AppNotice { id: number; message: string }
const EMPTY_NOTICES: readonly AppNotice[] = [];
let notices: readonly AppNotice[] = EMPTY_NOTICES;
let nextId = 0;
const listeners = new Set<() => void>();

/** Errors remain readable until dismissed; repeating the same error does not stack alerts. */
export function showToast(message: string) {
  if (!message.trim() || notices.some((notice) => notice.message === message)) return;
  notices = [...notices, { id: ++nextId, message }];
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number) {
  notices = notices.filter((notice) => notice.id !== id);
  listeners.forEach((listener) => listener());
}

export const getToastSnapshot = () => notices;
export const getServerToastSnapshot = () => EMPTY_NOTICES;
export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
