import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Daylight } from "./daylight";
import type { PavilionSeat } from "./bamboo-trail";
import { CLOUD_SPA_APRON, CLOUD_SPA_CHANNEL, CLOUD_SPA_CHANNELS, CLOUD_SPA_POOLS, CLOUD_SPA_RESORT, cloudSpaChannelPoint, cloudSpaFloorHeight } from "./cloud-spa-layout";
import { buildCloudSpaGround, buildCloudSpaScenery, cloudSpaViewGap, type CloudSpaOutlinePoint } from "./cloud-spa-geometry";
import { CLOUD_SPA_LAMP_COUNT, createCloudSpaCottonMaterial, createCloudSpaCottonUniforms } from "./cloud-spa-materials";
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
  // Travertine turquoise: deep in the middle, milky over the shallow rim where the cotton shows through.
  float toRim=length(p-vPool.xy);
  vec3 clearWater=mix(vec3(.07,.44,.50),vec3(.20,.64,.65),.5+.5*sin(p.x*.12+p.y*.17));
  float shallow=smoothstep(vPool.z-6.5,vPool.z-.6,toRim);
  clearWater=mix(clearWater,vec3(.58,.88,.88),shallow*.5);
  vec3 color=mix(clearWater,sky,fresnel*(1.0-shallow*.35))+vec3(.18,.39,.34)*caustic+vec3(.16,.22,.23)*rings;
  // Warm lantern ribbons are anchored to each pool rim, not to the camera or a panorama.
  for(int i=0;i<8;i++){
    float angle=float(i)*.785398;
    vec3 lamp=vec3(vPool.x+sin(angle)*(vPool.z+2.0),vPool.w+.52,vPool.y+cos(angle)*(vPool.z+2.0));
    vec3 lightDir=normalize(lamp-vWorld), halfDir=normalize(lightDir+viewDir);
    float shimmer=pow(max(0.0,dot(n,halfDir)),110.0)/(1.0+length(lamp-vWorld)*.28);
    color+=vec3(1.0,.61,.24)*shimmer*(.22+.78*uLantern);
  }
  float edge=1.0-smoothstep(vPool.z-.45,vPool.z-.11,toRim);
  gl_FragColor=vec4(color,.8*edge);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLOW_VERT = `
attribute vec2 aFlow;
varying vec2 vUv;
varying vec2 vFlow;
varying vec3 vWorld;
void main(){ vec4 world=modelMatrix*vec4(position,1.0); vWorld=world.xyz; vUv=uv; vFlow=aFlow; gl_Position=projectionMatrix*viewMatrix*world; }
`;
const FLOW_FRAG = `
uniform float uTime;
uniform float uLantern;
varying vec2 vUv;
varying vec2 vFlow;
varying vec3 vWorld;
float flowHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float flowNoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(flowHash(i),flowHash(i+vec2(1.0,0.0)),f.x),mix(flowHash(i+vec2(0.0,1.0)),flowHash(i+vec2(1.0,1.0)),f.x),f.y);
}
void main(){
  float fall=step(.5,vFlow.x);
  // Sheets slide along each tread; the little falls at every riser run faster and whiten into foam.
  float speed=mix(.9,2.6,fall);
  float streak=flowNoise(vec2(vUv.x*7.0+vFlow.y*13.0,vUv.y*2.5-uTime*speed+vFlow.y*7.0));
  float streak2=flowNoise(vec2(vUv.x*13.0-vFlow.y*5.0,vUv.y*5.0-uTime*speed*1.4));
  float foam=smoothstep(.45,.85,streak*.6+streak2*.4);
  vec3 water=vec3(.46,.82,.84), white=vec3(.88,.97,.98);
  vec3 color=mix(water,white,foam*(.5+.5*fall));
  color+=vec3(.5,.33,.14)*uLantern*foam*.25;
  float side=smoothstep(0.0,.08,vUv.x)*smoothstep(0.0,.08,1.0-vUv.x);
  float alpha=(mix(.42,.62,fall)+foam*.3)*side;
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = `
attribute vec4 aCloud;
attribute vec4 aForm;
uniform float uTime;
uniform vec2 uWalker;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vDistance;
void main(){
  vec3 centre=aCloud.xyz;
  float steam=step(.5,aForm.w)*(1.0-step(1.5,aForm.w));
  float bank=1.0-step(.5,aForm.w);
  float cycle=fract(uTime*.035+aCloud.x*.017+aCloud.z*.013);
  centre.y+=steam*cycle*1.8;
  centre.x+=sin(uTime*.035+aCloud.z)*.18;
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
  vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 world=centre+right*position.x*aCloud.w*aForm.x+up*position.y*aCloud.w*aForm.y;
  vUv=uv; vKind=aForm.w; vDistance=length(cameraPosition-centre);
  // Banks near the walker thin away so the valley below stays visible from every pool edge.
  float away=mix(1.0,smoothstep(9.0,24.0,length(centre.xz-uWalker)),bank);
  vAlpha=aForm.z*away*mix(1.0,smoothstep(0.0,.15,cycle)*(1.0-smoothstep(.75,1.0,cycle)),steam);
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
}`;
const CLOUD_FRAG = `
uniform sampler2D uCloud;
uniform vec3 uCloudTint;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
varying float vDistance;
void main(){
  vec4 photo=texture2D(uCloud,vUv);
  float margin=smoothstep(0.0,.035,vUv.x)*smoothstep(0.0,.035,vUv.y)*smoothstep(0.0,.035,1.0-vUv.x)*smoothstep(0.0,.035,1.0-vUv.y);
  float nearFade=smoothstep(2.2,7.0,vDistance);
  float alpha=photo.a*vAlpha*margin*nearFade;
  if(alpha<.008) discard;
  vec3 tint=mix(uCloudTint,vec3(.2,.26,.38),step(2.5,vKind)*(1.0-step(3.5,vKind)));
  gl_FragColor=vec4(photo.rgb*tint,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface CloudSpaWalker { x: number; z: number; moving?: boolean }
export type CloudSpaTextures = { cloud: THREE.Texture; city: THREE.Texture; cityTiles?: readonly THREE.Texture[]; wood: THREE.Texture; cotton: THREE.Texture; surface: THREE.Texture };

/** Resample the island outline at a roughly even arc spacing, with the direction pointing off the cloud. */
function outlineStations(outline: readonly CloudSpaOutlinePoint[], spacing: number) {
  const stations: { x: number; y: number; z: number; ox: number; oz: number }[] = [];
  let travelled = spacing;
  for (let i = 0; i < outline.length; i++) {
    const point = outline[i], previous = outline[(i + outline.length - 1) % outline.length];
    travelled += Math.hypot(point.x - previous.x, point.z - previous.z);
    if (travelled < spacing) continue;
    travelled = 0;
    let anchorX: number = CLOUD_SPA_APRON.x, anchorZ: number = CLOUD_SPA_APRON.z, best = Math.hypot(point.x - anchorX, point.z - anchorZ) - CLOUD_SPA_APRON.rz;
    for (const pool of CLOUD_SPA_POOLS) {
      const gap = Math.hypot(point.x - pool.x, point.z - pool.z) - pool.terraceRadius;
      if (gap < best) { best = gap; anchorX = pool.x; anchorZ = pool.z; }
    }
    const length = Math.hypot(point.x - anchorX, point.z - anchorZ) || 1;
    stations.push({ x: point.x, y: point.y, z: point.z, ox: (point.x - anchorX) / length, oz: (point.z - anchorZ) / length });
  }
  return stations;
}

/** Five travertine terraces of cotton cloud, joined by walkable rills, beneath one luminous storm-cloud resort above the real city. */
export class CloudSpaWorld {
  readonly root = new THREE.Group();
  readonly city: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly water: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly scenery: ReturnType<typeof buildCloudSpaScenery>;
  private readonly cityValley: ReturnType<typeof buildCloudSpaCity>;
  private readonly clouds: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly cotton = createCloudSpaCottonUniforms();
  private readonly hemi = new THREE.HemisphereLight(0xbcd1f0, 0x6b7a9b, 1.1);
  private readonly moon = new THREE.DirectionalLight(0xc9dcff, .8);
  private readonly lights: THREE.PointLight[] = [];
  private readonly time = { value: 0 };
  private readonly lanternAmount = { value: 1 };
  private readonly walker = { value: new THREE.Vector2(0, 91) };
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
    this.cotton.uTime = this.time;
    this.hemi.name = "cloud-spa-moon-fill"; this.moon.name = "cloud-spa-moonlight"; this.moon.position.set(-30, 70, -30); this.moon.castShadow = false;
    this.root.add(this.hemi, this.moon);
    const floorMaterial = createCloudSpaCottonMaterial("floor", textures.surface, this.cotton);
    const ground = buildCloudSpaGround(mobile); this.geometries.add(ground.geometry); this.materials.add(floorMaterial);
    const floor = new THREE.Mesh(ground.geometry, floorMaterial); floor.name = "cloud-spa-walkable-cloud"; this.root.add(floor);
    this.scenery = buildCloudSpaScenery(this.root, textures, mobile, ground.outline, this.cotton);
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
    this.buildRills(skyUniforms);
    this.cityValley = buildCloudSpaCity(this.root, textures.cityTiles?.length ? textures.cityTiles : [textures.city], mobile);
    this.city = this.cityValley.city;

    const placements: number[] = [], forms: number[] = [];
    const puff = (x: number, y: number, z: number, size: number, width: number, height: number, alpha: number, kind: number) => {
      placements.push(x, y, z, size); forms.push(width, height, alpha, kind);
    };
    // Soft banks skirt the whole scalloped edge, their tops kept just under the shelf so nothing blocks the view down. Essentials come first for quality thinning.
    const stations = outlineStations(ground.outline, mobile ? 7.5 : 5);
    stations.forEach((station, i) => {
      const p = .5 + .5 * Math.sin(i * 2.39), size = 10 + p * 3.5;
      puff(station.x + station.ox * (2.4 + p), station.y - .35 - size * .95 * .5 + .6, station.z + station.oz * (2.4 + p), size, 1.55, .95, .32, 0);
    });
    for (const pool of CLOUD_SPA_POOLS) for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + pool.x;
      puff(pool.x + Math.sin(a) * pool.radius * .56, pool.waterY + .8, pool.z + Math.cos(a) * pool.radius * .56, 5.5, 1.8, .46, .11, 1);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      if (cloudSpaViewGap(a) > .2) continue;
      // The cloud sea lies far out and low, over the distant suburbs, so every pool edge still looks down onto the city itself.
      puff(Math.sin(a) * 380, -118 - i % 3 * 10, 42 + Math.cos(a) * 420, 90, 1.6, .85, .42, 2);
    }
    // Small wisps hug the rim itself and never fade, so the cloud edge beside a walker stays soft without hiding the valley.
    stations.forEach((station, i) => {
      if (mobile && i % 2) return;
      const p = .5 + .5 * Math.sin(i * 3.1), size = 3.4 + p * 1.2;
      puff(station.x + station.ox * .9, station.y - .85 - p * .3, station.z + station.oz * .9, size, 1.5, .7, .16, 4);
    });
    const essentialCount = placements.length / 4;
    stations.forEach((station, i) => {
      if (i % 2) return;
      const p = .5 + .5 * Math.sin(i * 1.7), size = 6 + p * 2;
      puff(station.x + station.ox * 1.1, station.y - .3 - size * .85 * .5 + .6, station.z + station.oz * 1.1, size, 1.4, .85, .28, 0);
    });
    for (const channel of CLOUD_SPA_CHANNELS) for (const side of [-1, 1]) {
      const [x, z] = cloudSpaChannelPoint(channel, channel.stepsEnd + 1, side * 2);
      puff(x, channel.lower.waterY + .7, z, 4.5, 1.6, .5, .1, 1);
    }
    for (let i = 0; i < 8; i++) puff(-20 + i * 5.7, CLOUD_SPA_RESORT.ceilingY + 5 + Math.sin(i) * 2, CLOUD_SPA_RESORT.z + 10, 10, 1.25, 1, .22, 3);
    // The storm cloud itself: a crown over the ceiling, flanks beside the walls and a bank behind, all smoke rather than solids.
    const hall = CLOUD_SPA_RESORT, fy = hall.floorY;
    for (let i = 0; i < 30; i++) {
      if (mobile && i % 2) continue;
      const a = i * 2.399, radius = Math.sqrt((i + .5) / 30), x = Math.sin(a) * 18 * radius, z = hall.z + Math.cos(a) * 13 * radius;
      const p = .5 + .5 * Math.sin(i * 4.71), sy = 2.8 + p * 2.8, crown = (1 - radius) * 5;
      puff(x, hall.ceilingY + sy + 1.2 + crown, z, (3.2 + p * 2.7) * 2.3, 1.15, (sy / (3.2 + p * 2.7)) * .9 + .35, .5, 3);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      if (mobile && i % 2) continue;
      const p = .5 + .5 * Math.sin(i * 3.14 + side), sx = 1.3 + p * 1.1;
      puff(side * (19.4 + sx + 1.2), fy + 3.6 + i % 3 * 2, 89.5 + i * 3.4 + (hall.z - 101), (3.1 + p) * 2.1, .8, 1.15, .45, 3);
    }
    for (let i = 0; i < 9; i++) { if (mobile && i % 2) continue; puff(-17 + i * 4.25, fy + 5.4 + Math.sin(i) * 1.4, 117.4 + (hall.z - 101), 9.5, 1.1, 1.05, .5, 3); }
    for (const pool of CLOUD_SPA_POOLS) for (let i = 0; i < 2; i++) puff(pool.x + (i ? -3 : 3), pool.waterY + .55, pool.z + 2, 6, 1.8, .45, .075, 1);
    const cloudGeometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1); cloudGeometry.index = quad.index!.clone();
    for (const name of ["position", "normal", "uv"]) cloudGeometry.setAttribute(name, quad.getAttribute(name).clone()); quad.dispose();
    cloudGeometry.setAttribute("aCloud", new THREE.InstancedBufferAttribute(new Float32Array(placements), 4));
    cloudGeometry.setAttribute("aForm", new THREE.InstancedBufferAttribute(new Float32Array(forms), 4));
    this.fullCloudCount = placements.length / 4; cloudGeometry.instanceCount = mobile ? essentialCount : this.fullCloudCount;
    cloudGeometry.userData.essentialCount = essentialCount;
    const cloudMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uWalker: this.walker, uCloud: { value: textures.cloud }, uCloudTint: { value: new THREE.Color(.7, .79, .96) } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, forceSinglePass: true });
    this.clouds = new THREE.Mesh(cloudGeometry, cloudMaterial); this.clouds.name = "cloud-spa-photographic-banks-and-steam"; this.clouds.frustumCulled = false; this.clouds.renderOrder = 5; this.root.add(this.clouds);
    this.geometries.add(cloudGeometry); this.materials.add(cloudMaterial);
    for (let i = 0; i < (mobile ? 4 : 6); i++) {
      const light = new THREE.PointLight(0xffc78c, 0, 13, 2); light.name = `cloud-spa-warm-light-${i}`; light.castShadow = false; this.lights.push(light); this.root.add(light);
    }
  }

  /** Thin flowing sheets on every tread and sill, and a small fall at every riser, all in one draw. */
  private buildRills(skyUniforms: Record<string, THREE.IUniform>) {
    const positions: number[] = [], uvs: number[] = [], flows: number[] = [], indices: number[] = [];
    const { halfWidth, steps, rise, run, sill } = CLOUD_SPA_CHANNEL, half = halfWidth - .08;
    const quad = (corners: [number, number, number][], kind: number, seed: number) => {
      const base = positions.length / 3;
      corners.forEach(([x, y, z], i) => { positions.push(x, y, z); uvs.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1); flows.push(kind, seed); });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const at = (channel: typeof CLOUD_SPA_CHANNELS[number], along: number, across: number, y: number): [number, number, number] => {
      const [x, z] = cloudSpaChannelPoint(channel, along, across); return [x, y, z];
    };
    for (const [index, channel] of CLOUD_SPA_CHANNELS.entries()) {
      const top = channel.upper.deckY - sill;
      quad([at(channel, channel.upper.radius - .6, -half, top + .06), at(channel, channel.upper.radius - .6, half, top + .06), at(channel, channel.lipEnd, half, top + .06), at(channel, channel.lipEnd, -half, top + .06)], 0, index * .37);
      for (let k = 0; k < steps; k++) {
        const y = top - rise * (k + 1) + .04, a0 = channel.lipEnd + k * run + .006, a1 = channel.lipEnd + (k + 1) * run - .006;
        quad([at(channel, a0, -half, y), at(channel, a0, half, y), at(channel, a1, half, y), at(channel, a1, -half, y)], 0, index * .37 + k * .11);
        const edge = channel.lipEnd + k * run + .012, high = top - rise * k + .04, lowY = top - rise * (k + 1) + .04;
        quad([at(channel, edge, -half, lowY), at(channel, edge, half, lowY), at(channel, edge, half, high), at(channel, edge, -half, high)], 1, index * .37 + k * .13);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("aFlow", new THREE.Float32BufferAttribute(flows, 2)); geometry.setIndex(indices); geometry.name = "cloud-spa-rill-sheets";
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uLantern: skyUniforms.uLantern ?? this.lanternAmount },
      vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = "cloud-spa-flowing-rills"; mesh.renderOrder = 3; this.root.add(mesh);
    this.geometries.add(geometry); this.materials.add(material);
  }

  applyDaylight(d: Daylight) {
    if (this.disposed) return;
    const night = THREE.MathUtils.clamp(d.stars, 0, 1); this.lampAmount = Math.max(.45, THREE.MathUtils.clamp(d.lanterns, 0, 1)); this.lanternAmount.value = this.lampAmount;
    this.hemi.color.setHex(0xdde8ff).lerp(new THREE.Color(0xa7bfeb), night); this.hemi.groundColor.setHex(0x8d9bad);
    this.hemi.intensity = 1.25 - night * .12;
    const direction = d.sun[1] > .02 ? d.sun : d.moon;
    this.moon.position.set(direction[0] * 80, Math.max(30, direction[1] * 80), direction[2] * 80);
    this.moon.color.setHex(0xfff0d8).lerp(new THREE.Color(0xc3d9ff), night); this.moon.intensity = 1.0 - night * .2;
    this.cotton.uSky.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity);
    this.cotton.uGround.value.setHex(0x8d9bad).multiplyScalar(.9 - night * .25);
    this.cotton.uLightDir.value.set(direction[0], Math.max(.3, direction[1]), direction[2]).normalize();
    this.cotton.uLightColor.value.copy(this.moon.color).multiplyScalar(this.moon.intensity);
    this.cotton.uNight.value = night;
    (this.clouds.material.uniforms.uCloudTint.value as THREE.Color).setRGB(1, .98, .94).lerp(new THREE.Color(.57, .69, .89), night);
    this.nightAmount = night; this.cityValley.update(this.time.value, night); this.scenery.applyNight(this.lampAmount); this.lastLightAt = -Infinity;
  }

  update(time: number, camera: THREE.Camera, self?: CloudSpaWalker, _seat?: PavilionSeat | null) {
    if (this.disposed || !Number.isFinite(time)) return;
    if (time < this.time.value) { this.ripples.forEach(ripple => ripple.w = 0); this.lastStepAt = this.lastLightAt = -Infinity; }
    this.time.value = time;
    this.cityValley.update(time, this.nightAmount);
    const at = self ?? camera.position;
    this.walker.value.set(at.x, at.z);
    if (time - this.lastLightAt > .35) {
      this.lastLightAt = time;
      const candidates = [...this.scenery.lanterns].sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
      this.lights.forEach((light, index) => { const point = candidates[index]; light.visible = Boolean(point) && (!this.low || index < 4); if (point) { light.position.copy(point); light.intensity = 7 * this.lampAmount; } });
      const lamps = this.cotton.uLamps.value;
      for (let index = 0; index < CLOUD_SPA_LAMP_COUNT; index++) {
        const point = candidates[index];
        if (point && (!this.low || index < 4)) lamps[index].set(point.x, point.y, point.z, 1.1 * this.lampAmount); else lamps[index].set(0, -1000, 0, 0);
      }
    }
    if (!self?.moving || !CLOUD_SPA_POOLS.some(pool => Math.hypot(self.x - pool.x, self.z - pool.z) < pool.radius - .6 && cloudSpaFloorHeight(self.x, self.z) < pool.waterY)) { this.previousStep.set(Infinity, Infinity); return; }
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
