"use client";

import { IS_AIT, tossHaptic } from "./ait";

export type NoticeKind = "error" | "success" | "info";
export interface AppNotice { id: number; message: string; kind: NoticeKind }
const EMPTY_NOTICES: readonly AppNotice[] = [];
let notices: readonly AppNotice[] = EMPTY_NOTICES;
let nextId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/**
 * 작은 안내. 오류는 닫을 때까지 남고(같은 문구는 겹치지 않음), 완료 안내는 잠깐 보이고 사라진다.
 * 기본 kind 는 "error" 라서 예전 호출(메시지만 넘김)은 그대로 오류 안내다.
 */
export function showToast(message: string, options: { kind?: NoticeKind; duration?: number } = {}) {
  const kind = options.kind ?? "error";
  if (!message.trim() || notices.some((notice) => notice.message === message)) return;
  const id = ++nextId;
  notices = [...notices, { id, message, kind }];
  emit();
  const duration = options.duration ?? (kind === "error" ? 0 : 2400);
  if (duration > 0) setTimeout(() => dismissToast(id), duration);
}

/** 저장·전송이 끝났을 때의 작은 완료 안내. 지원 기기에서는 아주 짧게 진동한다 */
export const toastSuccess = (message: string) => {
  showToast(message, { kind: "success" });
  tick();
};

/** 손끝 피드백: 짧은 진동 한 번 (지원하지 않거나 동작 줄이기 설정이면 아무것도 안 한다) */
export function tick(ms = 12) {
  try {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (IS_AIT) { tossHaptic(); return; } // 아이폰 WebView 에는 vibrate 가 없어 토스 햅틱으로
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(ms);
  } catch { /* 진동 실패는 무시 */ }
}

export function dismissToast(id: number) {
  if (!notices.some((notice) => notice.id === id)) return;
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}

export const getToastSnapshot = () => notices;
export const getServerToastSnapshot = () => EMPTY_NOTICES;
export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
