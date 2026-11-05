/**
 * 대나무숲 둘레길의 배치 수학. three.js 없이 순수 함수만 두어 노드 테스트와 서버(BeachRoom.PAVILIONS)와 같은 식을 쓴다.
 *  - 산: 입구(남쪽, 평지)에서 북쪽 정상(약 20 m)까지 오르는 능선. 길은 지형을 따라 오르되 길 폭만큼은 옆으로 기울지 않는 계단식.
 *  - 길: 입구 줄기 + 산을 한 바퀴 도는 닫힌 고리(Catmull-Rom, 약 230 m) + 정자마다 짧은 샛길. 걷는 범위는 길 통로와 마당으로 제한한다.
 *  - 공터: 서쪽 중턱의 풀밭 공터와, 대나무가 없는 정상 공터(전망대). 둘 다 평평하게 깎인 터.
 *  - 정자·전망대: 중심·방향(정수 축)으로 좌석·바닥·천장·기둥을 계산한다. 좌석 표는 서버와 같다.
 */
export const BAMBOO_BOUNDS = { minX: -44, maxX: 44, minZ: -4, maxZ: 115 } as const;
/** 눈에 보이는 흙길 폭 */
export const TRAIL_WIDTH = 2.6;
/** 중심선에서 걸을 수 있는 반폭 (울타리 바로 안쪽) */
export const TRAIL_WALK_HALF = 1.5;
export const FENCE_OFFSET = 1.62;
export const LANTERN_OFFSET = 2.05;
export const LANTERN_SPACING = 3.9;
export const PAVILION_HALF = 2.5;
export const PAVILION_RISE = 0.55;
export const PAVILION_YARD_HALF = 3.4;
export const PAVILION_EAVE = 1.15;
export const PAVILION_POST_HEIGHT = 2.75;
export const PAVILION_SEAT_CAPACITY = 6;
export const PAVILION_REACH = 2.4;
export const PAVILION_STEP_HALF_WIDTH = 0.75;
export const PAVILION_STEP_LENGTH = 1.2;
/** 전망대: 넓은 나무 데크, 난간 앞 긴 의자에 앉아 도시를 바라본다 */
export const DECK_HALF_X = 4.5;
export const DECK_HALF_Z = 2.7;
export const DECK_RISE = 0.6;
export const DECK_BENCH_HEIGHT = 0.45;
export const DECK_YARD = { x: 5.6, z: 3.8 } as const;
// The left-hand lamp sits behind the bench so the board is visible between the rails.
export const DECK_LANTERN_SITES = [[-4.3, -2.5], [4.3, 2.5]] as const;
const DECK_YARD_X = DECK_YARD.x, DECK_YARD_Z = DECK_YARD.z;
/** Stalks start beyond the fence, the lanterns and the dry brush. */
const STALK_CLEARANCE = 2.6;
const TERRACE_INNER = 1.4, TERRACE_OUTER = 3.2;

export const MOUNTAIN = { peak: 20, footZ: 8, topZ: 94 } as const;
/** 정상 공터: 대나무가 없고 하늘과 도시가 트인 곳 */
export const SUMMIT = { x: 0, z: 93, radius: 17, feather: 5 } as const;
/** 중턱 풀밭 공터 */
export const MEADOW = { x: -25, z: 50, radius: 9, feather: 3 } as const;
/** 정상 너머 북쪽 비탈: 대나무 없는 민둥 초지라 도시가 트여 보인다 (바닥·캐노피 셰이더의 세 번째 "공터") */
export const NORTH_FACE = { x: 0, z: 165, radius: 78, feather: 18 } as const;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** 산의 밑바탕 높이: 남쪽 기슭 0 m 에서 북쪽 정상 20 m, 가운데 능선이 높고 양옆은 낮다. 정상 너머는 도시 쪽으로 내려간다. */
export function mountainHeight(x: number, z: number): number {
  const climb = smooth((z - MOUNTAIN.footZ) / (MOUNTAIN.topZ - MOUNTAIN.footZ));
  const ridge = 1 - 0.3 * Math.min(1, (x / 44) ** 2);
  const beyond = z > MOUNTAIN.topZ + 14 ? smooth((z - MOUNTAIN.topZ - 14) / 40) : 0;
  const bumps = 0.45 * Math.sin(x * 0.37 + 1.3) * Math.sin(z * 0.29) + 0.25 * Math.sin(x * 0.9 + 2) * Math.sin(z * 0.7 + 0.6);
  return MOUNTAIN.peak * climb * ridge * (1 - beyond * 0.9) + bumps * (1 - beyond);
}

