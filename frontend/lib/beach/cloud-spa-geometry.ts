import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createShelterPillowGeometry } from "./shelter-textiles";
import { CLOUD_SPA_CHANNEL, CLOUD_SPA_CHANNELS, CLOUD_SPA_POOLS, CLOUD_SPA_RESORT, CLOUD_SPA_SEATS, CLOUD_SPA_SPAWN, CLOUD_SPA_TERRACE,
  cloudSpaChannelPoint, cloudSpaFloorHeight, cloudSpaGroundHeight, cloudSpaIslandRange, cloudSpaIslandSpan, cloudSpaWaterDepth } from "./cloud-spa-layout";
import { type CloudSpaCottonUniforms, createCloudSpaCottonMaterial } from "./cloud-spa-materials";

export interface CloudSpaOutlinePoint { x: number; y: number; z: number }
export interface CloudSpaGround { geometry: THREE.BufferGeometry; outline: readonly CloudSpaOutlinePoint[] }

/** Find the single height discontinuity inside a short probe interval. */
function locateWall(a: number, b: number, z: number): number {
  let ha = cloudSpaGroundHeight(a, z), hb = cloudSpaGroundHeight(b, z);
  for (let i = 0; i < 14; i++) {
    const mid = (a + b) / 2, hm = cloudSpaGroundHeight(mid, z);
    if (Math.abs(hm - ha) > Math.abs(hb - hm)) { b = mid; hb = hm; } else { a = mid; ha = hm; }
  }
  return (a + b) / 2;
}

/** The walkable cloud top as one height field. Each row spans exactly the island, and every terrace wall gets a doubled vertex so it stands straight. */
export function buildCloudSpaGround(mobile: boolean): CloudSpaGround {
  const rows = mobile ? 300 : 470, spacing = mobile ? .6 : .42, probe = .15, range = cloudSpaIslandRange();
  const positions: number[] = [], depths: number[] = [], indices: number[] = [], left: CloudSpaOutlinePoint[] = [], right: CloudSpaOutlinePoint[] = [];
  const xOf = (index: number) => positions[index * 3];
  let previous: number[] | null = null;
  for (let r = 0; r <= rows; r++) {
    const z = range.minZ + (range.maxZ - range.minZ) * r / rows, span = cloudSpaIslandSpan(z);
    if (!span) continue;
    const [x0, x1] = span, width = x1 - x0, columns = Math.max(2, Math.ceil(width / spacing));
    const walls: number[] = [];
    let a = x0, ha = cloudSpaGroundHeight(a, z);
    for (let b = x0 + probe; b < x1 + probe; b += probe) {
      const xb = Math.min(b, x1), hb = cloudSpaGroundHeight(xb, z);
      if (Math.abs(hb - ha) > .2) walls.push(locateWall(a, xb, z));
      a = xb; ha = hb;
      if (xb >= x1) break;
    }
    const xs: number[] = [];
    for (let c = 0; c <= columns; c++) {
      const x = x0 + width * c / columns;
      if (!walls.some(w => Math.abs(w - x) < 2e-3)) xs.push(x);
    }
    for (const w of walls) xs.push(Math.max(x0, w - 5e-4), Math.min(x1, w + 5e-4));
    xs.sort((p, q) => p - q);
    const row: number[] = [];
    for (const x of xs) {
      const y = cloudSpaGroundHeight(x, z);
      row.push(positions.length / 3); positions.push(x, y, z); depths.push(cloudSpaWaterDepth(x, z, y));
    }
    left.push({ x: x0, y: positions[row[0] * 3 + 1], z }); right.push({ x: x1, y: positions[row[row.length - 1] * 3 + 1], z });
    if (previous) {
      // Zip two rows of differing column counts, always advancing the vertex with the smaller x.
      let i = 0, j = 0;
      while (i < previous.length - 1 || j < row.length - 1) {
        const advanceA = j >= row.length - 1 || (i < previous.length - 1 && xOf(previous[i + 1]) <= xOf(row[j + 1]));
        if (advanceA) { indices.push(previous[i], row[j], previous[i + 1]); i++; }
        else { indices.push(previous[i], row[j], row[j + 1]); j++; }
      }
    }
    previous = row;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.name = "cloud-spa-terraced-cotton-top";
  return { geometry, outline: [...left, ...right.reverse()] };
}

export function cloudSpaViewGap(angle: number): number {
  const distance = Math.min(...[Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)))));
  return 1 - THREE.MathUtils.smoothstep(distance, .1, .24);
}

