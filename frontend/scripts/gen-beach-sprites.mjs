#!/usr/bin/env node
/**
 * 소로우 바닷가 도트 그림 만들기:  node scripts/gen-beach-sprites.mjs
 *
 * 외부 저작물 없이 이 파일 안의 픽셀 템플릿과 간단한 그리기 함수로 PNG 를 만든다 (PNG 인코더도 여기 있음, 의존성 없음).
 *   public/beach/chars.png   캐릭터 아틀라스: 16×24 칸, 가로 12칸(앞·뒤·왼·오른 × 서있기·걷기1·걷기2) × 세로 8줄(색 변형)
 *   public/beach/props.png   소품·이펙트 아틀라스 (야자수·파라솔·바위·모닥불·하트·반짝임·잎·빛·그림자·조개 …)
 *   public/beach/sand.png    이어 붙일 수 있는 모래 질감 (128×128)
 *   lib/beach/atlas.ts       위 아틀라스의 좌표 상수 (생성 파일 — 손으로 고치지 말 것)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "beach");
mkdirSync(outDir, { recursive: true });

/* ---------------- PNG 인코더 ---------------- */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // 필터 없음
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 그리기 도우미 ---------------- */
const hex = (h, a = 255) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const shade = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), c[3]];

class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 4);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
    this.buf[i + 3] = c[3] ?? 255;
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.buf[i], this.buf[i + 1], this.buf[i + 2], this.buf[i + 3]];
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  line(x0, y0, x1, y1, c, width = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let k = 0; k < width; k++) this.set(x + k, y, c);
    }
  }
  /** 템플릿(한 줄에 한 행, 글자가 팔레트 키)을 (x, y) 에 찍는다 */
  blit(rows, x, y, palette) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === "." || ch === " ") continue;
        const c = palette[ch];
        if (!c) throw new Error(`팔레트에 없는 글자 '${ch}'`);
        this.set(x + i, y + j, c);
      }
    });
  }
  /** 다른 래스터를 좌우 뒤집어 찍는다 */
  blitMirror(src, sx, sy, w, h, dx, dy) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = src.get(sx + i, sy + j);
      if (c[3]) this.set(dx + (w - 1 - i), dy + j, c);
    }
  }
  copy(src, sx, sy, w, h, dx, dy) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = src.get(sx + i, sy + j);
      if (c[3]) this.set(dx + i, dy + j, c);
    }
  }
  png() {
    return encodePng(this.w, this.h, this.buf);
  }
}

/** "3. o 8s o 3." 처럼 (개수)(글자) 토큰을 풀어 한 행을 만든다. 길이가 맞지 않으면 바로 알려 준다 */
function r(spec, width = 16) {
  if (!/\s/.test(spec) && spec.length === width) return spec; // 글자를 그대로 적은 행
  const row = spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^(\d*)(.)$/.exec(tok);
      if (!m) throw new Error(`토큰 '${tok}'`);
      return m[2].repeat(m[1] ? Number(m[1]) : 1);
    })
    .join("");
  if (row.length !== width) throw new Error(`행 길이 ${row.length} ≠ ${width}: "${spec}"`);
  return row;
}
const rows = (specs, width = 16) => specs.map((s) => r(s, width));
const mirrorRows = (rs) => rs.map((row) => row.split("").reverse().join(""));

/* ---------------- 캐릭터 ---------------- */
const CELL_W = 16;
const CELL_H = 24;

