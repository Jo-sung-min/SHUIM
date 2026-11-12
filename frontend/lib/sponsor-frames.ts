/**
 * 후원 기업 꾸미기 액자: 테 모양 · 포인트 색 · 모서리 장식.
 * 값 목록은 서버 SponsorPolicy(FRAME_STYLES·FRAME_COLORS·FRAME_DECOS)와 같고, 그림은 components/SponsorFrame.module.css 가 그린다.
 * 서버가 먼저 늘린 모르는 값은 기본값으로 읽는다. ("use client" 없음 — node 테스트에서 그대로 읽는다)
 */
export const FRAME_STYLES = ["glass", "gold", "wood", "neon", "aurora", "polaroid", "stamp", "ink"] as const;
export const FRAME_COLORS = ["violet", "navy", "teal", "green", "gold", "coral", "pink", "ink"] as const;
export const FRAME_DECOS = ["none", "ribbon", "star", "leaf", "flame", "heart", "sparkle"] as const;

export type FrameStyle = (typeof FRAME_STYLES)[number];
export type FrameColor = (typeof FRAME_COLORS)[number];
export type FrameDeco = (typeof FRAME_DECOS)[number];
export interface SponsorFrame { style: FrameStyle; color: FrameColor; deco: FrameDeco }

export const DEFAULT_FRAME: SponsorFrame = { style: "glass", color: "violet", deco: "none" };

export const FRAME_STYLE_LABELS: Record<FrameStyle, string> = {
  glass: "글라스", gold: "금박", wood: "원목", neon: "네온", aurora: "오로라", polaroid: "폴라로이드", stamp: "우표", ink: "먹선",
};
export const FRAME_COLOR_LABELS: Record<FrameColor, string> = {
  violet: "보라", navy: "남색", teal: "청록", green: "초록", gold: "금빛", coral: "주황", pink: "분홍", ink: "먹",
};
export const FRAME_DECO_LABELS: Record<FrameDeco, string> = {
  none: "없음", ribbon: "리본", star: "별", leaf: "잎", flame: "불꽃", heart: "하트", sparkle: "반짝임",
};

const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

export function parseFrame(value: unknown): SponsorFrame {
  const frame = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    style: pick(FRAME_STYLES, frame.style, DEFAULT_FRAME.style),
    color: pick(FRAME_COLORS, frame.color, DEFAULT_FRAME.color),
    deco: pick(FRAME_DECOS, frame.deco, DEFAULT_FRAME.deco),
  };
}

export const sameFrame = (a: SponsorFrame, b: SponsorFrame) => a.style === b.style && a.color === b.color && a.deco === b.deco;

/** 꾸미기 링크의 키: 32바이트 난수의 base64url (43자). 주소의 # 뒤에 실어 서버 기록·리퍼러에 남지 않게 한다. */
const STUDIO_KEY = /^[A-Za-z0-9_-]{43}$/;
export const studioKeyFromHash = (hash: string): string | null => {
  const key = hash.replace(/^#/, "");
  return STUDIO_KEY.test(key) ? key : null;
};
export const studioLink = (origin: string, key: string) => `${origin.replace(/\/+$/, "")}/sponsors/studio#${key}`;
