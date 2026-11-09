import * as THREE from "three";
import { BAIKAL_SKY_FUNCTIONS, BAIKAL_SKY_UNIFORMS } from "./baikal-sky";
import { BAIKAL_CABIN, baikalRoofHeight } from "./baikal-layout";

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
  uDrift: THREE.IUniform<THREE.Vector2>;
  uRoof: THREE.IUniform<THREE.Vector4>;
  uRoofLine: THREE.IUniform<THREE.Vector2>;
  uLamp: THREE.IUniform<number>;
}
export function createBaikalUniforms(skyUniforms: Record<string, THREE.IUniform>): BaikalUniforms {
  const c = BAIKAL_CABIN, slope = (baikalRoofHeight(c.maxX) - baikalRoofHeight(c.minX)) / (c.maxX - c.minX);
  const storm = skyUniforms.uStorm ?? (skyUniforms.uStorm = { value: 0 });
  return {
    ...skyUniforms, uStorm: storm,
    uTime: skyUniforms.uTime ?? { value: 0 },
    uFogColor: { value: new THREE.Vector3(.8, .86, .92) }, uFogNear: { value: 60 }, uFogFar: { value: 320 },
    uCabinLight: { value: new THREE.Vector4(c.maxX, (c.minZ + c.maxZ) / 2, (c.maxZ - c.minZ) / 2, 0) },
    uLayers: { value: 3 }, uWalker: { value: new THREE.Vector2(0, 40) }, uSnowShift: { value: 0 },
    uWind: { value: new THREE.Vector2(-7, -2) }, uDrift: { value: new THREE.Vector2() },
    uRoof: { value: new THREE.Vector4(c.minX - .4, c.eaveMaxX + .6, c.minZ - c.sideEave, c.maxZ + c.sideEave) },
    uRoofLine: { value: new THREE.Vector2(baikalRoofHeight(0), slope) },
    uLamp: { value: 1 },
  };
}

