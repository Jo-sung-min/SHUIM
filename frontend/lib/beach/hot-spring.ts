import * as THREE from "three";
import type { WallRect } from "./navigation";
import { ONSEN_BATHS } from "./onsen-rest";

export const HOT_SPRING_PATH = [
  { x: 6.5, z: 33.5, y: 0 },
  { x: 15, z: 33.5, y: 5.2 },
  { x: 15, z: 45, y: 12.6 },
  { x: 6, z: 45, y: 18 },
] as const;
export const HOT_SPRING = { x: 0, z: 45, deckY: 18, waterY: 17.5, floorY: 16.6, deckRadius: 7.2, poolRadius: 4.6 } as const;
/** Every bath shares the first one's proportions. HOT_SPRING still describes the first. */
export const HOT_SPRING_BATHS = ONSEN_BATHS.map((bath) => ({ ...bath }));
const ROCK_RADIUS = 7, STAIR_HALF_WIDTH = 0.9, STAIR_WALL = 0.8, STAIR_LANDING = 0.7;
/** Half-width of the channel the open stair and its side walls occupy. */
export const HOT_SPRING_STAIR_SLOT = STAIR_HALF_WIDTH + STAIR_WALL;
const UPPER_BATHS = HOT_SPRING_BATHS.slice(1);
/** One stone stair climbs between the two cascades, from the back of the first deck to where the upper decks meet. */
export const HOT_SPRING_STAIRS = [{ x: 0, startZ: HOT_SPRING.z + ROCK_RADIUS, endZ: UPPER_BATHS[0].z + 2.6, topY: HOT_SPRING.deckY + UPPER_BATHS[0].lift }];
/** Level stone at the head of the stair, reaching both upper decks. */
export const HOT_SPRING_CROSSING = { halfWidth: HOT_SPRING_STAIR_SLOT + 0.05, minZ: HOT_SPRING_STAIRS[0].endZ - STAIR_LANDING, maxZ: HOT_SPRING_STAIRS[0].endZ + 1.1 };
/** Rock around each upper bath, measured from its centre. The two meet along x = 0. */
export const HOT_SPRING_UPPER_SHELL = { halfWidth: 7.6, frontMargin: 7.6, backMargin: 8.6 } as const;
/** Last walkable line of the map. BeachMap.BEACH.maxZ on the server matches it. */
export const HOT_SPRING_BACK = Math.max(...ONSEN_BATHS.map((bath) => bath.z)) + HOT_SPRING.deckRadius + 0.8;
// Visitors can step off the open sea-facing deck onto this much of the natural rock.
const SEA_LEDGE_RADIUS = 9.4, SEA_ROCK_Y = HOT_SPRING.deckY - 0.17, SEA_ROCK_DROP = 1.6, SEA_HALF_RUN = 1 / Math.tan(Math.PI / 9);
const ROCK_HALF_WIDTH = 25, ROCK_FRONT = 32.65;
const HALF_PASSAGE = 0.725;
const HEADROOM = 2.45;
const GAP_ANGLE = 0.38;
const TAU = Math.PI * 2;
const LAST_FLIGHT = HOT_SPRING_PATH.length - 2;
const ARRIVAL_LANDING_EDGE = 6.65;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const degrees = (n: number) => n * Math.PI / 180;
const apart = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const angleTowardFirst = (center: { x: number; z: number }) => Math.atan2(HOT_SPRING.z - center.z, HOT_SPRING.x - center.x);
const seaFacing = (angle: number) => Math.sin(angle) < -Math.sin(Math.PI / 9); // South-facing 140 degrees.
const stairAt = (x: number, z: number) => HOT_SPRING_STAIRS.find((stair) => Math.abs(x - stair.x) <= STAIR_HALF_WIDTH && z >= stair.startZ && z <= stair.endZ);
const entranceLanding = (x: number, z: number) => Math.abs(x - 6.5) <= HALF_PASSAGE && z >= 32.65 && z <= 34.225;
const atCrossing = (x: number, z: number) => Math.abs(x) <= HOT_SPRING_CROSSING.halfWidth && z >= HOT_SPRING_CROSSING.minZ && z <= HOT_SPRING_CROSSING.maxZ;

/** Each bath is a sloped bowl: a visitor can wade in from any direction. */
const BOWL_RUN = 0.97, BOWL_FLOOR_RADIUS = HOT_SPRING.poolRadius - BOWL_RUN, RIM_LIP = 0.07;
// The back wall of the first terrace: the curtain the upper baths pour over.
const TERRACE_WALL = 6.3, TERRACE_BARRIER = 0.33, TERRACE_BRINK = 0.75, SPILL_DEPTH = 0.52;
/** 0 at the side of the first bath, 90 degrees straight inland; mirrored left and right. */
export const hotSpringInlandBearing = (x: number, z: number) => Math.atan2(z - HOT_SPRING.z, Math.abs(x - HOT_SPRING.x));
/** How far the first terrace reaches along a bearing. It is pulled in where an upper bath stands behind it. */
export function hotSpringTerraceRim(bearing: number): number {
  const pulled = smooth((bearing - degrees(18)) / degrees(10)) * (1 - smooth((bearing - degrees(70)) / degrees(9)));
  return HOT_SPRING.deckRadius - (HOT_SPRING.deckRadius - TERRACE_WALL) * pulled;
}
/** Bath whose level a point stands on, or -1. The first terrace ends at its wall even where an upper deck overlaps it in plan. */
function terraceBath(x: number, z: number): number {
  const first = Math.hypot(x - HOT_SPRING.x, z - HOT_SPRING.z);
  const above = HOT_SPRING_BATHS.findIndex((bath, index) => index > 0 && Math.hypot(x - bath.x, z - bath.z) <= HOT_SPRING.deckRadius);
  if (above > 0 && (first > HOT_SPRING.deckRadius || first > hotSpringTerraceRim(hotSpringInlandBearing(x, z)) + TERRACE_BARRIER)) return above;
  return first <= HOT_SPRING.deckRadius ? 0 : -1;
}
/** Where an upper bath pours out, its lip dips below the deck so the water can leave over it. */
export function hotSpringSpillDepth(bath: { x: number; z: number }, x: number, z: number): number {
  const length = Math.hypot(HOT_SPRING.x - bath.x, HOT_SPRING.z - bath.z);
  if (length < 1e-6) return 0;
  const ax = (HOT_SPRING.x - bath.x) / length, az = (HOT_SPRING.z - bath.z) / length, px = x - bath.x, pz = z - bath.z;
  if (px * ax + pz * az < HOT_SPRING.poolRadius - 0.4) return 0;
  return SPILL_DEPTH * (1 - smooth((Math.abs(px * az - pz * ax) - 1.25) / 0.45));
}
/** How far an upper deck reaches along an angle before the terrace edge or the stair opening cuts it off. */
function upperDeckReach(bath: { x: number; z: number }, angle: number): number {
  for (let radius = HOT_SPRING.poolRadius; radius < HOT_SPRING.deckRadius; radius += 0.04) {
    const x = bath.x + Math.cos(angle) * radius, z = bath.z + Math.sin(angle) * radius;
    if (Math.hypot(x - HOT_SPRING.x, z - HOT_SPRING.z) <= hotSpringTerraceRim(hotSpringInlandBearing(x, z)) + TERRACE_BRINK) return radius;
    if (Math.abs(x) < STAIR_HALF_WIDTH + 0.02 && z < HOT_SPRING_CROSSING.minZ) return radius;
  }
  return HOT_SPRING.deckRadius;
}

