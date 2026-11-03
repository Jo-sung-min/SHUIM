"use client";

/**
 * 사진 파노라마와 PBR 해안 지형 위에 도트 캐릭터를 함께 그리는 바닷가.
 * 캐릭터 아틀라스만 nearest 필터를 쓰고, 배경은 부드러운 질감과 실제 조명을 쓴다.
 *
 * 성능: DPR 상한, 인스턴스 지형, 보일 때만 그리기, 느린 기기는 해상도와 그림자 품질 조절.
 * 이 파일은 /beach 를 열 때만 동적으로 내려받는다 (three 가 첫 번들에 섞이지 않게).
 */
import * as THREE from "three";
import { CHAR_ANIM, CHAR_ATLAS, CHAR_VIEW, PROP, PROPS_ATLAS, type PropName } from "./atlas";
import { type Daylight, daylightAt } from "./daylight";
import { CAMPFIRE, Cove } from "./cove";
import { SHELTERS, SHELTER_SEATS, SHELTER_COLLIDERS, BED_CAPACITY, claimedBedSlot, type BedState } from "./shelters";
import { findClearApproach, resolveWalls } from "./navigation";
import { CoastalFire } from "./fire";
import { FirePowderPlayback } from "./fire-powder";
import { captureScenePhoto } from "./photo";
import { SkyLanterns } from "./lanterns";
import { CareGestures, type CareAnchor } from "./care-effects";
import { STARGAZING, applyLyingTransform, buildStargazingZone, claimedStargazingSlot, stargazingApproach, stargazingBodyPoint, stargazingCameraDistance, type StargazingSlot, type StargazingState } from "./stargazing";
import type { CareKind, FireState, RemotePlayer, RestPresence } from "./net";
export type { StargazingState } from "./stargazing";
export type { BedState } from "./shelters";
function claimedRestSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }): StargazingSlot | null {
  return claimedStargazingSlot(state) ?? claimedBedSlot(state);
}

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SelfState { x: number; z: number; yaw: number; moving: boolean }
export interface RestState { shelterName: string; seated: boolean }
/** 자동으로 걸어간 결과: 도착 · 사용자가 직접 움직여 멈춤 · 길이 막힘 */
export type AutoWalkResult = "arrived" | "cancelled" | "blocked";
/** 1인칭(내 눈) · 3인칭(내 캐릭터 뒤 위에서 따라가는 카메라) */
export type ViewMode = "first" | "third";

export interface EngineHandlers {
  /** 사람을 탭해 골랐거나(플레이어) 빈 곳을 탭해 풀었을 때(null) */
  onSelect: (player: RemotePlayer | null) => void;
  onRestChange?: (state: RestState | null) => void;
  onStargazingChange?: (state: StargazingState) => void;
  onBedChange?: (state: BedState | null) => void;
  onViewChange?: (view: ViewMode) => void;
  onFireRangeChange?: (near: boolean) => void;
  /** 화질을 낮췄을 때 (프레임이 떨어져서) */
  onQuality?: (level: "high" | "low") => void;
}

export interface EngineOptions {
  bounds: Bounds;
  spawn: { x: number; z: number; yaw: number };
  /** 내 기본 캐릭터: 0 남자, 1 여자 (3인칭일 때 내 도트 캐릭터로 보인다) */
  skin: number;
  /** 처음 시점 (기본 1인칭) */
  view?: ViewMode;
  /** 시각을 고정해 보기 (개발용). null 이면 기기 시계 */
  hourOverride: number | null;
  handlers: EngineHandlers;
}

const FOLLOW_DISTANCE = 5.4;
const FOLLOW_DISTANCE_SEATED = 3.6;

const WALK_SPEED = 3.2;
const EYE = 1.55;
const AVATAR_HEIGHT = 1.8; // World size stays fixed when the artwork gains pixels.
/** 서 있을 때: 숨쉬기 0→1→2→1→0, 가끔 깜빡임(마지막 프레임). 6fps 로 2초에 한 바퀴 */
const IDLE_SEQUENCE = [0, 0, 1, 1, 2, 2, 1, 1, 0, 0, 0, CHAR_ANIM.idle.length - 1];
const IDLE_FPS = 6;
const WALK_FPS = 9;

/** 캐릭터가 바라보는 방향(yaw)과 카메라 위치로 앞·뒤·왼·오른쪽 그림을 고른다. 스프라이트 자체는 늘 카메라를 본다 (원통형 빌보드) */
function viewFor(yaw: number, x: number, z: number, cam: THREE.Vector3) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let dx = cam.x - x, dz = cam.z - z;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  const dot = fx * dx + fz * dz;
  if (dot > 0.5) return CHAR_VIEW.front; // 카메라를 마주 본다
  if (dot < -0.5) return CHAR_VIEW.back;
  return fx * dz - fz * dx > 0 ? CHAR_VIEW.right : CHAR_VIEW.left; // 화면에서 오른쪽을 보고 있으면 right 그림
}

/** 시트 안의 프레임 번호: 걷는 중이면 걷기 사이클, 아니면 숨쉬기·깜빡임. t 는 그 애니메이션의 누적 시간(초) */
function charFrame(walking: boolean, t: number) {
  if (walking) return CHAR_ANIM.walk.from + (Math.floor(t * WALK_FPS) % CHAR_ANIM.walk.length);
  return CHAR_ANIM.idle.from + IDLE_SEQUENCE[Math.floor(t * IDLE_FPS) % IDLE_SEQUENCE.length];
}

