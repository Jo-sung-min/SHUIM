/**
 * 봄물 정원의 배치 수학. three.js 없이 순수 함수만 두어 노드 테스트와 서버(BeachRoom.PAVILIONS)가 같은 식을 쓴다.
 *  - 호수: 중심 (0, 34) 의 울퉁불퉁한 타원. 부호 거리 하나(lakeSigned)로 걷기 금지·물 셰이더·연잎 배치·다른 사람의 배 그리기를 모두 판정한다.
 *  - 길: 호수를 한 바퀴 도는 산책로(청우헌 뒤로 돌아간다) + 남문·선착장·다리·청우헌 옆문 샛길. 걷는 범위는 길·잔교·다리·섬·청우헌 바닥으로 제한한다.
 *  - 청우헌: 북쪽 호숫가의 통창 건물. 창 쪽이 가장 낮은 4단 계단식 바닥, 단마다 6자리. 좌석 표는 서버와 같다.
 *  - 연향정: 서쪽 섬의 기와 정자(대나무숲 정자와 같은 좌석 표), 구곡교로 건넌다.
 *  - 나룻배: 선착장·청우헌 잔교·섬 잔교 세 정류장을 도는 닫힌 경로. 서버 상태 없이 시간으로만 움직인다.
 */
import { PAVILION_HALF, PAVILION_REACH, PAVILION_RISE, PAVILION_STEP_HALF_WIDTH, PAVILION_STEP_LENGTH, PAVILION_POST_HEIGHT, PAVILION_EAVE, PAVILION_SEAT_CAPACITY, TRAIL_WALK_HALF, nearestOnTrail, sampleCatmullRom, seededRandom, type PavilionSeat, type TrailPoint, type TrailPolyline } from "./bamboo-trail";

export const GARDEN_BOUNDS = { minX: -60, maxX: 60, minZ: -30, maxZ: 100 } as const;
/** 수면 높이와 호숫가 땅 높이 (절대값) */
export const WATER_Y = 0;
export const GROUND_Y = 0.55;
export const BRIDGE_Y = 0.95;
export const PIER_Y = 0.62;
/** 나룻배 갑판(앉는 높이) */
export const BOAT_DECK_Y = 0.42;
export const GARDEN_PATH_WIDTH = 2.6;
export const GARDEN_SPAWN = { x: 0, z: -11, yaw: Math.PI } as const;

export const LAKE = { x: 0, z: 34, rx: 36, rz: 28 } as const;
export const ISLAND = { x: -16, z: 36, radius: 7 } as const;

/** 청우헌: x −15~15, z 60~80. 남면(z=60)이 통창, 창 쪽이 가장 낮다. */
export const HALL = { x: 0, z: 70, halfX: 15, halfZ: 10, glassZ: 60, backZ: 80, eave: 14, roofRise: 3.2, doorZ: 76, doorHalf: 1.4 } as const;
export interface HallTier { from: number; to: number; y: number }
/** 창에서 뒤로 잰 거리(lz) 구간과 그 단의 바닥 높이 */
export const HALL_TIERS: readonly HallTier[] = [
  { from: 0, to: 5.2, y: 0.6 }, { from: 5.2, to: 9.6, y: 1.2 }, { from: 9.6, to: 14, y: 1.8 }, { from: 14, to: 20, y: 2.4 },
];
export const HALL_STAIR_HALF = 2;
export const HALL_STAIR_RUN = 1.6;
export const HALL_BENCH_HEIGHT = 0.45;
export const HALL_SEAT_LX: readonly number[] = [-10.8, -7.2, -3.6, 3.6, 7.2, 10.8];
export const HALL_DOOR_RAMP = 3.2;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------------- 호수 ---------------- */
/** 중심에서 본 각도별 물가 반지름: 타원에 세 겹의 낮은 파동을 더해 자연스러운 호안을 만든다. */
export function lakeRadiusAt(angle: number): number {
  const c = Math.cos(angle), s = Math.sin(angle);
  const base = LAKE.rx * LAKE.rz / Math.hypot(LAKE.rz * c, LAKE.rx * s);
  return base * (1 + 0.05 * Math.sin(3 * angle + 1.1) + 0.035 * Math.sin(5 * angle + 2.3) + 0.02 * Math.sin(8 * angle + 0.4));
}

