import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import {
  BAMBOO_FENCES, BAMBOO_LANTERNS, BAMBOO_PAVILIONS, DECK_YARD, MEADOW, NORTH_FACE, PAVILION_YARD_HALF, STALK_FIELD, SUMMIT, TRAIL_POLYLINES, TRAIL_WIDTH,
  bambooBrushSites, bambooStalkSites, groundHeight, seededRandom, type StalkSite, type TrailLantern,
} from "./bamboo-trail";
import {
  BAMBOO_CANOPY_FRAG, BAMBOO_CANOPY_VERT, BAMBOO_CITY_FRAG, BAMBOO_CITY_VERT, BAMBOO_FIREFLY_FRAG, BAMBOO_FIREFLY_VERT,
  BAMBOO_FOLIAGE_FRAG, BAMBOO_FOLIAGE_VERT, BAMBOO_GLOW_FRAG, BAMBOO_GLOW_VERT, BAMBOO_GROUND_FRAG, BAMBOO_GROUND_VERT,
  BAMBOO_STALK_FRAG, BAMBOO_STALK_VERT,
} from "./bamboo-shader";
import { buildBambooPavilions, type BambooPavilionSet } from "./bamboo-pavilions";

export interface BambooWalker { x: number; z: number; moving: boolean }

/** World extent baked into the ground mask: path, stone slabs and lantern pools in one texture. */
const MASK = { minX: -48, minZ: -8, width: 96, depth: 128, sizeX: 1024, sizeZ: 1536 } as const;
const CHUNK_COLS = 6, CHUNK_ROWS = 8;
const LEAF_RADIUS = { high: 32, low: 22 } as const;
/** Chunks whose nearest point is beyond the fog (62 m) are not drawn at all. */
const STALK_RADIUS = 56;
const STONE_LIGHT_Y = 0.83;
const LAMP_INTENSITY = 12;
/** The city sits far beyond the mountain's north slope, below the summit's line of sight. */
const CITY = { z: 440, y: 60, width: 1500, height: 240 } as const;

interface Chunk {
  stalks: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  leaves: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  cx: number; cz: number; radius: number;
  stalkCount: number; leafCount: number;
}

const srgb = (hex: number) => new THREE.Color(hex);

function canvas2d(width: number, height: number, alpha: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d", { alpha })! };
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, width: number, light: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const gradient = ctx.createLinearGradient(0, 0, length, 0);
  const tone = (a: string, b: string) => light > 0.5 ? b : a;
  gradient.addColorStop(0, tone("#3f6b24", "#5a8a2e"));
  gradient.addColorStop(0.5, tone("#6a9d3a", "#9cc84f"));
  gradient.addColorStop(1, tone("#4c7a29", "#7fae3f"));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.45, -width, length, 0);
  ctx.quadraticCurveTo(length * 0.45, width, 0, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 52, 18, 0.55)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

