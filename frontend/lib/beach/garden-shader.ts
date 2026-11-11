import { UYUNI_SKY_FUNCTIONS, UYUNI_SKY_UNIFORMS } from "./uyuni-shader";

/**
 * 봄 산수 이미지와 절차적 하늘을 안개로 연결한다. 가까운 식재는 부드러운 조명을 받고,
 * 수면에는 건축·산·버드나무가 실제로 비친다. 색은 선형 공간에서 조명한 뒤 화면 색공간으로 변환한다.
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
    day = daylightSky(d, 0.1);
    if (uStars > 0.0) {
      vec3 firstStars = uyuniStars(d, 220.0, 0.988, 0.0) + uyuniStars(d, 70.0, 0.992, 19.7) * 0.85;
      day.rgb += firstStars * uStars * smoothstep(0.08, 0.34, up) * (1.0 - day.a * 0.92);
    }
  }
  vec3 dark = night > 0.0 ? uyuniNight(d) : vec3(0.0);
  vec3 sky = uyuniHorizonAir(mix(day.rgb, dark, night), d, night);
  float luma = dot(sky, vec3(0.2126, 0.7152, 0.0722));
  sky = mix(sky, vec3(luma), 0.05 * (1.0 - night));
  sky = mix(sky, uHorizonFog, (1.0 - smoothstep(0.0, 0.26, up)) * 0.85);
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
  return smoothstep(-0.12, 1.0, nl);
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
  // Match the diffuse exposure of the physical timber/stone materials around the lake.
  return light * (1.0 - rim * uInkRim) * mix(0.48, 0.92, uNight);
}
float gardenGrain() {
  return 0.99 + 0.02 * gardenHash(floor(gl_FragCoord.xy));
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
uniform sampler2D uGrassPhoto;
uniform float uGrassPhotoAmount;
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
  vec4 mask = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(uMask, uv) : vec4(0.0);
  vec2 luv = (p - uLakeRect.xy) * uLakeRect.zw;
  float shore = (texture2D(uLake, luv).r - 0.5) * 12.0;
  float fine = gardenNoise(p * 6.0);
  float coarse = gardenNoise(p * 0.9 + 3.1);
  float wash = gardenNoise(p * 0.18 + 7.7);
  vec3 grass = mix(uGrass, uGrassLight, fine * 0.4 + coarse * 0.6);
  grass = mix(grass, uGrassDeep, smoothstep(0.55, 0.85, wash) * 0.6);
  // One small repeating albedo, with mipmaps and a broad second sample to soften repeated patches.
  vec3 grassFine = texture2D(uGrassPhoto, p * .38).rgb;
  vec3 grassWide = texture2D(uGrassPhoto, p * .071 + vec2(.31,.57)).rgb;
  float grassDetail = 1.0 - smoothstep(18.0, 65.0, distance(cameraPosition.xz, p));
  vec3 grassPhoto = mix(grassWide, grassFine, .62 + .25 * grassDetail) * (.88 + coarse * .18);
  grass = mix(grass, grassPhoto, uGrassPhotoAmount);
  float path = smoothstep(0.3, 0.6, mask.r + (fine - 0.5) * 0.2);
  vec3 earth = mix(uEarth, uEarthLight, fine * 0.5 + coarse * 0.5);
  // Small gravel and moss follow world coordinates, so they do not shimmer with the camera.
  float grit = gardenNoise(p * 34.0);
  earth *= 0.88 + grit * 0.24;
  grass *= 0.96 + fine * .08;
  float slab = smoothstep(0.35, 0.55, mask.g + (fine - 0.5) * 0.08);
  vec3 stone = mix(uStone, uStoneLight, gardenNoise(p * 4.0 + 2.0) * 0.6 + fine * 0.4);
  vec3 color = mix(grass, mix(earth, stone, slab), path);
  float mud = 1.0 - smoothstep(0.2, 2.2, shore);
  color = mix(color, uMud, mud * 0.8);
  color *= 1.0 - uWet * 0.22;
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  color *= gardenLight(vWorld, normal, viewDir, 0.9) * gardenGrain();
  color *= 1.0 - mask.a * mix(0.55, 0.25, uNight);
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
  vec2 slope = vec2(cos(p.x * 0.9 + p.y * 0.35 + uTime * 0.5), sin(p.y * 0.8 - p.x * 0.3 + uTime * 0.42)) * 0.004;
  slope += (vec2(gardenNoise(p * 1.7 + uTime * 0.12), gardenNoise(p * 1.7 + 5.0 - uTime * 0.1)) - 0.5) * 0.006;
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
    proj.xy += slope * proj.w * 0.45;
    vec4 rt = texture2DProj(uReflection, proj);
    reflection = mix(skyRef, rt.rgb, clamp(rt.a, 0.0, 1.0) * uReflect);
  }
  float facing = clamp(dot(-incoming, normal), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 4.0);
  float depth = clamp(-shore / 7.0, 0.0, 1.0);
  vec3 waterLight = mix(vec3(0.88, 0.96, 1.0), vec3(0.035, 0.065, 0.115), uNight);
  vec3 litShore = uJadeShore * waterLight;
  vec3 body = mix(litShore, mix(uJade, uJadeDeep, depth) * waterLight, 1.0 - smoothstep(-1.6, -0.2, shore));
  float reflectAmount = mix(0.56, 0.94, fresnel) * mix(1.0, 0.8, uRain);
  vec3 color = mix(body, reflection, reflectAmount);
  // 해·달의 긴 반짝임
  vec3 sunDir = normalize(uSun);
  float glint = pow(max(dot(reflected, sunDir), 0.0), 320.0) * step(0.0, uSun.y);
  color += srgbToLinearApprox(uSunColor) * glint * 0.5 * (1.0 - uRain * 0.6);
  color += vec3(0.5, 0.6, 0.65) * rings * mix(0.5, 0.25, uNight);
  color = mix(color, litShore, smoothstep(-1.2, 0.25, shore) * 0.18);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** 산 능선을 뒤집지 않고 이어 붙이고, 먼 산과 하늘은 안개로 부드럽게 연결한다. */
