import * as THREE from "three";
import { HOT_SPRING, HOT_SPRING_BATHS, HOT_SPRING_CROSSING, HOT_SPRING_STAIRS, HOT_SPRING_STAIR_SLOT, HOT_SPRING_UPPER_SHELL, hotSpringFloorHeight, hotSpringInlandBearing, hotSpringTerraceRim } from "./hot-spring";

const FRONT = 32.65, BACK = 57, HALF_WIDTH = 25;
const INNER_RADIUS = 7;
const ENTRY_LEFT = 5.7, ENTRY_RIGHT = 7.3, ENTRY_TOP = 2.5;
const EXIT_HALF_WIDTH = 1;
const DOOR_BOTTOM = HOT_SPRING.deckY - 0.3, DOOR_TOP = HOT_SPRING.deckY + 2.65;
const TAU = Math.PI * 2;
const WALL_LEVELS = [-0.2, 0, 2.5, 17.7, 20.65, ...Array.from({ length: 64 }, (_, index) => (index + 1) * 0.5)]
  .sort((a, b) => a - b).filter((value, index, values) => index === 0 || value !== values[index - 1]);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
type Point = { x: number; y: number; z: number };
type Door = { angle: number; halfWidth: number };
/** A channel cut through the wall and roof for an open stair, running north from minZ. */
type Slot = { x: number; halfWidth: number; minZ: number };
type Shell = {
  x: number; z: number; deckY: number; front: number; back: number; halfWidth: number; doors: Door[]; slots: Slot[];
  wallBottom: number; segments: number; ground: boolean; phase: number; outerRise: number;
  /** Lowers the rim on the side facing away from the sea. */
  rearDip: number;
  /** Rock is left out wherever this is true, because another terrace stands there. */
  cut?: (x: number, z: number) => boolean;
  /** Highest the rock may rise at a point. */
  ceiling?: (x: number, z: number) => number;
};

