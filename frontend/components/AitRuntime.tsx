"use client";

// 가장 먼저 읽혀야 첫 화면의 fetch("/api/…") 보다 앞서 백엔드 주소·토큰 다리가 놓인다
import "@/lib/ait-fetch";
import { useEffect } from "react";
import { IS_AIT, openExternal } from "@/lib/ait";

/**
 * 앱인토스 미니앱에서만: 미니앱 밖(다른 출처의 http·https) 링크는 미니앱 안에서 열지 않고 기기 브라우저로 연다.
 * tel:·mailto: 는 그대로 둔다 (위기 상담 109 전화). 웹 빌드에서는 아무것도 하지 않는다.
 */
export default function AitRuntime() {
  useEffect(() => {
    if (!IS_AIT) return;
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin === location.origin) return;
      e.preventDefault();
      void openExternal(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
