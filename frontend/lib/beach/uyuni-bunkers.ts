import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type CozySurfaces, bakeCozySurfaces } from "./baikal-bake";
import { type SoftBoxOptions, cushionGeometry, drapeGeometry, logGeometry, poufGeometry, softBoxGeometry } from "./baikal-cozy";
import { createBaikalFlameMaterial } from "./baikal-materials";
import { BUNKER_CEILING_Y, BUNKER_FLOOR_Y, BUNKER_GAMES_LOCAL, BUNKER_LADDER_LOCAL, BUNKER_SOFA_LOCAL, UYUNI_BUNKERS, type UyuniBunkerId } from "./uyuni-bunker-layout";
import type { BoardGame } from "./net";

export interface UyuniBunkers {
  root: THREE.Group;
  setActive(id: UyuniBunkerId | null): void;
  update(time: number): void;
  setBoardGames(games: readonly BoardGame[]): void;
  dispose(): void;
}
export interface UyuniBunkerOptions { renderer?: THREE.WebGLRenderer; mobile?: boolean }

const CREAM = 0xf1e6d2, OATMEAL = 0xdccbb0, CAMEL = 0xb98a58, RUST = 0xa5502b, CHOCOLATE = 0x7a5a44, MUSTARD = 0xc9983a, FOREST = 0x56603f, WALNUT = 0xa27a5a, HONEY = 0xf2c595;
const LAMP_TINT: readonly [number, number, number] = [1, .69, .4], SEAT_TOP = .52;
/** Every warm source in the room: position in room coordinates, then power. The first one is the fire and breathes; the first four also glint on polished wood. */
const ROOM_LIGHTS: readonly (readonly [number, number, number, number, readonly [number, number, number]])[] = [
  [0, .95, 7.25, 9, [1, .54, .22]],
  [0, 4.05, .25, 13, LAMP_TINT],
  [-5.3, 1.34, -3.85, 3.4, LAMP_TINT],
  [5.3, 1.34, 3.85, 3.4, LAMP_TINT],
  ...[-1, 1].flatMap(side => [-3.7, 3.7].map(z => [side * 9.45, 2.85, z, 2.2, LAMP_TINT] as const)),
  [0, 2.85, -8.5, 2, LAMP_TINT],
  [-8.1, 1.95, -6.2, 2.4, LAMP_TINT],
  [8.1, 1.95, -6.2, 2.4, LAMP_TINT],
  [0, .85, .25, .6, [1, .62, .3]],
];

const WARM_VERT_PARS = "varying vec3 vRoomLocal;\nvarying vec3 vRoomWorld;";
const WARM_VERT = `vRoomLocal = position;
#ifdef USE_INSTANCING
vRoomLocal = (instanceMatrix * vec4(position, 1.0)).xyz;
#endif
vRoomWorld = (modelMatrix * vec4(vRoomLocal, 1.0)).xyz;`;
const BOARD_TOP = .74, MAX_STONES = 15 * 15 + 8 * 8;
const BOARD_LOOK = { omok: { size: 15, pitch: 1.04 / 14, radius: .033, height: .015 }, othello: { size: 8, pitch: .125, radius: .052, height: .012 } } as const;
const WARM_FRAG_PARS = `varying vec3 vRoomLocal;
varying vec3 vRoomWorld;
uniform vec4 uRoomLight[${ROOM_LIGHTS.length}];
uniform vec3 uRoomTint[${ROOM_LIGHTS.length}];
uniform float uRoomFire;`;
/** Scene lights are for the visitors. The room is lit by its own known sources, so it costs no shadow pass and no extra draw. */
const WARM_LIGHT_BEGIN = THREE.ShaderChunk.lights_fragment_begin
  .replace("#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
  .replace("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
  .replace("#if ( NUM_HEMI_LIGHTS > 0 )", "#if 0")
  .replace("vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = vec3( 0.0 );");
const WARM_FRAG_BODY = `
{
  vec3 p = vRoomLocal, n = normalize(transpose(mat3(viewMatrix)) * geometryNormal), v = normalize(cameraPosition - vRoomWorld);
  vec3 sum = vec3(0.0), gloss = vec3(0.0);
  float alpha = max(material.roughness, 0.24); alpha *= alpha; float a2 = alpha * alpha;
  for (int i = 0; i < ${ROOM_LIGHTS.length}; i++) {
    vec3 l = uRoomLight[i].xyz - p;
    float d2 = dot(l, l) + 0.09, cosine = dot(n, l) / sqrt(d2);
    vec3 power = uRoomTint[i] * uRoomLight[i].w * (i == 0 ? uRoomFire : 1.0) / d2;
    sum += power * (max(cosine, 0.0) * 0.8 + (cosine * 0.5 + 0.5) * 0.2);
    if (i < 4 && cosine > 0.0) {
      float nh = max(dot(n, normalize(l / sqrt(d2) + v)), 0.0), den = nh * nh * (a2 - 1.0) + 1.0;
      gloss += power * cosine * a2 / (3.14159 * den * den);
    }
  }
  // Light that has bounced around timber: amber from below, softer from above, and a little more towards the hearth.
  vec3 fill = mix(vec3(0.3, 0.185, 0.095), vec3(0.185, 0.125, 0.08), n.y * 0.5 + 0.5) * (0.78 + 0.5 * exp(-distance(p.xz, vec2(0.0, 7.2)) * 0.2) * uRoomFire);
  // The room is a known box, so its corners can be darkened exactly. A surface ignores the plane it lies on.
  vec3 d = min(p - vec3(-10.0, 0.0, -9.0), vec3(10.0, 6.0, 9.0) - p) + abs(n) * 8.0;
  float shell = mix(0.4, 1.0, smoothstep(0.0, 1.5, min(d.x, min(d.y, d.z))));
  #ifdef ROOM_COVE
  // Hidden lighting along the top of the timber soffit washes the ceiling above it.
  float coveEdge = min(8.4 - abs(p.x), 7.4 - abs(p.z));
  if (n.y < -0.5) sum += vec3(1.0, 0.64, 0.34) * 2.8 * exp(-max(coveEdge, 0.0) * 0.75);
  #endif
  reflectedLight.directDiffuse += sum * BRDF_Lambert(material.diffuseColor) * mix(1.0, shell, 0.45);
  reflectedLight.indirectDiffuse += fill * shell * material.diffuseColor;
  reflectedLight.directSpecular += gloss * material.specularColor * 0.25;
  #ifdef ROOM_FABRIC
  float rim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 2.6);
  reflectedLight.directDiffuse += material.diffuseColor * (sum * 0.07 + fill * 0.3) * rim;
  #endif
}`;

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
function rugTexture(): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4), turn = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, index = (y * size + x) * 4;
    const wool = Math.sin(u * turn * 3 + Math.sin(v * turn * 2) * 2) * Math.sin(v * turn * 4 + Math.sin(u * turn) * 2) * 6 + Math.sin((u + v) * turn * 11 + Math.sin(u * turn * 5)) * 2.5;
    data[index] = 238 + wool; data[index + 1] = 226 + wool; data[index + 2] = 205 + wool; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = "uyuni-bunker-rug-weave"; texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
}