const COMMON = `
float cabinWarmth(vec2 p, vec4 light) {
  float ahead = p.x - light.x;
  float spread = light.z + max(ahead, 0.0) * 0.45;
  float across = abs(p.y - light.y) / max(spread, 0.1);
  return smoothstep(0.0, 1.0, ahead / 2.0) * (1.0 - smoothstep(0.0, 28.0, ahead)) * exp(-across * across * 2.2) * light.w;
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
float frostNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(iceHash2(i).x, iceHash2(i + vec2(1.0, 0.0)).x, f.x), mix(iceHash2(i + vec2(0.0, 1.0)).x, iceHash2(i + vec2(1.0, 1.0)).x, f.x), f.y);
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
  vLift = 1.0;
  #else
  vLift = aLift;
  #endif
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz; vNormal = normalize(mat3(m) * normal);
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
varying vec3 vWorld;
varying vec3 vNormal;
varying float vLift;
${BAIKAL_SKY_FUNCTIONS}
${COMMON}
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = max(length(toCam), 0.001);
  vec3 v = toCam / dist;
  vec2 p = vWorld.xz;
  vec3 gn = normalize(vNormal);
  float night = smoothstep(0.25, 0.95, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  // Snow lies in drifts streaked along the wind; the mound, the bank and the deck are always covered.
  float n1 = beachSkyNoise(p * 0.045), n2 = beachSkyNoise(p * 0.11 + 7.0);
  float streak = beachSkyNoise(vec2(p.x * 0.09 + p.y * 0.02, p.y * 0.6 + p.x * 0.15));
  float snow = smoothstep(0.40, 0.60, n1 * 0.6 + n2 * 0.25 + streak * 0.15 + uSnowShift);
  snow = max(snow, vLift);
  // Gentle undulation gives the mirror its rough, frozen look.
  vec2 slope = (vec2(beachSkyNoise(p * 1.7), beachSkyNoise(p * 1.7 + 3.1)) - 0.5) * 0.05
    + (vec2(beachSkyNoise(p * 0.3), beachSkyNoise(p * 0.3 + 9.0)) - 0.5) * 0.03;
  vec3 n = normalize(gn + vec3(-slope.x, 0.0, -slope.y));
  float facing = clamp(dot(v, n), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 4.0);
  vec3 refl = reflect(-v, n); refl.y = max(refl.y, 0.02);
  vec3 skyRef = baikalSky(normalize(refl));
  // Cracks in parallax layers: each deeper sheet is shifted along the view ray, so the web of fractures reads as depth.
  vec2 vp = v.xz / max(v.y, 0.12);
  float c0 = iceCracks((p - vp * 0.12) * 0.55, 0.06);
  float c1 = iceCracks((p - vp * 0.42) * 0.8 + 17.0, 0.075) * 0.6;
  vec3 crackColor = vec3(0.62, 0.88, 0.92) * c0 + vec3(0.45, 0.78, 0.85) * c1 * (1.0 - c0 * 0.6);
  if (uLayers > 2.5) {
    float c2 = iceCracks((p - vp * 0.9) * 1.05 + 41.0, 0.09) * 0.35;
    crackColor += vec3(0.35, 0.65, 0.75) * c2 * (1.0 - (c0 + c1) * 0.6);
  }
  float bubbles = beachSkyNoise((p - vp * 0.3) * 3.5) * beachSkyNoise((p - vp * 0.5) * 7.0 + 2.0);
  float sunUp = clamp(uSun.y * 3.0, 0.0, 1.0);
  vec3 body = mix(vec3(0.02, 0.055, 0.09), vec3(0.03, 0.10, 0.14), sunUp);
  vec3 ice = body + vec3(0.05, 0.19, 0.23) * pow(bubbles, 2.0) * (0.3 + 0.5 * sunUp) + crackColor * (0.35 + 0.12 * sunUp);
  ice += vec3(0.03, 0.14, 0.17) * (0.25 + 0.6 * sunUp) * (1.0 - fresnel) * 0.6;
  // By day the sheet shows its depth; the bright sky only takes over at grazing angles.
  float mirror = clamp(mix(0.22, 0.1, sunUp) + fresnel * mix(0.78, 0.88, sunUp), 0.0, 1.0);
  vec3 iceColor = mix(ice, skyRef, mirror);
  // Snow: wrapped diffuse from the low sun or the moon, sky ambience, a sparkle close by.
  vec3 sunDir = normalize(uSun.y > 0.0 ? uSun : uMoon);
  vec3 sunCol = uSun.y > 0.0 ? uSunColor : vec3(0.55, 0.65, 0.9);
  float sunStrength = (uSun.y > 0.0 ? clamp(uSun.y * 2.5, 0.15, 1.0) : 0.3) * (1.0 - storm * 0.5);
  vec3 skyAmb = mix(uSkyHorizon, uSkyTop, 0.45) * (1.0 - storm * 0.15) + vec3(0.1) * storm * (1.0 - night);
  float wrap = dot(n, sunDir) * 0.5 + 0.5;
  float sastrugi = beachSkyNoise(vec2(p.x * 0.35 + p.y * 0.08, p.y * 2.2 + p.x * 0.5));
  vec3 snowBase = vec3(0.93, 0.95, 0.98) * (0.88 + 0.12 * sastrugi);
  vec3 snowColor = snowBase * (skyAmb * 0.95 + sunCol * sunStrength * (0.22 + 0.5 * wrap));
  float glint = pow(beachSkyHash(floor(p * 48.0)), 60.0) * sunStrength * (1.0 - night) * (1.0 - smoothstep(6.0, 40.0, dist));
  snowColor += vec3(glint * 0.4);
  vec3 color = mix(iceColor, snowColor, snow);
  color += vec3(1.0, 0.62, 0.3) * cabinWarmth(p, uCabinLight) * (0.55 + 0.45 * snow);
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
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vThick;
varying vec4 vInst;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz; vNormal = normalize(mat3(m) * normal); vLocal = position; vThick = aThick; vInst = aInst;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const HUMMOCK_FRAG = `
${BAIKAL_SKY_UNIFORMS}
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uCabinLight;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vThick;
varying vec4 vInst;
${BAIKAL_SKY_FUNCTIONS}
${COMMON}
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
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 3.0);
  // Frozen veins and bubbles inside, shifted with the view so the block reads as a solid, not a shell.
  vec3 q = vLocal + v * 0.25;
  float veins = skyNoise3D(q * 6.0 + vInst.x * 10.0) * 0.6 + skyNoise3D(q * 13.0 + 3.0) * 0.4;
  float bubbles = pow(skyNoise3D(q * 22.0 + vInst.x), 3.0);
  vec3 deep = vec3(0.015, 0.21, 0.30), bright = vec3(0.24, 0.80, 0.82), rim = vec3(0.72, 0.96, 0.96);
  // Light passing through: the classic cheap translucency term, strongest where the block is thick and backlit.
  vec3 Lt = normalize(-L + n * 0.35);
  float trans = pow(clamp(dot(v, -Lt), 0.0, 1.0), 3.0) * (0.35 + 0.65 * vThick);
  float wrap = dot(n, L) * 0.5 + 0.5;
  vec3 ambient = mix(uSkyHorizon, uSkyTop, 0.4);
  // Each facet carries its own cloudy variation so the flat hull faces never read as one solid tint.
  float facet = skyNoise3D(vLocal * 2.6 + vInst.x * 5.0) * 0.5 + skyNoise3D(vLocal * 5.3 - vInst.x * 3.0) * 0.5;
  vec3 color = mix(deep, bright, clamp(0.15 + veins * 0.45 + vThick * 0.25 + (facet - 0.5) * 0.5, 0.0, 1.0));
  color *= (0.5 + 0.5 * wrap * lightStrength) * (0.55 + 0.6 * clamp(ambient, 0.0, 1.0)) * (0.75 + 0.5 * facet);
  color += bright * trans * lightStrength * 1.2;
  color += rim * fresnel * 0.5 * (0.4 + 0.6 * lightStrength);
  color += vec3(0.6, 0.9, 0.9) * bubbles * 0.35 * (0.5 + 0.5 * lightStrength);
  vec3 refl = reflect(-v, n); refl.y = abs(refl.y) + 0.02;
  color = mix(color, baikalSky(normalize(refl)), fresnel * 0.5);
  // At night the ice keeps a faint inner glow, and the hummocks near the cabin catch its warmth.
  color += deep * 0.45 * night;
  float cap = smoothstep(0.45, 0.8, n.y) * vInst.y;
  vec3 snow = vec3(0.92, 0.94, 0.97) * (ambient * 0.9 + lightCol * lightStrength * (0.3 + 0.5 * wrap));
  color = mix(color, snow, cap);
  color += vec3(1.0, 0.62, 0.3) * cabinWarmth(vWorld.xz, uCabinLight) * 0.8;
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
  float fresnel = pow(1.0 - facing, 3.0);
  float night = smoothstep(0.25, 0.95, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  // Frost grows in from the frame and the corners, feathered by noise; colder, stormier nights push it further.
  vec2 metres = vUv * vPane;
  vec2 e = min(vUv, 1.0 - vUv) * vPane;
  float edge = min(e.x, e.y), corner = length(e);
  // Small panes (the stove door) stay clear; only the big wall glazing frosts over.
  float reach = (0.07 + 0.15 * storm + 0.08 * night) * step(0.8, vPane.y);
  float grain = frostNoise(metres * 6.0 + vPane * 3.0) * 0.6 + frostNoise(metres * 17.0 + 9.0) * 0.4;
  float frost = 1.0 - smoothstep(0.0, reach, edge + (grain - 0.5) * 0.14);
  frost = max(frost, (1.0 - smoothstep(0.0, reach * 1.8, corner + (grain - 0.5) * 0.2)) * 0.8);
  float dendrite = smoothstep(0.35, 0.75, frostNoise(metres * vec2(40.0, 14.0) + vPane.x));
  frost *= 0.55 + 0.45 * dendrite;
  // A lip of blown snow sits on every sill.
  float lipHeight = 0.04 + 0.09 * storm * (0.5 + 0.5 * frostNoise(vec2(metres.x * 3.0 + vPane.y * 7.0, 0.3)));
  float lip = 1.0 - smoothstep(lipHeight - 0.02, lipHeight + 0.02, metres.y);
  // Clear glass: a faint tint, a glancing reflection, and from inside at night the room's own warm light.
  vec3 glassTint = vec3(0.82, 0.88, 0.92);
  float alpha = 0.035 + fresnel * 0.10;
  float insideView = step(side, 0.0);
  float inside = insideView * uLamp;
  alpha += inside * fresnel * 0.25;
  vec3 color = mix(glassTint, vec3(1.0, 0.72, 0.42), inside * 0.6);
  // Seen from the snow at night, the whole wall glows amber with the room behind it.
  float lantern = (1.0 - insideView) * uLamp * night;
  color = mix(color, vec3(1.0, 0.74, 0.44), lantern * 0.5);
  alpha += lantern * 0.14;
  vec3 white = mix(vec3(0.90, 0.93, 0.96), vec3(0.62, 0.70, 0.82), night * (1.0 - inside * 0.5));
  white = mix(white, vec3(1.0, 0.82, 0.6), inside * night * 0.35);
  float cover = max(frost * 0.9, lip);
  color = mix(color, white, cover);
  alpha = mix(alpha, 0.92, cover);
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

/* ---------------- the blizzard ---------------- */
const SNOW_VERT = `
attribute vec4 aFlake;
uniform float uTime;
uniform float uNearSpan;
uniform float uFarSpan;
uniform float uHeight;
uniform vec2 uWind;
uniform vec2 uDrift;
uniform vec4 uRoof;
uniform vec2 uRoofLine;
uniform vec4 uCabinLight;
varying float vAlpha;
varying vec2 vUv;
varying float vWarm;
void main() {
  vUv = uv;
  float span = mix(uNearSpan, uFarSpan, aFlake.w);
  float fallSpeed = mix(1.3, 2.4, fract(aFlake.z * 7.31));
  // Flakes live in a box wrapped around the camera; the accumulated wind drift slides the whole field.
  vec2 seedPos = aFlake.xy * span + uDrift;
  vec2 offset = mod(seedPos - cameraPosition.xz + span * 0.5, span) - span * 0.5;
  offset += vec2(sin(uTime * 1.7 + aFlake.z * 40.0), cos(uTime * 1.3 + aFlake.z * 31.0)) * 0.25 * (1.0 - aFlake.w * 0.6);
  vec2 site = cameraPosition.xz + offset;
  float column = uHeight;
  float top = cameraPosition.y + column * 0.55;
  float y = top - mod(uTime * fallSpeed + aFlake.z * column * 3.0, column);
  // Nothing falls under the roof or the porch eave, and nothing below the ice.
  float roofY = uRoofLine.x + uRoofLine.y * site.x;
  float underRoof = step(uRoof.x, site.x) * step(site.x, uRoof.y) * step(uRoof.z, site.y) * step(site.y, uRoof.w) * step(y, roofY);
  float aboveGround = step(-0.15, y);
  vec3 origin = vec3(site.x, y, site.y);
  // The quad stretches along its own velocity in view space: nearby flakes streak, distant ones stay dots.
  vec3 velocity = vec3(uWind.x, -fallSpeed, uWind.y);
  vec4 vc = viewMatrix * vec4(origin, 1.0);
  vec3 vv = mat3(viewMatrix) * velocity;
  vec2 dir = normalize(vv.xy + vec2(0.0, -1e-4));
  vec2 perp = vec2(-dir.y, dir.x);
  float speed = length(velocity);
  float size = mix(0.028, 0.05, fract(aFlake.z * 3.7)) * mix(1.0, 1.9, aFlake.w);
  float stretch = 1.0 + speed * 0.24 * (1.0 - aFlake.w * 0.6);
  vc.xy += perp * position.x * size + dir * position.y * size * stretch;
  float distanceToCamera = length(offset), edge = max(abs(offset.x), abs(offset.y)) / (span * 0.5);
  vAlpha = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.3, 1.2, distanceToCamera) * (1.0 - underRoof) * aboveGround * mix(1.0, 0.7, aFlake.w);
  float ahead = site.x - uCabinLight.x;
  float spread = uCabinLight.z + max(ahead, 0.0) * 0.45;
  float across = abs(site.y - uCabinLight.y) / max(spread, 0.1);
  vWarm = smoothstep(0.0, 1.0, ahead / 2.0) * (1.0 - smoothstep(0.0, 22.0, ahead)) * exp(-across * across * 2.2) * uCabinLight.w * step(y, 7.5);
  gl_Position = projectionMatrix * vc;
}`;
const SNOW_FRAG = `
uniform float uStorm;
uniform float uStars;
varying float vAlpha;
varying vec2 vUv;
varying float vWarm;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha * (0.45 + 0.55 * clamp(uStorm, 0.0, 1.0));
  if (a < 0.01) discard;
  float night = smoothstep(0.25, 0.95, uStars);
  vec3 flake = mix(vec3(0.96, 0.97, 1.0), vec3(0.62, 0.70, 0.85), night);
  vec3 color = mix(flake, vec3(1.0, 0.80, 0.55), clamp(vWarm, 0.0, 1.0));
  gl_FragColor = vec4(color, a);
}`;
export function createBaikalSnowMaterial(shared: BaikalUniforms): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, uNearSpan: { value: 30 }, uFarSpan: { value: 90 }, uHeight: { value: 18 } },
    vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, toneMapped: false, fog: false,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.name = "baikal-blizzard";
  return material;
}

