/**
 * 대나무숲 둘레길의 배치 수학. three.js 없이 순수 함수만 두어 노드 테스트와 서버(BeachRoom.PAVILIONS)와 같은 식을 쓴다.
 *  - 길: 입구 줄기 + 닫힌 고리(Catmull-Rom) + 정자마다 짧은 샛길. 걷는 범위는 길 통로와 정자 마당으로 제한한다.
 *  - 정자: 중심·입구 방향(정수 축)으로 좌석·바닥·천장·기둥을 계산한다.
 *  - 등불·울타리·대나무 자리: 길에서 떨어진 거리로 정한다 (결정적 난수).
 */
export const BAMBOO_BOUNDS = { minX: -22, maxX: 22, minZ: -4, maxZ: 55 } as const;
/** 눈에 보이는 흙길 폭 */
export const TRAIL_WIDTH = 2.6;
/** 중심선에서 걸을 수 있는 반폭 (울타리 바로 안쪽) */
export const TRAIL_WALK_HALF = 1.5;
export const FENCE_OFFSET = 1.62;
export const LANTERN_OFFSET = 2.05;
export const LANTERN_SPACING = 3.9;
export const PAVILION_HALF = 2.5;
export const PAVILION_FLOOR_Y = 0.55;
export const PAVILION_YARD_HALF = 3.4;
export const PAVILION_EAVE = 1.15;
export const PAVILION_POST_HEIGHT = 2.75;
export const PAVILION_SEAT_CAPACITY = 6;
export const PAVILION_REACH = 2.4;
export const PAVILION_STEP_HALF_WIDTH = 0.75;
export const PAVILION_STEP_LENGTH = 1.2;
/** Stalks start beyond the fence, the lanterns and the dry brush. */
const STALK_CLEARANCE = 2.6;

export interface BambooPavilion {
  id: string; spotId: string; name: string;
  x: number; z: number;
  /** 섬돌(입구)이 향하는 단위 축. 오른쪽 축은 (-fz, fx) */
  fx: number; fz: number;
  yaw: number;
}

const pavilion = (id: string, name: string, x: number, z: number, fx: number, fz: number): BambooPavilion =>
  ({ id, spotId: `pavilion-${id}`, name, x, z, fx, fz, yaw: Math.atan2(0 - fx, 0 - fz) });

/** Mirrored by BeachRoom.PAVILIONS on the server. */
export const BAMBOO_PAVILIONS: readonly BambooPavilion[] = [
  pavilion("wind", "바람정", -18.2, 26, 1, 0),
  pavilion("moon", "달빛정", 1, 44.5, 0, 1),
  pavilion("pine", "솔숲정", 10.5, 30, 1, 0),
  pavilion("step", "첫걸음정", 14, 8, -1, 0),
];

export function pavilionWorld(p: BambooPavilion, lx: number, lz: number): { x: number; z: number } {
  const rx = -p.fz, rz = p.fx;
  return { x: p.x + lx * rx + lz * p.fx, z: p.z + lx * rz + lz * p.fz };
}

export function pavilionLocal(p: BambooPavilion, x: number, z: number): { lx: number; lz: number } {
  const rx = -p.fz, rz = p.fx, dx = x - p.x, dz = z - p.z;
  return { lx: dx * rx + dz * rz, lz: dx * p.fx + dz * p.fz };
}

export interface PavilionSeat {
  id: string; pavilionId: string; spotId: string; name: string; slot: number;
  x: number; z: number; yaw: number; avatarY: number; incline: number;
}

/** 로컬 좌석 (lx, lz, 바라보는 lx, 바라보는 lz): 섬돌 양옆 둘, 열린 양쪽 변에 둘씩. 서버와 같은 표. */
const SEAT_LOCAL: readonly [number, number, number, number][] = [
  [-1.7, 2.42, 0, 1], [1.7, 2.42, 0, 1],
  [-2.42, -0.9, -1, 0], [-2.42, 0.9, -1, 0],
  [2.42, -0.9, 1, 0], [2.42, 0.9, 1, 0],
];

