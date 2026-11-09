import * as THREE from "three";
import type { Daylight } from "./daylight";
import type { PavilionSeat } from "./bamboo-trail";
import { BAIKAL_CABINS, BAIKAL_SEATS, insideBaikalCabin } from "./baikal-layout";
import { type BaikalUniforms, createBaikalFlameMaterial, createBaikalIceMaterial, createBaikalUniforms } from "./baikal-materials";
import { type BaikalTextures, buildBaikalCabin, buildBaikalHummocks, buildBaikalShore } from "./baikal-geometry";
import { BaikalSnow } from "./baikal-snow";

export interface BaikalWalker { x: number; z: number; moving?: boolean }

/** A small wood stove: instanced flame tongues behind its glass, an ember bed, and one breathing, flickering light. */
class StoveFire {
  readonly flames: THREE.InstancedMesh;
  readonly light = new THREE.PointLight(0xff9a3c, 0, 11, 2);
  private readonly material: THREE.ShaderMaterial;
  private readonly embers: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(parent: THREE.Object3D, hearth: THREE.Vector3, time: THREE.IUniform<number>) {
    this.material = createBaikalFlameMaterial(time);
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 6); geometry.translate(0, .5, 0);
    const seeds = new Float32Array(7);
    for (let i = 0; i < seeds.length; i++) seeds[i] = i / seeds.length;
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.flames = new THREE.InstancedMesh(geometry, this.material, seeds.length);
    const transform = new THREE.Object3D();
    for (let i = 0; i < seeds.length; i++) {
      const a = i * 2.399963, outer = i > 2;
      transform.position.set(hearth.x + Math.sin(a) * (outer ? .14 : .05), hearth.y - .02 + (i % 3) * .005, hearth.z - .08 + Math.cos(a) * (outer ? .06 : .03));
      transform.scale.set(outer ? .14 + (i % 3) * .03 : .22, outer ? .22 + (i % 4) * .05 : .38, 1);
      transform.updateMatrix(); this.flames.setMatrixAt(i, transform.matrix);
    }
    this.flames.name = "baikal-stove-flames"; this.flames.frustumCulled = false; this.flames.renderOrder = 6; parent.add(this.flames);
    this.embers = new THREE.Mesh(new THREE.CircleGeometry(.2, 16), new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: .85, toneMapped: false, depthWrite: false }));
    this.embers.name = "baikal-stove-embers"; this.embers.rotation.x = -Math.PI / 2; this.embers.position.set(hearth.x, hearth.y - .03, hearth.z - .1); parent.add(this.embers);
    this.light.name = "baikal-stove-light"; this.light.castShadow = false; this.light.position.set(hearth.x, hearth.y + .35, hearth.z + .6); parent.add(this.light);
  }
  update(time: number, night: number) {
    // Slow breathing plus a quick, small flicker: the room pulses, it never strobes.
    const breath = 1 + Math.sin(time * .65) * .04 + Math.sin(time * 1.7 + .6) * .02;
    const flicker = 1 + (Math.sin(time * 9.3) * Math.sin(time * 5.1 + 1.3) + Math.sin(time * 13.7)) * .035;
    this.light.intensity = (34 + night * 36) * breath * flicker;
    this.light.position.y = .95 + Math.sin(time * 2.3) * .03;
    this.material.uniforms.uPower.value = .85 + Math.sin(time * 2.1) * .08 + Math.sin(time * 5.7) * .05;
    this.embers.material.opacity = .7 + Math.sin(time * .9) * .1;
  }
  dispose() {
    this.flames.removeFromParent(); this.flames.geometry.dispose(); this.flames.dispose(); this.material.dispose();
    this.embers.removeFromParent(); this.embers.geometry.dispose(); this.embers.material.dispose();
    this.light.removeFromParent(); this.light.dispose();
  }
}

