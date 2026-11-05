import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import {
  BAMBOO_PAVILIONS, DECK_BENCH_HEIGHT, DECK_HALF_X, DECK_HALF_Z, DECK_RISE, PAVILION_EAVE, PAVILION_HALF, PAVILION_POST_HEIGHT,
  PAVILION_RISE, PAVILION_STEP_LENGTH, type PavilionKind,
} from "./bamboo-trail";

/** 기와 무늬: 수키와(볼록한 줄)와 암키와 골이 번갈아 가는 줄을 캔버스로 그린다 (외부 이미지 없음). */
export function roofTileTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 256, canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3a4452"; ctx.fillRect(0, 0, size, size);
  const tile = 32, rows = size / tile;
  for (let row = 0; row < rows; row++) {
    const y = row * tile, offset = row % 2 ? tile / 2 : 0;
    for (let x = -tile; x < size + tile; x += tile) {
      const gradient = ctx.createLinearGradient(x + offset, 0, x + offset + tile, 0);
      gradient.addColorStop(0, "#2a313c"); gradient.addColorStop(0.35, "#6b7787");
      gradient.addColorStop(0.55, "#7d8a9a"); gradient.addColorStop(1, "#2a313c");
      ctx.fillStyle = gradient; ctx.fillRect(x + offset, y, tile, tile);
    }
    ctx.fillStyle = "#1f252d"; ctx.fillRect(0, y + tile - 5, size, 5);
    ctx.fillStyle = "#8d99a8"; ctx.globalAlpha = 0.55; ctx.fillRect(0, y + tile - 6, size, 1); ctx.globalAlpha = 1;
    for (let x = 0; x < size; x += tile) {
      ctx.fillStyle = "#525d6b"; ctx.beginPath();
      ctx.arc(x + offset + tile / 2, y + tile - 6, 7, Math.PI, 0); ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Square hip roof with eaves lifting toward each corner and a gently concave slope. */
function hipRoofGeometry(thickness = 0): THREE.BufferGeometry {
  const half = PAVILION_HALF + PAVILION_EAVE, rise = 1.55, lift = 0.42, sag = 0.3;
  const nu = 10, nv = 5;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
    const first = positions.length / 3;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu * 2 - 1;
        const ex = half * u, ez = half, ey = lift * Math.pow(Math.abs(u), 2.4);
        const x = ex * (1 - v), z = ez * (1 - v);
        const y = ey + (rise - ey) * v - sag * Math.sin(v * Math.PI) * (1 - Math.abs(u) * 0.35) - thickness;
        positions.push(x * c - z * s, y, x * s + z * c);
        uvs.push((u + 1) * 5, v * 3);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = first + j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hipRidgeGeometry(): THREE.BufferGeometry {
  const half = PAVILION_HALF + PAVILION_EAVE, rise = 1.55, lift = 0.42, sag = 0.3;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const v = i / 10;
    points.push(new THREE.Vector3(half * (1 - v), lift + (rise - lift) * v - sag * Math.sin(v * Math.PI) * 0.65 + 0.05, half * (1 - v)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 6, 0.09, 4, false);
}

export interface BambooPavilionSet {
  root: THREE.Group;
  applyDaylight(d: Daylight): void;
  dispose(): void;
}

/**
 * Four identical pavilions and one summit deck: a template per kind is merged per material, then instanced,
 * so the whole set costs about a dozen draws. Local y is relative to the flattened ground at each site. Textures are injected by the engine.
 */
export function buildBambooPavilions(scene: THREE.Scene, textures: { wood: THREE.Texture }): BambooPavilionSet {
  const root = new THREE.Group(); root.name = "bamboo-pavilions"; scene.add(root);
  let disposed = false;
  const tiles = roofTileTexture();
  const wood = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xb98f63, roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x6e4f33, roughness: 0.9 });
  const floorWood = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xc9a06f, roughness: 0.8 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8b82, roughness: 1 });
  const tile = new THREE.MeshStandardMaterial({ map: tiles, color: 0xc4ccd6, roughness: 0.82 });
  // The underside and plaque are seen from inside the pavilion in third person: keep them readable, not black.
  const underside = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.95, side: THREE.BackSide });
  const ridge = new THREE.MeshStandardMaterial({ color: 0x323a45, roughness: 0.75 });
  const paper = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const plaque = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x5a4332, roughness: 0.7 });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const footing = new THREE.CylinderGeometry(0.27, 0.31, 1, 8, 1);
  const roof = hipRoofGeometry();
  const roofUnder = hipRoofGeometry(0.1);
  const hip = hipRidgeGeometry();
  const knob = new THREE.SphereGeometry(0.16, 10, 8);
  const lantern = new THREE.CylinderGeometry(0.15, 0.13, 0.36, 10, 1);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const meshes: THREE.InstancedMesh[] = [], merged: THREE.BufferGeometry[] = [];

  const buildKind = (kind: PavilionKind) => {
    // One template in site-local space, grouped by material. A Y rotation by the site yaw maps local -Z onto the
    // facing vector, hence -lz for the entrance-positive coordinates used by the layout tables.
    const templates = new Map<THREE.Material, { name: string; parts: THREE.BufferGeometry[] }>();
    const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
      lx: number, y: number, lz: number, sx: number, sy: number, sz: number, ry = 0) => {
      const piece = geometry.clone();
      matrix.compose(new THREE.Vector3(lx, y, -lz), quaternion.setFromEuler(euler.set(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
      piece.applyMatrix4(matrix);
      if (!templates.has(material)) templates.set(material, { name, parts: [] });
      templates.get(material)!.parts.push(piece);
    };
    if (kind === "pavilion") {
      const floorY = PAVILION_RISE, postTop = floorY + PAVILION_POST_HEIGHT, half = PAVILION_HALF;
      part("deck", box, floorWood, 0, floorY - 0.08, 0, half * 2, 0.16, half * 2);
      part("trim", box, darkWood, 0, floorY - 0.2, 0, half * 2 + 0.1, 0.12, half * 2 + 0.1);
      for (const [lx, lz] of [[-2.15, -2.15], [2.15, -2.15], [-2.15, 2.15], [2.15, 2.15], [-2.15, 0], [2.15, 0]]) {
        part("stone", footing, stone, lx, 0.2, lz, 1, 0.42, 1);
        part("wood", cylinder, wood, lx, floorY + PAVILION_POST_HEIGHT / 2, lz, 0.14, PAVILION_POST_HEIGHT, 0.14);
      }
      for (const side of [-1, 1]) {
        part("wood", box, wood, 0, postTop + 0.11, side * 2.15, half * 2 + 0.6, 0.22, 0.2);
        part("wood", box, wood, side * 2.15, postTop + 0.11, 0, 0.2, 0.22, half * 2 + 0.6);
      }
      part("roof", roof, tile, 0, postTop + 0.22, 0, 1, 1, 1);
      part("roof-underside", roofUnder, underside, 0, postTop + 0.22, 0, 0.985, 1, 0.985);
      for (let k = 0; k < 4; k++) part("ridge", hip, ridge, 0, postTop + 0.22, 0, 1, 1, 1, k * Math.PI / 2);
      part("ridge", knob, ridge, 0, postTop + 0.22 + 1.62, 0, 1, 1.3, 1);
      // Back railing: the only edge where nobody sits.
      for (const y of [0.45, 0.82]) part("wood", box, wood, 0, floorY + y, -half, half * 2, 0.07, 0.07);
      for (const lx of [-2.0, -1.0, 0, 1.0, 2.0]) part("wood", box, wood, lx, floorY + 0.45, -half, 0.06, 0.82, 0.06);
      part("stone", box, stone, 0, 0.31, half + 0.3, 1.5, 0.18, 0.6);
      part("stone", box, stone, 0, 0.11, half + 0.3 + PAVILION_STEP_LENGTH / 2, 1.5, 0.18, 0.6);
      part("plaque", box, plaque, 0, postTop - 0.26, half + 0.08, 1.1, 0.34, 0.06);
      for (const lx of [-1.9, 1.9]) {
        part("trim", cylinder, darkWood, lx, postTop - 0.17, 2.3, 0.012, 0.3, 0.012);
        part("paper-lanterns", lantern, paper, lx, postTop - 0.5, 2.3, 1, 1, 1);
      }
    } else {
      // Summit deck: a wide platform, railed on the view side and both ends, a long bench facing the city,
      // steps on the opposite side and two lamp posts at the railing corners.
      const floorY = DECK_RISE, hx = DECK_HALF_X, hz = DECK_HALF_Z;
      part("deck", box, floorWood, 0, floorY - 0.08, 0, hx * 2, 0.16, hz * 2);
      part("trim", box, darkWood, 0, floorY - 0.2, 0, hx * 2 + 0.1, 0.12, hz * 2 + 0.1);
      for (const lx of [-4.2, -2.1, 0, 2.1, 4.2]) for (const lz of [-2.3, 2.3]) part("stone", footing, stone, lx, 0.2, lz, 0.9, 0.42, 0.9);
      const railY = [0.5, 1.0];
      for (const y of railY) {
        part("wood", box, wood, 0, floorY + y, hz, hx * 2, 0.07, 0.07);
        for (const side of [-1, 1]) part("wood", box, wood, side * hx, floorY + y, 0, 0.07, 0.07, hz * 2);
      }
      for (let i = 0; i <= 6; i++) part("wood", box, wood, -hx + i * hx * 2 / 6, floorY + 0.52, hz, 0.08, 1.04, 0.08);
      for (const side of [-1, 1]) for (const lz of [-hz + 0.9, 0, hz - 0.9]) part("wood", box, wood, side * hx, floorY + 0.52, lz, 0.08, 1.04, 0.08);
      part("wood", box, wood, 0, floorY + DECK_BENCH_HEIGHT - 0.04, 2.2, hx * 2 - 0.6, 0.08, 0.5);
      for (const lx of [-3.9, -1.3, 1.3, 3.9]) part("trim", box, darkWood, lx, floorY + DECK_BENCH_HEIGHT / 2 - 0.04, 2.2, 0.1, DECK_BENCH_HEIGHT - 0.08, 0.42);
      part("stone", box, stone, 0, 0.36, -(hz + 0.3), 1.5, 0.18, 0.6);
      part("stone", box, stone, 0, 0.14, -(hz + 0.3 + PAVILION_STEP_LENGTH / 2), 1.5, 0.18, 0.6);
      for (const lx of [-4.3, 4.3]) {
        part("wood", cylinder, wood, lx, floorY + 1.15, 2.5, 0.07, 2.3, 0.07);
        part("trim", box, darkWood, lx, floorY + 2.3, 2.5, 0.5, 0.05, 0.5);
        part("paper-lanterns", lantern, paper, lx, floorY + 2.0, 2.5, 1.15, 1.15, 1.15);
      }
    }
    const sites = BAMBOO_PAVILIONS.filter((p) => p.kind === kind);
    const transform = new THREE.Object3D();
    for (const [material, template] of templates) {
      const geometry = mergeGeometries(template.parts, false)!;
      for (const piece of template.parts) piece.dispose();
      merged.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, material, sites.length);
      mesh.name = `bamboo-${kind}-${template.name}`;
      sites.forEach((site, index) => {
        transform.position.set(site.x, site.groundY, site.z); transform.scale.set(1, 1, 1); transform.rotation.set(0, site.yaw, 0);
        transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh); meshes.push(mesh);
    }
  };
  buildKind("pavilion");
  buildKind("deck");
  const warm = new THREE.Color(0xffc27a), dim = new THREE.Color(0xe9dcc8);
  return { root, applyDaylight(d) {
    if (disposed) return;
    const night = THREE.MathUtils.clamp(d.lanterns, 0, 1);
    paper.color.copy(dim).lerp(warm, night);
  }, dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes) mesh.dispose();
    root.removeFromParent(); root.clear();
    for (const geometry of [box, cylinder, footing, roof, roofUnder, hip, knob, lantern, ...merged]) geometry.dispose();
    for (const material of [wood, darkWood, floorWood, stone, tile, underside, ridge, paper, plaque]) material.dispose();
    tiles.dispose();
  } };
}
