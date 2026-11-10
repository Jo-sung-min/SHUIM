import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type CozySurfaces, bakeCozySurfaces } from "./baikal-bake";
import { type SoftBoxOptions, cushionGeometry, drapeGeometry, logGeometry, poufGeometry, softBoxGeometry } from "./baikal-cozy";
import { createBaikalFlameMaterial } from "./baikal-materials";
import { BUNKER_CEILING_Y, BUNKER_ENTRY, BUNKER_EXTENT, BUNKER_FLOOR_Y, BUNKER_GAMES_LOCAL, BUNKER_HEARTH_LOCAL, BUNKER_LADDER_LOCAL, BUNKER_LAGOON, BUNKER_SOFA_LOCAL, BUNKER_SPRING_LOCAL, BUNKER_TERRACE, UYUNI_BUNKERS, type UyuniBunkerId } from "./uyuni-bunker-layout";
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
/** Only the lagoon bed is drawn into the picture the sea engine bends through the water. Shared with the beach, which uses the same layer for its sand. */
export const BED_LAYER = 3;
/** Where water comes down the cliff into the lagoon: x across the hall, how far out from the cliff it lands, and its strength. */
export const LAGOON_FALLS: readonly (readonly [number, number, number])[] = [[0, .8, 1], [-6.3, 1.3, .6], [6.3, 1.3, .6]];
export interface UyuniBunkerOptions { renderer?: THREE.WebGLRenderer; mobile?: boolean; /** Fetches a photographic texture from the CDN, for those who go down. */ loadTexture?: (path: string) => THREE.Texture }

const CREAM = 0xf1e6d2, OATMEAL = 0xdccbb0, CAMEL = 0xb98a58, RUST = 0xa5502b, CHOCOLATE = 0x7a5a44, MUSTARD = 0xc9983a, FOREST = 0x56603f, WALNUT = 0xa27a5a, HONEY = 0xf2c595;
const IRON = 0x1d1815, STEEL = 0x59605c, OLIVE = 0x5d6548, ENAMEL = 0x9db3ad, SOIL = 0x3a2a1e;
type Tint = readonly [number, number, number];
const LAMP_TINT: Tint = [1, .69, .4], FIRE_TINT: Tint = [1, .54, .22], GROW_TINT: Tint = [1, .68, .62], WATER_TINT: Tint = [.5, .86, .8], SEAT_TOP = .52;
const E = BUNKER_EXTENT, HEARTH = BUNKER_HEARTH_LOCAL, SPRING = BUNKER_SPRING_LOCAL, UP = BUNKER_TERRACE.height;
const DAYLIT: Tint = [1, .9, .76], ROSY: Tint = [1, .76, .8];
/**
 * Every source of light in the hall: position in room coordinates, power, tint. The first is the fire and breathes.
 * They are ordered by how much of the hall they shape: a desktop shades the first few per pixel, and everything else per vertex.
 */
