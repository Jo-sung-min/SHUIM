import * as THREE from "three";
import { GARDEN_RAIN_FRAG, GARDEN_RAIN_VERT } from "./garden-shader";
import { PAVILION_EAVE, PAVILION_HALF, PAVILION_POST_HEIGHT, seededRandom } from "./bamboo-trail";
import { GARDEN_PAVILIONS, GROUND_Y, HALL, HALL_TIERS, WATER_Y, gardenFloorHeight, isWater, lakeSigned } from "./garden-layout";

const COUNT = { high: 1200, low: 500 } as const;
export const GARDEN_RAIN_AREA = { minX: -100, minZ: -70, width: 200, depth: 210, size: 256 } as const;

/** Actual outdoor impact surface; lake drops end at the water rather than the boat's walk height. */
export function gardenRainSurface(x: number, z: number): { y: number; water: boolean } {
  if (isWater(x, z)) return { y: WATER_Y, water: true };
  const floor = gardenFloorHeight(x, z), shore = lakeSigned(x, z);
  if (floor > GROUND_Y + .01 || shore >= .4) return { y: floor, water: false };
  const t = THREE.MathUtils.clamp((shore + 1) / 1.4, 0, 1);
  return { y: Math.max(WATER_Y, -.6 + (GROUND_Y + .6) * t * t * (3 - 2 * t)), water: false };
}

/** One small, static height mask avoids terrain searches or per-drop CPU updates each frame. */
function surfaceTexture() {
  const { minX, minZ, width, depth, size } = GARDEN_RAIN_AREA;
  const data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) {
    const surface = gardenRainSurface(minX + (ix + .5) / size * width, minZ + (iz + .5) / size * depth);
    const height = Math.round(THREE.MathUtils.clamp(surface.y / 4, 0, 1) * 65535), offset = (iz * size + ix) * 4;
    data.set([height >> 8, height & 255, surface.water ? 255 : 0, 255], offset);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

/** Garden-wide outdoor rain, with stable world-wrapped near/far layers in one bounded draw. */
export class GardenRain {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly quad: THREE.PlaneGeometry;
  private readonly surface: THREE.DataTexture;
  private amount = 0;
  private disposed = false;

  constructor(parent: THREE.Object3D, private readonly time: THREE.IUniform<number>) {
    this.quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", this.quad.getAttribute("position"));
    geometry.setAttribute("uv", this.quad.getAttribute("uv"));
    geometry.setIndex(this.quad.getIndex());
    const rand = seededRandom(131), drops = new Float32Array(COUNT.high * 4);
    for (let i = 0; i < COUNT.high; i++) {
      drops.set([rand(), rand(), rand(), i % 5 === 0 ? 1 : 0], i * 4);
    }
    geometry.setAttribute("aDrop", new THREE.InstancedBufferAttribute(drops, 4));
    geometry.instanceCount = COUNT.high;
    this.surface = surfaceTexture();
    const pavilion = GARDEN_PAVILIONS[0], area = GARDEN_RAIN_AREA;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: time, uNearSpan: { value: 24 }, uFarSpan: { value: 76 }, uHeight: { value: 16 }, uSpeed: { value: 9 },
        uRain: { value: 0 }, uDropColor: { value: new THREE.Color(0xc6d6e0) }, uRainSurface: { value: this.surface },
        uRainArea: { value: new THREE.Vector4(area.minX, area.minZ, 1 / area.width, 1 / area.depth) },
        uRainHall: { value: new THREE.Vector4(HALL.x, (HALL.glassZ + HALL.backZ) / 2, HALL.halfX + 1.8, (HALL.backZ - HALL.glassZ) / 2 + 1.8) },
        uRainHallRoof: { value: new THREE.Vector2(HALL_TIERS[HALL_TIERS.length - 1].y + HALL.eave + .25, HALL.roofRise) },
        uRainPavilion: { value: new THREE.Vector4(pavilion.x, pavilion.z, PAVILION_HALF + PAVILION_EAVE, pavilion.floorY + PAVILION_POST_HEIGHT + .22) },
      },
      vertexShader: GARDEN_RAIN_VERT, fragmentShader: GARDEN_RAIN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "garden-rain";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  setAmount(rain: number) {
    if (this.disposed) return;
    this.amount = Number.isFinite(rain) ? THREE.MathUtils.clamp(rain, 0, 1) : 0;
    this.mesh.material.uniforms.uRain.value = this.amount;
    this.mesh.visible = this.amount > 0.01;
  }
  setQuality(low: boolean) {
    if (this.disposed) return;
    this.mesh.geometry.instanceCount = low ? COUNT.low : COUNT.high;
  }
  get rain() { return this.amount; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.quad.dispose();
    this.surface.dispose();
    void this.time;
  }
}
