/**
 * The lagoon under the Uyuni hotels, drawn by the same sea engine as the beach (Ultra Water, MIT).
 *
 * The engine draws an endless sea at one level. Here that level sits just below the marble floor, so the only place
 * the sea shows is the basin cut into it. What makes it look real is all the engine's own work: wind ripples from its
 * wave simulation, the stone bed bent through the surface, colour that deepens with depth, and the hall itself
 * mirrored in the water. That mirror is a picture of the hall taken once from over the lagoon.
 *
 * A phone draws the same water on a coarser mesh with a smaller reflection and refraction, as it does at the beach.
 * Any device the engine has turned its quality down on keeps the light drawn water from the hall itself.
 */
import * as THREE from "three";
import { OceanSim, defaultOceanParams } from "../ultra-water/water/OceanSim.js";
import { OceanSurface } from "../ultra-water/water/OceanSurface.js";
import { bakeShoreMap } from "../ultra-water/water/shoreMap.js";
import { bakeWaterTextures } from "../ultra-water/water/bakeTextures.js";
import { FloaterShadow } from "../ultra-water/scene/floaterShadow.js";

export interface LagoonOptions {
  /** World height of the water. */
  level: number;
  /** Ground against the water level at a point of the world, in metres: below zero under water, above it on land. */
  shore: (x: number, z: number) => number;
  /** Side of the square around the world's origin that the shore map has to cover. */
  extent: number;
  /** Layer that holds only the lagoon bed, which is all the water needs to see through itself. */
  bedLayer: number;
  /** A phone: a coarser mesh, a smaller picture of the hall and a smaller view of the bed. */
  mobile?: boolean;
}

/** The basin the water is in, in world metres, and where water falls into it: x, z and strength of each fall. A fall spills all round its point, a little over a metre out. */
export interface LagoonPool { minX: number; maxX: number; minZ: number; maxZ: number; falls: readonly (readonly [number, number, number])[] }

/** Side of one cell of the water's mesh. Ripples indoors are a hand wide, so this is fine enough to carry them; a phone takes a coarser one. */
const CELL = .16, PHONE_CELL = .24;
/** Seconds a ring from a fall lasts before the next one starts. */
const RING_LIFE = 2.4;

function disposeDeep(o: unknown, seen = new Set<unknown>(), depth = 0) {
  if (!o || typeof o !== "object" || seen.has(o) || depth > 4) return;
  seen.add(o);
  if (o instanceof THREE.WebGLRenderer || o instanceof Promise || (typeof Node !== "undefined" && o instanceof Node)) return;
  const any = o as { isWebGLRenderTarget?: boolean; isTexture?: boolean; isMaterial?: boolean; isBufferGeometry?: boolean; isCamera?: boolean; dispose?: () => void };
  if (any.isWebGLRenderTarget || any.isTexture || any.isMaterial || any.isBufferGeometry) { any.dispose?.(); return; }
  if (any.isCamera) return;
  for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === "object") disposeDeep(v, seen, depth + 1);
}

/**
 * The engine's sea is at height zero. Only the place on screen and the line of sight are moved to the lagoon's level;
 * every wave calculation stays in the engine's own coordinates. Its HDR result then goes through the renderer's tone mapping.
 */
function patchLagoonMaterial(material: THREE.ShaderMaterial) {
  const lift = "vec3(0.0, uSeaY, 0.0)";
  const must = (s: string, a: string, b: string) => { if (!s.includes(a)) throw new Error(`lagoon water patch: ${a.slice(0, 40)}`); return s.replace(a, b); };
  let v = material.vertexShader;
  v = must(v, "uniform float uGridScale;", "uniform float uGridScale;\nuniform float uSeaY;");
  // The engine's own mesh follows the camera out to a horizon. Indoors one small mesh lies over the basin and stays there.
  const follow = /vec2 xz = cameraPosition\.xz \+ local \* scale;/, spacing = /float cell = max\(r, [0-9.]+\) \* uCellStep \* scale;/;
  if (!follow.test(v) || !spacing.test(v)) throw new Error("lagoon water patch: grid");
  v = v.replace(follow, "vec2 xz = position.xz;").replace(spacing, "float cell = uCellStep;");
  v = must(v, "gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);", `gl_Position = projectionMatrix * viewMatrix * vec4(vWorld + ${lift}, 1.0);`);
  let f = material.fragmentShader;
  f = must(f, "uniform float uCamSide;", "uniform float uCamSide;\nuniform float uSeaY;");
  f = must(f, "  vec3 toCam = cameraPosition - vWorld;", `  vec3 toCam = cameraPosition - ${lift} - vWorld;`);
  f = f.split("viewMatrix * vec4(vWorld, 1.0)").join(`viewMatrix * vec4(vWorld + ${lift}, 1.0)`);
  f = must(f, "  fragColor = vec4(col, 2.0);", `  #ifdef TONE_MAPPING
  col = toneMapping(col);
  #endif
  fragColor = linearToOutputTexel(vec4(col, 1.0));`);
  material.vertexShader = v;
  material.fragmentShader = f;
  material.toneMapped = true;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
}