export const BAMBOO_PAVILION_SEATS: readonly PavilionSeat[] = BAMBOO_PAVILIONS.flatMap((p) => SEAT_LOCAL.map(([lx, lz, flx, flz], slot) => {
  const rx = -p.fz, rz = p.fx;
  const { x, z } = pavilionWorld(p, lx, lz);
  const fx = flx * rx + flz * p.fx, fz = flx * rz + flz * p.fz;
  return { id: `${p.spotId}-seat-${slot}`, pavilionId: p.id, spotId: p.spotId, name: p.name, slot, x, z,
    yaw: Math.atan2(0 - fx, 0 - fz), avatarY: PAVILION_FLOOR_Y, incline: 0 };
}));

export function bambooPavilionForSpot(spotId: string | null | undefined): BambooPavilion | null {
  return BAMBOO_PAVILIONS.find((p) => p.spotId === spotId) ?? null;
}

export function pavilionSeat(spotId: string, slot: number): PavilionSeat | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PAVILION_SEAT_CAPACITY) return null;
  return BAMBOO_PAVILION_SEATS.find((seat) => seat.spotId === spotId && seat.slot === slot) ?? null;
}

/** Ignore invalid or stale claims instead of placing an avatar at an arbitrary coordinate. */
export function claimedPavilionSeat(state: { pose?: string; spotId?: string | null; slot?: number | null }): PavilionSeat | null {
  if (state.pose !== "sitting" || typeof state.spotId !== "string" || typeof state.slot !== "number") return null;
  return pavilionSeat(state.spotId, state.slot);
}

/** The pavilion with a seat within reach of (x, z); the server applies the same reach to a claim. */
export function nearbyBambooPavilion(x: number, z: number): BambooPavilion | null {
  let best: BambooPavilion | null = null, bestDistance = PAVILION_REACH;
  for (const seat of BAMBOO_PAVILION_SEATS) {
    const distance = Math.hypot(x - seat.x, z - seat.z);
    if (distance <= bestDistance) { bestDistance = distance; best = bambooPavilionForSpot(seat.spotId); }
  }
  return best;
}

/** 마루 위와 섬돌(입구 쪽 경사)만 높고, 나머지는 땅. */
export function bambooFloorHeight(x: number, z: number): number {
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    if (Math.abs(lx) <= PAVILION_HALF && Math.abs(lz) <= PAVILION_HALF) return PAVILION_FLOOR_Y;
    if (Math.abs(lx) <= PAVILION_STEP_HALF_WIDTH && lz > PAVILION_HALF && lz <= PAVILION_HALF + PAVILION_STEP_LENGTH) {
      return PAVILION_FLOOR_Y * (1 - (lz - PAVILION_HALF) / PAVILION_STEP_LENGTH);
    }
  }
  return 0;
}

/** Conservative underside of the roof for the follow camera: low at the eaves, rising toward the centre. */
export function bambooCeilingHeight(x: number, z: number): number | null {
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    const reach = Math.max(Math.abs(lx), Math.abs(lz));
    if (reach > PAVILION_HALF + PAVILION_EAVE) continue;
    const eave = PAVILION_FLOOR_Y + PAVILION_POST_HEIGHT - 0.1;
    return reach <= PAVILION_HALF ? eave + (1 - reach / PAVILION_HALF) * 1.2 : eave;
  }
  return null;
}

export interface TrailObstacle { x: number; z: number; r: number }
export interface TrailWall { minX: number; maxX: number; minZ: number; maxZ: number }

const POST_LOCAL: readonly [number, number][] = [[-2.15, -2.15], [2.15, -2.15], [-2.15, 2.15], [2.15, 2.15], [-2.15, 0], [2.15, 0]];
export const BAMBOO_PAVILION_POSTS: readonly { pavilionId: string; x: number; z: number }[] = BAMBOO_PAVILIONS.flatMap((p) =>
  POST_LOCAL.map(([lx, lz]) => ({ pavilionId: p.id, ...pavilionWorld(p, lx, lz) })));
