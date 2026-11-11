/**
 * One transparent draw over the real sand bed. Travelling waves supply displacement
 * and analytic normals, without an FFT, reflection/refraction target or GPU readback.
 * The adapter keeps its old name to leave the shoreline and far sea integration local.
 */
import * as THREE from "three";
import { HORIZON_MELT } from "./sky-shader";

export const SEA_Y = -0.22;
export const ULTRA_RADIUS = 260;
/** Distant colour blending, not a reflected scene. */
export const FAR_SKY_SHARE = 0.45;
export type UltraTier = "high" | "mobile";

/** Matches sandHeight() in shore-terrain.ts without baking a height map. */
const COAST_GLSL = /* glsl */ `
uniform float uSeaY;
uniform float uTime;
float coastBed(float z) {
  if (z >= -1.2) return 0.0;
  float d = -1.2 - z;
  if (d <= 2.0) return -0.14 * d;
  return -(0.28 + 2.8 * (1.0 - exp(-(d - 2.0) / 45.0)));
}
// x = height; yz = spatial derivatives, shared by the surface and wet sand.
vec3 coastWave(vec2 p) {
  vec4 phase = vec4(dot(p, vec2(0.10, 0.995)) * 0.36,
    dot(p, vec2(-0.30, 0.954)) * 0.78,
    dot(p, vec2(0.75, 0.661)) * 1.70,
    dot(p, vec2(-0.50, 0.866)) * 3.20) - uTime * vec4(0.70, 0.95, 1.25, 1.70);
  vec4 slope = cos(phase) * vec4(0.038, 0.018, 0.009, 0.004) * vec4(0.36, 0.78, 1.70, 3.20);
  return vec3(dot(sin(phase), vec4(0.038, 0.018, 0.009, 0.004)),
    dot(slope, vec4(0.10, -0.30, 0.75, -0.50)),
    dot(slope, vec4(0.995, 0.954, 0.661, 0.866)));
}
`;

