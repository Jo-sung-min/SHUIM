import { UYUNI_SKY_FUNCTIONS, UYUNI_SKY_UNIFORMS } from "./uyuni-shader";

/**
 * 대나무숲 셰이더. 하늘은 우유니의 절차적 하늘(사진 없음)에서 바다·해안만 뺀 것이고,
 * 바닥·줄기·잎·등불은 조명(햇빛 + 반구 환경광 + 가까운 등불 4개)을 직접 계산해 라이트 패스를 늘리지 않는다.
 * 색은 선형 공간에서 계산한 뒤 three 의 톤매핑·색공간·안개 조각을 그대로 붙여 기본 재질과 같은 결과를 낸다.
 */
export const BAMBOO_SKY_FRAGMENT = `${UYUNI_SKY_UNIFORMS}
uniform vec3 uHorizonFog;
uniform float uBambooSunset;
varying vec3 vDir;
${UYUNI_SKY_FUNCTIONS}
vec4 bambooSunsetSky(vec3 d) {
  float up = max(d.y, 0.0);
  // A clear atmosphere: low amber light travels furthest through the air;
  // the rose afterglow gently gives way to a deep, open blue overhead.
  // No cloud noise or moving bands; direction adds depth rather than a flat tint.
  vec3 sunDirection = normalize(vec3(-.38, .045, 1.0));
  float facing = pow(max(0.0, dot(d.xz, sunDirection.xz) * .5 + .5), 3.0);
  float twilight = smoothstep(.10, .70, uStars);
  vec3 horizon = mix(vec3(.29, .33, .46), uSkyHorizon, .18 + .82 * facing);
  vec3 afterglow = mix(vec3(.25, .32, .48), vec3(.62, .40, .43), facing);
  afterglow = mix(afterglow, uSkyTop * 1.7, twilight * .7);
  vec3 sky = mix(afterglow, uSkyTop, 1.0 - exp(-up * 4.5));
  sky = mix(sky, horizon, exp(-up * 15.0));
  float sunDistance = length(d - sunDirection);
  float glow = exp(-sunDistance * sunDistance / .045) * exp(-up * 4.0);
  sky += vec3(.20, .095, .025) * glow * (1.0 - twilight);
  float disc = 1.0 - smoothstep(.007, .010, sunDistance);
  sky = mix(sky, vec3(1.0, .82, .55), disc * .82 * (1.0 - twilight));
  return vec4(sky, 0.0);
}
void main() {
  vec3 d = normalize(vDir);
  if (d.y < 0.0) {
    gl_FragColor = vec4(uHorizonFog * mix(0.42, 1.0, exp(6.0 * d.y)), 1.0);
    return;
  }
  // The canopy hides most of this; only the gaps between leaves and the open summit ever show it.
  float night = smoothstep(0.55, 1.0, uStars);
  vec3 up = d;
  vec4 day = vec4(0.0);
  if (night < 1.0) {
    day = uBambooSunset >= .999 ? bambooSunsetSky(up)
      : daylightSky(up, .56 * smoothstep(0.0, .2, uBambooSunset));
    if (uBambooSunset > 0.0 && uBambooSunset < .999) day = mix(day, bambooSunsetSky(up), uBambooSunset);
    if (uStars > 0.0) {
      vec3 firstStars = uyuniStars(up, 220.0, 0.988, 0.0) + uyuniStars(up, 70.0, 0.992, 19.7) * 0.85;
      day.rgb += firstStars * uStars * smoothstep(0.08, 0.34, up.y) * (1.0 - day.a * 0.92);
    }
  }
  vec3 dark = night > 0.0 ? uyuniNight(up) : vec3(0.0);
  vec3 sky = uyuniHorizonAir(mix(day.rgb, dark, night), up, night);
  // The low sky dissolves into the same haze as the far stalks, so the forest never shows a horizon line.
  sky = mix(sky, mix(uHorizonFog, uSkyHorizon, uBambooSunset * .7),
    (1.0 - smoothstep(0.0, 0.26, up.y)) * mix(1.0, .2, uBambooSunset));
  if (night > 0.0) {
    sky += vec3(0.022, 0.030, 0.065) * night * smoothstep(-0.2, 0.75, d.z) * exp(-3.9 * d.y);
    vec3 moonDir = normalize(vec3(-0.50 + 0.08 * uMoon.x, 0.27 + 0.08 * max(0.0, uMoon.y), 1.0));
    vec3 lunar = (d - moonDir) / 0.026;
    float radius = length(lunar);
    sky += vec3(0.13, 0.15, 0.21) * night * exp(-radius * radius * 0.15);
    if (radius < 1.04) {
      float maria = skyNoise3D(lunar * 4.0 + 8.0) * 0.76 + skyNoise3D(lunar * 11.0) * 0.24;
      vec3 moon = vec3(0.98, 0.95, 0.89) * (0.77 + 0.23 * maria);
      sky = mix(sky, moon, night * (1.0 - smoothstep(0.95, 1.02, radius)));
    }
  }
  gl_FragColor = vec4(sky, 1.0);
}
`;

