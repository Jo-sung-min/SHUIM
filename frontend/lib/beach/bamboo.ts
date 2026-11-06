import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { assetLoader, assetUrl } from "../assets";
import type { Daylight } from "./daylight";
import {
  BAMBOO_FENCES, BAMBOO_LANTERNS, BAMBOO_PAVILIONS, DECK_YARD, MEADOW, NORTH_FACE, PAVILION_YARD_HALF, SECRET_GARDEN, STALK_FIELD, SUMMIT, TRAIL_POLYLINES, TRAIL_WIDTH,
  bambooBrushSites, bambooFloorHeight, bambooStalkSites, groundHeight, insideSecretGarden, seededRandom, summitGroveSites, type StalkSite, type TrailLantern,
} from "./bamboo-trail";
import { BAMBOO_TERRAIN_GRID, bambooTerrainHeight, createHeightfieldData, sampleHeightfield, type HeightfieldData } from "./bamboo-terrain";
import { secretGardenEntranceCanopy, secretGardenLowScreen, secretGardenScreenSites } from "./bamboo-garden-screen";
import {
  BAMBOO_CANOPY_FRAG, BAMBOO_CANOPY_VERT, BAMBOO_FIREFLY_FRAG, BAMBOO_FIREFLY_VERT,
  BAMBOO_FOLIAGE_FRAG, BAMBOO_FOLIAGE_VERT, BAMBOO_GLOW_FRAG, BAMBOO_GLOW_VERT, BAMBOO_GROUND_FRAG, BAMBOO_GROUND_VERT,
  BAMBOO_STALK_FRAG, BAMBOO_STALK_VERT,
} from "./bamboo-shader";
import { buildBambooOverlook } from "./bamboo-overlook";
import { buildBambooGuestbook } from "./bamboo-guestbook";
import type { BambooNote } from "./bamboo-notes";
import { buildBambooPavilions, type BambooPavilionSet } from "./bamboo-pavilions";
import { BAMBOO_PHOTO_LIGHTS, buildBambooPhotoSpots } from "./bamboo-photo-spots";
import { buildBambooSecretGarden, SECRET_GARDEN_LIGHTS } from "./bamboo-secret-garden";

export interface BambooWalker { x: number; z: number; moving: boolean }

/** World extent baked into the ground mask: path, stone slabs and lantern pools in one texture. */
const MASK = { minX: -76, minZ: -40, width: 152, depth: 194, sizeX: 1024, sizeZ: 1536 } as const;
const CHUNK_COLS = 6, CHUNK_ROWS = 8;
const LEAF_RADIUS = { high: 32, low: 22 } as const;
const SUMMIT_LEAF_RADIUS = 48;
/** Chunks whose nearest point is beyond the fog (62 m) are not drawn at all. */
const STALK_RADIUS = 56;
const STONE_LIGHT_Y = 0.83;
const LAMP_INTENSITY = 12;
interface Chunk {
  stalks: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  leaves: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  cx: number; cz: number; radius: number;
  stalkCount: number; leafCount: number;
  groveStalks: number; groveLeaves: number;
}

const srgb = (hex: number) => new THREE.Color(hex);

/** Terrain meshes share their repeating maps and keep their old colors until ready. */
export function buildBambooGroundTextures() {
  const uniforms = {
    uGrassMap: { value: null as THREE.Texture | null }, uGrassReady: { value: 0 },
    uSoilMap: { value: null as THREE.Texture | null }, uSoilReady: { value: 0 },
    uForestMap: { value: null as THREE.Texture | null }, uForestReady: { value: 0 },
    uGardenMap: { value: null as THREE.Texture | null }, uGardenReady: { value: 0 },
    uGroundTileScale: { value: 1 / 3.5 },
  };
  type Request = { texture: THREE.Texture | null; cancelled: boolean; released: boolean };
  const slots = [
    { url: "/beach/real/bamboo-grass-v1.webp", map: uniforms.uGrassMap, ready: uniforms.uGrassReady, request: null as Request | null, retryAt: 0 },
    { url: "/beach/real/bamboo-soil-v1.webp", map: uniforms.uSoilMap, ready: uniforms.uSoilReady, request: null as Request | null, retryAt: 0 },
    { url: "/beach/real/bamboo-forest-floor-v1.webp", map: uniforms.uForestMap, ready: uniforms.uForestReady, request: null as Request | null, retryAt: 0 },
    { url: "/beach/real/bamboo-garden-ground-v1.webp", map: uniforms.uGardenMap, ready: uniforms.uGardenReady, request: null as Request | null, retryAt: 0 },
  ];
  const loader = assetLoader(new THREE.TextureLoader());
  let disposed = false;
  const release = (request: Request) => {
    request.cancelled = true;
    if (request.texture && !request.released) { request.texture.dispose(); request.released = true; }
  };
  const configure = (texture: THREE.Texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
  };
  const update = (now = Date.now()) => {
    if (disposed) return;
    for (const slot of slots) {
      if (slot.request || now < slot.retryAt) continue;
      const request: Request = { texture: null, cancelled: false, released: false };
      slot.request = request;
      const failed = () => {
        if (slot.request === request) {
          slot.request = null; slot.retryAt = Date.now() + 15_000;
          slot.map.value = null; slot.ready.value = 0;
        }
        release(request);
      };
      try {
        request.texture = loader.load(assetUrl(slot.url), texture => {
          request.texture ??= texture;
          if (disposed || request.cancelled || slot.request !== request) { release(request); return; }
          configure(texture);
          slot.map.value = texture; slot.ready.value = 1;
        }, undefined, failed);
        configure(request.texture);
        // A cached response or synchronous loader failure may finish before load returns.
        if (disposed || request.cancelled) release(request);
      } catch { failed(); }
    }
  };
  update();
  return {
    uniforms, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) {
        if (slot.request) release(slot.request);
        slot.request = null; slot.map.value = null; slot.ready.value = 0;
      }
    },
  };
}

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

