/**
 * 첨부 그림의 2등신 금발 아이를 SDF 프리미티브로 설계한다.
 *
 * 단위는 미터처럼 쓰되 키가 약 1.0 이다(바닥 y=0, 얼굴은 +z).
 * 그림(1254px)에서 잰 비율: 머리카락 꼭대기 1.0 · 턱 0.47(머리가 키의 53%) · 치맛단 0.19 · 신발 0.
 *
 * 파트는 셋으로 나눈다. 같은 파트 안의 도형은 부드러운 합집합으로 한 표면이 되고(머리-목-몸통이 이음새 없이 이어짐),
 * 파트끼리는 따로 메시를 뽑아 하나의 지오메트리로 합친다.
 *   body  : 머리·얼굴·목·몸통·원피스·옷깃·리본·팔·다리·신발
 *   hair  : 정수리 덩어리 + 뒷머리 7다발 + 앞머리 5다발 + 옆머리 2다발 + 머리 리본
 */
import { ellipsoid, halfSpace, lock, roundedFrustum, torus, type Prim, type Vec3 } from "./sdf";

export const PALETTE: Record<string, string> = {
  skin: "#fde4d3",
  dress: "#7fa6ee",
  sleeve: "#7fa6ee",
  collar: "#fbfbff",
  ribbon: "#f7d88e",
  sock: "#fbfbff",
  shoe: "#6e4b43",
  hair: "#f8dca6",
  bow: "#6f9cec",
};

/** 뼈: 이름, 부모, 휴식 자세의 월드 위치. 모든 뼈는 회전 없는 휴식 자세라 애니메이션 축이 곧 월드 축이다. */
export interface BoneDef { name: string; parent: string | null; pos: Vec3; tail?: Vec3 }

const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

function sided(name: string, parentL: string | null, pos: Vec3, tail?: Vec3): BoneDef[] {
  // L = 캐릭터의 왼쪽 = +x (캐릭터가 +z 를 보고 있으므로)
  const pr = (p: string | null) => (p && /_L$/.test(p) ? p.replace(/_L$/, "_R") : p);
  return [
    { name: `${name}_L`, parent: parentL, pos, tail },
    { name: `${name}_R`, parent: pr(parentL), pos: mirror(pos), tail: tail && mirror(tail) },
  ];
}

export const BONES: BoneDef[] = [
  { name: "Root", parent: null, pos: [0, 0, 0] },
  { name: "Hips", parent: "Root", pos: [0, 0.245, 0] },
  { name: "Spine", parent: "Hips", pos: [0, 0.3, 0] },
  { name: "Chest", parent: "Spine", pos: [0, 0.37, 0] },
  { name: "Neck", parent: "Chest", pos: [0, 0.445, -0.005] },
  { name: "Head", parent: "Neck", pos: [0, 0.505, -0.008] },
  ...sided("UpperArm", "Chest", [0.095, 0.408, 0]),
  ...sided("LowerArm", "UpperArm_L", [0.148, 0.366, 0.002]),
  ...sided("Hand", "LowerArm_L", [0.18, 0.33, 0.005], [0.205, 0.295, 0.009]),
  ...sided("UpperLeg", "Hips", [0.058, 0.215, 0]),
  ...sided("LowerLeg", "UpperLeg_L", [0.061, 0.145, 0]),
  ...sided("Foot", "LowerLeg_L", [0.064, 0.068, 0], [0.067, 0.03, 0.07]),
  { name: "HairFront_C", parent: "Head", pos: [0, 0.87, 0.15], tail: [0, 0.57, 0.225] },
  ...sided("HairFront", "Head", [0.085, 0.855, 0.14], [0.13, 0.61, 0.215]),
  ...sided("HairSide1", "Head", [0.185, 0.76, 0.05]),
  ...sided("HairSide2", "HairSide1_L", [0.205, 0.6, 0.088], [0.16, 0.43, 0.12]),
  { name: "HairBack1_C", parent: "Head", pos: [0, 0.66, -0.19] },
  { name: "HairBack2_C", parent: "HairBack1_C", pos: [0, 0.44, -0.245], tail: [0, 0.2, -0.225] },
  ...sided("HairBack1", "Head", [0.17, 0.66, -0.11]),
  ...sided("HairBack2", "HairBack1_L", [0.28, 0.44, -0.1], [0.3, 0.2, -0.08]),
];

