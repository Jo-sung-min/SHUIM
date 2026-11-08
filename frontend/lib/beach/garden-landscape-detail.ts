import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { nearestOnTrail, seededRandom, TRAIL_WALK_HALF } from "./bamboo-trail";
import {
  BOAT_STOPS, GARDEN_LANTERNS, GARDEN_POLYLINES, GARDEN_POND_BENCHES, GARDEN_WILLOWS, GROUND_Y, LAKE,
  insideHall, lakeRadiusAt, lakeSigned, onBridge, onPier,
} from "./garden-layout";

interface DetailSite {
  x: number; z: number; yaw: number; scale: number; seed: number;
  kind: "rock" | "grass" | "flower";
}

/** Deliberate small planting beds, clear of all existing paths, piers and boarding positions. */
export function gardenDetailSites(mobile: boolean): DetailSite[] {
  const rand = seededRandom(9321), sites: DetailSite[] = [];
  const clusters = [-2.66, -2.28, -1.86, -1.22, -0.76, -0.25, 0.38, 2.4].map(angle => {
    const radius = lakeRadiusAt(angle) + 1.25;
    return { x: LAKE.x + Math.cos(angle) * radius, z: LAKE.z + Math.sin(angle) * radius, radius: 2.1 };
  });
  GARDEN_WILLOWS.forEach((tree, i) => {
    if (i % 3 === 0) clusters.push({ x: tree.x, z: tree.z, radius: 1.9 });
  });
  const clear = (x: number, z: number, radius: number) => {
    if (lakeSigned(x, z) < Math.max(0.45, radius * 0.7) || insideHall(x, z, 3)) return false;
    if (nearestOnTrail(x, z, GARDEN_POLYLINES).distance <= TRAIL_WALK_HALF + radius + 0.3) return false;
    if (onPier(x, z, radius + 0.6) || onBridge(x, z, radius + 0.6)) return false;
    if (BOAT_STOPS.some(stop => Math.hypot(stop.x - x, stop.z - z) < 4.2 + radius)) return false;
    if (GARDEN_LANTERNS.some(lamp => Math.hypot(lamp.x - x, lamp.z - z) < 0.6 + radius)) return false;
    if (GARDEN_POND_BENCHES.some(bench => {
      const dx = x - bench.x, dz = z - bench.z;
      const across = Math.abs(-dx * bench.fz + dz * bench.fx);
      const along = Math.abs(dx * bench.fx + dz * bench.fz);
      return across < 1.65 + radius && along < .65 + radius;
    })) return false;
    return !GARDEN_WILLOWS.some(tree => Math.hypot(tree.x - x, tree.z - z) < 0.4 + radius);
  };
  for (const cluster of clusters) {
    for (let i = 0; i < 27; i++) {
      const a = rand() * Math.PI * 2, distance = Math.sqrt(rand()) * cluster.radius;
      const x = cluster.x + Math.cos(a) * distance, z = cluster.z + Math.sin(a) * distance;
      const kind = i < 4 ? "rock" : i % 4 === 0 ? "flower" : "grass";
      const scale = kind === "rock" ? 0.36 + rand() * 0.58 : 0.72 + rand() * 0.46;
      const radius = kind === "rock" ? scale * 0.95 : 0.18;
      const yaw = rand() * Math.PI * 2, seed = rand();
      if (mobile && kind !== "rock" && i % 3 === 1) continue;
      if (!clear(x, z, radius)) continue;
      if (kind === "rock" && sites.some(site => site.kind === "rock" && Math.hypot(site.x - x, site.z - z) < (site.scale + scale) * 0.85)) continue;
      sites.push({ x, z, yaw, scale, seed, kind });
    }
  }
  return sites;
}