/* ---------------- snow sheets blowing over the ice ---------------- */
const DRIFT_VERT = `
attribute vec4 aSheet;
attribute vec2 aSeed;
uniform float uTime;
uniform vec2 uDrift;
uniform float uSpan;
uniform vec4 uRoof;
varying vec2 vUv;
varying float vFade;
varying vec2 vSeed;
void main() {
  vUv = uv; vSeed = aSeed;
  vec2 base = aSheet.xz * uSpan + uDrift * 1.35;
  vec2 offset = mod(base - cameraPosition.xz + uSpan * 0.5, uSpan) - uSpan * 0.5;
  vec3 pos = vec3(cameraPosition.x + offset.x, aSheet.y + sin(uTime * 0.8 + aSeed.y * 20.0) * 0.15, cameraPosition.z + offset.y);
  float d = length(offset);
  float indoors = step(uRoof.x, pos.x) * step(pos.x, uRoof.y) * step(uRoof.z, pos.z) * step(pos.z, uRoof.w);
  vFade = smoothstep(3.0, 9.0, d) * (1.0 - smoothstep(0.65, 1.0, max(abs(offset.x), abs(offset.y)) / (uSpan * 0.5))) * (1.0 - indoors);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = pos + right * position.x * aSheet.w * 2.2 + up * position.y * aSheet.w * 0.7;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const DRIFT_FRAG = `
