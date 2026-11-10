import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";
import { UYUNI_HOTELS } from "./uyuni-hotel-layout";

export type UyuniBunkerId = "dawn" | "dusk";
export const BUNKER_FLOOR_Y = -8.6;
export const BUNKER_CEILING_Y = 3.4;
/** The hall around the hotel's centre. The ladder stays under the deck hatch, so the hall grows sideways and far to the back. */
export const BUNKER_EXTENT = { minX: -18, maxX: 18, minZ: -9, maxZ: 27 } as const;
export const BUNKER_WIDTH = BUNKER_EXTENT.maxX - BUNKER_EXTENT.minX;
export const BUNKER_DEPTH = BUNKER_EXTENT.maxZ - BUNKER_EXTENT.minZ;
/** A gallery crosses the front of the hall: the ladder comes down under it, and the room opens to full height past its edge. */
export const BUNKER_ENTRY = { z: -5.2, ceiling: 5.6 } as const;
/** The upper floor is a terrace across the back, reached by a stair against each side of the lagoon. */
/** The side galleries: how far from the middle of the hall their inner edge is, and the clear height under them. */
export const BUNKER_GALLERY = { inner: 15.4, under: 4 } as const;
export const BUNKER_TERRACE = { height: 4.4, z: 17, stairZ: 8.6, stairInner: 10.5, stairOuter: 16.5 } as const;
/** The lagoon lies between the stairs, below the cliff the terrace stands on. `level` is its surface against the hall floor. */
export const BUNKER_LAGOON = { minX: -9.5, maxX: 9.5, minZ: 9.6, maxZ: 15.2, level: -.28, depth: 1.1 } as const;
/** Where the tallest fall lands, and where the fire burns. Shared by the hall's light and water. */
export const BUNKER_SPRING_LOCAL = { x: 0, z: 14.9 } as const;
export const BUNKER_HEARTH_LOCAL = { x: -17.25, z: 2 } as const;

/** How far the walkable floor stands above the hall floor, in room coordinates. Every point has one answer: nothing is walkable under the terrace. */
export function bunkerFloorRise(x: number, z: number): number {
  const T = BUNKER_TERRACE, side = Math.abs(x);
  if (z >= T.z) return T.height;
  if (z > T.stairZ && side >= T.stairInner && side <= T.stairOuter) return T.height * (z - T.stairZ) / (T.z - T.stairZ);
  return 0;
}
/** Clear height above the hall floor: low under the front gallery and the two side galleries, the full vault everywhere else. */
export function bunkerCeilingRise(x: number, z: number): number {
  if (z < BUNKER_ENTRY.z) return BUNKER_ENTRY.ceiling;
  if (Math.abs(x) > BUNKER_GALLERY.inner && z < BUNKER_TERRACE.stairZ) return BUNKER_GALLERY.under;
  return BUNKER_CEILING_Y - BUNKER_FLOOR_Y;
}

export const BUNKER_PLAYER_INSET = .4;
export const BUNKER_INTERACTION_REACH = 1.8;
export const BUNKER_SEAT_REACH = 2.2;
export const BUNKER_SEAT_CAPACITY = 6;
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
export const BUNKER_SEATS: readonly PavilionSeat[] = UYUNI_BUNKERS.flatMap(bunker => BUNKER_SOFA_LOCAL.map((seat, slot) => ({
  id: `${bunker.spotId}-${slot}`, pavilionId: `bunker-${bunker.id}`, spotId: bunker.spotId, name: bunker.name, slot,
  x: bunker.x + seat.x, z: bunker.z + seat.z, yaw: seat.yaw,
  baseY: BUNKER_FLOOR_Y, avatarY: BUNKER_FLOOR_Y + BUNKER_SEAT_HEIGHT, incline: 0,
})));

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

