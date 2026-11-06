import { UYUNI_SKY_FUNCTIONS, UYUNI_SKY_UNIFORMS } from "./uyuni-shader";

/**
 * 봄물 정원 셰이더. 하늘은 우유니의 절차적 하늘에서 바다·해안을 빼고 지평선을 종이빛 안개로 풀었다.
 * 물체는 "먹 조명"(반구광 + 3단 토운 햇빛 + 실루엣 먹선 + 종이결)으로 직접 비추고, 색은 선형 공간에서 계산한 뒤
 * three 의 톤매핑·색공간·안개 조각을 붙여 기본 재질과 같은 결과를 낸다. 물만 반사 렌더 타깃을 추가로 읽는다.
 */
export const GARDEN_SKY_GLSL = `${UYUNI_SKY_FUNCTIONS}
uniform vec3 uHorizonFog;
/** 종이 위에 번진 하늘: 낮엔 살짝 탈색, 지평선은 안개와 같은 종이빛으로 녹는다. */
vec3 gardenSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  float night = smoothstep(0.55, 1.0, uStars);
  vec4 day = vec4(0.0);
  if (night < 1.0) {
    day = uyuniDay(d);
    if (uStars > 0.0) {
      vec3 firstStars = uyuniStars(d, 220.0, 0.988, 0.0) + uyuniStars(d, 70.0, 0.992, 19.7) * 0.85;
      day.rgb += firstStars * uStars * smoothstep(0.08, 0.34, up) * (1.0 - day.a * 0.92);
    }
  }
  vec3 dark = night > 0.0 ? uyuniNight(d) : vec3(0.0);
  vec3 sky = uyuniHorizonAir(mix(day.rgb, dark, night), d, night);
  float luma = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  sky = mix(sky, vec3(luma), 0.16 * (1.0 - night));
  sky = mix(sky, uHorizonFog, (1.0 - smoothstep(0.0, 0.3, up)) * 0.9);
  if (night > 0.0) {
    vec3 moonDir = normalize(vec3(-0.46 + 0.08 * uMoon.x, 0.3 + 0.08 * max(0.0, uMoon.y), 1.0));
    vec3 lunar = (d - moonDir) / 0.026;
    float radius = length(lunar);
    sky += vec3(0.12, 0.14, 0.2) * night * exp(-radius * radius * 0.15);
    if (radius < 1.04) {
      float maria = skyNoise3D(lunar * 4.0 + 8.0) * 0.76 + skyNoise3D(lunar * 11.0) * 0.24;
      vec3 moon = vec3(0.98, 0.95, 0.89) * (0.77 + 0.23 * maria);
      sky = mix(sky, moon, night * (1.0 - smoothstep(0.95, 1.02, radius)));
    }
  }
  return sky;
}`;

export const GARDEN_SKY_FRAGMENT = `${UYUNI_SKY_UNIFORMS}
varying vec3 vDir;
${GARDEN_SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  if (d.y < 0.0) {
    gl_FragColor = vec4(uHorizonFog * mix(0.55, 1.0, exp(5.0 * d.y)), 1.0);
    return;
  }
  gl_FragColor = vec4(gardenSky(d), 1.0);
}`;

export const GARDEN_NOISE_GLSL = `
float gardenHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gardenNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gardenHash(i), gardenHash(i + vec2(1.0, 0.0)), f.x),
    mix(gardenHash(i + vec2(0.0, 1.0)), gardenHash(i + vec2(1.0)), f.x), f.y);
}`;

/** 먹 조명: 반구 환경광 + 3단으로 양자화한 햇빛 + 가까운 등불 4개, 실루엣에는 먹선, 화면에는 종이결. 전부 선형 색. */
export const GARDEN_LIGHT_GLSL = `
uniform vec3 uAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
uniform vec3 uLanternColor;
uniform vec4 uLanterns[4];
uniform float uInkRim;
${GARDEN_NOISE_GLSL}
float gardenToon(float nl) {
  return smoothstep(0.02, 0.14, nl) * 0.42 + smoothstep(0.34, 0.5, nl) * 0.36 + smoothstep(0.74, 0.9, nl) * 0.22;
}
vec3 gardenLight(vec3 world, vec3 normal, vec3 viewDir, float shade) {
  float up = normal.y * 0.5 + 0.5;
  vec3 light = mix(uGroundAmbient, uAmbient, up);
  light += uSunColor * gardenToon(max(dot(normal, uSunDir), 0.0)) * shade;
  for (int i = 0; i < 4; i++) {
    vec3 toLamp = uLanterns[i].xyz - world;
    float dist = length(toLamp);
    float falloff = uLanterns[i].w / (1.0 + dist * dist * 0.42);
    float facing = max(dot(normal, toLamp / max(dist, 0.05)), 0.0) * 0.8 + 0.2;
    light += uLanternColor * falloff * facing * uNight;
  }
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  return light * (1.0 - rim * uInkRim);
}
float gardenGrain() {
  return 0.965 + 0.07 * gardenHash(floor(gl_FragCoord.xy * 0.5));
}`;

