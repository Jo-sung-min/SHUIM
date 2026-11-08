import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createShelterPillowGeometry } from "./shelter-textiles";
import { CLOUD_SPA_ISLAND, CLOUD_SPA_CONNECTIONS, CLOUD_SPA_STAIR_BREAKS, CLOUD_SPA_POOLS, CLOUD_SPA_RESORT, CLOUD_SPA_SEATS, cloudSpaFloorHeight, cloudSpaConnectionPosition, cloudSpaMountainHalfWidth, cloudSpaStairRouteX } from "./cloud-spa-layout";
import { createCloudSpaCloudMaterial } from "./cloud-spa-materials";

export function cloudSpaGroundGeometry(mobile: boolean): THREE.BufferGeometry {
  const columns = mobile ? 160 : 240, rows = mobile ? 300 : 420, positions: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
  const vertex = (x: number, y: number, z: number) => {
    const shade = .92 + .035 * Math.sin(x * .83 + Math.sin(z * .47)) + .025 * Math.sin(z * 1.1 + Math.cos(x * .55));
    positions.push(x, y, z); uv.push(x * .15, z * .15); colors.push(shade, shade + .017, Math.min(1, shade + .035));
  };
  const groundRows = Array.from({ length: rows + 1 }, (_, row) => ({ z: CLOUD_SPA_ISLAND.minZ + (CLOUD_SPA_ISLAND.maxZ - CLOUD_SPA_ISLAND.minZ) * row / rows, offset: 0 }));
  for (const z of CLOUD_SPA_STAIR_BREAKS) groundRows.push({ z, offset: -.0001 }, { z, offset: .0001 });
  groundRows.sort((a, b) => a.z - b.z || a.offset - b.offset);
  for (const { z, offset } of groundRows) {
    const half = cloudSpaMountainHalfWidth(z);
    for (let column = 0; column <= columns; column++) {
      const x = -half + column / columns * half * 2;
      vertex(x, cloudSpaFloorHeight(x, z + offset), z);
    }
  }
  for (let row = 0; row < groundRows.length - 1; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1;
    indices.push(a, c, b, b, c, c + 1);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.name = "cloud-spa-unified-terraced-cloud-mountain"; return geometry;
}

export function cloudSpaViewGap(angle: number): number {
  const distance = Math.min(...[Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)))));
  return 1 - THREE.MathUtils.smoothstep(distance, .1, .24);
}

export interface CloudSpaScenery {
  root: THREE.Group; lanterns: readonly THREE.Vector3[];
  applyNight(amount: number): void; dispose(): void;
}