/** Store the actual bamboo root coverage in alpha without altering the path/light RGB channels. */
export function writeBambooForestMask(data: Uint8ClampedArray, width: number, height: number,
  rect: { minX: number; minZ: number; width: number; depth: number }, sites: readonly { x: number; z: number }[]) {
  const sx = width / rect.width, sz = height / rect.depth, radius = 2.7;
  for (let i = 3; i < data.length; i += 4) data[i] = 0;
  for (const site of sites) {
    const left = Math.max(0, Math.floor((site.x - radius - rect.minX) * sx));
    const right = Math.min(width - 1, Math.ceil((site.x + radius - rect.minX) * sx));
    const top = Math.max(0, Math.floor((site.z - radius - rect.minZ) * sz));
    const bottom = Math.min(height - 1, Math.ceil((site.z + radius - rect.minZ) * sz));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const wx = rect.minX + (x + .5) / sx, wz = rect.minZ + (y + .5) / sz;
      if (insideSecretGarden(wx, wz, .05)) continue;
      const strength = THREE.MathUtils.clamp((radius - Math.hypot(wx - site.x, wz - site.z)) / 1.3, 0, 1);
      const index = (y * width + x) * 4 + 3;
      data[index] = Math.max(data[index], Math.round(strength * strength * (3 - 2 * strength) * 255));
    }
  }
}

