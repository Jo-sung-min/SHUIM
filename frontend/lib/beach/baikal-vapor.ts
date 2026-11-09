import * as THREE from "three";
import type { BaikalUniforms } from "./baikal-materials";

const VAPOR_VERT = `
attribute vec4 aPuff;
attribute vec3 aOrigin;
uniform float uTime;
uniform float uStorm;
uniform vec2 uWind;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vSmoke;
void main() {
  vUv = uv;
  float lifetime = aPuff.y, age = fract(uTime / lifetime + aPuff.x), smoke = aPuff.z;
  vAge = age; vSeed = aPuff.w; vSmoke = smoke;
  // Smoke climbs out of the flue and leans with the wind; steam only wavers upward from the cup.
  float rise = age * (smoke > 0.5 ? 7.0 : 0.32);
  vec2 drift = uWind * age * age * (smoke > 0.5 ? 1.15 : 0.0);
  vec2 sway = vec2(sin(age * 7.0 + aPuff.w * 40.0), cos(age * 6.0 + aPuff.w * 31.0)) * (smoke > 0.5 ? 0.45 : 0.016) * age;
  vec3 world = aOrigin + vec3(drift.x + sway.x, rise, drift.y + sway.y);
  vec4 view = viewMatrix * vec4(world, 1.0);
  float size = smoke > 0.5 ? 0.5 + age * 3.2 : 0.05 + age * 0.13;
  view.xy += position.xy * size;
  gl_Position = projectionMatrix * view;
}`;
const VAPOR_FRAG = `
uniform float uTime;
uniform float uStars;
uniform float uStorm;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying float vSmoke;
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float wisp = n2(p * 2.4 + vSeed * 19.0 + vec2(0.0, -uTime * 0.4)) * 0.6 + n2(p * 5.1 + vSeed * 7.0) * 0.4;
  float body = (1.0 - smoothstep(0.15, 1.0, r)) * smoothstep(0.26, 0.72, wisp);
  float life = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.42, 1.0, vAge));
  float night = smoothstep(0.25, 0.95, uStars);
  // Chimney smoke gets lost in a blizzard. Indoors the steam only just shows against the lamplight.
  float strength = vSmoke > 0.5 ? mix(0.34, 0.2, night) * (1.0 - clamp(uStorm, 0.0, 1.0) * 0.7) : 0.3;
  float alpha = body * life * strength;
  if (alpha < 0.004) discard;
  vec3 smokeColor = mix(vec3(0.82, 0.83, 0.86), vec3(0.34, 0.3, 0.3), night);
  gl_FragColor = vec4(vSmoke > 0.5 ? smokeColor : vec3(1.0, 0.93, 0.84), alpha);
}`;

/** One draw for all wood smoke and all the steam rising off the mugs. It runs entirely in the vertex shader, with no per-frame work. */
export class BaikalVapor {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(parent: THREE.Object3D, shared: BaikalUniforms, chimneys: readonly THREE.Vector3[], mugs: readonly THREE.Vector3[], mobile: boolean) {
    const smokePuffs = mobile ? 10 : 18, steamPuffs = mobile ? 3 : 6, count = chimneys.length * smokePuffs + mugs.length * steamPuffs;
    const quad = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position")); geometry.setAttribute("uv", quad.getAttribute("uv"));
    const puffs = new Float32Array(count * 4), origins = new Float32Array(count * 3);
    let cursor = 0;
    const add = (origin: THREE.Vector3, index: number, total: number, smoke: number, life: number) => {
      puffs.set([index / total + (cursor * .137) % .05, life, smoke, (cursor * .618) % 1], cursor * 4);
      origins.set([origin.x, origin.y, origin.z], cursor * 3); cursor++;
    };
    for (const origin of chimneys) for (let i = 0; i < smokePuffs; i++) add(origin, i, smokePuffs, 1, 8);
    for (const origin of mugs) for (let i = 0; i < steamPuffs; i++) add(origin, i, steamPuffs, 0, 3.2);
    geometry.setAttribute("aPuff", new THREE.InstancedBufferAttribute(puffs, 4)); geometry.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origins, 3));
    geometry.instanceCount = count;
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: shared.uTime, uStorm: shared.uStorm, uStars: shared.uStars, uWind: shared.uWind }, vertexShader: VAPOR_VERT, fragmentShader: VAPOR_FRAG,
      transparent: true, depthWrite: false, toneMapped: false, fog: false, forceSinglePass: true });
    material.name = "baikal-chimney-smoke";
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.name = "baikal-chimney-smoke"; this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    parent.add(this.mesh);
    quad.dispose();
  }

  dispose() {
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