export const BAMBOO_NOISE_GLSL = `
float bambooHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bambooNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bambooHash(i), bambooHash(i + vec2(1.0, 0.0)), f.x),
    mix(bambooHash(i + vec2(0.0, 1.0)), bambooHash(i + vec2(1.0)), f.x), f.y);
}`;

/** Sun, hemisphere ambient and the four nearest lanterns. All colors are linear. */
export const BAMBOO_LIGHT_GLSL = `
uniform vec3 uAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform vec3 uLanternColor;
uniform vec4 uLanterns[4];
vec3 bambooLight(vec3 world, vec3 normal, float dapple) {
  float up = normal.y * 0.5 + 0.5;
  vec3 light = mix(uGroundAmbient, uAmbient, up);
  light += uSunColor * max(dot(normal, uSunDir), 0.0) * dapple;
  for (int i = 0; i < 4; i++) {
    vec3 toLamp = uLanterns[i].xyz - world;
    float dist = length(toLamp);
    float falloff = uLanterns[i].w / (1.0 + dist * dist * 0.42);
    float facing = max(dot(normal, toLamp / max(dist, 0.05)), 0.0) * 0.8 + 0.2;
    light += uLanternColor * falloff * facing * uNight;
  }
  return light;
}`;

/** Three open areas (x, z, radius, feather): the meadow, the summit and the bare north face. 1 inside, 0 outside. */
export const BAMBOO_CLEARING_GLSL = `
uniform vec4 uClearings[3];
float bambooClearing(vec2 p) {
  float inside = 0.0;
  for (int i = 0; i < 3; i++) {
    float d = distance(p, uClearings[i].xy);
    inside = max(inside, 1.0 - smoothstep(uClearings[i].z - uClearings[i].w, uClearings[i].z, d));
  }
  return inside;
}`;