/** r: earth path/yard, g: slabs, b: light pools, a: bamboo roots. RGB is drawn opaque, then uploaded as raw RGBA. */
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
    const strength = lantern.pavilionId === "summit" ? .65 : 1;
    gradient.addColorStop(0, `rgba(0,0,255,${.95 * strength})`); gradient.addColorStop(0.4, `rgba(0,0,255,${.45 * strength})`); gradient.addColorStop(1, "rgba(0,0,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(lantern.x - radius, lantern.z - radius, radius * 2, radius * 2);
  }
  const pixels = ctx.getImageData(0, 0, MASK.sizeX, MASK.sizeZ).data;
  writeBambooForestMask(pixels, MASK.sizeX, MASK.sizeZ, MASK,
    [...bambooStalkSites(), ...summitGroveSites(groundHeight), ...secretGardenScreenSites(groundHeight)]);
  // DataTexture preserves independent alpha; a transparent CanvasTexture would premultiply its RGB masks.
  const texture = new THREE.DataTexture(new Uint8Array(pixels.buffer), MASK.sizeX, MASK.sizeZ, THREE.RGBAFormat);
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function heightfieldGeometry(data: HeightfieldData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
function heightfield(minX: number, maxX: number, minZ: number, maxZ: number, cell: number, lift: (x: number, z: number) => number): THREE.BufferGeometry {
  return heightfieldGeometry(createHeightfieldData({ minX, maxX, minZ, maxZ, cell }, lift));
}

function colored(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex), count = geometry.getAttribute("position").count, values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(values, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

/** A small stone lantern (석등): base, column, open light box between corner bars, hexagonal cap. */
export function stoneLanternGeometry(): THREE.BufferGeometry {
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
  private readonly groundSurface = createHeightfieldData(BAMBOO_TERRAIN_GRID, bambooTerrainHeight);
  private readonly groundAt = (x: number, z: number) => sampleHeightfield(this.groundSurface, x, z) ?? bambooTerrainHeight(x, z);
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
  private readonly groundTextures: ReturnType<typeof buildBambooGroundTextures>;
  private readonly chunks: Chunk[] = [];
  private readonly canopies: THREE.Mesh[] = [];
  private readonly brush: THREE.Mesh | null = null;
  private readonly glow: THREE.Mesh;
  private readonly fireflies: THREE.Points;
  private readonly windows: THREE.InstancedMesh;
  private readonly windowMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2622, toneMapped: false });
  private readonly overlook: ReturnType<typeof buildBambooOverlook>;
  private readonly guestbook: ReturnType<typeof buildBambooGuestbook>;
  private readonly photoSpots: ReturnType<typeof buildBambooPhotoSpots>;
  private readonly secretGarden: ReturnType<typeof buildBambooSecretGarden>;
  private readonly pavilions: BambooPavilionSet;
  private readonly lanternPoints: { x: number; y: number; z: number; color?: number; strength?: number }[];
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

    const mask = groundMaskTexture(), leaf = leafClusterTexture(), canopy = canopyTexture(), brush = brushTexture();
    this.textures.push(mask, leaf, canopy, brush);
    this.groundTextures = buildBambooGroundTextures();
    const shared = () => ({ ...this.light, uTime: this.time, uSway: this.sway, uClearings: this.clearings, ...this.fogUniforms });

    this.groundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...this.groundTextures.uniforms,
        uGardenRect: { value: new THREE.Vector4(SECRET_GARDEN.minX, SECRET_GARDEN.minZ, SECRET_GARDEN.maxX, SECRET_GARDEN.maxZ) },
        ...shared(), uMask: { value: mask }, uMaskRect: { value: new THREE.Vector4(MASK.minX, MASK.minZ, 1 / MASK.width, 1 / MASK.depth) },
        uDapple: { value: 0.45 },
        uLitter: { value: srgb(0x4f3a26) }, uLitterLight: { value: srgb(0x8a6a44) }, uMoss: { value: srgb(0x4f6b2c) },
        uGrass: { value: srgb(0x5f7f33) }, uGrassLight: { value: srgb(0x97b24f) },
        uEarth: { value: srgb(0x84786a) }, uEarthLight: { value: srgb(0xb5aa98) },
        uStone: { value: srgb(0x6f716b) }, uStoneLight: { value: srgb(0xa9aaa2) },
        uPoolColor: { value: srgb(0xff9a3c).multiplyScalar(0.55) },
      },
      vertexShader: BAMBOO_GROUND_VERT, fragmentShader: BAMBOO_GROUND_FRAG, fog: true,
    });
    this.materials.push(this.groundMaterial);
    // The actor stands on these same fine-grid triangles. The coarse background is
    // a true skirt: it cannot protrude through an uphill path or the western garden.
    const slope = bambooTerrainHeight;
    const inner = heightfieldGeometry(this.groundSurface);
    const outer = heightfieldGeometry(createHeightfieldData({ minX: -100, maxX: 100, minZ: -60, maxZ: 180, cell: 6 },
      (x, z) => slope(x, z) - 0.15, BAMBOO_TERRAIN_GRID));
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
    this.buildForest(stalkMaterial, leafMaterial, slope);

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

    this.lanternPoints = [...BAMBOO_PHOTO_LIGHTS, ...BAMBOO_LANTERNS.map((lantern) => ({
      x: lantern.x, y: lantern.kind === "stone" ? lantern.y + STONE_LIGHT_Y : lantern.y, z: lantern.z,
      strength: lantern.pavilionId === "summit" ? .65 : 1,
    }))];
    this.windows = this.buildLanterns();
    this.glow = this.buildGlow();
    this.fireflies = this.buildFireflies();
    this.overlook = buildBambooOverlook(this.root, this.time);
    this.guestbook = buildBambooGuestbook(this.root);
    this.photoSpots = buildBambooPhotoSpots(this.root, mobile);
    this.secretGarden = buildBambooSecretGarden(this.root, this.time);
    this.secretGarden.setQuality(mobile);
    this.pavilions = buildBambooPavilions(scene, textures);
    this.root.add(this.pavilions.root);
  }

  private buildForest(stalkMaterial: THREE.ShaderMaterial, leafMaterial: THREE.ShaderMaterial, heightAt: (x: number, z: number) => number) {
    const sites = bambooStalkSites();
    const screens = secretGardenScreenSites(heightAt), screenSites = new Set(screens);
    const { outer } = STALK_FIELD;
    const chunkW = (outer.maxX - outer.minX) / CHUNK_COLS, chunkD = (outer.maxZ - outer.minZ) / CHUNK_ROWS;
    const buckets: StalkSite[][] = Array.from({ length: CHUNK_COLS * CHUNK_ROWS }, () => []);
    const groves: StalkSite[][] = Array.from({ length: buckets.length }, () => []);
    const entranceCanopy: ReturnType<typeof secretGardenEntranceCanopy>[] = Array.from({ length: buckets.length }, () => []);
    const chunkIndex = (site: { x: number; z: number }) => {
      const col = Math.min(CHUNK_COLS - 1, Math.max(0, Math.floor((site.x - outer.minX) / chunkW)));
      const row = Math.min(CHUNK_ROWS - 1, Math.max(0, Math.floor((site.z - outer.minZ) / chunkD)));
      return row * CHUNK_COLS + col;
    };
    for (const site of sites) buckets[chunkIndex(site)].push(site);
    for (const site of [...summitGroveSites(heightAt), ...screens]) groves[chunkIndex(site)].push(site);
    for (const leaf of [...secretGardenEntranceCanopy(heightAt), ...secretGardenLowScreen(heightAt)]) entranceCanopy[chunkIndex(leaf)].push(leaf);
    // Five smooth-shaded sides read as round at a 5–10 cm radius and save a sixth of the forest's triangles.
    const stalkBase = new THREE.CylinderGeometry(0.82, 1, 1, 5, 1, true);
    stalkBase.translate(0, 0.5, 0);
    const quad = crossedQuadGeometry();
    this.geometries.push(stalkBase, quad);
    const rand = seededRandom(41);
    buckets.forEach((bucket, index) => {
      const grove = groves[index];
      if (!bucket.length && !grove.length && !entranceCanopy[index].length) return;
      // Shuffle so the first half is an even subsample for the low-quality cut.
      for (let i = bucket.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bucket[i], bucket[j]] = [bucket[j], bucket[i]]; }
      const stems = [...grove, ...bucket];
      const col = index % CHUNK_COLS, row = Math.floor(index / CHUNK_COLS);
      const cx = outer.minX + (col + 0.5) * chunkW, cz = outer.minZ + (row + 0.5) * chunkD;
      const stalkGeometry = instanced(stalkBase, stems.length);
      const stalk = new Float32Array(stems.length * 4), seed = new Float32Array(stems.length * 4), ground = new Float32Array(stems.length);
      stems.forEach((site, i) => {
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
      for (const leaf of entranceCanopy[index]) {
        clusters.push(leaf.x, leaf.y, leaf.z, leaf.size);
        clusterSeeds.push(leaf.phase, leaf.tint, leaf.yaw, .35);
      }
      const push = (site: StalkSite, ratio: number, size: number, branch = 0) => {
        const yaw = site.phase * 3.1 + branch;
        clusters.push(site.x + site.lean * site.height * ratio + Math.sin(yaw) * branch * 0.22,
          site.y - 0.15 + site.height * ratio, site.z + Math.cos(yaw) * branch * 0.22, size);
        clusterSeeds.push(site.phase, site.tint, yaw, ratio);
      };
      for (const site of grove) {
        if (screenSites.has(site)) {
          // Four overlapping leafy tiers and a crown conceal the backing's face
          // and straight top edge without introducing an opaque entrance blocker.
          push(site, site.leafAt, 4.2 + site.tint, .4);
          push(site, .67, 4.1 + site.tint * .7, 2.3);
          push(site, .43, 4.0 + site.tint * .7, 3.6);
          push(site, .20, 3.8 + site.tint * .6, 4.8);
          push(site, 1, 4.2 + site.tint * .8, 1.1);
          continue;
        }
        // Low arches, side branches and crowns overlap at different depths.
        // The same perforated bamboo leaves still reveal stems and shafts of light.
        push(site, site.leafAt, 3.7 + site.tint * 1.5);
        push(site, .42 + .13 * site.tint, 3.8 + site.tint * 1.1, 2.3);
        if (site.height > 5) push(site, .20 + .12 * site.tint, 3.3 + site.tint * .9, 3.6);
      }
      const groveLeaves = clusters.length / 4;
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
      this.chunks.push({ stalks, leaves, cx, cz, radius: Math.hypot(chunkW / 2, chunkD / 2),
        stalkCount: stems.length, leafCount, groveStalks: grove.length, groveLeaves });
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
      placement.set([lantern.x, lantern.kind === "stone" ? lantern.y + STONE_LIGHT_Y : lantern.y, lantern.z, lantern.pavilionId === "summit" ? 1.5 : lantern.kind === "stone" ? 1.7 : 2.0], i * 4);
      seeds.set([(i * 0.173) % 1, lantern.pavilionId === "summit" ? 1 : 0], i * 2);
    });
    geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aGlowSeed", new THREE.InstancedBufferAttribute(seeds, 2));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 55), 90);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uNight: this.light.uNight, uGlowColor: { value: srgb(0xffa24e) } },
      vertexShader: BAMBOO_GLOW_VERT.replace("vec4 center = viewMatrix", "vFlicker *= 1.0 - .35 * aGlowSeed.y;\n  vec4 center = viewMatrix"), fragmentShader: BAMBOO_GLOW_FRAG,
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

  floorHeight(x: number, z: number): number {
    return bambooFloorHeight(x, z, this.groundAt);
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1), lamps = THREE.MathUtils.clamp(d.lanterns, 0, 1);
    this.lampAmount = lamps;
    this.guestbook.setLanternAmount(lamps);
    this.photoSpots.setNight(lamps);
    this.secretGarden.applyDaylight(d);
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
    this.overlook.applyDaylight(d);
    this.pavilions.applyDaylight(d);
    this.lastLampAt.t = -Infinity;
  }

  update(time: number, camera: THREE.Camera, walker?: BambooWalker) {
    if (this.disposed || !Number.isFinite(time)) return;
    this.groundTextures.update();
    this.time.value = time;
    const position = camera.getWorldPosition(new THREE.Vector3());
    for (const chunk of this.chunks) {
      const reach = Math.hypot(chunk.cx - position.x, chunk.cz - position.z) - chunk.radius;
      chunk.stalks.visible = reach < STALK_RADIUS;
      const nearby = reach < this.leafRadius;
      chunk.leaves.visible = nearby || (chunk.groveLeaves > 0 && reach < SUMMIT_LEAF_RADIUS);
      // Beyond the ordinary forest's LOD distance, retain only the summit prefix.
      const fieldLeaves = chunk.leafCount - chunk.groveLeaves;
      chunk.leaves.geometry.instanceCount = chunk.groveLeaves + (nearby ? (this.low ? Math.ceil(fieldLeaves / 2) : fieldLeaves) : 0);
    }
    const x = walker?.x ?? position.x, z = walker?.z ?? position.z;
    this.secretGarden.update(time, { x, z });
    const moved = Math.hypot(x - this.lastLampAt.x, z - this.lastLampAt.z);
    if (!(moved < 0.9) || time - this.lastLampAt.t > 1.2) {
      this.lastLampAt = { x, z, t: time };
      const candidates = insideSecretGarden(x, z) ? [...this.lanternPoints, ...SECRET_GARDEN_LIGHTS] : this.lanternPoints;
      const nearest = candidates.map((point) => ({ point, d: Math.hypot(point.x - x, point.z - z) })).sort((a, b) => a.d - b.d);
      const active = this.low ? 2 : 4;
      for (let i = 0; i < 4; i++) {
        const entry = nearest[i], lamp = this.lamps[i], uniform = this.light.uLanterns.value[i];
        if (!entry || i >= active) { uniform.set(0, -100, 0, 0); lamp.intensity = 0; continue; }
        lamp.position.set(entry.point.x, entry.point.y, entry.point.z);
        lamp.color.setHex(entry.point.color ?? 0xffb46a);
        const strength = entry.point.strength ?? 1;
        lamp.intensity = LAMP_INTENSITY * this.lampAmount * strength;
        uniform.set(entry.point.x, entry.point.y, entry.point.z, 2.2 * strength);
      }
    }
  }

  setQuality(low: boolean) {
    if (this.disposed || this.low === low) return;
    this.low = low;
    this.secretGarden.setQuality(low);
    this.leafRadius = low ? LEAF_RADIUS.low : LEAF_RADIUS.high;
    for (const chunk of this.chunks) {
      chunk.stalks.geometry.instanceCount = low ? chunk.groveStalks + Math.ceil((chunk.stalkCount - chunk.groveStalks) * 0.55) : chunk.stalkCount;
    }
    if (this.brush) this.brush.visible = !low;
    if (this.canopies[1]) this.canopies[1].visible = !low;
    this.fireflies.visible = this.lampAmount > 0.05 && !low;
    this.lastLampAt.t = -Infinity;
  }

  setGuestbookEntries(entries: readonly BambooNote[]) {
    this.guestbook.setEntries(entries);
  }
  clipGuestbookCamera(x: number, y: number, z: number, target: THREE.Vector3) {
    this.guestbook.clipCamera(x, y, z, target);
  }

  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.groundTextures.dispose();
    this.overlook.dispose();
    this.guestbook.dispose();
    this.photoSpots.dispose();
    this.secretGarden.dispose();
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
