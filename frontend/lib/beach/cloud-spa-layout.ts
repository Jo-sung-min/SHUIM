import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";

export const CLOUD_SPA_BOUNDS = { minX: -76, maxX: 76, minZ: -98, maxZ: 130 } as const;
export const CLOUD_SPA_SPAWN = { x: 0, z: 91, yaw: 0 } as const;
export const CLOUD_SPA_SEAT_REACH = 2.5;
export const CLOUD_SPA_REACH = CLOUD_SPA_SEAT_REACH;
export const CLOUD_SPA_SEAT_CAPACITY = 6;
export const CLOUD_SPA_RESORT = { x: 0, z: 104, width: 38, depth: 25, floorY: 18.8, ceilingY: 29.2, frontZ: 91.5, backZ: 116.5, entranceHalfWidth: 5 } as const;
/** The storm resort stands on its own cloud apron, level with the top terrace. */
export const CLOUD_SPA_APRON = { x: 0, z: 103, rx: 30, rz: 22, deckY: 18.8 } as const;
/** Pamukkale terraces: every pool sits one drop below the previous one, ringed by a narrow cotton shelf; where a lower pool hugs the upper wall only a lip remains. */
export const CLOUD_SPA_TERRACE = { drop: 3, shelf: 3.5, lip: .8, depth: 1.25, basinInset: 2.8, basinSlope: 3.25 } as const;
/** A walkable rill: a spillway sill cut into the upper rim, twelve shallow steps, then a ramp into the lower pool. */
export const CLOUD_SPA_CHANNEL = { halfWidth: 3, steps: 12, rise: .25, run: .4, ramp: 2.4, sill: .3, lead: 3.5 } as const;

export interface CloudSpaPlace {
  id: string; spotId: string; name: string; kind: "pool" | "lounge";
  x: number; z: number; radius: number; terraceRadius: number; deckY: number; waterY: number; groundY: number; floorY: number; seatY: number;
}
export const CLOUD_SPA_POOLS: readonly CloudSpaPlace[] = [
  { x: 0, z: 66, radius: 20, name: "달빛 온천" }, { x: -18, z: 34.8, radius: 19, name: "별빛 온천" },
  { x: 0, z: 3.6, radius: 20, name: "구름바다 온천" }, { x: 18, z: -27.6, radius: 19, name: "노을빛 온천" },
  { x: 0, z: -60.5, radius: 23, name: "하늘품 온천" },
].map((pool, index) => {
  const deckY = CLOUD_SPA_APRON.deckY - index * CLOUD_SPA_TERRACE.drop;
  return { ...pool, id: `pool-${index + 1}`, spotId: `cloud-pool-${index + 1}`, kind: "pool" as const,
    terraceRadius: pool.radius + CLOUD_SPA_TERRACE.shelf, deckY, waterY: deckY - .25,
    groundY: deckY - CLOUD_SPA_TERRACE.depth, floorY: deckY - CLOUD_SPA_TERRACE.depth, seatY: deckY - .75 };
});
export const CLOUD_SPA_PLACES: readonly CloudSpaPlace[] = [...CLOUD_SPA_POOLS,
  { id: "lounge", spotId: "cloud-lounge", name: "먹구름 리조트 라운지", kind: "lounge", x: 0, z: 104, radius: 16,
    terraceRadius: 24, deckY: 18.8, waterY: 18.8, groundY: 18.8, floorY: 18.8, seatY: 19.4 }];

