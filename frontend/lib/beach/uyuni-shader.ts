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
  if (seed < threshold) return vec3(0.0);
  vec2 jitter = (vec2(beachSkyHash(cell + 7.3), beachSkyHash(cell + 3.1)) - 0.5) * 0.42;
  vec2 point = (cell + 0.5 + jitter - salt) / scale;
  float r2 = dot(point, point);
  float y = 1.0 - r2;
  float ring = sqrt(max(0.0, 2.0 - r2));
  vec3 starDirection = vec3(point.x * ring, y, point.y * ring);
  float brightness = beachSkyHash(cell + 1.7);
  float radius = mix(0.0007, 0.0015, brightness);
  float aa = max(footprint * 0.5, 0.00015);
  float distanceToStar = length(d - starDirection);
  float core = 1.0 - smoothstep(max(0.0, radius - aa), radius + aa, distanceToStar);
  float energy = radius * radius / (radius * radius + footprint * footprint * 0.12);
  float twinkle = 0.78 + 0.22 * sin(uTime * (0.42 + seed * 0.38) + seed * 60.0);
  // Only the light fluctuates. The star stays on the same world ray, including
  // its mirror image. Different phases let a few stars catch the eye at a time.
  vec3 viewAxis = vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z);
  float phase = brightness * 52.0 + dot(viewAxis, starDirection) * 18.0
    + dot(cameraPosition.xz, point) * 0.7;
  float pulse = smoothstep(0.48, 1.0, sin(phase + uTime * (1.3 + brightness)));
  float glint = uStarMotion * pulse * smoothstep(0.28, 0.82, brightness);
  float halo = 1.0 - smoothstep(0.0, radius * 2.25 + aa, distanceToStar);
  vec3 tint = mix(vec3(0.78, 0.87, 1.0), vec3(1.0, 0.90, 0.77), beachSkyHash(cell + 4.2));
  return tint * energy * (core * (twinkle + 0.76 * glint) + halo * 0.30 * glint)
    * (0.65 + 0.65 * brightness) * smoothstep(0.015, 0.14, d.y);
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
    float wisps = skyNoise3D(p * 9.7 + 13.2);
    float dust = skyNoise3D(p) * 0.45 + skyNoise3D(p * 2.1 + 7.4) * 0.30
      + skyNoise3D(p * 4.6 - 3.8) * 0.17 + wisps * 0.08;
    float laneNoise = skyNoise3D(p * 1.8 + vec3(12.0, 4.3, -7.1));
    float core = exp(-across * across / 0.0045);
    float darkLane = smoothstep(0.45, 0.72, laneNoise) * core;
    vec3 cloud = mix(vec3(0.10, 0.14, 0.24), vec3(0.25, 0.16, 0.26), dust);
    cloud *= band * (0.20 + dust * 0.95 + wisps * 0.22) * (1.0 - darkLane * 0.68);
    cloud += vec3(0.15, 0.17, 0.23) * core * smoothstep(0.38, 0.72, dust) * 0.36;
    dark += cloud * smoothstep(0.02, 0.18, up);
  }
  return dark + stars;
}

vec4 uyuniDay(vec3 d) {
  return daylightSky(d, 0.0);
}

vec3 uyuniSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  // Early stars sit above the orange afterglow. The full dark sky arrives later.
  float night = smoothstep(0.55, 1.0, uStars);
  vec4 day = vec4(0.0);
  if (night < 1.0) {
    day = uyuniDay(d);
    if (uStars > 0.0) {
      vec3 firstStars = uyuniStars(d, 220.0, 0.988, 0.0)
        + uyuniStars(d, 70.0, 0.992, 19.7) * 0.85;
      day.rgb += firstStars * uStars * smoothstep(0.08, 0.34, up) * (1.0 - day.a * 0.92);
    }
  }

  vec3 dark = night > 0.0 ? uyuniNight(d) : vec3(0.0);
  vec3 sky = uyuniHorizonAir(mix(day.rgb, dark, night), d, night);
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
    float night = smoothstep(0.55, 1.0, uStars);
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
  float night = smoothstep(0.55, 1.0, uStars);
  float mirrorNight = smoothstep(0.02, 0.42, uStars);
  vec3 grain = texture2D(uSand, fract(p * 0.18)).rgb;
  vec3 salt = mix(vec3(0.94, 0.955, 0.98), grain, 0.36) * uSandTint;
  float nearFeet = 1.0 - smoothstep(0.8, 5.2, length(p - uWalker));
  float reflectionAmount = mix(0.58 + fresnel * 0.4, 0.91 + fresnel * 0.08, mirrorNight);
  reflectionAmount -= nearFeet * mix(0.15, 0.025, mirrorNight);
  reflectionAmount *= 1.0 - dry;
  // The visible salt floor is only centimetres below the surface. No second
  // transparent plane, render target, depth read, blur pass or avatar reflection.
  vec3 color = mix(salt, reflection, clamp(reflectionAmount, 0.0, 1.0));
  color += vec3(0.35, 0.43, 0.55) * rings * (1.0 - dry) * mix(0.45, 0.2, night);
  color = uyuniWaterHorizon(color, incoming, night);
  gl_FragColor = vec4(color, 1.0);
}
`;