function painted(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count, colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // Only position, normal and color are needed by these solid natural materials.
  geometry.deleteAttribute("uv");
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

function pebbleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const p = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), colors = new Float32Array(p.count * 3);
  const rock = new THREE.Color(0x909b8c), moss = new THREE.Color(0x687e49), wet = new THREE.Color(0x59675b), color = new THREE.Color();
  const normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const weathering = 1 + 0.055 * Math.sin(x * 7.1 + z * 3.8) * Math.cos(y * 5.3 - x * 2.4);
    p.setXYZ(i, x * weathering, y * weathering * 0.43, z * weathering * 0.76);
    normal.set(x, y / 0.43, z / 0.76).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    const patch = Math.max(0, y) * (0.38 + 0.45 * Math.sin(x * 7 + z * 4) ** 2);
    color.copy(rock).lerp(moss, patch).lerp(wet, Math.max(0, -y) * 0.5).multiplyScalar(0.95 + weathering * 0.05);
    color.toArray(colors, i * 3);
  }
  geometry.deleteAttribute("uv");
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Curved blades stay low; all the tufts share one material batch. */
function grassGeometry(): THREE.BufferGeometry {
  const rand = seededRandom(39), positions: number[] = [], colors: number[] = [];
  const base = new THREE.Color(0x526f3e), tip = new THREE.Color(0xa2b57c), color = new THREE.Color();
  const vertex = (x: number, y: number, z: number, t: number) => {
    positions.push(x, y, z); color.copy(base).lerp(tip, t * 0.65).toArray(colors, colors.length);
  };
  for (let blade = 0; blade < 7; blade++) {
    const a = rand() * Math.PI * 2, h = 0.2 + rand() * 0.22, bend = 0.06 + rand() * 0.12;
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const forward = new THREE.Vector3(-side.z, 0, side.x);
    for (let step = 0; step < 3; step++) {
      const points: [number, number, number, number][] = [];
      for (const t of [step / 3, (step + 1) / 3]) {
        const w = (1 - t) * 0.024 + 0.001, lean = bend * t * t;
        for (const direction of [-1, 1]) points.push([
          forward.x * lean + side.x * w * direction, h * t,
          forward.z * lean + side.z * w * direction, t,
        ]);
      }
      for (const index of [0, 2, 1, 1, 2, 3]) vertex(...points[index]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildGardenLandscapeDetail(scene: THREE.Object3D, mobile: boolean): { dispose(): void } {
  const root = new THREE.Group(); root.name = "garden-landscape-detail"; scene.add(root);
  const rock = pebbleGeometry(), grass = grassGeometry();
  const stemBase = new THREE.CylinderGeometry(0.008, 0.013, 0.34, 5); stemBase.translate(0, 0.17, 0);
  const stem = painted(stemBase, new THREE.Color(0x69844e));
  if (stem !== stemBase) stemBase.dispose();
  const petalBase = new THREE.SphereGeometry(1, 6, 4);
  const petal = painted(petalBase, new THREE.Color(0xffffff));
  if (petal !== petalBase) petalBase.dispose();
  const materials = [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
  ];
  const batches: THREE.BufferGeometry[][] = [[], [], []];
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const place = (batch: number, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tint?: THREE.Color) => {
    const piece = geometry.clone();
    matrix.compose(position.set(x, y, z), rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), scale.set(sx, sy, sz));
    piece.applyMatrix4(matrix);
    if (tint) {
      const colors = piece.getAttribute("color");
      for (let i = 0; i < colors.count; i++) colors.setXYZ(i, tint.r, tint.g, tint.b);
    }
    batches[batch].push(piece);
  };
  const ivory = new THREE.Color(0xeee8d9), blush = new THREE.Color(0xe5bfc2), pollen = new THREE.Color(0xb8a66b);
  for (const site of gardenDetailSites(mobile)) {
    const { x, z, yaw, seed, scale: s } = site;
    if (site.kind === "rock") {
      place(0, rock, x, GROUND_Y + s * 0.12, z, s, s, s, yaw);
      continue;
    }
    place(1, grass, x, GROUND_Y - 0.018, z, s, s, s, yaw);
    if (site.kind !== "flower") continue;
    place(1, stem, x, GROUND_Y, z, s, s, s, yaw);
    const y = GROUND_Y + 0.34 * s, tint = seed < 0.72 ? ivory : blush;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + yaw;
      place(2, petal, x + Math.cos(a) * 0.037 * s, y, z + Math.sin(a) * 0.037 * s, 0.047 * s, 0.012 * s, 0.027 * s, -a, tint);
    }
    place(2, petal, x, y + 0.011 * s, z, 0.018 * s, 0.012 * s, 0.018 * s, 0, pollen);
  }
  const names = ["moss-stones", "soft-grass", "spring-flowers"], merged: THREE.BufferGeometry[] = [];
  batches.forEach((pieces, index) => {
    if (!pieces.length) return;
    const geometry = mergeGeometries(pieces, false)!;
    geometry.computeBoundingSphere(); merged.push(geometry);
    for (const piece of pieces) piece.dispose();
    const mesh = new THREE.Mesh(geometry, materials[index]);
    mesh.name = `garden-${names[index]}`; mesh.layers.enable(2);
    root.add(mesh);
  });
  rock.dispose(); grass.dispose(); stem.dispose(); petal.dispose();
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent(); root.clear();
      for (const geometry of merged) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
