import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GARDEN_POND_BENCHES, GROUND_Y, LAKE, WATER_Y, gardenPavilionWorld, isWater, lakeSigned } from "./garden-layout";
import type { GardenMoment } from "./net";

const DUCK_LIMIT = 24, COIN_LIMIT = 12;
const now = () => performance.now();
const finiteUnit = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;

/** Deterministic open-water landing, shared by a late joiner and the original sender. */
export function gardenMomentWaterTarget(x: number, z: number): { x: number; z: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  // Land beyond the seated silhouette so the small duck and ripples remain visible on a phone.
  const bench = GARDEN_POND_BENCHES.find(bench => Math.hypot(x - bench.x, z - bench.z) < 2);
  if (bench) for (let distance = 6; distance <= 26; distance += .5) {
    const tx = x + bench.fx * distance, tz = z + bench.fz * distance;
    if (lakeSigned(tx, tz) < -2.2 && isWater(tx, tz)) return { x: tx, z: tz };
  }
  for (const fraction of [.35, .45, .55, .65, .78, .9]) {
    const tx = x + (LAKE.x - x) * fraction, tz = z + (LAKE.z - z) * fraction;
    if (lakeSigned(tx, tz) < -2.2 && isWater(tx, tz)) return { x: tx, z: tz };
  }
  return null;
}

interface ActiveMoment { event: GardenMoment; target: { x: number; z: number }; seed: number }

/** Shared, bounded pond scenery: six benches, coins and soft ripples, gently floating ducks. */
export class GardenPond {
  readonly root = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly effects: THREE.InstancedMesh[] = [];
  private readonly moments = new Map<string, ActiveMoment>();
  private readonly body: THREE.InstancedMesh;
  private readonly beaks: THREE.InstancedMesh;
  private readonly eyes: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly wakes: THREE.InstancedMesh;
  private readonly coins: THREE.InstancedMesh;
  private readonly ripples: THREE.InstancedMesh;
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly beakMaterial: THREE.MeshStandardMaterial;
  private readonly haloMaterial: THREE.ShaderMaterial;
  private readonly transform = new THREE.Object3D();
  private serverAt = 0;
  private localAt = 0;
  private latestSnapshot = -Infinity;
  private disposed = false;

