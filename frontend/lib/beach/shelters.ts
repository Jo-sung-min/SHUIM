import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export interface Shelter {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  floorY: number;
}

export interface ShelterSeat {
  id: string;
  shelterId: string;
  name: string;
  x: number;
  z: number;
  yaw: 0;
}

export interface ShelterCollider { minX: number; maxX: number; minZ: number; maxZ: number }

/** The whole sea-facing side (-Z) is an entrance; the rear faces the cliff. */
export const SHELTERS: readonly Shelter[] = [
  { id: "pine", name: "솔바람 오두막", x: -8, z: 15.6, width: 6.2, depth: 4.6, floorY: 0.16 },
  { id: "wave", name: "파도소리 오두막", x: 0, z: 17.1, width: 6.2, depth: 4.6, floorY: 0.16 },
  { id: "sunset", name: "노을 오두막", x: 8, z: 15.6, width: 6.2, depth: 4.6, floorY: 0.16 },
];

export const SHELTER_SEATS: readonly ShelterSeat[] = SHELTERS.flatMap((shelter) =>
  [-1.65, 0, 1.65].map((offset, index) => ({
    id: `${shelter.id}-${index + 1}`,
    shelterId: shelter.id,
    name: shelter.name,
    x: shelter.x + offset,
    z: shelter.z + 0.9,
    yaw: 0 as const,
  })),
);

export const SHELTER_COLLIDERS: readonly ShelterCollider[] = SHELTERS.flatMap((shelter) => {
  const { x, z, width, depth } = shelter;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { minX: x - halfWidth, maxX: x - halfWidth + 0.2, minZ: z - halfDepth, maxZ: z + halfDepth },
    { minX: x + halfWidth - 0.2, maxX: x + halfWidth, minZ: z - halfDepth, maxZ: z + halfDepth },
    { minX: x - halfWidth, maxX: x + halfWidth, minZ: z + halfDepth - 0.2, maxZ: z + halfDepth },
    ...[-1, 1].map((side) => ({
      minX: x + side * (halfWidth - 0.1) - 0.15,
      maxX: x + side * (halfWidth - 0.1) + 0.15,
      minZ: z - halfDepth - 0.03,
      maxZ: z - halfDepth + 0.27,
    })),
    { minX: x - 2.7, maxX: x + 2.7, minZ: z + 0.55, maxZ: z + 1.85 },
  ];
});

type Part = {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
  color: number;
  rotationX?: number;
  rotationZ?: number;
};

function shelterTexture(file: string, color = false): THREE.Texture | null {
  // Navigation tests run without a DOM; texture decoding only belongs to the browser.
  if (typeof document === "undefined") return null;
  const texture = new THREE.TextureLoader().load(`/beach/real/${file}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

/** Give every board real-world grain scale even though its geometry is instanced. */
function shelterSurface(material: THREE.MeshStandardMaterial, tileSize: number): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute vec3 shelterDimensions;
      attribute vec2 shelterOffset;
    `).replace("#include <uv_vertex>", `
      #include <uv_vertex>
      vec3 localSurface = position * shelterDimensions;
      vec3 faceNormal = abs(normal);
      vec2 surfaceUv;
      // The long axis of each face follows the timber grain, including upright posts.
      if (faceNormal.y >= faceNormal.x && faceNormal.y >= faceNormal.z) {
        surfaceUv = shelterDimensions.z >= shelterDimensions.x ? localSurface.xz : localSurface.zx;
      } else if (faceNormal.x >= faceNormal.z) {
        surfaceUv = shelterDimensions.z >= shelterDimensions.y ? localSurface.yz : localSurface.zy;
      } else {
        surfaceUv = shelterDimensions.x >= shelterDimensions.y ? localSurface.yx : localSurface.xy;
      }
      // The scanned timber grain runs horizontally in the source photograph.
      surfaceUv = surfaceUv.yx / ${tileSize.toFixed(4)} + shelterOffset;
      #ifdef USE_MAP
        vMapUv = surfaceUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = surfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = surfaceUv;
      #endif
    `);
  };
  material.customProgramCacheKey = () => `shelter-surface-${tileSize}`;
}