/** A frozen-lake journey through three warm rooms to a quiet aurora viewpoint. */
export class BaikalWorld {
  readonly root = new THREE.Group();
  readonly ice: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly shared: BaikalUniforms;
  private readonly hummocks: ReturnType<typeof buildBaikalHummocks>;
  private readonly shore: ReturnType<typeof buildBaikalShore>;
  private readonly cabin: ReturnType<typeof buildBaikalCabin>;
  private readonly snow: BaikalSnow;
  private readonly fires: StoveFire[];
  private journeyStage = 0;
  private reveal = 0;
  private activeCabin = -1;
  private daylight: Daylight | null = null;
  private readonly village: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly hemi = new THREE.HemisphereLight(0xcfdcf0, 0x9aa7b8, 1.1);
  private readonly sun = new THREE.DirectionalLight(0xfff1dc, 1);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly seatLight = new THREE.PointLight(0xffc98a, 0, 3.2, 2);
  private readonly time: THREE.IUniform<number>;
  private seatTarget: PavilionSeat | null = null;
  private seatAmount = 0;
  private storm = 1;
  private night = 0;
  private lampAmount = 1;
  private lastTime = 0;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene, skyUniforms: Record<string, THREE.IUniform>, textures: BaikalTextures, mobile = false) {
    this.root.name = "baikal"; scene.add(this.root);
    this.shared = createBaikalUniforms(skyUniforms);
    this.shared.uSnowPhoto.value = textures.snow ?? null; this.shared.uHasSnowPhoto.value = textures.snow ? 1 : 0;
    this.shared.uIcePhoto.value = textures.ice ?? null; this.shared.uHasIcePhoto.value = textures.ice ? 1 : 0;
    this.time = this.shared.uTime;
    this.shared.uLayers.value = mobile ? 2 : 3;
    this.hemi.name = "baikal-sky-fill"; this.sun.name = "baikal-winter-sun"; this.sun.position.set(40, 30, -20); this.sun.castShadow = false;
    this.root.add(this.hemi, this.sun);
    // One recentred sheet of ice; the pattern lives in world space so walking never slides it.
    const iceGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1); iceGeometry.rotateX(-Math.PI / 2);
    iceGeometry.setAttribute("aLift", new THREE.Float32BufferAttribute(new Float32Array(iceGeometry.getAttribute("position").count), 1));
    this.ice = new THREE.Mesh(iceGeometry, createBaikalIceMaterial(this.shared)); this.ice.name = "baikal-frozen-lake"; this.ice.frustumCulled = false; this.root.add(this.ice);
    this.shore = buildBaikalShore(this.root, this.shared, textures, mobile);
    this.hummocks = buildBaikalHummocks(this.root, this.shared, mobile);
    this.cabin = buildBaikalCabin(this.root, textures, this.shared, mobile);
    this.fires = this.cabin.hearths.map(hearth => new StoveFire(this.root, hearth, this.time));
    // Reuse three real lights for the nearest room; far windows use merged emissive geometry.
    for (const source of this.cabin.cabinLights.slice(0, 3)) {
      const light = new THREE.PointLight(source.color, 0, 9, 2); light.position.copy(source.position); light.castShadow = false; light.name = "baikal-pendant-light";
      this.lamps.push(light); this.root.add(light);
    }
    if (mobile) this.lamps[2].visible = false;
    this.seatLight.name = "baikal-seat-light"; this.seatLight.castShadow = false; this.root.add(this.seatLight);
    // Far across the lake a few village lights show on clear nights.
    const villagePositions = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      const a = -.9 + (i / 30) * 1.1 + Math.sin(i * 7.3) * .03, r = 430 + Math.sin(i * 3.1) * 40;
      villagePositions.set([Math.sin(a) * r, 1.5 + (i % 3) * .8, -Math.cos(a) * r], i * 3);
    }
    const villageGeometry = new THREE.BufferGeometry(); villageGeometry.setAttribute("position", new THREE.BufferAttribute(villagePositions, 3));
    this.village = new THREE.Points(villageGeometry, new THREE.PointsMaterial({ color: 0xffc27a, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }));
    this.village.name = "baikal-far-village-lights"; this.village.frustumCulled = false; this.root.add(this.village);
    this.snow = new BaikalSnow(this.root, this.shared, mobile);
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    this.daylight = d;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1); this.night = night;
    const sunUp = d.sun[1] > .02, direction = sunUp ? d.sun : d.moon;
    this.hemi.color.setRGB(...d.skyHorizon, THREE.SRGBColorSpace).lerp(new THREE.Color(0x8fa6cf), night * .6);
    this.hemi.groundColor.setRGB(.9, .93, .97, THREE.SRGBColorSpace).lerp(new THREE.Color(0x3b4a66), night);
    // Snow throws light back up: even at night the plain is never pitch dark, so visitors stay readable outdoors.
    this.hemi.intensity = THREE.MathUtils.lerp(1.35, .95, night);
    this.sun.position.set(direction[0] * 80, Math.max(12, direction[1] * 80), direction[2] * 80);
    this.sun.color.setRGB(...d.sunColor, THREE.SRGBColorSpace).lerp(new THREE.Color(0xb8c9f0), night);
    this.sun.intensity = sunUp ? .55 + Math.max(0, d.sun[1]) * 1.1 : .6;
    (this.shared.uFogColor.value as THREE.Vector3).set(...d.fog);
    // Inside the cabin the lamps burn all day, but only at night does their light reach out over the snow.
    this.lampAmount = .45 + .55 * Math.max(night, THREE.MathUtils.clamp(d.lanterns, 0, 1));
    this.cabin.applyNight(this.lampAmount);
    this.shared.uLamp.value = this.lampAmount;
    (this.shared.uCabinLight.value as THREE.Vector4).w = THREE.MathUtils.smoothstep(night, .35, .95);
    for (const light of this.shared.uCabinLights.value) light.w = this.shared.uCabinLight.value.w;
    for (const lamp of this.lamps) lamp.intensity = 14 + 40 * this.lampAmount;
    this.applyFog(d);
  }

  /** Fog distances follow the storm and open up indoors so the room stays crisp while the window goes white. */
  applyFog(d: Daylight, inside = false) {
    const storm = this.shared.uStorm.value;
    const near = d.fogNear * (1 - storm * .8), far = d.fogFar * (1 - storm * .75) * (inside ? 2.2 : 1);
    this.shared.uFogNear.value = near; this.shared.uFogFar.value = far;
  }
  get fogNear() { return this.shared.uFogNear.value; }
  get fogFar() { return this.shared.uFogFar.value; }

  setStorm(amount: number) {
    if (this.disposed) return;
    this.storm = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 1;
    this.shared.uStorm.value = this.storm * (1 - this.reveal * .94);
  }
  get stormAmount() { return this.storm; }

  /** A personal view reward, never a weather/time mutation sent to other visitors. */
  setJourney(stage: number) {
    if (this.disposed) return;
    this.journeyStage = Number.isInteger(stage) && stage >= 0 && stage <= 3 ? stage : 0;
  }

  /** A warm reading light follows the seat the server confirmed, never the walking position. */
  setSeat(seat: { spotId: string; slot: number } | null | undefined) {
    this.seatTarget = seat ? BAIKAL_SEATS.find(candidate => candidate.spotId === seat.spotId && candidate.slot === seat.slot) ?? null : null;
  }

  update(time: number, camera: THREE.Camera, self?: BaikalWalker, seat?: PavilionSeat | null) {
    if (this.disposed || !Number.isFinite(time)) return;
    const dt = time < this.lastTime ? 0 : Math.min(.1, time - this.lastTime); this.lastTime = time;
    this.time.value = time;
    const at = self ?? camera.position;
    this.shared.uWalker.value.set(at.x, at.z);
    this.ice.position.set(camera.position.x, 0, camera.position.z);
    const final = BAIKAL_CABINS[2];
    const distance = Math.hypot(at.x - final.x, at.z - final.z);
    const reward = this.journeyStage === 3 ? 1 - THREE.MathUtils.smoothstep(distance, 20, 62) : 0;
    this.reveal += (reward - this.reveal) * (1 - Math.exp(-dt * .65));
    this.shared.uAurora.value = this.reveal;
    this.shared.uStorm.value = this.storm * (1 - this.reveal * .94);
    this.snow.update(time, this.shared.uStorm.value);
    let closest = 0, nearest = Infinity;
    for (let i = 0; i < BAIKAL_CABINS.length; i++) {
      const c = BAIKAL_CABINS[i], d = (at.x - c.x) ** 2 + (at.z - c.z) ** 2;
      if (d < nearest) { nearest = d; closest = i; }
    }
    if (closest !== this.activeCabin) {
      this.activeCabin = closest;
      this.lamps.forEach((lamp, index) => {
        const source = this.cabin.cabinLights[closest * 3 + index];
        lamp.position.copy(source.position); lamp.color.setHex(source.color);
      });
    }
    this.fires.forEach((fire, index) => { fire.update(time, this.night); fire.light.visible = index === closest; });
    this.village.material.opacity = this.night * (1 - this.shared.uStorm.value) * .9;
    if (this.daylight) {
      this.applyFog(this.daylight, insideBaikalCabin(at.x, at.z));
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = this.fogNear; this.scene.fog.far = this.fogFar;
      }
    }
    if (seat !== undefined) this.setSeat(seat);
    const target = this.seatTarget;
    const wanted = target ? 1 : 0;
    this.seatAmount += (wanted - this.seatAmount) * (1 - Math.exp(-dt * 5));
    if (target) {
      const facing = { x: -Math.sin(target.yaw), z: -Math.cos(target.yaw) };
      this.seatLight.position.set(target.x - facing.x * .5, target.avatarY + 1.0, target.z - facing.z * .5);
    }
    this.seatLight.intensity = this.seatAmount * (9 + this.night * 7);
  }

  isInside(x: number, z: number) { return insideBaikalCabin(x, z); }

  setQuality(low: boolean) {
    if (this.disposed) return;
    this.shared.uLayers.value = low ? 2 : 3;
    this.snow.setQuality(low); this.hummocks.setQuality(low);
    this.lamps[2].visible = !low;
  }
  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.snow.dispose(); for (const fire of this.fires) fire.dispose(); this.cabin.dispose(); this.hummocks.dispose(); this.shore.dispose();
    this.village.geometry.dispose(); this.village.material.dispose();
    this.ice.geometry.dispose(); this.ice.material.dispose();
    for (const lamp of this.lamps) lamp.dispose(); this.seatLight.dispose(); this.sun.dispose(); this.hemi.dispose();
    this.root.removeFromParent(); this.root.clear();

  }
}
