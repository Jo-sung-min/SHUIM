import * as THREE from "three";
import { GARDEN_SEATS, HALL } from "./garden-layout";

type RestSeat = { spotId: string; slot: number } | null | undefined;

/** One personal reading lamp. It follows confirmed hall seating, never the walking position. */
export class GardenSeatLight {
  private readonly light = new THREE.PointLight(0xffd2a1, 0, 3.6, 2);
  private readonly glowTexture: THREE.DataTexture;
  private readonly glow: THREE.Sprite;
  private readonly source = { value: new THREE.Vector4(0, -100, 0, 0) };
  private readonly warm = { value: new THREE.Color(0xffce91) };
  private readonly shade: THREE.MeshStandardMaterial | null;
  private readonly previousCompile: THREE.MeshStandardMaterial["onBeforeCompile"] | undefined;
  private readonly previousCacheKey: THREE.MeshStandardMaterial["customProgramCacheKey"] | undefined;
  private desired: (typeof GARDEN_SEATS)[number] | null = null;
  private current: (typeof GARDEN_SEATS)[number] | null = null;
  private amount = 0;
  private disposed = false;

  constructor(private readonly root: THREE.Object3D) {
    this.light.name = "garden-personal-reading-light";
    this.light.castShadow = false;
    // Keep the light in the shader at zero power, avoiding recompiles when sitting/standing.
    this.root.add(this.light);
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
      const alpha = Math.exp(-radius * radius * 7) * (1 - THREE.MathUtils.smoothstep(radius, .65, 1));
      pixels.set([255, 255, 255, Math.round(alpha * 255)], (y * 32 + x) * 4);
    }
    this.glowTexture = new THREE.DataTexture(pixels, 32, 32);
    this.glowTexture.minFilter = this.glowTexture.magFilter = THREE.LinearFilter;
    this.glowTexture.needsUpdate = true;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTexture, color: 0xffd5a2, opacity: 0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false,
    }));
    this.glow.name = "garden-personal-lamp-glow";
    this.glow.scale.setScalar(.68);
    this.glow.visible = false;
    this.root.add(this.glow);

    const shadeMesh = root.getObjectByName("garden-ivory-lamp-shades");
    this.shade = shadeMesh instanceof THREE.Mesh && shadeMesh.material instanceof THREE.MeshStandardMaterial ? shadeMesh.material : null;
    this.previousCompile = this.shade?.onBeforeCompile;
    this.previousCacheKey = this.shade?.customProgramCacheKey;
    if (this.shade) {
      // Lamp shades stay in their existing material batch. Only this desk's shade glows.
      const original = this.previousCompile!;
      this.shade.onBeforeCompile = (shader, renderer) => {
        original.call(this.shade!, shader, renderer);
        shader.uniforms.uReadingLamp = this.source;
        shader.uniforms.uReadingWarm = this.warm;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vReadingWorld;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvReadingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vReadingWorld;\nuniform vec4 uReadingLamp;\nuniform vec3 uReadingWarm;")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nfloat readingShade = 1.0 - smoothstep(.17, .23, distance(vReadingWorld, uReadingLamp.xyz));\ntotalEmissiveRadiance += uReadingWarm * readingShade * uReadingLamp.w * 1.7;");
      };
      this.shade.customProgramCacheKey = () => "garden-personal-lamp-v1";
      this.shade.needsUpdate = true;
    }
  }

  setSeat(seat: RestSeat) {
    if (this.disposed) return;
    if (seat?.spotId === this.desired?.spotId && seat?.slot === this.desired?.slot) return;
    this.desired = seat ? GARDEN_SEATS.find(candidate => candidate.spotId === seat.spotId
      && candidate.slot === seat.slot && candidate.spotId.startsWith("hall-tier-")) ?? null : null;
  }

  update(dt: number, night: number, rain: number) {
    if (this.disposed) return;
    const step = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
    // A different seat first fades out; light never sweeps across other people's desks.
    if (this.desired !== this.current && this.amount < .012) {
      this.current = this.desired;
      if (this.current) {
        const seat = this.current;
        this.source.value.set(seat.x + Math.sign(seat.x - HALL.x) * .5, seat.baseY + 1.12, seat.z - 1.05, 0);
        this.light.position.set(this.source.value.x, this.source.value.y - .1, this.source.value.z);
        this.glow.position.copy(this.light.position).y += .12;
      }
    }
    const target = this.current && this.current === this.desired ? 1 : 0;
    this.amount += (target - this.amount) * (1 - Math.exp(-step * 5.5));
    if (Math.abs(this.amount - target) < .001) this.amount = target;
    const ambience = .65 + .35 * Math.max(Number.isFinite(night) ? THREE.MathUtils.clamp(night, 0, 1) : 0, Number.isFinite(rain) ? THREE.MathUtils.clamp(rain, 0, 1) : 0);
    this.source.value.w = this.amount * ambience;
    this.light.intensity = this.amount * (1.2 + .8 * ambience);
    this.glow.material.opacity = this.amount * .24 * ambience;
    this.glow.visible = this.amount > .003;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.light.removeFromParent(); this.light.dispose();
    this.glow.removeFromParent(); this.glow.material.dispose(); this.glowTexture.dispose();
    if (this.shade) {
      this.shade.onBeforeCompile = this.previousCompile!;
      this.shade.customProgramCacheKey = this.previousCacheKey!;
      this.shade.needsUpdate = true;
    }
  }
}