uniform float uTime;
uniform float uStorm;
uniform float uStars;
varying vec2 vUv;
varying float vFade;
varying vec2 vSeed;
${COMMON}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float shape = (1.0 - smoothstep(0.3, 1.0, abs(p.x))) * (1.0 - smoothstep(0.1, 1.0, abs(p.y)));
  vec2 flow = vec2(vUv.x * 4.0 + uTime * 0.9 + vSeed.x * 10.0, vUv.y * 2.0 + vSeed.y * 5.0);
  float wisps = frostNoise(flow) * 0.6 + frostNoise(flow * 2.3 + 4.0) * 0.4;
  float a = shape * smoothstep(0.35, 0.8, wisps) * vFade * clamp(uStorm, 0.0, 1.0) * 0.22;
  if (a < 0.005) discard;
  float night = smoothstep(0.25, 0.95, uStars);
  gl_FragColor = vec4(mix(vec3(0.95, 0.97, 1.0), vec3(0.55, 0.63, 0.78), night), a);
}`;
export function createBaikalDriftMaterial(shared: BaikalUniforms): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, uSpan: { value: 60 } }, vertexShader: DRIFT_VERT, fragmentShader: DRIFT_FRAG, toneMapped: false, fog: false,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.name = "baikal-blowing-snow";
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
