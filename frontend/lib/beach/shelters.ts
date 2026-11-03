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
  { id: "pine", name: "솔바람 오두막", x: -13, z: 23, width: 8.2, depth: 5.6, floorY: 0.18 },
  { id: "wave", name: "파도소리 오두막", x: 0, z: 25, width: 8.2, depth: 5.6, floorY: 0.18 },
  { id: "sunset", name: "노을 오두막", x: 13, z: 23, width: 8.2, depth: 5.6, floorY: 0.18 },
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
    { minX: x - 2.95, maxX: x + 2.95, minZ: z + 0.55, maxZ: z + 2.08 },
    ...[-1, 1].map((side) => ({
      minX: x + side * 3.22 - 0.43,
      maxX: x + side * 3.22 + 0.43,
      minZ: z - 1.08,
      maxZ: z + 0.02,
    })),
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
    const timber = [0xebd6b3, 0xf3dfc0, 0xe8d0ad, 0xf1dcbc];
    const cedar = [0xb79b76, 0xbfa37e, 0xc5ab86, 0xbda17a];
    const accent = [0xa3b3a6, 0x9eafb2, 0xc6ae92][shelterIndex];
    const brass = 0xc4a46c;

    // A shallow, walkable deck and broad first step make the threshold inviting.
    const plankCount = 31;
    const plankWidth = width / plankCount;
    for (let i = 0; i < plankCount; i++) {
      add(floor, x - width / 2 + plankWidth * (i + 0.5), floorY - 0.06, z, plankWidth - 0.008, 0.12, depth, timber[i % timber.length]);
    }
    add(frame, x, 0.09, front - 0.1, width, 0.17, 0.18, 0x9f7950);
    add(floor, x, 0.045, front - 0.36, width - 0.38, 0.09, 0.54, 0xd1b18b);
    add(metal, x, floorY - 0.02, front - 0.17, width - 0.12, 0.025, 0.025, brass);

    // Three timber walls provide privacy. No railing or central post crosses the opening.
    for (let row = 0; row < 18; row++) {
      const y = floorY + 0.1 + row * 0.18;
      add(walls, x, y, back, width - 0.16, 0.178, 0.2, timber[(row + shelterIndex) % timber.length]);
      add(walls, left, y, z, 0.2, 0.178, depth, timber[(row + 1) % timber.length]);
      add(walls, right, y, z, 0.2, 0.178, depth, timber[(row + 2) % timber.length]);
    }
    for (const columnX of [left, right]) {
      for (const columnZ of [front, back]) {
        add(frame, columnX, 1.85, columnZ, 0.32, 3.34, 0.32, 0xa78258);
        add(metal, columnX, floorY + 0.1, columnZ, 0.34, 0.2, 0.34, brass);
      }
      add(frame, columnX, 1.85, z + 0.15, 0.19, 3.34, 0.25, 0xb08a61);
      add(frame, columnX, 3.46, z, 0.27, 0.26, depth + 0.65, 0x98734f);
    }
    add(frame, x, 3.46, front, width, 0.26, 0.26, 0xa78258);
    add(frame, x, 3.46, back, width, 0.26, 0.26, 0xa78258);
    add(frame, x, 1.85, back - 0.08, 0.18, 3.34, 0.22, 0xb28d62);
    // Fine ceiling battens and a projecting pergola give the lounge a resort-scale canopy.
    for (let slat = 0; slat < 27; slat++) {
      const slatX = x - width / 2 + 0.27 + slat * (width - 0.54) / 26;
      add(frame, slatX, 3.35, z, 0.105, 0.12, depth + 0.64, timber[slat % timber.length]);
    }
    add(metal, x, 3.31, back - 0.27, width - 0.56, 0.035, 0.025, brass);

    // A pitched cedar roof leaves a generous open gable and visible rafters at the front.
    const roofRun = width / 2 + 0.6;
    const ridgeY = 4.46;
    const roofRise = 0.86;
    const roofAngle = Math.atan2(roofRise, roofRun);
    const roofLength = Math.hypot(roofRun, roofRise);
    const roofDepth = depth + 1.0;
    const roofBoards = 21;
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
    for (let row = 0; row < 6; row++) {
      const y = 3.47 + row * 0.16;
      const gableWidth = Math.min(width - 0.16, 2 * (ridgeY - y - 0.1) / Math.tan(roofAngle));
      add(walls, x, y, back, Math.max(0.12, gableWidth), 0.16, 0.2, timber[(row + 1) % timber.length]);
    }

    // A deep cushioned bench faces the sea. Its front edge is behind a roomy interior aisle.
    add(frame, x, 0.48, z + 1.27, 5.9, 0.22, 1.44, 0xb69266);
    for (const legX of [-2.35, 0, 2.35]) {
      for (const legZ of [0.73, 1.5]) add(frame, x + legX, 0.3, z + legZ, 0.19, 0.28, 0.19, 0x79583e);
    }
    add(frame, x, 1.08, z + 1.97, 5.9, 0.94, 0.2, 0xb99569);
    for (const side of [-1, 1]) {
      add(frame, x + side * 2.82, 0.84, z + 1.25, 0.2, 0.16, 1.45, 0xbc986d);
      add(frame, x + side * 2.82, 0.65, z + 0.7, 0.16, 0.4, 0.16, 0xae885d);
      add(fabric, x + side * 2.73, 0.95, z + 1.32, 0.25, 0.47, 1.24, 0xf2eee3);
    }
    [-1.65, 0, 1.65].forEach((offset, index) => {
      add(fabric, x + offset, 0.72, z + 1.24, 1.63, 0.28, 1.34, 0xfffcf3);
      add(fabric, x + offset, 1.15, z + 1.78, 1.62, 0.77, 0.29, 0xf5f0e4, 0, -0.12);
      add(fabric, x + offset, 0.97, z + 1.49, 1.35, 0.29, 0.2, index === 1 ? accent : 0xeee4d3, 0, -0.15);
    });
    // Small loose cushions and a folded throw give each shared shelter its own character.
    add(fabric, x - 2.17, 1.09, z + 1.4, 0.67, 0.58, 0.26, accent, -0.2, -0.15);
    add(fabric, x + 2.17, 1.08, z + 1.38, 0.64, 0.55, 0.26, 0xd4bd9e, 0.2, -0.16);
    add(woven, x + 2.05, 0.87, z + 0.98, 0.78, 0.025, 0.9, accent);
    add(woven, x + 2.05, 0.67, z + 0.54, 0.78, 0.4, 0.025, accent);

    // Rattan-sided occasional tables stay beside the aisle, leaving every seat a clear approach.
    for (const side of [-1, 1]) {
      const tableX = x + side * 3.22;
      add(frame, tableX, 0.67, z - 0.53, 0.86, 0.095, 1.1, 0xc9ab7e);
      for (const cornerX of [-0.34, 0.34]) {
        for (const cornerZ of [-0.44, 0.44]) add(frame, tableX + cornerX, 0.42, z - 0.53 + cornerZ, 0.065, 0.44, 0.065, 0xb99b6d);
      }
      for (let rail = 0; rail < 7; rail++) {
        const railZ = z - 0.98 + rail * 0.15;
        for (const edge of [-1, 1]) add(frame, tableX + edge * 0.35, 0.43, railZ, 0.028, 0.4, 0.028, 0xc8aa7d);
      }
      for (const railY of [0.28, 0.36, 0.44, 0.52]) {
        for (const edge of [-1, 1]) add(frame, tableX + edge * 0.36, railY, z - 0.53, 0.03, 0.026, 0.92, 0xc8aa7d);
      }
      // A brass tray and a folded linen towel make these read as serviced cabanas.
      add(metal, tableX, 0.73, z - 0.64, 0.56, 0.025, 0.42, brass);
      add(fabric, tableX, 0.765, z - 0.3, 0.54, 0.085, 0.24, 0xfffcf5);
      add(glass, tableX, 0.82, z - 0.68, 0.1, 0.15, 0.1, 0xffe5ad);

      // Tied linen curtains frame the view while the broad ocean side remains open.
      const curtainX = x + side * (width / 2 - 0.56);
      add(metal, curtainX, 3.32, front + 0.08, 0.68, 0.035, 0.035, brass);
      for (let fold = 0; fold < 5; fold++) {
        add(woven, curtainX + (fold - 2) * 0.105, 1.85, front + 0.09 + (fold % 2) * 0.035,
          0.13, 2.78, 0.055, 0xfffcf3);
      }
      add(metal, curtainX, 1.48, front + 0.04, 0.53, 0.075, 0.07, brass);
    }

    // Woven rugs are flush with the deck and leave the threshold clear.
    add(woven, x, floorY + 0.012, z - 0.72, 5.5, 0.02, 2.25, 0xe7dfce);
    for (const stripe of [-0.95, -0.88, 0.88, 0.95]) {
      add(woven, x, floorY + 0.025, z - 0.72 + stripe, 5.3, 0.006, 0.025, accent);
    }
    for (const side of [-1, 1]) {
      for (let fringe = 0; fringe < 23; fringe++) {
        add(woven, x - 2.64 + fringe * 0.24, floorY + 0.014, z - 0.72 + side * 1.18, 0.025, 0.02, 0.14, 0xf0e7d4);
      }
    }

    // Lanterns hang at the edges of the opening, above eye level and out of the walking path.
    for (const side of [-1, 1]) {
      const lanternX = x + side * 3.05;
      const lanternZ = front + 0.28;
      add(metal, lanternX, 3.13, lanternZ, 0.025, 0.43, 0.025, brass);
      add(metal, lanternX, 2.88, lanternZ, 0.35, 0.045, 0.35, brass);
      add(metal, lanternX, 2.39, lanternZ, 0.35, 0.045, 0.35, brass);
      add(glass, lanternX, 2.64, lanternZ, 0.25, 0.43, 0.25, 0xffe5ad);
      for (const cornerX of [-0.11, 0.11]) {
        for (const cornerZ of [-0.11, 0.11]) add(metal, lanternX + cornerX, 2.64, lanternZ + cornerZ, 0.017, 0.49, 0.017, brass);
      }
    }
    const warmLight = new THREE.PointLight(0xffdfb6, 9, 11, 2);
    warmLight.name = `shelter-light-${shelter.id}`;
    warmLight.position.set(x, 2.7, z - 0.3);
    scene.add(warmLight);
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const timberBox = new RoundedBoxGeometry(1, 1, 1, 1, 0.012);
  const cushionBox = new RoundedBoxGeometry(1, 1, 1, 3, 0.15);
  const woodMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: shelterTexture("wood", true),
    normalMap: shelterTexture("wood-normal"),
    roughnessMap: shelterTexture("wood-roughness"),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.76,
    clearcoat: 0.18,
    clearcoatRoughness: 0.5,
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
