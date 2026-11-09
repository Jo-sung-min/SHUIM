import { UYUNI_SKY_FUNCTIONS, UYUNI_SKY_UNIFORMS } from "./uyuni-shader";

/** The shared sky palette plus the storm strength; the ice, the hummocks and the sky dome all read the same set. */
export const BAIKAL_SKY_UNIFORMS = `${UYUNI_SKY_UNIFORMS}
uniform float uStorm;
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
  float far = 0.012 + broad * 0.034 * (0.6 + 0.7 * west) + detail * 0.010;
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
  return color;
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
