import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";
import { UYUNI_HOTELS } from "./uyuni-hotel-layout";

export type UyuniBunkerId = "dawn" | "dusk";
export const BUNKER_FLOOR_Y = -8.6;
/** Flat glazing below the shallow salt-flat water, measured from the indoor floor. */
export const BUNKER_GLASS_ROOF_Y = 8.25;
export const BUNKER_CEILING_Y = BUNKER_FLOOR_Y + BUNKER_GLASS_ROOF_Y;
/** What the server allows a visitor's position to be, around the hotel's centre. The oval hall lies inside it. */
export const BUNKER_EXTENT = { minX: -18, maxX: 18, minZ: -9, maxZ: 27 } as const;
export const BUNKER_WIDTH = BUNKER_EXTENT.maxX - BUNKER_EXTENT.minX;
export const BUNKER_DEPTH = BUNKER_EXTENT.maxZ - BUNKER_EXTENT.minZ;
/**
 * The hall is an oval room: `a` across and `b` front to back are the half-widths of its wall, around `cz`.
 * Points in it are described by an oval radius (0 in the middle, 1 at the wall) and an angle (0 straight back, ±π at the ladder).
 */
export const BUNKER_HALL = { cz: 9, a: 15, b: 18, wall: 8 } as const;
/**
 * The upper floor: a crescent across the back of the oval, `height` above the hall floor, whose front edge is the oval radius `edge`.
 * A stair climbs against each side wall, in the band of radii from `stair` to the wall, from the angle `foot` up to `top`.
 */
export const BUNKER_TERRACE = { height: 4.4, edge: .55, stair: .8, top: .9, foot: 2.05, steps: 30 } as const;
/** A balcony runs round the front of the oval over the ladder: everything past the angle `from` and the radius `edge` has `ceiling` overhead. */
export const BUNKER_ENTRY = { from: 2.45, edge: .84, ceiling: 4 } as const;
/** The angles of the slender columns under the front edge of the balcony, on each side of the ladder. */
export const BUNKER_ENTRY_COLUMNS = [-2.92, -2.62, 2.62, 2.92] as const;
/** The lake in the middle of the hall: an oval around x, z. `level` is its surface against the hall floor; a marble kerb `kerb` wide rings it. */
export const BUNKER_LAGOON = { x: 0, z: 10.6, a: 6.6, b: 3.2, level: -.28, depth: .9, kerb: .35 } as const;
/** A marble basin at the foot of the terrace wall catches the water that falls over its middle. */
export const BUNKER_FOUNTAIN = { x: 0, z: 18.45, halfX: 2.1, halfZ: .45, rim: .55 } as const;
/** Where the fall lands, and where the fire burns. Shared by the hall's light and water. */
export const BUNKER_SPRING_LOCAL = { x: BUNKER_FOUNTAIN.x, z: BUNKER_FOUNTAIN.z } as const;
export const BUNKER_HEARTH_ANGLE = -2.25;
export const BUNKER_HEARTH_LOCAL = hallPoint(1, BUNKER_HEARTH_ANGLE);

