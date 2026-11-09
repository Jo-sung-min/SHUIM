import * as THREE from "three";
import { seededRandom } from "./bamboo-trail";
import { type BaikalUniforms, createBaikalSnowMaterial } from "./baikal-materials";

const FLAKES = { high: 6000, low: 2500 } as const;

/** Snow drifting straight down: one draw of soft flakes wrapped around the camera, with no wind. */
export class BaikalSnow {
  readonly flakes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  private disposed = false;

  constructor(parent: THREE.Object3D, shared: BaikalUniforms, low: boolean) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", this.quad.getAttribute("position")); geometry.setAttribute("uv", this.quad.getAttribute("uv")); geometry.setIndex(this.quad.getIndex());
    const random = seededRandom(131), data = new Float32Array(FLAKES.high * 4);
    for (let i = 0; i < FLAKES.high; i++) data.set([random(), random(), random(), i % 4 === 0 ? 1 : 0], i * 4);
    geometry.setAttribute("aFlake", new THREE.InstancedBufferAttribute(data, 4));
    geometry.instanceCount = FLAKES.high;
    this.flakes = new THREE.Mesh(geometry, createBaikalSnowMaterial(shared));
    this.flakes.name = "baikal-snowfall"; this.flakes.frustumCulled = false; this.flakes.renderOrder = 8;
    parent.add(this.flakes);
    this.setQuality(low);
  }

  setQuality(low: boolean) {
    if (this.disposed) return;
    this.flakes.geometry.instanceCount = low ? FLAKES.low : FLAKES.high;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.flakes.removeFromParent();
    this.flakes.geometry.dispose(); this.flakes.material.dispose();
    this.quad.dispose();
  }
}
