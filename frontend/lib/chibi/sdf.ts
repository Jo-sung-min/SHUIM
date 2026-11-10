/**
 * 치비 캐릭터용 SDF(부호 거리장) 모델링 커널.
 *
 * 구체·원통을 겹쳐 놓는 대신, 부드러운 합집합(smooth union)으로 머리·목·몸통을 하나의 표면으로 녹여 낸 뒤
 * mesher.ts 의 surface nets 로 메시를 뽑는다. 빌드 때 한 번만 도는 코드라 three 의 Vector3 대신
 * 숫자 연산으로 써서 격자 수십만 점을 빠르게 평가한다.
 */

export type Vec3 = [number, number, number];

export type Op = "union" | "subtract";

export interface Prim {
  /** 색·재질 꼬리표 (palette 키) */
  tag: string;
  op: Op;
  /** 앞서 누적된 모양과 섞는 반경 (0 이면 각진 합집합) */
  k: number;
  /** 경계 구: 이 구에서 멀면 정확한 계산을 건너뛴다 */
  bc: Vec3;
  br: number;
  eval(x: number, y: number, z: number): number;
  /** 머리카락 덩어리처럼 축이 있는 모양은 뿌리(0)→끝(1) 매개변수를 준다 */
  along?(x: number, y: number, z: number): number;
  /** 뼈 가중치 계산에 쓰는 임의 데이터 */
  data?: Record<string, unknown>;
}

export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

/** 순서대로 합치고 빼서 거리값 하나를 낸다. 경계 구로 먼 프리미티브는 건너뛴다. */
export function evalPrims(prims: Prim[], x: number, y: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    const dx = x - p.bc[0], dy = y - p.bc[1], dz = z - p.bc[2];
    const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - p.br;
    if (p.op === "union") {
      if (lb > d + p.k) continue;
      d = smin(d, p.eval(x, y, z), p.k);
    } else {
      if (lb > Math.abs(d) + p.k) continue;
      d = smax(d, -p.eval(x, y, z), p.k);
    }
  }
  return d;
}

// ---------------------------------------------------------------- 기본 도형

interface Frame { m: number[] } // 3x3 행 우선: 행 = 로컬 축(월드 기준)

/** 오일러(XYZ, 라디안) → 로컬 축 행렬. 행 i 가 로컬 축 i 의 월드 방향이다. */
export function frame(rx = 0, ry = 0, rz = 0): Frame {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rx * Ry * Rz (three 의 'XYZ' 순서와 같다). 열이 로컬 축이므로 전치해 행으로 둔다.
  const r00 = cy * cz, r01 = -cy * sz, r02 = sy;
  const r10 = cx * sz + sx * sy * cz, r11 = cx * cz - sx * sy * sz, r12 = -sx * cy;
  const r20 = sx * sz - cx * sy * cz, r21 = sx * cz + cx * sy * sz, r22 = cx * cy;
  return { m: [r00, r10, r20, r01, r11, r21, r02, r12, r22] };
}

