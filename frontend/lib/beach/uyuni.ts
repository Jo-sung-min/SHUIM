import * as THREE from "three";
import type { Daylight } from "./daylight";
import { UYUNI_SURFACE, UYUNI_WATER_FRAGMENT, UYUNI_WATER_VERTEX, uyuniDryAmount } from "./uyuni-shader";
import { buildUyuniHotels } from "./uyuni-hotels";
import { uyuniHotelFloorHeight } from "./uyuni-hotel-layout";
import { BED_LAYER, LAGOON_FALLS, type UyuniBunkerOptions, buildUyuniBunkers } from "./uyuni-bunkers";
import { BUNKER_FLOOR_Y, BUNKER_LAGOON, UYUNI_BUNKERS, type UyuniBunkerId } from "./uyuni-bunker-layout";
import { BunkerLagoonWater } from "./uyuni-lagoon";
import type { BoardGame } from "./net";

export interface UyuniWalker { x: number; z: number; moving: boolean }
export type UyuniSkyUniforms = Record<string, THREE.IUniform>;

/** Ground against the lagoon's water level anywhere in the world: the basins shelve in from their kerbs, and everything else is land. */
function lagoonShore(x: number, z: number): number {
  const L = BUNKER_LAGOON;
  for (const bunker of UYUNI_BUNKERS) {
    const lx = x - bunker.x, lz = z - bunker.z, back = L.maxZ + 1;
    if (lx > L.minX && lx < L.maxX && lz > L.minZ && lz < back) return -Math.min(L.depth, .3 + Math.min(lx - L.minX, L.maxX - lx, lz - L.minZ, back - lz) * .9);
  }
  return .6;
}