export const BAMBOO_PAVILION_OBSTACLES: readonly TrailObstacle[] = BAMBOO_PAVILION_POSTS.map((post) => ({ x: post.x, z: post.z, r: 0.16 }));

/** Only the back railing stops walking; the three open edges are where people sit. Integer axes keep these boxes axis-aligned. */
export const BAMBOO_PAVILION_COLLIDERS: readonly TrailWall[] = BAMBOO_PAVILIONS.map((p) => {
  const a = pavilionWorld(p, -2.5, -2.62), b = pavilionWorld(p, 2.5, -2.38);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
});

/* ---------------- 길 ---------------- */
export type TrailPoint = [number, number];
export interface TrailPolyline { id: string; points: TrailPoint[]; closed: boolean }

/** 입구(0, 7)에서 시계 방향으로 한 바퀴 (남쪽 입구 → 서 → 북 → 동 → 입구). */
export const TRAIL_LOOP_CONTROL: readonly TrailPoint[] = [
  [0, 7], [-6, 10], [-11, 16.5], [-13, 26], [-10.5, 37], [-5, 46], [2, 51], [9.5, 48], [14.5, 39], [16, 28], [13.5, 17], [7.5, 10.5],
];
export const TRAIL_ENTRANCE: readonly TrailPoint[] = [[0, -2.5], [0, 7]];

/** Uniform Catmull-Rom through every control point; closed loops wrap, open paths clamp their end tangents. */
export function sampleCatmullRom(control: readonly TrailPoint[], closed: boolean, perSegment = 8): TrailPoint[] {
  const n = control.length, out: TrailPoint[] = [];
  const at = (i: number) => control[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push([...control[n - 1]]);
  return out;
}

export interface TrailHit { x: number; z: number; distance: number; polyline: string; tx: number; tz: number }

function nearestOnPolyline(line: TrailPolyline, x: number, z: number): TrailHit {
  const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
  let best: TrailHit = { x: pts[0][0], z: pts[0][1], distance: Infinity, polyline: line.id, tx: 1, tz: 0 };
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSq = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq));
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      const length = Math.sqrt(lengthSq);
      best = { x: px, z: pz, distance, polyline: line.id, tx: dx / length, tz: dz / length };
    }
  }
  return best;
}

const LOOP: TrailPolyline = { id: "loop", points: sampleCatmullRom(TRAIL_LOOP_CONTROL, true, 8), closed: true };
const ENTRANCE: TrailPolyline = { id: "entrance", points: TRAIL_ENTRANCE.map((p) => [...p] as TrailPoint), closed: false };
const SPURS: TrailPolyline[] = BAMBOO_PAVILIONS.map((p) => {
  const front = pavilionWorld(p, 0, PAVILION_HALF + PAVILION_STEP_LENGTH + 0.9);
  const start = nearestOnPolyline(LOOP, front.x, front.z);
  return { id: `spur-${p.id}`, points: [[start.x, start.z], [front.x, front.z]], closed: false };
});
export const TRAIL_POLYLINES: readonly TrailPolyline[] = [LOOP, ENTRANCE, ...SPURS];

export function nearestOnTrail(x: number, z: number, lines: readonly TrailPolyline[] = TRAIL_POLYLINES): TrailHit {
  let best: TrailHit | null = null;
  for (const line of lines) {
    const hit = nearestOnPolyline(line, x, z);
    if (!best || hit.distance < best.distance) best = hit;
  }
  return best!;
}

function insideYard(x: number, z: number, margin = 0): BambooPavilion | null {
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    if (Math.abs(lx) <= PAVILION_YARD_HALF + margin + 1e-6 && Math.abs(lz) <= PAVILION_YARD_HALF + margin + 1e-6) return p;
  }
  return null;
}

export function onTrail(x: number, z: number): boolean {
  return nearestOnTrail(x, z).distance <= TRAIL_WALK_HALF || insideYard(x, z) !== null;
}