// 앞모습 (0행은 걷기 프레임에서 위로 한 칸 들썩이려고 비워 둔다)
const FRONT_BODY = rows([
  "16.",
  "5. 6o 5.",
  "4. o 6h o 4.",
  "3. o 8h o 3.",
  "3. o 8h o 3.",
  "3. o 8h o 3.",
  "3. o 2h 4s 2h o 3.",
  "3. o h 6s h o 3.",
  "3. o 2s e 2s e 2s o 3.",
  "3. o 8s o 3.",
  "3. o S 6s S o 3.",
  "4. o S 4s S o 4.",
  "5. 6o 5.",
  "4. 2o 4t 2o 4.",
  "3. o 8t o 3.",
  "2. o s o 6t o s o 2.",
  "2. o s o 6t o s o 2.",
  "2. o s o T 4t T o s o 2.",
  "2. o S o 6T o S o 2.",
]); // 19행 (0~18)
const FRONT_LEGS_IDLE = rows([
  "3. o 8p o 3.",
  "3. o 2p o 2. o 2p o 3.",
  "3. o 2p o 2. o 2p o 3.",
  "3. o 2f o 2. o 2f o 3.",
  "3. 4o 2. 4o 3.",
]); // 5행 (19~23)
const FRONT_LEGS_WALK = rows([
  "3. o 8p o 3.",
  "3. o 2p o 2. o 2p o 3.",
  "3. o 2p o 2. o 2f o 3.",
  "3. o 2f o 2. 4o 3.",
  "3. 4o 9.",
]);

// 옆모습 (왼쪽을 본다)
const SIDE_BODY = rows([
  "16.",
  "5. 6o 5.",
  "4. o 6h o 4.",
  "3. o 8h o 3.",
  "3. o 8h o 3.",
  "3. o 8h o 3.",
  "3. o 2s 6h o 3.",
  "3. o 3s 5h o 3.",
  "3. o s e s 5h o 3.",
  "3. o 4s 4h o 3.",
  "3. o S 3s 4h o 3.",
  "4. o 3s 3h o 4.",
  "5. 6o 5.",
  "4. 2o 4t 2o 4.",
  "4. o 6t o 4.",
  "4. o 2t T 3t o 4.",
  "4. o 2t T 3t o 4.",
  "4. o 2t T 3t o 4.",
  "4. o 2T S 3T o 4.",
]);
const SIDE_LEGS_IDLE = rows([
  "4. o 6p o 4.",
  "5. o 4p o 5.",
  "5. o 4p o 5.",
  "5. o 4f o 5.",
  "5. 6o 5.",
]);
const SIDE_LEGS_WALK1 = rows([
  "4. o 6p o 4.",
  "3. o 2p o 2. o 2p o 3.",
  "2. o 2p o 4. o 2p o 2.",
  "2. o 2f o 4. o 2f o 2.",
  "2. 4o 4. 4o 2.",
]);
const SIDE_LEGS_WALK2 = rows([
  "4. o 6p o 4.",
  "4. o 2p o 2p o 5.",
  "4. o 2p o 2p o 5.",
  "4. o 2f o 2f o 5.",
  "4. 7o 5.",
]);

// 몸(19행) + 다리(5행) = 24행. 걷기1은 몸을 한 칸 올려 들썩이고(맨 아래 행은 빈다), 걷기2는 제자리에서 다리만 바꾼다
const BLANK = ".".repeat(CELL_W);
const idle = (body, legs) => [...body, ...legs];
const walkUp = (body, legs) => [...body.slice(1), ...legs, BLANK];
const walkDown = (body, legs) => [...body, ...legs];

const toBack = (rs) => rs.map((row) => row.replace(/[seSw]/g, (ch) => (ch === "S" ? "H" : "h")));

const FRONT = { idle: idle(FRONT_BODY, FRONT_LEGS_IDLE), walk1: walkUp(FRONT_BODY, FRONT_LEGS_WALK), walk2: mirrorRows(walkUp(FRONT_BODY, FRONT_LEGS_WALK)) };
const BACK = { idle: toBack(FRONT.idle), walk1: toBack(FRONT.walk1), walk2: toBack(FRONT.walk2) };
const LEFT = { idle: idle(SIDE_BODY, SIDE_LEGS_IDLE), walk1: walkUp(SIDE_BODY, SIDE_LEGS_WALK1), walk2: walkDown(SIDE_BODY, SIDE_LEGS_WALK2) };
const RIGHT = { idle: mirrorRows(LEFT.idle), walk1: mirrorRows(LEFT.walk1), walk2: mirrorRows(LEFT.walk2) };
for (const v of [FRONT, BACK, LEFT, RIGHT]) for (const f of Object.values(v)) if (f.length !== CELL_H) throw new Error(`프레임 높이 ${f.length}`);