export type BunkerColliderKind = "wall" | "sofa" | "table" | "shelf" | "plant" | "ladder";
export interface BunkerCollider extends ShelterCollider { bunkerId: UyuniBunkerId; kind: BunkerColliderKind }
export const BUNKER_COLLIDERS: readonly BunkerCollider[] = UYUNI_BUNKERS.flatMap(bunker => {
  const rect = (kind: BunkerColliderKind, x: number, z: number, halfX: number, halfZ: number): BunkerCollider => ({
    bunkerId: bunker.id, kind, minX: bunker.x + x - halfX, maxX: bunker.x + x + halfX,
    minZ: bunker.z + z - halfZ, maxZ: bunker.z + z + halfZ,
  });
  const E = BUNKER_EXTENT, T = BUNKER_TERRACE, midZ = (E.minZ + E.maxZ) / 2, halfZ = BUNKER_DEPTH / 2 + .32;
  return [
    rect("wall", E.minX - .16, midZ, .16, halfZ), rect("wall", E.maxX + .16, midZ, .16, halfZ),
    rect("wall", 0, E.minZ - .16, BUNKER_WIDTH / 2, .16), rect("wall", 0, E.maxZ + .16, BUNKER_WIDTH / 2, .16),
    // The lounge under the vault: two sofas, the coffee table and their end tables. The ladder stands under the front gallery.
    rect("sofa", -5.4, 0, 1.02, 2.98), rect("sofa", 5.4, 0, 1.02, 2.98),
    rect("table", 0, .25, 1.65, 1.1),
    rect("table", -5.3, -3.85, .51, .51), rect("table", 5.3, 3.85, .51, .51),
    rect("ladder", 0, -6.85, .62, .6),
    ...[-13, -4.5, 4.5, 13].map(x => rect("wall", x, BUNKER_ENTRY.z, .32, .32)),
    ...BUNKER_GAMES_LOCAL.flatMap(table => [rect("table", table.x, table.z, .7, .7), rect("plant", table.x - 1.15, table.z, .42, .42), rect("plant", table.x + 1.15, table.z, .42, .42)]),
    // Two trees in marble planters, the library and hearth along the west wall, the daybed and a tea table along the east.
    rect("plant", -12.6, -3.2, .95, .95), rect("plant", 12.6, -3.2, .95, .95),
    rect("shelf", -17.45, 2, .55, 6.4), rect("sofa", -14.3, .2, .7, .7), rect("sofa", -14.3, 3.8, .7, .7), rect("table", -14.5, 2, .42, .42),
    rect("sofa", 16.3, 1.2, 1.7, 2.3), rect("table", 16.9, -1.9, .5, .5), rect("table", 16.9, 4.3, .5, .5), rect("table", 12.6, 6.1, 1.25, 1.1),
    // The lagoon and its cliff fill the space between the stairs, up to the terrace rail. Planted steps close the outside of each stair.
    rect("plant", 0, (T.stairZ + .7 + T.z + .4) / 2, T.stairInner, (T.z + .4 - T.stairZ - .7) / 2),
    rect("wall", -(T.stairOuter + E.maxX) / 2, (T.stairZ + T.z) / 2, (E.maxX - T.stairOuter) / 2, (T.z - T.stairZ) / 2),
    rect("wall", (T.stairOuter + E.maxX) / 2, (T.stairZ + T.z) / 2, (E.maxX - T.stairOuter) / 2, (T.z - T.stairZ) / 2),
    // Upstairs: the stream that feeds the falls, two trees, a reading pavilion, and books and beds along the walls.
    rect("plant", 0, 18.35, 8.4, .5), rect("plant", -10.6, 22.6, .9, .9), rect("plant", 10.8, 22.2, .9, .9),
    rect("sofa", -2.3, 24.4, .55, 1.3), rect("sofa", 2.3, 24.4, .55, 1.3), rect("table", 0, 24.4, .7, .7),
    rect("shelf", 0, 26.5, 17.9, .5), rect("plant", -17.3, 21.6, .7, 3.6), rect("plant", 17.3, 21.6, .7, 3.6),
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