/** One continuous rock shell around a bath: inner wall, roof out to a rectangle, and outer faces. */
function shellGeometry(shell: Shell) {
  const { x: centerX, z: centerZ, deckY, front, back, halfWidth, doors, slots, wallBottom, segments, phase, outerRise, rearDip, ceiling } = shell;
  const gone = shell.cut ?? (() => false);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const angles = new Set<number>();
  const angleAt = (x: number, z: number) => (Math.atan2(z - centerZ, x - centerX) + TAU) % TAU;
  const edgeDistance = (angle: number) => {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    return Math.min(
      Math.abs(dx) < 1e-8 ? Infinity : halfWidth / Math.abs(dx),
      Math.abs(dz) < 1e-8 ? Infinity : (dz > 0 ? back - centerZ : centerZ - front) / Math.abs(dz),
    );
  };
  for (let index = 0; index < segments; index++) angles.add(index * TAU / segments);
  // Exact corners and jambs avoid slivers around the real openings.
  for (const x of [centerX - halfWidth, centerX + halfWidth]) for (const z of [front, back]) angles.add(angleAt(x, z));
  if (shell.ground) for (const x of [ENTRY_LEFT, ENTRY_RIGHT]) angles.add(angleAt(x, front));
  for (const door of doors) {
    const inner = Math.asin(door.halfWidth / INNER_RADIUS);
    angles.add((door.angle + inner + TAU) % TAU);
    angles.add((door.angle - inner + TAU) % TAU);
  }
  for (const slot of slots) for (const side of [-1, 1]) {
    const across = slot.x + side * slot.halfWidth - centerX;
    angles.add(Math.atan2(Math.sqrt(INNER_RADIUS ** 2 - across ** 2), across));
    angles.add(angleAt(centerX + across, back));
  }
  const sorted = Array.from(angles).sort((a, b) => a - b);
  sorted.push(sorted[0] + TAU);

  const height = (angle: number, fraction: number) => {
    // Keep the entire sea-facing sector below a bather's horizontal eye line.
    // Only the land-facing rim rises to enclose the bath.
    const land = smooth((Math.sin(angle) + Math.sin(Math.PI / 9)) / 0.28);
    const low = deckY - 0.17;
    const inner = low + land * (4.25 - rearDip * smooth((Math.sin(angle) - 0.35) / 0.5) + 0.45 * Math.sin(angle * 3 + phase));
    const outer = low - 1.6 + land * (outerRise + 1.5 * Math.sin(angle * 2 + 0.3 + phase));
    const variation = Math.sin(angle * 19 + fraction * 14 + phase) * Math.sin(angle * 7 - fraction * 11);
    const rock = inner + (outer - inner) * smooth(fraction) + variation * (0.07 + land * 0.3) * Math.sin(fraction * Math.PI);
    if (!ceiling) return rock;
    const radius = INNER_RADIUS + (edgeDistance(angle) - INNER_RADIUS) * fraction;
    return Math.min(rock, ceiling(centerX + Math.cos(angle) * radius, centerZ + Math.sin(angle) * radius));
  };
  const roofPoint = (angle: number, fraction: number): Point => {
    const radius = INNER_RADIUS + (edgeDistance(angle) - INNER_RADIUS) * fraction;
    return { x: centerX + Math.cos(angle) * radius, y: height(angle, fraction), z: centerZ + Math.sin(angle) * radius };
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
    if (Math.abs(edge.z - front) < 1e-5) edge.z += ripple;
    else if (Math.abs(edge.z - back) < 1e-5) edge.z += ripple;
    else edge.x += Math.sign(edge.x - centerX) * ripple;
    edge.y = y;
    return edge;
  };
  /** `reachA/B` set the outer ripple, so strips split by an opening still meet their neighbours exactly. */
  const verticalStrip = (angleA: number, angleB: number, low: number, highA: number, highB: number, inner: boolean, reachA = highA, reachB = highB) => {
    if (highA <= low && highB <= low) return;
    const high = Math.max(highA, highB);
    // Identical absolute levels make adjacent curved faces share every edge vertex.
    // Independent per-strip subdivision would leave tiny interpolation cracks.
    const cuts = [low, ...WALL_LEVELS.filter(y => y > low && y < high), high];
    const point = (angle: number, y: number, top: number) => inner
      ? { x: centerX + Math.cos(angle) * INNER_RADIUS, y, z: centerZ + Math.sin(angle) * INNER_RADIUS }
      : outerPoint(angle, y, top);
    for (let step = 0; step < cuts.length - 1; step++) {
      const bottomA = Math.min(cuts[step], highA), topA = Math.min(cuts[step + 1], highA);
      const bottomB = Math.min(cuts[step], highB), topB = Math.min(cuts[step + 1], highB);
      addQuad(point(angleA, bottomA, reachA), point(angleA, topA, reachA),
        point(angleB, bottomB, reachB), point(angleB, topB, reachB), inner);
    }
  };
  const doorAt = (x: number, z: number) => doors.find((door) => {
    const dx = Math.cos(door.angle), dz = Math.sin(door.angle), relX = x - centerX, relZ = z - centerZ;
    return relX * dx + relZ * dz > 0 && Math.abs(-relX * dz + relZ * dx) < door.halfWidth;
  });
  const slotAt = (x: number, z: number) => slots.find((slot) => Math.abs(x - slot.x) < slot.halfWidth && z >= slot.minZ);
  const slotSill = (slot: Slot, z: number) => (hotSpringFloorHeight(slot.x, z) ?? deckY) - 0.3;

  for (let index = 0; index < sorted.length - 1; index++) {
    const a = sorted[index], b = sorted[index + 1], middle = (a + b) / 2;
    const outerMiddle = roofPoint(middle, 1);
    const outerSlot = slotAt(outerMiddle.x, outerMiddle.z);
    const isEntrance = shell.ground && Math.abs(outerMiddle.z - front) < 1e-5 && outerMiddle.x > ENTRY_LEFT && outerMiddle.x < ENTRY_RIGHT;
    if (gone(outerMiddle.x, outerMiddle.z)) {
      // Another terrace stands here.
    } else if (outerSlot) {
      const sill = slotSill(outerSlot, outerMiddle.z);
      verticalStrip(a, b, wallBottom, sill, sill, false, height(a, 1), height(b, 1));
    } else verticalStrip(a, b, isEntrance ? ENTRY_TOP : wallBottom, height(a, 1), height(b, 1), false);
    const innerX = centerX + Math.cos(middle) * INNER_RADIUS, innerZ = centerZ + Math.sin(middle) * INNER_RADIUS;
    const innerSlot = slotAt(innerX, innerZ);
    if (gone(innerX, innerZ)) {
      // Another terrace stands here.
    } else if (innerSlot) {
      const sill = slotSill(innerSlot, innerZ);
      verticalStrip(a, b, wallBottom, sill, sill, true);
    } else if (doorAt(innerX, innerZ)) {
      // The upper landing passes through a genuine opening in the hillside rim.
      verticalStrip(a, b, wallBottom, DOOR_BOTTOM, DOOR_BOTTOM, true);
      verticalStrip(a, b, DOOR_TOP, height(a, 0), height(b, 0), true);
    } else verticalStrip(a, b, wallBottom, height(a, 0), height(b, 0), true);
    for (let ring = 0; ring < 12; ring++) {
      const inner = ring / 12, outer = (ring + 1) / 12, center = roofPoint(middle, (inner + outer) / 2);
      if (slotAt(center.x, center.z) || gone(center.x, center.z)) continue;
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
  return geometry;
}

/** One continuous hillside per bath conceals the stair flights and the elevated foundations. */
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
  const slots = HOT_SPRING_STAIRS.map((stair) => ({ x: stair.x, halfWidth: HOT_SPRING_STAIR_SLOT, minZ: HOT_SPRING.z }));
  const geometry = shellGeometry({
    x: HOT_SPRING.x, z: HOT_SPRING.z, deckY: HOT_SPRING.deckY, front: FRONT, back: BACK, halfWidth: HALF_WIDTH,
    // Behind the deck the hill sinks below the upper baths, which stand on it as the next terrace.
    doors: [{ angle: 0, halfWidth: EXIT_HALF_WIDTH }], slots, wallBottom: -0.2, segments: 160, ground: true, phase: 0, outerRise: 5.4, rearDip: 5.1,
    // Only under the upper decks: elsewhere the hill keeps its height and the curtains end against it.
    ceiling: (x, z) => 19.9 + 1.2 * Math.max(0, Math.min(...HOT_SPRING_BATHS.slice(1).map((bath) => Math.hypot(x - bath.x, z - bath.z))) - 7.8),
  });
  const cliff = new THREE.Mesh(geometry, stone);
  cliff.name = "onsen-continuous-cliff-shell";
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  group.add(cliff);

  const upperGeometries = HOT_SPRING_BATHS.slice(1).map((bath, index) => shellGeometry({
    x: bath.x, z: bath.z, deckY: HOT_SPRING.deckY + bath.lift,
    front: bath.z - HOT_SPRING_UPPER_SHELL.frontMargin, back: bath.z + HOT_SPRING_UPPER_SHELL.backMargin, halfWidth: HOT_SPRING_UPPER_SHELL.halfWidth,
    doors: [], slots: [], wallBottom: 14, segments: 72, ground: false, phase: 1.7 * (index + 1), outerRise: 5, rearDip: 0,
    cut: (x, z) => (Math.abs(x) < HOT_SPRING_CROSSING.halfWidth && z < HOT_SPRING_CROSSING.maxZ + 0.1)
      || Math.hypot(x - HOT_SPRING.x, z - HOT_SPRING.z) < hotSpringTerraceRim(hotSpringInlandBearing(x, z)) + 1.1,
  }));
  upperGeometries.forEach((shell, index) => {
    const mesh = new THREE.Mesh(shell, stone);
    mesh.name = `onsen-upper-cliff-shell-${index + 1}`;
    group.add(mesh);
  });
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      for (const shell of upperGeometries) shell.dispose();
      stone.dispose();
    },
  };
}
