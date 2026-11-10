/**
 * 눈·입: 얼굴 SDF 곡면에 밀착시킨 얇은 메시 + 모프 타깃.
 *
 * 2D 눈 좌표(u: 바깥쪽 +, v: 위 +)로 모양을 그린 뒤, 앞(+z)에서 얼굴 표면으로 쏘아 내려 붙인다.
 * 그래서 옆에서 봐도 눈이 머리 밖으로 튀어나오지 않고 볼 곡면을 따라 자연스럽게 줄어든다.
 * 눈동자 무늬는 셰이더가 '모프가 적용된 위치'에서 계산한다 → 눈꺼풀이 내려오면 무늬가 찌그러지지 않고 가려진다.
 *
 * 모프: blink(감기) · sleepy(졸림) · smile(웃는 눈+입) · surprise(놀람)
 */
import * as THREE from "three";
import { FACE } from "./design";
import { gradient } from "./mesher";

export const FACE_MORPHS = ["blink", "sleepy", "smile", "surprise"] as const;
export type FaceMorph = (typeof FACE_MORPHS)[number];

type SdfFn = (x: number, y: number, z: number) => number;
type Curve = (w: number) => number;

const LASH = new THREE.Color("#4e332e");
const MOUTH_LINE = new THREE.Color("#8c4a45");
const MOUTH_FILL = new THREE.Color("#c4646c");

interface Shape { top: Curve; bot: Curve; lashScale: number; mouth: (w: number) => [number, number]; mouthThick: number; ring: number }

const sq = (w: number) => Math.max(0, 1 - w * w);

// 기본 표정이 원본 그림: 위 속눈썹이 거의 평평하게 덮인 나른한 눈
// 안쪽(w<0)을 살짝 높여 둔다: 보통 약간 위에서 내려다보므로, 평평하게 두면 미간 쪽이 처져 화난 눈처럼 보인다
const topRest: Curve = w => 0.0135 - 0.003 * w * w - 0.0055 * w;
const botRest: Curve = w => topRest(w) - 0.05 * Math.pow(sq(w), 0.6);
const mouthRest = (w: number): [number, number] => [w * 0.0135, -0.0048 * sq(w)];

const SHAPES: Record<"rest" | FaceMorph, Shape> = {
  rest: { top: topRest, bot: botRest, lashScale: 1, mouth: mouthRest, mouthThick: 0.0027, ring: 0 },
  blink: {
    top: w => 0.006 - 0.024 * Math.pow(sq(w), 0.8) + 0.002 * w, bot: w => 0.006 - 0.024 * Math.pow(sq(w), 0.8) + 0.002 * w,
    lashScale: 0.62, mouth: mouthRest, mouthThick: 0.0027, ring: 0,
  },
  sleepy: {
    top: w => Math.max(botRest(w), topRest(w) - 0.022 * Math.pow(sq(w), 0.3)), bot: botRest,
    lashScale: 0.85, mouth: mouthRest, mouthThick: 0.0027, ring: 0,
  },
  smile: {
    top: w => topRest(w) - 0.004 * sq(w), bot: w => Math.min(topRest(w) - 0.004 * sq(w), botRest(w) + 0.017 * sq(w)),
    lashScale: 1, mouth: w => [w * 0.0195, 0.0016 - 0.0105 * sq(w)], mouthThick: 0.0031, ring: 0,
  },
  surprise: {
    top: w => -0.004 + 0.041 * Math.sqrt(sq(w)), bot: w => -0.004 - 0.042 * Math.sqrt(sq(w)),
    lashScale: 1.05, mouth: w => [0.0098 * Math.sin(Math.PI * w), -0.0035 - 0.0115 * Math.cos(Math.PI * w)], mouthThick: 0.0026, ring: 1,
  },
};

/** 앞에서 쏴서 얼굴 표면에 닿는 점 + 표면 바깥으로 offset */
function project(f: SdfFn, x: number, y: number, offset: number): THREE.Vector3 {
  let z = 0.45;
  for (let i = 0; i < 80; i++) {
    const d = f(x, y, z);
    if (Math.abs(d) < 1e-6) break;
    z -= d;
  }
  const g = gradient(f, x, y, z, 0.002);
  return new THREE.Vector3(x + g[0] * offset, y + g[1] * offset, z + g[2] * offset);
}