  constructor(parent: THREE.Object3D, low: boolean) {
    this.root.name = "garden-pond"; parent.add(this.root);
    this.buildBenches();
    const segments = low ? 10 : 16;
    const sphere = new THREE.SphereGeometry(1, segments, low ? 7 : 10);
    const bodyPieces: THREE.BufferGeometry[] = [];
    const ellipsoid = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      bodyPieces.push(sphere.clone().scale(sx, sy, sz).translate(x, y, z));
    };
    // A little round rubber duck: two soft volumes, tiny wings and a short tail.
    ellipsoid(0, .245, 0, .31, .27, .33);
    ellipsoid(0, .54, .17, .265, .26, .26);
    ellipsoid(-.28, .245, -.025, .04, .11, .18); ellipsoid(.28, .245, -.025, .04, .11, .18);
    ellipsoid(0, .28, -.28, .12, .075, .14);
    const bodyGeometry = mergeGeometries(bodyPieces, false)!; bodyPieces.forEach(piece => piece.dispose());
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffd96a, roughness: .48, emissive: 0xffcf7f, emissiveIntensity: 0 });
    // A luminous duck still has a softly shaded underside, instead of becoming a flat silhouette.
    const normals = bodyGeometry.getAttribute("normal"), softGlow = new Float32Array(normals.count);
    for (let index = 0; index < normals.count; index++) softGlow[index] = .42 + .58 * (normals.getY(index) * .5 + .5);
    bodyGeometry.setAttribute("aDuckGlow", new THREE.BufferAttribute(softGlow, 1));
    this.bodyMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aDuckGlow; varying float vDuckGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDuckGlow = aDuckGlow;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vDuckGlow;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vDuckGlow;");
    };
    this.bodyMaterial.customProgramCacheKey = () => "garden-duck-soft-glow-v1";
    this.beakMaterial = new THREE.MeshStandardMaterial({ color: 0xeaa044, roughness: .6, emissive: 0xffac52, emissiveIntensity: 0 });
    this.body = this.instances("garden-pond-ducks", bodyGeometry, this.bodyMaterial, DUCK_LIMIT);
    const beakGeometry = new RoundedBoxGeometry(.19, .075, .15, 2, .032).translate(0, .48, .43);
    this.beaks = this.instances("garden-pond-duck-beaks", beakGeometry, this.beakMaterial, DUCK_LIMIT);
    const eyePieces = [-1, 1].map(side => sphere.clone().scale(.039, .042, .03).translate(side * .16, .57, .376));
    const eyeGeometry = mergeGeometries(eyePieces, false)!; eyePieces.forEach(piece => piece.dispose()); sphere.dispose();
    this.eyes = this.instances("garden-pond-duck-eyes", eyeGeometry, new THREE.MeshStandardMaterial({ color: 0x30261d, roughness: .25 }), DUCK_LIMIT);
    this.haloMaterial = this.waterMaterial(0xffcf86, true);
    this.halos = this.instances("garden-pond-duck-halos", new THREE.PlaneGeometry(1, 1), this.haloMaterial, DUCK_LIMIT);
    this.wakes = this.instances("garden-pond-duck-wakes", new THREE.PlaneGeometry(1, 1), this.waterMaterial(0xe6e4ce, false), DUCK_LIMIT);
    this.coins = this.instances("garden-pond-coins", new THREE.CylinderGeometry(.065, .065, .018, 12), new THREE.MeshStandardMaterial({ color: 0xd5a552, roughness: .3, metalness: .7 }), COIN_LIMIT);
    this.ripples = this.instances("garden-pond-coin-ripples", new THREE.PlaneGeometry(1, 1), this.waterMaterial(0xe7e9d9, false), COIN_LIMIT * 3);
    for (const effect of [this.halos, this.wakes, this.ripples]) effect.renderOrder = 4;
  }

  private instances(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; mesh.layers.enable(2);
    geometry.setAttribute("aPondOpacity", new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    this.geometries.add(geometry); this.materials.add(material); this.effects.push(mesh); this.root.add(mesh);
    return mesh;
  }

  private waterMaterial(color: number, halo: boolean) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: halo ? 0 : 1 } },
      vertexShader: "attribute float aPondOpacity; varying vec2 vPondUv; varying float vPondOpacity; void main(){vPondUv=uv;vPondOpacity=aPondOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}",
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vPondUv; varying float vPondOpacity; void main(){ float r=length(vPondUv*2.0-1.0); float a=${halo ? "exp(-r*r*5.0)*(1.0-smoothstep(.65,1.0,r))" : "smoothstep(.76,.85,r)*(1.0-smoothstep(.88,.99,r))"}; gl_FragColor=vec4(uColor,a*vPondOpacity*uStrength);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  private buildBenches() {
    const wood = new THREE.MeshStandardMaterial({ color: 0xbda07a, roughness: .67 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x665b49, roughness: .68, metalness: .12 });
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>([[wood, []], [frame, []]]);
    const softBox = new RoundedBoxGeometry(1, 1, 1, 2, .075);
    const piece = (bench: (typeof GARDEN_POND_BENCHES)[number], material: THREE.Material, lx: number, y: number, lz: number, sx: number, sy: number, sz: number) => {
      const p = gardenPavilionWorld(bench, lx, lz), geometry = softBox.clone();
      this.transform.position.set(p.x, GROUND_Y + y, p.z); this.transform.rotation.set(0, bench.yaw, 0); this.transform.scale.set(sx, sy, sz); this.transform.updateMatrix();
      geometry.applyMatrix4(this.transform.matrix); batches.get(material)!.push(geometry);
    };
    for (const bench of GARDEN_POND_BENCHES) {
      for (const z of [-.28, -.14, 0, .14, .28]) piece(bench, wood, 0, .405, z, 2.9, .09, .125);
      for (const y of [.67, .87, 1.07]) piece(bench, wood, 0, y, -.37, 2.9, .17, .105);
      for (const side of [-1, 1]) {
        piece(bench, frame, side * 1.28, .245, -.20, .10, .49, .12);
        piece(bench, frame, side * 1.28, .245, .22, .10, .49, .12);
        piece(bench, frame, side * 1.28, .72, -.39, .09, .86, .09);
        piece(bench, wood, side * 1.47, .72, -.015, .12, .08, .77);
        piece(bench, frame, side * 1.47, .56, .22, .07, .32, .07);
      }
    }
    softBox.dispose();
    for (const [material, pieces] of batches) {
      const converted = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece);
      const geometry = mergeGeometries(converted, false)!;
      for (const piece of new Set([...pieces, ...converted])) piece.dispose();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = material === wood ? "garden-pond-bench-wood" : "garden-pond-bench-frame";
      mesh.layers.enable(2); this.root.add(mesh); this.geometries.add(geometry); this.materials.add(material);
    }
  }

  apply(events: GardenMoment[], serverTime: number) {
    if (this.disposed || !Number.isFinite(serverTime) || serverTime < this.latestSnapshot) return;
    const currentNow = this.latestSnapshot === -Infinity ? serverTime : this.serverAt + now() - this.localAt;
    const incoming = new Map<string, ActiveMoment>();
    for (const event of events) {
      if (!event || typeof event.id !== "string" || (event.kind !== "coin" && event.kind !== "duck")
        || ![event.x, event.z, event.startedAt, event.durationMs].every(Number.isFinite)
        || event.durationMs <= 0 || event.durationMs > 600_000 || event.startedAt > serverTime + 1000 || event.startedAt + event.durationMs <= currentNow) continue;
      const target = gardenMomentWaterTarget(event.x, event.z);
      if (!target) continue;
      let hash = 0; for (const character of event.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      incoming.set(event.id, { event, target, seed: (hash % 10000) / 10000 * Math.PI * 2 });
    }
    if (serverTime > this.latestSnapshot) this.moments.clear();
    for (const [id, moment] of incoming) if (!this.moments.has(id)) this.moments.set(id, moment);
    for (const kind of ["coin", "duck"] as const) {
      const sorted = [...this.moments.values()].filter(moment => moment.event.kind === kind).sort((a, b) => b.event.startedAt - a.event.startedAt || a.event.id.localeCompare(b.event.id));
      for (const moment of sorted.slice(kind === "duck" ? DUCK_LIMIT : COIN_LIMIT)) this.moments.delete(moment.event.id);
    }
    this.latestSnapshot = serverTime; this.serverAt = Math.max(serverTime, currentNow); this.localAt = now();
  }

  private place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz = 0, opacity = 1) {
    this.transform.position.set(x, y, z); this.transform.rotation.set(rx, ry, rz); this.transform.scale.set(sx, sy, sz); this.transform.updateMatrix();
    mesh.setMatrixAt(index, this.transform.matrix);
    (mesh.geometry.getAttribute("aPondOpacity") as THREE.InstancedBufferAttribute).setX(index, opacity);
  }

  update(time: number, night: number) {
    if (this.disposed) return;
    const currentNow = this.serverAt + now() - this.localAt, dark = finiteUnit(night), visualTime = Number.isFinite(time) ? time : 0;
    let ducks = 0, coins = 0, ripples = 0;
    this.bodyMaterial.emissiveIntensity = dark * .38; this.beakMaterial.emissiveIntensity = dark * .16;
    this.haloMaterial.uniforms.uStrength.value = dark;
    for (const [id, { event, target, seed }] of this.moments) {
      const age = (currentNow - event.startedAt) / 1000, life = event.durationMs / 1000;
      if (age >= life) { this.moments.delete(id); continue; }
      if (age < 0) continue;
      if (event.kind === "duck" && ducks < DUCK_LIMIT) {
        const fade = Math.min(1, age / 1.2, (life - age) / 2);
        const x = target.x + Math.sin(age * .12 + seed) * .4, z = target.z + Math.cos(age * .10 + seed) * .35;
        const y = WATER_Y + .006 + Math.sin(visualTime * 1.5 + seed) * .02;
        const yaw = seed + Math.sin(age * .08) * .28;
        const size = fade * .64;
        for (const mesh of [this.body, this.beaks, this.eyes]) this.place(mesh, ducks, x, y, z, size, size, size, 0, yaw, Math.sin(visualTime * 1.1 + seed) * .035);
        this.place(this.halos, ducks, x, WATER_Y + .024, z, 1.25, 1.25, 1, -Math.PI / 2, 0, 0, .18 * fade);
        this.place(this.wakes, ducks, x, WATER_Y + .029, z, .88, 1.03, 1, -Math.PI / 2, 0, yaw, .14 * fade);
        ducks++;
      } else if (event.kind === "coin") {
        const flight = 1.15;
        if (age < flight && coins < COIN_LIMIT) {
          const t = age / flight, x = THREE.MathUtils.lerp(event.x, target.x, t), z = THREE.MathUtils.lerp(event.z, target.z, t);
          const y = THREE.MathUtils.lerp(GROUND_Y + 1.05, WATER_Y + .045, t) + Math.sin(t * Math.PI) * 1.55;
          this.place(this.coins, coins++, x, y, z, 1, 1, 1, age * 13, seed, age * 7);
        }
        for (let ring = 0; ring < 3; ring++) {
          const elapsed = age - flight - ring * .36;
          if (elapsed < 0 || elapsed > 3.2 || ripples >= COIN_LIMIT * 3) continue;
          const size = .16 + elapsed * .76, opacity = .38 * Math.pow(1 - elapsed / 3.2, 1.5);
          this.place(this.ripples, ripples++, target.x, WATER_Y + .032 + ring * .001, target.z, size, size, 1, -Math.PI / 2, 0, 0, opacity);
        }
      }
    }
    this.body.count = this.beaks.count = this.eyes.count = this.halos.count = this.wakes.count = ducks;
    this.coins.count = coins; this.ripples.count = ripples;
    for (const effect of this.effects) { effect.instanceMatrix.needsUpdate = true; effect.geometry.getAttribute("aPondOpacity").needsUpdate = true; }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.moments.clear(); this.root.removeFromParent(); this.root.clear();
    for (const effect of this.effects) effect.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