/** 물가까지의 어림 거리(m). 양수는 땅, 음수는 물. 섬 안은 땅. */
export function lakeSigned(x: number, z: number): number {
  const dx = x - LAKE.x, dz = z - LAKE.z;
  const lake = Math.hypot(dx, dz) - lakeRadiusAt(Math.atan2(dz, dx));
  const island = ISLAND.radius - Math.hypot(x - ISLAND.x, z - ISLAND.z);
  return Math.max(lake, island);
}

/* ---------------- 청우헌 ---------------- */
export function hallLocal(x: number, z: number): { lx: number; lz: number } {
  return { lx: x - HALL.x, lz: z - HALL.glassZ };
}
export function insideHall(x: number, z: number, margin = 0): boolean {
  const { lx, lz } = hallLocal(x, z);
  return Math.abs(lx) <= HALL.halfX + margin && lz >= -margin && lz <= HALL.backZ - HALL.glassZ + margin;
}
export function hallTierAt(lz: number): HallTier {
  for (const tier of HALL_TIERS) if (lz < tier.to) return tier;
  return HALL_TIERS[HALL_TIERS.length - 1];
}
/** 옆문 밖 돌계단: 벽(|lx| = 15)에서 바깥으로 HALL_DOOR_RAMP 만큼 내려간다. */
function doorRamp(lx: number, lz: number): number | null {
  if (Math.abs(lz - (HALL.doorZ - HALL.glassZ)) > HALL.doorHalf) return null;
  const out = Math.abs(lx) - HALL.halfX;
  if (out < 0 || out > HALL_DOOR_RAMP) return null;
  const top = HALL_TIERS[HALL_TIERS.length - 1].y;
  return GROUND_Y + (top - GROUND_Y) * (1 - out / HALL_DOOR_RAMP);
}
/** 청우헌 바닥: 단 높이, 가운데 계단은 단 사이를 잇는 경사. 건물 밖이면 null. */
export function hallFloorHeight(x: number, z: number): number | null {
  const { lx, lz } = hallLocal(x, z);
  if (Math.abs(lx) > HALL.halfX) return doorRamp(lx, lz);
  if (lz < 0 || lz > HALL.backZ - HALL.glassZ) return null;
  const tier = hallTierAt(lz);
  if (Math.abs(lx) > HALL_STAIR_HALF) return tier.y;
  // Stairs: ramp from each tier up to the next across HALL_STAIR_RUN centred on the boundary.
  const index = HALL_TIERS.indexOf(tier);
  const next = HALL_TIERS[index + 1], previous = HALL_TIERS[index - 1];
  if (next && lz > tier.to - HALL_STAIR_RUN / 2) return tier.y + (next.y - tier.y) * smooth((lz - (tier.to - HALL_STAIR_RUN / 2)) / HALL_STAIR_RUN);
  if (previous && lz < tier.from + HALL_STAIR_RUN / 2) return previous.y + (tier.y - previous.y) * smooth((lz - (tier.from - HALL_STAIR_RUN / 2)) / HALL_STAIR_RUN);
  return tier.y;
}

/* ---------------- 정자·좌석 ---------------- */
export type GardenSeatKind = "pavilion" | "hall";
export interface GardenPavilion {
  id: string; spotId: string; name: string; kind: GardenSeatKind;
  x: number; z: number; fx: number; fz: number; yaw: number; groundY: number; floorY: number;
}
const pavilion = (id: string, name: string, kind: GardenSeatKind, x: number, z: number, fx: number, fz: number, groundY: number, floorY: number): GardenPavilion =>
  ({ id, spotId: kind === "hall" ? `hall-tier-${id}` : `pavilion-${id}`, name, kind, x, z, fx, fz, yaw: Math.atan2(0 - fx, 0 - fz), groundY, floorY });

/** 서버 BeachRoom.PAVILIONS(garden) 와 같은 중심·축·좌석 표. 청우헌 단은 창(−z)을 본다. */
export const GARDEN_PAVILIONS: readonly GardenPavilion[] = [
  pavilion("island", "연향정", "pavilion", -15, 36, -1, 0, GROUND_Y, GROUND_Y + PAVILION_RISE),
  ...HALL_TIERS.map((tier, index) => pavilion(String(index + 1), index === 0 ? "창가 자리" : `${index + 1}단 자리`, "hall",
    HALL.x, HALL.glassZ + (tier.from + tier.to) / 2, 0, -1, tier.y, tier.y)),
];
export const GARDEN_HALL_SPOTS: readonly string[] = GARDEN_PAVILIONS.filter((p) => p.kind === "hall").map((p) => p.spotId);