export function buildFaceGeometry(f: SdfFn, headBone: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const targets: Record<FaceMorph, number[]> = { blink: [], sleepy: [], smile: [], surprise: [] };
  /** 형태 함수 하나로 기본·모프 위치를 모두 뽑아 넣는다 */
  const vertex = (at: (s: Shape) => [number, number], offset: number, color: THREE.Color, kind: number, side: number) => {
    const [x0, y0] = at(SHAPES.rest);
    const p0 = project(f, x0, y0, offset);
    pos.push(p0.x, p0.y, p0.z);
    col.push(color.r, color.g, color.b);
    uv.push(kind, side);
    for (const m of FACE_MORPHS) {
      const [x, y] = at(SHAPES[m]);
      const p = project(f, x, y, offset);
      targets[m].push(p.x - p0.x, p.y - p0.y, p.z - p0.z);
    }
    return pos.length / 3 - 1;
  };

  // ---- 눈 (양쪽)
  const NU = 18, NV = 6;
  const hw = 0.055, uc = 0.005;
  for (const s of [-1, 1]) {
    const cx = s * FACE.eyeX, cy = FACE.eyeY;
    const toXY = (u: number, v: number): [number, number] => [cx + s * u, cy + v];
    // 흰자·눈동자 면: 위·아래 곡선 사이를 기둥처럼 나눈다
    const grid: number[][] = [];
    for (let i = 0; i <= NU; i++) {
      const w = -1 + (2 * i) / NU;
      const u = uc + w * hw;
      const col_: number[] = [];
      for (let j = 0; j <= NV; j++) {
        const t = j / NV;
        col_.push(vertex(sh => { const b = sh.bot(w), tp = Math.max(b, sh.top(w)); return toXY(u, b + (tp - b) * t); }, 0.0012, new THREE.Color(1, 1, 1), 0, s));
      }
      grid.push(col_);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      idx.push(a, b, c, a, c, d);
    }
    // 위 속눈썹: 바깥쪽이 두껍고 끝이 살짝 삐친다
    const lashCols: [number, number][] = [];
    const LN = 22;
    for (let i = 0; i <= LN; i++) {
      const w = -1.04 + (2.26 * i) / LN; // 바깥으로 조금 더 나간다
      const wc = Math.min(1, w);
      const u = uc + w * hw;
      const ext = Math.max(0, w - 1);
      const thick = (sh: Shape) => (0.0042 + 0.0088 * smooth(-0.95, 0.5, w)) * sh.lashScale * (1 - smooth(1.0, 1.22, w) * 0.75) * (0.55 + 0.45 * smooth(-1.04, -0.8, w));
      const topAt = (sh: Shape) => sh.top(wc) - 0.022 * ext;
      const lo = vertex(sh => toXY(u, topAt(sh) - 0.0022), 0.0022, LASH, 1, s);
      const hi = vertex(sh => toXY(u + 0.003 * ext, topAt(sh) + thick(sh)), 0.0022, LASH, 1, s);
      lashCols.push([lo, hi]);
    }
    for (let i = 0; i < LN; i++) {
      const [a, d] = lashCols[i], [b, c] = lashCols[i + 1];
      idx.push(a, b, c, a, c, d);
    }
  }

  // ---- 입: 작은 곡선(획) + 놀랐을 때만 펼쳐지는 입 안
  const MN = 16;
  const cyM = FACE.mouthY;
  const strip: [number, number][] = [];
  for (let i = 0; i <= MN; i++) {
    const w = -1 + (2 * i) / MN;
    const edge = (sh: Shape, sgn: number): [number, number] => {
      const e = 1e-3;
      const [x0, y0] = sh.mouth(w - e), [x1, y1] = sh.mouth(w + e), [x, y] = sh.mouth(w);
      let tx = x1 - x0, ty = y1 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const taper = sh.ring ? 1 : 0.55 + 0.45 * Math.sqrt(sq(w));
      const half = (sh.mouthThick * taper) / 2;
      return [x - ty * half * sgn, cyM + y + tx * half * sgn];
    };
    strip.push([vertex(sh => edge(sh, -1), 0.0017, MOUTH_LINE, 1, 0), vertex(sh => edge(sh, 1), 0.0017, MOUTH_LINE, 1, 0)]);
  }
  for (let i = 0; i < MN; i++) {
    const [a, d] = strip[i], [b, c] = strip[i + 1];
    idx.push(a, b, c, a, c, d);
  }
  // 입 안: 평소엔 한 점으로 접혀 있다가 놀람에서만 타원으로 열린다
  const closed = (): [number, number] => [0, cyM - 0.003];
  const center = vertex(() => closed(), 0.0012, MOUTH_FILL, 1, 0);
  const ring: number[] = [];
  for (let i = 0; i <= MN; i++) {
    const w = -1 + (2 * i) / MN;
    ring.push(vertex(sh => (sh.ring ? [0.0088 * Math.sin(Math.PI * w), cyM - 0.0035 - 0.0103 * Math.cos(Math.PI * w)] : closed()), 0.0012, MOUTH_FILL, 1, 0));
  }
  for (let i = 0; i < MN; i++) idx.push(center, ring[i], ring[i + 1]);

  const geo = new THREE.BufferGeometry();
  const n = pos.length / 3;
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = headBone; sw[i * 4] = 1; }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = FACE_MORPHS.map(m => {
    const a = new THREE.Float32BufferAttribute(targets[m], 3);
    a.name = m;
    return a;
  });
  // 감기 방향과 무관하게 앞에서 보이도록 재질은 양면으로 그린다
  geo.computeBoundingSphere();
  return geo;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