/** A single mirror plane and two modest lights; environment textures belong to the engine. */
export class UyuniWorld {
  readonly surface: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly fill = new THREE.HemisphereLight(0xdce8ff, 0x8c9eb7, 1.2);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.1);
  private readonly ripples = Array.from({ length: UYUNI_SURFACE.rippleCount }, () => new THREE.Vector4(0, 0, -10000, 0));
  private readonly previousStep = new THREE.Vector2();
  private hasStep = false;
  private nextRipple = 0;
  private rippleLimit: number = UYUNI_SURFACE.rippleCount;
  private lastRippleTime = -Infinity;
  private lastTime: number | null = null;
  private disposed = false;
  private hotels: ReturnType<typeof buildUyuniHotels> | null = null;
  private bunkers: ReturnType<typeof buildUyuniBunkers> | null = null;
  private indoor = false;
  private lagoon: BunkerLagoonWater | null = null;
  private lagoonFailed = false;
  private lagoonRoom: UyuniBunkerId | null = null;
  private activeBunker: UyuniBunkerId | null = null;
  private readonly lagoonEye = new THREE.Vector3();
  private readonly scene: THREE.Scene;
  private readonly bunkerOptions: UyuniBunkerOptions | undefined;

  constructor(scene: THREE.Scene, skyUniforms: UyuniSkyUniforms, sandTexture: THREE.Texture, hotelTextures?: { wood: THREE.Texture; cotton: THREE.Texture }, bunkerOptions?: UyuniBunkerOptions) {
    this.scene = scene; this.bunkerOptions = bunkerOptions;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...skyUniforms,
        uSand: { value: sandTexture }, uSandTint: { value: new THREE.Vector3(1, 1, 1) },
        uCamPos: { value: new THREE.Vector3() }, uWalker: { value: new THREE.Vector2(0, 12) },
        uRipples: { value: this.ripples }, uRippleLimit: { value: this.rippleLimit }, uWaveScale: { value: 1 },
      },
      vertexShader: UYUNI_WATER_VERTEX, fragmentShader: UYUNI_WATER_FRAGMENT,
      toneMapped: false, transparent: false, depthWrite: true,
    });
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(UYUNI_SURFACE.size, UYUNI_SURFACE.size, 1, 1), material);
    this.surface.name = "uyuni-mirror-water";
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = UYUNI_SURFACE.height;
    this.surface.frustumCulled = false;
    this.fill.name = "uyuni-sky-fill";
    this.sun.name = "uyuni-sun-moon";
    this.sun.position.set(20, 50, -30);
    this.sun.castShadow = false;
    scene.add(this.surface, this.fill, this.sun);
    if (hotelTextures) {
      this.hotels = buildUyuniHotels(scene, hotelTextures);
      this.bunkers = buildUyuniBunkers(scene, hotelTextures, bunkerOptions);
    }
  }

  setBoardGames(games: readonly BoardGame[]) { this.bunkers?.setBoardGames(games); }

  /** Runs the beach's sea engine for the lagoon while someone is underground, on a device that can afford it. Everyone else keeps the hall's own drawn water. */
  prepareWater(dt: number, camera: THREE.PerspectiveCamera, fine: boolean) {
    const options = this.bunkerOptions, bunker = UYUNI_BUNKERS.find(item => item.id === this.activeBunker);
    if (!bunker || !this.bunkers || !options?.renderer || options.mobile || this.lagoonFailed) return;
    if (!fine) { if (this.lagoon?.enabled) { this.lagoon.enabled = false; this.bunkers.setLagoonDrawn(true); } return; }
    if (!this.bunkers.prepare(0)) return;
    if (!this.lagoon) {
      try {
        if (!BunkerLagoonWater.supported(options.renderer)) throw new Error("no float render targets");
        this.lagoon = new BunkerLagoonWater(options.renderer, this.scene, { level: BUNKER_FLOOR_Y + BUNKER_LAGOON.level, shore: lagoonShore, extent: 100, bedLayer: BED_LAYER });
      } catch { this.lagoonFailed = true; return; }
    }
    if (!this.lagoon.enabled) { this.lagoon.enabled = true; this.bunkers.setLagoonDrawn(false); }
    if (this.lagoonRoom !== bunker.id) {
      const L = BUNKER_LAGOON, lap = .3;
      this.lagoonRoom = bunker.id;
      this.lagoon.setPool({ minX: bunker.x + L.minX - lap, maxX: bunker.x + L.maxX + lap, minZ: bunker.z + L.minZ - lap, maxZ: bunker.z + L.maxZ + lap, falls: LAGOON_FALLS.map(([x, reach, strength]) => [bunker.x + x, bunker.z + L.maxZ - reach, strength] as const) });
    }
    this.lagoonEye.set(bunker.x, BUNKER_FLOOR_Y + 1.7, bunker.z + (BUNKER_LAGOON.minZ + BUNKER_LAGOON.maxZ) / 2 - 1);
    this.lagoon.prepare(dt, camera, this.lagoonEye);
  }

  /** Puts the shelters together a few milliseconds at a time. True once they are ready to walk into. */
  prepareBunkers(budgetMs: number) { return this.bunkers?.prepare(budgetMs) ?? true; }

  setBunkerActive(id: UyuniBunkerId | null) {
    this.indoor = id !== null; this.activeBunker = id;
    if (!id && this.lagoon?.enabled) { this.lagoon.enabled = false; this.bunkers?.setLagoonDrawn(true); }
    this.surface.visible = this.fill.visible = this.sun.visible = !this.indoor;
    if (this.hotels) this.hotels.root.visible = !this.indoor;
    this.bunkers?.setActive(id);
    this.hasStep = false;
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    this.hotels?.applyDaylight(d);
    const night = THREE.MathUtils.clamp(d.stars, 0, 1);
    // The luminous mirror also fills faces from below, so visitors remain readable at night.
    this.fill.intensity = THREE.MathUtils.lerp(1.55, 1.65, night);
    this.fill.color.setRGB(...d.cloud, THREE.SRGBColorSpace).lerp(new THREE.Color(0xbfc8ff), night);
    this.fill.groundColor.setHex(0xcbd7e8).lerp(new THREE.Color(0x8d9dcc), night);
    this.sun.intensity = THREE.MathUtils.lerp(0.45 + Math.max(0, d.sun[1]) * 1.2, 0.6, night);
    this.sun.color.setRGB(...d.sunColor, THREE.SRGBColorSpace).lerp(new THREE.Color(0xc1ceff), night);
    const light = d.sun[1] > 0 ? d.sun : d.moon;
    this.sun.position.set(light[0] * 80, Math.max(18, light[1] * 80), light[2] * 80);
    const tint = this.surface.material.uniforms.uSandTint.value as THREE.Vector3;
    tint.set(...d.sandTint).multiplyScalar(THREE.MathUtils.lerp(1, 0.68, night));
  }

  update(time: number, camera: THREE.Camera, walker?: UyuniWalker) {
    if (this.disposed || !Number.isFinite(time)) return;
    if (this.indoor) { this.bunkers?.update(time); return; }
    const uniforms = this.surface.material.uniforms;
    if (this.lastTime !== null && time < this.lastTime) {
      for (const ripple of this.ripples) ripple.w = 0;
      this.hasStep = false;
      this.lastRippleTime = -Infinity;
    }
    this.lastTime = time;
    uniforms.uTime.value = time;
    camera.getWorldPosition(uniforms.uCamPos.value as THREE.Vector3);
    const position = uniforms.uCamPos.value as THREE.Vector3;
    // Recentring never moves the salt pattern: UVs and ripple centres use world XZ.
    this.surface.position.x = position.x;
    this.surface.position.z = position.z;
    for (const ripple of this.ripples) {
      if (time - ripple.z >= UYUNI_SURFACE.rippleLifetime) ripple.w = 0;
    }
    if (!walker || !Number.isFinite(walker.x) || !Number.isFinite(walker.z)) {
      this.hasStep = false;
      return;
    }
    (uniforms.uWalker.value as THREE.Vector2).set(walker.x, walker.z);
    if (uyuniHotelFloorHeight(walker.x, walker.z) > 0.02) {
      this.hasStep = false;
      return;
    }
    if (!walker.moving || !this.hasStep) {
      this.previousStep.set(walker.x, walker.z);
      this.hasStep = true;
      return;
    }
    const distance = Math.hypot(walker.x - this.previousStep.x, walker.z - this.previousStep.y);
    if (distance > 8) {
      this.previousStep.set(walker.x, walker.z);
      return;
    }
    if (distance < 0.38 || time - this.lastRippleTime < 0.2) return;
    this.previousStep.set(walker.x, walker.z);
    this.lastRippleTime = time;
    const strength = 1 - uyuniDryAmount(walker.x, walker.z);
    if (strength < 0.02) return;
    this.ripples[this.nextRipple].set(walker.x, walker.z, time, strength);
    this.nextRipple = (this.nextRipple + 1) % this.rippleLimit;
  }

  setQuality(low: boolean) {
    if (this.disposed) return;
    this.rippleLimit = low ? 6 : UYUNI_SURFACE.rippleCount;
    this.surface.material.uniforms.uRippleLimit.value = this.rippleLimit;
    this.surface.material.uniforms.uWaveScale.value = low ? 0.7 : 1;
    for (let i = this.rippleLimit; i < this.ripples.length; i++) this.ripples[i].w = 0;
    this.nextRipple %= this.rippleLimit;
  }

  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  /** Only owned resources: the engine retains and disposes the injected sky/sand textures. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.hotels?.dispose();
    this.hotels = null;
    this.lagoon?.dispose();
    this.lagoon = null; this.lagoonRoom = null;
    this.bunkers?.dispose();
    this.bunkers = null;
    this.surface.removeFromParent();
    this.fill.removeFromParent();
    this.sun.removeFromParent();
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.sun.shadow.dispose();
  }
}