export type PavilionKind = "pavilion" | "deck";
export interface BambooPavilion {
  id: string; spotId: string; name: string; kind: PavilionKind;
  x: number; z: number;
  /** 정자는 섬돌(입구)이, 전망대는 전망(난간)이 향하는 단위 축. 오른쪽 축은 (-fz, fx) */
  fx: number; fz: number;
  yaw: number;
  /** 땅(평평하게 깎은 터) 높이와 마루 높이 (절대값) */
  groundY: number; floorY: number;
}

const pavilion = (id: string, name: string, kind: PavilionKind, x: number, z: number, fx: number, fz: number): BambooPavilion => {
  // The deck shares the summit plateau's level so the whole clearing stays one flat floor.
  const groundY = kind === "deck" ? mountainHeight(SUMMIT.x, SUMMIT.z) : mountainHeight(x, z);
  return { id, spotId: `pavilion-${id}`, name, kind, x, z, fx, fz, yaw: Math.atan2(0 - fx, 0 - fz), groundY,
    floorY: groundY + (kind === "deck" ? DECK_RISE : PAVILION_RISE) };
};

/** Mirrored by BeachRoom.PAVILIONS on the server (centre, axis and seat tables). */
export const BAMBOO_PAVILIONS: readonly BambooPavilion[] = [
  pavilion("step", "첫걸음정", "pavilion", 14, 10, -1, 0),
  pavilion("wind", "바람정", "pavilion", -33, 50, 1, 0),
  pavilion("pine", "솔숲정", "pavilion", 31, 58, -1, 0),
  pavilion("moon", "달빛정", "pavilion", -18, 80, 1, 0),
  pavilion("summit", "하늘전망대", "deck", 0, 100, 0, 1),
];

export function pavilionHalf(p: BambooPavilion): { x: number; z: number } {
  return p.kind === "deck" ? { x: DECK_HALF_X, z: DECK_HALF_Z } : { x: PAVILION_HALF, z: PAVILION_HALF };
}
/** 섬돌이 놓인 쪽: 정자는 앞(+lz), 전망대는 전망 반대편(-lz) */
export function pavilionStepSign(p: BambooPavilion): number { return p.kind === "deck" ? -1 : 1; }

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
  x: number; z: number; yaw: number;
  /** 엉덩이 높이(절대값)와, 접힌 다리가 닿는 바닥 높이 */
  avatarY: number; baseY: number; incline: number;
}

/** 로컬 좌석 (lx, lz, 바라보는 lx, 바라보는 lz): 섬돌 양옆 둘, 열린 양쪽 변에 둘씩. 서버와 같은 표. */
const SEAT_LOCAL: readonly [number, number, number, number][] = [
  [-1.7, 2.42, 0, 1], [1.7, 2.42, 0, 1],
  [-2.42, -0.9, -1, 0], [-2.42, 0.9, -1, 0],
  [2.42, -0.9, 1, 0], [2.42, 0.9, 1, 0],
];
/** 전망대: 난간 앞 긴 의자에 여섯이 나란히, 모두 도시 쪽을 본다. */
const DECK_SEAT_LOCAL: readonly [number, number, number, number][] = [
  [-3.75, 2.2, 0, 1], [-2.25, 2.2, 0, 1], [-0.75, 2.2, 0, 1],
  [0.75, 2.2, 0, 1], [2.25, 2.2, 0, 1], [3.75, 2.2, 0, 1],
];