/** A point of the hall at an oval radius and angle. */
export function hallPoint(radius: number, angle: number): { x: number; z: number } {
  return { x: BUNKER_HALL.a * radius * Math.sin(angle), z: BUNKER_HALL.cz + BUNKER_HALL.b * radius * Math.cos(angle) };
}
/** 0 in the middle of the hall, 1 on its wall. */
export function hallRadius(x: number, z: number): number { return Math.hypot(x / BUNKER_HALL.a, (z - BUNKER_HALL.cz) / BUNKER_HALL.b); }
/** 0 straight to the back of the hall, ±π towards the ladder; positive on the east side. */
export function hallAngle(x: number, z: number): number { return Math.atan2(x / BUNKER_HALL.a, (z - BUNKER_HALL.cz) / BUNKER_HALL.b); }
/** Metres from the middle of the hall to its wall along the direction of `angle`. */
export function hallReach(angle: number): number { return Math.hypot(BUNKER_HALL.a * Math.sin(angle), BUNKER_HALL.b * Math.cos(angle)); }
/** The direction into the room, square to the wall, at `angle`. */
export function hallInward(angle: number): { x: number; z: number } {
  const x = -Math.sin(angle) / BUNKER_HALL.a, z = -Math.cos(angle) / BUNKER_HALL.b, length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

/**
 * How far up a stair a point is, from 0 at its foot to 1 at the terrace. The climb starts and ends gently, so neither the feet
 * nor the camera meet a sudden change of slope: the steepest part is the straight middle of the flight.
 */
export function stairClimb(t: number): number {
  const e = .1, m = 1 / (1 - e), u = Math.min(1, Math.max(0, t));
  if (u < e) return m * u * u / (2 * e);
  if (u > 1 - e) return 1 - m * (1 - u) * (1 - u) / (2 * e);
  return m * (u - e / 2);
}
/** Progress along a stair at an angle: 0 at the foot, 1 at the head. */
export function stairProgress(angle: number): number {
  const T = BUNKER_TERRACE;
  return (T.foot - Math.abs(angle)) / (T.foot - T.top);
}
/** How far the walkable floor stands above the hall floor, in room coordinates. Every point has one answer: nothing is walkable under the terrace or a stair. */
export function bunkerFloorRise(x: number, z: number): number {
  const T = BUNKER_TERRACE, r = hallRadius(x, z), angle = Math.abs(hallAngle(x, z));
  if (angle <= T.top && r >= T.edge) return T.height;
  if (r >= T.stair && angle < T.foot) return T.height * stairClimb(stairProgress(angle));
  return 0;
}
/** Clear height above the hall floor: low under the front balcony and pavilion, with a flat glass roof everywhere else. */
export function bunkerCeilingRise(x: number, z: number): number {
  const r = hallRadius(x, z), P = BUNKER_PAVILION_LOCAL;
  if (Math.abs(hallAngle(x, z)) >= BUNKER_ENTRY.from && r >= BUNKER_ENTRY.edge) return BUNKER_ENTRY.ceiling;
  if (Math.abs(x - P.x) < 3.4 && Math.abs(z - P.z) < 1.9) return BUNKER_TERRACE.height + 2.95;
  return BUNKER_GLASS_ROOF_Y;
}
/** True when a point is inside the oval wall with `inset` metres to spare. */
export function bunkerInside(x: number, z: number, inset = 0): boolean {
  return hallRadius(x, z) * hallReach(hallAngle(x, z)) <= hallReach(hallAngle(x, z)) - inset;
}
/** The lake and its kerb, grown by `inset`: the oval radius of a point around the lake's middle. Below 1 is in the water. */
export function lagoonRadius(x: number, z: number, inset = 0): number {
  const L = BUNKER_LAGOON;
  return Math.hypot((x - L.x) / (L.a + L.kerb + inset), (z - L.z) / (L.b + L.kerb + inset));
}
/** True inside the water of the lake itself, without its kerb. */
export function inLagoon(x: number, z: number): boolean {
  const L = BUNKER_LAGOON;
  return Math.hypot((x - L.x) / L.a, (z - L.z) / L.b) < 1;
}

export const BUNKER_PLAYER_INSET = .4;
/**
 * Keeps a walker on the floor of the hall, in room coordinates: inside the oval wall and out of the lake.
 * Steps between levels are left to the caller, which knows where the walker came from.
 */
export function resolveBunkerWalk(x: number, z: number, inset = BUNKER_PLAYER_INSET): [number, number] {
  const L = BUNKER_LAGOON, H = BUNKER_HALL;
  const q = lagoonRadius(x, z, inset - .05);
  if (q < 1) {
    if (q < 1e-6) { z = L.z - (L.b + L.kerb + inset); }
    else { x = L.x + (x - L.x) / q; z = L.z + (z - L.z) / q; }
  }
  const angle = hallAngle(x, z), reach = hallReach(angle), r = hallRadius(x, z), most = Math.max(0, 1 - inset / reach - 1e-9);
  if (r > most) { x *= most / r; z = H.cz + (z - H.cz) * most / r; }
  return [x, z];
}
/** True when nothing within a walker's reach of a point stands or drops more than `step` from the floor under it. */
export function bunkerFootingClear(x: number, z: number, step = .3, reach = BUNKER_PLAYER_INSET - .05): boolean {
  const here = bunkerFloorRise(x, z);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    if (Math.abs(bunkerFloorRise(x + Math.sin(a) * reach, z + Math.cos(a) * reach) - here) > step) return false;
  }
  return true;
}
/**
 * True when walking straight from one point to another never meets a step higher than `step`, and the walker ends with a
 * body's width between them and the edge of the terrace or the open side of a stair: they stand behind its rail, never out on the ledge.
 */
export function bunkerStepClear(x0: number, z0: number, x1: number, z1: number, step = .3): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .08));
  let previous = bunkerFloorRise(x0, z0);
  for (let i = 1; i <= count; i++) {
    const t = i / count, height = bunkerFloorRise(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (Math.abs(height - previous) > step) return false;
    previous = height;
  }
  // Somebody already too near an edge (put there by a resumed visit) can still walk away from it.
  return bunkerFootingClear(x1, z1, step) || !bunkerFootingClear(x0, z0, step);
}

