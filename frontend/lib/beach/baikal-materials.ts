import * as THREE from "three";
import { BAIKAL_SKY_FUNCTIONS, BAIKAL_SKY_UNIFORMS } from "./baikal-sky";
import { BAIKAL_CABIN, BAIKAL_CABINS, BAIKAL_COZY_PER_ROOM, BAIKAL_COZY_ROOMS, BAIKAL_ROOM_AMBIENT, BAIKAL_SNOW_DRIFT_BOX, baikalRoofHeight } from "./baikal-layout";

const glslFloat = (value: number) => Number.isInteger(value) ? `${value}.0` : `${value}`;

/**
 * Everything cold shares one uniform set: the sky palette (reflections), the storm, fog, and the warm light spilling
 * from the cabin's glass wall. Like the Uyuni mirror these shaders are not tone mapped and write sRGB values directly,
 * so the ice reflects exactly the sky that is drawn above it.
 */
export interface BaikalUniforms {
  [name: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uStorm: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Vector3>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
  /** Glass wall centre x, z, half width across the wall, strength (0 by day, 1 at night). */
  uCabinLight: THREE.IUniform<THREE.Vector4>;
  uLayers: THREE.IUniform<number>;
  uWalker: THREE.IUniform<THREE.Vector2>;
  uSnowShift: THREE.IUniform<number>;
  uWind: THREE.IUniform<THREE.Vector2>;
  uRoof: THREE.IUniform<THREE.Vector4>;
  uRoofLine: THREE.IUniform<THREE.Vector2>;
  uLamp: THREE.IUniform<number>;
  uAurora: THREE.IUniform<number>;
  uRoofs: THREE.IUniform<THREE.Vector4[]>;
  uRoofLines: THREE.IUniform<THREE.Vector2[]>;
  uCabinLights: THREE.IUniform<THREE.Vector4[]>;
  uSnowPhoto: THREE.IUniform<THREE.Texture | null>;
  uIcePhoto: THREE.IUniform<THREE.Texture | null>;
  uHasSnowPhoto: THREE.IUniform<number>;
  uHasIcePhoto: THREE.IUniform<number>;
  uIceVolume: THREE.IUniform<THREE.Texture | null>;
  uHasIceVolume: THREE.IUniform<number>;
  uSnowDrift: THREE.IUniform<THREE.Texture | null>;
  uHasSnowDrift: THREE.IUniform<number>;
  uFrost: THREE.IUniform<THREE.Texture | null>;
  uHasFrost: THREE.IUniform<number>;
  uRoomCube: THREE.IUniform<THREE.Texture | null>;
  uHasRoomCube: THREE.IUniform<number>;
  uRoomOcc: THREE.IUniform<THREE.Texture | null>;
  uHasRoomOcc: THREE.IUniform<number>;
  /** Stove light 0..1+ with its breathing and flicker, shared with every warm surface. */
  uFireGlow: THREE.IUniform<number>;
  /** Room-local lights as xyz + power, and rgb + 1 for a ceiling spot / 0 for an omni. */
  uCozyPos: THREE.IUniform<THREE.Vector4[]>;
  uCozyTint: THREE.IUniform<THREE.Vector4[]>;
  uRoomOrigins: THREE.IUniform<THREE.Vector2[]>;
  uRoomEnv: THREE.IUniform<number[]>;
}
const cozySlots = () => BAIKAL_COZY_ROOMS.flatMap(room => Array.from({ length: BAIKAL_COZY_PER_ROOM }, (_, i) => room[i] ?? null));
export function createBaikalUniforms(skyUniforms: Record<string, THREE.IUniform>): BaikalUniforms {
  const c = BAIKAL_CABIN, slope = (baikalRoofHeight(c.maxX) - baikalRoofHeight(c.minX)) / (c.maxX - c.minX);
  const storm = skyUniforms.uStorm ?? (skyUniforms.uStorm = { value: 0 });
  const aurora = skyUniforms.uAurora ?? (skyUniforms.uAurora = { value: 0 });
  return {
    ...skyUniforms, uStorm: storm, uAurora: aurora,
    uTime: skyUniforms.uTime ?? { value: 0 },
    uFogColor: { value: new THREE.Vector3(.8, .86, .92) }, uFogNear: { value: 60 }, uFogFar: { value: 320 },
    uCabinLight: { value: new THREE.Vector4(c.maxX, (c.minZ + c.maxZ) / 2, (c.maxZ - c.minZ) / 2, 0) },
    uLayers: { value: 3 }, uWalker: { value: new THREE.Vector2(0, 40) }, uSnowShift: { value: 0 },
    uWind: { value: new THREE.Vector2(-.45, -.14) },
    uRoof: { value: new THREE.Vector4(c.minX - .4, c.eaveMaxX + .6, c.minZ - c.sideEave, c.maxZ + c.sideEave) },
    uRoofLine: { value: new THREE.Vector2(baikalRoofHeight(0), slope) },
    uLamp: { value: 1 },
    uRoofs: { value: BAIKAL_CABINS.map(c => new THREE.Vector4(c.minX - .4, c.eaveMaxX + .6, c.minZ - c.sideEave, c.maxZ + c.sideEave)) },
    uRoofLines: { value: BAIKAL_CABINS.map(c => new THREE.Vector2(baikalRoofHeight(0, c), slope)) },
    uCabinLights: { value: BAIKAL_CABINS.map(c => new THREE.Vector4(c.maxX, c.z, (c.maxZ - c.minZ) / 2, 0)) },
    uSnowPhoto: { value: null }, uIcePhoto: { value: null }, uHasSnowPhoto: { value: 0 }, uHasIcePhoto: { value: 0 },
    uIceVolume: { value: null }, uHasIceVolume: { value: 0 }, uSnowDrift: { value: null }, uHasSnowDrift: { value: 0 },
    uFrost: { value: null }, uHasFrost: { value: 0 }, uRoomCube: { value: null }, uHasRoomCube: { value: 0 },
    uRoomOcc: { value: null }, uHasRoomOcc: { value: 0 }, uFireGlow: { value: 1 },
    uCozyPos: { value: cozySlots().map(l => new THREE.Vector4(l?.x ?? 0, l?.y ?? 0, l?.z ?? 0, l?.power ?? 0)) },
    uCozyTint: { value: cozySlots().map(l => new THREE.Vector4(l?.r ?? 0, l?.g ?? 0, l?.b ?? 0, l?.spot ? 1 : 0)) },
    uRoomEnv: { value: [...BAIKAL_ROOM_AMBIENT] },
    uRoomOrigins: { value: BAIKAL_CABINS.map(c => new THREE.Vector2(c.offsetX, c.offsetZ)) },
  };
}

const COMMON = `
uniform vec4 uCabinLights[3];
float cabinWarmth(vec2 p, vec4 light) {
  float ahead = p.x - light.x;
  float spread = light.z + max(ahead, 0.0) * 0.45;
  float across = abs(p.y - light.y) / max(spread, 0.1);
  return smoothstep(0.0, 1.0, ahead / 2.0) * (1.0 - smoothstep(0.0, 28.0, ahead)) * exp(-across * across * 2.2) * light.w;
}
float cabinGlow(vec2 p) {
  float glow = 0.0;
  for (int i = 0; i < 3; i++) glow = max(glow, cabinWarmth(p, uCabinLights[i]));
  return glow;
}
vec2 iceHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// Voronoi cell borders: F2 - F1 with a touch of Chebyshev distance keeps the cracks angular rather than round.
float iceCracks(vec2 p, float width) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + iceHash2(i + g) - f;
    float cheb = max(abs(r.x), abs(r.y));
    float d = mix(dot(r, r), cheb * cheb, 0.35);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return 1.0 - smoothstep(0.0, width, sqrt(f2) - sqrt(f1));
}
float ignNoise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float frostNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(iceHash2(i).x, iceHash2(i + vec2(1.0, 0.0)).x, f.x), mix(iceHash2(i + vec2(0.0, 1.0)).x, iceHash2(i + vec2(1.0, 1.0)).x, f.x), f.y);
}
`;

/** Four overlapping photographic patches avoid mirrored diamonds and visible image seams. */
const ICE_PHOTO_FUNCTIONS = `
vec3 icePhotoPatch(vec2 local, vec2 cell) {
  vec2 seed = iceHash2(cell + 71.3);
  float turn = floor(seed.x * 4.0);
  if (turn < 1.0) local = local;
  else if (turn < 2.0) local = vec2(-local.y, local.x);
  else if (turn < 3.0) local = -local;
  else local = vec2(local.y, -local.x);
  // Every lookup stays inside the photograph; no repeated or mirrored edge is ever sampled.
  vec2 uv = 0.5 + local * 0.34 + (iceHash2(cell + 93.7) - 0.5) * 0.24;
  return texture2D(uIcePhoto, uv).rgb;
}
vec3 lakeIcePhoto(vec2 world) {
  vec2 p = world / 9.0, cell = floor(p), f = fract(p);
  vec2 blend = f * f * (3.0 - 2.0 * f);
  vec3 a = icePhotoPatch(f, cell);
  vec3 b = icePhotoPatch(f - vec2(1.0, 0.0), cell + vec2(1.0, 0.0));
  vec3 c = icePhotoPatch(f - vec2(0.0, 1.0), cell + vec2(0.0, 1.0));
  vec3 d = icePhotoPatch(f - vec2(1.0), cell + vec2(1.0));
  return pow(mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y), vec3(1.0 / 2.2));
}
`;

/* ---------------- the frozen lake, snow mounds and the shore ---------------- */
const ICE_VERT = `
attribute float aLift;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLift;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vLift = aLift;
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz; vNormal = normalize(mat3(m) * (normal / vec3(dot(m[0].xyz, m[0].xyz), dot(m[1].xyz, m[1].xyz), dot(m[2].xyz, m[2].xyz))));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const ICE_FRAG = `
${BAIKAL_SKY_UNIFORMS}
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uCabinLight;
uniform float uLayers;
uniform vec2 uWalker;
uniform float uSnowShift;
uniform sampler2D uSnowPhoto;
uniform sampler2D uIcePhoto;
uniform float uHasSnowPhoto;
uniform float uHasIcePhoto;
uniform sampler2D uIceVolume;
uniform float uHasIceVolume;
uniform sampler2D uSnowDrift;
uniform float uHasSnowDrift;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLift;
${BAIKAL_SKY_FUNCTIONS}
${COMMON}
${ICE_PHOTO_FUNCTIONS}
const float ICE_TILE = 17.0;
const float ICE_MACRO = 47.0;
const float ICE_THICKNESS = 1.55;
const mat2 ICE_TURN = mat2(0.766, 0.643, -0.643, 0.766);
float iceLod(float metres, float tile) { return log2(max(metres * float(textureSize(uIceVolume, 0).x) / tile, 1.0)); }
// A fine network and a much sparser field of long fractures, so neither repeat is visible.
vec3 iceVolumeAt(vec2 q, float lod, float macroLod) {
  vec3 fine = textureLod(uIceVolume, q / ICE_TILE, lod).rgb;
  vec3 wide = textureLod(uIceVolume, (ICE_TURN * q + 9.4) / ICE_MACRO, macroLod).rgb;
  return vec3(fine.r * 0.85 + wide.r * 0.55, fine.g * 0.85 + wide.g * 0.55, fine.b * 0.55 + wide.b * 0.5);
}
// The ice is walked through in slices along the refracted view ray. Fractures are vertical sheets, so a straight crack seen from an angle
// opens into a curtain hanging down into the lake, and every slice's lookup is blurred by its own stride so the sheets stay continuous.
vec3 iceInterior(vec2 p, vec3 v, float dist, float footprint, vec3 light, vec3 body, out float clarity) {
  vec3 rd = refract(-v, vec3(0.0, 1.0, 0.0), 0.763);
  vec2 lateral = rd.xz / max(-rd.y, 0.3);
  float near = 1.0 - smoothstep(16.0, 85.0, dist);
  int steps = uLayers > 2.5 ? int(mix(3.0, 17.0, near)) : int(mix(2.0, 6.0, near));
  float dz = ICE_THICKNESS / float(steps);
  float stride = max(footprint, length(lateral) * dz * 0.68);
  float lod = iceLod(stride, ICE_TILE), macroLod = iceLod(stride, ICE_MACRO);
  float jitter = mix(0.5, ignNoise(gl_FragCoord.xy), near);
  vec3 gathered = vec3(0.0);
  float through = 1.0;
  for (int i = 0; i < steps; i++) {
    float z = (float(i) + jitter) * dz;
    vec3 s = iceVolumeAt(p + lateral * z, lod, macroLod);
    float reach = s.r > 0.02 ? clamp(s.g / s.r, 0.0, 1.0) * ICE_THICKNESS : 0.0;
    float sheet = clamp(s.r * 1.25, 0.0, 1.0) * smoothstep(-0.05, 0.14, reach - z);
    float veil = s.b * (1.0 - smoothstep(0.1, 1.25, z));
    float opacity = clamp(sheet * 0.62 + veil * 0.34, 0.0, 0.82);
    gathered += through * opacity * exp(-z * 0.85) * mix(vec3(0.5, 0.74, 0.78), vec3(0.9, 0.96, 0.98), sheet);
    through *= 1.0 - opacity * 0.78;
  }
  // Methane rises and freezes in place as columns of stacked pancakes, a little apart with depth, which is what makes Baikal's ice famous.
  if (dist < 34.0) {
    float fade = 1.0 - smoothstep(20.0, 34.0, dist);
    float field = smoothstep(0.46, 0.74, frostNoise(p * 0.17 + 3.7)) * 0.42;
    int planes = uLayers > 2.5 ? 8 : 4;
    // The field bends so the columns never line up into rows.
    vec2 bend = vec2(frostNoise(p * 0.4), frostNoise(p * 0.4 + 7.3)) * 1.8;
    for (int k = 0; k < planes; k++) {
      float z = 0.09 + float(k) * (1.3 / float(planes));
      vec2 q = ICE_TURN * (p + lateral * z) * 2.7 + bend;
      vec2 cell = floor(q), column = iceHash2(cell + 19.19);
      if (column.x > field) continue;
      vec2 own = iceHash2(cell * 1.7 + float(k) * 3.1);
      float breathe = 0.5 + 0.5 * sin(float(k) * 1.37 + column.y * 6.28);
      float radius = (0.045 + column.y * 0.17) * (0.35 + breathe * 0.65) * (own.x > 0.2 ? 1.0 : 0.0);
      if (radius <= 0.0) continue;
      float d = length(q - (cell + 0.22 + column.yx * 0.56)) / radius;
      float disc = 1.0 - smoothstep(0.8, 1.0, d);
      if (disc <= 0.0) continue;
      float rim = smoothstep(0.42, 0.96, d) * disc;
      float dome = pow(max(0.0, 1.0 - d * d), 2.0);
      gathered += through * disc * fade * exp(-z * 0.7) * vec3(0.72, 0.88, 0.93) * (0.05 + 0.2 * rim + dome * 0.12);
      through *= 1.0 - disc * fade * 0.42;
    }
  }
  clarity = through;
  return gathered * light + body * through;
}
// Mirror image of each lit window: the ice shows the actual glass wall and its mullions, not a generic glow.
vec3 cabinReflection(vec3 p, vec3 r, float roughness) {
  vec3 sum = vec3(0.0);
  if (r.x > -0.01 || r.y < 0.0) return sum;
  for (int i = 0; i < 3; i++) {
    vec4 light = uCabinLights[i];
    if (light.w <= 0.0) continue;
    float t = (light.x - p.x) / r.x;
    if (t <= 0.0 || t > 180.0) continue;
    vec3 h = p + r * t;
    float blur = 0.08 + t * roughness;
    float across = 1.0 - smoothstep(light.z - blur, light.z + blur, abs(h.z - light.y));
    float high = smoothstep(0.7 - blur, 0.8 + blur, h.y) * (1.0 - smoothstep(6.6 - blur, 7.0 + blur, h.y));
    float bay = abs(fract((h.z - light.y) / 2.13 + 0.5) - 0.5) * 2.13;
    float rail = abs(h.y - 3.8);
    float bars = mix(0.32, 1.0, smoothstep(0.03, 0.09 + blur * 0.5, bay) * smoothstep(0.03, 0.09 + blur * 0.5, rail));
    sum += vec3(1.0, 0.68, 0.36) * across * high * bars * light.w * exp(-t * 0.018);
  }
  return sum;
}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = max(length(toCam), 0.001);
  vec3 v = toCam / dist;
  vec2 p = vWorld.xz;
  vec3 gn = normalize(vNormal);
  float night = smoothstep(0.25, 0.95, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  // Wind-laid snow: long streaks along the gusts, softly warped, with thin dust feathering out over the bare ice.
  vec2 wind = normalize(vec2(-0.96, -0.28)), across = vec2(-wind.y, wind.x);
  float n1 = beachSkyNoise(p * 0.04), n2 = beachSkyNoise(p * 0.13 + 7.0);
  vec2 warped = p + (vec2(n2, n1) - 0.5) * 18.0;
  float streak = beachSkyNoise(vec2(dot(warped, across) * 0.24, dot(warped, wind) * 0.028));
  float ripple = beachSkyNoise(vec2(dot(p, across) * 1.1, dot(p, wind) * 0.2) + 3.1);
  float cover = n1 * 0.5 + streak * 0.42 + ripple * 0.08 + uSnowShift;
  float crust = smoothstep(0.60, 0.635, cover);
  float dust = smoothstep(0.46, 0.60, cover);
  if (uHasSnowDrift > 0.5) {
    vec2 driftUv = (p - vec2(${glslFloat(BAIKAL_SNOW_DRIFT_BOX.minX)}, ${glslFloat(BAIKAL_SNOW_DRIFT_BOX.minZ)})) / vec2(${glslFloat(BAIKAL_SNOW_DRIFT_BOX.width)}, ${glslFloat(BAIKAL_SNOW_DRIFT_BOX.depth)});
    if (driftUv.x > 0.0 && driftUv.x < 1.0 && driftUv.y > 0.0 && driftUv.y < 1.0) {
      float tail = texture2D(uSnowDrift, driftUv).r + (ripple - 0.5) * 0.28 + (n2 - 0.5) * 0.2;
      crust = max(crust, smoothstep(0.4, 0.5, tail)); dust = max(dust, smoothstep(0.2, 0.42, tail));
    }
  }
  float speck = beachSkyNoise(p * 7.3) * 0.6 + beachSkyNoise(p * 23.0 + 1.3) * 0.4;
  float snow = max(crust, dust * smoothstep(0.62, 0.24, 1.0 - speck) * 0.72);
  snow = max(snow, vLift);
  // Bare ice is wind-polished almost flat; snow keeps its own small dunes.
  vec2 slope = (vec2(beachSkyNoise(p * 1.7), beachSkyNoise(p * 1.7 + 3.1)) - 0.5) * 0.026
    + (vec2(beachSkyNoise(p * 0.3), beachSkyNoise(p * 0.3 + 9.0)) - 0.5) * 0.02;
  vec3 snowPhoto = vec3(0.94);
  if (uHasSnowPhoto > 0.5 && snow > 0.01) {
    vec2 uv = p * 0.24;
    snowPhoto = pow(texture2D(uSnowPhoto, uv).rgb, vec3(1.0 / 2.2));
    float h = dot(snowPhoto, vec3(0.3333));
    float hx = pow(texture2D(uSnowPhoto, uv + vec2(0.002, 0.0)).r, 1.0 / 2.2);
    float hz = pow(texture2D(uSnowPhoto, uv + vec2(0.0, 0.002)).r, 1.0 / 2.2);
    slope += vec2(h - hx, h - hz) * 2.0 * snow * (1.0 - smoothstep(12.0, 45.0, dist));
  }
  // Surface cracks are hairline grooves: they catch the light and hold a little rime.
  float surfaceCrack = 0.0, rime = 0.0;
  bool hasVolume = uHasIceVolume > 0.5;
  if (hasVolume && snow < 0.99) {
    vec3 here = iceVolumeAt(p, iceLod(footprint, ICE_TILE), iceLod(footprint, ICE_MACRO));
    surfaceCrack = clamp(here.r * 1.5, 0.0, 1.0);
    if (dist < 26.0) {
      float e = max(footprint * 1.5, 0.012);
      float x = iceVolumeAt(p + vec2(e, 0.0), iceLod(footprint, ICE_TILE), iceLod(footprint, ICE_MACRO)).r;
      float z = iceVolumeAt(p + vec2(0.0, e), iceLod(footprint, ICE_TILE), iceLod(footprint, ICE_MACRO)).r;
      slope += vec2(x - here.r, z - here.r) * 0.16 * (1.0 - smoothstep(14.0, 26.0, dist));
    }
    rime = surfaceCrack * smoothstep(0.32, 0.62, frostNoise(p * 2.1 + 5.3));
  }
  vec3 n = normalize(gn + vec3(-slope.x, 0.0, -slope.y));
  float facing = clamp(dot(v, n), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 refl = reflect(-v, n); refl.y = max(refl.y, 0.02);
  vec3 skyRef = baikalSky(normalize(refl));
  vec3 sunDir = normalize(uSun.y > 0.0 ? uSun : uMoon);
  vec3 sunCol = uSun.y > 0.0 ? uSunColor : vec3(0.55, 0.65, 0.9);
  float sunStrength = (uSun.y > 0.0 ? clamp(uSun.y * 2.5, 0.15, 1.0) : 0.3) * (1.0 - storm * 0.5);
  float sunUp = clamp(uSun.y * 3.0, 0.0, 1.0);
  vec3 skyAmb = mix(uSkyHorizon, uSkyTop, 0.45) * (1.0 - storm * 0.15) + vec3(0.1) * storm * (1.0 - night);
  vec2 vp = v.xz / max(v.y, 0.12);
  vec3 iceColor = vec3(0.0);
  if (snow < 0.995) {
    // How much daylight reaches inside: the moon and a stormy sky give the fractures only a faint silver.
    vec3 reach = clamp(skyAmb * 1.35 + sunCol * sunStrength * 0.55, 0.0, 1.2) * mix(1.0, 0.82, storm);
    reach = mix(reach, vec3(0.24, 0.31, 0.38) * (0.55 + 0.45 * sunStrength / 0.3), night);
    vec3 deep = mix(vec3(0.004, 0.022, 0.032), vec3(0.012, 0.075, 0.098), sunUp);
    vec3 body = deep;
    if (uHasIcePhoto > 0.5) {
      // The photographed ice is the far layer: big feathered sheets, seen with their own parallax under the slices.
      vec3 far = lakeIcePhoto(p - vp * 0.42);
      if (uLayers > 2.5) {
        vec3 deeper = lakeIcePhoto((p - vp * 0.92) * 0.72 + vec2(13.7, 8.1));
        far += vec3(0.16, 0.26, 0.30) * smoothstep(0.32, 0.74, deeper.g) * 0.16;
      }
      body = mix(deep, far * mix(0.34, 0.92, sunUp) + deep * 0.5, 0.86);
    } else {
      float c0 = iceCracks((p - vp * 0.12) * 0.55, 0.06);
      float c1 = iceCracks((p - vp * 0.42) * 0.8 + 17.0, 0.075) * 0.6;
      body += (vec3(0.62, 0.88, 0.92) * c0 + vec3(0.45, 0.78, 0.85) * c1 * (1.0 - c0 * 0.6)) * (0.35 + 0.12 * sunUp);
    }
    float clarity = 1.0;
    vec3 inside = body;
    if (hasVolume) inside = iceInterior(p, v, dist, footprint, reach, body, clarity);
    inside += vec3(0.7, 0.84, 0.9) * rime * reach * 0.42;
    iceColor = mix(inside, skyRef, clamp(fresnel + mix(0.06, 0.02, sunUp), 0.0, 1.0));
    // Glassy highlights: sun or moon on the polished sheet, sparkle at the frost in the cracks.
    vec3 h = normalize(v + sunDir);
    float glaze = pow(max(dot(n, h), 0.0), 1500.0) * 2.2 + pow(max(dot(n, h), 0.0), 120.0) * 0.08;
    iceColor += sunCol * glaze * sunStrength * (1.0 - storm * 0.7);
    // Windows lie on the ice as a real reflection; roughness grows where snow dust scatters it.
    iceColor += cabinReflection(vWorld, normalize(reflect(-v, n)), 0.012 + dust * 0.04) * (0.08 + fresnel * 0.92) * 1.15;
  }
  // Snow: wrapped diffuse from the low sun or the moon, sky ambience, a sparkle close by.
  float wrap = dot(n, sunDir) * 0.5 + 0.5;
  float sastrugi = beachSkyNoise(vec2(p.x * 0.35 + p.y * 0.08, p.y * 2.2 + p.x * 0.5));
  vec3 snowBase = mix(vec3(0.93, 0.95, 0.98), snowPhoto, uHasSnowPhoto) * (0.88 + 0.12 * sastrugi);
  // A thin edge lets the dark ice tint through, and gives every patch a soft lip.
  float lip = smoothstep(0.0, 0.5, snow) * (1.0 - smoothstep(0.5, 1.0, snow)) * (1.0 - vLift);
  snowBase *= 1.0 - lip * 0.28;
  vec3 snowColor = snowBase * (skyAmb * 0.72 + sunCol * sunStrength * (0.16 + 0.40 * wrap) + vec3(0.075, 0.095, 0.14) * night);
  float grains = pow(beachSkyHash(floor(p * 58.0)), 70.0);
  float glint = grains * sunStrength * (1.0 - smoothstep(6.0, 34.0, dist)) * (0.3 + 0.7 * pow(max(dot(normalize(reflect(-v, n)), sunDir), 0.0), 6.0));
  snowColor += vec3(glint * mix(0.9, 0.5, night));
  vec3 color = mix(iceColor, snowColor, snow);
  float warm = cabinGlow(p);
  // Light through the mullions: the glow on the ground carries the shadows of the window bars.
  if (warm > 0.001) {
    for (int i = 0; i < 3; i++) {
      vec4 light = uCabinLights[i];
      float ahead = max(p.x - light.x, 0.0);
      if (ahead > 28.0 || light.w <= 0.0) continue;
      float s = (p.y - light.y) / (1.0 + ahead * 0.17);
      float bay = abs(fract(s / 2.13 + 0.5) - 0.5) * 2.13;
      warm *= mix(1.0, smoothstep(0.02, 0.22, bay), 0.42 * (1.0 - smoothstep(14.0, 24.0, ahead)));
    }
  }
  color += vec3(1.0, 0.60, 0.27) * warm * (0.36 + 0.5 * snow);
  color = mix(color, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(color, 1.0);
}`;
export function createBaikalIceMaterial(shared: BaikalUniforms, offsetDepth = false): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: ICE_VERT, fragmentShader: ICE_FRAG, toneMapped: false, fog: false,
    polygonOffset: offsetDepth, polygonOffsetFactor: offsetDepth ? -2 : 0, polygonOffsetUnits: offsetDepth ? -2 : 0,
  });
  material.name = "baikal-ice-and-snow";
  return material;
}

/* ---------------- turquoise hummocks ---------------- */
const HUMMOCK_VERT = `
attribute float aThick;
attribute vec4 aInst;
attribute vec3 aBary;
attribute vec3 aCrease;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vThick;
varying vec4 vInst;
varying vec3 vBary;
varying vec3 vCrease;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz; vNormal = normalize(mat3(m) * (normal / vec3(dot(m[0].xyz, m[0].xyz), dot(m[1].xyz, m[1].xyz), dot(m[2].xyz, m[2].xyz)))); vLocal = position; vThick = aThick; vInst = aInst;
  vBary = aBary; vCrease = aCrease;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const HUMMOCK_FRAG = `
${BAIKAL_SKY_UNIFORMS}
uniform sampler2D uIcePhoto;
uniform sampler2D uSnowPhoto;
uniform sampler2D uIceVolume;
uniform float uHasIcePhoto;
uniform float uHasSnowPhoto;
uniform float uHasIceVolume;
uniform float uLayers;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uCabinLight;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vThick;
varying vec4 vInst;
varying vec3 vBary;
varying vec3 vCrease;
${BAIKAL_SKY_FUNCTIONS}
${COMMON}
vec3 volumeOnFace(vec3 q, vec3 axis, float lod) {
  vec2 uv = axis.x > axis.y && axis.x > axis.z ? q.zy : axis.y > axis.z ? q.xz : q.xy;
  return textureLod(uIceVolume, uv / 7.0, lod).rgb;
}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 toCam = cameraPosition - vWorld;
  float dist = max(length(toCam), 0.001);
  vec3 v = toCam / dist;
  float night = smoothstep(0.25, 0.95, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  vec3 L = normalize(uSun.y > 0.0 ? uSun : uMoon);
  vec3 lightCol = uSun.y > 0.0 ? uSunColor : vec3(0.6, 0.7, 0.95);
  float lightStrength = (uSun.y > 0.0 ? clamp(uSun.y * 2.5, 0.2, 1.0) : 0.35) * (1.0 - storm * 0.45);
  vec3 axis = abs(n);
  // Fracture faces are never optically flat: a slow conchoidal swell, then fine pitting close up.
  float swell = skyNoise3D(vWorld * 1.6 + vInst.x * 7.0), pit = skyNoise3D(vWorld * 9.0 - vInst.x * 3.0);
  vec3 bump = vec3(skyNoise3D(vWorld * 2.4 + 13.1), skyNoise3D(vWorld * 2.4 + 27.4), skyNoise3D(vWorld * 2.4 + 41.7)) - 0.5;
  n = normalize(n + bump * 0.14 + (vec3(pit) - 0.5) * 0.05 * (1.0 - smoothstep(6.0, 24.0, dist)));
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  // Real creases only: coplanar triangle joins carry no edge, so faces stay clean between their chipped arrises.
  vec3 edges = vBary / max(vCrease, vec3(0.001));
  float edgeDistance = min(edges.x, min(edges.y, edges.z));
  float rough = pit * 0.018 + swell * 0.03;
  float arris = 1.0 - smoothstep(0.0, 0.05 + rough, edgeDistance);
  vec3 ambient = mix(uSkyHorizon, uSkyTop, 0.4);
  // Light bends in, crosses the plate and leaves again: the sky behind is what fills the block, stained by how far it travelled.
  vec3 rd = refract(-v, n, 0.763);
  vec3 out1 = normalize(rd + vec3(0.0, 0.3, 0.0) + bump * 0.22);
  vec3 transmitted = baikalSky(vec3(out1.x, max(abs(out1.y), 0.03), out1.z));
  if (out1.y < 0.0) transmitted = mix(vec3(0.72, 0.8, 0.86) * clamp(ambient * 1.2, 0.05, 1.0), transmitted, 0.35);
  float size = 0.65 + vInst.w * 0.62;
  // A long look through the block at a shallow angle goes darker and greener than a short one straight through its thin edge.
  float travel = (0.2 + vThick * 1.05) * size * (0.35 + skyNoise3D(vWorld * 0.8 + vInst.x * 9.0) * 1.15) / max(abs(dot(rd, n)), 0.4);
  vec3 stain = exp(-vec3(1.6, 0.36, 0.34) * travel);
  vec3 scatter = vec3(0.05, 0.23, 0.25) * (1.0 - exp(-travel * 1.1));
  float dayLight = clamp(lightStrength * 1.4, 0.0, 1.0);
  vec3 light = ambient * 0.85 + lightCol * dayLight * 0.5;
  light = mix(light, light * 0.55, night);
  vec3 color = transmitted * stain * 0.92 + scatter * clamp(light, 0.05, 1.1);
  // Trapped air and old fractures keep any block from being perfectly clear.
  color = mix(color, vec3(0.74, 0.88, 0.9) * clamp(light, 0.05, 1.1), clamp(0.12 + (swell - 0.42) * 0.55, 0.0, 0.5));
  // Fractures inside the plate, again in depth along the refracted ray.
  if (uHasIceVolume > 0.5) {
    int slices = uLayers > 2.5 ? 6 : 3;
    float through = 1.0, lod = log2(max(dist * 1.6, 1.0));
    vec3 inner = vec3(0.0);
    for (int i = 0; i < slices; i++) {
      float depth = (float(i) + 0.5) / float(slices) * 0.55 * size;
      vec3 s = volumeOnFace(vWorld + rd * depth, axis, lod);
      float sheet = clamp(s.r * 1.5 + s.b * 0.42, 0.0, 0.76);
      inner += through * sheet * exp(-depth * 1.4);
      through *= 1.0 - sheet * 0.5;
    }
    color = color * through + inner * mix(vec3(0.5, 0.8, 0.82), vec3(1.0), 0.4) * clamp(light * 1.05, 0.03, 1.2);
  } else if (uHasIcePhoto > 0.5) {
    vec3 weight = pow(abs(n), vec3(4.0)); weight /= max(dot(weight, vec3(1.0)), 0.001);
    vec3 wp = (vWorld + v * 0.14) * 0.17;
    color = mix(color, pow(texture2D(uIcePhoto, wp.yz).rgb * weight.x + texture2D(uIcePhoto, wp.xz).rgb * weight.y + texture2D(uIcePhoto, wp.xy).rgb * weight.z, vec3(1.0 / 2.2)), 0.5);
  }
  // Backlit plates light up from within.
  vec3 Lt = normalize(-L + n * 0.35);
  float glow = pow(clamp(dot(v, -Lt), 0.0, 1.0), 4.0) * (0.3 + 0.7 * vThick);
  color += vec3(0.24, 0.80, 0.82) * glow * lightStrength * 0.5;
  // Crushed arrises scatter white light; that pale line is what reads as ice rather than glass.
  color = mix(color, vec3(0.86, 0.95, 0.98) * clamp(light * 1.25 + 0.04, 0.0, 1.2), arris * 0.72);
  vec3 refl = reflect(-v, n); refl.y = abs(refl.y) + 0.02;
  color = mix(color, baikalSky(normalize(refl)), clamp(fresnel, 0.0, 0.9));
  float spec = pow(max(dot(n, normalize(v + L)), 0.0), 260.0);
  color += lightCol * spec * lightStrength * 1.6;
  color += vec3(0.015, 0.11, 0.15) * night * (1.0 - fresnel);
  float wrap = dot(n, L) * 0.5 + 0.5;
  float cap = smoothstep(0.55, 0.92, n.y) * vInst.y;
  cap *= 0.70 + 0.30 * frostNoise(vWorld.xz * 2.4);
  vec3 snowGrain = uHasSnowPhoto > 0.5 ? pow(texture2D(uSnowPhoto, vWorld.xz * 0.24).rgb, vec3(1.0 / 2.2)) : vec3(0.92, 0.94, 0.97);
  vec3 snow = snowGrain * (ambient * 0.66 + lightCol * lightStrength * (0.18 + 0.34 * wrap));
  color = mix(color, snow, cap);
  color += vec3(1.0, 0.62, 0.3) * cabinGlow(vWorld.xz) * 0.8;
  color = mix(color, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(color, 1.0);
}`;
export function createBaikalHummockMaterial(shared: BaikalUniforms): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: HUMMOCK_VERT, fragmentShader: HUMMOCK_FRAG, toneMapped: false, fog: false });
  material.name = "baikal-turquoise-ice";
  return material;
}

