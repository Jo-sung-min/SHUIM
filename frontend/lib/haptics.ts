"use client";

/** 짧은 진동. 기기가 지원하고 동작 줄이기가 꺼져 있을 때만 울린다. 실패해도 조용히 넘어간다. */
export function haptic(pattern: number | number[] = 10): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