/** The cloud silhouettes are real rounded volumes; photo wisps soften their outermost edges in the world. */
export function buildCloudSpaScenery(parent: THREE.Object3D, textures: { wood: THREE.Texture; cotton: THREE.Texture; surface: THREE.Texture }, mobile: boolean): CloudSpaScenery {
  const root = new THREE.Group(); root.name = "cloud-spa-scenery"; parent.add(root);
  const owned: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], lanterns: THREE.Vector3[] = [];
  const standard = (name: string, color: number, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .92, ...options, fog: false }); material.name = name; materials.push(material); return material;
  };
  const cloud = createCloudSpaCloudMaterial("cloud", textures.surface); cloud.name = "cloud-spa-moonlit-cloud"; materials.push(cloud);
  const storm = createCloudSpaCloudMaterial("storm", textures.surface); storm.name = "cloud-spa-single-storm-resort"; materials.push(storm);
  const marble = standard("cloud-spa-ivory-stone", 0xd5d9dc, { roughness: .65 });
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
  // One continuous tapered mountain body joins every terrace; no separate floating discs remain.
  const shell = new THREE.BufferGeometry(), shellPositions: number[] = [], shellUvs: number[] = [], shellIndices: number[] = [], shellSides = mobile ? 120 : 176, shellLayers = 10;
  for (let layer = 0; layer <= shellLayers; layer++) for (let i = 0; i <= shellSides; i++) {
    const a = i / shellSides * Math.PI * 2, z = Math.max(CLOUD_SPA_ISLAND.minZ, CLOUD_SPA_ISLAND.z + Math.cos(a) * CLOUD_SPA_ISLAND.rz), half = cloudSpaMountainHalfWidth(z);
    const x = Math.sign(Math.sin(a)) * half, t = layer / shellLayers, scale = 1 - t * .4, top = cloudSpaFloorHeight(x, z), y = top + (-27 - top) * t;
    shellPositions.push(x * scale, y, CLOUD_SPA_ISLAND.z + (z - CLOUD_SPA_ISLAND.z) * scale); shellUvs.push(i / shellSides, t);
    if (layer < shellLayers && i < shellSides) { const p = layer * (shellSides + 1) + i, q = p + shellSides + 1; shellIndices.push(p, q, p + 1, p + 1, q, q + 1); }
  }
  shell.setAttribute("position", new THREE.Float32BufferAttribute(shellPositions, 3)); shell.setAttribute("uv", new THREE.Float32BufferAttribute(shellUvs, 2)); shell.setIndex(shellIndices); shell.computeVertexNormals();
  batches.set(cloud, [shell]);
  // Close the narrow city-facing lip directly beneath the final pool; its skirt curves inward so the view over it remains open.
  const lip = new THREE.BufferGeometry(), lipPositions: number[] = [], lipUvs: number[] = [], lipIndices: number[] = [], lipSides = mobile ? 60 : 96;
  for (let ring = 0; ring <= 6; ring++) for (let i = 0; i <= lipSides; i++) {
    const angle = Math.PI * .66 + i / lipSides * Math.PI * .68, t = ring / 6, radius = 23.81 - t * 3.2;
    lipPositions.push(Math.sin(angle) * radius, 2.79 - t * 9.7, -66 + Math.cos(angle) * radius); lipUvs.push(i / lipSides, t);
    if (ring < 6 && i < lipSides) { const a = ring * (lipSides + 1) + i, c = a + lipSides + 1; lipIndices.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  lip.setAttribute("position", new THREE.Float32BufferAttribute(lipPositions, 3)); lip.setAttribute("uv", new THREE.Float32BufferAttribute(lipUvs, 2)); lip.setIndex(lipIndices); lip.computeVertexNormals();
  batches.get(cloud)!.push(lip);
  for (let i = 0; i < (mobile ? 64 : 96); i++) {
    const a = i / (mobile ? 64 : 96) * Math.PI * 2, z = Math.max(CLOUD_SPA_ISLAND.minZ, 17 + Math.cos(a) * 107), x = Math.sign(Math.sin(a)) * cloudSpaMountainHalfWidth(z), p = .5 + .5 * Math.sin(i * 2.39);
    const city = z < -75, top = cloudSpaFloorHeight(x, z);
    place(cloud, sphere, x * .97, top - (city ? 8.3 : 3.3), 17 + (z - 17) * .98, 3.2 + p * 2.2, city ? 2.1 : 3.8 + p, 3.3 + (1 - p) * 2.5);
    if (!city && i % 2 === 0) place(cloud, sphere, x * .86, -11 + p * 2, 17 + (z - 17) * .86, 5 + p * 3, 6.5, 6 + (1 - p) * 3);
  }
  for (const [poolIndex, pool] of CLOUD_SPA_POOLS.entries()) {
    const count = mobile ? 24 : 38;
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2, p = .5 + .5 * Math.sin(i * 2.38 + pool.x), radius = pool.radius + .35;
      const city = poolIndex === 4 && Math.cos(a) < -.15, y = pool.deckY - (city ? .88 : .35) + p * .08;
      place(cloud, sphere, pool.x + Math.sin(a) * radius, y, pool.z + Math.cos(a) * radius, 1.05 + p * .5, city ? .28 : .38 + p * .2, 1.1 + p * .5);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + .22;
      const radius = pool.radius + (poolIndex === 4 && Math.cos(a) < -.15 ? .35 : 2), x = pool.x + Math.sin(a) * radius, z = pool.z + Math.cos(a) * radius;
      themedLantern(poolIndex, x, cloudSpaFloorHeight(x, z), z, a);
    }
    for (const seat of CLOUD_SPA_SEATS.filter(seat => seat.spotId === pool.spotId)) {
      place(marble, soft, seat.x, seat.avatarY - .25, seat.z, 1.65, .5, 1.1, 0, seat.yaw);
    }
  }
  for (const link of CLOUD_SPA_CONNECTIONS) {
    const p = cloudSpaConnectionPosition(link, link.ax, link.az), start = link.ar, end = p.length - link.br;
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
      const along = start + (end - start) * i / 4, x = link.ax + p.ux * along - p.uz * side * 4.15, z = link.az + p.uz * along + p.ux * side * 4.15;
      const y = cloudSpaFloorHeight(x, z);
      if (i % 2 === 0) lantern(x, y, z, .85);
    }
  }
  for (const z of CLOUD_SPA_STAIR_BREAKS) for (const side of [-1, 1]) {
    const x = side * cloudSpaStairRouteX(z), y = cloudSpaFloorHeight(x, z + .001);
    place(marble, soft, x, y + .015, z + .035, 7.8, .025, .11);
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
  // Layers overlap above the architectural ceiling only, so no cloud solid enters a seated visitor's face.
  for (let i = 0; i < 30; i++) {
    const a = i * 2.399, radius = Math.sqrt((i + .5) / 30), x = Math.sin(a) * 18 * radius, z = 101 + Math.cos(a) * 13 * radius;
    const p = .5 + .5 * Math.sin(i * 4.71), sy = 2.8 + p * 2.8, crown = (1 - radius) * 5;
    place(storm, sphere, x, hall.ceilingY + sy + .55 + crown, z, 3.2 + p * 2.7, sy, 3.6 + (1 - p) * 2.4);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
    const p = .5 + .5 * Math.sin(i * 3.14 + side), sx = 1.3 + p * 1.1;
    place(storm, sphere, side * (19.4 + sx), fy + 3.6 + i % 3 * 2, 89.5 + i * 3.4, sx, 3.1 + p, 2 + p * 1.2);
  }
  for (let i = 0; i < 9; i++) place(storm, sphere, -17 + i * 4.25, fy + 5.4 + Math.sin(i) * 1.4, 116.6, 2.8, 4.6, 2.6);
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
  }
  for (const geometry of [sphere, box, soft, cylinder, pillow, plane, arch, crescent, star]) geometry.dispose();
  let disposed = false;
  return { root, lanterns,
    applyNight(amount) { if (!disposed) { const value = THREE.MathUtils.clamp(amount, 0, 1); amber.emissiveIntensity = .35 + value * .95; themeLights.forEach(m => m.emissiveIntensity = .35 + value * .85); } },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); root.clear(); owned.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
