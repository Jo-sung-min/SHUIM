/** Directional cloud, sunset, star and moon colors for the beach sky. */
export const SKY_UNIFORMS = `
uniform sampler2D uPhoto;
uniform vec3 uPhotoTint;
uniform float uStars;
uniform float uStarMotion;
uniform float uTime;
uniform float uLantern;
uniform float uDeepNight;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uMoon;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uCloudAmount;
`;

export const SKY_FUNCTIONS = `
float beachSkyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float beachSkyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(beachSkyHash(i), beachSkyHash(i + vec2(1.0, 0.0)), f.x),
    mix(beachSkyHash(i + vec2(0.0, 1.0)), beachSkyHash(i + vec2(1.0)), f.x), f.y);
}
float skyNoise3D(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 low = fract(sin(n + vec4(0.0, 1.0, 57.0, 58.0)) * 43758.5453);
  vec4 high = fract(sin(n + vec4(113.0, 114.0, 170.0, 171.0)) * 43758.5453);
  return mix(mix(mix(low.x, low.y, f.x), mix(low.z, low.w, f.x), f.y),
    mix(mix(high.x, high.y, f.x), mix(high.z, high.w, f.x), f.y), f.z);
}

vec4 daylightSky(vec3 d, float clearBias) {
  float up = max(d.y, 0.0);
  float warm = clamp((uSkyHorizon.r - uSkyHorizon.b) * 1.8, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyTop,
    smoothstep(-0.015, mix(0.8, 0.38, warm), d.y));

  // Continuous 3D cloud density: no panorama edges, stretched UVs or pole cap.
  // Bounded noise scales make soft billows with finer, feathered edges.
  vec3 p = d * vec3(4.4, 6.0, 4.4) + vec3(uTime * 0.0018, 2.8, -1.7);
  float broad = skyNoise3D(p);
  float middle = skyNoise3D(p * 2.03 + 7.2);
  float density = broad * 0.46 + middle * 0.28 + skyNoise3D(p * 4.11 - 3.8) * 0.16
    + skyNoise3D(p * 8.27 + 12.3) * 0.075 + skyNoise3D(p * 16.3 - 9.2) * 0.025;
  float cover = 0.48 + clearBias - (uCloudAmount - 0.45) * 0.20;
  float cloud = smoothstep(cover, cover + 0.12, density);
  cloud *= (1.0 - 1.8 * clearBias) * smoothstep(0.015, 0.12, up) * mix(0.96, 0.74, warm);
  if (cloud > 0.001) {
    // Two offset density samples give the sun-facing billows soft relief;
    // this is a single sky pass, without volumetric marching or another scene.
    vec3 lightDirection = normalize(uSun + vec3(0.0, 0.4, 0.0));
    float lightDensity = skyNoise3D(p + lightDirection * 0.32);
    float lightDetail = skyNoise3D(p * 2.03 + 7.2 + lightDirection * 0.45);
    float light = clamp(0.60 + (broad - lightDensity) * 2.8 + (middle - lightDetail) * 0.7, 0.18, 1.0);
    vec3 shade = mix(uSkyHorizon * vec3(0.68, 0.75, 0.84), uCloudColor * 0.68, 0.5);
    vec3 cloudColor = mix(shade, uCloudColor, light);
    // After sunset only the lower billows retain amber light; high clouds fade
    // into the blue hour so the first stars have clear, dark space around them.
    vec3 eveningShade = mix(uSkyTop * 0.70, uCloudColor * 0.48, exp(-up * 3.0) * 0.42);
    vec3 eveningLight = uCloudColor * mix(0.50, 0.95, exp(-up * 4.0));
    cloudColor = mix(cloudColor, mix(eveningShade, eveningLight, light), warm);
    float rim = (1.0 - cloud) * max(0.0, broad - lightDensity) * 0.55;
    cloudColor += uSunColor * rim;
    sky = mix(sky, cloudColor, cloud);
  }
  float sunDistance = length(d - uSun);
  float sunDisc = 1.0 - smoothstep(0.009, 0.012, sunDistance);
  float sunHalo = exp(-sunDistance * sunDistance / 0.012) * 0.07;
  sky += uSunColor * (sunDisc * 0.65 + sunHalo)
    * smoothstep(-0.025, 0.05, uSun.y) * (1.0 - cloud * 0.82);
  return vec4(sky, cloud);
}
`;