const SEAT_LOCAL: readonly [number, number, number, number][] = [
  [-1.7, 2.42, 0, 1], [1.7, 2.42, 0, 1],
  [-2.42, -0.9, -1, 0], [-2.42, 0.9, -1, 0],
  [2.42, -0.9, 1, 0], [2.42, 0.9, 1, 0],
];
const HALL_SEAT_LOCAL: readonly [number, number, number, number][] = HALL_SEAT_LX.map((lx) => [lx, 0, 0, 1]);

export function gardenPavilionWorld(p: GardenPavilion, lx: number, lz: number): { x: number; z: number } {
  const rx = -p.fz, rz = p.fx;
  return { x: p.x + lx * rx + lz * p.fx, z: p.z + lx * rz + lz * p.fz };
}
export function gardenPavilionLocal(p: GardenPavilion, x: number, z: number): { lx: number; lz: number } {
  const rx = -p.fz, rz = p.fx, dx = x - p.x, dz = z - p.z;
  return { lx: dx * rx + dz * rz, lz: dx * p.fx + dz * p.fz };
}

export const GARDEN_SEATS: readonly PavilionSeat[] = GARDEN_PAVILIONS.flatMap((p) =>
  (p.kind === "hall" ? HALL_SEAT_LOCAL : SEAT_LOCAL).map(([lx, lz, flx, flz], slot) => {
    const rx = -p.fz, rz = p.fx;
    const { x, z } = gardenPavilionWorld(p, lx, lz);
    const fx = flx * rx + flz * p.fx, fz = flx * rz + flz * p.fz;
    return { id: `${p.spotId}-seat-${slot}`, pavilionId: p.id, spotId: p.spotId, name: p.name, slot, x, z,
      yaw: Math.atan2(0 - fx, 0 - fz), avatarY: p.kind === "hall" ? p.floorY + HALL_BENCH_HEIGHT : p.floorY,
      baseY: p.kind === "hall" ? p.floorY : p.groundY, incline: 0 };
  }));

export function gardenPavilionForSpot(spotId: string | null | undefined): GardenPavilion | null {
  return GARDEN_PAVILIONS.find((p) => p.spotId === spotId) ?? null;
}
export function gardenSeat(spotId: string, slot: number): PavilionSeat | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PAVILION_SEAT_CAPACITY) return null;
  return GARDEN_SEATS.find((seat) => seat.spotId === spotId && seat.slot === slot) ?? null;
}
export function claimedGardenSeat(state: { pose?: string; spotId?: string | null; slot?: number | null }): PavilionSeat | null {
  if (state.pose !== "sitting" || typeof state.spotId !== "string" || typeof state.slot !== "number") return null;
  return gardenSeat(state.spotId, state.slot);
}
export function nearbyGardenPavilion(x: number, z: number): GardenPavilion | null {
  let best: GardenPavilion | null = null, bestDistance = PAVILION_REACH;
  for (const seat of GARDEN_SEATS) {
    const distance = Math.hypot(x - seat.x, z - seat.z);
    if (distance <= bestDistance) { bestDistance = distance; best = gardenPavilionForSpot(seat.spotId); }
  }
  return best;
}

const ISLAND_PAVILION = GARDEN_PAVILIONS[0];
const POST_LOCAL: readonly [number, number][] = [[-2.15, -2.15], [2.15, -2.15], [-2.15, 2.15], [2.15, 2.15], [-2.15, 0], [2.15, 0]];
export const GARDEN_OBSTACLES: readonly { x: number; z: number; r: number }[] = POST_LOCAL.map(([lx, lz]) => ({ ...gardenPavilionWorld(ISLAND_PAVILION, lx, lz), r: 0.16 }));

