import * as THREE from "three";
import { GARDEN_RAIN_FRAG, GARDEN_RAIN_VERT } from "./garden-shader";
import { seededRandom } from "./bamboo-trail";

const COUNT = { high: 1200, low: 500 } as const;

/** 빗줄기: 카메라 둘레 반지름 14 m 원통 안에서 가는 띠가 떨어진다. 인스턴스 한 드로우, 비 세기 0이면 그리지 않는다. */
export class GardenRain {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly quad: THREE.PlaneGeometry;
  private amount = 0;
  private disposed = false;

  constructor(parent: THREE.Object3D, private readonly time: THREE.IUniform<number>) {
    this.quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", this.quad.getAttribute("position"));
    geometry.setAttribute("uv", this.quad.getAttribute("uv"));
    geometry.setIndex(this.quad.getIndex());
    const rand = seededRandom(131), drops = new Float32Array(COUNT.high * 3);
    for (let i = 0; i < COUNT.high; i++) {
      const angle = rand() * Math.PI * 2, radius = Math.sqrt(rand());
      drops.set([Math.cos(angle) * radius, Math.sin(angle) * radius, rand()], i * 3);
    }
    geometry.setAttribute("aDrop", new THREE.InstancedBufferAttribute(drops, 3));
    geometry.instanceCount = COUNT.high;
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uRadius: { value: 14 }, uHeight: { value: 16 }, uSpeed: { value: 9 }, uRain: { value: 0 }, uDropColor: { value: new THREE.Color(0xdfe6ea) } },
      vertexShader: GARDEN_RAIN_VERT, fragmentShader: GARDEN_RAIN_FRAG, transparent: true, depthWrite: false,
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
    this.amount = rain;
    this.mesh.material.uniforms.uRain.value = rain;
    this.mesh.visible = rain > 0.01;
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
    void this.time;
  }
}
