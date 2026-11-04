import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { FireworkEvent, FireworkVariant } from "./net";

export const FIREWORK_SPARK_URL = "/beach/fx/firework-spark-v1.webp";
const PALETTE = [0xffc777, 0xff83b1, 0x87eaff, 0xb89aff, 0x95ffd1, 0xffb88c];
const CENTERS = [[-28, 50, -58], [0, 64, -76], [28, 53, -60], [-26, 78, -46], [27, 82, -44], [-33, 77, 8], [0, 101, -12], [33, 80, 10]];
const STARTS = [1.3, 1.3, 1.3, 3.7, 3.7, 6.4, 6.4, 6.4];
export const FIREWORK_TEXT = { songi: "송이 안녕?", love: "사랑해" } as const;
export const FIREWORK_TEXT_CENTER = [0, 72, -45] as const;
export const FIREWORK_SKY_TEXT_CENTER = [0, 90, 28] as const;

// Fixed 24×26 glyph samples from Malgun Gothic Bold, rendered once during authoring.
// Only these eight glyphs are stored: every browser gets identical Hangul particle
// positions without downloading a font, raster image or relying on Canvas fonts.
const GLYPHS: Record<string, string> = {
  "송": "0.0.0.iyo.iyo.1beo.2rk0.lxq8.2f4qo.27740.iyo.iyo.4zso0.4zso0.0.5lhc.mgw0.166io.13clc.13clc.166io.mgw0.5lhc.0.0.0",
  "이": "0.0.0.26nsw.26txc.270cg.27a9s.276ww.27w80.27w80.27w80.27pwg.27w80.27w80.27w80.27740.27a9s.270cg.26tq8.26nsw.26nsw.26nsw.26nsw.26nsw.0.0",
  "안": "0.0.0.xpmo.xvr4.y280.yc3k.yy1s.yxy8.9pl5s.9pl5s.yy1s.yc3k.y280.xvr4.xpmo.xpmo.xr0g.1ds.1ds.1ds.2hw5c.2hw5c.0.0.0",
  "녕": "0.0.0.26nsw.26ny8.2hjuo.2hjuo.26ny8.2hjuo.2hjuo.26ny8.26ny8.29gw0.29gw0.26nsw.b6yo.18xs0.2cd1c.26p6o.26p6o.2cd1c.18xs0.b6yo.0.0.0",
  "?": "0.0.0.0.0.0.0.rk.35c.35c.2s0.2rk.2rk.2yo.1hc.ow.cg.5c.cg.0.cg.cg.cg.0.0.0",
  "사": "0.0.0.xpmo.xse8.xse8.xse8.xse8.xse8.xse8.xse8.xvk0.9oiyo.9oi68.y1ds.yc3k.yy1s.106b4.yexs.xpmo.xpmo.xpmo.xpmo.xpmo.0.0",
  "랑": "0.0.0.xpmo.yew0.yew0.y8lc.y8lc.9p23k.9p23k.xpsw.xpsw.10iqo.10iqo.xpmo.5kow.mgow.13da8.xr0g.xr0g.13da8.mgow.5kow.0.0.0",
  "해": "0.0.0.1zocg.1zocg.1zocg.20c8g.20c8g.1zmyo.1zmyo.1zq0w.1zt8g.2gt0g.2gt0g.1zwio.1zy74.1zy74.1zt8g.1zq0w.1zmyo.1zmyo.1zmyo.1zmyo.1vf9c.0.0",
};

function textPoints(text: string) {
  const points: [number, number][] = [];
  let advance = 0;
  for (const character of text) {
    if (character === " ") { advance += 12; continue; }
    GLYPHS[character].split(".").forEach((row, y) => {
      const bits = parseInt(row, 36);
      for (let x = 0; x < 24; x++) if (bits & (1 << x)) points.push([advance + x, -y]);
    });
    advance += character === "?" ? 16 : 26;
  }
  const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
  return points.map(([x, y]) => [(x - (minX + maxX) / 2) * 0.43, (y - (minY + maxY) / 2) * 0.43] as const);
}