export const BAMBOO_GROUND_VERT = `
varying vec3 vWorld;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const BAMBOO_GROUND_FRAG = `
uniform sampler2D uMask;
uniform sampler2D uGrassMap;
uniform sampler2D uSoilMap;
uniform sampler2D uForestMap;
uniform sampler2D uGardenMap;
uniform float uGrassReady;
uniform float uSoilReady;
uniform float uForestReady;
uniform float uGardenReady;
uniform vec4 uGardenRect;
uniform float uGroundTileScale;
uniform vec4 uMaskRect;
uniform float uTime;
uniform float uDapple;
uniform vec3 uLitter; uniform vec3 uLitterLight; uniform vec3 uMoss; uniform vec3 uGrass; uniform vec3 uGrassLight;
uniform vec3 uEarth; uniform vec3 uEarthLight;
uniform vec3 uStone; uniform vec3 uStoneLight;
uniform vec3 uPoolColor;
varying vec3 vWorld;
varying vec3 vNormal;
${BAMBOO_NOISE_GLSL}
${BAMBOO_LIGHT_GLSL}
${BAMBOO_CLEARING_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  vec2 uv = (p - uMaskRect.xy) * uMaskRect.zw;
  // One raw RGBA mask carries path, slabs, lantern pools, and actual bamboo root coverage.
  vec4 mask = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(uMask, uv) : vec4(0.0);
  float fine = bambooNoise(p * 7.0);
  float coarse = bambooNoise(p * 1.3 + 4.2);
  vec3 litter = mix(uLitter, uLitterLight, fine * 0.7 + coarse * 0.3);
  float moss = smoothstep(0.42, 0.72, bambooNoise(p * 0.33 + 9.1)) * 0.65;
  litter = mix(litter, uMoss, moss);
  // Open clearings are short grass with a few bare patches instead of leaf litter.
  float clearing = bambooClearing(p);
  vec3 grass = mix(uGrass, uGrassLight, fine * 0.55 + coarse * 0.45);
  grass = mix(grass, uEarthLight, smoothstep(0.62, 0.8, bambooNoise(p * 0.5 + 2.7)) * 0.5);
  litter = mix(litter, grass, clearing);
  // World-space repeats stay aligned across the near/far meshes and the hidden garden.
  // sRGB textures are decoded by Three's GPU texture format before the same linear lighting.
  vec2 groundUv = p * uGroundTileScale;
  vec3 grassArt = texture2D(uGrassMap, groundUv).rgb * (0.9 + coarse * 0.1);
  vec3 forestArt = texture2D(uForestMap, groundUv).rgb;
  // Moss follows broad irregular patches while the photograph keeps every root and dry leaf.
  float forestLuma = dot(forestArt, vec3(.2126, .7152, .0722));
  float forestMoss = .65 + .30 * smoothstep(.25, .75, bambooNoise(p * .42 + vec2(31.7, 7.2)));
  forestArt = mix(forestArt, forestLuma * vec3(.55, .82, .38), forestMoss);
  vec3 forestFloor = mix(litter, forestArt, uForestReady);
  litter = mix(mix(litter, grassArt, uGrassReady), forestFloor, mask.a);
  float path = smoothstep(0.32, 0.6, mask.r + (fine - 0.5) * 0.22);
  vec3 earth = mix(uEarth, uEarthLight, fine * 0.5 + coarse * 0.5);
  vec3 soilArt = texture2D(uSoilMap, groundUv).rgb * (0.9 + coarse * 0.1);
  // Preserve fine grains while replacing the ochre pigment with pale neutral brown.
  float soilLuma = dot(soilArt, vec3(0.2126, 0.7152, 0.0722));
  soilArt = mix(soilArt, vec3(1.26, 1.01, .76) * (soilLuma * 1.32 + .035), .78);
  earth = mix(earth, soilArt, uSoilReady);
  float slab = smoothstep(0.35, 0.55, mask.g + (fine - 0.5) * 0.08);
  vec3 stone = mix(uStone, uStoneLight, bambooNoise(p * 5.0 + 2.0) * 0.6 + fine * 0.4);
  vec3 color = mix(litter, mix(earth, stone, slab), path);
  float edge = smoothstep(0.2, 0.45, mask.r) * (1.0 - smoothstep(0.45, 0.75, mask.r));
  color = mix(color, uMoss, edge * 0.35 * (1.0 - clearing));
  float gardenEdge = min(min(p.x - uGardenRect.x, p.y - uGardenRect.y), min(uGardenRect.z - p.x, uGardenRect.w - p.y));
  float garden = smoothstep(0.0, .45, gardenEdge);
  // The garden retains its earlier mixed grass/earth picture, including beneath its paths.
  vec3 gardenArt = texture2D(uGardenMap, groundUv).rgb;
  float gardenSoil = 1.0 - smoothstep(.90, 1.14, gardenArt.g / max(.001, gardenArt.r));
  float gardenLuma = dot(gardenArt, vec3(.2126, .7152, .0722));
  vec3 gardenEarth = vec3(1.26, 1.01, .76) * gardenLuma * 1.08;
  gardenArt = mix(gardenArt, gardenEarth, gardenSoil * .55);
  color = mix(color, gardenArt, garden * uGardenReady);
  float dapple = mix(1.0 - uDapple * (1.0 - clearing), 1.0, bambooNoise(p * 0.75 + vec2(uTime * 0.02, uTime * 0.013)));
  vec3 light = bambooLight(vWorld, normalize(vNormal), dapple);
  float soilWarmth = max(path * (1.0 - garden), garden * gardenSoil * .85) * uNight;
  light = mix(light, vec3(dot(light, vec3(.2126, .7152, .0722))), soilWarmth * .35);
  color *= light;
  // Beyond the deck lanterns the unlit slope recedes into cool moonlight.
  float riverBank = smoothstep(uClearings[0].y + 9.0, uClearings[0].y + 16.0, p.y) * clearing * uNight;
  float leafLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, leafLuma * vec3(0.16, 0.29, 0.42), riverBank * 0.89);
  vec3 pool = mix(uPoolColor, vec3(dot(uPoolColor, vec3(.2126, .7152, .0722))) * vec3(1.1, 1.0, .9), soilWarmth * .5);
  color += pool * mask.b * uNight * (1.0 - 0.55 * riverBank);
  // Keep the hidden garden floor quiet at night so its LED trees remain the focus.
  color *= mix(1.0, .52, garden * uNight);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const BAMBOO_STALK_VERT = `
attribute vec4 aStalk;
attribute vec4 aSeed;
attribute float aGround;
uniform float uTime;
uniform float uSway;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight01;
varying float vTint;
varying float vAlong;
#include <fog_pars_vertex>
void main() {
  float h = position.y;
  float bend = h * h * uSway;
  float sway = sin(uTime * 0.7 + aSeed.x) * 0.22 * bend + sin(uTime * 1.9 + aSeed.x * 1.7) * 0.04 * bend;
  vec3 world = vec3(aStalk.x + position.x * aStalk.w + sway + aSeed.w * h * aStalk.z,
    aGround - 0.15 + h * aStalk.z, aStalk.y + position.z * aStalk.w + sway * 0.6);
  vWorld = world;
  vNormal = normal;
  vHeight01 = h;
  vTint = aSeed.y;
  vAlong = h * aStalk.z;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const BAMBOO_STALK_FRAG = `