export const BAMBOO_PAVILION_SEATS: readonly PavilionSeat[] = BAMBOO_PAVILIONS.flatMap((p) =>
  (p.kind === "deck" ? DECK_SEAT_LOCAL : SEAT_LOCAL).map(([lx, lz, flx, flz], slot) => {
    const rx = -p.fz, rz = p.fx;
    const { x, z } = pavilionWorld(p, lx, lz);
    const fx = flx * rx + flz * p.fx, fz = flx * rz + flz * p.fz;
    const deck = p.kind === "deck";
    return { id: `${p.spotId}-seat-${slot}`, pavilionId: p.id, spotId: p.spotId, name: p.name, slot, x, z,
      yaw: Math.atan2(0 - fx, 0 - fz), avatarY: deck ? p.floorY + DECK_BENCH_HEIGHT : p.floorY,
      baseY: deck ? p.floorY : p.groundY, incline: 0 };
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

/* ---------------- 길 ---------------- */
export type TrailPoint = [number, number];
export interface TrailPolyline { id: string; points: TrailPoint[]; closed: boolean }

/** 입구(0, 7)에서 서쪽 비탈로 올라 정상(0, 90)을 지나 동쪽 비탈로 내려오는 한 바퀴. */
export const TRAIL_LOOP_CONTROL: readonly TrailPoint[] = [
  [0, 7], [-9, 15], [-19, 26], [-26, 40], [-25, 56], [-19, 70], [-10, 83], [0, 90], [10, 83], [19, 70], [25, 56], [26, 40], [19, 26], [9, 15],
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
  const half = pavilionHalf(p);
  const front = pavilionWorld(p, 0, pavilionStepSign(p) * (half.z + PAVILION_STEP_LENGTH + 0.9));
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

/* ---------------- 지형 ---------------- */
interface Plateau { x: number; z: number; radius: number; feather: number; height: number }
/** 공터와 정자 터는 평평하게 깎는다. 높이는 그 중심의 산 높이. */
const PLATEAUS: readonly Plateau[] = [
  { ...SUMMIT, height: mountainHeight(SUMMIT.x, SUMMIT.z) },
  { ...MEADOW, height: mountainHeight(MEADOW.x, MEADOW.z) },
  ...BAMBOO_PAVILIONS.map((p) => ({ x: p.x, z: p.z, radius: p.kind === "deck" ? 7.4 : 5.4, feather: 1.6, height: p.groundY })),
];
export const SUMMIT_HEIGHT = PLATEAUS[0].height;

/** 걷는 땅의 높이: 산 밑바탕 + 길 폭만큼의 계단식 터 + 평평한 공터·정자 터. */
export function groundHeight(x: number, z: number): number {
  let h = mountainHeight(x, z);
  const near = nearestOnTrail(x, z);
  if (near.distance < TERRACE_OUTER) {
    const terrace = mountainHeight(near.x, near.z);
    h += (terrace - h) * (1 - smooth((near.distance - TERRACE_INNER) / (TERRACE_OUTER - TERRACE_INNER)));
  }
  for (const pad of PLATEAUS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d >= pad.radius) continue;
    const w = 1 - smooth((d - (pad.radius - pad.feather)) / pad.feather);
    h += (pad.height - h) * w;
  }
  return h;
}

/** 마루 위와 섬돌(경사)만 마루 높이, 나머지는 땅. */
export function bambooFloorHeight(x: number, z: number): number {
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z), half = pavilionHalf(p);
    if (Math.abs(lx) <= half.x && Math.abs(lz) <= half.z) return p.floorY;
    const along = pavilionStepSign(p) * lz;
    if (Math.abs(lx) <= PAVILION_STEP_HALF_WIDTH && along > half.z && along <= half.z + PAVILION_STEP_LENGTH) {
      return p.groundY + (p.floorY - p.groundY) * (1 - (along - half.z) / PAVILION_STEP_LENGTH);
    }
  }
  return groundHeight(x, z);
}

/** Conservative underside of the roof for the follow camera: low at the eaves, rising toward the centre. The deck is open. */
export function bambooCeilingHeight(x: number, z: number): number | null {
  for (const p of BAMBOO_PAVILIONS) {
    if (p.kind === "deck") continue;
    const { lx, lz } = pavilionLocal(p, x, z);
    const reach = Math.max(Math.abs(lx), Math.abs(lz));
    if (reach > PAVILION_HALF + PAVILION_EAVE) continue;
    const eave = p.floorY + PAVILION_POST_HEIGHT - 0.1;
    return reach <= PAVILION_HALF ? eave + (1 - reach / PAVILION_HALF) * 1.2 : eave;
  }
  return null;
}

export interface TrailObstacle { x: number; z: number; r: number }
export interface TrailWall { minX: number; maxX: number; minZ: number; maxZ: number }

/** The board runs parallel to the +X railing and faces the middle of the deck. */
export const BAMBOO_GUESTBOOK = {
  x: 12.2, z: 100, yaw: -Math.PI / 2, scale: 2, halfWidth: 3.5, reach: 2.6, frontReach: 8.5,
} as const;
export const BAMBOO_GUESTBOOK_OBSTACLES: readonly TrailObstacle[] = Array.from({ length: 21 }, (_, i) => {
  const along = (i / 10 - 1) * BAMBOO_GUESTBOOK.halfWidth;
  return { x: BAMBOO_GUESTBOOK.x, z: BAMBOO_GUESTBOOK.z + along, r: 0.24 };
});

export function isNearBambooGuestbook(x: number, z: number) {
  const board = BAMBOO_GUESTBOOK;
  const front = board.x - x, along = Math.abs(z - board.z);
  if (front >= 0 && front <= board.frontReach && along <= board.halfWidth) return true;
  return Math.hypot(front, Math.max(0, along - board.halfWidth)) <= board.reach;
}

const POST_LOCAL: readonly [number, number][] = [[-2.15, -2.15], [2.15, -2.15], [-2.15, 2.15], [2.15, 2.15], [-2.15, 0], [2.15, 0]];
export const BAMBOO_PAVILION_POSTS: readonly { pavilionId: string; x: number; z: number }[] = BAMBOO_PAVILIONS
  .filter((p) => p.kind === "pavilion")
  .flatMap((p) => POST_LOCAL.map(([lx, lz]) => ({ pavilionId: p.id, ...pavilionWorld(p, lx, lz) })));
export const BAMBOO_PAVILION_OBSTACLES: readonly TrailObstacle[] = BAMBOO_PAVILION_POSTS.map((post) => ({ x: post.x, z: post.z, r: 0.16 }));

function localRect(p: BambooPavilion, ax: number, az: number, bx: number, bz: number): TrailWall {
  const a = pavilionWorld(p, ax, az), b = pavilionWorld(p, bx, bz);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

/** Pavilions: only the back railing stops walking. The deck is railed on the view side and both ends. Integer axes keep these axis-aligned. */
export const BAMBOO_PAVILION_COLLIDERS: readonly TrailWall[] = BAMBOO_PAVILIONS.flatMap((p) => p.kind === "deck"
  ? [localRect(p, -DECK_HALF_X, DECK_HALF_Z - 0.12, DECK_HALF_X, DECK_HALF_Z + 0.12),
    localRect(p, -DECK_HALF_X - 0.12, -DECK_HALF_Z, -DECK_HALF_X + 0.12, DECK_HALF_Z),
    localRect(p, DECK_HALF_X - 0.12, -DECK_HALF_Z, DECK_HALF_X + 0.12, DECK_HALF_Z)]
  : [localRect(p, -2.5, -2.62, 2.5, -2.38)]);

function insideYard(x: number, z: number, margin = 0): BambooPavilion | null {
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    const yardX = (p.kind === "deck" ? DECK_YARD_X : PAVILION_YARD_HALF) + margin + 1e-6;
    const yardZ = (p.kind === "deck" ? DECK_YARD_Z : PAVILION_YARD_HALF) + margin + 1e-6;
    if (Math.abs(lx) <= yardX && Math.abs(lz) <= yardZ) return p;
  }
  return null;
}

function insideClearing(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - SUMMIT.x, z - SUMMIT.z) <= SUMMIT.radius + margin || Math.hypot(x - MEADOW.x, z - MEADOW.z) <= MEADOW.radius + margin;
}