/** 색 변형 8종: 살결·머리·옷·바지 */
const VARIANTS = [
  { skin: "#f1c9a5", hair: "#3b2a24", shirt: "#e9a9a0", pants: "#4a5a7a" },
  { skin: "#e8b894", hair: "#1e1b22", shirt: "#8fb8de", pants: "#3a3f55" },
  { skin: "#f6d4b8", hair: "#c98b4b", shirt: "#f3d58b", pants: "#6b7c59" },
  { skin: "#d9a27a", hair: "#4a2f23", shirt: "#a9d9b8", pants: "#8c5a44" },
  { skin: "#f1c9a5", hair: "#7a4b7e", shirt: "#fbf7f2", pants: "#5a6b8c" },
  { skin: "#c98a62", hair: "#2b2b2b", shirt: "#e07f73", pants: "#e8d9c0" },
  { skin: "#f6d4b8", hair: "#e3c27d", shirt: "#8a7be0", pants: "#2f2f3a" },
  { skin: "#e8b894", hair: "#8b3a3a", shirt: "#c6e0f5", pants: "#d8a570" },
];
function charPalette(v) {
  const skin = hex(v.skin), hair = hex(v.hair), shirt = hex(v.shirt), pants = hex(v.pants);
  return {
    o: hex("#2a2230"),
    s: skin, S: shade(skin, 0.82),
    h: hair, H: shade(hair, 0.75),
    t: shirt, T: shade(shirt, 0.8),
    p: pants, P: shade(pants, 0.8),
    e: hex("#2a2230"), w: hex("#ffffff"),
    f: shade(hex("#5a4636"), 1),
  };
}

const CHAR_COLS = [FRONT.idle, FRONT.walk1, FRONT.walk2, BACK.idle, BACK.walk1, BACK.walk2, LEFT.idle, LEFT.walk1, LEFT.walk2, RIGHT.idle, RIGHT.walk1, RIGHT.walk2];
const chars = new Raster(CELL_W * CHAR_COLS.length, CELL_H * VARIANTS.length);
VARIANTS.forEach((v, row) => {
  const pal = charPalette(v);
  CHAR_COLS.forEach((f, col) => chars.blit(f, col * CELL_W, row * CELL_H, pal));
});
writeFileSync(path.join(outDir, "chars.png"), chars.png());

/* ---------------- 소품 · 이펙트 ---------------- */
const props = new Raster(256, 128);
const REGIONS = {};
const region = (name, x, y, w, h) => {
  REGIONS[name] = { x, y, w, h };
  return { x, y, w, h };
};

// 야자수 48×64
function drawPalm(dx, dy, lean) {
  const trunk = hex("#8a6440"), trunkDark = hex("#634628"), trunkLight = hex("#a67e52");
  const leaf = hex("#3f8f4a"), leafDark = hex("#2d6b38"), leafLight = hex("#62ad60");
  const baseX = dx + 20, baseY = dy + 63, topY = dy + 16;
  let topX = baseX;
  for (let y = baseY; y >= topY; y--) {
    const t = (baseY - y) / (baseY - topY);
    const x = baseX + lean * 7 * t * t;
    topX = x;
    const w = Math.max(2, Math.round(4 - 1.5 * t));
    for (let k = 0; k < w; k++) props.set(x + k, y, k === 0 ? trunkLight : k === w - 1 ? trunkDark : trunk);
    if ((baseY - y) % 5 === 0) for (let k = 0; k < w; k++) props.set(x + k, y, trunkDark);
  }
  const cx = topX + 1, cy = topY;
  const fronds = [-165, -140, -115, -90, -65, -40, -15];
  fronds.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const len = 17 + (i % 2) * 3;
    for (let s = 0; s <= len; s++) {
      const droop = (s * s) / (len * 1.6);
      const x = cx + Math.cos(a) * s;
      const y = cy + Math.sin(a) * s * 0.55 + droop;
      props.set(x, y, leaf);
      props.set(x, y + 1, leafDark);
      if (s % 3 === 1 && s > 3) {
        props.set(x, y - 1, leafLight);
        props.set(x + Math.sign(Math.cos(a) || 1), y + 2, leafDark);
      }
    }
  });
  // 코코넛
  const nut = hex("#6b4a2e");
  props.set(cx - 1, cy + 2, nut); props.set(cx, cy + 2, nut); props.set(cx + 1, cy + 3, nut); props.set(cx - 2, cy + 3, nut);
}
region("palm", 0, 0, 48, 64);
drawPalm(0, 0, 1);
region("palm2", 48, 0, 48, 64);
drawPalm(48, 0, -1);