/* ---------------- 셰이더 ---------------- */
const NOISE_GLSL = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const SKY_VERT = `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FRAG = `
uniform sampler2D uPhoto; uniform vec3 uPhotoTint; uniform float uStars; uniform float uTime; uniform float uLantern;
uniform float uDeepNight; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uMoon;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  // The photographed sea faces -Z. Above the rear ridge, use its uninterrupted sky
  // so the two edges of the panorama cannot form a visible vertical seam.
  vec2 skyUv = vec2(0.5 + sin(atan(d.x, -d.z)) * 0.12, max(0.54, uv.y));
  float seaFacing = smoothstep(0.12, 0.8, -d.z);
  vec3 col = mix(texture2D(uPhoto, skyUv).rgb, texture2D(uPhoto, uv).rgb, seaFacing) * uPhotoTint;
  // Deep night keeps a fine blue horizon, with an almost-black sky above it.
  vec3 nightSky = mix(uSkyHorizon, uSkyTop, smoothstep(-0.03, 0.65, d.y));
  col = mix(col, nightSky, uDeepNight * smoothstep(-0.02, 0.12, d.y) * 0.78);
  if (uStars > 0.0 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 90.0;
    vec2 cell = floor(sp);
    float s = hash(cell);
    float star = step(0.992, s);
    vec2 off = fract(sp) - 0.5 - (vec2(hash(cell + 7.3), hash(cell + 3.1)) - 0.5) * 0.6;
    float dot_ = 1.0 - smoothstep(0.0, 0.18, length(off));
    float tw = 0.82 + 0.18 * sin(uTime * mix(1.5 + s * 3.0, 0.35 + s * 0.45, uDeepNight) + s * 60.0);
    col += star * dot_ * tw * uStars * smoothstep(0.0, 0.25, d.y) * (0.6 + 0.4 * hash(cell + 1.7));
  }
  // A small pearl moon and a very soft halo, rather than a wash over the landscape.
  float moonDistance = length(d - uMoon);
  float moonDisc = 1.0 - smoothstep(0.0075, 0.009, moonDistance);
  float moonHalo = exp(-moonDistance * moonDistance / 0.0018) * 0.018;
  col += vec3(0.85, 0.9, 1.0) * (moonDisc * 0.85 + moonHalo) * uDeepNight * smoothstep(0.0, 0.12, d.y);
  if (uLantern > 0.0) {
    // At late hours, each lantern remains a light rather than tinting the entire sky.
    float low = 1.0 - smoothstep(-0.05, 0.5, d.y);
    float haze = noise(vec2(atan(d.x, -d.z) * 2.5, d.y * 4.0 + uTime * 0.015));
    col += vec3(1.0, 0.52, 0.18) * uLantern * (0.035 + 0.1 * low) * (0.7 + 0.6 * haze) * mix(1.0, 0.08, uDeepNight);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const WORLD_VERT = `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const SEA_FRAG = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSkyRef;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform float uSpec; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCamPos;
uniform sampler2D uPhoto; uniform vec3 uPhotoTint; uniform float uLantern; uniform float uDeepNight;
varying vec3 vWorld;
${NOISE_GLSL}
float waves(vec2 p, float t) {
  return sin(p.y * 1.2 + p.x * 0.12 - t * 1.1) * 0.13
    + sin(p.x * 2.7 + p.y * 1.8 + t * 0.85) * 0.045
    + noise(p * 3.4 + vec2(t * 0.19, -t * 0.34)) * 0.09
    + noise(p * 9.1 - t * 0.23) * 0.025;
}
void main() {
  vec2 p = vWorld.xz; float t = uTime;
  float dist = distance(uCamPos, vWorld);
  float w = waves(p, t);
  float e = 0.08;
  float wx = waves(p + vec2(e, 0.0), t) - w;
  float wz = waves(p + vec2(0.0, e), t) - w;
  float ripple = mix(0.32, 0.065, smoothstep(12.0, 100.0, dist));
  vec3 n = normalize(vec3(-wx / e * ripple, 1.0, -wz / e * ripple));
  float shore = clamp(-vWorld.z / 18.0, 0.0, 1.0);
  vec3 col = mix(uShallow * vec3(0.6, 0.72, 0.69), vec3(0.17, 0.31, 0.34) * uPhotoTint, shore);
  vec3 V = normalize(uCamPos - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 reflection = reflect(-V, n);
  vec2 reflectedUv = vec2(atan(reflection.x, -reflection.z) / 6.2831853 + 0.5, asin(clamp(reflection.y, 0.0, 1.0)) / 3.1415927 + 0.5);
  vec3 reflectedSky = texture2D(uPhoto, reflectedUv).rgb * uPhotoTint;
  col = mix(col, reflectedSky * 0.84, fres * 0.82);
  vec3 H = normalize(uLightDir + V);
  float nh = max(dot(n, H), 0.0);
  float up = smoothstep(0.0, 0.15, uLightDir.y);
  col += uLightColor * (pow(nh, 90.0) * 0.27 + pow(nh, 24.0) * 0.035) * uSpec * up;
  // 밤이면 풍등 불빛이 물결에 주황빛으로 어린다
  col += vec3(0.95, 0.5, 0.2) * uLantern * (0.035 + fres * 0.18) * (0.6 + 0.6 * noise(p * 1.7 + vec2(t * 0.25, -t * 0.4))) * mix(1.0, 0.12, uDeepNight);
  float edge = vWorld.z + 0.7 + sin(t * 0.8 + p.x * 0.18) * 0.7 + noise(vec2(p.x * 0.5, t * 0.3)) * 0.6;
  float foamLine = 1.0 - smoothstep(0.04, 0.48, abs(edge));
  float foamNoise = noise(p * 7.5 + vec2(t * 0.2, 0.0)) * noise(p * 18.0 - t * 0.3);
  col = mix(col, uFoam, foamLine * smoothstep(0.04, 0.44, foamNoise) * 0.88);
  float alpha = 1.0 - smoothstep(-0.2, 1.6, edge);
  vec3 farSea = texture2D(uPhoto, vec2(0.5, 0.475)).rgb * uPhotoTint;
  col = mix(col, farSea, smoothstep(55.0, 260.0, dist));
  gl_FragColor = vec4(col, alpha);
}`;

/* ---------------- 도우미 ---------------- */
type Region = { x: number; y: number; w: number; h: number };

function regionTexture(base: THREE.Texture, r: Region, atlasW: number, atlasH: number): THREE.Texture {
  const t = base.clone();
  t.repeat.set(r.w / atlasW, r.h / atlasH);
  t.offset.set(r.x / atlasW, 1 - (r.y + r.h) / atlasH);
  t.needsUpdate = true;
  return t;
}

function pixelTexture(t: THREE.Texture, srgb: boolean) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const v3 = (c: readonly number[]) => new THREE.Vector3(c[0], c[1], c[2]);

/** 절벽 안쪽 휴식 공간. 가운데 모닥불 주변은 비워 둔다. */
const PLACEMENT: { prop: PropName; x: number; z: number; scale: number; decal?: boolean; r?: number }[] = [
];
const FIRE = CAMPFIRE;

interface PlayerNode {
  data: RemotePlayer;
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  shadow: THREE.Mesh;
  label: THREE.Sprite | null;
  labelNick: string;
  cur: { x: number; z: number; yaw: number };
  target: { x: number; z: number; yaw: number; moving: boolean };
  animT: number;
  bounce: number;
  seen: number;
}

interface FxNode {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  life: number;
  ttl: number;
  size: number;
  swirl: number;
  base: THREE.Vector3;
  kind: "heart" | "sparkle" | "leaf" | "glow" | "petal";
}

export class BeachEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Timer();
  private raf = 0;
  private running = false;
  private disposed = false;
  private time = 0;

  private sky!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private seaMat!: THREE.ShaderMaterial;
  private sandMat!: THREE.MeshStandardMaterial;
  private photo!: THREE.Texture;
  private assetLoads: Promise<void>[] = [];
  private cove!: Cove;
  private charTex!: THREE.Texture;
  private propTex!: THREE.Texture;
  private tinted: THREE.Material[] = [];
  private fire: CoastalFire | null = null;
  private lanterns: SkyLanterns | null = null;
  private fireState: FireState = { logs: 3, maxLogs: 12, intensity: 0.25, color: "amber", serverTime: 0, queuedPops: 0, powder: null };
  private firePowder = new FirePowderPlayback();
  private nearFire = false;
  private inputPaused = false;
  /** 화면 조이스틱·외부 입력이 넣는 걷기 벡터 (x: 오른쪽, y: 앞). 키보드와 합쳐진다 */
  private move = { x: 0, y: 0 };
  /** "장작 넣기" 처럼 목적지까지 알아서 걸어가는 중 */
  private auto: { path: { x: number; z: number }[]; stop: number; face: { x: number; z: number } | null; resolve: (r: AutoWalkResult) => void; stallT: number; detours: number } | null = null;
  /** 도착한 뒤 부드럽게 돌아볼 방향 */
  private faceGoal: { yaw: number; pitch: number } | null = null;
  private obstacles: { x: number; z: number; r: number }[] = [];
  private shadowGeo = new THREE.PlaneGeometry(0.9, 0.45);
  private shadowMat!: THREE.MeshBasicMaterial;
  private ring!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;

  private players = new Map<string, PlayerNode>();
  private fx: FxNode[] = [];
  private careGestures: CareGestures | null = null;
  private fxTex!: Record<FxNode["kind"], THREE.Texture>;
  /** 3인칭일 때 보이는 내 캐릭터 */
  private selfNode: { sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; mat: THREE.MeshBasicMaterial; tex: THREE.Texture; shadow: THREE.Mesh; animT: number } | null = null;
  private view: ViewMode;
  private skin: number;
  private followCam = new THREE.Vector3();
  private followSnap = true;

  private self: SelfState & { pitch: number; bobT: number };
  private bounds: Bounds;
  private keys = new Set<string>();
  private look = { active: false, id: -1, lx: 0, ly: 0, sx: 0, sy: 0, t: 0, moved: false };
  private selected: string | null = null;
  private restSeat: (typeof SHELTER_SEATS)[number] | null = null;
  private returnFromSeat: { x: number; z: number } | null = null;
  private lastRestState = "";
  private lastBedState = "";
  private eyeHeight = EYE;
  private skyRest: StargazingSlot | null = null;
  private beforeSkyRest: { pitch: number } | null = null;
  private lastStargazingState = "";

  private daylight: Daylight;
  private hourOverride: number | null;
  private lastDaylightAt = 0;

  quality: "high" | "low" = "high";
  private frameAvg = 16;
  private slowSince = 0;
  private lastRender = 0;
  private scale: number;
  private mobile: boolean;

  private handlers: EngineHandlers;
  private canvas: HTMLCanvasElement;
  private ready: Promise<void>;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas;
    this.handlers = opts.handlers;
    this.bounds = opts.bounds;
    this.hourOverride = opts.hourOverride;
    this.skin = opts.skin;
    this.view = opts.view ?? "first";
    this.self = { x: opts.spawn.x, z: opts.spawn.z, yaw: opts.spawn.yaw, moving: false, pitch: 0.07, bobT: 0 };
    this.mobile = typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent));
    this.scale = this.mobile ? 0.85 : 1;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.3 : 1.5));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.sortObjects = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(this.mobile ? 68 : 62, 1, 0.1, 520);
    this.camera.rotation.order = "YXZ";
    this.daylight = daylightAt(this.hour());
    this.scene.fog = new THREE.Fog(0xffffff, this.daylight.fogNear, this.daylight.fogFar);

    this.buildSky();
    this.buildGround();
    this.cove = new Cove(this.scene, this.obstacles);
    this.ready = Promise.all([this.loadAtlases(), ...this.assetLoads]).then(() => {
      this.buildProps();
      this.applyDaylight(this.daylight);
    });
    this.applyDaylight(this.daylight);
    this.bindInput();
    this.resize();
  }

  /** 아틀라스까지 다 읽었을 때 */
  whenReady() {
    return this.ready;
  }

  /** Photograph only the rendered world, after every environment asset is ready. */
  async capturePhoto(): Promise<Blob> {
    await this.ready;
    if (this.disposed || this.renderer.getContext().isContextLost()) {
      throw new Error("화면이 다시 준비되면 사진을 찍어 주세요.");
    }
    return captureScenePhoto(this.renderer, this.scene, this.camera);
  }

  /* ---------------- 만들기 ---------------- */
  private hour() {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  private buildSky() {
    this.photo = this.loadEnvironmentTexture("/beach/real/paradise-panorama-v1.webp", false);
    this.photo.wrapS = THREE.RepeatWrapping;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhoto: { value: this.photo }, uPhotoTint: { value: new THREE.Vector3(1, 1, 1) },
        uStars: { value: 0 }, uTime: { value: 0 }, uLantern: { value: 0 },
        uDeepNight: { value: 0 }, uSkyTop: { value: new THREE.Vector3() }, uSkyHorizon: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 28, 14), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.layers.enable(1); // Sky-only camera excludes every hut, cliff and avatar.
    this.scene.add(this.sky);
  }

  private loadEnvironmentTexture(path: string, srgb = true, repeat?: [number, number]) {
    let complete!: () => void;
    let fail!: (error: unknown) => void;
    this.assetLoads.push(new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
    const texture = new THREE.TextureLoader().load(path, complete, undefined, fail);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); }
    return texture;
  }

  private buildGround() {
    this.sandMat = new THREE.MeshStandardMaterial({
      map: this.loadEnvironmentTexture("/beach/real/white-sand-v1.webp", true, [120, 75]),
      normalMap: this.loadEnvironmentTexture("/beach/real/sand-normal.jpg", false, [120, 75]),
      roughnessMap: this.loadEnvironmentTexture("/beach/real/sand-roughness.jpg", false, [120, 75]),
      color: 0xf5f2e7, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 1,
    });
    this.sandMat.onBeforeCompile = (shader) => {
      shader.vertexShader = "varying vec3 vCoastWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoastWorld = (modelMatrix * vec4(position, 1.0)).xyz;");
      shader.fragmentShader = "varying vec3 vCoastWorld;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\nfloat wetSand = 1.0 - smoothstep(-0.8, 2.8, vCoastWorld.z);\ndiffuseColor.rgb *= 1.0 - wetSand * 0.3;");
    };
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(240, 150), this.sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, 72); // Shoreline stays at z=-3; the white sand reaches the distant ridge.
    sand.renderOrder = 0;
    sand.receiveShadow = true;
    this.scene.add(sand);

    this.seaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uDeep: { value: new THREE.Vector3() }, uShallow: { value: new THREE.Vector3() }, uFoam: { value: new THREE.Vector3(1, 1, 1) },
        uSkyRef: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Vector3(1, 1, 1) }, uSpec: { value: 1 },
        uFog: { value: new THREE.Vector3() }, uFogNear: { value: 28 }, uFogFar: { value: 150 }, uCamPos: { value: new THREE.Vector3() },
        uPhoto: { value: this.photo }, uPhotoTint: this.skyMat.uniforms.uPhotoTint, uLantern: this.skyMat.uniforms.uLantern,
        uDeepNight: this.skyMat.uniforms.uDeepNight,
      },
      vertexShader: WORLD_VERT,
      fragmentShader: SEA_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.012, -208); // z: -418 ~ 2
    sea.renderOrder = 1;
    this.scene.add(sea);
  }

  private async loadAtlases() {
    const loader = new THREE.TextureLoader();
    const [chars, props] = await Promise.all([loader.loadAsync("/beach/chars-v2.png"), loader.loadAsync("/beach/props.png")]);
    this.charTex = pixelTexture(chars, true);
    this.propTex = pixelTexture(props, true);
    const fxOf = (name: PropName) => regionTexture(this.propTex, PROP[name], PROPS_ATLAS.width, PROPS_ATLAS.height);
    this.fxTex = { heart: fxOf("heart"), sparkle: fxOf("sparkle"), leaf: fxOf("leaf"), glow: fxOf("glow"), petal: fxOf("petal") };
    this.shadowMat = new THREE.MeshBasicMaterial({ map: fxOf("shadow"), transparent: true, depthWrite: false, opacity: 0.8 });
    this.ringMat = new THREE.MeshBasicMaterial({ map: fxOf("ring"), transparent: true, depthWrite: false, color: 0xa99cf2 });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
    this.selfNode = this.createSelfAvatar();
  }

  /** 내 캐릭터: 다른 사람과 같은 도트 시트, 이름표는 없다. 1인칭에선 숨긴다 */
  private createSelfAvatar() {
    const tex = this.charTex.clone();
    tex.repeat.set(1 / CHAR_ATLAS.cols, 1 / CHAR_ATLAS.rows);
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.1, depthWrite: true, toneMapped: false });
    mat.color.setRGB(this.daylight.tint[0], this.daylight.tint[1], this.daylight.tint[2], THREE.SRGBColorSpace);
    const geometry = new THREE.PlaneGeometry(AVATAR_HEIGHT * CHAR_ATLAS.cellW / CHAR_ATLAS.cellH, AVATAR_HEIGHT);
    geometry.translate(0, AVATAR_HEIGHT / 2, 0);
    const sprite = new THREE.Mesh(geometry, mat);
    sprite.renderOrder = 3;
    sprite.visible = false;
    this.scene.add(sprite);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    shadow.visible = false;
    this.scene.add(shadow);
    this.setFrameOn(tex, CHAR_VIEW.back, CHAR_ANIM.idle.from, this.skin);
    return { sprite, mat, tex, shadow, animT: 0 };
  }

  /* ---------------- 시점 ---------------- */
  get viewMode() {
    return this.view;
  }

  setView(view: ViewMode) {
    if (this.isBedLying && view === "first") return;
    if (this.disposed || view === this.view) return;
    this.view = view;
    if (this.skyRest && view === "first") this.self.pitch = 1.50;
    this.followSnap = true;
    this.handlers.onViewChange?.(view);
  }

  toggleView() {
    this.setView(this.view === "first" ? "third" : "first");
  }

  /** The next render uses the selected row without reloading the room or texture. */
  setSkin(skin: number) {
    if (this.disposed || !Number.isInteger(skin)) return;
    this.skin = ((skin % CHAR_ATLAS.rows) + CHAR_ATLAS.rows) % CHAR_ATLAS.rows;
  }

  private buildProps() {
    this.fire = new CoastalFire(this.scene, FIRE.x, FIRE.z);
    this.fire.setState(this.fireState.logs, this.fireState.color);
    this.obstacles.push({ x: FIRE.x, z: FIRE.z, r: 1.35 });
    this.lanterns = new SkyLanterns(this.scene, this.mobile ? 16 : 22);
    this.lanterns.setAmount(this.daylight.lanterns);
    buildStargazingZone(this.scene);
    this.updateStargazingState();
  }

  setFireState(state: FireState) {
    if (!state || !Number.isFinite(state.logs)) return;
    const playback = this.firePowder.sync(state, performance.now());
    if (!playback.accepted) return;
    this.fireState = { ...state, logs: Math.max(0, Math.min(12, state.logs)) };
    this.fire?.setState(this.fireState.logs, this.fireState.color);
    this.cove.setFireState(this.fireState.logs, this.fireState.color);
    if (playback.burst) this.fire?.tossPowder(playback.burst, this.camera.position, this.firePowder.sample(performance.now()).hue);
  }

  /** 장작이 들어갔을 때: 불이 확 타올랐다가 잦아든다 (내가 넣었든 다른 사람이 넣었든) */
  flareFire() {
    this.fire?.flare();
  }

  /** 화면 조이스틱 입력 (-1~1, y 는 앞으로가 양수). 손을 떼면 (0, 0) */
  setMove(x: number, y: number) {
    if (this.inputPaused || this.skyRest) return;
    this.move.x = Math.max(-1, Math.min(1, x || 0));
    this.move.y = Math.max(-1, Math.min(1, y || 0));
  }

  /** 모닥불 앞(돌 둘레 바깥, 장작을 넣을 수 있는 거리 안)까지 알아서 걸어가 불을 바라본다 */
  walkToFire(): Promise<AutoWalkResult> {
    if (this.disposed || this.skyRest) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    const stand = this.camera.aspect < 0.75 ? 4.2 : 3.2;
    const target = findClearApproach(this.self, FIRE, stand, this.obstacles, SHELTER_COLLIDERS, this.bounds);
    if (!target) return Promise.resolve("blocked");
    return this.walkTo(target, { x: FIRE.x, z: FIRE.z });
  }

  /** Approach the shared circle. Claiming a mat still requires the server's response. */
  walkToStargazing(): Promise<AutoWalkResult> {
    if (this.disposed || this.skyRest) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    return this.walkTo(stargazingApproach(this.self.x, this.self.z), { x: STARGAZING.x, z: STARGAZING.z });
  }

  walkToBed(spotId: string): Promise<AutoWalkResult> {
    const shelter = SHELTERS.find((s) => `hut-${s.id}` === spotId);
    if (this.disposed || this.skyRest || !shelter) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    return this.walkTo({ x: shelter.x, z: shelter.z - 1.2 }, { x: shelter.x, z: shelter.z + 1 });
  }

  cancelAutoWalk() {
    this.cancelAuto("cancelled");
    this.self.moving = false;
    this.faceGoal = null;
  }

  get isLying() { return Boolean(this.skyRest); }
  get isBedLying() { return Boolean(this.skyRest && this.skyRest.spotId !== STARGAZING.id); }

  getBedState(): BedState | null {
    const shelter = this.isBedLying
      ? SHELTERS.find((s) => `hut-${s.id}` === this.skyRest?.spotId)
      : SHELTERS.find((s) => Math.abs(this.self.x - s.x) < s.width / 2 - 0.35 && this.self.z > s.z - s.depth / 2 - 1.3 && this.self.z < s.z + s.depth / 2 - 0.3);
    if (!shelter) return null;
    const spotId = `hut-${shelter.id}`;
    const used = new Set<number>();
    for (const player of this.players.values()) {
      const bed = claimedBedSlot(player.data);
      if (bed?.spotId === spotId) used.add(bed.slot);
    }
    if (this.skyRest?.spotId === spotId) used.add(this.skyRest.slot);
    return { spotId, shelterName: shelter.name, near: true, lying: this.skyRest?.spotId === spotId, occupied: used.size, capacity: BED_CAPACITY };
  }

  private updateBedState() {
    const state = this.getBedState();
    const key = state ? `${state.spotId}:${state.lying}:${state.occupied}` : "";
    if (key === this.lastBedState) return;
    this.lastBedState = key;
    this.handlers.onBedChange?.(state);
  }

  /** Only a server-confirmed claim changes posture. Repeated ticks preserve camera dragging. */
  applyRest(state: RestPresence) {
    if (this.disposed || !state) return;
    const slot = claimedRestSlot(state);
    if (slot) {
      if (this.skyRest?.spotId === slot.spotId && this.skyRest.slot === slot.slot) return;
      if (!this.skyRest) this.beforeSkyRest = { pitch: this.self.pitch };
      if (this.restSeat) this.standUp();
      this.skyRest = slot;
      this.setView("third");
      this.self.x = slot.x; this.self.z = slot.z;
      this.self.yaw = slot.yaw; this.self.pitch = 1.25;
      this.eyeHeight = (slot.avatarY ?? STARGAZING.avatarY) + 0.16;
    } else if (state.pose === "standing" && this.skyRest) {
      if (![state.x, state.z, state.yaw].every(Number.isFinite)) return;
      this.skyRest = null;
      this.self.x = state.x; this.self.z = state.z; this.self.yaw = state.yaw;
      this.self.pitch = THREE.MathUtils.clamp(this.beforeSkyRest?.pitch ?? 0.07, -0.55, 0.5);
      this.beforeSkyRest = null;
      this.eyeHeight = this.deckHeight(state.x, state.z) + EYE;
    } else return;
    this.keys.clear(); this.move = { x: 0, y: 0 };
    this.cancelAutoWalk();
    this.followSnap = true;
    this.updateRestState();
    this.updateStargazingState();
  }

  private updateStargazingState() {
    this.updateBedState();
    const slots = new Set<number>();
    for (const player of this.players.values()) {
      const slot = claimedStargazingSlot(player.data);
      if (slot) slots.add(slot.slot);
    }
    if (this.skyRest?.spotId === STARGAZING.id) slots.add(this.skyRest.slot);
    const state: StargazingState = {
      near: Math.hypot(this.self.x - STARGAZING.x, this.self.z - STARGAZING.z) <= STARGAZING.nearRadius,
      lying: this.skyRest?.spotId === STARGAZING.id, occupied: slots.size, capacity: STARGAZING.capacity,
    };
    const key = `${state.near}:${state.lying}:${state.occupied}`;
    if (key !== this.lastStargazingState) {
      this.lastStargazingState = key;
      this.handlers.onStargazingChange?.(state);
    }
  }

  private walkTo(target: { x: number; z: number }, face: { x: number; z: number } | null): Promise<AutoWalkResult> {
    this.cancelAuto("cancelled");
    this.faceGoal = null;
    return new Promise((resolve) => {
      this.auto = { path: [target], stop: 0.3, face, resolve, stallT: 0, detours: 0 };
    });
  }

  private cancelAuto(result: AutoWalkResult) {
    const a = this.auto;
    if (!a) return;
    this.auto = null;
    a.resolve(result);
  }

  private finishAuto() {
    const a = this.auto;
    if (!a) return;
    this.auto = null;
    if (a.face) {
      const dx = a.face.x - this.self.x, dz = a.face.z - this.self.z;
      const dist = Math.hypot(dx, dz) || 1;
      this.faceGoal = { yaw: Math.atan2(-dx, -dz), pitch: -Math.atan2(this.eyeHeight - 0.6, dist) * 0.8 };
    }
    a.resolve("arrived");
  }

  /** 자동 걷기 한 프레임: 목적지로 곧장, 막히면 옆으로 비켜 가는 경유지를 끼운다 */
  private stepAuto(dt: number) {
    const a = this.auto;
    if (!a) return;
    const goal = a.path[0];
    const dx = goal.x - this.self.x, dz = goal.z - this.self.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= (a.path.length > 1 ? 0.6 : a.stop)) {
      a.path.shift();
      if (!a.path.length) { this.self.moving = false; this.finishAuto(); }
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    const [cx, cz] = this.collide(this.self.x + (dx / dist) * step, this.self.z + (dz / dist) * step);
    const nx = Math.max(this.bounds.minX + 0.4, Math.min(this.bounds.maxX - 0.4, cx));
    const nz = Math.max(this.bounds.minZ + 0.3, Math.min(this.bounds.maxZ - 0.4, cz));
    const progressed = Math.hypot(nx - this.self.x, nz - this.self.z);
    this.self.x = nx;
    this.self.z = nz;
    this.self.moving = true;
    this.self.bobT += dt * WALK_SPEED * 2.6;
    if (!(this.look.active && this.look.moved)) {
      // 걷는 방향을 바라본다 (둘러보는 중엔 손에 맡긴다)
      const turn = Math.atan2(-dx, -dz) - this.self.yaw;
      this.self.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 5);
    }
    if (progressed < step * 0.35) {
      a.stallT += dt;
      if (a.stallT > 0.5) {
        a.stallT = 0;
        if (++a.detours > 4) { this.self.moving = false; this.cancelAuto("blocked"); return; }
        const side = a.detours % 2 ? 1 : -1;
        const px = (-dz / dist) * side, pz = (dx / dist) * side;
        a.path.unshift({ x: this.self.x + px * 2.6 + (dx / dist) * 0.8, z: this.self.z + pz * 2.6 + (dz / dist) * 0.8 });
      }
    } else a.stallT = 0;
  }

  setInputPaused(paused: boolean) {
    this.inputPaused = paused;
    this.keys.clear();
    this.look.active = false;
    this.move = { x: 0, y: 0 };
    this.cancelAuto("cancelled");
    this.self.moving = false;
  }

  /* ---------------- 시간대 ---------------- */
  setHourOverride(h: number | null) {
    this.hourOverride = h;
    this.applyDaylight(daylightAt(this.hour()));
  }

  get daylightNow() {
    return this.daylight;
  }

  private applyDaylight(d: Daylight) {
    this.daylight = d;
    this.cove?.applyDaylight(d);
    const u = this.skyMat.uniforms;
    const night = d.stars;
    const photoTint = u.uPhotoTint.value as THREE.Vector3;
    photoTint.set(1 - night * (0.85 - d.lanterns * 0.04), 1 - night * (0.79 - d.lanterns * 0.02), 1 - night * 0.64);
    photoTint.multiplyScalar(1 - d.deepNight * 0.78);
    u.uDeepNight.value = d.deepNight;
    (u.uSkyTop.value as THREE.Vector3).set(...d.skyTop);
    (u.uSkyHorizon.value as THREE.Vector3).set(...d.skyHorizon);
    (u.uMoon.value as THREE.Vector3).set(...d.moon);
    u.uStars.value = d.stars;
    u.uLantern.value = d.lanterns;
    this.lanterns?.setAmount(d.lanterns);

    const s = this.seaMat.uniforms;
    (s.uDeep.value as THREE.Vector3).set(...d.seaDeep);
    (s.uShallow.value as THREE.Vector3).set(...d.seaShallow);
    (s.uFoam.value as THREE.Vector3).set(...d.foam);
    (s.uSkyRef.value as THREE.Vector3).set(...d.skyHorizon);
    const sunUp = d.sun[1] > -0.02;
    (s.uLightDir.value as THREE.Vector3).set(...(sunUp ? d.sun : d.moon));
    const moonLight: [number, number, number] = [0.8, 0.85, 1.0];
    (s.uLightColor.value as THREE.Vector3).set(...(sunUp ? d.sunColor : moonLight));
    s.uSpec.value = d.specular;
    (s.uFog.value as THREE.Vector3).set(...d.fog);
    s.uFogNear.value = d.fogNear;
    s.uFogFar.value = d.fogFar;

    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(...d.fog, THREE.SRGBColorSpace);
    fog.near = 70;
    fog.far = 270;
    this.renderer.setClearColor(fog.color, 1);

    for (const m of this.tinted) (m as THREE.SpriteMaterial).color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    for (const p of this.players.values()) p.mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    this.selfNode?.mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    if (this.shadowMat) this.shadowMat.opacity = 0.35 + 0.45 * Math.max(0, d.sun[1]);
  }

  /* ---------------- 입력 ---------------- */
  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerUp);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }

  /** 캔버스 위에서 끌면(마우스든 손가락이든) 둘러보고, 짧게 누르면 그 자리의 사람을 고른다. 걷기는 키보드와 화면 조이스틱(setMove) */
  private onPointerDown = (e: PointerEvent) => {
    if (this.disposed || this.inputPaused || this.look.active) return;
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    this.look = { active: true, id: e.pointerId, lx: x, ly: y, sx: x, sy: y, t: performance.now(), moved: false };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.disposed || this.inputPaused) return;
    if (!this.look.active || e.pointerId !== this.look.id) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - this.look.lx, dy = y - this.look.ly;
    this.look.lx = x;
    this.look.ly = y;
    if (Math.hypot(x - this.look.sx, y - this.look.sy) > 8) this.look.moved = true;
    if (this.look.moved) {
      const k = e.pointerType === "mouse" ? 0.0042 : 0.0072;
      this.self.yaw -= dx * k;
      this.self.pitch = this.skyRest
        ? THREE.MathUtils.clamp(this.self.pitch - dy * k * 0.75, this.view === "first" ? 1.40 : 0.88, this.view === "first" ? 1.56 : 1.50)
        : THREE.MathUtils.clamp(this.self.pitch - dy * k * 0.75, -0.55, 0.5);
      this.faceGoal = null;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.disposed) return;
    try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { /* 잡지 않은 포인터 */ }
    if (this.look.active && e.pointerId === this.look.id) {
      const tap = !this.look.moved && performance.now() - this.look.t < 350 && e.type !== "pointercancel";
      this.look.active = false;
      if (tap) this.tapAt(this.look.sx, this.look.sy);
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.inputPaused) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "Escape" && this.restSeat) {
      if (e.type === "keydown") this.standUp();
      return;
    }
    if (k === "e" && (this.restSeat || this.nearbySeat())) {
      this.keys.delete("e");
      if (e.type === "keydown" && !e.repeat) this.toggleRest();
      e.preventDefault();
      return;
    }
    if (k === "v") {
      if (e.type === "keydown" && !e.repeat) this.toggleView();
      return;
    }
    if (this.skyRest) {
      if (k.startsWith("Arrow")) e.preventDefault();
      return;
    }
    if (!["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"].includes(k)) return;
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
    if (k.startsWith("Arrow")) e.preventDefault();
  };

  private onBlur = () => {
    this.keys.clear();
    this.move = { x: 0, y: 0 };
  };

  /** 화면 좌표를 탭했을 때 그 자리의 사람을 고른다 */
  private tapAt(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const sprites = [...this.players.values()].map((p) => p.sprite);
    const hits = ray.intersectObjects(sprites, false);
    let pid: string | null = null;
    if (hits.length) {
      for (const [id, p] of this.players) if (p.sprite === hits[0].object) pid = id;
    } else {
      // 멀어서 작게 보이는 사람은 화면에서 가까운 쪽으로 너그럽게
      let best = 28;
      for (const [id, p] of this.players) {
        const v = p.sprite.position.clone();
        const resting = claimedRestSlot(p.data);
        if (resting) {
          const middle = stargazingBodyPoint(resting, AVATAR_HEIGHT / 2);
          v.set(middle.x, resting.avatarY ?? STARGAZING.avatarY, middle.z);
        } else v.y += AVATAR_HEIGHT / 2;
        v.project(this.camera);
        if (v.z > 1) continue;
        const sx = ((v.x + 1) / 2) * rect.width, sy = ((1 - v.y) / 2) * rect.height;
        const dpx = Math.hypot(sx - x, sy - y);
        if (dpx < best) { best = dpx; pid = id; }
      }
    }
    this.select(pid);
  }

  select(pid: string | null) {
    this.selected = pid;
    const node = pid ? this.players.get(pid) : null;
    this.ring.visible = Boolean(node);
    this.handlers.onSelect(node ? node.data : null);
  }

  /* ---------------- 다른 사람들 ---------------- */
  setPlayers(list: RemotePlayer[]) {
    if (!this.charTex) return;
    const now = performance.now();
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.pid);
      let node = this.players.get(p.pid);
      if (!node) {
        node = this.createPlayer(p);
        this.players.set(p.pid, node);
      }
      node.data = p;
      const resting = claimedRestSlot(p);
      node.target = resting ? { x: resting.x, z: resting.z, yaw: resting.yaw, moving: false } : { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving };
      node.seen = now;
      if (node.labelNick !== p.nick) this.setLabel(node, p.nick);
    }
    for (const [pid, node] of this.players) {
      if (!seen.has(pid)) {
        this.removePlayer(node);
        this.players.delete(pid);
        if (this.selected === pid) this.select(null);
      }
    }
    this.updateStargazingState();
  }

  private createPlayer(p: RemotePlayer): PlayerNode {
    const tex = this.charTex.clone();
    tex.repeat.set(1 / CHAR_ATLAS.cols, 1 / CHAR_ATLAS.rows);
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.1, depthWrite: true, toneMapped: false });
    mat.color.setRGB(this.daylight.tint[0], this.daylight.tint[1], this.daylight.tint[2], THREE.SRGBColorSpace);
    // 세로축만 돌아 늘 카메라를 보는 종이 인형. 어느 쪽에서 보느냐에 따라 앞·뒤·옆 그림을 바꿔 끼운다 (viewFor)
    const geometry = new THREE.PlaneGeometry(AVATAR_HEIGHT * CHAR_ATLAS.cellW / CHAR_ATLAS.cellH, AVATAR_HEIGHT);
    geometry.translate(0, AVATAR_HEIGHT / 2, 0);
    const sprite = new THREE.Mesh(geometry, mat);
    sprite.rotation.y = Math.atan2(this.camera.position.x - p.x, this.camera.position.z - p.z);
    sprite.position.set(p.x, 0, p.z);
    sprite.renderOrder = 3;
    this.scene.add(sprite);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(p.x, 0.015, p.z);
    shadow.renderOrder = 2;
    this.scene.add(shadow);
    const node: PlayerNode = {
      data: p, sprite, mat, tex, shadow, label: null, labelNick: "",
      cur: { x: p.x, z: p.z, yaw: p.yaw }, target: { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving }, animT: Math.random() * 10, bounce: 0, seen: performance.now(),
    };
    this.setLabel(node, p.nick);
    this.setFrame(node, CHAR_VIEW.front, CHAR_ANIM.idle.from, p.skin);
    return node;
  }

  private setLabel(node: PlayerNode, nick: string) {
    if (node.label) {
      this.scene.remove(node.label);
      (node.label.material as THREE.SpriteMaterial).map?.dispose();
      node.label.material.dispose();
    }
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.font = "700 30px 'Pretendard Variable', Pretendard, system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const w = Math.min(248, ctx.measureText(nick).width + 28);
      ctx.fillStyle = "rgba(20, 16, 30, 0.55)";
      ctx.beginPath();
      ctx.roundRect(128 - w / 2, 10, w, 44, 22);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(nick, 128, 33);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    const label = new THREE.Sprite(mat);
    label.scale.set(2.2, 0.55, 1);
    label.center.set(0.5, 0);
    label.renderOrder = 6;
    this.scene.add(label);
    node.label = label;
    node.labelNick = nick;
  }

  private removePlayer(node: PlayerNode) {
    this.scene.remove(node.sprite, node.shadow);
    node.sprite.geometry.dispose();
    node.mat.dispose();
    node.tex.dispose();
    if (node.label) {
      this.scene.remove(node.label);
      (node.label.material as THREE.SpriteMaterial).map?.dispose();
      node.label.material.dispose();
    }
  }

  private setFrame(node: PlayerNode, view: number, frame: number, skin: number) {
    this.setFrameOn(node.tex, view, frame, skin);
  }

  private setFrameOn(tex: THREE.Texture, view: number, frame: number, skin: number) {
    const col = view + frame;
    const row = ((skin % CHAR_ATLAS.rows) + CHAR_ATLAS.rows) % CHAR_ATLAS.rows;
    tex.offset.set(col / CHAR_ATLAS.cols, 1 - (row + 1) / CHAR_ATLAS.rows);
  }

  /* ---------------- 인사 · 위로 · 안아주기 이펙트 ---------------- */
  private careAnchor(pid: string | null): CareAnchor | null {
    const node = pid === null ? null : this.players.get(pid);
    if (pid !== null && !node) return null;
    const resting = node ? claimedRestSlot(node.data) : this.skyRest;
    if (pid === null && this.view === "first") {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      return { position: this.camera.position.clone().addScaledVector(direction, 1.65).add(new THREE.Vector3(0, -0.24, 0)), close: true, resting: Boolean(resting) };
    }
    if (resting) {
      const point = stargazingBodyPoint(resting, 0.92);
      return { position: new THREE.Vector3(point.x, (resting.avatarY ?? STARGAZING.avatarY) + 0.24 + Math.sin(resting.incline ?? 0) * 0.92, point.z), close: false, resting: true };
    }
    const position = node?.cur ?? this.self;
    return { position: new THREE.Vector3(position.x, this.deckHeight(position.x, position.z) + 1.03, position.z), close: false, resting: false };
  }

  /** Called for confirmed events only. Null identifies local self; omitted source keeps legacy calls valid. */
  playCare(kind: CareKind, toPid: string | null, fromPid?: string | null) {
    if (this.disposed || !this.fxTex) return;
    const target = this.careAnchor(toPid);
    if (kind === "wave" || kind === "hug") {
      this.careGestures ??= new CareGestures(this.scene, this.camera, pid => this.careAnchor(pid));
    }
    if (kind === "wave") {
      const sender = fromPid === undefined ? toPid : fromPid;
      this.careGestures?.play("wave", sender);
      const source = sender === null ? null : this.players.get(sender);
      if (source && !claimedRestSlot(source.data)) source.bounce = Math.max(source.bounce, 0.18);
      if (target) for (let i = 0; i < 3; i++) {
        this.spawnFx("sparkle", target.position, new THREE.Vector3((i - 1) * 0.15, 0.35, 0), 1, target.close ? 0.08 : 0.13, i * 0.10, 0xffedb5);
      }
      return;
    }
    if (!target) return;
    const at = target.position;
    const node = toPid === null ? null : this.players.get(toPid);
    if (node && !claimedRestSlot(node.data)) node.bounce = kind === "hug" ? 0.25 : 0.5;
    const k = target.close ? 0.6 : 1;
    if (kind === "hug") {
      this.careGestures?.play("hug", toPid);
      for (let i = 0; i < 4; i++) this.spawnFx("heart", at, new THREE.Vector3((i % 2 ? 1 : -1) * 0.18, 0.45 + i * 0.08, 0), 1.6, (0.14 + i * 0.015) * k, i * 0.14, i % 2 ? 0xffd8bd : 0xffb4ce);
      this.spawnFx("glow", at, new THREE.Vector3(0, 0.08, 0), 1.8, 1.2 * k, 0, 0xffb7c8);
    } else {
      for (let i = 0; i < 8; i++) this.spawnFx("sparkle", at, new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2), 1.4 + Math.random() * 0.5, (0.18 + Math.random() * 0.08) * k, i * 0.06, undefined, true);
      for (let i = 0; i < 4; i++) this.spawnFx("leaf", at, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8), 1.8 + Math.random() * 0.4, 0.22 * k, i * 0.1, undefined, true);
      this.spawnFx("glow", at.clone().setY(at.y - 0.1), new THREE.Vector3(0, 0.15, 0), 1.3, 2.6 * k, 0, 0xffd27a);
    }
  }

  private spawnFx(kind: FxNode["kind"], at: THREE.Vector3, vel: THREE.Vector3, ttl: number, size: number, delay: number, color?: number, swirl = false) {
    const mat = new THREE.SpriteMaterial({ map: this.fxTex[kind], transparent: true, depthWrite: false, opacity: 0, blending: kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending });
    if (color !== undefined) mat.color.setHex(color);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5));
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    this.fx.push({ sprite, mat, vel, life: -delay, ttl, size, swirl: swirl ? Math.random() * Math.PI * 2 : -1, base: sprite.position.clone(), kind });
  }

  private updateFx(dt: number) {
    this.careGestures?.update(dt);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life += dt;
      if (f.life < 0) continue;
      const t = f.life / f.ttl;
      if (t >= 1) {
        this.scene.remove(f.sprite);
        f.mat.dispose();
        this.fx.splice(i, 1);
        continue;
      }
      if (f.swirl >= 0) {
        const a = f.swirl + f.life * 3.2;
        f.base.y += f.vel.y * dt;
        f.sprite.position.set(f.base.x + Math.cos(a) * 0.55, f.base.y, f.base.z + Math.sin(a) * 0.55);
      } else {
        f.sprite.position.addScaledVector(f.vel, dt);
        f.vel.y *= 1 - dt * 0.4;
      }
      f.mat.opacity = f.kind === "glow" ? Math.sin(t * Math.PI) * 0.55 : t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
      if (f.kind === "glow") { const s = f.size * (0.8 + t * 0.5); f.sprite.scale.set(s, s, 1); }
    }
  }

  /* ---------------- 프레임 ---------------- */
  getSelf(): SelfState {
    return { x: this.self.x, z: this.self.z, yaw: this.skyRest?.yaw ?? this.self.yaw, moving: this.skyRest ? false : this.self.moving };
  }

  private facing() {
    return { x: -Math.sin(this.self.yaw), z: -Math.cos(this.self.yaw) };
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.reset();
    this.lastRender = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    this.cancelAuto("cancelled");
    this.look.active = false;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private setQuality(level: "high" | "low") {
    if (this.quality === level) return;
    this.quality = level;
    this.renderer.shadowMap.enabled = level === "high";
    this.scale = level === "low" ? (this.mobile ? 0.65 : 0.75) : this.mobile ? 0.85 : 1;
    this.renderer.setPixelRatio(level === "low" ? 1 : Math.min(window.devicePixelRatio || 1, this.mobile ? 1.3 : 1.5));
    this.resize();
    this.handlers.onQuality?.(level);
  }

  private frame() {
    const now = performance.now();
    if (this.quality === "low" && now - this.lastRender < 31) return; // 30fps 제한
    this.clock.update(now);
    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = now - this.lastRender;
    this.lastRender = now;
    // 프레임 시간 평균이 3초 넘게 느리면 화질을 낮춘다 (한 번 낮추면 이 방문 동안 유지). 탭 전환 같은 긴 멈춤은 세지 않는다
    if (elapsed < 120) this.frameAvg += (elapsed - this.frameAvg) * 0.06;
    if (this.quality === "high") {
      if (this.frameAvg > 34) { if (!this.slowSince) this.slowSince = now; else if (now - this.slowSince > 3000) this.setQuality("low"); }
      else this.slowSince = 0;
    }
    this.time += dt;

    if (now - this.lastDaylightAt > 20_000) {
      this.lastDaylightAt = now;
      this.applyDaylight(daylightAt(this.hour()));
    }

    this.updateSelf(dt);
    this.updatePlayers(dt);
    this.updateFx(dt);
    this.updateWorld(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateSelf(dt: number) {
    this.camera.layers?.set(this.skyRest?.spotId === STARGAZING.id && this.view === "first" ? 1 : 0);
    if (this.skyRest) {
      this.self.x = this.skyRest.x; this.self.z = this.skyRest.z; this.self.moving = false;
      this.placeStargazingCamera(dt);
      this.sky.position.copy(this.camera.position);
      this.updateSelfAvatar(dt);
      this.updateStargazingState();
      if (this.nearFire) { this.nearFire = false; this.handlers.onFireRangeChange?.(false); }
      return;
    }
    const k = this.keys;
    let mx = this.move.x, my = this.move.y; // 조이스틱: 위로 밀면 앞으로
    if (k.has("w") || k.has("ArrowUp")) my += 1;
    if (k.has("s") || k.has("ArrowDown")) my -= 1;
    if (k.has("a")) mx -= 1;
    if (k.has("d")) mx += 1;
    const turn = (k.has("ArrowLeft") || k.has("q") ? 1 : 0) - (k.has("ArrowRight") || k.has("e") ? 1 : 0);
    if (turn) { this.self.yaw += turn * 1.9 * dt; this.faceGoal = null; }
    const len = Math.hypot(mx, my);
    const manual = len > 0.08 || turn !== 0;
    if (manual) { this.cancelAuto("cancelled"); this.faceGoal = null; }
    if (this.auto) {
      this.stepAuto(dt);
    } else {
      if (this.restSeat && len > 0.08) this.standUp();
      if (len > 1) { mx /= len; my /= len; }
      const speed = WALK_SPEED * (k.has("Shift") ? 1.6 : 1) * Math.min(1, len);
      this.self.moving = len > 0.08;
      if (this.self.moving) {
        const f = this.facing();
        const r = { x: Math.cos(this.self.yaw), z: -Math.sin(this.self.yaw) };
        const nx = this.self.x + (f.x * my + r.x * mx) * speed * dt;
        const nz = this.self.z + (f.z * my + r.z * mx) * speed * dt;
        const [cx, cz] = this.collide(nx, nz);
        this.self.x = Math.max(this.bounds.minX + 0.4, Math.min(this.bounds.maxX - 0.4, cx));
        this.self.z = Math.max(this.bounds.minZ + 0.3, Math.min(this.bounds.maxZ - 0.4, cz));
        this.self.bobT += dt * speed * 2.6;
      }
    }
    if (this.faceGoal) {
      const g = this.faceGoal;
      const ease = Math.min(1, dt * 5);
      const dYaw = Math.atan2(Math.sin(g.yaw - this.self.yaw), Math.cos(g.yaw - this.self.yaw));
      this.self.yaw += dYaw * ease;
      this.self.pitch += (g.pitch - this.self.pitch) * ease;
      if (Math.abs(dYaw) < 0.01 && Math.abs(g.pitch - this.self.pitch) < 0.01) this.faceGoal = null;
    }
    const bob = this.self.moving ? Math.sin(this.self.bobT) * 0.035 : 0;
    const targetEye = this.deckHeight(this.self.x, this.self.z) + (this.restSeat ? 1.30 : EYE);
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 9);
    if (this.view === "third") {
      this.placeFollowCamera(dt);
    } else {
      this.camera.position.set(this.self.x, this.eyeHeight + bob, this.self.z);
      this.camera.rotation.set(this.self.pitch, this.self.yaw, 0);
    }
    this.sky.position.copy(this.camera.position);
    this.updateSelfAvatar(dt);
    this.updateRestState();
    this.updateStargazingState();
    const near = Math.hypot(this.self.x - FIRE.x, this.self.z - FIRE.z) <= 4.6;
    if (near !== this.nearFire) { this.nearFire = near; this.handlers.onFireRangeChange?.(near); }
  }

  /** Lying eyes look at the sky; the alternate camera keeps all eight mats in view. */
  private placeStargazingCamera(dt: number) {
    const resting = this.skyRest;
    if (!resting) return;
    if (this.isBedLying) {
      // The open sea-facing front is the only sightline: stay below the roof and in front of the bed.
      const shelter = SHELTERS.find((s) => `hut-${s.id}` === resting.spotId)!;
      const wanted = new THREE.Vector3(shelter.x + (resting.x - shelter.x) * 0.85, 2.85, shelter.z - 2.9);
      if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
      else this.followCam.lerp(wanted, Math.min(1, dt * 10));
      this.camera.position.copy(this.followCam);
      this.camera.lookAt(resting.x, 1.02, resting.z + 0.9);
      return;
    }
    if (this.view === "first") {
      const head = stargazingBodyPoint(resting, 1.42);
      this.camera.position.set(head.x, STARGAZING.avatarY + 0.16, head.z);
      this.camera.rotation.set(THREE.MathUtils.clamp(this.self.pitch, 1.40, 1.56), this.self.yaw, 0, "YXZ");
      return;
    }
    const elevation = THREE.MathUtils.clamp(this.self.pitch, 0.88, 1.5);
    const reach = stargazingCameraDistance(this.camera.fov, this.camera.aspect, elevation);
    const horizontal = Math.cos(elevation) * reach;
    const wanted = new THREE.Vector3(STARGAZING.x + Math.sin(this.self.yaw) * horizontal,
      Math.sin(elevation) * reach + 0.4, STARGAZING.z + Math.cos(this.self.yaw) * horizontal);
    if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
    else this.followCam.lerp(wanted, Math.min(1, dt * 10));
    this.camera.position.copy(this.followCam);
    this.camera.lookAt(STARGAZING.x, 0.05, STARGAZING.z);
  }

  /** Follow the standing character, shortening the orbit near shelter walls. */
  private placeFollowCamera(dt: number) {
    const x = this.self.x, z = this.self.z;
    const focusY = this.deckHeight(x, z) + (this.restSeat ? 1.0 : 1.25);
    const elev = Math.max(0.08, Math.min(1.0, 0.4 - this.self.pitch * 0.8));
    const f = this.facing();
    const reach = this.restSeat ? FOLLOW_DISTANCE_SEATED : FOLLOW_DISTANCE;
    const cosE = Math.cos(elev), sinE = Math.sin(elev);
    const wanted = new THREE.Vector3();
    for (let k = 1; k >= 0.3; k -= 0.1) {
      wanted.set(x - f.x * reach * k * cosE, focusY + reach * k * sinE, z - f.z * reach * k * cosE);
      if (this.cameraFree(wanted)) break;
    }
    if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
    else this.followCam.lerp(wanted, Math.min(1, dt * 10));
    this.camera.position.copy(this.followCam);
    // 캐릭터 머리 조금 위를 바라봐서 캐릭터는 화면 아래쪽, 앞 풍경은 위쪽에 넉넉히 들어온다
    this.camera.lookAt(x, focusY + (this.mobile ? 1.1 : 0.7), z);
  }

  private cameraFree(p: THREE.Vector3) {
    const b = this.bounds;
    if (p.x < b.minX + 0.3 || p.x > b.maxX - 0.3 || p.z < b.minZ + 0.3 || p.z > b.maxZ - 0.3) return false;
    for (const w of SHELTER_COLLIDERS) if (p.x > w.minX - 0.25 && p.x < w.maxX + 0.25 && p.z > w.minZ - 0.25 && p.z < w.maxZ + 0.25) return false;
    return true;
  }

  /** 3인칭일 때만 보이는 내 도트 캐릭터. 다른 사람과 같은 규칙으로 걷기 프레임과 앞·뒤 그림을 고른다 */
  private updateSelfAvatar(dt: number) {
    const n = this.selfNode;
    if (!n) return;
    const shown = this.view === "third";
    n.sprite.visible = shown;
    n.shadow.visible = shown;
    if (!shown) return;
    if (this.skyRest) {
      applyLyingTransform(n.sprite, this.skyRest);
      n.shadow.visible = false;
      this.setFrameOn(n.tex, CHAR_VIEW.front, CHAR_ANIM.idle.from, this.skin);
      return;
    }
    const deck = this.deckHeight(this.self.x, this.self.z);
    const cam = this.camera.position;
    n.sprite.position.set(this.self.x, deck, this.self.z);
    n.sprite.rotation.set(0, Math.atan2(cam.x - this.self.x, cam.z - this.self.z), 0, "YXZ");
    n.shadow.position.set(this.self.x, deck + 0.015, this.self.z);
    n.animT += dt;
    this.setFrameOn(n.tex, viewFor(this.self.yaw, this.self.x, this.self.z, cam), charFrame(this.self.moving, n.animT), this.skin);
  }

  private collide(x: number, z: number): [number, number] {
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + 0.35;
      if (d < min && d > 1e-4) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
    }
    return resolveWalls(x, z, SHELTER_COLLIDERS);
  }

  private deckHeight(x: number, z: number) {
    return SHELTERS.find((s) => Math.abs(x - s.x) <= s.width / 2 && Math.abs(z - s.z) <= s.depth / 2)?.floorY ?? 0;
  }

  private nearbySeat() {
    // Requiring the player to be inside prevents sitting through a back or side wall.
    const shelter = SHELTERS.find((s) => Math.abs(this.self.x - s.x) < s.width / 2 - 0.4 && Math.abs(this.self.z - s.z) < s.depth / 2 - 0.3);
    if (!shelter) return null;
    let nearest: (typeof SHELTER_SEATS)[number] | null = null;
    let distance = 2.25;
    for (const seat of SHELTER_SEATS) {
      if (seat.shelterId !== shelter.id) continue;
      const d = Math.hypot(this.self.x - seat.x, this.self.z - seat.z);
      if (d < distance) { nearest = seat; distance = d; }
    }
    return nearest;
  }

  /** A reachable bench offers a sea-facing seat; walking or the same action gets up. */
  toggleRest() {
    if (this.disposed || this.skyRest) return;
    if (this.restSeat) { this.standUp(); return; }
    const seat = this.nearbySeat();
    if (!seat) return;
    this.returnFromSeat = { x: this.self.x, z: this.self.z };
    this.restSeat = seat;
    this.self.x = seat.x;
    this.self.z = seat.z;
    this.self.yaw = seat.yaw;
    this.self.pitch = 0.015;
    this.self.moving = false;
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    this.cancelAuto("cancelled");
    this.faceGoal = null;
    this.updateRestState();
  }

  private standUp() {
    if (!this.restSeat) return;
    if (this.returnFromSeat) {
      this.self.x = this.returnFromSeat.x;
      this.self.z = this.returnFromSeat.z;
    }
    this.restSeat = null;
    this.returnFromSeat = null;
    this.updateRestState();
  }

  private updateRestState() {
    const seat = this.restSeat ?? this.nearbySeat();
    const key = seat ? `${seat.shelterId}:${Boolean(this.restSeat)}` : "";
    if (key === this.lastRestState) return;
    this.lastRestState = key;
    this.handlers.onRestChange?.(seat ? { shelterName: seat.name, seated: Boolean(this.restSeat) } : null);
  }

  private updatePlayers(dt: number) {
    const cam = this.camera.position;
    const smooth = Math.min(1, dt * 7);
    let selectedNode: PlayerNode | null = null;
    for (const [pid, p] of this.players) {
      const resting = claimedRestSlot(p.data);
      const far = Math.hypot(p.target.x - p.cur.x, p.target.z - p.cur.z);
      if (resting) { p.cur.x = resting.x; p.cur.z = resting.z; p.cur.yaw = resting.yaw; }
      else if (far > 7) { p.cur.x = p.target.x; p.cur.z = p.target.z; }
      else { p.cur.x += (p.target.x - p.cur.x) * smooth; p.cur.z += (p.target.z - p.cur.z) * smooth; }
      const walking = !resting && (p.target.moving || far > 0.12);
      p.animT += dt;
      const frame = charFrame(walking, p.animT);
      const turn = p.target.yaw - p.cur.yaw;
      p.cur.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * smooth;
      if (resting) {
        applyLyingTransform(p.sprite, resting);
        this.setFrame(p, CHAR_VIEW.front, CHAR_ANIM.idle.from, p.data.skin);
      } else {
        p.sprite.rotation.set(0, Math.atan2(cam.x - p.cur.x, cam.z - p.cur.z), 0, "YXZ");
        this.setFrame(p, viewFor(p.cur.yaw, p.cur.x, p.cur.z, cam), frame, p.data.skin);
      }
      const dl = Math.hypot(p.cur.x - cam.x, p.cur.z - cam.z);
      if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - dt * 2.2);
      const hop = p.bounce > 0 ? Math.abs(Math.sin(p.bounce * Math.PI * 2)) * 0.22 * p.bounce : 0;
      const deck = this.deckHeight(p.cur.x, p.cur.z);
      if (!resting) p.sprite.position.set(p.cur.x, deck + hop, p.cur.z);
      p.shadow.visible = !resting;
      p.shadow.position.set(p.cur.x, deck + 0.015, p.cur.z);
      if (p.label) {
        if (resting) {
          const outside = stargazingBodyPoint(resting, -0.38);
          p.label.position.set(outside.x, (resting.avatarY ?? STARGAZING.avatarY) + 0.18, outside.z);
          p.label.scale.set(1.5, 0.375, 1);
          p.label.visible = pid === this.selected && dl > 2.5 && dl < 20;
        } else {
          p.label.position.set(p.cur.x, deck + AVATAR_HEIGHT + 0.14 + hop, p.cur.z);
          p.label.scale.set(2.2, 0.55, 1);
          p.label.visible = dl > 2.5 && dl < 24;
        }
      }
      if (pid === this.selected) selectedNode = p;
    }
    if (selectedNode) {
      const resting = claimedRestSlot(selectedNode.data);
      const point = resting ? stargazingBodyPoint(resting, AVATAR_HEIGHT / 2) : selectedNode.cur;
      this.ring.position.set(point.x, resting ? (resting.avatarY ?? STARGAZING.avatarY) + 0.01 : this.deckHeight(point.x, point.z) + 0.03, point.z);
      const s = 1 + Math.sin(this.time * 5) * 0.07;
      this.ring.scale.set(s, s, 1);
      this.ringMat.opacity = 0.75 + Math.sin(this.time * 5) * 0.2;
    }
  }

  private updateWorld(dt: number) {
    void dt;
    this.skyMat.uniforms.uTime.value = this.time;
    this.seaMat.uniforms.uTime.value = this.time;
    this.fire?.setPowder(this.firePowder.sample(performance.now()));
    this.fire?.update(this.time, this.camera);
    this.cove.setFireFlare(this.fire?.flareAmount ?? 0);
    if (this.fire) this.cove.setFireTint(this.fire.lightColor);
    this.cove.update(this.time);
    (this.seaMat.uniforms.uCamPos.value as THREE.Vector3).copy(this.camera.position);
    this.lanterns?.update(this.time);
  }

  /* ---------------- 정리 ---------------- */
  dispose() {
    this.disposed = true;
    this.cancelAuto("cancelled");
    this.stop();
    this.clock.dispose();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    for (const p of this.players.values()) this.removePlayer(p);
    this.players.clear();
    if (this.selfNode) {
      this.scene.remove(this.selfNode.sprite, this.selfNode.shadow);
      this.selfNode.sprite.geometry.dispose();
      this.selfNode.mat.dispose();
      this.selfNode.tex.dispose();
      this.selfNode = null;
    }
    for (const f of this.fx) { this.scene.remove(f.sprite); f.mat.dispose(); }
    this.fx = [];
    this.careGestures?.dispose();
    this.careGestures = null;
    this.lanterns?.dispose();
    this.lanterns = null;
    const textures = new Set<THREE.Texture>();
    for (const texture of Object.values(this.fxTex ?? {})) textures.add(texture);
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.DirectionalLight || o instanceof THREE.PointLight) o.shadow.dispose();
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
        if (mat instanceof THREE.ShaderMaterial) {
          for (const uniform of Object.values(mat.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
        }
        materials.add(mat);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    this.scene.clear();
    this.charTex?.dispose();
    this.propTex?.dispose();
    this.renderer.dispose();
  }
}

/** WebGL 을 쓸 수 있는지 (못 쓰면 안내만 보여 준다) */
export function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
