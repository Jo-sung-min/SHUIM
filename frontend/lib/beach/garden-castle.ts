import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { HALL, HALL_TIERS } from "./garden-layout";
import { seededRandom } from "./bamboo-trail";

/** Exterior only: the original glass, doors, seats and walking footprint remain authoritative. */
export function buildGardenCastle(parent: THREE.Object3D, textures: { stone: THREE.Texture; slate: THREE.Texture }, mobile: boolean) {
  const root = new THREE.Group(); root.name = "garden-castle"; parent.add(root);
  const limestone = new THREE.MeshStandardMaterial({ name: "castle-limestone", color: 0xb2ad9c, vertexColors: true, map: textures.stone, bumpMap: textures.stone, bumpScale: .075, roughness: .94 });
  const slate = new THREE.MeshStandardMaterial({ name: "castle-slate", color: 0x50616b, vertexColors: true, map: textures.slate, bumpMap: textures.slate, bumpScale: .055, roughness: .83 });
  const lead = new THREE.MeshStandardMaterial({ name: "castle-lead", color: 0x454e50, vertexColors: true, roughness: .76, metalness: .2 });
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>([[limestone, []], [slate, []], [lead, []]]);
  const owned: THREE.BufferGeometry[] = [], source: THREE.BufferGeometry[] = [];
  const rand = seededRandom(831), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const cube = new THREE.BoxGeometry(1, 1, 1), drum = new THREE.CylinderGeometry(1, 1, 1, mobile ? 10 : 12);
  const cone = new THREE.ConeGeometry(1, 1, mobile ? 10 : 12), spike = new THREE.ConeGeometry(1, 1, 4);
  source.push(cube, drum, cone, spike);
  const add = (shape: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const geometry = shape.index ? shape.toNonIndexed() : shape.clone();
    matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    geometry.applyMatrix4(matrix);
    const positions = geometry.getAttribute("position"), colors = new Float32Array(positions.count * 3);
    // Each ashlar has a subdued mineral variation; the existing plaster map supplies fine grain.
    const tone = material === limestone ? .82 + rand() * .18 : .9 + rand() * .1;
    for (let i = 0; i < positions.count; i++) colors.set([tone, tone, tone * .99], i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    buckets.get(material)!.push(geometry);
  };
  const beam = (material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number, depth = width) => {
    const direction = b.clone().sub(a), geometry = cube.clone();
    geometry.scale(width, direction.length(), depth);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    const centre = a.clone().add(b).multiplyScalar(.5);
    add(geometry, material, centre.x, centre.y, centre.z); geometry.dispose();
  };
  const triangle = (a: number[], b: number[], c: number[]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...c, ...b, ...a], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, .5, 1, .5, 1, 1, 0, 0, 0], 2));
    geometry.computeVertexNormals(); source.push(geometry); return geometry;
  };
  const topTier = HALL_TIERS[HALL_TIERS.length - 1].y, eave = topTier + HALL.eave;
  const front = HALL.glassZ, back = HALL.backZ, centreZ = (front + back) / 2, half = HALL.halfX;

  // Shallow masonry sits on the existing wall planes, inside the original stone foundation.
  const base = .42, course = .64, courses = Math.ceil((eave - base) / course);
  for (let row = 0; row < courses; row++) {
    const bottom = base + row * course, height = Math.min(course, eave - bottom), y = bottom + height / 2;
    for (let col = 0; col < 15; col++) {
      const x0 = -half + col * 2;
      add(cube, limestone, HALL.x + x0 + 1, y, back + .205, 1.975, height - .021, .11);
    }
    for (const side of [-1, 1]) {
      const intervals = bottom < topTier + 3.3 && bottom + height > topTier
        ? [[front, HALL.doorZ - HALL.doorHalf - .12], [HALL.doorZ + HALL.doorHalf + .12, back]]
        : [[front, back]];
      for (const [from, to] of intervals) {
        const count = Math.ceil((to - from) / 1.9), width = (to - from) / count;
        for (let col = 0; col < count; col++) add(cube, limestone, HALL.x + side * (half + .205), y, from + (col + .5) * width, .11, height - .021, width - .021);
      }
    }
  }

  // Four piers coincide with existing mullions, leaving three enormous clear window bays.
  const paneWidth = half * 2 / 7, pierXs = [-half, -half + paneWidth * 2, -half + paneWidth * 5, half];
  for (const x of pierXs) {
    for (let row = 0; row < 20; row++) {
      const h = (eave - base) / 20;
      add(cube, limestone, HALL.x + x, base + h * (row + .5), front + .04, .49 + (row % 4 === 0 ? .05 : 0), h - .018, .5);
    }
    add(cube, limestone, HALL.x + x, 1.0, front + .04, .69, 1.16, .65);
    for (const y of [eave - .18, eave + .12]) add(cube, limestone, HALL.x + x, y, front, .84, .2, .72);
  }
  const pointedArch = (x: number, spring: number, z: number, halfWidth: number, rise: number, thickness: number) => {
    const segments = mobile ? 12 : 18;
    for (const side of [-1, 1]) for (let i = 0; i < segments; i++) {
      const point = (t: number) => new THREE.Vector3(x + side * halfWidth * (2 * Math.cos(t * Math.PI / 3) - 1), spring + rise * Math.sin(t * Math.PI / 3) / Math.sin(Math.PI / 3), z);
      beam(limestone, point(i / segments), point((i + 1) / segments), thickness, .24);
    }
  };
  for (let bay = 0; bay < 3; bay++) {
    const left = pierXs[bay], right = pierXs[bay + 1], width = (right - left) / 2 - .24;
    const rise = bay === 1 ? 7.0 : 5.5;
    pointedArch(HALL.x + (left + right) / 2, eave - rise - .16, front - .12, width, rise, .24);
    pointedArch(HALL.x + (left + right) / 2, eave - rise - .16, front - .16, width - .18, rise - .2, .075);
  }

  // Stepped buttresses project only as far as the current foundation, clear of both doors.
  for (const side of [-1, 1]) for (const z of [front + .6, front + 6.8, front + 12.2, back - .6]) {
    for (const [bottom, height, projection, width] of [[base, 5, .42, .85], [5.42, 5.1, .33, .7], [10.52, 5.88, .23, .56]]) {
      add(cube, limestone, HALL.x + side * (half + .14 + projection / 2), bottom + height / 2, z, projection, height, width);
      add(cube, limestone, HALL.x + side * (half + .14 + projection / 2), bottom + height - .04, z, projection + .08, .14, width + .14);
    }
    add(cube, limestone, HALL.x + side * half, eave + .47, z, .62, .94, .62);
    add(spike, limestone, HALL.x + side * half, eave + 1.42, z, .5, 1.1, .5, 0, Math.PI / 4);
  }
  for (const side of [-1, 1]) {
    // The door opening and its full 2.8 m walking width remain untouched.
    for (const z of [HALL.doorZ - HALL.doorHalf - .18, HALL.doorZ + HALL.doorHalf + .18]) add(cube, limestone, HALL.x + side * (half + .24), topTier + 1.68, z, .34, 3.36, .18);
    add(cube, limestone, HALL.x + side * (half + .24), topTier + 3.45, HALL.doorZ, .34, .26, HALL.doorHalf * 2 + .55);
    // A raised lancet hood above the rectangular doorway adds height without changing headroom.
    for (const sign of [-1, 1]) for (let i = 0; i < 10; i++) {
      const point = (t: number) => new THREE.Vector3(HALL.x + side * (half + .3), topTier + 3.55 + 2.2 * Math.sin(t * Math.PI / 3) / Math.sin(Math.PI / 3), HALL.doorZ + sign * 1.62 * (2 * Math.cos(t * Math.PI / 3) - 1));
      beam(limestone, point(i / 10), point((i + 1) / 10), .2);
    }
  }

  // A slate great-hall roof, central cross gable and four modest rooftop turrets form one silhouette.
  const roofBase = eave + .35, roofRise = 10.2, roofHalfZ = (back - front) / 2 + .8, roofHalfX = half + .8;
  const roofSlope = Math.hypot(roofHalfZ, roofRise), roofPitch = Math.atan2(roofRise, roofHalfZ);
  for (const side of [-1, 1]) add(cube, slate, HALL.x, roofBase + roofRise / 2, centreZ + side * roofHalfZ / 2, roofHalfX * 2, .16, roofSlope, side * roofPitch);
  for (const side of [-1, 1]) {
    const gable = triangle([HALL.x + side * half, roofBase, front], [HALL.x + side * half, roofBase, back], [HALL.x + side * half, roofBase + roofRise, centreZ]);
    add(gable, limestone, 0, 0, 0);
    for (const z of [front, back]) beam(limestone, new THREE.Vector3(HALL.x + side * (half + .05), roofBase, z), new THREE.Vector3(HALL.x + side * (half + .05), roofBase + roofRise + .15, centreZ), .34, .34);
  }
  for (const z of [front - .4, back + .4]) {
    add(cube, limestone, HALL.x, eave + .12, z, half * 2 + 1.1, .38, .42);
    add(cube, lead, HALL.x, roofBase + .06, z, half * 2 + 1.1, .11, .12);
  }
  add(cube, lead, HALL.x, roofBase + roofRise + .1, centreZ, roofHalfX * 2 + .2, .18, .24);

  const crossHalf = 4.45, crossRise = 7.6, crossFront = front - .48, crossDepth = 10.5;
  const crossGable = triangle([HALL.x - crossHalf, roofBase, crossFront], [HALL.x + crossHalf, roofBase, crossFront], [HALL.x, roofBase + crossRise, crossFront]);
  add(crossGable, limestone, 0, 0, 0);
  for (const side of [-1, 1]) {
    add(cube, slate, HALL.x + side * crossHalf / 2, roofBase + crossRise / 2, crossFront + crossDepth / 2, Math.hypot(crossHalf, crossRise), .15, crossDepth, 0, 0, -side * Math.atan2(crossRise, crossHalf));
    beam(limestone, new THREE.Vector3(HALL.x + side * crossHalf, roofBase, crossFront - .09), new THREE.Vector3(HALL.x, roofBase + crossRise + .1, crossFront - .09), .29, .32);
  }
  // A dark lead rose medallion and radial stone tracery sit above, never over, the glass.
  const roseY = roofBase + 2.55, disk = new THREE.CircleGeometry(1.25, mobile ? 20 : 32);
  source.push(disk); add(disk, lead, HALL.x, roseY, crossFront - .025, 1, 1, 1, 0, Math.PI);
  const ring = new THREE.TorusGeometry(1.3, .13, 5, mobile ? 20 : 32); source.push(ring);
  add(ring, limestone, HALL.x, roseY, crossFront - .08);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    beam(limestone, new THREE.Vector3(HALL.x, roseY, crossFront - .1), new THREE.Vector3(HALL.x + Math.sin(angle) * 1.18, roseY + Math.cos(angle) * 1.18, crossFront - .1), .08, .11);
  }

  for (const x of [-half + 1.5, half - 1.5]) for (const z of [front + 1.5, back - 1.5]) {
    const turretBase = roofBase + 1.6, height = z < centreZ ? 6.0 : 5.1, radius = 1.16;
    add(drum, limestone, HALL.x + x, turretBase + height / 2, z, radius, height, radius);
    for (const y of [turretBase + .22, turretBase + height - .18]) add(drum, limestone, HALL.x + x, y, z, radius + .18, .28, radius + .18);
    for (let slot = 0; slot < 4; slot++) {
      const a = slot * Math.PI / 2, sx = Math.sin(a), sz = Math.cos(a);
      add(cube, lead, HALL.x + x + sx * 1.145, turretBase + height - 1.55, z + sz * 1.145, .26, 1.45, .06, 0, a);
    }
    const spireHeight = z < centreZ ? 6.4 : 5.7;
    add(cone, slate, HALL.x + x, turretBase + height + spireHeight / 2, z, 1.58, spireHeight, 1.58);
    add(drum, lead, HALL.x + x, turretBase + height, z, 1.62, .16, 1.62);
    add(spike, lead, HALL.x + x, turretBase + height + spireHeight + .35, z, .12, .8, .12);
  }
  // Small ridge fleche supplies the highest accent while the large roofs remain legible.
  const flecheY = roofBase + roofRise + .25;
  add(drum, limestone, HALL.x, flecheY + 1.0, centreZ, .7, 2, .7);
  add(cone, slate, HALL.x, flecheY + 3.1, centreZ, 1.05, 3.4, 1.05);
  add(spike, lead, HALL.x, flecheY + 5.1, centreZ, .12, .9, .12);

  for (const [material, pieces] of buckets) {
    const geometry = mergeGeometries(pieces, false)!; owned.push(geometry);
    for (const piece of pieces) piece.dispose();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `garden-${material.name}`;
    mesh.layers.enable(2); root.add(mesh);
  }
  for (const geometry of source) geometry.dispose();
  let disposed = false;
  return { root, dispose() {
    if (disposed) return; disposed = true;
    root.removeFromParent(); root.clear();
    for (const geometry of owned) geometry.dispose();
    for (const material of buckets.keys()) material.dispose();
  } };
}
