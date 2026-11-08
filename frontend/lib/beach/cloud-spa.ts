import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import type { PavilionSeat } from "./bamboo-trail";
import { CLOUD_SPA_ISLAND, CLOUD_SPA_POOLS, CLOUD_SPA_RESORT, cloudSpaTerraceRadius, cloudSpaMountainHalfWidth, cloudSpaFloorHeight } from "./cloud-spa-layout";
import { buildCloudSpaScenery, cloudSpaGroundGeometry, cloudSpaViewGap } from "./cloud-spa-geometry";
import { createCloudSpaCloudMaterial } from "./cloud-spa-materials";
import { buildCloudSpaCity } from "./cloud-spa-city";

import { CLOUD_SPA_SKY_FUNCTIONS, CLOUD_SPA_SKY_UNIFORMS } from "./cloud-spa-sky";

const WATER_VERT = `
attribute vec4 aPool;
varying vec3 vWorld;
varying vec4 vPool;
void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz; vPool=aPool; gl_Position=projectionMatrix*viewMatrix*world; }
`;
const WATER_FRAG = `
${CLOUD_SPA_SKY_UNIFORMS}
uniform vec4 uRipples[8];
uniform float uWaterDetail;
varying vec3 vWorld;
varying vec4 vPool;
${CLOUD_SPA_SKY_FUNCTIONS}
void main(){
  vec2 p=vWorld.xz;
  float a=p.x*.74+p.y*.48+uTime*.55, b=p.x*-.41+p.y*.82-uTime*.38;
  vec2 slope=vec2(cos(a)*.025-cos(b)*.019,cos(a)*.018+cos(b)*.026);
  float rings=0.0;
  for(int i=0;i<8;i++){
    float age=uTime-uRipples[i].z, dist=length(p-uRipples[i].xy), valid=step(0.0,age)*(1.0-step(4.8,age))*uRipples[i].w;
    float crest=exp(-pow((dist-age*.95)/.24,2.0))*exp(-age*.65)*valid;
    rings+=crest; slope+=normalize(p-uRipples[i].xy+vec2(.001))*crest*.035;
  }
  vec3 n=normalize(vec3(-slope.x,1.0,-slope.y)), viewDir=normalize(cameraPosition-vWorld);
  vec3 reflected=reflect(-viewDir,n); reflected.y=max(.01,reflected.y);
  vec3 sky=cloudSpaSky(normalize(reflected));
  float fresnel=.12+.65*pow(1.0-max(0.0,dot(viewDir,n)),3.0);
  float caustic=pow(max(0.0,sin(a*2.2+sin(b*1.4))*.5+.5),12.0)*.10*uWaterDetail;
  vec3 clearWater=mix(vec3(.035,.24,.28),vec3(.16,.48,.48),.5+.5*sin(p.x*.12+p.y*.17));
  vec3 color=mix(clearWater,sky,fresnel)+vec3(.18,.39,.34)*caustic+vec3(.16,.22,.23)*rings;
  // Warm lantern ribbons are anchored to each pool rim, not to the camera or a panorama.
  for(int i=0;i<8;i++){
    float angle=float(i)*.785398+.22;
    vec3 lamp=vec3(vPool.x+sin(angle)*(vPool.z+2.0),vPool.w+.52,vPool.y+cos(angle)*(vPool.z+2.0));
    vec3 lightDir=normalize(lamp-vWorld), halfDir=normalize(lightDir+viewDir);
    float shimmer=pow(max(0.0,dot(n,halfDir)),110.0)/(1.0+length(lamp-vWorld)*.28);
    color+=vec3(1.0,.61,.24)*shimmer*(.22+.78*uLantern);
  }
  float edge=1.0-smoothstep(vPool.z-.45,vPool.z-.11,length(p-vPool.xy));
  gl_FragColor=vec4(color,.78*edge);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = `
attribute vec4 aCloud;
attribute vec4 aForm;
uniform float uTime;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vDistance;
void main(){
  vec3 centre=aCloud.xyz;
  float steam=step(.5,aForm.w)*(1.0-step(1.5,aForm.w));
  float cycle=fract(uTime*.035+aCloud.x*.017+aCloud.z*.013);
  centre.y+=steam*cycle*1.8;
  centre.x+=sin(uTime*.035+aCloud.z)*.18;
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
  vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 world=centre+right*position.x*aCloud.w*aForm.x+up*position.y*aCloud.w*aForm.y;
  vUv=uv; vKind=aForm.w; vDistance=length(cameraPosition-centre);
  vAlpha=aForm.z*mix(1.0,smoothstep(0.0,.15,cycle)*(1.0-smoothstep(.75,1.0,cycle)),steam);
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
}`;
const CLOUD_FRAG = `
uniform sampler2D uCloud;
uniform vec3 uCloudTint;
uniform float uEdgeClear;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vDistance;
void main(){
  vec4 photo=texture2D(uCloud,vUv);
  float margin=smoothstep(0.0,.035,vUv.x)*smoothstep(0.0,.035,vUv.y)*smoothstep(0.0,.035,1.0-vUv.x)*smoothstep(0.0,.035,1.0-vUv.y);
  float nearFade=smoothstep(2.2,7.0,vDistance), bank=1.0-step(.5,vKind);
  float alpha=photo.a*vAlpha*margin*nearFade*(1.0-bank*uEdgeClear*.8);
  if(alpha<.008) discard;
  vec3 tint=mix(uCloudTint,vec3(.12,.18,.29),step(2.5,vKind));
  gl_FragColor=vec4(photo.rgb*tint,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface CloudSpaWalker { x: number; z: number; moving?: boolean }
export type CloudSpaTextures = { cloud: THREE.Texture; city: THREE.Texture; cityTiles?: readonly THREE.Texture[]; wood: THREE.Texture; cotton: THREE.Texture; surface: THREE.Texture };

/** One open cloud island, five generous baths, and one luminous storm-cloud resort above the real city. */
export class CloudSpaWorld {
  readonly root = new THREE.Group();
  readonly city: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly water: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly scenery: ReturnType<typeof buildCloudSpaScenery>;
  private readonly cityValley: ReturnType<typeof buildCloudSpaCity>;
  private readonly clouds: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly hemi = new THREE.HemisphereLight(0xbcd1f0, 0x6b7a9b, 1.1);
  private readonly moon = new THREE.DirectionalLight(0xc9dcff, .8);
  private readonly lights: THREE.PointLight[] = [];
  private readonly time = { value: 0 };
  private readonly ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -1000, 0));
  private readonly previousStep = new THREE.Vector2(Infinity, Infinity);
  private nextRipple = 0;
  private lastStepAt = -Infinity;
  private lastLightAt = -Infinity;
  private lampAmount = 1;
  private nightAmount = 1;
  private readonly fullCloudCount: number;
  private low: boolean;
  private disposed = false;

  constructor(scene: THREE.Scene, skyUniforms: Record<string, THREE.IUniform>, textures: CloudSpaTextures, mobile = false) {
    this.low = mobile; this.root.name = "cloud-spa"; scene.add(this.root);
    this.hemi.name = "cloud-spa-moon-fill"; this.moon.name = "cloud-spa-moonlight"; this.moon.position.set(-30, 70, -30); this.moon.castShadow = false;
    this.root.add(this.hemi, this.moon);
    const floorMaterial = createCloudSpaCloudMaterial("floor", textures.surface, true);
    const floorGeometry = cloudSpaGroundGeometry(mobile); this.geometries.add(floorGeometry); this.materials.add(floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.name = "cloud-spa-walkable-cloud"; this.root.add(floor);
    this.scenery = buildCloudSpaScenery(this.root, textures, mobile);
    const poolPieces = CLOUD_SPA_POOLS.map(pool => {
      const geometry = new THREE.CircleGeometry(pool.radius - .11, mobile ? 64 : 104); geometry.rotateX(-Math.PI / 2); geometry.translate(pool.x, pool.waterY, pool.z);
      const values = new Float32Array(geometry.getAttribute("position").count * 4);
      for (let i = 0; i < values.length; i += 4) { values[i] = pool.x; values[i + 1] = pool.z; values[i + 2] = pool.radius; values[i + 3] = pool.deckY; }
      geometry.setAttribute("aPool", new THREE.BufferAttribute(values, 4)); return geometry;
    });
    const waterGeometry = mergeGeometries(poolPieces, false)!; poolPieces.forEach(piece => piece.dispose());
    const waterMaterial = new THREE.ShaderMaterial({ uniforms: { ...skyUniforms, uTime: this.time, uRipples: { value: this.ripples }, uWaterDetail: { value: mobile ? .7 : 1 } },
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: false });
    this.water = new THREE.Mesh(waterGeometry, waterMaterial); this.water.name = "cloud-spa-reflecting-hot-springs"; this.water.renderOrder = 3; this.root.add(this.water);
    this.geometries.add(waterGeometry); this.materials.add(waterMaterial);
    this.cityValley = buildCloudSpaCity(this.root, textures.cityTiles?.length ? textures.cityTiles : [textures.city], mobile);
    this.city = this.cityValley.city;

    const placements: number[] = [], forms: number[] = [];
    const puff = (x: number, y: number, z: number, size: number, width: number, height: number, alpha: number, kind: number) => {
      placements.push(x, y, z, size); forms.push(width, height, alpha, kind);
    };
    // Essential shore banks come first so quality thinning preserves the same viewing gaps.
    for (let i = 0; i < 54; i++) {
      const a = i / 54 * Math.PI * 2, z = Math.max(CLOUD_SPA_ISLAND.minZ, 17 + Math.cos(a) * 107), x = Math.sign(Math.sin(a)) * cloudSpaMountainHalfWidth(z);
      if (z < -74) continue;
      puff(x, cloudSpaFloorHeight(x, z) - 4.8, z, 11 + i % 3 * 2, 1.6, 1, .30, 0);
    }
    for (const pool of CLOUD_SPA_POOLS) for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + pool.x;
      puff(pool.x + Math.sin(a) * pool.radius * .56, pool.waterY + .8, pool.z + Math.cos(a) * pool.radius * .56, 5.5, 1.8, .46, .11, 1);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      if (cloudSpaViewGap(a) > .2) continue;
      puff(Math.sin(a) * 190, -48 - i % 3 * 13, 42 + Math.cos(a) * 215, 72, 1.6, .85, .42, 2);
    }
    const essentialCount = placements.length / 4;
    for (let i = 0; i < 8; i++) puff(-20 + i * 5.7, CLOUD_SPA_RESORT.ceilingY + 5 + Math.sin(i) * 2, CLOUD_SPA_RESORT.z + 10, 10, 1.25, 1, .22, 3);
    for (const pool of CLOUD_SPA_POOLS) for (let i = 0; i < 2; i++) puff(pool.x + (i ? -3 : 3), pool.waterY + .55, pool.z + 2, 6, 1.8, .45, .075, 1);
    const cloudGeometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1); cloudGeometry.index = quad.index!.clone();
    for (const name of ["position", "normal", "uv"]) cloudGeometry.setAttribute(name, quad.getAttribute(name).clone()); quad.dispose();
    cloudGeometry.setAttribute("aCloud", new THREE.InstancedBufferAttribute(new Float32Array(placements), 4));
    cloudGeometry.setAttribute("aForm", new THREE.InstancedBufferAttribute(new Float32Array(forms), 4));
    this.fullCloudCount = placements.length / 4; cloudGeometry.instanceCount = mobile ? essentialCount : this.fullCloudCount;
    cloudGeometry.userData.essentialCount = essentialCount;
    const cloudMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uCloud: { value: textures.cloud }, uCloudTint: { value: new THREE.Color(.7, .79, .96) }, uEdgeClear: { value: 0 } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.clouds = new THREE.Mesh(cloudGeometry, cloudMaterial); this.clouds.name = "cloud-spa-photographic-banks-and-steam"; this.clouds.frustumCulled = false; this.clouds.renderOrder = 5; this.root.add(this.clouds);
    this.geometries.add(cloudGeometry); this.materials.add(cloudMaterial);
    for (let i = 0; i < (mobile ? 4 : 6); i++) {
      const light = new THREE.PointLight(0xffc78c, 0, 13, 2); light.name = `cloud-spa-warm-light-${i}`; light.castShadow = false; this.lights.push(light); this.root.add(light);
    }
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1); this.lampAmount = Math.max(.45, THREE.MathUtils.clamp(d.lanterns, 0, 1));
    this.hemi.color.setHex(0xdde8ff).lerp(new THREE.Color(0xa7bfeb), night); this.hemi.groundColor.setHex(0x8d9bad);
    this.hemi.intensity = 1.25 - night * .12;
    const direction = d.sun[1] > .02 ? d.sun : d.moon;
    this.moon.position.set(direction[0] * 80, Math.max(30, direction[1] * 80), direction[2] * 80);
    this.moon.color.setHex(0xfff0d8).lerp(new THREE.Color(0xc3d9ff), night); this.moon.intensity = 1.0 - night * .2;
    (this.clouds.material.uniforms.uCloudTint.value as THREE.Color).setRGB(1, .98, .94).lerp(new THREE.Color(.57, .69, .89), night);
    this.nightAmount = night; this.cityValley.update(this.time.value, night); this.scenery.applyNight(this.lampAmount); this.lastLightAt = -Infinity;
  }

  update(time: number, camera: THREE.Camera, self?: CloudSpaWalker, _seat?: PavilionSeat | null) {
    if (this.disposed || !Number.isFinite(time)) return;
    if (time < this.time.value) { this.ripples.forEach(ripple => ripple.w = 0); this.lastStepAt = this.lastLightAt = -Infinity; }
    this.time.value = time;
    this.cityValley.update(time, this.nightAmount);
    const at = self ?? camera.position;
    const lowest = CLOUD_SPA_POOLS[CLOUD_SPA_POOLS.length - 1], radial = Math.hypot(at.x - lowest.x, at.z - lowest.z) / cloudSpaTerraceRadius(lowest, Math.atan2(at.x - lowest.x, at.z - lowest.z));
    this.clouds.material.uniforms.uEdgeClear.value = at.z < lowest.z + 4 ? THREE.MathUtils.smoothstep(radial, .72, .96) : 0;
    if (time - this.lastLightAt > .35) {
      this.lastLightAt = time;
      const candidates = [...this.scenery.lanterns].sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
      this.lights.forEach((light, index) => { const point = candidates[index]; light.visible = Boolean(point) && (!this.low || index < 4); if (point) { light.position.copy(point); light.intensity = 7 * this.lampAmount; } });
    }
    if (!self?.moving || !CLOUD_SPA_POOLS.some(pool => Math.hypot(self.x - pool.x, self.z - pool.z) < pool.radius - .6)) { this.previousStep.set(Infinity, Infinity); return; }
    if (time - this.lastStepAt > .28 && Math.hypot(self.x - this.previousStep.x, self.z - this.previousStep.y) > .48) {
      this.ripples[this.nextRipple].set(self.x, self.z, time, 1); this.nextRipple = (this.nextRipple + 1) % (this.low ? 4 : 8);
      this.previousStep.set(self.x, self.z); this.lastStepAt = time;
    }
  }
  setQuality(low: boolean) {
    if (this.disposed) return; this.low = low;
    this.clouds.geometry.instanceCount = low ? this.clouds.geometry.userData.essentialCount : this.fullCloudCount;
    this.water.material.uniforms.uWaterDetail.value = low ? .7 : 1; this.lastLightAt = -Infinity;
    if (low) this.ripples.slice(4).forEach(ripple => ripple.w = 0);
  }
  setFireState(_logCount: number, _color: string) {}
  setFireFlare(_amount: number) {}
  setFireTint(_color: THREE.Color) {}
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.scenery.dispose(); this.cityValley.dispose(); this.root.removeFromParent(); this.root.clear();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
  }
}