export const BUNKER_INTERACTION_REACH = 1.8;
export const BUNKER_SEAT_REACH = 2.2;
export const BUNKER_SEAT_CAPACITY = 21;
export const BUNKER_SEAT_HEIGHT = .52;
export const BUNKER_LADDER_LOCAL = { x: 0, z: -6.8 } as const;
export const BUNKER_ARRIVAL_LOCAL = { x: 0, z: -5.4, yaw: Math.PI } as const;

export interface UyuniBunker {
  id: UyuniBunkerId; name: string; spotId: string;
  x: number; z: number; width: number; depth: number; floorY: number; ceilingY: number;
  bounds: ShelterCollider;
  entry: { x: number; z: number; y: number };
  ladder: { x: number; z: number; y: number };
  arrival: { x: number; z: number; y: number; yaw: number };
}

/** Identical horizontal coordinates identify different floors, never an outdoor walking room. */
export const UYUNI_BUNKERS: readonly UyuniBunker[] = UYUNI_HOTELS.map(hotel => ({
  id: hotel.id as UyuniBunkerId, name: `${hotel.name} 지하 쉼터`, spotId: `bunker-${hotel.id}-sofa`,
  x: hotel.x, z: hotel.z, width: BUNKER_WIDTH, depth: BUNKER_DEPTH, floorY: BUNKER_FLOOR_Y, ceilingY: BUNKER_CEILING_Y,
  bounds: { minX: hotel.x + BUNKER_EXTENT.minX, maxX: hotel.x + BUNKER_EXTENT.maxX, minZ: hotel.z + BUNKER_EXTENT.minZ, maxZ: hotel.z + BUNKER_EXTENT.maxZ },
  entry: { x: hotel.x, z: hotel.z + BUNKER_LADDER_LOCAL.z, y: hotel.floorY },
  ladder: { x: hotel.x, z: hotel.z + BUNKER_LADDER_LOCAL.z, y: BUNKER_FLOOR_Y },
  arrival: { x: hotel.x, z: hotel.z + BUNKER_ARRIVAL_LOCAL.z, y: BUNKER_FLOOR_Y, yaw: BUNKER_ARRIVAL_LOCAL.yaw },
}));

/** Three generous cushions on either side face the shared table; slots are server-stable. */
export const BUNKER_SOFA_LOCAL: readonly { x: number; z: number; yaw: number }[] = [-1, 1].flatMap(side =>
  [-1.8, 0, 1.8].map(z => ({ x: side * 5.3, z, yaw: side * Math.PI / 2 })));

export type BunkerGameKind = "omok" | "othello";
export const BUNKER_GAME_REACH = 2.4;
export const BUNKER_GAMES_LOCAL: readonly { game: BunkerGameKind; name: string; x: number; z: number }[] = [
  { game: "omok", name: "오목", x: -3.6, z: 5.5 }, { game: "othello", name: "오셀로", x: 3.6, z: 5.5 },
];
export interface BunkerGameTable { id: string; bunkerId: UyuniBunkerId; game: BunkerGameKind; name: string; x: number; z: number }
/** Fireside game tables. Mirrored by BeachBoardGames.SPOTS on the server. */
export const BUNKER_GAME_TABLES: readonly BunkerGameTable[] = UYUNI_BUNKERS.flatMap(bunker => BUNKER_GAMES_LOCAL.map(table => ({
  id: `bunker-${bunker.id}-${table.game}`, bunkerId: bunker.id, game: table.game, name: table.name, x: bunker.x + table.x, z: bunker.z + table.z,
})));

/** Furniture against the wall, placed by the angle of the wall behind it: the fire to the west, the daybed to the east. */
export const BUNKER_DAYBED_ANGLE = 2.25;
/** The two trees that stand at either end of the lake, and the two on the terrace. */
export const BUNKER_TREES_LOCAL: readonly { x: number; z: number; upstairs: boolean }[] = [
  { x: -9.6, z: 11.2, upstairs: false }, { x: 9.6, z: 11.2, upstairs: false },
  { ...hallPoint(.8, -.5), upstairs: true }, { ...hallPoint(.8, .5), upstairs: true },
];
/** The reading pavilion on the terrace. */
export const BUNKER_PAVILION_LOCAL = { x: 0, z: 23.4 } as const;

