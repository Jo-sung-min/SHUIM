import * as THREE from "three";
import type { Daylight } from "./daylight";
import { buildShelters } from "./shelters";

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
    : new THREE.TextureLoader().load(`/beach/real/${name}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Photograph-based rock stays at a consistent real-world scale, including on the cliff tops. */
function rockMaterial() {
  const material = new THREE.MeshStandardMaterial({
    map: surfaceTexture("rock", true), normalMap: surfaceTexture("rock-normal"),
    normalScale: new THREE.Vector2(0.65, 0.65), color: 0xe9e6df, roughness: 0.97,
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

/** A sheltered, walkable cove. Geometry and materials are owned/disposed by the beach scene. */
export class Cove {
  private ambient = new THREE.HemisphereLight(0xf2f5f6, 0x9a8d77, 2);
  private sun = new THREE.DirectionalLight(0xfff1de, 2.2);
  private firelight = new THREE.PointLight(FIRE_COLORS.amber, 8, 14, 1.4);
  private bulbs = new THREE.MeshBasicMaterial({ color: 0xffd798 });
  private night = 0;
  private fireStrength = 1;
  private fireTargetStrength = 1;
  private fireFlare = 0;
  private fireTargetColor = new THREE.Color(FIRE_COLORS.amber);
  private lanternGlow = new THREE.Color(0xffb27a);
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

    const rock = rockMaterial();
    const woodMap = surfaceTexture("wood", true);
    const woodNormal = surfaceTexture("wood-normal");
    woodMap.repeat.set(1, 2);
    woodNormal.repeat.copy(woodMap.repeat);
    const wood = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: woodNormal, normalScale: new THREE.Vector2(0.4, 0.4), color: 0xa3947e, roughness: 0.87 });
    const woodEnd = new THREE.MeshStandardMaterial({ map: woodMap, color: 0xc0ac8a, roughness: 0.92 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x292b28, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x737552, side: THREE.DoubleSide, roughness: 1 });

    // One continuous eroded ridge follows the cove, avoiding repeated tower silhouettes.
    const cliff = new THREE.Mesh(this.cliffGeometry(), rock);
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

    // Rounded ring of stones and a charcoal bed, kept below the animated flame.
    const ash = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), dark);
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(0, 0.025, CAMPFIRE.z);
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

    // Low seats flank the fire, leaving the arrival path and view of the sea open.
    for (const [x, z, angle] of [[-4.4, CAMPFIRE.z, 0], [4.4, CAMPFIRE.z, 0], [-3.4, CAMPFIRE.z + 4.2, -0.7], [3.4, CAMPFIRE.z + 4.2, 0.7]]) {
      const seat = new THREE.Group();
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 3.2, 24, 4), [wood, woodEnd, woodEnd]);
      log.rotation.x = Math.PI / 2;
      log.position.y = 0.48;
      log.castShadow = log.receiveShadow = true;
      seat.add(log);
      for (const offset of [-1.1, 1.1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.3, 0.3), wood);
        foot.position.set(0, 0.16, offset);
        foot.castShadow = foot.receiveShadow = true;
        seat.add(foot);
      }
      seat.position.set(x, 0, z);
      seat.rotation.y = angle;
      scene.add(seat);
      for (const offset of [-1.3, -0.45, 0.45, 1.3]) obstacles.push({ x: x + Math.sin(angle) * offset, z: z + Math.cos(angle) * offset, r: 0.31 });
    }

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

    const wire = new THREE.LineBasicMaterial({ color: 0x4b4638 });
    const festoonBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), this.bulbs, 50);
    let bulbIndex = 0;
    for (const z of [7.5, 17.8]) {
      const halfSpan = z > 10 ? 20 : 14.8;
      for (const x of [-halfSpan, halfSpan]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 5.2, 12), wood);
        post.position.set(x, 2.6, z);
        post.castShadow = post.receiveShadow = true;
        scene.add(post);
        obstacles.push({ x, z, r: 0.12 });
      }
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 52; i++) {
        const t = i / 52;
        points.push(new THREE.Vector3(-halfSpan + t * halfSpan * 2, 5.12 - Math.sin(t * Math.PI) * 1.05, z));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wire));
      for (let i = 1; i <= 25; i++) {
        const point = points[i * 2];
        festoonBulbs.setMatrixAt(bulbIndex++, lightPlacement.makeTranslation(point.x, point.y - 0.08, point.z));
      }
    }
    scene.add(festoonBulbs);

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
      new THREE.Vector3(-15, 36, 43), new THREE.Vector3(0, 39, 44),
      new THREE.Vector3(15, 40, 43), new THREE.Vector3(29, 44, 35),
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
    // 밤에는 하늘 가득한 풍등이 모래와 절벽에 따뜻한 빛을 얹는다 (너무 어둡고 무섭지 않게)
    this.ambient.intensity = 0.35 + (1 - d.stars) * 0.7 + Math.max(0, d.sun[1]) * 1.5 + d.lanterns * 0.9;
    this.ambient.color.setRGB(...d.cloud).lerp(this.lanternGlow, d.lanterns * 0.75);
    this.sun.intensity = 0.3 + Math.max(0, d.sun[1]) * 2.3 + d.lanterns * 0.25;
    this.sun.color.setRGB(...d.sunColor).lerp(this.lanternGlow, d.lanterns * 0.5);
    this.sun.position.set(d.sun[0] * 80, Math.max(18, d.sun[1] * 80), d.sun[2] * 80);
  }

  /** Shared fire choices ease into the lighting instead of flashing on every room update. */
  setFireState(logCount: number, color: string) {
    const logs = Number.isFinite(logCount) ? THREE.MathUtils.clamp(logCount, 0, 12) : 3;
    // 장작이 0 이어도 불씨가 모래를 은은히 비춘다
    this.fireTargetStrength = Math.sqrt((logs + 0.6) / 3.6);
    this.fireTargetColor.setHex(FIRE_COLORS[color] ?? FIRE_COLORS.amber);
  }

  /** 방금 넣은 장작이 타오르는 정도 (CoastalFire.flareAmount). 조명도 같이 밝아진다 */
  setFireFlare(amount: number) {
    this.fireFlare = Math.max(0, amount);
  }

  update(time: number) {
    const dt = this.lastUpdateTime === null ? 1 / 60 : THREE.MathUtils.clamp(time - this.lastUpdateTime, 0, 0.1);
    this.lastUpdateTime = time;
    const blend = 1 - Math.exp(-dt * 4);
    this.fireStrength += (this.fireTargetStrength - this.fireStrength) * blend;
    this.firelight.color.lerp(this.fireTargetColor, blend);
    const strength = this.fireStrength * (1 + this.fireFlare * 0.9);
    this.firelight.distance = 10 + strength * 4;
    // 불씨만 남았을 땐 더 크게, 천천히 일렁인다
    const calm = 1.6 - Math.min(1, this.fireStrength);
    const flicker = 1 + Math.sin(time * 7.3) * 0.08 + (Math.sin(time * 2.3) * 0.06 + Math.sin(time * 11.7) * 0.03) * calm;
    this.firelight.intensity = strength * (8 + this.night * 10) * flicker;
  }
}
