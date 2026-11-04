import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";

/** A few paper lanterns above the horizon; small distant lights leave the sea unobstructed. */
const TEXTURE_URL = "/beach/real/sky-lantern-v2.png";
// Keep a few readable paper silhouettes in the narrow phone view. The rest stay scattered.
const FOREGROUND_LANTERNS = [
  { base: [-5, 6, -20], seed: [0.16, 0.18, 2.0, 18] },
  { base: [6, 8, -34], seed: [0.28, 0.20, 2.25, 20] },
  { base: [-3, 7, -43], seed: [0.42, 0.16, 1.9, 22] },
  { base: [2, 7, -26], seed: [0.52, 0.15, 1.85, 16] },
] as const;
const RISE_GLSL = `
uniform float uTime;
attribute vec3 aBase;
attribute vec4 aSeed;
varying float vFade; varying float vSeed; varying float vDist;
vec3 lanternWorld(out float life) {
  life = mod(uTime * aSeed.y + aSeed.x * aSeed.w, aSeed.w) / aSeed.w;
  float sway = sin(uTime * 0.17 + aSeed.x * 38.0) * (0.45 + life * 0.9);
  sway += sin(uTime * 0.31 + aSeed.x * 19.0) * 0.15;
  return aBase + vec3(sway + life * 2.4, life * aSeed.w, -life * (5.0 + aSeed.x * 7.0));
}`;

const PAPER_VERT = `
${RISE_GLSL}
uniform float uAspect; uniform float uExpand;
varying vec2 vUv;
void main() {
  vUv = uv; vSeed = aSeed.x;
  float life;
  vec3 world = lanternWorld(life);
  vFade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.76, 1.0, life));
  vec3 toCam = cameraPosition - world;
  vDist = length(toCam);
  vec2 horizontal = toCam.xz / max(length(toCam.xz), 0.001);
  vec3 right = vec3(horizontal.y, 0.0, -horizontal.x);
  float tilt = sin(uTime * 0.23 + vSeed * 27.0) * 0.055;
  vec2 local = vec2(position.x * uAspect, position.y);
  local = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * local;
  vec3 p = world + (right * local.x + vec3(0.0, local.y, 0.0)) * aSeed.z * uExpand;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const PAPER_FRAG = `
