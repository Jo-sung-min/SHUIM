import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import { seededRandom } from "./bamboo-trail";
import {
  GARDEN_LANTERNS, GARDEN_PAVILIONS, GARDEN_WILLOWS, GROUND_Y, HALL, LAKE, WATER_Y, gardenPavilionWorld, lakeSigned, lotusPads, reedSites, type BoatStop,
} from "./garden-layout";
import {
  GARDEN_MASK, LAKE_MASK, gardenGroundMaskTexture, inkMountainTexture, lakeDistanceTexture, lotusFlowerTexture, lotusPadTexture, mistTexture, reedTexture, willowTexture,
} from "./garden-ink";
import {
  GARDEN_FOLIAGE_FRAG, GARDEN_FOLIAGE_VERT, GARDEN_GROUND_FRAG, GARDEN_GROUND_VERT, GARDEN_MIST_FRAG, GARDEN_MIST_VERT, GARDEN_MOUNTAIN_FRAG, GARDEN_MOUNTAIN_VERT,
  GARDEN_PAD_FRAG, GARDEN_PAD_VERT, GARDEN_RIPPLE_COUNT, GARDEN_SPRITE_FRAG, GARDEN_SPRITE_VERT, GARDEN_TREE_FRAG, GARDEN_TREE_VERT, GARDEN_WATER_FRAG, GARDEN_WATER_VERT,
} from "./garden-shader";
import { buildGardenStructures, toonGradient, type GardenStructures } from "./garden-hall";
import { GardenBoats, type BoatRideState, type RemoteRider } from "./garden-boat";
import { GardenRain } from "./garden-rain";
import { PAVILION_POST_HEIGHT } from "./bamboo-trail";
import { buildGardenLandscapeDetail } from "./garden-landscape-detail";
import { GardenSeatLight } from "./garden-seat-light";
import { GardenPond } from "./garden-pond";
import type { GardenMoment } from "./net";

export interface GardenWalker { x: number; z: number; moving: boolean }
export type GardenSkyUniforms = Record<string, THREE.IUniform>;

const LAMP_INTENSITY = 10;
const TREE_LEAF_CLUSTERS = 20;
const TREE_LEAF_CLUSTERS_LOW = 16;
const srgb = (hex: number) => new THREE.Color(hex);

function instanced(base: THREE.BufferGeometry, count: number): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  if (base.getAttribute("normal")) geometry.setAttribute("normal", base.getAttribute("normal"));
  if (base.getIndex()) geometry.setIndex(base.getIndex());
  geometry.instanceCount = count;
  return geometry;
}

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

/** 호숫가 땅: 물가에서 1 m 안쪽부터 물 밑으로 완만히 꺼진다. 걷는 땅은 GROUND_Y. */
export function bankHeight(x: number, z: number): number {
  const s = lakeSigned(x, z);
  if (s >= 0.4) return GROUND_Y;
  const t = Math.max(0, Math.min(1, (s + 1.0) / 1.4));
  return -0.6 + (GROUND_Y + 0.6) * t * t * (3 - 2 * t);
}

/**
 * 봄물 정원 세계. 땅은 물가로 꺼지는 높이맵, 물은 평면 한 장(하늘 해석 반사 + 저해상도 반사 렌더 타깃),
 * 원경은 생성한 봄 산수 파노라마, 버드나무·연잎·갈대는 인스턴스 빌보드, 건축과 소품은 소재별로 병합.
 * 밤에는 석등·창·샹들리에가 켜지고 가까운 점광원 4개가 비춘다. 비는 세기 하나로 물·유리·빗줄기·안개·조명을 함께 바꾼다.
 */
