export interface WallRect { minX: number; maxX: number; minZ: number; maxZ: number }

/** Resolve a walking avatar against solid walls while leaving open doorways passable. */
export function resolveWalls(x: number, z: number, walls: readonly WallRect[], radius = 0.35): [number, number] {
  // A second pass resolves the overlap where a bench meets its side wall.
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of walls) {
      const left = wall.minX - radius, right = wall.maxX + radius;
      const front = wall.minZ - radius, back = wall.maxZ + radius;
      if (x <= left || x >= right || z <= front || z >= back) continue;
      const distances = [x - left, right - x, z - front, back - z];
      const nearest = distances.indexOf(Math.min(...distances));
      if (nearest === 0) x = left;
      else if (nearest === 1) x = right;
      else if (nearest === 2) z = front;
      else z = back;
    }
  }
  return [x, z];
}
