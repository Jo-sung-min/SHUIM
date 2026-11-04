import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { FireworkEvent } from "./net";

export const FIREWORK_SPARK_URL = "/beach/fx/firework-spark-v1.webp";
const PALETTE = [0xffc777, 0xff83b1, 0x87eaff, 0xb89aff, 0x95ffd1, 0xffb88c];
const CENTERS = [[-13, 40, -62], [14, 49, -77], [-3, 56, -83], [5, 64, 9]];
const STARTS = [1.4, 3.25, 5.2, 7.0];

/** Seeded GPU trajectories let every visitor see the same show at its current age. */
export function fireworkGeometry(seed: number, mobile = false) {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const origin: number[] = [], velocity: number[] = [], color: number[] = [], timing: number[] = [], detail: number[] = [];
  const tint = new THREE.Color();
  const spokes = mobile ? 84 : 140, tails = mobile ? 4 : 6;
  const add = (burst: number, dx: number, dy: number, dz: number, delay: number, life: number, size: number, mode: number, hue: number, alpha: number) => {
    origin.push(...CENTERS[burst]); velocity.push(dx, dy, dz);
    tint.setHex(hue); color.push(tint.r, tint.g, tint.b);
    timing.push(STARTS[burst], delay, life, mode); detail.push(size, random() * Math.PI * 2, alpha);
  };
  for (let burst = 0; burst < CENTERS.length; burst++) {
    for (let ray = 0; ray < spokes; ray++) {
      const phi = ray * 2.399963, vertical = 1 - 2 * (ray + 0.5) / spokes;
      const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const speed = 7.2 + random() * 4.6;
      const ring = burst === 2 && ray % 3 !== 0;
      const dx = (ring ? Math.cos(phi) : radial * Math.cos(phi)) * speed;
      const dy = (ring ? Math.sin(phi) : vertical) * speed;
      const dz = (ring ? (random() - 0.5) * 0.18 : radial * Math.sin(phi)) * speed;
      const hue = burst === 1 ? PALETTE[0] : PALETTE[(burst + Math.floor(ray / 12) + (seed % 6)) % PALETTE.length];
      const life = burst === 1 ? 4.5 : 3.5 + random() * 0.8;
      for (let tail = 0; tail < tails; tail++) {
        add(burst, dx, dy, dz, tail * 0.065, life, tail ? 0.24 : 0.52, burst === 1 ? 2 : 0, hue, tail ? 0.56 * (1 - tail / tails) : 0.96);
      }
    }
    for (let tail = 0; tail < 22; tail++) add(burst, 0, 0, 0, tail * 0.014, 1.3, tail ? 0.14 : 0.42, 1, 0xffdab0, 1 - tail / 24);
    add(burst, 0, 0, 0, 0, 0.35, 4.5, 3, 0xffe4c0, 0.85);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
  geometry.setAttribute("velocity", new THREE.Float32BufferAttribute(velocity, 3));
  geometry.setAttribute("sparkColor", new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute("timing", new THREE.Float32BufferAttribute(timing, 4));
  geometry.setAttribute("detail", new THREE.Float32BufferAttribute(detail, 3));
  return geometry;
}

type Show = { event: FireworkEvent; object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> };
export class BeachFireworks {
  private shows = new Map<string, Show>();
  private seen = new Set<string>();
  private clockOffset = 0;
  private lastServerTime = -Infinity;
  private texture: THREE.Texture | null = null;
  private textureRequested = false;
  private textureReady = false;
  private disposed = false;
  private scene: THREE.Scene;
  private options: { mobile: boolean };
  constructor(scene: THREE.Scene, options: { mobile: boolean } = { mobile: false }) {
    this.scene = scene; this.options = options;
  }

  apply(events: readonly FireworkEvent[], serverTime: number) {
    if (this.disposed || !Number.isFinite(serverTime) || serverTime < this.lastServerTime) return;
    const now = Date.now(), incomingOffset = serverTime - now;
    if (this.lastServerTime === -Infinity) this.clockOffset = incomingOffset;
    else if (serverTime > this.lastServerTime) this.clockOffset = Math.max(this.clockOffset, incomingOffset);
    this.lastServerTime = serverTime;
    this.update(undefined, now);
    const currentServerTime = now + this.clockOffset;
    for (const event of events.slice(0, 2)) {
      if (!event || !Number.isSafeInteger(event.seed) || event.seed < 0 || typeof event.id !== "string" || !event.id
        || !Number.isFinite(event.startedAt) || event.durationMs !== 12000 || this.seen.has(event.id)
        || currentServerTime < event.startedAt || currentServerTime >= event.startedAt + event.durationMs || this.shows.size >= 2) continue;
      this.seen.add(event.id);
      if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
      if (!this.textureRequested && typeof document !== "undefined") {
        this.textureRequested = true;
        assetLoader(new THREE.TextureLoader()).load(assetUrl(FIREWORK_SPARK_URL), texture => {
          if (this.disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          this.texture = texture; this.textureReady = true;
        }, undefined, () => { /* Soft shader particles remain visible if the optional image fails. */ });
      }
      const material = new THREE.ShaderMaterial({
        uniforms: { uAge: { value: 0 }, uViewport: { value: 700 }, uSpark: { value: this.texture }, uImage: { value: this.textureReady ? 1 : 0 } },
        vertexShader: `
          attribute vec3 velocity; attribute vec3 sparkColor; attribute vec4 timing; attribute vec3 detail;
          uniform float uAge; uniform float uViewport;
          varying vec3 vColor; varying float vAlpha; varying float vAngle;
          void main() {
            float age = uAge - timing.x - timing.y;
            vec3 p = position;
            float fade = 0.0;
            if (timing.w > 0.5 && timing.w < 1.5) {
              float flight = age + timing.z;
              float t = clamp(flight / timing.z, 0.0, 1.0);
              p = mix(vec3(position.x * 0.6, 1.0, position.z + 15.0), position, t);
              p.x += sin(t * 8.0 + detail.y) * 0.08;
              fade = step(0.0, flight) * (1.0 - step(timing.z, flight));
            } else {
              float t = max(0.0, age), travel = (1.0 - exp(-0.58 * t)) / 0.58;
              p += velocity * travel;
              p.y -= (timing.w > 1.5 && timing.w < 2.5 ? 0.78 : 0.62) * t * t;
              fade = step(0.0, age) * (1.0 - smoothstep(timing.z * 0.38, timing.z, age));
              float twinkle = 0.78 + 0.22 * pow(0.5 + 0.5 * sin(t * 12.0 + detail.y), 3.0);
              fade *= mix(1.0, twinkle, smoothstep(0.4, 1.8, t));
            }
            vColor = sparkColor; vAlpha = fade * detail.z; vAngle = detail.y;
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(detail.x * projectionMatrix[1][1] * uViewport / max(1.0, -view.z), 1.6, 56.0);
            if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uSpark; uniform float uImage;
          varying vec3 vColor; varying float vAlpha; varying float vAngle;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float radius = length(p) * 2.0;
            float glow = exp(-radius * radius * 4.4) * (1.0 - smoothstep(0.65, 1.0, radius));
            vec2 uv = mat2(cos(vAngle), -sin(vAngle), sin(vAngle), cos(vAngle)) * p + 0.5;
            vec4 sprite = texture2D(uSpark, clamp(uv, 0.0, 1.0));
            float imageGlow = sprite.a * dot(sprite.rgb, vec3(0.299,0.587,0.114));
            float alpha = mix(glow, max(glow * 0.85, imageGlow * 1.45), uImage) * vAlpha;
            if (alpha < 0.003) discard;
            gl_FragColor = vec4(vColor * 2.2 + vec3(0.55) * pow(glow, 3.0), alpha);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const object = new THREE.Points(fireworkGeometry(event.seed, this.options.mobile), material);
      object.name = "beach-fireworks-" + event.id;
      object.frustumCulled = false; object.renderOrder = 6; object.layers.enable(1);
      this.scene.add(object); this.shows.set(event.id, { event: { ...event }, object });
    }
  }

  update(_camera?: THREE.Camera, now = Date.now()) {
    if (this.disposed || !Number.isFinite(now)) return;
    const serverNow = now + this.clockOffset;
    for (const [id, show] of this.shows) {
      const age = (serverNow - show.event.startedAt) / 1000;
      if (age >= show.event.durationMs / 1000) { this.remove(show); this.shows.delete(id); continue; }
      show.object.material.uniforms.uAge.value = Math.max(0, age);
      show.object.material.uniforms.uViewport.value = typeof window === "undefined" ? 900 : Math.min(1400, window.innerHeight);
      show.object.material.uniforms.uSpark.value = this.texture;
      show.object.material.uniforms.uImage.value = this.textureReady ? 1 : 0;
    }
  }

  private remove(show: Show) { show.object.removeFromParent(); show.object.geometry.dispose(); show.object.material.dispose(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const show of this.shows.values()) this.remove(show);
    this.shows.clear(); this.seen.clear(); this.texture?.dispose(); this.texture = null;
  }
}
