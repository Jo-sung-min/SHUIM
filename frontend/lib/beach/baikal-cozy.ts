import * as THREE from "three";
import { BAIKAL_CABIN, BAIKAL_CABINS, BAIKAL_COZY_PER_ROOM, BAIKAL_ROOM_OCCLUSION_BOX, baikalRoofHeight } from "./baikal-layout";
import type { BaikalUniforms } from "./baikal-materials";

/* ---------------- warm interior lighting, as a patch over MeshStandardMaterial ---------------- */
const O = BAIKAL_ROOM_OCCLUSION_BOX, c = BAIKAL_CABIN, roofSlope = (baikalRoofHeight(c.maxX) - baikalRoofHeight(c.minX)) / (c.maxX - c.minX);
const glsl = (value: number) => Number.isInteger(value) ? `${value}.0` : `${value}`;

export const COZY_LIGHT_FUNCTIONS = `
uniform vec4 uCozyPos[${BAIKAL_COZY_PER_ROOM * BAIKAL_CABINS.length}];
uniform vec4 uCozyTint[${BAIKAL_COZY_PER_ROOM * BAIKAL_CABINS.length}];
uniform float uRoomEnv[${BAIKAL_CABINS.length}];
uniform float uFireGlow;
uniform float uLamp;
uniform sampler2D uRoomOcc;
uniform float uHasRoomOcc;
// Every warm source in this room at once, no shadow maps: soft wrapped diffuse, ceiling spots with a real cone, the room's first light breathing.
vec3 cozyIrradiance(vec3 p, vec3 n, int room) {
  vec3 sum = vec3(0.0);
  int first = room * ${BAIKAL_COZY_PER_ROOM};
  for (int i = first; i < first + COZY_COUNT; i++) {
    vec3 l = uCozyPos[i].xyz - p;
    float d2 = dot(l, l) + 0.09;
    vec3 L = l / sqrt(d2);
    float cosine = dot(n, L);
    float diffuse = max(cosine, 0.0) * 0.8 + (cosine * 0.5 + 0.5) * 0.2;
    float cone = uCozyTint[i].a > 0.5 ? smoothstep(0.66, 0.93, L.y) : 1.0;
    float power = uCozyPos[i].w * (i == first ? uFireGlow : uLamp);
    sum += uCozyTint[i].rgb * power * diffuse * cone / d2;
  }
  return sum;
}
// The room is a known box, so its corners can be darkened exactly. A surface ignores the plane it lies on.
float cozyShellShade(vec3 p, vec3 n) {
  float ceiling = ${glsl(c.floorY + c.lowEave - .22)} + ${glsl(roofSlope)} * (p.x - (${glsl(c.minX)}));
  vec3 low = p - vec3(${glsl(c.minX + c.wall / 2)}, ${glsl(c.floorY)}, ${glsl(c.minZ + c.wall / 2)});
  vec3 high = vec3(${glsl(c.maxX)}, ceiling, ${glsl(c.maxZ - c.wall / 2)}) - p;
  vec3 d = min(low, high) + abs(n) * 8.0;
  float nearest = min(d.x, min(d.y, d.z));
  return mix(0.52, 1.0, smoothstep(0.0, 0.85, nearest));
}
float cozyFloorShade(vec3 p, vec3 n, int room) {
  if (uHasRoomOcc < 0.5 || n.y < 0.5 || p.y > ${glsl(c.floorY + .16)}) return 1.0;
  vec2 uv = vec2((p.x - ${glsl(O.minX)}) / ${glsl(O.maxX - O.minX)}, (${glsl(O.maxZ)} - p.z) / ${glsl(O.maxZ - O.minZ)});
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  uv.x = (float(room) + uv.x) / ${glsl(BAIKAL_CABINS.length)};
  vec2 shade = texture2D(uRoomOcc, uv).rg;
  return (1.0 - shade.r * 0.7) * (1.0 - shade.g * 0.42);
}
`;