function leafGeometry(): THREE.BufferGeometry {
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 8; row++) for (let side = -1; side <= 1; side++) {
    const t = row / 8, width = Math.pow(Math.sin(t * Math.PI), .85) * .25;
    points.push(side * width, t, Math.sin(t * Math.PI) * .17 - Math.abs(side) * .06);
    uv.push((side + 1) * .5, t);
  }
  for (let row = 0; row < 8; row++) for (let column = 0; column < 2; column++) {
    const a = row * 3 + column; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** Two closed underground lodges share all geometry and materials; only the visited room renders. */
export function buildUyuniBunkers(parent: THREE.Object3D, textures: { wood: THREE.Texture; cotton: THREE.Texture }, options: UyuniBunkerOptions = {}): UyuniBunkers {
  const root = new THREE.Group(); root.name = "uyuni-bunkers"; parent.add(root);
  const rooms = new Map<UyuniBunkerId, THREE.Group>();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const shadowTexture = contactTexture(), rugWeave = rugTexture(), mobile = options.mobile === true;
  const uRoomLight = { value: ROOM_LIGHTS.map(([x, y, z, power]) => new THREE.Vector4(x, y, z, power)) };
  const uRoomTint = { value: ROOM_LIGHTS.map(light => new THREE.Vector3(...light[4])) };
  const uRoomFire = { value: 1 }, flameTime = { value: 0 };
  const indoor = (name: string, parameters: THREE.MeshStandardMaterialParameters, flags: { fabric?: boolean; cavity?: number; cove?: boolean } = {}) => {
    const material = new THREE.MeshStandardMaterial({ roughness: .86, ...parameters, fog: false });
    material.name = `uyuni-bunker-${name}`; materials.add(material);
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { uRoomLight, uRoomTint, uRoomFire });
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${WARM_VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${WARM_VERT}`);
      let fragment = `${flags.fabric ? "#define ROOM_FABRIC\n" : ""}${flags.cove ? "#define ROOM_COVE\n" : ""}` + shader.fragmentShader;
      fragment = fragment.replace("#include <common>", `#include <common>\n${WARM_FRAG_PARS}`)
        .replace("#include <lights_fragment_begin>", WARM_LIGHT_BEGIN)
        .replace("#include <aomap_fragment>", `${WARM_FRAG_BODY}\n#include <aomap_fragment>`);
      if (flags.cavity !== undefined) fragment = fragment.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\ndiffuseColor.rgb *= mix(${flags.cavity.toFixed(2)}, 1.0, texture2D(normalMap, vNormalMapUv).a);\n#endif`);
      shader.fragmentShader = fragment;
    };
    material.customProgramCacheKey = () => `uyuni-bunker-room-${flags.fabric ? 1 : 0}-${flags.cove ? 1 : 0}-${flags.cavity ?? "n"}`;
    return material;
  };
  const wall = indoor("timber-walls", { map: textures.wood, roughness: .74 }); wall.color.setRGB(1.28, 1.06, .82);
  const floor = indoor("oak-floor", { map: textures.wood, roughness: .34 }); floor.color.setRGB(1.05, .9, .74);
  const ceiling = indoor("timber-ceiling", { map: textures.wood, roughness: .8 }, { cove: true }); ceiling.color.setRGB(1.4, 1.1, .8);
  const oak = indoor("warm-oak", { map: textures.wood, vertexColors: true, roughness: .5 });
  const boucle = indoor("boucle", { map: textures.cotton, vertexColors: true, roughness: 1 }, { fabric: true, cavity: .64 });
  const knit = indoor("knit-throws", { map: textures.cotton, vertexColors: true, roughness: 1, side: THREE.DoubleSide }, { fabric: true, cavity: .5 });
  const rug = indoor("wool-rug", { map: rugWeave, vertexColors: true, roughness: 1 }, { fabric: true, cavity: .76 });
  const stone = indoor("ledgestone", { color: 0xb9ab9b, roughness: .92 });
  const painted = indoor("painted-goods", { vertexColors: true, roughness: .72 });
  const brass = indoor("brushed-brass", { color: 0xc79a55, metalness: .4, roughness: .38 });
  const stoneMaterial = indoor("board-stones", { roughness: .26 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  glow.name = "uyuni-bunker-lamp-glow"; materials.add(glow);
  const shadow = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .62, depthWrite: false, toneMapped: false, fog: false });
  shadow.name = "uyuni-bunker-contact-shadows"; materials.add(shadow);

  const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(1, 18, 12);
  const smallSphere = new THREE.SphereGeometry(1, 8, 6), smallCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 22), plane = new THREE.PlaneGeometry(1, 1), leaf = leafGeometry();
  const pot = new THREE.LatheGeometry([[0, 0], [.43, 0], [.56, .1], [.62, .58], [.58, .75], [.52, .77], [.5, .65]].map(([x, y]) => new THREE.Vector2(x, y)), 22);
  const vase = new THREE.LatheGeometry([[0, 0], [.14, 0], [.23, .16], [.19, .34], [.08, .46], [.07, .5], [.055, .5], [.055, .44]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const cup = new THREE.LatheGeometry([[0, 0], [.06, 0], [.085, .10], [.08, .13], [.066, .13], [.06, .03], [0, .03]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const shade = new THREE.LatheGeometry([[.74, -.3], [.58, .3], [.56, .3], [.72, -.3]].map(([x, y]) => new THREE.Vector2(x, y)), 30);
  shade.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: shade.getAttribute("position").count }, (_, i) => {
    const edge = Math.abs(shade.getAttribute("position").getY(i)) / .3, value = .72 + .28 * edge * edge; return [value, value * (.92 + .08 * edge), value * (.84 + .16 * edge)];
  }).flat(), 3));
  const lampBase = new THREE.LatheGeometry([[0, 0], [.2, 0], [.22, .05], [.12, .12], [.25, .34], [.2, .5], [.05, .62], [.03, .72]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const ring = new THREE.TorusGeometry(1, .035, 8, 56), torus = new THREE.TorusGeometry(.09, .014, 5, 16);
  const sources = new Set<THREE.BufferGeometry>([box, sphere, smallSphere, smallCylinder, cylinder, plane, leaf, pot, vase, cup, shade, lampBase, ring, torus]);
  const cached = new Map<string, THREE.BufferGeometry>();
  const once = (key: string, make: () => THREE.BufferGeometry) => {
    if (!cached.has(key)) cached.set(key, make());
    return cached.get(key)!;
  };
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const transform = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
  const BOARD_TILE = 1 / 2.4, FURNITURE_TILE = 1 / 1.1, tint = new THREE.Color();
  const place = (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color = 0xffffff) => {
    const piece = geometry.clone();
    transform.compose(new THREE.Vector3(x, y, z), quaternion.setFromEuler(euler.set(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
    piece.applyMatrix4(transform);
    if (material === wall || material === floor || material === ceiling || material === oak) {
      const position = piece.getAttribute("position"), normal = piece.getAttribute("normal"), uv = piece.getAttribute("uv");
      const scale = material === oak ? FURNITURE_TILE : BOARD_TILE;
      for (let i = 0; i < position.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        // Boards run along V: lengthwise on the floor and ceiling, horizontally around the walls like a log room.
        if (ny > nx && ny > nz) uv.setXY(i, position.getX(i) * scale, position.getZ(i) * scale);
        else uv.setXY(i, position.getY(i) * scale, (nx > nz ? position.getZ(i) : position.getX(i)) * scale);
      }
    }
    const usesColor = (material as THREE.MeshStandardMaterial).vertexColors, existing = piece.getAttribute("color");
    if (usesColor) {
      tint.set(color);
      const count = piece.getAttribute("position").count, values: number[] = new Array(count * 3);
      for (let i = 0; i < count; i++) {
        const shade = existing ? [existing.getX(i), existing.getY(i), existing.getZ(i)] : [1, 1, 1];
        values[i * 3] = shade[0] * tint.r; values[i * 3 + 1] = shade[1] * tint.g; values[i * 3 + 2] = shade[2] * tint.b;
      }
      piece.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    } else if (existing) piece.deleteAttribute("color");
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push(piece);
  };
  /** Solid woodwork with eased edges. */
  const wood = (x: number, y: number, z: number, width: number, height: number, depth: number, color: number, radius = .03, ry = 0) => {
    const key = `w${width},${height},${depth},${radius}`;
    place(oak, once(key, () => new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, Math.min(width, height, depth) * .48))), x, y, z, 1, 1, 1, 0, ry, 0, color);
  };
  const FABRIC_TILE = 1 / .3, KNIT_TILE = 1 / .42, fine = mobile ? 8 : 12;
  const soft = (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, shape: SoftBoxOptions, color: number, rx = 0, ry = 0, rz = 0) => {
    const key = `s${width},${height},${depth},${JSON.stringify(shape)}`;
    place(material, once(key, () => softBoxGeometry(width, height, depth, { tile: FABRIC_TILE, ...shape })), x, y, z, 1, 1, 1, rx, ry, rz, color);
  };
  /** A scatter cushion stood up against whatever is behind it, leaning back by `lean`. */
  const pillow = (material: THREE.Material, x: number, y: number, z: number, size: number, seed: number, color: number, facing: number, lean = 1.22) => {
    const key = `c${size},${seed}`;
    place(material, once(key, () => cushionGeometry(size, size, .2, seed, mobile ? 8 : 12, KNIT_TILE)), x, y, z, 1, 1, 1, lean, facing, seed * .13 - .2, color);
  };
  const halos: number[][] = [];
  const halo = (x: number, y: number, z: number, size: number, r: number, g: number, b: number) => halos.push([x, y, z, size, r, g, b]);
  const h = BUNKER_CEILING_Y - BUNKER_FLOOR_Y, SOFFIT_Y = 4.5;

  // A closed timber shell: plank floor, log-style walls, and a low soffit all round so the middle reads as a raised, beamed ceiling.
  place(floor, box, 0, -.16, 0, 20.64, .32, 18.64);
  place(ceiling, box, 0, h + .16, 0, 20.64, .32, 18.64);
  for (const x of [-10.16, 10.16]) place(wall, box, x, h / 2, 0, .32, h, 18.64);
  for (const z of [-9.16, 9.16]) place(wall, box, 0, h / 2, z, 20, h, .32);
  for (const x of [-9.2, 9.2]) place(wall, box, x, (SOFFIT_Y + h) / 2, 0, 1.6, h - SOFFIT_Y, 18);
  for (const z of [-8.2, 8.2]) place(wall, box, 0, (SOFFIT_Y + h) / 2, z, 16.8, h - SOFFIT_Y, 1.6);
  for (const x of [-9.97, 9.97]) wood(x, .16, 0, .06, .32, 18, CHOCOLATE, .012);
  for (const z of [-8.97, 8.97]) wood(0, .16, z, 19.9, .32, .06, CHOCOLATE, .012);
  for (const x of [-8.36, 8.36]) wood(x, SOFFIT_Y + .09, 0, .1, .22, 14.9, WALNUT, .02);
  for (const z of [-7.36, 7.36]) wood(0, SOFFIT_Y + .09, z, 16.8, .22, .1, WALNUT, .02);
  // Heavy beams overhead, with a scatter of tiny warm lights set between them.
  for (const z of [-6, -3, 0, 3, 6]) wood(0, h - .25, z, 16.8, .5, .36, WALNUT, .05);
  for (const x of [-5.4, 5.4]) wood(x, h - .13, 0, .3, .26, 14.8, WALNUT, .04);
  for (let column = 0; column < 7; column++) for (let row = 0; row < 4; row++) {
    const x = -6.6 + column * 2.2 + (row % 2) * .4, z = -4.5 + row * 3;
    place(glow, smallCylinder, x, h - .012, z, .05, .02, .05, 0, 0, 0, 0xffe2ad);
    halo(x, h - .08, z, .42, .28, .15, .05);
  }

  // Generous rug under the seating, deep enough to look soft and plain enough never to shimmer.
  soft(rug, 0, .05, .1, 12.9, .08, 7.5, { radius: .035, seg: 4, tile: 1 / .5 }, 0xe9dcc4);

  for (const side of [-1, 1]) {
    const facing = -side * Math.PI / 2;
    place(shadow, plane, side * 5.5, .112, 0, 3.6, 7.3, 1, -Math.PI / 2);
    wood(side * 5.4, .14, 0, 1.72, .18, 5.6, CHOCOLATE, .05);
    soft(boucle, side * 6.16, .62, 0, .46, 1.04, 5.9, { radius: .16, bulge: .02, seg: 8, seed: side + 4 }, OATMEAL);
    for (const z of [-2.78, 2.78]) soft(boucle, side * 5.4, .54, z, 1.98, .72, .4, { radius: .17, bulge: .03, crown: .03, seg: 10, seed: z }, CREAM);
    BUNKER_SOFA_LOCAL.filter(seat => Math.sign(seat.x) === side).forEach((seat, index) => {
      const crown = .05, sag = .03, thickness = .26, seed = index + side * 3;
      // The crown of each cushion sits exactly where a seated visitor's hips land.
      soft(boucle, seat.x, SEAT_TOP - thickness / 2 - crown + sag, seat.z, 1.5, thickness, 1.72, { radius: .1, crown, bulge: .024, sag, wrinkle: .006, seed, seg: fine }, CREAM);
      soft(boucle, side * 5.93, .9, seat.z, .36, .74, 1.68, { radius: .15, crown: .03, bulge: .07, wrinkle: .007, seed: seed + 11, seg: fine }, CREAM, 0, 0, side * .17);
    });
    // Loose cushions gather at the ends and between places, never where someone sits.
    pillow(knit, side * 5.72, .88, 2.42 * side, .54, 1.1 + side, side < 0 ? RUST : FOREST, facing);
    pillow(boucle, side * 5.5, .84, 2.2 * side, .46, 2.4 + side, CAMEL, facing + .3);
    pillow(knit, side * 5.72, .88, -2.42 * side, .52, 3.1 + side, side < 0 ? MUSTARD : RUST, facing);
    pillow(boucle, side * 5.5, .84, -2.18 * side, .44, 4.7 + side, CREAM, facing - .25);
    pillow(boucle, side * 5.74, .9, .9 * side, .46, 5.2 + side, CHOCOLATE, facing);
    // A chunky throw over one arm of each sofa.
    const armZ = 2.78 * side, path = [[4.3, .3], [4.34, .8], [4.68, 1], [5.4, 1.03], [6.12, 1], [6.46, .8], [6.5, .42]].map(([x, y]) => new THREE.Vector3(side * x, y, 0));
    place(knit, once(`throw${side}`, () => drapeGeometry(path, .64, { across: new THREE.Vector3(0, 0, 1), folds: 3, depth: .016, seed: side + 2, columns: 16, rows: 28, tile: KNIT_TILE })), 0, 0, armZ, 1, 1, 1, 0, 0, 0, side < 0 ? 0xcf8f58 : 0xd8c29c);
  }
  // Every authoritative seat lands at the centre of an individual soft cushion.
  root.userData.seatLocal = BUNKER_SOFA_LOCAL;

  // A slab coffee table dressed for an evening in.
  place(shadow, plane, 0, .112, .25, 4.9, 3.5, 1, -Math.PI / 2);
  for (const x of [-1.25, 1.25]) for (const z of [-.5, 1]) wood(x, .28, z, .2, .46, .2, CHOCOLATE, .03);
  wood(0, .58, .25, 3.3, .16, 2.2, 0xe6b27c, .05);
  wood(.72, .675, .32, 1.05, .03, .68, CHOCOLATE, .012);
  [[0xb3513a, .66], [0xd9c7a8, .6], [0x56603f, .52]].forEach(([color, width], i) => place(painted, box, -.82, .695 + i * .055, .42, width, .05, width * .72, 0, .16 - i * .12, 0, color));
  place(painted, cup, -.36, .66, -.42, 1, 1, 1, 0, 0, 0, 0xe8dcc8);
  place(painted, cup, -.02, .66, -.56, 1, 1, 1, 0, 0, 0, 0xc2794a);
  for (const [x, z, tall] of [[.46, .32, .24], [.72, .46, .17], [.96, .22, .3]]) {
    place(painted, cylinder, x, .69 + tall / 2, z, .058, tall, .058, 0, 0, 0, 0xf3e7cf);
    place(glow, smallSphere, x, .69 + tall + .05, z, .02, .05, .02, 0, 0, 0, 0xffd28a);
    halo(x, .69 + tall + .06, z, .36, .42, .22, .07);
  }
  place(painted, vase, .1, .66, .86, .75, .75, .75, 0, 0, 0, 0xcbb593);
  for (let i = 0; i < 7; i++) place(painted, leaf, .1, 1.0, .86, .1, .55, .1, -.24 + i * .08, i * .9, .12, i % 2 ? 0xc8a673 : 0xb08a58);

  // Ledgestone chimney breast with a real opening, heavy mantel and raised hearth.
  const FIRE_Z = 8.34, FIRE_FLOOR = .24;
  place(shadow, plane, 0, .03, 7.2, 7.4, 2.6, 1, -Math.PI / 2);
  soft(stone, 0, .12, 8.0, 5.6, .24, 2.0, { radius: .04, seg: 3, tile: .5 }, 0xffffff);
  for (const x of [-1.75, 1.75]) place(stone, box, x, .94, 8.38, 1.6, 1.4, 1.24);
  place(stone, box, 0, 3.02, 8.38, 5.1, 2.96, 1.24);
  place(stone, box, 0, 1.44, 8.86, 1.92, 1.4, .3);
  place(painted, box, 0, FIRE_FLOOR + .55, 8.68, 1.92, 1.1, .04, 0, 0, 0, 0x1b120c);
  wood(0, 1.66, 7.78, 5.5, .28, .46, WALNUT, .05);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05, length = .96 - (i % 3) * .1;
    place(painted, once(`fire-log${i % 3}`, () => logGeometry(.1, length, i % 3 + 1)), Math.sin(a * 1.7) * .22, FIRE_FLOOR + .1 + (i > 3 ? .16 : 0), FIRE_Z - .1 + (i % 3) * .14, 1, 1, 1, 0, a * .22 - .1, Math.PI / 2 + (i > 3 ? (i % 2 ? .24 : -.24) : 0), 0x6e5140);
  }
  place(glow, smallSphere, 0, FIRE_FLOOR + .02, FIRE_Z, .7, .05, .26, 0, 0, 0, 0xff6a1e);
  halo(0, .92, 7.72, 2.8, .32, .13, .03);
  // Mantel things: a low row of candles and two small jars.
  for (const [x, tall] of [[-1.9, .3], [-1.62, .2], [1.72, .24]]) {
    place(painted, cylinder, x, 1.8 + tall / 2, 7.76, .06, tall, .06, 0, 0, 0, 0xf1e4cb);
    place(glow, smallSphere, x, 1.8 + tall + .05, 7.76, .02, .05, .02, 0, 0, 0, 0xffd28a);
    halo(x, 1.8 + tall + .06, 7.7, .4, .4, .2, .06);
  }
  place(painted, vase, .95, 1.8, 7.76, .8, .8, .8, 0, 0, 0, 0xb98a58);
  place(painted, vase, -.8, 1.8, 7.76, .62, .62, .62, 0, 0, 0, 0x8d5a3a);

  // Firewood stacked either side of the hearth, then lit shelves out to the corners.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) for (let i = 0; i < 6 - (row % 2); i++) {
      const seed = (row * 3 + i) % 4 + 1, radius = .085 + seed * .006;
      place(painted, once(`stack${seed}`, () => logGeometry(radius, .86, seed)), side * (2.92 + (i - 2.5 + (row % 2) * .5) * .185), .16 + row * .16, 8.28, 1, 1, 1, Math.PI / 2, 0, seed * .4, 0xa17a5c);
    }
    wood(side * 3.0, .06, 8.28, 1.34, .12, 1.0, CHOCOLATE, .02);
  }
  const palette = [0x9c4a2c, 0xc69a54, 0x6a3f2a, 0x56603f, 0xdac6a4, 0x7c5a40, 0xad6e3f];
  for (const side of [-1, 1]) {
    const centre = side * 5.1, width = 3.0;
    place(oak, box, centre, 2.2, 8.84, width, 4.4, .1, 0, 0, 0, CHOCOLATE);
    wood(centre, .22, 8.3, width, .44, .9, WALNUT, .03);
    for (const y of [.46, 1.3, 2.14, 2.98, 3.82]) wood(centre, y, 8.3, width, .08, .9, HONEY, .012);
    for (const dx of [-1.5, 0, 1.5]) wood(centre + dx, 2.14, 8.3, .08, 3.44, .9, HONEY, .012);
    for (let shelf = 0; shelf < 4; shelf++) for (let bay = 0; bay < 2; bay++) {
      const shelfY = .5 + shelf * .84, startX = centre - 1.32 + bay * 1.5;
      for (let book = 0; book < 6; book++) {
        if ((shelf + bay + (side > 0 ? 1 : 0)) % 3 === 0 && book > 2) continue;
        const bookWidth = .12 + ((bay + book * 3 + shelf) % 4) * .022, height = .42 + ((book * 3 + shelf * 2 + bay) % 5) * .05, color = palette[(bay + shelf + book + (side > 0 ? 2 : 0)) % palette.length];
        place(painted, box, startX + book * .2, shelfY + height / 2, 8.24, bookWidth, height, .44, 0, 0, book === 5 ? .08 : 0, color);
        place(painted, box, startX + book * .2, shelfY + .1, 8.016, bookWidth * .78, .014, .008, 0, 0, 0, 0xe7d6b3);
      }
      if ((shelf + bay + (side > 0 ? 1 : 0)) % 3 === 0) {
        place(painted, vase, startX + .92, shelfY, 8.22, .72, .74, .72, 0, 0, 0, 0xc7a67b);
        place(glow, smallSphere, startX + .46, shelfY + .16, 8.1, .09, .09, .09, 0, 0, 0, 0xffc77e);
        halo(startX + .46, shelfY + .16, 8.0, .6, .3, .16, .05);
      }
    }
  }

  // Built-in benches line the long walls, so no stretch of floor feels bare.
  for (const side of [-1, 1]) {
    wood(side * 9.32, .24, 0, 1.1, .48, 11.6, WALNUT, .03);
    soft(boucle, side * 9.32, .56, 0, 1.04, .18, 11.5, { radius: .07, crown: .02, seg: 5, seed: side }, OATMEAL);
    place(shadow, plane, side * 8.55, .012, 0, 1.3, 12.2, 1, -Math.PI / 2);
    for (let i = 0; i < 5; i++) pillow(i % 2 ? boucle : knit, side * 9.58, .92, -4.4 + i * 2.2, .54, i + 7 + side, [RUST, CREAM, MUSTARD, CAMEL, FOREST][(i + (side > 0 ? 2 : 0)) % 5], -side * Math.PI / 2);
  }

  // Two fireside game tables with a pouf at each side. The boards are set out here; their stones come from the live game.
  BUNKER_GAMES_LOCAL.forEach(({ game, x, z }, index) => {
    place(shadow, plane, x, .03, z, 4.1, 2.1, 1, -Math.PI / 2);
    for (const dx of [-.5, .5]) for (const dz of [-.5, .5]) wood(x + dx, .31, z + dz, .13, .62, .13, CHOCOLATE, .03);
    wood(x, .655, z, 1.4, .1, 1.4, 0xe6b27c, .03);
    const look = BOARD_LOOK[game], span = look.pitch * (look.size - 1), omok = game === "omok";
    if (omok) wood(x, BOARD_TOP - .016, z, 1.22, .032, 1.22, 0xffd9a3, .008);
    else place(painted, box, x, BOARD_TOP - .016, z, 1.14, .032, 1.14, 0, 0, 0, 0x2f7052);
    const lines = omok ? look.size : look.size + 1, reach = omok ? span : look.pitch * look.size, ink = omok ? 0x3a2717 : 0x143a29;
    for (let i = 0; i < lines; i++) {
      const offset = i * reach / (lines - 1) - reach / 2;
      place(painted, box, x + offset, BOARD_TOP + .0006, z, .0065, .0012, reach + .0065, 0, 0, 0, ink);
      place(painted, box, x, BOARD_TOP + .0006, z + offset, reach + .0065, .0012, .0065, 0, 0, 0, ink);
    }
    [[CAMEL, RUST], [FOREST, MUSTARD]][index].forEach((color, side) => {
      const seatX = x + (side ? 1.15 : -1.15);
      place(knit, once("pouf", () => poufGeometry(.46, .36, 12, mobile ? 28 : 44, mobile ? 12 : 20)), seatX, .02, z, 1, 1, 1, 0, seatX * .3, 0, color);
    });
  });
  // Olive trees in the far corners.
  for (const x of [-8.1, 8.1]) {
    place(painted, pot, x, 0, 6.5, 1, 1, 1, 0, 0, 0, 0xa8603a);
    place(shadow, plane, x, .012, 6.5, 2.2, 2.2, 1, -Math.PI / 2);
    for (let branch = 0; branch < 11; branch++) {
      const angle = branch * 2.399, dx = Math.sin(angle) * .34, dz = Math.cos(angle) * .34, height = 1.1 + branch % 3 * .32;
      place(painted, cylinder, x + dx * .6, .68 + height * .34, 6.5 + dz * .6, .014, height * .7, .014, Math.cos(angle) * .22, 0, -Math.sin(angle) * .22, 0x5a4530);
      place(painted, leaf, x + dx, .82 + height * .35, 6.5 + dz, .85, height, 1, .55, angle, .16, branch % 2 ? 0x74804f : 0x5f6c42);
    }
  }

  // Table lamps on the two end tables.
  for (const [x, z] of [[-5.3, -3.85], [5.3, 3.85]] as const) {
    place(shadow, plane, x, .112, z, 1.7, 1.7, 1, -Math.PI / 2);
    for (const a of [.8, 2.4, 3.9, 5.5]) wood(x + Math.sin(a) * .3, .27, z + Math.cos(a) * .3, .06, .54, .06, CHOCOLATE, .02);
    wood(x, .58, z, .98, .07, .98, 0xe6b27c, .03);
    place(painted, lampBase, x, .615, z, .78, .8, .78, 0, 0, 0, 0xb5754a);
    place(glow, shade, x, 1.34, z, .52, .55, .52, 0, 0, 0, 0xffc98a);
    halo(x, 1.34, z, 1.9, .3, .16, .05);
  }
  // Floor lamps stand in the back corners behind the sofas.
  for (const x of [-8.1, 8.1]) {
    place(brass, cylinder, x, .02, -6.2, .26, .04, .26);
    place(brass, cylinder, x, .98, -6.2, .02, 1.92, .02);
    place(glow, shade, x, 1.98, -6.2, .62, .62, .62, 0, 0, 0, 0xffc98a);
    place(shadow, plane, x, .012, -6.2, 1.6, 1.6, 1, -Math.PI / 2);
    halo(x, 1.98, -6.2, 2.1, .28, .15, .05);
  }
  // Candle-style sconces in brass along the walls.
  for (const x of [-9.95, 9.95]) for (const z of [-3.7, 3.7]) {
    wood(x, 3.1, z, .04, .6, .26, WALNUT, .012);
    place(brass, cylinder, x - Math.sign(x) * .16, 2.85, z, .1, .03, .1);
    place(glow, smallSphere, x - Math.sign(x) * .16, 3.0, z, .085, .14, .085, 0, 0, 0, 0xffd493);
    halo(x - Math.sign(x) * .2, 3.0, z, 1.5, .3, .16, .05);
  }
  // A black-iron ring of candle bulbs over the seating.
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) place(painted, cylinder, Math.sin(a) * .62, 4.92, .25 + Math.cos(a) * .62, .012, 1.26, .012, Math.cos(a) * .55, 0, -Math.sin(a) * .55, 0x241a14);
  place(painted, cylinder, 0, 5.72, .25, .03, .56, .03, 0, 0, 0, 0x241a14);
  place(painted, ring, 0, 4.3, .25, 1.2, 1.2, 1.2, Math.PI / 2, 0, 0, 0x2c2019);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, x = Math.sin(a) * 1.2, z = .25 + Math.cos(a) * 1.2;
    place(painted, cylinder, x, 4.38, z, .05, .14, .05, 0, 0, 0, 0xf1e6d0);
    place(glow, smallSphere, x, 4.51, z, .05, .09, .05, 0, 0, 0, 0xffe0a8);
    halo(x, 4.52, z, .9, .36, .19, .06);
  }

  // Steep timber ladder ends at an opaque wooden hatch below the intact ceiling.
  const ladderZ = BUNKER_LADDER_LOCAL.z;
  for (const x of [-.52, .52]) place(oak, cylinder, x, 2.94, ladderZ, .05, 5.55, .05, -.09, 0, 0, WALNUT);
  for (let rung = 0; rung < 15; rung++) {
    const y = .35 + rung * .36, z = ladderZ - (y - 2.94) * .09;
    place(oak, cylinder, 0, y, z, .045, 1.12, .045, 0, 0, Math.PI / 2, HONEY);
  }
  wood(0, h - .032, ladderZ - .25, 1.55, .045, 1.5, HONEY, .02);
  place(brass, torus, 0, h - .067, ladderZ - .25, 1, 1, 1, Math.PI / 2);
  place(glow, smallSphere, 0, 2.85, -8.86, .14, .22, .08, 0, 0, 0, 0xffd493);
  halo(0, 2.85, -8.72, 1.5, .28, .15, .05);
  place(shadow, plane, 0, .012, ladderZ, 2.4, 1.8, 1, -Math.PI / 2);

  const shared: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const [material, pieces] of batches) {
    for (const piece of pieces) if (!piece.index) piece.setIndex(Array.from({ length: piece.getAttribute("position").count }, (_, i) => i));
    const geometry = mergeGeometries(pieces, false)!;
    geometry.name = `${material.name}-geometry`; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    for (const piece of pieces) piece.dispose();
    geometries.add(geometry); shared.push({ geometry, material });
  }
  for (const geometry of new Set([...sources, ...cached.values()])) geometry.dispose();

  // Flames and every soft glow are one small draw each.
  const flameMaterial = createBaikalFlameMaterial(flameTime), flameCount = 11;
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

  const hatchWood = new RoundedBoxGeometry(1.3, .016, 1.4, 2, .007);
  const hatchFrame = new RoundedBoxGeometry(1.36, .006, 1.46, 1, .002);
  const handle = new THREE.TorusGeometry(.09, .014, 5, 16); handle.rotateX(-Math.PI / 2);
  geometries.add(hatchWood); geometries.add(hatchFrame); geometries.add(handle);
  const hatchOak = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xc5a77f, roughness: .88 }), hatchWalnut = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x705542, roughness: .88 }), hatchBrass = new THREE.MeshStandardMaterial({ color: 0xb69b65, metalness: .65, roughness: .48 });
  hatchOak.name = "uyuni-bunker-hatch-oak"; hatchWalnut.name = "uyuni-bunker-hatch-walnut"; hatchBrass.name = "uyuni-bunker-hatch-brass";
  materials.add(hatchOak); materials.add(hatchWalnut); materials.add(hatchBrass);
  const flames: THREE.InstancedMesh[] = [], placement = new THREE.Object3D(), roomStones = new Map<UyuniBunkerId, THREE.InstancedMesh>();
  const stoneGeometry = new THREE.SphereGeometry(1, 14, 8); geometries.add(stoneGeometry);
  const blackStone = new THREE.Color(0x15130f), whiteStone = new THREE.Color(0xf3eddf);
  for (const bunker of UYUNI_BUNKERS) {
    const entry = new THREE.Group(); entry.name = `uyuni-bunker-hatch-${bunker.id}`; entry.position.set(bunker.entry.x, bunker.entry.y, bunker.entry.z); root.add(entry);
    for (const [name, geometry, material, y] of [
      ["frame", hatchFrame, hatchWalnut, .004], ["wood", hatchWood, hatchOak, .009], ["handle", handle, hatchBrass, .033],
    ] as const) {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `uyuni-bunker-hatch-${name}-${bunker.id}`; mesh.position.y = y; mesh.layers.enable(2); entry.add(mesh);
    }
    const room = new THREE.Group(); room.name = `uyuni-bunker-room-${bunker.id}`; room.position.set(bunker.x, bunker.floorY, bunker.z); room.visible = false;
    root.add(room); rooms.set(bunker.id, room);
    for (const batch of shared) {
      const mesh = new THREE.Mesh(batch.geometry, batch.material); mesh.name = `${batch.material.name}-${bunker.id}`;
      if (batch.material === shadow) mesh.renderOrder = 1;
      room.add(mesh);
    }
    const fire = new THREE.InstancedMesh(flameGeometry, flameMaterial, flameCount);
    for (let i = 0; i < flameCount; i++) {
      const outer = i > 3;
      placement.position.set((i / (flameCount - 1) - .5) * 1.05 + Math.sin(i * 2.4) * .05, FIRE_FLOOR + .14, FIRE_Z - .08 + Math.cos(i * 2.4) * .08);
      placement.scale.set(outer ? .3 + (i % 3) * .07 : .46, outer ? .44 + (i % 4) * .1 : .72, 1);
      placement.updateMatrix(); fire.setMatrixAt(i, placement.matrix);
    }
    fire.name = `uyuni-bunker-flames-${bunker.id}`; fire.frustumCulled = false; fire.renderOrder = 6; room.add(fire); flames.push(fire);
    const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, MAX_STONES);
    stones.name = `uyuni-bunker-stones-${bunker.id}`; stones.frustumCulled = false; stones.count = 0; stones.setColorAt(0, whiteStone); room.add(stones); roomStones.set(bunker.id, stones); flames.push(stones);
    const glows = new THREE.Mesh(haloGeometry, haloMaterial); glows.name = `uyuni-bunker-halos-${bunker.id}`; glows.frustumCulled = false; glows.renderOrder = 7; room.add(glows);
    // These three light only the visitors; every surface of the room has its own lighting above.
    const ambient = new THREE.AmbientLight(0xffdfbd, 1.15); ambient.name = `uyuni-bunker-ambient-${bunker.id}`; room.add(ambient);
    for (const [index, [x, y, z, power]] of ([[0, 3.2, .25, 34], [0, 1.4, 6.6, 16]] as const).entries()) {
      const light = new THREE.PointLight(0xffc58a, power, 18, 2); light.name = `uyuni-bunker-light-${bunker.id}-${index}`;
      light.position.set(x, y, z); light.castShadow = false; room.add(light);
    }
  }

  let disposed = false, baked: CozySurfaces | null = null, activeRoom: UyuniBunkerId | null = null, shownBoards = "";
  /** The timber, boucle and stone are drawn once on the visitor's GPU, and only by those who actually come down the ladder. */
  const bakeSurfaces = () => {
    if (baked || !options.renderer) return;
    baked = bakeCozySurfaces(options.renderer, mobile);
    const normal = new THREE.Vector2(.5, .5);
    for (const material of [wall, floor, ceiling]) { material.map = baked.planks; material.normalMap = baked.planksNormal; material.normalScale = normal; }
    oak.map = baked.wood;
    boucle.map = null; boucle.normalMap = baked.boucle; boucle.normalScale = new THREE.Vector2(.9, .9);
    knit.map = null; knit.normalMap = baked.knit; knit.normalScale = new THREE.Vector2(1.1, 1.1);
    rug.normalMap = baked.boucle; rug.normalScale = new THREE.Vector2(.7, .7);
    stone.map = baked.stone; stone.normalMap = baked.stoneNormal; stone.normalScale = new THREE.Vector2(.9, .9);
    for (const material of [wall, floor, ceiling, oak, boucle, knit, rug, stone]) material.needsUpdate = true;
  };
  return {
    root,
    setActive(id) {
      if (disposed) return;
      if (id) bakeSurfaces();
      activeRoom = id; shownBoards = "";
      for (const [roomId, room] of rooms) room.visible = roomId === id;
    },
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
      flameTime.value = time;
      // Slow breathing with a small quick flicker: the room pulses, it never strobes.
      uRoomFire.value = (1 + Math.sin(time * .65) * .05 + Math.sin(time * 1.7 + .6) * .03) * (1 + (Math.sin(time * 9.3) * Math.sin(time * 5.1 + 1.3) + Math.sin(time * 13.7)) * .035);
    },
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent(); root.clear(); rooms.clear();
      for (const fire of flames) fire.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      shadowTexture.dispose(); rugWeave.dispose(); baked?.dispose();
    },
  };
}