export class BunkerLagoonWater {
  readonly mesh: THREE.Mesh;
  private surface: OceanSurface;
  private sim: OceanSim;
  private floatShadow: FloaterShadow;
  private foam: { foam: THREE.Texture };
  private cubeRT: THREE.WebGLCubeRenderTarget;
  private cubeCam: THREE.CubeCamera;
  private refractRT: THREE.WebGLRenderTarget | null = null;
  private reflection: THREE.DataTexture;
  private proxy = new THREE.PerspectiveCamera();
  private sunDir = new THREE.Vector3(.15, 1, .1).normalize();
  private bed = new THREE.Color().setRGB(.02, .1, .1, THREE.LinearSRGBColorSpace);
  private clearColor = new THREE.Color();
  private time = 0;
  private pictured = false;
  private retake = 0;
  private grid: THREE.BufferGeometry | null = null;
  private falls: LagoonPool["falls"] = [];

  static supported(renderer: THREE.WebGLRenderer) {
    // The wave simulation is drawn into float render targets.
    return renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float");
  }

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private options: LagoonOptions) {
    // The water shader reads seventeen textures across both stages; lift the unit limit to the combined one, as the beach does.
    const gl = renderer.getContext() as WebGL2RenderingContext;
    renderer.capabilities.maxTextures = Math.max(renderer.capabilities.maxTextures, gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
    const size = options.mobile ? 128 : 256;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(.2, 90, this.cubeRT);
    const sky = { cube: this.cubeRT.texture, cubeSize: size, sunDir: this.sunDir, sunColor: new THREE.Vector3(.7, .58, .42) };
    const shore = bakeShoreMap(options.shore, options.extent, 512);
    // Indoors there is only a draught: fine ripples, no swell, nothing that breaks.
    const params = { ...defaultOceanParams(), windSpeed: 1.7, windDirection: -60, waveScale: .22, swellScale: 0, choppiness: .2, foamRecovery: 2.5 };
    this.sim = new OceanSim(renderer, params);
    this.foam = bakeWaterTextures(renderer);
    this.floatShadow = new FloaterShadow(4);
    this.floatShadow.clear(renderer);
    this.surface = new OceanSurface(this.sim, shore, sky, this.floatShadow.uniforms);
    const u = this.surface.uniforms as Record<string, THREE.IUniform>;
    u.uFoamTex.value = this.foam.foam;
    (u.uShoreWave.value as THREE.Vector4).set(0, 12, .9, 0);
    (u.uFoam.value as THREE.Vector4).set(.01, 1, .1, .72);
    // A shallow pool has to show its colour within a metre, so light is taken up far faster than in open sea. Green is taken up
    // well ahead of blue, so over the pale marble bed the water reads a clear sky blue rather than turquoise.
    (u.uAbsorption.value as THREE.Vector3).set(1.1, .42, .1);
    (u.uScatterColor.value as THREE.Color).setRGB(.01, .08, .26);
    u.uGlint.value = .3;
    this.reflection = new THREE.DataTexture(new Uint8Array(4), 1, 1); this.reflection.needsUpdate = true;
    u.uReflection.value = this.reflection;
    u.uSeaY = { value: options.level };
    patchLagoonMaterial(this.surface.material);
    for (const grid of this.surface.grids) grid.dispose();
    this.mesh = this.surface.mesh;
    u.uCellStep.value = this.cell;
    this.mesh.name = "uyuni-bunker-lagoon-sea";
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get enabled() { return this.mesh.visible; }
  set enabled(value: boolean) { this.mesh.visible = value; }

  /** Says which basin the water lies in, and lays one small mesh over it. */
  private get cell() { return this.options.mobile ? PHONE_CELL : CELL; }

  setPool(pool: LagoonPool) {
    const nx = Math.ceil((pool.maxX - pool.minX) / this.cell), nz = Math.ceil((pool.maxZ - pool.minZ) / this.cell);
    const positions = new Float32Array((nx + 1) * (nz + 1) * 3), index = new Uint16Array(nx * nz * 6);
    for (let j = 0, k = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k += 3) {
      positions[k] = pool.minX + (pool.maxX - pool.minX) * i / nx; positions[k + 2] = pool.minZ + (pool.maxZ - pool.minZ) * j / nz;
    }
    for (let j = 0, k = 0; j < nz; j++) for (let i = 0; i < nx; i++, k += 6) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1;
      index[k] = a; index[k + 1] = c; index[k + 2] = b; index[k + 3] = b; index[k + 4] = c; index[k + 5] = c + 1;
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    grid.setIndex(new THREE.BufferAttribute(index, 1));
    this.grid?.dispose();
    this.grid = grid; this.mesh.geometry = grid; this.falls = pool.falls; this.pictured = false;
  }

  /** Takes the picture of the hall that the water mirrors. Once is enough: nothing in the hall moves far. */
  picture(from: THREE.Vector3) {
    const r = this.renderer, previous = r.getRenderTarget(), autoClear = r.autoClear, shown = this.mesh.visible;
    this.mesh.visible = false; r.autoClear = true;
    this.cubeCam.position.copy(from);
    this.cubeCam.update(r, this.scene);
    r.setRenderTarget(previous); r.autoClear = autoClear; this.mesh.visible = shown;
    this.pictured = true;
  }

  /** Every frame before the main render: the waves, then the lagoon bed as the water will see it. */
  prepare(dt: number, camera: THREE.PerspectiveCamera, from: THREE.Vector3, settled = true) {
    if (!this.mesh.visible || !this.grid) return;
    // The hall's photographs may still be arriving when the first picture is taken, so one more is taken a little later,
    // once the visitor stands still: the picture is the one heavy step, and taken mid-stride it would show as a jolt.
    if (!this.pictured) { this.picture(from); this.retake = 3; }
    else if (this.retake >= 0) { this.retake = Math.max(0, this.retake - dt); if (this.retake === 0 && settled) { this.picture(from); this.retake = -1; } }
    const r = this.renderer, u = this.surface.uniforms as Record<string, THREE.IUniform>;
    this.time += dt;
    const previous = r.getRenderTarget(), autoClear = r.autoClear, shadowAuto = r.shadowMap.autoUpdate, clearAlpha = r.getClearAlpha();
    r.getClearColor(this.clearColor);
    r.autoClear = false;
    this.sim.update(dt);
    // The engine sizes its grid by the camera's height over the sea, so it is told the height over the lagoon.
    this.proxy.copy(camera, false);
    camera.getWorldPosition(this.proxy.position); camera.getWorldQuaternion(this.proxy.quaternion);
    this.proxy.position.y -= this.options.level;
    this.proxy.updateMatrixWorld(true);
    this.surface.update(this.proxy, this.time % 3600);
    this.mesh.geometry = this.grid;
    u.uCellStep.value = this.cell;
    u.uCamSide.value = -1;
    // Rings spread from where each fall lands. A fall owns two of the engine's eight rings, half a life apart.
    const rings = u.uImpact.value as THREE.Vector4[], sizes = u.uImpactSize.value as number[];
    for (let i = 0; i < rings.length; i++) {
      const fall = this.falls[i >> 1];
      if (!fall) { rings[i].w = 0; continue; }
      const beat = this.time / RING_LIFE + (i & 1) * .5 + (i >> 1) * .37, turn = Math.floor(beat), age = beat - turn;
      const chance = Math.sin(turn * 12.9898 + i * 78.233) * 43758.5453, where = chance - Math.floor(chance) - .5;
      const round = (where + .5) * Math.PI * 2 + i;
      rings[i].set(fall[0] + Math.sin(round) * 1.12, fall[1] + Math.cos(round) * 1.12, age * RING_LIFE + .12, fall[2] * .028 * (1 - age) * (1 - age));
      sizes[i] = .3;
    }
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const scale = this.options.mobile ? .5 : .6, w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale));
    if (!this.refractRT || this.refractRT.width !== w || this.refractRT.height !== h) {
      this.refractRT?.dispose();
      this.refractRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType), generateMipmaps: false });
    }
    (u.uResolution.value as THREE.Vector2).copy(size);
    u.uSceneColor.value = this.refractRT.texture;
    u.uSceneDepth.value = this.refractRT.depthTexture;
    const mask = camera.layers.mask;
    camera.layers.set(this.options.bedLayer);
    this.mesh.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.refractRT);
    r.setClearColor(this.bed, 1);
    r.clear(true, true, false);
    r.render(this.scene, camera);
    camera.layers.mask = mask;
    this.mesh.visible = true;
    r.shadowMap.autoUpdate = shadowAuto;
    r.setRenderTarget(previous);
    r.setClearColor(this.clearColor, clearAlpha);
    r.autoClear = autoClear;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.surface.material.dispose();
    this.grid?.dispose();
    this.refractRT?.dispose();
    this.cubeRT.dispose();
    this.reflection.dispose();
    disposeDeep(this.sim);
    disposeDeep(this.floatShadow);
    this.foam.foam.dispose();
  }
}