/** Keep the walker on the path or a pavilion yard, sliding to the nearest allowed point instead of stopping. */
export function resolveTrail(x: number, z: number): [number, number] {
  const near = nearestOnTrail(x, z);
  if (near.distance <= TRAIL_WALK_HALF || insideYard(x, z)) return [x, z];
  // A hair inside the corridor, so the next frame's nearest-segment search cannot see it as outside again.
  const scale = (TRAIL_WALK_HALF - 0.01) / (near.distance || 1);
  let best: [number, number] = [near.x + (x - near.x) * scale, near.z + (z - near.z) * scale];
  let bestDistance = Math.hypot(x - best[0], z - best[1]);
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    const clamp = (v: number) => Math.max(-PAVILION_YARD_HALF + 0.005, Math.min(PAVILION_YARD_HALF - 0.005, v));
    const w = pavilionWorld(p, clamp(lx), clamp(lz));
    const distance = Math.hypot(x - w.x, z - w.z);
    if (distance < bestDistance) { best = [w.x, w.z]; bestDistance = distance; }
  }
  return best;
}

/* ---------------- 등불 · 울타리 · 대나무 ---------------- */
export interface TrailLantern { x: number; z: number; y: number; yaw: number; kind: "stone" | "paper"; pavilionId?: string }

function clearOfOtherLines(x: number, z: number, own: string, margin: number) {
  for (const line of TRAIL_POLYLINES) {
    if (line.id === own) continue;
    if (nearestOnPolyline(line, x, z).distance <= TRAIL_WALK_HALF + margin) return false;
  }
  return true;
}

/** 길을 따라 4.5 m마다 좌우로 번갈아 선 석등, 정자 처마 밑의 종이 등롱. */
export const BAMBOO_LANTERNS: readonly TrailLantern[] = (() => {
  const out: TrailLantern[] = [];
  for (const line of [LOOP, ENTRANCE]) {
    const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
    let travelled = 0, nextAt = LANTERN_SPACING / 2, side = 1;
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1e-9;
      while (nextAt <= travelled + length) {
        const t = (nextAt - travelled) / length;
        const px = a[0] + dx * t, pz = a[1] + dz * t;
        const nx = -dz / length, nz = dx / length;
        const x = px + nx * side * LANTERN_OFFSET, z = pz + nz * side * LANTERN_OFFSET;
        if (clearOfOtherLines(x, z, line.id, 0.15) && !insideYard(x, z, 0.6)
          && x > BAMBOO_BOUNDS.minX - 1 && x < BAMBOO_BOUNDS.maxX + 1 && z > BAMBOO_BOUNDS.minZ - 1 && z < BAMBOO_BOUNDS.maxZ + 1) {
          out.push({ x, z, y: 0, yaw: Math.atan2(0 - (px - x), 0 - (pz - z)), kind: "stone" });
        }
        side = -side;
        nextAt += LANTERN_SPACING;
      }
      travelled += length;
    }
  }
  for (const p of BAMBOO_PAVILIONS) {
    for (const lx of [-1.9, 1.9]) {
      const w = pavilionWorld(p, lx, 2.3);
      out.push({ x: w.x, z: w.z, y: PAVILION_FLOOR_Y + PAVILION_POST_HEIGHT - 0.5, yaw: p.yaw, kind: "paper", pavilionId: p.id });
    }
  }
  return out;
})();

export interface FenceRun { ax: number; az: number; bx: number; bz: number; side: number }

