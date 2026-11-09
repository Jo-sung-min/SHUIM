import * as THREE from "three";
import { seededRandom } from "./bamboo-trail";
import { BAIKAL_WIND } from "./baikal-layout";
import { type BaikalUniforms, createBaikalDriftMaterial, createBaikalSnowMaterial } from "./baikal-materials";

const FLAKES = { high: 6000, low: 2500 } as const;
const SHEETS = { high: 40, low: 20 } as const;

/** The blizzard: one draw of wind-driven flakes wrapped around the camera, and a few translucent sheets of snow racing over the ice. */
export class BaikalSnow {
  readonly flakes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly sheets: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private readonly wind = new THREE.Vector2();
  private lastTime: number | null = null;
  private disposed = false;

  constructor(parent: THREE.Object3D, private readonly shared: BaikalUniforms, low: boolean) {
    const flakeGeometry = this.instanced(FLAKES.high, (random, data, i) => data.set([random(), random(), random(), i % 4 === 0 ? 1 : 0], i * 4), "aFlake", 4, 131);
    this.flakes = new THREE.Mesh(flakeGeometry, createBaikalSnowMaterial(shared));
    this.flakes.name = "baikal-blizzard-flakes"; this.flakes.frustumCulled = false; this.flakes.renderOrder = 8;
    const sheetGeometry = this.instanced(SHEETS.high, (random, data, i) => data.set([random(), .25 + random() * 1.1, random(), 3 + random() * 4], i * 4), "aSheet", 4, 977);
    const seeds = new Float32Array(SHEETS.high * 2), seedRandom = seededRandom(313);
    for (let i = 0; i < SHEETS.high; i++) seeds.set([seedRandom(), seedRandom()], i * 2);
    sheetGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 2));
    this.sheets = new THREE.Mesh(sheetGeometry, createBaikalDriftMaterial(shared));
    this.sheets.name = "baikal-blowing-snow-sheets"; this.sheets.frustumCulled = false; this.sheets.renderOrder = 7;
    parent.add(this.flakes, this.sheets);
    this.setQuality(low);
  }

  private instanced(count: number, fill: (random: () => number, data: Float32Array, index: number) => void, name: string, size: number, seed: number) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", this.quad.getAttribute("position")); geometry.setAttribute("uv", this.quad.getAttribute("uv")); geometry.setIndex(this.quad.getIndex());
    const random = seededRandom(seed), data = new Float32Array(count * size);
    for (let i = 0; i < count; i++) fill(random, data, i);
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data, size));
    geometry.instanceCount = count;
    return geometry;
  }

  /** Gusts swell and veer: the current wind steers every flake, and its integral slides the whole field. */
  update(time: number, storm: number) {
    if (this.disposed || !Number.isFinite(time)) return;
    const dt = this.lastTime === null || time < this.lastTime ? 0 : Math.min(.1, time - this.lastTime);
    this.lastTime = time;
    const gust = .72 + .22 * Math.sin(time * .37) + .14 * Math.sin(time * 1.13 + 1.7) + .08 * Math.sin(time * 2.9);
    const veer = .42 * Math.sin(time * .21) + .18 * Math.sin(time * .9 + 2.1);
    const speed = BAIKAL_WIND.speed * gust * (.35 + .65 * storm);
    const angle = Math.atan2(BAIKAL_WIND.z, BAIKAL_WIND.x) + veer;
    this.wind.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.shared.uWind.value.copy(this.wind);
    this.shared.uDrift.value.addScaledVector(this.wind, dt);
    const visible = storm > .01;
    this.flakes.visible = visible; this.sheets.visible = visible && storm > .12;
  }

  setQuality(low: boolean) {
    if (this.disposed) return;
    this.flakes.geometry.instanceCount = low ? FLAKES.low : FLAKES.high;
    this.sheets.geometry.instanceCount = low ? SHEETS.low : SHEETS.high;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.flakes.removeFromParent(); this.sheets.removeFromParent();
    this.flakes.geometry.dispose(); this.flakes.material.dispose();
    this.sheets.geometry.dispose(); this.sheets.material.dispose();
    this.quad.dispose();
  }
}