// 파라솔 32×40
{
  const { x: dx, y: dy } = region("umbrella", 96, 0, 32, 40);
  const pole = hex("#d9c8a8"), poleDark = hex("#a8966f");
  for (let y = dy + 12; y < dy + 40; y++) { props.set(dx + 15, y, pole); props.set(dx + 16, y, poleDark); }
  const red = hex("#e8705f"), white = hex("#fbf4ea"), edge = hex("#b84e42");
  for (let y = 0; y <= 12; y++) {
    const half = 15.5 * Math.sqrt(Math.max(0, 1 - ((12 - y) / 12) ** 2));
    for (let x = Math.round(16 - half); x <= Math.round(15 + half); x++) {
      const c = Math.floor((x - 16) / 5.3 + 10) % 2 === 0 ? red : white;
      props.set(dx + x, dy + y, y === 12 ? edge : c);
    }
  }
  props.set(dx + 15, dy, edge); props.set(dx + 16, dy, edge); // 꼭지
}

// 바위
function drawRock(dx, dy, w, h) {
  const base = hex("#8c8a86"), dark = hex("#64625f"), light = hex("#b0aea9");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - w / 2) / (w / 2), ny = (y + 0.5 - h / 2) / (h / 2);
    if (nx * nx + ny * ny * 1.1 > 1) continue;
    const c = ny > 0.45 ? dark : nx < -0.2 && ny < -0.1 ? light : base;
    props.set(dx + x, dy + y, c);
  }
}
{ const q = region("rock", 128, 0, 24, 14); drawRock(q.x, q.y, 24, 14); }
{ const q = region("rock2", 152, 0, 18, 11); drawRock(q.x, q.y, 18, 11); }

// 모닥불 16×24, 불꽃 3프레임 + 꺼진 장작
function drawLogs(dx, dy) {
  const log = hex("#7a5236"), logDark = hex("#523523");
  props.line(dx + 2, dy + 20, dx + 13, dy + 23, logDark, 1);
  props.line(dx + 2, dy + 19, dx + 13, dy + 22, log, 1);
  props.line(dx + 13, dy + 20, dx + 2, dy + 23, logDark, 1);
  props.line(dx + 13, dy + 19, dx + 2, dy + 22, log, 1);
  props.rect(dx + 5, dy + 18, 6, 2, hex("#3b2a1f"));
}
function drawFire(dx, dy, f) {
  drawLogs(dx, dy);
  const outer = hex("#e8572e"), mid = hex("#ff9a2e"), core = hex("#ffe08a");
  for (let y = 2; y <= 18; y++) {
    const t = (18 - y) / 16; // 0 바닥 → 1 끝
    const wob = Math.sin(y * 0.9 + f * 2.1) * 1.3 + Math.sin(y * 1.7 - f * 1.3) * 0.6;
    const half = 5.5 * Math.pow(1 - t, 0.7);
    for (let x = 0; x < 16; x++) {
      const dxp = x - 7.5 - wob * t;
      if (Math.abs(dxp) > half) continue;
      const inner = Math.abs(dxp) / Math.max(half, 0.1);
      const c = y > 11 && inner < 0.45 ? core : inner < 0.75 || y > 8 ? mid : outer;
      props.set(dx + x, dy + y, y < 5 && inner > 0.5 ? null : c);
    }
  }
  // 불티
  const spark = hex("#ffd27a");
  props.set(dx + 4 + ((f * 5) % 7), dy + 1 + (f % 2), spark);
  props.set(dx + 10 - ((f * 3) % 5), dy + 3 - (f % 2), spark);
}
{ const q = region("fire0", 176, 0, 16, 24); drawFire(q.x, q.y, 0); }
{ const q = region("fire1", 192, 0, 16, 24); drawFire(q.x, q.y, 1); }
{ const q = region("fire2", 208, 0, 16, 24); drawFire(q.x, q.y, 2); }
{ const q = region("logs", 224, 0, 16, 24); drawLogs(q.x, q.y); }