export type Weights = Record<string, number>;

export interface Part {
  name: string;
  prims: Prim[];
  /** 격자 간격(작을수록 촘촘) */
  h: number;
  /** 도형별 가중치 함수가 없을 때 쓰는 파트 기본 가중치 */
  weights(x: number, y: number, z: number): Weights;
  /** 색 경계를 얼마나 또렷하게 할지(작을수록 칼같이) */
  colorSharpness: number;
  /** 가중치 섞는 폭 */
  weightBlend: number;
  /** 툰 그림자를 드리우는 파트들(앞머리 아래 이마, 턱 아래 목) */
  cover: string[];
  coverStrength: number;
}

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const side = (x: number) => (x >= 0 ? "_L" : "_R");

// ------------------------------------------------------------------ 얼굴·머리

export const SKULL = { c: [0, 0.7, -0.005] as Vec3, r: [0.214, 0.232, 0.2] as Vec3 };

/** 두개골 표면의 z (앞쪽). 앞머리 다발을 이마 곡면에 얹을 때 쓴다. */
function skullZ(x: number, y: number) {
  const { c, r } = SKULL;
  const q = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0.02, q));
}
function skullNormal(x: number, y: number): Vec3 {
  const { c, r } = SKULL;
  const z = skullZ(x, y);
  return [(x - c[0]) / r[0] ** 2, (y - c[1]) / r[1] ** 2, (z - c[2]) / r[2] ** 2];
}

/** 몸통 뼈 높이에 따라 부드럽게 나누는 가중치: 목과 어깨가 하나의 변형 영역처럼 휜다 */
function torsoWeights(_x: number, y: number): Weights {
  const levels: [string, number][] = [["Hips", 0.25], ["Spine", 0.305], ["Chest", 0.375], ["Neck", 0.455], ["Head", 0.515]];
  if (y <= levels[0][1]) return { Hips: 1 };
  for (let i = 0; i < levels.length - 1; i++) {
    const [a, ya] = levels[i], [b, yb] = levels[i + 1];
    if (y <= yb) { const t = ss(ya, yb, y); return { [a]: 1 - t, [b]: t }; }
  }
  return { Head: 1 };
}

function armWeights(x: number, y: number, z: number): Weights {
  const s = side(x);
  const S: Vec3 = [Math.sign(x) * 0.08, 0.418, 0], T: Vec3 = [Math.sign(x) * 0.215, 0.285, 0.01];
  const bx = T[0] - S[0], by = T[1] - S[1], bz = T[2] - S[2];
  const t = ((x - S[0]) * bx + (y - S[1]) * by + (z - S[2]) * bz) / (bx * bx + by * by + bz * bz);
  const a = ss(0.02, 0.2, t), b = ss(0.42, 0.6, t), c = ss(0.66, 0.8, t);
  return { Chest: 1 - a, [`UpperArm${s}`]: a * (1 - b), [`LowerArm${s}`]: a * b * (1 - c), [`Hand${s}`]: a * b * c };
}

function legWeights(x: number, y: number): Weights {
  const s = side(x);
  const hip = ss(0.2, 0.245, y), knee = ss(0.128, 0.165, y), ankle = ss(0.072, 0.1, y);
  return { Hips: hip, [`UpperLeg${s}`]: (1 - hip) * knee, [`LowerLeg${s}`]: (1 - knee) * ankle, [`Foot${s}`]: 1 - ankle };
}

function bodyWeights(x: number, y: number, z: number): Weights {
  // 몸 파트 안의 팔·다리는 도형별 함수가 맡는다. 여기는 머리·몸통 기본값.
  void z;
  return torsoWeights(x, y);
}

