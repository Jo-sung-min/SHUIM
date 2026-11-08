import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";

export const CLOUD_SPA_BOUNDS = { minX: -76, maxX: 76, minZ: -98, maxZ: 130 } as const;
export const CLOUD_SPA_ISLAND = { x: 0, z: 17, rx: 62, rz: 107, walkScale: .97, minZ: -89.8, maxZ: 124 } as const;
export const CLOUD_SPA_SPAWN = { x: 0, z: 91, yaw: 0 } as const;
export const CLOUD_SPA_GROUND_Y = 2.8;
export const CLOUD_SPA_WATER_Y = 2.55;
export const CLOUD_SPA_POOL_FLOOR_Y = 1.55;
export const CLOUD_SPA_SEAT_REACH = 2.5;
export const CLOUD_SPA_REACH = CLOUD_SPA_SEAT_REACH;
export const CLOUD_SPA_SEAT_CAPACITY = 6;
export const CLOUD_SPA_RESORT = { x: 0, z: 104, width: 38, depth: 25, floorY: 18.8, ceilingY: 29.2, frontZ: 91.5, backZ: 116.5, entranceHalfWidth: 5 } as const;

export interface CloudSpaPlace {
  id: string; spotId: string; name: string; kind: "pool" | "lounge";
  x: number; z: number; radius: number; terraceRadius: number; deckY: number; waterY: number; groundY: number; floorY: number; seatY: number;
}
export const CLOUD_SPA_POOLS: readonly CloudSpaPlace[] = [
  { x: 0, z: 70, radius: 20, name: "달빛 온천" }, { x: -24, z: 38, radius: 19, name: "별빛 온천" },
  { x: 20, z: 6, radius: 20, name: "구름바다 온천" }, { x: -18, z: -26, radius: 19, name: "노을빛 온천" },
  { x: 0, z: -66, radius: 23, name: "하늘품 온천" },
].map((pool, index) => ({ ...pool, id: `pool-${index + 1}`, spotId: `cloud-pool-${index + 1}`, kind: "pool",
  terraceRadius: pool.radius + 5.5, deckY: 18.8 - index * 4, waterY: 18.55 - index * 4,
  groundY: 17.55 - index * 4, floorY: 17.55 - index * 4, seatY: 18.05 - index * 4 }));
export const CLOUD_SPA_PLACES: readonly CloudSpaPlace[] = [...CLOUD_SPA_POOLS,
  { id: "lounge", spotId: "cloud-lounge", name: "먹구름 리조트 라운지", kind: "lounge", x: 0, z: 104, radius: 16,
    terraceRadius: 24, deckY: 18.8, waterY: 18.8, groundY: 18.8, floorY: 18.8, seatY: 19.4 }];