/* ---------------- 길·잔교·다리 ---------------- */
/** 남문에서 시작해 서안 → 청우헌 뒤 → 동안으로 한 바퀴 (물가에서 4~5 m). */
export const GARDEN_LOOP_CONTROL: readonly TrailPoint[] = [
  [0, 1.5], [-24, 6], [-37, 20], [-40.5, 34], [-37, 50], [-26, 62], [-21, 72], [-20, 84], [0, 87],
  [20, 84], [21, 72], [26, 62], [37, 50], [40.5, 34], [37, 20], [24, 6],
];
export interface Pier { id: string; name: string; x: number; z: number; dx: number; dz: number; length: number; halfWidth: number }
const pier = (id: string, name: string, x: number, z: number, dx: number, dz: number, length: number): Pier => {
  const l = Math.hypot(dx, dz) || 1;
  return { id, name, x, z, dx: dx / l, dz: dz / l, length, halfWidth: 1.05 };
};
/** 잔교는 땅에서 시작해 물 위로 뻗는다. 끝 1.8 m 옆이 나룻배 정류장. */
export const GARDEN_PIERS: readonly Pier[] = [
  pier("dock", "버들 선착장", 21.5, 8.5, -21.5, 25.5, 11),
  pier("hall", "청우헌 물가", -17, 61, 0, -1, 6),
  pier("island", "연향정 섬", -16, 29.5, 0, -1, 5.5),
];
export function pierLocal(p: Pier, x: number, z: number): { along: number; across: number } {
  const dx = x - p.x, dz = z - p.z;
  return { along: dx * p.dx + dz * p.dz, across: -dx * p.dz + dz * p.dx };
}
export function pierEnd(p: Pier): { x: number; z: number } {
  return { x: p.x + p.dx * p.length, z: p.z + p.dz * p.length };
}
export function onPier(x: number, z: number, margin = 0): Pier | null {
  for (const p of GARDEN_PIERS) {
    const { along, across } = pierLocal(p, x, z);
    if (along >= -0.3 && along <= p.length + margin && Math.abs(across) <= p.halfWidth + margin) return p;
  }
  return null;
}

/** 구곡교: 서안에서 섬까지 세 번 꺾이는 돌다리 */
export const GARDEN_BRIDGE: readonly TrailPoint[] = [[-38.2, 42], [-31.5, 44.2], [-27.5, 39], [-23.2, 37.6]];
export const BRIDGE_HALF = 0.95;
const BRIDGE_LINE: TrailPolyline = { id: "bridge", points: GARDEN_BRIDGE.map((p) => [...p] as TrailPoint), closed: false };
export function onBridge(x: number, z: number, margin = 0): boolean {
  return nearestOnTrail(x, z, [BRIDGE_LINE]).distance <= BRIDGE_HALF + margin;
}

const LOOP: TrailPolyline = { id: "loop", points: sampleCatmullRom(GARDEN_LOOP_CONTROL, true, 6), closed: true };
const SPURS: TrailPolyline[] = [
  { id: "gate", points: [[0, -14], [0, 2]], closed: false },
  { id: "dock", points: [[24, 6], [21.5, 8.5]], closed: false },
  { id: "hall-pier", points: [[-23.5, 66], [-17, 61.5]], closed: false },
  { id: "west-door", points: [[-20.5, 76], [-15.2, 76]], closed: false },
  { id: "east-door", points: [[20.5, 76], [15.2, 76]], closed: false },
];
export const GARDEN_POLYLINES: readonly TrailPolyline[] = [LOOP, ...SPURS];
export const GARDEN_LOOP_POINTS: readonly TrailPoint[] = LOOP.points;
/** 남문 안마당 */
export const GATE_YARD = { minX: -4.5, maxX: 4.5, minZ: -15, maxZ: 2 } as const;
/** Open light-exhibition court at the former moon wall. The central aisle joins the old yard. */
export const GARDEN_PHOTO_ZONE = { x: 0, z: -14.4, rx: 12.5, rz: 4.6 } as const;

export function insideGardenPhotoZone(x: number, z: number): boolean {
  const p = GARDEN_PHOTO_ZONE;
  return Math.pow((x - p.x) / (p.rx - 0.35), 2) + Math.pow((z - p.z) / (p.rz - 0.35), 2) <= 1;
}

export function insideIsland(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x - ISLAND.x, z - ISLAND.z) <= ISLAND.radius - 0.4 + margin;
}
function insideGateYard(x: number, z: number): boolean {
  return x >= GATE_YARD.minX && x <= GATE_YARD.maxX && z >= GATE_YARD.minZ && z <= GATE_YARD.maxZ;
}
/** 잔교·다리·청우헌처럼 물 위에 떠 있어도 걷는 구조물 */
export function onStructure(x: number, z: number): boolean {
  return onPier(x, z) !== null || onBridge(x, z) || hallFloorHeight(x, z) !== null;
}
export function isWater(x: number, z: number): boolean {
  return lakeSigned(x, z) < 0 && !onStructure(x, z);
}