const PASSAGES: readonly WallRect[] = HOT_SPRING_PATH.slice(0, -1).map((a, index) => {
  const b = HOT_SPRING_PATH[index + 1];
  return { minX: Math.min(a.x, b.x) - HALF_PASSAGE, maxX: Math.max(a.x, b.x) + HALF_PASSAGE, minZ: Math.min(a.z, b.z) - HALF_PASSAGE, maxZ: Math.max(a.z, b.z) + HALF_PASSAGE };
});

/** Level landings at each turn make the two intersecting ramps share one height. */
function passageHeight(x: number, z: number): number | null {
  for (let index = 0; index < HOT_SPRING_PATH.length - 1; index++) {
    const a = HOT_SPRING_PATH[index], b = HOT_SPRING_PATH[index + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const along = (x - a.x) * dx + (z - a.z) * dz;
    const across = Math.abs((x - a.x) * dz - (z - a.z) * dx);
    const startExtension = HALF_PASSAGE;
    const endExtension = index === LAST_FLIGHT ? 0 : HALF_PASSAGE;
    if (across > HALF_PASSAGE || along < -startExtension || along > length + endExtension) continue;
    const startLanding = HALF_PASSAGE;
    const endLanding = index === LAST_FLIGHT ? 0.9 : HALF_PASSAGE;
    const t = clamp((along - startLanding) / (length - startLanding - endLanding), 0, 1);
    return a.y + (b.y - a.y) * t;
  }
  return null;
}

/** Null leaves the existing beach or shelter ground calculation in charge. */
export function hotSpringFloorHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const corridor = passageHeight(x, z);
  if (corridor !== null) return corridor;
  if (Math.abs(x - 6.5) <= HALF_PASSAGE && z >= 32.2 && z <= 33.5) return 0;
  if (Math.abs(z - HOT_SPRING.z) <= 1.2 && x >= 5.95 && x <= 6.65) return HOT_SPRING.deckY;
  const stair = stairAt(x, z);
  if (stair) {
    const t = clamp((z - stair.startZ - STAIR_LANDING) / (stair.endZ - stair.startZ - 2 * STAIR_LANDING), 0, 1);
    return HOT_SPRING.deckY + (stair.topY - HOT_SPRING.deckY) * t;
  }
  if (atCrossing(x, z)) return HOT_SPRING_STAIRS[0].topY;
  const owner = terraceBath(x, z);
  if (owner >= 0) {
    const bath = HOT_SPRING_BATHS[owner], radius = Math.hypot(x - bath.x, z - bath.z);
    if (radius < HOT_SPRING.poolRadius) {
      const down = (HOT_SPRING.poolRadius - radius) / BOWL_RUN;
      if (down >= 1) return bath.lift + HOT_SPRING.floorY;
      const scale = HOT_SPRING.poolRadius / radius;
      const rim = HOT_SPRING.deckY - (owner ? hotSpringSpillDepth(bath, bath.x + (x - bath.x) * scale, bath.z + (z - bath.z) * scale) : 0);
      return bath.lift + rim + (HOT_SPRING.floorY - rim) * down;
    }
    return bath.lift + HOT_SPRING.deckY - (owner ? hotSpringSpillDepth(bath, x, z) : 0);
  }
  return seaLedgeHeight(x, z);
}

/** Follows the sea-facing rock in hot-spring-landscape, without its few centimetres of surface ripple. */
function seaLedgeHeight(x: number, z: number): number | null {
  const dz = z - HOT_SPRING.z, radius = Math.hypot(x, dz);
  if (radius <= HOT_SPRING.deckRadius || radius > SEA_LEDGE_RADIUS || dz >= 0 || -dz / radius <= Math.sin(Math.PI / 9)) return null;
  const edge = Math.min(Math.abs(x) < 1e-8 ? Infinity : ROCK_HALF_WIDTH * radius / Math.abs(x), (HOT_SPRING.z - ROCK_FRONT) * radius / -dz);
  const t = clamp((radius - ROCK_RADIUS) / (edge - ROCK_RADIUS), 0, 1);
  return SEA_ROCK_Y - SEA_ROCK_DROP * t * t * (3 - 2 * t);
}

/** Index of the bath whose deck contains the point, or -1. */
export function hotSpringBathIndex(x: number, z: number): number {
  return terraceBath(x, z);
}

/** Distance to the nearest bath centre. Stairs count as inside, so a robe stays on between baths. */
export function hotSpringBathDistance(x: number, z: number): number {
  return stairAt(x, z) ? 0 : Math.min(...HOT_SPRING_BATHS.map((bath) => Math.hypot(x - bath.x, z - bath.z)));
}

/** True while standing in any bath's water, whatever height that bath sits at. */
export function hotSpringInWater(x: number, z: number): boolean {
  const bath = HOT_SPRING_BATHS.find((candidate) => Math.hypot(x - candidate.x, z - candidate.z) < HOT_SPRING.poolRadius);
  return Boolean(bath) && (hotSpringFloorHeight(x, z) ?? Infinity) < HOT_SPRING.waterY + bath!.lift;
}

export function hotSpringCeilingHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (entranceLanding(x, z)) return HEADROOM;
  if (x < 6.8 && z > 40) return null;
  const floor = passageHeight(x, z);
  return floor === null ? null : floor + HEADROOM;
}

/** Half-width of the seaward ledge across one z band, conservative so every point inside has a floor. */
function seaLedgeHalfWidth(minZ: number, maxZ: number): number {
  const near = HOT_SPRING.z - maxZ, far = HOT_SPRING.z - minZ;
  if (near <= 0 || far >= SEA_LEDGE_RADIUS) return 0;
  return Math.min(Math.sqrt(SEA_LEDGE_RADIUS ** 2 - far ** 2), near * SEA_HALF_RUN);
}

