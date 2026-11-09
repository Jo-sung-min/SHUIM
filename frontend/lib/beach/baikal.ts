import * as THREE from "three";
import type { Daylight } from "./daylight";
import type { PavilionSeat } from "./bamboo-trail";
import { BAIKAL_CABIN, BAIKAL_CABINS, BAIKAL_COZY_PER_ROOM, BAIKAL_ROOM_SPILL, BAIKAL_SEATS, insideBaikalCabin } from "./baikal-layout";
import { type BaikalUniforms, createBaikalFlameMaterial, createBaikalIceMaterial, createBaikalUniforms } from "./baikal-materials";
import { applyCozyLighting, seatBlanketGeometry } from "./baikal-cozy";
import { type BaikalTextures, buildBaikalCabin, buildBaikalHummocks, buildBaikalShore } from "./baikal-geometry";
import { BaikalSnow } from "./baikal-snow";
import { BaikalVapor } from "./baikal-vapor";
import { type BaikalBake, bakeBaikalRoomOcclusion, bakeBaikalTextures } from "./baikal-bake";
import { BaikalPost } from "./baikal-post";

export interface BaikalWalker { x: number; z: number; moving?: boolean }
const OCCLUSION_LAYER = 5;
const PROBE_LAYER = 6;

/** A plush blanket settles over everyone who sits down, and slips off again when they stand. */
class SeatBlankets {
  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly amounts = new Float32Array(BAIKAL_SEATS.length);
  private readonly dummy = new THREE.Object3D();

  constructor(parent: THREE.Object3D, shared: BaikalUniforms, knit: THREE.Texture | null, mobile: boolean) {
    const geometry = seatBlanketGeometry(mobile ? 20 : 34, mobile ? 24 : 40);
    this.material = applyCozyLighting(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, side: THREE.DoubleSide, normalMap: knit, normalScale: new THREE.Vector2(.8, .8) }), shared, knit ? { fabric: true, cavity: .55, count: mobile ? 8 : BAIKAL_COZY_PER_ROOM } : { fabric: true, count: mobile ? 8 : BAIKAL_COZY_PER_ROOM });
    this.material.name = "baikal-seat-blanket";
    this.mesh = new THREE.InstancedMesh(geometry, this.material, BAIKAL_SEATS.length);
    this.mesh.name = "baikal-seat-blankets"; this.mesh.frustumCulled = false;
    const colors = [0xf0e2cc, 0xd9b48a, 0xe8cfc0, 0xc9d0bb, 0xefe7d8], tint = new THREE.Color();
    BAIKAL_SEATS.forEach((_, index) => {
      this.mesh.setMatrixAt(index, this.dummy.matrix.makeScale(0, 0, 0));
      this.mesh.setColorAt(index, tint.setHex(colors[index % colors.length]));
    });
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    parent.add(this.mesh);
  }

  /** Each frame only touches a seat whose blanket is still arriving or leaving. */
  update(seated: readonly PavilionSeat[], dt: number) {
    let changed = false;
    BAIKAL_SEATS.forEach((seat, index) => {
      const wanted = seated.some(other => other.spotId === seat.spotId && other.slot === seat.slot) ? 1 : 0, current = this.amounts[index];
      if (current === wanted) return;
      let next = current + (wanted - current) * (1 - Math.exp(-dt * 7));
      if (Math.abs(wanted - next) < .004) next = wanted;
      this.amounts[index] = next; changed = true;
      const eased = next * next * (3 - 2 * next);
      this.dummy.position.set(seat.x, seat.avatarY + (1 - eased) * .3, seat.z);
      this.dummy.rotation.set(0, seat.yaw + Math.PI, 0, "YXZ");
      this.dummy.scale.setScalar(next === 0 ? 0 : Math.max(.001, eased));
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(index, this.dummy.matrix);
    });
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.dispose(); this.material.dispose(); }
}

