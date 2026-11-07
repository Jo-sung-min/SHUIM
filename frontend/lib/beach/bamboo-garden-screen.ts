import {
  BAMBOO_PAVILIONS, DECK_YARD, PAVILION_YARD_HALF, SECRET_GARDEN, SECRET_GARDEN_PATHS, nearestOnTrail, onTrail, pavilionLocal, seededRandom, type StalkSite,
} from "./bamboo-trail";

/** Real, leafy bamboo conceals the garden exterior. It shares the forest's
 * instanced materials and is retained in the mobile/distant visibility prefix. */
export function secretGardenScreenSites(heightAt: (x: number, z: number) => number): StalkSite[] {
  const rand = seededRandom(31487), sites: StalkSite[] = [];
  const west = SECRET_GARDEN.minX - .5, east = SECRET_GARDEN.maxX + .5, spine = SECRET_GARDEN.spineX;
  const strips = [
    [west, 83.6, west, 113.8, -1, 0],
    [east, 85.5, east, 113.8, 1, 0],
    [west, 113.8, east, 113.8, 0, 1],
    [west, 83.6, spine - 2.6, 83.6, 0, -1],
    [spine + 2.5, 85.5, east, 85.5, 0, -1],
    [spine + 1.2, 77.8, -22.1, 77.8, 0, -1],
    [-27.7, 82.2, -24, 82.2, 0, 1],
  ];
  for (const [ax, az, bx, bz, nx, nz] of strips) {
    const length = Math.hypot(bx - ax, bz - az), steps = Math.ceil(length / 1.05);
    for (let row = 0; row < 3; row++) for (let i = 0; i <= steps; i++) {
      const t = Math.max(0, Math.min(1, (i + (row % 2 ? .5 : 0) + (rand() - .5) * .35) / steps));
      const offset = 1.35 + row * .9 + rand() * .25;
      const x = ax + (bx - ax) * t + nx * offset, z = az + (bz - az) * t + nz * offset;
      // Keep the hidden dogleg, stairs and the pavilion's walking yard open.
      if (nearestOnTrail(x, z).distance < 2.05 || onTrail(x, z)) continue;
      if (BAMBOO_PAVILIONS.some(p => {
        const { lx, lz } = pavilionLocal(p, x, z), halfX = p.kind === "deck" ? DECK_YARD.x : PAVILION_YARD_HALF;
        const halfZ = p.kind === "deck" ? DECK_YARD.z : PAVILION_YARD_HALF;
        return Math.abs(lx) < halfX + .5 && Math.abs(lz) < halfZ + .5;
      })) continue;
      // Keep the bridge and tower opening clear from every end of the lookout.
      if ([-3.75, 0, 3.75].some(eyeX => [97.6, 102.2, 109.4].some(eyeZ => {
        const distance = Math.hypot(x - eyeX, z - eyeZ);
        return Math.abs(Math.atan2(x - eyeX, z - eyeZ)) - Math.asin(Math.min(1, 3.8 / distance)) <= Math.PI / 5;
      }))) continue;
      if (sites.some(site => Math.hypot(site.x - x, site.z - z) < .42)) continue;
      const height = 14 + rand() * 4;
      sites.push({ x, z, y: heightAt(x, z), height, radius: .06 + rand() * .025,
        phase: rand() * Math.PI * 2, tint: .18 + rand() * .58, leafAt: .87 + rand() * .08, lean: (rand() - .5) * .035 });
    }
  }
  return sites;
}

/** Fine bamboo fronds overlap above the hidden approach; no solid trunk occupies it. */
export function secretGardenEntranceCanopy(heightAt: (x: number, z: number) => number) {
  const rand = seededRandom(31488), leaves: { x: number; y: number; z: number; size: number; phase: number; tint: number; yaw: number }[] = [];
  const path = SECRET_GARDEN_PATHS[0].points;
  // Start beyond the pavilion corner, then follow both bends to the opening.
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const count = Math.ceil(length / 1.35);
    for (let j = 0; j <= count; j++) for (const side of [-1, 1]) {
      const x = a[0] + dx * j / count - dz / length * .7 * side, z = a[1] + dz * j / count + dx / length * .7 * side;
      const size = 2.3 + rand() * .6;
      leaves.push({ x, z, y: heightAt(x, z) + 3.85 + rand() * .3, size, phase: rand() * Math.PI * 2,
        tint: .2 + rand() * .45, yaw: Math.atan2(dx, dz) + side * .8 });
    }
  }
  return leaves;
}

/** Low fronds conceal the garden through the gap beside the pavilion. The bank
 * starts beyond the walking corner and uses only the existing alpha-cutout leaves. */
export function secretGardenLowScreen(heightAt: (x: number, z: number) => number) {
  const rand = seededRandom(31489), leaves: ReturnType<typeof secretGardenEntranceCanopy> = [];
  for (const x of [-21.8, -23.4]) for (let i = 0; i < 6; i++) for (const height of [1.25, 3, 4.75]) {
    const z = 85.8 + i * 1.16;
    leaves.push({ x, z, y: heightAt(x, z) + height, size: 2.6, phase: rand() * Math.PI * 2,
      tint: .18 + rand() * .35, yaw: rand() * Math.PI });
  }
  return leaves;
}
