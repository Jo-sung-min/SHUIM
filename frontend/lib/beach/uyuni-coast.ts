/** Radians measured from +Z, behind the open fronts of the two hotels. */
export const UYUNI_COAST_LAYOUT = {
  minElevation: -0.002,
  maxElevation: 0.07,
  edgeSoftness: 0.001,
  islands: [
    { azimuth: -0.67, halfWidth: 0.23, height: 0.032, seed: 3.1 },
    { azimuth: -0.04, halfWidth: 0.30, height: 0.052, seed: 8.7 },
    { azimuth: 0.60, halfWidth: 0.22, height: 0.025, seed: 15.2 },
  ],
} as const;

const glsl = (value: number) => value.toFixed(5);

/**
 * Insert after SKY_FUNCTIONS; requires beachSkyNoise, uSkyHorizon and uSunColor.
 * Call at the end of the shared uyuniSky function, so reflection uses the same
 * world directions. No texture, extra geometry, render pass or animated noise.
 */
export const UYUNI_COAST_FUNCTIONS = `
vec3 uyuniCoastIsland(float azimuth, float elevation, vec3 skyColor, float night,
    float center, float halfWidth, float peak, float seed) {
  float q = (azimuth - center) / halfWidth;
  float edge = 1.0 - smoothstep(0.86, 1.0, abs(q));
  // Broad overlapping shoulders break the single oval into a low asymmetric ridge.
  float broad = beachSkyNoise(vec2(q * 3.9 + seed, seed * 0.71));
  float detail = beachSkyNoise(vec2(q * 11.0 + seed * 3.7, 5.2));
  float leftDistance = (q + 0.50) / 0.23;
  float middleDistance = (q + 0.01) / 0.265;
  float rightDistance = (q - 0.51) / 0.24;
  float leftShoulder = 0.64 * exp(-leftDistance * leftDistance);
  float middleShoulder = 0.78 * exp(-middleDistance * middleDistance);
  float rightShoulder = 0.49 * exp(-rightDistance * rightDistance);
  float shoulders = leftShoulder + middleShoulder + rightShoulder;
  float ridge = peak * (0.1 * max(0.0, 1.0 - q * q) + shoulders)
    * (0.92 + 0.05 * broad + 0.03 * detail);
  float nearRidge = ridge * (0.36 + broad * 0.25 + detail * 0.09);
  float aa = ${glsl(UYUNI_COAST_LAYOUT.edgeSoftness)};
  float shoreFade = smoothstep(${glsl(UYUNI_COAST_LAYOUT.minElevation)}, -0.00035, elevation);
  float distantMask = edge * shoreFade * (1.0 - smoothstep(ridge - aa, ridge + aa, elevation));
  float nearMask = edge * shoreFade * (1.0 - smoothstep(nearRidge - aa * 2.7, nearRidge + aa * 2.7, elevation));

  // Air between viewer and island softens the daytime greens into blue grey.
  float terrain = beachSkyNoise(vec2(q * 19.0 + seed, elevation / max(peak, 0.001) * 8.0 + broad));
  float slope = -2.0 * ((q + 0.50) / 0.0529 * leftShoulder
    + (q + 0.01) / 0.070225 * middleShoulder + (q - 0.51) / 0.0576 * rightShoulder);
  float relief = clamp(slope * 0.016 + (terrain - 0.5) * 0.042, -0.045, 0.045);
  vec3 farDay = mix(uSkyHorizon, vec3(0.27, 0.37, 0.40), 0.46);
  vec3 nearDay = mix(uSkyHorizon, vec3(0.18, 0.29, 0.27), 0.56);
  farDay += vec3(relief * 0.65);
  nearDay += vec3(relief * 0.8, relief, relief * 0.85);
  nearDay += uSunColor * (0.008 + broad * 0.012);
  vec3 farNight = vec3(0.021, 0.036, 0.063) + uSkyHorizon * 0.025;
  vec3 nearNight = vec3(0.016, 0.029, 0.053) + uSkyHorizon * 0.02;
  vec3 color = mix(skyColor, mix(farDay, farNight, night), distantMask);
  color = mix(color, mix(nearDay, nearNight, night), nearMask * (0.44 + terrain * 0.18));

  // A narrow irregular beach is visible only inside each island's footprint.
  // Its subdued blue at night reads as reflected sky, not an illuminated rim.
  float shoreTop = 0.00115 + detail * 0.00055;
  float shore = 1.0 - smoothstep(shoreTop - aa * 0.45, shoreTop + aa * 0.45, elevation);
  vec3 sandDay = mix(vec3(0.76, 0.78, 0.70), uSkyHorizon, 0.38);
  vec3 sandNight = vec3(0.038, 0.063, 0.105);
  return mix(color, mix(sandDay, sandNight, night), shore * distantMask * 0.7);
}

vec3 uyuniCoast(vec3 direction, vec3 skyColor, float night) {
  vec3 d = normalize(direction);
  // Most pixels, including the front horizon and the galaxy reflected below
  // the viewer, leave before any coast noise or azimuth calculation.
  if (d.z <= 0.0 || d.y < ${glsl(UYUNI_COAST_LAYOUT.minElevation)}
      || d.y > ${glsl(UYUNI_COAST_LAYOUT.maxElevation)}) return skyColor;
  float azimuth = atan(d.x, d.z);
  float dark = clamp(night, 0.0, 1.0);
${UYUNI_COAST_LAYOUT.islands.map(island => `  if (abs(azimuth - ${glsl(island.azimuth)}) < ${glsl(island.halfWidth)})
    return uyuniCoastIsland(azimuth, d.y, skyColor, dark,
      ${glsl(island.azimuth)}, ${glsl(island.halfWidth)}, ${glsl(island.height)}, ${glsl(island.seed)});`).join("\n")}
  return skyColor;
}
`;