/** 댓잎 뭉치: 가지 여섯 줄기에 어긋나게 달린 긴 잎. 코드로만 그린다 (외부 저작물 없음). */
function leafClusterTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 256, { canvas, ctx } = canvas2d(size, size, true);
  const rand = seededRandom(5);
  ctx.translate(size / 2, size / 2);
  for (let twig = 0; twig < 6; twig++) {
    const a = twig / 6 * Math.PI * 2 + (rand() - 0.5) * 0.6;
    ctx.strokeStyle = "#8a7a3e"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 88, Math.sin(a) * 88); ctx.stroke();
    for (let k = 0; k < 7; k++) {
      const d = 14 + k * 11.5, side = k % 2 ? 1 : -1;
      drawLeaf(ctx, Math.cos(a) * d, Math.sin(a) * d, a + side * (0.5 + rand() * 0.3), 40 + rand() * 24, 5 + rand() * 3.5, rand());
    }
  }
  for (let k = 0; k < 10; k++) drawLeaf(ctx, (rand() - 0.5) * 40, (rand() - 0.5) * 40, rand() * Math.PI * 2, 36 + rand() * 22, 5 + rand() * 3, rand());
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Seamlessly tiling canopy: clusters drawn with wrapped copies at every edge. */
function canopyTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 512, { canvas, ctx } = canvas2d(size, size, true);
  const rand = seededRandom(23);
  for (let n = 0; n < 60; n++) {
    const x = rand() * size, y = rand() * size, scale = 0.42 + rand() * 0.35, rot = rand() * Math.PI * 2;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size], [size, size], [-size, -size], [size, -size], [-size, size]]) {
      ctx.save();
      ctx.translate(x + ox, y + oy); ctx.rotate(rot); ctx.scale(scale, scale);
      for (let twig = 0; twig < 5; twig++) {
        const a = twig / 5 * Math.PI * 2 + (rand() - 0.5) * 0.6;
        for (let k = 0; k < 6; k++) {
          const d = 10 + k * 12, side = k % 2 ? 1 : -1;
          drawLeaf(ctx, Math.cos(a) * d, Math.sin(a) * d, a + side * (0.5 + rand() * 0.3), 40 + rand() * 22, 5 + rand() * 3, rand());
        }
      }
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Dry bamboo brush along the fences: tan strokes fanning out of the ground. */
function brushTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 128, { canvas, ctx } = canvas2d(size, size, true);
  const rand = seededRandom(31);
  ctx.lineCap = "round";
  for (let n = 0; n < 54; n++) {
    const angle = -Math.PI / 2 + (rand() - 0.5) * 1.9, length = 50 + rand() * 70, x0 = size / 2 + (rand() - 0.5) * 30;
    const tones = ["#c9a862", "#a8863f", "#e0c47a", "#8f6f33", "#d8b864"];
    ctx.strokeStyle = tones[Math.floor(rand() * tones.length)];
    ctx.lineWidth = 1.5 + rand() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x0, size - 2);
    ctx.quadraticCurveTo(x0 + Math.cos(angle) * length * 0.5 + (rand() - 0.5) * 14, size - 2 + Math.sin(angle) * length * 0.5,
      x0 + Math.cos(angle) * length, size - 2 + Math.sin(angle) * length);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** 도시 야경: 먼 산 능선(r), 창문·가로등 불빛(g), 도심 위 빛무리(b)를 채널별로 그린다. 외부 이미지 없음. */
function cityTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const width = 2048, height = 512, { canvas, ctx } = canvas2d(width, height, true);
  const rand = seededRandom(97);
  ctx.globalCompositeOperation = "lighter";
  // Three ridges, far to near, each a lower and brighter mask value for aerial perspective.
  [[286, 34, 0.5], [318, 24, 0.72], [350, 16, 1]].forEach(([baseline, amplitude, value], layer) => {
    ctx.fillStyle = `rgba(255,0,0,${value})`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 8) {
      const y = baseline - amplitude * (0.55 * Math.sin(x / (260 + layer * 90) + layer) + 0.3 * Math.sin(x / (97 + layer * 23) + 2.1 * layer) + 0.15 * Math.sin(x / 41 + layer));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
  });
  // Towers with lit window grids, taller toward the centre.
  for (let i = 0; i < 46; i++) {
    const cx = 160 + rand() * (width - 320), near = 1 - Math.abs(cx - width / 2) / (width / 2);
    const w = 8 + rand() * 22, h = 28 + rand() * (60 + near * 90), bottom = 462 + rand() * 20;
    ctx.fillStyle = "rgba(255,0,0,0.9)"; ctx.fillRect(cx - w / 2, bottom - h, w, h);
    for (let y = bottom - h + 3; y < bottom - 3; y += 4) for (let x = cx - w / 2 + 2; x < cx + w / 2 - 1; x += 3.5) {
      if (rand() < 0.55) { ctx.fillStyle = `rgba(0,255,0,${0.5 + rand() * 0.5})`; ctx.fillRect(x, y, 1.6, 1.6); }
    }
    if (h > 110 && rand() < 0.7) { ctx.fillStyle = "rgba(0,255,0,1)"; ctx.fillRect(cx - 1, bottom - h - 3, 2, 2); }
  }
  // Street and window lights across the valley: denser and brighter near the centre and the foot of the slope.
  for (let i = 0; i < 14000; i++) {
    const x = rand() * width, t = rand();
    const y = 352 + Math.pow(t, 0.6) * 150;
    const near = 1 - Math.abs(x - width / 2) / (width / 2);
    if (rand() > 0.35 + near * 0.65) continue;
    const size = 0.8 + rand() * (1.2 + (y - 352) / 150 * 1.6);
    ctx.fillStyle = `rgba(0,255,0,${0.35 + rand() * 0.65})`;
    ctx.fillRect(x, y, size, size);
  }
  for (let row = 0; row < 7; row++) {
    const y = 372 + row * 19 + rand() * 6;
    for (let x = rand() * 40; x < width; x += 9 + rand() * 14) {
      if (rand() < 0.8) { ctx.fillStyle = "rgba(0,255,0,0.8)"; ctx.fillRect(x, y, 1.5, 1.5); }
    }
  }
  const glow = ctx.createRadialGradient(width / 2, 455, 0, width / 2, 455, 760);
  glow.addColorStop(0, "rgba(0,0,255,0.7)"); glow.addColorStop(0.45, "rgba(0,0,255,0.3)"); glow.addColorStop(1, "rgba(0,0,255,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  const band = ctx.createLinearGradient(0, 330, 0, 512);
  band.addColorStop(0, "rgba(0,0,255,0)"); band.addColorStop(0.6, "rgba(0,0,255,0.35)"); band.addColorStop(1, "rgba(0,0,255,0.5)");
  ctx.fillStyle = band; ctx.fillRect(0, 330, width, 182);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** r: earth path and yards, g: stone slabs, b: lantern light pools. Opaque so channels never premultiply. */
function groundMaskTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const { canvas, ctx } = canvas2d(MASK.sizeX, MASK.sizeZ, false);
  const sx = MASK.sizeX / MASK.width, sz = MASK.sizeZ / MASK.depth;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, MASK.sizeX, MASK.sizeZ);
  ctx.setTransform(sx, 0, 0, sz, -MASK.minX * sx, -MASK.minZ * sz);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  const strokeLines = (width: number, alpha: number) => {
    ctx.strokeStyle = "#f00"; ctx.globalAlpha = alpha; ctx.lineWidth = width;
    for (const line of TRAIL_POLYLINES) {
      ctx.beginPath();
      line.points.forEach(([x, z], index) => index ? ctx.lineTo(x, z) : ctx.moveTo(x, z));
      if (line.closed) ctx.closePath();
      ctx.stroke();
    }
  };
  strokeLines(TRAIL_WIDTH + 1.5, 0.28); strokeLines(TRAIL_WIDTH + 0.7, 0.42); strokeLines(TRAIL_WIDTH, 1);
  ctx.fillStyle = "#f00";
  for (const p of BAMBOO_PAVILIONS) {
    const yard = p.kind === "deck" ? DECK_YARD : { x: PAVILION_YARD_HALF, z: PAVILION_YARD_HALF };
    const horizontal = p.fx !== 0;
    const halfX = horizontal ? yard.z : yard.x, halfZ = horizontal ? yard.x : yard.z;
    for (const [extra, alpha] of [[0.9, 0.3], [0, 1]] as const) {
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - halfX - extra, p.z - halfZ - extra, (halfX + extra) * 2, (halfZ + extra) * 2);
    }
  }
  // Stone slabs scattered along the centre line; a seeded walk keeps every client's path identical.
  const rand = seededRandom(17);
  ctx.fillStyle = "#0f0"; ctx.globalAlpha = 1;
  for (const line of TRAIL_POLYLINES) {
    const pts = line.points, count = line.closed ? pts.length : pts.length - 1;
    let travelled = 0, nextAt = 0.6;
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz) || 1e-9;
      while (nextAt <= travelled + length) {
        const t = (nextAt - travelled) / length;
        if (rand() < 0.62) {
          const lateral = (rand() - 0.5) * 1.3, nx = -dz / length, nz = dx / length;
          const cx = a[0] + dx * t + nx * lateral, cz = a[1] + dz * t + nz * lateral;
          const radius = 0.28 + rand() * 0.2, sides = 5 + Math.floor(rand() * 3), spin = rand() * Math.PI;
          ctx.beginPath();
          for (let k = 0; k < sides; k++) {
            const angle = spin + k / sides * Math.PI * 2, r = radius * (0.8 + rand() * 0.4);
            const x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r;
            if (k) ctx.lineTo(x, z); else ctx.moveTo(x, z);
          }
          ctx.closePath(); ctx.fill();
        }
        nextAt += 1.05;
      }
      travelled += length;
    }
  }
  for (const lantern of BAMBOO_LANTERNS) {
    const radius = lantern.kind === "stone" ? 2.7 : 2.3;
    const gradient = ctx.createRadialGradient(lantern.x, lantern.z, 0, lantern.x, lantern.z, radius);
    gradient.addColorStop(0, "rgba(0,0,255,0.95)"); gradient.addColorStop(0.4, "rgba(0,0,255,0.45)"); gradient.addColorStop(1, "rgba(0,0,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(lantern.x - radius, lantern.z - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** A regular grid displaced by the terrain function; the walker samples the same function, so feet stay on the ground. */
function heightfield(minX: number, maxX: number, minZ: number, maxZ: number, cell: number, lift: (x: number, z: number) => number): THREE.BufferGeometry {
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3), uvs = new Float32Array((nx + 1) * (nz + 1) * 2);
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
    const i = iz * (nx + 1) + ix, x = minX + ix / nx * (maxX - minX), z = minZ + iz / nz * (maxZ - minZ);
    positions.set([x, lift(x, z), z], i * 3);
    uvs.set([ix / nx, iz / nz], i * 2);
  }
  const indices: number[] = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const a = iz * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function colored(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex), count = geometry.getAttribute("position").count, values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(values, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

/** A small stone lantern (석등): base, column, open light box between corner bars, hexagonal cap. */
function stoneLanternGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const place = (geometry: THREE.BufferGeometry, x: number, y: number, z: number, hex: number) => {
    geometry.translate(x, y, z); parts.push(colored(geometry, hex));
  };
  place(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 6), 0, 0.07, 0, 0x7d7a72);
  place(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), 0, 0.39, 0, 0x8a877f);
  place(new THREE.BoxGeometry(0.42, 0.05, 0.42), 0, 0.665, 0, 0x6f6c65);
  for (const x of [-0.16, 0.16]) for (const z of [-0.16, 0.16]) place(new THREE.BoxGeometry(0.05, 0.3, 0.05), x, 0.84, z, 0x4b4a46);
  place(new THREE.BoxGeometry(0.44, 0.05, 0.44), 0, 1.015, 0, 0x6f6c65);
  place(new THREE.ConeGeometry(0.36, 0.22, 6), 0, 1.15, 0, 0x66635c);
  place(new THREE.SphereGeometry(0.05, 6, 5), 0, 1.28, 0, 0x7d7a72);
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()), false)!;
  for (const part of parts) part.dispose();
  return merged;
}

function crossedQuadGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1), b = new THREE.PlaneGeometry(1, 1);
  b.rotateY(Math.PI / 2);
  const merged = mergeGeometries([a, b], false)!;
  a.dispose(); b.dispose();
  return merged;
}

function instanced(base: THREE.BufferGeometry, count: number): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  if (base.getAttribute("normal")) geometry.setAttribute("normal", base.getAttribute("normal"));
  if (base.getIndex()) geometry.setIndex(base.getIndex());
  geometry.instanceCount = count;
  return geometry;
}

/**
 * 대나무숲 둘레길 세계. 지형은 높이맵 두 장(안쪽 촘촘·바깥 성김), 줄기는 청크별 인스턴스(안개 밖 청크는 그리지 않음),
 * 잎은 십자 빌보드, 캐노피는 지형을 따라가며 공터 위는 비어 있다. 밤에는 등불이 글로우 빌보드·바닥 웅덩이·가까운 점광원 4개로 길을 밝히고,
 * 정상 너머로는 안개에 닿지 않는 먼 도시의 불빛이 켜진다.
 */
export class BambooWorld {
  private readonly root = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight(0xdfe8c8, 0x5a4a34, 0.95);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0.8);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly fogUniforms = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  private readonly time = { value: 0 };
  private readonly sway = { value: 1 };
  private readonly clearings = { value: [SUMMIT, MEADOW, NORTH_FACE].map((area) => new THREE.Vector4(area.x, area.z, area.radius, area.feather)) };
  private readonly light = {
    uAmbient: { value: new THREE.Color(0.4, 0.45, 0.3) },
    uGroundAmbient: { value: new THREE.Color(0.2, 0.17, 0.12) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(0.9, 0.9, 0.8) },
    uNight: { value: 0 },
    uLanternColor: { value: srgb(0xffb064) },
    uLanterns: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -100, 0, 0)) },
  };
  private readonly groundMaterial: THREE.ShaderMaterial;
  private readonly chunks: Chunk[] = [];
  private readonly canopies: THREE.Mesh[] = [];
  private readonly brush: THREE.Mesh | null = null;
  private readonly glow: THREE.Mesh;
  private readonly fireflies: THREE.Points;
  private readonly windows: THREE.InstancedMesh;
  private readonly windowMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2622, toneMapped: false });
  private readonly cityMaterial: THREE.ShaderMaterial;
  private readonly pavilions: BambooPavilionSet;
  private readonly lanternPoints: { x: number; y: number; z: number }[];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  private lampAmount = 0;
  private leafRadius: number = LEAF_RADIUS.high;
  private low = false;
  private lastLampAt = { x: NaN, z: NaN, t: -Infinity };
  private disposed = false;

  constructor(scene: THREE.Scene, textures: { wood: THREE.Texture }, private readonly mobile = false) {
    this.root.name = "bamboo-forest";
    scene.add(this.root);
    this.hemi.name = "bamboo-canopy-light";
    this.sun.name = "bamboo-sun";
    this.sun.position.set(18, 50, -20);
    this.sun.castShadow = false;
    this.root.add(this.hemi, this.sun);
    for (let i = 0; i < 4; i++) {
      // Physical falloff: about 3 lux a couple of metres from the lantern, fading out by nine.
      const lamp = new THREE.PointLight(0xffb46a, 0, 9, 2);
      lamp.name = `bamboo-lantern-light-${i}`;
      lamp.castShadow = false;
      lamp.visible = false;
      this.root.add(lamp);
      this.lamps.push(lamp);
    }

    const mask = groundMaskTexture(), leaf = leafClusterTexture(), canopy = canopyTexture(), brush = brushTexture(), city = cityTexture();
    this.textures.push(mask, leaf, canopy, brush, city);
    const shared = () => ({ ...this.light, uTime: this.time, uSway: this.sway, uClearings: this.clearings, ...this.fogUniforms });

    this.groundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...shared(), uMask: { value: mask }, uMaskRect: { value: new THREE.Vector4(MASK.minX, MASK.minZ, 1 / MASK.width, 1 / MASK.depth) },
        uDapple: { value: 0.45 },
        uLitter: { value: srgb(0x4f3a26) }, uLitterLight: { value: srgb(0x8a6a44) }, uMoss: { value: srgb(0x4f6b2c) },
        uGrass: { value: srgb(0x5f7f33) }, uGrassLight: { value: srgb(0x97b24f) },
        uEarth: { value: srgb(0x6a5236) }, uEarthLight: { value: srgb(0xa78a62) },
        uStone: { value: srgb(0x6f716b) }, uStoneLight: { value: srgb(0xa9aaa2) },
        uPoolColor: { value: srgb(0xff9a3c).multiplyScalar(0.55) },
      },
      vertexShader: BAMBOO_GROUND_VERT, fragmentShader: BAMBOO_GROUND_FRAG, fog: true,
    });
    this.materials.push(this.groundMaterial);
    // Fine grid where people walk, a coarse skirt out to the fog; the skirt sits just below so the seam never shows.
    const inner = heightfield(-52, 52, -12, 124, 1.5, groundHeight);
    const outer = heightfield(-100, 100, -60, 180, 6, (x, z) => groundHeight(x, z) - 0.15);
    this.geometries.push(inner, outer);
    for (const [index, geometry] of [inner, outer].entries()) {
      const mesh = new THREE.Mesh(geometry, this.groundMaterial);
      mesh.name = index ? "bamboo-ground-far" : "bamboo-ground";
      mesh.renderOrder = 0;
      this.root.add(mesh);
    }

    const stalkMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uStalkBase: { value: srgb(0x3e6b2a) }, uStalkTop: { value: srgb(0x9cbf4e) }, uStalkWarm: { value: srgb(0xc9c24f) } },
      vertexShader: BAMBOO_STALK_VERT, fragmentShader: BAMBOO_STALK_FRAG, fog: true,
    });
    const leafMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: leaf }, uLeafShade: { value: srgb(0x8fb35a) }, uLeafLit: { value: srgb(0xd8ef78) }, uTransmit: { value: 0.3 } },
      vertexShader: BAMBOO_FOLIAGE_VERT, fragmentShader: BAMBOO_FOLIAGE_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(stalkMaterial, leafMaterial);
    this.buildForest(stalkMaterial, leafMaterial);

    const canopyMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: canopy }, uRepeat: { value: new THREE.Vector2(22, 26) }, uCanopyColor: { value: srgb(0x6e8f42) }, uCanopyAlpha: { value: 0.5 } },
      vertexShader: BAMBOO_CANOPY_VERT, fragmentShader: BAMBOO_CANOPY_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(canopyMaterial);
    for (const [index, lift] of [10, 13].entries()) {
      const geometry = heightfield(-52, 52, -12, 124, 4, (x, z) => groundHeight(x, z) + lift + Math.sin(x * 0.3 + index) * 0.6);
      this.geometries.push(geometry);
      const material = index ? canopyMaterial.clone() : canopyMaterial;
      if (index) {
        material.uniforms.uRepeat.value = new THREE.Vector2(17, 20);
        material.uniforms.uCanopyColor.value = srgb(0x4f6e30);
        this.materials.push(material);
      }
      const plane = new THREE.Mesh(geometry, material);
      plane.name = `bamboo-canopy-${index}`;
      plane.frustumCulled = false;
      this.root.add(plane);
      this.canopies.push(plane);
    }

    this.buildFences();
    const brushMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: brush }, uLeafShade: { value: srgb(0xcdb27a) }, uLeafLit: { value: srgb(0xf0d898) }, uTransmit: { value: 0.1 } },
      vertexShader: BAMBOO_FOLIAGE_VERT, fragmentShader: BAMBOO_FOLIAGE_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(brushMaterial);
    this.brush = this.buildBrush(brushMaterial);

    this.lanternPoints = BAMBOO_LANTERNS.map((lantern) => ({ x: lantern.x, y: lantern.kind === "stone" ? lantern.y + STONE_LIGHT_Y : lantern.y, z: lantern.z }));
    this.windows = this.buildLanterns();
    this.glow = this.buildGlow();
    this.fireflies = this.buildFireflies();
    this.cityMaterial = this.buildCity(city);
    this.pavilions = buildBambooPavilions(scene, textures);
    this.root.add(this.pavilions.root);
  }

  private buildForest(stalkMaterial: THREE.ShaderMaterial, leafMaterial: THREE.ShaderMaterial) {
    const sites = bambooStalkSites();
    const { outer } = STALK_FIELD;
    const chunkW = (outer.maxX - outer.minX) / CHUNK_COLS, chunkD = (outer.maxZ - outer.minZ) / CHUNK_ROWS;
    const buckets: StalkSite[][] = Array.from({ length: CHUNK_COLS * CHUNK_ROWS }, () => []);
    for (const site of sites) {
      const col = Math.min(CHUNK_COLS - 1, Math.max(0, Math.floor((site.x - outer.minX) / chunkW)));
      const row = Math.min(CHUNK_ROWS - 1, Math.max(0, Math.floor((site.z - outer.minZ) / chunkD)));
      buckets[row * CHUNK_COLS + col].push(site);
    }
    // Five smooth-shaded sides read as round at a 5–10 cm radius and save a sixth of the forest's triangles.
    const stalkBase = new THREE.CylinderGeometry(0.82, 1, 1, 5, 1, true);
    stalkBase.translate(0, 0.5, 0);
    const quad = crossedQuadGeometry();
    this.geometries.push(stalkBase, quad);
    const rand = seededRandom(41);
    buckets.forEach((bucket, index) => {
      if (!bucket.length) return;
      // Shuffle so the first half is an even subsample for the low-quality cut.
      for (let i = bucket.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bucket[i], bucket[j]] = [bucket[j], bucket[i]]; }
      const col = index % CHUNK_COLS, row = Math.floor(index / CHUNK_COLS);
      const cx = outer.minX + (col + 0.5) * chunkW, cz = outer.minZ + (row + 0.5) * chunkD;
      const stalkGeometry = instanced(stalkBase, bucket.length);
      const stalk = new Float32Array(bucket.length * 4), seed = new Float32Array(bucket.length * 4), ground = new Float32Array(bucket.length);
      bucket.forEach((site, i) => {
        stalk.set([site.x, site.z, site.height, site.radius], i * 4);
        seed.set([site.phase, site.tint, site.leafAt, site.lean], i * 4);
        ground[i] = site.y;
      });
      stalkGeometry.setAttribute("aStalk", new THREE.InstancedBufferAttribute(stalk, 4));
      stalkGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
      stalkGeometry.setAttribute("aGround", new THREE.InstancedBufferAttribute(ground, 1));
      const radius = Math.hypot(chunkW / 2, chunkD / 2) + 20;
      stalkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 14, cz), radius);
      const stalks = new THREE.Mesh(stalkGeometry, stalkMaterial);
      stalks.name = `bamboo-stalks-${index}`;
      // Secondary clusters follow the primary ones so a halved count keeps every stalk's crown.
      const clusters: number[] = [], clusterSeeds: number[] = [];
      const push = (site: StalkSite, ratio: number, size: number) => {
        clusters.push(site.x + site.lean * site.height * ratio, site.y - 0.15 + site.height * ratio, site.z, size);
        clusterSeeds.push(site.phase, site.tint, site.phase * 3.1, ratio);
      };
      for (const site of bucket) push(site, site.leafAt, 2.3 + site.tint * 1.3);
      for (const site of bucket) if (site.tint > 0.62) push(site, 0.42 + site.tint * 0.25, 1.5 + site.tint * 0.7);
      const leafCount = clusters.length / 4;
      const leafGeometry = instanced(quad, leafCount);
      leafGeometry.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(new Float32Array(clusters), 4));
      leafGeometry.setAttribute("aLeafSeed", new THREE.InstancedBufferAttribute(new Float32Array(clusterSeeds), 4));
      leafGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 16, cz), radius);
      const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
      leaves.name = `bamboo-leaves-${index}`;
      leaves.renderOrder = 1;
      this.root.add(stalks, leaves);
      this.geometries.push(stalkGeometry, leafGeometry);
      this.chunks.push({ stalks, leaves, cx, cz, radius: Math.hypot(chunkW / 2, chunkD / 2), stalkCount: bucket.length, leafCount });
    });
  }

  private buildFences() {
    // Thin open tubes: the ends are never seen and five sides read as round at this radius.
    const rail = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), post = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    this.geometries.push(rail, post);
    const material = new THREE.MeshStandardMaterial({ color: 0xcdb678, roughness: 0.75 });
    this.materials.push(material);
    const rails = new THREE.InstancedMesh(rail, material, BAMBOO_FENCES.length * 2);
    const posts = new THREE.InstancedMesh(post, material, BAMBOO_FENCES.length);
    rails.name = "bamboo-fence-rails"; posts.name = "bamboo-fence-posts";
    const transform = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
    BAMBOO_FENCES.forEach((run, index) => {
      const ay = groundHeight(run.ax, run.az), by = groundHeight(run.bx, run.bz);
      direction.set(run.bx - run.ax, by - ay, run.bz - run.az);
      const length = direction.length();
      direction.normalize();
      [0.3, 0.58].forEach((y, rank) => {
        transform.position.set((run.ax + run.bx) / 2, (ay + by) / 2 + y, (run.az + run.bz) / 2);
        transform.quaternion.setFromUnitVectors(up, direction);
        transform.scale.set(0.028, length + 0.05, 0.028);
        transform.updateMatrix();
        rails.setMatrixAt(index * 2 + rank, transform.matrix);
      });
      transform.position.set(run.ax, ay + 0.36, run.az);
      transform.quaternion.identity();
      transform.scale.set(0.034, 0.74, 0.034);
      transform.updateMatrix();
      posts.setMatrixAt(index, transform.matrix);
    });
    for (const mesh of [rails, posts]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.root.add(mesh); }
  }

  private buildBrush(material: THREE.ShaderMaterial): THREE.Mesh | null {
    const sites = bambooBrushSites();
    if (!sites.length) return null;
    const quad = crossedQuadGeometry();
    quad.translate(0, 0.5, 0);
    this.geometries.push(quad);
    const geometry = instanced(quad, sites.length);
    const placement = new Float32Array(sites.length * 4), seeds = new Float32Array(sites.length * 4);
    sites.forEach((site, i) => {
      placement.set([site.x, site.y - 0.05, site.z, site.size], i * 4);
      seeds.set([site.seed * 6.28, site.seed, site.yaw, 0.35], i * 4);
    });
    geometry.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aLeafSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 55), 90);
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "bamboo-brush";
    mesh.renderOrder = 1;
    this.root.add(mesh);
    return mesh;
  }

  private buildLanterns(): THREE.InstancedMesh {
    const stones = BAMBOO_LANTERNS.filter((lantern) => lantern.kind === "stone");
    const body = stoneLanternGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const bodies = new THREE.InstancedMesh(body, material, stones.length);
    bodies.name = "bamboo-stone-lanterns";
    const window = new THREE.BoxGeometry(0.27, 0.26, 0.27);
    const windows = new THREE.InstancedMesh(window, this.windowMaterial, stones.length);
    windows.name = "bamboo-lantern-windows";
    const transform = new THREE.Object3D();
    stones.forEach((lantern, index) => {
      transform.position.set(lantern.x, lantern.y, lantern.z);
      transform.rotation.set(0, lantern.yaw, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      bodies.setMatrixAt(index, transform.matrix);
      transform.position.y = lantern.y + STONE_LIGHT_Y;
      transform.updateMatrix();
      windows.setMatrixAt(index, transform.matrix);
    });
    for (const mesh of [bodies, windows]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.root.add(mesh); }
    this.geometries.push(body, window);
    this.materials.push(material, this.windowMaterial);
    return windows;
  }

  private buildGlow(): THREE.Mesh {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometries.push(quad);
    const geometry = instanced(quad, BAMBOO_LANTERNS.length);
    const placement = new Float32Array(BAMBOO_LANTERNS.length * 4), seeds = new Float32Array(BAMBOO_LANTERNS.length * 2);
    BAMBOO_LANTERNS.forEach((lantern: TrailLantern, i) => {
      placement.set([lantern.x, lantern.kind === "stone" ? lantern.y + STONE_LIGHT_Y : lantern.y, lantern.z, lantern.kind === "stone" ? 1.7 : 2.0], i * 4);
      seeds.set([(i * 0.173) % 1, 0], i * 2);
    });
    geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aGlowSeed", new THREE.InstancedBufferAttribute(seeds, 2));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 55), 90);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uNight: this.light.uNight, uGlowColor: { value: srgb(0xffa24e) } },
      vertexShader: BAMBOO_GLOW_VERT, fragmentShader: BAMBOO_GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "bamboo-lantern-glow";
    mesh.renderOrder = 4;
    mesh.visible = false;
    this.root.add(mesh);
    return mesh;
  }

  private buildFireflies(): THREE.Points {
    const rand = seededRandom(53), count = this.mobile ? 70 : 100;
    const loop = TRAIL_POLYLINES[0].points;
    const flies = new Float32Array(count * 4), positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [px, pz] = loop[Math.floor(rand() * loop.length)];
      const x = px + (rand() - 0.5) * 9, z = pz + (rand() - 0.5) * 9, y = groundHeight(x, z) + 0.7 + rand() * 1.9;
      flies.set([x, y, z, rand() * 6.28], i * 4);
      positions.set([x, y, z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aFly", new THREE.BufferAttribute(flies, 4));
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uNight: this.light.uNight, uFlyColor: { value: srgb(0xd7ff7a) } },
      vertexShader: BAMBOO_FIREFLY_VERT, fragmentShader: BAMBOO_FIREFLY_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.materials.push(material);
    const points = new THREE.Points(geometry, material);
    points.name = "bamboo-fireflies";
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.visible = false;
    this.root.add(points);
    return points;
  }

  /** The distant city: a single panel beyond the north slope, outside the fog, facing the summit. */
  private buildCity(texture: THREE.Texture): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uCity: { value: texture }, uNight: { value: 0 }, uLights: { value: 0 }, uTime: this.time,
        uHaze: { value: srgb(0x9fb5bf) }, uHazeNight: { value: srgb(0x0a1420) },
      },
      vertexShader: BAMBOO_CITY_VERT, fragmentShader: BAMBOO_CITY_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.materials.push(material);
    const geometry = new THREE.PlaneGeometry(CITY.width, CITY.height);
    this.geometries.push(geometry);
    const panel = new THREE.Mesh(geometry, material);
    panel.name = "bamboo-city";
    panel.position.set(0, CITY.y, CITY.z);
    panel.rotation.y = Math.PI;
    panel.renderOrder = 1;
    this.root.add(panel);
    return material;
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1), lamps = THREE.MathUtils.clamp(d.lanterns, 0, 1);
    this.lampAmount = lamps;
    const sunUp = d.sun[1] > -0.02;
    const direction = sunUp ? d.sun : d.moon;
    this.sun.position.set(direction[0] * 60, Math.max(12, direction[1] * 60), direction[2] * 60);
    if (sunUp) this.sun.color.setRGB(...d.sunColor, THREE.SRGBColorSpace);
    else this.sun.color.setRGB(0.6, 0.68, 0.92, THREE.SRGBColorSpace);
    this.sun.intensity = sunUp ? 0.5 + Math.max(0, direction[1]) * 0.9 : 0.22;
    this.hemi.color.setRGB(...d.skyHorizon, THREE.SRGBColorSpace).lerp(new THREE.Color(0xc8e39a), 0.4).lerp(new THREE.Color(0x3a4f6e), night * 0.85);
    this.hemi.groundColor.setRGB(0.36, 0.29, 0.2, THREE.SRGBColorSpace).lerp(new THREE.Color(0x101814), night * 0.8);
    this.hemi.intensity = THREE.MathUtils.lerp(1.05, 0.64, night);
    this.light.uSunDir.value.set(direction[0], direction[1], direction[2]).normalize();
    this.light.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 1.15);
    this.light.uAmbient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.62);
    this.light.uGroundAmbient.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity * 0.62);
    this.light.uNight.value = lamps;
    this.groundMaterial.uniforms.uDapple.value = 0.5 * (1 - night);
    this.windowMaterial.color.setHex(0x2a2622).lerp(new THREE.Color(0xffc37a), lamps);
    this.glow.visible = lamps > 0.01;
    this.fireflies.visible = lamps > 0.05 && !this.low;
    for (const lamp of this.lamps) { lamp.intensity = LAMP_INTENSITY * lamps; lamp.visible = lamps > 0.01; }
    this.cityMaterial.uniforms.uNight.value = night;
    this.cityMaterial.uniforms.uLights.value = Math.max(lamps, night * 0.9);
    (this.cityMaterial.uniforms.uHaze.value as THREE.Color).setRGB(...d.fog, THREE.SRGBColorSpace).lerp(new THREE.Color(0xa9bdc6), 0.5);
    (this.cityMaterial.uniforms.uHazeNight.value as THREE.Color).setRGB(...d.fog, THREE.SRGBColorSpace).multiplyScalar(0.8);
    this.pavilions.applyDaylight(d);
    this.lastLampAt.t = -Infinity;
  }

  update(time: number, camera: THREE.Camera, walker?: BambooWalker) {
    if (this.disposed || !Number.isFinite(time)) return;
    this.time.value = time;
    const position = camera.getWorldPosition(new THREE.Vector3());
    for (const chunk of this.chunks) {
      const reach = Math.hypot(chunk.cx - position.x, chunk.cz - position.z) - chunk.radius;
      chunk.stalks.visible = reach < STALK_RADIUS;
      chunk.leaves.visible = reach < this.leafRadius;
    }
    const x = walker?.x ?? position.x, z = walker?.z ?? position.z;
    const moved = Math.hypot(x - this.lastLampAt.x, z - this.lastLampAt.z);
    if (!(moved < 0.9) || time - this.lastLampAt.t > 1.2) {
      this.lastLampAt = { x, z, t: time };
      const nearest = this.lanternPoints.map((point) => ({ point, d: Math.hypot(point.x - x, point.z - z) })).sort((a, b) => a.d - b.d);
      const active = this.low ? 2 : 4;
      for (let i = 0; i < 4; i++) {
        const entry = nearest[i], lamp = this.lamps[i], uniform = this.light.uLanterns.value[i];
        if (!entry || i >= active) { uniform.set(0, -100, 0, 0); lamp.intensity = 0; continue; }
        lamp.position.set(entry.point.x, entry.point.y, entry.point.z);
        lamp.intensity = LAMP_INTENSITY * this.lampAmount;
        uniform.set(entry.point.x, entry.point.y, entry.point.z, 2.2);
      }
    }
  }

  setQuality(low: boolean) {
    if (this.disposed || this.low === low) return;
    this.low = low;
    this.leafRadius = low ? LEAF_RADIUS.low : LEAF_RADIUS.high;
    for (const chunk of this.chunks) {
      chunk.stalks.geometry.instanceCount = low ? Math.ceil(chunk.stalkCount * 0.55) : chunk.stalkCount;
      chunk.leaves.geometry.instanceCount = low ? Math.ceil(chunk.leafCount * 0.5) : chunk.leafCount;
    }
    if (this.brush) this.brush.visible = !low;
    if (this.canopies[1]) this.canopies[1].visible = !low;
    this.fireflies.visible = this.lampAmount > 0.05 && !low;
    this.lastLampAt.t = -Infinity;
  }

  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pavilions.dispose();
    this.root.removeFromParent();
    this.root.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.root.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const lamp of this.lamps) lamp.dispose();
    this.sun.dispose();
    this.hemi.dispose();
  }
}
