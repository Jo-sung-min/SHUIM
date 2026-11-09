import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";

/** Lake Baikal in a snowstorm: a frozen plain with turquoise ice hummocks, and a warm glass-fronted cabin on a low snow bank. Pure math; mirrored in net.ts and BeachRoom. */
export const BAIKAL_BOUNDS = { minX: -120, maxX: 120, minZ: -140, maxZ: 70 } as const;
/** Newcomers stand on the ice looking ahead (-z), turned slightly left so the cabin and the hero hummocks share the first view. */
export const BAIKAL_SPAWN = { x: 0, z: 40, yaw: .17 } as const;
export const BAIKAL_SEAT_REACH = 2.5;
/** The cabin stands on a gentle snow mound rather than directly on the ice. */
export const BAIKAL_TERRACE = { x: -23, z: 6, radius: 13, fade: 4, height: .3 } as const;
/** West of the cabin the lakeshore rises into a larch-covered bank. */
export const BAIKAL_SHORE = { startX: -36, crestX: -60, crestHeight: 3, farSlope: .05 } as const;
/** Mono-pitch cabin: the roof is highest over the glass wall (x = maxX, facing +x towards the lake) and falls towards the back wall. */
export const BAIKAL_CABIN = {
  minX: -30, maxX: -16, minZ: -2, maxZ: 14, floorY: .6, lowEave: 3.6, highEave: 6.4, wall: .36,
  porchMaxX: -13, eaveMaxX: -13.5, sideEave: 1, doorMinZ: -1.2, doorMaxZ: 1.2,
} as const;
/** The storm blows off the lake into the glass wall (towards -x), veering a little with every gust. */
export const BAIKAL_WIND = { x: -.96, z: -.28, speed: 7.5 } as const;

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Absolute height of the roof plane above a point; the slope continues over the porch eave. */
export function baikalRoofHeight(x: number): number {
  const c = BAIKAL_CABIN;
  return c.floorY + c.lowEave + (c.highEave - c.lowEave) * (x - c.minX) / (c.maxX - c.minX);
}
export function insideBaikalCabin(x: number, z: number, margin = 0): boolean {
  const c = BAIKAL_CABIN;
  return x >= c.minX - margin && x <= c.maxX + margin && z >= c.minZ - margin && z <= c.maxZ + margin;
}
/** Under the roof, including the porch and its eaves: snow never falls here. */
export function underBaikalRoof(x: number, z: number): boolean {
  const c = BAIKAL_CABIN;
  return x >= c.minX - .4 && x <= c.eaveMaxX + .6 && z >= c.minZ - c.sideEave && z <= c.maxZ + c.sideEave;
}
export function baikalCeilingHeight(x: number, z: number): number | null {
  return underBaikalRoof(x, z) ? baikalRoofHeight(x) - .22 : null;
}
export function baikalShoreHeight(x: number): number {
  if (!(x < BAIKAL_SHORE.startX)) return 0;
  const climb = smooth((BAIKAL_SHORE.startX - x) / (BAIKAL_SHORE.startX - BAIKAL_SHORE.crestX)) * BAIKAL_SHORE.crestHeight;
  return climb + Math.max(0, BAIKAL_SHORE.crestX - x) * BAIKAL_SHORE.farSlope;
}
export function baikalTerraceHeight(x: number, z: number): number {
  const t = BAIKAL_TERRACE;
  return t.height * (1 - smooth((Math.hypot(x - t.x, z - t.z) - t.radius) / t.fade));
}
/** Feet, seats and cameras share this surface: the cabin and porch deck, the snow mound beneath them, the shore bank, otherwise level ice. */
export function baikalFloorHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const c = BAIKAL_CABIN;
  if (z >= c.minZ && z <= c.maxZ && x >= c.minX && x <= c.porchMaxX) return c.floorY;
  return Math.max(baikalTerraceHeight(x, z), baikalShoreHeight(x));
}
/** Where the ground is snow for certain (mound, bank, deck); elsewhere the shader mixes snow and bare ice. */
export function baikalSnowCover(x: number, z: number): number {
  return Math.min(1, Math.max(0, baikalTerraceHeight(x, z) / .08, baikalShoreHeight(x) / .2));
}