/** Stable slots: lounge 0–5, fireside 6–7, game poufs 8–11, daybed 12–14, reading benches 15–20. */
export const BUNKER_FURNITURE_SEATS_LOCAL = (() => {
  const seats = BUNKER_SOFA_LOCAL.map(seat => ({ ...seat, x: seat.x + Math.sign(seat.x) * .2, height: BUNKER_SEAT_HEIGHT, floor: 0, name: "소파" }));
  const atWall = (angle: number, u: number, v: number) => {
    const origin = hallPoint(1, angle), n = hallInward(angle);
    return { x: origin.x + n.z * u + n.x * v, z: origin.z - n.x * u + n.z * v, yaw: Math.atan2(n.x, n.z) };
  };
  for (const side of [-1.05, 1.05]) {
    const at = atWall(BUNKER_HEARTH_ANGLE, side, 2.6), yaw = at.yaw + side * .25;
    seats.push({ x: at.x, z: at.z, yaw, height: .62, floor: 0, name: "난롯가 의자" });
  }
  for (const table of BUNKER_GAMES_LOCAL) for (const side of [-1, 1]) {
    seats.push({ x: table.x + side * 1.15, z: table.z, yaw: side * Math.PI / 2, height: .3008, floor: 0, name: "게임 테이블 방석" });
  }
  for (const side of [-.85, 0, .85]) {
    const at = atWall(BUNKER_DAYBED_ANGLE, side, .95), yaw = Math.atan2(Math.sin(at.yaw + Math.PI), Math.cos(at.yaw + Math.PI));
    seats.push({ x: at.x, z: at.z, yaw, height: side < -.55 ? .825 : .90, floor: 0, name: "창가 긴 소파" });
  }
  for (const side of [-1, 1]) for (const offset of [-.8, 0, .8]) {
    seats.push({ x: side * 2.36, z: BUNKER_PAVILION_LOCAL.z + offset, yaw: side * Math.PI / 2, height: BUNKER_TERRACE.height + .66, floor: BUNKER_TERRACE.height, name: "위층 독서 벤치" });
  }
  return seats;
})();

export const BUNKER_SEATS: readonly PavilionSeat[] = UYUNI_BUNKERS.flatMap(bunker => BUNKER_FURNITURE_SEATS_LOCAL.map((seat, slot) => ({
  id: `${bunker.spotId}-${slot}`, pavilionId: `bunker-${bunker.id}`, spotId: bunker.spotId, name: seat.name, slot,
  x: bunker.x + seat.x, z: bunker.z + seat.z, yaw: seat.yaw,
  baseY: BUNKER_FLOOR_Y + seat.floor, avatarY: BUNKER_FLOOR_Y + seat.height, incline: 0,
})));
/** Where a following camera may not go, in room coordinates: into the crown of a tree, where it would see nothing but leaves. */
export function bunkerCameraBlocked(x: number, y: number, z: number): boolean {
  return BUNKER_TREES_LOCAL.some(tree => Math.hypot(x - tree.x, z - tree.z, (y - (tree.upstairs ? BUNKER_TERRACE.height : 0) - 3.6) * .8) < 2.2);
}

