"use client";

import type { OverlayFont } from "./feed-media";

/**
 * 글 얹기 무드 글꼴 (모두 SIL OFL 1.1, @fontsource 로 같은 도메인에서 제공).
 * 글꼴 CSS(@font-face 와 unicode-range 조각 목록)는 그 글꼴이 처음 필요할 때만 불러오고,
 * 브라우저는 화면에 나온 글자가 든 조각 파일만 받는다. 피드 첫 화면에는 아무것도 더해지지 않는다.
 */
const LOADERS: Partial<Record<OverlayFont, () => Promise<unknown>>> = {
  serif: () => import("@fontsource/gowun-batang/700.css"),
  song: () => import("@fontsource/song-myung/400.css"),
  hahmlet: () => import("@fontsource/hahmlet/600.css"),
  pen: () => import("@fontsource/nanum-pen-script/400.css"),
};

const pending = new Map<OverlayFont, Promise<unknown>>();

export function loadOverlayFont(font: OverlayFont): Promise<unknown> {
  const loader = LOADERS[font];
  if (!loader) return Promise.resolve();
  let promise = pending.get(font);
  if (!promise) {
    promise = loader().catch(() => { pending.delete(font); });
    pending.set(font, promise);
  }
  return promise;
}

export function loadAllOverlayFonts() {
  return Promise.all((Object.keys(LOADERS) as OverlayFont[]).map(loadOverlayFont));
}
