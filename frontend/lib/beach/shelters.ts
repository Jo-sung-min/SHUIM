import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createShelterDuvetGeometry, createShelterPillowGeometry, createShelterTextileMaterial } from "./shelter-textiles";

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
  yaw: number;
}

export interface ShelterCollider { minX: number; maxX: number; minZ: number; maxZ: number }
export interface BedSlot { slot: number; spotId: string; x: number; z: number; yaw: number; avatarY: number; incline: number }
export interface BedState { spotId: string; shelterName: string; near: boolean; lying: boolean; occupied: number; capacity: number }
export const BED_CAPACITY = 3;
export const BED_AVATAR_Y = 0.82;
export const BED_FEET_OFFSET_Z = 1.5;
const BED_FURNITURE_OFFSET_Z = 1.6;
const LOUNGE_OFFSET_Z = -1.8;
const FRONT_DOOR_HALF_WIDTH = 1.6;
// A tall gable: the eaves stay where they were and the ridge climbs, so the room gains height, not footprint.
const ROOF_RUN_OVERHANG = 0.6, RIDGE_Y = 7.2, ROOF_RISE = 3.5;
const GLAZING_EDGE = 5.3, GLAZING_PLINTH = 0.46, DOOR_HEAD = 2.9, GLAZING_GAP = 0.12;
const BRONZE = 0x2b2622;
const NIGHT_TIMBER_GLOW = 0.3;

/** Sea-facing doors and windows lead through a lounge into the deeper sleeping area. */
export const SHELTERS: readonly Shelter[] = [
  { id: "pine", name: "솔바람 오두막", x: -13, z: 24.8, width: 10.8, depth: 11.4, floorY: 0.18 },
  { id: "wave", name: "파도소리 오두막", x: 0, z: 26.8, width: 10.8, depth: 11.4, floorY: 0.18 },
  { id: "sunset", name: "노을 오두막", x: 13, z: 24.8, width: 10.8, depth: 11.4, floorY: 0.18 },
];

export const SHELTER_SEATS: readonly ShelterSeat[] = SHELTERS.flatMap((shelter) =>
  [-1, 1].flatMap((side, sideIndex) => [-2.55, -1.25].map((offset, index) => ({
    id: `${shelter.id}-${sideIndex * 2 + index + 1}`,
    shelterId: shelter.id,
    name: shelter.name,
    x: shelter.x + side * 3.9,
    z: shelter.z + LOUNGE_OFFSET_Z + offset,
    yaw: side * Math.PI / 2,
  }))),
);

export function bedSlot(spotId: string, slot: number): BedSlot | null {
  const shelter = SHELTERS.find((s) => `hut-${s.id}` === spotId);
  if (!shelter || !Number.isInteger(slot) || slot < 0 || slot >= BED_CAPACITY) return null;
  return { spotId, slot, x: shelter.x + (slot - 1) * 1.9, z: shelter.z + BED_FEET_OFFSET_Z, yaw: Math.PI, avatarY: BED_AVATAR_Y, incline: 0.25 };
}

export function claimedBedSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }): BedSlot | null {
  return state.pose === "lying" && typeof state.spotId === "string" && typeof state.slot === "number" ? bedSlot(state.spotId, state.slot) : null;
}

export const SHELTER_COLLIDERS: readonly ShelterCollider[] = SHELTERS.flatMap((shelter) => {
  const { x, z, width, depth } = shelter;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const bedZ = z + BED_FURNITURE_OFFSET_Z, loungeZ = z + LOUNGE_OFFSET_Z;
  return [
    { minX: x - halfWidth, maxX: x - halfWidth + 0.2, minZ: z - halfDepth, maxZ: z + halfDepth },
    { minX: x + halfWidth - 0.2, maxX: x + halfWidth, minZ: z - halfDepth, maxZ: z + halfDepth },
    { minX: x - halfWidth, maxX: x + halfWidth, minZ: z + halfDepth - 0.2, maxZ: z + halfDepth },
    // Windows admit the ocean view, while their solid lower walls still stop walking.
    ...[-1, 1].map((side) => ({
      minX: x + (side < 0 ? -halfWidth : FRONT_DOOR_HALF_WIDTH),
      maxX: x + (side < 0 ? -FRONT_DOOR_HALF_WIDTH : halfWidth),
      minZ: z - halfDepth, maxZ: z - halfDepth + 0.2,
    })),
    // Both entrance leaves stay fully open outward, clear of the central walking route.
    ...[-1, 1].map((side) => ({
      minX: x + side * 1.76 - 0.08, maxX: x + side * 1.76 + 0.08,
      minZ: z - halfDepth - 1.4, maxZ: z - halfDepth + 0.1,
    })),
    ...[-1, 1].map((side) => ({
      minX: x + side * (halfWidth - 0.1) - 0.17,
      maxX: x + side * (halfWidth - 0.1) + 0.17,
      minZ: z - halfDepth - 0.07,
      maxZ: z - halfDepth + 0.27,
    })),
    { minX: x - 2.9, maxX: x + 2.9, minZ: bedZ - 0.4, maxZ: bedZ + 2.14 },
    ...[-1, 1].map((side) => ({
      minX: x + side * 4.05 - 0.75,
      maxX: x + side * 4.05 + 0.75,
      minZ: loungeZ - 3.25,
      maxZ: loungeZ - 0.55,
    })),
    { minX: x - 1.2, maxX: x + 1.2, minZ: loungeZ - 2.65, maxZ: loungeZ - 1.65 },
    // The hearth on one side and the console on the other stand against the walls, just behind the sofas.
    ...[-1, 1].map((side) => ({
      minX: x + side * 4.79 - 0.42,
      maxX: x + side * 4.79 + 0.42,
      minZ: z - 2.3,
      maxZ: z - 0.4,
    })),
    ...[-1, 1].map((side) => ({
      minX: x + side * 3.6 - 0.43,
      maxX: x + side * 3.6 + 0.43,
      minZ: bedZ + 0.85,
      maxZ: bedZ + 1.75,
    })),
    ...[-1, 1].map((side) => ({
      minX: x + side * 4.5 - 0.4,
      maxX: x + side * 4.5 + 0.4,
      minZ: bedZ + 2.4,
      maxZ: bedZ + 3.2,
    })),
  ];
});