export function onGardenGround(x: number, z: number): boolean {
  if (onStructure(x, z)) return true;
  if (lakeSigned(x, z) < 0.25) return false;
  if (insideIsland(x, z) || insideGateYard(x, z) || insideGardenPhotoZone(x, z)) return true;
  return nearestOnTrail(x, z, GARDEN_POLYLINES).distance <= TRAIL_WALK_HALF;
}

/** 걷기 범위를 벗어나면 가장 가까운 허용 지점으로 미끄러진다 (멈추지 않고). 물로는 절대 들어가지 않는다. */
export function resolveGardenWalk(x: number, z: number): [number, number] {
  if (onGardenGround(x, z)) return [x, z];
  const candidates: [number, number][] = [];
  const near = nearestOnTrail(x, z, GARDEN_POLYLINES);
  const scale = (TRAIL_WALK_HALF - 0.01) / (near.distance || 1);
  candidates.push([near.x + (x - near.x) * scale, near.z + (z - near.z) * scale]);
  for (const line of GARDEN_POLYLINES) {
    const hit = nearestOnTrail(x, z, [line]);
    const s = (TRAIL_WALK_HALF - 0.01) / (hit.distance || 1);
    candidates.push([hit.x + (x - hit.x) * s, hit.z + (z - hit.z) * s]);
  }
  const dx = x - ISLAND.x, dz = z - ISLAND.z, d = Math.hypot(dx, dz) || 1, r = ISLAND.radius - 0.42;
  candidates.push([ISLAND.x + dx / d * r, ISLAND.z + dz / d * r]);
  candidates.push([clamp(x, GATE_YARD.minX, GATE_YARD.maxX), clamp(z, GATE_YARD.minZ, GATE_YARD.maxZ)]);
  const photo = GARDEN_PHOTO_ZONE, photoX = (x - photo.x) / (photo.rx - 0.36), photoZ = (z - photo.z) / (photo.rz - 0.36);
  const photoDistance = Math.max(1, Math.hypot(photoX, photoZ));
  candidates.push([photo.x + (x - photo.x) / photoDistance, photo.z + (z - photo.z) / photoDistance]);
  for (const p of GARDEN_PIERS) {
    const { along, across } = pierLocal(p, x, z);
    const a = clamp(along, 0, p.length - 0.02), c = clamp(across, -p.halfWidth + 0.02, p.halfWidth - 0.02);
    candidates.push([p.x + p.dx * a - p.dz * c, p.z + p.dz * a + p.dx * c]);
  }
  const bridge = nearestOnTrail(x, z, [BRIDGE_LINE]);
  const bs = (BRIDGE_HALF - 0.02) / (bridge.distance || 1);
  candidates.push([bridge.x + (x - bridge.x) * Math.min(1, bs), bridge.z + (z - bridge.z) * Math.min(1, bs)]);
  const { lx, lz } = hallLocal(x, z);
  const depth = HALL.backZ - HALL.glassZ;
  candidates.push([HALL.x + clamp(lx, -HALL.halfX + 0.45, HALL.halfX - 0.45), HALL.glassZ + clamp(lz, 0.55, depth - 0.45)]);
  for (const side of [-1, 1]) {
    candidates.push([HALL.x + side * clamp(Math.abs(lx), HALL.halfX - 0.45, HALL.halfX + HALL_DOOR_RAMP), HALL.glassZ + clamp(lz, HALL.doorZ - HALL.glassZ - HALL.doorHalf + 0.05, HALL.doorZ - HALL.glassZ + HALL.doorHalf - 0.05)]);
  }
  let best: [number, number] | null = null, bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!onGardenGround(candidate[0], candidate[1])) continue;
    const distance = Math.hypot(x - candidate[0], z - candidate[1]);
    if (distance < bestDistance) { best = candidate; bestDistance = distance; }
  }
  return best ?? [GARDEN_SPAWN.x, GARDEN_SPAWN.z];
}

