import { UYUNI_SKY_UNIFORMS, UYUNI_SKY_FUNCTIONS } from "./uyuni-shader";

export const CLOUD_SPA_SKY_UNIFORMS = UYUNI_SKY_UNIFORMS;

/** Direction-based stars and moon remain crisp at every camera angle; the city is real geometry below. */
export const CLOUD_SPA_SKY_FUNCTIONS = `${UYUNI_SKY_FUNCTIONS}
vec3 cloudSpaSky(vec3 direction) {
  vec3 d = normalize(direction);
  float night = smoothstep(0.25, 0.95, uStars);
  if (d.y < 0.0) {
    float depth = smoothstep(0.0, 0.65, -d.y);
    vec3 lowDay = mix(uSkyHorizon * 0.75, vec3(0.29, 0.38, 0.50), depth);
    vec3 lowNight = mix(vec3(0.055, 0.075, 0.12), vec3(0.009, 0.017, 0.035), depth);
    return mix(lowDay, lowNight, night);
  }
  vec3 day = vec3(0.0);
  if (night < 1.0) day = daylightSky(d, 0.28).rgb;
  vec3 stars = uyuniNight(d);
  float angle = length(d - normalize(uMoon));
  float aa = max(fwidth(angle), 0.00015);
  float disc = 1.0 - smoothstep(0.020 - aa, 0.020 + aa, angle);
  float pits = skyNoise3D(d * 670.0 + 41.0) * 0.15 + skyNoise3D(d * 260.0) * 0.15;
  vec3 moon = vec3(0.89, 0.91, 0.96) * (0.79 + pits) * disc;
  moon += vec3(0.21, 0.30, 0.48) * exp(-angle * angle / 0.0065) * 0.34;
  stars += moon * smoothstep(-0.025, 0.08, d.y);
  // Open, level haze above the cloud ocean; no panoramic image is stretched into a dome.
  float horizon = 1.0 - smoothstep(0.0, 0.14, d.y);
  stars = mix(stars, vec3(0.065, 0.085, 0.14), horizon * 0.56);
  return mix(day, stars, night);
}
`;

export const CLOUD_SPA_SKY_FRAGMENT = `${CLOUD_SPA_SKY_UNIFORMS}
varying vec3 vDir;
${CLOUD_SPA_SKY_FUNCTIONS}
void main() { gl_FragColor = vec4(cloudSpaSky(vDir), 1.0); }
`;
