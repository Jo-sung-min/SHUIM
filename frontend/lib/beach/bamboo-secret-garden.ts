import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import { SECRET_GARDEN, SECRET_GARDEN_PATHS, SECRET_GARDEN_ZONES, groundHeight, insideSecretGarden, seededRandom } from "./bamboo-trail";

type Instance = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number; rotation?: THREE.Quaternion };
type Bulb = { x: number; y: number; z: number; color: number; size: number; phase: number };

/** Reuses the forest's nearest-light pool, enabled only for visitors inside the enclosure. */
export const SECRET_GARDEN_LIGHTS = [
  ...SECRET_GARDEN_ZONES.map(zone => ({ x: zone.x, z: zone.z, color: 0xffe2cb, strength: 1.25 })),
  ...[87, 95, 103, 109].map(z => ({ x: SECRET_GARDEN.spineX, z, color: 0xe2dcff, strength: .85 })),
].map(point => ({ ...point, y: groundHeight(point.x, point.z) + 2.5 }));

/** An enclosed light arboretum. All plants share instanced batches and every
 * fairy bulb shares one point draw; the garden adds no lights or shadow maps. */
export function buildBambooSecretGarden(parent: THREE.Object3D, timeUniform: { value: number }) {
  const root = new THREE.Group(); root.name = "bamboo-secret-garden"; parent.add(root);
  let disposed = false;
  const rand = seededRandom(6481), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];
  const wood: Instance[] = [], leaves: Instance[] = [], shrubs: Instance[] = [], stones: Instance[] = [];
  const petals: Instance[] = [], stalks: Instance[] = [], hedge: Instance[] = [], hedgeLeaves: Instance[] = [];
  const bulbs: Bulb[] = [], wires: THREE.BufferGeometry[] = [], paving: THREE.BufferGeometry[] = [], pools: THREE.BufferGeometry[] = [];
  const colors = [0x9464ff, 0x30f5cb, 0xff55b7, 0xffc85b, 0xc4eaff, 0x477dff];
  const up = new THREE.Vector3(0, 1, 0), transform = new THREE.Object3D();
  const owned = <T extends THREE.Material>(material: T): T => { materials.add(material); return material; };
  const sphere = (w: number, h: number) => new THREE.SphereGeometry(1, w, h);
  const item = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): Instance => ({ x, y, z, sx, sy, sz, color });
  const branch = (list: Instance[], a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) => {
    const vector = b.clone().sub(a), center = a.clone().add(b).multiplyScalar(.5);
    list.push({ ...item(center.x, center.y, center.z, radius, vector.length(), radius, color), rotation: new THREE.Quaternion().setFromUnitVectors(up, vector.normalize()) });
  };
  const bulb = (x: number, y: number, z: number, color: number, size = .8) => bulbs.push({ x, y, z, color, size, phase: rand() * Math.PI * 2 });
  const shell = (x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996323, v = 1 - 2 * (i + .5) / count, r = Math.sqrt(1 - v * v), wobble = .97 + rand() * .06;
      bulb(x + Math.cos(a) * r * rx * wobble, y + v * ry * wobble, z + Math.sin(a) * r * rz * wobble, color, .38 + rand() * .25);
    }
  };
  const lineLights = (a: THREE.Vector3, b: THREE.Vector3, color: number, spacing = .14) => {
    const count = Math.max(2, Math.ceil(a.distanceTo(b) / spacing));
    for (let i = 0; i <= count; i++) { const p = a.clone().lerp(b, i / count); bulb(p.x, p.y, p.z, color); }
  };
  const tint = (geometry: THREE.BufferGeometry, hex: number) => {
    const color = new THREE.Color(hex), count = geometry.getAttribute("position").count, data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(data, i * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(data, 3)); return geometry;
  };
  const batch = (name: string, data: Instance[], geometry: THREE.BufferGeometry, material: THREE.Material) => {
    geometries.add(geometry); materials.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, data.length); mesh.name = name;
    for (let i = 0; i < data.length; i++) {
      const p = data[i]; transform.position.set(p.x, p.y, p.z); transform.scale.set(p.sx, p.sy, p.sz);
      transform.quaternion.copy(p.rotation ?? new THREE.Quaternion()); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, new THREE.Color(p.color));
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); root.add(mesh); instances.push(mesh); return mesh;
  };
  const merge = (name: string, parts: THREE.BufferGeometry[], material: THREE.Material) => {
    const flat = parts.map(p => p.index ? p.toNonIndexed() : p), geometry = mergeGeometries(flat, false)!;
    for (const p of new Set([...parts, ...flat])) p.dispose();
    geometries.add(geometry); materials.add(material);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; root.add(mesh); return mesh;
  };

  // A continuous leaf backing closes gaps between stems even from a first-person
  // viewpoint. The two bends keep the entrance open while blocking a straight view in.
  const west = SECRET_GARDEN.minX - .5, east = SECRET_GARDEN.maxX + .5, spine = SECRET_GARDEN.spineX;
  // The approach and southern entrance use real, textured bamboo from BambooWorld.
  // Do not place tall opaque columns, box walls or oversized reed meshes there.
  const enclosure = [
    [west, 92, west, 113.8], [east, 92, east, 113.8], [west, 113.8, east, 113.8],
  ];
  for (const [ax, az, bx, bz] of enclosure) {
    const length = Math.hypot(bx - ax, bz - az), count = Math.ceil(length / 1.05), yaw = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= count; i++) {
      const x = ax + (bx - ax) * i / count, z = az + (bz - az) * i / count, y = groundHeight(x, z), h = 11.7 + rand() * 2.1;
      hedge.push({ ...item(x, y + 5.9, z, 1.4, 11.8, 1.55, 0x122b17), rotation: new THREE.Quaternion().setFromAxisAngle(up, yaw) });
      for (let k = 0; k < 4; k++) {
        // Stems sit on both faces of the opaque foliage, not inside its backing.
        const offset = (k < 2 ? -1 : 1) * (.82 + (k % 2) * .2), along = (k % 2 ? -.23 : .23);
        const sx = x + Math.cos(yaw) * offset + Math.sin(yaw) * along, sz = z - Math.sin(yaw) * offset + Math.cos(yaw) * along;
        stalks.push(item(sx, y + h / 2, sz, .065 + rand() * .04, h, .065 + rand() * .04, k % 2 ? 0x42652c : 0x305525));
      }
      for (let k = 0; k < 4; k++) {
        hedgeLeaves.push(item(x + (rand() - .5) * .8, y + 1.4 + k * 3.05, z + (rand() - .5) * .8, .95 + rand() * .35, 2.2, 1.15, k % 2 ? 0x254b24 : 0x1e3f22));
      }
    }
  }

  const pathDistance = (x: number, z: number) => {
    let distance = Infinity;
    for (const line of SECRET_GARDEN_PATHS) for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
      distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return distance;
  };
  // Stepping stones and low borders follow exactly the walkable routes, including
  // their sampled terrain height. No raised platform or invisible step is introduced.
  for (const path of SECRET_GARDEN_PATHS) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    for (let s = .5; s < length; s += 1.25) {
      const x = a[0] + dx / length * s, z = a[1] + dz / length * s, y = groundHeight(x, z);
      const slab = new THREE.CircleGeometry(.3 + rand() * .08, 7); slab.rotateX(-Math.PI / 2); slab.scale(1.1, 1, .9);
      slab.rotateY(rand() * Math.PI); slab.translate(x, y + .024, z); paving.push(slab);
      if (z < 84.8) continue;
      for (const side of [-1, 1]) {
        const px = x - dz / length * 1.48 * side, pz = z + dx / length * 1.48 * side;
        bulb(px, groundHeight(px, pz) + .14, pz, colors[4], .66);
      }
    }
  }
  for (const zone of SECRET_GARDEN_ZONES) {
    // Open rings leave the branch entrance unobstructed and leave a two-metre posing area.
    for (let i = 0; i < 56; i++) {
      const a = i / 56 * Math.PI * 2, towardPath = zone.x > SECRET_GARDEN.spineX ? Math.PI : 0;
      if (Math.cos(a - towardPath) > .82) continue;
      const x = zone.x + Math.cos(a) * zone.radius, z = zone.z + Math.sin(a) * zone.radius;
      stones.push(item(x, groundHeight(x, z) + .09, z, .15, .09, .12, 0x949c89)); bulb(x, groundHeight(x, z) + .19, z, colors[2], .65);
    }
  }

  // Tall, planted forms surround every photo bay. The rear row reads as a
  // garden beyond the walk, rather than suspended symbols across the sky.
  const treeSites: readonly [number, number, number, "willow" | "canopy" | "cone"][] = [
    [-45, 87.3, 8.4, "willow"], [-31.7, 86.2, 7.8, "canopy"], [-51.2, 88.3, 6.6, "cone"],
    [-51.4, 94.3, 9.2, "willow"], [-51.6, 101.8, 9, "canopy"], [-45.4, 105.2, 7.6, "cone"],
    [-43.5, 93.1, 7.4, "canopy"], [-31.5, 97.1, 8.5, "willow"],
    [-24.7, 86.9, 7.7, "cone"], [-24.6, 94.2, 8.4, "canopy"], [-24.6, 101.9, 9.5, "willow"],
    [-49.3, 110.2, 9.1, "willow"], [-43.8, 111.2, 10.2, "canopy"],
    [-37.8, 112.2, 10.6, "cone"], [-31.9, 111.4, 10.2, "canopy"], [-25.6, 111.4, 10.7, "willow"],
  ];
  root.userData.treeSites = treeSites;
  for (let index = 0; index < treeSites.length; index++) {
    const [x, z, h, shape] = treeSites[index], y = groundHeight(x, z), color = colors[index % colors.length];
    const base = new THREE.Vector3(x, y + .06, z), fork = new THREE.Vector3(x + .08, y + h * .64, z + .08);
    branch(wood, base, fork, .14, 0x76634e);
    // Several gentle spirals light the full trunk down to its roots. Even an airy
    // crown is visibly connected to the ground, without a solid luminous pole.
    const trunkSteps = Math.ceil(h * 10);
    for (let strand = 0; strand < 3; strand++) for (let n = 0; n <= trunkSteps; n++) {
      const t = n / trunkSteps, a = t * Math.PI * 12 + strand * Math.PI * 2 / 3;
      bulb(x + Math.cos(a) * .16, y + .06 + t * h * .65, z + Math.sin(a) * .16, index % 3 === 0 ? colors[3] : color, .34);
    }
    for (let rootIndex = 0; rootIndex < 6; rootIndex++) {
      const a = rootIndex / 6 * Math.PI * 2;
      lineLights(base, new THREE.Vector3(x + Math.cos(a) * .65, y + .04, z + Math.sin(a) * .65), color, .1);
    }
    if (shape === "cone") {
      // A tapering planted conifer alternates dense and open bands of bulbs.
      const rings = 92, radius = h > 9 ? 2.1 : 1.65;
      for (let row = 0; row < rings; row++) {
        const t = row / (rings - 1), r = radius * Math.pow(1 - t, .82) + .025;
        const count = Math.max(3, Math.round((row % 4 === 0 ? 42 : 24) * (1 - t)));
        for (let k = 0; k < count; k++) {
          const a = k / count * Math.PI * 2 + row * .41;
          const ringColor = index === 13 ? colors[Math.floor(row / 11) % colors.length] : row % 19 === 0 ? colors[3] : color;
          bulb(x + Math.cos(a) * r, y + .1 + t * h, z + Math.sin(a) * r, ringColor, .36 + rand() * .13);
        }
      }
      // Low overlapping foliage suggests a real planted tree during daytime.
      for (let tier = 0; tier < 4; tier++) {
        const t = tier / 4, r = radius * (1 - t) * .9;
        leaves.push(item(x, y + .7 + t * h, z, r, h * .2, r, 0x3d793c));
      }
      if (index === 13) {
        // The far-end Christmas tree carries its garland, ornaments and topper;
        // they are attached to the planted tree, never floating over the path.
        for (let i = 0; i < 920; i++) {
          const t = i / 919, a = t * Math.PI * 19, r = radius * Math.pow(1 - t, .82) + .04;
          bulb(x + Math.cos(a) * r, y + .12 + t * h, z + Math.sin(a) * r, colors[3], .34);
        }
        for (let row = 0; row < 5; row++) for (let k = 0; k < 6; k++) {
          const t = .16 + row * .15, a = k / 6 * Math.PI * 2 + row * 1.1, r = radius * Math.pow(1 - t, .82) + .06;
          shell(x + Math.cos(a) * r, y + .12 + t * h, z + Math.sin(a) * r, .1, .13, .1, colors[(k + row * 2) % colors.length], 26);
        }
        const topper = Array.from({ length: 10 }, (_, k) => {
          const a = Math.PI / 2 + k / 10 * Math.PI * 2, r = .48 * (k % 2 ? .43 : 1);
          return new THREE.Vector3(x + Math.cos(a) * r, y + h + .32 + Math.sin(a) * r, z);
        });
        for (let k = 0; k < 10; k++) lineLights(topper[k], topper[(k + 1) % 10], colors[3], .025);
      }
    } else {
      for (let arm = 0; arm < 5; arm++) {
        const a = arm * Math.PI * 2 / 5 + index, reach = .95 + rand() * .55;
        const tip = new THREE.Vector3(x + Math.cos(a) * reach, y + h * (.72 + rand() * .13), z + Math.sin(a) * reach);
        branch(wood, fork, tip, .05, 0x84745b); lineLights(fork, tip, color, .15);
        const rx = .83 + rand() * .26, ry = .55 + rand() * .28, rz = .8 + rand() * .25;
        leaves.push(item(tip.x, tip.y + .25, tip.z, rx, ry, rz, index % 2 ? 0x5f8a38 : 0x3d793c));
        shell(tip.x, tip.y + .25, tip.z, rx, ry, rz, color, index % 3 === 0 ? 240 : 410);
      }
      if (shape === "willow") for (let strand = 0; strand < 46; strand++) {
        const a = strand / 46 * Math.PI * 2, bottom = .12 + rand() * .26;
        const steps = strand % 4 === 0 ? 48 : 68;
        for (let step = 0; step < steps; step++) {
          const t = step / (steps - 1), radius = .09 + Math.pow(t, .62) * (1.65 + .16 * Math.sin(a * 3));
          bulb(x + Math.cos(a) * radius, y + h * (1 - t) + bottom * t,
            z + Math.sin(a) * radius, color, .3 + rand() * .17);
        }
      }
    }
    // A small planted skirt connects trunk, crown and nearby flower banks.
    shell(x, y + .23, z, .63, .22, .63, color, index % 2 ? 110 : 180);
    const glow = tint(new THREE.PlaneGeometry(5.5, 5.5), color); glow.rotateX(-Math.PI / 2); glow.translate(x, y + .032, z); pools.push(glow);
  }
  const plant = (x: number, z: number, radius: number, height: number, color: number, dense: boolean) => {
    const y = groundHeight(x, z);
    shrubs.push(item(x, y + height, z, radius, height, radius, dense ? 0x507b38 : 0x2f6339));
    // The ellipsoid starts at the soil; no free-floating balls remain in the sky.
    shell(x, y + height, z, radius * 1.025, height * .99, radius * 1.025, color, dense ? 490 : 195);
    if (dense) { const glow = tint(new THREE.PlaneGeometry(radius * 3, radius * 3), color); glow.rotateX(-Math.PI / 2); glow.translate(x, y + .03, z); pools.push(glow); }
  };
  // The side-facing photo ornaments now have a layered, planted backdrop rather
  // than an empty dark strip. Keep the two-metre posing disks untouched.
  for (const [zoneIndex, zone] of SECRET_GARDEN_ZONES.entries()) {
    const side = zone.x > spine ? 1 : -1;
    for (let k = 0; k < 7; k++) {
      const x = zone.x + side * (3.5 + (k % 2) * .6), z = zone.z - 2.5 + k * .82;
      plant(x, z, .53 + (k % 3) * .12, .6 + (k % 3) * .28, colors[(zoneIndex * 2 + k) % colors.length], k % 2 === 0);
    }
  }
  // Dense low mounds alternate with sparse taller bushes and flowers, retaining
  // the individual bulbs and colour instead of filling every shape with white.
  for (let i = 0, placed = 0; i < 600 && placed < 65; i++) {
    const x = SECRET_GARDEN.minX + 1.6 + rand() * (SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 3.2), z = 85.5 + rand() * 26;
    if (pathDistance(x, z) < 2.25 || SECRET_GARDEN_ZONES.some(p => Math.hypot(x - p.x, z - p.z) < p.radius + .7)
      || treeSites.some(p => Math.hypot(x - p[0], z - p[1]) < 1.9)) continue;
    const radius = .45 + rand() * .48, height = radius * (.8 + rand() * .9);
    plant(x, z, radius, height, colors[placed % colors.length], placed % 3 === 0);
    placed++;
  }
  // Flower banks behind the three bays and along both wings fill the new width.
  for (let i = 0; i < 1800; i++) {
    const x = SECRET_GARDEN.minX + 1.3 + rand() * (SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 2.6), z = 85 + rand() * 27;
    if (pathDistance(x, z) < 1.72 || SECRET_GARDEN_ZONES.some(p => Math.hypot(x - p.x, z - p.z) < p.radius + .2)) continue;
    const y = groundHeight(x, z), h = .12 + rand() * .32;
    const color = colors[Math.floor(z / 3 + x / 4 + 80) % colors.length];
    for (let j = 0; j < 4; j++) bulb(x, y + h * (j + 1) / 4, z, color, j === 3 ? .5 : .26);
  }
  for (let i = 0; i < 210; i++) {
    const x = SECRET_GARDEN.minX + 1.6 + rand() * (SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 3.2), z = 85.2 + rand() * 26.5;
    if (pathDistance(x, z) < 1.85 || SECRET_GARDEN_ZONES.some(p => Math.hypot(x - p.x, z - p.z) < p.radius + .2)) continue;
    const y = groundHeight(x, z), h = .3 + rand() * .4, color = colors[i % colors.length];
    branch(wood, new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h, z), .012, 0x54833a);
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * Math.PI * 2, px = x + Math.cos(a) * .13, pz = z + Math.sin(a) * .13;
      petals.push(item(px, y + h, pz, .115, .045, .115, color)); bulb(px, y + h + .05, pz, color, .55);
    }
    bulb(x, y + h + .06, z, colors[3], .7);
  }

  // Small coloured motifs sit directly on the inward face of the tall screens.
  // Their high placement fills the side backdrops while the central sky stays open.
  const wallMotifs: { x: number; z: number; height: number; radius: number; side: boolean; heart: boolean; color: number }[] = [];
  for (const [sideIndex, x] of [west + 1.55, east - 1.55].entries()) for (let i = 0; i < 5; i++) {
    wallMotifs.push({ x, z: 88.2 + i * 4.7, height: 5.2 + (i % 3) * 1.5, radius: .68 + (i % 2) * .25,
      side: true, heart: i % 2 === 0, color: colors[(i + sideIndex * 2) % colors.length] });
  }
  for (const [i, x] of [-50.2, -45.8, -31, -25.4].entries()) wallMotifs.push({ x, z: 112.4,
    height: 7.2 + (i % 2) * 1.6, radius: .67, side: false, heart: i % 2 === 0, color: colors[(i + 1) % colors.length] });
  root.userData.wallMotifs = wallMotifs;
  for (const motif of wallMotifs) {
    const y = groundHeight(motif.x, motif.z), points: THREE.Vector3[] = [];
    const sampleCount = motif.heart ? 96 : 10;
    for (let k = 0; k < sampleCount; k++) {
      const a = k / sampleCount * Math.PI * 2;
      const r = motif.radius * (k % 2 ? .43 : 1);
      const across = motif.heart ? motif.radius * Math.pow(Math.sin(a), 3) : Math.cos(a + Math.PI / 2) * r;
      const height = motif.heart ? motif.radius * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 : Math.sin(a + Math.PI / 2) * r;
      points.push(new THREE.Vector3(motif.x + (motif.side ? 0 : across), y + motif.height + height, motif.z + (motif.side ? across : 0)));
    }
    for (let k = 0; k < points.length; k++) lineLights(points[k], points[(k + 1) % points.length], motif.color, .04);
  }

  const outline = (points: THREE.Vector3[], color: number, closed = false) => {
    const curve = new THREE.CatmullRomCurve3(points, closed), steps = Math.max(32, points.length * 2);
    wires.push(tint(new THREE.TubeGeometry(curve, steps, .024, 4, closed), color));
    for (const p of curve.getSpacedPoints(Math.ceil(curve.getLength() / .09))) bulb(p.x, p.y, p.z, color, 1.08);
  };
  for (const zone of SECRET_GARDEN_ZONES) {
    const y = groundHeight(zone.x, zone.z), back = zone.x > SECRET_GARDEN.spineX ? 1.55 : -1.55;
    // The ornament lies along the outside edge and faces the central promenade.
    const point = (side: number, height: number) => new THREE.Vector3(zone.x + back, y + height, zone.z + side);
    if (zone.id === "moon") {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 44; i++) { const a = .7 + i / 44 * (Math.PI * 2 - 1.4); points.push(point(Math.cos(a) * 1.55, 2.1 + Math.sin(a) * 1.55)); }
      for (let i = 1; i < 28; i++) { const t = i / 28; points.push(point(Math.cos(.7) * 1.55 - Math.sin(t * Math.PI) * 1.22, 2.1 - Math.sin(.7) * 1.55 + 2 * Math.sin(.7) * 1.55 * t)); }
      outline(points, colors[4], true);
      for (let i = 0; i < 3; i++) outline(Array.from({ length: 10 }, (_, k) => {
        const a = Math.PI / 2 + k / 10 * Math.PI * 2, r = .25 * (k % 2 ? .43 : 1);
        return point(.8 + i * .35 + Math.cos(a) * r, 3.9 - i * .7 + Math.sin(a) * r);
      }), colors[i], true);
    } else if (zone.id === "blossom") {
      outline(Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return point(1.7 * Math.pow(Math.sin(a), 3), 2.2 + 1.7 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16); }), colors[2], true);
      for (const side of [-1, 1]) {
        const x = zone.x + back, z = zone.z + side * 1.8;
        leaves.push(item(x, y + .5, z, .5, .5, .5, 0x427c46)); shell(x, y + .5, z, .53, .53, .53, colors[2], 110);
      }
    } else {
      outline(Array.from({ length: 48 }, (_, i) => { const a = i / 47 * Math.PI; return point(Math.cos(a) * 1.85, .2 + Math.sin(a) * 3.7); }), colors[3]);
      for (let i = 0; i < 7; i++) {
        const side = -.95 + i * .32, height = 2.9 + Math.sin(i * 1.5) * .3, p = point(side, height);
        lineLights(point(side, 3.3 + (1 - Math.abs(side)) * .3), p, colors[4], .12);
        const r = .12 + (i % 3) * .035;
        outline(Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + k / 10 * Math.PI * 2; return point(side + Math.cos(a) * r * (k % 2 ? .43 : 1), height + Math.sin(a) * r * (k % 2 ? .43 : 1)); }), colors[4], true);
      }
    }
    const pool = tint(new THREE.PlaneGeometry(5.2, 5.2), colors[zone.id === "moon" ? 1 : zone.id === "blossom" ? 2 : 3]);
    pool.rotateX(-Math.PI / 2); pool.translate(zone.x, y + .035, zone.z); pools.push(pool);
  }

  const natural = owned(new THREE.MeshStandardMaterial({ roughness: .95 }));
  const foliage = owned(new THREE.MeshStandardMaterial({ roughness: 1 }));
  const boundary = owned(new THREE.MeshStandardMaterial({ roughness: 1 }));
  const bambooMaterial = owned(new THREE.MeshStandardMaterial({ roughness: .92 }));
  bambooMaterial.onBeforeCompile = shader => {
    shader.vertexShader = "varying float vCulmHeight;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvCulmHeight=(instanceMatrix*vec4(position,1.)).y;");
    shader.fragmentShader = "varying float vCulmHeight;\n" + shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nfloat nodeLine=1.-smoothstep(.018,.052,abs(fract(vCulmHeight/.72)-.5));diffuseColor.rgb*=1.-nodeLine*.3;");
  };
  bambooMaterial.customProgramCacheKey = () => "secret-garden-bamboo-nodes-v1";
  batch("secret-garden-branches", wood, new THREE.CylinderGeometry(1, 1, 1, 6), natural);
  const crowns = batch("secret-garden-tree-crowns", leaves, sphere(10, 7), foliage);
  const topiary = batch("secret-garden-topiary", shrubs, sphere(10, 7), foliage);
  batch("secret-garden-flowers", petals, sphere(6, 4), natural);
  batch("secret-garden-stone-border", stones, new THREE.DodecahedronGeometry(1, 0), natural);
  batch("secret-garden-opaque-backing", hedge, new THREE.BoxGeometry(1, 1, 1), boundary);
  batch("secret-garden-bamboo-screen", stalks, new THREE.CylinderGeometry(.8, 1, 1, 6), bambooMaterial);
  batch("secret-garden-bamboo-leaves", hedgeLeaves, sphere(8, 6), boundary);
  merge("secret-garden-stepping-stones", paving, owned(new THREE.MeshStandardMaterial({ color: 0x737565, roughness: 1 })));
  const wireMaterial = owned(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x777777, toneMapped: false }));
  merge("secret-garden-sculpture-frames", wires, wireMaterial);

  const night = { value: 0 }, reveal = { value: 0 }, pointLimit = { value: 11 };
  const washMaterial = owned(new THREE.ShaderMaterial({
    uniforms: { uNight: night, uReveal: reveal }, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vUv; varying vec3 vColor; void main(){vUv=uv;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec2 vUv; varying vec3 vColor; uniform float uNight; uniform float uReveal; void main(){float a=pow(max(0.,1.-length((vUv-.5)*2.)),2.)*.22*uNight*uReveal;gl_FragColor=vec4(vColor,a);\n#include <colorspace_fragment>\n}",
  }));
  const wash = merge("secret-garden-soft-ground-glow", pools, washMaterial); wash.renderOrder = 2;
  // Shuffle once: reducing drawRange keeps every tree and photo zone represented on phones.
  for (let i = bulbs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bulbs[i], bulbs[j]] = [bulbs[j], bulbs[i]]; }
  const bulbCount = bulbs.length;
  const positions = new Float32Array(bulbCount * 3), shades = new Float32Array(bulbCount * 3), details = new Float32Array(bulbCount * 2);
  bulbs.forEach((p, i) => { positions.set([p.x, p.y, p.z], i * 3); new THREE.Color(p.color).toArray(shades, i * 3); details.set([p.size, p.phase], i * 2); });
  bulbs.length = 0;
  const pointGeometry = new THREE.BufferGeometry(); geometries.add(pointGeometry);
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); pointGeometry.setAttribute("color", new THREE.BufferAttribute(shades, 3)); pointGeometry.setAttribute("aDetail", new THREE.BufferAttribute(details, 2)); pointGeometry.computeBoundingSphere();
  const pointMaterial = owned(new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform, uNight: night, uReveal: reveal, uPointLimit: pointLimit }, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 aDetail; varying vec3 vColor; varying float vShine; uniform float uTime; uniform float uPointLimit;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);p.z+=.02;vColor=color;vShine=.94+.06*sin(uTime*.6+aDetail.y);gl_PointSize=clamp(aDetail.x*88./max(1.,-p.z),1.8,uPointLimit);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec3 vColor; varying float vShine; uniform float uNight; uniform float uReveal;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;float halo=pow(1.-r,1.5);float core=1.-smoothstep(.02,.32,r);gl_FragColor=vec4(vColor*(2.1+core*.8)+vec3(core*.09),(halo*.7+core*.85)*vShine*uNight*uReveal);
      #include <colorspace_fragment>
      }`,
  }));
  const lights = new THREE.Points(pointGeometry, pointMaterial); lights.name = "secret-garden-fairy-bulbs"; lights.renderOrder = 3; lights.visible = false; root.add(lights);
  // A few living lights drift between the plants. Their slow, staggered glow is
  // independent of the decorative LEDs and adds no per-frame CPU simulation.
  const fireflyCount = 84, fireflyPositions = new Float32Array(fireflyCount * 3), flights = new Float32Array(fireflyCount * 4);
  for (let i = 0; i < fireflyCount; i++) {
    const x = SECRET_GARDEN.minX + 2 + rand() * (SECRET_GARDEN.maxX - SECRET_GARDEN.minX - 4);
    const z = SECRET_GARDEN.minZ + 2 + rand() * (SECRET_GARDEN.maxZ - SECRET_GARDEN.minZ - 4);
    fireflyPositions.set([x, groundHeight(x, z) + .85 + rand() * 1.15, z], i * 3);
    flights.set([rand() * Math.PI * 2, 1.26 + rand() * 1.25, rand() * Math.PI * 2, .3 + rand() * .22], i * 4);
  }
  const fireflyGeometry = new THREE.BufferGeometry(); geometries.add(fireflyGeometry);
  fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
  fireflyGeometry.setAttribute("aFlight", new THREE.BufferAttribute(flights, 4));
  fireflyGeometry.computeBoundingSphere(); fireflyGeometry.boundingSphere!.radius += 1;
  const fireflyLimit = { value: 6 };
  const fireflyMaterial = owned(new THREE.ShaderMaterial({
    uniforms: { uTime: timeUniform, uNight: night, uReveal: reveal, uFireflyLimit: fireflyLimit },
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aFlight;uniform float uTime;uniform float uFireflyLimit;varying float vGlow;varying float vWarm;
      void main(){vec3 p=position;float t=uTime*.18;
        p.x+=sin(t+aFlight.x)*.65;p.z+=cos(t*.76+aFlight.z)*.65;p.y+=sin(t*1.35+aFlight.x+aFlight.z)*.3;
        vGlow=pow(.5+.5*sin(uTime*aFlight.y+aFlight.x),2.);vWarm=.5+.5*sin(aFlight.z);
        vec4 view=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(aFlight.w*95./max(1.,-view.z),2.,uFireflyLimit);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float uNight;uniform float uReveal;varying float vGlow;varying float vWarm;
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float glow=pow(1.-r,2.);float core=1.-smoothstep(.0,.28,r);
        vec3 color=mix(vec3(.72,1.,.27),vec3(1.,.83,.3),vWarm);gl_FragColor=vec4(color*(1.2+core),glow*vGlow*.82*uNight*uReveal);
        #include <colorspace_fragment>
      }`,
  }));
  const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
  fireflies.name = "secret-garden-fireflies"; fireflies.renderOrder = 4; fireflies.visible = false; root.add(fireflies);
  wash.visible = false;
  let previousTime: number | null = null;
  return {
    root,
    applyDaylight(d: Daylight) { if (!disposed) night.value = THREE.MathUtils.clamp(d.lanterns, 0, 1); },
    update(time: number, viewer: { x: number; z: number }) {
      if (disposed || !Number.isFinite(time) || !Number.isFinite(viewer.x) || !Number.isFinite(viewer.z)) return;
      const dt = previousTime === null ? 0 : Math.min(.2, Math.max(0, time - previousTime)); previousTime = time; timeUniform.value = time;
      const inside = insideSecretGarden(viewer.x, viewer.z) && viewer.z > 84.6;
      const target = inside ? 1 : 0;
      // Outside the enclosure lights are off immediately, so moving a camera behind
      // the pavilion cannot reveal the surprise through a leaf or render-LOD gap.
      reveal.value = inside ? THREE.MathUtils.lerp(reveal.value, target, 1 - Math.exp(-dt / .65)) : 0;
      wireMaterial.color.setScalar(.35 + night.value * reveal.value * 1.15);
      boundary.color.setScalar(1 - night.value * reveal.value * .55);
      bambooMaterial.color.setScalar(1 - night.value * reveal.value * .35);
      foliage.color.setScalar(1 - night.value * reveal.value * .3);
      // At night the complete surface is drawn by densely packed light points,
      // letting back-facing lights give each tree real volume without dark blobs.
      crowns.visible = topiary.visible = night.value * reveal.value < .42;
      lights.visible = wash.visible = fireflies.visible = night.value * reveal.value > .002;
      const dx = Math.max(SECRET_GARDEN.minX - viewer.x, 0, viewer.x - SECRET_GARDEN.maxX);
      const dz = Math.max(77.5 - viewer.z, 0, viewer.z - SECRET_GARDEN.maxZ);
      root.visible = Math.hypot(dx, dz) < 56;
    },
    setQuality(low: boolean) { if (!disposed) {
      pointGeometry.setDrawRange(0, low ? Math.ceil(bulbCount * .7) : bulbCount); pointLimit.value = low ? 8 : 11;
      fireflyGeometry.setDrawRange(0, low ? fireflyCount / 2 : fireflyCount); fireflyLimit.value = low ? 4 : 6;
    } },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
      for (const mesh of instances) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
