import * as THREE from "three";
import type { WallRect } from "./navigation";

export const HOT_SPRING_PATH = [
  { x: 6.5, z: 33.5, y: 0 },
  { x: 11.5, z: 33.5, y: 2.5 },
  { x: 11.5, z: 51.5, y: 11.5 },
  { x: 8.7, z: 51.5, y: 12.2 },
  { x: 8.7, z: 45, y: 17 },
  { x: 6, z: 45, y: 18 },
] as const;
export const HOT_SPRING = { x: 0, z: 45, deckY: 18, waterY: 17.85, floorY: 16.85, deckRadius: 7.2, poolRadius: 4.6 } as const;
const HALF_PASSAGE = 0.725;
const HEADROOM = 2.45;
const GAP_ANGLE = 0.38;
const TAU = Math.PI * 2;
const LAST_FLIGHT = HOT_SPRING_PATH.length - 2;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const seaFacing = (angle: number) => Math.sin(angle) < -Math.sin(Math.PI / 9); // South-facing 140 degrees.
const sideEntrance = (x: number, z: number) => x > 4 && Math.abs(z - HOT_SPRING.z) < 1.15;
const entranceLanding = (x: number, z: number) => Math.abs(x - 6.5) <= HALF_PASSAGE && z >= 32.65 && z <= 34.225;

const PASSAGES: readonly WallRect[] = HOT_SPRING_PATH.slice(0, -1).map((a, index) => {
  const b = HOT_SPRING_PATH[index + 1];
  return { minX: Math.min(a.x, b.x) - HALF_PASSAGE, maxX: Math.max(a.x, b.x) + HALF_PASSAGE, minZ: Math.min(a.z, b.z) - HALF_PASSAGE, maxZ: Math.max(a.z, b.z) + HALF_PASSAGE };
});

/** Level landings at each turn make the two intersecting ramps share one height. */
function passageHeight(x: number, z: number): number | null {
  for (let index = 0; index < HOT_SPRING_PATH.length - 1; index++) {
    const a = HOT_SPRING_PATH[index], b = HOT_SPRING_PATH[index + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const along = (x - a.x) * dx + (z - a.z) * dz;
    const across = Math.abs((x - a.x) * dz - (z - a.z) * dx);
    const startExtension = HALF_PASSAGE;
    const endExtension = index === LAST_FLIGHT ? 0 : HALF_PASSAGE;
    if (across > HALF_PASSAGE || along < -startExtension || along > length + endExtension) continue;
    const startLanding = HALF_PASSAGE;
    const endLanding = index === LAST_FLIGHT ? 0.9 : HALF_PASSAGE;
    const t = clamp((along - startLanding) / (length - startLanding - endLanding), 0, 1);
    return a.y + (b.y - a.y) * t;
  }
  return null;
}

/** Null leaves the existing beach or shelter ground calculation in charge. */
export function hotSpringFloorHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const corridor = passageHeight(x, z);
  if (corridor !== null) return corridor;
  if (Math.abs(x - 6.5) <= HALF_PASSAGE && z >= 32.2 && z <= 33.5) return 0;
  if (Math.abs(z - 45) <= 1.2 && x >= 5.95 && x <= 6.65) return HOT_SPRING.deckY;
  if (Math.abs(z - 45) <= 0.85 && x >= 3.3 && x <= 5.1) {
    return HOT_SPRING.deckY - clamp((4.7 - x) / 1.4, 0, 1) * (HOT_SPRING.deckY - HOT_SPRING.floorY);
  }
  const radius = Math.hypot(x, z - HOT_SPRING.z);
  if (radius > HOT_SPRING.deckRadius) return null;
  return radius < HOT_SPRING.poolRadius ? HOT_SPRING.floorY : HOT_SPRING.deckY;
}

export function hotSpringCeilingHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (entranceLanding(x, z)) return HEADROOM;
  if (x < 6.8 && z > 40) return null;
  const floor = passageHeight(x, z);
  return floor === null ? null : floor + HEADROOM;
}

