"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * 화면 맨 위 얇은 진행 막대. 앱 안 링크를 누르면 바로 차오르기 시작하고, 주소가 바뀌면 끝까지 채운 뒤 사라진다.
 * 누르고 다음 화면이 뜰 때까지 "눌렸나?" 싶은 빈 시간을 없앤다. 다시 그리지 않도록 DOM 속성만 바꾼다.
 */
export default function NavProgress() {
  const path = usePathname();
  const bar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 주소가 바뀌면 끝까지 채우고 사라진다
  useEffect(() => {
    const el = bar.current;
    if (!el || el.dataset.state !== "loading") return;
    el.dataset.state = "done";
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (el.dataset.state === "done") el.dataset.state = "idle"; }, 450);
  }, [path]);

  useEffect(() => {
    const start = () => {
      const el = bar.current;
      if (!el) return;
      if (timer.current) clearTimeout(timer.current);
      el.dataset.state = "idle";
      void el.offsetWidth; // 0 에서 다시 차오르게
      el.dataset.state = "loading";
      // 끝내 이동하지 않으면(같은 화면·취소) 조용히 접는다
      timer.current = setTimeout(() => { if (el.dataset.state === "loading") el.dataset.state = "done"; }, 10_000);
    };
    // 캡처 단계에서 듣는다: next/link 가 기본 동작을 막기(preventDefault) 전에 누름을 알아챈다
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      start();
    };
    const onBack = () => start();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return <div ref={bar} className="nav-progress" data-state="idle" aria-hidden="true"><i /></div>;
}
