import * as THREE from "three";
import type { Daylight } from "./daylight";
import { UYUNI_SURFACE, UYUNI_WATER_FRAGMENT, UYUNI_WATER_VERTEX, uyuniDryAmount } from "./uyuni-shader";
import { buildUyuniHotels } from "./uyuni-hotels";
import { uyuniHotelFloorHeight } from "./uyuni-hotel-layout";
import { buildUyuniBunkers } from "./uyuni-bunkers";
import type { UyuniBunkerId } from "./uyuni-bunker-layout";

export interface UyuniWalker { x: number; z: number; moving: boolean }
export type UyuniSkyUniforms = Record<string, THREE.IUniform>;

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

  constructor(scene: THREE.Scene, skyUniforms: UyuniSkyUniforms, sandTexture: THREE.Texture, hotelTextures?: { wood: THREE.Texture; cotton: THREE.Texture }) {
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
      this.bunkers = buildUyuniBunkers(scene, hotelTextures);
    }
  }

  setBunkerActive(id: UyuniBunkerId | null) {
    this.indoor = id !== null;
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
    if (this.disposed || this.indoor || !Number.isFinite(time)) return;
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