/* ---------------- ice hummocks ---------------- */
export interface IceBlock { x: number; z: number; size: number; height: number; yaw: number; tilt: number; variant: number; seed: number; solid: boolean }
function hummockRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
}
/** The hero cluster east of the cabin, composed by hand so the first view and the sofa view both frame a few large jewels. */
const HERO: readonly [number, number, number, number, number][] = [
  [10.5, 10, 1.3, 1.9, .4], [13.5, 12.5, 2.2, 2.6, -.6], [17, 10.5, 1.1, 1.3, 1.2], [19.5, 14, 1.6, 2.1, .9],
  [9, 16, .9, 1.0, -1.1], [12.5, 17.5, 1.9, 2.4, .2], [16, 18.5, 1.3, 1.6, -.4], [19, 20.5, 1.0, 1.2, 2.0],
  [10.5, 21.5, 1.5, 1.7, 1.5], [14, 23, 1.0, 1.1, -.9], [17.5, 24.5, 2.0, 2.3, .6], [11.5, 25.5, .8, .9, -1.8],
  [8.5, 12.8, .7, .8, .3], [20.5, 17.5, .8, 1.0, -1.4], [15, 15.2, .6, .7, 2.6], [13, 20.4, .7, .9, -.2],
];
export const BAIKAL_CLUSTERS: readonly [number, number][] = [[40, -10], [-20, -40], [60, 30], [-50, -70], [15, -80], [-45, 22], [70, -55]];
function clearOfLandmarks(x: number, z: number): boolean {
  if (Math.hypot(x - BAIKAL_SPAWN.x, z - BAIKAL_SPAWN.z) < 6) return false;
  if (Math.hypot(x - BAIKAL_TERRACE.x, z - BAIKAL_TERRACE.z) < BAIKAL_TERRACE.radius + 6) return false;
  if (x < BAIKAL_SHORE.startX + 4 && Math.abs(z - 6) < 30) return false;
  return true;
}
function buildBlocks(): IceBlock[] {
  const blocks: IceBlock[] = [], random = hummockRandom(90211);
  HERO.forEach(([x, z, size, height, yaw], index) => blocks.push({ x, z, size, height, yaw, tilt: .12 + (index % 4) * .07, variant: index % 4, seed: index * .61 + .1, solid: true }));
  for (const [index, [cx, cz]] of BAIKAL_CLUSTERS.entries()) {
    const count = 6 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, radius = 1.5 + random() * 6.5, size = .6 + random() * 1.4;
      const x = cx + Math.sin(angle) * radius, z = cz + Math.cos(angle) * radius;
      if (!clearOfLandmarks(x, z)) continue;
      blocks.push({ x, z, size, height: size * (.9 + random() * .5), yaw: random() * Math.PI * 2, tilt: random() * .4, variant: (index + i) % 4, seed: random(), solid: true });
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = BAIKAL_BOUNDS.minX + random() * (BAIKAL_BOUNDS.maxX - BAIKAL_BOUNDS.minX), z = BAIKAL_BOUNDS.minZ + random() * (BAIKAL_BOUNDS.maxZ - BAIKAL_BOUNDS.minZ);
    if (!clearOfLandmarks(x, z) || blocks.some(b => Math.hypot(b.x - x, b.z - z) < 3)) continue;
    const size = .4 + random() * .8;
    blocks.push({ x, z, size, height: size * (.8 + random() * .5), yaw: random() * Math.PI * 2, tilt: random() * .5, variant: i % 4, seed: random(), solid: true });
  }
  // Beyond the walkable plain, larger hummocks glitter towards the horizon; nobody reaches them, so they carry no colliders.
  for (let i = 0; i < 150; i++) {
    const angle = random() * Math.PI * 2, radius = 150 + random() * 250, size = 1 + random() * 1.6;
    blocks.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius, size, height: size * (.8 + random() * .6), yaw: random() * Math.PI * 2, tilt: random() * .4, variant: i % 4, seed: random(), solid: false });
  }
  return blocks;
}
export const BAIKAL_BLOCKS: readonly IceBlock[] = buildBlocks();

