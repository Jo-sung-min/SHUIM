"use client";

import { useEffect } from "react";

/**
 * - 오프라인 안내 페이지만 캐시하는 서비스 워커 등록 (개인 화면·API 응답은 캐시하지 않음)
 * - 키보드가 열리면 html[data-keyboard="open"] 과 CSS 변수 --kb(키보드 높이)·--vvh(보이는 높이)를 채워
 *   바텀시트·저장 버튼·입력창이 키보드 뒤로 숨지 않게 한다
 */
export default function AppRuntime() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let wasOpen = false;
    let scrollTimer: number | undefined;
    const update = () => {
      const field = document.activeElement;
      const editing = field instanceof HTMLElement && field.matches("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]");
      const height = viewport ? viewport.height : window.innerHeight;
      const offset = viewport ? viewport.offsetTop : 0;
      const keyboard = Math.max(0, Math.round(window.innerHeight - height - offset));
      const open = editing && keyboard > 140;
      root.style.setProperty("--vvh", `${Math.round(height)}px`);
      root.style.setProperty("--kb", `${open ? keyboard : 0}px`);
      root.dataset.keyboard = open ? "open" : "closed";
      // 키보드가 막 올라왔을 때 입력 중인 칸을 보이는 영역 가운데로
      if (open && !wasOpen && field instanceof HTMLElement) {
        window.clearTimeout(scrollTimer);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        scrollTimer = window.setTimeout(() => field.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }), 60);
      }
      wasOpen = open;
    };
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      window.clearTimeout(scrollTimer);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.keyboard;
      root.style.removeProperty("--kb");
      root.style.removeProperty("--vvh");
    };
  }, []);
  return null;
}