export function onTrail(x: number, z: number): boolean {
  return nearestOnTrail(x, z).distance <= TRAIL_WALK_HALF || insideYard(x, z) !== null || insideClearing(x, z, -0.6);
}

/** Keep the walker on the path, a yard or a clearing, sliding to the nearest allowed point instead of stopping. */
export function resolveTrail(x: number, z: number): [number, number] {
  const near = nearestOnTrail(x, z);
  if (near.distance <= TRAIL_WALK_HALF || insideYard(x, z) || insideClearing(x, z, -0.6)) return [x, z];
  // A hair inside the corridor, so the next frame's nearest-segment search cannot see it as outside again.
  const scale = (TRAIL_WALK_HALF - 0.01) / (near.distance || 1);
  let best: [number, number] = [near.x + (x - near.x) * scale, near.z + (z - near.z) * scale];
  let bestDistance = Math.hypot(x - best[0], z - best[1]);
  for (const p of BAMBOO_PAVILIONS) {
    const { lx, lz } = pavilionLocal(p, x, z);
    const yardX = (p.kind === "deck" ? DECK_YARD_X : PAVILION_YARD_HALF) - 0.005, yardZ = (p.kind === "deck" ? DECK_YARD_Z : PAVILION_YARD_HALF) - 0.005;
    const w = pavilionWorld(p, Math.max(-yardX, Math.min(yardX, lx)), Math.max(-yardZ, Math.min(yardZ, lz)));
    const distance = Math.hypot(x - w.x, z - w.z);
    if (distance < bestDistance) { best = [w.x, w.z]; bestDistance = distance; }
  }
  for (const clearing of [SUMMIT, MEADOW]) {
    const dx = x - clearing.x, dz = z - clearing.z, d = Math.hypot(dx, dz) || 1, r = clearing.radius - 0.62;
    const w: [number, number] = [clearing.x + dx / d * r, clearing.z + dz / d * r];
    const distance = Math.hypot(x - w[0], z - w[1]);
    if (distance < bestDistance) { best = w; bestDistance = distance; }
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

/** 길을 따라 3.9 m마다 좌우로 번갈아 선 석등(땅 위), 정자 처마와 전망대 기둥의 종이 등롱. y 는 땅 높이(석등) 또는 절대 높이(등롱). */
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
          out.push({ x, z, y: groundHeight(x, z), yaw: Math.atan2(0 - (px - x), 0 - (pz - z)), kind: "stone" });
        }
        side = -side;
        nextAt += LANTERN_SPACING;
      }
      travelled += length;
    }
  }
  for (const p of BAMBOO_PAVILIONS) {
    const deck = p.kind === "deck";
    for (const [lx, lz] of deck ? DECK_LANTERN_SITES : [[-1.9, 2.3], [1.9, 2.3]]) {
      const w = pavilionWorld(p, lx, lz);
      out.push({ x: w.x, z: w.z, y: p.floorY + (deck ? 2.0 : PAVILION_POST_HEIGHT - 0.5), yaw: p.yaw, kind: "paper", pavilionId: p.id });
    }
  }
  return out;
})();