/** 발이 닿는 높이: 청우헌 단·계단, 다리, 잔교, 정자 마루·섬돌, 물 위(배 갑판), 그 밖은 땅. */
export function gardenFloorHeight(x: number, z: number): number {
  const hall = hallFloorHeight(x, z);
  if (hall !== null) return hall;
  if (onBridge(x, z, 0.3)) return BRIDGE_Y;
  if (onPier(x, z, 0.2)) return PIER_Y;
  const p = ISLAND_PAVILION;
  const { lx, lz } = gardenPavilionLocal(p, x, z);
  if (Math.abs(lx) <= PAVILION_HALF && Math.abs(lz) <= PAVILION_HALF) return p.floorY;
  if (Math.abs(lx) <= PAVILION_STEP_HALF_WIDTH && lz > PAVILION_HALF && lz <= PAVILION_HALF + PAVILION_STEP_LENGTH) {
    return p.groundY + (p.floorY - p.groundY) * (1 - (lz - PAVILION_HALF) / PAVILION_STEP_LENGTH);
  }
  if (lakeSigned(x, z) < 0) return BOAT_DECK_Y;
  return GROUND_Y;
}

/** 카메라가 넘지 않을 천장: 청우헌 처마 아래, 연향정 지붕 아래. 바깥은 null. */
export function gardenCeilingHeight(x: number, z: number): number | null {
  if (insideHall(x, z, 0.6)) return HALL_TIERS[HALL_TIERS.length - 1].y + HALL.eave - 0.3;
  const p = ISLAND_PAVILION;
  const { lx, lz } = gardenPavilionLocal(p, x, z);
  const reach = Math.max(Math.abs(lx), Math.abs(lz));
  if (reach > PAVILION_HALF + PAVILION_EAVE) return null;
  const eave = p.floorY + PAVILION_POST_HEIGHT - 0.1;
  return reach <= PAVILION_HALF ? eave + (1 - reach / PAVILION_HALF) * 1.2 : eave;
}

export interface GardenWall { minX: number; maxX: number; minZ: number; maxZ: number }
/** 청우헌 벽(옆문 빼고)·통창·연향정 뒤 난간: 카메라와 걷기가 통과하지 않는다. */
export const GARDEN_WALLS: readonly GardenWall[] = (() => {
  const walls: GardenWall[] = [];
  const t = 0.18;
  walls.push({ minX: HALL.x - HALL.halfX, maxX: HALL.x + HALL.halfX, minZ: HALL.glassZ - t, maxZ: HALL.glassZ + t });
  walls.push({ minX: HALL.x - HALL.halfX, maxX: HALL.x + HALL.halfX, minZ: HALL.backZ - t, maxZ: HALL.backZ + t });
  for (const side of [-1, 1]) {
    const wx = HALL.x + side * HALL.halfX;
    walls.push({ minX: wx - t, maxX: wx + t, minZ: HALL.glassZ, maxZ: HALL.doorZ - HALL.doorHalf });
    walls.push({ minX: wx - t, maxX: wx + t, minZ: HALL.doorZ + HALL.doorHalf, maxZ: HALL.backZ });
  }
  const p = ISLAND_PAVILION, a = gardenPavilionWorld(p, -2.5, -2.62), b = gardenPavilionWorld(p, 2.5, -2.38);
  walls.push({ minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
  return walls;
})();

/* ---------------- 나룻배 ---------------- */
export interface BoatStop { id: string; name: string; pierId: string; x: number; z: number }
/** 잔교 끝 앞 1.9 m: 배가 잔교와 직각으로 지나다 뱃전을 대고 멈추는 자리 */
export const BOAT_STOP_BEYOND = 1.9;
function stopBeyond(p: Pier): { x: number; z: number } {
  const end = pierEnd(p);
  return { x: end.x + p.dx * BOAT_STOP_BEYOND, z: end.z + p.dz * BOAT_STOP_BEYOND };
}
export const BOAT_STOPS: readonly BoatStop[] = [
  { id: "dock", name: "버들 선착장", pierId: "dock", ...stopBeyond(GARDEN_PIERS[0]) },
  { id: "hall", name: "청우헌 물가", pierId: "hall", ...stopBeyond(GARDEN_PIERS[1]) },
  { id: "island", name: "연향정 섬", pierId: "island", ...stopBeyond(GARDEN_PIERS[2]) },
];
/**
 * 선착장 → 동안 → 청우헌 앞(서쪽으로 지나며 정차) → 섬 동쪽을 돌아 섬 남쪽(서쪽으로 지나며 정차) → 남안 → 선착장.
 * 구곡교(섬 서쪽)는 건너지 않는다. 정류장 앞뒤 제어점은 잔교와 직각이 되게 둔다.
 */
export const BOAT_ROUTE_CONTROL: readonly TrailPoint[] = (() => {
  const [dock, hall, island] = BOAT_STOPS;
  return [
    [dock.x, dock.z], [27, 22], [31, 38], [22, 52], [4, 55], [-4, 54], [hall.x, hall.z], [-24, 48], [-12, 46], [-6, 40], [-5, 30],
    [-5, 24], [island.x, island.z], [-24, 22], [-14, 14], [-4, 10], [8, 10.5],
  ];
})();
export const BOAT_SPEED = 1.3;
export const BOAT_STOP_SECONDS = 10;
export const BOAT_BOARD_REACH = 2.6;

export interface BoatRoute { points: TrailPoint[]; lengths: number[]; total: number; stopAt: number[] }
export const BOAT_ROUTE: BoatRoute = (() => {
  const points = sampleCatmullRom(BOAT_ROUTE_CONTROL, true, 10);
  const lengths = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1], b = points[i % points.length];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[points.length];
  const stopAt = BOAT_STOPS.map((stop) => {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i][0] - stop.x, points[i][1] - stop.z);
      if (d < bestDistance) { bestDistance = d; best = lengths[i]; }
    }
    return best;
  });
  return { points, lengths, total, stopAt };
})();