export interface CloudSpaScenery {
  root: THREE.Group; lanterns: readonly THREE.Vector3[];
  applyNight(amount: number): void; dispose(): void;
}

/** Cotton shell beneath the terraces, rill tread slabs, lanterns, seats and the storm-cloud resort. */
export function buildCloudSpaScenery(parent: THREE.Object3D, textures: { wood: THREE.Texture; cotton: THREE.Texture; surface: THREE.Texture }, mobile: boolean,
  outline: readonly CloudSpaOutlinePoint[], cotton: CloudSpaCottonUniforms): CloudSpaScenery {
  const root = new THREE.Group(); root.name = "cloud-spa-scenery"; parent.add(root);
  const owned: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], lanterns: THREE.Vector3[] = [];
  const standard = (name: string, color: number, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .92, ...options, fog: false }); material.name = name; materials.push(material); return material;
  };
  const cloud = createCloudSpaCottonMaterial("cloud", textures.surface, cotton); materials.push(cloud);
  const marble = standard("cloud-spa-travertine", 0xe8ebe7, { roughness: .6 });
  const ivory = standard("cloud-spa-linen", 0xe9e3d8, { map: textures.cotton, bumpMap: textures.cotton, bumpScale: .003 });
  const wood = standard("cloud-spa-oak", 0xc1a37d, { map: textures.wood });
  const brass = standard("cloud-spa-brass", 0xc0a16c, { roughness: .4, metalness: .55 });
  const leaves = standard("cloud-spa-leaves", 0x66816f);
  const amber = standard("cloud-spa-lantern-glass", 0xffe4ab, { emissive: 0xffbc64, emissiveIntensity: 1.1, roughness: .5 });
  const themeLights = [0xffefcc, 0xffdc8a, 0xc8ffed, 0xffab65, 0xdfc9ff].map((color, index) => standard(`cloud-spa-theme-lantern-${index + 1}`, color, { emissive: color, emissiveIntensity: 1, roughness: .55 }));
  const glass = new THREE.MeshBasicMaterial({ color: 0xdce7eb, transparent: true, opacity: .026, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false });
  glass.name = "cloud-spa-clear-windows"; materials.push(glass);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sphere = new THREE.SphereGeometry(1, mobile ? 12 : 20, mobile ? 8 : 14), box = new THREE.BoxGeometry(1, 1, 1);
  const soft = new RoundedBoxGeometry(1, 1, 1, 2, .12), cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const pillow = createShelterPillowGeometry(); pillow.deleteAttribute("color");
  const plane = new THREE.PlaneGeometry(1, 1), arch = new THREE.TorusGeometry(1, .035, 6, 28, Math.PI);
  const crescent = new THREE.TorusGeometry(.62, .16, 8, 32, Math.PI * 1.55);
  const starShape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? .29 : .67; if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const star = new THREE.ExtrudeGeometry(starShape, { depth: .07, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 1 }); star.translate(0, 0, -.035);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  let detailZ = 0;
  const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
    const piece = geometry.clone(); matrix.compose(new THREE.Vector3(x, y, z + detailZ), quaternion.setFromEuler(euler.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    piece.applyMatrix4(matrix);
    if (!batches.has(material)) batches.set(material, []); batches.get(material)!.push(piece);
  };
  const lantern = (x: number, y: number, z: number, scale = 1) => {
    lanterns.push(new THREE.Vector3(x, y + .45 * scale, z + detailZ));
    place(brass, cylinder, x, y + .08 * scale, z, .28 * scale, .13 * scale, .28 * scale);
    place(amber, sphere, x, y + .41 * scale, z, .20 * scale, .32 * scale, .20 * scale);
    place(brass, cylinder, x, y + .75 * scale, z, .25 * scale, .06 * scale, .25 * scale);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      place(brass, cylinder, x + Math.sin(a) * .21 * scale, y + .42 * scale, z + Math.cos(a) * .21 * scale, .012 * scale, .65 * scale, .012 * scale);
    }
  };
  const themedLantern = (index: number, x: number, y: number, z: number, yaw: number) => {
    const cy = y + 1.22, glow = themeLights[index]; lanterns.push(new THREE.Vector3(x, cy, z));
    place(brass, cylinder, x, y + .10, z, .45, .18, .45); place(brass, cylinder, x, y + .6, z, .065, 1.0, .065);
    if (index === 0) place(glow, crescent, x, cy, z, 1.25, 1.25, 1.25, 0, yaw, -.45);
    if (index === 1) place(glow, star, x, cy, z, 1.15, 1.15, 1.15, 0, yaw);
    if (index === 2) {
      for (const [dx, dy, size] of [[-.5, -.05, .42], [0, .18, .57], [.53, 0, .39]]) place(glow, sphere, x + Math.cos(yaw) * dx, cy + dy, z - Math.sin(yaw) * dx, size, size * .8, size * .62);
    }
    if (index === 3) {
      place(glow, sphere, x, cy, z, .58, .72, .58); place(brass, cylinder, x, cy + .72, z, .27, .08, .27); place(brass, cylinder, x, cy - .72, z, .27, .08, .27);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; place(brass, arch, x, cy, z, .60, .72, .60, 0, a, Math.PI / 2); }
    }
    if (index === 4) {
      place(glass, sphere, x, cy, z, .72, .72, .72);
      for (let i = 0; i < 5; i++) { const a = i * 2.399; place(glow, star, x + Math.cos(a) * .42, cy + Math.sin(a) * .38, z + Math.sin(i) * .22, .2, .2, .2, 0, yaw + i * .5); }
      place(brass, cylinder, x, cy - .72, z, .55, .06, .55);
    }
  };
  // One tapered cotton body hangs beneath the whole scalloped outline, meeting the terrace top exactly along its edge.
  const shell = new THREE.BufferGeometry(), shellPositions: number[] = [], shellUvs: number[] = [], shellIndices: number[] = [], shellLayers = 10;
  const ring = outline.length, centreZ = (cloudSpaIslandRange().minZ + cloudSpaIslandRange().maxZ) / 2;
  for (let layer = 0; layer <= shellLayers; layer++) for (let i = 0; i < ring; i++) {
    const point = outline[i], t = layer / shellLayers, scale = 1 - t * .4;
    shellPositions.push(point.x * scale, point.y + (-27 - point.y) * t, centreZ + (point.z - centreZ) * scale); shellUvs.push(i / ring, t);
    if (layer < shellLayers) { const p = layer * ring + i, pNext = layer * ring + (i + 1) % ring, q = p + ring, qNext = pNext + ring; shellIndices.push(p, q, pNext, pNext, q, qNext); }
  }
  shell.setAttribute("position", new THREE.Float32BufferAttribute(shellPositions, 3)); shell.setAttribute("uv", new THREE.Float32BufferAttribute(shellUvs, 2)); shell.setIndex(shellIndices); shell.computeVertexNormals();
  batches.set(cloud, [shell]);
  // Beneath the lowest pool the city-facing lip curls inward so the view over its edge stays open.
  const lowest = CLOUD_SPA_POOLS[CLOUD_SPA_POOLS.length - 1], lipRadius = lowest.radius + CLOUD_SPA_TERRACE.lip + .01;
  const lip = new THREE.BufferGeometry(), lipPositions: number[] = [], lipUvs: number[] = [], lipIndices: number[] = [], lipSides = mobile ? 60 : 96;
  for (let ringIndex = 0; ringIndex <= 6; ringIndex++) for (let i = 0; i <= lipSides; i++) {
    const angle = Math.PI * .66 + i / lipSides * Math.PI * .68, t = ringIndex / 6, radius = lipRadius - t * 3.2;
    lipPositions.push(lowest.x + Math.sin(angle) * radius, lowest.deckY - .01 - t * 9.7, lowest.z + Math.cos(angle) * radius); lipUvs.push(i / lipSides, t);
    if (ringIndex < 6 && i < lipSides) { const a = ringIndex * (lipSides + 1) + i, c = a + lipSides + 1; lipIndices.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  lip.setAttribute("position", new THREE.Float32BufferAttribute(lipPositions, 3)); lip.setAttribute("uv", new THREE.Float32BufferAttribute(lipUvs, 2)); lip.setIndex(lipIndices); lip.computeVertexNormals();
  batches.get(cloud)!.push(lip);
  for (const [poolIndex, pool] of CLOUD_SPA_POOLS.entries()) {
    // Lanterns stand only on this pool's own shelf, never in a neighbouring basin, a rill, or the newcomer's first view.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, radius = pool.radius + 2, x = pool.x + Math.sin(a) * radius, z = pool.z + Math.cos(a) * radius, y = cloudSpaFloorHeight(x, z);
      if (Math.abs(y - pool.deckY) < .02 && Math.hypot(x - CLOUD_SPA_SPAWN.x, z - CLOUD_SPA_SPAWN.z) > 4) themedLantern(poolIndex, x, y, z, a);
    }
    for (const seat of CLOUD_SPA_SEATS.filter(seat => seat.spotId === pool.spotId)) {
      place(marble, soft, seat.x, seat.avatarY - .25, seat.z, 1.65, .5, 1.1, 0, seat.yaw);
    }
  }
  // Rill treads are real slabs resting on the hidden ramp, so the steps stay crisp whatever the terrain grid does.
  const { halfWidth, steps, rise, run, sill } = CLOUD_SPA_CHANNEL;
  for (const channel of CLOUD_SPA_CHANNELS) {
    const yaw = Math.atan2(channel.ux, channel.uz), top = channel.upper.deckY - sill;
    for (let k = 0; k < steps; k++) {
      const [x, z] = cloudSpaChannelPoint(channel, channel.lipEnd + (k + .5) * run, 0);
      place(marble, box, x, top - rise * (k + 1) - .3, z, halfWidth * 2 - .1, .6, run + .02, 0, yaw);
    }
    for (const side of [-1, 1]) {
      const [x, z] = cloudSpaChannelPoint(channel, channel.upper.radius - .5, side * (halfWidth + .7));
      lantern(x, cloudSpaFloorHeight(x, z), z, .85);
    }
  }
  for (const z of [90.6, 96, 113]) for (const side of [-1, 1]) lantern(side * 20.5, CLOUD_SPA_RESORT.floorY, z, 1.2);

  // A single palatial silhouette grows from one storm cloud, with a generous lit entrance below.
  const hall = CLOUD_SPA_RESORT, fy = hall.floorY;
  detailZ = hall.z - 101;
  for (const x of [-19, 19]) place(marble, box, x, fy + 4.8, 101, .5, 9.6, 25);
  place(marble, box, 0, fy + 4.8, 113.5, 38, 9.6, .5);
  place(marble, box, 0, hall.ceilingY + .12, 101, 38.5, .24, 25.5);
  for (const side of [-1, 1]) {
    place(marble, box, side * 12, fy + .3, 88.5, 14, .6, .35);
    place(glass, plane, side * 12, fy + 3.9, 88.49, 13.7, 6.6, 1);
    place(marble, box, side * 12, fy + 8.8, 88.5, 14, 3.2, .38);
    for (const x of [side * 5, side * 12, side * 19]) place(brass, cylinder, x, fy + 4.2, 88.3, .13, 8.4, .13);
    place(brass, arch, side * 12, fy + 3.3, 88.28, 6.7, 4.1, 1);
    place(marble, soft, side * 10.7, fy + .16, 101, 2.05, .32, 6.65);
    place(ivory, soft, side * 11.42, fy + .95, 101, .46, 1.58, 6.55);
    for (const dz of [-3.12, 3.12]) place(ivory, soft, side * 10.7, fy + .74, 101 + dz, 2.03, .84, .38);
    for (const dz of [-2, 0, 2]) place(ivory, soft, side * 10.5, fy + .46, 101 + dz, 1.55, .28, 1.9);
    for (const dz of [-2, 2]) place(ivory, pillow, side * 11.12, fy + 1.13, 101 + dz, .84, .28, .72, 0, 0, side * Math.PI / 2);
    for (const z of [91, 111]) {
      place(marble, sphere, side * 16, fy + .75, z, .85, .75, .85);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.399;
        place(leaves, sphere, side * 16 + Math.sin(a) * .45, fy + 1.65 + i % 3 * .3, z + Math.cos(a) * .45, .22, .85, .3, .35, a);
      }
    }
    for (const z of [94, 108]) {
      lantern(side * 14.5, fy + 1.1, z, 1.5);
      place(wood, cylinder, side * 14.5, fy + .55, z, .55, 1.1, .55);
    }
  }
  place(brass, arch, 0, fy + 3, 88.2, 5, 6.7, 1);
  place(ivory, soft, 0, fy + .035, 101, 25, .06, 9, 0);
  place(wood, soft, 0, fy + .42, 101, 4.6, .84, 2.9);
  place(marble, soft, 0, fy + .9, 101, 4.7, .12, 3);
  place(wood, soft, 0, fy + 1.1, 110.8, 13, 2.2, 1.5);
  place(brass, box, 0, fy + 2.23, 110.8, 13.2, .06, 1.7);
  for (const x of [-5, 0, 5]) lantern(x, fy + 2.27, 110.8, 1.4);
  // The storm cloud around the hall is drawn as photographic billboards (see CloudSpaWorld), so nothing solid stands here.
  for (const x of [-14, -7, 0, 7, 14]) {
    place(brass, cylinder, x, fy + 8.75, 99.8, .035, 3.1, .035);
    place(amber, sphere, x, fy + 6.95, 99.8, .7, .4, .7);
    place(brass, cylinder, x, fy + 6.68, 99.8, .77, .055, .77);
  }
  // Warm coves separate the clear indoor lounge from the storm-cloud shell above it.
  for (const side of [-1, 1]) place(amber, box, side * 18.5, hall.ceilingY - .12, 101, .10, .08, 24);
  place(amber, box, 0, hall.ceilingY - .12, 112.9, 37, .08, .1);
  for (const [material, pieces] of batches) {
    const normalized = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece), geometry = mergeGeometries(normalized, false)!;
    for (const piece of new Set([...pieces, ...normalized])) piece.dispose();
    owned.push(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name; root.add(mesh);
    if (material === glass) mesh.renderOrder = 4;
    if (material === cloud) mesh.renderOrder = 1;
  }
  for (const geometry of [sphere, box, soft, cylinder, pillow, plane, arch, crescent, star]) geometry.dispose();
  let disposed = false;
  return { root, lanterns,
    applyNight(amount) { if (!disposed) { const value = THREE.MathUtils.clamp(amount, 0, 1); amber.emissiveIntensity = .35 + value * .95; themeLights.forEach(m => m.emissiveIntensity = .35 + value * .85); } },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); owned.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
