import { BAMBOO_BOUNDS, groundHeight } from "./bamboo-trail";

export interface HeightfieldGrid { minX: number; maxX: number; minZ: number; maxZ: number; cell: number }
export interface HeightfieldData extends HeightfieldGrid {
  nx: number; nz: number;
  positions: Float32Array; uvs: Float32Array; indices: Uint16Array | Uint32Array;
}
type Rectangle = Pick<HeightfieldGrid, "minX" | "maxX" | "minZ" | "maxZ">;

// Keep at least one coarse skirt cell between its overlap and the walkable bounds.
export const BAMBOO_TERRAIN_GRID: HeightfieldGrid = {
  minX: Math.min(-62, BAMBOO_BOUNDS.minX - 7), maxX: 52, minZ: -12, maxZ: 124, cell: 1.5,
};
const smoothstep = (value: number, low: number, high: number) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** Cliff drop begins beyond each side's own bounds, including the wider western garden. */
export function bambooTerrainHeight(x: number, z: number): number {
  const north = smoothstep(z, BAMBOO_BOUNDS.maxZ, 164);
  const side = x < 0 ? -BAMBOO_BOUNDS.minX : BAMBOO_BOUNDS.maxX;
  const flank = smoothstep(Math.abs(x), side, 86) * smoothstep(z, 73, 94);
  return groundHeight(x, z) - 38 * (north + flank * (1 - north));
}

/** These exact Float32 vertices and diagonals are shared by rendering and foot contact. */
export function createHeightfieldData(grid: HeightfieldGrid, lift: (x: number, z: number) => number,
  cutout?: Rectangle): HeightfieldData {
  const { minX, maxX, minZ, maxZ, cell } = grid;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3), uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const i = iz * (nx + 1) + ix, x = minX + ix / nx * (maxX - minX), z = minZ + iz / nz * (maxZ - minZ);
    positions.set([x, lift(x, z), z], i * 3); uvs.set([ix / nx, iz / nz], i * 2);
  }
  const indices: number[] = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
    // Remove complete interior cells. The remaining narrow overlap is outside the
    // walkable area, so a coarse triangle can never cover a person on the fine mesh.
    if (cutout && positions[a * 3] >= cutout.minX && positions[d * 3] <= cutout.maxX
      && positions[a * 3 + 2] >= cutout.minZ && positions[d * 3 + 2] <= cutout.maxZ) continue;
    indices.push(a, c, b, b, c, d);
  }
  const IndexArray = positions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  return { ...grid, nx, nz, positions, uvs, indices: new IndexArray(indices) };
}

/** Exact barycentric contact on a full heightfield; no smoothing lag while climbing. */
export function sampleHeightfield(data: HeightfieldData, x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < data.minX || x > data.maxX || z < data.minZ || z > data.maxZ) return null;
  const ix = Math.min(data.nx - 1, Math.floor((x - data.minX) / (data.maxX - data.minX) * data.nx));
  const iz = Math.min(data.nz - 1, Math.floor((z - data.minZ) / (data.maxZ - data.minZ) * data.nz));
  const a = (iz * (data.nx + 1) + ix) * 3, b = a + 3, c = a + (data.nx + 1) * 3, d = c + 3, p = data.positions;
  const u = Math.max(0, Math.min(1, (x - p[a]) / (p[b] - p[a])));
  const v = Math.max(0, Math.min(1, (z - p[a + 2]) / (p[c + 2] - p[a + 2])));
  return u + v <= 1
    ? p[a + 1] + (p[b + 1] - p[a + 1]) * u + (p[c + 1] - p[a + 1]) * v
    : p[d + 1] + (p[c + 1] - p[d + 1]) * (1 - u) + (p[b + 1] - p[d + 1]) * (1 - v);
}
