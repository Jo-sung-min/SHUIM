import type { BedSlot, Shelter, ShelterCollider, ShelterSeat } from "./shelters";

export const UYUNI_HOTELS: readonly Shelter[] = [
  { id: "dawn", name: "새벽빛 호텔", x: -12, z: 23, width: 9.6, depth: 9.8, floorY: 0.48 },
  { id: "dusk", name: "별물결 호텔", x: 12, z: 29, width: 9.6, depth: 9.8, floorY: 0.48 },
];
export const UYUNI_HOTEL_BED_CAPACITY = 2;
export const UYUNI_HOTEL_CHAISE_CAPACITY = 2;
export const UYUNI_HOTEL_CHAISE_REACH = 2.2;
export const UYUNI_HOTEL_DECK = { halfWidth: 5.8, front: -8.5, back: 4.9, rampWidth: 2.6, rampLength: 3 } as const;

export function uyuniHotelForSpot(spotId: string | null | undefined): Shelter | null {
  return UYUNI_HOTELS.find(hotel => `hotel-${hotel.id}` === spotId || `hotel-${hotel.id}-chaise` === spotId) ?? null;
}

export function isUyuniChaiseSpot(spotId: string | null | undefined): boolean {
  return UYUNI_HOTELS.some(hotel => `hotel-${hotel.id}-chaise` === spotId);
}

export function uyuniHotelBedSlot(spotId: string, slot: number): BedSlot | null {
  const hotel = uyuniHotelForSpot(spotId);
  if (!hotel || !Number.isInteger(slot) || slot < 0 || slot >= UYUNI_HOTEL_BED_CAPACITY) return null;
  // Inclined rest poses tuck the body 20 cm below their anchor for bed quilts.
  // Give it back on this uncovered lounger, plus 6 cm for its curved backrest.
  if (isUyuniChaiseSpot(spotId)) return { spotId, slot, x: hotel.x + (slot ? 3.3 : -3.3), z: hotel.z - 7.5,
    yaw: Math.PI, avatarY: 1.18, incline: .20 };
  return { spotId, slot, x: hotel.x + (slot - 0.5) * 3, z: hotel.z + 1.5,
    yaw: Math.PI, avatarY: 1.12, incline: 0.25 };
}

export function claimedUyuniHotelBed(state: { pose?: string; spotId?: string | null; slot?: number | null }): BedSlot | null {
  return state.pose === "lying" && typeof state.spotId === "string" && typeof state.slot === "number"
    ? uyuniHotelBedSlot(state.spotId, state.slot) : null;
}

/** Room reach matches the server, so a bed button cannot offer a claim through a wall. */
export function nearbyUyuniHotel(x: number, z: number): Shelter | null {
  return UYUNI_HOTELS.find(hotel => Math.abs(x - hotel.x) <= 4.35
    && z >= hotel.z - 4.5 && z <= hotel.z + 4.45
    && Math.hypot(x - hotel.x, z - hotel.z) <= 5.5) ?? null;
}

/** Deck loungers are approached outside the hotel, independently of the indoor beds. */
export function nearbyUyuniChaise(x: number, z: number): Shelter | null {
  return UYUNI_HOTELS.find(hotel => [-1, 1].some(side =>
    Math.hypot(x - hotel.x - side * 3.3, z - hotel.z + 6.6) <= UYUNI_HOTEL_CHAISE_REACH)) ?? null;
}

export const UYUNI_HOTEL_SEATS: readonly ShelterSeat[] = UYUNI_HOTELS.flatMap(hotel => [-0.55, 0.55].map((offset, index) => ({
  id: `hotel-${hotel.id}-sofa-${index}`, shelterId: `hotel-${hotel.id}`, name: hotel.name,
  x: hotel.x - 3.52, z: hotel.z - 1.3 + offset, yaw: -Math.PI / 2,
})));

export const UYUNI_HOTEL_COLLIDERS: readonly ShelterCollider[] = UYUNI_HOTELS.flatMap(hotel => {
  const rect = (x: number, z: number, width: number, depth: number): ShelterCollider => ({
    minX: hotel.x + x - width / 2, maxX: hotel.x + x + width / 2,
    minZ: hotel.z + z - depth / 2, maxZ: hotel.z + z + depth / 2,
  });
  return [
    rect(-4.72, 0, 0.16, 9.8), rect(4.72, 0, 0.16, 9.8), rect(0, 4.8, 9.6, 0.2),
    rect(-5.7, -1.8, 0.16, 13.4), rect(5.7, -1.8, 0.16, 13.4),
    rect(-1.5, 2.45, 2.1, 2.7), rect(1.5, 2.45, 2.1, 2.7),
    rect(-3.3, -1.3, 1.6, 2.4), rect(0, -2, 1.3, 1.3),
    rect(-3.3, -6.6, 1.35, 2.5), rect(3.3, -6.6, 1.35, 2.5),
  ];
});

/** Decks stand above the mirror; the front ramp rises continuously from shallow water. */
export function uyuniHotelFloorHeight(x: number, z: number): number {
  for (const hotel of UYUNI_HOTELS) {
    const dx = Math.abs(x - hotel.x), dz = z - hotel.z;
    if (dx <= UYUNI_HOTEL_DECK.halfWidth && dz >= UYUNI_HOTEL_DECK.front && dz <= UYUNI_HOTEL_DECK.back) return hotel.floorY;
    if (dx <= UYUNI_HOTEL_DECK.rampWidth / 2 && dz >= UYUNI_HOTEL_DECK.front - UYUNI_HOTEL_DECK.rampLength && dz < UYUNI_HOTEL_DECK.front) {
      return hotel.floorY * (dz - UYUNI_HOTEL_DECK.front + UYUNI_HOTEL_DECK.rampLength) / UYUNI_HOTEL_DECK.rampLength;
    }
  }
  return 0;
}

/** Conservative inner roof clearance; the follow camera stays inside the curved shell. */
export function uyuniHotelCeilingHeight(x: number, z: number): number | null {
  const hotel = UYUNI_HOTELS.find(h => Math.abs(x - h.x) < h.width / 2 && Math.abs(z - h.z) < h.depth / 2);
  if (!hotel) return null;
  const t = Math.abs(x - hotel.x) / (hotel.width / 2);
  const along = (z - hotel.z + hotel.depth / 2) / hotel.depth;
  return hotel.floorY + (4.55 + 0.25 * Math.sin(Math.PI * along)) * Math.sqrt(Math.max(0, 1 - t * t));
}