/* ---------------- storm schedule ---------------- */
export const STORM_PERIOD_MS = 6 * 60_000;
/** Storm strength 0..1 at a server time: two and a half minutes of blizzard, a minute easing, a ninety-second lull, a minute building again. */
export function baikalStormAt(serverMs: number): number {
  if (!Number.isFinite(serverMs)) return 1;
  const t = (((serverMs % STORM_PERIOD_MS) + STORM_PERIOD_MS) % STORM_PERIOD_MS) / 1000;
  if (t < 150) return 1;
  if (t < 210) return 1 - .7 * smooth((t - 150) / 60);
  if (t < 300) return .3;
  return .3 + .7 * smooth((t - 300) / 60);
}

/* ---------------- seats ---------------- */
export interface BaikalPlace {
  id: string; spotId: string; name: string; kind: "lounge" | "hearth" | "bench";
  x: number; z: number; fx: number; fz: number; seatY: number; local: readonly (readonly [number, number])[];
}
/** Same local-seat convention as BeachRoom: (lx, lz) on the right axis (-fz, fx) and the facing axis; every seat faces along the axis. */
export const BAIKAL_PLACES: readonly BaikalPlace[] = [
  { id: "sofa", spotId: "baikal-sofa", name: "창가 긴 소파", kind: "lounge", x: -23, z: 6.05, fx: 1, fz: 0, seatY: BAIKAL_CABIN.floorY + .52, local: [[-2.25, 0], [-.75, 0], [.75, 0], [2.25, 0]] },
  { id: "side", spotId: "baikal-side", name: "난롯가 소파", kind: "lounge", x: -22, z: 11, fx: 0, fz: -1, seatY: BAIKAL_CABIN.floorY + .52, local: [[-1.6, 0], [0, 0], [1.6, 0]] },
  { id: "hearth", spotId: "baikal-hearth", name: "난롯가 방석", kind: "hearth", x: -23.4, z: 1.4, fx: 0, fz: -1, seatY: BAIKAL_CABIN.floorY + .3, local: [[-1.2, 0], [1.2, 0]] },
  { id: "chair", spotId: "baikal-chair", name: "창가 안락의자", kind: "lounge", x: -18.6, z: 12.2, fx: 1, fz: 0, seatY: BAIKAL_CABIN.floorY + .52, local: [[0, 0]] },
  { id: "porch", spotId: "baikal-porch", name: "처마 밑 벤치", kind: "bench", x: -14.6, z: 9.4, fx: 1, fz: 0, seatY: BAIKAL_CABIN.floorY + .5, local: [[-.8, 0], [.8, 0]] },
];
export const BAIKAL_SEATS: readonly PavilionSeat[] = BAIKAL_PLACES.flatMap(place => place.local.map(([lx, lz], slot) => {
  const rx = -place.fz, rz = place.fx;
  return { id: `${place.spotId}-seat-${slot}`, pavilionId: place.id, spotId: place.spotId, name: place.name, slot,
    x: place.x + lx * rx + lz * place.fx, z: place.z + lx * rz + lz * place.fz, yaw: Math.atan2(-place.fx, -place.fz),
    avatarY: place.seatY, baseY: BAIKAL_CABIN.floorY, incline: 0 };
}));
export function baikalForSpot(spotId: string | null | undefined): BaikalPlace | null {
  return BAIKAL_PLACES.find(place => place.spotId === spotId) ?? null;
}
export function baikalSeat(spotId: string, slot: number): PavilionSeat | null {
  return Number.isInteger(slot) ? BAIKAL_SEATS.find(seat => seat.spotId === spotId && seat.slot === slot) ?? null : null;
}
export function claimedBaikalSeat(rest: { pose?: string; spotId?: string | null; slot?: number | null }): PavilionSeat | null {
  return rest.pose === "sitting" && typeof rest.spotId === "string" && typeof rest.slot === "number" ? baikalSeat(rest.spotId, rest.slot) : null;
}
export function nearbyBaikalPlace(x: number, z: number): BaikalPlace | null {
  let nearest: PavilionSeat | null = null, distance = BAIKAL_SEAT_REACH;
  for (const seat of BAIKAL_SEATS) {
    const current = Math.hypot(x - seat.x, z - seat.z);
    if (current <= distance) { distance = current; nearest = seat; }
  }
  return nearest ? baikalForSpot(nearest.spotId) : null;
}