function buildColliders(): WallRect[] {
  const walls: WallRect[] = [];
  // The raised retreat can only be entered through the stairs. These broad outer
  // strips close the ground-level shortcuts without a per-frame polygon query.
  const approach = { minX: 5.775, maxX: 7.225, minZ: 32.2, maxZ: 33.5 };
  const passages = [...PASSAGES, approach];
  const cutSet = new Set([32.65, 37.8, 52.2, 55.5]);
  for (const passage of passages) for (const z of [passage.minZ, passage.maxZ]) if (z > 32.65) cutSet.add(z);
  for (let z = 38.1; z < 52.2; z += 0.5) cutSet.add(z);
  const cuts = Array.from(cutSet).sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const minZ = cuts[i], maxZ = cuts[i + 1], midZ = (minZ + maxZ) / 2;
    const intervals: [number, number][] = [];
    for (const passage of passages) if (midZ >= passage.minZ && midZ <= passage.maxZ) intervals.push([passage.minX, passage.maxX]);
    const furthestZ = Math.max(Math.abs(minZ - 45), Math.abs(maxZ - 45));
    if (furthestZ < HOT_SPRING.deckRadius) {
      const width = Math.sqrt(HOT_SPRING.deckRadius ** 2 - furthestZ ** 2);
      intervals.push([-width, width]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let cursor = -22.5;
    for (const [left, right] of intervals) {
      if (left > cursor) walls.push({ minX: cursor, maxX: left, minZ, maxZ });
      cursor = Math.max(cursor, right);
    }
    if (cursor < 22.5) walls.push({ minX: cursor, maxX: 22.5, minZ, maxZ });
  }
  // Small pieces follow the round rim without the large diagonal corners of
  // long rotated AABBs, leaving the entire dry deck comfortably walkable.
  for (let index = 0; index < 64; index++) {
    const angle = index * TAU / 64;
    const x = Math.cos(angle) * 4.85, z = 45 + Math.sin(angle) * 4.85;
    if (sideEntrance(x, z)) continue;
    walls.push({ minX: x - 0.23, maxX: x + 0.23, minZ: z - 0.23, maxZ: z + 0.23 });
  }
  return walls;
}

export const HOT_SPRING_COLLIDERS: readonly WallRect[] = buildColliders();

type Materials = { stone?: THREE.MeshStandardMaterial; wood?: THREE.MeshStandardMaterial };
type Transform = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw?: number; tilt?: number };

/** Three's Material.copy deliberately omits custom shader hooks. */
function cloneSurface(source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const clone = source.clone();
  clone.onBeforeCompile = source.onBeforeCompile;
  clone.customProgramCacheKey = source.customProgramCacheKey;
  return clone;
}

