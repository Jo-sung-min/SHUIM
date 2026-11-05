import { SKY_FUNCTIONS, SKY_UNIFORMS } from "./sky-shader";
import { UYUNI_COAST_FUNCTIONS } from "./uyuni-coast";

/** Sky and water share the same direction, star clock and daylight palette. */
export const UYUNI_SKY_UNIFORMS = SKY_UNIFORMS;

export const UYUNI_SKY_FUNCTIONS = `${SKY_FUNCTIONS}
${UYUNI_COAST_FUNCTIONS}

// These bands use elevation above a level plane, never distance from the map
// centre. Turning or walking therefore cannot reveal a circular enclosing wall.
vec3 uyuniHorizonAir(vec3 color, vec3 direction, float night) {
  float air = 1.0 - smoothstep(0.002, 0.05, max(direction.y, 0.0));
  vec3 horizon = mix(uSkyHorizon, vec3(0.045, 0.075, 0.13), night);
  return mix(color, horizon, air * mix(0.48, 0.94, night));
}

vec3 uyuniWaterHorizon(vec3 color, vec3 direction, float night) {
  // Only the distant grazing-angle water becomes still and slightly darker.
  // Below this narrow strip, keep the original detailed mirror unchanged.
  float farWater = 1.0 - smoothstep(0.004, 0.045, max(-direction.y, 0.0));
  vec3 water = mix(uSkyHorizon * vec3(0.72, 0.83, 0.90), vec3(0.026, 0.047, 0.085), night);
  return mix(color, water, farWater * mix(0.68, 0.90, night));
}

vec3 uyuniStars(vec3 d, float scale, float threshold, float salt) {
  // Equal-area hemisphere cells have no longitude join or pinched pole.
  // Angular-sized points also stay round instead of stretching with the cells.
  vec2 sp = d.xz / sqrt(1.0 + max(d.y, 0.0)) * scale + salt;
  float footprint = max(length(dFdx(d)), length(dFdy(d)));
  vec2 cell = floor(sp);
  float seed = beachSkyHash(cell);
  vec2 jitter = (vec2(beachSkyHash(cell + 7.3), beachSkyHash(cell + 3.1)) - 0.5) * 0.42;
  vec2 point = (cell + 0.5 + jitter - salt) / scale;
  float r2 = dot(point, point);
  float y = 1.0 - r2;
  float ring = sqrt(max(0.0, 2.0 - r2));
  vec3 starDirection = vec3(point.x * ring, y, point.y * ring);
  float radius = mix(0.0007, 0.0015, beachSkyHash(cell + 1.7));
  float aa = max(footprint * 0.5, 0.00015);
  float core = 1.0 - smoothstep(max(0.0, radius - aa), radius + aa, length(d - starDirection));
  float energy = radius * radius / (radius * radius + footprint * footprint * 0.12);
  float twinkle = 0.78 + 0.22 * sin(uTime * (0.42 + seed * 0.38) + seed * 60.0);
  vec3 tint = mix(vec3(0.78, 0.87, 1.0), vec3(1.0, 0.90, 0.77), beachSkyHash(cell + 4.2));
  return tint * step(threshold, seed) * core * energy * twinkle
    * (0.65 + 0.65 * beachSkyHash(cell + 1.7)) * smoothstep(0.015, 0.14, d.y);
}

float uyuniNebulaNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 low = fract(sin(n + vec4(0.0, 1.0, 57.0, 58.0)) * 43758.5453);
  vec4 high = fract(sin(n + vec4(113.0, 114.0, 170.0, 171.0)) * 43758.5453);
  return mix(mix(mix(low.x, low.y, f.x), mix(low.z, low.w, f.x), f.y),
    mix(mix(high.x, high.y, f.x), mix(high.z, high.w, f.x), f.y), f.z);
}

vec3 uyuniNight(vec3 d) {
  float up = max(d.y, 0.0);
  vec3 dark = mix(vec3(0.022, 0.039, 0.075), vec3(0.006, 0.012, 0.029),
    smoothstep(0.0, 0.85, up));
  vec3 stars = uyuniStars(d, 220.0, 0.988, 0.0)
    + uyuniStars(d, 70.0, 0.992, 19.7) * 0.85;

  // A tilted galactic cloud, evaluated on world directions rather than an
  // equirectangular image. Both ends and the zenith are continuous by construction.
  vec3 axis = normalize(vec3(0.82, 0.48, 0.30));
  float across = dot(d, axis);
  float band = exp(-across * across / 0.026);
  if (band > 0.003) {
    vec3 p = d * 7.0 + vec3(3.1, -2.7, 8.4);
    float wisps = uyuniNebulaNoise(p * 9.7 + 13.2);
    float dust = uyuniNebulaNoise(p) * 0.45 + uyuniNebulaNoise(p * 2.1 + 7.4) * 0.30
      + uyuniNebulaNoise(p * 4.6 - 3.8) * 0.17 + wisps * 0.08;
    float laneNoise = uyuniNebulaNoise(p * 1.8 + vec3(12.0, 4.3, -7.1));
    float core = exp(-across * across / 0.0045);
    float darkLane = smoothstep(0.45, 0.72, laneNoise) * core;
    vec3 cloud = mix(vec3(0.10, 0.14, 0.24), vec3(0.25, 0.16, 0.26), dust);
    cloud *= band * (0.20 + dust * 0.95 + wisps * 0.22) * (1.0 - darkLane * 0.68);
    cloud += vec3(0.15, 0.17, 0.23) * core * smoothstep(0.38, 0.72, dust) * 0.36;
    dark += cloud * smoothstep(0.02, 0.18, up);
  }
  return dark + stars;
}

vec3 uyuniSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  float azimuth = atan(d.x, -d.z);
  float night = smoothstep(0.03, 0.92, uStars);
  vec3 gradient = mix(uSkyHorizon, uSkyTop, smoothstep(-0.025, 0.8, d.y));
  vec3 day = gradient;
  if (night < 1.0) {
    // Only the upper sky is sampled: the beach photograph's sea and cliffs can
    // never become a baked horizon on this entirely open salt flat.
    vec2 photoUv = vec2(fract(azimuth / 6.2831853 + 0.5), mix(0.72, 0.98, up));
    vec3 photo = textureLod(uPhoto, photoUv, 0.0).rgb;
    // The rear coast sits across the panorama's join. Blend its two ends in
    // both sky and reflection so a vertical photograph edge cannot frame it.
    float photoSeam = min(photoUv.x, 1.0 - photoUv.x);
    if (photoSeam < 0.025) {
      vec3 edge = (textureLod(uPhoto, vec2(0.001, photoUv.y), 0.0).rgb
        + textureLod(uPhoto, vec2(0.999, photoUv.y), 0.0).rgb) * 0.5;
      photo = mix(edge, photo, smoothstep(0.0, 0.025, photoSeam));
    }
    float warmHour = clamp((uSkyHorizon.r - uSkyHorizon.b) * 2.3, 0.0, 1.0);
    day = mix(gradient, photo * uPhotoTint,
      smoothstep(0.015, 0.24, up) * (0.68 - warmHour * 0.5));
    float cloudNoise = beachSkyCloud(d.xz / (up + 0.22) * 2.6 + vec2(uTime * 0.0012, 0.0));
    float cloud = smoothstep(0.42 - uCloudAmount * 0.1, 0.66, cloudNoise);
    cloud *= smoothstep(0.015, 0.12, up) * (1.0 - smoothstep(0.85, 0.995, up));
    vec3 cloudLight = uCloudColor * mix(0.8, 1.0, smoothstep(0.38, 0.64, cloudNoise));
    day = mix(day, cloudLight, cloud * 0.86);
    float sunDistance = length(d - uSun);
    float sunDisc = 1.0 - smoothstep(0.009, 0.012, sunDistance);
    float sunHalo = exp(-sunDistance * sunDistance / 0.012) * 0.07;
    day += uSunColor * (sunDisc * 0.65 + sunHalo) * smoothstep(-0.025, 0.05, uSun.y);
  }

  vec3 dark = night > 0.0 ? uyuniNight(d) : vec3(0.0);
  vec3 sky = uyuniHorizonAir(mix(day, dark, night), d, night);
  return uyuniCoast(d, sky, night);
}
`;