export interface CloudSpaConnection { ax: number; az: number; bx: number; bz: number; ay: number; by: number; ar: number; br: number; width: number }
export const CLOUD_SPA_CONNECTIONS: readonly CloudSpaConnection[] = CLOUD_SPA_POOLS.slice(0, -1).map((pool, i) => {
  const next = CLOUD_SPA_POOLS[i + 1];
  const routeX = (z: number) => 62 * Math.sqrt(Math.max(0, 1 - ((z - 17) / 107) ** 2)) * .85;
  return { ax: routeX(pool.z), az: pool.z, bx: routeX(next.z), bz: next.z, ay: pool.deckY, by: next.deckY, ar: 0, br: 0, width: 12 };
});
export function cloudSpaConnectionPosition(link: CloudSpaConnection, x: number, z: number) {
  const dx = link.bx - link.ax, dz = link.bz - link.az, length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
  return { along: (x - link.ax) * ux + (z - link.az) * uz, across: (x - link.ax) * -uz + (z - link.az) * ux, length, ux, uz };
}
export function cloudSpaStairHeight(link: CloudSpaConnection, along: number): number {
  const length = Math.hypot(link.bx - link.ax, link.bz - link.az), start = link.ar + .05, end = length - link.br - .05;
  const t = Math.max(0, Math.min(1, (along - start) / (end - start)));
  return link.ay + (link.by - link.ay) * Math.floor(t * 16 + 1e-6) / 16;
}
export const CLOUD_SPA_SEATS: readonly PavilionSeat[] = CLOUD_SPA_PLACES.flatMap(place => Array.from({ length: CLOUD_SPA_SEAT_CAPACITY }, (_, slot) => {
  const angle = slot * Math.PI / 3, side = slot < 3 ? -1 : 1, pool = place.kind === "pool";
  return { id: `${place.spotId}-seat-${slot}`, pavilionId: place.id, spotId: place.spotId, name: place.name, slot,
    x: place.x + (pool ? Math.sin(angle) * (place.radius - 3) : side * 10.5),
    z: place.z + (pool ? Math.cos(angle) * (place.radius - 3) : (slot % 3 - 1) * 2),
    yaw: pool ? Math.atan2(Math.sin(angle + (place.id === "pool-5" && slot >= 2 && slot <= 4 ? Math.PI : 0)), Math.cos(angle + (place.id === "pool-5" && slot >= 2 && slot <= 4 ? Math.PI : 0))) : side * Math.PI / 2,
    avatarY: place.seatY, baseY: place.groundY, incline: 0 };
}));

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** The final circular pool meets a low infinity edge on its city-facing southern side. */
export function cloudSpaTerraceRadius(pool: CloudSpaPlace, angle: number): number {
  return pool.terraceRadius - (pool.id === "pool-5" ? 4.7 * smooth((-Math.cos(angle) - .18) / .30) : 0);
}
export function cloudSpaMountainHalfWidth(z: number): number {
  if (z < CLOUD_SPA_ISLAND.minZ || z > CLOUD_SPA_ISLAND.maxZ) return 0;
  const ellipse = CLOUD_SPA_ISLAND.rx * Math.sqrt(Math.max(0, 1 - ((z - CLOUD_SPA_ISLAND.z) / CLOUD_SPA_ISLAND.rz) ** 2));
  if (z >= -70) return ellipse;
  const cityEdge = Math.sqrt(Math.max(0, 23.8 ** 2 - (z + 66) ** 2));
  return ellipse + (cityEdge - ellipse) * smooth((-z - 70) / 7);
}
function cloudSpaSlopeHeight(z: number): number {
  for (let i = 0; i < CLOUD_SPA_POOLS.length - 1; i++) {
    const upper = CLOUD_SPA_POOLS[i], lower = CLOUD_SPA_POOLS[i + 1];
    if (z <= upper.z && z >= lower.z) return lower.deckY + (upper.deckY - lower.deckY) * smooth((z - lower.z) / (upper.z - lower.z));
  }
  return z > CLOUD_SPA_POOLS[0].z ? CLOUD_SPA_POOLS[0].deckY : CLOUD_SPA_POOLS[4].deckY;
}
export function cloudSpaStairRouteX(z: number): number {
  return 62 * Math.sqrt(Math.max(0, 1 - ((z - 17) / 107) ** 2)) * .85;
}
/** Exact riser rows are reused by the ground mesh, avoiding a ramp visually covering the collision steps. */
export const CLOUD_SPA_STAIR_BREAKS: readonly number[] = CLOUD_SPA_POOLS.slice(0, -1).flatMap((upper, i) => {
  const lower = CLOUD_SPA_POOLS[i + 1];
  return Array.from({ length: 16 }, (_, step) => {
    const target = lower.deckY + (step + 1) * .25;
    let lo = lower.z, hi = upper.z;
    for (let iteration = 0; iteration < 36; iteration++) { const mid = (lo + hi) / 2; if (cloudSpaSlopeHeight(mid) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  });
}).sort((a, b) => a - b);
/** The same gently curved basin surface is used for both feet and the actual visible cloud floor. */
export function cloudSpaFloorHeight(x: number, z: number): number {
  for (const pool of CLOUD_SPA_POOLS) {
    const radius = Math.hypot(x - pool.x, z - pool.z);
    if (radius <= pool.radius + .45) return pool.floorY + (pool.deckY - pool.floorY) * smooth((radius - (pool.radius - 2.8)) / 3.25);
  }
  if (z >= 91 && z <= 119 && Math.abs(x) <= 22) return CLOUD_SPA_RESORT.floorY;
  const terraces = CLOUD_SPA_POOLS.map(pool => ({ pool, distance: Math.hypot(x - pool.x, z - pool.z) - pool.radius }))
    .sort((a, b) => a.distance - b.distance);
  const closest = terraces[0], adjacent = terraces[1], separation = adjacent.distance - closest.distance;
  // Broad, distinct shelves share one mountain. Only the narrow terrace lip rounds over into its four-metre drop.
  const blend = .5 + .5 * smooth(separation / .6);
  const deck = adjacent.pool.deckY + (closest.pool.deckY - adjacent.pool.deckY) * blend;
  if (z >= -72 && z <= 90) {
    const side = (1 - smooth((Math.abs(Math.abs(x) - cloudSpaStairRouteX(z)) - 4) / 2)) * smooth((z + 72) / 6) * (1 - smooth((z - 84) / 6));
    const stair = 2.8 + Math.floor((cloudSpaSlopeHeight(z) - 2.8 + 1e-8) / .25) * .25;
    return deck + (stair - deck) * side;
  }
  return deck;
}
export function cloudSpaCeilingHeight(x: number, z: number): number | null {
  return Math.abs(x) < CLOUD_SPA_RESORT.width / 2 && z > CLOUD_SPA_RESORT.frontZ && z < CLOUD_SPA_RESORT.backZ ? CLOUD_SPA_RESORT.ceilingY : null;
}
export function cloudSpaCanStep(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  if (![fromX, fromZ, toX, toZ].every(Number.isFinite)) return false;
  return Math.abs(cloudSpaFloorHeight(toX, toZ) - cloudSpaFloorHeight(fromX, fromZ)) <= .48;
}
/** One broad, continuous cloud mountain supports the pools and both gently descending side promenades. */
export function resolveCloudSpaWalk(x: number, z: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [CLOUD_SPA_SPAWN.x, CLOUD_SPA_SPAWN.z];
  const safeZ = Math.max(CLOUD_SPA_ISLAND.minZ + .35, Math.min(CLOUD_SPA_ISLAND.maxZ - .35, z));
  const half = Math.max(0, cloudSpaMountainHalfWidth(safeZ) - .3);
  return [Math.max(-half, Math.min(half, x)), safeZ];
}
export function cloudSpaForSpot(spotId: string | null | undefined): CloudSpaPlace | null {
  return CLOUD_SPA_PLACES.find(place => place.spotId === spotId) ?? null;
}
export function cloudSpaSeat(spotId: string, slot: number): PavilionSeat | null {
  return Number.isInteger(slot) ? CLOUD_SPA_SEATS.find(seat => seat.spotId === spotId && seat.slot === slot) ?? null : null;
}
export function claimedCloudSpaSeat(rest: { pose?: string; spotId?: string | null; slot?: number | null }): PavilionSeat | null {
  return rest.pose === "sitting" && typeof rest.spotId === "string" && typeof rest.slot === "number" ? cloudSpaSeat(rest.spotId, rest.slot) : null;
}
export function nearbyCloudSpaPlace(x: number, z: number): CloudSpaPlace | null {
  let nearest: PavilionSeat | null = null, distance = CLOUD_SPA_SEAT_REACH;
  for (const seat of CLOUD_SPA_SEATS) {
    const current = Math.hypot(x - seat.x, z - seat.z);
    if (current <= distance) { distance = current; nearest = seat; }
  }
  return nearest ? cloudSpaForSpot(nearest.spotId) : null;
}

const rect = (x: number, z: number, width: number, depth: number): ShelterCollider => ({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
export const CLOUD_SPA_WALLS: readonly ShelterCollider[] = [
  rect(-19, 104, .5, 25), rect(19, 104, .5, 25), rect(0, 116.5, 38, .5),
  rect(-12, 91.5, 14, .35), rect(12, 91.5, 14, .35),
  rect(-10.7, 104, 2.05, 6.65), rect(10.7, 104, 2.05, 6.65),
  rect(0, 104, 4.6, 2.9), rect(0, 113.8, 13, 1.5),
];