uniform sampler2D uPaper;
uniform float uTime; uniform float uAmount;
varying vec2 vUv; varying float vFade; varying float vSeed; varying float vDist;
void main() {
  // The SRGB texture is decoded by the renderer's SRGB8_ALPHA8 texture format.
  vec4 paper = texture2D(uPaper, vUv);
  float flicker = 0.965 + 0.035 * sin(uTime * 2.2 + vSeed * 41.0) * sin(uTime * 3.1 + vSeed * 13.0);
  float distanceFade = 1.0 - smoothstep(180.0, 300.0, vDist);
  float alpha = paper.a * vFade * uAmount * distanceFade;
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(paper.rgb * flicker, alpha);
  #include <colorspace_fragment>
}`;

const GLOW_FRAG = `
uniform float uTime; uniform float uAmount; uniform vec3 uGlowColor;
varying vec2 vUv; varying float vFade; varying float vSeed; varying float vDist;
void main() {
  vec2 p = (vUv - vec2(0.5, 0.39)) * vec2(2.0, 2.0);
  // Exactly zero at the outer edge; never an opaque rectangular billboard.
  float halo = pow(max(0.0, 1.0 - dot(p, p)), 3.0);
  float alpha = halo * 0.095 * vFade * uAmount * (1.0 - smoothstep(140.0, 240.0, vDist));
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(uGlowColor, alpha);
  #include <colorspace_fragment>
}`;

const FAR_VERT = `
${RISE_GLSL}
void main() {
  vSeed = aSeed.x;
  float life;
  vec3 world = lanternWorld(life);
  vFade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.75, 1.0, life));
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSeed.z * 450.0 / max(vDist, 1.0), 1.25, 4.0);
}`;
const FAR_FRAG = `
uniform float uTime; uniform float uAmount; uniform vec3 uFarColor;
varying float vFade; varying float vSeed; varying float vDist;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float glow = pow(max(0.0, 1.0 - r * r), 2.0);
  float flicker = 0.92 + 0.08 * sin(uTime * 1.4 + vSeed * 37.0);
  float alpha = glow * flicker * vFade * uAmount * 0.65 * (1.0 - smoothstep(300.0, 430.0, vDist));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uFarColor, alpha);
  #include <colorspace_fragment>
}`;

function seeded(seed: number) {
  let state = seed;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

export class SkyLanterns {
  private near: THREE.Mesh;
  private glow: THREE.Mesh;
  private far: THREE.Points;
  private materials: THREE.ShaderMaterial[];
  private texture: THREE.Texture | null = null;
  private releasedTextures = new WeakSet<THREE.Texture>();
  private ready = false;
  private disposed = false;
  private amount = 0;
  private shown = 0;
  private lastTime: number | null = null;
  private uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uAspect: { value: 0.7 },
    uGlowColor: { value: new THREE.Color().setRGB(1.0, 0.52, 0.19, THREE.SRGBColorSpace) },
    uFarColor: { value: new THREE.Color().setRGB(1.0, 0.79, 0.49, THREE.SRGBColorSpace) },
  };

  constructor(scene: THREE.Scene, count: number) {
    const nearCount = Math.max(1, Math.min(32, Math.round(count)));
    const rand = seeded(71);
    const geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.setAttribute("uv", quad.getAttribute("uv"));
    geometry.setIndex(quad.getIndex());
    quad.dispose();
    geometry.instanceCount = nearCount;
    const base = new Float32Array(nearCount * 3);
    const seed = new Float32Array(nearCount * 4);
    for (let i = 0; i < nearCount; i++) {
      base[i * 3] = (rand() - 0.5) * 168;
      base[i * 3 + 1] = 10 + rand() * 9;
      base[i * 3 + 2] = -30 - rand() * 115;
      seed[i * 4] = rand();
      seed[i * 4 + 1] = 0.18 + rand() * 0.17;
      seed[i * 4 + 2] = 1.15 + rand() * 0.85;
      seed[i * 4 + 3] = 25 + rand() * 22;
      // Consume the same seeded values above so the surrounding sky does not shift.
      const foreground = FOREGROUND_LANTERNS[i];
      if (foreground) {
        base.set(foreground.base, i * 3);
        seed.set(foreground.seed, i * 4);
      }
    }
    geometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    const paper = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uPaper: { value: null }, uExpand: { value: 1 } },
      vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    const glow = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uExpand: { value: 2.05 } },
      vertexShader: PAPER_VERT, fragmentShader: GLOW_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    this.near = new THREE.Mesh(geometry, paper);
    this.glow = new THREE.Mesh(geometry, glow);
    this.near.name = "sky-lantern-paper";
    this.glow.name = "sky-lantern-glow";
    this.near.renderOrder = 3;
    this.glow.renderOrder = 2;
    this.near.frustumCulled = this.glow.frustumCulled = false;

    const farCount = nearCount * 3;
    const farGeometry = new THREE.BufferGeometry();
    const farBase = new Float32Array(farCount * 3);
    const farSeed = new Float32Array(farCount * 4);
    for (let i = 0; i < farCount; i++) {
      farBase[i * 3] = (rand() - 0.5) * 360;
      farBase[i * 3 + 1] = 18 + rand() * 36;
      farBase[i * 3 + 2] = -85 - rand() * 230;
      farSeed[i * 4] = rand();
      farSeed[i * 4 + 1] = 0.14 + rand() * 0.17;
      farSeed[i * 4 + 2] = 0.55 + rand() * 0.6;
      farSeed[i * 4 + 3] = 35 + rand() * 28;
    }
    farGeometry.setAttribute("position", new THREE.BufferAttribute(farBase, 3));
    farGeometry.setAttribute("aBase", new THREE.BufferAttribute(farBase, 3));
    farGeometry.setAttribute("aSeed", new THREE.BufferAttribute(farSeed, 4));
    const farMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: FAR_VERT, fragmentShader: FAR_FRAG,
      transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    });
    this.far = new THREE.Points(farGeometry, farMaterial);
    this.far.name = "sky-lantern-distance";
    this.far.frustumCulled = false;
    this.far.renderOrder = 2;
    this.materials = [paper, glow, farMaterial];
    scene.add(this.glow, this.near, this.far);
    this.setVisible(false);

    this.texture = assetLoader(new THREE.TextureLoader()).load(assetUrl(TEXTURE_URL), (texture) => {
      if (this.disposed) {
        this.releaseTexture(texture);
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      const image = texture.image as { width?: number; height?: number } | undefined;
      this.uniforms.uAspect.value = (image?.width || 1) / (image?.height || 1);
      paper.uniforms.uPaper.value = texture;
      this.ready = true;
      this.setVisible(this.shown > 0.005);
    }, undefined, () => {
      if (this.disposed) return;
      this.ready = false;
      if (this.texture) this.releaseTexture(this.texture);
      this.texture = null;
      paper.uniforms.uPaper.value = null;
      this.setVisible(this.shown > 0.005);
    });
  }

  private releaseTexture(texture: THREE.Texture) {
    // ImageLoader may finish after disposal and attach its image to the same texture.
    texture.image = null;
    if (this.releasedTextures.has(texture)) return;
    this.releasedTextures.add(texture);
    texture.dispose();
  }

  private setVisible(visible: boolean) {
    this.near.visible = this.glow.visible = visible && this.ready && !this.disposed;
    this.far.visible = visible && !this.disposed;
  }

  setAmount(amount: number) {
    this.amount = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  }

  update(time: number) {
    if (this.disposed) return;
    const dt = this.lastTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    this.shown = THREE.MathUtils.damp(this.shown, this.amount, 2.4, dt);
    if (this.amount === 0 && this.shown < 0.005) this.shown = 0;
    this.uniforms.uTime.value = time;
    this.uniforms.uAmount.value = this.shown;
    this.setVisible(this.shown > 0.005);
  }

  /** Own resources are removed before the engine traverses the remaining scene. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.setVisible(false);
    this.near.removeFromParent(); this.glow.removeFromParent(); this.far.removeFromParent();
    for (const geometry of new Set([this.near.geometry, this.glow.geometry, this.far.geometry])) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.materials[0].uniforms.uPaper.value = null;
    if (this.texture) this.releaseTexture(this.texture);
    this.texture = null;
  }
}