function buildColliders(): WallRect[] {
  const walls: WallRect[] = [];
  // The raised retreat can only be entered through the stairs. These broad outer
  // strips close the ground-level shortcuts without a per-frame polygon query.
  const approach = { minX: 5.775, maxX: 7.225, minZ: 32.2, maxZ: 33.5 };
  const stairways = HOT_SPRING_STAIRS.map((stair) => ({ minX: stair.x - STAIR_HALF_WIDTH, maxX: stair.x + STAIR_HALF_WIDTH, minZ: stair.startZ, maxZ: stair.endZ }));
  const crossing = { minX: -HOT_SPRING_CROSSING.halfWidth, maxX: HOT_SPRING_CROSSING.halfWidth, minZ: HOT_SPRING_CROSSING.minZ, maxZ: HOT_SPRING_CROSSING.maxZ };
  const passages = [...PASSAGES, approach, ...stairways, crossing];
  const cutSet = new Set([32.65, HOT_SPRING_BACK + 0.5]);
  for (const passage of passages) for (const z of [passage.minZ, passage.maxZ]) if (z > 32.65) cutSet.add(z);
  for (let z = HOT_SPRING.z - SEA_LEDGE_RADIUS - 0.5; z < HOT_SPRING.z - HOT_SPRING.deckRadius; z += 0.5) cutSet.add(z);
  for (const bath of HOT_SPRING_BATHS) {
    cutSet.add(bath.z - HOT_SPRING.deckRadius);
    cutSet.add(bath.z + HOT_SPRING.deckRadius);
    for (let z = bath.z - 6.9; z < bath.z + HOT_SPRING.deckRadius; z += 0.5) cutSet.add(z);
  }
  const cuts = Array.from(cutSet).sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const minZ = cuts[i], maxZ = cuts[i + 1], midZ = (minZ + maxZ) / 2;
    const intervals: [number, number][] = [];
    for (const passage of passages) if (midZ >= passage.minZ && midZ <= passage.maxZ) intervals.push([passage.minX, passage.maxX]);
    for (const bath of HOT_SPRING_BATHS) {
      const furthestZ = Math.max(Math.abs(minZ - bath.z), Math.abs(maxZ - bath.z));
      if (furthestZ < HOT_SPRING.deckRadius) {
        const width = Math.sqrt(HOT_SPRING.deckRadius ** 2 - furthestZ ** 2);
        intervals.push([bath.x - width, bath.x + width]);
      }
    }
    const ledge = seaLedgeHalfWidth(minZ, maxZ);
    if (ledge > 0) intervals.push([-ledge, ledge]);
    intervals.sort((a, b) => a[0] - b[0]);
    let cursor = -22.5;
    for (const [left, right] of intervals) {
      if (left > cursor) walls.push({ minX: cursor, maxX: left, minZ, maxZ });
      cursor = Math.max(cursor, right);
    }
    if (cursor < 22.5) walls.push({ minX: cursor, maxX: 22.5, minZ, maxZ });
  }
  // The terrace wall splits the two levels where their decks overlap in plan; the stair keeps its own sides.
  for (const side of [-1, 1]) {
    for (let bearing = degrees(20); bearing <= degrees(80); bearing += degrees(2.5)) {
      const radius = hotSpringTerraceRim(bearing) + TERRACE_BARRIER, x = side * Math.cos(bearing) * radius, z = HOT_SPRING.z + Math.sin(bearing) * radius;
      walls.push({ minX: x - 0.23, maxX: x + 0.23, minZ: z - 0.23, maxZ: z + 0.23 });
    }
    const inner = side * STAIR_HALF_WIDTH, outer = side * (STAIR_HALF_WIDTH + 0.25);
    walls.push({ minX: Math.min(inner, outer), maxX: Math.max(inner, outer), minZ: HOT_SPRING_STAIRS[0].startZ, maxZ: HOT_SPRING_CROSSING.minZ });
  }
  return walls;
}

export const HOT_SPRING_COLLIDERS: readonly WallRect[] = buildColliders();

type Materials = { stone?: THREE.MeshStandardMaterial; wood?: THREE.MeshStandardMaterial };
type Transform = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw?: number; tilt?: number };

/** Three's Material.copy deliberately omits custom shader hooks. */
function cloneSurface(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const clone = source.clone();
  clone.onBeforeCompile = source.onBeforeCompile;
  clone.customProgramCacheKey = source.customProgramCacheKey;
  return clone;
}

