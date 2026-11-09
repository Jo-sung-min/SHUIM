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
  vec3 farNight = mix(vec3(0.075, 0.07, 0.2), vec3(0.17, 0.12, 0.32), slopeLight * 0.6);
  vec3 nearDay = mix(vec3(0.40, 0.48, 0.60), vec3(0.88, 0.91, 0.95), slopeLight * 0.45);
  vec3 nearNight = vec3(0.04, 0.042, 0.13);
  float visibility = (1.0 - storm * 0.88) * (1.0 - smoothstep(0.03, 0.1, d.y) * 0.0);
  vec3 color = mix(sky, mix(farDay, farNight, night), farMask * visibility * 0.92);
  color = mix(color, mix(nearDay, nearNight, night), nearMask * (1.0 - storm * 0.7) * 0.95);
  return color;
}

// A storybook aurora. Four ribbons with a bright mint hem, melting upward through aqua into orchid and rose.
// A soft veil of it hangs over every clear night; reaching the last shelter opens the whole show.
vec3 baikalAurora(vec3 d) {
  if (d.y < 0.015) return vec3(0.0);
  float angle = atan(d.z, d.x);
  float elevation = asin(clamp(d.y, 0.0, 1.0));
  float broad = 0.32 + 0.68 * (1.0 - smoothstep(0.7, 2.7, abs(angle)));
  float t = uTime * 0.075;
  vec3 light = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float layer = float(i);
    float sway = sin(angle * 2.3 + t + layer * 1.7) * 0.075 + sin(angle * 5.1 - t * 1.4 + layer * 2.9) * 0.036 + sin(angle * 11.0 + t * 0.8 + layer) * 0.013;
    float height = elevation - (0.1 + layer * 0.082 + sway);
    float hem = smoothstep(-0.02, 0.012, height);
    float tail = exp(-max(height, 0.0) * (5.0 - layer * 0.5));
    float folds = 0.6 + 0.4 * sin(angle * (31.0 + layer * 9.0) + sin(angle * 4.0 + t) * 3.2 - t * 2.1 + layer * 5.0);
    float threads = 0.86 + 0.14 * sin(angle * 170.0 + sin(angle * 11.0 - t) * 4.0);
    float flow = 0.68 + 0.32 * sin(angle * 1.7 - t * 1.6 + layer * 2.2);
    vec3 low = mix(vec3(0.2, 1.0, 0.7), vec3(0.24, 0.84, 1.0), layer / 3.0);
    vec3 high = mix(vec3(0.68, 0.3, 1.0), vec3(1.0, 0.38, 0.74), layer / 3.0);
    vec3 color = mix(low, high, smoothstep(0.02, 0.26, height)) + vec3(0.72, 1.0, 0.86) * exp(-abs(height) * 110.0) * 0.5;
    light += color * hem * tail * folds * threads * flow * (0.6 - layer * 0.085);
  }
  return light * broad * mix(0.42, 1.25, uAurora);
}

// Large soft stars on a cube of cells. Each is several pixels wide, so none of them shimmers as the view turns.
vec3 baikalBigStars(vec3 d) {
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.y >= a.x && a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 1.0 : 2.0; }
  else if (a.x >= a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 3.0 : 4.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 5.0 : 6.0; }
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float layer = float(i), scale = 15.0 + layer * 24.0;
    vec2 g = uv * scale + face * 11.3 + layer * 37.1;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    vec2 own = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
    if (own.x > 0.3 - layer * 0.07) continue;
    vec2 p = (f - (own.yx - 0.5) * 0.62) * (1.0 + layer * 0.5);
    float r2 = dot(p, p), breath = 0.78 + 0.22 * sin(uTime * (0.35 + own.y * 0.7) + own.x * 60.0);
    float core = exp(-r2 * 1500.0), halo = exp(-r2 * 150.0) * 0.2;
    float spark = i == 0 ? (exp(-abs(p.x) * 75.0) * exp(-p.y * p.y * 240.0) + exp(-abs(p.y) * 75.0) * exp(-p.x * p.x * 240.0)) * 0.55 : 0.0;
    vec3 tint = mix(vec3(0.72, 0.84, 1.0), mix(vec3(1.0, 0.82, 0.62), vec3(1.0, 0.74, 0.94), own.x * 3.0), own.y);
    sum += tint * (core + halo + spark) * breath * (1.05 - layer * 0.24);
  }
  return sum;
}