function horizontalRing(inner: number, outer: number, y: number, gap = 0): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const start = gap / 2, span = TAU - gap, segments = 96;
  for (let i = 0; i <= segments; i++) {
    const angle = start + span * i / segments;
    for (const radius of [inner, outer]) {
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, y, z + 45);
      uvs.push(x / 2, z / 2);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Small procedural meshes share textures with the cove; no extra asset download. */
export function buildHotSpring(scene: THREE.Scene, materials: Materials = {}) {
  const group = new THREE.Group();
  group.name = "hidden-hillside-onsen";
  scene.add(group);
  const stone = materials.stone ? cloneSurface(materials.stone) : new THREE.MeshStandardMaterial({ color: 0x77766b, roughness: 0.96 });
  stone.color.multiplyScalar(0.83);
  stone.roughness = 0.96;
  const wetStone = cloneSurface(stone);
  wetStone.color.multiplyScalar(0.68);
  wetStone.roughness = 0.48;
  const caveStone = cloneSurface(stone);
  caveStone.emissive.set(0x60432a);
  caveStone.emissiveIntensity = 0.2;
  const wood = materials.wood ? cloneSurface(materials.wood) : new THREE.MeshStandardMaterial({ color: 0x513925, roughness: 0.78 });
  wood.color.multiply(new THREE.Color(0x8c6545));
  wood.roughness = 0.72;
  const deckWood = cloneSurface(wood);
  deckWood.color.multiplyScalar(1.2);
  const fenceWood = cloneSurface(materials.wood ?? wood);
  fenceWood.color.set(0x9c7444);
  fenceWood.roughness = 0.78;
  const bamboo = cloneSurface(fenceWood);
  bamboo.color.set(0xb99b6c);
  const fencePosts = cloneSurface(fenceWood);
  fencePosts.color.set(0x805932);
  const brass = new THREE.MeshStandardMaterial({ color: 0xa9783f, metalness: 0.6, roughness: 0.43 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffbc74, toneMapped: false });
  const shadow = new THREE.MeshStandardMaterial({ color: 0x272825, roughness: 1 });
  const clock = { value: 0 }, darkness = { value: 1 };
  const dummy = new THREE.Object3D();
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.receiveShadow = false;
    object.castShadow = false;
    group.add(object);
    return object;
  };
  const instances = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: Transform[]) => {
    const object = new THREE.InstancedMesh(geometry, material, transforms.length);
    object.name = name;
    for (const [index, t] of transforms.entries()) {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.tilt ?? 0, t.yaw ?? 0, 0, "YXZ");
      dummy.scale.set(t.sx, t.sy, t.sz);
      dummy.updateMatrix();
      object.setMatrixAt(index, dummy.matrix);
    }
    object.computeBoundingSphere();
    group.add(object);
    return object;
  };

  // Solid backing closes every flight and corner; rocks add detail on top of it.
  const rockTransforms: Transform[] = [], treadTransforms: Transform[] = [], lanterns: Transform[] = [];
  const backingWalls: Transform[] = [], backingCeilings: Transform[] = [], backingFloors: Transform[] = [], landings: Transform[] = [];
  const floorPositions: number[] = [], floorUvs: number[] = [], floorIndices: number[] = [];
  for (let flight = 0; flight <= LAST_FLIGHT; flight++) {
    const a = HOT_SPRING_PATH[flight], b = HOT_SPRING_PATH[flight + 1];
    const distance = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / distance, dz = (b.z - a.z) / distance;
    const steps = Math.ceil(distance / 0.26);
    for (let index = 0; index <= steps; index++) {
      const along = distance * index / steps, x = a.x + dx * along, z = a.z + dz * along;
      const y = passageHeight(x, z) ?? b.y;
      const offset = floorPositions.length / 3;
      floorPositions.push(x - dz * HALF_PASSAGE, y, z + dx * HALF_PASSAGE, x + dz * HALF_PASSAGE, y, z - dx * HALF_PASSAGE);
      floorUvs.push(0, along, 1, along);
      if (index < steps) floorIndices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
      treadTransforms.push({ x, y: y + 0.012, z, sx: 1.44, sy: 0.018, sz: 0.035, yaw: Math.atan2(dx, dz) });
      if (index < steps) {
        const nextAlong = distance * (index + 1) / steps, stepLength = nextAlong - along;
        const nextX = a.x + dx * nextAlong, nextZ = a.z + dz * nextAlong, nextY = passageHeight(nextX, nextZ) ?? b.y;
        const midX = (x + nextX) / 2, midZ = (z + nextZ) / 2, midY = (y + nextY) / 2;
        const yaw = Math.atan2(dx, dz), tilt = -Math.atan2(nextY - y, stepLength);
        const slopedLength = Math.hypot(stepLength, nextY - y) + 0.045;
        backingFloors.push({ x: midX, y: midY - 0.12, z: midZ, sx: 1.53, sy: 0.22, sz: slopedLength, yaw, tilt });
        if (hotSpringCeilingHeight(midX, midZ) !== null) {
          backingCeilings.push({ x: midX, y: midY + HEADROOM + 0.18, z: midZ, sx: 1.97, sy: 0.35, sz: slopedLength, yaw, tilt });
          for (const side of [-1, 1]) {
            const sideX = midX + dz * side * 0.865, sideZ = midZ - dx * side * 0.865;
            if (passageHeight(sideX, sideZ) !== null || (flight === LAST_FLIGHT && midX < 6.95)) continue;
            // Northbound visitors enter the first eastbound flight through this
            // side. Clip the backing exactly to the L-shaped landing boundary.
            if (flight === 0 && side === 1 && x < 7.225) {
              const startX = Math.max(x, 7.225);
              if (nextX <= startX) continue;
              const centerX = (startX + nextX) / 2, centerY = passageHeight(centerX, z) ?? 0;
              backingWalls.push({ x: centerX, y: centerY + HEADROOM / 2, z: sideZ, sx: 0.28, sy: HEADROOM + Math.abs(nextY - y) + 0.3, sz: nextX - startX + 0.02, yaw });
            } else {
              backingWalls.push({ x: sideX, y: midY + HEADROOM / 2, z: sideZ, sx: 0.28, sy: HEADROOM + Math.abs(nextY - y) + 0.3, sz: stepLength + 0.045, yaw });
            }
          }
        }
      }
      if (index % 3 === 0 && hotSpringCeilingHeight(x, z) !== null) {
        for (const side of [-1, 1]) {
          const sideX = x + dz * side * 1.18, sideZ = z - dx * side * 1.18;
          // Skip the inner face of a corner so the next flight remains open.
          if (passageHeight(sideX, sideZ) !== null || (flight === LAST_FLIGHT && x < 6.95) || (flight === 0 && side === 1 && x < 7.55)) continue;
          rockTransforms.push({ x: sideX, y: y + 1.3, z: sideZ, sx: 0.4, sy: 1.62, sz: 0.4, yaw: index * 0.83 + flight });
        }
        rockTransforms.push({ x, y: y + HEADROOM + 0.42, z, sx: 1.32, sy: 0.4, sz: 0.55, yaw: Math.atan2(dx, dz) });
      }
      if (index % 10 === 3) lanterns.push({ x: x + dz * 0.59, y: y + 0.38, z: z - dx * 0.59, sx: 0.15, sy: 0.3, sz: 0.15 });
    }
  }
  const stairs = new THREE.BufferGeometry();
  stairs.setAttribute("position", new THREE.Float32BufferAttribute(floorPositions, 3));
  stairs.setAttribute("uv", new THREE.Float32BufferAttribute(floorUvs, 2));
  stairs.setIndex(floorIndices);
  stairs.computeVertexNormals();
  mesh("onsen-continuous-stone-stairs", stairs, caveStone);
  for (const point of HOT_SPRING_PATH.slice(1, -1)) {
    landings.push({ x: point.x, y: point.y - 0.06, z: point.z, sx: 1.45, sy: 0.12, sz: 1.45 });
    backingCeilings.push({ x: point.x, y: point.y + HEADROOM + 0.18, z: point.z, sx: 1.99, sy: 0.35, sz: 1.99 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const half of [-1, 1]) {
        const x = point.x + dx * HALF_PASSAGE - dz * half * HALF_PASSAGE / 2;
        const z = point.z + dz * HALF_PASSAGE + dx * half * HALF_PASSAGE / 2;
        if (passageHeight(x + dx * 0.06, z + dz * 0.06) !== null) continue;
        backingWalls.push({ x: x + dx * 0.15, y: point.y + HEADROOM / 2, z: z + dz * 0.15, sx: dx ? 0.28 : HALF_PASSAGE + 0.04, sy: HEADROOM + 0.3, sz: dz ? 0.28 : HALF_PASSAGE + 0.04 });
      }
    }
  }
  // The concealed mouth turns right. Its west and north ends are solid, while
  // only the south-facing opening at z32.65 remains open behind the shrubs.
  landings.push({ x: 6.5, y: -0.06, z: (32.65 + 34.225) / 2, sx: 1.45, sy: 0.12, sz: 34.225 - 32.65 });
  backingCeilings.push({ x: 6.5, y: HEADROOM + 0.18, z: (32.65 + 34.225) / 2, sx: 2.01, sy: 0.35, sz: 34.225 - 32.65 + 0.3 });
  backingWalls.push(
    { x: 5.635, y: HEADROOM / 2, z: (32.65 + 34.225) / 2, sx: 0.28, sy: HEADROOM + 0.3, sz: 34.225 - 32.65 + 0.04 },
    { x: (5.775 + 6.5) / 2, y: HEADROOM / 2, z: 34.365, sx: 0.725 + 0.04, sy: HEADROOM + 0.3, sz: 0.28 },
    { x: 7.365, y: HEADROOM / 2, z: (32.65 + 32.775) / 2, sx: 0.28, sy: HEADROOM + 0.3, sz: 0.125 + 0.04 },
  );
  const backingBox = new THREE.BoxGeometry(1, 1, 1);
  instances("onsen-level-turn-landings", backingBox, caveStone, landings);
  instances("onsen-continuous-floor-backing", backingBox, caveStone, backingFloors);
  instances("onsen-continuous-wall-backing", backingBox, caveStone, backingWalls);
  instances("onsen-continuous-ceiling-backing", backingBox, caveStone, backingCeilings);
  instances("onsen-stair-tread-edges", new THREE.BoxGeometry(1, 1, 1), wetStone, treadTransforms);
  instances("onsen-cave-vault", new THREE.IcosahedronGeometry(1, 1), caveStone, rockTransforms);

  mesh("onsen-open-sky-deck", horizontalRing(4.57, 7.2, HOT_SPRING.deckY, GAP_ANGLE), deckWood);
  mesh("onsen-submerged-stone-floor", horizontalRing(0, 4.62, HOT_SPRING.floorY), wetStone);
  const poolWall = mesh("onsen-pool-inner-wall", new THREE.CylinderGeometry(4.61, 4.61, 1.15, 64, 1, true, Math.PI / 2 + 0.2, TAU - 0.4), wetStone);
  poolWall.position.set(0, (HOT_SPRING.deckY + HOT_SPRING.floorY) / 2, 45);
  // Open ended inward surface, keeping the water basin visible from any angle.
  poolWall.material = wetStone;
  wetStone.side = THREE.DoubleSide;
  const bridge = new THREE.BufferGeometry();
  bridge.setAttribute("position", new THREE.Float32BufferAttribute([5.1, HOT_SPRING.deckY, 44.15, 5.1, HOT_SPRING.deckY, 45.85, 4.7, HOT_SPRING.deckY, 44.15, 4.7, HOT_SPRING.deckY, 45.85, 3.3, HOT_SPRING.floorY, 44.15, 3.3, HOT_SPRING.floorY, 45.85], 3));
  bridge.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.4, 1, 0.4, 0, 1.8, 1, 1.8], 2));
  bridge.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  bridge.computeVertexNormals();
  mesh("onsen-recessed-entry-ramp", bridge, wetStone);
  const arrival = mesh("onsen-arrival-landing", new THREE.BoxGeometry(0.7, 0.12, 2.4), wetStone);
  arrival.position.set(6.3, HOT_SPRING.deckY - 0.06, 45);

  const coreHeight = HOT_SPRING.floorY - 0.05;
  const foundationCore = mesh("onsen-cliff-core", new THREE.CylinderGeometry(4.57, 4.8, coreHeight, 48), stone);
  foundationCore.position.set(0, coreHeight / 2, 45);
  const cliffBacking = mesh("onsen-continuous-cliff-skirt", new THREE.CylinderGeometry(7.12, 7.18, HOT_SPRING.deckY, 64, 1, true, Math.PI / 2 + GAP_ANGLE / 2, TAU - GAP_ANGLE), stone);
  cliffBacking.position.set(0, HOT_SPRING.deckY / 2 - 0.04, 45);

  const rim: Transform[] = [], slats: Transform[] = [], posts: Transform[] = [], rails: Transform[] = [], seams: Transform[] = [], strips: Transform[] = [];
  for (let index = 0; index < 48; index++) {
    const angle = index * TAU / 48, x = Math.cos(angle), z = Math.sin(angle);
    if (!sideEntrance(x * 4.8, 45 + z * 4.8)) {
      rim.push({ x: x * 4.8, y: HOT_SPRING.deckY + 0.04, z: 45 + z * 4.8, sx: 0.5, sy: seaFacing(angle) ? 0.16 : 0.21 + 0.035 * Math.sin(index * 4), sz: 0.38, yaw: -angle });
    }
    if (x > 0.85 && Math.abs(z * 7.1) < 1.25) continue;
    // Warm edge lighting sits below the rail, rather than shining into the eyes.
    if (index % 3 === 0) strips.push({ x: x * 6.92, y: HOT_SPRING.deckY + 0.035, z: 45 + z * 6.92, sx: 0.82, sy: 0.025, sz: 0.035, yaw: Math.PI / 2 - angle });
  }
  for (let index = 0; index < 480; index++) {
    const angle = index * TAU / 480, x = Math.cos(angle), z = Math.sin(angle);
    if (seaFacing(angle) || (x > 0.85 && Math.abs(z * 7.25) < 1.15)) continue;
    slats.push({ x: x * 7.25, y: HOT_SPRING.deckY + 0.85, z: 45 + z * 7.25, sx: 0.075, sy: 1.62, sz: 0.075, yaw: angle * 1.7 });
  }
  for (let index = 0; index < 32; index++) {
    const angle = index * TAU / 32, x = Math.cos(angle), z = Math.sin(angle);
    if (seaFacing(angle) || (x > 0.85 && Math.abs(z * 7.25) < 1.5)) continue;
    posts.push({ x: x * 7.28, y: HOT_SPRING.deckY + 0.85, z: 45 + z * 7.28, sx: 0.18, sy: 1.78, sz: 0.18, yaw: Math.PI / 2 - angle });
    for (const y of [HOT_SPRING.deckY + 0.25, HOT_SPRING.deckY + 1.16, HOT_SPRING.deckY + 1.68]) rails.push({ x: x * 7.25, y, z: 45 + z * 7.25, sx: 1.45, sy: 0.085, sz: 0.14, yaw: Math.PI / 2 - angle });
    if (index % 4 === 1) lanterns.push({ x: x * 6.65, y: HOT_SPRING.deckY + 0.35, z: 45 + z * 6.65, sx: 0.22, sy: 0.48, sz: 0.22 });
  }
  for (let index = 0; index < 80; index++) {
    const angle = GAP_ANGLE / 2 + (TAU - GAP_ANGLE) * index / 79;
    seams.push({ x: Math.cos(angle) * 5.9, y: HOT_SPRING.deckY + 0.003, z: 45 + Math.sin(angle) * 5.9, sx: 0.018, sy: 0.006, sz: 2.53, yaw: Math.PI / 2 - angle });
  }
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  instances("onsen-natural-rim-stones", rockGeometry, stone, rim);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const screen = instances("onsen-bamboo-screen", new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true), bamboo, slats);
  const bambooTint = new THREE.Color();
  for (let index = 0; index < screen.count; index++) {
    const variation = 0.86 + (Math.sin(index * 7.19) * 0.5 + 0.5) * 0.14;
    screen.setColorAt(index, bambooTint.setRGB(variation, variation * 0.98, variation * 0.94));
  }
  instances("onsen-fence-posts", box, fencePosts, posts);
  instances("onsen-fence-rails", box, fenceWood, rails);
  instances("onsen-deck-board-seams", box, shadow, seams);
  instances("onsen-indirect-amber-strips", box, glow, strips);
  instances("onsen-lantern-frames", box, brass, lanterns);
  instances("onsen-lantern-warm-cores", box, glow, lanterns.map((t) => ({ ...t, sx: t.sx * 1.05, sy: t.sy * 0.68, sz: t.sz * 1.05 })));

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: clock, uNight: darkness },
    vertexShader: `varying vec3 vWorld; void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `
      uniform float uTime; uniform float uNight; varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz - vec2(0.0, 45.0);
        float a = sin(p.x * 3.1 + p.y * 2.4 + uTime * 0.43);
        float b = sin(p.y * 4.7 - p.x * 1.8 - uTime * 0.29);
        float ripple = a * b;
        vec3 daylight = vec3(0.16, 0.36, 0.34), moonlight = vec3(0.035, 0.13, 0.16);
        vec3 water = mix(daylight, moonlight, uNight * 0.85);
        float edge = smoothstep(2.9, 4.6, length(p));
        float amber = edge * (0.12 + 0.16 * pow(0.5 + 0.5 * sin(atan(p.y, p.x) * 8.0 + ripple * 0.3), 8.0));
        water += vec3(1.0, 0.56, 0.20) * amber + vec3(0.14, 0.21, 0.22) * pow(max(0.0, ripple), 5.0) * 0.18;
        gl_FragColor = vec4(water, 0.70);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const water = mesh("onsen-quiet-mineral-water", horizontalRing(0, 4.58, HOT_SPRING.waterY), waterMaterial);
  water.renderOrder = 3;

  const steamMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: clock },
    vertexShader: `
      uniform float uTime; attribute float steamPhase; varying vec2 vUv; varying float vLife;
      void main() {
        vUv = uv; float life = fract(uTime * 0.052 + steamPhase); vLife = sin(life * 3.14159265);
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 drift = vec3(sin(uTime * 0.09 + steamPhase * 9.0) * 0.35, life * 1.3, cos(uTime * 0.08 + steamPhase * 8.0) * 0.2);
        center += modelViewMatrix * vec4(drift, 0.0);
        center.xy += position.xy * vec2(1.3 + life, 1.15 + life * 1.4);
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vLife;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0; float edge = pow(max(0.0, 1.0 - dot(p, p)), 2.5);
        float wisps = 0.65 + 0.18 * sin(p.y * 10.0 + sin(p.x * 8.0 + uTime * 0.15) - uTime * 0.3);
        gl_FragColor = vec4(0.82, 0.85, 0.80, edge * wisps * vLife * 0.10);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const steamGeometry = new THREE.PlaneGeometry(1, 1);
  const phases = new Float32Array(12), vapor: Transform[] = [];
  for (let index = 0; index < 12; index++) {
    const angle = index * 2.39996, radius = 0.6 + Math.sqrt(index / 11) * 2.7;
    phases[index] = index / 12;
    vapor.push({ x: Math.cos(angle) * radius, y: HOT_SPRING.waterY + 0.3, z: 45 + Math.sin(angle) * radius, sx: 1, sy: 1, sz: 1 });
  }
  steamGeometry.setAttribute("steamPhase", new THREE.InstancedBufferAttribute(phases, 1));
  const steam = instances("onsen-soft-rising-steam", steamGeometry, steamMaterial, vapor);
  steam.frustumCulled = false;
  steam.renderOrder = 4;
  const poolLight = new THREE.PointLight(0xffc184, 8, 16, 2);
  poolLight.name = "onsen-pool-warm-light";
  poolLight.position.set(0, HOT_SPRING.deckY + 2.7, 45);
  const tunnelLight = new THREE.PointLight(0xffb568, 12, 28, 2);
  tunnelLight.name = "onsen-tunnel-warm-light";
  tunnelLight.position.set(11.5, 10, 43);
  poolLight.castShadow = tunnelLight.castShadow = false;
  group.add(poolLight, tunnelLight);
  let disposed = false;
  return {
    group,
    update(time: number, _camera?: THREE.Camera) { if (!disposed && Number.isFinite(time)) clock.value = time; },
    applyDaylight(night: number) {
      darkness.value = clamp(Number.isFinite(night) ? night : 0, 0, 1);
      poolLight.intensity = 3.5 + darkness.value * 6;
      tunnelLight.intensity = 12;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) ownedMaterials.add(material);
          if (object instanceof THREE.InstancedMesh) object.dispose();
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      // Map textures belong to the cove; cloned materials never own those images.
      group.removeFromParent();
    },
  };
}
