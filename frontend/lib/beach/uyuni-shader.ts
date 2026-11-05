import { SKY_FUNCTIONS, SKY_UNIFORMS } from "./sky-shader";

/** One longitude convention for the sky and its water reflection; yaw is in radians. */
export const UYUNI_SKY_UNIFORMS = `${SKY_UNIFORMS}
uniform sampler2D uGalaxy;
uniform float uGalaxyReady;
uniform float uGalaxyYaw;
`;

export const UYUNI_SKY_FUNCTIONS = `${SKY_FUNCTIONS}
vec2 uyuniSkyUv(vec3 direction) {
  vec3 d = normalize(direction);
  return vec2(fract(atan(d.x, -d.z) / 6.2831853 + 0.5 + uGalaxyYaw / 6.2831853),
    asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
}

vec3 uyuniGalaxy(vec3 direction) {
  vec3 d = normalize(direction);
  vec2 uv = uyuniSkyUv(d);
  vec3 photo = textureLod(uGalaxy, uv, 0.0).rgb;
  // The generated panorama's ends differ slightly. Join only the last 9 degrees,
  // keeping the main Milky Way sharp and using the very same join in reflection.
  float seam = min(uv.x, 1.0 - uv.x);
  if (seam < 0.025) {
    vec3 edge = (textureLod(uGalaxy, vec2(0.001, uv.y), 0.0).rgb
      + textureLod(uGalaxy, vec2(0.999, uv.y), 0.0).rgb) * 0.5;
    photo = mix(edge, photo, smoothstep(0.0, 0.025, seam));
  }
  return mix(photo, vec3(0.018, 0.035, 0.095), smoothstep(0.97, 1.0, d.y));
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

  vec3 dark = mix(vec3(0.025, 0.035, 0.08), vec3(0.012, 0.022, 0.065), up);
  if (night > 0.0) {
    if (uGalaxyReady > 0.5) {
      dark = uyuniGalaxy(vec3(d.x, up, d.z));
    } else {
      // A quiet, complete sky remains visible while the image is loading.
      float band = exp(-pow(abs(dot(d, normalize(vec3(0.82, -0.48, 0.3)))) / 0.16, 2.0));
      float dust = beachSkyCloud(vec2(azimuth * 5.0, asin(up) * 6.0));
      dark += mix(vec3(0.055, 0.07, 0.18), vec3(0.27, 0.15, 0.3), dust)
        * band * (0.3 + dust * 0.65) * smoothstep(0.02, 0.2, up);
    }
    // Exactly the beach's existing star-cell distribution, with restrained twinkle.
    vec2 sp = d.xz / (up + 0.25) * 90.0;
    vec2 cell = floor(sp);
    float seed = beachSkyHash(cell);
    vec2 off = fract(sp) - 0.5 - (vec2(beachSkyHash(cell + 7.3), beachSkyHash(cell + 3.1)) - 0.5) * 0.6;
    float star = step(0.988, seed) * (1.0 - smoothstep(0.0, 0.16, length(off)));
    float twinkle = 0.88 + 0.12 * sin(uTime * 0.42 + seed * 60.0);
    dark += star * twinkle * smoothstep(0.0, 0.16, up)
      * (0.46 + 0.38 * beachSkyHash(cell + 1.7)) * mix(1.0, 0.32, uGalaxyReady);
    // Keep a quiet horizon without flattening the low Milky Way into a fog band.
    dark = mix(vec3(0.025, 0.035, 0.08), dark, smoothstep(-0.02, 0.035, d.y));
  }
  return mix(day, dark, night);
}
`;

export const UYUNI_SKY_FRAGMENT = `${UYUNI_SKY_UNIFORMS}
varying vec3 vDir;
${UYUNI_SKY_FUNCTIONS}
void main() { gl_FragColor = vec4(uyuniSky(vDir), 1.0); }
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
  gl_FragColor = vec4(color, 1.0);
}
`;