// A painted night: ink overhead, plum in the middle, a rose and aqua glow along the horizon, a pastel river of stars across it all.
vec3 baikalDreamNight(vec3 d) {
  float up = max(d.y, 0.0);
  vec3 sky = mix(vec3(0.34, 0.2, 0.46), vec3(0.13, 0.11, 0.36), smoothstep(0.0, 0.2, up));
  sky = mix(sky, vec3(0.03, 0.04, 0.16), smoothstep(0.14, 0.82, up));
  sky += vec3(0.16, 0.36, 0.42) * exp(-up * 24.0) * 0.55;
  vec3 axis = normalize(vec3(0.5, 0.42, -0.76));
  float across = dot(d, axis), band = exp(-across * across * 13.0);
  vec3 q = d * 2.7;
  float cloud = skyNoise3D(q + 4.1) * 0.5 + skyNoise3D(q * 2.1 + 9.3) * 0.32 + skyNoise3D(q * 4.6 - 2.2) * 0.18;
  float dust = smoothstep(0.34, 0.74, cloud);
  sky += mix(vec3(0.42, 0.18, 0.62), vec3(0.18, 0.56, 0.78), smoothstep(0.35, 0.72, skyNoise3D(q * 1.4 + 20.0))) * band * dust * 0.62;
  sky += vec3(0.7, 0.6, 0.85) * pow(band, 3.0) * dust * dust * 0.2;
  // Fine stars gather along the river; the big ones are everywhere.
  sky += uyuniStars(d, 240.0, 0.972 - band * 0.05, 3.1) * (0.8 + band * 1.2);
  sky += baikalBigStars(d) * smoothstep(0.0, 0.1, up);
  // A shooting star now and then.
  float clock = uTime * 0.11, shot = floor(clock), f = fract(clock);
  if (f < 0.16 && d.y > 0.12) {
    vec2 seed = fract(sin(vec2(shot * 91.3, shot * 47.7)) * 4375.5453);
    vec2 p = d.xz / (d.y + 0.35), a = (seed - 0.5) * 2.4, heading = normalize(vec2(cos(seed.x * 6.28), sin(seed.x * 6.28)));
    float life = f / 0.16, along = dot(p - a, heading), off = length(p - a - heading * along);
    float head = life * 0.9;
    float streak = smoothstep(head - 0.42, head, along) * (1.0 - smoothstep(head, head + 0.008, along)) * exp(-off * off * 42000.0);
    sky += vec3(0.95, 0.98, 1.0) * streak * smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.7, 1.0, life)) * 1.6;
  }
  return sky;
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
    dark = baikalDreamNight(d) * (1.0 - storm * 0.34);
    float angle = length(d - normalize(uMoon));
    float aa = max(fwidth(angle), 0.00015);
    float disc = 1.0 - smoothstep(0.03 - aa, 0.03 + aa, angle);
    float pits = skyNoise3D(d * 300.0 + 41.0) * 0.1 + skyNoise3D(d * 120.0) * 0.1;
    vec3 moon = vec3(1.0, 0.95, 0.84) * (0.86 + pits) * disc;
    // Two soft rings of moonlight, the wide one tinted like the sky around it.
    moon += vec3(0.62, 0.56, 0.72) * exp(-angle * angle / 0.009) * 0.42 + vec3(0.3, 0.32, 0.62) * exp(-angle * angle / 0.09) * 0.26;
    dark += moon * smoothstep(-0.025, 0.08, d.y);
  }
  vec3 sky = mix(day.rgb, dark, night);
  // The storm veil: a luminous white-grey by day, slate blue at night, always thickest at the horizon.
  vec3 veilDay = mix(uSkyHorizon, vec3(0.88, 0.91, 0.95), 0.62);
  vec3 veilNight = vec3(0.11, 0.14, 0.20);
  vec3 veil = mix(veilDay, veilNight, night);
  float veilAmount = storm * (0.65 + 0.35 * (1.0 - smoothstep(0.0, 0.55, up))) * mix(0.42, 0.1, night);
  sky = mix(sky, veil, veilAmount);
  sky += baikalAurora(d) * night * (1.0 - storm * 0.4);
  // Day keeps its hazy horizon. The painted night has its own.
  sky = mix(uyuniHorizonAir(sky, d, 0.0), sky, night);
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