/** Two-rail bamboo fences line both sides of the loop and entrance, opening where a spur or the entrance joins. */
export const BAMBOO_FENCES: readonly FenceRun[] = (() => {
  const out: FenceRun[] = [];
  for (const line of [LOOP, ENTRANCE]) {
    const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
    const normal = (i: number): [number, number] => {
      const a = pts[((i % pts.length) + pts.length) % pts.length];
      const b = pts[((i + 1) % pts.length + pts.length) % pts.length];
      const prev = pts[((i - 1) % pts.length + pts.length) % pts.length];
      const dx = (line.closed ? b[0] - prev[0] : i === 0 ? b[0] - a[0] : i >= pts.length - 1 ? a[0] - prev[0] : b[0] - prev[0]);
      const dz = (line.closed ? b[1] - prev[1] : i === 0 ? b[1] - a[1] : i >= pts.length - 1 ? a[1] - prev[1] : b[1] - prev[1]);
      const length = Math.hypot(dx, dz) || 1e-9;
      return [-dz / length, dx / length];
    };
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], na = normal(i), nb = normal(i + 1);
      for (const side of [-1, 1]) {
        const ax = a[0] + na[0] * side * FENCE_OFFSET, az = a[1] + na[1] * side * FENCE_OFFSET;
        const bx = b[0] + nb[0] * side * FENCE_OFFSET, bz = b[1] + nb[1] * side * FENCE_OFFSET;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!clearOfOtherLines(mx, mz, line.id, 0.25) || insideYard(mx, mz, -0.4)) continue;
        if (mx < BAMBOO_BOUNDS.minX - 1 || mx > BAMBOO_BOUNDS.maxX + 1 || mz < BAMBOO_BOUNDS.minZ - 1 || mz > BAMBOO_BOUNDS.maxZ + 1) continue;
        out.push({ ax, az, bx, bz, side });
      }
    }
  }
  return out;
})();

export function seededRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}

export interface StalkSite { x: number; z: number; height: number; radius: number; phase: number; tint: number; leafAt: number; lean: number }
/** The outer band is sparse and mostly fogged, but reaches far enough that no edge of the forest is ever in view. */
export const STALK_FIELD = { inner: { minX: -23, maxX: 23, minZ: -5, maxZ: 56 }, outer: { minX: -50, maxX: 50, minZ: -32, maxZ: 86 } } as const;

/** Jittered grid: dense inside the walkable bounds, sparser in the fogged outer band; never on the path or a yard. */
export function bambooStalkSites(seed = 7): StalkSite[] {
  const rand = seededRandom(seed), out: StalkSite[] = [];
  const { inner, outer } = STALK_FIELD;
  const place = (x: number, z: number) => {
    if (nearestOnTrail(x, z).distance < STALK_CLEARANCE || insideYard(x, z, 1.2)) return;
    const u = rand();
    out.push({ x, z, height: 8.5 + rand() * 4.5, radius: 0.055 + rand() * 0.045, phase: rand() * Math.PI * 2,
      tint: rand(), leafAt: 0.74 + rand() * 0.2, lean: (u - 0.5) * 0.08 });
  };
  for (let z = inner.minZ; z <= inner.maxZ; z += 1.05) for (let x = inner.minX; x <= inner.maxX; x += 1.05) {
    place(x + (rand() - 0.5) * 0.9, z + (rand() - 0.5) * 0.9);
  }
  for (let z = outer.minZ; z <= outer.maxZ; z += 2.5) for (let x = outer.minX; x <= outer.maxX; x += 2.5) {
    const jx = x + (rand() - 0.5) * 1.9, jz = z + (rand() - 0.5) * 1.9;
    if (jx > inner.minX && jx < inner.maxX && jz > inner.minZ && jz < inner.maxZ) continue;
    place(jx, jz);
  }
  return out;
}

export interface BrushSite { x: number; z: number; yaw: number; size: number; seed: number }

/** Dry bamboo brush just outside each fence, as in the reference path photograph. */
export function bambooBrushSites(seed = 11): BrushSite[] {
  const rand = seededRandom(seed), out: BrushSite[] = [];
  for (const run of BAMBOO_FENCES) {
    const dx = run.bx - run.ax, dz = run.bz - run.az, length = Math.hypot(dx, dz) || 1e-9;
    const nx = -dz / length * run.side, nz = dx / length * run.side;
    for (let s = 0.3; s < length; s += 0.95) {
      const t = s / length, spread = 0.35 + rand() * 0.45;
      out.push({ x: run.ax + dx * t + nx * spread, z: run.az + dz * t + nz * spread, yaw: rand() * Math.PI, size: 0.8 + rand() * 0.5, seed: rand() });
    }
  }
  return out;
}

export function trailLength(line: TrailPolyline = LOOP): number {
  const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}
