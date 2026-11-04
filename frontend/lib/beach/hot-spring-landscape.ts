import * as THREE from "three";
import { HOT_SPRING } from "./hot-spring";

const FRONT = 32.65, BACK = 57, HALF_WIDTH = 25;
const INNER_RADIUS = 7;
const ENTRY_LEFT = 5.7, ENTRY_RIGHT = 7.3, ENTRY_TOP = 2.5;
const EXIT_HALF_WIDTH = 1;
const TAU = Math.PI * 2;
const WALL_LEVELS = [-0.2, 0, 2.5, 17.7, 20.65, ...Array.from({ length: 64 }, (_, index) => (index + 1) * 0.5)]
  .sort((a, b) => a - b).filter((value, index, values) => index === 0 || value !== values[index - 1]);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
type Point = { x: number; y: number; z: number };

/** One continuous hillside conceals the stair flights and the elevated bath foundation. */
export function buildHotSpringLandscape(scene: THREE.Scene, originalStone?: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.name = "onsen-natural-cliff-envelope";
  scene.add(group);
  const stone = originalStone?.clone() ?? new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.97 });
  if (originalStone) {
    // Material.clone does not copy the world's triplanar shader callbacks.
    stone.onBeforeCompile = originalStone.onBeforeCompile;
    stone.customProgramCacheKey = originalStone.customProgramCacheKey;
  }
  stone.vertexColors = true;
  stone.side = THREE.DoubleSide;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const angles = new Set<number>();
  const angleAt = (x: number, z: number) => (Math.atan2(z - HOT_SPRING.z, x - HOT_SPRING.x) + TAU) % TAU;
  for (let index = 0; index < 160; index++) angles.add(index * TAU / 160);
  // Exact corners and jambs avoid slivers around either of the two real openings.
  for (const x of [-HALF_WIDTH, HALF_WIDTH]) for (const z of [FRONT, BACK]) angles.add(angleAt(x, z));
  for (const x of [ENTRY_LEFT, ENTRY_RIGHT]) angles.add(angleAt(x, FRONT));
  const exitAngle = Math.asin(EXIT_HALF_WIDTH / INNER_RADIUS);
  angles.add(exitAngle); angles.add(TAU - exitAngle);
  const sorted = Array.from(angles).sort((a, b) => a - b);
  sorted.push(sorted[0] + TAU);

  const edgeDistance = (angle: number) => {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    return Math.min(
      Math.abs(dx) < 1e-8 ? Infinity : HALF_WIDTH / Math.abs(dx),
      Math.abs(dz) < 1e-8 ? Infinity : (dz > 0 ? BACK - HOT_SPRING.z : HOT_SPRING.z - FRONT) / Math.abs(dz),
    );
  };
  const height = (angle: number, fraction: number) => {
    // Keep the entire sea-facing sector below a bather's horizontal eye line.
    // Only the land-facing rim rises to enclose the highest stair ceiling.
    const land = smooth((Math.sin(angle) + Math.sin(Math.PI / 9)) / 0.28);
    const low = HOT_SPRING.deckY - 0.17;
    const inner = low + land * (4.25 + 0.45 * Math.sin(angle * 3));
    const outer = low - 1.6 + land * (9.1 + 1.5 * Math.sin(angle * 2 + 0.3));
    const variation = Math.sin(angle * 19 + fraction * 14) * Math.sin(angle * 7 - fraction * 11);
    return inner + (outer - inner) * smooth(fraction) + variation * (0.07 + land * 0.3) * Math.sin(fraction * Math.PI);
  };
  const roofPoint = (angle: number, fraction: number): Point => {
    const radius = INNER_RADIUS + (edgeDistance(angle) - INNER_RADIUS) * fraction;
    return { x: HOT_SPRING.x + Math.cos(angle) * radius, y: height(angle, fraction), z: HOT_SPRING.z + Math.sin(angle) * radius };
  };
  const addQuad = (a: Point, b: Point, c: Point, d: Point, flip = false) => {
    const start = positions.length / 3;
    for (const p of [a, b, c, d]) {
      positions.push(p.x, p.y, p.z);
      uvs.push(p.x / 12, (p.z + p.y * 0.35) / 12);
      const strata = 0.93 + Math.sin(p.y * 1.15 + p.x * 0.08 + p.z * 0.04) * 0.035;
      colors.push(strata, strata * 0.995, strata * 0.98);
    }
    const triangle = (i: number, j: number, k: number) => {
      const points = [a, b, c, d], p = points[i], q = points[j], r = points[k];
      const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z;
      const vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-10) return;
      indices.push(start + i, start + j, start + k);
    };
    if (flip) { triangle(0, 2, 1); triangle(1, 2, 3); }
    else { triangle(0, 1, 2); triangle(1, 3, 2); }
  };
  const outerPoint = (angle: number, y: number, top: number): Point => {
    const edge = roofPoint(angle, 1), t = clamp((y + 0.2) / (top + 0.2), 0, 1);
    const ripple = (0.14 + 0.1 * Math.sin(y * 1.4 + angle * 8) + 0.035 * Math.sin(y * 3.2 - angle * 17)) * Math.sin(t * Math.PI);
    // Front relief recedes into the rock: it cannot cross the house's rear wall.
    if (Math.abs(edge.z - FRONT) < 1e-5) edge.z += ripple;
    else if (Math.abs(edge.z - BACK) < 1e-5) edge.z += ripple;
    else edge.x += Math.sign(edge.x) * ripple;
    edge.y = y;
    return edge;
  };
  const verticalStrip = (angleA: number, angleB: number, low: number, highA: number, highB: number, inner: boolean) => {
    if (highA <= low && highB <= low) return;
    const high = Math.max(highA, highB);
    // Identical absolute levels make adjacent curved faces share every edge vertex.
    // Independent per-strip subdivision would leave tiny interpolation cracks.
    const cuts = [low, ...WALL_LEVELS.filter(y => y > low && y < high), high];
    const point = (angle: number, y: number, top: number) => inner
      ? { x: HOT_SPRING.x + Math.cos(angle) * INNER_RADIUS, y, z: HOT_SPRING.z + Math.sin(angle) * INNER_RADIUS }
      : outerPoint(angle, y, top);
    for (let step = 0; step < cuts.length - 1; step++) {
      const bottomA = Math.min(cuts[step], highA), topA = Math.min(cuts[step + 1], highA);
      const bottomB = Math.min(cuts[step], highB), topB = Math.min(cuts[step + 1], highB);
      addQuad(point(angleA, bottomA, highA), point(angleA, topA, highA),
        point(angleB, bottomB, highB), point(angleB, topB, highB), inner);
    }
  };

  for (let index = 0; index < sorted.length - 1; index++) {
    const a = sorted[index], b = sorted[index + 1], middle = (a + b) / 2;
    const outerMiddle = roofPoint(middle, 1);
    const isEntrance = Math.abs(outerMiddle.z - FRONT) < 1e-5 && outerMiddle.x > ENTRY_LEFT && outerMiddle.x < ENTRY_RIGHT;
    verticalStrip(a, b, isEntrance ? ENTRY_TOP : -0.2, height(a, 1), height(b, 1), false);
    const isExit = Math.cos(middle) > 0 && Math.abs(Math.sin(middle) * INNER_RADIUS) < EXIT_HALF_WIDTH;
    if (isExit) {
      // The upper landing passes through a genuine opening in the hillside rim.
      verticalStrip(a, b, -0.2, HOT_SPRING.deckY - 0.3, HOT_SPRING.deckY - 0.3, true);
      verticalStrip(a, b, HOT_SPRING.deckY + 2.65, height(a, 0), height(b, 0), true);
    } else verticalStrip(a, b, -0.2, height(a, 0), height(b, 0), true);
    for (let ring = 0; ring < 12; ring++) {
      const inner = ring / 12, outer = (ring + 1) / 12;
      addQuad(roofPoint(a, inner), roofPoint(b, inner), roofPoint(a, outer), roofPoint(b, outer));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const cliff = new THREE.Mesh(geometry, stone);
  cliff.name = "onsen-continuous-cliff-shell";
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  group.add(cliff);
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      stone.dispose();
    },
  };
}
