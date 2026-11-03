/**
 * 소로우 바닷가 도트 캐릭터 시트의 단일 설정. Aseprite 생성 스크립트(scripts/aseprite/beach-character.lua)와
 * atlas.ts 생성기(gen-beach-sprites.mjs)가 같은 값을 쓴다.
 *
 * 시트 배치: 가로 = 보는 방향(앞·뒤·왼·오른) × 프레임(서있기 4 + 걷기 6), 세로 = 색 변형 8줄. 칸마다 1px 여백.
 */
export const CHARACTER = {
  cell: { width: 72, height: 104 },
  views: ["front", "back", "left", "right"],
  anims: { idle: 4, walk: 6 },
  /** 8가지 색 변형. style: 머리 모양 0 긴 생머리 · 1 단발 · 2 포니테일 (3으로 나눈 나머지) */
  variants: [
    { skin: "#f6d3b8", hair: "#6b4636", shirt: "#f0b5b7", pants: "#7d86a3", accent: "#fff1d2", eyes: "#4a3528", style: 0 },
    { skin: "#e8b793", hair: "#3b3a4c", shirt: "#b4d2e3", pants: "#7589a6", accent: "#f9e7ad", eyes: "#2f3b55", style: 1 },
    { skin: "#f9dcc3", hair: "#c48f58", shirt: "#f3dea2", pants: "#97aa8c", accent: "#d8ecf3", eyes: "#5b4a2a", style: 2 },
    { skin: "#cf976f", hair: "#4e3a32", shirt: "#bcdbc8", pants: "#b79a85", accent: "#fff4da", eyes: "#3a2c24", style: 0 },
    { skin: "#f0c1b0", hair: "#876a86", shirt: "#ece6da", pants: "#a5a7c7", accent: "#ebbacb", eyes: "#5a3f5c", style: 1 },
    { skin: "#ad7355", hair: "#3e3338", shirt: "#dba5a3", pants: "#dacbab", accent: "#f5dbb0", eyes: "#2d2426", style: 2 },
    { skin: "#f7dab6", hair: "#d1b67f", shirt: "#c0b3e0", pants: "#889ea7", accent: "#f8e8b6", eyes: "#6a5a33", style: 0 },
    { skin: "#e1b490", hair: "#935a4a", shirt: "#c4dbe4", pants: "#c4aa93", accent: "#f1cab0", eyes: "#4a2f27", style: 1 },
  ],
};

export const CHAR_COLUMNS = CHARACTER.anims.idle + CHARACTER.anims.walk;
export const CHAR_VIEW_OFFSETS = Object.fromEntries(CHARACTER.views.map((view, i) => [view, i * CHAR_COLUMNS]));
export const SHEET = {
  width: CHARACTER.cell.width * CHAR_COLUMNS * CHARACTER.views.length,
  height: CHARACTER.cell.height * CHARACTER.variants.length,
};