const VERT_PARS = `
uniform vec2 uRoomOrigins[3];
varying vec3 vCozyWorld;
varying vec2 vCozyRoom;
varying float vCozyRoomIndex;
`;
const VERT_BODY = `
vec4 cozyWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
cozyWorld = instanceMatrix * cozyWorld;
#endif
cozyWorld = modelMatrix * cozyWorld;
vCozyWorld = cozyWorld.xyz;
// Merged and instanced pieces alike find their own room, so all three cabins stay lit from far across the ice.
vCozyRoom = uRoomOrigins[0];
vCozyRoomIndex = 0.0;
for (int i = 1; i < 3; i++) if (distance(cozyWorld.xz, uRoomOrigins[i] + vec2(-23.0, 6.0)) < distance(cozyWorld.xz, vCozyRoom + vec2(-23.0, 6.0))) { vCozyRoom = uRoomOrigins[i]; vCozyRoomIndex = float(i); }
`;
const FRAG_PARS = `
varying vec3 vCozyWorld;
varying vec2 vCozyRoom;
varying float vCozyRoomIndex;
${COZY_LIGHT_FUNCTIONS}
vec3 cozyBoxProject(vec3 direction) {
  vec3 p = vCozyWorld - vec3(vCozyRoom.x, 0.0, vCozyRoom.y);
  vec3 a = (vec3(${glsl(c.maxX)}, 7.0, ${glsl(c.maxZ)}) - p) / direction, b = (vec3(${glsl(c.minX)}, ${glsl(c.floorY)}, ${glsl(c.minZ)}) - p) / direction;
  vec3 far = max(a, b);
  return normalize(p + direction * min(far.x, min(far.y, far.z)) - vec3(-23.0, 2.4, 6.0));
}
`;
const FRAG_BODY = `
{
  vec3 cozyLocal = vCozyWorld - vec3(vCozyRoom.x, 0.0, vCozyRoom.y);
  vec3 cozyNormal = normalize(transpose(mat3(viewMatrix)) * geometryNormal);
  int cozyRoomId = int(vCozyRoomIndex + 0.5);
  float cozyEnv = uRoomEnv[cozyRoomId];
  float cozyShade = cozyShellShade(cozyLocal, cozyNormal) * cozyFloorShade(cozyLocal, cozyNormal, cozyRoomId);
  vec3 cozyLight = cozyIrradiance(cozyLocal, cozyNormal, cozyRoomId);
  reflectedLight.directDiffuse += cozyLight * BRDF_Lambert(material.diffuseColor);
  reflectedLight.indirectDiffuse *= cozyShade * cozyEnv;
  reflectedLight.directDiffuse *= mix(1.0, cozyShade, 0.55);
  reflectedLight.indirectSpecular *= mix(1.0, cozyShade, 0.6) * cozyEnv;
  #ifdef COZY_FABRIC
  // Soft cloth: fine fibres catch light at the silhouette, the peach-skin rim of velvet and wool.
  float cozyRim = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 2.6);
  reflectedLight.directDiffuse += material.diffuseColor * cozyLight * cozyRim * 0.2;
  reflectedLight.indirectDiffuse += material.diffuseColor * (reflectedLight.indirectDiffuse / max(material.diffuseColor, vec3(0.02))) * cozyRim * 0.38;
  #endif
}
`;

