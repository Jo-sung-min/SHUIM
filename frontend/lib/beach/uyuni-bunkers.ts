import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type CozySurfaces, bakeCozySurfaces } from "./baikal-bake";
import { type SoftBoxOptions, cushionGeometry, drapeGeometry, logGeometry, poufGeometry, softBoxGeometry } from "./baikal-cozy";
import { createBaikalFlameMaterial } from "./baikal-materials";
import { BUNKER_CEILING_Y, BUNKER_DAYBED_ANGLE, BUNKER_ENTRY, BUNKER_ENTRY_COLUMNS, BUNKER_FLOOR_Y, BUNKER_FOUNTAIN, BUNKER_GAMES_LOCAL, BUNKER_HALL, BUNKER_HEARTH_ANGLE, BUNKER_HEARTH_LOCAL, BUNKER_LADDER_LOCAL, BUNKER_LAGOON, BUNKER_PAVILION_LOCAL, BUNKER_SOFA_LOCAL, BUNKER_SPRING_LOCAL, BUNKER_TERRACE, BUNKER_TREES_LOCAL, UYUNI_BUNKERS, bunkerCeilingRise, bunkerFloorRise, hallInward, hallPoint, hallReach, stairClimb, type UyuniBunkerId } from "./uyuni-bunker-layout";
import type { BoardGame } from "./net";

export interface UyuniBunkers {
  root: THREE.Group;
  /** Builds the rooms a little at a time, spending about `budgetMs` per call. True once nothing is left to build. */
  prepare(budgetMs?: number): boolean;
  setActive(id: UyuniBunkerId | null): void;
  update(time: number): void;
  setBoardGames(games: readonly BoardGame[]): void;
  /** Shows or hides the lagoon water drawn by the hall itself. It is hidden while the sea engine draws the lagoon instead. */
  setLagoonDrawn(drawn: boolean): void;
  dispose(): void;
}
/** How thick a scatter cushion is through its middle. */
export const CUSHION_THICKNESS = .2;
/**
 * Where a scatter cushion goes so that it rests on a seat and lies flat against what is behind it, never sinking into it.
 * `foot` is where the face it leans on meets the seat, `inward` the level direction out of that face, and `lean` how far the
 * face leans back from upright. `along` slides the cushion sideways, `twist` turns it a little in its own plane, and `out`
 * stands it in front of another cushion. The cushion's width runs along local x, its thickness along y and its height along z.
 */
export function cushionPose(foot: { x: number; y: number; z: number }, inward: { x: number; z: number }, lean: number, along: number, size: number, twist = 0, out = 0): THREE.Matrix4 {
  const c = Math.cos(lean), s = Math.sin(lean), side = new THREE.Vector3(inward.z, 0, -inward.x);
  const face = new THREE.Vector3(inward.x * c, s, inward.z * c), up = new THREE.Vector3(-inward.x * s, c, -inward.z * s);
  const rise = up.clone().multiplyScalar(Math.cos(twist)).addScaledVector(side, -Math.sin(twist)), across = new THREE.Vector3().crossVectors(face, rise);
  // Turned in its own plane a square reaches lower at one corner, so it is lifted until that corner, not its middle, meets the seat.
  const reach = size / 2 * (Math.cos(twist) + Math.abs(Math.sin(twist)));
  const centre = new THREE.Vector3(foot.x, foot.y, foot.z).addScaledVector(side, along).addScaledVector(up, reach + .01).addScaledVector(face, CUSHION_THICKNESS / 2 + .005 + out);
  return new THREE.Matrix4().makeBasis(across, face, rise).setPosition(centre);
}
/** Only the lagoon bed is drawn into the picture the sea engine bends through the water. Shared with the beach, which uses the same layer for its sand. */
export const BED_LAYER = 3;
/** Where the fall over the terrace lands, the fountain in the middle of the lake: x and z in the room, and strength. */
export const LAGOON_FALLS: readonly (readonly [number, number, number])[] = [[BUNKER_LAGOON.x, BUNKER_LAGOON.z, .55]];
export interface UyuniBunkerOptions { renderer?: THREE.WebGLRenderer; mobile?: boolean; /** Fetches a photographic texture from the CDN, for those who go down. */ loadTexture?: (path: string) => THREE.Texture }

const CREAM = 0xf1e6d2, OATMEAL = 0xdccbb0, CAMEL = 0xb98a58, RUST = 0xa5502b, CHOCOLATE = 0x7a5a44, MUSTARD = 0xc9983a, FOREST = 0x56603f, WALNUT = 0xa27a5a, HONEY = 0xf2c595;
const IRON = 0x1d1815, ENAMEL = 0x9db3ad, SOIL = 0x3a2a1e;
type Tint = readonly [number, number, number];
const LAMP_TINT: Tint = [1, .69, .4], FIRE_TINT: Tint = [1, .54, .22], WATER_TINT: Tint = [.56, .8, 1], SEAT_TOP = .52;
const HALL = BUNKER_HALL, LAKE = BUNKER_LAGOON, SPRING = BUNKER_SPRING_LOCAL, UP = BUNKER_TERRACE.height;
const DAYLIT: Tint = [1, .9, .76], ROSY: Tint = [1, .76, .8];
/** The fire burns in a surround on the west wall; this is the middle of its flames. */
const HEARTH_IN = hallInward(BUNKER_HEARTH_ANGLE), HEARTH = { x: BUNKER_HEARTH_LOCAL.x + HEARTH_IN.x * .32, z: BUNKER_HEARTH_LOCAL.z + HEARTH_IN.z * .32 };
const BED_IN = hallInward(BUNKER_DAYBED_ANGLE), BED_WALL = hallPoint(1, BUNKER_DAYBED_ANGLE);
const stairLamp = (side: number) => { const at = hallPoint(.78, side * 1.45); return [at.x, 4.3, at.z] as const; };
const sconce = (angle: number) => { const at = hallPoint(.94, angle); return [at.x, 2.9, at.z] as const; };
/**
 * Every source of light in the hall: position in room coordinates, power, tint. The first is the fire and breathes.
 * They are ordered by how much of the hall they shape: a desktop shades the first few per pixel, and everything else per vertex.
 */
const ROOM_LIGHTS: readonly (readonly [number, number, number, number, Tint])[] = [
  [HEARTH.x + HEARTH_IN.x, 1.0, HEARTH.z + HEARTH_IN.z, 10, FIRE_TINT],
  [0, 11.2, HALL.cz, 170, DAYLIT],
  [LAKE.x, 8.0, LAKE.z, 34, LAMP_TINT],
  [LAKE.x, .4, LAKE.z, 8, WATER_TINT],
  [BUNKER_PAVILION_LOCAL.x, UP + 2.6, BUNKER_PAVILION_LOCAL.z, 22, LAMP_TINT],
  [0, 3.4, .25, 12, LAMP_TINT],
  [-5.3, 1.34, -3.85, 3.4, LAMP_TINT],
  [5.3, 1.34, 3.85, 3.4, LAMP_TINT],
  [SPRING.x, 1.0, SPRING.z - 1.2, 7, WATER_TINT],
  [...stairLamp(-1), 10, LAMP_TINT],
  [...stairLamp(1), 10, LAMP_TINT],
  [BED_WALL.x + BED_IN.x * .7 + BED_IN.z * 2.1, 1.0, BED_WALL.z + BED_IN.z * .7 - BED_IN.x * 2.1, 4, [1, .88, .72]],
  [0, 3.6, -7.3, 9, LAMP_TINT],
  [BUNKER_TREES_LOCAL[0].x, 1.4, BUNKER_TREES_LOCAL[0].z, 5, ROSY],
  [BUNKER_TREES_LOCAL[1].x, 1.4, BUNKER_TREES_LOCAL[1].z, 5, [.92, .96, .78]],
  [BUNKER_TREES_LOCAL[2].x, UP + 1.6, BUNKER_TREES_LOCAL[2].z, 7, ROSY],
  [BUNKER_TREES_LOCAL[3].x, UP + 1.6, BUNKER_TREES_LOCAL[3].z, 6, LAMP_TINT],
  [...sconce(-2.75), 9, LAMP_TINT],
  [...sconce(2.75), 9, LAMP_TINT],
  [0, 9.4, 22.5, 30, DAYLIT],
  [-10.5, 8.6, 6, 30, DAYLIT],
  [10.5, 8.6, 6, 30, DAYLIT],
];
const LIGHT_COUNT = ROOM_LIGHTS.length;

const ROOM_PARS = `uniform vec4 uRoomLight[${LIGHT_COUNT}];
uniform vec3 uRoomTint[${LIGHT_COUNT}];
uniform float uRoomFire;
varying vec3 vRoomLocal;
varying vec3 vRoomWorld;
varying vec3 vRoomLit;
varying vec3 vRoomFill;
varying float vRoomShell;`;
const WRAP = "(max(c, 0.0) * 0.8 + (c * 0.5 + 0.5) * 0.2)", LEAF_WRAP = "(abs(c) * 0.55 + 0.45)";
const point = (x: number, z: number) => `vec2(${x.toFixed(2)}, ${z.toFixed(2)})`;
/**
 * The room is lit by its own known sources, so it costs no shadow pass and no extra draw. Lights after the first `pixel` are summed
 * here, once per vertex, together with the bounced fill and the darkening of the room's corners. On a phone that is all of them.
 */