export interface FenceRun { ax: number; az: number; bx: number; bz: number; side: number }

/** Two-rail bamboo fences line both sides of the loop and entrance, opening at junctions, yards and the two clearings. */
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
        if (!clearOfOtherLines(mx, mz, line.id, 0.25) || insideYard(mx, mz, -0.4) || insideClearing(mx, mz, -1)) continue;
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

export interface StalkSite { x: number; z: number; y: number; height: number; radius: number; phase: number; tint: number; leafAt: number; lean: number }

/** Rhizome clumps follow the two shoulders of the summit, outside the clearing and its city-facing opening. */
export function summitGroveSites(heightAt: (x: number, z: number) => number): StalkSite[] {
  const deck = BAMBOO_PAVILIONS.find(p => p.kind === "deck")!;
  const rand = seededRandom(139);
  const sites: StalkSite[] = [];
  for (const side of [-1, 1]) {
    // The far clumps overlap gaps between nearer clumps as the walker moves along
    // the rail. A mix of new shoots and mature bamboo covers the lateral valley.
    const stands = side > 0
      ? [[59, 36], [67, 23], [71, 32], [77, 18], [85, 29], [92, 20], [101, 35], [109, 38],
        [105, 23], [116, 27], [123, 21], [138, 31]]
      : [[57, 35], [67, 24], [75, 33], [82, 20], [91, 32], [98, 22], [105, 37],
        [107, 25], [113, 21], [127, 28], [141, 29]];
    for (const [bearing, depth] of stands) {
      const angle = bearing * Math.PI / 180;
      const forwardX = side * Math.sin(angle), forwardZ = Math.cos(angle);
      const acrossX = side * forwardZ, acrossZ = -Math.sin(angle);
      const stalks = depth >= 37 ? 9 : 12;
      for (let i = 0; i < stalks; i++) {
        const spin = rand() * 2 * Math.PI, spread = Math.sqrt(rand());
        const along = depth + Math.cos(spin) * spread * 3.0;
        const across = Math.sin(spin) * spread * 2.2;
        const x = deck.x + along * forwardX + across * acrossX;
        const z = deck.z + 2 + along * forwardZ + across * acrossZ;
        if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.radius + 1 || onTrail(x, z)) continue;
        const height = i % 4 === 0 ? 1.8 + rand() * 3.6 : i % 4 === 1 ? 5.4 + rand() * 3.7 : 9.4 + rand() * 7.6;
        sites.push({ x, z, y: heightAt(x, z), height, radius: 0.025 + height * 0.005,
          phase: rand() * Math.PI * 2, tint: rand(), leafAt: 0.73 + rand() * 0.20, lean: (rand() - 0.5) * 0.17 });
      }
    }
  }
  return sites;
}
/** 안쪽은 촘촘히, 바깥 띠는 성기게(안개 속). 정상 공터 주변은 비우고 그 둘레만 드문드문. */
export const STALK_FIELD = { inner: { minX: -46, maxX: 46, minZ: -6, maxZ: 118 }, outer: { minX: -72, maxX: 72, minZ: -36, maxZ: 150 } } as const;