export interface CozyOptions { fabric?: boolean; mirrorFloor?: boolean; glowVertex?: boolean; cavity?: number; count?: number }
const INDOOR_LIGHTS = THREE.ShaderChunk.lights_fragment_begin
  .replace("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
  .replace("#if ( NUM_HEMI_LIGHTS > 0 )", "#if 0");
const BOX_PROJECTED_ENV = THREE.ShaderChunk.envmap_physical_pars_fragment
  .replace("envMapRotation * reflectVec, roughnessToMip( roughness )", "envMapRotation * cozyBoxProject( reflectVec ), roughnessToMip( roughness )");

/**
 * Turns a MeshStandardMaterial into room lighting: the sky and sun are shut out by the roof, and in their place come
 * the captured room environment, every lamp and the stove. Nothing here costs a draw call or a shadow pass.
 */
export function applyCozyLighting(material: THREE.MeshStandardMaterial, shared: BaikalUniforms, options: CozyOptions = {}) {
  const count = options.count ?? BAIKAL_COZY_PER_ROOM;
  material.onBeforeCompile = (shader) => {
    for (const name of ["uCozyPos", "uCozyTint", "uFireGlow", "uLamp", "uRoomOcc", "uHasRoomOcc", "uRoomOrigins", "uRoomEnv"]) shader.uniforms[name] = shared[name];
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`);
    let fragment = `#define COZY_COUNT ${count}\n${options.fabric ? "#define COZY_FABRIC\n" : ""}` + shader.fragmentShader;
    fragment = fragment
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <lights_fragment_begin>", INDOOR_LIGHTS)
      .replace("#include <aomap_fragment>", `${FRAG_BODY}\n#include <aomap_fragment>`);
    if (options.mirrorFloor) fragment = fragment.replace("#include <envmap_physical_pars_fragment>", BOX_PROJECTED_ENV);
    if (options.cavity !== undefined) fragment = fragment.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\ndiffuseColor.rgb *= mix(${glsl(options.cavity)}, 1.0, texture2D( normalMap, vNormalMapUv ).a);`);
    if (options.glowVertex) fragment = fragment.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;");
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `baikal-cozy-${count}-${options.fabric ? 1 : 0}-${options.mirrorFloor ? 1 : 0}-${options.cavity ?? "n"}-${options.glowVertex ? 1 : 0}`;
  return material;
}

/* ---------------- soft goods ---------------- */
export interface SoftBoxOptions { radius?: number; crown?: number; bulge?: number; seg?: number; seed?: number; wrinkle?: number; sag?: number; tile?: number }
const pinch = (t: number) => Math.sin(t * Math.PI / 2);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * An upholstered volume: a rounded box whose panels balloon, whose seams pull in and whose fabric sags and creases.
 * Grid lines crowd towards the edges where the curvature is, and smooth normals come from the shape itself so seams stay invisible.
 */
export function softBoxGeometry(width: number, height: number, depth: number, options: SoftBoxOptions = {}): THREE.BufferGeometry {
  const hx = width / 2, hy = height / 2, hz = depth / 2, radius = Math.min(options.radius ?? .05, hx * .98, hy * .98, hz * .98);
  const crown = options.crown ?? 0, bulge = options.bulge ?? 0, seg = Math.max(2, options.seg ?? 6), seed = options.seed ?? 0, wrinkle = options.wrinkle ?? 0, sag = options.sag ?? 0, tile = options.tile ?? 1;
  const ix = hx - radius, iy = hy - radius, iz = hz - radius;
  const shape = (cx: number, cy: number, cz: number, out: number[]) => {
    const sx = cx * hx, sy = cy * hy, sz = cz * hz;
    const qx = Math.max(-ix, Math.min(ix, sx)), qy = Math.max(-iy, Math.min(iy, sy)), qz = Math.max(-iz, Math.min(iz, sz));
    let dx = sx - qx, dy = sy - qy, dz = sz - qz; const m = Math.hypot(dx, dy, dz) || 1;
    dx /= m; dy /= m; dz /= m;
    let x = qx + dx * radius, y = qy + dy * radius, z = qz + dz * radius;
    const lift = Math.pow(Math.max(0, (1 - cx * cx) * (1 - cz * cz)), .65) * cy * cy;
    y += Math.sign(cy) * crown * lift;
    x += Math.sign(cx) * bulge * Math.pow(Math.max(0, (1 - cy * cy) * (1 - cz * cz)), .8) * cx * cx;
    z += Math.sign(cz) * bulge * Math.pow(Math.max(0, (1 - cy * cy) * (1 - cx * cx)), .8) * cz * cz;
    if (sag && cy > 0) y -= sag * Math.exp(-(cx * cx + cz * cz) * 2.6) * cy * cy;
    if (wrinkle) {
      const edge = Math.max(Math.abs(cx), Math.abs(cz)), folds = Math.sin(x * 23 + seed * 3.1 + z * 6) * Math.sin(z * 17 - seed + x * 3) + .55 * Math.sin((x - z) * 41 + seed * 7);
      y += folds * wrinkle * smoothstep(.45, .95, edge) * (cy > 0 ? 1 : .35) * cy * cy;
      x += folds * wrinkle * .5 * smoothstep(.5, 1, Math.abs(cy)) * cx * cx * Math.sign(cx);
    }
    out[0] = x; out[1] = y; out[2] = z;
  };
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  const pa = [0, 0, 0], pb = [0, 0, 0], ca = [0, 0, 0];
  const faces: [number, number, number, number][] = [[0, 1, 2, 1], [0, -1, 2, 1], [1, 1, 0, 2], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 0, 1]];
  const eps = .012, tangentU = [0, 0, 0], tangentV = [0, 0, 0];
  for (const [axis, sign, uAxis, vAxis] of faces) {
    const base = positions.length / 3;
    const axisNormal = [0, 0, 0]; axisNormal[axis] = sign;
    const axisU = [0, 0, 0], axisV = [0, 0, 0]; axisU[uAxis] = 1; axisV[vAxis] = 1;
    const flip = (axisU[1] * axisV[2] - axisU[2] * axisV[1]) * axisNormal[0] + (axisU[2] * axisV[0] - axisU[0] * axisV[2]) * axisNormal[1] + (axisU[0] * axisV[1] - axisU[1] * axisV[0]) * axisNormal[2] < 0;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const u = pinch(i / seg * 2 - 1), v = pinch(j / seg * 2 - 1);
      ca[axis] = sign; ca[uAxis] = u; ca[vAxis] = v;
      shape(ca[0], ca[1], ca[2], pa);
      positions.push(pa[0], pa[1], pa[2]);
      // Stepping past a cube edge continues down the neighbouring face, so derivatives stay honest right across the seam.
      const sample = (du: number, dv: number, out: number[]) => {
        const p = [0, 0, 0]; let fixed = 1;
        p[uAxis] = u + du; p[vAxis] = v + dv;
        for (const a of [uAxis, vAxis]) if (Math.abs(p[a]) > 1) { fixed -= Math.abs(p[a]) - 1; p[a] = Math.sign(p[a]); }
        p[axis] = sign * fixed;
        shape(p[0], p[1], p[2], out);
      };
      sample(eps, 0, pa); sample(-eps, 0, pb); for (let a = 0; a < 3; a++) tangentU[a] = pa[a] - pb[a];
      sample(0, eps, pa); sample(0, -eps, pb); for (let a = 0; a < 3; a++) tangentV[a] = pa[a] - pb[a];
      let nx = tangentU[1] * tangentV[2] - tangentU[2] * tangentV[1], ny = tangentU[2] * tangentV[0] - tangentU[0] * tangentV[2], nz = tangentU[0] * tangentV[1] - tangentU[1] * tangentV[0];
      let nl = Math.hypot(nx, ny, nz);
      // Where the surface pinches to nothing, fall back to pointing straight out of the volume.
      if (nl < 1e-9) { shape(ca[0], ca[1], ca[2], pa); nx = pa[0]; ny = pa[1]; nz = pa[2]; nl = Math.hypot(nx, ny, nz) || 1; }
      nx /= nl; ny /= nl; nz /= nl;
      if (nx * axisNormal[0] + ny * axisNormal[1] + nz * axisNormal[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      normals.push(nx, ny, nz);
      const spanU = [hx, hy, hz][uAxis], spanV = [hx, hy, hz][vAxis];
      uvs.push(u * spanU * tile, v * spanV * tile);
      // Baked occlusion: seams and the underside sit in their own shade, sides fall off towards the floor.
      const height01 = ca[1] * .5 + .5;
      const seam = Math.pow(Math.max(Math.abs(ca[0]), Math.abs(ca[1]) * (axis === 1 ? 0 : 1), Math.abs(ca[2])), 9);
      const shade = (axis === 1 && sign < 0 ? .5 : .62 + .38 * smoothstep(0, .75, height01)) * (1 - seam * .2);
      colors.push(shade, shade, shade);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e = d + 1;
      if (flip) index.push(a, d, b, b, d, e); else index.push(a, b, d, b, e, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A scatter cushion: two stuffed halves meeting at a seam, corners drawn out to points, gathered creases radiating from each corner. Thickness is along Y. */
export function cushionGeometry(width: number, depth: number, thickness: number, seed = 0, seg = 16, tile = 1): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [], stride = seg + 1;
  const point = (u: number, v: number) => {
    const x = u * width / 2 * (1 - .13 * (1 - v * v)), z = v * depth / 2 * (1 - .13 * (1 - u * u));
    const fill = Math.pow(Math.max(0, (1 - Math.pow(Math.abs(u), 2.6)) * (1 - Math.pow(Math.abs(v), 2.6))), .58);
    const toCorner = Math.max(Math.abs(u), Math.abs(v)), angle = Math.atan2(v - Math.sign(v || 1), u - Math.sign(u || 1));
    const crease = Math.sin(angle * 11 + seed) * smoothstep(.45, .92, toCorner) * (1 - smoothstep(.92, 1, toCorner)) * .018;
    const dimple = Math.sin(u * 4.1 + seed) * Math.cos(v * 3.3 - seed) * .02 * fill;
    return { x, z, top: thickness / 2 * fill + crease + dimple, shade: .68 + .32 * smoothstep(0, .55, fill) };
  };
  const push = (u: number, v: number, sign: number) => {
    const p = point(u, v); positions.push(p.x, p.top * sign, p.z); uvs.push(u * width / 2 * tile, v * depth / 2 * tile); colors.push(p.shade, p.shade, p.shade);
    return positions.length / 3 - 1;
  };
  const top: number[] = [];
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) top.push(push(i / seg * 2 - 1, j / seg * 2 - 1, 1));
  const bottomId = new Map<number, number>();
  const bottom = (i: number, j: number) => {
    if (i === 0 || j === 0 || i === seg || j === seg) return top[j * stride + i];
    const key = j * stride + i;
    if (!bottomId.has(key)) bottomId.set(key, push(i / seg * 2 - 1, j / seg * 2 - 1, -1));
    return bottomId.get(key)!;
  };
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = top[j * stride + i], b = top[j * stride + i + 1], d = top[(j + 1) * stride + i], e = top[(j + 1) * stride + i + 1];
    index.push(a, d, b, b, d, e);
    const m = bottom(i, j), n = bottom(i + 1, j), o = bottom(i, j + 1), r = bottom(i + 1, j + 1);
    index.push(m, n, o, n, r, o);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/** Cloth laid along a path: the spine follows what it rests on, and folds deepen wherever it hangs free. */
export function drapeGeometry(path: readonly THREE.Vector3[], width: number, options: { across?: THREE.Vector3; folds?: number; depth?: number; along?: number; seed?: number; columns?: number; rows?: number; tile?: number; hang?: (s: number) => number; flare?: number } = {}): THREE.BufferGeometry {
  const across = (options.across ?? new THREE.Vector3(0, 0, 1)).clone().normalize(), folds = options.folds ?? 5, amp = options.depth ?? .035, seed = options.seed ?? 0;
  const columns = options.columns ?? 26, rows = options.rows ?? 26, tile = options.tile ?? 1, hang = options.hang ?? (() => 1), flare = options.flare ?? 0;
  const curve = new THREE.CatmullRomCurve3(path.map(p => p.clone()), false, "centripetal"), length = curve.getLength();
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  const spine = new THREE.Vector3(), tangent = new THREE.Vector3(), normal = new THREE.Vector3(), p = new THREE.Vector3();
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const s = j / rows, t = i / columns * 2 - 1, free = hang(s);
    curve.getPointAt(s, spine); curve.getTangentAt(s, tangent); normal.crossVectors(tangent, across).normalize();
    const wave = Math.sin(t * folds * Math.PI + seed + s * 1.4) * (.6 + .4 * Math.sin(t * folds * 2.3 + seed * 2)) * amp * free;
    const ruck = Math.sin(s * 19 + seed * 3 + t * 2) * .006;
    p.copy(spine).addScaledVector(across, t * width / 2 * (1 + flare * s)).addScaledVector(normal, wave + ruck);
    positions.push(p.x, p.y, p.z); uvs.push(t * width / 2 * tile, s * length * tile);
    const shade = .84 + .16 * Math.sin(t * folds * Math.PI + seed + s * 1.4) * free;
    colors.push(shade, shade, shade);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + 1, d = a + columns + 1, e = d + 1;
    index.push(a, b, d, b, e, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/** A hanging panel of heavy linen with deep, slowly wandering pleats. */
export function curtainGeometry(width: number, height: number, pleats: number, seed = 0, columns = 56, rows = 12): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const s = i / columns, h = j / rows, drop = 1 - h;
    const wander = Math.sin(s * 9 + seed + drop * 2.2) * .08 * drop;
    const fold = Math.sin((s + wander) * Math.PI * 2 * pleats + seed);
    positions.push((s - .5) * width * (1 + drop * .05), h * height, fold * (.045 + drop * .03));
    uvs.push(s * width * .8, h * height * .8);
    const shade = .72 + .28 * (fold * .5 + .5);
    colors.push(shade, shade, shade);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + 1, d = a + columns + 1, e = d + 1;
    index.push(a, b, d, b, e, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/**
 * A thick quilt laid over a flat top. It balloons in stitched squares, rolls over the edge, and hangs in soft folds until it reaches `ground`.
 * The origin is the middle of the top surface, so it can be dropped straight onto a mattress.
 */
export function quiltGeometry(width: number, depth: number, options: { overhang?: number; ground?: number; puff?: number; cell?: number; seed?: number; step?: number; rumple?: number } = {}): THREE.BufferGeometry {
  const overhang = options.overhang ?? .25, ground = options.ground ?? .3, puff = options.puff ?? .04, cell = options.cell ?? .36, seed = options.seed ?? 0, step = options.step ?? .05, rumple = options.rumple ?? 0, roll = .07;
  const fullW = width + overhang * 2, fullD = depth + overhang * 2;
  const columns = Math.max(6, Math.ceil(fullW / step)), rows = Math.max(6, Math.ceil(fullD / step));
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const px = (i / columns - .5) * fullW, pz = (j / rows - .5) * fullD;
    const cx = Math.max(-width / 2, Math.min(width / 2, px)), cz = Math.max(-depth / 2, Math.min(depth / 2, pz));
    const ox = px - cx, oz = pz - cz, over = Math.hypot(ox, oz), dx = over > 1e-6 ? ox / over : 0, dz = over > 1e-6 ? oz / over : 0;
    // The first bit of overhang rolls over a rounded edge, the rest falls straight.
    const arc = Math.min(over, roll * Math.PI / 2), lateralRoll = roll * Math.sin(arc / roll), dropRoll = roll * (1 - Math.cos(arc / roll));
    let lateral = lateralRoll, drop = dropRoll + Math.max(0, over - roll * Math.PI / 2);
    const hanging = THREE.MathUtils.clamp(over / overhang, 0, 1), along = Math.abs(ox) > Math.abs(oz) ? pz : px;
    lateral += Math.sin(along * 7.3 + seed * 2.1) * Math.sin(along * 2.9 - seed) * .035 * hanging;
    const seamX = Math.abs(Math.sin(Math.PI * px / cell)), seamZ = Math.abs(Math.sin(Math.PI * pz / cell));
    const stitched = Math.pow(seamX * seamZ, .55);
    const loft = puff * stitched * (1 - hanging * .55);
    const lump = rumple * (Math.sin(px * 3.1 + seed) * Math.sin(pz * 2.7 - seed * 1.4) + .5 * Math.sin(px * 7.3 - pz * 5.1 + seed * 2.2));
    const y = Math.max(-ground, loft + lump - drop);
    positions.push(cx + dx * lateral, y, cz + dz * lateral); uvs.push(px * 1.4, pz * 1.4);
    const shade = (.74 + .26 * stitched) * (1 - hanging * .1);
    colors.push(shade, shade, shade);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + 1, d = a + columns + 1, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/**
 * The blanket that settles on someone who sits down: up over the shoulders, across the lap and off the knees, wrapped around the body.
 * Origin is the seat contact, +z towards the knees.
 */
export function seatBlanketGeometry(columns = 34, rows = 40): THREE.BufferGeometry {
  const spine = new THREE.CatmullRomCurve3([[0, .42, -.2], [0, .52, -.07], [0, .44, .12], [0, .24, .24], [0, .2, .46], [0, .15, .68], [0, -.14, .78], [0, -.46, .8]].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, "centripetal");
  const across = new THREE.Vector3(1, 0, 0), centre = new THREE.Vector3(), tangent = new THREE.Vector3(), normal = new THREE.Vector3(), p = new THREE.Vector3();
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  const length = spine.getLength();
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const s = j / rows, t = i / columns * 2 - 1;
    spine.getPointAt(s, centre); spine.getTangentAt(s, tangent); normal.crossVectors(tangent, across).normalize();
    const half = .34 + .12 * Math.sin(Math.min(1, s * 1.5) * Math.PI / 2) + s * .05;
    // The sides close around the body, more at the shoulders than at the knees, and the cloth stays plump down the middle.
    const wrap = (1 - s) * .13 + .08, bulge = (1 - t * t) * .07 - Math.pow(Math.abs(t), 3) * wrap;
    const hang = THREE.MathUtils.smoothstep(s, .45, 1);
    const fold = Math.sin(t * 8.5 + s * 2.2 + 1.3) * .018 * (.3 + hang * 1.4) + Math.sin(t * 19 - s * 5) * .006;
    const ruck = Math.sin(s * 23 + t * 2.1) * .007;
    p.copy(centre).addScaledVector(across, t * half).addScaledVector(normal, bulge + fold + ruck);
    positions.push(p.x, p.y, p.z); uvs.push(t * half * 2.2, s * length * 2.2);
    const shade = (.86 + .14 * Math.sin(t * 8.5 + s * 2.2 + 1.3)) * (1 - Math.pow(Math.abs(t), 6) * .16);
    colors.push(shade, shade, shade);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + 1, d = a + columns + 1, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/** A knitted floor pouf: a squashed ball in gores, dimpled at the crown where the panels meet. */
export function poufGeometry(radius: number, height: number, gores = 12, seg = 44, rings = 20): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], index: number[] = [];
  for (let r = 0; r <= rings; r++) for (let s = 0; s <= seg; s++) {
    const polar = r / rings * Math.PI, a = s / seg * Math.PI * 2, ring = Math.sin(polar);
    const groove = 1 - .05 * Math.pow(Math.abs(Math.cos(a * gores / 2)), 6) * ring;
    const profile = Math.pow(ring, .55), up = Math.cos(polar), dimple = Math.exp(-Math.pow(polar / .36, 2)) * .22 * height;
    positions.push(Math.cos(a) * radius * profile * groove, (Math.sign(up) * Math.pow(Math.abs(up), .75) * .5 + .5) * height - dimple, Math.sin(a) * radius * profile * groove);
    uvs.push(s / seg * Math.PI * 2 * radius * 1.2, r / rings * (radius * 2 + height));
    const shade = (.58 + .42 * smoothstep(-.8, .25, up)) * (1 - .3 * Math.pow(Math.abs(Math.cos(a * gores / 2)), 16) * ring);
    colors.push(shade, shade, shade);
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const a = r * (seg + 1) + s, b = a + 1, d = a + seg + 1, e = d + 1;
    index.push(a, b, d, b, e, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(index); geometry.computeVertexNormals();
  return geometry;
}

/** A split firewood round. Length runs along Y: dark bark outside, pale rings on the sawn ends. */
export function logGeometry(radius: number, length: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius * .97, length, 11, 3);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute, normal = geometry.getAttribute("normal") as THREE.BufferAttribute, colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), side = Math.abs(normal.getY(i)) < .5, a = Math.atan2(z, x);
    if (side) { const bump = 1 + Math.sin(a * 5 + seed) * .05 + Math.sin(a * 13 + y * 7 + seed * 2) * .04; position.setXYZ(i, x * bump, y, z * bump); }
    const r = Math.hypot(x, z) / radius, ring = .5 + .5 * Math.sin(r * 17 + seed);
    const shade = side ? .4 + .2 * Math.sin(a * 9 + y * 11 + seed) : 1.15 + .35 * ring - r * .3;
    colors.set([shade * (side ? .75 : 1.02), shade * (side ? .62 : .82), shade * (side ? .5 : .56)], i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  return geometry;
}