export const GARDEN_GROUND_VERT = `
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

/** 바닥: 담채 풀빛, 흙길, 돌판, 물가의 젖은 흙, 밤의 등불 웅덩이. 마스크 두 장(길·호수 거리)을 읽는다. */
export const GARDEN_GROUND_FRAG = `
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform sampler2D uLake;
uniform vec4 uLakeRect;
uniform float uTime;
uniform float uWet;
uniform vec3 uGrass; uniform vec3 uGrassLight; uniform vec3 uGrassDeep;
uniform vec3 uEarth; uniform vec3 uEarthLight;
uniform vec3 uStone; uniform vec3 uStoneLight;
uniform vec3 uMud;
uniform vec3 uPoolColor;
varying vec3 vWorld;
varying vec3 vNormal;
${GARDEN_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz;
  vec2 uv = (p - uMaskRect.xy) * uMaskRect.zw;
  vec3 mask = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(uMask, uv).rgb : vec3(0.0);
  vec2 luv = (p - uLakeRect.xy) * uLakeRect.zw;
  float shore = (texture2D(uLake, luv).r - 0.5) * 12.0;
  float fine = gardenNoise(p * 6.0);
  float coarse = gardenNoise(p * 0.9 + 3.1);
  float wash = gardenNoise(p * 0.18 + 7.7);
  vec3 grass = mix(uGrass, uGrassLight, fine * 0.4 + coarse * 0.6);
  grass = mix(grass, uGrassDeep, smoothstep(0.55, 0.85, wash) * 0.6);
  float path = smoothstep(0.3, 0.6, mask.r + (fine - 0.5) * 0.2);
  vec3 earth = mix(uEarth, uEarthLight, fine * 0.5 + coarse * 0.5);
  float slab = smoothstep(0.35, 0.55, mask.g + (fine - 0.5) * 0.08);
  vec3 stone = mix(uStone, uStoneLight, gardenNoise(p * 4.0 + 2.0) * 0.6 + fine * 0.4);
  vec3 color = mix(grass, mix(earth, stone, slab), path);
  float mud = 1.0 - smoothstep(0.2, 2.2, shore);
  color = mix(color, uMud, mud * 0.8);
  color *= 1.0 - uWet * 0.22;
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  color *= gardenLight(vWorld, normal, viewDir, 0.9) * gardenGrain();
  color += uPoolColor * mask.b * uNight;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export const GARDEN_WATER_VERT = `
uniform mat4 uReflectMatrix;
varying vec3 vWorld;
varying vec4 vReflectUv;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vReflectUv = uReflectMatrix * world;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const GARDEN_RIPPLE_COUNT = 8;
/**
 * 물: 비취빛 몸체 + 하늘(해석적) + 큰 물체의 저해상도 반사(렌더 타깃)를 잔물결로 일그러뜨려 섞는다.
 * 비가 오면 격자 해시로 빗방울 파문이 돋고 반사가 흐려진다. 뱃길·발자국 파문은 uRipples.
 */
export const GARDEN_WATER_FRAG = `${UYUNI_SKY_UNIFORMS}
uniform sampler2D uReflection;
uniform float uReflect;
uniform sampler2D uLake;
uniform vec4 uLakeRect;
uniform vec3 uCamPos;
uniform float uRain;
uniform float uNight;
uniform int uRainTaps;
uniform vec3 uJade; uniform vec3 uJadeDeep; uniform vec3 uJadeShore;
uniform vec4 uRipples[${GARDEN_RIPPLE_COUNT}];
uniform int uRippleLimit;
varying vec3 vWorld;
varying vec4 vReflectUv;
${GARDEN_SKY_GLSL}
${GARDEN_NOISE_GLSL}
#include <fog_pars_fragment>
vec3 srgbToLinearApprox(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
void main() {
  vec2 p = vWorld.xz;
  vec2 luv = (p - uLakeRect.xy) * uLakeRect.zw;
  float shore = (texture2D(uLake, luv).r - 0.5) * 12.0;
  if (shore > 1.4) discard;
  // 잔물결: 느린 두 파동 + 미세한 노이즈
  vec2 slope = vec2(cos(p.x * 0.9 + p.y * 0.35 + uTime * 0.5), sin(p.y * 0.8 - p.x * 0.3 + uTime * 0.42)) * 0.012;
  slope += (vec2(gardenNoise(p * 1.7 + uTime * 0.12), gardenNoise(p * 1.7 + 5.0 - uTime * 0.1)) - 0.5) * 0.02;
  float rings = 0.0;
  if (uRain > 0.01) {
    vec2 cell = floor(p / 0.85);
    for (int i = 0; i < 9; i++) {
      if (i >= uRainTaps) break;
      vec2 c = cell + vec2(float(i / 3) - 1.0, float(i - (i / 3) * 3) - 1.0);
      float h = gardenHash(c);
      vec2 centre = (c + vec2(gardenHash(c + 1.3), gardenHash(c + 2.7))) * 0.85;
      float age = fract(uTime * (0.55 + 0.7 * h) + h * 7.0);
      vec2 delta = p - centre;
      float d = length(delta);
      float wave = d - age * 0.55;
      float env = exp(-wave * wave * 60.0) * (1.0 - age) * step(d, 0.7) * uRain;
      slope += delta / max(d, 0.03) * cos(wave * 40.0) * env * 0.05;
      rings += env * 0.06;
    }
  }
  for (int i = 0; i < ${GARDEN_RIPPLE_COUNT}; i++) {
    if (i >= uRippleLimit) break;
    vec4 ripple = uRipples[i];
    float age = uTime - ripple.z;
    if (ripple.w > 0.0 && age >= 0.0 && age < 4.0) {
      vec2 delta = p - ripple.xy;
      float distance = length(delta);
      float wave = distance - age * 0.9;
      float envelope = exp(-wave * wave / 0.06) * (1.0 - smoothstep(0.2, 4.0, age)) * smoothstep(0.0, 0.12, age) * ripple.w;
      slope += delta / max(distance, 0.035) * cos(wave * 16.0) * envelope * 0.02;
      rings += envelope * 0.02;
    }
  }
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 incoming = normalize(vWorld - uCamPos);
  vec3 reflected = reflect(incoming, normal);
  vec3 skyRef = srgbToLinearApprox(gardenSky(vec3(reflected.x, max(reflected.y, 0.02), reflected.z)));
  vec3 reflection = skyRef;
  if (uReflect > 0.0) {
    vec4 proj = vReflectUv;
    proj.xy += slope * proj.w * 2.4;
    vec4 rt = texture2DProj(uReflection, proj);
    reflection = mix(skyRef, rt.rgb, clamp(rt.a, 0.0, 1.0) * uReflect);
  }
  float facing = clamp(dot(-incoming, normal), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 4.0);
  float depth = clamp(-shore / 7.0, 0.0, 1.0);
  vec3 body = mix(uJadeShore, mix(uJade, uJadeDeep, depth), smoothstep(-0.2, -1.6, shore));
  float reflectAmount = mix(0.5, 0.93, fresnel) * mix(1.0, 0.72, uRain);
  vec3 color = mix(body, reflection, reflectAmount);
  // 해·달의 긴 반짝임
  vec3 sunDir = normalize(uSun);
  float glint = pow(max(dot(reflected, sunDir), 0.0), 320.0) * step(0.0, uSun.y);
  color += srgbToLinearApprox(uSunColor) * glint * 0.5 * (1.0 - uRain * 0.6);
  color += vec3(0.5, 0.6, 0.65) * rings * mix(0.5, 0.25, uNight);
  color = mix(color, uJadeShore, (1.0 - smoothstep(-0.5, 0.0, shore)) * 0.35);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 원경 산수 띠: 종이빛 안개 위에 먹이 번진 능선. 표시 색공간에서 바로 섞는다(하늘과 같은 규약, 안개 없음). */
export const GARDEN_MOUNTAIN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const GARDEN_MOUNTAIN_FRAG = `
uniform sampler2D uInk;
uniform vec3 uFogColor;
uniform vec3 uInkColor;
uniform float uNight;
uniform float uRain;
varying vec2 vUv;
void main() {
  vec4 ink = texture2D(uInk, vUv);
  float cover = min(1.0, ink.a * 1.7) * (1.0 - uRain * 0.45);
  if (cover < 0.004) discard;
  vec3 tone = mix(uInkColor, uFogColor, ink.r);
  gl_FragColor = vec4(mix(uFogColor, tone, cover * 0.95), 1.0);
}`;

/** 버드나무 가닥·갈대: 인스턴스 십자 빌보드. aLeafSeed.w 가 1 이면 위(가지)에 매달려 끝이 흔들리고, 0 이면 밑동에서 자라 끝이 흔들린다. */
export const GARDEN_FOLIAGE_VERT = `
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
  float hanging = aLeafSeed.w;
  float c = cos(aLeafSeed.z), s = sin(aLeafSeed.z);
  float along = position.y + 0.5;
  float y = mix(along, -along, hanging) * aLeaf.w;
  float reach = mix(along, along, 1.0);
  vec3 local = vec3(position.x * c * aLeaf.w, y, position.x * s * aLeaf.w);
  float phase = uTime * (0.7 + 0.2 * aLeafSeed.y) + aLeafSeed.x;
  float sway = (sin(phase) * 0.14 + sin(phase * 2.3) * 0.04) * uSway * reach * aLeaf.w;
  vec3 world = aLeaf.xyz + local + vec3(sway, 0.0, sway * 0.5);
  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const GARDEN_FOLIAGE_FRAG = `
uniform sampler2D uLeaf;
uniform vec3 uLeafShade;
uniform vec3 uLeafLit;
uniform float uTransmit;
uniform float uWet;
varying vec2 vUv;
varying vec3 vWorld;
varying float vTint;
${GARDEN_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec4 leaf = texture2D(uLeaf, vUv);
  if (leaf.a < 0.45) discard;
  vec3 tint = mix(uLeafShade, uLeafLit, vTint);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 light = gardenLight(vWorld, vec3(0.0, 1.0, 0.0), viewDir, 0.7) + uSunColor * uTransmit * max(uSunDir.y, 0.0);
  vec3 color = leaf.rgb * tint * light * gardenGrain() * (1.0 - uWet * 0.18);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 연잎: 수면 위 인스턴스 평면. 아틀라스 네 칸 중 하나, 살짝 까딱인다. */
export const GARDEN_PAD_VERT = `
attribute vec4 aPad;
attribute vec4 aPadSeed;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying float vTint;
#include <fog_pars_vertex>
void main() {
  float cell = aPadSeed.y;
  vUv = (uv + vec2(mod(cell, 2.0), floor(cell / 2.0))) * 0.5;
  vTint = aPadSeed.x;
  float c = cos(aPad.w), s = sin(aPad.w);
  vec2 local = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aPad.z * 2.0;
  float bob = sin(uTime * 0.9 + aPadSeed.x * 6.28) * 0.012;
  vec3 world = vec3(aPad.x + local.x, 0.03 + bob + aPadSeed.z, aPad.y + local.y);
  vWorld = world;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const GARDEN_PAD_FRAG = `
uniform sampler2D uLeaf;
uniform vec3 uLeafShade;
uniform vec3 uLeafLit;
uniform float uWet;
varying vec2 vUv;
varying vec3 vWorld;
varying float vTint;
${GARDEN_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec4 leaf = texture2D(uLeaf, vUv);
  if (leaf.a < 0.5) discard;
  vec3 tint = mix(uLeafShade, uLeafLit, vTint);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 color = leaf.rgb * tint * gardenLight(vWorld, vec3(0.0, 1.0, 0.0), viewDir, 0.85) * gardenGrain();
  color = mix(color, color * vec3(0.9, 1.0, 1.05), uWet * 0.4);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 카메라를 보는 작은 그림 빌보드(연꽃 등): 색은 먹 조명을 받되 그늘지지 않는다. */
export const GARDEN_SPRITE_VERT = `
attribute vec4 aSprite;
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vWorld = aSprite.xyz;
  vec4 center = viewMatrix * vec4(aSprite.xyz, 1.0);
  center.xy += position.xy * aSprite.w;
  gl_Position = projectionMatrix * center;
  vec4 mvPosition = center;
  #include <fog_vertex>
}`;
export const GARDEN_SPRITE_FRAG = `
uniform sampler2D uSprite;
varying vec2 vUv;
varying vec3 vWorld;
${GARDEN_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec4 tex = texture2D(uSprite, vUv);
  if (tex.a < 0.4) discard;
  vec3 color = tex.rgb * gardenLight(vWorld, vec3(0.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), 0.9);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 통창 유리: 옅은 비취빛 + 프레넬, 비가 오면 격자마다 맺힌 물방울과 흘러내리는 줄기. 안쪽이 다 비친다. */
export const GARDEN_GLASS_VERT = `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
export const GARDEN_GLASS_FRAG = `
uniform vec2 uPane;
uniform float uTime;
uniform float uRain;
uniform float uNight;
uniform vec3 uTint;
uniform vec3 uGlow;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
${GARDEN_NOISE_GLSL}
void main() {
  vec2 m = vUv * uPane;
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normal, viewDir));
  float fresnel = pow(1.0 - facing, 3.0);
  float alpha = 0.1 + fresnel * 0.3;
  vec3 color = uTint;
  float drops = 0.0, highlight = 0.0;
  if (uRain > 0.01) {
    // 맺힌 방울: 0.16 m 격자마다 하나, 비 세기만큼만 보인다.
    vec2 cell = floor(m / 0.16);
    vec2 f = fract(m / 0.16);
    float h = gardenHash(cell);
    vec2 centre = vec2(0.3 + 0.4 * gardenHash(cell + 3.1), 0.3 + 0.4 * gardenHash(cell + 5.7));
    float r = 0.07 + 0.17 * gardenHash(cell + 7.9);
    float d = length((f - centre) * vec2(1.0, 1.25));
    // Only some cells hold a drop, more as the rain gets heavier, so the glass never reads as a dot grid.
    float drop = (1.0 - smoothstep(r * 0.7, r, d)) * step(h, uRain * 0.5);
    drops += drop;
    highlight += (1.0 - smoothstep(r * 0.25, r * 0.55, length(f - centre + vec2(0.03, -0.04)))) * drop;
    // 흘러내리는 줄기: 세로 띠 몇 줄이 느리게 내려간다.
    float column = floor(m.x / 0.34);
    float ch = gardenHash(vec2(column, 9.0));
    float speed = 0.25 + 0.35 * ch;
    float y = fract(m.y / (uPane.y + 0.001) * 1.0 + uTime * speed * 0.08 + ch);
    float xoff = abs(fract(m.x / 0.34) - 0.5 - 0.1 * sin(m.y * 7.0 + ch * 20.0)) ;
    float trail = (1.0 - smoothstep(0.02, 0.05, xoff)) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.1, 0.5, y)) * step(ch, uRain * 0.7);
    drops += trail * 0.7;
    highlight += trail * 0.25;
  }
  alpha = clamp(alpha + drops * 0.42, 0.0, 0.9);
  color = mix(color, vec3(0.86, 0.9, 0.92), drops * 0.6);
  color += vec3(1.0) * highlight * 0.5;
  color += uGlow * uNight * 0.25 * (1.0 - drops);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 빗줄기: 카메라 둘레 원통에 가는 띠가 떨어진다. 인스턴스마다 자리·위상이 있고 카메라를 향해 선다. */
export const GARDEN_RAIN_VERT = `
attribute vec3 aDrop;
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSpeed;
varying float vAlpha;
varying float vAcross;
void main() {
  vAcross = position.x;
  float fall = mod(uTime * uSpeed + aDrop.z * uHeight, uHeight);
  vec3 origin = cameraPosition + vec3(aDrop.x * uRadius, uHeight * 0.55 - fall, aDrop.y * uRadius);
  vec3 toCam = normalize(vec3(cameraPosition.x - origin.x, 0.0, cameraPosition.z - origin.z));
  vec3 right = vec3(-toCam.z, 0.0, toCam.x);
  float radial = length(aDrop.xy);
  vec3 world = origin + right * position.x * 0.022 + vec3(0.0, position.y * 0.6, 0.0);
  vAlpha = (1.0 - smoothstep(0.75, 1.0, radial)) * smoothstep(0.0, 0.25, radial);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
export const GARDEN_RAIN_FRAG = `
uniform float uRain;
uniform vec3 uDropColor;
varying float vAlpha;
varying float vAcross;
void main() {
  float a = (1.0 - abs(vAcross) * 2.0) * vAlpha * uRain * 0.42;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uDropColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** 수면 위 안개: 큰 빌보드가 느리게 흘러간다. 새벽·밤·비에 짙어진다. */
export const GARDEN_MIST_VERT = `
attribute vec4 aMist;
attribute float aMistSeed;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  float t = uTime * 0.05 + aMistSeed * 6.28;
  vec3 pos = aMist.xyz + vec3(sin(t) * 3.0 + uTime * 0.12, sin(t * 1.7) * 0.15, cos(t * 0.8) * 2.0);
  vFade = 0.6 + 0.4 * sin(t * 2.3);
  vec4 center = viewMatrix * vec4(pos, 1.0);
  center.xy += position.xy * aMist.w * vec2(1.0, 0.35);
  gl_Position = projectionMatrix * center;
}`;
export const GARDEN_MIST_FRAG = `
uniform sampler2D uMist;
uniform float uAmount;
uniform vec3 uMistColor;
varying vec2 vUv;
varying float vFade;
void main() {
  float a = texture2D(uMist, vUv).a * uAmount * vFade * 0.5;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uMistColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
