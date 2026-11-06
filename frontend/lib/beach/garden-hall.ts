import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import { hipRidgeGeometry, hipRoofGeometry, roofTileTexture } from "./bamboo-pavilions";
import { stoneLanternGeometry } from "./bamboo";
import { PAVILION_HALF, PAVILION_POST_HEIGHT, PAVILION_RISE, PAVILION_STEP_LENGTH } from "./bamboo-trail";
import {
  BRIDGE_Y, GARDEN_BRIDGE, GARDEN_LANTERNS, GARDEN_PAVILIONS, GARDEN_PIERS, GATE_WALL_Z, GROUND_Y, HALL, HALL_BENCH_HEIGHT, HALL_SEAT_LX, HALL_STAIR_HALF, HALL_STAIR_RUN,
  HALL_TIERS, PIER_Y, WATER_Y, gardenPavilionWorld, pierEnd,
} from "./garden-layout";
import { GARDEN_GLASS_FRAG, GARDEN_GLASS_VERT } from "./garden-shader";
import { latticeTexture, plasterTexture } from "./garden-ink";
import { BAMBOO_GLOW_FRAG, BAMBOO_GLOW_VERT } from "./bamboo-shader";

/** 3단 셀 음영: 먹그림의 평면적인 면 느낌. 모든 토운 재질이 같은 램프를 쓴다. */
export function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([96, 96, 96, 255, 168, 168, 168, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const srgb = (hex: number) => new THREE.Color(hex);

/** 직사각 팔작 느낌의 모임지붕: 처마는 모서리로 갈수록 들리고 면은 살짝 오목하다. */
function rectHipRoofGeometry(halfX: number, halfZ: number, rise: number, lift: number, sag: number, nx = 40, nz = 22): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = (i / nx * 2 - 1) * halfX, z = (j / nz * 2 - 1) * halfZ;
    const inset = Math.min(halfX - Math.abs(x), halfZ - Math.abs(z));
    const t = Math.min(1, inset / halfZ);
    const corner = Math.pow(Math.abs(x) / halfX, 2.4) * Math.pow(Math.abs(z) / halfZ, 2.4);
    const y = rise * t - sag * Math.sin(t * Math.PI) * (1 - corner * 0.5) + lift * corner * (1 - t);
    positions.push(x, y, z);
    uvs.push(i / nx * 14, j / nz * 7);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 현판: 캔버스에 글자를 써서 나무판에 붙인다 (시스템 글꼴, 외부 이미지 없음). */
function plaqueTexture(text: string): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2b2420"; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#8a6b3f"; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = "#e7d7a8"; ctx.font = "bold 92px 'Noto Serif KR', 'Nanum Myeongjo', serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface GardenStructures {
  root: THREE.Group;
  /** 밤에 켜지는 창·등: 0(낮)~1(밤) */
  applyDaylight(d: Daylight, rain: number): void;
  setRain(rain: number): void;
  setTime(time: number): void;
  setQuality(low: boolean): void;
  dispose(): void;
}

interface Part { geometry: THREE.BufferGeometry; material: THREE.Material; name: string }

/**
 * 청우헌·연향정·구곡교·잔교·남문·석등·샹들리에. 재질별로 지오메트리를 합쳐 드로우를 줄이고, 토운 재질로 먹그림처럼 평평하게 칠한다.
 * 반사 레이어(2)에 올려 물에 비치게 한다. 글자·등불은 밤에 따뜻하게 켜진다.
 */
export function buildGardenStructures(scene: THREE.Object3D, textures: { wood: THREE.Texture }, gradient: THREE.DataTexture, mobile: boolean): GardenStructures {
  const root = new THREE.Group(); root.name = "garden-structures"; scene.add(root);
  let disposed = false;
  const tiles = roofTileTexture(), plaster = plasterTexture(), lattice = latticeTexture();
  const toon = (color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...extra });
  const stone = toon(0x8d8a82), darkStone = toon(0x5f5e5a), plinth = toon(0x75736d);
  const wood = toon(0xa9865e, { map: textures.wood }), darkWood = toon(0x5a4030, { map: textures.wood }), floorWood = toon(0xc3a070, { map: textures.wood });
  const vermilion = toon(0x9c3a2a), tile = toon(0xb8c0ca, { map: tiles }), ridge = toon(0x323a45), frame = toon(0x2b2f36);
  const plasterMat = toon(0xf1ece2, { map: plaster }), underside = toon(0x7a5a40, { side: THREE.BackSide }), ceiling = toon(0x6b4f38);
  const latticeMat = new THREE.MeshBasicMaterial({ map: lattice, color: 0xe8dcc0, toneMapped: true });
  const paper = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const crystal = new THREE.MeshToonMaterial({ color: 0xf2f4f8, gradientMap: gradient, emissive: 0x000000, transparent: true, opacity: 0.92 });
  const brass = toon(0x6b5a3a);
  const plaque = new THREE.MeshBasicMaterial({ map: plaqueTexture("聽雨軒 · 청우헌"), toneMapped: true });
  const materials: THREE.Material[] = [stone, darkStone, plinth, wood, darkWood, floorWood, vermilion, tile, ridge, frame, plasterMat, underside, ceiling, latticeMat, paper, crystal, brass, plaque];
  const owned: THREE.BufferGeometry[] = [];
  const parts: Part[] = [];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  owned.push(box, cylinder);
  const place = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => {
    const piece = geometry.clone();
    matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    piece.applyMatrix4(matrix);
    parts.push({ geometry: piece, material, name });
  };

  /* ---------------- 청우헌 ---------------- */
  const hx = HALL.halfX, depth = HALL.backZ - HALL.glassZ, cz = (HALL.glassZ + HALL.backZ) / 2;
  const topTier = HALL_TIERS[HALL_TIERS.length - 1].y, eaveY = topTier + HALL.eave;
  place("plinth", box, plinth, HALL.x, -0.45, cz, hx * 2 + 1.4, 2.1, depth + 1.2);
  place("plinth-step", box, darkStone, HALL.x, 0.42, HALL.glassZ - 0.9, hx * 2 + 1.4, 0.25, 0.8);
  for (const tier of HALL_TIERS) {
    const from = HALL.glassZ + tier.from, to = HALL.glassZ + tier.to;
    place("floor", box, floorWood, HALL.x, tier.y - 0.12, (from + to) / 2, hx * 2, 0.24, to - from);
    place("floor-edge", box, darkWood, HALL.x, tier.y - 0.02, from + 0.06, hx * 2, 0.04, 0.12);
    // 벤치 두 줄과 낮은 책상: 가운데 계단은 비워 둔다.
    for (const side of [-1, 1]) {
      const x0 = side * (HALL_STAIR_HALF + 0.6), x1 = side * (hx - 1.4);
      const centre = (x0 + x1) / 2, width = Math.abs(x1 - x0);
      const row = HALL.glassZ + (tier.from + tier.to) / 2;
      place("bench", box, wood, HALL.x + centre, tier.y + HALL_BENCH_HEIGHT - 0.04, row, width, 0.08, 0.5);
      for (const lx of HALL_SEAT_LX) if (Math.sign(lx) === side) place("bench-leg", box, darkWood, HALL.x + lx, tier.y + HALL_BENCH_HEIGHT / 2 - 0.04, row, 0.1, HALL_BENCH_HEIGHT - 0.08, 0.42);
      place("desk", box, wood, HALL.x + centre, tier.y + 0.7, row - 0.95, width, 0.05, 0.55);
      for (const lx of [x0 + side * 0.2, x1 - side * 0.2]) place("desk-leg", box, darkWood, HALL.x + lx, tier.y + 0.35, row - 0.95, 0.08, 0.7, 0.45);
      for (const lx of HALL_SEAT_LX) if (Math.sign(lx) === side) {
        place("desk-lamp", cylinder, brass, HALL.x + lx + 0.5 * side, tier.y + 0.93, row - 1.05, 0.02, 0.4, 0.02);
        place("desk-lamp-shade", cylinder, paper, HALL.x + lx + 0.5 * side, tier.y + 1.12, row - 1.05, 0.11, 0.1, 0.11);
      }
    }
  }
  // 가운데 계단: 단 사이를 세 칸씩
  for (let k = 0; k < HALL_TIERS.length - 1; k++) {
    const lower = HALL_TIERS[k], upper = HALL_TIERS[k + 1], boundary = HALL.glassZ + lower.to;
    for (let step = 0; step < 3; step++) {
      const y = lower.y + (upper.y - lower.y) * (step + 1) / 3;
      const z = boundary - HALL_STAIR_RUN / 2 + HALL_STAIR_RUN * (step + 0.5) / 3;
      place("stair", box, floorWood, HALL.x, y - 0.1, z, HALL_STAIR_HALF * 2, 0.2, HALL_STAIR_RUN / 3 + 0.02);
    }
  }
  // 벽: 뒤, 옆(문 자리 비움), 처마 밑 상인방
  const wallT = 0.36;
  place("wall-back", box, plasterMat, HALL.x, topTier + HALL.eave / 2, HALL.backZ, hx * 2, HALL.eave, wallT);
  for (const side of [-1, 1]) {
    const x = HALL.x + side * hx;
    const doorFrom = HALL.doorZ - HALL.doorHalf, doorTo = HALL.doorZ + HALL.doorHalf;
    place("wall-side", box, plasterMat, x, topTier + HALL.eave / 2, (HALL.glassZ + doorFrom) / 2, wallT, HALL.eave, doorFrom - HALL.glassZ);
    place("wall-side", box, plasterMat, x, topTier + HALL.eave / 2, (doorTo + HALL.backZ) / 2, wallT, HALL.eave, HALL.backZ - doorTo);
    place("wall-lintel", box, plasterMat, x, topTier + 3.2 + (HALL.eave - 3.2) / 2, HALL.doorZ, wallT, HALL.eave - 3.2, HALL.doorHalf * 2);
    place("door-frame", box, darkWood, x, topTier + 1.6, HALL.doorZ - HALL.doorHalf, wallT + 0.1, 3.2, 0.18);
    place("door-frame", box, darkWood, x, topTier + 1.6, HALL.doorZ + HALL.doorHalf, wallT + 0.1, 3.2, 0.18);
    place("door-frame", box, darkWood, x, topTier + 3.2, HALL.doorZ, wallT + 0.1, 0.2, HALL.doorHalf * 2 + 0.2);
    // 옆문 돌계단
    for (let step = 0; step < 4; step++) {
      const out = side * (hx + 0.4 + step * 0.8);
      place("door-step", box, stone, HALL.x + out, GROUND_Y + (topTier - GROUND_Y) * (1 - (step + 0.5) / 4) - 0.1, HALL.doorZ, 0.8, 0.22, HALL.doorHalf * 2 + 0.4);
    }
  }
  // 창살 병풍과 등불이 걸린 뒷벽 안쪽
  for (let i = 0; i < 5; i++) {
    const x = HALL.x - 10 + i * 5;
    const screen = new THREE.PlaneGeometry(3.6, 7.2);
    owned.push(screen);
    place("lattice", screen, latticeMat, x, topTier + 4.6, HALL.backZ - wallT / 2 - 0.03, 1, 1, 1, Math.PI);
    place("wall-lantern", cylinder, paper, x + 2.5, topTier + 3.4, HALL.backZ - 0.6, 0.22, 0.5, 0.22);
    place("wall-lantern-cord", cylinder, frame, x + 2.5, topTier + 3.95, HALL.backZ - 0.6, 0.012, 0.6, 0.012);
  }
  const plaqueGeometry = new THREE.PlaneGeometry(3.2, 1);
  owned.push(plaqueGeometry);
  place("plaque", plaqueGeometry, plaque, HALL.x, topTier + 9.2, HALL.backZ - wallT / 2 - 0.04, 1, 1, 1, Math.PI);
  // 기둥: 통창 안쪽 가는 기둥은 없고, 네 모서리와 옆벽 중간의 굵은 기둥
  for (const [lx, lz] of [[-hx + 0.3, 0.3], [hx - 0.3, 0.3], [-hx + 0.3, depth - 0.3], [hx - 0.3, depth - 0.3]]) {
    place("column", cylinder, darkWood, HALL.x + lx, topTier + HALL.eave / 2, HALL.glassZ + lz, 0.26, HALL.eave, 0.26);
  }
  // 통창: 창가 단 바닥에서 처마까지 7칸 × 4단 유리와 어두운 멀리온
  const paneW = (hx * 2) / 7, glassY0 = HALL_TIERS[0].y + 0.12, paneH = (eaveY - glassY0) / 4;
  const panes: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 7; c++) for (let r = 0; r < 4; r++) {
    const pane = new THREE.PlaneGeometry(paneW - 0.14, paneH - 0.12);
    pane.translate(HALL.x - hx + paneW * (c + 0.5), glassY0 + paneH * (r + 0.5), HALL.glassZ);
    panes.push(pane);
  }
  const glassGeometry = mergeGeometries(panes, false)!;
  for (const pane of panes) pane.dispose();
  owned.push(glassGeometry);
  const glass = new THREE.ShaderMaterial({
    uniforms: { uPane: { value: new THREE.Vector2(paneW, paneH) }, uTime: { value: 0 }, uRain: { value: 0 }, uNight: { value: 0 }, uTint: { value: srgb(0x9fb6b8) }, uGlow: { value: srgb(0xffc07a) } },
    vertexShader: GARDEN_GLASS_VERT, fragmentShader: GARDEN_GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  materials.push(glass);
  const glassMesh = new THREE.Mesh(glassGeometry, glass);
  glassMesh.name = "garden-hall-glass"; glassMesh.renderOrder = 6;
  glassMesh.layers.enable(2);
  root.add(glassMesh);
  for (let c = 0; c <= 7; c++) place("mullion", box, frame, HALL.x - hx + paneW * c, (glassY0 + eaveY) / 2, HALL.glassZ, 0.16, eaveY - glassY0, 0.18);
  for (let r = 0; r <= 4; r++) place("mullion", box, frame, HALL.x, glassY0 + paneH * r - (r === 4 ? 0.1 : 0), HALL.glassZ, hx * 2 + 0.2, 0.14, 0.18);
  place("sill", box, darkStone, HALL.x, glassY0 - 0.08, HALL.glassZ, hx * 2 + 0.4, 0.16, 0.5);
  // 지붕·천장·용마루
  const roofGeometry = rectHipRoofGeometry(hx + 1.8, depth / 2 + 1.8, HALL.roofRise, 0.9, 0.4);
  const roofUnder = rectHipRoofGeometry(hx + 1.75, depth / 2 + 1.75, HALL.roofRise - 0.1, 0.9, 0.4);
  owned.push(roofGeometry, roofUnder);
  place("roof", roofGeometry, tile, HALL.x, eaveY + 0.25, cz);
  place("roof-underside", roofUnder, underside, HALL.x, eaveY + 0.2, cz);
  place("eave-beam", box, darkWood, HALL.x, eaveY + 0.08, HALL.glassZ - 0.2, hx * 2 + 1.2, 0.3, 0.4);
  place("eave-beam", box, darkWood, HALL.x, eaveY + 0.08, HALL.backZ + 0.2, hx * 2 + 1.2, 0.3, 0.4);
  place("ridge", box, ridge, HALL.x, eaveY + 0.25 + HALL.roofRise + 0.05, cz, (hx - depth / 2) * 2 + 1.2, 0.34, 0.5);
  for (const side of [-1, 1]) place("ridge-end", cylinder, ridge, HALL.x + side * (hx - depth / 2 + 0.6), eaveY + 0.25 + HALL.roofRise + 0.35, cz, 0.32, 0.5, 0.32);
  place("ceiling", box, ceiling, HALL.x, eaveY - 0.05, cz, hx * 2, 0.1, depth);
  for (let i = 0; i < 6; i++) place("rafter", box, darkWood, HALL.x - 12.5 + i * 5, eaveY - 0.35, cz, 0.3, 0.5, depth);
  // 샹들리에 두 개: 고리 세 줄의 크리스털 + 중심 봉
  const bead = new THREE.OctahedronGeometry(0.065, 0);
  owned.push(bead);
  const beadSites: THREE.Vector3[] = [];
  for (const lx of [-6, 6]) {
    const x = HALL.x + lx, z = HALL.glassZ + 8.2, top = eaveY - 0.2;
    place("chandelier-rod", cylinder, brass, x, top - 1.6, z, 0.05, 3.2, 0.05);
    const rings = [[1.7, top - 3.2], [1.25, top - 3.9], [0.85, top - 4.5], [0.45, top - 5.0]] as const;
    for (const [radius, y] of rings) {
      const hoop = new THREE.TorusGeometry(radius, 0.035, 6, 36);
      owned.push(hoop);
      place("chandelier-hoop", hoop, brass, x, y, z, 1, 1, 1, 0, Math.PI / 2);
      const count = Math.round(radius * 2 * Math.PI / (mobile ? 0.16 : 0.12));
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2;
        for (let drop = 0; drop < 3; drop++) beadSites.push(new THREE.Vector3(x + Math.cos(a) * radius, y - 0.1 - drop * 0.14, z + Math.sin(a) * radius));
      }
    }
    place("chandelier-bulb", new THREE.SphereGeometry(0.3, 10, 8), paper, x, top - 4.3, z);
  }
  const beads = new THREE.InstancedMesh(bead, crystal, beadSites.length);
  beads.name = "garden-chandelier-crystals";
  const transform = new THREE.Object3D();
  beadSites.forEach((site, index) => {
    transform.position.copy(site); transform.rotation.set(0, index * 0.7, 0); transform.scale.setScalar(0.8 + (index % 3) * 0.15);
    transform.updateMatrix(); beads.setMatrixAt(index, transform.matrix);
  });
  beads.instanceMatrix.needsUpdate = true;
  beads.computeBoundingSphere();
  beads.layers.enable(2);
  root.add(beads);

  /* ---------------- 연향정 ---------------- */
  const island = GARDEN_PAVILIONS[0];
  const roofSq = hipRoofGeometry(), roofSqUnder = hipRoofGeometry(0.1), hip = hipRidgeGeometry(), knob = new THREE.SphereGeometry(0.16, 10, 8);
  const footing = new THREE.CylinderGeometry(0.27, 0.31, 1, 8, 1), lantern = new THREE.CylinderGeometry(0.15, 0.13, 0.36, 10, 1);
  owned.push(roofSq, roofSqUnder, hip, knob, footing, lantern);
  {
    const floorY = island.floorY, postTop = floorY + PAVILION_POST_HEIGHT, half = PAVILION_HALF;
    const local = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, lx: number, y: number, lz: number, sx = 1, sy = 1, sz = 1, ry = 0) => {
      const w = gardenPavilionWorld(island, lx, lz);
      place(name, geometry, material, w.x, y, w.z, sx, sy, sz, island.yaw + ry);
    };
    local("deck", box, floorWood, 0, floorY - 0.08, 0, half * 2, 0.16, half * 2);
    local("trim", box, darkWood, 0, floorY - 0.2, 0, half * 2 + 0.1, 0.12, half * 2 + 0.1);
    for (const [lx, lz] of [[-2.15, -2.15], [2.15, -2.15], [-2.15, 2.15], [2.15, 2.15], [-2.15, 0], [2.15, 0]]) {
      local("stone", footing, stone, lx, GROUND_Y + 0.2, lz, 1, 0.42, 1);
      local("post", cylinder, vermilion, lx, floorY + PAVILION_POST_HEIGHT / 2, lz, 0.14, PAVILION_POST_HEIGHT, 0.14);
    }
    for (const side of [-1, 1]) {
      local("beam", box, vermilion, 0, postTop + 0.11, side * 2.15, half * 2 + 0.6, 0.22, 0.2);
      local("beam", box, vermilion, side * 2.15, postTop + 0.11, 0, 0.2, 0.22, half * 2 + 0.6);
    }
    local("roof", roofSq, tile, 0, postTop + 0.22, 0);
    local("roof-underside", roofSqUnder, underside, 0, postTop + 0.22, 0, 0.985, 1, 0.985);
    for (let k = 0; k < 4; k++) local("ridge", hip, ridge, 0, postTop + 0.22, 0, 1, 1, 1, k * Math.PI / 2);
    local("ridge", knob, ridge, 0, postTop + 0.22 + 1.62, 0, 1, 1.3, 1);
    for (const y of [0.45, 0.82]) local("rail", box, wood, 0, floorY + y, -half, half * 2, 0.07, 0.07);
    for (const lx of [-2.0, -1.0, 0, 1.0, 2.0]) local("rail", box, wood, lx, floorY + 0.45, -half, 0.06, 0.82, 0.06);
    local("step", box, stone, 0, GROUND_Y + 0.31, half + 0.3, 1.5, 0.18, 0.6);
    local("step", box, stone, 0, GROUND_Y + 0.11, half + 0.3 + PAVILION_STEP_LENGTH / 2, 1.5, 0.18, 0.6);
    for (const lx of [-1.9, 1.9]) {
      local("cord", cylinder, darkWood, lx, postTop - 0.17, 2.3, 0.012, 0.3, 0.012);
      local("paper-lantern", lantern, paper, lx, postTop - 0.5, 2.3);
    }
  }

  /* ---------------- 구곡교 ---------------- */
  for (let i = 0; i < GARDEN_BRIDGE.length - 1; i++) {
    const [ax, az] = GARDEN_BRIDGE[i], [bx, bz] = GARDEN_BRIDGE[i + 1];
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    place("bridge-deck", box, stone, mx, BRIDGE_Y - 0.12, mz, 2.1, 0.24, length + 0.4, yaw);
    place("bridge-curb", box, darkStone, mx, BRIDGE_Y - 0.02, mz, 2.2, 0.06, length + 0.5, yaw);
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * 0.98, oz = -Math.sin(yaw) * side * 0.98;
      place("bridge-rail", box, stone, mx + ox, BRIDGE_Y + 0.78, mz + oz, 0.14, 0.12, length + 0.1, yaw);
      const posts = Math.max(2, Math.round(length / 1.3));
      for (let k = 0; k <= posts; k++) {
        const t = k / posts;
        place("bridge-post", box, stone, ax + dx * t + ox, BRIDGE_Y + 0.4, az + dz * t + oz, 0.16, 0.8, 0.16, yaw);
        if (k < posts) place("bridge-panel", box, stone, ax + dx * (t + 0.5 / posts) + ox, BRIDGE_Y + 0.3, az + dz * (t + 0.5 / posts) + oz, 0.06, 0.4, length / posts - 0.3, yaw);
      }
    }
    if (i > 0) place("bridge-pier", box, darkStone, ax, (BRIDGE_Y - 1.4) / 2, az, 0.9, BRIDGE_Y + 1.4, 0.9);
  }

  /* ---------------- 잔교 ---------------- */
  for (const pier of GARDEN_PIERS) {
    const end = pierEnd(pier), yaw = Math.atan2(pier.dx, pier.dz);
    const mx = (pier.x + end.x) / 2, mz = (pier.z + end.z) / 2;
    place("pier-deck", box, floorWood, mx, PIER_Y - 0.07, mz, pier.halfWidth * 2, 0.14, pier.length + 0.3, yaw);
    place("pier-edge", box, darkWood, mx, PIER_Y - 0.14, mz, pier.halfWidth * 2 + 0.1, 0.1, pier.length + 0.4, yaw);
    const posts = Math.round(pier.length / 2);
    for (let k = 0; k <= posts; k++) {
      const t = k / posts;
      for (const side of [-1, 1]) {
        const x = pier.x + pier.dx * pier.length * t - pier.dz * side * (pier.halfWidth - 0.1), z = pier.z + pier.dz * pier.length * t + pier.dx * side * (pier.halfWidth - 0.1);
        place("pier-post", cylinder, darkWood, x, (PIER_Y + 0.3 - 1.2) / 2, z, 0.09, PIER_Y + 1.5, 0.09);
      }
    }
    place("mooring", cylinder, darkWood, end.x - pier.dz * 0.7, PIER_Y + 0.35, end.z + pier.dx * 0.7, 0.1, 0.9, 0.1);
  }

  /* ---------------- 남문 (月門) ---------------- */
  {
    const shape = new THREE.Shape();
    shape.moveTo(-14, 0); shape.lineTo(14, 0); shape.lineTo(14, 3.3); shape.lineTo(-14, 3.3); shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 1.6, 1.55, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const wall = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 40 });
    wall.rotateY(Math.PI);
    owned.push(wall);
    place("gate-wall", wall, plasterMat, 0, GROUND_Y, GATE_WALL_Z + 0.25);
    place("gate-coping", box, ridge, 0, GROUND_Y + 3.42, GATE_WALL_Z, 28.6, 0.26, 0.95);
    place("gate-base", box, darkStone, 0, GROUND_Y + 0.12, GATE_WALL_Z, 28.4, 0.24, 0.8);
    const ring = new THREE.TorusGeometry(1.6, 0.09, 6, 40);
    owned.push(ring);
    place("gate-ring", ring, darkStone, 0, GROUND_Y + 1.6, GATE_WALL_Z);
  }

  /* ---------------- 석등 ---------------- */
  const lanternBody = stoneLanternGeometry();
  owned.push(lanternBody);
  const lanternMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  materials.push(lanternMaterial);
  const lanterns = new THREE.InstancedMesh(lanternBody, lanternMaterial, GARDEN_LANTERNS.length);
  lanterns.name = "garden-stone-lanterns";
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2622, toneMapped: false });
  materials.push(windowMaterial);
  const windowGeometry = new THREE.BoxGeometry(0.27, 0.26, 0.27);
  owned.push(windowGeometry);
  const windows = new THREE.InstancedMesh(windowGeometry, windowMaterial, GARDEN_LANTERNS.length);
  windows.name = "garden-lantern-windows";
  GARDEN_LANTERNS.forEach((site, index) => {
    transform.position.set(site.x, site.y, site.z); transform.rotation.set(0, site.yaw, 0); transform.scale.setScalar(1.1);
    transform.updateMatrix(); lanterns.setMatrixAt(index, transform.matrix);
    transform.position.y = site.y + 0.83 * 1.1; transform.updateMatrix(); windows.setMatrixAt(index, transform.matrix);
  });
  for (const mesh of [lanterns, windows]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.layers.enable(2); root.add(mesh); }

  /* ---------------- 밤의 글로우 (석등 + 정자 등롱 + 샹들리에 + 뒷벽 등) ---------------- */
  const glowSites: { x: number; y: number; z: number; size: number }[] = [
    ...GARDEN_LANTERNS.map((site) => ({ x: site.x, y: site.y + 0.83 * 1.1, z: site.z, size: 1.7 })),
    ...[-1.9, 1.9].map((lx) => { const w = gardenPavilionWorld(island, lx, 2.3); return { x: w.x, y: island.floorY + PAVILION_POST_HEIGHT - 0.5, z: w.z, size: 2.0 }; }),
    ...[-6, 6].map((lx) => ({ x: HALL.x + lx, y: eaveY - 4.3, z: HALL.glassZ + 8.2, size: 4.2 })),
    ...[0, 1, 2, 3, 4].map((i) => ({ x: HALL.x - 10 + i * 5 + 2.5, y: topTier + 3.4, z: HALL.backZ - 0.6, size: 2.2 })),
  ];
  const glowQuad = new THREE.PlaneGeometry(1, 1);
  owned.push(glowQuad);
  const glowGeometry = new THREE.InstancedBufferGeometry();
  glowGeometry.setAttribute("position", glowQuad.getAttribute("position"));
  glowGeometry.setAttribute("uv", glowQuad.getAttribute("uv"));
  glowGeometry.setIndex(glowQuad.getIndex());
  glowGeometry.instanceCount = glowSites.length;
  const glowPlacement = new Float32Array(glowSites.length * 4), glowSeeds = new Float32Array(glowSites.length * 2);
  glowSites.forEach((site, i) => { glowPlacement.set([site.x, site.y, site.z, site.size], i * 4); glowSeeds.set([(i * 0.173) % 1, 0], i * 2); });
  glowGeometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glowPlacement, 4));
  glowGeometry.setAttribute("aGlowSeed", new THREE.InstancedBufferAttribute(glowSeeds, 2));
  glowGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 40), 90);
  owned.push(glowGeometry);
  const time = { value: 0 }, night = { value: 0 };
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uNight: night, uGlowColor: { value: srgb(0xffa960) } },
    vertexShader: BAMBOO_GLOW_VERT, fragmentShader: BAMBOO_GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  materials.push(glowMaterial);
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.name = "garden-glow"; glow.renderOrder = 5; glow.visible = false; glow.layers.enable(2);
  root.add(glow);

  /* ---------------- 재질별 병합 ---------------- */
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const part of parts) {
    if (!groups.has(part.material)) groups.set(part.material, []);
    groups.get(part.material)!.push(part.geometry.index ? part.geometry.toNonIndexed() : part.geometry);
  }
  const merged: THREE.BufferGeometry[] = [];
  for (const [material, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false)!;
    for (const piece of geometries) piece.dispose();
    merged.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `garden-${(material as THREE.Material & { name?: string }).name || "structure"}`;
    mesh.layers.enable(2);
    root.add(mesh);
  }
  for (const part of parts) part.geometry.dispose();

  const warm = new THREE.Color(0xffc27a), dim = new THREE.Color(0xe9dcc8), latticeDay = new THREE.Color(0xe8dcc0), latticeNight = new THREE.Color(0xffd9a0);
  let lastRain = 0;
  return {
    root,
    applyDaylight(d, rain) {
      if (disposed) return;
      const lamps = THREE.MathUtils.clamp(d.lanterns, 0, 1);
      const indoor = Math.max(lamps, rain * 0.55);
      night.value = lamps;
      glow.visible = indoor > 0.02;
      paper.color.copy(dim).lerp(warm, indoor);
      windowMaterial.color.setHex(0x2a2622).lerp(warm, lamps);
      latticeMat.color.copy(latticeDay).lerp(latticeNight, indoor);
      crystal.emissive.setHex(0x000000).lerp(new THREE.Color(0xffb45a), indoor * 0.5);
      glass.uniforms.uNight.value = indoor;
    },
    setRain(rain) {
      if (disposed || rain === lastRain) return;
      lastRain = rain;
      glass.uniforms.uRain.value = rain;
    },
    setTime(t) { time.value = t; glass.uniforms.uTime.value = t; },
    setQuality(low) { if (!disposed) beads.count = low ? Math.floor(beadSites.length / 2) : beadSites.length; },
    dispose() {
      if (disposed) return;
      disposed = true;
      beads.dispose(); lanterns.dispose(); windows.dispose();
      root.removeFromParent(); root.clear();
      for (const geometry of [...owned, ...merged]) geometry.dispose();
      for (const material of materials) material.dispose();
      tiles.dispose(); plaster.dispose(); lattice.dispose();
      (plaque.map as THREE.Texture | null)?.dispose();
    },
  };
}

export { WATER_Y, PAVILION_RISE };