export function bodyPart(): Part {
  const prims: Prim[] = [];
  const w = (fn: (x: number, y: number, z: number) => Weights) => ({ weight: fn });
  // 머리: 두개골 + 볼살 + 평평한 얼굴 앞면. 볼과 턱이 부드럽게 이어진다.
  prims.push(ellipsoid("skin", SKULL.c, SKULL.r));
  prims.push(ellipsoid("skin", [0, 0.575, 0.045], [0.192, 0.112, 0.152], { k: 0.06 }));
  for (const s of [-1, 1]) prims.push(ellipsoid("skin", [s * 0.07, 0.548, 0.058], [0.112, 0.08, 0.11], { k: 0.05 }));
  // 목: 머리·몸통과 넓게 녹아 붙는다
  prims.push(lock("skin", [[0, 0.395, -0.008], [0, 0.53, -0.02]], [0.046, 0.054], { k: 0.04 }));
  // 몸통: 어깨 둥글림 + A라인 원피스(바닥 평평, 앞뒤 납작)
  prims.push(ellipsoid("dress", [0, 0.39, -0.002], [0.112, 0.058, 0.084], { k: 0.035 }));
  prims.push(roundedFrustum("dress", 0.19, 0.43, 0.18, 0.082, 0.028, { k: 0.05, zScale: 0.8, zOffset: 0.004 }));
  // 팔: 부푼 소매 → 짧은 팔 → 둥근 손 (손가락 없음). 몸통 안쪽에서 시작해 이음새가 소매 주름에 숨는다.
  for (const s of [-1, 1]) {
    prims.push({ ...lock("sleeve", [[s * 0.07, 0.418, -0.002], [s * 0.148, 0.366, 0.002]], [0.044, 0.05], { k: 0.012 }), data: w(armWeights) });
    prims.push({ ...lock("skin", [[s * 0.14, 0.372, 0.002], [s * 0.18, 0.332, 0.005]], [0.023, 0.022], { k: 0.008 }), data: w(armWeights) });
    prims.push({ ...ellipsoid("skin", [s * 0.196, 0.308, 0.009], [0.03, 0.035, 0.027], { k: 0.016, rot: [0, 0, s * 0.62] }), data: w(armWeights) });
  }
  // 다리: 짧고 통통 → 흰 양말(접힌 단) → 둥근 갈색 구두(밑창 평평)
  for (const s of [-1, 1]) {
    prims.push({ ...lock("skin", [[s * 0.056, 0.26, 0], [s * 0.061, 0.1, 0]], [0.03, 0.028], { k: 0.0 }), data: w(legWeights) });
    prims.push({ ...lock("sock", [[s * 0.061, 0.112, 0], [s * 0.064, 0.06, 0.002]], [0.0345, 0.035], { k: 0.002 }), data: w(legWeights) });
    prims.push({ ...torus("sock", [s * 0.061, 0.113, 0], 0.031, 0.0085, { k: 0.004 }), data: w(legWeights) });
    prims.push({ ...ellipsoid("shoe", [s * 0.067, 0.038, 0.018], [0.054, 0.043, 0.07], { k: 0.012 }), data: w((x) => ({ [`Foot${side(x)}`]: 1 })) });
  }
  prims.push(halfSpace("shoe", [0, 0.0015, 0], [0, 1, 0], { k: 0.006 }));
  return { name: "body", prims, h: 0.0115, weights: bodyWeights, colorSharpness: 0.0016, weightBlend: 0.012, cover: ["body", "hair", "bangs"], coverStrength: 1 };
}

/** 옷깃·리본: 작고 얇아서 따로 촘촘한 격자로 뽑는다 (몸통에 꽂혀 들어간 부분은 나중에 잘라 낸다) */
export function trimPart(): Part {
  const prims: Prim[] = [];
  // 둥근 옷깃: 앞 두 장 + 목 둘레
  for (const s of [-1, 1])
    prims.push(ellipsoid("collar", [s * 0.047, 0.434, 0.056], [0.058, 0.021, 0.047], { k: 0.008, rot: [-0.42, 0, s * 0.22] }));
  prims.push(torus("collar", [0, 0.442, -0.008], 0.064, 0.022, { k: 0.01, yScale: 0.62, zScale: 0.86 }));
  // 노란 리본: 매듭 + 고리 둘 + 꼬리 둘
  prims.push(ellipsoid("ribbon", [0, 0.421, 0.103], [0.017, 0.015, 0.013], { k: 0.004 }));
  for (const s of [-1, 1]) {
    prims.push(ellipsoid("ribbon", [s * 0.031, 0.425, 0.096], [0.031, 0.019, 0.014], { k: 0.005, rot: [0, -s * 0.25, s * 0.28] }));
    prims.push(lock("ribbon", [[s * 0.006, 0.413, 0.103], [s * 0.024, 0.37, 0.108]], [0.012, 0.0095], { k: 0.004, flat: 0.55, normal: [0, 0, 1] }));
  }
  return { name: "trim", prims, h: 0.0052, weights: () => ({ Chest: 1 }), colorSharpness: 0.0015, weightBlend: 0.01, cover: [], coverStrength: 0 };
}

