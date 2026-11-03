/* 생성 파일 — scripts/gen-beach-sprites.mjs 가 만든다. 손으로 고치지 말 것 */

/** 캐릭터 아틀라스(chars.png): 한 칸 48×64, 가로 12칸 × 세로 8줄(색 변형) */
export const CHAR_ATLAS = { cellW: 48, cellH: 64, cols: 12, rows: 8, width: 576, height: 512 } as const;
/** 칸 순서: 보는 방향(앞·뒤·왼·오른) × 프레임(서있기·걷기1·걷기2) */
export const CHAR_VIEW = { front: 0, back: 3, left: 6, right: 9 } as const;
export const CHAR_FRAME = { idle: 0, walk1: 1, walk2: 2 } as const;

/** 소품·이펙트 아틀라스(props.png)의 영역 (픽셀) */
export const PROPS_ATLAS = { width: 256, height: 128 } as const;
export type PropName = "palm" | "palm2" | "umbrella" | "rock" | "rock2" | "fire0" | "fire1" | "fire2" | "logs" | "heart" | "sparkle" | "leaf" | "petal" | "shell" | "star" | "shell2" | "glow" | "ring" | "shadow" | "mat" | "sign";
export const PROP: Record<PropName, { x: number; y: number; w: number; h: number }> = {
  palm: {
    x: 0,
    y: 0,
    w: 48,
    h: 64
  },
  palm2: {
    x: 48,
    y: 0,
    w: 48,
    h: 64
  },
  umbrella: {
    x: 96,
    y: 0,
    w: 32,
    h: 40
  },
  rock: {
    x: 128,
    y: 0,
    w: 24,
    h: 14
  },
  rock2: {
    x: 152,
    y: 0,
    w: 18,
    h: 11
  },
  fire0: {
    x: 176,
    y: 0,
    w: 16,
    h: 24
  },
  fire1: {
    x: 192,
    y: 0,
    w: 16,
    h: 24
  },
  fire2: {
    x: 208,
    y: 0,
    w: 16,
    h: 24
  },
  logs: {
    x: 224,
    y: 0,
    w: 16,
    h: 24
  },
  heart: {
    x: 0,
    y: 64,
    w: 8,
    h: 8
  },
  sparkle: {
    x: 8,
    y: 64,
    w: 8,
    h: 8
  },
  leaf: {
    x: 16,
    y: 64,
    w: 8,
    h: 8
  },
  petal: {
    x: 24,
    y: 64,
    w: 8,
    h: 8
  },
  shell: {
    x: 32,
    y: 64,
    w: 8,
    h: 8
  },
  star: {
    x: 40,
    y: 64,
    w: 8,
    h: 8
  },
  shell2: {
    x: 48,
    y: 64,
    w: 8,
    h: 8
  },
  glow: {
    x: 64,
    y: 64,
    w: 32,
    h: 32
  },
  ring: {
    x: 96,
    y: 64,
    w: 32,
    h: 32
  },
  shadow: {
    x: 128,
    y: 64,
    w: 32,
    h: 32
  },
  mat: {
    x: 160,
    y: 64,
    w: 24,
    h: 14
  },
  sign: {
    x: 184,
    y: 64,
    w: 24,
    h: 32
  }
};
