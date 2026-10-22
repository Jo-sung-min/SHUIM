"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

/**
 * 화면을 떠났다가 돌아오면(상세 → 뒤로, 다른 탭 → 다시) 읽던 스크롤 위치로 돌아간다.
 * 내용이 비동기로 그려지는 화면은 ready 가 true 가 된 뒤에 한 번 복원하고, 그 뒤의 스크롤만 기억한다
 * (스켈레톤 상태의 0 위치가 저장값을 덮지 않게). 저장은 탭(세션) 동안만 유지한다.
 */
const PREFIX = "sorow:scroll:";

interface Saved<E> { y: number; extra?: E }

export function readScrollMemory<E = unknown>(key: string): Saved<E> | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Saved<E>) : null;
  } catch {
    return null;
  }
}

function writeScrollMemory<E>(key: string, value: Saved<E>) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장 불가 시 조용히 넘어감 */
  }
}

/** 창 스크롤 기억. scope 를 주지 않으면 현재 경로가 키 */
export function useScrollMemory(ready: boolean, scope?: string) {
  const pathname = usePathname();
  const key = scope ?? pathname;
  const restored = useRef(false);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = readScrollMemory(key)?.y ?? 0;
    if (y <= 0) return;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    return () => cancelAnimationFrame(frame);
  }, [ready, key]);

  useEffect(() => {
    let frame = 0;
    const save = () => {
      if (!restored.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => writeScrollMemory(key, { y: Math.round(window.scrollY) }));
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
    };
  }, [key]);
}

/** 안쪽 스크롤 영역(예: 위로 피드) 기억. extra 에 함께 복원할 상태(불러온 개수 등)를 넣을 수 있다 */
export function useElementScrollMemory<E = unknown>(ref: RefObject<HTMLElement | null>, ready: boolean, key: string, extra?: E) {
  const restored = useRef(false);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  useEffect(() => {
    const el = ref.current;
    if (!ready || restored.current || !el) return;
    restored.current = true;
    const y = readScrollMemory<E>(key)?.y ?? 0;
    if (y <= 0) return;
    const frame = requestAnimationFrame(() => el.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }));
    return () => cancelAnimationFrame(frame);
  }, [ready, key, ref]);

  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    let frame = 0;
    const save = () => {
      if (!restored.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => writeScrollMemory(key, { y: Math.round(el.scrollTop), extra: extraRef.current }));
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", save);
    };
  }, [ready, key, ref]);
}