// ------------------------------------------------------------------ 머리카락

export function hairPart(): Part {
  const prims: Prim[] = [];
  // 정수리: 두개골을 덮는 큰 덩어리
  prims.push({ ...ellipsoid("hair", [0, 0.722, -0.02], [0.28, 0.278, 0.256]), data: { weight: () => ({ Head: 1 }) } });

  // 뒷머리 7다발: 뒤(0°)에서 옆(±100°)까지. 옆으로 갈수록 바깥으로 부풀었다가 끝이 안으로 말린다.
  const angles = [0, 38, -38, 70, -70, 96, -96];
  for (const deg of angles) {
    const a = (deg * Math.PI) / 180;
    const dir: Vec3 = [Math.sin(a), 0, -Math.cos(a)];
    const sideness = Math.min(1, Math.abs(deg) / 90);
    // 옆 다발은 뒤로 물려 둔다 → 옆에서 봐도 얼굴 옆선과 눈이 머리카락에 가리지 않는다
    const at = (y: number, rad: number): Vec3 => [dir[0] * rad, y, dir[2] * rad - 0.02 - 0.065 * sideness * Math.min(1, (0.84 - y) / 0.2)];
    const pts: Vec3[] = [
      at(0.8, 0.13 + 0.07 * sideness),
      at(0.66, 0.245 + 0.075 * sideness),
      at(0.46, 0.255 + 0.09 * sideness),
      at(0.3, 0.255 + 0.097 * sideness),
      at(0.19, 0.2 + 0.082 * sideness),
    ];
    const radii = [0.11, 0.11, 0.105, 0.095, 0.05];
    const sideKey = deg > 15 ? "_L" : deg < -15 ? "_R" : "_C";
    const blendSide = Math.abs(deg) > 15 && Math.abs(deg) < 60; // 가운데와 옆 사이 다발은 둘에 나눠 건다
    prims.push(lock("hair", pts, radii, {
      k: 0.04, flat: 0.6, normal: dir,
      data: {
        weight: (_x: number, _y: number, _z: number, t: number): Weights => {
          const u1 = ss(0.12, 0.42, t), u2 = ss(0.46, 0.8, t);
          const toBody = 0.3 * u2; // 아랫부분은 등에 기대 있어 가슴을 조금 따라간다
          const bones: Weights = { Head: (1 - u1) * (1 - toBody), Chest: toBody };
          const put = (key: string, f: number) => {
            bones[`HairBack1${key}`] = (bones[`HairBack1${key}`] ?? 0) + f * u1 * (1 - u2) * (1 - toBody);
            bones[`HairBack2${key}`] = (bones[`HairBack2${key}`] ?? 0) + f * u1 * u2 * (1 - toBody);
          };
          if (blendSide) { put(sideKey, 0.6); put("_C", 0.4); } else put(sideKey, 1);
          return bones;
        },
      },
    }));
  }
  // 얼굴 창: 정수리·뒷머리에서 얼굴 앞을 파낸다
  prims.push(ellipsoid("hair", [0, 0.5, 0.245], [0.222, 0.248, 0.22], { op: "subtract", k: 0.02 }));

  // 옆머리: 관자놀이에서 볼 옆으로 내려와 끝이 안쪽으로 말린다
  for (const s of [-1, 1]) {
    const key = s > 0 ? "_L" : "_R";
    prims.push(lock("hair", [[s * 0.17, 0.81, 0.04], [s * 0.203, 0.66, 0.08], [s * 0.198, 0.52, 0.1], [s * 0.158, 0.435, 0.118]], [0.058, 0.05, 0.04, 0.016], {
      k: 0.022, flat: 0.55, normal: [s, 0, 0.35],
      data: { weight: (_x: number, _y: number, _z: number, t: number): Weights => { const u1 = ss(0.1, 0.45, t), u2 = ss(0.5, 0.88, t); return { Head: 1 - u1, [`HairSide1${key}`]: u1 * (1 - u2), [`HairSide2${key}`]: u1 * u2 }; } },
    }));
  }
  return { name: "hair", prims, h: 0.0175, weights: () => ({ Head: 1 }), colorSharpness: 0.003, weightBlend: 0.03, cover: ["hair", "bangs"], coverStrength: 0.38 };
}