const ROOM_LIGHTS: readonly (readonly [number, number, number, number, Tint])[] = [
  [HEARTH.x + 1.3, 1.0, HEARTH.z, 10, FIRE_TINT],
  [0, 10.7, 6, 150, DAYLIT],
  [0, 8.3, 6, 30, LAMP_TINT],
  [0, 3.4, 12.2, 24, [1, .9, .8]],
  [0, UP + 2.6, 24.4, 22, LAMP_TINT],
  [0, 3.4, .25, 12, LAMP_TINT],
  [-5.3, 1.34, -3.85, 3.4, LAMP_TINT],
  [5.3, 1.34, 3.85, 3.4, LAMP_TINT],
  [SPRING.x, .5, SPRING.z - 2, 7, WATER_TINT],
  [-13.5, 3.5, 12.8, 10, LAMP_TINT],
  [13.5, 3.5, 12.8, 10, LAMP_TINT],
  [16.6, 1.2, -1.9, 4, [1, .88, .72]],
  [12.6, 2.4, 6.1, 6, LAMP_TINT],
  [0, 3.8, -7.3, 9, LAMP_TINT],
  [-12.6, 1.4, -3.2, 5, ROSY],
  [12.6, 1.4, -3.2, 5, [.92, .96, .78]],
  [-10.6, UP + 1.6, 22.6, 7, ROSY],
  [10.8, UP + 1.6, 22.2, 6, LAMP_TINT],
  [-15.6, 3.2, 1.6, 9, LAMP_TINT],
  [15.6, 3.2, 1.6, 9, LAMP_TINT],
  [-14.5, 1.5, 2, 4, LAMP_TINT],
  [0, 8.6, 21.5, 34, DAYLIT],
  [-12.5, 8.4, 8, 30, DAYLIT],
  [12.5, 8.4, 8, 30, DAYLIT],
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
roomFill += vec3(0.012, 0.05, 0.04) * exp(-distance(vRoomLocal.xz, ${point(SPRING.x, SPRING.z - 2)}) * 0.14);
// The room is a known box, so its corners can be darkened exactly. A surface ignores the plane it lies on.
vec3 roomEdge = min(vRoomLocal - vec3(${E.minX.toFixed(1)}, 0.0, ${E.minZ.toFixed(1)}), vec3(${E.maxX.toFixed(1)}, ${(BUNKER_CEILING_Y - BUNKER_FLOOR_Y).toFixed(1)}, ${E.maxZ.toFixed(1)}) - vRoomLocal) + abs(roomNormal) * 8.0;
vRoomShell = mix(0.4, 1.0, smoothstep(0.0, 1.5, min(roomEdge.x, min(roomEdge.y, roomEdge.z))));
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
 * Running water without a texture or a second pass. `uv.x` counts metres downstream and `uv.y` runs bank to bank;
 * the colour attribute carries the speed, how much of it is falling white water, and foam where it lands.
 */
const WATER_VERT = `
attribute vec3 color;
varying vec2 vFlow;
varying vec3 vKind;
void main() { vFlow = uv; vKind = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FRAG = `
uniform float uTime;
uniform float uRoomFire;
varying vec2 vFlow;
varying vec3 vKind;
float ripple(vec2 p) { return sin(p.x * 3.1 + sin(p.y * 4.7 + p.x * 0.9) * 1.3) * sin(p.y * 6.3 + sin(p.x * 2.3) * 1.7); }
void main() {
  float travel = uTime * vKind.r;
  vec2 p = vec2(vFlow.x - travel, vFlow.y);
  float middle = smoothstep(0.0, 0.24, vFlow.y) * smoothstep(0.0, 0.24, 1.0 - vFlow.y);
  float a = ripple(p * vec2(1.0, 2.2)), b = ripple(p * vec2(2.3, 3.7) + vec2(7.3 - travel * 0.6, 2.1));
  float glint = smoothstep(0.45, 1.0, a * 0.6 + b * 0.5 + 0.25);
  vec3 color = mix(vec3(0.42, 0.76, 0.68), vec3(0.15, 0.58, 0.54), middle);
  color += vec3(1.0, 0.74, 0.44) * glint * (0.05 + 0.13 * middle) * (0.9 + 0.1 * uRoomFire);
  color += vec3(0.6, 0.85, 0.8) * (sin(vFlow.x * 9.0 - uTime * 2.6) * 0.5 + 0.5) * vKind.b * 0.22;
  // Falling water is white where it is thick and glassy between the strands, and it frays at both edges.
  float strands = ripple(vec2(p.x * 0.5, vFlow.y * 9.0)) * 0.5 + ripple(vec2(p.x * 0.85 + 3.0, vFlow.y * 21.0)) * 0.35 + sin(vFlow.y * 47.0 + sin(p.x * 1.7) * 2.5) * 0.15;
  float thick = smoothstep(-0.45, 0.55, strands), frayed = strands * 0.05;
  float rim = smoothstep(0.0, 0.17, vFlow.y + frayed) * smoothstep(0.0, 0.17, 1.0 - vFlow.y + frayed);
  color = mix(color, mix(vec3(0.5, 0.74, 0.76), vec3(0.96, 0.99, 0.98), thick), vKind.g);
  color += vec3(0.7, 0.86, 0.8) * vKind.b * smoothstep(0.35, 0.95, b * 0.5 + 0.5) * 0.5;
  color = mix(color, vec3(0.97, 1.0, 0.99), vKind.g * vKind.b * 0.8);
  gl_FragColor = vec4(color, mix(1.0, rim * mix(0.42, 0.96, max(thick, vKind.b)), vKind.g));
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

const SPRAY_FRAG = `
varying vec2 vUv;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 cell = floor(vUv * 2.0), p = fract(vUv * 2.0) - 0.5;
  float seed = cell.x * 7.0 + cell.y * 13.0 + 1.0, cover = 0.0, tone = 0.0;
  for (int i = 0; i < 26; i++) {
    float n = seed + float(i) * 3.7, angle = hash(n) * 6.2832, reach = sqrt(hash(n + 1.0)) * 0.36;
    vec2 d = p - vec2(cos(angle), sin(angle)) * reach;
    float turn = hash(n + 2.0) * 6.2832, c = cos(turn), s = sin(turn), size = 0.07 + hash(n + 3.0) * 0.05;
    d = vec2(d.x * c + d.y * s, d.y * c - d.x * s);
    float leaf = 1.0 - length(d / vec2(size, size * 0.52)) - abs(d.x) / size * 0.25;
    if (leaf > 0.0) { cover = 1.0; tone = max(tone, 0.74 + 0.26 * smoothstep(0.0, 0.5, leaf) - 0.1 * step(abs(d.y), size * 0.03)); }
  }
  gl_FragColor = vec4(vec3(max(tone, 0.8)), cover);
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
  const indoor = (name: string, parameters: THREE.MeshStandardMaterialParameters, flags: { fabric?: boolean; cavity?: number; leafy?: boolean; gloss?: boolean } = {}) => {
    const material = new THREE.MeshStandardMaterial({ roughness: .86, ...parameters, fog: false });
    material.name = `uyuni-bunker-${name}`; materials.add(material);
    const gloss = flags.gloss ? GLOSS_LIGHTS : 0, leafy = flags.leafy === true;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { uRoomLight, uRoomTint, uRoomFire, uRoomSway: flameTime });
      shader.vertexShader = (leafy ? "#define ROOM_SWAY\n" : "") + shader.vertexShader
        .replace("#include <common>", `#include <common>\n${ROOM_PARS}${leafy ? "\nuniform float uRoomSway;\nattribute float aSway;" : ""}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${roomVertex(PIXEL_LIGHTS, leafy)}`);
      let fragment = (flags.fabric ? "#define ROOM_FABRIC\n" : "") + shader.fragmentShader;
      fragment = fragment.replace("#include <common>", `#include <common>\n${ROOM_PARS}`)
        .replace("#include <lights_fragment_begin>", WARM_LIGHT_BEGIN)
        .replace("#include <aomap_fragment>", `${roomFragment(PIXEL_LIGHTS, gloss, leafy)}\n#include <aomap_fragment>`);
      if (flags.cavity !== undefined) fragment = fragment.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\ndiffuseColor.rgb *= mix(${flags.cavity.toFixed(2)}, 1.0, texture2D(normalMap, vNormalMapUv).a);\n#endif`);
      shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => `uyuni-bunker-room-${PIXEL_LIGHTS}-${gloss}-${flags.fabric ? 1 : 0}-${leafy ? 1 : 0}-${flags.cavity ?? "n"}`;
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
  let steps: (() => void)[] | null = null, bakeSurfaces: (() => void) | null = null, awaitRock: (() => void) | null = null;

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
    const basin = indoor("lagoon-bed", { vertexColors: true, roughness: .9 });
    const canopy = indoor("leaf-sprays", { vertexColors: true, roughness: .8, side: THREE.DoubleSide, alphaTest: .5 }, { leafy: true });
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
      const piece = geometry.clone();
      transform.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
      piece.applyMatrix4(transform);
      if (material === floor || material === oak || material === concrete || material === stone || material === basin) {
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
      if (material === foliage || material === canopy) piece.setAttribute("aSway", new THREE.Float32BufferAttribute(new Array(count).fill(0), 1));
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
    /** A scatter cushion stood up against whatever is behind it, leaning back by `lean`. */
    const pillow = (material: THREE.Material, x: number, y: number, z: number, size: number, seed: number, color: number, facing: number, lean = 1.22) => {
      const key = `c${size},${seed}`;
      place(material, once(key, () => cushionGeometry(size, size, .2, seed, pick(10, 6), KNIT_TILE)), x, y, z, 1, 1, 1, lean, facing, seed * .13 - .2, color);
    };
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
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], kinds: number[] = [], indices: number[] = [], length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      for (let i = 0; i <= cells; i++) for (let bank = 0; bank <= 1; bank++) {
        const t = i / cells, across = (bank - .5) * width, thrown = fall ? Math.sqrt(t) : t;
        positions.push(a[0] + (b[0] - a[0]) * thrown + side[0] * across, a[1] + (b[1] - a[1]) * t + side[1] * across, a[2] + (b[2] - a[2]) * thrown + side[2] * across);
        normals.push(0, 1, 0); uvs.push(from + length * t, bank); kinds.push(speed, fall, foam[0] * Math.max(0, 1 - t * 5) + foam[1] * Math.max(0, t * 5 - 4));
      }
      for (let i = 0; i < cells; i++) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(kinds, 3));
      geometry.setIndex(indices); waterPieces.push(geometry);
    };
    const h = BUNKER_CEILING_Y - BUNKER_FLOOR_Y, W = E.maxX - E.minX, D = E.maxZ - E.minZ, midZ = (E.minZ + E.maxZ) / 2;
    const FIRE_FLOOR = .1, PALETTE = [0x9c4a2c, 0xc69a54, 0x6a3f2a, 0x56603f, 0xdac6a4, 0x7c5a40, 0xad6e3f];
    const T = BUNKER_TERRACE, LG = BUNKER_LAGOON, EN = BUNKER_ENTRY, CREAMY = 0xf6efe2, BARK = 0x6a5442, CORD = 0xa08a68;
    const BLUSH = [0xf7c6d4, 0xf2a9c0, 0xfbe1e8, 0xf6b8cc], LILAC = [0xcdb4e6, 0xb79adb, 0xe3d3f2, 0xf2d6ea], LEAFY = [0x7fa04c, 0x6f8f45, 0x94b45c, 0x5f7a3a];
    const rnd = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const wire = once("wire", () => new THREE.CylinderGeometry(1, 1, 1, 3, 1, true));
    /** A spray of leaves or blossom on a card. The atlas holds four different sprays; each card takes one, and moves in the air as a whole. */
    const card = (x: number, y: number, z: number, size: number, yaw: number, tilt: number, color: number, sway = 1) => {
      const piece = place(canopy, plane, x, y, z, size, size, 1, tilt, yaw, 0, color), uv = piece.getAttribute("uv"), wave = piece.getAttribute("aSway"), cell = Math.floor(rnd(x * 3.1 + y * 7.7 + z * 5.3) * 4);
      for (let i = 0; i < uv.count; i++) { wave.setX(i, sway * (.6 + .4 * uv.getY(i))); uv.setXY(i, (uv.getX(i) + cell % 2) * .5, (uv.getY(i) + Math.floor(cell / 2)) * .5); }
    };
    /** A real tree in outline: a leaning trunk in bark, boughs reaching out, and a crown built from hundreds of sprays. */
    const tree = (x: number, y: number, z: number, height: number, spread: number, palette: readonly number[], seed: number) => {
      let px = x, py = y, pz = z;
      for (let i = 0; i < 3; i++) {
        const nx = x + (rnd(seed + i) - .5) * .28 * (i + 1), ny = y + height * .5 * (i + 1) / 3, nz = z + (rnd(seed + i + 9) - .5) * .28 * (i + 1);
        rod(stone, px, py, pz, nx, ny, nz, .22 - i * .045, BARK, drum); px = nx; py = ny; pz = nz;
      }
      const tips: [number, number, number][] = [[px, py + height * .42, pz]];
      for (let b = 0; b < 6; b++) {
        const a = b / 6 * Math.PI * 2 + seed, reach = spread * (.55 + rnd(seed + b * 3.3) * .35), bx = px + Math.sin(a) * reach, by = py + height * (.2 + rnd(seed + b) * .24), bz = pz + Math.cos(a) * reach;
        rod(stone, px, py - .1, pz, bx, by, bz, .07, BARK);
        tips.push([bx, by, bz]);
      }
      for (const [bx, by, bz] of tips) for (let i = 0; i < pick(56, 22); i++) {
        const n = seed * 13.7 + bx * 3.1 + i * 1.618, r = spread * .44 * Math.cbrt(rnd(n)), a = rnd(n + 1) * Math.PI * 2, e = (rnd(n + 2) - .35) * 1.6;
        card(bx + Math.sin(a) * Math.cos(e) * r, by + Math.sin(e) * r * .7, bz + Math.cos(a) * Math.cos(e) * r, .85 + rnd(n + 3) * .65, rnd(n + 4) * Math.PI, (rnd(n + 5) - .5) * 1.2, palette[Math.floor(rnd(n + 6) * palette.length)], .5 + rnd(n + 7));
      }
      for (let i = 0; i < pick(10, 0); i++) {
        const n = seed * 3.3 + i * 2.1;
        hangVine(px + (rnd(n) - .5) * spread * 1.5, py + height * (.18 + rnd(n + 1) * .12), pz + (rnd(n + 2) - .5) * spread * 1.5, .6 + rnd(n + 3) * .9, n, palette);
      }
    };
    /** A vine let down from above. With `blossom` its lower third flowers, like wisteria. */
    const hangVine = (x: number, y: number, z: number, length: number, seed: number, blossom?: readonly number[]) => {
      const count = Math.max(3, Math.round(length / pick(.3, .5)));
      if (!mobile) rod(painted, x, y, z, x, y - length, z, .006, 0x4a5a30, wire);
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, n = seed * 9.1 + i * 2.7, tip = blossom !== undefined && t > .6;
        card(x + (rnd(n) - .5) * .2, y - length * t, z + (rnd(n + 1) - .5) * .2, tip ? .56 : .46, rnd(n + 2) * Math.PI, (rnd(n + 3) - .5) * .5, tip ? blossom[i % blossom.length] : LEAFY[i % LEAFY.length], .4 + t * 1.8);
      }
    };
    /** Round heads of flowers over a few leaves: in beds, in pots and in vases. */
    const bouquet = (x: number, y: number, z: number, scale: number, colors: readonly number[], seed: number) => {
      for (let i = 0; i < pick(9, 5); i++) {
        const n = seed * 5.3 + i * 1.9, a = rnd(n) * Math.PI * 2, r = Math.sqrt(rnd(n + 1)) * .2 * scale;
        card(x + Math.sin(a) * r, y + (.3 + rnd(n + 2) * .16) * scale, z + Math.cos(a) * r, (.36 + rnd(n + 3) * .16) * scale, a, -.25 - rnd(n + 4) * .9, colors[i % colors.length], .3);
      }
      for (let i = 0; i < pick(3, 2); i++) {
        const n = seed * 3.9 + i * 2.3, a = rnd(n) * Math.PI * 2, size = (.05 + rnd(n + 3) * .025) * scale;
        place(painted, blossom, x + Math.sin(a) * .1 * scale, y + (.34 + rnd(n + 2) * .12) * scale, z + Math.cos(a) * .1 * scale, size, size * .85, size, 0, n, 0, colors[(i + 1) % colors.length]);
      }
      rosette(x, y, z, pick(6, 4), .36 * scale, 1.0, Math.abs(seed), 1.1);
    };
    /** Marble posts under a timber handrail, level or climbing a stair. */
    const balustrade = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const posts = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.35));
      for (let i = 0; i <= posts; i++) { const t = i / posts; place(floor, box, ax + (bx - ax) * t, ay + (by - ay) * t + .45, az + (bz - az) * t, .13, .9, .13, 0, 0, 0, CREAMY); }
      rod(oak, ax, ay + .94, az, bx, by + .94, bz, .055, WALNUT, pipe);
      rod(brass, ax, ay + .5, az, bx, by + .5, bz, .016, 0xffffff, pipe);
    };
    const column = (x: number, z: number, height: number) => {
      place(floor, drum, x, height / 2, z, .26, height, .26);
      for (const y of [.12, height - .12]) place(floor, box, x, y, z, .7, .24, .7, 0, 0, 0, CREAMY);
    };
    const lantern = (x: number, y: number, z: number, scale = 1) => {
      for (const dy of [-.2, .2]) place(oak, box, x, y + dy * scale, z, .2 * scale, .03 * scale, .2 * scale, 0, 0, 0, WALNUT);
      place(glow, box, x, y, z, .15 * scale, .36 * scale, .15 * scale, 0, 0, 0, 0xffdca0);
      halo(x, y, z, 1.5 * scale, .3, .17, .06);
    };
    const armchair = (x: number, z: number, color: number, back: number, seed: number) => {
      place(shadow, plane, x, .06, z, 2.0, 2.0, 1, -Math.PI / 2);
      soft(boucle, x, .42, z, .95, .32, .95, { radius: .13, crown: .04, bulge: .03, seg: 6, seed }, color);
      soft(boucle, x + back * .44, .95, z, .32, .95, 1.0, { radius: .15, bulge: .05, seg: 6, seed: seed + 2 }, color, 0, 0, back * .12);
      for (const dz of [-.56, .56]) soft(boucle, x, .62, z + dz, .95, .52, .22, { radius: .1, bulge: .03, seg: 6, seed: seed + dz }, color);
    };
    /** An arched niche of lit alabaster in a timber frame: the hall has no windows, and these stand in for them. */
    const niche = (x: number, y: number, z: number, ry: number) => {
      const sx = Math.sin(ry), sz = Math.cos(ry);
      place(glow, plane, x + sx * .03, y, z + sz * .03, 1.5, 3.2, 1, 0, ry, 0, 0xffe6bd);
      place(glow, cylinder, x + sx * .03, y + 1.6, z + sz * .03, .75, .02, .75, Math.PI / 2, ry, 0, 0xffe6bd);
      for (const side of [-1, 1]) place(oak, box, x + sz * side * .8, y, z - sx * side * .8, .12, 3.3, .12, 0, ry, 0, WALNUT);
      place(oak, box, x, y - 1.64, z, 1.8, .12, .16, 0, ry, 0, WALNUT);
      halo(x + sx * .4, y + .4, z + sz * .4, 4.2, .2, .15, .09);
    };
    /**
     * A rock face cut from one sheet: beds of stone about a metre thick, each broken into blocks that stand proud or sit back,
     * with moss wherever a ledge catches the light. `wet` lists where water comes down it: the rock there is worn smooth and dark,
     * and beside the middle a buttress up to `shelf` catches the smaller falls. Returns how far the face stands out at a point.
     */
    const crag = (x0: number, x1: number, y0: number, y1: number, z: number, seed: number, wet: readonly number[], shelf: number) => {
      const ease = (v: number) => { const t = Math.min(1, Math.max(0, v)); return t * t * (3 - 2 * t); };
      const worn = (x: number) => { let most = 0; for (const at of wet) most = Math.max(most, Math.exp(-(((x - at) / (at ? 1 : 1.9)) ** 2))); return most; };
      const relief = (x: number, y: number) => {
        const bed = (y - y0) / 1.05 + Math.sin(x * .31 + seed) * .22, course = Math.floor(bed), width = 1.5 + rnd(course * 3.7 + seed) * 1.7;
        const run = x / width + rnd(course * 9.1 + seed) * 7, block = Math.floor(run), smooth = worn(x);
        const joint = Math.min(run - block, 1 - run + block) * width, parting = Math.min(bed - course, 1 - bed + course) * 1.05;
        const proud = (rnd(block * 12.9 + course * 78.2 + seed) * .5 + rnd(course * 5.3 + seed) * .22) * (1 - smooth * .85);
        let out = proud * ease(Math.min(joint, parting) / .2) + .07 * Math.sin(x * 2.3 + y * 1.7 + seed) * Math.sin(y * 3.1 - x * .7) + (1 - (y - y0) / (y1 - y0)) * .3 * (1 - smooth * .6);
        for (const at of wet) if (at && y < shelf) out = Math.max(out, .95 * ease((1.15 - Math.abs(x - at)) / .3) * ease((shelf - y) / .12));
        return out * ease((y1 - y) / .25) * ease(Math.min(x - x0, x1 - x) / .4);
      };
      const nx = pick(88, 44), ny = pick(26, 14), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny;
        positions.push(x, y, z - relief(x, y)); uvs.push(0, 0);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const normal = geometry.getAttribute("normal"), shades: number[] = [], rock = new THREE.Color(), dim = new THREE.Color(0x8f887c), moss = new THREE.Color(), deep = new THREE.Color(0x4a6332), fresh = new THREE.Color(0x7d9a4a);
      for (let k = 0; k < normal.count; k++) {
        const x = positions[k * 3], y = positions[k * 3 + 1], grain = rnd(Math.floor(x / 1.7) * 3.3 + Math.floor(y / 1.05) * 7.1 + seed), smooth = worn(x);
        // Faces turned away from the hall are the sides of blocks and the joints between them, where little light gets in.
        const side = 1 - ease((-normal.getZ(k) - .5) / .4), ledge = ease((normal.getY(k) - .22) / .4);
        const patch = ease((Math.sin(x * 1.3 + seed) * Math.sin(y * 1.9 + x * .4) - .3) / .35), tide = ease((LG.level + .4 - y) / .3);
        rock.set(0xd6d0c4).lerp(dim, grain * .55).multiplyScalar((1 - side * .32) * (1 - smooth * .34) * (1 - tide * .3));
        moss.copy(deep).lerp(fresh, rnd(k * .37 + seed));
        rock.lerp(moss, Math.min(.92, ledge * .9 + patch * .4 * (1 - smooth) + tide * .35));
        shades.push(rock.r, rock.g, rock.b);
      }
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
      const piece = place(stone, geometry, 0, 0, 0), position = piece.getAttribute("position"), uv = piece.getAttribute("uv");
      // One projection for the whole face, leaning back so ledge tops are not smeared: the photograph never tears at a block's edge.
      for (let k = 0; k < uv.count; k++) uv.setXY(k, position.getX(k) * STONE_TILE, (position.getY(k) - position.getZ(k) * .8) * STONE_TILE);
      geometry.dispose();
      return relief;
    };
    /** A boulder: a ball knocked out of round. Three shapes turned and squashed differently are enough that no two look alike. */
    const boulder = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, color: number) => {
      const shape = Math.abs(Math.round(seed)) % 3;
      place(material, once(`boulder${shape}`, () => {
        const ball = new THREE.SphereGeometry(1, pick(8, 6), pick(6, 4)), position = ball.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          // Rounded first, so the two ends of the seam get the same knock and stay closed.
          const px = Math.round(position.getX(i) * 100), py = Math.round(position.getY(i) * 100), pz = Math.round(position.getZ(i) * 100), knock = .78 + rnd(px * .123 + py * .456 + pz * .789 + shape) * .44;
          position.setXYZ(i, position.getX(i) * knock, position.getY(i) * knock, position.getZ(i) * knock);
        }
        ball.computeVertexNormals();
        return ball;
      }), x, y, z, sx, sy, sz, rnd(seed + 5) * .5 - .25, rnd(seed + 6) * 6.28, rnd(seed + 7) * .5 - .25, color);
    };
    const build: (() => void)[] = [];
    build.push(() => { const weave = rugTexture(128); ownTextures.add(weave); rug.map = weave; });
    build.push(() => { const skim = plasterTexture(128); ownTextures.add(skim); concrete.map = skim; });
    build.push(() => {
      if (options.renderer) { marble = bakeDrawn(options.renderer, pick(1024, 512), MARBLE_FRAG, "white-marble", true); floor.map = marble.texture; }
      else { const veined = marbleTexture(64); ownTextures.add(veined); floor.map = veined; }
    });

    // The shell: polished marble underfoot, warm timber to shoulder height and above, cream plaster up to a coffered vault.
    build.push(() => {
      sheet(floor, 0, 0, (E.minZ + LG.minZ) / 2, W, LG.minZ - E.minZ, -Math.PI / 2, 0);
      for (const side of [-1, 1]) sheet(floor, side * (LG.maxX + T.stairInner) / 2, 0, (LG.minZ + T.z) / 2, T.stairInner - LG.maxX, T.z - LG.minZ, -Math.PI / 2, 0);
      sheet(floor, 0, T.height, (T.z + E.maxZ) / 2, W, E.maxZ - T.z, -Math.PI / 2, 0, 0xfbf6ee);
      sheet(concrete, 0, h, midZ, W, D, Math.PI / 2, 0, CREAMY);
      const low = T.z - E.minZ;
      for (const side of [-1, 1]) {
        sheet(oak, side * E.maxX, T.height / 2, E.minZ + low / 2, low, T.height, 0, -side * Math.PI / 2, 0xe2bd94);
        sheet(concrete, side * E.maxX, (T.height + h) / 2, midZ, D, h - T.height, 0, -side * Math.PI / 2, CREAMY);
        slab(oak, side * (E.maxX - .06), T.height + .06, E.minZ + low / 2, .12, .2, low, WALNUT);
      }
      sheet(oak, 0, T.height / 2, E.minZ, W, T.height, 0, 0, 0xe2bd94);
      sheet(concrete, 0, (T.height + h) / 2, E.minZ, W, h - T.height, 0, 0, CREAMY);
      sheet(concrete, 0, (T.height + h) / 2, E.maxZ, W, h - T.height, 0, Math.PI, CREAMY);
      for (const z of [-4, 1, 11, 16, 21, 26]) slab(oak, 0, h - .2, z, W, .4, .34, WALNUT);
      for (const x of [-12, -6, 6, 12]) slab(oak, x, h - .15, midZ, .3, .3, D, WALNUT);
      // Lit niches high on the walls where windows would be.
      for (const z of [-2, 3.5, 13, 19.5, 24]) for (const side of [-1, 1]) niche(side * (E.maxX - .02), 8.1, z, -side * Math.PI / 2);
      for (const x of [-12, -6, 0, 6, 12]) niche(x, 8.3, E.maxZ - .02, Math.PI);
    });

    // The front gallery, which the ladder comes down under, and the two side galleries it runs into.
    build.push(() => {
      slab(floor, 0, EN.ceiling + .2, (E.minZ + EN.z) / 2, W, .4, EN.z - E.minZ, CREAMY);
      sheet(oak, 0, EN.ceiling - .01, (E.minZ + EN.z) / 2, W, EN.z - E.minZ, Math.PI / 2, 0, HONEY);
      slab(oak, 0, EN.ceiling + .2, EN.z + .03, W, .5, .08, WALNUT);
      for (const x of [-13, -4.5, 4.5, 13]) column(x, EN.z, EN.ceiling);
      balustrade(E.minX + .2, EN.ceiling + .4, EN.z + .1, E.maxX - .2, EN.ceiling + .4, EN.z + .1);
      for (let i = 0; i < pick(30, 16); i++) {
        const x = E.minX + .8 + i * (W - 1.6) / (pick(30, 16) - 1), centre = Math.abs(x) < 2.6;
        hangVine(x, EN.ceiling + .1, EN.z + .16, centre ? .9 : 1.3 + rnd(i) * 1.5, i + 3, i % 3 === 0 ? LILAC : undefined);
      }
      for (const side of [-1, 1]) {
        const x = side * 16.7, z0 = EN.z, z1 = T.stairZ;
        slab(floor, x, T.height - .2, (z0 + z1) / 2, 2.6, .4, z1 - z0, CREAMY);
        for (let z = z0 + 1.2; z < z1; z += 3.2) { slab(oak, x, T.height - .56, z, 2.6, .32, .2, WALNUT); lantern(side * 15.8, T.height - 1.0, z, .9); }
        balustrade(side * 15.5, T.height, z0 + .2, side * 15.5, T.height, z1);
        for (let i = 0; i < pick(12, 7); i++) hangVine(side * 15.36, T.height - .1, z0 + .8 + i * (z1 - z0 - 1.2) / (pick(12, 7) - 1), 1.0 + rnd(i + side * 7 + 20) * 1.6, i + 40 + side, i % 2 ? LILAC : undefined);
        for (let i = 0; i < 4; i++) { place(painted, pot, side * 17.1, T.height, z0 + 1.6 + i * 3.4, .5, .5, .5, 0, 0, 0, 0xb9744a); bouquet(side * 17.1, T.height + .36, z0 + 1.6 + i * 3.4, 1.1, i % 2 ? BLUSH : LILAC, i + side * 3 + 5); }
      }
    });

    // Under the hatch: the ladder, a console with flowers, and lanterns hung low so the hall beyond looks all the higher.
    build.push(() => {
      const ladderZ = BUNKER_LADDER_LOCAL.z, top = EN.ceiling;
      for (const x of [-.52, .52]) place(oak, cylinder, x, top / 2, ladderZ, .05, top, .05, -.09, 0, 0, WALNUT);
      for (let rung = 0; rung < 14; rung++) {
        const y = .35 + rung * .36, z = ladderZ - (y - top / 2) * .09;
        place(oak, cylinder, 0, y, z, .045, 1.12, .045, 0, 0, Math.PI / 2, HONEY);
      }
      wood(0, top - .032, ladderZ - .25, 1.55, .045, 1.5, HONEY, .02);
      place(brass, torus, 0, top - .067, ladderZ - .25, 1, 1, 1, Math.PI / 2);
      place(shadow, plane, 0, .012, ladderZ, 2.4, 1.8, 1, -Math.PI / 2);
      soft(rug, 0, .035, -4.2, 3.2, .06, 1.8, { radius: .025, seg: 4, tile: 2 }, 0xead9c6);
      for (const x of [-3.2, 3.2]) { rod(painted, x, top, -7.2, x, 4.3, -7.2, .006, IRON); lantern(x, 4.05, -7.2, 1.2); }
      for (const side of [-1, 1]) {
        wood(side * 7.6, .8, E.minZ + .34, 2.6, .07, .6, 0xe6b27c, .03);
        for (const dx of [-1.1, 1.1]) wood(side * 7.6 + dx, .39, E.minZ + .34, .08, .78, .5, CHOCOLATE, .02);
        place(painted, vase, side * 7.6, .835, E.minZ + .34, 1.1, 1.0, 1.1, 0, 0, 0, 0xf1e6d2);
        bouquet(side * 7.6, 1.2, E.minZ + .34, 1.5, side < 0 ? BLUSH : LILAC, side + 2);
        for (const dx of [-.8, .85]) { place(painted, tin, side * 7.6 + dx, .93, E.minZ + .4, .05, .18, .05, 0, 0, 0, 0xf3e7cf); place(glow, bulb, side * 7.6 + dx, 1.07, E.minZ + .4, .02, .05, .02, 0, 0, 0, 0xffd28a); halo(side * 7.6 + dx, 1.08, E.minZ + .4, .4, .42, .22, .07); }
      }
    });

    // Two trees in marble planters either side of the lounge: one in blossom, one in leaf.
    build.push(() => {
      for (const side of [-1, 1]) {
        const x = side * 12.6, z = -3.2;
        place(floor, drum, x, .3, z, .95, .6, .95, 0, 0, 0, CREAMY);
        place(painted, cylinder, x, .6, z, .85, .04, .85, 0, 0, 0, SOIL);
        place(shadow, plane, x, .012, z, 3.0, 3.0, 1, -Math.PI / 2);
        tree(x, .6, z, side < 0 ? 4.6 : 4.2, 2.3, side < 0 ? BLUSH : LEAFY, side < 0 ? 3 : 8);
        for (let i = 0; i < 5; i++) rosette(x + Math.sin(i * 1.26) * .6, .62, z + Math.cos(i * 1.26) * .6, pick(6, 4), .4, 1.0, i + 2);
      }
    });

    // The lounge: a deep white rug, two sofas facing each other over a slab table, and three lanterns hung low over it.
    build.push(() => soft(rug, 0, .05, .1, 12.9, .1, 7.5, { radius: .04, seg: 10, tile: 1 / .5 }, 0xf6f0e6));
    for (const side of [-1, 1]) {
      const facing = -side * Math.PI / 2;
      build.push(() => {
        place(shadow, plane, side * 5.5, .112, 0, 3.6, 7.3, 1, -Math.PI / 2);
        wood(side * 5.4, .14, 0, 1.72, .18, 5.6, CHOCOLATE, .05);
        soft(boucle, side * 6.16, .62, 0, .46, 1.04, 5.9, { radius: .16, bulge: .02, seg: 8, seed: 4 }, OATMEAL);
        for (const z of [-2.78, 2.78]) soft(boucle, side * 5.4, .54, z, 1.98, .72, .4, { radius: .17, bulge: .03, crown: .03, seg: 8, seed: z }, CREAM);
      });
      BUNKER_SOFA_LOCAL.filter(seat => Math.sign(seat.x) === side).forEach((seat, index) => build.push(() => {
          const crown = .05, sag = .03, thickness = .26, seed = index;
          // The crown of each cushion sits exactly where a seated visitor's hips land.
          soft(boucle, seat.x, SEAT_TOP - thickness / 2 - crown + sag, seat.z, 1.5, thickness, 1.72, { radius: .1, crown, bulge: .024, sag, wrinkle: .006, seed, seg: fine }, CREAM);
          soft(boucle, side * 5.93, .9, seat.z, .36, .74, 1.68, { radius: .15, crown: .03, bulge: .07, wrinkle: .007, seed: seed + 11, seg: fine }, CREAM, 0, 0, side * .17);
      }));
      build.push(() => {
        // Loose cushions gather at the ends and between places, never where someone sits.
        pillow(knit, side * 5.72, .88, 2.42 * side, .54, 1.1, side < 0 ? RUST : FOREST, facing);
        pillow(boucle, side * 5.5, .84, 2.2 * side, .46, 2.4, CAMEL, facing + .3);
        pillow(knit, side * 5.72, .88, -2.42 * side, .52, 3.1, side < 0 ? MUSTARD : RUST, facing);
        pillow(boucle, side * 5.5, .84, -2.18 * side, .44, 4.7, CREAM, facing - .25);
        pillow(boucle, side * 5.74, .9, .9 * side, .46, 5.2, CHOCOLATE, facing);
        // A chunky throw over one arm of each sofa.
        const armZ = 2.78 * side, path = [[4.3, .3], [4.34, .8], [4.68, 1], [5.4, 1.03], [6.12, 1], [6.46, .8], [6.5, .42]].map(([x, y]) => new THREE.Vector3(side * x, y, 0));
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
      bouquet(-.95, 1.14, .3, 1.5, BLUSH, 4);
      for (const [x, z] of [[-5.3, -3.85], [5.3, 3.85]] as const) {
        place(shadow, plane, x, .112, z, 1.7, 1.7, 1, -Math.PI / 2);
        for (const a of [.8, 2.4, 3.9, 5.5]) wood(x + Math.sin(a) * .3, .27, z + Math.cos(a) * .3, .06, .54, .06, CHOCOLATE, .02);
        wood(x, .58, z, .98, .07, .98, 0xe6b27c, .03);
        place(painted, lampBase, x, .615, z, .78, .8, .78, 0, 0, 0, 0xb5754a);
        lampshade(x, 1.34, z, .52, 1.9);
      }
      for (const [x, y] of [[0, 4.3], [-1.6, 4.7], [1.6, 4.9]] as const) { rod(painted, x, h, .25, x, y + .26, .25, .006, CORD, wire); lantern(x, y, .25, 1.15); }
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

    // West wall: books to the gallery either side of a marble fireplace with a timber mantel, and two chairs drawn up to it.
    {
      const HX = BUNKER_HEARTH_LOCAL.x, HZ = BUNKER_HEARTH_LOCAL.z, wallX = E.minX;
    build.push(() => {
      for (const z0 of [-4.4, 4.6]) {
        const zc = z0 + 1.9, books = pick(11, 6);
        for (const dz of [-1.9, 0, 1.9]) wood(wallX + .3, 2.1, zc + dz, .5, 4.2, .08, HONEY, .012);
        for (let shelf = 0; shelf < 7; shelf++) {
          const y = .12 + shelf * .66;
          wood(wallX + .3, y, zc, .5, .07, 3.8, HONEY, .012);
          if (shelf < 6) for (let bay = 0; bay < 2; bay++) for (let book = 0; book < books; book++) {
            if ((shelf * 3 + bay + book) % 11 === 0) continue;
            const thick = 1.7 / books - .015, tall = .36 + ((book * 3 + shelf * 2 + bay) % 5) * .04;
            place(painted, box, wallX + .34, y + .04 + tall / 2, zc - 1.75 + bay * 1.9 + book * 1.7 / books, .34, tall, thick, 0, 0, 0, PALETTE[(bay + shelf + book) % PALETTE.length]);
          }
        }
      }
    });
    build.push(() => {
      for (const dz of [-.22, .22]) rod(oak, wallX + 1.3, 0, 6.5 + dz, wallX + .55, 4.0, 6.5 + dz, .03, WALNUT);
      for (let i = 1; i < 9; i++) rod(oak, wallX + 1.3 - .75 * i / 9.5, 4.0 * i / 9.5, 6.28, wallX + 1.3 - .75 * i / 9.5, 4.0 * i / 9.5, 6.72, .02, HONEY);
      for (const dz of [-1.2, 1.2]) slab(floor, HX + .15, .8, HZ + dz, .8, 1.6, .5, CREAMY);
      slab(floor, HX + .15, 1.82, HZ, .8, .44, 2.9, CREAMY);
      wood(HX + .3, 2.1, HZ, 1.0, .1, 3.3, WALNUT, .03);
      slab(floor, HX - .1, 3.3, HZ, .5, 2.2, 2.5);
      place(painted, box, HX - .3, .8, HZ, .1, 1.6, 1.9, 0, 0, 0, 0x140e0a);
      slab(floor, HX + 1.0, .04, HZ, 1.7, .08, 3.6, CREAMY);
      for (let i = 0; i < 4; i++) place(painted, once(`fire-log${i % 3}`, () => logGeometry(.08, .9, i % 3 + 1)), HX + .15 + (i % 2 ? .1 : -.08), .17 + (i > 1 ? .14 : 0), HZ + (i - 1.5) * .05, 1, 1, 1, Math.PI / 2, i * .25, 0, 0x6e5140);
      place(glow, smallSphere, HX + .15, .12, HZ, .3, .05, .5, 0, 0, 0, 0xff6a1e);
      halo(HX + .8, .8, HZ, 2.8, .32, .13, .03);
      for (const [dz, tall] of [[-1.3, .3], [-1.05, .2], [1.2, .26]]) {
        place(painted, tin, HX + .3, 2.15 + tall / 2, HZ + dz, .06, tall, .06, 0, 0, 0, 0xf1e4cb);
        place(glow, bulb, HX + .3, 2.2 + tall, HZ + dz, .02, .05, .02, 0, 0, 0, 0xffd28a); halo(HX + .36, 2.2 + tall, HZ + dz, .4, .4, .2, .06);
      }
      place(painted, vase, HX + .3, 2.15, HZ + .5, 1.0, .9, 1.0, 0, 0, 0, 0xf1e6d2); bouquet(HX + .3, 2.5, HZ + .5, 1.1, LILAC, 6);
      place(oak, ring, HX + .18, 3.4, HZ, .6, .6, 1.4, 0, Math.PI / 2, 0, WALNUT);
      for (let i = 0; i < 12; i++) card(HX + .22, 3.4 + Math.cos(i * .524) * .6, HZ + Math.sin(i * .524) * .6, .42, Math.PI / 2, 0, LEAFY[i % LEAFY.length], .2);
    });
    build.push(() => {
      place(rug, cylinder, -14.9, .035, HZ, 2.7, .07, 2.7, 0, 0, 0, 0xf3e9da);
      armchair(-14.3, .2, CAMEL, 1, 4); armchair(-14.3, 3.8, CAMEL, 1, 4);
      pillow(knit, -14.1, .82, .2, .46, 3.3, MUSTARD, -Math.PI / 2); pillow(knit, -14.1, .82, 3.8, .46, 5.1, 0xcdb4e6, -Math.PI / 2);
      place(oak, tin, -14.5, .56, HZ, .4, .05, .4, 0, 0, 0, 0xe6b27c); place(oak, tin, -14.5, .28, HZ, .06, .54, .06, 0, 0, 0, CHOCOLATE);
      place(painted, lampBase, -14.5, .585, HZ, .6, .62, .6, 0, 0, 0, 0xb5754a); lampshade(-14.5, 1.2, HZ, .42, 1.7);
    });
    }

    // East wall: a wide daybed under a lilac blanket with a moon lamp beside it, and a round table set for tea.
    {
      const bx = 16.3, bz = 1.2, tx = 12.6, tz = 6.1;
    build.push(() => {
      place(shadow, plane, bx - .2, .012, bz, 4.2, 5.4, 1, -Math.PI / 2);
      wood(bx, .22, bz, 3.2, .44, 4.4, WALNUT, .05);
      wood(bx, 1.05, bz - 2.26, 3.3, 1.5, .12, HONEY, .04);
      soft(boucle, bx, .62, bz, 3.0, .36, 4.2, { radius: .12, crown: .03, seg: 8, seed: 1 }, 0xfbf6ee);
      soft(knit, bx, .84, bz + .9, 3.08, .12, 2.5, { radius: .05, bulge: .03, wrinkle: .02, seed: 2, seg: 8, tile: KNIT_TILE }, 0xd9c3ea);
      for (const [dx, color, seed] of [[-1.0, 0xfbf6ee, 1], [0, 0xe6d6f2, 2], [1.0, 0xfbf6ee, 3]] as const) pillow(boucle, bx + dx, 1.05, bz - 1.85, .62, seed + 20, color, 0, 1.0);
      pillow(knit, bx - .4, .98, bz - 1.4, .46, 31, 0xcdb4e6, .3, 1.1);
      for (const [nz, moon] of [[-1.9, true], [4.3, false]] as const) {
        wood(16.9, .3, nz, .9, .6, .9, HONEY, .04);
        if (moon) { place(glow, sphere, 16.9, .9, nz, .28, .28, .28, 0, 0, 0, 0xfff1d0); place(brass, tin, 16.9, .62, nz, .16, .04, .16); halo(16.9, .9, nz, 1.9, .3, .24, .15); }
        else { place(painted, vase, 16.9, .6, nz, 1.2, 1.1, 1.2, 0, 0, 0, 0xf1e6d2); bouquet(16.9, 1.02, nz, 1.5, LILAC, 9); }
      }
      soft(rug, 13.7, .04, bz, 2.2, .08, 3.8, { radius: .03, seg: 6, tile: 2 }, 0xfaf4ea);
    });
    build.push(() => {
      place(shadow, plane, tx, .012, tz, 3.4, 2.6, 1, -Math.PI / 2);
      place(oak, cylinder, tx, .72, tz, .78, .06, .78, 0, 0, 0, 0xe6b27c); place(oak, cylinder, tx, .36, tz, .09, .7, .09, 0, 0, 0, CHOCOLATE); place(oak, cylinder, tx, .03, tz, .4, .06, .4, 0, 0, 0, CHOCOLATE);
      armchair(tx - 1.0, tz, 0xf1e6d2, -1, 4); armchair(tx + 1.0, tz, 0xf1e6d2, 1, 4);
      place(painted, vase, tx + .1, .75, tz - .28, 1.0, .55, 1.0, 0, 0, 0, 0xc2794a);
      [ENAMEL, 0xe8dcc8].forEach((color, i) => place(painted, cup, tx - .32 + i * .5, .75, tz + .26, 1, 1, 1, 0, 0, 0, color));
      place(painted, vase, tx - .18, .75, tz - .1, .7, .6, .7, 0, 0, 0, 0xf1e6d2); bouquet(tx - .18, .98, tz - .1, .8, BLUSH, 12);
      rod(painted, tx, T.height - .2, tz, tx, 2.84, tz, .006, CORD, wire); lantern(tx, 2.5, tz, 1.3);
    });
    }

    // The cliff the terrace stands on, with three falls down its face into the lagoon.
    build.push(() => {
      const top = T.height, face = LG.maxZ, foot = LG.level - LG.depth, falls = LAGOON_FALLS.map(fall => fall[0]);
      const relief = crag(-10.4, 10.4, foot, top, face, 3, falls, 2.05);
      slab(stone, 0, top - .2, face + 1.15, 20.8, .4, 2.3, 0xbfb7a8);
      const dry = (x: number, clear: number) => falls.every(at => Math.abs(x - at) > (at ? clear : clear + .8));
      // What lives on a wet rock face: ivy over the blocks, ferns on the ledges, vines let down from the terrace above.
      for (let i = 0; i < pick(22, 9); i++) {
        const cx = -9.6 + rnd(i * 3.1 + 2) * 19.2, cy = LG.level + .6 + rnd(i * 5.7 + 1) * (top - LG.level - .9);
        if (dry(cx, 1)) for (let leafy = 0; leafy < 4; leafy++) {
          const x = cx + (rnd(i * 7 + leafy) - .5) * 1.1, y = cy + (rnd(i * 11 + leafy) - .5) * .8;
          card(x, y, face - relief(x, y) - .07, .4 + rnd(i + leafy * 3 + 40) * .3, (rnd(i + leafy + 41) - .5) * .6, -.1 - rnd(i + leafy + 42) * .3, GREENS[(i + leafy) % GREENS.length], .35);
        }
      }
      for (let i = 0; i < pick(12, 6); i++) {
        const x = -9.4 + (i + rnd(i + 60) * .6) * 18.8 / pick(12, 6);
        if (!dry(x, .9)) continue;
        hangVine(x, top - .05, face - relief(x, top - .5) - .22, 1.1 + rnd(i + 61) * 1.5, i + 70, i % 3 ? undefined : LILAC);
        if (i % 2) rosette(x + .5, top - .02, face - .1, pick(7, 5), .5, 1.0, i + 1);
      }
      // Boulders that came down long ago and sit half in the water.
      for (let i = 0; i < pick(6, 4); i++) {
        const x = -8.4 + i * 16.8 / (pick(6, 4) - 1) + (rnd(i + 80) - .5) * 1.2, size = .7 + rnd(i + 81) * .7;
        if (dry(x, 1.3)) boulder(stone, x, LG.level - .04, face - relief(x, LG.level) - .45, size * .55, size * .34, size * .45, i, i % 2 ? 0xb9b1a3 : 0x9d968a);
      }
      for (const [x, reach, strength] of LAGOON_FALLS) {
        if (x === 0) {
          ribbon([x, top - .02, face - relief(x, top - .1) - .05], [x, LG.level, face - reach], [1, 0, 0], 3.0, pick(10, 6), 0, 2.6, 1, [0, 1]);
        } else {
          ribbon([x, top - .02, face - relief(x, top - .1) - .05], [x, 2.1, face - relief(x, 2.6) - .4], [1, 0, 0], 1.3, pick(6, 4), 0, 2.4, 1, [0, 0]);
          ribbon([x, 2.08, face - relief(x, 1.5) - .04], [x, LG.level, face - reach], [1, 0, 0], 1.7, pick(6, 4), 2.2, 2.4, 1, [0, 1]);
          halo(x, 2.3, face - .7, 1.5, .08, .1, .1);
        }
        halo(x, LG.level + .32, face - reach, 2.4 + strength * 2, .1 + strength * .06, .13 + strength * .07, .13 + strength * .07);
      }
      // The lagoon bed, a marble kerb to stand at, and beds of flowers where it meets the stairs.
      sheet(basin, 0, LG.level - LG.depth, (LG.minZ + face + 1) / 2, LG.maxX - LG.minX, face + 1 - LG.minZ, -Math.PI / 2, 0, 0xe9dfc8);
      sheet(basin, 0, (LG.level - LG.depth + .16) / 2, LG.minZ, LG.maxX - LG.minX, LG.depth - LG.level + .16, 0, 0, 0xdcd2bc);
      for (const side of [-1, 1]) sheet(basin, side * LG.maxX, (LG.level - LG.depth + .16) / 2, (LG.minZ + face) / 2, face - LG.minZ, LG.depth - LG.level + .16, 0, -side * Math.PI / 2, 0xdcd2bc);
      for (let i = 0; i < pick(22, 10); i++) { const size = .22 + rnd(i + 1) * .34; boulder(basin, -8.8 + rnd(i * 2.3 + 7) * 17.6, LG.level - LG.depth + size * .3, LG.minZ + .5 + rnd(i + 4) * 4.4, size, size * .55, size * (.7 + rnd(i + 2) * .5), i, i % 3 ? 0xcfc6b2 : 0xa9a08d); }
      slab(floor, 0, .08, LG.minZ - .25, LG.maxX - LG.minX + 1, .16, .5, CREAMY);
      for (const side of [-1, 1]) {
        slab(floor, side * (LG.maxX + .25), .08, (LG.minZ + face) / 2, .5, .16, face - LG.minZ, CREAMY);
        for (let i = 0; i < 3; i++) bouquet(side * (LG.maxX + .26), .16, LG.minZ + .7 + i * 1.9, 1.3, i % 2 ? LILAC : BLUSH, i + side * 5 + 30);
      }
      // Still water for a phone, in the same hand as the falls. A desktop swaps it for the sea engine from the beach.
      const positions: number[] = [], normals: number[] = [], uvs: number[] = [], kinds: number[] = [], indices: number[] = [], nx = 24, nz = 8;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = LG.minX + (LG.maxX - LG.minX) * i / nx, z = LG.minZ + (face - LG.minZ) * j / nz, reach = Math.min(Math.hypot(x, z - face + .5), Math.hypot(Math.abs(x) - 6.3, z - face + 1)), bank = Math.min(x - LG.minX, LG.maxX - x, z - LG.minZ);
        positions.push(x, LG.level, z); normals.push(0, 1, 0); uvs.push(reach, Math.min(.5, bank * .7)); kinds.push(.4, 0, Math.exp(-reach * 1.3));
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; indices.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const still = new THREE.BufferGeometry();
      still.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); still.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      still.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); still.setAttribute("color", new THREE.Float32BufferAttribute(kinds, 3));
      still.setIndex(indices); lagoonPieces.push(still);
    });

    // A marble stair up each side of the lagoon, with planted steps against the wall beside it.
    build.push(() => {
      const steps = 22, run = (T.z - T.stairZ) / steps, rise = T.height / steps, width = T.stairOuter - T.stairInner, mid = (T.stairInner + T.stairOuter) / 2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < steps; i++) place(floor, box, side * mid, (i + 1) * rise / 2, T.stairZ + (i + .5) * run, width, (i + 1) * rise, run, 0, 0, 0, i % 2 ? 0xffffff : 0xf7f1e6);
        soft(rug, side * mid, T.height / 2 + .03, (T.stairZ + T.z) / 2, 2.2, .04, Math.hypot(T.z - T.stairZ, T.height) + .1, { radius: .015, seg: 8, tile: 2 }, 0xb9744a, Math.atan2(T.height, T.z - T.stairZ) * -1);
        for (const x of [T.stairInner + .08, T.stairOuter - .08]) balustrade(side * x, 0, T.stairZ, side * x, T.height, T.z);
        for (const x of [T.stairInner + .08, T.stairOuter - .08]) { place(floor, box, side * x, .7, T.stairZ - .1, .3, 1.4, .3, 0, 0, 0, CREAMY); lantern(side * x, 1.66, T.stairZ - .1, 1.1); }
        for (let k = 0; k < 4; k++) {
          const z = T.stairZ + 1.05 + k * 2.1, high = 1.1 * (k + 1), x = side * (T.stairOuter + E.maxX) / 2;
          slab(floor, x, high / 2, z, E.maxX - T.stairOuter, high, 2.1, CREAMY);
          place(painted, box, x, high + .02, z, 1.2, .04, 1.8, 0, 0, 0, SOIL);
          bouquet(x, high + .04, z - .5, 1.4, k % 2 ? BLUSH : LILAC, k + side * 3 + 50); rosette(x, high + .04, z + .4, pick(9, 6), .7, .9, k + 2);
          hangVine(side * (T.stairOuter + .1), high, z + .7, .7 + rnd(k) * .5, k + 80 + side);
        }
        rod(painted, side * 13.5, h, 12.8, side * 13.5, 4.0, 12.8, .006, CORD, wire); lantern(side * 13.5, 3.6, 12.8, 1.7);
      }
    });

    // Upstairs: the stream that feeds the falls, a rail to lean on, two trees, a timber pavilion to read in, books and flowers along the walls.
    {
      const y = T.height, face = LG.maxZ, pz = 24.4, wallZ = E.maxZ, books = pick(20, 9);
    build.push(() => {
      balustrade(-T.stairInner, y, T.z + .25, T.stairInner, y, T.z + .25);
      for (const side of [-1, 1]) balustrade(side * T.stairOuter, y, T.z + .05, side * (E.maxX - .1), y, T.z + .05);
      for (const dz of [-.42, .42]) slab(floor, 0, y + .12, 18.35 + dz, 16.6, .24, .16, CREAMY);
      place(painted, box, 0, y + .04, 18.35, 16.4, .08, .7, 0, 0, 0, 0x1c2a26);
      for (const side of [-1, 1]) ribbon([side * 8.1, y + .16, 18.35], [side * .2, y + .16, 18.35], [0, 0, 1], .66, pick(10, 6), 0, .6, 0, [0, 0]);
      for (const [x, width] of [[0, 3.0], [-6.3, 1.2], [6.3, 1.2]]) ribbon([x, y + .15, 18.0], [x, y - .03, face - .08], [1, 0, 0], width, 4, 0, 1.4, 0, [0, .7]);
      for (let i = 0; i < 6; i++) bouquet(-7.5 + i * 3, y + .24, 18.9, 1.0, i % 2 ? BLUSH : LILAC, i + 60);
    });
    build.push(() => {
      for (const [x, z, palette, seed, height] of [[-10.6, 22.6, BLUSH, 5, 5.2], [10.8, 22.2, LEAFY, 11, 4.8]] as const) {
        place(floor, drum, x, y + .28, z, .9, .56, .9, 0, 0, 0, CREAMY); place(painted, cylinder, x, y + .56, z, .8, .04, .8, 0, 0, 0, SOIL);
        tree(x, y + .56, z, height, 2.9, palette, seed);
        for (let i = 0; i < 5; i++) bouquet(x + Math.sin(i * 1.26) * .55, y + .58, z + Math.cos(i * 1.26) * .55, .8, palette === BLUSH ? BLUSH : LILAC, i + seed);
      }
    });
    // The pavilion.
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
        for (let i = 0; i < 3; i++) pillow(i % 2 ? knit : boucle, side * 2.52, y + .92, pz - .9 + i * .9, .5, i + 7 + side, [0xcdb4e6, 0xfbf6ee, 0xf2a9c0][i], -side * Math.PI / 2);
        lantern(side * 3.2, y + 2.4, pz, 1.2);
      }
      wood(0, y + .4, pz, 1.3, .08, 1.3, 0xe6b27c, .04); for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) wood(dx, y + .19, pz + dz, .1, .36, .1, CHOCOLATE, .02);
      place(painted, vase, 0, y + .44, pz, 1.2, 1.0, 1.2, 0, 0, 0, 0xf1e6d2); bouquet(0, y + .84, pz, 1.4, BLUSH, 15);
      rod(painted, 0, h, pz, 0, y + 2.9, pz, .006, CORD, wire); lantern(0, y + 2.56, pz, 1.6);
    });
    // Books along the back wall, with planted beds either side and down both flanks.
    build.push(() => {
      sheet(oak, 0, y + 1.6, wallZ - .06, 18, 3.2, 0, Math.PI, 0xc9a27a);
      for (const dx of [-9, -4.5, 0, 4.5, 9]) wood(dx, y + 1.6, wallZ - .3, .08, 3.2, .5, HONEY, .012);
      for (let shelf = 0; shelf < 6; shelf++) {
        wood(0, y + .1 + shelf * .62, wallZ - .3, 18, .07, .5, HONEY, .012);
        if (shelf < 5) for (let bay = 0; bay < 4; bay++) for (let book = 0; book < books; book++) {
          if ((shelf * 2 + bay + book) % 13 === 0) continue;
          const thick = 4.0 / books - .02, tall = .34 + ((book * 3 + shelf * 2 + bay) % 5) * .04;
          place(painted, box, -8.7 + bay * 4.5 + book * 4.0 / books, y + .14 + shelf * .62 + tall / 2, wallZ - .34, thick, tall, .34, 0, 0, 0, PALETTE[(bay + shelf + book) % PALETTE.length]);
        }
      }
    });
    build.push(() => {
      for (const side of [-1, 1]) {
        slab(floor, side * 13.6, y + .26, wallZ - .5, 8.2, .52, .9, CREAMY); place(painted, box, side * 13.6, y + .53, wallZ - .5, 7.9, .04, .7, 0, 0, 0, SOIL);
        slab(floor, side * 17.3, y + .26, 21.6, 1.1, .52, 7.0, CREAMY); place(painted, box, side * 17.3, y + .53, 21.6, .9, .04, 6.8, 0, 0, 0, SOIL);
        for (let i = 0; i < 6; i++) { bouquet(side * (10 + i * 1.4), y + .55, wallZ - .5, 1.3, i % 2 ? BLUSH : LILAC, i + 100 + side); if (i % 2) rosette(side * (10.7 + i * 1.4), y + .55, wallZ - .45, pick(8, 5), .8, .8, i + 3); }
        for (let i = 0; i < 5; i++) { bouquet(side * 17.3, y + .55, 18.8 + i * 1.4, 1.2, i % 2 ? LILAC : BLUSH, i + 120 + side); rosette(side * 17.35, y + .55, 19.5 + i * 1.4, pick(8, 5), .7, .9, i + 9); }
        for (let i = 0; i < pick(8, 5); i++) hangVine(side * (9.8 + i * 1.05), y + 5.6, wallZ - .12, 1.6 + rnd(i + 50) * 1.6, i + 140 + side, i % 2 ? LILAC : undefined);
      }
    });
    }

    // Overhead: a rosette of lit alabaster in timber rings where a dome would be, a ring of candles under it, and wisteria let down all round.
    build.push(() => {
      const cz = 6, top = h;
      place(glow, cylinder, 0, top - .05, cz, 4.5, .04, 4.5, 0, 0, 0, 0xfff0d2);
      for (const r of [4.62, 2.3]) place(oak, ring, 0, top - .14, cz, r, r, 4.2, Math.PI / 2, 0, 0, WALNUT);
      for (let i = 0; i < 12; i++) place(oak, box, Math.sin(i * .5236) * 2.3, top - .1, cz + Math.cos(i * .5236) * 2.3, .12, .1, 4.6, 0, i * .5236, 0, WALNUT);
      halo(0, top - .5, cz, 11, .2, .16, .11);
      for (const [radius, y, bulbs] of [[2.7, 8.5, 16], [1.4, 9.3, 8]] as const) {
        place(brass, ring, 0, y, cz, radius, radius, 2.4, Math.PI / 2);
        for (let i = 0; i < 6; i++) rod(painted, Math.sin(i * 1.047) * radius, y, cz + Math.cos(i * 1.047) * radius, Math.sin(i * 1.047) * radius * .5, top - .1, cz + Math.cos(i * 1.047) * radius * .5, .008, CORD, wire);
        for (let i = 0; i < bulbs; i++) {
          const a = i / bulbs * Math.PI * 2, x = Math.sin(a) * radius, z = cz + Math.cos(a) * radius;
          place(painted, tin, x, y + .1, z, .05, .16, .05, 0, 0, 0, 0xf1e6d0);
          place(glow, bulb, x, y + .25, z, .05, .09, .05, 0, 0, 0, 0xffe0a8); halo(x, y + .26, z, .9, .34, .18, .06);
        }
      }
      for (let i = 0; i < pick(26, 14); i++) {
        const a = i / pick(26, 14) * Math.PI * 2, r = 4.75 + (i % 3) * .5;
        hangVine(Math.sin(a) * r, top - .2, cz + Math.cos(a) * r, 2.2 + rnd(i + 200) * 3.2, i + 200, LILAC);
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
      // The cliff and the lagoon bed wear a photograph of real rock; if it cannot be fetched they fall back to drawn stone.
      const rock = options.loadTexture?.("/beach/real/rock.jpg");
      stone.map = basin.map = baked.stone;
      if (rock) {
        rock.wrapS = rock.wrapT = THREE.RepeatWrapping; rockPhoto = rock;
        awaitRock = () => { if (!rock.image) return; stone.map = basin.map = rock; awaitRock = null; };
      }
      sprays = bakeDrawn(options.renderer, pick(1024, 512), SPRAY_FRAG, "leaf-sprays", false);
      canopy.map = sprays.texture;
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
        return [E.minX + 2 + r(0) * (E.maxX - E.minX - 6), r(1), E.minZ + 5 + r(2) * (E.maxZ - E.minZ - 7), r(3)];
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
      for (const bunker of UYUNI_BUNKERS) {
        const room = rooms.get(bunker.id);
        if (!room) continue;
        for (const batch of shared) {
          const mesh = new THREE.Mesh(batch.geometry, batch.material); mesh.name = `${batch.material.name}-${bunker.id}`;
          if (batch.material === shadow) mesh.renderOrder = 1;
          room.add(mesh);
        }
        for (const mesh of room.children) if ((mesh as THREE.Mesh).material === basin || (mesh as THREE.Mesh).material === stone) mesh.layers.enable(BED_LAYER);
        const lagoon = new THREE.Mesh(still, water); lagoon.name = `uyuni-bunker-lagoon-${bunker.id}`; lagoon.visible = lagoonDrawn; room.add(lagoon); lagoons.set(bunker.id, lagoon);
        const petals = new THREE.Mesh(petalGeometry, petalMaterial); petals.name = `uyuni-bunker-petals-${bunker.id}`; petals.frustumCulled = false; room.add(petals);
        const fire = new THREE.InstancedMesh(flameGeometry, flameMaterial, flameCount);
        for (let i = 0; i < flameCount; i++) {
          const outer = i > 3;
          // The fire faces out of the west wall, so the flames stand across the hearth.
          placement.position.set(HEARTH.x + .15 + Math.cos(i * 2.4) * .1, FIRE_FLOOR + .1, HEARTH.z + (i / (flameCount - 1) - .5) * 1.3 + Math.sin(i * 2.4) * .05);
          placement.rotation.set(0, Math.PI / 2, 0);
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
      awaitRock?.();
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
      baked?.dispose(); sprays?.dispose(); marble?.dispose(); rockPhoto?.dispose();
    },
  };
}