const roomVertex = (pixel: number, leafy: boolean) => `
#ifdef ROOM_SWAY
transformed.x += sin(uRoomSway * 1.3 + position.x * 2.1 + position.z * 1.7) * 0.03 * aSway;
transformed.z += cos(uRoomSway * 1.1 + position.z * 2.3 + position.x * 1.3) * 0.022 * aSway;
#endif
vRoomLocal = transformed;
vec3 roomNormal = objectNormal;
#ifdef USE_INSTANCING
vRoomLocal = (instanceMatrix * vec4(transformed, 1.0)).xyz;
roomNormal = mat3(instanceMatrix) * objectNormal;
#endif
roomNormal = normalize(roomNormal);
vRoomWorld = (modelMatrix * vec4(vRoomLocal, 1.0)).xyz;
vec3 roomLit = vec3(0.0);
for (int i = ${pixel}; i < ${LIGHT_COUNT}; i++) {
  vec3 l = uRoomLight[i].xyz - vRoomLocal;
  float d2 = dot(l, l) + 0.09, c = dot(roomNormal, l) * inversesqrt(d2);
  roomLit += uRoomTint[i] * (uRoomLight[i].w * (i == 0 ? uRoomFire : 1.0) / d2) * ${leafy ? LEAF_WRAP : WRAP};
}
// Light that has bounced around pale stone: soft and even, a little warmer by the fire and a breath of green by the water.
vec3 roomFill = mix(vec3(0.36, 0.3, 0.24), vec3(0.3, 0.27, 0.24), roomNormal.y * 0.5 + 0.5) * (0.9 + 0.35 * exp(-distance(vRoomLocal.xz, ${point(HEARTH.x, HEARTH.z)}) * 0.2) * uRoomFire);
roomFill += vec3(0.01, 0.035, 0.06) * exp(-distance(vRoomLocal.xz, ${point(LAKE.x, LAKE.z)}) * 0.14);
// The room is a known oval under a dome, so its edges can be darkened exactly. A surface ignores the wall or floor it lies on.
float roomRadius = length(vec2(vRoomLocal.x / ${HALL.a.toFixed(1)}, (vRoomLocal.z - ${HALL.cz.toFixed(1)}) / ${HALL.b.toFixed(1)}));
float roomSide = (1.0 - roomRadius) * 16.0 + (1.0 - abs(roomNormal.y)) * 8.0;
float roomUp = min(vRoomLocal.y, ${HALL.wall.toFixed(1)} + ${(BUNKER_CEILING_Y - BUNKER_FLOOR_Y - HALL.wall).toFixed(1)} * sqrt(max(0.0, 1.0 - roomRadius * roomRadius)) - vRoomLocal.y) + abs(roomNormal.y) * 8.0;
vRoomShell = mix(0.4, 1.0, smoothstep(0.0, 1.5, min(roomSide, roomUp)));
vRoomLit = roomLit * mix(1.0, vRoomShell, 0.45);
vRoomFill = roomFill * vRoomShell;`;
/** Scene lights are for the visitors. Only the first `pixel` room lights, and the glints of the first `gloss`, are worked out per pixel. */
const WARM_LIGHT_BEGIN = THREE.ShaderChunk.lights_fragment_begin
  .replace("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
  .replace("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
  .replace("#if ( NUM_HEMI_LIGHTS > 0 )", "#if 0")
  .replace("vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = vec3( 0.0 );");
const roomFragment = (pixel: number, gloss: number, leafy: boolean) => `
{
  vec3 sum = vec3(0.0), shine = vec3(0.0);
  ${Math.max(pixel, gloss) > 0 ? `vec3 n = normalize(transpose(mat3(viewMatrix)) * geometryNormal), v = normalize(cameraPosition - vRoomWorld);
  float alpha = max(material.roughness, 0.24); alpha *= alpha; float a2 = alpha * alpha;
  for (int i = 0; i < ${Math.max(pixel, gloss)}; i++) {
    vec3 l = uRoomLight[i].xyz - vRoomLocal;
    float d2 = dot(l, l) + 0.09, c = dot(n, l) * inversesqrt(d2);
    vec3 power = uRoomTint[i] * (uRoomLight[i].w * (i == 0 ? uRoomFire : 1.0) / d2);
    ${pixel > 0 ? `if (i < ${pixel}) sum += power * ${leafy ? LEAF_WRAP : WRAP};` : ""}
    ${gloss > 0 ? `if (i < ${gloss} && c > 0.0) {
      float nh = max(dot(n, normalize(l * inversesqrt(d2) + v)), 0.0), den = nh * nh * (a2 - 1.0) + 1.0;
      shine += power * c * a2 / (3.14159 * den * den);
    }` : ""}
  }` : ""}
  vec3 lit = sum * mix(1.0, vRoomShell, 0.45) + vRoomLit;
  reflectedLight.directDiffuse += lit * BRDF_Lambert(material.diffuseColor);
  reflectedLight.indirectDiffuse += vRoomFill * material.diffuseColor;
  reflectedLight.directSpecular += shine * material.specularColor * 0.25;
  #ifdef ROOM_FABRIC
  float rim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 2.6);
  reflectedLight.directDiffuse += material.diffuseColor * (lit * 0.07 + vRoomFill * 0.3) * rim;
  #endif
}`;
const BOARD_TOP = .74, MAX_STONES = 15 * 15 + 8 * 8;
const BOARD_LOOK = { omok: { size: 15, pitch: 1.04 / 14, radius: .033, height: .015 }, othello: { size: 8, pitch: .125, radius: .052, height: .012 } } as const;

const HALO_VERT = `
attribute vec4 aHalo;
attribute vec3 aTint;
varying vec2 vHalo;
varying vec3 vTint;
void main() {
  vHalo = position.xy * 2.0; vTint = aTint;
  vec4 centre = modelViewMatrix * vec4(aHalo.xyz, 1.0);
  centre.xy += position.xy * aHalo.w;
  gl_Position = projectionMatrix * centre;
}`;
const HALO_FRAG = `
varying vec2 vHalo;
varying vec3 vTint;
void main() {
  float glow = pow(max(1.0 - dot(vHalo, vHalo), 0.0), 2.4);
  gl_FragColor = vec4(vTint * glow, 1.0);
}`;
/**
 * Running and falling water without a texture or a second pass. `uv.x` counts metres downstream and `uv.y` runs bank to bank;
 * the colour attribute carries the speed, how much of it is falling, and foam where it lands. `aFall` is how far this sheet of
 * water has already fallen, and a seed that keeps neighbouring sheets from moving in step.
 */
const WATER_VERT = `
attribute vec3 color;
attribute vec2 aFall;
varying vec2 vFlow;
varying vec3 vKind;
varying vec2 vFall;
void main() { vFlow = uv; vKind = color; vFall = aFall; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FRAG = `
uniform float uTime;
uniform float uRoomFire;
varying vec2 vFlow;
varying vec3 vKind;
varying vec2 vFall;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float ripple(vec2 p) { return sin(p.x * 3.1 + sin(p.y * 4.7 + p.x * 0.9) * 1.3) * sin(p.y * 6.3 + sin(p.x * 2.3) * 1.7); }
void main() {
  // Level water: a clear blue run with glints from the lamps.
  float travel = uTime * vKind.r;
  vec2 p = vec2(vFlow.x - travel, vFlow.y);
  float middle = smoothstep(0.0, 0.24, vFlow.y) * smoothstep(0.0, 0.24, 1.0 - vFlow.y);
  float a = ripple(p * vec2(1.0, 2.2)), b = ripple(p * vec2(2.3, 3.7) + vec2(7.3 - travel * 0.6, 2.1));
  float glint = smoothstep(0.45, 1.0, a * 0.6 + b * 0.5 + 0.25);
  vec3 level = mix(vec3(0.52, 0.78, 0.95), vec3(0.2, 0.52, 0.86), middle);
  level += vec3(1.0, 0.86, 0.66) * glint * (0.06 + 0.14 * middle) * (0.9 + 0.1 * uRoomFire);
  // Falling water: gravity speeds it up, so the further it has fallen the faster its strands run and the longer they draw out.
  // Measured in equal steps of falling time rather than of distance, the pattern does exactly that.
  float fallen = max(vFall.x, 0.0), seed = vFall.y, drop = sqrt(fallen + 0.03) * 3.4 - uTime * 2.1;
  float across = vFlow.y * 20.0 + seed * 5.3 + sin(drop * 0.9 + seed * 3.0) * 0.35;
  float along = drop + fallen * 0.7;
  float strands = noise(vec2(across, along * 0.45)) * 0.5 + noise(vec2(across * 2.3 + 7.0, along * 1.0)) * 0.32 + noise(vec2(across * 5.1 + 3.0, along * 2.0)) * 0.18;
  strands += 0.08 * sin(across * 9.0 + noise(vec2(across * 0.5, along * 0.3)) * 5.0);
  float sheen = pow(noise(vec2(across * 0.6 + 13.0, drop * 0.3)), 4.0);
  // The sheet is whole at the lip and thins into separate strands as it falls; at the foot it is all white water.
  float breakup = smoothstep(0.15, 1.8, fallen) * 0.5;
  float body = smoothstep(breakup + 0.05, breakup + 0.22, strands);
  float lip = 1.0 - smoothstep(0.0, 0.22, fallen);
  vec3 sheet = mix(vec3(0.62, 0.82, 0.97), vec3(0.9, 0.97, 1.0), strands) + sheen * 0.45;
  sheet = mix(sheet, vec3(0.97, 0.99, 1.0), clamp(max(lip * 0.55, vKind.b * 0.9), 0.0, 1.0));
  float fray = (strands - 0.5) * 0.12;
  float rim = smoothstep(0.0, 0.12, vFlow.y + fray) * smoothstep(0.0, 0.12, 1.0 - vFlow.y + fray);
  float clear = rim * mix(0.3, 0.9, max(body, vKind.b)) * mix(1.0, 0.75, breakup);
  gl_FragColor = vec4(mix(level, sheet, vKind.g), mix(1.0, clear, vKind.g));
}`;
/**
 * Spray where falling water meets water: droplets thrown up and out that fall back in, and a faint mist that lifts and fades.
 * One draw; every drop is placed in the vertex shader from where it starts, which way it is thrown, and how hard.
 */
const SPLASH_VERT = `
attribute vec4 aDrop;
attribute vec4 aKick;
uniform float uTime;
varying float vFade;
varying vec2 vSpot;
varying float vMist;
void main() {
  float mist = step(0.85, aKick.w), n1 = fract(aDrop.w * 91.7), n2 = fract(aDrop.w * 47.3), n3 = fract(aDrop.w * 13.1);
  float life = mix(0.45 + 0.3 * n3, 1.6 + n3, mist);
  float age = fract(uTime / life + aDrop.w), t = age * life;
  vec2 out2 = aKick.xy * mix(0.4 + 1.1 * n1, 0.25 + 0.2 * n1, mist);
  float rise = mix((0.7 + 1.2 * n2) * aKick.z, 0.22 + 0.12 * n2, mist);
  vec3 centre = aDrop.xyz + vec3(out2.x * t, rise * t - mix(4.9, 0.05, mist) * t * t, out2.y * t);
  centre.y = max(centre.y, aDrop.y);
  vFade = (1.0 - age) * smoothstep(0.0, 0.1, age) * mix(1.0, 0.42, mist);
  vMist = mist;
  float size = mix((0.026 + 0.03 * n3) * (1.0 - 0.4 * age), (0.16 + 0.2 * n3) * (0.6 + 0.8 * age), mist);
  vec4 view = modelViewMatrix * vec4(centre, 1.0);
  view.xy += position.xy * size;
  vSpot = position.xy * 2.0;
  gl_Position = projectionMatrix * view;
}`;
const SPLASH_FRAG = `
varying float vFade;
varying vec2 vSpot;
varying float vMist;
void main() {
  float d = dot(vSpot, vSpot);
  if (d > 1.0) discard;
  float edge = mix(1.0 - d * d, pow(1.0 - d, 2.0), vMist);
  gl_FragColor = vec4(mix(vec3(0.93, 0.98, 1.0), vec3(0.88, 0.95, 1.0), vMist), edge * vFade * 0.9);
}`;

/** A static contact shade gives furniture weight without any shadow map or additional light. */
function contactTexture(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4, distance = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1);
    data[index] = 26; data[index + 1] = 15; data[index + 2] = 8;
    data[index + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 1.3) * 190);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-contact-shade"; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true; return texture;
}

/** Slow, low-contrast wool mottling: enough to read as a thick rug, too gentle to shimmer at a distance. */
function rugTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4), turn = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, index = (y * size + x) * 4;
    const wool = Math.sin(u * turn * 3 + Math.sin(v * turn * 2) * 2) * Math.sin(v * turn * 4 + Math.sin(u * turn) * 2) * 6 + Math.sin((u + v) * turn * 11 + Math.sin(u * turn * 5)) * 2.5;
    data[index] = 238 + wool; data[index + 1] = 226 + wool; data[index + 2] = 205 + wool; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-rug-weave"; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

/** Smooth lime plaster with the faintest clouding. */
function plasterTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4), turn = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, index = (y * size + x) * 4;
    const value = 236 + Math.sin(u * turn * 2 + Math.sin(v * turn * 3) * 1.6) * Math.sin(v * turn * 3 + Math.sin(u * turn * 2) * 1.4) * 5 + Math.sin((u * 5 + v * 3) * turn + Math.sin(u * turn * 7)) * 2;
    data[index] = value; data[index + 1] = value * .975; data[index + 2] = value * .935; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-lime-plaster"; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

/** Polished white marble: soft clouding crossed by a few wandering veins, warm where they run thickest. It tiles without a seam. */
function marbleTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4), turn = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, index = (y * size + x) * 4;
    const warp = Math.sin(u * turn * 2 + Math.sin(v * turn * 3) * 1.4) * .5 + Math.sin(v * turn * 5 + u * turn * 3) * .22 + Math.sin((u - v) * turn * 9 + Math.sin(u * turn * 4) * 2) * .08;
    const cloud = Math.sin(u * turn + warp * 2.2) * Math.sin(v * turn * 2 + warp * 1.7) * 6 + Math.sin((u + v) * turn * 3 + warp * 3) * 3;
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v) * turn * .5 + warp * 2.6)), 14) * 44 + Math.pow(1 - Math.abs(Math.sin((u - v * 2) * turn * .5 + warp * 3.4 + 1.7)), 22) * 28;
    const value = Math.min(255, 243 + cloud - vein);
    data[index] = value; data[index + 1] = Math.max(0, value - vein * .05 - 2); data[index + 2] = Math.max(0, value - vein * .16 - 8); data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-white-marble"; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

/**
 * Four kinds of greenery drawn once on the GPU, in the quarters of one texture: broad glossy leaves, fern fronds, trailing ivy
 * and a cluster of five-petalled flowers. Each is drawn in grey and white with its veins and shading, and takes its colour from the card it is on.
 */
const FOLIAGE_FRAG = `
varying vec2 vUv;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float blade(float y, float w) { return w * pow(max(sin(3.14159 * clamp(y, 0.0, 1.0)), 0.0), 0.7) * (1.0 - 0.3 * y); }
vec2 frame(vec2 d, float a, float len) { return vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)) / len; }
vec4 broad(vec2 p, float seed) {
  vec4 o = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float n = seed + float(i) * 7.31, a = (hash(n) - 0.5) * 2.6, len = 0.26 + hash(n + 1.0) * 0.18;
    vec2 q = frame(p - vec2((hash(n + 2.0) - 0.5) * 0.24, -0.44 + hash(n + 3.0) * 0.1), a, len);
    q.x -= q.y * q.y * (hash(n + 4.0) - 0.5) * 0.5;
    float y = q.y, hw = blade(y, 0.3 + hash(n + 5.0) * 0.1);
    if (y <= 0.0 || y >= 1.0 || abs(q.x) >= hw) continue;
    float edge = (hw - abs(q.x)) / max(hw, 0.001), rib = 1.0 - smoothstep(0.0, 0.03, abs(q.x));
    float f = fract(y * 8.0 - abs(q.x) * 5.0), vein = 1.0 - smoothstep(0.0, 0.1, min(f, 1.0 - f));
    float light = 0.6 + 0.18 * y + 0.14 * smoothstep(0.0, 0.5, edge) * step(0.0, q.x) - 0.14 * (1.0 - smoothstep(0.0, 0.22, edge));
    vec3 hue = mix(vec3(0.9, 1.0, 0.78), vec3(0.78, 1.0, 0.88), hash(n + 6.0));
    o = vec4(vec3(light) * hue + vec3(0.12, 0.12, 0.04) * (rib * 0.8 + vein * 0.3), 1.0);
  }
  return o;
}
vec4 fern(vec2 p, float seed) {
  vec4 o = vec4(0.0);
  for (int j = 0; j < 7; j++) {
    float n = seed + float(j) * 3.7, len = 0.42 + hash(n + 1.0) * 0.12, bend = (hash(n + 2.0) - 0.5) * 0.9;
    vec2 q = frame(p - vec2(0.0, -0.46), (hash(n) - 0.5) * 2.4, len);
    float y = q.y;
    if (y <= 0.0 || y >= 1.0) continue;
    float x = abs(q.x - bend * y * y), reach = 0.17 * (1.0 - y) * (0.4 + 0.6 * sin(3.14159 * min(1.0, y * 1.2)));
    if (x < 0.012 * (1.0 - y) + 0.003) { o = vec4(0.58, 0.62, 0.44, 1.0); continue; }
    if (x > reach) continue;
    float f = fract((y - x * 0.7) / 0.055), width = 0.38 * (1.0 - x / reach);
    if (abs(f - 0.5) < width) o = vec4(vec3(0.62 + 0.24 * (1.0 - x / reach) + 0.1 * y - 0.16 * abs(f - 0.5) / max(width, 0.001)) * vec3(0.92, 1.0, 0.82), 1.0);
  }
  return o;
}
vec4 ivy(vec2 p, float seed) {
  vec4 o = vec4(0.0);
  for (int j = 0; j < 4; j++) {
    float n = seed + float(j) * 5.1, sx = (hash(n) - 0.5) * 0.56, sway = (hash(n + 1.0) - 0.5) * 0.3;
    for (int i = 0; i < 8; i++) {
      float m = n + float(i) * 1.7, t = float(i) / 7.0;
      vec2 c = vec2(sx + sin(t * 3.0 + n) * sway, 0.44 - t * 0.86), c2 = vec2(sx + sin((t + 0.14) * 3.0 + n) * sway, 0.44 - (t + 0.14) * 0.86);
      vec2 s = c2 - c, w = p - c;
      float along = clamp(dot(w, s) / dot(s, s), 0.0, 1.0);
      if (i < 7 && length(w - s * along) < 0.006) o = vec4(0.5, 0.52, 0.38, 1.0);
      float side = hash(m + 3.0) > 0.5 ? 1.0 : -1.0;
      vec2 q = frame(w, side * (0.9 + hash(m) * 0.7) + 3.14159, 0.11 + hash(m + 1.0) * 0.05);
      q.y = -q.y;
      float hw = blade(q.y, 0.5) * (1.0 + 0.4 * (1.0 - q.y));
      if (q.y > 0.0 && q.y < 1.0 && abs(q.x) < hw) {
        float edge = (hw - abs(q.x)) / max(hw, 0.001), rib = 1.0 - smoothstep(0.0, 0.05, abs(q.x));
        o = vec4(vec3(0.6 + 0.2 * smoothstep(0.0, 0.6, edge) + 0.08 * q.y) * mix(vec3(0.88, 1.0, 0.8), vec3(0.95, 1.0, 0.86), hash(m + 2.0)) + 0.1 * rib, 1.0);
      }
    }
  }
  return o;
}
vec4 blossom(vec2 p, float seed) {
  vec4 o = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    float n = seed + float(i) * 2.9, r = sqrt(hash(n)) * 0.34, a = hash(n + 1.0) * 6.2832, size = 0.07 + hash(n + 2.0) * 0.045;
    vec2 d = frame(p - vec2(cos(a), sin(a)) * r, hash(n + 3.0) * 6.2832, 1.0);
    d.y /= 0.7 + 0.3 * hash(n + 4.0);
    float rr = length(d) / size, th = atan(d.y, d.x), petal = 0.62 + 0.38 * pow(abs(cos(th * 2.5)), 0.6);
    if (rr >= petal) continue;
    vec3 col = vec3(0.8 + 0.2 * rr - 0.14 * smoothstep(0.85, 1.0, rr / petal));
    col *= mix(vec3(0.86, 0.78, 0.84), vec3(1.0), smoothstep(0.1, 0.45, rr));
    col *= 1.0 - 0.07 * (1.0 - smoothstep(0.0, 0.1, abs(sin(th * 2.5))));
    if (rr < 0.17) col = vec3(1.0, 0.86, 0.46);
    o = vec4(col, 1.0);
  }
  return o;
}
void main() {
  vec2 cell = floor(vUv * 2.0), p = fract(vUv * 2.0) - 0.5;
  float seed = cell.x * 7.0 + cell.y * 13.0 + 1.0;
  vec4 o = cell.y < 0.5 ? (cell.x < 0.5 ? broad(p, seed) : fern(p, seed)) : (cell.x < 0.5 ? ivy(p, seed) : blossom(p, seed));
  if (max(abs(p.x), abs(p.y)) > 0.485) o = vec4(0.0);
  gl_FragColor = o;
}`;
/** Leaves, fronds and trailing stems use the first three quarters; flowers the fourth. */
const LEAF_CELLS = 3, FLOWER_CELL = 3;
/**
 * Still water for a phone or a device without float render targets: clear over the pale bed, deeper blue-green towards the middle,
 * stirred by a draught and by rings from the fountain, with the warm hall and the bright dome caught in it at a glancing angle.
 */
const LAKE_VERT = `
attribute vec3 color;
varying vec3 vWorld;
varying vec2 vSpot;
varying float vDepth;
void main() {
  vSpot = position.xz; vDepth = color.r;
  vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const LAKE_FRAG = `
uniform float uTime;
uniform float uRoomFire;
varying vec3 vWorld;
varying vec2 vSpot;
varying float vDepth;
void main() {
  vec2 p = vSpot, from = p - ${`vec2(${BUNKER_LAGOON.x.toFixed(2)}, ${BUNKER_LAGOON.z.toFixed(2)})`};
  vec2 g = vec2(cos(p.x * 2.1 + uTime * 0.8 + sin(p.y * 1.3)), cos(p.y * 2.7 - uTime * 0.6 + sin(p.x * 1.1))) * 0.5
    + vec2(cos((p.x + p.y) * 4.3 - uTime * 1.4), cos((p.x - p.y) * 3.9 + uTime * 1.2)) * 0.22;
  float ring = length(from);
  g += from / max(ring, 0.001) * cos(ring * 8.0 - uTime * 2.6) * 0.7 * exp(-ring * 0.55);
  vec3 n = normalize(vec3(-g.x * 0.05, 1.0, -g.y * 0.05)), v = normalize(cameraPosition - vWorld);
  float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 hall = mix(vec3(0.6, 0.48, 0.36), vec3(1.0, 0.95, 0.84), smoothstep(-0.1, 0.8, r.y)) * (0.92 + 0.08 * uRoomFire);
  float glint = pow(max(dot(r, normalize(vec3(0.0, 1.0, 0.15))), 0.0), 240.0) * 1.5;
  vec3 body = mix(vec3(0.64, 0.86, 0.98), vec3(0.06, 0.32, 0.62), smoothstep(0.0, 1.0, vDepth));
  gl_FragColor = vec4(mix(body, hall, fresnel) + vec3(1.0, 0.93, 0.8) * glint, clamp(mix(0.22, 0.7, smoothstep(0.0, 1.0, vDepth)) + fresnel * 0.6, 0.0, 0.94));
}`;
const MARBLE_FRAG = `
varying vec2 vUv;
void main() {
  float turn = 6.28318; vec2 q = vUv;
  float warp = sin(q.x * turn * 2.0 + sin(q.y * turn * 3.0) * 1.4) * 0.5 + sin(q.y * turn * 5.0 + q.x * turn * 3.0) * 0.22 + sin((q.x - q.y) * turn * 9.0 + sin(q.x * turn * 4.0) * 2.0) * 0.08 + sin((q.x * 2.0 + q.y * 3.0) * turn * 6.0 + sin(q.y * turn * 9.0) * 1.5) * 0.03;
  float cloud = sin(q.x * turn + warp * 2.2) * sin(q.y * turn * 2.0 + warp * 1.7) * 0.024 + sin((q.x + q.y) * turn * 3.0 + warp * 3.0) * 0.012;
  float vein = pow(1.0 - abs(sin((q.x * 2.0 + q.y) * turn * 0.5 + warp * 2.6)), 16.0) * 0.17 + pow(1.0 - abs(sin((q.x - q.y * 2.0) * turn * 0.5 + warp * 3.4 + 1.7)), 26.0) * 0.11 + pow(1.0 - abs(sin((q.x * 3.0 - q.y) * turn * 0.5 + warp * 4.1 + 0.6)), 40.0) * 0.07;
  gl_FragColor = vec4(vec3(0.955) + cloud - vein * vec3(1.0, 1.06, 1.22), 1.0);
}`;
/** Draws a texture once on the GPU: sharp at any size, and done in a millisecond where the same sums in JavaScript take hundreds. */
function bakeDrawn(renderer: THREE.WebGLRenderer, size: number, fragmentShader: string, name: string, repeat: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  target.texture.name = `uyuni-bunker-${name}`;
  if (repeat) { target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping; target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
  const material = new THREE.ShaderMaterial({ vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const scene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), previous = renderer.getRenderTarget(), ground = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  quad.frustumCulled = false; scene.add(quad);
  renderer.setRenderTarget(target); renderer.setClearColor(0xffffff, 0); renderer.clear(); renderer.render(scene, new THREE.Camera());
  renderer.setRenderTarget(previous); renderer.setClearColor(ground, alpha); quad.geometry.dispose(); material.dispose();
  return target;
}
/** Petals let go by the trees, carried round the hall on a slow draught. One draw; every petal is placed in the vertex shader. */
const PETAL_VERT = `
attribute vec4 aPetal;
uniform float uTime;
varying float vShade;
void main() {
  float fall = fract(aPetal.y - uTime * (0.012 + aPetal.w * 0.012));
  float spin = uTime * (0.8 + aPetal.w * 1.6) + aPetal.y * 50.0;
  vec3 centre = vec3(aPetal.x + sin(uTime * 0.31 + aPetal.y * 40.0) * 1.3 + fall * 2.0, fall * 10.5 + 0.2, aPetal.z + cos(uTime * 0.27 + aPetal.y * 31.0) * 1.0);
  vec3 turned = vec3(position.x * cos(spin), position.y * cos(spin * 0.7) + position.x * sin(spin) * 0.3, position.x * sin(spin) + position.y * sin(spin * 0.7));
  vShade = 0.8 + 0.2 * sin(spin);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + turned, 1.0);
}`;
const PETAL_FRAG = `
varying float vShade;
void main() { gl_FragColor = vec4(vec3(1.0, 0.8, 0.86) * vShade, 1.0); }`;

/** One cupped leaf, a metre long, growing up from its stalk. Lighter along the midrib and towards the tip. */
function leafGeometry(rows: number): THREE.BufferGeometry {
  const points: number[] = [], uv: number[] = [], shade: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) for (let side = -1; side <= 1; side++) {
    const t = row / rows, width = Math.pow(Math.sin(t * Math.PI), .85) * .25, tone = .72 + .28 * t - Math.abs(side) * .1;
    points.push(side * width, t, Math.sin(t * Math.PI) * .17 - Math.abs(side) * .06);
    uv.push((side + 1) * .5, t); shade.push(tone, tone, tone * .9);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < 2; column++) {
    const a = row * 3 + column; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(shade, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/**
 * Two sealed shelters under the hotels share all geometry and materials, and only the visited one renders.
 * Nothing but the two deck hatches is built until a visitor walks up to one: the room is then put together a few
 * milliseconds at a time, so neither arriving in Uyuni nor going down the ladder has to wait for it.
 */
export function buildUyuniBunkers(parent: THREE.Object3D, textures: { wood: THREE.Texture; cotton: THREE.Texture }, options: UyuniBunkerOptions = {}): UyuniBunkers {
  const root = new THREE.Group(); root.name = "uyuni-bunkers"; parent.add(root);
  const rooms = new Map<UyuniBunkerId, THREE.Group>();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), ownTextures = new Set<THREE.Texture>();
  const mobile = options.mobile === true, pick = <T,>(desktop: T, phone: T): T => mobile ? phone : desktop;
  const uRoomLight = { value: ROOM_LIGHTS.map(([x, y, z, power]) => new THREE.Vector4(x, y, z, power)) };
  const uRoomTint = { value: ROOM_LIGHTS.map(light => new THREE.Vector3(...light[4])) };
  const uRoomFire = { value: 1 }, flameTime = { value: 0 };
  // A phone sums every light per vertex and keeps only two glints per pixel; a desktop shades the six that shape the room per pixel.
  const PIXEL_LIGHTS = pick(6, 0), GLOSS_LIGHTS = pick(4, 2);
  // Light through moving water, drawn on whatever lies below the lake's surface.
  const CAUSTIC = `
  {
    float under = smoothstep(${LAKE.level.toFixed(2)}, ${(LAKE.level - .15).toFixed(2)}, vRoomLocal.y);
    vec2 c = vRoomLocal.xz * 2.4;
    float w = sin(c.x + uRoomSway * 1.3 + sin(c.y * 1.7 + uRoomSway)) + sin(c.y * 1.3 - uRoomSway * 1.1 + sin(c.x * 1.9 - uRoomSway * 0.7));
    reflectedLight.directDiffuse += material.diffuseColor * vec3(0.86, 0.95, 1.0) * pow(1.0 - abs(w) * 0.5, 6.0) * under * 0.55;
  }`;
  const indoor = (name: string, parameters: THREE.MeshStandardMaterialParameters, flags: { fabric?: boolean; cavity?: number; leafy?: boolean; gloss?: boolean; caustic?: boolean } = {}) => {
    const material = new THREE.MeshStandardMaterial({ roughness: .86, ...parameters, fog: false });
    material.name = `uyuni-bunker-${name}`; materials.add(material);
    const gloss = flags.gloss ? GLOSS_LIGHTS : 0, leafy = flags.leafy === true, caustic = flags.caustic === true;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { uRoomLight, uRoomTint, uRoomFire, uRoomSway: flameTime });
      shader.vertexShader = (leafy ? "#define ROOM_SWAY\n" : "") + shader.vertexShader
        .replace("#include <common>", `#include <common>\n${ROOM_PARS}${leafy ? "\nuniform float uRoomSway;\nattribute float aSway;" : ""}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${roomVertex(PIXEL_LIGHTS, leafy)}`);
      let fragment = (flags.fabric ? "#define ROOM_FABRIC\n" : "") + shader.fragmentShader;
      fragment = fragment.replace("#include <common>", `#include <common>\n${ROOM_PARS}${caustic ? "\nuniform float uRoomSway;" : ""}`)
        .replace("#include <lights_fragment_begin>", WARM_LIGHT_BEGIN)
        .replace("#include <aomap_fragment>", `${roomFragment(PIXEL_LIGHTS, gloss, leafy)}${caustic ? CAUSTIC : ""}\n#include <aomap_fragment>`);
      if (flags.cavity !== undefined) fragment = fragment.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\ndiffuseColor.rgb *= mix(${flags.cavity.toFixed(2)}, 1.0, texture2D(normalMap, vNormalMapUv).a);\n#endif`);
      shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => `uyuni-bunker-room-${PIXEL_LIGHTS}-${gloss}-${flags.fabric ? 1 : 0}-${leafy ? 1 : 0}-${flags.cavity ?? "n"}-${caustic ? 1 : 0}`;
    return material;
  };

  // The deck hatches are all that exists above ground.
  const hatchWood = new RoundedBoxGeometry(1.3, .016, 1.4, 2, .007);
  const hatchFrame = new RoundedBoxGeometry(1.36, .006, 1.46, 1, .002);
  const handle = new THREE.TorusGeometry(.09, .014, 5, 16); handle.rotateX(-Math.PI / 2);
  geometries.add(hatchWood); geometries.add(hatchFrame); geometries.add(handle);
  const hatchOak = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xc5a77f, roughness: .88 }), hatchWalnut = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x705542, roughness: .88 }), hatchBrass = new THREE.MeshStandardMaterial({ color: 0xb69b65, metalness: .65, roughness: .48 });
  hatchOak.name = "uyuni-bunker-hatch-oak"; hatchWalnut.name = "uyuni-bunker-hatch-walnut"; hatchBrass.name = "uyuni-bunker-hatch-brass";
  materials.add(hatchOak); materials.add(hatchWalnut); materials.add(hatchBrass);
  const hatches: THREE.Group[] = [];
  for (const bunker of UYUNI_BUNKERS) {
    const entry = new THREE.Group(); entry.name = `uyuni-bunker-hatch-${bunker.id}`; hatches.push(entry); entry.position.set(bunker.entry.x, bunker.entry.y, bunker.entry.z); root.add(entry);
    for (const [name, geometry, material, y] of [
      ["frame", hatchFrame, hatchWalnut, .004], ["wood", hatchWood, hatchOak, .009], ["handle", handle, hatchBrass, .033],
    ] as const) {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `uyuni-bunker-hatch-${name}-${bunker.id}`; mesh.position.y = y; mesh.layers.enable(2); entry.add(mesh);
    }
    const room = new THREE.Group(); room.name = `uyuni-bunker-room-${bunker.id}`; room.position.set(bunker.x, bunker.floorY, bunker.z); room.visible = false;
    root.add(room); rooms.set(bunker.id, room);
  }

  const instanced: THREE.InstancedMesh[] = [], roomStones = new Map<UyuniBunkerId, THREE.InstancedMesh>(), lagoons = new Map<UyuniBunkerId, THREE.Mesh>();
  let sprays: THREE.WebGLRenderTarget | null = null, marble: THREE.WebGLRenderTarget | null = null, rockPhoto: THREE.Texture | null = null;
  const placement = new THREE.Object3D(), blackStone = new THREE.Color(0x15130f), whiteStone = new THREE.Color(0xf3eddf);
  let lagoonDrawn = true, disposed = false, built = false, baked: CozySurfaces | null = null, activeRoom: UyuniBunkerId | null = null, shownBoards = "";
  let steps: (() => void)[] | null = null, bakeSurfaces: (() => void) | null = null, awaitRock: (() => void) | null = null, awaitWillow: (() => void) | null = null, willowPhoto: THREE.Texture | null = null;

  /** Everything below runs only once somebody is on their way down. Each returned step is small enough to fit between two frames. */
  const plan = (): (() => void)[] => {
    const shadowTexture = contactTexture(); ownTextures.add(shadowTexture);
    const concrete = indoor("cream-plaster", { vertexColors: true, roughness: .94 });
    const floor = indoor("white-marble", { vertexColors: true, roughness: .2 }, { gloss: true });
    const oak = indoor("warm-oak", { map: textures.wood, vertexColors: true, roughness: .5 }, { gloss: true });
    const boucle = indoor("boucle", { map: textures.cotton, vertexColors: true, roughness: 1 }, { fabric: true, cavity: .64 });
    const knit = indoor("knit-throws", { map: textures.cotton, vertexColors: true, roughness: 1, side: THREE.DoubleSide }, { fabric: true, cavity: .5 });
    const rug = indoor("wool-rug", { vertexColors: true, roughness: 1 }, { fabric: true, cavity: .76 });
    const stone = indoor("cliff-rock", { vertexColors: true, roughness: .92 }); stone.color.setRGB(1.25, 1.18, 1.08);
    const basin = indoor("lagoon-bed", { vertexColors: true, roughness: .9 }, { caustic: true });
    const canopy = indoor("leaf-sprays", { vertexColors: true, roughness: .8, side: THREE.DoubleSide, alphaTest: .5 }, { leafy: true });
    // Trailing greenery from a photograph of a real willow; it stays hidden until the photograph has arrived.
    const willow = indoor("trailing-willow", { vertexColors: true, roughness: .82, side: THREE.DoubleSide, alphaTest: .5 }, { leafy: true });
    willow.color.setRGB(.86, 1, .8); willow.visible = false;
    const painted = indoor("painted-goods", { vertexColors: true, roughness: .7 }, { gloss: true });
    const foliage = indoor("garden-leaves", { vertexColors: true, roughness: .78, side: THREE.DoubleSide }, { leafy: true });
    const brass = indoor("brushed-brass", { color: 0xc79a55, metalness: .4, roughness: .38 }, { gloss: true });
    const stoneMaterial = indoor("board-stones", { roughness: .26 }, { gloss: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    glow.name = "uyuni-bunker-lamp-glow"; materials.add(glow);
    const shadow = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .62, depthWrite: false, toneMapped: false, fog: false });
    shadow.name = "uyuni-bunker-contact-shadows"; materials.add(shadow);
    const water = new THREE.ShaderMaterial({ uniforms: { uTime: flameTime, uRoomFire }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, toneMapped: false, fog: false });
    water.name = "uyuni-bunker-spring-water"; materials.add(water);
    const lake = new THREE.ShaderMaterial({ uniforms: { uTime: flameTime, uRoomFire }, vertexShader: LAKE_VERT, fragmentShader: LAKE_FRAG, transparent: true, toneMapped: false, fog: false });
    lake.name = "uyuni-bunker-lake-water"; materials.add(lake);

    const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, pick(14, 8), pick(10, 6));
    const smallSphere = new THREE.SphereGeometry(1, 8, 6), bulb = new THREE.OctahedronGeometry(1, 0), smallCylinder = new THREE.CylinderGeometry(1, 1, 1, 10), tin = new THREE.CylinderGeometry(1, 1, 1, pick(8, 6));
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, pick(18, 10)), pipe = new THREE.CylinderGeometry(1, 1, 1, pick(8, 6), pick(24, 16)), drum = new THREE.CylinderGeometry(1, 1, 1, pick(16, 10), 4);
    const plane = new THREE.PlaneGeometry(1, 1), leaf = leafGeometry(pick(6, 4)), blossom = new THREE.SphereGeometry(1, 6, 4);
    const pot = new THREE.LatheGeometry([[0, 0], [.43, 0], [.56, .1], [.62, .58], [.58, .75], [.52, .77], [.5, .65]].map(([x, y]) => new THREE.Vector2(x, y)), pick(22, 12));
    const vase = new THREE.LatheGeometry([[0, 0], [.14, 0], [.23, .16], [.19, .34], [.08, .46], [.07, .5], [.055, .5], [.055, .44]].map(([x, y]) => new THREE.Vector2(x, y)), pick(18, 10));
    const cup = new THREE.LatheGeometry([[0, 0], [.06, 0], [.085, .10], [.08, .13], [.066, .13], [.06, .03], [0, .03]].map(([x, y]) => new THREE.Vector2(x, y)), pick(14, 8));
    const shade = new THREE.LatheGeometry([[.74, -.3], [.58, .3], [.56, .3], [.72, -.3]].map(([x, y]) => new THREE.Vector2(x, y)), pick(30, 14));
    shade.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: shade.getAttribute("position").count }, (_, i) => {
      const edge = Math.abs(shade.getAttribute("position").getY(i)) / .3, value = .72 + .28 * edge * edge; return [value, value * (.92 + .08 * edge), value * (.84 + .16 * edge)];
    }).flat(), 3));
    const lampBase = new THREE.LatheGeometry([[0, 0], [.2, 0], [.22, .05], [.12, .12], [.25, .34], [.2, .5], [.05, .62], [.03, .72]].map(([x, y]) => new THREE.Vector2(x, y)), pick(20, 10));
    const ring = new THREE.TorusGeometry(1, .035, pick(6, 4), pick(32, 16)), torus = new THREE.TorusGeometry(.09, .014, 5, pick(16, 10));
    const sources = new Set<THREE.BufferGeometry>([blossom, box, sphere, smallSphere, bulb, smallCylinder, tin, cylinder, pipe, drum, plane, leaf, pot, vase, cup, shade, lampBase, ring, torus]);
    const cached = new Map<string, THREE.BufferGeometry>();
    const once = (key: string, make: () => THREE.BufferGeometry) => {
      if (!cached.has(key)) cached.set(key, make());
      return cached.get(key)!;
    };
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>(), waterPieces: THREE.BufferGeometry[] = [], lagoonPieces: THREE.BufferGeometry[] = [];
    const transform = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
    const MARBLE_TILE = 1 / 4.2, FURNITURE_TILE = 1 / 1.1, PLASTER_TILE = 1 / 3, STONE_TILE = .34, tint = new THREE.Color();
    const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color = 0xffffff) => {
      transform.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
      return placeAt(material, geometry, transform, color);
    };
    /** Puts a copy of `geometry` into the room through `matrix`. A shape that already carries its own texture coordinates can keep them. */
    const placeAt = (material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color = 0xffffff, keepUv = false) => {
      const piece = geometry.clone();
      piece.applyMatrix4(matrix);
      if (!keepUv && (material === floor || material === oak || material === concrete || material === stone || material === basin)) {
        const position = piece.getAttribute("position"), normal = piece.getAttribute("normal"), uv = piece.getAttribute("uv");
        const scale = material === oak ? FURNITURE_TILE : material === concrete ? PLASTER_TILE : material === floor ? MARBLE_TILE : STONE_TILE, upright = material !== oak;
        for (let i = 0; i < position.count; i++) {
          const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i)), along = (nx > nz ? position.getZ(i) : position.getX(i)) * scale;
          // Timber runs lengthwise on the floor and around the walls like a log room; concrete and stone keep their courses level.
          if (ny > nx && ny > nz) uv.setXY(i, position.getX(i) * scale, position.getZ(i) * scale);
          else if (upright) uv.setXY(i, along, position.getY(i) * scale);
          else uv.setXY(i, position.getY(i) * scale, along);
        }
      }
      const usesColor = (material as THREE.MeshStandardMaterial).vertexColors, existing = piece.getAttribute("color"), count = piece.getAttribute("position").count;
      if (usesColor) {
        tint.set(color);
        const values: number[] = new Array(count * 3);
        for (let i = 0; i < count; i++) {
          const shade = existing ? [existing.getX(i), existing.getY(i), existing.getZ(i)] : [1, 1, 1];
          values[i * 3] = shade[0] * tint.r; values[i * 3 + 1] = shade[1] * tint.g; values[i * 3 + 2] = shade[2] * tint.b;
        }
        piece.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
      } else if (existing) piece.deleteAttribute("color");
      if (material === foliage || material === canopy || material === willow) piece.setAttribute("aSway", new THREE.Float32BufferAttribute(new Array(count).fill(0), 1));
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material)!.push(piece);
      return piece;
    };
    /** Large flat surfaces are cut into cells, so light summed at their corners still pools where the lamps are. */
    const sheet = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, rx: number, ry: number, color = 0xffffff) => {
      const grid = new THREE.PlaneGeometry(width, height, Math.ceil(width / .65), Math.ceil(height / .65));
      place(material, grid, x, y, z, 1, 1, 1, rx, ry, 0, color); grid.dispose();
    };
    const slab = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, color = 0xffffff, ry = 0) => {
      const cuts = (size: number) => Math.min(32, Math.max(1, Math.ceil(size / .9))), nx = cuts(sx), ny = cuts(sy), nz = cuts(sz);
      place(material, once(`b${nx},${ny},${nz}`, () => new THREE.BoxGeometry(1, 1, 1, nx, ny, nz)), x, y, z, sx, sy, sz, 0, ry, 0, color);
    };
    /** Solid woodwork with eased edges. */
    const wood = (x: number, y: number, z: number, width: number, height: number, depth: number, color: number, radius = .03, ry = 0) => {
      const longest = Math.max(width, height, depth), slim = Math.min(width, height, depth);
      // On a phone small parts keep square corners: at that size the rounding is a pixel, and it costs nine times the triangles.
      if (mobile && longest < .7) { place(oak, box, x, y, z, width, height, depth, 0, ry, 0, color); return; }
      if (mobile && slim < .09) { slab(oak, x, y, z, width, height, depth, color, ry); return; }
      const cuts = radius > .03 && longest > pick(1.2, 1.6) ? 2 : 1, key = `w${width},${height},${depth},${radius},${cuts}`;
      place(oak, once(key, () => new RoundedBoxGeometry(width, height, depth, cuts, Math.min(radius, slim * .48))), x, y, z, 1, 1, 1, 0, ry, 0, color);
    };
    const FABRIC_TILE = 1 / .3, KNIT_TILE = 1 / .42, fine = pick(10, 6);
    const soft = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, shape: SoftBoxOptions, color: number, rx = 0, ry = 0, rz = 0) => {
      const cut = { tile: FABRIC_TILE, ...shape, ...(mobile && shape.seg ? { seg: Math.max(2, Math.round(shape.seg * .6)) } : {}), ...(mobile && shape.seed !== undefined ? { seed: Math.abs(Math.round(shape.seed)) % 2 } : {}) }, key = `s${width},${height},${depth},${JSON.stringify(cut)}`;
      place(material, once(key, () => softBoxGeometry(width, height, depth, cut)), x, y, z, 1, 1, 1, rx, ry, rz, color);
    };
    /**
     * A scatter cushion resting on a seat and lying flat against what is behind it, so it never sinks into a back or an arm.
     * `foot` is where the face it leans on meets the seat, `inward` the level direction out of that face, and `lean` how far the
     * face leans back from upright. `along` slides the cushion sideways, `twist` turns it a little in its own plane, and `out`
     * stands it in front of another cushion instead of against the face itself.
     */
    const pillow = (material: THREE.Material, foot: { x: number; y: number; z: number }, inward: { x: number; z: number }, lean: number, along: number, size: number, seed: number, color: number, twist = 0, out = 0) =>
      placeAt(material, once(`c${size},${seed}`, () => cushionGeometry(size, size, CUSHION_THICKNESS, seed, pick(10, 6), KNIT_TILE)), cushionPose(foot, inward, lean, along, size, twist, out), color);
    const tube = (material: THREE.Material, x: number, y: number, z: number, radius: number, length: number, axis: "x" | "y" | "z", color = 0xffffff) =>
      place(material, pipe, x, y, z, radius, length, radius, axis === "z" ? Math.PI / 2 : 0, 0, axis === "x" ? Math.PI / 2 : 0, color);
    const up = new THREE.Vector3(0, 1, 0), span = new THREE.Vector3(), turn = new THREE.Quaternion(), lean = new THREE.Euler();
    /** A thin straight member between two points: wires, cords, rails, stems. */
    const rod = (material: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number, color = 0xffffff, geometry: THREE.BufferGeometry = tin) => {
      span.set(bx - ax, by - ay, bz - az);
      const length = span.length();
      lean.setFromQuaternion(turn.setFromUnitVectors(up, span.normalize()), "YXZ");
      place(material, geometry, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, radius, length, radius, lean.x, lean.y, lean.z, color);
    };
    const halos: number[][] = [];
    const halo = (x: number, y: number, z: number, size: number, r: number, g: number, b: number) => halos.push([x, y, z, size, r, g, b]);
    /** A caged wall lamp of the kind every shelter has, burning warm instead of white. */
    const bulkhead = (x: number, y: number, z: number, size = 1.5) => {
      place(glow, smallSphere, x, y, z, .1, .14, .1, 0, 0, 0, 0xffd493);
      place(painted, ring, x, y, z, .13, .13, .13, Math.PI / 2, 0, 0, IRON);
      halo(x, y, z, size, .3, .16, .05);
    };
    /** A shaded lamp: the glowing shade and the soft bloom around it. */
    const lampshade = (x: number, y: number, z: number, scale: number, bloom: number) => {
      place(glow, shade, x, y, z, scale, scale, scale, 0, 0, 0, 0xffc98a);
      halo(x, y, z, bloom, .3, .16, .05);
    };
    const GREENS = [0x5f7a3a, 0x6f8f45, 0x4f6b35, 0x86a352, 0x3f5f33, 0x7a9a4a];
    /** One leaf growing from a point, leaning away from upright towards `yaw`. Its tip moves in the air; its stalk does not. */
    const sprout = (x: number, y: number, z: number, length: number, tilt: number, yaw: number, color: number, width = .85, sway = 1) => {
      const piece = place(foliage, leaf, x, y, z, width * length, length, length, tilt, yaw, 0, color);
      const uv = piece.getAttribute("uv"), wave = piece.getAttribute("aSway");
      for (let i = 0; i < uv.count; i++) wave.setX(i, uv.getY(i) * uv.getY(i) * sway * Math.min(length, 1.2));
    };
    const rosette = (x: number, y: number, z: number, count: number, length: number, tilt: number, seed: number, width = .85) => {
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2 + seed, wobble = Math.sin(seed * 7.3 + i * 2.1);
        sprout(x + Math.sin(a) * .04, y, z + Math.cos(a) * .04, length * (.84 + .16 * wobble), tilt + wobble * .12, a, GREENS[Math.abs(i + Math.round(seed * 3)) % GREENS.length], width);
      }
    };
    /** A trailing stem with small leaves hanging off it. */
    const vine = (x: number, y: number, z: number, drop: number, count: number, seed: number) => {
      rod(painted, x, y, z, x + Math.sin(seed) * .1, y - drop, z + Math.cos(seed) * .1, .008, 0x4a5a30);
      for (let i = 1; i <= count; i++) {
        const t = i / count, a = seed + i * 2.4;
        sprout(x + Math.sin(seed) * .1 * t + Math.sin(a) * .03, y - drop * t, z + Math.cos(seed) * .1 * t + Math.cos(a) * .03, .2 + (i % 3) * .03, 2.2, a, GREENS[Math.abs(i + Math.round(seed)) % GREENS.length], 1.25, 1.6);
      }
    };
    /** A ribbon of water from one point to another. `from` is how far downstream it starts; `foam` gives white water at its start and end. */
    const ribbon = (a: readonly [number, number, number], b: readonly [number, number, number], side: readonly [number, number, number], width: number, cells: number, from: number, speed: number, fall: number, foam: readonly [number, number]) => {
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], kinds: number[] = [], falls: number[] = [], indices: number[] = [], length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let i = 0; i <= cells; i++) for (let bank = 0; bank <= 1; bank++) {
        const t = i / cells, across = (bank - .5) * width, thrown = fall ? Math.sqrt(t) : t;
        positions.push(a[0] + (b[0] - a[0]) * thrown + side[0] * across, a[1] + (b[1] - a[1]) * t + side[1] * across, a[2] + (b[2] - a[2]) * thrown + side[2] * across);
        normals.push(0, 1, 0); uvs.push(from + length * t, bank); kinds.push(speed, fall, foam[0] * Math.max(0, 1 - t * 5) + foam[1] * Math.max(0, t * 5 - 4));
        falls.push(length * t, from);
      }
      for (let i = 0; i < cells; i++) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(kinds, 3));
      geometry.setAttribute("aFall", new THREE.Float32BufferAttribute(falls, 2));
      geometry.setIndex(indices); waterPieces.push(geometry);
    };
    /** Spray where falling water lands: `count` drops thrown mostly along (ox, oz), and a share of them a slow mist instead. */
    const splashes: number[][] = [];
    const splash = (x: number, y: number, z: number, ox: number, oz: number, strength: number, count: number, spread: number, mist: number) => {
      for (let i = 0; i < count; i++) {
        const n = x * 3.7 + z * 5.1 + splashes.length * 1.618, a = rnd(n) * Math.PI * 2, r = Math.sqrt(rnd(n + 1)) * spread, sway = (rnd(n + 2) - .5) * 1.4;
        const dx = ox - oz * sway, dz = oz + ox * sway, length = Math.hypot(dx, dz) || 1;
        splashes.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r, rnd(n + 3), dx / length, dz / length, strength, rnd(n + 4) < mist ? .9 : rnd(n + 5) * .8]);
      }
    };
    const H = BUNKER_HALL, T = BUNKER_TERRACE, EN = BUNKER_ENTRY, F = BUNKER_FOUNTAIN, h = BUNKER_CEILING_Y - BUNKER_FLOOR_Y, TAU = Math.PI * 2;
    const FIRE_FLOOR = .1, PALETTE = [0x9c4a2c, 0xc69a54, 0x6a3f2a, 0x56603f, 0xdac6a4, 0x7c5a40, 0xad6e3f];
    const CREAMY = 0xf6efe2, BARK = 0x6a5442, CORD = 0xa08a68, MOSS = 0x41573a;
    const BLUSH = [0xf7c6d4, 0xf2a9c0, 0xfbe1e8, 0xf6b8cc], LILAC = [0xcdb4e6, 0xb79adb, 0xe3d3f2, 0xf2d6ea], LEAFY = [0x7fa04c, 0x6f8f45, 0x94b45c, 0x5f7a3a];
    const ROSE = [0xf29bb0, 0xf7c6d4, 0xe7849d, 0xfbe1e8], HYDRANGEA = [0xaec4f0, 0xc9b6ea, 0x9fb9ea, 0xe0d2f4], IVORY = [0xfbf6ee, 0xf6ead8, 0xfff4e6];
    const rnd = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const wire = once("wire", () => new THREE.CylinderGeometry(1, 1, 1, 3, 1, true));
    const segs = pick(96, 60);
    /** A spray of leaves or flowers on a card, from one quarter of the drawn texture. Each card moves in the air as a whole. */
    const card = (x: number, y: number, z: number, size: number, yaw: number, tilt: number, color: number, sway = 1, cell = Math.floor(rnd(x * 3.1 + y * 7.7 + z * 5.3) * LEAF_CELLS)) => {
      const piece = place(canopy, plane, x, y, z, size, size, 1, tilt, yaw, 0, color), uv = piece.getAttribute("uv"), wave = piece.getAttribute("aSway");
      for (let i = 0; i < uv.count; i++) { wave.setX(i, sway * (.6 + .4 * uv.getY(i))); uv.setXY(i, (uv.getX(i) + cell % 2) * .5, (uv.getY(i) + Math.floor(cell / 2)) * .5); }
    };
    const flower = (x: number, y: number, z: number, size: number, yaw: number, tilt: number, color: number, sway = .4) => card(x, y, z, size, yaw, tilt, color, sway, FLOWER_CELL);
    /** Trailing greenery photographed from a real willow, let down from `y` so its top is there. */
    const trail = (x: number, y: number, z: number, length: number, yaw: number, seed: number) => {
      const piece = place(willow, plane, x, y - length / 2, z, length * .95, length, 1, (rnd(seed) - .5) * .25, yaw, (rnd(seed + 1) - .5) * .12, 0xffffff), uv = piece.getAttribute("uv"), wave = piece.getAttribute("aSway");
      for (let i = 0; i < uv.count; i++) { wave.setX(i, (1 - uv.getY(i)) * .9); if (rnd(seed + 2) > .5) uv.setX(i, 1 - uv.getX(i)); }
    };
    /** A real tree in outline: a leaning trunk in bark, boughs reaching out, and a crown built from hundreds of sprays. */
    const tree = (x: number, y: number, z: number, height: number, spread: number, palette: readonly number[], seed: number, blooming: boolean) => {
      let px = x, py = y, pz = z;
      for (let i = 0; i < 3; i++) {
        const nx = x + (rnd(seed + i) - .5) * .28 * (i + 1), ny = y + height * .5 * (i + 1) / 3, nz = z + (rnd(seed + i + 9) - .5) * .28 * (i + 1);
        rod(stone, px, py, pz, nx, ny, nz, .22 - i * .045, BARK, drum); px = nx; py = ny; pz = nz;
      }
      const tips: [number, number, number][] = [[px, py + height * .42, pz]];
      for (let b = 0; b < 6; b++) {
        const a = b / 6 * TAU + seed, reach = spread * (.55 + rnd(seed + b * 3.3) * .35), bx = px + Math.sin(a) * reach, by = py + height * (.2 + rnd(seed + b) * .24), bz = pz + Math.cos(a) * reach;
        rod(stone, px, py - .1, pz, bx, by, bz, .07, BARK);
        tips.push([bx, by, bz]);
      }
      for (const [bx, by, bz] of tips) for (let i = 0; i < pick(56, 22); i++) {
        const n = seed * 13.7 + bx * 3.1 + i * 1.618, r = spread * .44 * Math.cbrt(rnd(n)), a = rnd(n + 1) * TAU, e = (rnd(n + 2) - .35) * 1.6;
        const color = palette[Math.floor(rnd(n + 6) * palette.length)], bloom = blooming && rnd(n + 8) < .7;
        card(bx + Math.sin(a) * Math.cos(e) * r, by + Math.sin(e) * r * .7, bz + Math.cos(a) * Math.cos(e) * r, (bloom ? .7 : .85) + rnd(n + 3) * .6, rnd(n + 4) * Math.PI, (rnd(n + 5) - .5) * 1.2, bloom ? color : LEAFY[Math.floor(rnd(n + 7) * LEAFY.length)], .5 + rnd(n + 7), bloom ? FLOWER_CELL : undefined);
      }
    };
    /** A vine let down from above. With `blossom` its lower third flowers, like wisteria. */
    const hangVine = (x: number, y: number, z: number, length: number, seed: number, blossom?: readonly number[]) => {
      const count = Math.max(3, Math.round(length / pick(.3, .5)));
      if (!mobile) rod(painted, x, y, z, x, y - length, z, .006, 0x4a5a30, wire);
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, n = seed * 9.1 + i * 2.7, tip = blossom !== undefined && t > .6;
        card(x + (rnd(n) - .5) * .2, y - length * t, z + (rnd(n + 1) - .5) * .2, tip ? .5 : .46, rnd(n + 2) * Math.PI, (rnd(n + 3) - .5) * .5, tip ? blossom[i % blossom.length] : LEAFY[i % LEAFY.length], .4 + t * 1.8, tip ? FLOWER_CELL : undefined);
      }
    };
    /** Heads of flowers over a few leaves: in beds, in pots and in vases. */
    const bouquet = (x: number, y: number, z: number, scale: number, colors: readonly number[], seed: number) => {
      for (let i = 0; i < pick(9, 5); i++) {
        const n = seed * 5.3 + i * 1.9, a = rnd(n) * TAU, r = Math.sqrt(rnd(n + 1)) * .2 * scale;
        flower(x + Math.sin(a) * r, y + (.3 + rnd(n + 2) * .16) * scale, z + Math.cos(a) * r, (.34 + rnd(n + 3) * .14) * scale, a, -.25 - rnd(n + 4) * .9, colors[i % colors.length], .3);
      }
      for (let i = 0; i < pick(3, 2); i++) {
        const n = seed * 3.9 + i * 2.3, a = rnd(n) * TAU;
        card(x + Math.sin(a) * .1 * scale, y + (.12 + rnd(n + 2) * .1) * scale, z + Math.cos(a) * .1 * scale, .4 * scale, a, -.6, LEAFY[i % LEAFY.length], .3);
      }
      rosette(x, y, z, pick(6, 4), .36 * scale, 1.0, Math.abs(seed), 1.1);
    };
    const column = (x: number, z: number, height: number) => {
      place(floor, drum, x, height / 2, z, .2, height, .2);
      for (const y of [.1, height - .1]) place(floor, box, x, y, z, .52, .2, .52, 0, 0, 0, CREAMY);
    };
    const lantern = (x: number, y: number, z: number, scale = 1) => {
      for (const dy of [-.2, .2]) place(oak, box, x, y + dy * scale, z, .2 * scale, .03 * scale, .2 * scale, 0, 0, 0, WALNUT);
      place(glow, box, x, y, z, .15 * scale, .36 * scale, .15 * scale, 0, 0, 0, 0xffdca0);
      halo(x, y, z, 1.5 * scale, .3, .17, .06);
    };
    /** A rail of marble posts under a timber handrail along a path of points: level, climbing a stair, or round a curve. */
    const railing = (path: readonly (readonly [number, number, number])[], every = 1.25) => {
      let since = every;
      for (let i = 0; i < path.length; i++) {
        const [x, y, z] = path[i];
        if (i > 0) {
          const [px, py, pz] = path[i - 1];
          rod(oak, px, py + .94, pz, x, y + .94, z, .05, WALNUT);
          rod(brass, px, py + .5, pz, x, y + .5, z, .014);
          since += Math.hypot(x - px, z - pz);
        }
        if (since >= every || i === path.length - 1) { place(floor, box, x, y + .45, z, .12, .9, .12, 0, 0, 0, CREAMY); since = 0; }
      }
    };
    /** An arched niche of lit alabaster in a timber frame: the hall has no windows, and these stand in for them. */
    const niche = (x: number, y: number, z: number, ry: number) => {
      const sx = Math.sin(ry), sz = Math.cos(ry);
      place(glow, plane, x + sx * .03, y, z + sz * .03, 1.3, 2.6, 1, 0, ry, 0, 0xffe6bd);
      place(glow, cylinder, x + sx * .03, y + 1.3, z + sz * .03, .65, .02, .65, Math.PI / 2, ry, 0, 0xffe6bd);
      for (const side of [-1, 1]) place(oak, box, x + sz * side * .7, y, z - sx * side * .7, .1, 2.7, .1, 0, ry, 0, WALNUT);
      place(oak, box, x, y - 1.34, z, 1.6, .1, .14, 0, ry, 0, WALNUT);
      halo(x + sx * .4, y + .3, z + sz * .4, 3.6, .2, .15, .09);
    };
    /** A boulder: a ball knocked out of round. Three shapes turned and squashed differently are enough that no two look alike. */
    const boulder = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, color: number) => {
      const shape = Math.abs(Math.round(seed)) % 3;
      place(material, once(`boulder${shape}`, () => {
        const ball = new THREE.SphereGeometry(1, pick(8, 6), pick(6, 4)), position = ball.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const px = Math.round(position.getX(i) * 100), py = Math.round(position.getY(i) * 100), pz = Math.round(position.getZ(i) * 100), knock = .78 + rnd(px * .123 + py * .456 + pz * .789 + shape) * .44;
          position.setXYZ(i, position.getX(i) * knock, position.getY(i) * knock, position.getZ(i) * knock);
        }
        ball.computeVertexNormals();
        return ball;
      }), x, y, z, sx, sy, sz, rnd(seed + 5) * .5 - .25, rnd(seed + 6) * 6.28, rnd(seed + 7) * .5 - .25, color);
    };

    /** A surface from a grid of points; `keep` leaves quads out. It is turned so the normal at vertex `probe` points along `want`. */
    const grid = (columns: number, rows: number, at: (i: number, j: number) => readonly [number, number, number], want: (p: THREE.Vector3) => THREE.Vector3,
      uvAt?: (i: number, j: number) => readonly [number, number], keep?: (i: number, j: number) => boolean, probe = (columns + 1) + 1) => {
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) { positions.push(...at(i, j)); uvs.push(...(uvAt ? uvAt(i, j) : [i / columns, j / rows])); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
        if (keep && !keep(i, j)) continue;
        const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const p = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("position") as THREE.BufferAttribute, probe), n = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("normal") as THREE.BufferAttribute, probe);
      if (n.dot(want(p)) < 0) {
        for (let k = 0; k < indices.length; k += 3) { const swap = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = swap; }
        geometry.setIndex(indices); geometry.computeVertexNormals();
      }
      return geometry;
    };
    const surface = (material: THREE.Material, geometry: THREE.BufferGeometry, color = 0xffffff, keepUv = false) => { placeAt(material, geometry, transform.identity(), color, keepUv); geometry.dispose(); };
    /** Flat-shaded quads, each turned to face `want`, for the crisp edges of steps and slabs. */
    const facets = () => {
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      const add = (corners: readonly (readonly [number, number, number])[], want: THREE.Vector3, uv?: readonly (readonly [number, number])[]) => {
        const [a, b, c] = corners.map(p => new THREE.Vector3(...p)), base = positions.length / 3;
        corners.forEach((p, k) => { positions.push(...p); uvs.push(...(uv?.[k] ?? [0, 0])); });
        if (b.clone().sub(a).cross(c.clone().sub(a)).dot(want) >= 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      };
      const done = () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
      };
      return { add, done };
    };
    const facingUp = () => new THREE.Vector3(0, 1, 0), facingDown = () => new THREE.Vector3(0, -1, 0);
    /** Towards the middle of the hall, level. */
    const inwards = (p: THREE.Vector3) => new THREE.Vector3(-p.x / (H.a * H.a), 0, -(p.z - H.cz) / (H.b * H.b));
    const at3 = (radius: number, angle: number, y: number): [number, number, number] => { const p = hallPoint(radius, angle); return [p.x, y, p.z]; };
    /** A point `out` metres into the room from the oval of radius `radius` at `angle`. */
    const off = (radius: number, angle: number, out: number) => { const p = hallPoint(radius, angle), n = hallInward(angle); return { x: p.x + n.x * out, z: p.z + n.z * out }; };
    /** Distance along the wall from the back of the hall to `angle`, so a texture can run round it without a seam. */
    const arc = (angle: number, radius = 1) => { let s = 0; const steps = 48; for (let k = 0; k < steps; k++) s += hallReach(angle * (k + .5) / steps) * Math.abs(angle) / steps; return s * radius * Math.sign(angle); };
    /** A frame standing on the wall at `angle`: u runs along the wall, v out into the room. Boxes turned by `yaw` follow it. */
    const wallFrame = (angle: number) => {
      const at = hallPoint(1, angle), n = hallInward(angle);
      return { yaw: Math.atan2(n.x, n.z), n, p: (u: number, v: number) => ({ x: at.x + n.z * u + n.x * v, z: at.z - n.x * u + n.z * v }) };
    };
    /**
     * A living wall: a mossy backing with leaves set close over it and flowers among them, on the oval of radius `radius`
     * between two angles and between heights that may climb with a stair.
     */
    const livingWall = (radius: number, from: number, to: number, low: (angle: number) => number, high: (angle: number) => number, flowers: readonly number[], seed: number, density = pick(12, 6), backed = true) => {
      const columns = Math.max(2, Math.ceil(Math.abs(to - from) * 14)), rows = 4;
      if (backed) surface(painted, grid(columns, rows, (i, j) => { const a = from + (to - from) * i / columns, p = off(radius, a, .012); return [p.x, low(a) + (high(a) - low(a)) * j / rows, p.z]; }, inwards), MOSS);
      const span = Math.abs(arc(to, radius) - arc(from, radius)), count = Math.round(span * (high((from + to) / 2) - low((from + to) / 2)) * density);
      for (let i = 0; i < count; i++) {
        const n = seed * 17.3 + i * 1.37, a = from + (to - from) * rnd(n), y = low(a) + .1 + (high(a) - low(a) - .2) * rnd(n + 1), p = off(radius, a, .05 + rnd(n + 2) * .16);
        const yaw = Math.atan2(hallInward(a).x, hallInward(a).z) + (rnd(n + 3) - .5) * 1.1, bloom = rnd(n + 4) < .18;
        if (bloom) flower(p.x, y, p.z, .3 + rnd(n + 5) * .16, yaw, (rnd(n + 6) - .5) * .9, flowers[Math.floor(rnd(n + 7) * flowers.length)], .25);
        else card(p.x, y, p.z, .55 + rnd(n + 5) * .45, yaw, (rnd(n + 6) - .5) * 1.1, LEAFY[Math.floor(rnd(n + 7) * LEAFY.length)], .25);
      }
    };

    const build: (() => void)[] = [];
    build.push(() => { const weave = rugTexture(128); ownTextures.add(weave); rug.map = weave; });
    build.push(() => { const skim = plasterTexture(128); ownTextures.add(skim); concrete.map = skim; });
    build.push(() => {
      if (options.renderer) { marble = bakeDrawn(options.renderer, pick(1024, 512), MARBLE_FRAG, "white-marble", true); floor.map = marble.texture; }
      else { const veined = marbleTexture(64); ownTextures.add(veined); floor.map = veined; }
    });

    // The floor: polished marble from the kerb of the lake out to the oval wall, wherever the hall floor is not raised.
    build.push(() => {
      const rings = pick(22, 14), kerb = LAKE.kerb + .02;
      const ox = LAKE.x, oz = LAKE.z - H.cz;
      const wall = (dx: number, dz: number) => {
        const qa = dx * dx / (H.a * H.a) + dz * dz / (H.b * H.b), qb = 2 * (ox * dx / (H.a * H.a) + oz * dz / (H.b * H.b)), qc = ox * ox / (H.a * H.a) + oz * oz / (H.b * H.b) - 1;
        const s = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa) * 1.01;
        return [LAKE.x + dx * s, LAKE.z + dz * s] as const;
      };
      const point = (i: number, j: number): [number, number, number] => {
        const t = i / segs * TAU, ix = LAKE.x + (LAKE.a + kerb) * Math.sin(t), iz = LAKE.z + (LAKE.b + kerb) * Math.cos(t), [wx, wz] = wall(ix - LAKE.x, iz - LAKE.z), f = Math.pow(j / rings, 1.25);
        return [ix + (wx - ix) * f, 0, iz + (wz - iz) * f];
      };
      const raised = (i: number, j: number) => { const [x, , z] = point(i, j); return bunkerFloorRise(x, z) > .01; };
      surface(floor, grid(segs, rings, point, facingUp, undefined, (i, j) => !(raised(i, j) && raised(i + 1, j) && raised(i, j + 1) && raised(i + 1, j + 1))));
    });

    // The lake: a pale bed shelving to the middle, a marble kerb to stand at, lilies on the water and a bowl of water in the middle.
    build.push(() => {
      const bedY = (q: number) => LAKE.level - (.17 + (LAKE.depth - .17) * (1 - Math.min(1, q) * Math.min(1, q)));
      const rings = pick(7, 5);
      surface(basin, grid(segs, rings, (i, j) => { const t = i / segs * TAU, q = 1.04 * j / rings; return [LAKE.x + LAKE.a * q * Math.sin(t), bedY(q), LAKE.z + LAKE.b * q * Math.cos(t)]; }, facingUp), 0xeee3cc);
      // The kerb: in from the water, over a rounded top and down to the floor.
      const profile: readonly (readonly [number, number])[] = [[-.02, bedY(1) - .06], [0, .1], [.04, .16], [LAKE.kerb - .04, .16], [LAKE.kerb, .1], [LAKE.kerb, 0]];
      surface(floor, grid(segs, profile.length - 1, (i, j) => { const t = i / segs * TAU, [grow, y] = profile[j]; return [LAKE.x + (LAKE.a + grow) * Math.sin(t), y, LAKE.z + (LAKE.b + grow) * Math.cos(t)]; }, facingUp, undefined, undefined, (segs + 1) * 2 + 3), CREAMY);
      for (let i = 0; i < pick(18, 9); i++) {
        const t = rnd(i * 2.3 + 7) * TAU, q = .45 + rnd(i + 4) * .45, size = .1 + rnd(i + 1) * .18;
        boulder(basin, LAKE.x + LAKE.a * q * Math.sin(t), bedY(q) + size * .25, LAKE.z + LAKE.b * q * Math.cos(t), size, size * .5, size * (.7 + rnd(i + 2) * .5), i, i % 3 ? 0xe2d8c4 : 0xc9bfaa);
      }
      // Water lilies in loose drifts near the kerb.
      const pad = once("lily-pad", () => { const g = new THREE.CircleGeometry(1, pick(14, 9), .35, TAU - .35); g.rotateX(-Math.PI / 2); return g; });
      for (let k = 0; k < 6; k++) {
        const t = k / 6 * TAU + .4, q = .78 + rnd(k + 30) * .12;
        for (let i = 0; i < 3; i++) {
          const n = k * 7 + i, a = t + (rnd(n + 31) - .5) * .25, r = q - rnd(n + 32) * .12, size = .22 + rnd(n + 33) * .14;
          place(foliage, pad, LAKE.x + LAKE.a * r * Math.sin(a), LAKE.level + .07, LAKE.z + LAKE.b * r * Math.cos(a), size, 1, size, 0, rnd(n + 34) * TAU, 0, [0x4f7a3a, 0x5e8a40, 0x456f34][i]);
          if (i === 0) for (let p = 0; p < 3; p++) flower(LAKE.x + LAKE.a * r * Math.sin(a), LAKE.level + .15, LAKE.z + LAKE.b * r * Math.cos(a), .22, p * 1.05 + k, -1.25, k % 2 ? ROSE[p % ROSE.length] : IVORY[p % IVORY.length], .1);
        }
      }
      // The fountain: a marble bowl on a stem, brimming over all round into the lake.
      place(floor, drum, LAKE.x, (bedY(0) + .5) / 2, LAKE.z, .22, .5 - bedY(0), .22, 0, 0, 0, CREAMY);
      place(floor, once("fountain-bowl", () => new THREE.LatheGeometry([[0, 0], [.3, .02], [.7, .14], [.92, .3], [.95, .36], [.9, .36], [.66, .2], [0, .14]].map(([x, y]) => new THREE.Vector2(x, y)), pick(32, 18))), LAKE.x, .3, LAKE.z, 1, 1, 1, 0, 0, 0, CREAMY);
      place(painted, cylinder, LAKE.x, .64, LAKE.z, .88, .02, .88, 0, 0, 0, 0x93c9ee);
      const spill = pick(20, 14);
      for (let i = 0; i < spill; i++) {
        const a = i / spill * TAU, s = Math.sin(a), c = Math.cos(a);
        ribbon([LAKE.x + s * .95, .66, LAKE.z + c * .95], [LAKE.x + s * 1.12, LAKE.level, LAKE.z + c * 1.12], [c, 0, -s], 2 * Math.PI * 1.12 / spill + .05, pick(5, 3), i * .7, 1.6, 1, [0, 1]);
        splash(LAKE.x + s * 1.12, LAKE.level + .01, LAKE.z + c * 1.12, s, c, .55, pick(14, 9), .18, .2);
      }
      halo(LAKE.x, .7, LAKE.z, 2.6, .1, .14, .19);
      // The still water: deeper towards the middle; a desktop swaps it for the sea engine from the beach.
      const rings2 = pick(10, 6), positions: number[] = [], normals: number[] = [], uvs: number[] = [], kinds: number[] = [], indices: number[] = [];
      for (let j = 0; j <= rings2; j++) for (let i = 0; i <= segs; i++) {
        const t = i / segs * TAU, q = 1.02 * j / rings2;
        positions.push(LAKE.x + LAKE.a * q * Math.sin(t), LAKE.level, LAKE.z + LAKE.b * q * Math.cos(t)); normals.push(0, 1, 0); uvs.push(i / segs, j / rings2); kinds.push(1 - Math.min(1, q) * Math.min(1, q), 0, 0);
      }
      for (let j = 0; j < rings2; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i; indices.push(a, a + segs + 1, a + 1, a + 1, a + segs + 1, a + segs + 2); }
      const still = new THREE.BufferGeometry();
      still.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); still.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      still.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); still.setAttribute("color", new THREE.Float32BufferAttribute(kinds, 3));
      still.setIndex(indices); lagoonPieces.push(still);
    });

    // The oval wall: cream plaster to the cornice, a timber wainscot, marble pilasters and lit niches high up where windows would be.
    build.push(() => {
      const rows = Math.ceil(H.wall / .65);
      const around = (i: number) => -Math.PI + i / segs * TAU;
      surface(concrete, grid(segs, rows, (i, j) => at3(1, around(i), H.wall * j / rows), inwards, (i, j) => [arc(around(i)) * PLASTER_TILE, H.wall * j / rows * PLASTER_TILE]), CREAMY, true);
      for (const [from, to, y0] of [[-Math.PI, Math.PI, 0], [-T.top - .1, T.top + .1, UP]] as const) {
        const columns = Math.ceil((to - from) / TAU * segs);
        surface(oak, grid(columns, 2, (i, j) => { const a = from + (to - from) * i / columns, p = off(1, a, .03); return [p.x, y0 + 1.05 * j / 2, p.z]; }, inwards, (i, j) => [(y0 + 1.05 * j / 2) * FURNITURE_TILE, arc(from + (to - from) * i / columns) * FURNITURE_TILE]), 0xe2bd94, true);
        surface(oak, grid(columns, 1, (i, j) => { const a = from + (to - from) * i / columns, p = off(1, a, .05); return [p.x, y0 + 1.03 + .1 * j, p.z]; }, inwards, (i, j) => [j * .1, arc(from + (to - from) * i / columns) * FURNITURE_TILE]), WALNUT, true);
      }
      for (let k = 0; k < 20; k++) {
        if (k === 10) continue;
        const a = k / 20 * TAU, frame = wallFrame(a), base = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= T.top + .05 ? UP : 0, p = frame.p(0, .05);
        place(floor, box, p.x, (base + H.wall) / 2, p.z, .46, H.wall - base, .1, 0, frame.yaw, 0, CREAMY);
        for (const [y, w, d] of [[base + .12, .6, .18], [H.wall - .2, .66, .22]] as const) { const q = frame.p(0, d / 2); place(floor, box, q.x, y, q.z, w, .24, d, 0, frame.yaw, 0, CREAMY); }
        const mid = a + Math.PI / 20;
        if (k % 2 === 0) { const nf = wallFrame(mid), q = nf.p(0, .01); niche(q.x, 6.3, q.z, nf.yaw); }
      }
      // A cornice of stepped marble at the top of the wall, where the dome springs.
      const profile: readonly (readonly [number, number])[] = [[0, H.wall - .4], [.08, H.wall - .32], [.12, H.wall - .05], [.24, H.wall + .02], [0, H.wall + .08]];
      surface(floor, grid(segs, profile.length - 1, (i, j) => { const a = -Math.PI + i / segs * TAU, p = off(1, a, profile[j][0]); return [p.x, profile[j][1], p.z]; }, facingDown, undefined, undefined, (segs + 1) * 2 + 2), CREAMY);
    });

    // The dome: plaster rising from the cornice to an open oculus of lit alabaster, crossed by timber ribs.
    build.push(() => {
      const rows = pick(10, 7), eye = .2, rise = h - H.wall;
      const domeY = (r: number) => H.wall + rise * Math.sqrt(Math.max(0, 1 - r * r));
      const point = (i: number, j: number): [number, number, number] => { const r = 1 - (1 - eye) * j / rows; return at3(r, -Math.PI + i / segs * TAU, domeY(r)); };
      surface(concrete, grid(segs, rows, point, p => new THREE.Vector3(0, 4, H.cz).sub(p), (i, j) => { const [x, , z] = point(i, j); return [x * PLASTER_TILE, z * PLASTER_TILE]; }), CREAMY, true);
      surface(glow, grid(segs, 1, (i, j) => at3(eye * (1 - j), -Math.PI + i / segs * TAU, domeY(eye) - .02), facingDown), 0xfff2d8);
      place(brass, ring, 0, domeY(eye) - .03, H.cz, H.a * eye, H.b * eye, 3, Math.PI / 2);
      halo(0, domeY(eye) - .6, H.cz, 9, .22, .18, .13);
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * TAU;
        for (let j = 0; j < 6; j++) {
          const r0 = 1 - (1 - eye) * j / 6, r1 = 1 - (1 - eye) * (j + 1) / 6, p0 = off(r0, a, .05), p1 = off(r1, a, .05);
          rod(oak, p0.x, domeY(r0) - .06, p0.z, p1.x, domeY(r1) - .06, p1.z, .07, WALNUT);
        }
      }
    });

    // The front balcony the ladder comes down through, on slender columns, with greenery let down from its edge.
    build.push(() => {
      const from = EN.from, to = TAU - EN.from, columns = pick(36, 22), rows = 3, top = UP, under = EN.ceiling;
      const angle = (i: number) => from + (to - from) * i / columns, radius = (j: number) => EN.edge + (1.01 - EN.edge) * j / rows;
      const hole = (i: number, j: number) => { const p = hallPoint((radius(j) + radius(j + 1)) / 2, (angle(i) + angle(i + 1)) / 2); return Math.abs(p.x - BUNKER_LADDER_LOCAL.x) > .8 || Math.abs(p.z - BUNKER_LADDER_LOCAL.z - .1) > .75; };
      surface(oak, grid(columns, rows, (i, j) => at3(radius(j), angle(i), under), facingDown, undefined, hole), HONEY);
      surface(floor, grid(columns, rows, (i, j) => at3(radius(j), angle(i), top), facingUp, undefined, hole), 0xfbf6ee);
      surface(oak, grid(columns, 1, (i, j) => at3(EN.edge, angle(i), under + (top - under) * j), inwards), WALNUT);
      const ends = facets();
      for (const a of [from, to]) {
        const outward = new THREE.Vector3(Math.cos(a) * H.a, 0, -Math.sin(a) * H.b).multiplyScalar(a === from ? -1 : 1);
        ends.add([at3(EN.edge, a, under), at3(1.01, a, under), at3(1.01, a, top), at3(EN.edge, a, top)], outward);
      }
      surface(oak, ends.done(), WALNUT);
      const path: [number, number, number][] = [];
      for (let i = 0; i <= columns; i++) path.push(at3(EN.edge + .012, angle(i), top));
      railing(path);
      for (const a of BUNKER_ENTRY_COLUMNS) { const p = hallPoint(EN.edge + .01, a); column(p.x, p.z, under); }
      // The trapdoor the ladder rises through.
      for (const [dx, dz, w, d] of [[0, -.65, 1.7, .1], [0, .85, 1.7, .1], [-.85, .1, .1, 1.6], [.85, .1, .1, 1.6]] as const) wood(BUNKER_LADDER_LOCAL.x + dx, under - .05, BUNKER_LADDER_LOCAL.z + dz, w, .12, d, WALNUT, .02);
      place(painted, box, BUNKER_LADDER_LOCAL.x, top + .4, BUNKER_LADDER_LOCAL.z + .1, 1.6, .02, 1.5, 0, 0, 0, 0x1a1410);
      for (let i = 0; i < pick(26, 14); i++) {
        const a = from + .08 + (to - from - .16) * (i + rnd(i + 3) * .6) / pick(26, 14), p = off(EN.edge, a, .08);
        if (Math.abs(p.x) < 1.2) continue;
        trail(p.x, top - .02, p.z, 1.3 + rnd(i + 5) * 1.1, Math.atan2(hallInward(a).x, hallInward(a).z), i + 11);
      }
    });

    // Under the balcony: the ladder, consoles with flowers either side, and green walls between the pilasters.
    build.push(() => {
      const ladderZ = BUNKER_LADDER_LOCAL.z, top = EN.ceiling;
      for (const x of [-.52, .52]) place(oak, cylinder, x, top / 2, ladderZ, .05, top, .05, -.09, 0, 0, WALNUT);
      for (let rung = 0; rung < 10; rung++) {
        const y = .35 + rung * .36, z = ladderZ - (y - top / 2) * .09;
        place(oak, cylinder, 0, y, z, .045, 1.12, .045, 0, 0, Math.PI / 2, HONEY);
      }
      place(shadow, plane, 0, .012, ladderZ, 2.4, 1.8, 1, -Math.PI / 2);
      soft(rug, 0, .035, -4.2, 3.2, .06, 1.8, { radius: .025, seg: 4, tile: 2 }, 0xead9c6);
      for (const side of [-1, 1]) {
        const frame = wallFrame(side * 2.78), c = frame.p(0, .34);
        wood(c.x, .8, c.z, 2.4, .07, .6, 0xe6b27c, .03, frame.yaw);
        for (const u of [-1, 1]) { const leg = frame.p(u, .34); wood(leg.x, .39, leg.z, .08, .78, .5, CHOCOLATE, .02, frame.yaw); }
        place(painted, vase, c.x, .835, c.z, 1.1, 1.0, 1.1, 0, 0, 0, 0xf1e6d2);
        bouquet(c.x, 1.2, c.z, 1.5, side < 0 ? ROSE : HYDRANGEA, side + 2);
        for (const u of [-.75, .8]) { const q = frame.p(u, .4); place(painted, tin, q.x, .93, q.z, .05, .18, .05, 0, 0, 0, 0xf3e7cf); place(glow, bulb, q.x, 1.07, q.z, .02, .05, .02, 0, 0, 0, 0xffd28a); halo(q.x, 1.08, q.z, .4, .42, .22, .07); }
      }
      for (const side of [-1, 1]) {
        livingWall(1, side * EN.from + side * .04, side * 2.98, () => 1.12, () => EN.ceiling - .2, side < 0 ? ROSE : HYDRANGEA, side + 5);
        const s = hallPoint(.94, side * 2.75); lantern(s.x, 2.9, s.z, 1.0);
      }
    });

    // The terrace across the back: its marble floor, the green wall it shows the lake, and the rail along its edge.
    build.push(() => {
      const columns = pick(40, 26), rows = 6;
      const angle = (i: number) => -T.top + 2 * T.top * i / columns;
      surface(floor, grid(columns, rows, (i, j) => at3(T.edge + (1.01 - T.edge) * j / rows, angle(i), UP), facingUp), 0xfbf6ee);
      const face = (i: number, j: number) => at3(T.edge, angle(i), UP * j / 6);
      surface(floor, grid(columns, 6, face, inwards, (i, j) => [arc(angle(i), T.edge) * MARBLE_TILE, UP * j / 6 * MARBLE_TILE]), CREAMY, true);
      const sides = facets();
      for (const side of [-1, 1]) {
        const a = side * T.top, outward = new THREE.Vector3(Math.cos(a) * H.a, 0, -Math.sin(a) * H.b).multiplyScalar(side);
        sides.add([at3(T.edge, a, 0), at3(T.stair, a, 0), at3(T.stair, a, UP), at3(T.edge, a, UP)], outward);
      }
      surface(floor, sides.done(), CREAMY);
      // Coping along the edge, and the rail on it from stair to stair.
      surface(floor, grid(columns, 1, (i, j) => { const p = off(T.edge, angle(i), -.02 + .3 * j); return [p.x, UP + .04, p.z]; }, facingUp), CREAMY);
      const path: [number, number, number][] = [];
      for (let i = 0; i <= 6; i++) { const r = T.stair - (T.stair - T.edge) * i / 6; path.push(at3(r - .01, -T.top - .012, UP)); }
      for (let i = 1; i <= columns; i++) { const p = off(T.edge, angle(i), -.1); path.push([p.x, UP, p.z]); }
      for (let i = 1; i <= 6; i++) { const r = T.edge + (T.stair - T.edge) * i / 6; path.push(at3(r - .01, T.top + .012, UP)); }
      railing(path);
    });
    build.push(() => {
      for (const side of [-1, 1]) {
        livingWall(T.edge, side * .2, side * (T.top - .02), () => .25, () => UP - .25, side < 0 ? HYDRANGEA : ROSE, side + 9);
        for (let i = 0; i < pick(9, 5); i++) {
          const a = side * (.24 + (T.top - .3) * (i + rnd(i + side * 4) * .5) / pick(9, 5)), p = off(T.edge, a, .06);
          trail(p.x, UP + .02, p.z, 1.2 + rnd(i + side * 9) * 1.4, Math.atan2(hallInward(a).x, hallInward(a).z), i + 40 + side);
        }
        // Planters of flowers just inside the rail.
        for (let i = 0; i < 4; i++) {
          const a = side * (.3 + i * .15), p = off(T.edge, a, -.45), yaw = Math.atan2(hallInward(a).x, hallInward(a).z);
          wood(p.x, UP + .2, p.z, 1.1, .4, .42, 0xd9a676, .03, yaw); place(painted, box, p.x, UP + .41, p.z, 1.0, .03, .34, 0, yaw, 0, SOIL);
          bouquet(p.x, UP + .42, p.z, 1.1, i % 2 ? ROSE : IVORY, i + side * 3 + 60);
        }
      }
      // The wall fountain: a sheet of water over a dark stone panel, falling from the terrace edge into a marble basin.
      const panel = grid(10, 6, (i, j) => { const a = -.2 + .4 * i / 10; return at3(T.edge - .002, a, .5 + (UP - .5) * j / 6); }, inwards);
      surface(painted, panel, 0x37403c);
      // A marble basin open at the top, filled to a hand below its rim.
      const front = F.z - F.halfZ + .06, surfaceY = F.rim - .1;
      slab(floor, F.x, F.rim / 2, front, F.halfX * 2, F.rim, .12, CREAMY);
      for (const side of [-1, 1]) slab(floor, F.x + side * (F.halfX - .06), F.rim / 2, F.z, .12, F.rim, F.halfZ * 2, CREAMY);
      slab(floor, F.x, F.rim + .02, front, F.halfX * 2 + .08, .05, .2, CREAMY);
      for (const side of [-1, 1]) slab(floor, F.x + side * (F.halfX - .06), F.rim + .02, F.z, .2, .05, F.halfZ * 2, CREAMY);
      place(basin, box, F.x, .1, F.z, F.halfX * 2 - .2, .2, F.halfZ * 2 - .1, 0, 0, 0, 0xdfe6ea);
      ribbon([F.x - F.halfX + .12, surfaceY, F.z + .04], [F.x + F.halfX - .12, surfaceY, F.z + .04], [0, 0, 1], F.halfZ * 2 - .2, pick(8, 5), 0, .25, 0, [0, 0]);
      const edge = hallPoint(T.edge, 0);
      ribbon([F.x, UP + .02, edge.z - .06], [F.x, surfaceY, F.z + .14], [1, 0, 0], 3.2, pick(10, 6), 0, 2.4, 1, [0, 1]);
      for (let i = 0; i < 9; i++) splash(F.x - 1.45 + i * 2.9 / 8, surfaceY + .01, F.z + .12, 0, -1, .85, pick(16, 10), .14, .25);
      slab(floor, F.x, UP + .06, edge.z - .08, 3.6, .1, .3, CREAMY);
      halo(F.x, 1.2, F.z - .4, 3.2, .1, .13, .18);
    });

    // A marble stair against each side wall, curving up from the hall floor to the terrace, with a rail on its open side.
    build.push(() => {
      const N = T.steps, rise = UP / N, top = (i: number) => (i + .5) * rise;
      // Where each step starts, by how far up the climb it is.
      const starts: number[] = [];
      for (let i = 0; i <= N; i++) { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (stairClimb(mid) < i / N) lo = mid; else hi = mid; } starts.push(lo); }
      const angleOf = (t: number) => T.foot - t * (T.foot - T.top);
      for (const side of [-1, 1]) {
        const steps = facets(), radii = [T.stair, T.stair + .07, .9, 1.01];
        for (let i = 0; i < N; i++) {
          const a0 = side * angleOf(starts[i]), a1 = side * angleOf(starts[i + 1]), y = top(i), below = i ? top(i - 1) : 0;
          for (let r = 0; r < radii.length - 1; r++) {
            steps.add([at3(radii[r], a0, y), at3(radii[r + 1], a0, y), at3(radii[r + 1], a1, y), at3(radii[r], a1, y)], facingUp());
            const riser = new THREE.Vector3(Math.cos(a0) * H.a, 0, -Math.sin(a0) * H.b).multiplyScalar(side);
            steps.add([at3(radii[r], a0, below), at3(radii[r + 1], a0, below), at3(radii[r + 1], a0, y), at3(radii[r], a0, y)], riser);
          }
        }
        surface(floor, steps.done(), 0xfbf7f0);
        // The stringer on the open side follows the climb, a hand above the treads.
        const columns = pick(40, 24), stringer = (i: number) => starts[0] + (1 - starts[0]) * i / columns;
        surface(floor, grid(columns, 2, (i, j) => { const t = stringer(i), a = side * angleOf(t), p = off(T.stair, a, .015); return [p.x, j === 0 ? 0 : UP * stairClimb(t) + (j === 2 ? .16 : .12), p.z]; }, inwards), CREAMY);
        surface(floor, grid(columns, 1, (i, j) => { const t = stringer(i), a = side * angleOf(t), p = off(T.stair, a, .015 - .12 * j); return [p.x, UP * stairClimb(t) + .16, p.z]; }, facingUp), CREAMY);
        // The rail starts a little way facingUp, where the open side first stands higher than a step.
        const path: [number, number, number][] = [];
        for (let i = 0; i <= columns; i++) { const t = .12 + .88 * i / columns, a = side * angleOf(t), p = off(T.stair, a, -.04); path.push([p.x, UP * stairClimb(t) + .16, p.z]); }
        railing(path, 1.1);
        const newel = off(T.stair, side * angleOf(.12), -.04); place(floor, box, newel.x, UP * stairClimb(.12) + .7, newel.z, .2, 1.1, .2, 0, 0, 0, CREAMY); lantern(newel.x, UP * stairClimb(.12) + 1.4, newel.z, .9);
        // Greenery up the wall beside the climb, and a lantern hung over its middle.
        // Beside the climb the wall is left pale, with ivy and flowers scattered over it and willow let down from above.
        const climbAt = (a: number) => UP * stairClimb((T.foot - Math.abs(a)) / (T.foot - T.top));
        livingWall(1, side * (T.foot - .02), side * (T.top + .02), a => climbAt(a) + 1.3, a => climbAt(a) + 2.9, side < 0 ? ROSE : HYDRANGEA, side + 20, pick(6, 3), false);
        for (let i = 0; i < pick(16, 10); i++) {
          const a = side * (T.foot - .06 - (T.foot - T.top - .1) * (i + rnd(i + side * 13) * .7) / pick(16, 10)), p = off(1, a, .1);
          trail(p.x, climbAt(a) + 3.6 + rnd(i + 3) * .4, p.z, 1.4 + rnd(i + side * 5) * 1.0, Math.atan2(hallInward(a).x, hallInward(a).z), i + 70 + side * 20);
        }
        const lamp = hallPoint(.78, side * 1.45); rod(painted, lamp.x, bunkerCeilingRise(lamp.x, lamp.z) - .05, lamp.z, lamp.x, 4.6, lamp.z, .006, CORD, wire); lantern(lamp.x, 4.3, lamp.z, 1.5);
      }
    });

    // Trees in marble planters at the ends of the lake and on the terrace: blossom to the west, leaf to the east.
    build.push(() => {
      for (const [index, spot] of BUNKER_TREES_LOCAL.entries()) {
        const y = spot.upstairs ? UP : 0, west = spot.x < 0;
        place(floor, drum, spot.x, y + .3, spot.z, .92, .6, .92, 0, 0, 0, CREAMY);
        place(painted, cylinder, spot.x, y + .6, spot.z, .82, .04, .82, 0, 0, 0, SOIL);
        place(shadow, plane, spot.x, y + .012, spot.z, 3.0, 3.0, 1, -Math.PI / 2);
        tree(spot.x, y + .6, spot.z, spot.upstairs ? 4.6 : 4.2, spot.upstairs ? 2.6 : 2.3, west ? BLUSH : LEAFY, index * 5 + 3, west);
        for (let i = 0; i < 5; i++) bouquet(spot.x + Math.sin(i * 1.26) * .55, y + .62, spot.z + Math.cos(i * 1.26) * .55, .8, west ? ROSE : HYDRANGEA, i + index * 7);
      }
    });

    // The lounge: a deep white rug, two sofas facing each other over a slab table, and three lanterns hung low over it.
    build.push(() => soft(rug, 0, .05, .1, 12.9, .1, 7.5, { radius: .04, seg: 10, tile: 1 / .5 }, 0xf6f0e6));
    const BACK_LEAN = .17;
    for (const side of [-1, 1]) {
      // The sofa's back and its cushions lean back together; everything is worked out for the east sofa and mirrored.
      const lean = BACK_LEAN, tan = Math.tan(lean), frameFront = (y: number) => 5.913 + (y - .152) * tan;
      const cushionBack = frameFront(.54), cushionFront = (y: number) => cushionBack - .28 * Math.cos(lean) + (y - .54 - .28 * Math.sin(lean)) * tan;
      build.push(() => {
        place(shadow, plane, side * 5.6, .112, 0, 3.8, 7.3, 1, -Math.PI / 2);
        wood(side * 5.45, .14, 0, 1.9, .18, 5.6, CHOCOLATE, .05);
        soft(boucle, side * 6.2, .64, 0, .4, 1.06, 5.9, { radius: .16, bulge: .02, seg: 8, seed: 4 }, OATMEAL, 0, 0, -side * lean);
        for (const z of [-2.78, 2.78]) soft(boucle, side * 5.45, .54, z, 2.0, .72, .4, { radius: .17, bulge: .03, crown: .03, seg: 8, seed: z }, CREAM);
      });
      BUNKER_SOFA_LOCAL.filter(seat => Math.sign(seat.x) === side).forEach((seat, index) => build.push(() => {
        const crown = .05, sag = .03, thickness = .26, seed = index;
        // The crown of each cushion sits exactly where a seated visitor's hips land.
        soft(boucle, seat.x, SEAT_TOP - thickness / 2 - crown + sag, seat.z, 1.5, thickness, 1.72, { radius: .1, crown, bulge: .024, sag, wrinkle: .006, seed, seg: fine }, CREAM);
        const cx = cushionBack - .14 * Math.cos(lean) + .35 * Math.sin(lean), cy = .54 + .14 * Math.sin(lean) + .35 * Math.cos(lean);
        soft(boucle, side * cx, cy, seat.z, .28, .7, 1.68, { radius: .13, crown: .03, bulge: .06, wrinkle: .007, seed: seed + 11, seg: fine }, CREAM, 0, 0, -side * lean);
      }));
      build.push(() => {
        // Loose cushions gather at the ends and between places, never where someone sits, and lie against the back cushions.
        const foot = (z: number) => ({ x: side * cushionFront(.55), y: .55, z }), inward = { x: -side, z: 0 };
        pillow(knit, foot(0), inward, lean, side * 2.24, .54, 1.1, side < 0 ? RUST : FOREST, .08);
        pillow(boucle, foot(0), inward, lean, side * 2.12, .44, 2.4, CAMEL, -.1, .21);
        pillow(knit, foot(0), inward, lean, -side * 2.24, .52, 3.1, side < 0 ? MUSTARD : RUST, -.06);
        pillow(boucle, foot(0), inward, lean, -side * 2.12, .42, 4.7, CREAM, .1, .21);
        pillow(boucle, foot(0), inward, lean, side * .9, .44, 5.2, CHOCOLATE, .05);
        // A chunky throw over one arm of each sofa.
        const armZ = 2.78 * side, path = [[4.35, .3], [4.39, .82], [4.72, 1.0], [5.45, 1.03], [6.18, 1.0], [6.5, .82], [6.54, .42]].map(([x, y]) => new THREE.Vector3(side * x, y, 0));
        place(knit, once(`throw${side}`, () => drapeGeometry(path, .64, { across: new THREE.Vector3(0, 0, 1), folds: 3, depth: .016, seed: side + 2, columns: pick(16, 8), rows: pick(28, 14), tile: KNIT_TILE })), 0, 0, armZ, 1, 1, 1, 0, 0, 0, side < 0 ? 0xcf8f58 : 0xd8c29c);
      });
    }
    build.push(() => {
      place(shadow, plane, 0, .112, .25, 4.9, 3.5, 1, -Math.PI / 2);
      for (const x of [-1.25, 1.25]) for (const z of [-.5, 1]) wood(x, .28, z, .2, .46, .2, CHOCOLATE, .03);
      wood(0, .58, .25, 3.3, .16, 2.2, 0xe6b27c, .05);
      wood(.72, .675, .32, 1.05, .03, .68, CHOCOLATE, .012);
      [[0xb3513a, .66], [0xd9c7a8, .6], [0x56603f, .52]].forEach(([color, width], i) => place(painted, box, .1, .695 + i * .055, .86, width, .05, width * .72, 0, .16 - i * .12, 0, color));
      place(painted, cup, -.36, .66, -.42, 1, 1, 1, 0, 0, 0, 0xe8dcc8);
      place(painted, cup, -.02, .66, -.56, 1, 1, 1, 0, 0, 0, 0xc2794a);
      for (const [x, z, tall] of [[.46, .32, .24], [.72, .46, .17], [.96, .22, .3]]) {
        place(painted, tin, x, .69 + tall / 2, z, .058, tall, .058, 0, 0, 0, 0xf3e7cf);
        place(glow, bulb, x, .69 + tall + .05, z, .02, .05, .02, 0, 0, 0, 0xffd28a);
        halo(x, .69 + tall + .06, z, .36, .42, .22, .07);
      }
      place(painted, vase, -.95, .66, .3, 1.25, 1.1, 1.25, 0, 0, 0, 0xf1e6d2);
      bouquet(-.95, 1.14, .3, 1.5, ROSE, 4);
      for (const [x, z] of [[-5.3, -3.85], [5.3, 3.85]] as const) {
        place(shadow, plane, x, .112, z, 1.7, 1.7, 1, -Math.PI / 2);
        for (const a of [.8, 2.4, 3.9, 5.5]) wood(x + Math.sin(a) * .3, .27, z + Math.cos(a) * .3, .06, .54, .06, CHOCOLATE, .02);
        wood(x, .58, z, .98, .07, .98, 0xe6b27c, .03);
        place(painted, lampBase, x, .615, z, .78, .8, .78, 0, 0, 0, 0xb5754a);
        lampshade(x, 1.34, z, .52, 1.9);
      }
      for (const [x, y] of [[0, 4.3], [-1.6, 4.7], [1.6, 4.9]] as const) { rod(painted, x, bunkerCeilingRise(x, .25) - .05, .25, x, y + .26, .25, .006, CORD, wire); lantern(x, y, .25, 1.15); }
    });

    // Two fireside game tables with a pouf at each side. The boards are set out here; their stones come from the live game.
    build.push(() => BUNKER_GAMES_LOCAL.forEach(({ game, x, z }, index) => {
      place(shadow, plane, x, .03, z, 4.1, 2.1, 1, -Math.PI / 2);
      for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) wood(x + dx, .31, z + dz, .13, .62, .13, CHOCOLATE, .03);
      wood(x, .655, z, 1.4, .1, 1.4, 0xe6b27c, .03);
      const look = BOARD_LOOK[game], reach0 = look.pitch * (look.size - 1), omok = game === "omok";
      if (omok) wood(x, BOARD_TOP - .016, z, 1.22, .032, 1.22, 0xffd9a3, .008);
      else place(painted, box, x, BOARD_TOP - .016, z, 1.14, .032, 1.14, 0, 0, 0, 0x2f7052);
      const lines = omok ? look.size : look.size + 1, reach = omok ? reach0 : look.pitch * look.size, ink = omok ? 0x3a2717 : 0x143a29;
      for (let i = 0; i < lines; i++) {
        const offset = i * reach / (lines - 1) - reach / 2;
        place(painted, box, x + offset, BOARD_TOP + .0006, z, .0065, .0012, reach + .0065, 0, 0, 0, ink);
        place(painted, box, x, BOARD_TOP + .0006, z + offset, reach + .0065, .0012, .0065, 0, 0, 0, ink);
      }
      [[CAMEL, RUST], [FOREST, MUSTARD]][index].forEach((color, side) => {
        const seatX = x + (side ? 1.15 : -1.15);
        place(knit, once("pouf", () => poufGeometry(.46, .36, 12, pick(36, 24), pick(14, 10))), seatX, .02, z, 1, 1, 1, 0, seatX * .3, 0, color);
      });
    }));

    /** A deep chair turned to face `yaw`, with a cushion against its back. */
    const armchair = (cx: number, cz: number, yaw: number, color: number, seed: number) => {
      const c = Math.cos(yaw), s = Math.sin(yaw), at = (u: number, v: number) => ({ x: cx + c * u + s * v, z: cz - s * u + c * v });
      place(shadow, plane, cx, .06, cz, 2.0, 2.0, 1, -Math.PI / 2);
      soft(boucle, cx, .42, cz, .95, .32, .95, { radius: .13, crown: .04, bulge: .03, seg: 6, seed }, color, 0, yaw);
      const back = at(0, -.44); soft(boucle, back.x, .95, back.z, .95, .95, .32, { radius: .15, bulge: .05, seg: 6, seed: seed + 2 }, color, -.12, yaw);
      for (const u of [-.56, .56]) { const arm = at(u, 0); soft(boucle, arm.x, .62, arm.z, .22, .52, .95, { radius: .1, bulge: .03, seg: 6, seed: seed + u }, color, 0, yaw); }
      const foot = at(0, -.28 + (.95 - .6) * Math.tan(.12));
      pillow(knit, { x: foot.x, y: .6, z: foot.z }, { x: s, z: c }, .12, 0, .44, seed + 3.3, MUSTARD);
    };

    // West wall: the fireplace, a marble surround under a timber mantel, with two chairs drawn up to it.
    build.push(() => {
      const fire = wallFrame(BUNKER_HEARTH_ANGLE), P = fire.p, yaw = fire.yaw;
      for (const u of [-1.25, 1.25]) { const q = P(u, .28); slab(floor, q.x, .8, q.z, .5, 1.6, .5, CREAMY, yaw); }
      let q = P(0, .3); slab(floor, q.x, 1.82, q.z, 3.0, .44, .6, CREAMY, yaw);
      q = P(0, .45); wood(q.x, 2.1, q.z, 3.4, .1, .5, WALNUT, .03, yaw);
      q = P(0, .22); slab(floor, q.x, 3.3, q.z, 2.6, 2.2, .44, CREAMY, yaw);
      q = P(0, .06); place(painted, box, q.x, .8, q.z, 1.9, 1.6, .1, 0, yaw, 0, 0x140e0a);
      q = P(0, 1.0); slab(floor, q.x, .04, q.z, 3.6, .08, 1.5, CREAMY, yaw);
      for (let i = 0; i < 4; i++) { const l = P((i - 1.5) * .05, .32 + (i % 2 ? .1 : -.06)); place(painted, once(`fire-log${i % 3}`, () => logGeometry(.08, .9, i % 3 + 1)), l.x, .17 + (i > 1 ? .14 : 0), l.z, 1, 1, 1, Math.PI / 2, yaw - Math.PI / 2 + i * .25, 0, 0x6e5140); }
      q = P(0, .32); place(glow, smallSphere, q.x, .12, q.z, .5, .05, .3, 0, yaw, 0, 0xff6a1e);
      q = P(0, .9); halo(q.x, .8, q.z, 2.8, .32, .13, .03);
      for (const [u, tall] of [[-1.3, .3], [-1.05, .2], [1.2, .26]]) {
        const c = P(u, .45); place(painted, tin, c.x, 2.15 + tall / 2, c.z, .06, tall, .06, 0, 0, 0, 0xf1e4cb);
        place(glow, bulb, c.x, 2.2 + tall, c.z, .02, .05, .02, 0, 0, 0, 0xffd28a); halo(c.x, 2.2 + tall, c.z, .4, .4, .2, .06);
      }
      q = P(.5, .45); place(painted, vase, q.x, 2.15, q.z, 1.0, .9, 1.0, 0, 0, 0, 0xf1e6d2); bouquet(q.x, 2.5, q.z, 1.1, LILAC, 6);
      q = P(0, .46); place(oak, ring, q.x, 3.4, q.z, .6, .6, 1.4, 0, yaw, 0, WALNUT);
      for (let i = 0; i < 12; i++) { const w = P(Math.sin(i * .524) * .6, .5); card(w.x, 3.4 + Math.cos(i * .524) * .6, w.z, .42, yaw, 0, LEAFY[i % LEAFY.length], .2, i % 3); }
      for (const u of [-1.05, 1.05]) { const chair = P(u, 2.6); armchair(chair.x, chair.z, yaw + Math.PI + u * .25, CAMEL, 4 + u); }
      const rugAt = P(0, 2.2); place(rug, cylinder, rugAt.x, .035, rugAt.z, 2.6, .07, 2.6, 0, 0, 0, 0xf3e9da);
    });

    // East wall: a daybed along the wall under a lilac throw, with a moon lamp at one end and flowers at the other.
    build.push(() => {
      const bed = wallFrame(BUNKER_DAYBED_ANGLE), P = bed.p, yaw = bed.yaw;
      let q = P(0, 1.2);
      place(shadow, plane, q.x, .012, q.z, 4.2, 4.2, 1, -Math.PI / 2);
      wood(q.x, .22, q.z, 3.2, .44, 1.9, WALNUT, .05, yaw);
      soft(boucle, q.x, .62, q.z, 3.0, .36, 1.8, { radius: .12, crown: .03, seg: 8, seed: 1 }, 0xfbf6ee, 0, yaw);
      q = P(.45, 1.25); soft(knit, q.x, .84, q.z, 2.0, .12, 1.86, { radius: .05, bulge: .03, wrinkle: .02, seed: 2, seg: 8, tile: KNIT_TILE }, 0xd9c3ea, 0, yaw);
      q = P(0, .22); wood(q.x, 1.05, q.z, 3.3, 1.5, .12, HONEY, .04, yaw);
      // Pillows stand on the mattress and lean back on the board behind them.
      const lean = .22, foot = (u: number) => { const f = P(u, .28 + .62 * Math.sin(lean)); return { x: f.x, y: .8, z: f.z }; };
      for (const [u, color, seed] of [[-1.0, 0xfbf6ee, 1], [0, 0xe6d6f2, 2], [1.0, 0xfbf6ee, 3]] as const) pillow(boucle, foot(u), bed.n, lean, 0, .62, seed + 20, color, (seed - 2) * .06);
      pillow(knit, foot(-.45), bed.n, lean, 0, .44, 31, 0xcdb4e6, .12, .21);
      for (const [u, moon] of [[-2.15, true], [2.15, false]] as const) {
        q = P(u, .6); wood(q.x, .3, q.z, .9, .6, .9, HONEY, .04, yaw);
        if (moon) { place(glow, sphere, q.x, .9, q.z, .28, .28, .28, 0, 0, 0, 0xfff1d0); place(brass, tin, q.x, .62, q.z, .16, .04, .16); halo(q.x, .9, q.z, 1.9, .3, .24, .15); }
        else { place(painted, vase, q.x, .6, q.z, 1.2, 1.1, 1.2, 0, 0, 0, 0xf1e6d2); bouquet(q.x, 1.02, q.z, 1.5, HYDRANGEA, 9); }
      }
      q = P(0, 2.8); soft(rug, q.x, .04, q.z, 3.6, .08, 2.0, { radius: .03, seg: 6, tile: 2 }, 0xfaf4ea, 0, yaw);
    });

    // Upstairs: a timber pavilion to read in, books along the back wall, and greenery either side of them.
    {
      const y = UP, pz = BUNKER_PAVILION_LOCAL.z;
    build.push(() => {
      for (const x of [-3.2, 3.2]) for (const z of [pz - 1.7, pz + 1.7]) wood(x, y + 1.5, z, .18, 3.0, .18, WALNUT, .03);
      for (const z of [pz - 1.7, pz + 1.7]) wood(0, y + 3.06, z, 6.9, .16, .2, WALNUT, .03);
      for (let i = 0; i < 9; i++) wood(-3.2 + i * .8, y + 3.2, pz, .1, .1, 4.0, HONEY, .02);
      for (let i = 0; i < pick(14, 8); i++) hangVine(-3.3 + i * 6.6 / (pick(14, 8) - 1), y + 3.1, pz + (i % 2 ? 1.8 : -1.8), .8 + rnd(i + 30) * 1.2, i + 90, i % 2 ? LILAC : undefined);
      soft(rug, 0, y + .035, pz, 5.2, .07, 3.4, { radius: .03, seg: 6, tile: 2 }, 0xf3e9da);
      for (const side of [-1, 1]) {
        wood(side * 2.3, y + .24, pz, .9, .48, 2.6, 0xd9a676, .04);
        soft(boucle, side * 2.3, y + .56, pz, .86, .18, 2.5, { radius: .07, crown: .02, seg: 5, seed: side }, 0xfbf6ee);
        wood(side * 2.72, y + .86, pz, .1, .7, 2.6, 0xd9a676, .03);
        const lean = .2, foot = { x: side * (2.67 - .5 * Math.sin(lean)), y: y + .66, z: pz };
        for (let i = 0; i < 3; i++) pillow(i % 2 ? knit : boucle, foot, { x: -side, z: 0 }, lean, side * (-.85 + i * .85), .48, i + 7 + side, [0xcdb4e6, 0xfbf6ee, 0xf2a9c0][i], (i - 1) * .07);
        lantern(side * 3.2, y + 2.4, pz, 1.2);
      }
      wood(0, y + .4, pz, 1.3, .08, 1.3, 0xe6b27c, .04); for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) wood(dx, y + .19, pz + dz, .1, .36, .1, CHOCOLATE, .02);
      place(painted, vase, 0, y + .44, pz, 1.2, 1.0, 1.2, 0, 0, 0, 0xf1e6d2); bouquet(0, y + .84, pz, 1.4, ROSE, 15);
      rod(painted, 0, bunkerCeilingRise(0, pz) - .05, pz, 0, y + 2.9, pz, .006, CORD, wire); lantern(0, y + 2.56, pz, 1.6);
    });
    build.push(() => {
      // Bays of shelves following the curve of the back wall, shallow enough to stand within a visitor's reach of the wall.
      const bays = pick(12, 9), span = .62, books = pick(9, 5);
      for (let b = 0; b < bays; b++) {
        const a = -span + 2 * span * (b + .5) / bays, frame = wallFrame(a), width = arc(-span + 2 * span * (b + 1) / bays) - arc(-span + 2 * span * b / bays) - .06;
        const back = frame.p(0, .03); place(oak, box, back.x, y + 1.6, back.z, width, 3.2, .04, 0, frame.yaw, 0, 0xc9a27a);
        for (const u of [-width / 2, width / 2]) { const post = frame.p(u, .2); wood(post.x, y + 1.6, post.z, .06, 3.2, .34, HONEY, .012, frame.yaw); }
        for (let shelf = 0; shelf < 6; shelf++) {
          const board = frame.p(0, .2); wood(board.x, y + .1 + shelf * .6, board.z, width, .06, .34, HONEY, .012, frame.yaw);
          if (shelf < 5) for (let book = 0; book < books; book++) {
            if ((shelf * 2 + b + book) % 11 === 0) continue;
            const thick = (width - .1) / books - .015, tall = .32 + ((book * 3 + shelf * 2 + b) % 5) * .04, at = frame.p(-width / 2 + .05 + (book + .5) * (width - .1) / books, .2);
            place(painted, box, at.x, y + .14 + shelf * .6 + tall / 2, at.z, thick, tall, .28, 0, frame.yaw, 0, PALETTE[(b + shelf + book) % PALETTE.length]);
          }
        }
      }
      for (const side of [-1, 1]) {
        livingWall(1, side * (span + .02), side * (T.top + .05), () => y + 1.15, () => y + 3.6, side < 0 ? ROSE : HYDRANGEA, side + 30);
        for (let i = 0; i < 4; i++) {
          const a = side * (span + .06 + i * .07), p = off(1, a, .5);
          place(painted, pot, p.x, y, p.z, .5, .5, .5, 0, 0, 0, 0xb9744a); bouquet(p.x, y + .36, p.z, 1.1, i % 2 ? IVORY : side < 0 ? ROSE : HYDRANGEA, i + side * 3 + 5);
        }
      }
    });
    }

    // Overhead: a brass chandelier of candles over the lake, and wisteria let down from the cornice all round.
    build.push(() => {
      for (const [radius, y, bulbs] of [[2.2, 8.0, 16], [1.2, 8.7, 8]] as const) {
        place(brass, ring, LAKE.x, y, LAKE.z, radius, radius, 2.4, Math.PI / 2);
        for (let i = 0; i < 6; i++) rod(painted, LAKE.x + Math.sin(i * 1.047) * radius, y, LAKE.z + Math.cos(i * 1.047) * radius, LAKE.x + Math.sin(i * 1.047) * radius * .3, bunkerCeilingRise(LAKE.x, LAKE.z) - .1, LAKE.z + Math.cos(i * 1.047) * radius * .3, .008, CORD, wire);
        for (let i = 0; i < bulbs; i++) {
          const a = i / bulbs * TAU, x = LAKE.x + Math.sin(a) * radius, z = LAKE.z + Math.cos(a) * radius;
          place(painted, tin, x, y + .1, z, .05, .16, .05, 0, 0, 0, 0xf1e6d0);
          place(glow, bulb, x, y + .25, z, .05, .09, .05, 0, 0, 0, 0xffe0a8); halo(x, y + .26, z, .9, .34, .18, .06);
        }
      }
      for (let i = 0; i < pick(30, 16); i++) {
        const a = (i + .5) / pick(30, 16) * TAU - Math.PI, p = off(1, a, .35);
        if (Math.abs(p.x) < 1.5 && p.z < 0) continue;
        hangVine(p.x, H.wall - .1, p.z, 1.6 + rnd(i + 200) * 2.2, i + 200, i % 3 ? LILAC : undefined);
      }
    });

    const shared: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
    // Each material becomes one mesh. Joining them is the slow part, so every material is a step of its own.
    build.push(() => {
      for (const [material, pieces] of batches) build.push(() => {
        for (const piece of pieces) if (!piece.index) piece.setIndex(Array.from({ length: piece.getAttribute("position").count }, (_, i) => i));
        const geometry = mergeGeometries(pieces, false)!;
        geometry.name = `${material.name}-geometry`; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        for (const piece of pieces) piece.dispose();
        geometries.add(geometry); shared.push({ geometry, material });
      });
      build.push(assemble);
    });

    /** The timber, boucle and stone are drawn once on the visitor's GPU, and only for those who actually come down the ladder. */
    bakeSurfaces = () => {
      if (baked || !options.renderer) return;
      baked = bakeCozySurfaces(options.renderer, mobile);
      oak.map = baked.wood;
      boucle.map = null; boucle.normalMap = baked.boucle; boucle.normalScale = new THREE.Vector2(.9, .9);
      knit.map = null; knit.normalMap = baked.knit; knit.normalScale = new THREE.Vector2(1.1, 1.1);
      rug.normalMap = baked.boucle; rug.normalScale = new THREE.Vector2(.9, .9);
      // Bark and boulders wear a photograph of real rock; if it cannot be fetched they fall back to drawn stone.
      // The lake is lined with the same pale marble as the floor, so its water reads clear and clean.
      const rock = options.loadTexture?.("/beach/real/rock.jpg");
      stone.map = baked.stone; basin.map = floor.map;
      if (rock) {
        rock.wrapS = rock.wrapT = THREE.RepeatWrapping; rockPhoto = rock;
        awaitRock = () => { if (!rock.image) return; stone.map = rock; awaitRock = null; };
      }
      sprays = bakeDrawn(options.renderer, pick(1024, 512), FOLIAGE_FRAG, "leaf-sprays", false);
      canopy.map = sprays.texture;
      // Trailing greenery is a photograph of a real willow; until it has arrived nothing of it is drawn.
      const photo = options.loadTexture?.("/garden/art/willow-canopy-v1.webp");
      if (photo) {
        willowPhoto = photo; willow.map = photo;
        awaitWillow = () => { if (!photo.image) return; willow.visible = true; willow.needsUpdate = true; awaitWillow = null; };
      }
      // Relief only shows where light is worked out per pixel, so a phone does not pay for it.
      if (!mobile) { stone.normalMap = baked.stoneNormal; stone.normalScale = new THREE.Vector2(.9, .9); }
      for (const material of [oak, boucle, knit, rug, stone, basin, canopy]) material.needsUpdate = true;

    };

    const assemble = () => {
      const spring = mergeGeometries(waterPieces, false)!;
      spring.name = "uyuni-bunker-spring-water-geometry"; spring.computeBoundingBox(); spring.computeBoundingSphere();
      for (const piece of waterPieces) piece.dispose();
      geometries.add(spring); shared.push({ geometry: spring, material: water });
      water.side = THREE.DoubleSide;
      const still = mergeGeometries(lagoonPieces, false)!;
      still.name = "uyuni-bunker-lagoon-geometry"; still.computeBoundingBox(); still.computeBoundingSphere();
      for (const piece of lagoonPieces) piece.dispose();
      geometries.add(still);
      const petalCount = pick(150, 70), petalGeometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(.09, .06) as unknown as THREE.InstancedBufferGeometry);
      petalGeometry.instanceCount = petalCount;
      petalGeometry.setAttribute("aPetal", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: petalCount }, (_, i) => {
        const r = (n: number) => { const v = Math.sin((i * 4 + n) * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
        return [-11 + r(0) * 22, r(1), -3 + r(2) * 25, r(3)];
      }).flat()), 4));
      geometries.add(petalGeometry);
      const petalMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: flameTime }, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, side: THREE.DoubleSide, toneMapped: false, fog: false });
      petalMaterial.name = "uyuni-bunker-petals"; materials.add(petalMaterial);
      for (const geometry of new Set([...sources, ...cached.values()])) geometry.dispose();
      // Flames and every soft glow are one small draw each.
      const flameMaterial = createBaikalFlameMaterial(flameTime), flameCount = 9;
      materials.add(flameMaterial);
      const flameGeometry = new THREE.PlaneGeometry(1, 1, 1, 6); flameGeometry.translate(0, .5, 0);
      flameGeometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: flameCount }, (_, i) => i / flameCount)), 1));
      geometries.add(flameGeometry);
      const haloGeometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
      haloGeometry.instanceCount = halos.length;
      haloGeometry.setAttribute("aHalo", new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap(item => item.slice(0, 4))), 4));
      haloGeometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(halos.flatMap(item => item.slice(4))), 3));
      geometries.add(haloGeometry);
      const haloMaterial = new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
      haloMaterial.name = "uyuni-bunker-halos"; materials.add(haloMaterial);
      const stoneGeometry = new THREE.SphereGeometry(1, 14, 8); geometries.add(stoneGeometry);
      const splashGeometry = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
      splashGeometry.instanceCount = splashes.length;
      splashGeometry.setAttribute("aDrop", new THREE.InstancedBufferAttribute(new Float32Array(splashes.flatMap(drop => drop.slice(0, 4))), 4));
      splashGeometry.setAttribute("aKick", new THREE.InstancedBufferAttribute(new Float32Array(splashes.flatMap(drop => drop.slice(4))), 4));
      geometries.add(splashGeometry);
      const splashMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: flameTime }, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, transparent: true, depthWrite: false, toneMapped: false, fog: false });
      splashMaterial.name = "uyuni-bunker-splashes"; materials.add(splashMaterial);
      for (const bunker of UYUNI_BUNKERS) {
        const room = rooms.get(bunker.id);
        if (!room) continue;
        for (const batch of shared) {
          const mesh = new THREE.Mesh(batch.geometry, batch.material); mesh.name = `${batch.material.name}-${bunker.id}`;
          if (batch.material === shadow) mesh.renderOrder = 1;
          room.add(mesh);
        }
        for (const mesh of room.children) if ((mesh as THREE.Mesh).material === basin || (mesh as THREE.Mesh).material === stone) mesh.layers.enable(BED_LAYER);
        const lagoon = new THREE.Mesh(still, lake); lagoon.name = `uyuni-bunker-lagoon-${bunker.id}`; lagoon.visible = lagoonDrawn; room.add(lagoon); lagoons.set(bunker.id, lagoon);
        const petals = new THREE.Mesh(petalGeometry, petalMaterial); petals.name = `uyuni-bunker-petals-${bunker.id}`; petals.frustumCulled = false; room.add(petals);
        const spray = new THREE.Mesh(splashGeometry, splashMaterial); spray.name = `uyuni-bunker-splashes-${bunker.id}`; spray.frustumCulled = false; spray.renderOrder = 8; room.add(spray);
        const fire = new THREE.InstancedMesh(flameGeometry, flameMaterial, flameCount);
        for (let i = 0; i < flameCount; i++) {
          const outer = i > 3;
          // The fire faces out of the west wall, so the flames stand across the hearth.
          const u = (i / (flameCount - 1) - .5) * 1.3 + Math.sin(i * 2.4) * .05, v = Math.cos(i * 2.4) * .1;
          placement.position.set(HEARTH.x + HEARTH_IN.z * u + HEARTH_IN.x * v, FIRE_FLOOR + .1, HEARTH.z - HEARTH_IN.x * u + HEARTH_IN.z * v);
          placement.rotation.set(0, Math.atan2(HEARTH_IN.x, HEARTH_IN.z), 0);
          placement.scale.set(outer ? .36 + (i % 3) * .07 : .5, outer ? .5 + (i % 4) * .1 : .8, 1);
          placement.updateMatrix(); fire.setMatrixAt(i, placement.matrix);
        }
        fire.name = `uyuni-bunker-flames-${bunker.id}`; fire.frustumCulled = false; fire.renderOrder = 6; room.add(fire); instanced.push(fire);
        const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, MAX_STONES);
        stones.name = `uyuni-bunker-stones-${bunker.id}`; stones.frustumCulled = false; stones.count = 0; stones.setColorAt(0, whiteStone); room.add(stones); roomStones.set(bunker.id, stones); instanced.push(stones);
        const glows = new THREE.Mesh(haloGeometry, haloMaterial); glows.name = `uyuni-bunker-halos-${bunker.id}`; glows.frustumCulled = false; glows.renderOrder = 7; room.add(glows);
        // These three light only the visitors; every surface of the room has its own lighting above.
        placement.rotation.set(0, 0, 0);
        const ambient = new THREE.AmbientLight(0xffe9d2, 1.5); ambient.name = `uyuni-bunker-ambient-${bunker.id}`; room.add(ambient);
        for (const [index, [x, y, z, power]] of ([[0, 6.5, 4, 110], [0, UP + 3.4, 22, 60]] as const).entries()) {
          const light = new THREE.PointLight(0xffd9ad, power, 40, 2); light.name = `uyuni-bunker-light-${bunker.id}-${index}`;
          light.position.set(x, y, z); light.castShadow = false; room.add(light);
        }
      }
      built = true;
    };
    return build;
  };

  const prepare = (budgetMs = Infinity) => {
    if (disposed || built) return built;
    steps ??= plan();
    const started = Date.now();
    while (steps.length) {
      steps.shift()!();
      if (Date.now() - started >= budgetMs) break;
    }
    // Textures are drawn last, once, so the first frame underground already has them.
    if (built) bakeSurfaces?.();
    return built;
  };
  return {
    root,
    prepare,
    setActive(id) {
      if (disposed) return;
      if (id) { prepare(); bakeSurfaces?.(); }
      activeRoom = id; shownBoards = "";
      for (const [roomId, room] of rooms) room.visible = roomId === id;
      // The hall rises past the deck it hangs under, so from inside the deck hatches would float in mid-air.
      for (const hatch of hatches) hatch.visible = !id;
    },
    setLagoonDrawn(drawn) { lagoonDrawn = drawn; for (const lagoon of lagoons.values()) lagoon.visible = drawn; },
    setBoardGames(games) {
      const stones = activeRoom ? roomStones.get(activeRoom) : undefined, key = `${activeRoom}:${games.map(game => `${game.id}@${game.version}`).join()}`;
      if (disposed || !stones || key === shownBoards) return;
      shownBoards = key;
      let count = 0;
      for (const game of games) {
        const table = BUNKER_GAMES_LOCAL.find(item => item.game === game.game), look = BOARD_LOOK[game.game];
        if (!table || game.size !== look.size) continue;
        for (let cell = 0; cell < game.cells.length && count < MAX_STONES; cell++) {
          const kind = game.cells[cell];
          if (kind !== "B" && kind !== "W") continue;
          placement.position.set(table.x + (cell % look.size - (look.size - 1) / 2) * look.pitch, BOARD_TOP + look.height, table.z + (Math.floor(cell / look.size) - (look.size - 1) / 2) * look.pitch);
          placement.scale.set(look.radius, look.height, look.radius); placement.updateMatrix();
          stones.setMatrixAt(count, placement.matrix); stones.setColorAt(count, kind === "B" ? blackStone : whiteStone); count++;
        }
      }
      stones.count = count; stones.instanceMatrix.needsUpdate = true;
      if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    },
    update(time) {
      if (disposed) return;
      awaitRock?.(); awaitWillow?.();
      flameTime.value = time;
      // Slow breathing with a small quick flicker: the room pulses, it never strobes.
      uRoomFire.value = (1 + Math.sin(time * .65) * .05 + Math.sin(time * 1.7 + .6) * .03) * (1 + (Math.sin(time * 9.3) * Math.sin(time * 5.1 + 1.3) + Math.sin(time * 13.7)) * .035);
    },
    dispose() {
      if (disposed) return;
      disposed = true; steps = null; root.removeFromParent(); root.clear(); rooms.clear();
      for (const mesh of instanced) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of ownTextures) texture.dispose();
      baked?.dispose(); sprays?.dispose(); marble?.dispose(); rockPhoto?.dispose(); willowPhoto?.dispose();
    },
  };
}