export interface BoatPose { x: number; z: number; yaw: number }
/** 경로 위 거리 s(m) 의 위치와 뱃머리 방향(yaw: 엔진과 같은 -sin/-cos 규약) */
export function boatPoseAt(s: number): BoatPose {
  const { points, lengths, total } = BOAT_ROUTE;
  const d = ((s % total) + total) % total;
  let i = 0;
  while (i < points.length - 1 && lengths[i + 1] <= d) i++;
  const a = points[i], b = points[(i + 1) % points.length];
  const span = lengths[i + 1] - lengths[i] || 1, t = (d - lengths[i]) / span;
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return { x, z, yaw: Math.atan2(-dx, -dz) };
}
/** 다음 정류장의 번호. `after` 보다 가까이 지나친 정류장은 이미 떠난 것으로 본다 (0이면 지금 선 자리도 센다). */
export function nextBoatStop(s: number, after = 0): number {
  const { total, stopAt } = BOAT_ROUTE;
  const d = ((s % total) + total) % total;
  let best = Infinity, bestIndex = 0;
  stopAt.forEach((at, index) => {
    const ahead = ((at - d) % total + total) % total;
    const gap = ahead < after ? ahead + total : ahead;
    if (gap < best) { best = gap; bestIndex = index; }
  });
  return bestIndex;
}
export function nearestBoatStop(x: number, z: number): BoatStop | null {
  for (const stop of BOAT_STOPS) {
    const p = GARDEN_PIERS.find((pier) => pier.id === stop.pierId)!;
    const end = pierEnd(p);
    if (Math.hypot(x - end.x, z - end.z) <= BOAT_BOARD_REACH + 0.8 && onPier(x, z, 0.1)) return stop;
  }
  return null;
}