export class GardenWorld {
  private readonly root = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight(0xe6e9e2, 0x6a6558, 1.0);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 0.85);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly fogUniforms = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  private readonly time = { value: 0 };
  private readonly sway = { value: 1 };
  private readonly wet = { value: 0 };
  private readonly light = {
    uAmbient: { value: new THREE.Color(0.45, 0.47, 0.42) },
    uGroundAmbient: { value: new THREE.Color(0.22, 0.2, 0.17) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(0.9, 0.88, 0.82) },
    uNight: { value: 0 },
    uLanternColor: { value: srgb(0xffb064) },
    uLanterns: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -100, 0, 0)) },
    uInkRim: { value: 0.07 },
  };
  private readonly groundMaterial: THREE.ShaderMaterial;
  private readonly water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly mountains: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly mist: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly willowStrands: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly reeds: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly structures: GardenStructures;
  private readonly seatLight: GardenSeatLight;
  private readonly pond: GardenPond;
  private readonly landscapeDetail: ReturnType<typeof buildGardenLandscapeDetail>;
  private readonly boats: GardenBoats;
  private readonly rain: GardenRain;
  private readonly gradient: THREE.DataTexture;
  private readonly lanternPoints: { x: number; y: number; z: number; color?: number }[];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly ripples = Array.from({ length: GARDEN_RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, -10000, 0));
  private nextRipple = 0;
  private readonly reflection: { target: THREE.WebGLRenderTarget; camera: THREE.PerspectiveCamera; matrix: THREE.Matrix4 };
  private lampAmount = 0;
  private rainAmount = 0;
  private daylight: Daylight | null = null;
  private low = false;
  private lastLampAt = { x: NaN, z: NaN, t: -Infinity };
  private disposed = false;

  constructor(private readonly scene: THREE.Scene, skyUniforms: GardenSkyUniforms, textures: { wood: THREE.Texture; landscape?: THREE.Texture; willow?: THREE.Texture; grass?: THREE.Texture }, private readonly mobile = false) {
    this.root.name = "garden";
    scene.add(this.root);
    this.hemi.name = "garden-sky-light"; this.sun.name = "garden-sun";
    this.sun.position.set(18, 50, -20); this.sun.castShadow = false;
    this.root.add(this.hemi, this.sun);
    for (let i = 0; i < 4; i++) {
      const lamp = new THREE.PointLight(0xffb46a, 0, 10, 2);
      lamp.name = `garden-lamp-${i}`; lamp.castShadow = false; lamp.visible = false;
      this.root.add(lamp); this.lamps.push(lamp);
    }
    this.gradient = toonGradient();
    const mask = gardenGroundMaskTexture(), lake = lakeDistanceTexture();
    const ink = textures.landscape ?? inkMountainTexture(), willow = textures.willow ?? willowTexture();
    const pad = lotusPadTexture(), flower = lotusFlowerTexture(), reed = reedTexture(), mistTex = mistTexture();
    this.textures.push(mask, lake, ink, willow, pad, flower, reed, mistTex, this.gradient);
    if (textures.grass) this.textures.push(textures.grass);
    const shared = () => ({ ...this.light, uTime: this.time, uSway: this.sway, uWet: this.wet, ...this.fogUniforms });
    const lakeRect = new THREE.Vector4(LAKE_MASK.minX, LAKE_MASK.minZ, 1 / LAKE_MASK.width, 1 / LAKE_MASK.depth);

    // 땅
    this.groundMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...shared(), uMask: { value: mask }, uMaskRect: { value: new THREE.Vector4(GARDEN_MASK.minX, GARDEN_MASK.minZ, 1 / GARDEN_MASK.width, 1 / GARDEN_MASK.depth) },
        uLake: { value: lake }, uLakeRect: { value: lakeRect },
        uGrass: { value: srgb(0x778766) }, uGrassLight: { value: srgb(0xa0ad85) }, uGrassDeep: { value: srgb(0x4e6852) },
        uGrassPhoto: { value: textures.grass ?? mask }, uGrassPhotoAmount: { value: textures.grass ? 1 : 0 },
        uEarth: { value: srgb(0xaea390) }, uEarthLight: { value: srgb(0xd8cebb) }, uStone: { value: srgb(0x858b83) }, uStoneLight: { value: srgb(0xc2c2b4) },
        uMud: { value: srgb(0x646953) }, uPoolColor: { value: srgb(0xffbf80).multiplyScalar(0.35) },
      },
      vertexShader: GARDEN_GROUND_VERT, fragmentShader: GARDEN_GROUND_FRAG, fog: true,
    });
    this.materials.push(this.groundMaterial);
    const inner = heightfield(-64, 64, -34, 104, mobile ? 1.0 : 0.75, bankHeight);
    // The skirt follows the same bank so it never rises above the lake; it only fills the far field out to the fog.
    const outer = heightfield(-200, 200, -120, 240, 6, (x, z) => bankHeight(x, z) - 0.12);
    this.geometries.push(inner, outer);
    for (const [index, geometry] of [inner, outer].entries()) {
      const mesh = new THREE.Mesh(geometry, this.groundMaterial);
      mesh.name = index ? "garden-ground-far" : "garden-ground";
      mesh.renderOrder = 0;
      this.root.add(mesh);
    }

    // 물과 반사
    const target = new THREE.WebGLRenderTarget(256, 256, { depthBuffer: true, stencilBuffer: false, samples: 2 });
    target.texture.colorSpace = THREE.NoColorSpace;
    target.texture.minFilter = THREE.LinearFilter; target.texture.magFilter = THREE.LinearFilter;
    this.reflection = { target, camera: new THREE.PerspectiveCamera(), matrix: new THREE.Matrix4() };
    this.reflection.camera.layers.set(2);
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...skyUniforms, ...this.fogUniforms, uReflection: { value: target.texture }, uReflect: { value: 1 }, uReflectMatrix: { value: this.reflection.matrix },
        uLake: { value: lake }, uLakeRect: { value: lakeRect }, uCamPos: { value: new THREE.Vector3() }, uRain: { value: 0 }, uNight: this.light.uNight,
        uRainTaps: { value: mobile ? 5 : 9 }, uJade: { value: srgb(0x477d72) }, uJadeDeep: { value: srgb(0x274e49) }, uJadeShore: { value: srgb(0x9aa992) },
        uRipples: { value: this.ripples }, uRippleLimit: { value: GARDEN_RIPPLE_COUNT },
      },
      vertexShader: GARDEN_WATER_VERT, fragmentShader: GARDEN_WATER_FRAG, fog: true,
    });
    this.materials.push(waterMaterial);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(96, 76, 1, 1), waterMaterial);
    this.water.name = "garden-lake";
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(LAKE.x, WATER_Y, LAKE.z + 2);
    this.water.renderOrder = 2;
    this.root.add(this.water);

    // 원경 산수 띠
    const band = new THREE.CylinderGeometry(230, 230, 160, 64, 1, true);
    this.geometries.push(band);
    const mountainMaterial = new THREE.ShaderMaterial({
      uniforms: { uInk: { value: ink }, uPhotographic: { value: textures.landscape ? 1 : 0 }, uFogColor: { value: new THREE.Color(0.9, 0.94, 0.93) }, uInkColor: { value: new THREE.Color(0.2, 0.23, 0.27) }, uNight: this.light.uNight, uRain: { value: 0 } },
      vertexShader: GARDEN_MOUNTAIN_VERT, fragmentShader: GARDEN_MOUNTAIN_FRAG, side: THREE.BackSide, toneMapped: false, transparent: true, depthWrite: false,
    });
    this.materials.push(mountainMaterial);
    this.mountains = new THREE.Mesh(band, mountainMaterial);
    this.mountains.name = "garden-mountains";
    this.mountains.position.set(0, 60 - 10, 40);
    // Place the softly blended panorama seam outside the central hall view.
    this.mountains.rotation.y = Math.PI + 0.61;
    this.mountains.renderOrder = -5;
    this.mountains.frustumCulled = false;
    this.mountains.layers.enable(2);
    this.root.add(this.mountains);

    // 느티나무: 입체 가지에 잎만 있는 작은 수관을 나눠 붙인다.
    this.willowStrands = this.buildWillows(willow, shared, textures.wood);
    this.reeds = this.buildReeds(reed, shared);
    this.buildLotus(pad, flower, shared);
    this.mist = this.buildMist(mistTex);
    this.structures = buildGardenStructures(this.root, textures, this.gradient, mobile);
    this.seatLight = new GardenSeatLight(this.root);
    this.pond = new GardenPond(this.root, mobile);
    this.landscapeDetail = buildGardenLandscapeDetail(this.root, mobile);
    this.boats = new GardenBoats(this.root, this.gradient);
    this.rain = new GardenRain(this.root, this.time);
    const island = GARDEN_PAVILIONS[0];
    this.lanternPoints = [
      // Reuse the four nearest pooled lamps to softly light faces in the photo court.
      { x: -7, y: 3.1, z: -11, color: 0xffdfbb }, { x: 7, y: 3.1, z: -11, color: 0xffdfbb },
      { x: 0, y: 3.2, z: -10.5, color: 0xffdfbb },
      ...GARDEN_LANTERNS.map((site) => ({ x: site.x, y: site.y + 0.9, z: site.z })),
      ...[-1.9, 1.9].map((lx) => { const w = gardenPavilionWorld(island, lx, 2.3); return { x: w.x, y: island.floorY + PAVILION_POST_HEIGHT - 0.5, z: w.z }; }),
      ...[-6, 6].map((lx) => ({ x: HALL.x + lx, y: 2.4 + HALL.eave - 4.3, z: HALL.glassZ + 8.2 })),
      ...[0, 1, 2, 3, 4].map((i) => ({ x: HALL.x - 7.5 + i * 5, y: 2.4 + 3.4, z: HALL.backZ - 0.6 })),
    ];
  }

  private buildWillows(willow: THREE.Texture, shared: () => Record<string, THREE.IUniform>, wood: THREE.Texture) {
    const trunks: THREE.BufferGeometry[] = [];
    const rand = seededRandom(67);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometries.push(quad);
    const count = GARDEN_WILLOWS.length * TREE_LEAF_CLUSTERS;
    const strands = instanced(quad, count);
    const placement = new Float32Array(count * 4), seeds = new Float32Array(count * 4), crownNormals = new Float32Array(count * 3);
    const link = (a: THREE.Vector3, b: THREE.Vector3, base: number, tip: number, sides = 7) => {
      const delta = b.clone().sub(a);
      // Fork ends overlap the parent stem or sit inside foliage, so invisible end caps are unnecessary.
      const piece = new THREE.CylinderGeometry(tip, base, delta.length(), sides, 1, true);
      piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      piece.translate((a.x + b.x) * .5, (a.y + b.y) * .5, (a.z + b.z) * .5);
      trunks.push(piece);
    };
    GARDEN_WILLOWS.forEach((tree, index) => {
      const scale = tree.scale, leanX = (rand() - .5) * .26, leanZ = (rand() - .5) * .26;
      const point = (x: number, y: number, z: number) => new THREE.Vector3(tree.x + x * scale, tree.y + y * scale, tree.z + z * scale);
      const base = point(0, -.08, 0), fork = point(leanX, 2.75, leanZ), stem = point(leanX * 1.3 + .16, 4.65, leanZ * 1.3 - .12);
      const stemBend = point(leanX + .12, 3.7, leanZ - .05);
      link(base, fork, .29 * scale, .15 * scale, 11);
      link(fork, stemBend, .15 * scale, .085 * scale, 9);
      link(stemBend, stem, .085 * scale, .026 * scale, 7);
      const crown: { x: number; y: number; z: number; size: number }[] = [];
      const forks: THREE.Vector3[] = [];
      for (let k = 0; k < 8; k++) {
        const angle = tree.yaw + k * Math.PI / 4 + (rand() - .5) * .18;
        const radius = 2.05 + rand() * .38, y = 4.65 + rand() * .6;
        const x = Math.cos(angle) * radius + leanX, z = Math.sin(angle) * radius + leanZ;
        // Four uneven, upright limbs divide into paired side shoots. Keeping separate
        // fork heights avoids the umbrella-spoke silhouette of eight rays from one point.
        const rise = rand(), origin = rand(), thickness = rand();
        if (k % 2 === 0) {
          const bearing = angle + .3 + rise * .2, reach = .7 + thickness * .25;
          const limb = point(leanX + Math.cos(bearing) * reach, 3.65 + rise * .6, leanZ + Math.sin(bearing) * reach);
          const startY = 2.55 + origin * .95;
          const start = point(leanX + Math.max(0, startY - 2.75) * .12, startY, leanZ - Math.max(0, startY - 2.75) * .05);
          link(start, limb, (.087 + thickness * .025) * scale, .052 * scale);
          forks.push(limb);
        }
        const limb = forks[Math.floor(k / 2)], end = point(x, y - .12, z);
        const bend = limb.clone().lerp(end, .5);
        bend.y += (.12 + rise * .18) * scale;
        bend.x += Math.cos(angle + Math.PI / 2) * (origin - .5) * .22 * scale;
        bend.z += Math.sin(angle + Math.PI / 2) * (origin - .5) * .22 * scale;
        link(limb, bend, .044 * scale, .025 * scale, 6);
        link(bend, end, .025 * scale, .008 * scale, 6);
        crown.push({ x, y, z, size: 2.9 + rand() * .45 });
      }
      for (let k = 0; k < 6; k++) {
        const angle = tree.yaw + k * Math.PI / 3 + .36, radius = 1.2 + rand() * .2;
        const x = Math.cos(angle) * radius + leanX, z = Math.sin(angle) * radius + leanZ, y = 6.0 + rand() * .35;
        link(stem, point(x, y - .25, z), .045 * scale, .008 * scale, 6);
        crown.push({ x, y, z, size: 2.7 + rand() * .3 });
      }
      crown.push({ x: leanX, y: 5.15, z: leanZ, size: 3.3 }, { x: leanX + .2, y: 6.7, z: leanZ - .1, size: 2.8 });
      for (let k = 0; k < 4; k++) {
        const angle = tree.yaw + k * Math.PI / 2 + .8;
        crown.push({ x: Math.cos(angle) * 1.15, y: 4.25 + rand() * .35, z: Math.sin(angle) * 1.15, size: 2.7 });
      }
      crown.forEach((cluster, k) => {
        // Interleave complete crowns across trees; adaptive quality removes only the four extra infill clusters.
        const i = k * GARDEN_WILLOWS.length + index, center = point(cluster.x, cluster.y, cluster.z);
        placement.set([center.x, center.y, center.z, cluster.size * scale], i * 4);
        seeds.set([tree.seed * 6.28 + k * .79, .45 + rand() * .45, (rand() - .5) * .58, .79 + rand() * .13], i * 4);
        const normal = new THREE.Vector3(cluster.x * .23, .68 + (cluster.y - 4.25) * .12, cluster.z * .23).normalize();
        crownNormals.set([normal.x, normal.y, normal.z], i * 3);
      });
    });
    strands.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(placement, 4));
    strands.setAttribute("aLeafSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    strands.setAttribute("aCrownNormal", new THREE.InstancedBufferAttribute(crownNormals, 3));
    strands.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 40), 80);
    this.geometries.push(strands);
    const trunkGeometry = mergeGeometries(trunks, false)!;
    for (const trunk of trunks) trunk.dispose();
    this.geometries.push(trunkGeometry);
    const bark = wood.clone(); bark.repeat.set(1, 3.5); this.textures.push(bark);
    // The shared campfire timber is almost black as an albedo. Keep only its fine
    // surface relief, so living zelkova bark retains its natural grey-brown colour.
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x968b78, bumpMap: bark, bumpScale: .018, roughness: 0.98 });
    this.materials.push(trunkMaterial);
    const trunkMesh = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunkMesh.name = "garden-willow-trunks"; trunkMesh.layers.enable(2);
    this.root.add(trunkMesh);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: willow }, uLeafShade: { value: srgb(0xb3bfaf) }, uLeafLit: { value: srgb(0xffffff) }, uTransmit: { value: 0.025 } },
      vertexShader: GARDEN_TREE_VERT, fragmentShader: GARDEN_TREE_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(strands, material);
    mesh.name = "garden-willow-strands"; mesh.renderOrder = 1; mesh.layers.enable(2);
    this.root.add(mesh);
    return mesh;
  }

  private buildReeds(reed: THREE.Texture, shared: () => Record<string, THREE.IUniform>) {
    const sites = reedSites();
    const quad = new THREE.PlaneGeometry(1, 1), other = quad.clone().rotateY(Math.PI / 2);
    const crossed = mergeGeometries([quad, other], false)!;
    quad.dispose(); other.dispose();
    this.geometries.push(crossed);
    const geometry = instanced(crossed, sites.length);
    const placement = new Float32Array(sites.length * 4), seeds = new Float32Array(sites.length * 4);
    sites.forEach((site, i) => {
      placement.set([site.x, site.y, site.z, 1.1 * site.scale], i * 4);
      seeds.set([site.seed * 6.28, site.seed, site.yaw, 0], i * 4);
    });
    geometry.setAttribute("aLeaf", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aLeafSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 34), 60);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: reed }, uLeafShade: { value: srgb(0x9aa66a) }, uLeafLit: { value: srgb(0xd6d99a) }, uTransmit: { value: 0.15 } },
      vertexShader: GARDEN_FOLIAGE_VERT, fragmentShader: GARDEN_FOLIAGE_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "garden-reeds"; mesh.renderOrder = 1;
    this.root.add(mesh);
    return mesh;
  }

  private buildLotus(pad: THREE.Texture, flower: THREE.Texture, shared: () => Record<string, THREE.IUniform>) {
    const pads = lotusPads();
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    this.geometries.push(quad);
    const geometry = instanced(quad, pads.length);
    const placement = new Float32Array(pads.length * 4), seeds = new Float32Array(pads.length * 4);
    pads.forEach((p, i) => {
      placement.set([p.x, p.z, p.radius, p.yaw], i * 4);
      seeds.set([p.seed, Math.floor(p.seed * 4) % 4, (i % 5) * 0.004, 0], i * 4);
    });
    geometry.setAttribute("aPad", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aPadSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 34), 60);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uLeaf: { value: pad }, uLeafShade: { value: srgb(0x9fb48c) }, uLeafLit: { value: srgb(0xd8e3b4) } },
      vertexShader: GARDEN_PAD_VERT, fragmentShader: GARDEN_PAD_FRAG, fog: true, side: THREE.DoubleSide,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "garden-lotus-pads"; mesh.renderOrder = 3;
    this.root.add(mesh);
    const flowers = pads.filter((p) => p.flower);
    const sprite = new THREE.PlaneGeometry(1, 1);
    this.geometries.push(sprite);
    const flowerGeometry = instanced(sprite, flowers.length);
    const sites = new Float32Array(flowers.length * 4);
    flowers.forEach((p, i) => sites.set([p.x, 0.16, p.z, 0.42 + p.radius * 0.4], i * 4));
    flowerGeometry.setAttribute("aSprite", new THREE.InstancedBufferAttribute(sites, 4));
    flowerGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 34), 60);
    this.geometries.push(flowerGeometry);
    const flowerMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uSprite: { value: flower } },
      vertexShader: GARDEN_SPRITE_VERT, fragmentShader: GARDEN_SPRITE_FRAG, fog: true,
    });
    this.materials.push(flowerMaterial);
    const flowerMesh = new THREE.Mesh(flowerGeometry, flowerMaterial);
    flowerMesh.name = "garden-lotus-flowers"; flowerMesh.renderOrder = 3;
    this.root.add(flowerMesh);
  }

  private buildMist(mistTex: THREE.Texture) {
    const rand = seededRandom(149), count = this.mobile ? 18 : 28;
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometries.push(quad);
    const geometry = instanced(quad, count);
    const placement = new Float32Array(count * 4), seeds = new Float32Array(count);
    let placed = 0, guard = 0;
    while (placed < count && guard++ < 400) {
      const x = LAKE.x + (rand() - 0.5) * 70, z = LAKE.z + (rand() - 0.5) * 54;
      if (lakeSigned(x, z) > -3) continue;
      placement.set([x, 0.9 + rand() * 0.6, z, 9 + rand() * 7], placed * 4);
      seeds[placed] = rand();
      placed++;
    }
    geometry.instanceCount = placed;
    geometry.setAttribute("aMist", new THREE.InstancedBufferAttribute(placement, 4));
    geometry.setAttribute("aMistSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 34), 70);
    this.geometries.push(geometry);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uMist: { value: mistTex }, uAmount: { value: 0 }, uMistColor: { value: new THREE.Color(0.9, 0.92, 0.9) } },
      vertexShader: GARDEN_MIST_VERT, fragmentShader: GARDEN_MIST_FRAG, transparent: true, depthWrite: false,
    });
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "garden-mist"; mesh.renderOrder = 4; mesh.visible = false; mesh.frustumCulled = false;
    this.root.add(mesh);
    return mesh;
  }

  /* ---------------- 낮밤 · 비 ---------------- */
  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    this.daylight = d;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1), lamps = THREE.MathUtils.clamp(d.lanterns, 0, 1), rain = this.rainAmount;
    this.lampAmount = lamps;
    const sunUp = d.sun[1] > -0.02;
    const direction = sunUp ? d.sun : d.moon;
    this.sun.position.set(direction[0] * 60, Math.max(12, direction[1] * 60), direction[2] * 60);
    if (sunUp) this.sun.color.setRGB(...d.sunColor, THREE.SRGBColorSpace);
    else this.sun.color.setRGB(0.6, 0.68, 0.92, THREE.SRGBColorSpace);
    this.sun.intensity = (sunUp ? 0.55 + Math.max(0, direction[1]) * 0.8 : 0.09) * (1 - rain * 0.55);
    this.hemi.color.setRGB(...d.skyHorizon, THREE.SRGBColorSpace).lerp(new THREE.Color(0xe8e4d8), 0.35).lerp(new THREE.Color(0x3a4f6e), night * 0.85);
    this.hemi.groundColor.setRGB(0.4, 0.38, 0.33, THREE.SRGBColorSpace).lerp(new THREE.Color(0x101418), night * 0.8);
    this.hemi.intensity = THREE.MathUtils.lerp(1.1, 0.28, night) * (1 - rain * 0.2);
    this.light.uSunDir.value.set(direction[0], direction[1], direction[2]).normalize();
    this.light.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 1.1);
    this.light.uAmbient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.6);
    this.light.uGroundAmbient.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity * 0.6);
    this.light.uNight.value = lamps;
    const fog = new THREE.Color().setRGB(...d.fog, THREE.SRGBColorSpace);
    const mountain = this.mountains.material.uniforms;
    (mountain.uFogColor.value as THREE.Color).setRGB(...d.fog);
    (mountain.uInkColor.value as THREE.Color).setRGB(0.2, 0.23, 0.27).lerp(new THREE.Color(0.06, 0.08, 0.14), night);
    (this.mist.material.uniforms.uMistColor.value as THREE.Color).copy(fog).lerp(new THREE.Color(1, 1, 1), 0.3);
    const dawn = d.hour >= 4.5 && d.hour <= 8 ? 1 - Math.abs(d.hour - 6) / 2 : 0;
    const mistAmount = Math.max(0, Math.min(1, dawn * 0.9 + night * 0.14 + rain * 0.5));
    this.mist.material.uniforms.uAmount.value = mistAmount;
    this.mist.visible = mistAmount > 0.03;
    this.structures.applyDaylight(d, rain);
    for (const lamp of this.lamps) { lamp.intensity = LAMP_INTENSITY * lamps; lamp.visible = lamps > 0.01; }
    this.lastLampAt.t = -Infinity;
  }

  /** 비 세기 0~1: 물·빗줄기·잎·안개·조명을 함께 바꾼다. 안개는 엔진이 fogFar 에 곱한다. */
  setRain(amount: number) {
    if (this.disposed) return;
    const rain = THREE.MathUtils.clamp(amount, 0, 1);
    if (Math.abs(rain - this.rainAmount) < 0.004) return;
    this.rainAmount = rain;
    this.water.material.uniforms.uRain.value = rain;
    this.mountains.material.uniforms.uRain.value = rain;
    this.wet.value = rain;
    this.rain.setAmount(rain);
    if (this.daylight) this.applyDaylight(this.daylight);
  }
  get rainAmountNow() { return this.rainAmount; }

  /* ---------------- 나룻배 ---------------- */
  get boatState(): BoatRideState { return this.boats.state(); }
  get isRiding() { return this.boats.isRiding; }
  get boatPose() { return this.boats.pose; }
  boardBoat(): BoatStop | null { return this.boats.board(this.time.value); }
  alightBoat() { return this.boats.alight(); }
  cancelRide() { this.boats.cancelRide(); }
  boatStateChanged() { return this.boats.changed(); }

  /* ---------------- 프레임 ---------------- */
  applyMoments(events: GardenMoment[], serverTime: number) { this.pond.apply(events, serverTime); }

  update(time: number, camera: THREE.Camera, walker?: GardenWalker, riders: readonly RemoteRider[] = [], seat?: { spotId: string; slot: number } | null): BoatStop | null {
    if (this.disposed || !Number.isFinite(time)) return null;
    const dt = Math.max(0, Math.min(0.1, time - this.time.value));
    this.time.value = time;
    this.seatLight.setSeat(seat);
    this.seatLight.update(dt, this.lampAmount, this.rainAmount);
    this.pond.update(time, this.lampAmount);
    this.structures.setTime(time);
    const position = camera.getWorldPosition(new THREE.Vector3());
    (this.water.material.uniforms.uCamPos.value as THREE.Vector3).copy(position);
    const x = walker?.x ?? position.x, z = walker?.z ?? position.z;
    const alighted = this.boats.update(time, dt, { x, z }, riders);
    const wake = this.boats.wake(time);
    if (wake) this.addRipple(wake.x, wake.z, 0.8, time);
    for (const ripple of this.ripples) if (time - ripple.z >= 4) ripple.w = 0;
    const moved = Math.hypot(x - this.lastLampAt.x, z - this.lastLampAt.z);
    if (!(moved < 0.9) || time - this.lastLampAt.t > 1.2) {
      this.lastLampAt = { x, z, t: time };
      const nearest = this.lanternPoints.map((point) => ({ point, d: Math.hypot(point.x - x, point.z - z) })).sort((a, b) => a.d - b.d);
      const active = this.low ? 2 : 4;
      for (let i = 0; i < 4; i++) {
        const entry = nearest[i], lamp = this.lamps[i], uniform = this.light.uLanterns.value[i];
        if (!entry || i >= active) { uniform.set(0, -100, 0, 0); lamp.intensity = 0; continue; }
        lamp.position.set(entry.point.x, entry.point.y, entry.point.z);
        lamp.color.setHex(entry.point.color ?? 0xffb46a);
        lamp.intensity = LAMP_INTENSITY * this.lampAmount;
        uniform.set(entry.point.x, entry.point.y, entry.point.z, 2.2);
      }
    }
    return alighted;
  }

  addRipple(x: number, z: number, strength: number, time: number) {
    this.ripples[this.nextRipple].set(x, z, time, strength);
    this.nextRipple = (this.nextRipple + 1) % GARDEN_RIPPLE_COUNT;
  }

  /** 메인 렌더 직전: 큰 물체(레이어 2)를 수면에 비춘다. 저화질에서도 풍경은 유지하고 반사 해상도만 낮춘다. */
  renderReflection(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    if (this.disposed) return;
    const uniforms = this.water.material.uniforms;
    uniforms.uReflect.value = 1;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // The near water is the main view from every seat. Keep its silhouettes smooth,
    // with a bounded half-resolution target rather than enlarging quarter-size pixels.
    const scale = Math.min(this.low ? 0.25 : 0.5, (this.mobile ? 768 : 1280) / Math.max(size.x, size.y));
    const w = Math.max(64, Math.round(size.x * scale)), h = Math.max(64, Math.round(size.y * scale));
    const { target, camera: mirror, matrix } = this.reflection;
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    // 수면(y = WATER_Y)에 대한 거울 카메라
    const cameraPos = camera.getWorldPosition(new THREE.Vector3());
    if (cameraPos.y <= WATER_Y + 0.05) { uniforms.uReflect.value = 0; return; }
    const normal = new THREE.Vector3(0, 1, 0), planePoint = new THREE.Vector3(0, WATER_Y, 0);
    const view = cameraPos.clone().sub(planePoint).reflect(normal).negate().add(planePoint);
    view.y = 2 * WATER_Y - cameraPos.y; view.x = cameraPos.x; view.z = cameraPos.z;
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const lookAt = cameraPos.clone().add(forward);
    const target3 = new THREE.Vector3(lookAt.x, 2 * WATER_Y - lookAt.y, lookAt.z);
    mirror.position.copy(view);
    mirror.up.set(0, 1, 0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    mirror.up.set(up.x, -up.y, up.z);
    mirror.lookAt(target3);
    mirror.near = camera.near; mirror.far = camera.far; mirror.fov = camera.fov; mirror.aspect = camera.aspect;
    mirror.updateProjectionMatrix();
    mirror.updateMatrixWorld();
    // 수면 아래 물체가 거울에 비치지 않게 가까운 평면을 수면에 맞춘다 (oblique near plane).
    const plane = new THREE.Plane(normal.clone(), -WATER_Y);
    plane.applyMatrix4(mirror.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const proj = mirror.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(clip.x) + proj.elements[8]) / proj.elements[0];
    q.y = (Math.sign(clip.y) + proj.elements[9]) / proj.elements[5];
    q.z = -1;
    q.w = (1 + proj.elements[10]) / proj.elements[14];
    clip.multiplyScalar(2 / clip.dot(q));
    proj.elements[2] = clip.x; proj.elements[6] = clip.y; proj.elements[10] = clip.z + 1; proj.elements[14] = clip.w;
    matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matrix.multiply(proj).multiply(mirror.matrixWorldInverse);
    const previousTarget = renderer.getRenderTarget(), previousAutoClear = renderer.autoClear;
    const previousClear = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha();
    this.water.visible = false;
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, mirror);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    renderer.autoClear = previousAutoClear;
    this.water.visible = true;
  }

  setQuality(low: boolean) {
    if (this.disposed || this.low === low) return;
    this.low = low;
    this.rain.setQuality(low);
    this.structures.setQuality(low);
    this.water.material.uniforms.uRainTaps.value = low ? 1 : this.mobile ? 5 : 9;
    this.water.material.uniforms.uRippleLimit.value = low ? 4 : GARDEN_RIPPLE_COUNT;
    this.willowStrands.geometry.instanceCount = GARDEN_WILLOWS.length * (low ? TREE_LEAF_CLUSTERS_LOW : TREE_LEAF_CLUSTERS);
    this.reeds.visible = !low;
    this.lastLampAt.t = -Infinity;
  }

  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.seatLight.dispose();
    this.pond.dispose();
    this.structures.dispose();
    this.landscapeDetail.dispose();
    this.boats.dispose();
    this.rain.dispose();
    this.reflection.target.dispose();
    this.root.removeFromParent();
    this.root.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.root.clear();
    this.water.geometry.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    for (const lamp of this.lamps) lamp.dispose();
    this.sun.dispose();
    this.hemi.dispose();
  }
}