export const SKY_FRAGMENT = `${SKY_UNIFORMS}
varying vec3 vDir;
${SKY_FUNCTIONS}
vec3 beachSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  float night = smoothstep(0.55, 1.0, uStars);
  vec3 col = mix(uSkyHorizon, uSkyTop, smoothstep(-0.025, 0.7, d.y));
  if (night < 1.0) {
    // The sun moves from +X at sunrise to -X at dusk. Ease into the afternoon cloud cover.
    float morning = smoothstep(-0.08, 0.35, uSun.x);
    vec3 day = daylightSky(d, mix(0.02, 0.15, morning)).rgb;
    col = mix(day, col, night);
  }

  // Let the distant water meet the sky palette right at the horizon, including at sunset.
  if (d.y < 0.0) {
    float azimuth = atan(d.x, -d.z);
    vec2 uv = vec2(azimuth / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
    vec2 coastUv = vec2(0.5 + sin(azimuth) * 0.12, max(0.54, uv.y));
    float seaFacing = smoothstep(0.12, 0.8, -d.z);
    vec3 coast = mix(textureLod(uPhoto, coastUv, 0.0).rgb, textureLod(uPhoto, uv, 0.0).rgb, seaFacing) * uPhotoTint;
    col = mix(coast, col, smoothstep(-0.02, 0.0, d.y));
  }

  if (uStars > 0.0 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 90.0;
    vec2 cell = floor(sp);
    float seed = beachSkyHash(cell);
    vec2 off = fract(sp) - 0.5 - (vec2(beachSkyHash(cell + 7.3), beachSkyHash(cell + 3.1)) - 0.5) * 0.6;
    float star = step(0.988, seed) * (1.0 - smoothstep(0.0, 0.16, length(off)));
    float twinkle = 0.88 + 0.12 * sin(uTime * 0.42 + seed * 60.0);
    col += star * twinkle * uStars * smoothstep(0.0, 0.16, d.y) * (0.46 + 0.38 * beachSkyHash(cell + 1.7));

    // A restrained tilted Milky Way: visible in the sky and water, never a global light.
    float bandDistance = abs(dot(d, normalize(vec3(0.82, -0.48, 0.3))));
    float band = exp(-pow(bandDistance / 0.15, 2.0));
    vec3 dustPoint = d * 6.0;
    float dust = skyNoise3D(dustPoint) * 0.62 + skyNoise3D(dustPoint * 2.03 + 7.2) * 0.38;
    float darkLane = smoothstep(0.48, 0.7, skyNoise3D(dustPoint * 1.8 + 12.0));
    vec3 galaxy = mix(vec3(0.08, 0.11, 0.19), vec3(0.22, 0.16, 0.23), dust);
    col += galaxy * band * (0.22 + dust * 0.65) * (1.0 - darkLane * 0.65)
      * uStars * smoothstep(0.02, 0.18, up) * 0.42;
  }
  float moonDistance = length(d - uMoon);
  float moonDisc = 1.0 - smoothstep(0.0075, 0.009, moonDistance);
  float moonHalo = exp(-moonDistance * moonDistance / 0.0018) * 0.018;
  col += vec3(0.85, 0.9, 1.0) * (moonDisc * 0.85 + moonHalo) * uStars * smoothstep(0.0, 0.12, d.y);
  if (uLantern > 0.0) {
    float low = 1.0 - smoothstep(-0.05, 0.5, d.y);
    float haze = skyNoise3D(d * vec3(2.5, 4.0, 2.5) + vec3(0.0, uTime * 0.015, 0.0));
    col += vec3(1.0, 0.52, 0.18) * uLantern * (0.035 + 0.1 * low)
      * (0.7 + 0.6 * haze) * mix(1.0, 0.08, uDeepNight);
  }
  return col;
}
void main() { gl_FragColor = vec4(beachSky(vDir), 1.0); }
`;
