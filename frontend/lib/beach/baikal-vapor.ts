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
void main() {
  vUv = uv;
  float lifetime = aPuff.y, age = fract(uTime / lifetime + aPuff.x);
  vAge = age; vSeed = aPuff.w;
  // Smoke climbs out of the flue and barely leans in the still air.
  vec2 sway = vec2(sin(age * 7.0 + aPuff.w * 40.0), cos(age * 6.0 + aPuff.w * 31.0)) * 0.45 * age;
  vec2 drift = uWind * age * age * 3.0 + sway;
  vec3 world = aOrigin + vec3(drift.x, age * 7.0, drift.y);
  vec4 view = viewMatrix * vec4(world, 1.0);
  view.xy += position.xy * (0.5 + age * 3.2);
  gl_Position = projectionMatrix * view;
}`;
const VAPOR_FRAG = `
uniform float uTime;
uniform float uStars;
uniform float uStorm;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
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
  float alpha = body * life * mix(0.34, 0.2, night) * (1.0 - clamp(uStorm, 0.0, 1.0) * 0.4);
  if (alpha < 0.004) discard;
  vec3 smokeColor = mix(vec3(0.82, 0.83, 0.86), vec3(0.34, 0.3, 0.3), night);
  gl_FragColor = vec4(smokeColor, alpha);
}`;

/** One draw for all the wood smoke. It runs entirely in the vertex shader, with no per-frame work. */
export class BaikalVapor {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(parent: THREE.Object3D, shared: BaikalUniforms, chimneys: readonly THREE.Vector3[], mobile: boolean) {
    const puffs = mobile ? 10 : 18, count = chimneys.length * puffs;
    const quad = new THREE.PlaneGeometry(1, 1), geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index; geometry.setAttribute("position", quad.getAttribute("position")); geometry.setAttribute("uv", quad.getAttribute("uv"));
    const puffData = new Float32Array(count * 4), origins = new Float32Array(count * 3);
    let cursor = 0;
    for (const origin of chimneys) for (let i = 0; i < puffs; i++) {
      puffData.set([i / puffs + (cursor * .137) % .05, 8, 1, (cursor * .618) % 1], cursor * 4);
      origins.set([origin.x, origin.y, origin.z], cursor * 3); cursor++;
    }
    geometry.setAttribute("aPuff", new THREE.InstancedBufferAttribute(puffData, 4)); geometry.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origins, 3));
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