/* ---------------- walking ---------------- */
const rect = (x: number, z: number, width: number, depth: number): ShelterCollider => ({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
/** Solid walls only (the orbit camera respects these at every height); the glass wall leaves the doorway open. */
export const BAIKAL_WALLS: readonly ShelterCollider[] = [
  rect(-30, 6, BAIKAL_CABIN.wall, 16.4), rect(-23, -2, 14.4, BAIKAL_CABIN.wall), rect(-23, 14, 14.4, BAIKAL_CABIN.wall),
  rect(-16, (BAIKAL_CABIN.doorMaxZ + BAIKAL_CABIN.maxZ) / 2, .3, BAIKAL_CABIN.maxZ - BAIKAL_CABIN.doorMaxZ),
  rect(-16, (BAIKAL_CABIN.minZ + BAIKAL_CABIN.doorMinZ) / 2, .3, BAIKAL_CABIN.doorMinZ - BAIKAL_CABIN.minZ),
];
export const BAIKAL_FURNITURE: readonly ShelterCollider[] = [
  rect(-23.4, -1.1, 1.1, 1.1), rect(-23.1, 6.05, 1.0, 6.4), rect(-20.4, 6, 2.2, .9), rect(-22, 11.45, 4.4, 1.3),
  rect(-18.6, 12.2, 1.0, 1.0), rect(-29.3, 7, .8, 6), rect(-14.6, 9.4, .55, 2.4), rect(-25.4, -1.2, 1.2, .9),
];
export const BAIKAL_TREES: readonly { x: number; z: number; height: number; seed: number }[] = (() => {
  const random = hummockRandom(4471), trees: { x: number; z: number; height: number; seed: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const x = -44 - random() * 20, z = -34 + random() * 76;
    if (Math.abs(z - 6) < 9 && x > -50) continue;
    trees.push({ x, z, height: 7 + random() * 5, seed: random() });
  }
  return trees;
})();
export const BAIKAL_BLOCK_COLLIDERS: readonly ShelterCollider[] = BAIKAL_BLOCKS.filter(block => block.solid && block.size >= .5)
  .map(block => rect(block.x, block.z, block.size * 1.7, block.size * 1.5));
export const BAIKAL_COLLIDERS: readonly ShelterCollider[] = [...BAIKAL_WALLS, ...BAIKAL_FURNITURE, ...BAIKAL_BLOCK_COLLIDERS,
  ...BAIKAL_TREES.map(tree => rect(tree.x, tree.z, .9, .9))];
/** Walkers stay inside the plain; walls and furniture are resolved by the engine's shared rectangle resolver. */
export function resolveBaikalWalk(x: number, z: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [BAIKAL_SPAWN.x, BAIKAL_SPAWN.z];
  return [Math.max(BAIKAL_BOUNDS.minX + .4, Math.min(BAIKAL_BOUNDS.maxX - .4, x)), Math.max(BAIKAL_BOUNDS.minZ + .4, Math.min(BAIKAL_BOUNDS.maxZ - .4, z))];
}