export interface CloudSpaChannel {
  id: string; upper: CloudSpaPlace; lower: CloudSpaPlace;
  /** Unit axis from the upper centre towards the lower centre, and its right-hand normal. */
  ux: number; uz: number; nx: number; nz: number;
  /** Distances along the axis from the upper centre: where the sill begins to matter, the outer lip, the last step and the end of the ramp. */
  start: number; lipEnd: number; stepsEnd: number; rampEnd: number; length: number;
}
export const CLOUD_SPA_CHANNELS: readonly CloudSpaChannel[] = CLOUD_SPA_POOLS.slice(0, -1).map((upper, i) => {
  const lower = CLOUD_SPA_POOLS[i + 1], dx = lower.x - upper.x, dz = lower.z - upper.z, length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
  const lipEnd = upper.radius + CLOUD_SPA_TERRACE.lip, stepsEnd = lipEnd + CLOUD_SPA_CHANNEL.steps * CLOUD_SPA_CHANNEL.run;
  return { id: `channel-${i + 1}`, upper, lower, ux, uz, nx: -uz, nz: ux, start: upper.radius - CLOUD_SPA_CHANNEL.lead, lipEnd, stepsEnd, rampEnd: stepsEnd + CLOUD_SPA_CHANNEL.ramp, length };
});
export function cloudSpaChannelFrame(channel: CloudSpaChannel, x: number, z: number) {
  const dx = x - channel.upper.x, dz = z - channel.upper.z;
  return { along: dx * channel.ux + dz * channel.uz, across: dx * channel.nx + dz * channel.nz };
}
export function cloudSpaChannelPoint(channel: CloudSpaChannel, along: number, across: number): [number, number] {
  return [channel.upper.x + channel.ux * along + channel.nx * across, channel.upper.z + channel.uz * along + channel.nz * across];
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function basinHeight(pool: CloudSpaPlace, distance: number): number {
  return pool.floorY + (pool.deckY - pool.floorY) * smooth((distance - (pool.radius - CLOUD_SPA_TERRACE.basinInset)) / CLOUD_SPA_TERRACE.basinSlope);
}
/** Height of the rill floor. Feet use the real steps; the ground mesh uses a ramp hidden just beneath the visible tread slabs. */
export function cloudSpaChannelHeight(channel: CloudSpaChannel, along: number, distance: number, forMesh = false): number {
  const { rise, run, ramp, sill: sillDepth, steps } = CLOUD_SPA_CHANNEL, sill = channel.upper.deckY - sillDepth;
  if (along < channel.lipEnd) return Math.min(basinHeight(channel.upper, distance), sill);
  if (along < channel.stepsEnd) {
    // A ramp through the back edge of every tread stays just under each slab; the slabs hide it completely.
    if (forMesh) return sill - rise - CLOUD_SPA_TERRACE.drop * (along - channel.lipEnd) / (channel.stepsEnd - channel.lipEnd) - .04;
    return sill - rise * (Math.min(steps - 1, Math.floor((along - channel.lipEnd) / run)) + 1);
  }
  const bottom = channel.lower.deckY - sillDepth;
  return bottom + (channel.lower.floorY - bottom) * smooth((along - channel.stepsEnd) / ramp);
}
export function cloudSpaChannelAt(x: number, z: number): { channel: CloudSpaChannel; along: number; across: number } | null {
  for (const channel of CLOUD_SPA_CHANNELS) {
    const { along, across } = cloudSpaChannelFrame(channel, x, z);
    if (Math.abs(across) <= CLOUD_SPA_CHANNEL.halfWidth && along >= channel.start && along <= channel.rampEnd) return { channel, along, across };
  }
  return null;
}

/** The lowest terrace narrows to a bare lip on its city-facing southern side, an infinity edge over the valley. */
export function cloudSpaTerraceRadius(pool: CloudSpaPlace, angle: number): number {
  return pool.terraceRadius - (pool.id === "pool-5" ? (CLOUD_SPA_TERRACE.shelf - CLOUD_SPA_TERRACE.lip) * smooth((-Math.cos(angle) - .18) / .30) : 0);
}
function insideTerrace(pool: CloudSpaPlace, x: number, z: number): boolean {
  const dx = x - pool.x, dz = z - pool.z;
  return Math.hypot(dx, dz) <= cloudSpaTerraceRadius(pool, Math.atan2(dx, dz));
}
function insideApron(x: number, z: number): boolean {
  return ((x - CLOUD_SPA_APRON.x) / CLOUD_SPA_APRON.rx) ** 2 + ((z - CLOUD_SPA_APRON.z) / CLOUD_SPA_APRON.rz) ** 2 <= 1;
}
export function cloudSpaInsideIsland(x: number, z: number): boolean {
  return insideApron(x, z) || CLOUD_SPA_POOLS.some(pool => insideTerrace(pool, x, z));
}

function terrainHeight(x: number, z: number, forMesh: boolean): number {
  const rill = cloudSpaChannelAt(x, z);
  if (rill) return cloudSpaChannelHeight(rill.channel, rill.along, Math.hypot(rill.along, rill.across), forMesh);
  // Higher pools own their basin and lip outright; a lower basin wraps around that lip.
  for (const pool of CLOUD_SPA_POOLS) {
    const distance = Math.hypot(x - pool.x, z - pool.z);
    if (distance <= pool.radius + CLOUD_SPA_TERRACE.lip) return distance <= pool.radius + .45 ? basinHeight(pool, distance) : pool.deckY;
  }
  for (const pool of CLOUD_SPA_POOLS) if (insideTerrace(pool, x, z)) return pool.deckY;
  if (insideApron(x, z)) return CLOUD_SPA_APRON.deckY;
  // Beyond the edge the nearest shelf continues, so cameras never dip below the cloud top.
  let deck: number = CLOUD_SPA_APRON.deckY, nearest = (Math.hypot((x - CLOUD_SPA_APRON.x) / CLOUD_SPA_APRON.rx, (z - CLOUD_SPA_APRON.z) / CLOUD_SPA_APRON.rz) - 1) * CLOUD_SPA_APRON.rz;
  for (const pool of CLOUD_SPA_POOLS) {
    const dx = x - pool.x, dz = z - pool.z, distance = Math.hypot(dx, dz) - cloudSpaTerraceRadius(pool, Math.atan2(dx, dz));
    if (distance < nearest) { nearest = distance; deck = pool.deckY; }
  }
  return deck;
}
/** Feet, seats and cameras share this surface: basins, sills, real steps, shelves and the apron. */
export function cloudSpaFloorHeight(x: number, z: number): number { return terrainHeight(x, z, false); }
/** The visible cloud top: identical, except that rills become ramps hidden beneath their tread slabs. */
export function cloudSpaGroundHeight(x: number, z: number): number { return terrainHeight(x, z, true); }
/** Water standing above a point of the ground, for tinting submerged cotton. */
export function cloudSpaWaterDepth(x: number, z: number, height: number): number {
  let depth = 0;
  for (const pool of CLOUD_SPA_POOLS) if (Math.hypot(x - pool.x, z - pool.z) <= pool.radius - .11) depth = Math.max(depth, pool.waterY - height);
  return depth;
}
export function cloudSpaCeilingHeight(x: number, z: number): number | null {
  return Math.abs(x) < CLOUD_SPA_RESORT.width / 2 && z > CLOUD_SPA_RESORT.frontZ && z < CLOUD_SPA_RESORT.backZ ? CLOUD_SPA_RESORT.ceilingY : null;
}
export function cloudSpaCanStep(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  if (![fromX, fromZ, toX, toZ].every(Number.isFinite)) return false;
  return Math.abs(cloudSpaFloorHeight(toX, toZ) - cloudSpaFloorHeight(fromX, fromZ)) <= .48;
}

// The island outline is the union of the terrace discs and the apron. Its horizontal span is tabulated once per quarter metre.
const SPAN_Z0 = -88, SPAN_Z1 = 126, SPAN_STEP = .25, SPAN_X = 48;
interface SpanTable { minX: Float32Array; maxX: Float32Array; firstRow: number; lastRow: number }
let spanTable: SpanTable | null = null;
function refineEdge(outside: number, inside: number, z: number): number {
  for (let i = 0; i < 14; i++) { const mid = (outside + inside) / 2; if (cloudSpaInsideIsland(mid, z)) inside = mid; else outside = mid; }
  return inside;
}
function spans(): SpanTable {
  if (spanTable) return spanTable;
  const count = Math.round((SPAN_Z1 - SPAN_Z0) / SPAN_STEP) + 1, minX = new Float32Array(count).fill(NaN), maxX = new Float32Array(count).fill(NaN);
  let firstRow = -1, lastRow = -1;
  for (let row = 0; row < count; row++) {
    const z = SPAN_Z0 + row * SPAN_STEP;
    let first = NaN, last = NaN;
    for (let x = -SPAN_X; x <= SPAN_X; x += .25) if (cloudSpaInsideIsland(x, z)) { if (Number.isNaN(first)) first = x; last = x; }
    if (Number.isNaN(first)) continue;
    minX[row] = refineEdge(first - .25, first, z); maxX[row] = refineEdge(last + .25, last, z);
    if (firstRow < 0) firstRow = row; lastRow = row;
  }
  return spanTable = { minX, maxX, firstRow, lastRow };
}
export function cloudSpaIslandRange(): { minZ: number; maxZ: number } {
  const table = spans();
  return { minZ: SPAN_Z0 + table.firstRow * SPAN_STEP, maxZ: SPAN_Z0 + table.lastRow * SPAN_STEP };
}
/** Leftmost and rightmost cloud at this z, or null beyond the island's ends. */
export function cloudSpaIslandSpan(z: number): [number, number] | null {
  const table = spans(), f = (z - SPAN_Z0) / SPAN_STEP, r0 = Math.floor(f), r1 = r0 + 1;
  if (!Number.isFinite(f) || r1 < table.firstRow || r0 > table.lastRow) return null;
  const a = Math.max(table.firstRow, Math.min(table.lastRow, r0)), b = Math.max(table.firstRow, Math.min(table.lastRow, r1)), t = a === b ? 0 : f - r0;
  return [table.minX[a] + (table.minX[b] - table.minX[a]) * t, table.maxX[a] + (table.maxX[b] - table.maxX[a]) * t];
}
/** Walkers stay on the cloud: inside the island span of their row. Terrace walls themselves are enforced by the step filter. */
export function resolveCloudSpaWalk(x: number, z: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [CLOUD_SPA_SPAWN.x, CLOUD_SPA_SPAWN.z];
  const range = cloudSpaIslandRange(), safeZ = Math.max(range.minZ + .35, Math.min(range.maxZ - .35, z));
  const span = cloudSpaIslandSpan(safeZ) ?? [CLOUD_SPA_SPAWN.x, CLOUD_SPA_SPAWN.x];
  const lo = span[0] + .3, hi = span[1] - .3;
  return [lo > hi ? (span[0] + span[1]) / 2 : Math.max(lo, Math.min(hi, x)), safeZ];
}
/** Distance along a heading until the cloud ends, or Infinity when the island continues past the limit. */
export function cloudSpaEdgeAhead(x: number, z: number, dx: number, dz: number, limit = 30): number {
  for (let d = 1; d <= limit; d++) if (!cloudSpaInsideIsland(x + dx * d, z + dz * d)) return d;
  return Infinity;
}

/** Seats on a pool's cloud-edge side turn outward over the valley; the others face their neighbours across the water. Mirrored in net.ts and BeachRoom. */
export const CLOUD_SPA_OUTWARD_SLOTS: Readonly<Record<string, readonly number[]>> = {
  "cloud-pool-1": [1, 2, 4, 5], "cloud-pool-2": [4, 5], "cloud-pool-3": [1, 2, 4, 5], "cloud-pool-4": [1, 2], "cloud-pool-5": [2, 3, 4],
};
export const CLOUD_SPA_SEATS: readonly PavilionSeat[] = CLOUD_SPA_PLACES.flatMap(place => Array.from({ length: CLOUD_SPA_SEAT_CAPACITY }, (_, slot) => {
  const angle = slot * Math.PI / 3, side = slot < 3 ? -1 : 1, pool = place.kind === "pool";
  const facing = angle + ((CLOUD_SPA_OUTWARD_SLOTS[place.spotId] ?? []).includes(slot) ? Math.PI : 0);
  return { id: `${place.spotId}-seat-${slot}`, pavilionId: place.id, spotId: place.spotId, name: place.name, slot,
    x: place.x + (pool ? Math.sin(angle) * (place.radius - 3) : side * 10.5),
    z: place.z + (pool ? Math.cos(angle) * (place.radius - 3) : (slot % 3 - 1) * 2),
    yaw: pool ? Math.atan2(Math.sin(facing), Math.cos(facing)) : side * Math.PI / 2,
    avatarY: place.seatY, baseY: place.groundY, incline: 0 };
}));
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
