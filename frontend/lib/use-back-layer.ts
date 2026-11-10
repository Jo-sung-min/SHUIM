"use client";

import { useEffect, useRef } from "react";

/**
 * 안드로이드 뒤로 가기(= history.back)를 화면 안 단계 이동으로 쓴다.
 * 열려 있는 동안 같은 주소의 기록을 하나 쌓아 두고, 뒤로 가기가 오면 onBack 을 부른다.
 * onBack 이 true 를 돌려주면(아직 닫히지 않음) 기록을 다시 쌓는다. UI 로 닫히면 쌓아 둔 기록을 걷어 낸다.
 * Next.js 는 pushState 를 감싸 라우터 상태를 복사하므로 같은 주소 기록은 안전하게 오간다.
 */
export function useBackLayer(open: boolean, onBack: () => boolean) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const push = () => window.history.pushState({ sorowLayer: marker }, "");
    push();
    let popped = false;
    const onPop = () => {
      if ((window.history.state as { sorowLayer?: string } | null)?.sorowLayer === marker) return;
      if (onBackRef.current()) push();
      else popped = true;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && (window.history.state as { sorowLayer?: string } | null)?.sorowLayer === marker) window.history.back();
    };
  }, [open]);
}
