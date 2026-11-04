export interface WallRect { minX: number; maxX: number; minZ: number; maxZ: number }

/** Plan only when an action is requested. Clearance-aware corners fit doors and furniture aisles. */
export function findWalkingPath(
  from: { x: number; z: number }, target: { x: number; z: number },
  obstacles: readonly { x: number; z: number; r: number }[], walls: readonly WallRect[], bounds: WallRect,
): { x: number; z: number }[] | null {
  const radius = 0.4, spacing = 0.35;
  const clear = (x: number, z: number) => {
    if (x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius) return false;
    if (obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + radius)) return false;
    const p = resolveWalls(x, z, walls, radius);
    return Math.abs(p[0] - x) < 1e-7 && Math.abs(p[1] - z) < 1e-7;
  };
  const segment = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.12));
    for (let i = 0; i <= steps; i++) if (!clear(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps)) return false;
    return true;
  };
  if (!clear(from.x, from.z) || !clear(target.x, target.z)) return null;
  if (segment(from, target)) return [{ ...target }];
  const left = Math.max(bounds.minX + radius, Math.min(from.x, target.x) - 7);
  const front = Math.max(bounds.minZ + radius, Math.min(from.z, target.z) - 7);
  const right = Math.min(bounds.maxX - radius, Math.max(from.x, target.x) + 7);
  const back = Math.min(bounds.maxZ - radius, Math.max(from.z, target.z) + 7);
  const width = Math.floor((right - left) / spacing) + 1, depth = Math.floor((back - front) / spacing) + 1;
  const point = (id: number) => ({ x: left + id % width * spacing, z: front + Math.floor(id / width) * spacing });
  const nearest = (p: { x: number; z: number }) => {
    const cx = Math.round((p.x - left) / spacing), cz = Math.round((p.z - front) / spacing);
    let found = -1, distance = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || x >= width || z < 0 || z >= depth) continue;
      const id = z * width + x, q = point(id), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < distance && segment(p, q)) { found = id; distance = d; }
    }
    return found;
  };
  const start = nearest(from), goal = nearest(target);
  if (start < 0 || goal < 0) return null;
  const parents = new Int32Array(width * depth).fill(-1), queue = new Int32Array(width * depth);
  parents[start] = start; queue[0] = start;
  let head = 0, tail = 1;
  while (head < tail && parents[goal] < 0) {
    const id = queue[head++], x = id % width, z = Math.floor(id / width), p = point(id);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= depth) continue;
      const next = nz * width + nx;
      if (parents[next] >= 0 || !segment(p, point(next))) continue;
      parents[next] = id; queue[tail++] = next;
    }
  }
  if (parents[goal] < 0) return null;
  const route = [{ ...target }];
  for (let id = goal; ; id = parents[id]) { route.push(point(id)); if (id === start) break; }
  route.push({ ...from }); route.reverse();
  const smooth: { x: number; z: number }[] = [];
  for (let i = 0; i < route.length - 1;) {
    let next = route.length - 1;
    while (next > i + 1 && !segment(route[i], route[next])) next--;
    smooth.push(route[next]); i = next;
  }
  return smooth;
}

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
