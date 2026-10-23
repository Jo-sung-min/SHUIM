"use client";

import { useEffect, useState } from "react";

/**
 * 인스타그램처럼 아래로 스크롤하면 상단 바가 사라지고, 조금만 올리면 바로 다시 나타난다.
 * - 맨 위 근처에서는 항상 보인다. 짧은 흔들림(6px 미만)은 무시한다
 * - 바텀시트가 body 스크롤을 잠근 동안은 상태를 바꾸지 않는다
 * 반환값을 data-hidden 으로 붙이면 CSS(.topbar, .homeHeader 등)가 위로 밀어 올린다.
 */
export function useHideOnScroll(enabled = true): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) { setHidden(false); return; }
    let last = window.scrollY;
    // scrollY 만 읽고 상태만 바꾸므로 프레임을 기다리지 않고 바로 처리한다 (rAF 는 백그라운드에서 한 박자 늦게 돈다)
    const onScroll = () => {
      if (document.body.style.overflow === "hidden") return;
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      last = y;
      if (y < 24) setHidden(false);
      else if (delta > 6) setHidden(true);
      else if (delta < -6) setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);
  return hidden;
}
