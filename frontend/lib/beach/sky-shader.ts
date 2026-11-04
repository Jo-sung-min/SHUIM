/** Directional cloud, sunset, star and moon colors for the beach sky. */
export const SKY_UNIFORMS = `
uniform sampler2D uPhoto;
uniform vec3 uPhotoTint;
uniform float uStars;
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
float beachSkyCloud(vec2 p) {
  return beachSkyNoise(p) * 0.54 + beachSkyNoise(p * 2.03 + 7.2) * 0.28
    + beachSkyNoise(p * 4.11 - 3.8) * 0.12 + beachSkyNoise(p * 8.27 + 12.3) * 0.06;
}
vec3 beachSky(vec3 direction) {
  vec3 d = normalize(direction);
  float up = max(d.y, 0.0);
  float azimuth = atan(d.x, -d.z);
  vec2 uv = vec2(azimuth / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec2 skyUv = vec2(0.5 + sin(azimuth) * 0.12, max(0.54, uv.y));
  float seaFacing = smoothstep(0.12, 0.8, -d.z);
  vec3 photo = mix(texture2D(uPhoto, skyUv).rgb, texture2D(uPhoto, uv).rgb, seaFacing) * uPhotoTint;
  vec3 gradient = mix(uSkyHorizon, uSkyTop, smoothstep(-0.025, 0.7, d.y));
  float warmHour = clamp((uSkyHorizon.r - uSkyHorizon.b) * 2.3, 0.0, 1.0);
  float skyMask = smoothstep(-0.025, 0.06, d.y);
  vec3 col = mix(photo, gradient, skyMask * (0.16 + warmHour * 0.72));
  col = mix(col, gradient, uStars * skyMask * mix(0.58, 0.88, uDeepNight));

  // Broad, quiet cloud banks continue into their reflection without a second scene render.
  vec2 cloudPoint = d.xz / (up + 0.32) * 1.55 + vec2(uTime * 0.0018, 0.0);
  float cloudNoise = beachSkyCloud(cloudPoint);
  float cloud = smoothstep(0.57 - uCloudAmount * 0.12, 0.77, cloudNoise);
  cloud *= smoothstep(0.015, 0.12, up) * (1.0 - smoothstep(0.72, 0.98, up)) * (1.0 - uStars * 0.92);
  vec3 cloudColor = uCloudColor * (0.82 + cloudNoise * 0.18);
  col = mix(col, cloudColor, cloud * 0.74);

  float sunDistance = length(d - uSun);
  float sunDisc = 1.0 - smoothstep(0.009, 0.012, sunDistance);
  float sunHalo = exp(-sunDistance * sunDistance / 0.012) * 0.07;
  col += uSunColor * (sunDisc * 0.65 + sunHalo) * smoothstep(-0.025, 0.05, uSun.y) * skyMask;

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
    vec2 dustPoint = vec2(azimuth * 5.0, asin(up) * 6.0);
    float dust = beachSkyCloud(dustPoint);
    float darkLane = smoothstep(0.48, 0.7, beachSkyCloud(dustPoint * 1.8 + 12.0));
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
    float haze = beachSkyNoise(vec2(azimuth * 2.5, d.y * 4.0 + uTime * 0.015));
    col += vec3(1.0, 0.52, 0.18) * uLantern * (0.035 + 0.1 * low)
      * (0.7 + 0.6 * haze) * mix(1.0, 0.08, uDeepNight);
  }
  return col;
}
`;

export const SKY_FRAGMENT = `${SKY_UNIFORMS}
varying vec3 vDir;
${SKY_FUNCTIONS}
void main() { gl_FragColor = vec4(beachSky(vDir), 1.0); }
`;
