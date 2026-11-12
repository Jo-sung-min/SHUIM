/**
 * 모링의 얼굴: 몸통 그림(moring-body.webp, 눈을 지운 도트 그림) 위에 표정별 도트를 얹는다.
 * 도트 한 칸은 원래 그림의 눈 도트 크기(원본 6.6px)와 같아서, 눈·눈썹·부리가 몸통과 한 그림처럼 보인다.
 * 글자 하나가 한 칸: "." 은 빈칸, 나머지는 PALETTE 의 색. 왼쪽 눈 기준으로 그리고 오른쪽 눈은 좌우로 뒤집는다 (바깥쪽이 처진다).
 * 이 파일은 타입만 빼면 그대로 node 로도 읽혀서, 그림 확인용 스크립트가 같은 데이터를 쓴다.
 */

/** 원본 그림(1254px)에서 몸통을 잘라 낸 범위. moring-body.webp 가 이 범위다 */
export const CROP = { x: 153, y: 135, w: 930, h: 983 };
/** 128×122 칸 안에서 몸통의 폭. 몸 가운데(원본 617.5)가 64, 발끝(원본 1109)이 바닥 112.5 에 온다 */
export const BODY_W = 106;
export const SCALE = BODY_W / CROP.w;
export const BODY = { x: 64 - (617.5 - CROP.x) * SCALE, y: 112.5 - (1109 - CROP.y) * SCALE, w: BODY_W, h: CROP.h * SCALE };
/** 도트 한 칸 (원래 눈의 도트 크기) */
export const CELL = 6.6 * SCALE;
/** 원본 좌표 → 128×122 칸 */
export const at = (x: number, y: number): [number, number] => [BODY.x + (x - CROP.x) * SCALE, BODY.y + (y - CROP.y) * SCALE];

export const PALETTE: Record<string, string> = {
  K: "#211b24", // 눈 테두리·가장 어두운 곳
  D: "#2e2a36", // 눈동자
  G: "#4a4658", // 눈동자 아래쪽 비침
  H: "#6a6579",
  w: "#d9d4e0", // 흐린 눈빛 (맑게 반짝이지 않게)
  B: "#a89fab", // 처진 눈썹
  P: "#f2a1b4", // 볼
  M: "#3a3140", // 벌린 부리 안
  T: "#e88a9c", // 혀
  R: "#fffaf0", // 마음밥
  r: "#e6dccb",
  V: "#cdbbf0", // 밥그릇
  v: "#a993d6",
  O: "#4a3d55", // 밥그릇 테두리
  L: "#f29aab", // 하트
  l: "#ffd3dc",
  Z: "#a99ccb",
};

/** 얼굴 부품의 자리 (원본 좌표): 두 눈의 가운데, 부리 아래, 볼 */
export const FACE = {
  eyeL: at(443, 441), eyeR: at(707, 441),
  browDy: -6.6 * CELL, // 눈 가운데에서 눈썹까지
  cheekL: at(436, 497), cheekR: at(714, 497),
  mouth: at(553, 510),
};

/** 왼쪽 눈 기준 그림. 오른쪽 눈은 뒤집어 쓴다 */
export const EYES = {
  /** 평소: 위 눈꺼풀이 안쪽에서 바깥쪽으로 처져 내려온 반쯤 감긴 눈, 흐린 눈빛 한 점 */
  sad: [
    ".......KK",
    "....KKKDK",
    "..KKDDDwK",
    ".KDDDDDDK",
    "KDDDDDDDK",
    "KDGDDDDK.",
    ".KDGGDDK.",
    "..KKKKK..",
  ],
  /** 옆을 힐끗: 눈동자가 안쪽으로 */
  sadSide: [
    ".......KK",
    "....KKKDK",
    "..KKDDwDK",
    ".KDDDDDDK",
    "KDDDDDDDK",
    "KDDDGDDK.",
    ".KDDGGDK.",
    "..KKKKK..",
  ],
  /** 웃을 때: 위로 둥근 감은 눈 */
  smile: [
    "..KKKK..",
    ".K....K.",
    "K......K",
  ],
  /** 잘 때: 바깥쪽이 조금 처진 감은 눈 */
  sleep: [
    "K.......",
    ".K.....K",
    "..KKKKK.",
  ],
};
/** 걱정스럽게 안쪽이 올라간 눈썹 (왼쪽 기준) */
export const BROW = {
  sad: ["...BB", ".BB..", "B...."],
  soft: ["..BBB", "BB..."],
};
export const CHEEK = [".PPPP.", "PPPPPP"];
/** 먹을 때 벌린 부리 */
export const MOUTH_OPEN = [".MMMM.", "MMTTMM", ".MMMM."];
export const BOWL = [
  "...RRRRR...",
  "..RRrRRRR..",
  ".RRRRRRrRR.",
  "OOOOOOOOOOO",
  "OVVVVVVVVVO",
  ".OVvVVVvVO.",
  "..OOOOOOO..",
];
export const HEART = [".LL.LL.", "LlLLLLL", "LLLLLLL", ".LLLLL.", "..LLL..", "...L..."];
export const ZZ = ["ZZZZ", "..Z.", ".Z..", "ZZZZ"];

export interface Dot { x: number; y: number; w: number; h: number; fill: string }
/**
 * 글자 그림을 사각형으로: 같은 색이 가로로 이어지면 한 칸으로 합친다 (DOM 이 가볍게).
 * (cx, cy) 가 그림의 가운데, cell 은 한 칸의 크기, flip 이면 좌우를 뒤집는다
 */
export function dots(rows: readonly string[], cx: number, cy: number, cell = CELL, flip = false): Dot[] {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const x0 = cx - (w * cell) / 2, y0 = cy - (h * cell) / 2, out: Dot[] = [];
  rows.forEach((row0, j) => {
    const row = flip ? [...row0.padEnd(w, ".")].reverse().join("") : row0.padEnd(w, ".");
    for (let i = 0; i < w; ) {
      const ch = row[i];
      let k = i + 1;
      while (k < w && row[k] === ch) k++;
      if (ch !== "." && PALETTE[ch]) out.push({ x: x0 + i * cell, y: y0 + j * cell, w: (k - i) * cell, h: cell, fill: PALETTE[ch] });
      i = k;
    }
  });
  return out;
}