// 이펙트: 하트 · 반짝임 · 잎 · 꽃잎 (8×8)
const FX = {
  heart: rows(["8.", ".oo.oo..", "orrorro.", "orrwrro.", "orrrrro.", ".orrro..", "..oro...", "...o...."], 8),
  sparkle: rows(["...y....", "...y....", ".yyYyy..", "...y....", "...y....", "8.", "8.", "8."], 8),
  leaf: rows(["......g.", "....ggg.", "...gggg.", "..ggGg..", ".gGgg...", ".Gg.....", "g.......", "8."], 8),
  petal: rows(["8.", "..kk....", ".kkkk...", ".kkKk...", "..kk....", "8.", "8.", "8."], 8),
  shell: rows(["8.", "..ooo...", ".obbbo..", "obBbBbo.", "obbbbbo.", ".ooooo..", "8.", "8."], 8),
  star: rows(["...n....", "...nn...", ".nnnnnn.", "..nnnn..", "..n..n..", ".n....n.", "8.", "8."], 8),
  shell2: rows(["8.", "...oo...", "..ommo..", ".ommmmo.", ".oMmmMo.", "..oooo..", "8.", "8."], 8),
};
const fxPal = {
  o: hex("#2a2230"), r: hex("#ff6b8a"), w: hex("#ffd6e0"),
  y: hex("#ffe28a"), Y: hex("#fff6d6"),
  g: hex("#7fcf8a"), G: hex("#4f9f5c"),
  k: hex("#ffb3c6"), K: hex("#ffe1ea"),
  b: hex("#f3dcc0"), B: hex("#d9b893"),
  n: hex("#f0945f"),
  m: hex("#e9c6d4"), M: hex("#c79aae"),
};
let fxX = 0;
for (const [name, tpl] of Object.entries(FX)) {
  const q = region(name, fxX, 64, 8, 8);
  props.blit(tpl, q.x, q.y, fxPal);
  fxX += 8;
}

// 빛 · 선택 고리 · 그림자 (32×32, 흰색/검정에 알파만 — 색은 엔진에서 입힌다)
function radial(q, fn) {
  for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
    const nx = (x + 0.5 - q.w / 2) / (q.w / 2), ny = (y + 0.5 - q.h / 2) / (q.h / 2);
    const d = Math.sqrt(nx * nx + ny * ny);
    const c = fn(d);
    if (c) props.set(q.x + x, q.y + y, c);
  }
}
radial(region("glow", 64, 64, 32, 32), (d) => (d < 1 ? [255, 255, 255, Math.round(255 * Math.pow(1 - d, 2.2))] : null));
radial(region("ring", 96, 64, 32, 32), (d) => {
  const a = d > 0.72 && d < 0.96 ? 1 - Math.abs(d - 0.84) / 0.12 : 0;
  return a > 0 ? [255, 255, 255, Math.round(255 * Math.min(1, a * 1.6))] : null;
});
radial(region("shadow", 128, 64, 32, 32), (d) => (d < 1 ? [20, 16, 30, Math.round(150 * (1 - d * d))] : null));