export type BunkerColliderKind = "wall" | "sofa" | "table" | "shelf" | "plant" | "ladder";
export interface BunkerCollider extends ShelterCollider { bunkerId: UyuniBunkerId; kind: BunkerColliderKind }
export const BUNKER_COLLIDERS: readonly BunkerCollider[] = UYUNI_BUNKERS.flatMap(bunker => {
  const rect = (kind: BunkerColliderKind, x: number, z: number, halfX: number, halfZ: number): BunkerCollider => ({
    bunkerId: bunker.id, kind, minX: bunker.x + x - halfX, maxX: bunker.x + x + halfX,
    minZ: bunker.z + z - halfZ, maxZ: bunker.z + z + halfZ,
  });
  const hearth = BUNKER_HEARTH_LOCAL, inHearth = hallInward(BUNKER_HEARTH_ANGLE), bed = hallPoint(1, BUNKER_DAYBED_ANGLE), inBed = hallInward(BUNKER_DAYBED_ANGLE);
  const along = (from: { x: number; z: number }, inward: { x: number; z: number }, out: number, side: number) =>
    ({ x: from.x + inward.x * out + inward.z * side, z: from.z + inward.z * out - inward.x * side });
  const chairs = [-1.05, 1.05].map(side => along(hearth, inHearth, 2.6, side));
  const daybed = along(bed, inBed, 1.25, 0), F = BUNKER_FOUNTAIN, P = BUNKER_PAVILION_LOCAL;
  return [
    // The lounge under the dome: two sofas, the coffee table and their end tables. The ladder stands under the front balcony.
    rect("sofa", -5.45, 0, 1.1, 2.98), rect("sofa", 5.45, 0, 1.1, 2.98),
    rect("table", 0, .25, 1.65, 1.1),
    rect("table", -5.3, -3.85, .51, .51), rect("table", 5.3, 3.85, .51, .51),
    rect("ladder", 0, -6.85, .62, .6),
    ...BUNKER_ENTRY_COLUMNS.map(angle => { const at = hallPoint(BUNKER_ENTRY.edge + .01, angle); return rect("wall", at.x, at.z, .24, .24); }),
    ...BUNKER_GAMES_LOCAL.flatMap(table => [rect("table", table.x, table.z, .7, .7), rect("plant", table.x - 1.15, table.z, .42, .42), rect("plant", table.x + 1.15, table.z, .42, .42)]),
    // The fire stands out from the west wall with two chairs drawn up to it; the daybed lies along the east wall.
    rect("wall", hearth.x + inHearth.x * .45, hearth.z + inHearth.z * .45, .8, .95),
    ...chairs.map(chair => rect("sofa", chair.x, chair.z, .62, .62)),
    rect("sofa", daybed.x, daybed.z, 1.45, 1.35),
    // Trees in marble planters at the ends of the lake and on the terrace, and the basin the terrace's fall lands in.
    ...BUNKER_TREES_LOCAL.map(tree => rect("plant", tree.x, tree.z, .95, .95)),
    rect("plant", F.x, F.z, F.halfX, F.halfZ),
    // The reading pavilion upstairs.
    rect("sofa", P.x - 2.3, P.z, .55, 1.3), rect("sofa", P.x + 2.3, P.z, .55, 1.3), rect("table", P.x, P.z, .7, .7),
  ];
});

export function bunkerById(id: string | null | undefined): UyuniBunker | null {
  return UYUNI_BUNKERS.find(bunker => bunker.id === id) ?? null;
}
export function bunkerForSpot(spotId: string | null | undefined): UyuniBunker | null {
  return UYUNI_BUNKERS.find(bunker => bunker.spotId === spotId) ?? null;
}
export function bunkerSeat(spotId: string, slot: number): PavilionSeat | null {
  return Number.isInteger(slot) ? BUNKER_SEATS.find(seat => seat.spotId === spotId && seat.slot === slot) ?? null : null;
}
export function claimedBunkerSeat(state: { pose?: string; spotId?: string | null; slot?: number | null }): PavilionSeat | null {
  return state.pose === "sitting" && typeof state.spotId === "string" && typeof state.slot === "number"
    ? bunkerSeat(state.spotId, state.slot) : null;
}
export function nearbyBunkerEntry(x: number, z: number): UyuniBunker | null {
  return UYUNI_BUNKERS.find(bunker => Math.hypot(x - bunker.entry.x, z - bunker.entry.z) <= BUNKER_INTERACTION_REACH) ?? null;
}
export function nearbyBunkerLadder(id: string | null | undefined, x: number, z: number): UyuniBunker | null {
  const bunker = bunkerById(id);
  return bunker && Math.hypot(x - bunker.ladder.x, z - bunker.ladder.z) <= BUNKER_INTERACTION_REACH ? bunker : null;
}
export function nearbyBunkerSofa(id: string | null | undefined, x: number, z: number): UyuniBunker | null {
  const bunker = bunkerById(id);
  return bunker && BUNKER_SEATS.some(seat => seat.spotId === bunker.spotId && Math.hypot(x - seat.x, z - seat.z) <= BUNKER_SEAT_REACH) ? bunker : null;
}
export function nearbyBunkerGame(id: string | null | undefined, x: number, z: number): BunkerGameTable | null {
  return BUNKER_GAME_TABLES.find(table => table.bunkerId === id && Math.hypot(x - table.x, z - table.z) <= BUNKER_GAME_REACH) ?? null;
}
/** Floor and ceiling under a point of the world, for the hall with this id. */
export function bunkerFloorAt(id: string | null | undefined, x: number, z: number): number {
  const bunker = bunkerById(id);
  return bunker ? bunker.floorY + bunkerFloorRise(x - bunker.x, z - bunker.z) : BUNKER_FLOOR_Y;
}
export function bunkerCeilingAt(id: string | null | undefined, x: number, z: number): number {
  const bunker = bunkerById(id);
  return bunker ? bunker.floorY + bunkerCeilingRise(x - bunker.x, z - bunker.z) : BUNKER_CEILING_Y;
}
export function bunkerColliders(id: string | null | undefined): readonly BunkerCollider[] {
  return BUNKER_COLLIDERS.filter(collider => collider.bunkerId === id);
}