/** 앞머리 5다발: 크고 둥근 덩어리. 이마 곡면을 따라 내려와 둥근 끝으로, 가운데 다발이 미간까지. */
export function bangsPart(): Part {
  const prims: Prim[] = [];
  const bangs: [number, number, string][] = [[-0.17, 0.622, "HairFront_R"], [-0.088, 0.602, "HairFront_R"], [0.0, 0.57, "HairFront_C"], [0.092, 0.604, "HairFront_L"], [0.172, 0.624, "HairFront_L"]];
  for (const [tx, ty, bone] of bangs) {
    const p = (x: number, y: number, off: number): Vec3 => [x, y, skullZ(x, y) + off];
    const pts = [p(tx * 0.3, 0.9, 0.036), p(tx * 0.7, 0.785, 0.04), p(tx * 0.93, 0.68, 0.036), p(tx, ty + 0.012, 0.03)];
    const n = skullNormal(tx * 0.8, 0.74);
    prims.push(lock("hair", pts, [0.06, 0.062, 0.05, 0.022], {
      k: 0.012, flat: 0.62, normal: n,
      data: { weight: (_x: number, _y: number, _z: number, t: number): Weights => { const u = ss(0.3, 0.9, t); return { Head: 1 - u, [bone]: u }; } },
    }));
  }
  return { name: "bangs", prims, h: 0.009, weights: () => ({ Head: 1 }), colorSharpness: 0.003, weightBlend: 0.02, cover: ["bangs"], coverStrength: 0.5 };
}

/** 파란 머리 리본(캐릭터 왼쪽 위): 머리 표면 접평면에 놓인 두 고리 + 매듭 */
export function bowPart(): Part {
  const prims: Prim[] = [];
  {
    // 정수리 표면 위 한 점(앞쪽 위)과 그 점의 노멀: 리본이 머리에 납작하게 붙는다
    const c: Vec3 = [0.183, 0.878, 0.122];
    const n: Vec3 = [0.66, 0.48, 0.53];
    const nl = Math.hypot(...n); const N: Vec3 = [n[0] / nl, n[1] / nl, n[2] / nl];
    // 접선: 화면 가로축(x)을 표면에 눌러 담는다 → 정면에서 양 고리가 좌우로 펼쳐진다 (오른쪽이 살짝 내려감)
    const xn = N[0];
    let T: Vec3 = [1 - xn * N[0], -xn * N[1], -xn * N[2]];
    const tl = Math.hypot(...T); T = [T[0] / tl, T[1] / tl, T[2] / tl];
    const B = cross(N, T);
    const head = { weight: () => ({ Head: 1 }) };
    prims.push({ ...ellipsoid("bow", c, [0.02, 0.022, 0.018], { k: 0.006, axes: [T, B, N] }), data: head });
    for (const s of [-1, 1]) {
      const lc: Vec3 = [c[0] + T[0] * s * 0.05 - N[0] * 0.004, c[1] + T[1] * s * 0.05 - N[1] * 0.004, c[2] + T[2] * s * 0.05 - N[2] * 0.004];
      const tilt = s * 0.25;
      const T2: Vec3 = [T[0] + B[0] * tilt, T[1] + B[1] * tilt, T[2] + B[2] * tilt];
      const B2 = cross(N, T2);
      prims.push({ ...ellipsoid("bow", lc, [0.052, 0.036, 0.02], { k: 0.008, axes: [T2, B2, N] }), data: head });
    }
  }
  return { name: "bow", prims, h: 0.0062, weights: () => ({ Head: 1 }), colorSharpness: 0.003, weightBlend: 0.02, cover: [], coverStrength: 0 };
}

export function chibiParts(): Part[] {
  return [bodyPart(), trimPart(), hairPart(), bangsPart(), bowPart()];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// ------------------------------------------------------------------ 얼굴 표정 (눈·입)

export const FACE = {
  eyeX: 0.11,
  eyeY: 0.58,
  mouthY: 0.514,
  blushX: 0.137,
  blushY: 0.528,
};