export function ellipsoid(tag: string, c: Vec3, r: Vec3, opts: { k?: number; op?: Op; rot?: Vec3; axes?: [Vec3, Vec3, Vec3] } = {}): Prim {
  const f = opts.axes ? opts.axes.flatMap(a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; })
    : opts.rot ? frame(...opts.rot).m : null;
  const [rx, ry, rz] = r;
  const minR = Math.min(rx, ry, rz);
  return {
    tag, op: opts.op ?? "union", k: opts.k ?? 0, bc: c, br: Math.max(rx, ry, rz),
    eval(x, y, z) {
      let px = x - c[0], py = y - c[1], pz = z - c[2];
      if (f) {
        const lx = f[0] * px + f[1] * py + f[2] * pz;
        const ly = f[3] * px + f[4] * py + f[5] * pz;
        const lz = f[6] * px + f[7] * py + f[8] * pz;
        px = lx; py = ly; pz = lz;
      }
      const ax = px / rx, ay = py / ry, az = pz / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      if (k0 < 1e-9) return -minR;
      const bx = px / (rx * rx), by = py / (ry * ry), bz = pz / (rz * rz);
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

function roundCone(px: number, py: number, pz: number, a: Vec3, b: Vec3, r1: number, r2: number) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

/**
 * 머리카락 덩어리·팔처럼 꺾인 축을 따라 굵기가 변하는 모양.
 * flat < 1 이면 normal 방향으로 납작해진다(머리카락 다발의 두께).
 */
export function lock(tag: string, pts: Vec3[], radii: number[], opts: { k?: number; op?: Op; flat?: number; normal?: Vec3; data?: Record<string, unknown> } = {}): Prim {
  const flat = opts.flat ?? 1;
  let n: Vec3 = opts.normal ?? [0, 0, 1];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const s = 1 / flat - 1;
  const warp = (p: Vec3): Vec3 => {
    const d = (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) * s;
    return [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
  };
  const wp = pts.map(warp);
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    segLen.push(l);
    total += l;
  }
  // 경계 구: 점들의 중심 + 가장 먼 점까지 + 최대 반경
  const bc: Vec3 = [0, 0, 0];
  for (const p of pts) { bc[0] += p[0] / pts.length; bc[1] += p[1] / pts.length; bc[2] += p[2] / pts.length; }
  let br = 0;
  pts.forEach((p, i) => { br = Math.max(br, Math.hypot(p[0] - bc[0], p[1] - bc[1], p[2] - bc[2]) + radii[i]); });
  const scale = Math.min(1, flat);
  return {
    tag, op: opts.op ?? "union", k: opts.k ?? 0, bc, br, data: { ...opts.data, pts, radii },
    eval(x, y, z) {
      const d0 = (x * n[0] + y * n[1] + z * n[2]) * s;
      const px = x + n[0] * d0, py = y + n[1] * d0, pz = z + n[2] * d0;
      let d = Infinity;
      for (let i = 0; i < wp.length - 1; i++) d = Math.min(d, roundCone(px, py, pz, wp[i], wp[i + 1], radii[i], radii[i + 1]));
      return d * scale;
    },
    along(x, y, z) {
      let best = Infinity, at = 0, acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
        const l2 = bx * bx + by * by + bz * bz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / l2));
        const qx = a[0] + bx * t - x, qy = a[1] + by * t - y, qz = a[2] + bz * t - z;
        const dd = qx * qx + qy * qy + qz * qz;
        if (dd < best) { best = dd; at = (acc + segLen[i] * t) / total; }
        acc += segLen[i];
      }
      return at;
    },
  };
}

/** 위아래가 잘린 원뿔대(가장자리 둥글림). 치맛자락처럼 바닥이 평평한 A라인에 쓴다. zScale 로 앞뒤를 납작하게. */
export function roundedFrustum(tag: string, bottomY: number, topY: number, rBottom: number, rTop: number, round: number, opts: { k?: number; op?: Op; zScale?: number; zOffset?: number } = {}): Prim {
  const h = (topY - bottomY) / 2 - round;
  const cy = (topY + bottomY) / 2;
  const r1 = rBottom - round, r2 = rTop - round;
  const zs = opts.zScale ?? 1, zo = opts.zOffset ?? 0;
  const k1x = r2, k1y = h, k2x = r2 - r1, k2y = 2 * h;
  const k2d = k2x * k2x + k2y * k2y;
  return {
    tag, op: opts.op ?? "union", k: opts.k ?? 0, bc: [0, cy, zo], br: Math.hypot(Math.max(rBottom, rTop), (topY - bottomY) / 2),
    eval(x, y, z) {
      const lz = (z - zo) / zs;
      const qx = Math.sqrt(x * x + lz * lz), qy = y - cy;
      const cax = qx - (qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
      const t = Math.max(0, Math.min(1, ((k1x - qx) * k2x + (k1y - qy) * k2y) / k2d));
      const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
      const sgn = cbx < 0 && cay < 0 ? -1 : 1;
      const d = sgn * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
      return (d - round) * Math.min(1, zs);
    },
  };
}

/** 납작한 고리(옷깃 둘레). */
export function torus(tag: string, c: Vec3, R: number, r: number, opts: { k?: number; op?: Op; yScale?: number; zScale?: number } = {}): Prim {
  const ys = opts.yScale ?? 1, zs = opts.zScale ?? 1;
  return {
    tag, op: opts.op ?? "union", k: opts.k ?? 0, bc: c, br: R + r,
    eval(x, y, z) {
      const px = x - c[0], py = (y - c[1]) / ys, pz = (z - c[2]) / zs;
      const q = Math.sqrt(px * px + pz * pz) - R;
      return (Math.sqrt(q * q + py * py) - r) * Math.min(1, ys, zs);
    },
  };
}

/** 평면 반공간(normal 쪽이 바깥). 신발 밑창을 평평하게 자를 때 subtract 로 쓴다. */
export function halfSpace(tag: string, point: Vec3, normal: Vec3, opts: { k?: number; op?: Op } = {}): Prim {
  const l = Math.hypot(...normal);
  const n: Vec3 = [normal[0] / l, normal[1] / l, normal[2] / l];
  return {
    tag, op: opts.op ?? "subtract", k: opts.k ?? 0, bc: point, br: 1e6,
    eval(x, y, z) { return (x - point[0]) * n[0] + (y - point[1]) * n[1] + (z - point[2]) * n[2]; },
  };
}