/* ---------------- 날씨 ---------------- */
export const RAIN_PERIOD_MS = 40 * 60_000;
export const RAIN_LENGTH_MS = 14 * 60_000;
export const RAIN_FADE_MS = 2 * 60_000;
function weatherHash(n: number): number {
  let h = (n | 0) * 2654435761;
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** 서버 시각(ms)에서의 비 세기 0~1. 40분 블록마다 14분 비가 오고(시작 시각·세기는 블록 해시), 2분 동안 서서히 시작·그친다. */
export function gardenRainAt(serverMs: number): number {
  const block = Math.floor(serverMs / RAIN_PERIOD_MS);
  const offset = RAIN_FADE_MS + weatherHash(block) * (RAIN_PERIOD_MS - RAIN_LENGTH_MS - RAIN_FADE_MS * 2);
  const strength = 0.45 + 0.55 * weatherHash(block + 7919);
  const t = serverMs - block * RAIN_PERIOD_MS - offset;
  if (t < -RAIN_FADE_MS || t > RAIN_LENGTH_MS + RAIN_FADE_MS) return 0;
  const fadeIn = smooth((t + RAIN_FADE_MS) / RAIN_FADE_MS), fadeOut = 1 - smooth((t - RAIN_LENGTH_MS) / RAIN_FADE_MS);
  return Math.min(fadeIn, fadeOut) * strength;
}

/* ---------------- 심기·세우기 ---------------- */
export interface Planting { x: number; z: number; y: number; yaw: number; scale: number; seed: number }
function loopSample(fraction: number): { x: number; z: number; nx: number; nz: number } {
  const points = LOOP.points, n = points.length;
  const f = ((fraction % 1) + 1) % 1, i = Math.floor(f * n), t = f * n - i;
  const a = points[i], b = points[(i + 1) % n], c = points[(i + 2) % n];
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1;
  // Clockwise loop: the lake lies to the right of travel direction (+x when heading north on the west side ...), so use the centre instead.
  const toCentreX = LAKE.x - x, toCentreZ = LAKE.z - z, cl = Math.hypot(toCentreX, toCentreZ) || 1;
  void l;
  return { x, z, nx: toCentreX / cl, nz: toCentreZ / cl };
}
/** 버드나무 14그루: 산책로와 물 사이, 물에 닿지 않는 자리 */
export const GARDEN_WILLOWS: readonly Planting[] = (() => {
  const rand = seededRandom(61), out: Planting[] = [];
  const fractions = [0.03, 0.085, 0.14, 0.2, 0.26, 0.33, 0.4, 0.6, 0.68, 0.75, 0.82, 0.88, 0.935, 0.975];
  for (const f of fractions) {
    const s = loopSample(f);
    let x = s.x + s.nx * 3.1, z = s.z + s.nz * 3.1;
    if (lakeSigned(x, z) < 1.1) { x = s.x - s.nx * 2.2; z = s.z - s.nz * 2.2; }
    if (onStructure(x, z) || insideHall(x, z, 3)) continue;
    out.push({ x, z, y: GROUND_Y, yaw: rand() * Math.PI * 2, scale: 0.85 + rand() * 0.35, seed: rand() });
  }
  return out;
})();
/** 석등 24개: 산책로 호수 쪽 1.9 m */
export const GARDEN_LANTERNS: readonly Planting[] = (() => {
  const out: Planting[] = [];
  for (let i = 0; i < 24; i++) {
    const s = loopSample(i / 24 + 0.02);
    let x = s.x + s.nx * 1.9, z = s.z + s.nz * 1.9;
    if (lakeSigned(x, z) < 0.6) { x = s.x - s.nx * 1.9; z = s.z - s.nz * 1.9; }
    if (insideHall(x, z, 2.5)) continue;
    out.push({ x, z, y: GROUND_Y, yaw: Math.atan2(-s.nx, -s.nz), scale: 1, seed: i / 24 });
  }
  return out;
})();
export interface LotusBed { x: number; z: number; radius: number }
export const LOTUS_BEDS: readonly LotusBed[] = [
  { x: -26, z: 18, radius: 6 }, { x: 9, z: 19, radius: 5 }, { x: -25, z: 51, radius: 6 }, { x: 25, z: 33, radius: 5 }, { x: 4, z: 59.2, radius: 3 },
];
export interface LotusPad { x: number; z: number; radius: number; yaw: number; seed: number; flower: boolean }
export function lotusPads(seed = 29): LotusPad[] {
  const rand = seededRandom(seed), out: LotusPad[] = [];
  for (const bed of LOTUS_BEDS) {
    const count = Math.round(bed.radius * bed.radius * 1.7);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2, d = Math.sqrt(rand()) * bed.radius;
      const x = bed.x + Math.cos(angle) * d, z = bed.z + Math.sin(angle) * d;
      if (lakeSigned(x, z) > -1.2 || onStructure(x, z)) continue;
      out.push({ x, z, radius: 0.28 + rand() * 0.3, yaw: rand() * Math.PI * 2, seed: rand(), flower: rand() < 0.08 });
    }
  }
  return out;
}
/** 호숫가 갈대 포기 */
export function reedSites(seed = 37): Planting[] {
  const rand = seededRandom(seed), out: Planting[] = [];
  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2, r = lakeRadiusAt(angle) + (rand() - 0.5) * 1.2;
    const x = LAKE.x + Math.cos(angle) * r, z = LAKE.z + Math.sin(angle) * r;
    if (onStructure(x, z) || insideHall(x, z, 2) || Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius + 2) continue;
    out.push({ x, z, y: WATER_Y + 0.05, yaw: rand() * Math.PI * 2, scale: 0.7 + rand() * 0.6, seed: rand() });
  }
  return out;
}