/** A small wood stove: instanced flame tongues behind its glass, an ember bed, and one breathing, flickering light. */
class StoveFire {
  readonly flames: THREE.InstancedMesh;
  readonly light = new THREE.PointLight(0xff9a3c, 0, 11, 2);
  /** The flicker of this fire this frame: shared with every surface the cozy lighting patch touches. */
  glow = 1;
  private readonly power: number;
  private readonly material: THREE.ShaderMaterial;
  private readonly embers: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(parent: THREE.Object3D, hearth: THREE.Vector3, time: THREE.IUniform<number>, burning = true) {
    this.power = burning ? 1 : .22;
    this.material = createBaikalFlameMaterial(time);
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 6); geometry.translate(0, .5, 0);
    const seeds = new Float32Array(burning ? 7 : 0);
    for (let i = 0; i < seeds.length; i++) seeds[i] = i / seeds.length;
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    this.flames = new THREE.InstancedMesh(geometry, this.material, seeds.length);
    const transform = new THREE.Object3D();
    for (let i = 0; i < seeds.length; i++) {
      const a = i * 2.399963, outer = i > 2;
      transform.position.set(hearth.x + Math.sin(a) * (outer ? .14 : .05), hearth.y - .02 + (i % 3) * .005, hearth.z - .08 + Math.cos(a) * (outer ? .06 : .03));
      transform.scale.set(outer ? .18 + (i % 3) * .04 : .3, outer ? .3 + (i % 4) * .06 : .46, 1);
      transform.updateMatrix(); this.flames.setMatrixAt(i, transform.matrix);
    }
    this.flames.name = "baikal-stove-flames"; this.flames.frustumCulled = false; this.flames.renderOrder = 6; parent.add(this.flames);
    this.embers = new THREE.Mesh(new THREE.CircleGeometry(.2, 16), new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: .85, toneMapped: false, depthWrite: false }));
    this.embers.visible = burning; this.embers.name = "baikal-stove-embers"; this.embers.rotation.x = -Math.PI / 2; this.embers.position.set(hearth.x, hearth.y - .03, hearth.z - .1); parent.add(this.embers);
    this.light.name = "baikal-stove-light"; this.light.castShadow = false; this.light.position.set(hearth.x, hearth.y + .35, hearth.z + .6); parent.add(this.light);
  }
  update(time: number, night: number) {
    // Slow breathing plus a quick, small flicker: the room pulses, it never strobes.
    const breath = 1 + Math.sin(time * .65) * .04 + Math.sin(time * 1.7 + .6) * .02;
    const flicker = 1 + (Math.sin(time * 9.3) * Math.sin(time * 5.1 + 1.3) + Math.sin(time * 13.7)) * .035;
    this.glow = breath * flicker;
    this.light.intensity = (10 + night * 12) * this.glow * this.power;
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
  private readonly vapor: BaikalVapor;
  private readonly fires: StoveFire[];
  private journeyStage = 0;
  private reveal = 0;
  private activeCabin = -1;
  private daylight: Daylight | null = null;
  private readonly hemi = new THREE.HemisphereLight(0xcfdcf0, 0x9aa7b8, 1.1);
  private readonly sun = new THREE.DirectionalLight(0xfff1dc, 1);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly time: THREE.IUniform<number>;
  private readonly seatBlankets: SeatBlankets;
  private storm = 1;
  private night = 0;
  private lampAmount = 1;
  private lastTime = 0;
  private disposed = false;
  private readonly baked: BaikalBake | null = null;
  private readonly post: BaikalPost | null = null;
  private readonly candleFlames: THREE.InstancedMesh | null = null;
  private readonly candleMaterial: THREE.ShaderMaterial | null = null;
  private lowQuality = false;
  private interior = 0;
  private roomCube: THREE.WebGLCubeRenderTarget | null = null;
  private cleanCube: THREE.WebGLCubeRenderTarget | null = null;
  private cleanCamera: THREE.CubeCamera | null = null;
  private cleanScene: THREE.Scene | null = null;
  private cleanMesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial> | null = null;
  private cleanMaterial: THREE.ShaderMaterial | null = null;
  private cubeCamera: THREE.CubeCamera | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private environment: THREE.WebGLCubeRenderTarget | null = null;
  private occlusion: THREE.WebGLRenderTarget | null = null;
  private probedNight = -1;
  private readonly renderer: THREE.WebGLRenderer | null;

  constructor(private readonly scene: THREE.Scene, skyUniforms: Record<string, THREE.IUniform>, textures: BaikalTextures, private readonly mobile = false, renderer: THREE.WebGLRenderer | null = null) {
    this.renderer = renderer;
    this.root.name = "baikal"; scene.add(this.root);
    this.shared = createBaikalUniforms(skyUniforms);
    this.shared.uSnowPhoto.value = textures.snow ?? null; this.shared.uHasSnowPhoto.value = textures.snow ? 1 : 0;
    this.shared.uIcePhoto.value = textures.ice ?? null; this.shared.uHasIcePhoto.value = textures.ice ? 1 : 0;
    this.time = this.shared.uTime;
    this.shared.uLayers.value = mobile ? 2 : 3;
    if (renderer) {
      this.baked = bakeBaikalTextures(renderer, mobile);
      this.shared.uIceVolume.value = this.baked.iceVolume; this.shared.uHasIceVolume.value = this.baked.iceVolume ? 1 : 0;
      this.shared.uSnowDrift.value = this.baked.snowDrift; this.shared.uHasSnowDrift.value = this.baked.snowDrift ? 1 : 0;
      this.shared.uFrost.value = this.baked.frost; this.shared.uHasFrost.value = 1;
      this.post = new BaikalPost(renderer, mobile);
    }
    this.hemi.name = "baikal-sky-fill"; this.sun.name = "baikal-winter-sun"; this.sun.position.set(40, 30, -20); this.sun.castShadow = false;
    this.root.add(this.hemi, this.sun);
    // One recentred sheet of ice; the pattern lives in world space so walking never slides it.
    const iceGeometry = new THREE.PlaneGeometry(2000, 2000, 1, 1); iceGeometry.rotateX(-Math.PI / 2);
    iceGeometry.setAttribute("aLift", new THREE.Float32BufferAttribute(new Float32Array(iceGeometry.getAttribute("position").count), 1));
    this.ice = new THREE.Mesh(iceGeometry, createBaikalIceMaterial(this.shared)); this.ice.name = "baikal-frozen-lake"; this.ice.frustumCulled = false; this.root.add(this.ice);
    this.shore = buildBaikalShore(this.root, this.shared, textures, mobile);
    this.hummocks = buildBaikalHummocks(this.root, this.shared, mobile);
    this.cabin = buildBaikalCabin(this.root, textures, this.shared, mobile, this.baked);
    this.fires = this.cabin.hearths.map((hearth, index) => new StoveFire(this.root, hearth, this.time, this.cabin.hearthFlames[index]));
    this.seatBlankets = new SeatBlankets(this.root, this.shared, this.baked?.knit ?? null, mobile);
    // A small real flame on every candle.
    {
      this.candleMaterial = createBaikalFlameMaterial(this.time);
      const quad = new THREE.PlaneGeometry(1, 1, 1, 6); quad.translate(0, .5, 0);
      const spots = this.cabin.candles, seeds = new Float32Array(spots.length);
      for (let i = 0; i < seeds.length; i++) seeds[i] = (i * .618) % 1;
      quad.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
      this.candleFlames = new THREE.InstancedMesh(quad, this.candleMaterial, spots.length);
      const transform = new THREE.Object3D();
      spots.forEach((spot, i) => { transform.position.set(spot.x, spot.y - .045, spot.z); transform.scale.set(.05, .1, 1); transform.updateMatrix(); this.candleFlames!.setMatrixAt(i, transform.matrix); });
      this.candleFlames.instanceMatrix.needsUpdate = true; this.candleFlames.name = "baikal-candle-flames"; this.candleFlames.frustumCulled = false; this.candleFlames.renderOrder = 6;
      this.root.add(this.candleFlames);
    }
    // Reuse three real lights for the nearest room; far windows use merged emissive geometry.
    for (const source of this.cabin.cabinLights.slice(0, 3)) {
      const light = new THREE.PointLight(source.color, 0, 9, 2); light.position.copy(source.position); light.castShadow = false; light.name = "baikal-pendant-light";
      this.lamps.push(light); this.root.add(light);
    }
    if (mobile) this.lamps[2].visible = false;
    this.snow = new BaikalSnow(this.root, this.shared, mobile);
    this.vapor = new BaikalVapor(this.root, this.shared, this.cabin.chimneys, mobile);
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
    this.shared.uCabinLights.value.forEach((light, index) => { light.w = this.shared.uCabinLight.value.w * BAIKAL_ROOM_SPILL[index]; });
    // The cozy patch lights the room; these three stay soft and only give avatars and metal their highlights.
    this.applyLampLevels();
    this.applyFog(d);
    this.refreshRoomLight();
  }

  private applyLampLevels() {
    const gain = this.cabin.cabinLights[Math.max(0, this.activeCabin) * 3].gain;
    for (const lamp of this.lamps) lamp.intensity = (5 + 11 * this.lampAmount) * gain;
  }

  /**
   * Once everything has loaded: bake where furniture meets the floor and photograph the finished room for its own reflections.
   * Later captures only happen when dusk or dawn has moved the light outside enough to matter.
   */
  prepareRoomLight(probeExtras: readonly THREE.Object3D[] = []) {
    const renderer = this.renderer;
    if (this.disposed || !renderer || this.occlusion) return;
    for (const object of this.cabin.occluders) object.layers.enable(OCCLUSION_LAYER);
    this.occlusion = bakeBaikalRoomOcclusion(renderer, this.scene, BAIKAL_CABIN.floorY, OCCLUSION_LAYER);
    for (const object of this.cabin.occluders) object.layers.disable(OCCLUSION_LAYER);
    this.shared.uRoomOcc.value = this.occlusion.texture; this.shared.uHasRoomOcc.value = 1;
    const cubeOptions = { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
    this.roomCube = new THREE.WebGLCubeRenderTarget(this.mobile ? 128 : 256, cubeOptions);
    this.cleanCube = new THREE.WebGLCubeRenderTarget(this.mobile ? 128 : 256, cubeOptions);
    this.cubeCamera = new THREE.CubeCamera(.3, 450, this.roomCube);
    this.cubeCamera.position.set(-23, 2.4, 6);
    for (const face of this.cubeCamera.children) face.layers.set(PROBE_LAYER);
    for (const object of [...this.cabin.occluders, ...probeExtras, this.ice, this.fires[0].flames]) object.layers.enable(PROBE_LAYER);
    this.cleanCamera = new THREE.CubeCamera(.1, 10, this.cleanCube);
    this.cleanScene = new THREE.Scene();
    this.cleanMaterial = new THREE.ShaderMaterial({ uniforms: { tSource: { value: this.roomCube.texture } }, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform samplerCube tSource; varying vec3 vDir; void main() { vec4 c = textureCube(tSource, vDir); bool bad = !(c.r >= 0.0) || !(c.g >= 0.0) || !(c.b >= 0.0) || c.r > 1e4 || c.g > 1e4 || c.b > 1e4; gl_FragColor = vec4(bad ? vec3(0.0) : min(c.rgb, vec3(32.0)), 1.0); }" });
    this.cleanMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), this.cleanMaterial); this.cleanMesh.frustumCulled = false; this.cleanScene.add(this.cleanMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // The first pass sees an unreflective room; the second gets one bounce of itself.
    this.captureRoom(); this.captureRoom();
  }

  private refreshRoomLight() {
    if (!this.renderer || !this.pmrem) return;
    if (Math.abs(this.night - this.probedNight) > (this.mobile ? .34 : .12)) this.captureRoom();
  }

  private captureRoom() {
    const renderer = this.renderer, cube = this.cubeCamera, pmrem = this.pmrem, room = this.roomCube, clean = this.cleanCube, cleaner = this.cleanCamera;
    if (!renderer || !cube || !pmrem || !room || !clean || !cleaner || !this.cleanScene) return;
    this.probedNight = this.night;
    // Halos are billboards for one viewer, and the glass would be sampling the very cube being drawn.
    const hide = [this.snow.flakes, ...this.cabin.captureHidden], visibility = hide.map(object => object.visible);
    hide.forEach(object => { object.visible = false; });
    const previous = renderer.getRenderTarget();
    cube.update(renderer, this.scene);
    hide.forEach((object, i) => { object.visible = visibility[i]; });
    // One bad pixel from any shader would spread through the whole prefiltered chain, so the capture is sanitised before it is blurred.
    cleaner.update(renderer, this.cleanScene);
    this.environment = pmrem.fromCubemap(clean.texture, this.environment);
    renderer.setRenderTarget(previous);
    this.shared.uRoomCube.value = clean.texture; this.shared.uHasRoomCube.value = 1;
    this.cabin.setEnvironment(this.environment.texture);
  }

  /** Draws the frame through the print stage, or directly when the device is on the low tier. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (this.post && !this.lowQuality) {
      this.post.interior = this.interior; this.post.night = this.night; this.post.time = this.time.value;
      this.post.render(this.scene, camera);
    } else renderer.render(this.scene, camera);
  }

  /** Fog distances follow the storm and open up indoors so the room stays crisp while the window goes white. */
  applyFog(d: Daylight, inside = false) {
    const storm = this.shared.uStorm.value;
    const near = d.fogNear * (1 - storm * .35), far = d.fogFar * (1 - storm * .4) * (inside ? 2.2 : 1);
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

  update(time: number, camera: THREE.Camera, self?: BaikalWalker, seated: readonly PavilionSeat[] = []) {
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
      this.applyLampLevels();
    }
    this.fires.forEach((fire, index) => { fire.update(time, this.night); fire.light.visible = index === closest; });
    this.shared.uFireGlow.value = this.fires[closest].glow;
    const indoors = insideBaikalCabin(at.x, at.z) ? 1 : 0;
    this.interior += (indoors - this.interior) * (1 - Math.exp(-dt * 2.5));
    this.seatBlankets.update(seated, dt);
    if (this.daylight) {
      this.applyFog(this.daylight, insideBaikalCabin(at.x, at.z));
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = this.fogNear; this.scene.fog.far = this.fogFar;
      }
    }
  }

  isInside(x: number, z: number) { return insideBaikalCabin(x, z); }

  setQuality(low: boolean) {
    if (this.disposed) return;
    this.lowQuality = low;
    this.shared.uLayers.value = low ? 2 : 3;
    this.snow.setQuality(low); this.hummocks.setQuality(low);
    this.lamps[2].visible = !low;
  }
  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.snow.dispose(); this.vapor.dispose(); for (const fire of this.fires) fire.dispose(); this.cabin.dispose(); this.hummocks.dispose(); this.shore.dispose();
    if (this.candleFlames) { this.candleFlames.geometry.dispose(); this.candleFlames.dispose(); } this.candleMaterial?.dispose();
    this.post?.dispose(); this.baked?.dispose(); this.occlusion?.dispose(); this.roomCube?.dispose(); this.cleanCube?.dispose(); this.environment?.dispose(); this.pmrem?.dispose();
    this.cleanMesh?.geometry.dispose(); this.cleanMaterial?.dispose();
    this.seatBlankets.dispose();
    this.ice.geometry.dispose(); this.ice.material.dispose();
    for (const lamp of this.lamps) lamp.dispose(); this.sun.dispose(); this.hemi.dispose();
    this.root.removeFromParent(); this.root.clear();

  }
}
