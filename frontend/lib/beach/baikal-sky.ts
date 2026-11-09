import { UYUNI_SKY_FUNCTIONS, UYUNI_SKY_UNIFORMS } from "./uyuni-shader";

/** The shared sky palette plus the storm strength; the ice, the hummocks and the sky dome all read the same set. */
export const BAIKAL_SKY_UNIFORMS = `${UYUNI_SKY_UNIFORMS}
uniform float uStorm;
uniform float uAurora;
`;

/**
 * Winter sky over the frozen lake: daylight clouds or the galaxy, a blizzard veil that thickens towards the horizon,
 * and a ring of snowy ridges drawn by direction only (no geometry), so the ice reflects them for free.
 */
export const BAIKAL_SKY_FUNCTIONS = `${UYUNI_SKY_FUNCTIONS}
// Villages strung along the far shore: warm dots on the dark hills, gathered in clusters, some close enough to bloom into soft discs.
vec3 baikalShoreLights(vec3 d, float ridge, float night, float storm) {
  if (night < 0.02 || d.y < 0.0005 || d.y > ridge) return vec3(0.0);
  float azimuth = atan(d.x, d.z);
  float village = smoothstep(0.42, 0.74, beachSkyNoise(vec2(azimuth * 3.4, 3.7)) * 0.7 + beachSkyNoise(vec2(azimuth * 11.0, 8.4)) * 0.3);
  if (village <= 0.0) return vec3(0.0);
  vec3 lights = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float f = float(layer), scale = 150.0 + f * 95.0, radius = 0.09 + 0.1 * (2.0 - f) * 0.5;
    vec2 q = vec2(azimuth * scale, d.y * scale * 2.0 + f * 7.1);
    vec2 cell = floor(q), own = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3))) + f) * 43758.5453);
    if (own.x > 0.34 + 0.2 * village) continue;
    float dist = length(q - cell - 0.25 - own * 0.5) / radius;
    float disc = 1.0 - smoothstep(0.55, 1.0, dist);
    float twinkle = 0.82 + 0.18 * sin(uTime * (1.1 + own.y * 2.0) + own.x * 40.0);
    vec3 tint = mix(vec3(1.0, 0.58, 0.2), vec3(1.0, 0.8, 0.5), own.y);
    lights += tint * disc * twinkle * (0.5 + f * 0.25);
  }
  return lights * village * night * (1.0 - storm * 0.72) * smoothstep(0.0005, 0.004, d.y);
}

vec3 baikalRidges(vec3 d, vec3 sky, float night, float storm) {
  if (d.y < -0.003 || d.y > 0.1) return sky;
  float azimuth = atan(d.x, d.z);
  vec2 ring = vec2(cos(azimuth), sin(azimuth));
  float broad = beachSkyNoise(ring * 2.6 + 11.3);
  float detail = beachSkyNoise(ring * 7.1 + 3.7);
  float fine = beachSkyNoise(ring * 19.0 + 8.2);
  // A far range all around, higher behind the cabin (west) and lower over the open lake (east).
  float west = smoothstep(0.4, -0.6, d.x);
  float far = 0.016 + broad * 0.044 * (0.86 + 0.44 * west) + detail * 0.012;
  float near = (0.004 + detail * 0.016 + fine * 0.005) * smoothstep(0.1, -0.5, d.x);
  float aa = max(fwidth(d.y), 0.0006);
  float farMask = 1.0 - smoothstep(far - aa, far + aa, d.y);
  float nearMask = 1.0 - smoothstep(near - aa, near + aa, d.y);
  float slopeLight = smoothstep(0.25, 0.9, beachSkyNoise(ring * 13.0 + d.y * 70.0));
  float sunSide = 0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSun.x, 0.0, uSun.z) + vec3(1e-4)));
  vec3 farDay = mix(mix(uSkyHorizon, vec3(0.50, 0.60, 0.74), 0.55), vec3(0.94, 0.96, 0.99), slopeLight * (0.35 + 0.35 * sunSide));
  farDay += uSunColor * 0.06 * sunSide * max(0.0, 1.0 - uSun.y * 3.0);
  vec3 farNight = vec3(0.05, 0.07, 0.12) + uSkyHorizon * 0.08;
  vec3 nearDay = mix(vec3(0.40, 0.48, 0.60), vec3(0.88, 0.91, 0.95), slopeLight * 0.45);
  vec3 nearNight = vec3(0.035, 0.05, 0.085);
  float visibility = (1.0 - storm * 0.88) * (1.0 - smoothstep(0.03, 0.1, d.y) * 0.0);
  vec3 color = mix(sky, mix(farDay, farNight, night), farMask * visibility * 0.92);
  color = mix(color, mix(nearDay, nearNight, night), nearMask * (1.0 - storm * 0.7) * 0.95);
  color += baikalShoreLights(d, far, night, storm) * farMask;
  return color;
}

// Three angular curtains, evaluated in the same sky function for both sky and ice.
// No dome image stretching, raymarch pass or extra translucent full-screen layers.
vec3 baikalAurora(vec3 d) {
  if (uAurora < 0.001 || d.y < 0.035 || d.y > 0.72 || d.x < 0.03) return vec3(0.0);
  float angle = atan(d.z, d.x);
  float elevation = asin(clamp(d.y, 0.0, 1.0));
  float east = 1.0 - smoothstep(0.65, 1.45, abs(angle));
  vec3 light = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float layer = float(i), t = uTime * 0.055;
    float wave = sin(angle * 3.6 + t + layer * 1.9) * 0.043
      + sin(angle * 7.2 - t * 0.6 + layer) * 0.017;
    float base = 0.115 + layer * 0.062 + wave;
    float height = elevation - base;
    float bottom = smoothstep(-0.012, 0.022, height);
    float tail = exp(-max(height, 0.0) * (9.5 - layer));
    float folds = 0.58 + 0.24 * sin(angle * 28.0 + sin(angle * 6.0 + t) * 2.0 - t * 1.4 + layer * 4.0)
      + 0.18 * sin(angle * 67.0 + t * 0.7 + layer * 7.0);
    float rays = 0.78 + 0.22 * sin(angle * 157.0 + sin(angle * 9.0 + t) * 3.0);
    float breath = 0.88 + 0.12 * sin(t * 0.8 + angle * 3.0 + layer);
    float body = bottom * tail * max(folds, 0.08) * rays * breath;
    vec3 green = vec3(0.08, 0.85, 0.57), violet = vec3(0.45, 0.18, 0.65);
    vec3 color = mix(green, violet, smoothstep(0.07, 0.30, height) * 0.8);
    color += vec3(0.10, 0.23, 0.15) * exp(-abs(height) * 95.0);
    light += color * body * (0.63 - layer * 0.12);
  }
  return light * east * uAurora;
}

vec3 baikalSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  float night = smoothstep(0.55, 1.0, uStars);
  float storm = clamp(uStorm, 0.0, 1.0);
  vec4 day = vec4(0.0);
  if (night < 1.0) {
    day = daylightSky(d, 0.0);
    if (uStars > 0.0) {
      vec3 firstStars = uyuniStars(d, 220.0, 0.988, 0.0) + uyuniStars(d, 70.0, 0.992, 19.7) * 0.85;
      day.rgb += firstStars * uStars * smoothstep(0.08, 0.34, up) * (1.0 - day.a * 0.92) * (1.0 - storm * 0.8);
    }
  }
  vec3 dark = vec3(0.0);
  if (night > 0.0) {
    // Driving snow hides the stars long before it hides the moon.
    dark = uyuniNight(d) * (1.0 - storm * 0.93);
    float angle = length(d - normalize(uMoon));
    float aa = max(fwidth(angle), 0.00015);
    float disc = 1.0 - smoothstep(0.019 - aa, 0.019 + aa, angle);
    float pits = skyNoise3D(d * 670.0 + 41.0) * 0.15 + skyNoise3D(d * 260.0) * 0.15;
    vec3 moon = vec3(0.90, 0.92, 0.97) * (0.80 + pits) * disc;
    moon += vec3(0.24, 0.33, 0.52) * exp(-angle * angle / 0.0085) * (0.34 + storm * 0.5);
    dark += moon * smoothstep(-0.025, 0.08, d.y) * (1.0 - storm * 0.6);
  }
  vec3 sky = mix(day.rgb, dark, night);
  // The storm veil: a luminous white-grey by day, slate blue at night, always thickest at the horizon.
  vec3 veilDay = mix(uSkyHorizon, vec3(0.88, 0.91, 0.95), 0.62);
  vec3 veilNight = vec3(0.11, 0.14, 0.20);
  vec3 veil = mix(veilDay, veilNight, night);
  float veilAmount = storm * (0.65 + 0.35 * (1.0 - smoothstep(0.0, 0.55, up)));
  sky = mix(sky, veil, veilAmount);
  sky += baikalAurora(d) * night * (1.0 - storm * 0.9);
  sky = uyuniHorizonAir(sky, d, night);
  return baikalRidges(d, sky, night, storm);
}
`;

export const BAIKAL_SKY_FRAGMENT = `${BAIKAL_SKY_UNIFORMS}
varying vec3 vDir;
${BAIKAL_SKY_FUNCTIONS}
void main() {
  vec3 d = normalize(vDir);
  vec3 color;
  if (d.y >= 0.0) {
    color = baikalSky(d);
  } else {
    // Past the end of the ice sheet the frozen lake keeps mirroring the sky, a little darker and bluer.
    float night = smoothstep(0.55, 1.0, uStars);
    color = uyuniWaterHorizon(baikalSky(vec3(d.x, -d.y, d.z)), d, night) * vec3(0.86, 0.92, 1.0);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;