/** Jittered grid: dense inside the walkable bounds, sparser in the fogged outer band; never on the path, a yard or a clearing. */
export function bambooStalkSites(seed = 7): StalkSite[] {
  const rand = seededRandom(seed), out: StalkSite[] = [];
  const { inner, outer } = STALK_FIELD;
  const place = (x: number, z: number) => {
    if (nearestOnTrail(x, z).distance < STALK_CLEARANCE || insideYard(x, z, 1.2)) return;
    const summit = Math.hypot(x - SUMMIT.x, z - SUMMIT.z);
    if (summit < SUMMIT.radius + 4 || Math.hypot(x - MEADOW.x, z - MEADOW.z) < MEADOW.radius + 1.5) return;
    // The whole north face below the summit stays bare so the deck looks straight out at the city.
    if (z > SUMMIT.z + 1) return;
    const u = rand();
    if (summit < SUMMIT.radius + 11 && u < 0.6) return;
    out.push({ x, z, y: groundHeight(x, z), height: 8.5 + rand() * 4.5, radius: 0.055 + rand() * 0.045, phase: rand() * Math.PI * 2,
      tint: rand(), leafAt: 0.74 + rand() * 0.2, lean: (u - 0.5) * 0.08 });
  };
  for (let z = inner.minZ; z <= inner.maxZ; z += 1.65) for (let x = inner.minX; x <= inner.maxX; x += 1.65) {
    place(x + (rand() - 0.5) * 1.4, z + (rand() - 0.5) * 1.4);
  }
  for (let z = outer.minZ; z <= outer.maxZ; z += 3.4) for (let x = outer.minX; x <= outer.maxX; x += 3.4) {
    const jx = x + (rand() - 0.5) * 2.6, jz = z + (rand() - 0.5) * 2.6;
    if (jx > inner.minX && jx < inner.maxX && jz > inner.minZ && jz < inner.maxZ) continue;
    place(jx, jz);
  }
  return out;
}

export interface BrushSite { x: number; z: number; y: number; yaw: number; size: number; seed: number }

/** Dry bamboo brush just outside each fence, as in the reference path photograph. */
export function bambooBrushSites(seed = 11): BrushSite[] {
  const rand = seededRandom(seed), out: BrushSite[] = [];
  for (const run of BAMBOO_FENCES) {
    const dx = run.bx - run.ax, dz = run.bz - run.az, length = Math.hypot(dx, dz) || 1e-9;
    const nx = -dz / length * run.side, nz = dx / length * run.side;
    for (let s = 0.3; s < length; s += 0.95) {
      const t = s / length, spread = 0.35 + rand() * 0.45;
      const x = run.ax + dx * t + nx * spread, z = run.az + dz * t + nz * spread;
      out.push({ x, z, y: groundHeight(x, z), yaw: rand() * Math.PI, size: 0.8 + rand() * 0.5, seed: rand() });
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