export const GARDEN_MOUNTAIN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const GARDEN_MOUNTAIN_FRAG = `
uniform sampler2D uInk;
uniform float uPhotographic;
uniform vec3 uFogColor;
uniform vec3 uInkColor;
uniform float uNight;
uniform float uRain;
varying vec2 vUv;
void main() {
  if (uPhotographic > 0.5) {
    // Two forward-facing spans retain the source's natural proportions on
    // the 360-degree cylinder. Never reflect the UVs: that makes twin peaks.
    float span = vUv.x * 2.0;
    float x = fract(span);
    float azimuth = vUv.x * 6.2831853;
    float ridgeOffset = sin(azimuth + 0.7) * 0.025 + sin(azimuth * 3.0 + 1.4) * 0.012;
    float y = clamp(vUv.y + ridgeOffset * sin(vUv.y * 3.1415927), 0.0, 1.0);
    // Derivatives must come from the continuous coordinate, before fract.
    // Implicit mip selection sees the wrap as a huge footprint and paints a
    // narrow blurred stripe; conditional sampling also leaves helper lanes undefined.
    vec2 continuousUv = vec2(span * 0.9, y);
    vec2 gradientX = dFdx(continuousUv), gradientY = dFdy(continuousUv);
    vec3 current = texture2DGradEXT(uInk, vec2(x * 0.9, y), gradientX, gradientY).rgb;
    vec3 previous = texture2DGradEXT(uInk, vec2(0.9 + x * 0.9, y), gradientX, gradientY).rgb;
    // Both sides meet at source x=.9 with the same forward slope; the last
    // tenth of the photo dissolves into its beginning without mirroring it.
    vec3 landscape = mix(previous, current, smoothstep(0.0, 1.0 / 9.0, x));
    float luma = dot(landscape, vec3(0.2126, 0.7152, 0.0722));
    landscape = mix(landscape, vec3(luma), 0.08 + uRain * 0.25);
    landscape *= mix(vec3(1.0, 1.0, 0.99), vec3(0.08, 0.12, 0.2), uNight);
    float haze = 0.1 + smoothstep(0.35, 0.88, vUv.y) * 0.72 + uRain * 0.3;
    landscape = mix(landscape, uFogColor, clamp(haze, 0.0, 0.96));
    float cover = (1.0 - smoothstep(0.54, 0.94, vUv.y)) * smoothstep(0.0, 0.08, vUv.y);
    gl_FragColor = vec4(pow(max(landscape, vec3(0.0)), vec3(2.2)), cover);
  } else {
  vec4 ink = texture2D(uInk, vUv);
  float cover = min(1.0, ink.a * 1.7) * (1.0 - uRain * 0.45);
  if (cover < 0.004) discard;
  vec3 tone = mix(uInkColor, uFogColor, ink.r);
  gl_FragColor = vec4(pow(mix(uFogColor, tone, cover * 0.95), vec3(2.2)), 1.0);
  }
  #include <colorspace_fragment>
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
  vTint = aLeafSeed.y;
  float hanging = aLeafSeed.w;
  // The hanging quad grows downward; keep the photographed crown above its leaf tips.
  vUv = vec2(uv.x, mix(uv.y, 1.0 - uv.y, hanging));
  float c = cos(aLeafSeed.z), s = sin(aLeafSeed.z);
  float along = position.y + 0.5;
  float y = mix(along, -along, hanging) * aLeaf.w;
  float reach = along * along;
  vec3 local = vec3((position.x * c - position.z * s) * aLeaf.w, y, (position.x * s + position.z * c) * aLeaf.w);
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
  if (leaf.a < 0.32) discard;
  vec3 tint = mix(uLeafShade, uLeafLit, vTint);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 light = gardenLight(vWorld, vec3(0.0, 1.0, 0.0), viewDir, 0.7) + uSunColor * uTransmit * max(uSunDir.y, 0.0);
  vec3 color = leaf.rgb * tint * light * gardenGrain() * (1.0 - uWet * 0.18);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Small leaf-only clusters occupy a real crown volume instead of crossing complete tree photographs. */
export const GARDEN_TREE_VERT = `
attribute vec4 aLeaf;
attribute vec4 aLeafSeed;
attribute vec3 aCrownNormal;
uniform float uTime;
uniform float uSway;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCrownNormal;
varying float vTint;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vTint = aLeafSeed.y;
  vCrownNormal = aCrownNormal;
  float phase = uTime * 0.58 + aLeafSeed.x;
  vec3 center = aLeaf.xyz + vec3(sin(phase) * 0.028, sin(phase * 0.7) * 0.008, cos(phase * 0.83) * 0.018) * uSway;
  float c = cos(aLeafSeed.z), s = sin(aLeafSeed.z);
  vec2 card = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aLeaf.w;
  card.y *= aLeafSeed.w;
  // Orient the small clusters toward the current eye, including the reflected camera.
  // Their distinct world-space centres preserve parallax and avoid edge-on black sheets.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vWorld = center + right * card.x + up * card.y;
  vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const GARDEN_TREE_FRAG = `
uniform sampler2D uLeaf;
uniform vec3 uLeafShade;
uniform vec3 uLeafLit;
uniform float uTransmit;
uniform float uWet;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCrownNormal;
varying float vTint;
${GARDEN_LIGHT_GLSL}
#include <fog_pars_fragment>
void main() {
  vec4 leaf = texture2D(uLeaf, vUv);
  if (leaf.a < 0.32) discard;
  vec3 tint = mix(uLeafShade, uLeafLit, vTint);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 light = gardenLight(vWorld, normalize(vCrownNormal), viewDir, 0.72) + uSunColor * uTransmit * max(uSunDir.y, 0.0);
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
  // The base plane is already horizontal (XZ); using Y here collapses every pad to a line.
  vec2 local = vec2(position.x * c - position.z * s, position.x * s + position.z * c) * aPad.z * 2.0;
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

/** Clear glazing keeps the landscape visible, with only a subtle reflection at glancing angles. */
export const GARDEN_GLASS_VERT = `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
export const GARDEN_GLASS_FRAG = `
uniform vec3 uTint;
uniform float uGlassOpacity;
uniform float uGlassEdgeOpacity;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normal, viewDir));
  float fresnel = pow(1.0 - facing, 3.0);
  float alpha = uGlassOpacity + fresnel * uGlassEdgeOpacity;
  gl_FragColor = vec4(uTint, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Near/far rain remains fixed in world space while the camera walks around the whole garden. */
export const GARDEN_RAIN_VERT = `
attribute vec4 aDrop;
uniform float uTime;
uniform float uNearSpan;
uniform float uFarSpan;
uniform float uHeight;
uniform float uSpeed;
uniform sampler2D uRainSurface;
uniform vec4 uRainArea;
uniform vec4 uRainHall;
uniform vec2 uRainHallRoof;
uniform vec4 uRainPavilion;
varying float vAlpha;
varying vec2 vRainUv;
varying float vRainAboveSurface;
float rainSurface(vec2 point) {
  vec2 uv = (point - uRainArea.xy) * uRainArea.zw;
  vec4 surfaceSample = texture2D(uRainSurface, clamp(uv, 0.0, 1.0));
  float height = (surfaceSample.r * 255.0 * 256.0 + surfaceSample.g * 255.0) / 65535.0 * 4.0;
  // Analytic roof footprints prevent coarse height-mask pixels from leaking drops indoors.
  vec2 hall = abs(point - uRainHall.xy);
  if (hall.x <= uRainHall.z && hall.y <= uRainHall.w) {
    float inset = min(uRainHall.z - hall.x, uRainHall.w - hall.y);
    float t = clamp(inset / uRainHall.w, 0.0, 1.0);
    float corner = pow(hall.x / uRainHall.z, 2.4) * pow(hall.y / uRainHall.w, 2.4);
    height = max(height, uRainHallRoof.x + uRainHallRoof.y * t - .4 * sin(t * 3.141593) * (1.0 - corner * .5) + .9 * corner * (1.0 - t));
  }
  vec2 pavilion = abs(point - uRainPavilion.xy);
  float reach = max(pavilion.x, pavilion.y);
  if (reach <= uRainPavilion.z) {
    float t = 1.0 - reach / uRainPavilion.z;
    float side = min(pavilion.x, pavilion.y) / max(.001, reach);
    float edge = .42 * pow(side, 2.4);
    height = max(height, uRainPavilion.w + edge + (1.55 - edge) * t - .3 * sin(t * 3.141593) * (1.0 - side * .35));
  }
  return height;
}
void main() {
  vRainUv = uv;
  float span = mix(uNearSpan, uFarSpan, aDrop.w);
  vec2 offset = mod(aDrop.xy * span - cameraPosition.xz + span * .5, span) - span * .5;
  vec2 site = cameraPosition.xz + offset;
  float surface = rainSurface(site), column = mix(uHeight, uHeight * 1.65, aDrop.w);
  float top = max(cameraPosition.y + column * .6, surface + column);
  float fall = mod(uTime * uSpeed + aDrop.z * column, top - surface);
  vec3 origin = vec3(site.x, top - fall, site.y);
  vec2 toCamera = -offset / max(length(offset), .001);
  // right x up must face the camera; the previous sign culled every FrontSide streak.
  vec3 right = vec3(toCamera.y, 0.0, -toCamera.x);
  float distanceToCamera = length(offset), edge = max(abs(offset.x), abs(offset.y)) / (span * .5);
  float width = mix(.032, .052, aDrop.w), lengthOfDrop = mix(.64, 1.05, aDrop.w) * (.85 + aDrop.z * .3);
  vec3 world = origin + right * position.x * width + vec3(0.0, position.y * lengthOfDrop, 0.0);
  vRainAboveSurface = world.y - surface;
  vAlpha = (1.0 - smoothstep(.72, 1.0, edge)) * smoothstep(.35, 1.4, distanceToCamera)
    * mix(1.0, smoothstep(9.0, 16.0, distanceToCamera) * .72, aDrop.w);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
export const GARDEN_RAIN_FRAG = `
uniform float uRain;
uniform vec3 uDropColor;
varying float vAlpha;
varying vec2 vRainUv;
varying float vRainAboveSurface;
void main() {
  if (vRainAboveSurface < .005) discard;
  float ends = smoothstep(0.0, .14, vRainUv.y) * (1.0 - smoothstep(.82, 1.0, vRainUv.y));
  float a = (1.0 - abs(vRainUv.x * 2.0 - 1.0)) * ends * vAlpha * uRain * .64;
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
