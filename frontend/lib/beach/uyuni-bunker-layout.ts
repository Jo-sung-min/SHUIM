import type { PavilionSeat } from "./bamboo-trail";
import type { ShelterCollider } from "./shelters";
import { UYUNI_HOTELS } from "./uyuni-hotel-layout";

export type UyuniBunkerId = "dawn" | "dusk";
export const BUNKER_FLOOR_Y = -8.6;
export const BUNKER_CEILING_Y = -2.6;
export const BUNKER_WIDTH = 20;
export const BUNKER_DEPTH = 18;
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
  id: hotel.id as UyuniBunkerId, name: `${hotel.name} 비밀 서재`, spotId: `bunker-${hotel.id}-sofa`,
  x: hotel.x, z: hotel.z, width: BUNKER_WIDTH, depth: BUNKER_DEPTH, floorY: BUNKER_FLOOR_Y, ceilingY: BUNKER_CEILING_Y,
  bounds: { minX: hotel.x - BUNKER_WIDTH / 2, maxX: hotel.x + BUNKER_WIDTH / 2, minZ: hotel.z - BUNKER_DEPTH / 2, maxZ: hotel.z + BUNKER_DEPTH / 2 },
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
  return [
    rect("wall", -10.16, 0, .16, 9.32), rect("wall", 10.16, 0, .16, 9.32),
    rect("wall", 0, -9.16, 10, .16), rect("wall", 0, 9.16, 10, .16),
    rect("sofa", -5.4, 0, 1.02, 2.98), rect("sofa", 5.4, 0, 1.02, 2.98),
    rect("table", 0, .25, 1.65, 1.1), rect("shelf", 0, 8.2, 6.6, .45),
    rect("plant", -8.1, 6.5, .65, .65), rect("plant", 8.1, 6.5, .65, .65),
    rect("table", -5.3, -3.85, .51, .51), rect("table", 5.3, 3.85, .51, .51),
    rect("ladder", 0, -6.85, .62, .6),
    rect("sofa", -9.32, 0, .55, 5.8), rect("sofa", 9.32, 0, .55, 5.8),
    ...BUNKER_GAMES_LOCAL.flatMap(table => [rect("table", table.x, table.z, .7, .7), rect("plant", table.x - 1.15, table.z, .42, .42), rect("plant", table.x + 1.15, table.z, .42, .42)]),
    rect("plant", -8.1, -6.2, .3, .3), rect("plant", 8.1, -6.2, .3, .3),
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
export function bunkerColliders(id: string | null | undefined): readonly BunkerCollider[] {
  return BUNKER_COLLIDERS.filter(collider => collider.bunkerId === id);
}
