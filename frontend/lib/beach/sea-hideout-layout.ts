import type { PavilionSeat } from "./bamboo-trail";

export const HIDEOUT_BENCH = { spotId: "seahideout-window-bench", name: "창가 벤치", kind: "bench" } as const;
export const HIDEOUT_SEAT_REACH = 2.5;
export const HIDEOUT_SEATS: PavilionSeat[] = [-3.5, -1.9].map((x, slot) => ({
  id: `window-seat-${slot}`, pavilionId: "window", ...HIDEOUT_BENCH, slot,
  x, z: -.87, yaw: 0, baseY: 0, avatarY: .55, incline: 0,
}));

export function claimedHideoutSeat(state: { pose?: string; spotId?: string | null; slot?: number | null }) {
  return state.pose === "sitting" && state.spotId === HIDEOUT_BENCH.spotId
    ? HIDEOUT_SEATS.find(seat => seat.slot === state.slot) ?? null : null;
}

export const hideoutSeats = {
  seats: HIDEOUT_SEATS, claimed: claimedHideoutSeat,
  forSpot: (id: string | null | undefined) => id === HIDEOUT_BENCH.spotId ? HIDEOUT_BENCH : null,
  nearby: (x: number, z: number) => HIDEOUT_SEATS.some(s => Math.hypot(x - s.x, z - s.z) <= HIDEOUT_SEAT_REACH) ? HIDEOUT_BENCH : null,
};

// Overlapping strips keep the passage continuous around the blind corner. Extents include avatar clearance.
const floors = [
  [-6, 4, -2.9, 6.1], [3.8, 8.6, 3.9, 5.9], [6.6, 8.6, 4, 8.2],
  [6.7, 15.4, 6.2, 8.2], [12.6, 15.4, -9.5, 8.2],
] as const;
const furniture = [
  [-6, -4.65, .3, 4.45], [.55, 3.8, -2.9, -1.45], [-4.25, -1.15, -1.38, -.38],
] as const;

export function resolveHideoutWalk(x: number, z: number): [number, number] {
  let px = x, pz = z, best = Infinity;
  for (const [left, right, front, back] of floors) {
    const cx = Math.max(left, Math.min(right, x)), cz = Math.max(front, Math.min(back, z));
    const distance = (cx - x) ** 2 + (cz - z) ** 2;
    if (distance < best) { px = cx; pz = cz; best = distance; }
  }
  for (const [left, right, front, back] of furniture) {
    if (px <= left || px >= right || pz <= front || pz >= back) continue;
    // Furniture against an outer wall can only be approached from its exposed sides.
    const gaps = [left > -6 ? px - left : Infinity, right - px, front > -2.9 ? pz - front : Infinity, back - pz];
    const side = gaps.indexOf(Math.min(...gaps));
    if (side === 0) px = left;
    else if (side === 1) px = right;
    else if (side === 2) pz = front;
    else pz = back;
  }
  return [px, pz];
}
export function hideoutCeiling(x: number, z: number) {
  return x < 6.6 && z > -3.35 && z < 6.6 ? 3.05 : null;
}
export function hideoutCameraFree(x: number, y: number, z: number) {
  return y > .18 && y < (hideoutCeiling(x, z) ?? Infinity) - .14 &&
    floors.some(([left, right, front, back]) => x >= left - .12 && x <= right + .12 && z >= front - .12 && z <= back + .12);
}