/** Seeded GPU trajectories let every visitor see the same show at its current age. */
export function fireworkGeometry(seed: number, mobile = false, variant: FireworkVariant = "festival") {
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const origin: number[] = [], velocity: number[] = [], color: number[] = [], timing: number[] = [], detail: number[] = [];
  const tint = new THREE.Color();
  const spokes = mobile ? 96 : 176, tails = mobile ? 4 : 5;
  const add = (burst: number, dx: number, dy: number, dz: number, delay: number, life: number, size: number, mode: number, hue: number, alpha: number) => {
    origin.push(...CENTERS[burst]); velocity.push(dx, dy, dz);
    tint.setHex(hue); color.push(tint.r, tint.g, tint.b);
    timing.push(STARTS[burst], delay, life, mode); detail.push(size, random() * Math.PI * 2, alpha);
  };
  for (let burst = 0; burst < CENTERS.length; burst++) {
    for (let ray = 0; ray < spokes; ray++) {
      const phi = ray * 2.399963, vertical = 1 - 2 * (ray + 0.5) / spokes;
      const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const speed = 18.5 + random() * 7;
      const ring = burst === 4 && ray % 3 !== 0;
      const dx = (ring ? Math.cos(phi) : radial * Math.cos(phi)) * speed;
      const dy = (ring ? Math.sin(phi) : vertical) * speed;
      const dz = (ring ? (random() - 0.5) * 0.18 : radial * Math.sin(phi)) * speed;
      const willow = burst === 3 || burst === 6;
      const hue = willow ? PALETTE[0] : PALETTE[(burst + (seed % 6)) % PALETTE.length];
      const life = willow ? 4.8 : 3.8 + random() * 0.5;
      for (let tail = 0; tail < tails; tail++) {
        add(burst, dx, dy, dz, tail * 0.07, life, tail ? 0.4 : 0.85, willow ? 2 : 0, hue, tail ? 0.62 * (1 - tail / tails) : 0.98);
      }
    }
    for (let tail = 0; tail < 24; tail++) add(burst, 0, 0, 0, tail * 0.014, 1.3, tail ? 0.22 : 0.62, 1, 0xffdab0, 1 - tail / 26);
    add(burst, 0, 0, 0, 0, 0.28, 9, 3, 0xffe4c0, 0.95);
    add(burst, 0, 0, 0, 0, 0.45, 28, 5, hueFromBurst(burst, seed), 0.44);
  }
  const phrase = variant === "festival" ? "" : FIREWORK_TEXT[variant];
  const letters = phrase ? textPoints(phrase) : [];
  for (const [x, y] of letters) {
    origin.push(...FIREWORK_TEXT_CENTER); velocity.push(x, y, 0);
    tint.setHex(variant === "love" ? 0xffc9de : 0xffedbf); color.push(tint.r, tint.g, tint.b);
    timing.push(2.6, random() * 0.2, 6.8, 4); detail.push(0.39, random() * Math.PI * 2, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(origin, 3));
  geometry.setAttribute("velocity", new THREE.Float32BufferAttribute(velocity, 3));
  geometry.setAttribute("sparkColor", new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute("timing", new THREE.Float32BufferAttribute(timing, 4));
  geometry.setAttribute("detail", new THREE.Float32BufferAttribute(detail, 3));
  geometry.userData.variant = variant;
  geometry.userData.phrase = phrase;
  geometry.userData.textWidth = letters.length ? Math.max(...letters.map(p => p[0])) - Math.min(...letters.map(p => p[0])) + 0.8 : 0;
  return geometry;
}

function hueFromBurst(burst: number, seed: number) { return PALETTE[(burst + seed % PALETTE.length) % PALETTE.length]; }

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
  private cameraRight = new THREE.Vector3(1, 0, 0);
  private cameraUp = new THREE.Vector3(0, 1, 0);
  private cameraForward = new THREE.Vector3(0, 0, -1);
  private cameraPosition = new THREE.Vector3();
  private textCenter = new THREE.Vector3(...FIREWORK_TEXT_CENTER);
  private textFromCamera = new THREE.Vector3();
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
        || (event.variant !== undefined && !["festival", "songi", "love"].includes(event.variant))
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
        uniforms: { uAge: { value: 0 }, uViewport: { value: 700 }, uSpark: { value: this.texture }, uImage: { value: this.textureReady ? 1 : 0 },
          uTextRight: { value: this.cameraRight.clone() }, uTextUp: { value: this.cameraUp.clone() }, uTextScale: { value: 1 },
          uTextCenter: { value: this.textCenter.clone() }, uPointScale: { value: 1 } },
        vertexShader: `
          attribute vec3 velocity; attribute vec3 sparkColor; attribute vec4 timing; attribute vec3 detail;
          uniform float uAge; uniform float uViewport; uniform float uTextScale; uniform float uPointScale;
          uniform vec3 uTextRight; uniform vec3 uTextUp; uniform vec3 uTextCenter;
          varying vec3 vColor; varying float vAlpha; varying float vAngle; varying float vMode; varying float vProgress;
          void main() {
            float age = uAge - timing.x - timing.y;
            vec3 p = position;
            float fade = 0.0;
            if (timing.w > 3.5 && timing.w < 4.5) {
              p = uTextCenter;
              float t = max(0.0, age), settle = smoothstep(0.0, 0.95, t);
              float disperse = smoothstep(4.5, timing.z, t);
              vec2 offset = velocity.xy * mix(0.12, 1.0, settle);
              offset += vec2(sin(detail.y), cos(detail.y)) * disperse * 1.25;
              offset.y -= disperse * disperse * 1.8;
              p += (uTextRight * offset.x + uTextUp * offset.y) * uTextScale;
              fade = smoothstep(0.08, 0.55, t) * (1.0 - smoothstep(4.55, timing.z, t));
              fade *= 0.86 + 0.14 * sin(t * 8.0 + detail.y);
            } else if (timing.w > 0.5 && timing.w < 1.5) {
              float flight = age + timing.z;
              float t = clamp(flight / timing.z, 0.0, 1.0);
              p = mix(vec3(position.x * 0.6, 1.0, position.z + 15.0), position, t);
              p.x += sin(t * 8.0 + detail.y) * 0.08;
              fade = step(0.0, flight) * (1.0 - step(timing.z, flight));
            } else {
              float t = max(0.0, age), travel = (1.0 - exp(-0.45 * t)) / 0.45;
              p += velocity * travel;
              p.y -= (timing.w > 1.5 && timing.w < 2.5 ? 1.1 : 0.74) * t * t;
              fade = step(0.0, age) * (1.0 - smoothstep(timing.z * 0.38, timing.z, age));
              float twinkle = 0.78 + 0.22 * pow(0.5 + 0.5 * sin(t * 12.0 + detail.y), 3.0);
              fade *= mix(1.0, twinkle, smoothstep(0.4, 1.8, t));
            }
            vColor = sparkColor; vAlpha = fade * detail.z; vAngle = detail.y;
            vMode = timing.w; vProgress = clamp(age / timing.z, 0.0, 1.0);
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * view;
            float worldSize = detail.x * (timing.w > 3.5 && timing.w < 4.5 ? uTextScale : 1.0);
            gl_PointSize = clamp(worldSize * projectionMatrix[1][1] * uViewport / max(1.0, -view.z), 1.6 * uPointScale, 96.0 * uPointScale);
            if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uSpark; uniform float uImage;
          varying vec3 vColor; varying float vAlpha; varying float vAngle; varying float vMode; varying float vProgress;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float radius = length(p) * 2.0;
            float glow = exp(-radius * radius * 4.4) * (1.0 - smoothstep(0.65, 1.0, radius));
            if (vMode > 4.5) glow = exp(-pow((radius - mix(0.12, 0.82, vProgress)) * 13.0, 2.0)) * (1.0 - smoothstep(0.9, 1.0, radius));
            vec2 uv = mat2(cos(vAngle), -sin(vAngle), sin(vAngle), cos(vAngle)) * p + 0.5;
            vec4 sprite = texture2D(uSpark, clamp(uv, 0.0, 1.0));
            float imageGlow = sprite.a * dot(sprite.rgb, vec3(0.299,0.587,0.114));
            float useImage = (vMode > 3.5) ? 0.0 : uImage;
            float alpha = mix(glow, max(glow * 0.85, imageGlow * 1.45), useImage) * vAlpha;
            if (alpha < 0.003) discard;
            gl_FragColor = vec4(vColor * 2.2 + vec3(0.55) * pow(glow, 3.0), alpha);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const object = new THREE.Points(fireworkGeometry(event.seed, this.options.mobile, event.variant ?? "festival"), material);
      object.name = "beach-fireworks-" + event.id;
      object.frustumCulled = false; object.renderOrder = 6; object.layers.enable(1);
      this.scene.add(object); this.shows.set(event.id, { event: { ...event }, object });
    }
  }

  update(camera?: THREE.Camera, now = Date.now(), drawingBufferHeight?: number) {
    if (this.disposed || !Number.isFinite(now)) return;
    const cssHeight = typeof window === "undefined" ? 900 : Math.max(1, window.innerHeight);
    const viewportHeight = typeof drawingBufferHeight === "number" && Number.isFinite(drawingBufferHeight) && drawingBufferHeight > 0
      ? drawingBufferHeight : Math.min(1400, cssHeight);
    if (camera) {
      camera.updateWorldMatrix(true, false);
      this.cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
      this.cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
      this.cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).negate();
      const center = camera.layers.mask === 2 ? FIREWORK_SKY_TEXT_CENTER : FIREWORK_TEXT_CENTER;
      this.textCenter.set(center[0], center[1], center[2]);
      this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      this.textFromCamera.copy(this.textCenter).sub(this.cameraPosition);
    }
    const serverNow = now + this.clockOffset;
    for (const [id, show] of this.shows) {
      const age = (serverNow - show.event.startedAt) / 1000;
      if (age >= show.event.durationMs / 1000) { this.remove(show); this.shows.delete(id); continue; }
      show.object.material.uniforms.uAge.value = Math.max(0, age);
      show.object.material.uniforms.uViewport.value = viewportHeight;
      show.object.material.uniforms.uPointScale.value = viewportHeight / cssHeight;
      show.object.material.uniforms.uSpark.value = this.texture;
      show.object.material.uniforms.uImage.value = this.textureReady ? 1 : 0;
      if (camera) {
        show.object.material.uniforms.uTextRight.value.copy(this.cameraRight);
        show.object.material.uniforms.uTextUp.value.copy(this.cameraUp);
        show.object.material.uniforms.uTextCenter.value.copy(this.textCenter);
        const depth = Math.max(1, this.textFromCamera.dot(this.cameraForward));
        const halfFrame = depth / Math.max(0.01, Math.abs(camera.projectionMatrix.elements[0]));
        const centerOffset = Math.abs(this.textFromCamera.dot(this.cameraRight));
        const availableWidth = Math.max(0, 2 * (halfFrame * 0.84 - centerOffset));
        const width = show.object.geometry.userData.textWidth;
        show.object.material.uniforms.uTextScale.value = width ? Math.min(1, Math.max(0.15, availableWidth / width)) : 1;
      }
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
