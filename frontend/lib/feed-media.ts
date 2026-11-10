import type { CSSProperties } from "react";

/** 사진·영상 위에 얹은 글 (backend FeedMedia.java 와 같은 규칙) */
export type OverlayColor = "white" | "ink" | "cream" | "lavender" | "sky" | "rose" | "sage";
export type OverlayFont = "sans" | "serif" | "song" | "hahmlet" | "pen";
export type OverlayAlign = "left" | "center" | "right";
export type OverlayStyle = "plain" | "dim" | "solid";

export interface TextOverlay {
  text: string;
  /** 글 가운데 위치, 콘텐츠 너비·높이 대비 0~1 */
  x: number;
  y: number;
  /** 글자 크기, 콘텐츠 너비 대비 */
  size: number;
  color: OverlayColor;
  font: OverlayFont;
  align: OverlayAlign;
  style: OverlayStyle;
}

export const MAX_OVERLAYS = 5;
export const OVERLAY_MAX_CHARS = 120;
export const OVERLAY_SIZE_MIN = 0.03;
export const OVERLAY_SIZE_MAX = 0.2;
export const VIDEO_MAX_SECONDS = 30;
/** 피드 한 장의 비율 (세로 전체 화면, 릴스와 같음). 사진·영상은 올릴 때 이 비율로 자른다 */
export const FEED_RATIO = 9 / 16;
export const VIDEO_MIN_SECONDS = 1;

/** 차분한 색 7가지. ink = solid 배경일 때 글자색 */
export const OVERLAY_COLORS: { id: OverlayColor; label: string; hex: string; ink: string }[] = [
  { id: "white", label: "흰색", hex: "#ffffff", ink: "#1e1b24" },
  { id: "ink", label: "먹색", hex: "#1e1b24", ink: "#ffffff" },
  { id: "cream", label: "크림", hex: "#f6ebd9", ink: "#3a2e1e" },
  { id: "lavender", label: "라벤더", hex: "#cbb8ff", ink: "#2a1e52" },
  { id: "sky", label: "하늘", hex: "#bfd9f2", ink: "#17324d" },
  { id: "rose", label: "분홍", hex: "#f4c6cf", ink: "#4f1f2b" },
  { id: "sage", label: "연두", hex: "#cfe3c0", ink: "#24361a" },
];

/** 무드 글꼴 (Pretendard 외에는 lib/overlay-fonts.ts 가 필요할 때만 불러온다). serif 는 예전 "명조" 글도 바탕으로 보이게 */
export const OVERLAY_FONTS: { id: OverlayFont; label: string; family: string; weight: number }[] = [
  { id: "sans", label: "기본", family: "inherit", weight: 700 },
  { id: "serif", label: "바탕", family: '"Gowun Batang", "Noto Serif CJK KR", serif', weight: 700 },
  { id: "song", label: "활자", family: '"Song Myung", "Noto Serif CJK KR", serif', weight: 400 },
  { id: "hahmlet", label: "함렛", family: '"Hahmlet", "Noto Serif CJK KR", serif', weight: 600 },
  { id: "pen", label: "손글씨", family: '"Nanum Pen Script", cursive', weight: 400 },
];

export const DEFAULT_OVERLAY: Omit<TextOverlay, "text"> = { x: 0.5, y: 0.45, size: 0.07, color: "white", font: "sans", align: "center", style: "plain" };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const clampOverlay = (o: TextOverlay): TextOverlay => ({
  ...o, x: clamp(o.x, 0, 1), y: clamp(o.y, 0, 1), size: clamp(o.size, OVERLAY_SIZE_MIN, OVERLAY_SIZE_MAX),
});

/** 화면에 그릴 때의 위치·색. 크기는 콘텐츠 상자(container-type: inline-size)의 너비 기준 */
export function overlayStyle(o: TextOverlay): CSSProperties {
  const color = OVERLAY_COLORS.find((c) => c.id === o.color) ?? OVERLAY_COLORS[0];
  const font = OVERLAY_FONTS.find((f) => f.id === o.font) ?? OVERLAY_FONTS[0];
  return {
    left: `${o.x * 100}%`,
    top: `${o.y * 100}%`,
    textAlign: o.align,
    fontFamily: font.family,
    fontWeight: font.weight,
    // 손글씨는 글자가 작게 보여 조금 키운다
    fontSize: `calc(${o.size * (o.font === "pen" ? 1.25 : 1)} * 100cqw)`,
    color: o.style === "solid" ? color.ink : color.hex,
    "--ovl-bg": o.style === "solid" ? color.hex : o.style === "dim" ? "rgba(12, 10, 16, 0.5)" : "transparent",
  } as CSSProperties;
}

/** 대표 사진·영상 비율을 화면에 맞는 범위로 */
export const safeRatio = (ratio: number | undefined, fallback = 4 / 5) =>
  ratio && Number.isFinite(ratio) && ratio >= 0.2 && ratio <= 5 ? ratio : fallback;

export const formatSeconds = (s: number) => {
  const v = Math.max(0, Math.round(s * 10) / 10);
  const m = Math.floor(v / 60);
  const sec = v - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(sec % 1 ? 1 : 0)}`;
};