uniform vec3 uStalkBase;
uniform vec3 uStalkTop;
uniform vec3 uStalkWarm;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight01;
varying float vTint;
varying float vAlong;
${BAMBOO_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  float node = fract(vAlong / 0.46);
  float ring = 1.0 - smoothstep(0.03, 0.07, min(node, 1.0 - node));
  float ridge = smoothstep(0.07, 0.1, node) * (1.0 - smoothstep(0.1, 0.16, node));
  vec3 base = mix(uStalkBase, uStalkTop, smoothstep(0.08, 0.92, vHeight01));
  base = mix(base, uStalkWarm, vTint * 0.4);
  base *= 1.0 - ring * 0.5 + ridge * 0.12;
  float grain = 0.94 + 0.06 * sin(vNormal.x * 34.0 + vNormal.z * 21.0 + vTint * 20.0);
  vec3 normal = normalize(vNormal);
  vec3 color = base * grain * bambooLight(vWorld, normal, 0.85);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Crossed quads for leaf clusters and dry brush. Instances carry position, size and a seed. */
const BAMBOO_PRIVATE_GARDEN_GLSL = `
uniform float uGardenInterior;
uniform vec4 uGardenInnerBounds;
uniform float uGardenScreenTop;
bool bambooIntrudesIntoPrivateGarden(vec3 world) {
  // Keep the dense outside screen and its upper crowns. Only leaf fragments
  // protruding in front of the private garden's inner backing are trimmed.
  return uGardenInterior > .5 && uNight > .35 && world.y < uGardenScreenTop
    && world.x > uGardenInnerBounds.x && world.x < uGardenInnerBounds.z
    && world.z > uGardenInnerBounds.y && world.z < uGardenInnerBounds.w;
}`;

export const BAMBOO_FOLIAGE_VERT = `
attribute vec4 aLeaf;
attribute vec4 aLeafSeed;
uniform float uTime;
uniform float uSway;
varying vec2 vUv;
varying vec3 vWorld;
varying float vTint;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTint = aLeafSeed.y;
  float c = cos(aLeafSeed.z), s = sin(aLeafSeed.z);
  vec3 local = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c) * aLeaf.w;
  float sway = sin(uTime * 0.8 + aLeafSeed.x) * 0.18 * uSway * aLeafSeed.w;
  vec3 world = aLeaf.xyz + local + vec3(sway, sin(uTime * 1.3 + aLeafSeed.x * 2.0) * 0.05 * uSway * aLeafSeed.w, sway * 0.5);
  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const BAMBOO_FOLIAGE_FRAG = `
uniform sampler2D uLeaf;
uniform vec3 uLeafShade;
uniform vec3 uLeafLit;
uniform float uTransmit;
varying vec2 vUv;
varying vec3 vWorld;
varying float vTint;
${BAMBOO_LIGHT_GLSL}
${BAMBOO_PRIVATE_GARDEN_GLSL}
#include <fog_pars_fragment>
void main() {
  if (bambooIntrudesIntoPrivateGarden(vWorld)) discard;
  vec4 leaf = texture2D(uLeaf, vUv);
  if (leaf.a < 0.5) discard;
  vec3 tint = mix(uLeafShade, uLeafLit, vTint);
  vec3 light = bambooLight(vWorld, vec3(0.0, 1.0, 0.0), 0.75) + uSunColor * uTransmit * max(uSunDir.y, 0.0);
  vec3 color = leaf.rgb * tint * light;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const BAMBOO_CANOPY_VERT = `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const BAMBOO_CANOPY_FRAG = `
uniform sampler2D uLeaf;
uniform vec2 uRepeat;
uniform float uTime;
uniform vec3 uCanopyColor;
uniform float uCanopyAlpha;
varying vec2 vUv;
varying vec3 vWorld;
${BAMBOO_LIGHT_GLSL}
${BAMBOO_CLEARING_GLSL}
${BAMBOO_PRIVATE_GARDEN_GLSL}
#include <fog_pars_fragment>
void main() {
  if (bambooIntrudesIntoPrivateGarden(vWorld)) discard;
  vec2 uv = vUv * uRepeat + vec2(uTime * 0.004, uTime * 0.0025);
  vec4 leaf = texture2D(uLeaf, uv);
  // The canopy opens over the meadow and the summit, thinning out before the clearing edge.
  float cover = 1.0 - bambooClearing(vWorld.xz + vec2(0.0, 0.0));
  if (leaf.a * cover < uCanopyAlpha) discard;
  // Seen from below: the underside is in shade, with sunlight showing through.
  vec3 light = mix(uGroundAmbient, uAmbient, 0.5) + uSunColor * 0.42 * max(uSunDir.y, 0.0);
  vec3 color = leaf.rgb * uCanopyColor * light;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Additive billboard halos around each lantern; exactly zero at the edge of the quad. */
export const BAMBOO_GLOW_VERT = `
attribute vec4 aGlow;
attribute vec2 aGlowSeed;
uniform float uTime;
varying vec2 vUv;
varying float vFlicker;
varying float vDist;
void main() {
  vUv = uv;
  vFlicker = 0.9 + 0.1 * sin(uTime * 2.3 + aGlowSeed.x * 40.0) * sin(uTime * 3.7 + aGlowSeed.x * 17.0);
  vec4 center = viewMatrix * vec4(aGlow.xyz, 1.0);
  vDist = -center.z;
  center.xy += position.xy * aGlow.w;
  gl_Position = projectionMatrix * center;
}`;

export const BAMBOO_GLOW_FRAG = `
uniform float uNight;
uniform vec3 uGlowColor;
varying vec2 vUv;
varying float vFlicker;
varying float vDist;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.4, 1.0, r2);
  float core = exp(-r2 * 14.0);
  float haze = exp(-r2 * 3.2);
  float alpha = uNight * vFlicker * edge * (core * 0.32 + haze * 0.1) * (1.0 - smoothstep(40.0, 70.0, vDist));
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uGlowColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const BAMBOO_FIREFLY_VERT = `
attribute vec4 aFly;
uniform float uTime;
varying float vBlink;
void main() {
  float t = uTime * 0.35 + aFly.w;
  vec3 world = aFly.xyz + vec3(sin(t * 1.1) * 1.4 + sin(t * 2.7) * 0.4, sin(t * 0.9 + 1.3) * 0.5, cos(t * 0.8) * 1.4 + cos(t * 2.3) * 0.3);
  vBlink = smoothstep(0.15, 0.95, sin(uTime * 1.6 + aFly.w * 7.0) * 0.5 + 0.5);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(90.0 / max(-mv.z, 1.0), 1.5, 7.0);
}`;

export const BAMBOO_FIREFLY_FRAG = `
uniform float uNight;
uniform vec3 uFlyColor;
varying float vBlink;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float glow = pow(max(0.0, 1.0 - r * r), 2.0);
  float alpha = glow * vBlink * uNight * 0.85;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uFlyColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
