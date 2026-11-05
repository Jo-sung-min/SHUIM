import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { Daylight } from "./daylight";
import { BAMBOO_PAVILIONS } from "./bamboo-trail";

const deck = BAMBOO_PAVILIONS.find(pavilion => pavilion.kind === "deck")!;
const riverImage = "/beach/real/bamboo-summit-seoul-v4.webp";
const viewArc = THREE.MathUtils.degToRad(134);
const skylineV = 0.648; // Distant ridgeline in texture coordinates; the towers extend into the real sky.

/** Project the photograph onto the valley below the deck. Near water lies on a level
 * plane; the upper shoreline and distant roofs rise only once the valley reaches the horizon. */
function riverGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 240, 48);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const ridges = new Float32Array(position.count * 3);
  const eye = deck.floorY + 1.25;
  const riverDrop = 31;
  for (let i = 0; i < position.count; i++) {
    const angle = (0.5 - uv.getX(i)) * Math.PI * 2;
    const v = uv.getY(i);
    // Periodic profiles meet behind the deck; only their silhouettes reach the sky.
    ridges[i * 3] = 0.619 + 0.027 * Math.sin(angle * 4 + 0.5) + 0.015 * Math.cos(angle * 9)
      + 0.007 * Math.sin(angle * 18 + 1.2);
    ridges[i * 3 + 1] = 0.474 + 0.048 * Math.cos(angle * 3 + 0.8) + 0.028 * Math.sin(angle * 8)
      + 0.012 * Math.sin(angle * 14);
    ridges[i * 3 + 2] = 0.231 + 0.084 * Math.sin(angle * 2 - 0.7) + 0.042 * Math.cos(angle * 5 + 0.5)
      + 0.019 * Math.sin(angle * 11);
    uv.setX(i, 0.54 - angle / viewArc);
    const slope = (v - skylineV) * 0.49 + 0.028;
    // Intersect this view ray with the river surface, bounding the furthest bank
    // inside the camera range. One continuous mesh gives lateral movement real depth.
    const range = riverDrop / Math.max(-slope, riverDrop / 350);
    position.setXYZ(i, deck.x + range * Math.sin(angle), eye + range * slope,
      deck.z + 2 + range * Math.cos(angle));
  }
  geometry.setAttribute("aRidges", new THREE.BufferAttribute(ridges, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildBambooOverlook(parent: THREE.Group, time: THREE.IUniform<number>) {
  const group = new THREE.Group();
  group.name = "bamboo-overlook";
  parent.add(group);
  let disposed = false;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRiver: { value: null },
      uNight: { value: 0 },
      uHaze: { value: new THREE.Color() },
      uTime: time,
    },
    vertexShader: `attribute vec3 aRidges;
      varying vec2 vUv; varying vec3 vRidges;
      void main() {
        vUv = uv;
        vRidges = aRidges;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform sampler2D uRiver;
      uniform float uNight; uniform float uTime; uniform vec3 uHaze;
      varying vec2 vUv; varying vec3 vRidges;
      float cellPhase(vec2 cell) {
        return fract(sin(dot(cell, vec2(17.73, 51.19))) * 4375.85);
      }
      vec3 cityColor(vec2 uv, vec4 art) {
        float x = uv.x;
        float luminance = dot(art.rgb, vec3(0.2126, 0.7152, 0.0722));
        float value = sqrt(luminance);
        vec3 day = uHaze * (0.30 + 0.60 * value) + art.rgb * 0.11;
        vec3 color = mix(day, art.rgb, smoothstep(0.0, 0.92, uNight));
        if (uNight > 0.02) {
          // Select already-lit windows and lamps by contrast with their local
          // surroundings. Phase is anchored to the panorama as the camera moves.
          vec3 vicinity = textureLod(uRiver, uv, 3.5).rgb;
          float peak = max(art.r, max(art.g, art.b));
          float contrast = max(max(art.r - vicinity.r, art.g - vicinity.g), art.b - vicinity.b);
          // The dim blue ridges recede into the night. Isolated illuminated
          // windows and towers keep their colour against the dark silhouette.
          float ridge = smoothstep(0.545, 0.634, uv.y)
            * smoothstep(0.023, 0.085, art.b - min(art.r, art.g))
            * (1.0 - smoothstep(0.058, 0.15, luminance))
            * (1.0 - smoothstep(0.019, 0.070, contrast));
          vec3 distantRock = vec3(0.003, 0.0055, 0.0085) + luminance * vec3(0.034, 0.052, 0.072);
          color = mix(color, distantRock, ridge * smoothstep(0.06, 0.92, uNight));
          float light = smoothstep(0.11, 0.66, peak) * smoothstep(0.025, 0.20, contrast);
          float phase = cellPhase(floor(uv * vec2(300.0, 132.0)));
          float wave = 0.5 + 0.5 * sin(uTime * (1.45 + phase * 2.5) + phase * 45.0);
          float twinkle = 1.22 * pow(wave, 4.0) - 0.24;
          // Only the strip of reflections below the main bridge undulates.
          float belowBridge = 0.13 + (x - 0.52) * 0.44 - uv.y;
          float water = smoothstep(0.54, 0.73, x) * smoothstep(0.004, 0.033, belowBridge)
            * (1.0 - smoothstep(0.17, 0.27, belowBridge));
          float ripple = 0.40 * sin(uv.y * 186.0 + uTime * 1.65 + sin(x * 61.0 + uTime * 0.38));
          color += art.rgb * uNight * mix(light * twinkle, smoothstep(0.08, 0.48, peak) * ripple, water);
        }
        return color;
      }
      void main() {
        vec2 uv = vUv;
        float angle = abs(0.54 - uv.x) * ${viewArc.toFixed(8)};
        float city = 1.0 - smoothstep(radians(42.0), radians(60.0), angle);
        float softEdge = max(0.004, fwidth(uv.y));
        vec3 layers = 1.0 - smoothstep(vRidges - softEdge, vRidges + softEdge, vec3(uv.y));
        vec3 dayRidge = uHaze * mix(0.69, 0.43, layers.y) * mix(1.0, 0.73, layers.z);
        vec3 nightRidge = mix(vec3(0.008, 0.012, 0.021), vec3(0.005, 0.008, 0.013), layers.y);
        nightRidge = mix(nightRidge, vec3(0.003, 0.005, 0.008), layers.z);
        vec3 valley = mix(dayRidge, nightRidge, smoothstep(0.0, 0.92, uNight));
        float valleyAlpha = layers.x * (1.0 - city);
        vec3 color = valley * valleyAlpha;
        float alpha = valleyAlpha;
        if (city > 0.0) {
          vec4 art = texture2D(uRiver, clamp(uv, 0.0, 1.0));
          float cityAlpha = city * smoothstep(0.045, 0.92, art.a);
          color += cityColor(uv, art) * cityAlpha;
          alpha += cityAlpha;
        }
        if (alpha < 0.005) discard;
        color /= alpha;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, toneMapped: false,
  });
  const river = new THREE.Mesh(riverGeometry(), material);
  river.name = "bamboo-city";
  river.visible = false;
  river.renderOrder = 1;
  group.add(river);
  const loader = assetLoader(new THREE.TextureLoader());
  const texture = loader.load(assetUrl(riverImage), () => { if (!disposed) river.visible = true; });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  material.uniforms.uRiver.value = texture;
  const fog = new THREE.Color();
  return {
    applyDaylight(light: Daylight) {
      material.uniforms.uNight.value = light.stars;
      fog.setRGB(...light.fog, THREE.SRGBColorSpace);
      material.uniforms.uHaze.value.setRGB(...light.skyHorizon, THREE.SRGBColorSpace).lerp(fog, 0.62);
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      river.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
