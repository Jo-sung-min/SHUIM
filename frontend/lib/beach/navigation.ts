export interface WallRect { minX: number; maxX: number; minZ: number; maxZ: number }

/** Keep a comfortable viewing radius without choosing a seat or walking through a bench. */
export function findClearApproach(
  from: { x: number; z: number }, center: { x: number; z: number }, preferredRadius: number,
  obstacles: readonly { x: number; z: number; r: number }[], walls: readonly WallRect[], bounds: WallRect,
): { x: number; z: number } | null {
  const playerRadius = 0.35;
  const angle = Math.atan2(from.z - center.z, from.x - center.x);
  const preferred = Math.min(4.6, Math.max(2.4, preferredRadius));
  let fallback: { x: number; z: number } | null = null;
  const clearPoint = (x: number, z: number) => {
    if (x < bounds.minX + 0.4 || x > bounds.maxX - 0.4 || z < bounds.minZ + 0.4 || z > bounds.maxZ - 0.4) return false;
    if (obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + playerRadius + 0.02)) return false;
    const [resolvedX, resolvedZ] = resolveWalls(x, z, walls, playerRadius + 0.02);
    return resolvedX === x && resolvedZ === z;
  };
  const clearSegment = (target: { x: number; z: number }) => {
    const dx = target.x - from.x, dz = target.z - from.z;
    const lengthSq = dx * dx + dz * dz;
    for (const obstacle of obstacles) {
      const t = lengthSq ? Math.max(0, Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / lengthSq)) : 0;
      if (Math.hypot(from.x + dx * t - obstacle.x, from.z + dz * t - obstacle.z) < obstacle.r + playerRadius - 1e-5) return false;
    }
    // Expanded walls also cover benches and tables in the shelters. The 0.15 m
    // samples are shorter than the avatar radius, including narrow wall corners.
    const steps = Math.max(1, Math.ceil(Math.sqrt(lengthSq) / 0.15));
    for (let step = 0; step <= steps; step++) {
      const x = from.x + dx * step / steps, z = from.z + dz * step / steps;
      const [resolvedX, resolvedZ] = resolveWalls(x, z, walls, playerRadius);
      if (Math.abs(resolvedX - x) > 1e-5 || Math.abs(resolvedZ - z) > 1e-5) return false;
    }
    return true;
  };
  for (const radius of new Set([preferred, 4.2, Math.min(3.2, preferred)])) {
    for (let step = 0; step <= 36; step++) {
      for (const sign of step === 0 ? [1] : [-1, 1]) {
        const theta = angle + sign * step * Math.PI / 36;
        const target = { x: center.x + Math.cos(theta) * radius, z: center.z + Math.sin(theta) * radius };
        if (!clearPoint(target.x, target.z)) continue;
        fallback ??= target;
        if (clearSegment(target)) return target;
      }
    }
  }
  // Distant walls may require the existing walking detours, but the final
  // destination must always be reachable by an avatar of the actual radius.
  return fallback;
}

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
