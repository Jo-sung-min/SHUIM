"use client";

import { installPolyfills } from "@/lib/polyfills";
import { rememberAndroidLaunch } from "@/lib/platform";

// 모듈을 읽는 순간 바로 채운다: 다른 컴포넌트의 effect 보다 먼저 준비되도록
if (typeof window !== "undefined") {
  installPolyfills();
  rememberAndroidLaunch(); // 첫 화면의 ?source=android·android-app:// 리퍼러를 탭이 살아 있는 동안 기억한다
}

/** 루트 레이아웃 맨 앞에 두는 화면 없는 컴포넌트. 폴리필과 안드로이드 앱 실행 감지만 한다 */
export default function EarlyClient() {
  return null;
}