// 돗자리 24×14
{
  const q = region("mat", 160, 64, 24, 14);
  const a = hex("#e07f73"), b = hex("#fbf4ea"), edge = hex("#b84e42");
  for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
    const border = x === 0 || y === 0 || x === q.w - 1 || y === q.h - 1;
    props.set(q.x + x, q.y + y, border ? edge : Math.floor(y / 2) % 2 === 0 ? a : b);
  }
}

// 나무 표지판 24×32 (하트 하나)
{
  const q = region("sign", 184, 64, 24, 32);
  const wood = hex("#b48a5a"), woodDark = hex("#8a6440"), post = hex("#8a6440");
  props.rect(q.x + 10, q.y + 14, 4, 18, post);
  props.rect(q.x + 11, q.y + 14, 1, 18, hex("#a67e52"));
  props.rect(q.x + 1, q.y + 2, 22, 13, woodDark);
  props.rect(q.x + 2, q.y + 3, 20, 11, wood);
  props.blit(FX.heart, q.x + 8, q.y + 5, fxPal);
}

writeFileSync(path.join(outDir, "props.png"), props.png());

/* ---------------- 모래 질감 (이어 붙일 수 있음) ---------------- */
{
  const N = 128;
  const sand = new Raster(N, N);
  // 격자 값 잡음: 주기가 N 을 나누면 가장자리가 이어진다
  const seed = (x, y, p) => {
    const h = Math.sin(((x % p) + 1) * 127.1 + ((y % p) + 1) * 311.7 + p * 0.37) * 43758.5453;
    return h - Math.floor(h);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, period) => {
    const cell = N / period;
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = smooth(gx - x0), fy = smooth(gy - y0);
    const v = (ix, iy) => seed(ix, iy, period);
    const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = noise(x, y, 8) * 0.5 + noise(x, y, 16) * 0.3 + noise(x, y, 32) * 0.2;
    const grain = seed(x, y, N);
    let v = 0.86 + (n - 0.5) * 0.18;
    if (grain > 0.985) v -= 0.14; // 어두운 알갱이
    else if (grain < 0.012) v += 0.09; // 밝은 알갱이
    const base = [236, 219, 186];
    sand.set(x, y, [Math.round(base[0] * v), Math.round(base[1] * v), Math.round(base[2] * v * 0.98), 255]);
  }
  writeFileSync(path.join(outDir, "sand.png"), sand.png());
}

/* ---------------- 좌표 상수 ---------------- */
const ts = `/* 생성 파일 — scripts/gen-beach-sprites.mjs 가 만든다. 손으로 고치지 말 것 */

/** 캐릭터 아틀라스(chars.png): 한 칸 ${CELL_W}×${CELL_H}, 가로 ${CHAR_COLS.length}칸 × 세로 ${VARIANTS.length}줄(색 변형) */
export const CHAR_ATLAS = { cellW: ${CELL_W}, cellH: ${CELL_H}, cols: ${CHAR_COLS.length}, rows: ${VARIANTS.length}, width: ${chars.w}, height: ${chars.h} } as const;
/** 칸 순서: 보는 방향(앞·뒤·왼·오른) × 프레임(서있기·걷기1·걷기2) */
export const CHAR_VIEW = { front: 0, back: 3, left: 6, right: 9 } as const;
export const CHAR_FRAME = { idle: 0, walk1: 1, walk2: 2 } as const;

/** 소품·이펙트 아틀라스(props.png)의 영역 (픽셀) */
export const PROPS_ATLAS = { width: ${props.w}, height: ${props.h} } as const;
export type PropName = ${Object.keys(REGIONS).map((k) => `"${k}"`).join(" | ")};
export const PROP: Record<PropName, { x: number; y: number; w: number; h: number }> = ${JSON.stringify(REGIONS, null, 2).replace(/"(\w+)":/g, "$1:")};
`;
mkdirSync(path.join(root, "lib", "beach"), { recursive: true });
writeFileSync(path.join(root, "lib", "beach", "atlas.ts"), ts);

console.log(`chars.png ${chars.w}×${chars.h}, props.png ${props.w}×${props.h}, sand.png 128×128, lib/beach/atlas.ts (${Object.keys(REGIONS).length} regions)`);