export const UYUNI_SKY_FRAGMENT = `${UYUNI_SKY_UNIFORMS}
varying vec3 vDir;
${UYUNI_SKY_FUNCTIONS}
void main() {
  vec3 d = normalize(vDir);
  vec3 color;
  if (d.y >= 0.0) {
    color = uyuniSky(d);
  } else {
    // Continue the water beyond the camera's geometry range. This removes the
    // dark crease where a finite floor used to meet the lower sky hemisphere.
    float night = smoothstep(0.03, 0.92, uStars);
    color = uyuniWaterHorizon(uyuniSky(vec3(d.x, -d.y, d.z)), d, night);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export const UYUNI_SURFACE = {
  size: 2000, height: 0.008,
  islandX: 7, islandZ: 7, dryRadius: 3.45, wetRadius: 3.85,
  rippleCount: 10, rippleLifetime: 3.6,
} as const;

/** The dry island also rejects footstep ripples, so resting mats never sit in water. */
export function uyuniDryAmount(x: number, z: number): number {
  const distance = Math.hypot(x - UYUNI_SURFACE.islandX, z - UYUNI_SURFACE.islandZ);
  const t = Math.max(0, Math.min(1, (distance - UYUNI_SURFACE.dryRadius)
    / (UYUNI_SURFACE.wetRadius - UYUNI_SURFACE.dryRadius)));
  return 1 - t * t * (3 - 2 * t);
}

export const UYUNI_WATER_VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const UYUNI_WATER_FRAGMENT = `${UYUNI_SKY_UNIFORMS}
uniform sampler2D uSand;
uniform vec3 uSandTint;
uniform vec3 uCamPos;
uniform vec2 uWalker;
uniform vec4 uRipples[${UYUNI_SURFACE.rippleCount}];
uniform int uRippleLimit;
uniform float uWaveScale;
varying vec3 vWorld;
${UYUNI_SKY_FUNCTIONS}
void main() {
  vec2 p = vWorld.xz;
  float dry = 1.0 - smoothstep(${UYUNI_SURFACE.dryRadius}, ${UYUNI_SURFACE.wetRadius},
    length(p - vec2(${UYUNI_SURFACE.islandX}.0, ${UYUNI_SURFACE.islandZ}.0)));
  // Millimetric undulations, not ocean waves: keep the galaxy legible at our feet.
  vec2 slope = vec2(cos(p.x * 0.7 + p.y * 0.31 + uTime * 0.24),
    sin(p.y * 0.65 - p.x * 0.23 + uTime * 0.19)) * 0.00065 * uWaveScale;
  float rings = 0.0;
  for (int i = 0; i < ${UYUNI_SURFACE.rippleCount}; i++) {
    if (i >= uRippleLimit) break;
    vec4 ripple = uRipples[i];
    float age = uTime - ripple.z;
    if (ripple.w > 0.0 && age >= 0.0 && age < ${UYUNI_SURFACE.rippleLifetime}) {
      vec2 delta = p - ripple.xy;
      float distance = length(delta);
      float wave = distance - age * 0.74;
      float envelope = exp(-wave * wave / 0.025)
        * (1.0 - smoothstep(0.2, ${UYUNI_SURFACE.rippleLifetime}, age))
        * smoothstep(0.0, 0.12, age) * ripple.w;
      slope += delta / max(distance, 0.035) * cos(wave * 22.0) * envelope * 0.008;
      rings += envelope * 0.025;
    }
  }
  slope *= (1.0 - dry);
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 incoming = normalize(vWorld - uCamPos);
  vec3 reflection = uyuniSky(reflect(incoming, normal));
  float facing = clamp(dot(-incoming, normal), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 5.0);
  float night = smoothstep(0.03, 0.92, uStars);
  vec3 grain = texture2D(uSand, fract(p * 0.18)).rgb;
  vec3 salt = mix(vec3(0.94, 0.955, 0.98), grain, 0.36) * uSandTint;
  float nearFeet = 1.0 - smoothstep(0.8, 5.2, length(p - uWalker));
  float reflectionAmount = mix(0.58 + fresnel * 0.4, 0.91 + fresnel * 0.08, night);
  reflectionAmount -= nearFeet * mix(0.15, 0.025, night);
  reflectionAmount *= 1.0 - dry;
  // The visible salt floor is only centimetres below the surface. No second
  // transparent plane, render target, depth read, blur pass or avatar reflection.
  vec3 color = mix(salt, reflection, clamp(reflectionAmount, 0.0, 1.0));
  color += vec3(0.35, 0.43, 0.55) * rings * (1.0 - dry) * mix(0.45, 0.2, night);
  color = uyuniWaterHorizon(color, incoming, night);
  gl_FragColor = vec4(color, 1.0);
}
`;