function horizontalRing(inner: number, outer: number | ((angle: number, center: { x: number; z: number }) => number), y: number, gap = 0, centers: readonly { x: number; z: number }[] = [HOT_SPRING]): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const start = gap / 2, span = TAU - gap, segments = 96;
  centers.forEach((center, ring) => {
    for (let i = 0; i <= segments; i++) {
      const angle = start + span * i / segments;
      for (const radius of [inner, typeof outer === "number" ? outer : outer(angle, center)]) {
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        positions.push(x + center.x, y, z + center.z);
        uvs.push(x / 2, z / 2);
      }
      if (i < segments) {
        const a = ring * (segments + 1) * 2 + i * 2;
        indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Floors the deck's gap where the tunnel arrives, leaving room for its stone landing.
 */
function entryDeck(): THREE.BufferGeometry {
  const half = GAP_ANGLE / 2 + 0.02, stairHalf = 0.765, rim = HOT_SPRING.deckRadius;
  const spoke = (radius: number, side: number) => new THREE.Vector2(Math.cos(half) * radius, side * Math.sin(half) * radius);
  const stairEdge = (side: number) => new THREE.Vector2(Math.sqrt(rim ** 2 - stairHalf ** 2), side * stairHalf);
  const wing = (side: number) => [spoke(4.57, side), spoke(rim, side)];
  const far = [
    stairEdge(1), new THREE.Vector2(6.65, stairHalf), new THREE.Vector2(6.65, 1.2), new THREE.Vector2(5.95, 1.2),
    new THREE.Vector2(5.95, -1.2), new THREE.Vector2(6.65, -1.2), new THREE.Vector2(6.65, -stairHalf), stairEdge(-1),
  ];
  const geometry = new THREE.ShapeGeometry(new THREE.Shape([...wing(1), ...far, ...wing(-1).reverse()]));
  geometry.rotateX(-Math.PI / 2);
  // Sits a hair under the ring and landing so their shared edges cannot flicker.
  geometry.translate(0, HOT_SPRING.deckY - 0.006, HOT_SPRING.z);
  const position = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  for (let index = 0; index < position.count; index++) uv.setXY(index, position.getX(index) / 2, (position.getZ(index) - HOT_SPRING.z) / 2);
  return geometry;
}

/** Sloped sides all the way round. The rim of an upper bath dips where it pours out. */
function bowlGeometry(baths: readonly { x: number; z: number; lift?: number }[]): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], segments = 96;
  baths.forEach((bath, ring) => {
    const lift = bath.lift ?? 0;
    for (let index = 0; index <= segments; index++) {
      const angle = index / segments * TAU, cos = Math.cos(angle), sin = Math.sin(angle);
      const topX = bath.x + cos * HOT_SPRING.poolRadius, topZ = bath.z + sin * HOT_SPRING.poolRadius;
      positions.push(topX, HOT_SPRING.deckY + lift - hotSpringSpillDepth(bath, topX, topZ), topZ, bath.x + cos * BOWL_FLOOR_RADIUS, HOT_SPRING.floorY + lift, bath.z + sin * BOWL_FLOOR_RADIUS);
      uvs.push(cos * HOT_SPRING.poolRadius / 2, sin * HOT_SPRING.poolRadius / 2, cos * BOWL_FLOOR_RADIUS / 2, sin * BOWL_FLOOR_RADIUS / 2);
      if (index < segments) {
        const a = ring * (segments + 1) * 2 + index * 2;
        indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Cross-section of the rock behind each waterfall, foot to back: offset from the terrace rim, and height.
const CLIFF: readonly (readonly [number, number])[] = [
  [-0.08, 17.98], [0.02, 18.5], [0.1, 19.2], [0.24, 20], [0.4, 20.8], [0.58, 21.5], [0.72, 21.9], [0.75, 21.99], [1, 22], [1.6, 21.7], [1.7, 20],
];
const CLIFF_FACE_STATIONS = 7;
const bathOnSide = (side: number) => UPPER_BATHS.find((bath) => Math.sign(bath.x) === side) ?? UPPER_BATHS[0];

function cliffPoint(bearing: number, station: number, side: number) {
  const [offset, height] = CLIFF[station];
  const relief = station < CLIFF_FACE_STATIONS ? Math.sin(bearing * 23 + height * 1.3) * 0.1 + Math.sin(bearing * 61 - height * 2.1 + 1.7) * 0.05 : 0;
  const radius = hotSpringTerraceRim(bearing) + offset + relief;
  const x = side * Math.cos(bearing) * radius, z = HOT_SPRING.z + Math.sin(bearing) * radius;
  // The outer ends sink to the height of the hill instead of ending in mid-air.
  const standing = 0.4 + 0.6 * smooth((bearing - degrees(16)) / degrees(10)), foot = CLIFF[0][1];
  return { x, y: foot + (height - foot) * standing - hotSpringSpillDepth(bathOnSide(side), x, z) * smooth((height - 21.1) / 0.75), z };
}

/** The rock face behind each fall, and the worn stone of the spillway it leaves the upper bath through. */
function cliffGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const push = (x: number, y: number, z: number) => { positions.push(x, y, z); uvs.push(x / 12, (z + y * 0.35) / 12); };
  const columns = 110, from = degrees(16), to = degrees(81), depth = CLIFF.length;
  for (const side of [-1, 1]) {
    const base = positions.length / 3;
    for (let column = 0; column <= columns; column++) {
      const bearing = from + (to - from) * column / columns;
      for (let station = 0; station < depth; station++) {
        const point = cliffPoint(bearing, station, side);
        push(point.x, point.y, point.z);
        if (column === columns || station === depth - 1) continue;
        const a = base + column * depth + station, b = a + 1, c = a + depth, d = c + 1;
        if (side > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const segments = 60, rings = 6, halfSpan = degrees(36);
  for (const bath of UPPER_BATHS) {
    const base = positions.length / 3, middle = angleTowardFirst(bath);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = middle - halfSpan + 2 * halfSpan * segment / segments;
      const taper = smooth((halfSpan - Math.abs(angle - middle)) / degrees(12));
      const outer = HOT_SPRING.poolRadius + (upperDeckReach(bath, angle) - HOT_SPRING.poolRadius) * taper;
      for (let ring = 0; ring <= rings; ring++) {
        const radius = HOT_SPRING.poolRadius + (outer - HOT_SPRING.poolRadius) * ring / rings;
        const x = bath.x + Math.cos(angle) * radius, z = bath.z + Math.sin(angle) * radius;
        push(x, HOT_SPRING.deckY + bath.lift + 0.012 - hotSpringSpillDepth(bath, x, z), z);
        if (segment === segments || ring === rings) continue;
        const a = base + segment * (rings + 1) + ring, b = a + 1, c = a + rings + 1, d = c + 1;
        indices.push(a, d, b, a, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Each fall leaves the lip and drops in a free arc into the first bath, clear of the walkway behind it.
const FALL_LANDING = 4.05;
/** Water from each upper bath, over its lip, through the air and into the first bath. */
function cascadeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], flows: number[] = [], foams: number[] = [], indices: number[] = [];
  const water = HOT_SPRING.waterY, upperWater = water + UPPER_BATHS[0].lift;
  const polar = (bearing: number, side: number, radius: number, y: number) => ({ x: side * Math.cos(bearing) * radius, y, z: HOT_SPRING.z + Math.sin(bearing) * radius, radius });
  const brink = (bearing: number) => hotSpringTerraceRim(bearing) + TERRACE_BRINK;
  const pourRadius = (bearing: number, side: number) => {
    const bath = bathOnSide(side);
    for (let radius = 6.8; radius < 10; radius += 0.02) {
      if (Math.hypot(side * Math.cos(bearing) * radius - bath.x, HOT_SPRING.z + Math.sin(bearing) * radius - bath.z) < HOT_SPRING.poolRadius - 0.3) return radius;
    }
    return 8;
  };
  type Stop = { at: (bearing: number, side: number) => { x: number; y: number; z: number; radius: number }; halfWidth: number; foam: number; fade: number };
  const fixed = (radius: number, y: number, halfWidth: number, foam: number, fade = 1): Stop => ({ at: (bearing, side) => polar(bearing, side, radius, y), halfWidth, foam, fade });
  const arcRows = 16;
  const stops: Stop[] = [
    fixed(FALL_LANDING - 0.7, water + 0.006, 1.2, 0.2, 0),
    fixed(FALL_LANDING - 0.3, water + 0.01, 1.7, 0.8),
    ...Array.from({ length: arcRows + 1 }, (_, row): Stop => {
      const fall = 1 - row / arcRows;
      return {
        at: (bearing, side) => polar(bearing, side, brink(bearing) - (brink(bearing) - FALL_LANDING) * fall, upperWater + 0.012 - (upperWater + 0.012 - water - 0.014) * fall * fall),
        halfWidth: 1.3 + 0.45 * fall, foam: 0.25 + 0.75 * smooth(fall / 0.35), fade: 1,
      };
    }),
    { at: (bearing, side) => polar(bearing, side, brink(bearing) + 0.25, upperWater + 0.012), halfWidth: 1.3, foam: 0.15, fade: 1 },
    { at: (bearing, side) => polar(bearing, side, pourRadius(bearing, side), upperWater + 0.004), halfWidth: 1.2, foam: 0.05, fade: 0 },
  ];
  const across = 30;
  for (const side of [-1, 1]) {
    const bath = bathOnSide(side), axis = Math.atan2(bath.z - HOT_SPRING.z, Math.abs(bath.x));
    const centre = stops.map((stop) => stop.at(axis, side)), distances = centre.map(() => 0);
    for (let index = centre.length - 2; index >= 0; index--) {
      distances[index] = distances[index + 1] + Math.hypot(centre[index].x - centre[index + 1].x, centre[index].y - centre[index + 1].y, centre[index].z - centre[index + 1].z);
    }
    const base = positions.length / 3;
    stops.forEach((stop, row) => {
      for (let column = 0; column <= across; column++) {
        const width = -1 + 2 * column / across, point = stop.at(axis + width * stop.halfWidth / centre[row].radius, side);
        positions.push(point.x, point.y, point.z);
        flows.push(width, distances[row], stop.fade);
        foams.push(stop.foam);
        if (row === stops.length - 1 || column === across) continue;
        const a = base + row * (across + 1) + column;
        indices.push(a, a + 1, a + across + 1, a + 1, a + across + 2, a + across + 1);
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("cascadeFlow", new THREE.Float32BufferAttribute(flows, 3));
  geometry.setAttribute("cascadeFoam", new THREE.Float32BufferAttribute(foams, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Small procedural meshes share textures with the cove; no extra asset download. */
export function buildHotSpring(scene: THREE.Scene, materials: Materials = {}) {
  const group = new THREE.Group();
  group.name = "hidden-hillside-onsen";
  scene.add(group);
  const stone = materials.stone ? cloneSurface(materials.stone) : new THREE.MeshStandardMaterial({ color: 0x77766b, roughness: 0.96 });
  stone.color.multiplyScalar(0.83);
  stone.roughness = 0.96;
  const wetStone = cloneSurface(stone);
  wetStone.color.multiplyScalar(0.68);
  wetStone.roughness = 0.48;
  const caveStone = cloneSurface(stone);
  caveStone.emissive.set(0x60432a);
  caveStone.emissiveIntensity = 0.2;
  const wood = materials.wood ? cloneSurface(materials.wood) : new THREE.MeshStandardMaterial({ color: 0x513925, roughness: 0.78 });
  wood.color.multiply(new THREE.Color(0x8c6545));
  wood.roughness = 0.72;
  const deckWood = cloneSurface(wood);
  // The wood photo is dark: a plain brown tint multiplied it to near black. Values above 1 lift it to warm boards.
  deckWood.color.setRGB(2.4, 1.75, 1.2);
  const fenceWood = cloneSurface(materials.wood ?? wood);
  fenceWood.color.set(0x9c7444);
  fenceWood.roughness = 0.78;
  const bamboo = cloneSurface(fenceWood);
  bamboo.color.set(0xb99b6c);
  const fencePosts = cloneSurface(fenceWood);
  fencePosts.color.set(0x805932);
  // One quiet tone under the water, so neither the bench nor the bowl shows through as a shape.
  const poolStone = cloneSurface(stone);
  poolStone.color.setRGB(0.5, 0.72, 0.76);
  poolStone.roughness = 0.55;
  poolStone.side = THREE.DoubleSide;
  const cliffFaces = cloneSurface(stone);
  cliffFaces.side = THREE.DoubleSide;
  const brass = new THREE.MeshStandardMaterial({ color: 0xa9783f, metalness: 0.6, roughness: 0.43 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffbc74, toneMapped: false });
  const shadow = new THREE.MeshStandardMaterial({ color: 0x272825, roughness: 1 });
  const clock = { value: 0 }, darkness = { value: 1 };
  const dummy = new THREE.Object3D();
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.receiveShadow = false;
    object.castShadow = false;
    parent.add(object);
    return object;
  };
  const instances = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: Transform[], parent: THREE.Object3D = group) => {
    const object = new THREE.InstancedMesh(geometry, material, transforms.length);
    object.name = name;
    for (const [index, t] of transforms.entries()) {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.tilt ?? 0, t.yaw ?? 0, 0, "YXZ");
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      object.setMatrixAt(index, dummy.matrix);
    }
    object.computeBoundingSphere();
    parent.add(object);
    return object;
  };

  // Solid backing closes every flight and corner; rocks add detail on top of it.
  const rockTransforms: Transform[] = [], treadTransforms: Transform[] = [], lanterns: Transform[] = [];
  const backingWalls: Transform[] = [], backingCeilings: Transform[] = [], backingFloors: Transform[] = [], landings: Transform[] = [];
  const floorPositions: number[] = [], floorUvs: number[] = [], floorIndices: number[] = [];
  for (let flight = 0; flight <= LAST_FLIGHT; flight++) {
    const a = HOT_SPRING_PATH[flight], b = HOT_SPRING_PATH[flight + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    // Two different stones on one plane flicker as the camera moves: the arrival landing alone floors the last stretch.
    const distance = flight === LAST_FLIGHT ? length - (ARRIVAL_LANDING_EDGE - b.x) : length;
    const steps = Math.ceil(distance / 0.26);
    for (let index = 0; index <= steps; index++) {
      const along = distance * index / steps, x = a.x + dx * along, z = a.z + dz * along;
      const y = passageHeight(x, z) ?? b.y;
      const offset = floorPositions.length / 3;
      floorPositions.push(x - dz * HALF_PASSAGE, y, z + dx * HALF_PASSAGE, x + dz * HALF_PASSAGE, y, z - dx * HALF_PASSAGE);
      floorUvs.push(0, along, 1, along);
      if (index < steps) floorIndices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
      treadTransforms.push({ x, y: y + 0.012, z, sx: 1.44, sy: 0.018, sz: 0.035, yaw: Math.atan2(dx, dz) });
      if (index < steps) {
        const nextAlong = distance * (index + 1) / steps, stepLength = nextAlong - along;
        const nextX = a.x + dx * nextAlong, nextZ = a.z + dz * nextAlong, nextY = passageHeight(nextX, nextZ) ?? b.y;
        const midX = (x + nextX) / 2, midZ = (z + nextZ) / 2, midY = (y + nextY) / 2;
        const yaw = Math.atan2(dx, dz), tilt = -Math.atan2(nextY - y, stepLength);
        const slopedLength = Math.hypot(stepLength, nextY - y) + 0.045;
        backingFloors.push({ x: midX, y: midY - 0.17, z: midZ, sx: 1.53, sy: 0.22, sz: slopedLength, yaw, tilt });
        if (hotSpringCeilingHeight(midX, midZ) !== null) {
          backingCeilings.push({ x: midX, y: midY + HEADROOM + 0.18, z: midZ, sx: 1.97, sy: 0.35, sz: slopedLength, yaw, tilt });
          for (const side of [-1, 1]) {
            const sideX = midX + dz * side * 0.865, sideZ = midZ - dx * side * 0.865;
            if (passageHeight(sideX, sideZ) !== null || (flight === LAST_FLIGHT && midX < 6.95)) continue;
            // Northbound visitors enter the first eastbound flight through this
            // side. Clip the backing exactly to the L-shaped landing boundary.
            if (flight === 0 && side === 1 && x < 7.225) {
              const startX = Math.max(x, 7.225);
              if (nextX <= startX) continue;
              const centerX = (startX + nextX) / 2, centerY = passageHeight(centerX, z) ?? 0;
              backingWalls.push({ x: centerX, y: centerY + HEADROOM / 2, z: sideZ, sx: 0.28, sy: HEADROOM + Math.abs(nextY - y) + 0.3, sz: nextX - startX + 0.02, yaw });
            } else {
              backingWalls.push({ x: sideX, y: midY + HEADROOM / 2, z: sideZ, sx: 0.28, sy: HEADROOM + Math.abs(nextY - y) + 0.3, sz: stepLength + 0.045, yaw });
            }
          }
        }
      }
      if (index % 3 === 0 && hotSpringCeilingHeight(x, z) !== null) {
        for (const side of [-1, 1]) {
          const sideX = x + dz * side * 1.18, sideZ = z - dx * side * 1.18;
          // Skip the inner face of a corner so the next flight remains open.
          if (passageHeight(sideX, sideZ) !== null || (flight === LAST_FLIGHT && x < 6.95) || (flight === 0 && side === 1 && x < 7.55)) continue;
          rockTransforms.push({ x: sideX, y: y + 1.3, z: sideZ, sx: 0.4, sy: 1.62, sz: 0.4, yaw: index * 0.83 + flight });
        }
        rockTransforms.push({ x, y: y + HEADROOM + 0.42, z, sx: 1.32, sy: 0.4, sz: 0.55, yaw: Math.atan2(dx, dz) });
      }
      if (index % 10 === 3) lanterns.push({ x: x + dz * 0.59, y: y + 0.38, z: z - dx * 0.59, sx: 0.15, sy: 0.3, sz: 0.15 });
    }
  }
  const stairs = new THREE.BufferGeometry();
  stairs.setAttribute("position", new THREE.Float32BufferAttribute(floorPositions, 3));
  stairs.setAttribute("uv", new THREE.Float32BufferAttribute(floorUvs, 2));
  stairs.setIndex(floorIndices);
  stairs.computeVertexNormals();
  mesh("onsen-continuous-stone-stairs", stairs, caveStone);
  for (const point of HOT_SPRING_PATH.slice(1, -1)) {
    landings.push({ x: point.x, y: point.y - 0.048, z: point.z, sx: 1.45, sy: 0.12, sz: 1.45 });
    backingCeilings.push({ x: point.x, y: point.y + HEADROOM + 0.18, z: point.z, sx: 1.99, sy: 0.35, sz: 1.99 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const half of [-1, 1]) {
        const x = point.x + dx * HALF_PASSAGE - dz * half * HALF_PASSAGE / 2;
        const z = point.z + dz * HALF_PASSAGE + dx * half * HALF_PASSAGE / 2;
        if (passageHeight(x + dx * 0.06, z + dz * 0.06) !== null) continue;
        backingWalls.push({ x: x + dx * 0.15, y: point.y + HEADROOM / 2, z: z + dz * 0.15, sx: dx ? 0.28 : HALF_PASSAGE + 0.04, sy: HEADROOM + 0.3, sz: dz ? 0.28 : HALF_PASSAGE + 0.04 });
      }
    }
  }
  // The concealed mouth turns right. Its west and north ends are solid, while
  // only the south-facing opening at z32.65 remains open behind the shrubs.
  landings.push({ x: 6.5, y: -0.048, z: (32.65 + 34.225) / 2, sx: 1.45, sy: 0.12, sz: 34.225 - 32.65 });
  backingCeilings.push({ x: 6.5, y: HEADROOM + 0.18, z: (32.65 + 34.225) / 2, sx: 2.01, sy: 0.35, sz: 34.225 - 32.65 + 0.3 });
  backingWalls.push(
    { x: 5.635, y: HEADROOM / 2, z: (32.65 + 34.225) / 2, sx: 0.28, sy: HEADROOM + 0.3, sz: 34.225 - 32.65 + 0.04 },
    { x: (5.775 + 6.5) / 2, y: HEADROOM / 2, z: 34.365, sx: 0.725 + 0.04, sy: HEADROOM + 0.3, sz: 0.28 },
    { x: 7.365, y: HEADROOM / 2, z: (32.65 + 32.775) / 2, sx: 0.28, sy: HEADROOM + 0.3, sz: 0.125 + 0.04 },
  );
  const backingBox = new THREE.BoxGeometry(1, 1, 1);
  instances("onsen-level-turn-landings", backingBox, caveStone, landings);
  instances("onsen-continuous-floor-backing", backingBox, caveStone, backingFloors);
  instances("onsen-continuous-wall-backing", backingBox, caveStone, backingWalls);
  instances("onsen-continuous-ceiling-backing", backingBox, caveStone, backingCeilings);
  instances("onsen-stair-tread-edges", new THREE.BoxGeometry(1, 1, 1), wetStone, treadTransforms);
  instances("onsen-cave-vault", new THREE.IcosahedronGeometry(1, 1), caveStone, rockTransforms);

  const shapedRim = (angle: number) => hotSpringTerraceRim(Math.atan2(Math.sin(angle), Math.abs(Math.cos(angle))));
  mesh("onsen-open-sky-deck", horizontalRing(4.57, shapedRim, HOT_SPRING.deckY, GAP_ANGLE), deckWood);
  mesh("onsen-entry-deck-closure", entryDeck(), deckWood);
  mesh("onsen-submerged-stone-floor", horizontalRing(0, BOWL_FLOOR_RADIUS + 0.02, HOT_SPRING.floorY), poolStone);
  mesh("onsen-pool-inner-wall", bowlGeometry([HOT_SPRING]), poolStone);
  const arrival = mesh("onsen-arrival-landing", new THREE.BoxGeometry(0.7, 0.12, 2.4), wetStone);
  arrival.position.set(6.3, HOT_SPRING.deckY - 0.048, 45);

  const coreHeight = HOT_SPRING.floorY - 0.05;
  const foundationCore = mesh("onsen-cliff-core", new THREE.CylinderGeometry(4.57, 4.8, coreHeight, 48), stone);
  foundationCore.position.set(0, coreHeight / 2, 45);
  const cliffBacking = mesh("onsen-continuous-cliff-skirt", new THREE.CylinderGeometry(7.12, 7.18, HOT_SPRING.deckY, 64, 1, true, Math.PI / 2 + GAP_ANGLE / 2, TAU - GAP_ANGLE), stone);
  cliffBacking.position.set(0, HOT_SPRING.deckY / 2 - 0.04, 45);

  // The back of the first deck belongs to the waterfalls: no screen, lamp or strip stands in front of them.
  const rearOpen = (angle: number) => Math.atan2(Math.sin(angle), Math.abs(Math.cos(angle))) > degrees(16);
  const rim: Transform[] = [], slats: Transform[] = [], posts: Transform[] = [], rails: Transform[] = [], seams: Transform[] = [], strips: Transform[] = [];
  for (let index = 0; index < 48; index++) {
    const angle = index * TAU / 48, x = Math.cos(angle), z = Math.sin(angle);
    // A low lip only: visitors step over it from any side.
    rim.push({ x: x * 4.8, y: HOT_SPRING.deckY + 0.04, z: 45 + z * 4.8, sx: 0.5, sy: RIM_LIP, sz: 0.38, yaw: -angle });
    if ((x > 0.85 && Math.abs(z * 7.1) < 1.25) || rearOpen(angle)) continue;
    // Warm edge lighting sits below the rail, rather than shining into the eyes.
    if (index % 3 === 0) strips.push({ x: x * 6.92, y: HOT_SPRING.deckY + 0.035, z: 45 + z * 6.92, sx: 0.82, sy: 0.025, sz: 0.035, yaw: Math.PI / 2 - angle });
  }
  for (let index = 0; index < 480; index++) {
    const angle = index * TAU / 480, x = Math.cos(angle), z = Math.sin(angle);
    if (seaFacing(angle) || (x > 0.85 && Math.abs(z * 7.25) < 1.15) || rearOpen(angle)) continue;
    slats.push({ x: x * 7.25, y: HOT_SPRING.deckY + 0.85, z: 45 + z * 7.25, sx: 0.075, sy: 1.62, sz: 0.075, yaw: angle * 1.7 });
  }
  for (let index = 0; index < 32; index++) {
    const angle = index * TAU / 32, x = Math.cos(angle), z = Math.sin(angle);
    if (seaFacing(angle) || (x > 0.85 && Math.abs(z * 7.25) < 1.5) || rearOpen(angle)) continue;
    posts.push({ x: x * 7.28, y: HOT_SPRING.deckY + 0.85, z: 45 + z * 7.28, sx: 0.18, sy: 1.78, sz: 0.18, yaw: Math.PI / 2 - angle });
    for (const y of [HOT_SPRING.deckY + 0.25, HOT_SPRING.deckY + 1.16, HOT_SPRING.deckY + 1.68]) rails.push({ x: x * 7.25, y, z: 45 + z * 7.25, sx: 1.45, sy: 0.085, sz: 0.14, yaw: Math.PI / 2 - angle });
    if (index % 4 === 1) lanterns.push({ x: x * 6.65, y: HOT_SPRING.deckY + 0.35, z: 45 + z * 6.65, sx: 0.22, sy: 0.48, sz: 0.22 });
  }
  for (let index = 0; index < 80; index++) {
    const angle = GAP_ANGLE / 2 + (TAU - GAP_ANGLE) * index / 79;
    const reach = shapedRim(angle) - 0.03, middle = (4.635 + reach) / 2;
    seams.push({ x: Math.cos(angle) * middle, y: HOT_SPRING.deckY + 0.003, z: 45 + Math.sin(angle) * middle, sx: 0.018, sy: 0.006, sz: reach - 4.635, yaw: Math.PI / 2 - angle });
  }
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  instances("onsen-natural-rim-stones", rockGeometry, stone, rim);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const screen = instances("onsen-bamboo-screen", new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true), bamboo, slats);
  const bambooTint = new THREE.Color();
  for (let index = 0; index < screen.count; index++) {
    const variation = 0.86 + (Math.sin(index * 7.19) * 0.5 + 0.5) * 0.14;
    screen.setColorAt(index, bambooTint.setRGB(variation, variation * 0.98, variation * 0.94));
  }
  instances("onsen-fence-posts", box, fencePosts, posts);
  instances("onsen-fence-rails", box, fenceWood, rails);
  instances("onsen-deck-board-seams", box, shadow, seams);
  instances("onsen-indirect-amber-strips", box, glow, strips);
  instances("onsen-lantern-frames", box, brass, lanterns);
  instances("onsen-lantern-warm-cores", box, glow, lanterns.map((t) => ({ ...t, sx: t.sx * 1.05, sy: t.sy * 0.68, sz: t.sz * 1.05 })));

  const quietWater = (center: string) => new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uNight: darkness },
    vertexShader: `varying vec3 vWorld; void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `
      uniform float uTime; uniform float uNight; varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz - ${center};
        float swell = sin(dot(p, vec2(0.83, 0.41)) * 1.7 + uTime * 0.31)
          + sin(dot(p, vec2(-0.37, 0.93)) * 2.3 - uTime * 0.23)
          + sin(dot(p, vec2(0.64, -0.77)) * 3.1 + uTime * 0.17);
        vec3 water = mix(vec3(0.10, 0.44, 0.50), vec3(0.035, 0.13, 0.16), uNight * 0.85) * (1.0 + swell * 0.018);
        water = mix(water, water * 1.12 + vec3(0.02, 0.03, 0.03), smoothstep(3.6, 4.3, length(p)) * 0.5);
        gl_FragColor = vec4(water, 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const water = mesh("onsen-quiet-mineral-water", horizontalRing(0, 4.58, HOT_SPRING.waterY), quietWater("vec2(0.0, 45.0)"));
  water.renderOrder = 3;

  const steamMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: clock },
    vertexShader: `
      uniform float uTime; attribute float steamPhase; varying vec2 vUv; varying float vLife;
      void main() {
        vUv = uv; float life = fract(uTime * 0.052 + steamPhase); vLife = sin(life * 3.14159265);
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 drift = vec3(sin(uTime * 0.09 + steamPhase * 9.0) * 0.35, life * 1.3, cos(uTime * 0.08 + steamPhase * 8.0) * 0.2);
        center += modelViewMatrix * vec4(drift, 0.0);
        center.xy += position.xy * vec2(1.3 + life, 1.15 + life * 1.4);
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vLife;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0; float edge = pow(max(0.0, 1.0 - dot(p, p)), 2.5);
        float wisps = 0.65 + 0.18 * sin(p.y * 10.0 + sin(p.x * 8.0 + uTime * 0.15) - uTime * 0.3);
        gl_FragColor = vec4(0.82, 0.85, 0.80, edge * wisps * vLife * 0.10);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const steamGeometry = new THREE.PlaneGeometry(1, 1);
  const phases = new Float32Array(12), vapor: Transform[] = [];
  for (let index = 0; index < 12; index++) {
    const angle = index * 2.39996, radius = 0.6 + Math.sqrt(index / 11) * 2.7;
    phases[index] = index / 12;
    vapor.push({ x: Math.cos(angle) * radius, y: HOT_SPRING.waterY + 0.3, z: 45 + Math.sin(angle) * radius, sx: 1, sy: 1, sz: 1 });
  }
  steamGeometry.setAttribute("steamPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const steam = instances("onsen-soft-rising-steam", steamGeometry, steamMaterial, vapor);
  steam.frustumCulled = false;
  steam.renderOrder = 4;
  const poolLight = new THREE.PointLight(0xffc184, 8, 16, 2);
  poolLight.name = "onsen-pool-warm-light";
  poolLight.position.set(0, HOT_SPRING.deckY + 2.7, 45);
  const tunnelLight = new THREE.PointLight(0xffb568, 12, 28, 2);
  tunnelLight.name = "onsen-tunnel-warm-light";
  tunnelLight.position.set(13, 11, 42);
  poolLight.castShadow = tunnelLight.castShadow = false;
  group.add(poolLight, tunnelLight);

  // The two upper baths. Terrace rock and the stair are always drawn; decks, water and the cascades
  // appear once a visitor is up on the hill. All of it borrows the two lights above.
  const upper = UPPER_BATHS, upperLift = upper[0].lift;
  const annex = new THREE.Group();
  annex.name = "onsen-upper-bath-details";
  group.add(annex);
  mesh("onsen-upper-decks", horizontalRing(4.57, (angle, center) => apart(angle, angleTowardFirst(center)) < degrees(24) ? 4.57 : upperDeckReach(center, angle), HOT_SPRING.deckY + upperLift, 0, upper), deckWood, annex);
  mesh("onsen-upper-submerged-floors", horizontalRing(0, BOWL_FLOOR_RADIUS + 0.02, HOT_SPRING.floorY + upperLift, 0, upper), poolStone, annex);
  mesh("onsen-upper-pool-walls", bowlGeometry(upper), poolStone, annex);
  const upperRim: Transform[] = [], upperSeams: Transform[] = [], upperStrips: Transform[] = [], upperLanterns: Transform[] = [], upperVapor: Transform[] = [];
  for (const bath of upper) {
    const deck = HOT_SPRING.deckY + bath.lift, front = angleTowardFirst(bath);
    for (let index = 0; index < 48; index++) {
      const angle = index * TAU / 48, x = Math.cos(angle), z = Math.sin(angle);
      if (apart(angle, front) >= degrees(18)) upperRim.push({ x: bath.x + x * 4.8, y: deck + 0.04, z: bath.z + z * 4.8, sx: 0.5, sy: RIM_LIP, sz: 0.38, yaw: -angle });
      if (index % 3 === 0 && apart(angle, front) >= degrees(36) && upperDeckReach(bath, angle) > 7.05) upperStrips.push({ x: bath.x + x * 6.92, y: deck + 0.035, z: bath.z + z * 6.92, sx: 0.82, sy: 0.025, sz: 0.035, yaw: Math.PI / 2 - angle });
    }
    for (let index = 0; index < 32; index++) {
      const angle = index * TAU / 32;
      if (index % 4 === 1 && apart(angle, front) >= degrees(36) && upperDeckReach(bath, angle) > 6.75) upperLanterns.push({ x: bath.x + Math.cos(angle) * 6.65, y: deck + 0.35, z: bath.z + Math.sin(angle) * 6.65, sx: 0.22, sy: 0.48, sz: 0.22 });
    }
    for (let index = 0; index < 80; index++) {
      const angle = index * TAU / 80;
      if (apart(angle, front) >= degrees(36) && upperDeckReach(bath, angle) > 7.1) upperSeams.push({ x: bath.x + Math.cos(angle) * 5.9, y: deck + 0.003, z: bath.z + Math.sin(angle) * 5.9, sx: 0.018, sy: 0.006, sz: 2.53, yaw: Math.PI / 2 - angle });
    }
    for (let index = 0; index < 8; index++) {
      const angle = index * 2.39996 + bath.x, radius = 0.6 + Math.sqrt(index / 7) * 2.7;
      upperVapor.push({ x: bath.x + Math.cos(angle) * radius, y: HOT_SPRING.waterY + bath.lift + 0.3, z: bath.z + Math.sin(angle) * radius, sx: 1, sy: 1, sz: 1 });
    }
  }
  // Mist where each fall lands.
  for (const bath of upper) {
    const landing = Math.atan2(bath.z - HOT_SPRING.z, bath.x - HOT_SPRING.x);
    for (const offset of [-0.22, 0, 0.22]) upperVapor.push({ x: Math.cos(landing + offset) * FALL_LANDING, y: HOT_SPRING.waterY + 0.35, z: HOT_SPRING.z + Math.sin(landing + offset) * FALL_LANDING, sx: 1, sy: 1, sz: 1 });
  }
  // The stair runs in a channel cut into the rock, between the two waterfalls.
  const stairFloors: Transform[] = [], stairTreads: Transform[] = [], stairWalls: Transform[] = [];
  const stairHead = HOT_SPRING_STAIRS[0].topY, crossing = HOT_SPRING_CROSSING;
  for (const stair of HOT_SPRING_STAIRS) {
    const length = stair.endZ - stair.startZ, steps = Math.ceil(length / 0.26), floorAt = (z: number) => hotSpringFloorHeight(stair.x, z) ?? HOT_SPRING.deckY;
    for (let index = 0; index <= steps; index++) {
      const z = stair.startZ + length * index / steps, y = floorAt(z);
      stairTreads.push({ x: stair.x, y: y + 0.012, z, sx: STAIR_HALF_WIDTH * 2, sy: 0.018, sz: 0.035 });
      if (index % 7 === 3) upperLanterns.push({ x: stair.x + (index % 14 === 3 ? 1 : -1) * (STAIR_HALF_WIDTH - 0.14), y: y + 0.38, z, sx: 0.15, sy: 0.3, sz: 0.15 });
      if (index === steps) continue;
      const nextZ = stair.startZ + length * (index + 1) / steps, nextY = floorAt(nextZ), midZ = (z + nextZ) / 2, midY = (y + nextY) / 2, step = nextZ - z;
      stairFloors.push({ x: stair.x, y: midY - 0.12, z: midZ, sx: STAIR_HALF_WIDTH * 2 + 0.1, sy: 0.22, sz: Math.hypot(step, nextY - y) + 0.045, tilt: -Math.atan2(nextY - y, step) });
    }
    for (const side of [-1, 1]) {
      stairWalls.push({ x: stair.x + side * (STAIR_HALF_WIDTH + STAIR_WALL / 2), y: (stairHead - 0.04 + 15) / 2, z: (stair.startZ + crossing.minZ) / 2, sx: STAIR_WALL, sy: stairHead - 0.04 - 15, sz: crossing.minZ - stair.startZ });
    }
  }
  stairWalls.push({ x: 0, y: stairHead + 0.012 - 0.06, z: (crossing.minZ + crossing.maxZ) / 2, sx: crossing.halfWidth * 2, sy: 0.12, sz: crossing.maxZ - crossing.minZ });
  const terrace: Transform[] = [];
  const block = (minX: number, maxX: number, minZ: number, maxZ: number, bottom: number, top: number) => terrace.push({ x: (minX + maxX) / 2, y: (bottom + top) / 2, z: (minZ + maxZ) / 2, sx: maxX - minX, sy: top - bottom, sz: maxZ - minZ });
  const shellBack = upper[0].z + HOT_SPRING_UPPER_SHELL.backMargin, terraceEdge = HOT_SPRING_UPPER_SHELL.halfWidth * 2;
  // A low apron out to the mountain, the rock behind both baths, and the end of the crossing.
  block(-27, -terraceEdge, 57, 92, 12, 21);
  block(terraceEdge, 27, 57, 92, 12, 21);
  block(-27, 27, shellBack, 92, 12, 27);
  block(-crossing.halfWidth - 0.05, crossing.halfWidth + 0.05, crossing.maxZ, crossing.maxZ + 0.8, 20, 26.6);
  instances("onsen-upper-stair-floors", backingBox, caveStone, stairFloors);
  instances("onsen-upper-stair-treads", backingBox, wetStone, stairTreads);
  instances("onsen-upper-stair-walls", backingBox, stone, stairWalls);
  instances("onsen-upper-terrace-rock", backingBox, stone, terrace);
  instances("onsen-upper-lantern-frames", box, brass, upperLanterns);
  instances("onsen-upper-lantern-cores", box, glow, upperLanterns.map((t) => ({ ...t, sx: t.sx * 1.05, sy: t.sy * 0.68, sz: t.sz * 1.05 })));
  instances("onsen-upper-rim-stones", rockGeometry, stone, upperRim, annex);
  instances("onsen-upper-deck-board-seams", box, shadow, upperSeams, annex);
  instances("onsen-upper-amber-strips", box, glow, upperStrips, annex);
  const upperWater = mesh("onsen-upper-quiet-water", horizontalRing(0, 4.58, HOT_SPRING.waterY + upperLift, 0, upper), quietWater(`vec2(vWorld.x < 0.0 ? ${upper[0].x.toFixed(1)} : ${upper[1].x.toFixed(1)}, ${upper[0].z.toFixed(1)})`), annex);
  upperWater.renderOrder = 3;
  mesh("onsen-waterfall-cliffs", cliffGeometry(), cliffFaces, annex);
  const cascadeWater = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uNight: darkness },
    vertexShader: `
      attribute vec3 cascadeFlow; attribute float cascadeFoam; varying vec3 vFlow; varying float vFoam;
      void main() { vFlow = cascadeFlow; vFoam = cascadeFoam; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uNight; varying vec3 vFlow; varying float vFoam;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float along = vFlow.y;
        float coarse = noise(vec2(vFlow.x * 15.0, along * 0.8 - uTime * 2.4));
        float fine = noise(vec2(vFlow.x * 34.0 + 5.0, along * 1.6 - uTime * 3.6));
        float sheet = smoothstep(0.42, 0.82, coarse * 0.62 + fine * 0.38);
        float foam = clamp(vFoam * (0.35 + 0.75 * sheet), 0.0, 1.0);
        float ragged = noise(vec2(along * 1.4 - uTime * 0.9, vFlow.x > 0.0 ? 2.0 : 9.0)) * 0.3;
        float edge = smoothstep(1.0, 0.7 - ragged, abs(vFlow.x));
        vec3 day = mix(vec3(0.34, 0.66, 0.72), vec3(0.96, 0.99, 0.99), foam);
        vec3 night = mix(vec3(0.07, 0.20, 0.24), vec3(0.50, 0.60, 0.62), foam);
        gl_FragColor = vec4(mix(day, night, uNight * 0.9), edge * mix(0.5, 0.95, foam) * vFlow.z);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mesh("onsen-cascade-water", cascadeGeometry(), cascadeWater, annex).renderOrder = 5;
  const upperSteamGeometry = new THREE.PlaneGeometry(1, 1);
  upperSteamGeometry.setAttribute("steamPhase", new THREE.InstancedBufferAttribute(Float32Array.from(upperVapor, (_, index) => index / upperVapor.length), 1));
  const upperSteam = instances("onsen-upper-soft-steam", upperSteamGeometry, steamMaterial, upperVapor, annex);
  upperSteam.frustumCulled = false;
  upperSteam.renderOrder = 4;

  let disposed = false;
  return {
    group,
    annex,
    update(time: number, camera?: THREE.Camera) {
      if (disposed || !Number.isFinite(time)) return;
      clock.value = time;
      if (!camera) return;
      const { x, y, z } = camera.position;
      annex.visible = y > 12;
      const bath = HOT_SPRING_BATHS.reduce((nearest, candidate) => Math.hypot(x - candidate.x, z - candidate.z) < Math.hypot(x - nearest.x, z - nearest.z) ? candidate : nearest);
      poolLight.position.set(bath.x, HOT_SPRING.deckY + bath.lift + 2.7, bath.z);
      if (z > HOT_SPRING.z + ROCK_RADIUS - 1) tunnelLight.position.set(x, y + 1.6, z);
      else tunnelLight.position.set(13, 11, 42);
    },
    applyDaylight(night: number) {
      darkness.value = clamp(Number.isFinite(night) ? night : 0, 0, 1);
      poolLight.intensity = 3.5 + darkness.value * 6;
      tunnelLight.intensity = 12;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownedMaterials.add(material);
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      // Map textures belong to the cove; cloned materials never own those images.
      group.removeFromParent();
    },
  };
}