/* ---------------- the glass wall ---------------- */
const GLASS_VERT = `
attribute vec2 aPane;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vPane;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz; vNormal = normalize(mat3(modelMatrix) * normal); vUv = uv; vPane = aPane;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const GLASS_FRAG = `
uniform float uTime;
uniform float uStorm;
uniform float uStars;
uniform float uLamp;
uniform sampler2D uFrost;
uniform float uHasFrost;
uniform samplerCube uRoomCube;
uniform float uHasRoomCube;
uniform vec2 uRoomOrigins[3];
uniform float uRoomEnv[3];
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec2 vPane;
${COMMON}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float side = dot(n, v);
  float facing = abs(side);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  float night = smoothstep(0.25, 0.95, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  // Frost is a ring of ferns growing in from the frame: heavy in the corners, a thin thread along the rails, and the middle of every pane stays clear for the view.
  vec2 metres = vUv * vPane;
  vec2 e = min(vUv, 1.0 - vUv) * vPane;
  float edge = min(e.x, e.y), corner = length(e);
  float big = step(0.8, vPane.y);
  float crystals = 0.55, haze = 0.5;
  if (uHasFrost > 0.5) { vec4 f = texture2D(uFrost, (metres + vPane * 0.37) * 0.31); crystals = f.r; haze = f.g; }
  float reach = (0.05 + 0.13 * storm + 0.04 * night) * big;
  float cornerFrost = (1.0 - smoothstep(reach * 0.5, reach * 2.6, corner + (haze - 0.5) * 0.26));
  float railFrost = (1.0 - smoothstep(0.0, reach * 0.42, edge + (haze - 0.5) * 0.05));
  float frost = clamp(max(cornerFrost, railFrost * 0.7), 0.0, 1.0) * (0.3 + 0.82 * crystals) * big;
  // A small drift of blown snow rests on the bottom rail only.
  float bottom = step(vPane.y * vUv.y, 0.5);
  float lipHeight = 0.018 + 0.07 * storm * (0.5 + 0.5 * frostNoise(vec2(metres.x * 3.0 + vPane.y * 7.0, 0.3)));
  float lip = (1.0 - smoothstep(lipHeight - 0.012, lipHeight + 0.012, metres.y)) * big * step(1.0, vWorld.y - 0.0) * (1.0 - step(1.4, vWorld.y)) * bottom;
  float insideView = step(side, 0.0);
  float inside = insideView * uLamp;
  vec3 color = vec3(0.82, 0.88, 0.92);
  float alpha = 0.018 + fresnel * 0.28;
  // At night a dark window is half a mirror, and the room you are sitting in hangs out there in the snow.
  if (insideView > 0.5 && uHasRoomCube > 0.5) {
    vec2 room = uRoomOrigins[0];
    float roomLight = uRoomEnv[0];
    for (int i = 1; i < 3; i++) if (distance(vWorld.xz, uRoomOrigins[i] + vec2(-23.0, 6.0)) < distance(vWorld.xz, room + vec2(-23.0, 6.0))) { room = uRoomOrigins[i]; roomLight = uRoomEnv[i]; }
    vec3 local = vWorld - vec3(room.x, 0.0, room.y);
    vec3 r = reflect(-v, -n);
    vec3 boxMin = vec3(-30.0, 0.6, -2.0), boxMax = vec3(-16.0, 7.0, 14.0);
    vec3 a = (boxMax - local) / r, b = (boxMin - local) / r, far = max(a, b);
    float t = min(far.x, min(far.y, far.z));
    vec3 hit = local + r * t - vec3(-23.0, 2.4, 6.0);
    vec3 mirrored = textureLod(uRoomCube, hit, 1.0).rgb;
    mirrored = pow(mirrored / (1.0 + mirrored * 0.7), vec3(1.0 / 2.2));
    float mirror = mix(0.03, 0.17, night) + fresnel * 0.4;
    color = mix(color, mirrored, 0.94);
    alpha = max(alpha, mirror * clamp(uLamp * 1.3, 0.0, 1.0) * roomLight);
  } else {
    color = mix(color, vec3(1.0, 0.72, 0.42), inside * 0.6);
    alpha += inside * fresnel * 0.25;
  }
  // Seen from the snow at night the glazing has only a whisper of warmth; the lit room itself does the rest.
  float lantern = (1.0 - insideView) * uLamp * night;
  color = mix(color, vec3(1.0, 0.74, 0.44), lantern * 0.3);
  alpha += lantern * 0.035;
  vec3 white = mix(vec3(0.90, 0.93, 0.96), vec3(0.62, 0.70, 0.82), night * (1.0 - inside * 0.5));
  white = mix(white, vec3(1.0, 0.80, 0.58), inside * night * 0.62);
  color = mix(color, white, max(frost * 0.86, lip));
  alpha = mix(alpha, 0.88, max(frost * 0.82, lip));
  gl_FragColor = vec4(color, alpha);
}`;
export function createBaikalGlassMaterial(shared: BaikalUniforms): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: shared, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, toneMapped: false, fog: false,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.name = "baikal-frosted-glass";
  return material;
}

/* ---------------- falling snow ---------------- */
const SNOW_VERT = `
attribute vec4 aFlake;
uniform float uTime;
uniform float uNearSpan;
uniform float uFarSpan;
uniform float uHeight;
uniform vec4 uRoofs[3];
uniform vec2 uRoofLines[3];
uniform vec4 uCabinLights[3];
varying float vAlpha;
varying vec2 vUv;
varying float vWarm;
void main() {
  vUv = uv;
  float span = mix(uNearSpan, uFarSpan, aFlake.w);
  float fallSpeed = mix(0.5, 1.05, fract(aFlake.z * 7.31));
  // Straight down out of a still sky: flakes live in a box around the camera and only rock a little as they fall.
  vec2 offset = mod(aFlake.xy * span - cameraPosition.xz + span * 0.5, span) - span * 0.5;
  float phase = aFlake.z * 40.0;
  offset += vec2(sin(uTime * 0.7 + phase), cos(uTime * 0.55 + phase * 1.3)) * 0.2;
  vec2 site = cameraPosition.xz + offset;
  float column = uHeight;
  float top = cameraPosition.y + column * 0.55;
  float y = top - mod(uTime * fallSpeed + aFlake.z * column * 3.0, column);
  // Nothing falls under the roof or the porch eave, and nothing below the ice.
  float underRoof = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 roof = uRoofs[i];
    float roofY = uRoofLines[i].x + uRoofLines[i].y * site.x;
    underRoof = max(underRoof, step(roof.x, site.x) * step(site.x, roof.y) * step(roof.z, site.y) * step(site.y, roof.w) * step(y, roofY));
  }
  float aboveGround = step(-0.15, y);
  vec4 vc = viewMatrix * vec4(site.x, y, site.y, 1.0);
  float size = mix(0.032, 0.062, fract(aFlake.z * 3.7)) * mix(1.0, 1.75, aFlake.w);
  vc.xy += position.xy * size;
  float distanceToCamera = length(offset), edge = max(abs(offset.x), abs(offset.y)) / (span * 0.5);
  vAlpha = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.3, 1.2, distanceToCamera) * (1.0 - underRoof) * aboveGround * mix(1.0, 0.75, aFlake.w);
  vWarm = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 light = uCabinLights[i];
    float ahead = site.x - light.x;
    float spread = light.z + max(ahead, 0.0) * 0.45;
    float across = abs(site.y - light.y) / max(spread, 0.1);
    vWarm = max(vWarm, smoothstep(0.0, 1.0, ahead / 2.0) * (1.0 - smoothstep(0.0, 22.0, ahead)) * exp(-across * across * 2.2) * light.w * step(y, 7.5));
  }
  gl_Position = projectionMatrix * vc;
}`;
const SNOW_FRAG = `
uniform float uStars;
varying float vAlpha;
varying vec2 vUv;
varying float vWarm;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.3, 1.0, r)) * vAlpha * 0.78;
  if (a < 0.01) discard;
  float night = smoothstep(0.25, 0.95, uStars);
  vec3 flake = mix(vec3(0.98, 0.985, 1.0), vec3(0.74, 0.8, 0.96), night);
  gl_FragColor = vec4(mix(flake, vec3(1.0, 0.82, 0.58), clamp(vWarm, 0.0, 1.0)), a);
}`;
export function createBaikalSnowMaterial(shared: BaikalUniforms): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, uNearSpan: { value: 30 }, uFarSpan: { value: 90 }, uHeight: { value: 18 } },
    vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, toneMapped: false, fog: false,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.name = "baikal-snowfall";
  return material;
}

/* ---------------- the stove fire ---------------- */
const FLAME_VERT = `
attribute float aSeed;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv; vSeed = aSeed;
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 origin = m * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(m[0].xyz), length(m[1].xyz));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float rise = position.y;
  float sway = sin(rise * 7.0 - uTime * 3.4 + aSeed * 23.0) * rise * rise * 0.14;
  vec3 world = origin.xyz + right * (position.x + sway) * scale.x + vec3(0.0, rise * scale.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const FLAME_FRAG = `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;
varying float vSeed;
${COMMON}
float flameTurbulence(vec2 p) { return frostNoise(p) * 0.57 + frostNoise(p * 2.03 + 13.2) * 0.29 + frostNoise(p * 4.1 - 8.6) * 0.14; }
void main() {
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float t = uTime * 1.9 + vSeed * 31.0;
  float turb = flameTurbulence(vec2(p.x * 2.2 + vSeed * 9.0, p.y * 3.0 - t));
  float width = mix(0.9, 0.08, pow(p.y, 0.85)) * (0.8 + turb * 0.5);
  float body = 1.0 - smoothstep(width * 0.5, width, abs(p.x) + (turb - 0.5) * 0.3 * p.y);
  body *= smoothstep(0.0, 0.08, p.y) * (1.0 - smoothstep(0.55, 1.0, p.y + (turb - 0.5) * 0.4));
  float alpha = body * uPower;
  if (alpha < 0.01) discard;
  vec3 color = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.72, 0.25), clamp(body * 0.9 + turb * 0.2 - p.y * 0.3, 0.0, 1.0));
  color = mix(color, vec3(1.0, 0.95, 0.75), pow(body, 4.0) * (1.0 - p.y) * 0.7);
  color = mix(color, vec3(0.25, 0.35, 0.95), exp(-p.y * 14.0) * body * 0.35);
  gl_FragColor = vec4(color, alpha);
}`;
export function createBaikalFlameMaterial(time: THREE.IUniform<number>): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uPower: { value: 1 } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, toneMapped: false, fog: false,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, forceSinglePass: true,
  });
  material.name = "baikal-stove-flames";
  return material;
}