type Part = {
  x: number; y: number; z: number;
  width: number; height: number; depth: number;
  color: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
};

function shelterTexture(file: string, color = false): THREE.Texture | null {
  // Navigation tests run without a DOM; texture decoding only belongs to the browser.
  if (typeof document === "undefined") return null;
  const aliases: Record<string, string> = {
    wood: "shelter-wood-v2.webp", "wood-normal": "shelter-wood-normal-v2.webp", "wood-roughness": "shelter-wood-roughness-v2.webp",
    fabric: "white-cotton-v1.webp", "fabric-normal": "fabric-normal-v2.webp", "fabric-roughness": "fabric-roughness-v2.webp",
  };
  const asset = aliases[file] ?? `${file}.jpg`;
  const texture = assetLoader(new THREE.TextureLoader()).load(assetUrl(`/beach/real/${asset}`));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

/** Give every board real-world grain scale even though its geometry is instanced. */
function shelterSurface(material: THREE.MeshStandardMaterial, tileSize: number, interiorGlow?: { value: number }): void {
  const centers = SHELTERS.map((shelter) => `vec2(${shelter.x.toFixed(2)}, ${shelter.z.toFixed(2)})`).join(", ");
  const roofRun = (SHELTERS[0].width / 2 + ROOF_RUN_OVERHANG).toFixed(3);
  material.onBeforeCompile = (shader) => {
    if (interiorGlow) {
      shader.uniforms.uShelterGlow = interiorGlow;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `
        #include <common>
        varying vec3 vShelterWorld;
      `).replace("#include <project_vertex>", `
        #include <project_vertex>
        vec4 shelterWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          shelterWorld = instanceMatrix * shelterWorld;
        #endif
        vShelterWorld = (modelMatrix * shelterWorld).xyz;
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
        #include <common>
        uniform float uShelterGlow;
        varying vec3 vShelterWorld;
      `).replace("#include <emissivemap_fragment>", `
        #include <emissivemap_fragment>
        const vec2 shelterCenters[${SHELTERS.length}] = vec2[${SHELTERS.length}](${centers});
        for (int i = 0; i < ${SHELTERS.length}; i++) {
          vec2 away = abs(vShelterWorld.xz - shelterCenters[i]);
          // Only faces inside the walls and under the roof: the outside of the house stays in the dark.
          if (away.x < 5.3 && away.y < 5.6 && vShelterWorld.y < ${RIDGE_Y.toFixed(3)} - ${ROOF_RISE.toFixed(3)} * away.x / ${roofRun}) {
            totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.58) * uShelterGlow;
            break;
          }
        }
      `);
    }
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
  material.customProgramCacheKey = () => `shelter-surface-${tileSize}-${interiorGlow ? "glow" : "plain"}`;
}

/** Furniture, textiles and the open roof share instance batches across all three pavilions. */
export function buildShelters(scene: THREE.Scene): void {
  const floor: Part[] = [], walls: Part[] = [], frame: Part[] = [], roof: Part[] = [];
  const fabric: Part[] = [], woven: Part[] = [], metal: Part[] = [], glass: Part[] = [];
  const duvets: Part[] = [], pillows: Part[] = [];
  const curtains: Part[] = [], leaves: Part[] = [], pots: Part[] = [], lanterns: Part[] = [];
  const warmLights: THREE.PointLight[] = [];
  const panes: Part[] = [], doorGlass: Part[] = [], stones: Part[] = [], flues: Part[] = [], flames: Part[] = [], hearthGlows: Part[] = [];
  const add = (parts: Part[], x: number, y: number, z: number, width: number, height: number, depth: number, color: number, rotationZ = 0, rotationX = 0, rotationY = 0) => {
    parts.push({ x, y, z, width, height, depth, color, rotationZ, rotationX, rotationY });
  };
  const wallPanel = (x: number, bottom: number, z: number, width: number, height: number, depth: number, palette: readonly number[]) => {
    const rows = Math.ceil(height / 0.18), rowHeight = height / rows;
    for (let row = 0; row < rows; row++) add(walls, x, bottom + (row + 0.5) * rowHeight, z,
      width, rowHeight - 0.004, depth, palette[row % palette.length]);
  };

  const lantern = (x: number, bottom: number, z: number, radius: number, height: number) => {
    add(lanterns, x, bottom + height * 0.5, z, radius * 1.35, height * 0.75, radius * 1.35, 0xffdf9b);
    for (let ring = 0; ring < 5; ring++) {
      const t = (ring + 0.5) / 5;
      const ribRadius = radius * (0.68 + Math.sin(t * Math.PI) * 0.32);
      for (let rib = 0; rib < 12; rib++) {
        const angle = rib * Math.PI / 6;
        add(frame, x + Math.cos(angle) * ribRadius, bottom + height * t, z + Math.sin(angle) * ribRadius,
          0.022, height / 5 + 0.014, 0.022, 0xe5c08b);
      }
    }
    add(metal, x, bottom + 0.025, z, radius * 1.65, 0.05, radius * 1.65, 0xc0995c);
    add(metal, x, bottom + height - 0.025, z, radius * 1.4, 0.05, radius * 1.4, 0xc0995c);
  };

  SHELTERS.forEach((shelter, shelterIndex) => {
    const { x, z, width, depth, floorY } = shelter;
    const bedZ = z + BED_FURNITURE_OFFSET_Z, loungeZ = z + LOUNGE_OFFSET_Z;
    const left = x - width / 2 + 0.1, right = x + width / 2 - 0.1;
    const front = z - depth / 2 + 0.1, back = z + depth / 2 - 0.1;
    const timber = [0xc8a47b, 0xd4b58a, 0xc4a17a, 0xd0af85];
    const cedar = [0xa8835a, 0xb59569, 0xaf8a5f, 0xb18e64];
    const accent = [0x9da58d, 0x98a9ab, 0xc5a38b][shelterIndex];
    const brass = 0xc4a46c;

    // Broad, continuous floorboards carry the eye from the beach into the lounge.
    const plankCount = 41, plankWidth = width / plankCount;
    for (let i = 0; i < plankCount; i++) {
      add(floor, x - width / 2 + plankWidth * (i + 0.5), floorY - 0.06, z,
        plankWidth - 0.008, 0.12, depth, timber[i % timber.length]);
    }
    add(frame, x, 0.075, front - 0.1, width, 0.15, 0.2, 0x98704d);
    add(floor, x, 0.045, front - 0.36, width - 0.4, 0.09, 0.54, 0xd1b18b);
    // Recessed strips add a warm edge without adding any extra real-time lights.
    add(glass, x, floorY - 0.055, front - 0.205, width - 0.45, 0.018, 0.018, 0xffdc9d);
    add(glass, x, floorY + 0.05, back - 0.112, width - 0.55, 0.018, 0.018, 0xffdc9d);

    const wallHeight = 3.42, sillY = 1.08, windowTop = 2.95;
    const roofRun = width / 2 + ROOF_RUN_OVERHANG, ridgeY = RIDGE_Y, roofRise = ROOF_RISE;
    const glassTop = (dx: number) => ridgeY - roofRise * Math.abs(dx) / roofRun - GLAZING_GAP;
    wallPanel(x, floorY, back, width - 0.16, wallHeight, 0.2, timber);
    for (const side of [-1, 1]) {
      const sideX = side < 0 ? left : right;
      const windowZ = loungeZ - 1.85, windowDepth = 2.4;
      const sideFront = z - depth / 2, sideBack = z + depth / 2;
      const nearLength = windowZ - windowDepth / 2 - sideFront;
      const farLength = sideBack - (windowZ + windowDepth / 2);
      wallPanel(sideX, floorY, sideFront + nearLength / 2, 0.2, wallHeight, nearLength, timber);
      wallPanel(sideX, floorY, sideBack - farLength / 2, 0.2, wallHeight, farLength, timber);
      wallPanel(sideX, floorY, windowZ, 0.2, sillY - floorY, windowDepth, timber);
      wallPanel(sideX, windowTop, windowZ, 0.2, floorY + wallHeight - windowTop, windowDepth, timber);
      // The taller roof meets the wall higher up; this course closes the strip of sky under the eaves.
      wallPanel(sideX, floorY + wallHeight, z, 0.2, 0.5, depth - 0.16, timber);
      for (const edgeZ of [windowZ - windowDepth / 2, windowZ + windowDepth / 2]) add(frame, sideX, (sillY + windowTop) / 2, edgeZ, 0.27, windowTop - sillY + 0.12, 0.1, 0xc8a371);
      for (const edgeY of [sillY, windowTop]) add(frame, sideX, edgeY, windowZ, 0.3, 0.1, windowDepth + 0.12, 0xc8a371);
      add(frame, sideX, (sillY + windowTop) / 2, windowZ, 0.25, windowTop - sillY, 0.055, 0xc8a371);

      // Full-height glass on slim bronze rises from a low plinth to the peak, so the sea fills the room.
      wallPanel(x + side * 3.5, floorY, front, 3.8, GLAZING_PLINTH - floorY, 0.2, timber);
      for (const dx of [1.66, 3.5, GLAZING_EDGE]) add(metal, x + side * dx, (GLAZING_PLINTH + glassTop(dx)) / 2, front - 0.02, 0.07, glassTop(dx) - GLAZING_PLINTH, 0.14, BRONZE);
      add(metal, x + side * (1.66 + GLAZING_EDGE) / 2, GLAZING_PLINTH, front - 0.02, GLAZING_EDGE - 1.66, 0.07, 0.14, BRONZE);
      // Fully open glazed leaves project outward; neither cuts across the lounge or bed view.
      const leafX = x + side * 1.76, leafZ = front - 0.75;
      add(doorGlass, leafX, 1.54, leafZ, 0.025, 2.56, 1.38, 0xffffff);
      for (const barZ of [-0.72, 0.72]) add(metal, leafX, 1.54, leafZ + barZ, 0.1, 2.66, 0.07, BRONZE);
      for (const barY of [0.24, 2.84]) add(metal, leafX, barY, leafZ, 0.1, 0.07, 1.5, BRONZE);
      add(metal, x + side * 1.65, 1.42, front - 0.32, 0.04, 0.22, 0.04, brass);
    }
    add(panes, x, 0, front - 0.02, 1, 1, 1, 0xffffff);
    add(metal, x, (DOOR_HEAD + glassTop(0)) / 2, front - 0.02, 0.07, glassTop(0) - DOOR_HEAD, 0.14, BRONZE);
    for (const y of [DOOR_HEAD + 0.03, 4.9]) {
      const reach = Math.min(GLAZING_EDGE, (ridgeY - GLAZING_GAP - y) * roofRun / roofRise);
      add(metal, x, y, front - 0.02, reach * 2, 0.07, 0.14, BRONZE);
    }
    const glassRake = Math.atan2(glassTop(0) - glassTop(GLAZING_EDGE), GLAZING_EDGE);
    for (const side of [-1, 1]) add(metal, x + side * GLAZING_EDGE / 2, (glassTop(0) + glassTop(GLAZING_EDGE)) / 2, front - 0.02,
      Math.hypot(GLAZING_EDGE, glassTop(0) - glassTop(GLAZING_EDGE)), 0.08, 0.14, BRONZE, -side * glassRake);
    for (const columnX of [left, right]) {
      for (const columnZ of [front, back]) {
        add(frame, columnX, floorY + wallHeight / 2, columnZ, 0.34, wallHeight, 0.34, 0x9b734c);
        add(frame, columnX, floorY + 0.12, columnZ, 0.42, 0.24, 0.42, 0x856344);
      }
      add(frame, columnX, 3.6, z, 0.3, 0.27, depth + 0.65, 0x91663f);
    }
    add(frame, x, 3.6, back, width, 0.29, 0.3, 0x91663f);
    add(frame, x, 2.01, back - 0.1, 0.22, 3.6, 0.22, 0xa27a52);

    // A tall open gable, with a visible underside and repeated exposed rafters.
    const roofAngle = Math.atan2(roofRise, roofRun), roofLength = Math.hypot(roofRun, roofRise);
    const roofDepth = depth + 1.0, roofBoards = 27;
    for (const side of [-1, 1]) {
      for (let board = 0; board < roofBoards; board++) {
        const boardZ = z - roofDepth / 2 + (board + 0.5) * roofDepth / roofBoards;
        add(roof, x + side * roofRun / 2, ridgeY - roofRise / 2, boardZ,
          roofLength, 0.13, roofDepth / roofBoards + 0.008, cedar[(board + shelterIndex) % cedar.length], -side * roofAngle);
      }
      for (let rafter = 0; rafter < 11; rafter++) {
        const rafterZ = z - roofDepth / 2 + rafter * roofDepth / 10;
        add(frame, x + side * roofRun / 2, ridgeY - roofRise / 2 - 0.17, rafterZ,
          roofLength + 0.05, 0.19, 0.13, 0xa47a50, -side * roofAngle);
      }
      // Longitudinal purlins sit against the roof rather than forming a low flat ceiling.
      for (const fraction of [0.3, 0.65]) {
        add(frame, x + side * roofRun * fraction, ridgeY - roofRise * fraction - 0.22, z,
          0.15, 0.16, roofDepth, 0xb28b5c);
      }
      // Small warm spots follow the slope of the ceiling, like stars inside the roof.
      for (const fraction of [0.44, 0.8]) for (let spot = 0; spot < 7; spot++) {
        add(lanterns, x + side * roofRun * fraction, ridgeY - roofRise * fraction - 0.29, z - depth / 2 + 0.9 + spot * (depth - 1.8) / 6,
          0.075, 0.025, 0.075, 0xffe7bf, -side * roofAngle);
      }
    }
    add(frame, x, ridgeY - 0.14, z, 0.24, 0.28, roofDepth + 0.12, 0x875c3c);
    add(roof, x, ridgeY + 0.06, z, 0.28, 0.12, roofDepth + 0.12, 0x805438);
    // Two open trusses give the height something to measure itself against.
    for (const trussZ of [z - 2.9, z + 0.9]) {
      const tieY = 4.15, peak = ridgeY - 0.25;
      add(frame, x, tieY, trussZ, width - 0.3, 0.24, 0.2, 0x8a5f3c);
      add(frame, x, (tieY + peak) / 2, trussZ, 0.18, peak - tieY, 0.18, 0x8a5f3c);
      for (const side of [-1, 1]) {
        const footX = 2.5, headY = peak - 0.85, run = Math.hypot(footX, headY - tieY);
        add(frame, x + side * footX / 2, (tieY + headY) / 2, trussZ, run, 0.15, 0.15, 0x8a5f3c, -side * Math.atan2(headY - tieY, footX));
      }
    }
    const gableRows = Math.ceil((ridgeY - 3.68) / 0.16);
    for (let row = 0; row < gableRows; row++) {
      const y = 3.68 + row * 0.16;
      const gableWidth = Math.min(width - 0.16, 2 * (ridgeY - y - 0.1) / Math.tan(roofAngle));
      add(walls, x, y, back, Math.max(0.12, gableWidth), 0.16, 0.2, timber[(row + 1) % timber.length]);
    }

    // One broad frame and upholstered headboard unite three independently claimable places.
    add(frame, x, 0.45, bedZ + 0.84, 5.8, 0.2, 2.48, 0xad8155);
    add(frame, x, 1.03, bedZ + 2.06, 5.8, 1.28, 0.16, 0xa78054);
    add(fabric, x, 1.12, bedZ + 1.96, 5.58, 0.95, 0.16, 0xe9dfcb);
    for (const legX of [-2.55, 0, 2.55]) for (const end of [-0.25, 1.87]) {
      add(frame, x + legX, 0.3, bedZ + end, 0.18, 0.28, 0.18, 0x8d633f);
    }
    [-1.9, 0, 1.9].forEach((offset, index) => {
      const bx = x + offset;
      add(fabric, bx, 0.66, bedZ + 0.82, 1.87, 0.25, 2.4, 0xfffcf3);
      // These heights are shared with the lying character: quilt top 1.07, lip 1.105.
      add(pillows, bx, 0.975, bedZ + 1.42, 1.08, 0.18, 0.54, index === 1 ? 0xebe2d7 : 0xf0eee2, index === 1 ? 0.015 : -0.015, -0.12);
      add(duvets, bx, 0.97, bedZ + 0.32, 1.88, 0.2, 1.44, 0xfff9ed);
      add(fabric, bx, 1.085, bedZ + 0.95, 1.85, 0.04, 0.16, 0xf9f3e8);
      add(woven, bx, 0.73, bedZ - 0.397, 1.88, 0.42, 0.03, 0xf5eddf);
    });
    for (const side of [-1, 1]) add(fabric, x + side * 2.82, 0.79, bedZ + 0.32, 0.08, 0.37, 1.4, 0xf5eddf);

    // A restrained timber panel grounds the bed on the back wall.
    add(frame, x, 2.45, back - 0.15, 3.9, 0.88, 0.09, 0x9e7545);
    add(woven, x, 2.45, back - 0.21, 3.66, 0.66, 0.025, 0xd2b786);
    for (let slat = 0; slat < 19; slat++) {
      add(frame, x - 1.71 + slat * 0.19, 2.45, back - 0.24, 0.028, 0.65, 0.025, 0xb89662);
    }

    // Two inward-facing sofas leave two generous approach aisles around the low central table.
    for (const side of [-1, 1]) {
      const sofaX = x + side * 4.05;
      add(fabric, sofaX, 0.36, loungeZ - 1.9, 1.5, 0.36, 2.7, 0xdccfb8);
      add(fabric, x + side * 4.66, 0.84, loungeZ - 1.9, 0.26, 0.72, 2.7, 0xe3d7c2);
      for (const end of [-3.16, -0.64]) add(fabric, sofaX, 0.72, loungeZ + end, 1.5, 0.44, 0.24, 0xe3d7c2);
      for (const seatZ of [-2.55, -1.25]) {
        add(fabric, x + side * 3.98, 0.605, loungeZ + seatZ, 1.23, 0.19, 1.22, 0xfff8eb);
        add(fabric, x + side * 4.42, 1.0, loungeZ + seatZ, 0.28, 0.66, 1.18, 0xf3e9d8, side * 0.13);
      }
      const throwPillows: readonly [number, number][] = [[-3.0, 0xb8734a], [-2.46, 0xe2d3b8], [-1.88, 0xc9a25a], [-1.3, accent], [-0.8, 0x8a8a63]];
      throwPillows.forEach(([pillowZ, tone], index) => add(fabric, x + side * (4.22 - index % 2 * 0.08), 0.96, loungeZ + pillowZ, 0.36, 0.5, 0.5, tone, side * 0.12, (index - 2) * 0.05));
      // A wool throw falls over the arm of each sofa.
      add(fabric, x + side * 4.0, 0.975, loungeZ - 0.64, 0.8, 0.06, 0.3, 0xc99a7c);

      const tableX = x + side * 3.6;
      add(frame, tableX, 0.71, bedZ + 1.3, 0.86, 0.09, 0.9, 0xba9769);
      for (const dx of [-0.34, 0.34]) for (const dz of [-0.36, 0.36]) {
        add(frame, tableX + dx, 0.45, bedZ + 1.3 + dz, 0.07, 0.48, 0.07, 0xa48154);
      }
      add(woven, tableX, 0.4, bedZ + 1.3, 0.7, 0.07, 0.75, 0xcfb88f);
      lantern(tableX, 0.755, bedZ + 1.3, 0.19, 0.47);

      // Soft tied curtains have actual folds and a curved silhouette.
      const curtainX = x + side * 4.87;
      add(metal, curtainX, 3.48, front + 0.06, 0.9, 0.035, 0.035, brass);
      add(curtains, curtainX, 1.88, front + 0.08, 0.8, 3.12, 0.62, 0xfffcf2);
      add(woven, curtainX, 1.49, front + 0.06, 0.4, 0.075, 0.15, 0xcdbb92);
      lantern(x + side * 4.96, floorY, front + 0.68, 0.25, 0.68);
      // Broad leaves, a few stems and a ceramic pot; all three huts reuse the same geometry.
      const plantX = x + side * 4.5, plantZ = bedZ + 2.8;
      add(pots, plantX, floorY + 0.34, plantZ, 0.78, 0.68, 0.78, 0xb5a58b);
      for (let leaf = 0; leaf < 8; leaf++) {
        const angle = leaf * 2.399 + side * 0.4;
        const leafHeight = 1.22 + (leaf % 3) * 0.25;
        add(leaves, plantX, floorY + 0.59, plantZ, 0.5 + (leaf % 2) * 0.18, leafHeight, 1.35,
          [0x3d6935, 0x527b39, 0x688a42][leaf % 3], 0.1 * Math.cos(angle), 0.12 + (leaf % 4) * 0.12, angle);
        add(frame, plantX + Math.sin(angle) * 0.07, floorY + 0.85, plantZ + Math.cos(angle) * 0.07,
          0.024, 0.74, 0.024, 0x68804c, 0.12 * Math.cos(angle), 0.12 * Math.sin(angle));
      }
    }

    // Low profile keeps the sea visible from the bed; the table has a clear route on both sides.
    add(frame, x, 0.64, loungeZ - 2.15, 2.4, 0.16, 1.0, 0x8f5f36);
    for (const dx of [-0.85, 0.85]) add(frame, x + dx, 0.39, loungeZ - 2.15, 0.2, 0.36, 0.78, 0x7a4f2d);
    add(fabric, x - 0.42, 0.75, loungeZ - 2.2, 0.5, 0.05, 0.36, 0xb8734a);
    add(fabric, x - 0.4, 0.8, loungeZ - 2.18, 0.42, 0.045, 0.3, 0xe2d3b8);
    add(metal, x + 0.52, 0.735, loungeZ - 2.15, 0.52, 0.025, 0.34, brass);
    add(glass, x + 0.52, 0.81, loungeZ - 2.15, 0.085, 0.14, 0.085, 0xffdfae);
    add(woven, x, floorY + 0.024, loungeZ - 2.0, 6.35, 0.045, 3.15, 0xd9c7a8);
    for (const stripe of [-1.41, -1.34, 1.34, 1.41]) {
      add(woven, x, floorY + 0.05, loungeZ - 2 + stripe, 6.16, 0.005, 0.025, accent);
    }
    for (const side of [-1, 1]) for (let fringe = 0; fringe < 31; fringe++) {
      add(woven, x - 3 + fringe * 0.2, floorY + 0.012, loungeZ - 2 + side * 1.62, 0.022, 0.018, 0.14, 0xeee3ca);
    }
    // A soft runner links the front lounge to the recessed sleeping area without blocking it.
    add(woven, x, floorY + 0.012, z - 0.35, 2.6, 0.02, 3.45, 0xe8dabe);
    for (const edge of [-1, 1]) add(woven, x + edge * 1.18, floorY + 0.025, z - 0.35, 0.025, 0.005, 3.25, accent);

    // Three pendants hang at staggered heights, so the eye travels up into the roof.
    for (const [dx, dz, bottom, radius] of [[-0.85, -0.1, 3.05, 0.2], [0, 0.18, 2.55, 0.24], [0.85, -0.12, 3.35, 0.18]] as const) {
      const pendantX = x + dx, pendantZ = loungeZ - 2.15 + dz, height = radius * 2.75, top = ridgeY - roofRise * Math.abs(dx) / roofRun - 0.3;
      add(metal, pendantX, (bottom + height + top) / 2, pendantZ, 0.018, top - bottom - height, 0.018, brass);
      lantern(pendantX, bottom, pendantZ, radius, height);
    }

    // The warm heart of the room: a stacked stone chimney breast and a black stove, on the right as you walk in.
    const hearthSide = -1, hearthZ = z - 1.35, stoneTones = [0x8f8577, 0xa1968a, 0x7d7468, 0x968b7c, 0x887e70];
    const hearthAt = (offset: number) => x + hearthSide * offset;
    const stoneLengths = [0.38, 0.54, 0.46, 0.34, 0.6, 0.42];
    let courseY = floorY + 0.02;
    for (let row = 0; courseY < 4.05; row++) {
      const courseHeight = [0.155, 0.19, 0.125][row % 3];
      let cursor = hearthZ - 0.95 - (row * 0.17) % 0.4;
      for (let block = row; cursor < hearthZ + 0.95; block++) {
        const length = stoneLengths[block % stoneLengths.length], fromZ = Math.max(cursor, hearthZ - 0.95), toZ = Math.min(cursor + length, hearthZ + 0.95);
        cursor += length;
        if (toZ - fromZ < 0.08) continue;
        add(stones, hearthAt(5.08 - block % 3 * 0.012), courseY + courseHeight / 2, (fromZ + toZ) / 2, 0.2, courseHeight - 0.012, toZ - fromZ - 0.012, stoneTones[(row * 3 + block * 7) % stoneTones.length]);
      }
      courseY += courseHeight;
    }
    add(stones, hearthAt(4.72), floorY + 0.07, hearthZ, 0.9, 0.14, 1.88, 0x6e665b);
    const stoveZ = hearthZ - 0.35, stoveFront = 4.72 - 0.31;
    add(metal, hearthAt(4.72), floorY + 0.64, stoveZ, 0.62, 1, 1.05, 0x1f1c1a);
    add(flames, hearthAt(stoveFront - 0.006), floorY + 0.62, stoveZ, 0.84, 0.62, 1, 0xffffff, 0, 0, Math.PI / 2);
    for (const edge of [-1, 1]) add(metal, hearthAt(stoveFront - 0.012), floorY + 0.62, stoveZ + edge * 0.45, 0.03, 0.72, 0.07, 0x34302c);
    for (const edgeY of [0.27, 0.97]) add(metal, hearthAt(stoveFront - 0.012), floorY + edgeY, stoveZ, 0.03, 0.07, 0.97, 0x34302c);
    const flueTop = ridgeY - roofRise * 4.72 / roofRun - 0.1, flueBottom = floorY + 1.14;
    add(flues, hearthAt(4.72), (flueBottom + flueTop) / 2, stoveZ, 0.26, flueTop - flueBottom, 0.26, 0x1b1917);
    // Split logs, stacked beside the stove.
    for (let logRow = 0; logRow < 3; logRow++) for (let log = 0; log < 3; log++) {
      add(floor, hearthAt(4.75), floorY + 0.22 + logRow * 0.145, hearthZ + 0.46 + log * 0.165 + (logRow % 2) * 0.03, 0.74, 0.135, 0.145, [0x6b4a2d, 0x7c5935, 0x5d3f27][(logRow + log) % 3]);
    }
    add(hearthGlows, hearthAt(3.5), floorY + 0.056, stoveZ, 2.7, 2.5, 1, 0xffffff, 0, -Math.PI / 2);
    add(hearthGlows, hearthAt(4.95), floorY + 1.55, stoveZ, 2.2, 2.2, 1, 0xffffff, 0, 0, Math.PI / 2);

    // Across the room, a low console keeps the two walls in balance.
    const consoleAt = (offset: number) => x - hearthSide * offset, consoleZ = hearthZ;
    add(frame, consoleAt(4.8), floorY + 0.34, consoleZ, 0.76, 0.56, 1.86, 0x8f5f36);
    add(frame, consoleAt(4.8), floorY + 0.66, consoleZ, 0.84, 0.08, 1.92, 0xa06d40);
    for (const dz of [-0.62, 0, 0.62]) add(woven, consoleAt(4.41), floorY + 0.34, consoleZ + dz, 0.02, 0.44, 0.54, 0xcfb88f);
    [0xb8734a, 0xe2d3b8, 0x8a8a63, 0xc9a25a].forEach((tone, book) => add(fabric, consoleAt(4.8), floorY + 0.72 + book * 0.05, consoleZ + 0.45, 0.42 - book * 0.03, 0.05, 0.3, tone));
    lantern(consoleAt(4.8), floorY + 0.7, consoleZ - 0.45, 0.17, 0.44);
    add(frame, consoleAt(5.15), 2.15, consoleZ, 0.05, 1.25, 1.6, 0x7e5434);
    add(woven, consoleAt(5.12), 2.15, consoleZ, 0.02, 1.05, 1.4, accent);

    // Cove.applyDaylight owns this one warm light per shelter, including the quiet 20:00 state.
    const warmLight = new THREE.PointLight(0xffd3a0, 9, 11, 2);
    warmLight.name = "shelter-light-" + shelter.id;
    warmLight.position.set(x, 3.3, z - 0.4);
    warmLights.push(warmLight);
    scene.add(warmLight);
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const timberBox = new RoundedBoxGeometry(1, 1, 1, 1, 0.012);
  const cushionBox = new RoundedBoxGeometry(1, 1, 1, 2, 0.15);
  const duvet = createShelterDuvetGeometry(), pillow = createShelterPillowGeometry();
  const curtain = new THREE.PlaneGeometry(1, 1, 16, 18);
  const curtainPositions = curtain.getAttribute("position");
  for (let i = 0; i < curtainPositions.count; i++) {
    const cx = curtainPositions.getX(i), cy = curtainPositions.getY(i), t = cy + 0.5;
    const gathered = 1 - 0.58 * Math.exp(-Math.pow((t - 0.375) / 0.17, 2));
    curtainPositions.setXYZ(i, cx * gathered, cy, Math.sin(cx * Math.PI * 10) * 0.09 * gathered + 0.13 * (1 - t) * (1 - t));
  }
  curtain.computeVertexNormals();
  const leaf = new THREE.PlaneGeometry(1, 1, 2, 10);
  const leafPositions = leaf.getAttribute("position");
  for (let i = 0; i < leafPositions.count; i++) {
    const lx = leafPositions.getX(i), t = leafPositions.getY(i) + 0.5;
    leafPositions.setXYZ(i, lx * Math.sin(Math.PI * t), t, 0.6 * t * t + Math.abs(lx) * 0.15 * Math.sin(Math.PI * t));
  }
  leaf.computeVertexNormals();
  const pot = new THREE.CylinderGeometry(0.5, 0.39, 1, 12);
  const lanternCore = new THREE.SphereGeometry(0.5, 10, 8);
  // One outline for the whole glass gable, with the doorway left open. Every hut has the same proportions.
  const { width: houseWidth } = SHELTERS[0];
  const glazingRun = houseWidth / 2 + ROOF_RUN_OVERHANG;
  const glazingTop = (dx: number) => RIDGE_Y - ROOF_RISE * Math.abs(dx) / glazingRun - GLAZING_GAP;
  const pane = new THREE.ShapeGeometry(new THREE.Shape([
    [-GLAZING_EDGE, GLAZING_PLINTH], [-1.66, GLAZING_PLINTH], [-1.66, DOOR_HEAD], [1.66, DOOR_HEAD], [1.66, GLAZING_PLINTH], [GLAZING_EDGE, GLAZING_PLINTH],
    [GLAZING_EDGE, glazingTop(GLAZING_EDGE)], [0, glazingTop(0)], [-GLAZING_EDGE, glazingTop(GLAZING_EDGE)],
  ].map(([px, py]) => new THREE.Vector2(px, py))));
  const flue = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  const flatPlane = new THREE.PlaneGeometry(1, 1);
  const woodMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffd8ac, map: shelterTexture("wood", true),
    normalMap: shelterTexture("wood-normal"), roughnessMap: shelterTexture("wood-roughness"),
    normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.65,
    clearcoat: 0.12, clearcoatRoughness: 0.5, metalness: 0,
  });
  const fabricMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: shelterTexture("fabric", true),
    normalMap: shelterTexture("fabric-normal"), roughnessMap: shelterTexture("fabric-roughness"),
    normalScale: new THREE.Vector2(0.2, 0.2), roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  // The wood photo is dark and red: values above 1 lift it to honey-coloured pine.
  woodMaterial.color.setRGB(1.55, 1.26, 0.88);
  const interiorGlow = { value: 0 };
  shelterSurface(woodMaterial, 1.8, interiorGlow);
  shelterSurface(fabricMaterial, 0.24);
  const textileMaterial = createShelterTextileMaterial(fabricMaterial.map);
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.65 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 });
  const glowMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffedcf, roughness: 0.6, metalness: 0,
    emissive: 0xffba62, emissiveIntensity: 1.7,
    transparent: true, opacity: 0.83, depthWrite: false,
  });
  const glassPaneMaterial = new THREE.MeshPhysicalMaterial({ color: 0xcfe3e6, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const hearthClock = { value: 0 };
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: hearthClock },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * 2.6, vUv.y);
        float turbulence = noise(vec2(p.x * 3.0, p.y * 2.4 - uTime * 1.5)) * 0.6 + noise(vec2(p.x * 7.0, p.y * 5.0 - uTime * 2.6)) * 0.4;
        float body = smoothstep(0.92, 0.1, p.y + abs(p.x) * 0.55 + (turbulence - 0.45) * 0.75);
        vec3 heat = mix(vec3(0.95, 0.24, 0.04), vec3(1.0, 0.78, 0.32), smoothstep(0.25, 0.85, body));
        vec3 embers = vec3(0.26, 0.05, 0.015) * (1.0 - vUv.y);
        gl_FragColor = vec4(embers + heat * body * 1.15, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const hearthGlowMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: hearthClock },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv;
      void main() {
        float fall = pow(max(0.0, 1.0 - length(vUv - 0.5) * 2.0), 2.0);
        float breath = 0.82 + 0.1 * sin(uTime * 7.1) + 0.08 * sin(uTime * 13.7 + 1.3);
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.18) * fall * breath * 0.34, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const matrix = new THREE.Object3D(), color = new THREE.Color(), white = new THREE.Color(0xffffff);
  const batches: [string, Part[], THREE.Material, THREE.BufferGeometry][] = [
    // Wall joints sit behind the posts; texture relief supplies their fine grain.
    ["deck", floor, woodMaterial, timberBox], ["walls", walls, woodMaterial, box],
    // Thin rattan ribs and rafters need crisp edges, not 108-triangle beveled boxes.
    ["timber", frame, woodMaterial, box], ["roof", roof, woodMaterial, timberBox],
    ["cushions", fabric, fabricMaterial, cushionBox], ["weave", woven, fabricMaterial, box],
    ["duvets", duvets, textileMaterial, duvet], ["pillows", pillows, textileMaterial, pillow],
    ["lantern-frame", metal, metalMaterial, box], ["lantern-glow", glass, glowMaterial, box],
    ["curtains", curtains, fabricMaterial, curtain], ["leaves", leaves, leafMaterial, leaf],
    ["planters", pots, potMaterial, pot], ["rattan-glow", lanterns, glowMaterial, lanternCore],
    ["glass-gable", panes, glassPaneMaterial, pane], ["door-glass", doorGlass, glassPaneMaterial, box],
    ["hearth-stone", stones, stoneMaterial, cushionBox], ["stove-flue", flues, metalMaterial, flue],
    ["stove-flames", flames, flameMaterial, flatPlane], ["hearth-glow", hearthGlows, hearthGlowMaterial, flatPlane],
  ];
  for (const [name, parts, material, template] of batches) {
    const isTimber = material === woodMaterial, geometry = template.clone();
    const dimensions = new Float32Array(parts.length * 3), offsets = new Float32Array(parts.length * 2);
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    // Glass is named apart from the solid room: sight lines through it must not count it as a wall.
    mesh.name = (material === glassPaneMaterial ? "shelter-" : "shelters-") + name;
    mesh.castShadow = !material.transparent && name !== "weave" && material !== flameMaterial;
    mesh.receiveShadow = !material.transparent && material !== flameMaterial;
    if (material === flameMaterial) mesh.onBeforeRender = () => { hearthClock.value = performance.now() / 1000 % 3600; };
    // Cove.applyDaylight already sets the hut lamp from 1.5 by day to 9 at night; the timber follows it.
    if (name === "deck") mesh.onBeforeRender = () => { interiorGlow.value = warmLights.length ? Math.max(0, (warmLights[0].intensity - 1.5) / 7.5) * NIGHT_TIMBER_GLOW : 0; };
    parts.forEach((part, index) => {
      matrix.position.set(part.x, part.y, part.z);
      matrix.scale.set(part.width, part.height, part.depth);
      matrix.rotation.set(part.rotationX ?? 0, part.rotationY ?? 0, part.rotationZ ?? 0);
      matrix.updateMatrix();
      mesh.setMatrixAt(index, matrix.matrix);
      color.setHex(part.color);
      if (isTimber) color.lerp(white, name === "roof" ? 0.32 : 0.46);
      else if (material === fabricMaterial) color.lerp(white, name === "weave" ? 0.1 : 0.25);
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
  for (const geometry of [box, timberBox, cushionBox, duvet, pillow, curtain, leaf, pot, lanternCore, pane, flue, flatPlane]) geometry.dispose();
}
