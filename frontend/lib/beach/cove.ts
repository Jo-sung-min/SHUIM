import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { Daylight } from "./daylight";
import { buildShelters } from "./shelters";
import { buildNightLights } from "./night-lights";
import { buildFireBenches } from "./fire-benches";
import { buildHotSpring, HOT_SPRING_PATH } from "./hot-spring";
import { buildHotSpringLandscape } from "./hot-spring-landscape";

export const CAMPFIRE = { x: 0, z: 12 };
type Obstacle = { x: number; z: number; r: number };
const FIRE_COLORS: Record<string, number> = {
  amber: 0xffad64,
  rose: 0xff84b3,
  aurora: 0x75efce,
  ocean: 0x7ec9ff,
  violet: 0xc08eff,
};

function surfaceTexture(name: string, color = false) {
  // Geometry-only checks run without a DOM; textures are loaded by the live client.
  const texture = typeof document === "undefined"
    ? new THREE.Texture()
    : assetLoader(new THREE.TextureLoader()).load(assetUrl(`/beach/real/${name}.jpg`));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Photograph-based rock stays at a consistent real-world scale, including on the cliff tops. */
function rockMaterial(originalWall = false) {
  const material = new THREE.MeshStandardMaterial({
    map: surfaceTexture("rock", true), normalMap: surfaceTexture("rock-normal"),
    normalScale: new THREE.Vector2(originalWall ? 0.65 : 0.55, originalWall ? 0.65 : 0.55),
    color: originalWall ? 0xe9e6df : 0xf1eee5, roughness: 0.97,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vCovePosition;\nvarying vec3 vCoveNormal;\n${shader.vertexShader}`
      .replace("#include <project_vertex>", `
        #include <project_vertex>
        vec4 covePosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          covePosition = instanceMatrix * covePosition;
        #endif
        vCovePosition = (modelMatrix * covePosition).xyz;
        vCoveNormal = inverseTransformDirection(transformedNormal, viewMatrix);
      `);
    shader.fragmentShader = `
      varying vec3 vCovePosition;
      varying vec3 vCoveNormal;
      vec3 coveProjectionWeights() {
        vec3 weights = pow(abs(normalize(vCoveNormal)), vec3(4.0));
        return weights / max(dot(weights, vec3(1.0)), 0.0001);
      }
      ${shader.fragmentShader}`
      .replace("#include <map_fragment>", `
        vec3 coveWeights = coveProjectionWeights();
        vec3 coveUv = vCovePosition / 12.0;
        vec4 coveSurface = texture2D(map, coveUv.yz) * coveWeights.x
          + texture2D(map, coveUv.xz) * coveWeights.y
          + texture2D(map, coveUv.xy) * coveWeights.z;
        diffuseColor *= coveSurface;
      `)
      .replace("#include <normal_fragment_maps>", `
        vec3 coveNx = texture2D(normalMap, coveUv.yz).xyz * 2.0 - 1.0;
        vec3 coveNy = texture2D(normalMap, coveUv.xz).xyz * 2.0 - 1.0;
        vec3 coveNz = texture2D(normalMap, coveUv.xy).xyz * 2.0 - 1.0;
        coveNx.xy *= normalScale;
        coveNy.xy *= normalScale;
        coveNz.xy *= normalScale;
        vec3 coveSign = sign(vCoveNormal);
        vec3 coveMappedNormal = vec3(coveNx.z * coveSign.x, coveNx.x, coveNx.y) * coveWeights.x
          + vec3(coveNy.x, coveNy.z * coveSign.y, coveNy.y) * coveWeights.y
          + vec3(coveNz.x, coveNz.y, coveNz.z * coveSign.z) * coveWeights.z;
        normal = normalize(mat3(viewMatrix) * coveMappedNormal);
      `);
  };
  material.customProgramCacheKey = () => "cove-photographic-limestone-v2";
  return material;
}

/** Dense fern fronds conceal only the cave mouth; foliage has no movement collider. */
function buildHiddenEntrance(scene: THREE.Scene) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let row = 0; row < 13; row++) {
    const t = (row + 1) / 14, stemY = t, stemZ = t * t * 0.75;
    const width = Math.sin(t * Math.PI) * 0.32 + 0.025;
    for (const side of [-1, 1]) {
      const offset = positions.length / 3;
      positions.push(0, stemY, stemZ, side * width * 0.5, stemY + 0.02, stemZ - 0.045,
        side * width, stemY + 0.10, stemZ + 0.09, side * width * 0.5, stemY + 0.10, stemZ + 0.055,
        side * width * 0.46, stemY + 0.055, stemZ + 0.035);
      for (let vertex = 0; vertex < 5; vertex++) {
        const light = vertex === 4 ? 1.13 : 0.82 + t * 0.18;
        colors.push(0.31 * light, 0.48 * light, 0.19 * light);
      }
      indices.push(offset, offset + 1, offset + 4, offset + 1, offset + 2, offset + 4,
        offset + 2, offset + 3, offset + 4, offset + 3, offset, offset + 4);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95 });
  const entrance = HOT_SPRING_PATH[0];
  const mouthZ = entrance.z - 0.85;
  const roots = [[-0.4, -0.8], [-0.3, 0.75], [0.05, -0.95], [0.15, 0.9], [-0.55, -0.25], [-0.5, 0.3]];
  const ferns = new THREE.InstancedMesh(geometry, material, roots.length * 9 + 12);
  ferns.name = "onsen-walkthrough-entrance-ferns";
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (const [plant, [x, z]] of roots.entries()) for (let frond = 0; frond < 9; frond++) {
    const index = plant * 9 + frond;
    transform.position.set(entrance.x + x, entrance.y + 0.02, mouthZ - 0.3 + z);
    transform.rotation.set(0.05 + (frond % 3) * 0.10, frond * 2.399 + plant * 1.7, Math.sin(index * 1.2) * 0.20);
    const height = 1.6 + Math.sin(index * 2.7) * 0.38;
    transform.scale.set(1.3, height, 1.05);
    transform.updateMatrix();
    ferns.setMatrixAt(index, transform.matrix);
    tint.setRGB(0.85 + (plant % 3) * 0.07, 0.88 + (frond % 3) * 0.04, 0.82);
    ferns.setColorAt(index, tint);
  }
  for (let vine = 0; vine < 12; vine++) {
    transform.position.set(entrance.x - 0.67 + vine * 0.122, 2.51, mouthZ - 0.11);
    transform.rotation.set(0.1, vine * 1.7, Math.PI + Math.sin(vine) * 0.12, "YXZ");
    transform.scale.set(1.05, 0.85 + (vine % 3) * 0.13, 0.65);
    transform.updateMatrix();
    const index = roots.length * 9 + vine;
    ferns.setMatrixAt(index, transform.matrix);
    ferns.setColorAt(index, tint.setRGB(0.78, 0.87, 0.75));
  }
  ferns.computeBoundingSphere();
  ferns.receiveShadow = true;
  scene.add(ferns);
}

/** A sheltered, walkable cove. Geometry and materials are owned/disposed by the beach scene. */
export class Cove {
  private ambient = new THREE.HemisphereLight(0xf2f5f6, 0xd7d4c7, 2);
  private sun = new THREE.DirectionalLight(0xfff1de, 2.2);
  private firelight = new THREE.PointLight(FIRE_COLORS.amber, 0.4, 4.2, 2);
  private bulbs = new THREE.MeshBasicMaterial({ color: 0xffd798 });
  private night = 0;
  private fireStrength = 0.045;
  private fireTargetStrength = 0.045;
  private fireHasFuel = false;
  private fireFlare = 0;
  private fireTargetColor = new THREE.Color(FIRE_COLORS.amber);
  private fireAmber = new THREE.Color(FIRE_COLORS.amber);
  private fireWarmWhite = new THREE.Color(0xffebcf);
  private fireLightTint = new THREE.Color(FIRE_COLORS.amber);
  private lanternGlow = new THREE.Color(0xffb27a);
  private moonGlow = new THREE.Color(0xc7d8ec);
  private neutralSky = new THREE.Color(0xf4f7fa);
  private nightLights: ReturnType<typeof buildNightLights>;
  private shelterLights: THREE.PointLight[] = [];
  private hotSpring: ReturnType<typeof buildHotSpring>;
  private lastUpdateTime: number | null = null;

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    this.sun.position.set(-32, 70, -48);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.sun.target.position.set(0, 0, 15);
    this.firelight.position.set(CAMPFIRE.x, 1.1, CAMPFIRE.z);
    scene.add(this.ambient, this.sun, this.sun.target, this.firelight);
    buildShelters(scene);
    scene.traverse((object) => {
      if (object instanceof THREE.PointLight && object.name.startsWith("shelter-light-")) this.shelterLights.push(object);
    });

    const rock = rockMaterial();
    const woodMap = surfaceTexture("wood", true);
    const woodNormal = surfaceTexture("wood-normal");
    woodMap.repeat.set(1, 2);
    woodNormal.repeat.copy(woodMap.repeat);
    const wood = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: woodNormal, normalScale: new THREE.Vector2(0.4, 0.4), color: 0xa3947e, roughness: 0.87 });
    this.hotSpring = buildHotSpring(scene, { stone: rock, wood });
    buildHotSpringLandscape(scene, rock);
    buildHiddenEntrance(scene);
    const dark = new THREE.MeshStandardMaterial({ color: 0x292b28, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x737552, side: THREE.DoubleSide, roughness: 1 });

    // Restore the original stone walls while retaining the new beach and local lighting.
    const cliff = new THREE.Mesh(this.cliffGeometry(), rockMaterial(true));
    cliff.name = "cove-original-ridge";
    cliff.castShadow = cliff.receiveShadow = true;
    scene.add(cliff);

    // Small boulders mark the boundary without making the central gathering area crowded.
    const boulders: [number, number, number][] = [
      [-20.4, 1, 1.7], [-19.5, 3.2, 0.8], [20.5, 0.5, 1.9], [19.7, 3, 0.9],
      [-21, 11, 1.2], [21, 14, 1.3], [-20.8, 28.8, 0.9], [20.8, 29, 1],
    ];
    const boulderGeometry = new THREE.SphereGeometry(1, 20, 14);
    const boulderPositions = boulderGeometry.getAttribute("position");
    for (let i = 0; i < boulderPositions.count; i++) {
      const x = boulderPositions.getX(i), y = boulderPositions.getY(i), z = boulderPositions.getZ(i);
      const erosion = 1 + Math.sin(x * 7.2 + y * 3) * Math.sin(z * 5.1 - y * 4.3) * 0.075;
      boulderPositions.setXYZ(i, x * erosion, y * erosion, z * erosion);
    }
    boulderGeometry.computeVertexNormals();
    boulders.forEach(([x, z, r], i) => {
      const boulder = new THREE.Mesh(boulderGeometry, rock);
      boulder.position.set(x, r * 0.3, z);
      boulder.scale.set(r, r * 0.7, r * 0.85);
      boulder.rotation.set(0.1 * i, i * 1.7, i * 0.13);
      boulder.castShadow = boulder.receiveShadow = true;
      scene.add(boulder);
      obstacles.push({ x, z, r: r * 0.8 });
    });

    // The exposed pit uses the existing photographed soil rather than a flat brown disk.
    const soilMap = surfaceTexture("sand", true);
    const soilNormal = surfaceTexture("sand-normal");
    soilMap.repeat.set(1.8, 1.8);
    soilNormal.repeat.copy(soilMap.repeat);
    const soil = new THREE.MeshStandardMaterial({
      map: soilMap, normalMap: soilNormal, normalScale: new THREE.Vector2(0.35, 0.35),
      color: 0xffffff, roughness: 1, metalness: 0,
    });
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), soil);
    ash.name = "campfire-soil";
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(0, 0.025, CAMPFIRE.z);
    ash.receiveShadow = true;
    scene.add(ash);
    const stones = new THREE.InstancedMesh(boulderGeometry, rock, 15);
    stones.castShadow = stones.receiveShadow = true;
    const transform = new THREE.Object3D();
    for (let i = 0; i < 15; i++) {
      const a = i / 15 * Math.PI * 2;
      transform.position.set(Math.cos(a) * 1.18, 0.16, CAMPFIRE.z + Math.sin(a) * 1.18);
      transform.scale.set(0.28, 0.22, 0.25);
      transform.rotation.set(i * 0.12, a, 0.1);
      transform.updateMatrix();
      stones.setMatrixAt(i, transform.matrix);
    }
    scene.add(stones);

    buildFireBenches(scene, obstacles, wood);

    // Repeated lights share draws so the scene stays light when the beach is full.
    const lanterns: [number, number][] = [
      [-5.3, 10.3], [5.3, 10.3], [-5.1, 17], [5.1, 17],
      [-20, 13], [20, 13], [-20, 23], [20, 23], [-20, 29.5], [20, 29.5],
    ];
    const bases = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 16), dark, lanterns.length);
    const glasses = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.26, 16), this.bulbs, lanterns.length);
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.16, 16), dark, lanterns.length);
    const lightPlacement = new THREE.Matrix4();
    lanterns.forEach(([x, z], i) => {
      bases.setMatrixAt(i, lightPlacement.makeTranslation(x, 0.12, z));
      glasses.setMatrixAt(i, lightPlacement.makeTranslation(x, 0.31, z));
      caps.setMatrixAt(i, lightPlacement.makeTranslation(x, 0.52, z));
    });
    scene.add(bases, glasses, caps);

    // Pole-free paper lanterns rise in staggered layers from the fire toward the sea.
    // The nearest layer starts above the hut ridges; no cables cut across the sky.
    const floatingLanterns: THREE.Vector3[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const count = 10 + layer * 2, halfSpan = 13.5 + layer * 5.7;
      for (let i = 0; i < count; i++) {
        const x = -halfSpan + i * halfSpan * 2 / (count - 1) + Math.sin(i * 2.17 + layer) * 0.7;
        const y = 8.4 + layer * 4.1 + (0.5 + Math.sin(i * 1.73 + layer * 1.4) * 0.5) * 3.1;
        let z = 10 - layer * 14 + Math.sin(i * 1.37 + layer * 0.8) * (2.2 + layer * 1.2);
        // Keep the overhead centre of the shared sky-viewing mats open.
        if (layer === 0 && Math.hypot(x - 7, z - 7) < 4.6) z = 12.8;
        floatingLanterns.push(new THREE.Vector3(x, y, z));
      }
    }
    this.nightLights = buildNightLights(scene, lanterns, floatingLanterns);

    // Thin curved dune-grass blades stay along the outer edge of the walkable sand.
    const grassGeometry = new THREE.PlaneGeometry(0.035, 0.6, 1, 4);
    const grassPositions = grassGeometry.getAttribute("position");
    for (let i = 0; i < grassPositions.count; i++) {
      const y = grassPositions.getY(i) + 0.3;
      grassPositions.setXYZ(i, grassPositions.getX(i) * (1 - y / 0.65), y, y * y * 0.65);
    }
    grassGeometry.computeVertexNormals();
    const grasses = new THREE.InstancedMesh(grassGeometry, leaf, 360);
    const grassColor = new THREE.Color();
    for (let i = 0; i < 360; i++) {
      const side = i % 2 ? -1 : 1;
      const clump = Math.floor(i / 5);
      transform.position.set(side * (21.2 + Math.sin(clump * 7.3) * 0.4) + Math.sin(i * 2.3) * 0.13, 0.015, 2 + (clump / 72) * 28 + Math.cos(i) * 0.12);
      transform.scale.set(0.8 + Math.sin(i) * 0.2, 0.55 + (Math.sin(i * 2.7) + 1) * 0.45, 1);
      transform.rotation.set(side * 0.07, i * 2.4, Math.sin(i) * 0.17);
      transform.updateMatrix();
      grasses.setMatrixAt(i, transform.matrix);
      grassColor.setRGB(0.76 + Math.sin(i * 3.1) * 0.08, 0.76 + Math.sin(i * 3.1) * 0.07, 0.58);
      grasses.setColorAt(i, grassColor);
    }
    grasses.receiveShadow = true;
    scene.add(grasses);

  }

  private cliffGeometry() {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-31, 30, -16), new THREE.Vector3(-32, 36, -1),
      new THREE.Vector3(-32, 44, 19), new THREE.Vector3(-29, 40, 35),
      // The rear ridge meets the original high side walls; the bath opens toward the sea.
      new THREE.Vector3(-15, 40, 58), new THREE.Vector3(0, 42, 62),
      new THREE.Vector3(15, 40, 58), new THREE.Vector3(29, 44, 35),
      new THREE.Vector3(32, 42, 19), new THREE.Vector3(32, 35, -1),
      new THREE.Vector3(31, 30, -16),
    ], false, "catmullrom", 0.35);
    const along = 240, around = 96;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= along; i++) {
      const t = i / along, center = path.getPoint(t), tangent = path.getTangent(t);
      const cross = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const width = 6.5 + Math.sin(t * 27.2) * 0.5 + Math.sin(t * 71) * 0.25;
      const ridge = center.y + Math.sin(t * 49) * 1.4 + Math.sin(t * 117) * 0.6
        + Math.sin(t * 247) * 0.3;
      for (let j = 0; j <= around; j++) {
        const angle = j / around * Math.PI * 2;
        const sine = Math.sin(angle), cosine = Math.cos(angle);
        // A squarer cross-section gives the ridge steep faces and broad rock ledges.
        const level = (sine + 1) / 2;
        const worldHeight = level * ridge;
        const strata = Math.tanh(Math.sin(worldHeight * 1.35 + Math.sin(t * 31) * 0.22) * 5) * 0.55
          + Math.sin(worldHeight * 3.2 + t * 11) * 0.13;
        const cracks = Math.pow(Math.abs(Math.sin(t * 107 + level * 0.8)), 18) * 0.7;
        const erosion = Math.sin(t * 149 + level * 11) * Math.sin(worldHeight * 2.9 + t * 41) * 0.24;
        const offset = Math.sign(cosine) * Math.pow(Math.abs(cosine), 0.42) * (width + strata + erosion - cracks);
        const x = center.x + cross.x * offset;
        const z = center.z + cross.z * offset;
        const y = level * ridge - 0.9 + Math.sin(t * 83 + angle * 3) * 0.12 * level;
        positions.push(x, y, z);
        uvs.push(t * 35, level * 8);
        if (i < along && j < around) {
          const a = i * (around + 1) + j, b = a + around + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    // Close the two sea-facing ends of the ridge.
    for (const end of [0, along]) {
      const center = path.getPoint(end / along);
      const cap = positions.length / 3;
      positions.push(center.x, center.y / 2 - 0.9, center.z);
      uvs.push(0.5, 0.5);
      for (let j = 0; j < around; j++) {
        const ring = end * (around + 1) + j;
        if (end === 0) indices.push(cap, ring, ring + 1);
        else indices.push(cap, ring + 1, ring);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  applyDaylight(d: Daylight) {
    this.night = d.fire;
    // After 20:00, moonlight only sketches silhouettes. Warmth belongs to nearby lamps.
    const deep = d.deepNight;
    const fill = 1.1 + (1 - d.stars) * 0.45 + Math.max(0, d.sun[1]) * 0.7;
    this.ambient.intensity = THREE.MathUtils.lerp(fill, 0.12, deep);
    this.ambient.color.setRGB(...d.cloud, THREE.SRGBColorSpace)
      .lerp(this.neutralSky, 0.65).lerp(this.moonGlow, d.stars * 0.85)
      .lerp(this.lanternGlow, d.lanterns * 0.035);
    this.ambient.groundColor.setHex(0xd7d4c7).lerp(new THREE.Color(0x49546b), deep);
    this.sun.intensity = THREE.MathUtils.lerp(0.22 + Math.max(0, d.sun[1]) * 1.85, 0.055, deep);
    this.sun.color.setRGB(...d.sunColor, THREE.SRGBColorSpace).lerp(this.moonGlow, d.stars * 0.8);
    const light = d.sun[1] > 0 ? d.sun : d.moon;
    this.sun.position.set(light[0] * 80, Math.max(24, light[1] * 80), light[2] * 80);
    this.nightLights.applyDaylight(d.fire);
    this.hotSpring.applyDaylight(d.fire);
    for (const lamp of this.shelterLights) lamp.intensity = 1.5 + d.fire * 7.5;
  }

  /** Shared fire choices ease into the lighting instead of flashing on every room update. */
  setFireState(logCount: number, color: string) {
    const logs = Number.isFinite(logCount) ? THREE.MathUtils.clamp(logCount, 0, 12) : 3;
    this.fireHasFuel = logs > 0;
    // Bare embers illuminate only their own pit. A tall, full fire need not bleach the sand.
    this.fireTargetStrength = logs === 0 ? 0.045 : 0.18 + 1.22 * Math.sqrt(logs / 12);
    this.fireTargetColor.setHex(FIRE_COLORS[color] ?? FIRE_COLORS.amber);
  }

  /** 방금 넣은 장작이 타오르는 정도 (CoastalFire.flareAmount). 조명도 같이 밝아진다 */
  setFireFlare(amount: number) {
    this.fireFlare = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  }

  /** Use the fire shader's already blended color so powder and rainbow also light the sand. */
  setFireTint(color: THREE.Color) {
    this.fireTargetColor.copy(color);
  }

  update(time: number, camera?: THREE.Camera) {
    this.nightLights.update?.(time);
    this.hotSpring.update(time, camera);
    const dt = this.lastUpdateTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - this.lastUpdateTime, 0, 0.1);
    this.lastUpdateTime = time;
    const blend = 1 - Math.exp(-dt * 4);
    this.fireStrength += (this.fireTargetStrength - this.fireStrength) * blend;
    // Colored powder still tints nearby surfaces; a warm white component keeps cotton/stone matte.
    this.fireLightTint.copy(this.fireHasFuel ? this.fireTargetColor : this.fireAmber).lerp(this.fireWarmWhite, 0.3);
    this.firelight.color.lerp(this.fireLightTint, blend);
    const flare = this.fireHasFuel ? this.fireFlare : 0;
    const strength = this.fireStrength * (1 + flare * 0.22);
    this.firelight.distance = 4 + this.fireStrength * 4;
    this.firelight.position.y = 0.25 + this.fireStrength * 0.85;
    // Gentle, low-frequency breathing replaces the restless pulsing of dying embers.
    const breath = 1 + Math.sin(time * 0.65) * 0.018 + Math.sin(time * 1.7 + 0.6) * 0.003;
    this.firelight.intensity = strength * (6 + this.night * 8) * breath;
  }
}