const WATER_VERTEX = /* glsl */ `
${COAST_GLSL}
varying vec3 vWorld;
void main() {
  vec3 w = position;
  float depth = max(uSeaY - coastBed(w.z), 0.0);
  // Keep a small run-up at zero depth: fading to zero here would pin the waterline.
  float wave = coastWave(w.xz).x * mix(0.5, 1.0, smoothstep(0.0, 0.30, depth));
  // Meet the existing far plane at its original height, without a ring at the edge.
  w.y = mix(uSeaY + wave, 0.012, smoothstep(100.0, 260.0, length(w.xz)));
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const WATER_FRAGMENT = /* glsl */ `
${COAST_GLSL}
${HORIZON_MELT}
uniform sampler2D uPhoto;
uniform vec3 uPhotoTint;
uniform vec3 uSkyHorizon;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLantern;
uniform float uDeepNight;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  if (length(p) > 260.0 || (abs(p.x) > 25.0 && p.y > -16.0)) discard;
  float bed = coastBed(p.y);
  float depth = vWorld.y - bed;
  if (depth <= 0.0) discard;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = normalize(toCam);
  vec3 wave = coastWave(p);
  float ripple = mix(1.0, 0.18, smoothstep(12.0, 100.0, dist));
  vec3 n = normalize(vec3(-wave.y * ripple, 1.0, -wave.z * ripple));
  float grazing = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  // The actual sand and submerged feet show through the surface, without a second
  // scene draw. Deeper water gradually absorbs more light.
  vec3 col = mix(vec3(0.25, 0.55, 0.56), vec3(0.10, 0.27, 0.32), smoothstep(0.10, 3.0, depth)) * uPhotoTint;
  float alpha = (1.0 - exp(-depth * 0.58)) * 0.86;
  alpha = mix(alpha, 0.94, grazing * smoothstep(0.0, 0.35, depth));
  vec3 H = normalize(uLightDir + V);
  col += uLightColor * pow(max(dot(n, H), 0.0), 100.0) * 0.18 * smoothstep(0.0, 0.15, uLightDir.y);
  // An irregular thin lace follows the moving waterline, without a foam texture.
  float lace = 0.55 + 0.25 * sin(p.x * 8.5 + p.y * 3.2 + uTime * 0.47)
    + 0.20 * sin(p.x * 15.1 - p.y * 5.4 - uTime * 0.63);
  float foam = (1.0 - smoothstep(0.0, 0.08, depth)) * smoothstep(0.25, 0.78, lace) * 0.42;
  col = mix(col, vec3(0.80, 0.85, 0.82) * uPhotoTint, foam);
  alpha = max(alpha, foam * 0.65);
  vec3 viewDir = -V;
  vec3 level = normalize(vec3(viewDir.x, 0.0, viewDir.z));
  float sunDistance = length(level - uSun);
  vec3 horizonSky = uSkyHorizon + uSunColor * exp(-sunDistance * sunDistance / 0.012) * 0.07 * smoothstep(-0.025, 0.05, uSun.y)
    + vec3(1.0, 0.52, 0.18) * uLantern * 0.135 * mix(1.0, 0.08, uDeepNight);
  // Exactly the SEA_FRAG edge colour: one static photo texel, not a reflected image.
  vec3 farSea = mix(texture2D(uPhoto, vec2(0.5, 0.475)).rgb * uPhotoTint, horizonSky, ${FAR_SKY_SHARE});
  float farMix = smoothstep(55.0, 245.0, dist);
  col = mix(col, farSea, farMix);
  alpha = mix(alpha, 1.0, farMix);
  col = mix(col, horizonSky, horizonMelt(viewDir.y));
  gl_FragColor = vec4(col, alpha);
}
`;

/** More cells at the shore; distant cells have no noticeable displacement. */
function surfaceGeometry(mobile: boolean) {
  const positive = [0];
  for (let x = 0; x < 264;) {
    x = Math.min(264, x + (x < 36 ? (mobile ? 1.2 : 0.8) : x < 90 ? 4 : 12));
    positive.push(x);
  }
  const xs = [...positive.slice(1).reverse().map(x => -x), ...positive];
  const zs = [-264, -240, -210, -180, -150, -125, -105, -90, -78, -68, -60];
  for (let z = -60; z < 2;) {
    z = Math.min(2, z + (z < -18 ? 2 : mobile ? 0.6 : 0.4));
    zs.push(z);
  }
  const positions = new Float32Array(xs.length * zs.length * 3);
  const indices = new Uint16Array((xs.length - 1) * (zs.length - 1) * 6);
  let p = 0, k = 0;
  for (const z of zs) for (const x of xs) { positions[p++] = x; positions[p++] = SEA_Y; positions[p++] = z; }
  for (let r = 0; r < zs.length - 1; r++) for (let c = 0; c < xs.length - 1; c++) {
    const a = r * xs.length + c, b = a + 1, d = a + xs.length;
    indices[k++] = a; indices[k++] = d; indices[k++] = b;
    indices[k++] = b; indices[k++] = d; indices[k++] = d + 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export class BeachUltraSea {
  readonly surface: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; uniforms: Record<string, THREE.IUniform> };
  readonly sandUniforms: Record<string, THREE.IUniform>;
  private time = 0;
  private disposed = false;

  /** No float render-target extension required, including on older phones. */
  static supported(_renderer: THREE.WebGLRenderer) { return true; }

  constructor(_renderer: THREE.WebGLRenderer, scene: THREE.Scene, opts: {
    photo: THREE.Texture | null; photoTint: THREE.IUniform; tier: UltraTier;
    skyFragment: string; skyUniforms: Record<string, THREE.IUniform>;
  }) {
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 }, uSeaY: { value: SEA_Y },
      uPhoto: { value: opts.photo }, uPhotoTint: opts.photoTint,
      uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Vector3(1, 1, 1) },
      uSkyHorizon: opts.skyUniforms.uSkyHorizon ?? { value: new THREE.Vector3(0.6, 0.75, 0.8) },
      uSun: opts.skyUniforms.uSun ?? { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: opts.skyUniforms.uSunColor ?? { value: new THREE.Vector3(1, 1, 1) },
      uLantern: opts.skyUniforms.uLantern ?? { value: 0 }, uDeepNight: opts.skyUniforms.uDeepNight ?? { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT,
      transparent: true, depthWrite: false, toneMapped: false, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(surfaceGeometry(opts.tier === "mobile"), material);
    mesh.name = "beach-ultra-sea";
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.surface = { mesh, material, uniforms };
    this.sandUniforms = { uTime: uniforms.uTime, uSeaY: uniforms.uSeaY, uSunDirT: uniforms.uLightDir };
  }

  /** Objects already show through transparent water in the normal scene draw. */
  addRefracted(_object: THREE.Object3D) {}

  setDaylight(sunDir: readonly number[], sunColor: readonly number[], _tint: THREE.Vector3 | readonly number[], isSun: boolean) {
    const u = this.surface.uniforms;
    (u.uLightDir.value as THREE.Vector3).set(sunDir[0], sunDir[1], sunDir[2]).normalize();
    const strength = isSun ? 0.95 : 0.0032;
    (u.uLightColor.value as THREE.Vector3).set(sunColor[0] * strength, sunColor[1] * strength, sunColor[2] * strength);
  }

  /** Advance a uniform; the main scene draw does all the work, once. */
  prepare(dt: number, _camera: THREE.PerspectiveCamera) {
    if (this.disposed) return;
    this.time += Math.max(0, Math.min(dt, 0.1));
    this.surface.uniforms.uTime.value = this.time;
  }

  get enabled() { return this.surface.mesh.visible; }
  set enabled(value: boolean) { this.surface.mesh.visible = value; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.surface.mesh.removeFromParent();
    this.surface.mesh.geometry.dispose();
    this.surface.material.dispose();
  }
}

export const SAND_SHORE_PARS = /* glsl */ `
${COAST_GLSL}
uniform vec3 uSunDirT;
`;

/** Wet sand follows the same low waves, without shoreline map baking. */
export const SAND_SHORE_ALBEDO = /* glsl */ `
  {
    float coastHeight = vCoastWorld.y - uSeaY;
    float coastWet = 1.0 - smoothstep(-0.03, 0.14, coastHeight);
    float coastWash = 1.0 - smoothstep(0.0, 0.06, coastHeight - coastWave(vCoastWorld.xz).x);
    float coastFilm = max(coastWet * 0.72, coastWash);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.68, 0.76, 0.75), coastFilm);
  }
`;

/** Restrained moving light on the shallow bed; no extra render passes. */
export const SAND_SHORE_CAUSTICS = /* glsl */ `
  {
    float coastDepth = max(uSeaY - vCoastWorld.y, 0.0);
    vec2 coastP = vCoastWorld.xz;
    float coastPattern = sin(coastP.x * 2.1 + coastP.y * 0.9 + uTime * 0.38)
      * sin(coastP.y * 2.3 - coastP.x * 0.7 - uTime * 0.31);
    float coastLight = pow(max(coastPattern, 0.0), 4.0) * 0.16
      * smoothstep(0.0, 0.18, coastDepth) * exp(-coastDepth * 0.5) * smoothstep(0.02, 0.3, uSunDirT.y);
    reflectedLight.directDiffuse *= 1.0 + coastLight;
  }
`;