/** Eight shared instance batches keep all three furnished huts inexpensive to draw. */
export function buildShelters(scene: THREE.Scene): void {
  const floor: Part[] = [];
  const walls: Part[] = [];
  const frame: Part[] = [];
  const roof: Part[] = [];
  const fabric: Part[] = [];
  const woven: Part[] = [];
  const metal: Part[] = [];
  const glass: Part[] = [];
  const add = (parts: Part[], x: number, y: number, z: number, width: number, height: number, depth: number, color: number, rotationZ = 0, rotationX = 0) => {
    parts.push({ x, y, z, width, height, depth, color, rotationZ, rotationX });
  };

  SHELTERS.forEach((shelter, shelterIndex) => {
    const { x, z, width, depth, floorY } = shelter;
    const left = x - width / 2 + 0.1;
    const right = x + width / 2 - 0.1;
    const front = z - depth / 2 + 0.1;
    const back = z + depth / 2 - 0.1;
    const timber = [0xb58a5c, 0xc49a6a, 0xb98e60, 0xc09a70];
    const cedar = [0x79503a, 0x84593e, 0x8f6345, 0x80563f];
    const accent = [0x81928b, 0x789697, 0xbb8c70][shelterIndex];

    // A shallow, walkable deck and broad first step make the threshold inviting.
    const plankCount = 23;
    const plankWidth = width / plankCount;
    for (let i = 0; i < plankCount; i++) {
      add(floor, x - width / 2 + plankWidth * (i + 0.5), floorY - 0.06, z, plankWidth - 0.008, 0.12, depth, timber[i % timber.length]);
    }
    add(frame, x, 0.075, front - 0.1, width, 0.14, 0.16, 0x806044);
    add(floor, x, 0.035, front - 0.3, width - 0.38, 0.07, 0.42, 0xb78e62);

    // Three timber walls provide privacy. No railing or central post crosses the opening.
    for (let row = 0; row < 16; row++) {
      const y = floorY + 0.1 + row * 0.18;
      add(walls, x, y, back, width - 0.16, 0.178, 0.2, timber[(row + shelterIndex) % timber.length]);
      add(walls, left, y, z, 0.2, 0.178, depth, timber[(row + 1) % timber.length]);
      add(walls, right, y, z, 0.2, 0.178, depth, timber[(row + 2) % timber.length]);
    }
    for (const columnX of [left, right]) {
      for (const columnZ of [front, back]) add(frame, columnX, 1.71, columnZ, 0.3, 3.1, 0.3, 0x79583e);
      add(frame, columnX, 1.71, z + 0.15, 0.19, 3.1, 0.25, 0x8a6547);
      add(frame, columnX, 3.13, z, 0.24, 0.24, depth + 0.38, 0x715039);
    }
    add(frame, x, 3.13, front, width, 0.24, 0.24, 0x79583e);
    add(frame, x, 3.13, back, width, 0.24, 0.24, 0x79583e);
    add(frame, x, 1.71, back - 0.08, 0.18, 3.1, 0.22, 0x906d4e);

    // A pitched cedar roof leaves a generous open gable and visible rafters at the front.
    const roofRun = width / 2 + 0.36;
    const ridgeY = 4.34;
    const roofRise = 1.16;
    const roofAngle = Math.atan2(roofRise, roofRun);
    const roofLength = Math.hypot(roofRun, roofRise);
    const roofDepth = depth + 0.65;
    const roofBoards = 16;
    for (const side of [-1, 1]) {
      for (let board = 0; board < roofBoards; board++) {
        add(roof, x + side * roofRun / 2, ridgeY - roofRise / 2, z - roofDepth / 2 + (board + 0.5) * roofDepth / roofBoards,
          roofLength, 0.14, roofDepth / roofBoards + 0.008, cedar[(board + shelterIndex) % cedar.length], -side * roofAngle);
      }
      for (const rafterZ of [z - roofDepth / 2, front + 1.15, back - 1.15, z + roofDepth / 2]) {
        add(frame, x + side * roofRun / 2, ridgeY - roofRise / 2 - 0.13, rafterZ, roofLength + 0.08, 0.22, 0.16, 0x9b744c, -side * roofAngle);
      }
    }
    add(frame, x, ridgeY - 0.12, z, 0.23, 0.28, roofDepth + 0.12, 0x8c6443);
    add(roof, x, ridgeY + 0.07, z, 0.27, 0.12, roofDepth + 0.12, 0x78513a);
    // Fill the rear gable while the front remains entirely open above the header.
    for (let row = 0; row < 7; row++) {
      const y = 3.16 + row * 0.16;
      const gableWidth = Math.min(width - 0.16, 2 * (ridgeY - y - 0.1) / Math.tan(roofAngle));
      add(walls, x, y, back, Math.max(0.12, gableWidth), 0.16, 0.2, timber[(row + 1) % timber.length]);
    }

    // A deep cushioned bench faces the sea. Its front edge is behind a roomy interior aisle.
    add(frame, x, 0.48, z + 1.1, 5.4, 0.22, 1.12, 0x956e49);
    for (const legX of [-2.35, 0, 2.35]) {
      for (const legZ of [0.73, 1.5]) add(frame, x + legX, 0.3, z + legZ, 0.19, 0.28, 0.19, 0x79583e);
    }
    add(frame, x, 1.04, z + 1.73, 5.4, 0.85, 0.17, 0x9f7953);
    for (const side of [-1, 1]) {
      add(frame, x + side * 2.59, 0.84, z + 1.13, 0.2, 0.16, 1.15, 0xa68058);
      add(frame, x + side * 2.59, 0.65, z + 0.7, 0.16, 0.4, 0.16, 0x956e49);
    }
    [-1.65, 0, 1.65].forEach((offset, index) => {
      add(fabric, x + offset, 0.7, z + 1.08, 1.58, 0.23, 1.03, index === 1 ? 0xe7d8bc : 0xd8c9ad);
      add(fabric, x + offset, 1.08, z + 1.58, 1.52, 0.57, 0.2, index === 1 ? accent : 0xd3c4a8, 0, -0.12);
    });
    // Small loose cushions and a folded throw give each shared shelter its own character.
    add(fabric, x - 2.08, 0.99, z + 1.25, 0.56, 0.48, 0.22, accent, -0.2, -0.15);
    add(fabric, x + 2.12, 0.98, z + 1.22, 0.53, 0.45, 0.24, 0xb98b64, 0.2, -0.16);
    add(woven, x + 2.02, 0.831, z + 0.98, 0.78, 0.026, 0.84, accent);
    add(woven, x + 2.02, 0.65, z + 0.56, 0.78, 0.37, 0.025, accent);

    // Woven rugs are flush with the deck and leave the threshold clear.
    add(woven, x, floorY + 0.012, z - 0.72, 4.55, 0.02, 1.85, 0xc1ac83);
    for (const stripe of [-0.73, -0.62, 0.62, 0.73]) {
      add(woven, x, floorY + 0.025, z - 0.72 + stripe, 4.36, 0.006, 0.045, accent);
    }
    for (const side of [-1, 1]) {
      for (let fringe = 0; fringe < 19; fringe++) {
        add(woven, x - 2.13 + fringe * 0.237, floorY + 0.014, z - 0.72 + side * 0.99, 0.035, 0.02, 0.16, 0xd1bf99);
      }
    }

    // Lanterns hang at the edges of the opening, above eye level and out of the walking path.
    for (const side of [-1, 1]) {
      const lanternX = x + side * 2.64;
      const lanternZ = front + 0.28;
      add(metal, lanternX, 2.9, lanternZ, 0.035, 0.4, 0.035, 0x4c493b);
      add(metal, lanternX, 2.65, lanternZ, 0.31, 0.08, 0.31, 0x665744);
      add(metal, lanternX, 2.27, lanternZ, 0.3, 0.08, 0.3, 0x665744);
      add(glass, lanternX, 2.46, lanternZ, 0.2, 0.3, 0.2, 0xffce83);
      for (const cornerX of [-0.11, 0.11]) {
        for (const cornerZ of [-0.11, 0.11]) add(metal, lanternX + cornerX, 2.46, lanternZ + cornerZ, 0.025, 0.3, 0.025, 0x4c493b);
      }
    }
    const warmLight = new THREE.PointLight(0xffc78a, 3.4, 6, 1.6);
    warmLight.name = `shelter-light-${shelter.id}`;
    warmLight.position.set(x, 2.5, z - 0.3);
    scene.add(warmLight);
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const timberBox = new RoundedBoxGeometry(1, 1, 1, 1, 0.012);
  const cushionBox = new RoundedBoxGeometry(1, 1, 1, 3, 0.15);
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: shelterTexture("wood", true),
    normalMap: shelterTexture("wood-normal"),
    roughnessMap: shelterTexture("wood-roughness"),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.95,
    metalness: 0,
  });
  const fabricMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: shelterTexture("fabric", true),
    normalMap: shelterTexture("fabric-normal"),
    roughnessMap: shelterTexture("fabric-roughness"),
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 1,
    metalness: 0,
  });
  shelterSurface(woodMaterial, 1.8);
  shelterSurface(fabricMaterial, 0.3);
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.78 });
  const glowMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffedcf, roughness: 0.18, metalness: 0,
    emissive: 0xffba62, emissiveIntensity: 1.7,
    transparent: true, opacity: 0.83, depthWrite: false,
  });
  const matrix = new THREE.Object3D();
  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const batches: [string, Part[], THREE.Material][] = [
    ["deck", floor, woodMaterial], ["walls", walls, woodMaterial], ["timber", frame, woodMaterial], ["roof", roof, woodMaterial],
    ["cushions", fabric, fabricMaterial], ["weave", woven, fabricMaterial], ["lantern-frame", metal, metalMaterial], ["lantern-glow", glass, glowMaterial],
  ];
  for (const [name, parts, material] of batches) {
    const isTimber = material === woodMaterial;
    const geometry = (isTimber ? timberBox : name === "cushions" ? cushionBox : box).clone();
    const dimensions = new Float32Array(parts.length * 3);
    const offsets = new Float32Array(parts.length * 2);
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `shelters-${name}`;
    mesh.castShadow = name !== "lantern-glow" && name !== "weave";
    mesh.receiveShadow = name !== "lantern-glow";
    parts.forEach((part, index) => {
      matrix.position.set(part.x, part.y, part.z);
      matrix.scale.set(part.width, part.height, part.depth);
      matrix.rotation.set(part.rotationX ?? 0, 0, part.rotationZ ?? 0);
      matrix.updateMatrix();
      mesh.setMatrixAt(index, matrix.matrix);
      color.setHex(part.color);
      // The photograph supplies the wood colour; keep only a little of the original stain.
      if (isTimber) color.lerp(white, name === "roof" ? 0.72 : 0.9);
      else if (material === fabricMaterial) color.lerp(white, 0.35);
      mesh.setColorAt(index, color);
      dimensions.set([part.width, part.height, part.depth], index * 3);
      offsets.set([(index * 0.173) % 1, (index * 0.381) % 1], index * 2);
    });
    geometry.setAttribute("shelterDimensions", new THREE.InstancedBufferAttribute(dimensions, 3));
    geometry.setAttribute("shelterOffset", new THREE.InstancedBufferAttribute(offsets, 2));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  box.dispose();
  timberBox.dispose();
  cushionBox.dispose();
}
