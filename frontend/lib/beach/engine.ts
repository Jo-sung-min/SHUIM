"use client";

/**
 * 사진 파노라마와 PBR 해안 지형 위에 3D 캐릭터와 도트 캐릭터를 함께 그리는 바닷가.
 * 도트 아틀라스만 nearest 필터를 쓰고, 3D 모델은 실제 조명을 받는다.
 *
 * 성능: DPR 상한, 인스턴스 지형, 보일 때만 그리기, 느린 기기는 해상도와 그림자 품질 조절.
 * 이 파일은 /beach 를 열 때만 동적으로 내려받는다 (three 가 첫 번들에 섞이지 않게).
 */
import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import { CHAR_ANIM, CHAR_ATLAS, CHAR_VIEW, PROP, PROPS_ATLAS, type PropName } from "./atlas";
import { type Daylight, baikalDaylightAt, bambooDaylightAt, bambooSunsetAmount, cloudSpaDaylightAt, daylightAt, gardenDaylightAt, uyuniDaylightAt } from "./daylight";
import { CAMPFIRE, Cove } from "./cove";
import { SHELTERS, SHELTER_SEATS, SHELTER_COLLIDERS, BED_CAPACITY, bedSlot, claimedBedSlot, type BedState } from "./shelters";
import { HOT_SPRING, HOT_SPRING_COLLIDERS, hotSpringBathDistance, hotSpringBathIndex, hotSpringFloorHeight, hotSpringCeilingHeight, hotSpringInWater } from "./hot-spring";
import { ONSEN_SEATS, ONSEN_FLOATS, ONSEN_FLOATS_PER_BATH, ONSEN_FLOAT_RADIUS, ONSEN_REST_REACH, ONSEN_SEATS_PER_BATH, claimedOnsenSeat, claimedOnsenFloat, onsenLedgeHeight, onsenFloatingY } from "./onsen-rest";
import { FIRE_BENCH_SEATS, FIRE_BENCH_REACH, claimedFireBenchSlot } from "./fire-benches";
import { findClearApproach, findWalkingPath, resolveWalls } from "./navigation";
import { CoastalFire } from "./fire";
import { SKY_FRAGMENT } from "./sky-shader";
import { UyuniWorld } from "./uyuni";
import { BUNKER_SEATS, BUNKER_SEAT_CAPACITY, BUNKER_SEAT_REACH, bunkerById, bunkerForSpot, bunkerColliders, claimedBunkerSeat, nearbyBunkerEntry, nearbyBunkerGame, nearbyBunkerLadder, nearbyBunkerSofa, type UyuniBunkerId } from "./uyuni-bunker-layout";
import type { BoardGame } from "./net";
import { UYUNI_HOTELS, UYUNI_HOTEL_BED_CAPACITY, UYUNI_HOTEL_COLLIDERS, UYUNI_HOTEL_SEATS, claimedUyuniHotelBed, nearbyUyuniHotel, uyuniHotelCeilingHeight, uyuniHotelFloorHeight, uyuniHotelForSpot } from "./uyuni-hotel-layout";
import { UYUNI_SKY_FRAGMENT } from "./uyuni-shader";
import { BambooWorld } from "./bamboo";
import { BambooFestivalToys } from "./bamboo-festival-toys";
import { BAMBOO_GUESTBOOK, BAMBOO_GUESTBOOK_OBSTACLES, isNearBambooGuestbook } from "./bamboo-guestbook";
import type { BambooNote } from "./bamboo-notes";
import type { BambooFestivalState, PropellerFlight } from "./net";
import { BAMBOO_SKY_FRAGMENT } from "./bamboo-shader";
import { GardenWorld } from "./garden";
import { CloudSpaWorld } from "./cloud-spa";
import { CLOUD_SPA_SKY_FRAGMENT } from "./cloud-spa-sky";
import { CLOUD_SPA_POOLS, CLOUD_SPA_RESORT, CLOUD_SPA_SEATS, CLOUD_SPA_SEAT_REACH, CLOUD_SPA_WALLS, cloudSpaFloorHeight, cloudSpaCeilingHeight, cloudSpaEdgeAhead, resolveCloudSpaWalk, nearbyCloudSpaPlace, cloudSpaForSpot, claimedCloudSpaSeat } from "./cloud-spa-layout";
import { BaikalWorld } from "./baikal";
import { BAIKAL_SKY_FRAGMENT } from "./baikal-sky";
import { BAIKAL_COLLIDERS, BAIKAL_SEATS, BAIKAL_SEAT_REACH, BAIKAL_WALLS, baikalCeilingHeight, baikalFloorHeight, baikalForSpot, baikalStormAt, claimedBaikalSeat, insideBaikalCabin, nearbyBaikalPlace, resolveBaikalWalk } from "./baikal-layout";
import { GARDEN_SKY_FRAGMENT } from "./garden-shader";
import { BOAT_DECK_Y, GARDEN_OBSTACLES, GARDEN_PIERS, GARDEN_SEATS, GARDEN_WALLS, PIER_Y, claimedGardenSeat, gardenCeilingHeight, gardenFloorHeight, gardenPavilionForSpot, gardenRainAt, insideHall, nearbyGardenPavilion, pierEnd, resolveGardenWalk, type BoatStop } from "./garden-layout";
import type { BoatRideState, RemoteRider } from "./garden-boat";
import { BAMBOO_PAVILIONS, BAMBOO_PAVILION_COLLIDERS, BAMBOO_PAVILION_OBSTACLES, BAMBOO_PAVILION_SEATS, PAVILION_POST_HEIGHT, PAVILION_REACH, PAVILION_SEAT_CAPACITY, TRAIL_WALK_HALF, bambooCeilingHeight, bambooPavilionForSpot, claimedPavilionSeat, nearbyBambooPavilion, nearestOnTrail, onTrail, resolveTrail, type PavilionSeat } from "./bamboo-trail";
import type { MapId } from "./maps";
import { FirePowderPlayback } from "./fire-powder";
import { captureScenePhoto } from "./photo";
import { SkyLanterns } from "./lanterns";
import { BeachFireworks } from "./fireworks";
import { FireworkAudio } from "./firework-audio";
import { UyuniMoments } from "./uyuni-moments";
import { CareGestures, type CareAnchor } from "./care-effects";
import { BeachAvatarModels, type AvatarKind, type BeachAvatar } from "./rigged-avatar";
import type { ChibiCharacter } from "../chibi/character";
import { BeachUltraSea, SAND_SHORE_ALBEDO, SAND_SHORE_CAUSTICS, SAND_SHORE_PARS, ULTRA_RADIUS } from "./ultra-sea";
import { REFRACT_LAYER, beachSandGeometry, sandHeight } from "./shore-terrain";
import { PixelAvatarDepth } from "./pixel-avatar-depth";
import { RemoteMotionBuffer, RemoteSnapshotClock, type SnapshotTiming } from "./remote-motion";
import { STARGAZING, applyLyingTransform, buildStargazingZone, claimedStargazingSlot, stargazingApproach, stargazingBodyPoint, stargazingCameraDistance, type StargazingSlot, type StargazingState } from "./stargazing";
import type { CareKind, FireState, FireworkEvent, UyuniMoment, GardenMoment, RemotePlayer, RestPresence } from "./net";
export type { StargazingState } from "./stargazing";
export type { BedState } from "./shelters";
function claimedRestSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }): StargazingSlot | null {
  return claimedStargazingSlot(state) ?? claimedBedSlot(state) ?? claimedUyuniHotelBed(state) ?? claimedOnsenFloat(state);
}
function claimedSeatSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }) {
  if (state.spotId?.startsWith("cloud-")) return claimedCloudSpaSeat(state);
  if (state.spotId?.startsWith("baikal-")) return claimedBaikalSeat(state);
  return claimedFireBenchSlot(state) ?? claimedOnsenSeat(state) ?? claimedPavilionSeat(state) ?? claimedGardenSeat(state) ?? claimedBunkerSeat(state);
}

/** Which shared rest spots exist on a map; claims for the others are ignored, never drawn at a stray coordinate. */
function mapSupportsSpot(mapId: MapId, spotId: string | null | undefined): boolean {
  if (spotId == null) return true;
  if (mapId === "cloudspa") return cloudSpaForSpot(spotId) !== null;
  if (spotId.startsWith("cloud-")) return false;
  if (mapId === "baikal") return baikalForSpot(spotId) !== null;
  if (spotId.startsWith("baikal-")) return false;
  if (mapId === "garden") return gardenPavilionForSpot(spotId) !== null;
  if (gardenPavilionForSpot(spotId)) return false;
  if (mapId === "bamboo") return bambooPavilionForSpot(spotId) !== null;
  if (bambooPavilionForSpot(spotId)) return false;
  if (bunkerForSpot(spotId)) return mapId === "uyuni";
  if (mapId === "uyuni") return spotId === STARGAZING.id || uyuniHotelForSpot(spotId) !== null;
  return uyuniHotelForSpot(spotId) === null;
}

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface SelfState { x: number; z: number; yaw: number; moving: boolean; bunkerId?: UyuniBunkerId | null }
export interface BunkerState { bunkerId: UyuniBunkerId | null; nearId: UyuniBunkerId | null; name: string; inside: boolean; ladderNear: boolean; sofaNear: boolean; seated: boolean; spotId: string | null; gameNearId: string | null; occupied: number; capacity: number; available: boolean }
export interface RestState { shelterName: string; seated: boolean }
export interface BenchState { near: boolean; seated: boolean; occupied: number; capacity: number; available: boolean }
export interface OnsenState { inWater: boolean; canSit: boolean; canFloat: boolean; sitting: boolean; floating: boolean; occupiedSeats: number[]; occupiedFloats: number[] }
/** 대나무숲 정자: 가까운 정자의 좌석 상황. spotId 는 앉아 있는 정자 또는 가장 가까운 정자 */
export interface PavilionState { near: boolean; seated: boolean; occupied: number; capacity: number; available: boolean; spotId: string | null; name: string; kind: "pavilion" | "deck" | "hall" | "bench" | "pool" | "lounge" | "hearth" }
export type { BoatRideState } from "./garden-boat";
/** 자동으로 걸어간 결과: 도착 · 사용자가 직접 움직여 멈춤 · 길이 막힘 */
export type AutoWalkResult = "arrived" | "cancelled" | "blocked";
/** 1인칭(내 눈) · 3인칭(내 캐릭터 뒤 위에서 따라가는 카메라) */
export type ViewMode = "first" | "third";
export interface ContinuityView {
  view: ViewMode;
  yaw: number;
  pitch: number;
  orbitYaw: number;
  restSpot: string | null;
  skyYaw?: number;
  skyPitch?: number;
}

export interface EngineHandlers {
  /** 사람을 탭해 골랐거나(플레이어) 빈 곳을 탭해 풀었을 때(null) */
  onSelect: (player: RemotePlayer | null) => void;
  onRestChange?: (state: RestState | null) => void;
  onStargazingChange?: (state: StargazingState) => void;
  onBedChange?: (state: BedState | null) => void;
  onBenchChange?: (state: BenchState) => void;
  onBenchAction?: () => void;
  onOnsenChange?: (state: OnsenState) => void;
  onPavilionChange?: (state: PavilionState) => void;
  onPavilionAction?: () => void;
  onBunkerChange?: (state: BunkerState) => void;
  onBunkerAction?: () => void;
  /** 봄물 정원 나룻배: 잔교 가까이·타는 중·정류장 정차가 바뀔 때 */
  onBoatChange?: (state: BoatRideState) => void;
  onBoatAction?: () => void;
  /** 비 세기(0~1)가 눈에 띄게 바뀔 때 */
  onRainChange?: (rain: number) => void;
  onGuestbookRangeChange?: (near: boolean) => void;
  onGuestbookInSight?: (inSight: boolean) => void;
  onViewChange?: (view: ViewMode) => void;
  onFireRangeChange?: (near: boolean) => void;
  /** 화질을 낮췄을 때 (프레임이 떨어져서) */
  onQuality?: (level: "high" | "low") => void;
}

export interface EngineOptions {
  mapId?: MapId;
  bounds: Bounds;
  spawn: { x: number; z: number; yaw: number };
  /** 내 기본 캐릭터: 0 남자, 1 여자 (3인칭일 때 보인다) */
  skin: number;
  /** 처음 시점 (기본 1인칭) */
  view?: ViewMode;
  /** 시각을 고정해 보기 (개발용). null 이면 기기 시계 */
  hourOverride: number | null;
  /** 비를 고정해 보기 (개발용, 0~1). null 이면 서버 시각으로 정한다 */
  rainOverride?: number | null;
  handlers: EngineHandlers;
}

const FOLLOW_DISTANCE = 5.4;
const FOLLOW_DISTANCE_SEATED = 3.6;
const BED_VIEW = { headDistance: 1.42, eyeOffset: 0.16, yawLimit: 0.3, minPitch: -0.08, maxPitch: 0.18, pitch: 0 };
// Preserve the original upward framing and overview. Head motion is relative to the lying eyes,
// so a sideways drag looks across the sky instead of spinning around the world vertical axis.
const SKY_VIEW = { pitch: 1.50, minPitch: 1.40, maxPitch: 1.56, thirdMinPitch: 0.88, thirdMaxPitch: 1.50,
  headYawLimit: Math.PI / 3, headPitchLimit: Math.PI / 4 };

/** Spend extra pixels only when the camera renders the sky layer, with no terrain or shadows. */
export function beachRenderSettings(width: number, height: number, deviceRatio: number, mobile: boolean, quality: "high" | "low", skyOnly: boolean) {
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const scale = mobile ? 0.85 : quality === "low" ? 0.75 : 1;
  if (mobile && skyOnly) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    return { width: w, height: h, pixelRatio: Math.min(dpr, 2, Math.sqrt(1_500_000 / (w * h))) };
  }
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)),
    pixelRatio: quality === "low" ? 1 : Math.min(dpr, mobile ? 1.3 : 1.5) };
}

const WALK_SPEED = 3.2;
const FLOAT_SPEED = 1.35;
/** How far a floating body's feet lead its middle. */
const FLOAT_BODY_OFFSET = 0.55;
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

function avatarGeometry() {
  const geometry = new THREE.PlaneGeometry(AVATAR_HEIGHT * CHAR_ATLAS.cellW / CHAR_ATLAS.cellH, AVATAR_HEIGHT, 1, 24);
  geometry.translate(0, AVATAR_HEIGHT / 2, 0);
  return geometry;
}

/** Fold only the legs into a seated silhouette; the head and torso keep their original pixels and proportions. */
function shapeSeatedAvatar(sprite: THREE.Mesh<THREE.PlaneGeometry>, seat: { yaw: number; avatarY: number } | null) {
  const geometry = sprite.geometry;
  if (!seat && !geometry.userData.seated) return;
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  const hips = 0.72, knee = 0.35;
  for (let i = 0; i < positions.count; i++) {
    let x = (uv.getX(i) - 0.5) * AVATAR_HEIGHT * CHAR_ATLAS.cellW / CHAR_ATLAS.cellH;
    let y = uv.getY(i) * AVATAR_HEIGHT;
    if (seat) {
      const forward = Math.min(1, Math.max(0, (hips - y) / (hips - knee)));
      x += Math.sin(sprite.rotation.y - seat.yaw) * 0.36 * forward;
      y = y >= hips ? seat.avatarY + y - hips
        : y >= knee ? seat.avatarY - 0.03 * forward
          : 0.06 + y / knee * (seat.avatarY - 0.09);
    }
    positions.setXYZ(i, x, y, 0);
  }
  geometry.userData.seated = Boolean(seat);
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
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
void main() {
  // One screen triangle has no internal dome edges. Keep the ray near unit scale
  // instead of interpolating 400-unit sphere positions on mobile GPUs.
  vec3 viewRay = (inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0)).xyz;
  vDir = transpose(mat3(viewMatrix)) * viewRay;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const WORLD_VERT = `
varying vec3 vWorld;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const SEA_FRAG = `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSkyRef;
uniform vec3 uLightDir; uniform vec3 uLightColor; uniform float uSpec; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform vec3 uCamPos;
uniform sampler2D uPhoto; uniform vec3 uPhotoTint; uniform float uLantern; uniform float uDeepNight;
uniform float uUltraRadius;
varying vec3 vWorld;
${NOISE_GLSL}
float waves(vec2 p, float t) {
  return sin(p.y * 1.2 + p.x * 0.12 - t * 1.1) * 0.13
    + sin(p.x * 2.7 + p.y * 1.8 + t * 0.85) * 0.045
    + noise(p * 3.4 + vec2(t * 0.19, -t * 0.34)) * 0.09
    + noise(p * 9.1 - t * 0.23) * 0.025;
}
void main() {
  if (length(vWorld.xz) < uUltraRadius - 2.0) discard;
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

interface AvatarNode {
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  shadow: THREE.Mesh;
  avatar: BeachAvatar | null;
}

interface PlayerNode extends AvatarNode {
  data: RemotePlayer;
  label: THREE.Sprite | null;
  labelNick: string;
  cur: { x: number; z: number; yaw: number; moving: boolean };
  motion?: RemoteMotionBuffer;
  motionUpdatedAt?: number;
  motionSampleAt?: number;
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
  private lastStarView: THREE.Quaternion | null = null;
  private seaMat!: THREE.ShaderMaterial;
  /** 만 안쪽 가까운 바다 (Ultra Water). 지원하지 않는 기기·낮은 화질에선 원래 바다만 */
  private ultraSea: BeachUltraSea | null = null;
  /** 물에 들어간 사람은 굴절 패스에도 그려 물속 다리가 비친다 */
  private wading = new WeakMap<THREE.Object3D, boolean>();
  private sandMat!: THREE.MeshStandardMaterial;
  private photo: THREE.Texture | null = null;
  private assetLoads: Promise<void>[] = [];
  private cove!: Cove | UyuniWorld | BambooWorld | GardenWorld | CloudSpaWorld | BaikalWorld;
  private uyuni: UyuniWorld | null = null;
  private uyuniTextures: THREE.Texture[] = [];
  private activeBunkerId: UyuniBunkerId | null = null;
  private lastBunkerState = "";
  private bunkerClimbOffset = 0;
  private bunkerTransition: { elapsed: number; confirmed: RestPresence; swapped: boolean; resolve: () => void } | null = null;
  private bamboo: BambooWorld | null = null;
  private garden: GardenWorld | null = null;
  private cloudSpa: CloudSpaWorld | null = null;
  private cloudSpaTextures: THREE.Texture[] = [];
  private baikal: BaikalWorld | null = null;
  private baikalTextures: THREE.Texture[] = [];
  private baikalInside = false;
  private readonly baikalSeated: PavilionSeat[] = [];
  private rainOverride: number | null = null;
  private serverClockOffset: number | null = null;
  private rainNow = 0;
  private lastRainReported = -1;
  private nearGuestbook = false;
  private guestbookInSight = false;
  private festivalToys: BambooFestivalToys | null = null;
  private ownFestival?: BambooFestivalState;
  private festivalOwnPid = "self";
  private festivalClockOffset = 0;
  private festivalGrip = new THREE.Vector3();
  private mapId: MapId;
  private charTex!: THREE.Texture;
  private propTex!: THREE.Texture;
  private tinted: THREE.Material[] = [];
  private fire: CoastalFire | null = null;
  private lanterns: SkyLanterns | null = null;
  private fireworks: BeachFireworks | null = null;
  private fireworkAudio: FireworkAudio | null = null;
  private uyuniMoments: UyuniMoments | null = null;
  private momentOwnPid: string | null = null;
  private sparklerActors = new Map<string, UyuniMoment>();
  private fireState: FireState | null = null;
  private firePowder = new FirePowderPlayback();
  private nearFire = false;
  private inputPaused = false;
  /** 화면 조이스틱·외부 입력이 넣는 걷기 벡터 (x: 오른쪽, y: 앞). 키보드와 합쳐진다 */
  private move = { x: 0, y: 0 };
  /** "장작 넣기" 처럼 목적지까지 알아서 걸어가는 중 */
  private auto: { path: { x: number; z: number }[]; stop: number; cornerStop?: number; face: { x: number; z: number } | null; resolve: (r: AutoWalkResult) => void; stallT: number; detours: number } | null = null;
  /** 도착한 뒤 부드럽게 돌아볼 방향 */
  private faceGoal: { yaw: number; pitch: number } | null = null;
  private obstacles: { x: number; z: number; r: number }[] = [];
  private shadowGeo = new THREE.PlaneGeometry(0.9, 0.45);
  private shadowMat!: THREE.MeshBasicMaterial;
  private ring!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;

  private players = new Map<string, PlayerNode>();
  private remoteClock = new RemoteSnapshotClock();
  private avatarModels: BeachAvatarModels | null = null;
  private femaleAvatarModels: BeachAvatarModels | null = null;
  private onsenAvatarModels: BeachAvatarModels | null = null;
  private onsenAvatarRequested = false;
  private onsenAvatarReady = false;
  private femaleOnsenAvatarModels: BeachAvatarModels | null = null;
  private femaleOnsenAvatarRequested = false;
  private femaleOnsenAvatarReady = false;
  private pixelDepth: PixelAvatarDepth | null = null;
  private fx: FxNode[] = [];
  private careGestures: CareGestures | null = null;
  private fxTex!: Record<FxNode["kind"], THREE.Texture>;
  /** 3인칭일 때 보이는 내 캐릭터 */
  private selfNode: (AvatarNode & { animT: number }) | null = null;
  /** 관리자 미리보기: 내 화면에서만 내 캐릭터를 치비로 그린다 (방 서버에는 원래 캐릭터 그대로) */
  private chibiSelf: ChibiCharacter | null = null;
  private view: ViewMode;
  private skin: number;
  private followCam = new THREE.Vector3();
  private followSnap = true;
  /** Third-person orbit is independent of the body yaw sent to other visitors. */
  private orbitYaw: number;

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
  private floatVelocity = { x: 0, z: 0 };
  private skyLook: { yaw: number; pitch: number } | null = null;
  private beforeSkyRest: { pitch: number } | null = null;
  private lastStargazingState = "";
  private benchSeat: (typeof FIRE_BENCH_SEATS)[number] | null = null;
  private lastBenchState = "";
  private onsenSeat: (typeof ONSEN_SEATS)[number] | null = null;
  private lastOnsenState = "";
  private pavilionSeat: PavilionSeat | null = null;
  private lastPavilionState = "";

  private daylight: Daylight;
  private hourOverride: number | null;
  private lastDaylightAt = 0;

  quality: "high" | "low" = "high";
  private frameAvg = 16;
  private slowSince = 0;
  private qualityWarmupUntil = Infinity;
  private lastRender = 0;
  private skyRenderMode = false;
  private renderSize = { width: 0, height: 0, pixelRatio: 0 };
  private mobile: boolean;

  private handlers: EngineHandlers;
  private canvas: HTMLCanvasElement;
  private ready: Promise<void>;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions) {
    this.canvas = canvas;
    this.mapId = opts.mapId ?? "beach";
    this.handlers = opts.handlers;
    this.bounds = opts.bounds;
    this.hourOverride = opts.hourOverride;
    this.rainOverride = opts.rainOverride ?? null;
    this.skin = opts.skin;
    this.view = opts.view ?? "first";
    this.self = { x: opts.spawn.x, z: opts.spawn.z, yaw: opts.spawn.yaw, moving: false, pitch: 0.07, bobT: 0 };
    this.orbitYaw = opts.spawn.yaw;
    this.mobile = typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", stencil: false, depth: true });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.sortObjects = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.mapId === "beach";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(this.cameraFov(), 1, 0.1, this.mapId === "cloudspa" ? 1600 : 520);
    this.camera.rotation.order = "YXZ";
    this.daylight = this.mapDaylight();
    this.scene.fog = new THREE.Fog(0xffffff, this.daylight.fogNear, this.daylight.fogFar);

    this.buildSky();
    if (this.mapId === "baikal") {
      const wood = this.loadEnvironmentTexture("/beach/real/shelter-wood-v2.webp", true);
      const cotton = this.loadEnvironmentTexture("/beach/real/white-cotton-v1.webp", true);
      wood.wrapS = wood.wrapT = cotton.wrapS = cotton.wrapT = THREE.RepeatWrapping;
      const snow = this.loadEnvironmentTexture(this.mobile ? "/baikal/art/snow-natural-mobile-v1.webp" : "/baikal/art/snow-natural-v1.webp");
      const ice = this.loadEnvironmentTexture(this.mobile ? "/baikal/art/lake-ice-mobile-v1.webp" : "/baikal/art/lake-ice-v1.webp");
      for (const texture of [snow, ice]) {
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.anisotropy = Math.min(this.mobile ? 4 : 8, this.renderer.capabilities.getMaxAnisotropy());
      }
      this.baikalTextures = [wood, cotton, snow, ice];
      this.baikal = new BaikalWorld(this.scene, this.skyMat.uniforms, { wood, cotton, snow, ice }, this.mobile, this.renderer);
      this.cove = this.baikal;
      this.eyeHeight = baikalFloorHeight(this.self.x, this.self.z) + EYE;
      // Arrive in the storm as it is now rather than watching it build from a clear sky.
      this.rainNow = this.rainOverride ?? baikalStormAt(Date.now());
      this.baikal.setStorm(this.rainNow);
    } else if (this.mapId === "cloudspa") {
      const cloud = this.loadEnvironmentTexture(this.mobile ? "/cloudspa/art/cloud-bank-mobile-v1.webp" : "/cloudspa/art/cloud-bank-v1.webp", true);
      const cityTiles = ["nw", "ne", "sw", "se"].map(id => this.loadEnvironmentTexture(`/cloudspa/art/city-${id}-v2.webp`, true));
      for (const tile of cityTiles) tile.anisotropy = Math.min(this.mobile ? 4 : 8, this.renderer.capabilities.getMaxAnisotropy());
      const city = cityTiles[0];
      const surface = this.loadEnvironmentTexture(this.mobile ? "/cloudspa/art/cloud-surface-mobile-v1.webp" : "/cloudspa/art/cloud-surface-v1.webp", true);
      surface.wrapS = surface.wrapT = THREE.MirroredRepeatWrapping;
      surface.anisotropy = Math.min(this.mobile ? 2 : 4, this.renderer.capabilities.getMaxAnisotropy());
      const wood = this.loadEnvironmentTexture("/beach/real/shelter-wood-v2.webp", true);
      const cotton = this.loadEnvironmentTexture("/beach/real/white-cotton-v1.webp", true);
      wood.wrapS = wood.wrapT = cotton.wrapS = cotton.wrapT = THREE.RepeatWrapping;
      cloud.anisotropy = Math.min(this.mobile ? 2 : 4, this.renderer.capabilities.getMaxAnisotropy());
      this.cloudSpaTextures = [cloud, ...cityTiles, wood, cotton, surface];
      this.cloudSpa = new CloudSpaWorld(this.scene, this.skyMat.uniforms, { cloud, city, cityTiles, wood, cotton, surface }, this.mobile);
      this.cove = this.cloudSpa;
      this.eyeHeight = cloudSpaFloorHeight(this.self.x, this.self.z) + EYE;
    } else if (this.mapId === "uyuni") {
      const sand = this.loadEnvironmentTexture("/beach/real/white-sand-v1.webp", true);
      sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
      const wood = this.loadEnvironmentTexture("/beach/real/shelter-wood-v2.webp", true);
      const cotton = this.loadEnvironmentTexture("/beach/real/white-cotton-v1.webp", true);
      wood.wrapS = wood.wrapT = cotton.wrapS = cotton.wrapT = THREE.RepeatWrapping;
      this.uyuniTextures = [sand, wood, cotton];
      this.uyuni = new UyuniWorld(this.scene, this.skyMat.uniforms, sand, { wood, cotton }, { renderer: this.renderer, mobile: this.mobile });
      this.cove = this.uyuni;
    } else if (this.mapId === "bamboo") {
      const wood = this.loadEnvironmentTexture("/beach/real/shelter-wood-v2.webp", true);
      wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
      wood.repeat.set(2, 2);
      this.bamboo = new BambooWorld(this.scene, { wood }, this.mobile);
      this.cove = this.bamboo;
      this.obstacles.push(...BAMBOO_PAVILION_OBSTACLES.map((o) => ({ ...o })));
      this.obstacles.push(...BAMBOO_GUESTBOOK_OBSTACLES.map(o => ({ ...o })));
    } else if (this.mapId === "garden") {
      const wood = this.loadEnvironmentTexture("/beach/real/shelter-wood-v2.webp", true);
      wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
      wood.repeat.set(2, 2);
      // Garden artwork follows the same verified public CDN path as the other map textures.
      const landscape = this.loadEnvironmentTexture("/garden/art/spring-hills-panorama-v1.webp", false);
      const willow = this.loadEnvironmentTexture("/garden/art/willow-canopy-v1.webp", true);
      const grass = this.loadEnvironmentTexture(this.mobile ? "/garden/art/grass-natural-mobile-v1.webp" : "/garden/art/grass-natural-v1.webp", true, [1, 1]);
      grass.anisotropy = Math.min(this.mobile ? 2 : 4, this.renderer.capabilities.getMaxAnisotropy());
      this.garden = new GardenWorld(this.scene, this.skyMat.uniforms, { wood, landscape, willow, grass }, this.mobile);
      this.cove = this.garden;
      this.obstacles.push(...GARDEN_OBSTACLES.map((o) => ({ ...o })));
    } else {
      this.buildGround();
      this.cove = new Cove(this.scene, this.obstacles);
      const ridge = this.scene.getObjectByName("cove-original-ridge");
      if (this.ultraSea && ridge && !this.mobile) this.ultraSea.addRefracted(ridge);
    }
    this.avatarModels = new BeachAvatarModels();
    this.femaleAvatarModels = new BeachAvatarModels("female");
    this.onsenAvatarModels = new BeachAvatarModels("male-onsen");
    this.femaleOnsenAvatarModels = new BeachAvatarModels("female-onsen");
    // Only the selected everyday model is part of entry. Other visitors/models
    // share a lazy pool when first encountered, never preloading the whole picker.
    this.ready = Promise.all([this.loadAtlases(), this.baseAvatarPool(this.avatarKind(this.skin))?.load(), ...this.assetLoads]).then(async () => {
      if (this.disposed) return;
      this.buildProps();
      this.applyDaylight(this.daylight);
      this.baikal?.prepareRoomLight([this.sky]);
      this.updateSelfAvatar(0);
      this.updatePlayers(0);
      await this.fire?.whenReady();
      // Asset decoding and the first shader compilations are not steady-state frame costs.
      this.qualityWarmupUntil = performance.now() + 3000;
      this.frameAvg = 16;
      this.slowSince = 0;
    });
    this.applyDaylight(this.daylight);
    this.bindInput();
    this.resize();
    this.fireworkAudio = new FireworkAudio(this.camera.position, this.mapId, this.running);
    this.fireworkAudio.setBambooNight(this.daylight.deepNight);
  }

  /** 캐릭터와 배경이 준비됐을 때 */
  whenReady() {
    return this.ready;
  }

  /** Photograph only the rendered world, after every environment asset is ready. */
  async capturePhoto(): Promise<Blob> {
    await this.ready;
    if (this.disposed || this.renderer.getContext().isContextLost()) {
      throw new Error("화면이 다시 준비되면 사진을 찍어 주세요.");
    }
    return captureScenePhoto({ domElement: this.renderer.domElement, render: () => this.drawScene() }, this.scene, this.camera);
  }

  /* ---------------- 만들기 ---------------- */
  private hour() {
    if (this.hourOverride !== null) return this.hourOverride;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  }

  private buildSky() {
    this.photo = this.mapId === "uyuni" || this.mapId === "garden" || this.mapId === "cloudspa" || this.mapId === "baikal" ? null : this.loadEnvironmentTexture("/beach/real/paradise-panorama-v1.webp", false);
    if (this.photo) this.photo.wrapS = THREE.RepeatWrapping;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhoto: { value: this.photo }, uPhotoTint: { value: new THREE.Vector3(1, 1, 1) },
        uStars: { value: 0 }, uTime: { value: 0 }, uLantern: { value: 0 },
        uStarMotion: { value: 0 },
        uDeepNight: { value: 0 }, uSkyTop: { value: new THREE.Vector3() }, uSkyHorizon: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Vector3() },
        uCloudColor: { value: new THREE.Vector3() }, uCloudAmount: { value: 0.45 },
        uHorizonFog: { value: new THREE.Vector3(0.5, 0.6, 0.4) },
        uBambooSunset: { value: 0 },
        uStorm: { value: 0 }, uAurora: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: this.mapId === "baikal" ? BAIKAL_SKY_FRAGMENT : this.mapId === "cloudspa" ? CLOUD_SPA_SKY_FRAGMENT : this.mapId === "uyuni" ? UYUNI_SKY_FRAGMENT : this.mapId === "bamboo" ? BAMBOO_SKY_FRAGMENT : this.mapId === "garden" ? GARDEN_SKY_FRAGMENT : SKY_FRAGMENT,
      depthWrite: false,
      // The forest canopy covers most of the sky: draw it after the opaque world at the far plane, so covered pixels are rejected early.
      depthTest: this.mapId === "bamboo",
      depthFunc: THREE.LessEqualDepth,
      toneMapped: false,
    });
    const skyGeometry = new THREE.BufferGeometry();
    skyGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    skyGeometry.setIndex([0, 1, 2]);
    this.sky = new THREE.Mesh(skyGeometry, this.skyMat);
    this.sky.renderOrder = this.mapId === "bamboo" ? 90 : -10;
    this.sky.frustumCulled = false;
    this.sky.layers.enable(1); // Sky-only camera excludes every hut, cliff and avatar.
    this.scene.add(this.sky);
  }

  private loadEnvironmentTexture(path: string, srgb = true, repeat?: [number, number]) {
    let complete!: () => void;
    let fail!: (error: unknown) => void;
    this.assetLoads.push(new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
    const texture = assetLoader(new THREE.TextureLoader()).load(assetUrl(path), complete, undefined, fail);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); }
    return texture;
  }

  private buildGround() {
    try {
      if (BeachUltraSea.supported(this.renderer)) {
        this.ultraSea = new BeachUltraSea(this.renderer, this.scene, { photo: this.photo, photoTint: this.skyMat.uniforms.uPhotoTint, tier: this.mobile ? "mobile" : "high", skyFragment: SKY_FRAGMENT, skyUniforms: this.skyMat.uniforms });
      }
    } catch (error) {
      console.warn("[beach] 가까운 바다를 시작하지 못해 원래 바다로 그립니다", error);
      this.ultraSea = null;
    }
    const ultra = this.ultraSea;
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
      if (ultra) {
        // 가까운 바다와 같은 해안 지도·시간으로: 물이 모래 위로 찰랑 올라왔다 빠지는 막, 젖은 자국, 물속 코스틱
        Object.assign(shader.uniforms, ultra.sandUniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + SAND_SHORE_PARS)
          .replace("#include <map_fragment>", "#include <map_fragment>\n" + SAND_SHORE_ALBEDO)
          .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + SAND_SHORE_CAUSTICS);
        return;
      }
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\nfloat wetSand = 1.0 - smoothstep(-0.8, 2.8, vCoastWorld.z);\ndiffuseColor.rgb *= 1.0 - wetSand * 0.3;");
    };
    // 걷는 모래(z ≥ -1.2)는 그대로, 그 앞은 물가로 기울어 얕은 바다 바닥으로 이어진다 (무늬 좌표는 예전 평면과 같다).
    // 사람이 그 경사를 따라 물에 걸어 들어간다 (deckHeight).
    const sand = new THREE.Mesh(beachSandGeometry(), this.sandMat);
    ultra?.addRefracted(sand);
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
        uUltraRadius: { value: ultra ? ULTRA_RADIUS : 0 },
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
    const loader = assetLoader(new THREE.TextureLoader());
    const [chars, props] = await Promise.all([loader.loadAsync(assetUrl("/beach/chars-v2.png")), loader.loadAsync(assetUrl("/beach/props.png"))]);
    if (this.disposed) {
      chars.dispose();
      props.dispose();
      return;
    }
    this.charTex = pixelTexture(chars, true);
    this.pixelDepth = new PixelAvatarDepth(this.charTex, AVATAR_HEIGHT);
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

  /** The atlas also provides a fallback while the 3D model is unavailable. */
  private createSelfAvatar() {
    const tex = this.charTex.clone();
    tex.repeat.set(1 / CHAR_ATLAS.cols, 1 / CHAR_ATLAS.rows);
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.1, depthWrite: true, toneMapped: false });
    mat.color.setRGB(this.daylight.tint[0], this.daylight.tint[1], this.daylight.tint[2], THREE.SRGBColorSpace);
    if (this.activeBunkerId) mat.color.setHex(0xffffff);
    const geometry = avatarGeometry();
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
    return { sprite, mat, tex, shadow, avatar: null, animT: 0 };
  }

  private avatarKind(skin: number): AvatarKind {
    // Retired IDs in cached room snapshots retain their ordinary gender.
    return skin === 1 || skin === 3 || skin === 5 ? "female" : "male";
  }

  private baseAvatarPool(kind: AvatarKind) {
    return kind === "female" ? this.femaleAvatarModels : this.avatarModels;
  }

  /** 물가 안쪽으로 들어간 사람만 굴절 레이어에 (바뀔 때만 훑는다) */
  private markWading(root: THREE.Object3D | undefined, z: number) {
    if (!root || !this.ultraSea) return;
    const wading = z < -0.6;
    if (this.wading.get(root) === wading) return;
    this.wading.set(root, wading);
    root.traverse((o) => { if (wading) o.layers.enable(REFRACT_LAYER); else o.layers.disable(REFRACT_LAYER); });
  }

  private syncAvatar(node: AvatarNode, skin: number, x: number, z: number) {
    // Older saved rooms used rows 1/2 for pixel women/men. Keep their gender,
    // but render the same 3D characters offered by the current picker.
    const baseKind = this.avatarKind(skin);
    const female = baseKind === "female";
    const basePool = this.baseAvatarPool(baseKind);
    // A transient first download failure must not leave a pixel fallback for
    // the entire visit. The pool shares pending requests and enforces its cooldown.
    if (!basePool?.ready && basePool?.canLoad) void basePool.load();
    const robeKind = female ? "female-onsen" : "male-onsen";
    const radius = hotSpringBathDistance(x, z);
    const wearingRobe = node.avatar?.kind === robeKind;
    const wantsRobe = (this.mapId === "cloudspa"
      ? CLOUD_SPA_POOLS.some(pool => Math.hypot(x - pool.x, z - pool.z) < pool.radius + (wearingRobe ? 1.5 : .7))
      : this.mapId === "beach" && radius <= (wearingRobe ? 7.65 : 7.05)
        && (hotSpringFloorHeight(x, z) ?? -Infinity) >= HOT_SPRING.floorY - 0.01);
    const robePool = female ? this.femaleOnsenAvatarModels : this.onsenAvatarModels;
    if (wantsRobe && robePool?.canLoad && !(female ? this.femaleOnsenAvatarRequested : this.onsenAvatarRequested)) {
      if (female) this.femaleOnsenAvatarRequested = true;
      else this.onsenAvatarRequested = true;
      void robePool.load().then(() => {
        if (this.disposed) return;
        if (female) {
          this.femaleOnsenAvatarReady = robePool.ready;
          this.femaleOnsenAvatarRequested = robePool.ready;
        } else {
          this.onsenAvatarReady = robePool.ready;
          this.onsenAvatarRequested = robePool.ready;
        }
      });
    }
    const kind = wantsRobe && (female ? this.femaleOnsenAvatarReady : this.onsenAvatarReady) ? robeKind : baseKind;
    if (node.avatar?.kind === kind) return node.avatar;
    const pool = kind === robeKind ? robePool : basePool;
    let next = kind ? pool?.create() ?? null : null;
    // Keep the matching everyday character visible while the optional robe loads.
    if (!next && kind === robeKind && node.avatar?.kind === baseKind) return node.avatar;
    if (!next && kind === robeKind) next = basePool?.create() ?? null;
    node.avatar?.dispose();
    node.avatar = next;
    if (next) {
      this.scene.add(next.root);
    }
    return node.avatar;
  }

  /* ---------------- 시점 ---------------- */
  get viewMode() {
    return this.view;
  }

  private cameraFov() {
    return this.view === "first" ? (this.mobile ? 82 : 78) : (this.mobile ? 68 : 62);
  }

  setView(view: ViewMode) {
    if (this.disposed || view === this.view) return;
    if (view === "third") this.orbitYaw = this.self.yaw;
    else this.self.yaw = this.orbitYaw;
    this.view = view;
    if (this.uyuni && this.restSeat) {
      // The sofa backs onto the curved shell: view it from the open room, not from inside its backrest.
      if (view === "third") this.orbitYaw = this.restSeat.yaw + Math.PI;
      else this.self.yaw = this.restSeat.yaw;
    }
    this.camera.fov = this.cameraFov();
    this.camera.updateProjectionMatrix();
    if (this.isBedLying) {
      this.self.yaw = view === "first" ? 0 : this.skyRest!.yaw;
      this.self.pitch = view === "first" ? BED_VIEW.pitch : 1.25;
    } else if (this.floating) {
      this.self.pitch = view === "first" ? 0.05 : 0.5;
    } else if (this.skyRest && view === "first") {
      this.self.pitch = SKY_VIEW.pitch;
      this.skyLook = { yaw: 0, pitch: 0 };
    }
    this.followSnap = true;
    this.handlers.onViewChange?.(view);
  }

  toggleView() {
    this.setView(this.view === "first" ? "third" : "first");
  }

  /** Only the local confirmed launch opens a readable front view of the drawing. */
  showSparklerDrawing() {
    if (this.disposed || this.mapId !== "uyuni" || this.skyRest || this.fixedSeat || this.restSeat) return;
    this.setView("third");
    this.orbitYaw = this.self.yaw + Math.PI;
    this.followSnap = true;
  }

  /**
   * 관리자 미리보기용 치비. 내 화면에서만 원래 아바타 대신 그리고, 위치·좌석·제스처는 원래 아바타가 그대로 맡는다.
   * 앉거나 누운 자세는 아직 치비 포즈가 없어 원래 아바타로 돌아간다. 해제(null)하면 원래 아바타만 남는다.
   * 지오메트리·재질은 넘겨준 쪽이 정리한다.
   */
  setChibiSelf(character: ChibiCharacter | null) {
    if (this.disposed || character === this.chibiSelf) return;
    this.chibiSelf?.object.removeFromParent();
    this.chibiSelf = character;
    if (character) {
      character.resetFollow();
      character.object.visible = false;
      const t = this.daylight.tint;
      character.setTint(t[0], t[1], t[2]);
      this.scene.add(character.object);
    }
  }

  /** Stable IDs select either model or either atlas row without rejoining the room. */
  setSkin(skin: number) {
    if (this.disposed || !Number.isInteger(skin) || skin < 0 || skin > 6) return;
    this.skin = skin === 4 || skin === 6 ? 0 : skin === 5 ? 3 : skin;
  }

  private buildProps() {
    if (this.mapId !== "beach") {
      if (!this.bamboo && !this.garden && !this.cloudSpa && !this.baikal) buildStargazingZone(this.scene);
      this.updateStargazingState();
      return;
    }
    this.fire = new CoastalFire(this.scene, FIRE.x, FIRE.z);
    this.fire.setState(this.fireState?.logs ?? 0, this.fireState?.color ?? "amber");
    this.obstacles.push({ x: FIRE.x, z: FIRE.z, r: 1.35 });
    this.lanterns = new SkyLanterns(this.scene, this.mobile ? 16 : 22);
    this.lanterns.setAmount(this.daylight.lanterns);
    buildStargazingZone(this.scene);
    this.updateStargazingState();
  }

  setFireState(state: FireState) {
    if (this.mapId !== "beach" || !state || !Number.isFinite(state.logs)) return;
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

  /** Confirmed room events are shared; the effects module deduplicates their IDs. */
  applyFireworks(events: FireworkEvent[], serverTime: number) {
    if (this.disposed || this.activeBunkerId || (!this.fireworks && events.length === 0)) return;
    this.fireworks ??= new BeachFireworks(this.scene, {
      mobile: this.mobile,
      grand: true,
      reflectWater: this.mapId === "uyuni",
      ...(this.mapId === "bamboo" ? { summitDisplay: true } : {}),
    }, this.fireworkAudio ?? undefined);
    this.fireworks.apply(events, serverTime);
  }

  get fireworksMuted() { return this.fireworkAudio?.muted ?? false; }
  setFireworksMuted(muted: boolean) { this.fireworkAudio?.setMuted(muted); }
  get fieldVolume() { return this.fireworkAudio?.fieldVolume ?? 50; }
  setFieldVolume(percent: number) { this.fireworkAudio?.setFieldVolume(percent); }
  get uyuniMusicVolume() { return this.fireworkAudio?.uyuniMusicVolume ?? 25; }
  setUyuniMusicVolume(percent: number) { this.fireworkAudio?.setUyuniMusicVolume(percent); }
  setRoomMusicPlaying(playing: boolean) { this.fireworkAudio?.setRoomMusicPlaying(playing); }
  setBoardGames(games: readonly BoardGame[]) { this.uyuni?.setBoardGames(games); }

  setOwnFestival(state: BambooFestivalState | undefined, serverTime: number, ownPid?: string) {
    if (!this.bamboo || this.disposed) return;
    this.ownFestival = state;
    if (ownPid) this.festivalOwnPid = ownPid;
    this.festivalClockOffset = serverTime - performance.now();
    if (state?.held || state?.flight) this.prepareFestival(state.flight, serverTime);
  }

  private prepareFestival(flight: PropellerFlight | null, serverTime: number) {
    this.festivalToys ??= new BambooFestivalToys(this.scene, (x, z) => this.deckHeight(x, z));
    if (flight) this.festivalToys.launch({ ...flight, y: this.deckHeight(flight.x, flight.z) + 0.85 }, serverTime);
  }

  private drawFestivalToy(pid: string, node: AvatarNode | null, state: BambooFestivalState | undefined,
    pose: { x: number; z: number; yaw: number }, now: number, firstPerson = false) {
    if (!state?.held || !node || !this.festivalToys) return;
    if (state.held === "propeller" && state.flight && now < state.flight.startedAt + state.flight.durationMs) return;
    const grip = this.festivalGrip;
    if (!firstPerson && !node.avatar?.getSparklerGrip(grip)) {
      grip.set(pose.x + Math.cos(pose.yaw) * 0.24, this.deckHeight(pose.x, pose.z) + 0.78, pose.z - Math.sin(pose.yaw) * 0.24);
    }
    this.festivalToys.hold(state.held, grip, pose.yaw, pid, firstPerson ? this.camera : undefined, state.balloonHue ?? undefined);
  }

  applyGardenMoments(events: GardenMoment[], serverTime: number) {
    if (!this.disposed && this.mapId === "garden") this.garden?.applyMoments(events, serverTime);
  }

  applyUyuniMoments(events: UyuniMoment[], serverTime: number, ownPid?: string) {
    if (this.disposed || this.activeBunkerId || this.mapId !== "uyuni" || (!this.uyuniMoments && events.length === 0)) return;
    this.momentOwnPid = ownPid ?? null;
    this.sparklerActors.clear();
    for (const event of events) if (event.kind === "sparkler") {
      const prior = this.sparklerActors.get(event.fromPid);
      if (!prior || event.startedAt > prior.startedAt || (event.startedAt === prior.startedAt && event.id > prior.id)) this.sparklerActors.set(event.fromPid, event);
    }
    this.uyuniMoments ??= new UyuniMoments(this.scene, {
      floorHeight: uyuniHotelFloorHeight,
      poseSparkler: (pid, _tip, age, gripTarget) => this.poseSparkler(pid, age, gripTarget),
    });
    this.uyuniMoments.setQuality(this.quality);
    this.uyuniMoments.apply(events, serverTime);
  }

  private poseSparkler(pid: string, age: number, gripTarget: THREE.Vector3) {
    if (this.disposed || this.mapId !== "uyuni") return null;
    const event = this.sparklerActors.get(pid);
    if (!event) return null;
    const isSelf = pid === this.momentOwnPid, remote = isSelf ? null : this.players.get(pid);
    const actor = isSelf ? this.selfNode?.avatar : remote?.avatar;
    const state = isSelf ? this.self : remote?.cur;
    if (!actor || !state || state.moving || (remote?.target.moving ?? false)
      || (isSelf ? this.skyRest || this.fixedSeat || this.restSeat : remote?.data.pose === "lying" || remote?.data.pose === "sitting")
      || Math.hypot(state.x - event.x, state.z - event.z) > 0.8) return null;
    const turn = state.yaw - event.yaw;
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > Math.PI / 2) return null;
    // The renderer bounds rod length. A wide sweep is still a valid hand pose.
    return actor.poseSparkler(gripTarget, age);
  }

  /** 화면 조이스틱 입력 (-1~1, y 는 앞으로가 양수). 손을 떼면 (0, 0) */
  setMove(x: number, y: number) {
    if (this.inputPaused || this.bunkerTransition || this.anchored) return;
    this.move.x = Math.max(-1, Math.min(1, x || 0));
    this.move.y = Math.max(-1, Math.min(1, y || 0));
  }

  /** 모닥불 앞(돌 둘레 바깥, 장작을 넣을 수 있는 거리 안)까지 알아서 걸어가 불을 바라본다 */
  walkToFire(): Promise<AutoWalkResult> {
    if (this.mapId !== "beach") return Promise.resolve("cancelled");
    if (this.disposed || this.skyRest || this.fixedSeat) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    const stand = this.camera.aspect < 0.75 ? 4.2 : 3.2;
    const target = findClearApproach(this.self, FIRE, stand, this.obstacles, SHELTER_COLLIDERS, this.bounds);
    if (!target) return Promise.resolve("blocked");
    return this.walkTo(target, { x: FIRE.x, z: FIRE.z });
  }

  /** Approach the shared circle. Claiming a mat still requires the server's response. */
  walkToStargazing(): Promise<AutoWalkResult> {
    if (this.disposed || this.activeBunkerId || this.bamboo || this.garden || this.cloudSpa || this.baikal || this.skyRest || this.fixedSeat) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    const target = stargazingApproach(this.self.x, this.self.z);
    if (this.uyuni) {
      const path = findWalkingPath(this.self, target, this.obstacles, UYUNI_HOTEL_COLLIDERS, this.bounds, 12);
      if (!path) return Promise.resolve("blocked");
      const arrival = this.walkTo(target, { x: STARGAZING.x, z: STARGAZING.z });
      if (this.auto) { this.auto.path = path; this.auto.cornerStop = 0.06; }
      return arrival;
    }
    return this.walkTo(target, { x: STARGAZING.x, z: STARGAZING.z });
  }

  walkToBed(spotId: string): Promise<AutoWalkResult> {
    if (this.activeBunkerId || this.bamboo || this.garden || this.cloudSpa || this.baikal) return Promise.resolve("cancelled");
    if (this.uyuni) {
      const hotel = uyuniHotelForSpot(spotId);
      if (this.disposed || this.skyRest || this.fixedSeat || !hotel) return Promise.resolve("cancelled");
      if (this.restSeat) this.standUp();
      const target = { x: hotel.x, z: hotel.z + 0.3 };
      const path = findWalkingPath(this.self, target, this.obstacles, UYUNI_HOTEL_COLLIDERS, this.bounds, 12);
      if (!path) return Promise.resolve("blocked");
      const arrival = this.walkTo(target, { x: hotel.x, z: hotel.z + 2.5 });
      if (this.auto) { this.auto.path = path; this.auto.cornerStop = 0.06; }
      return arrival;
    }
    const shelter = SHELTERS.find((s) => `hut-${s.id}` === spotId);
    if (this.disposed || this.skyRest || this.fixedSeat || !shelter) return Promise.resolve("cancelled");
    if (this.restSeat) this.standUp();
    const bed = bedSlot(spotId, 1)!;
    const target = { x: bed.x, z: bed.z - 1.2 };
    // Walls outside the search window cannot change this route, and the rear baths would slow every plan.
    const front = Math.min(this.self.z, target.z) - 8, back = Math.max(this.self.z, target.z) + 8;
    const nearby = HOT_SPRING_COLLIDERS.filter(wall => wall.maxZ >= front && wall.minZ <= back);
    const path = findWalkingPath(this.self, target, this.obstacles, [...SHELTER_COLLIDERS, ...nearby], this.bounds);
    if (!path) return Promise.resolve("blocked");
    const arrival = this.walkTo(target, { x: bed.x, z: bed.z + 1 });
    if (this.auto) { this.auto.path = path; this.auto.cornerStop = 0.06; }
    return arrival;
  }

  cancelAutoWalk() {
    this.cancelAuto("cancelled");
    this.self.moving = false;
    this.faceGoal = null;
  }

  get isLying() { return Boolean(this.skyRest); }
  private get floating() { return this.skyRest?.spotId === "onsen-float"; }
  /** Held in place by a seat or a mat. A floating visitor keeps moving. */
  private get anchored() { return Boolean((this.skyRest && !this.floating) || this.fixedSeat); }
  private get skyOnlyView() { return Boolean(this.skyRest && !this.isBedLying && !this.floating && this.view === "first"); }
  get isBenchSeated() { return Boolean(this.benchSeat); }
  get isPavilionSeated() { return Boolean(this.pavilionSeat); }
  get isBedLying() { return Boolean(this.skyRest?.spotId.startsWith("hut-") || uyuniHotelForSpot(this.skyRest?.spotId)); }
  private get fixedSeat() { return this.onsenSeat ?? this.benchSeat ?? this.pavilionSeat ?? null; }
  private floatingPose(slot: StargazingSlot | null): StargazingSlot | null {
    if (slot?.spotId !== "onsen-float") return slot;
    // x, z and yaw describe the middle of the body and where it is heading. The feet lead and the head trails.
    const head = slot.yaw + Math.PI, t = this.time, i = slot.slot;
    return { ...slot, yaw: head,
      x: slot.x + Math.sin(head) * FLOAT_BODY_OFFSET + Math.sin(t * 0.37 + i) * 0.05,
      z: slot.z + Math.cos(head) * FLOAT_BODY_OFFSET + Math.cos(t * 0.29 + i * 1.3) * 0.05,
      avatarY: onsenFloatingY(t, i), roll: Math.sin(t * 0.6 + i) * 0.05 };
  }

  get bunkerId(): UyuniBunkerId | null { return this.activeBunkerId; }

  get bunkerState(): BunkerState {
    const room = bunkerById(this.activeBunkerId);
    const nearby = this.uyuni && !room && !this.skyRest && !this.fixedSeat && !this.restSeat ? nearbyBunkerEntry(this.self.x, this.self.z) : null;
    const used = new Set<number>();
    if (room) for (const player of this.players.values()) {
      const seat = claimedBunkerSeat(player.data);
      if (seat?.spotId === room.spotId) used.add(seat.slot);
    }
    const seated = Boolean(room && this.pavilionSeat?.spotId === room.spotId);
    if (seated && this.pavilionSeat) used.add(this.pavilionSeat.slot);
    return { bunkerId: room?.id ?? null, nearId: nearby?.id ?? null, name: room?.name ?? nearby?.name ?? "",
      inside: Boolean(room), ladderNear: Boolean(room && !seated && nearbyBunkerLadder(room.id, this.self.x, this.self.z)),
      sofaNear: Boolean(room && (seated || nearbyBunkerSofa(room.id, this.self.x, this.self.z))), seated,
      spotId: room?.spotId ?? null, gameNearId: room && !seated ? nearbyBunkerGame(room.id, this.self.x, this.self.z)?.id ?? null : null,
      occupied: used.size, capacity: BUNKER_SEAT_CAPACITY,
      available: Boolean(room && !seated && BUNKER_SEATS.some(seat => seat.spotId === room.spotId && !used.has(seat.slot)
        && Math.hypot(this.self.x - seat.x, this.self.z - seat.z) <= BUNKER_SEAT_REACH)) };
  }

  private updateBunkerState() {
    if (!this.uyuni) return;
    const state = this.bunkerState, key = JSON.stringify(state);
    if (key === this.lastBunkerState) return;
    this.lastBunkerState = key;
    this.handlers.onBunkerChange?.(state);
  }

  private setBunkerLayer(id: UyuniBunkerId | null) {
    if (!this.uyuni || (this.activeBunkerId ?? null) === id) return false;
    this.activeBunkerId = id;
    this.uyuni.setBunkerActive(id);
    this.sky.visible = !id;
    this.fireworkAudio?.setSceneRunning(!id && this.running);
    this.uyuniMoments?.dispose(); this.uyuniMoments = null; this.sparklerActors.clear();
    this.fireworks?.dispose(); this.fireworks = null;
    for (const node of this.players.values()) this.removePlayer(node);
    this.players.clear(); this.select(null);
    this.remoteClock?.resetPlayback();
    this.applyDaylight(this.daylight);
    this.followSnap = true;
    return true;
  }

  /** Server-confirmed floor change, with ladder motion under the UI fade. */
  transitionBunker(confirmed: RestPresence): Promise<void> {
    if (this.disposed || !this.uyuni) return Promise.resolve();
    this.cancelBunkerTransition();
    this.keys.clear(); this.move = { x: 0, y: 0 }; this.cancelAutoWalk(); this.faceGoal = null;
    if (!this.running || (confirmed.bunkerId ?? null) === this.activeBunkerId) { this.applyRest(confirmed); return Promise.resolve(); }
    return new Promise(resolve => { this.bunkerTransition = { elapsed: 0, confirmed, swapped: false, resolve }; });
  }

  private cancelBunkerTransition() {
    const transition = this.bunkerTransition;
    this.bunkerTransition = null; this.bunkerClimbOffset = 0;
    transition?.resolve();
  }

  get onsenState(): OnsenState {
    if (this.mapId !== "beach") return { inWater: false, canSit: false, canFloat: false, sitting: false, floating: false, occupiedSeats: [], occupiedFloats: [] };
    const seats = new Set<number>(), floats = new Set<number>();
    for (const player of this.players.values()) {
      const seat = claimedOnsenSeat(player.data), floating = claimedOnsenFloat(player.data);
      if (seat) seats.add(seat.slot);
      if (floating) floats.add(floating.slot);
    }
    if (this.onsenSeat) seats.add(this.onsenSeat.slot);
    const floating = this.skyRest?.spotId === "onsen-float";
    if (floating) floats.add(this.skyRest!.slot);
    const inWater = hotSpringInWater(this.self.x, this.self.z);
    // The seat counters describe the bath the visitor is in, not all of them together.
    const bath = hotSpringBathIndex(this.self.x, this.self.z);
    const here = (slot: number, perBath: number) => bath < 0 || Math.floor(slot / perBath) === bath;
    const available = inWater && !this.skyRest && !this.fixedSeat;
    const nearby = (slot: { x: number; z: number }) => Math.hypot(this.self.x - slot.x, this.self.z - slot.z) <= ONSEN_REST_REACH;
    return { inWater, sitting: Boolean(this.onsenSeat), floating,
      canSit: Boolean(available && ONSEN_SEATS.some(slot => !seats.has(slot.slot) && nearby(slot))),
      canFloat: Boolean(available && bath >= 0 && ONSEN_FLOATS.some(slot => here(slot.slot, ONSEN_FLOATS_PER_BATH) && !floats.has(slot.slot))),
      occupiedSeats: [...seats].filter(slot => here(slot, ONSEN_SEATS_PER_BATH)).sort((a, b) => a - b),
      occupiedFloats: [...floats].filter(slot => here(slot, ONSEN_FLOATS_PER_BATH)).sort((a, b) => a - b) };
  }

  private updateOnsenState() {
    const state = this.onsenState, key = JSON.stringify(state);
    if (key === this.lastOnsenState) return;
    this.lastOnsenState = key;
    this.handlers.onOnsenChange?.(state);
  }

  getBenchState(): BenchState {
    if (this.mapId !== "beach") return { near: false, seated: false, occupied: 0, capacity: 0, available: false };
    const used = new Set<number>();
    for (const player of this.players.values()) {
      const seat = claimedFireBenchSlot(player.data);
      if (seat) used.add(seat.slot);
    }
    if (this.benchSeat) used.add(this.benchSeat.slot);
    const nearby = FIRE_BENCH_SEATS.filter((seat) => Math.hypot(this.self.x - seat.x, this.self.z - seat.z) <= FIRE_BENCH_REACH);
    return { near: !this.skyRest && nearby.length > 0, seated: Boolean(this.benchSeat), occupied: used.size,
      capacity: FIRE_BENCH_SEATS.length, available: nearby.some((seat) => !used.has(seat.slot)) };
  }

  private updateBenchState() {
    const state = this.getBenchState();
    const key = `${state.near}:${state.seated}:${state.occupied}:${state.available}`;
    if (key === this.lastBenchState) return;
    this.lastBenchState = key;
    this.handlers.onBenchChange?.(state);
  }

  /** 가까운 정자(또는 앉아 있는 정자)의 좌석 상황. 좌석은 서버가 배정하므로 여기서는 보이는 사람들로만 센다 */
  getPavilionState(): PavilionState {
    const empty: PavilionState = { near: false, seated: false, occupied: 0, capacity: PAVILION_SEAT_CAPACITY, available: false, spotId: null, name: "", kind: "pavilion" };
    if (!this.bamboo && !this.garden && !this.cloudSpa && !this.baikal) return empty;
    const layout = this.seatLayout();
    const pavilion = this.pavilionSeat ? layout.forSpot(this.pavilionSeat.spotId) : layout.nearby(this.self.x, this.self.z);
    if (!pavilion) return empty;
    const used = new Set<number>();
    for (const player of this.players.values()) {
      const seat = layout.claimed(player.data);
      if (seat?.spotId === pavilion.spotId) used.add(seat.slot);
    }
    if (this.pavilionSeat?.spotId === pavilion.spotId) used.add(this.pavilionSeat.slot);
    const reachable = layout.seats.filter((seat) => seat.spotId === pavilion.spotId && Math.hypot(this.self.x - seat.x, this.self.z - seat.z) <= (this.cloudSpa ? CLOUD_SPA_SEAT_REACH : this.baikal ? BAIKAL_SEAT_REACH : PAVILION_REACH));
    return { near: !this.skyRest && (reachable.length > 0 || Boolean(this.pavilionSeat)), seated: Boolean(this.pavilionSeat), occupied: used.size,
      capacity: layout.seats.filter(seat => seat.spotId === pavilion.spotId).length, available: reachable.some((seat) => !used.has(seat.slot)), spotId: pavilion.spotId, name: pavilion.name, kind: pavilion.kind };
  }

  setGuestbookEntries(entries: readonly BambooNote[]) { this.bamboo?.setGuestbookEntries(entries); }

  /** 정자(대나무숲) 또는 청우헌 단·연향정(봄물 정원)의 좌석 표. 두 지도의 자리는 같은 모양이라 같은 코드로 다룬다. */
  private seatLayout() {
    if (this.cloudSpa) return { seats: CLOUD_SPA_SEATS, forSpot: cloudSpaForSpot, nearby: nearbyCloudSpaPlace, claimed: claimedCloudSpaSeat };
    if (this.baikal) return { seats: BAIKAL_SEATS, forSpot: baikalForSpot, nearby: nearbyBaikalPlace, claimed: claimedBaikalSeat };
    if (this.garden) {
      return { seats: GARDEN_SEATS, forSpot: gardenPavilionForSpot, nearby: nearbyGardenPavilion, claimed: claimedGardenSeat };
    }
    return { seats: BAMBOO_PAVILION_SEATS, forSpot: bambooPavilionForSpot, nearby: nearbyBambooPavilion, claimed: claimedPavilionSeat };
  }

  /* ---------------- 봄물 정원: 나룻배 · 비 ---------------- */
  get boatState(): BoatRideState | null { return this.garden?.boatState ?? null; }
  get isRiding() { return this.garden?.isRiding === true; }
  get rainAmount() { return this.rainNow; }

  /** 잔교 끝에서 타기 · 떠가는 중엔 다음 정류장에서 내리기 예약(다시 누르면 취소) · 정류장에 서 있으면 바로 내리기 */
  toggleBoat(): "boarded" | "armed" | "alighted" | null {
    if (!this.garden || this.disposed || this.fixedSeat || this.skyRest) return null;
    if (this.garden.isRiding) {
      const result = this.garden.alightBoat();
      if (result === "armed") { this.handlers.onBoatChange?.(this.garden.boatState); return "armed"; }
      if (result) { this.finishRide(result); this.handlers.onBoatChange?.(this.garden.boatState); return "alighted"; }
      return null;
    }
    const stop = this.garden.boardBoat();
    if (!stop) return null;
    this.cancelAutoWalk(); this.faceGoal = null;
    if (this.restSeat) this.standUp();
    this.self.pitch = 0.02;
    this.followSnap = true;
    this.handlers.onBoatChange?.(this.garden.boatState);
    return "boarded";
  }

  /** 정류장 잔교 끝에 내려서 뭍 쪽을 본다. */
  private finishRide(stop: BoatStop) {
    const pier = GARDEN_PIERS.find((p) => p.id === stop.pierId);
    if (!pier) return;
    const end = pierEnd(pier);
    this.self.x = end.x - pier.dx * 0.7; this.self.z = end.z - pier.dz * 0.7;
    this.self.yaw = Math.atan2(pier.dx, pier.dz);
    this.orbitYaw = this.self.yaw;
    this.self.moving = false;
    this.eyeHeight = PIER_Y + EYE;
    this.followSnap = true;
  }

  setRainOverride(amount: number | null) {
    if (this.disposed || (this.mapId !== "garden" && this.mapId !== "baikal")) return;
    this.rainOverride = amount === null || !Number.isFinite(amount) ? null : THREE.MathUtils.clamp(amount, 0, 1);
  }

  /** Garden rain and the Baikal blizzard share one eased weather value, scheduled on server time unless overridden. */
  private updateRain() {
    if (!this.garden && !this.baikal) return;
    const serverNow = this.serverClockOffset === null ? Date.now() : performance.now() + this.serverClockOffset;
    const target = this.rainOverride ?? (this.baikal ? baikalStormAt(serverNow) : gardenRainAt(serverNow));
    this.rainNow += (target - this.rainNow) * 0.02;
    if (Math.abs(this.rainNow - target) < 0.002) this.rainNow = target;
    this.garden?.setRain(this.rainNow);
    this.baikal?.setStorm(this.rainNow);
    const inside = this.baikal ? insideBaikalCabin(this.self.x, this.self.z) : false;
    const insideChanged = inside !== this.baikalInside; this.baikalInside = inside;
    if (insideChanged || Math.abs(this.rainNow - this.lastRainReported) > 0.05 || (this.rainNow === 0) !== (this.lastRainReported === 0)) {
      this.lastRainReported = this.rainNow;
      this.handlers.onRainChange?.(this.rainNow);
      this.applyFogDistances();
    }
  }

  /** Fog near/far per map: the forest, garden, cloud spa and Baikal own theirs; rain and the storm pull them in, the cabin opens them up. */
  private applyFogDistances() {
    const fog = this.scene.fog as THREE.Fog, d = this.daylight;
    if (this.baikal) {
      this.baikal.applyFog(d, this.baikalInside);
      fog.near = this.baikal.fogNear; fog.far = this.baikal.fogFar;
    } else if (this.garden) {
      fog.near = d.fogNear * (1 - this.rainNow * 0.3); fog.far = d.fogFar * (1 - this.rainNow * 0.4);
    } else if (this.bamboo || this.cloudSpa) {
      fog.near = d.fogNear; fog.far = d.fogFar;
    } else {
      fog.near = 70; fog.far = 270;
    }
    if (this.activeBunkerId) { fog.near = 80; fog.far = 120; }
  }

  private updatePavilionState() {
    if (!this.bamboo && !this.garden && !this.cloudSpa && !this.baikal) return;
    if (this.bamboo) {
      const inSight = Math.hypot(this.self.x - BAMBOO_GUESTBOOK.x, this.self.z - BAMBOO_GUESTBOOK.z) < 30;
      if (inSight !== this.guestbookInSight) {
        this.guestbookInSight = inSight;
        this.handlers.onGuestbookInSight?.(inSight);
      }
      const near = isNearBambooGuestbook(this.self.x, this.self.z);
      if (near !== this.nearGuestbook) {
        this.nearGuestbook = near;
        this.handlers.onGuestbookRangeChange?.(near);
      }
    }
    const state = this.getPavilionState();
    const key = `${state.spotId}:${state.near}:${state.seated}:${state.occupied}:${state.available}`;
    if (key === this.lastPavilionState) return;
    this.lastPavilionState = key;
    this.handlers.onPavilionChange?.(state);
  }

  getBedState(): BedState | null {
    if (this.bamboo || this.garden || this.cloudSpa || this.baikal || this.activeBunkerId) return null;
    if (this.uyuni) {
      const hotel = uyuniHotelForSpot(this.skyRest?.spotId) ?? nearbyUyuniHotel(this.self.x, this.self.z);
      if (!hotel) return null;
      const spotId = `hotel-${hotel.id}`, used = new Set<number>();
      for (const player of this.players.values()) {
        const bed = claimedUyuniHotelBed(player.data);
        if (bed?.spotId === spotId) used.add(bed.slot);
      }
      if (this.skyRest?.spotId === spotId) used.add(this.skyRest.slot);
      return { spotId, shelterName: hotel.name, near: true, lying: this.skyRest?.spotId === spotId,
        occupied: used.size, capacity: UYUNI_HOTEL_BED_CAPACITY };
    }
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
    if (state.pose !== "standing" && !mapSupportsSpot(this.mapId, state.spotId)) return;
    const nextLayer = this.mapId === "uyuni" ? bunkerById(state.bunkerId)?.id ?? null : null;
    if (state.pose !== "standing" && (nextLayer ? bunkerForSpot(state.spotId)?.id !== nextLayer : Boolean(bunkerForSpot(state.spotId)))) return;
    const layerChanged = this.setBunkerLayer(nextLayer);
    const slot = claimedRestSlot(state);
    const bench = claimedFireBenchSlot(state);
    const pavilion = this.baikal ? claimedBaikalSeat(state) : this.cloudSpa ? claimedCloudSpaSeat(state) : this.uyuni ? claimedBunkerSeat(state) : this.garden ? claimedGardenSeat(state) : claimedPavilionSeat(state);
    if (pavilion && this.garden?.isRiding) this.garden.cancelRide();
    const onsen = claimedOnsenSeat(state), seat = onsen ?? bench ?? pavilion;
    if (seat) {
      if (this.fixedSeat?.spotId === seat.spotId && this.fixedSeat.slot === seat.slot) return;
      if (!this.skyRest && !this.fixedSeat) this.beforeSkyRest = { pitch: this.self.pitch };
      if (this.restSeat) this.standUp();
      this.skyRest = null;
      this.skyLook = null;
      this.benchSeat = bench;
      this.onsenSeat = onsen;
      this.pavilionSeat = pavilion;
      this.self.x = seat.x; this.self.z = seat.z;
      this.self.yaw = seat.yaw;
      this.self.pitch = pavilion?.pavilionId === "summit" ? -0.20 : -0.08;
      this.eyeHeight = seat.avatarY + 0.78;
      this.setView("third");
      this.orbitYaw = seat.yaw + (this.cloudSpa && seat.spotId === "cloud-lounge" ? Math.PI + .45 : 0);
    } else if (slot) {
      if (this.skyRest?.spotId === slot.spotId && this.skyRest.slot === slot.slot) return;
      if (!this.skyRest && !this.fixedSeat) this.beforeSkyRest = { pitch: this.self.pitch };
      if (this.restSeat) this.standUp();
      this.benchSeat = null;
      this.onsenSeat = null;
      this.pavilionSeat = null;
      this.skyRest = slot.spotId === "onsen-float" ? { ...slot } : slot; // A float keeps its own copy, updated as it drifts.
      this.floatVelocity = { x: 0, z: 0 };
      this.skyLook = { yaw: 0, pitch: 0 };
      this.setView("third");
      this.self.x = slot.x; this.self.z = slot.z;
      this.self.yaw = slot.yaw; this.self.pitch = this.floating ? 0.5 : 1.25;
      this.orbitYaw = this.floating ? slot.yaw + 1.4 : slot.yaw; // From straight behind, a reclined body is only the back of a head.
      this.eyeHeight = (slot.avatarY ?? STARGAZING.avatarY) + 0.16;
    } else if (state.pose === "standing" && (layerChanged || this.skyRest || this.fixedSeat)) {
      if (![state.x, state.z, state.yaw].every(Number.isFinite)) return;
      this.skyRest = null;
      this.skyLook = null;
      this.benchSeat = null;
      this.onsenSeat = null;
      this.pavilionSeat = null;
      this.restSeat = null; this.returnFromSeat = null;
      this.self.x = state.x; this.self.z = state.z; this.self.yaw = state.yaw;
      this.self.pitch = THREE.MathUtils.clamp(this.beforeSkyRest?.pitch ?? 0.07, -0.55, 0.5);
      this.beforeSkyRest = null;
      this.eyeHeight = this.deckHeight(state.x, state.z) + EYE;
      if (layerChanged && nextLayer) this.orbitYaw = this.self.yaw + 1.05;
    } else return;
    this.keys.clear(); this.move = { x: 0, y: 0 };
    this.cancelAutoWalk();
    this.followSnap = true;
    this.updateRestState();
    this.updateStargazingState();
  }

  private updateStargazingState() {
    this.updateBunkerState();
    this.updateBedState();
    this.updateBenchState();
    this.updateOnsenState();
    this.updatePavilionState();
    if (this.bamboo || this.garden || this.cloudSpa || this.baikal || this.activeBunkerId) {
      // The forest and the garden have no starlight circle; never offer the shared mats there.
      if (this.lastStargazingState !== "forest") {
        this.lastStargazingState = "forest";
        this.handlers.onStargazingChange?.({ near: false, lying: false, occupied: 0, capacity: STARGAZING.capacity });
      }
      return;
    }
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
      this.faceGoal = { yaw: Math.atan2(-dx, -dz), pitch: -Math.atan2(this.eyeHeight - (this.cloudSpa || this.baikal ? this.deckHeight(a.face.x, a.face.z) : 0) - 0.6, dist) * 0.8 };
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
    if (dist <= (a.path.length > 1 ? a.cornerStop ?? 0.6 : a.stop)) {
      a.path.shift();
      if (!a.path.length) { this.self.moving = false; this.finishAuto(); }
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    const [cx, cz] = this.collide(this.self.x + (dx / dist) * step, this.self.z + (dz / dist) * step, true);
    const nx = Math.max(this.bounds.minX + 0.4, Math.min(this.bounds.maxX - 0.4, cx));
    const nz = Math.max(this.bounds.minZ + 0.3, Math.min(this.bounds.maxZ - 0.4, cz));
    const progressed = Math.hypot(nx - this.self.x, nz - this.self.z);
    this.self.x = nx;
    this.self.z = nz;
    this.self.moving = true;
    this.self.bobT += dt * WALK_SPEED * 2.6;
    if (this.view === "third" || !(this.look.active && this.look.moved)) {
      // The body follows the path while a third-person orbit remains in the user's hands.
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

  /** Personal exploration reward; the shared room clock and weather remain authoritative. */
  setBaikalJourney(stage: number) { this.baikal?.setJourney(stage); }

  /* ---------------- 시간대 ---------------- */
  setHourOverride(h: number | null) {
    this.hourOverride = h;
    this.applyDaylight(this.mapDaylight());
  }

  private mapDaylight(): Daylight {
    return (this.mapId === "baikal" ? baikalDaylightAt : this.mapId === "cloudspa" ? cloudSpaDaylightAt : this.mapId === "uyuni" ? uyuniDaylightAt : this.mapId === "bamboo" ? bambooDaylightAt : this.mapId === "garden" ? gardenDaylightAt : daylightAt)(this.hour());
  }

  get daylightNow() {
    return this.daylight;
  }

  private applyDaylight(d: Daylight) {
    this.daylight = d;
    this.fireworkAudio?.setBambooNight(d.deepNight);
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
    (u.uSun.value as THREE.Vector3).set(...d.sun);
    (u.uSunColor.value as THREE.Vector3).set(...d.sunColor);
    (u.uCloudColor.value as THREE.Vector3).set(...d.cloud);
    u.uCloudAmount.value = d.cloudAmount;
    u.uStars.value = d.stars;
    u.uLantern.value = d.lanterns;
    (u.uHorizonFog.value as THREE.Vector3).set(...d.fog);
    u.uBambooSunset.value = this.mapId === "bamboo" ? bambooSunsetAmount(d.hour) : 0;
    this.lanterns?.setAmount(d.lanterns);

    if (this.seaMat) {
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
      this.ultraSea?.setDaylight(sunUp ? d.sun : d.moon, sunUp ? d.sunColor : moonLight, this.skyMat.uniforms.uPhotoTint.value as THREE.Vector3, sunUp);
    }

    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(...d.fog, THREE.SRGBColorSpace);
    if (this.activeBunkerId) fog.color.setHex(0x211b15);
    // The forest closes in: its own near/far keep the far stalks and world edge inside the haze.
    this.applyFogDistances();
    this.renderer.setClearColor(fog.color, 1);

    for (const m of this.tinted) (m as THREE.SpriteMaterial).color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    for (const p of this.players.values()) p.mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    this.selfNode?.mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2], THREE.SRGBColorSpace);
    if (this.activeBunkerId) this.chibiSelf?.setTint(1, 1, 1);
    else this.chibiSelf?.setTint(d.tint[0], d.tint[1], d.tint[2]);
    if (this.activeBunkerId) {
      this.selfNode?.mat.color.setHex(0xffffff);
      for (const p of this.players.values()) p.mat.color.setHex(0xffffff);
    }
    if (this.shadowMat) this.shadowMat.opacity = this.activeBunkerId ? .3 : 0.35 + 0.45 * Math.max(0, d.sun[1]);
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
      if (this.isBedLying) {
        if (this.view === "first") {
          this.self.yaw = THREE.MathUtils.clamp(this.self.yaw - dx * k, -BED_VIEW.yawLimit, BED_VIEW.yawLimit);
          this.self.pitch = THREE.MathUtils.clamp(this.self.pitch - dy * k * 0.75, BED_VIEW.minPitch, BED_VIEW.maxPitch);
        }
      } else if (this.skyRest && !this.floating && this.view === "first") {
        const head = this.skyLook ??= { yaw: 0, pitch: 0 };
        this.skyLook = this.limitSkyLook(head.yaw - dx * k, head.pitch - dy * k * 0.75);
      } else {
        if (this.view === "third") this.orbitYaw -= dx * k;
        else this.self.yaw -= dx * k;
        const [lowest, highest] = this.floating ? (this.view === "third" ? [0.2, 1.25] : [-0.55, 0.5])
          : this.skyRest ? [SKY_VIEW.thirdMinPitch, SKY_VIEW.thirdMaxPitch] : this.cloudSpa ? [-1.05, 1.0] : [-0.55, 0.5];
        this.self.pitch = THREE.MathUtils.clamp(this.self.pitch - dy * k * 0.75, lowest, highest);
      }
      if (this.view === "first") this.faceGoal = null;
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
    const bunker = this.bunkerState;
    if (this.uyuni && ((k === "e" && (bunker.nearId || bunker.ladderNear || bunker.sofaNear || bunker.seated || bunker.gameNearId)) || (k === "Escape" && bunker.seated))) {
      this.keys.delete(k);
      if (e.type === "keydown" && !e.repeat) this.handlers.onBunkerAction?.();
      e.preventDefault(); return;
    }
    if ((k === "e" && (this.benchSeat || this.getBenchState().near)) || (k === "Escape" && this.benchSeat)) {
      this.keys.delete(k);
      if (e.type === "keydown" && !e.repeat) this.handlers.onBenchAction?.();
      e.preventDefault();
      return;
    }
    if (this.garden && !this.fixedSeat && !this.skyRest && ((k === "e" && (this.garden.isRiding || this.garden.boatState.near)) || (k === "Escape" && this.garden.isRiding))) {
      this.keys.delete(k);
      if (e.type === "keydown" && !e.repeat) this.handlers.onBoatAction?.();
      e.preventDefault();
      return;
    }
    if ((this.bamboo || this.garden || this.cloudSpa || this.baikal) && ((k === "e" && (this.pavilionSeat || this.getPavilionState().near)) || (k === "Escape" && this.pavilionSeat))) {
      this.keys.delete(k);
      if (e.type === "keydown" && !e.repeat) this.handlers.onPavilionAction?.();
      e.preventDefault();
      return;
    }
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
    if (this.anchored) {
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
    const targets = [...this.players.values()].map((p) => p.avatar?.root ?? p.sprite);
    const hits = ray.intersectObjects(targets, true);
    let pid: string | null = null;
    if (hits.length) {
      for (const [id, p] of this.players) {
        if (p.sprite === hits[0].object || p.avatar?.root.getObjectById(hits[0].object.id)) { pid = id; break; }
      }
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
  setPlayers(list: RemotePlayer[], timing?: SnapshotTiming) {
    if (!this.charTex) return;
    const now = performance.now();
    const stamp = (this.remoteClock ??= new RemoteSnapshotClock()).accept(timing, now);
    if (!stamp) return; // An old room response must not rewind people or remove newer arrivals.
    if (this.bamboo && stamp.serverOffset !== null) this.festivalClockOffset = -stamp.serverOffset;
    if (stamp.serverOffset !== null) this.serverClockOffset = -stamp.serverOffset;
    const seen = new Set<string>();
    for (const incoming of list) {
      if (this.uyuni && (incoming.bunkerId ?? null) !== this.activeBunkerId) continue;
      const wrongMap = incoming.spotId != null && !mapSupportsSpot(this.mapId, incoming.spotId);
      const p: RemotePlayer = wrongMap
        ? { ...incoming, pose: "standing", spotId: null, slot: null } : incoming;
      seen.add(p.pid);
      let node = this.players.get(p.pid);
      if (![p.x, p.z, p.yaw].every(Number.isFinite)) continue;
      if (!node) {
        node = this.createPlayer(p);
        this.players.set(p.pid, node);
      }
      const resting = claimedRestSlot(p) ?? claimedSeatSlot(p);
      const updatedAt = Number.isFinite(p.updatedAt) ? p.updatedAt : undefined;
      if (updatedAt !== undefined && node.motionUpdatedAt !== undefined && updatedAt < node.motionUpdatedAt) continue;
      const sameUpdate = updatedAt !== undefined && node.motionUpdatedAt === updatedAt
        && node.data.pose === p.pose && node.data.spotId === p.spotId && node.data.slot === p.slot;
      node.data = p;
      if (this.bamboo && (p.festival?.held || p.festival?.flight)) {
        this.prepareFestival(p.festival.flight, timing?.serverTime ?? now + this.festivalClockOffset);
      }
      if (!sameUpdate || !node.motion) {
        node.motion ??= new RemoteMotionBuffer();
        node.target = resting ? { x: resting.x, z: resting.z, yaw: resting.yaw, moving: false } : { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving };
        const sourceAt = updatedAt !== undefined && stamp.serverOffset !== null
          ? Math.min(stamp.sampleTime, updatedAt + stamp.serverOffset) : stamp.sampleTime;
        // RTT correction can move the local clock a few ms; a newer server pose still stays newer.
        const at = Math.max(sourceAt, (node.motionSampleAt ?? -Infinity) + 0.001);
        const pose = resting ? `${p.pose}:${resting.spotId}:${resting.slot}` : "standing";
        if (node.motion.push(node.target, at, stamp.receivedAt, pose) === "snap") Object.assign(node.cur, node.target);
        node.motionUpdatedAt = updatedAt;
        node.motionSampleAt = at;
      }
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
    const geometry = avatarGeometry();
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
      data: p, sprite, mat, tex, shadow, avatar: null, label: null, labelNick: "",
      cur: { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving }, target: { x: p.x, z: p.z, yaw: p.yaw, moving: p.moving }, animT: Math.random() * 10, bounce: 0, seen: performance.now(),
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
    this.pixelDepth?.remove(node.sprite);
    node.avatar?.dispose();
    node.avatar = null;
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
    const resting = this.floatingPose(node ? claimedRestSlot(node.data) : this.skyRest);
    const seated = node ? claimedSeatSlot(node.data) : this.fixedSeat;
    if (pid === null && this.view === "first") {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      return { position: this.camera.position.clone().addScaledVector(direction, 1.65).add(new THREE.Vector3(0, -0.24, 0)), close: true, resting: Boolean(resting || seated) };
    }
    if (resting) {
      const point = stargazingBodyPoint(resting, 0.92);
      return { position: new THREE.Vector3(point.x, (resting.avatarY ?? STARGAZING.avatarY) + 0.24 + Math.sin(resting.incline ?? 0) * 0.92, point.z), close: false, resting: true };
    }
    const position = node?.cur ?? this.self;
    if (seated) return { position: new THREE.Vector3(seated.x, seated.avatarY + 0.43, seated.z), close: false, resting: true };
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
      const avatar = sender === null ? this.selfNode?.avatar : this.players.get(sender)?.avatar;
      avatar?.playGesture("wave", target?.position);
      const source = sender === null ? null : this.players.get(sender);
      if (source && !claimedRestSlot(source.data) && !claimedSeatSlot(source.data)) source.bounce = Math.max(source.bounce, 0.18);
      if (target) for (let i = 0; i < 3; i++) {
        this.spawnFx("sparkle", target.position, new THREE.Vector3((i - 1) * 0.15, 0.35, 0), 1, target.close ? 0.08 : 0.13, i * 0.10, 0xffedb5);
      }
      return;
    }
    if (!target) return;
    const at = target.position;
    const node = toPid === null ? null : this.players.get(toPid);
    if (node && !claimedRestSlot(node.data) && !claimedSeatSlot(node.data)) node.bounce = kind === "hug" ? 0.25 : 0.5;
    const k = target.close ? 0.6 : 1;
    if (kind === "hug") {
      this.careGestures?.play("hug", toPid);
      const sender = fromPid === undefined ? toPid : fromPid;
      const avatar = sender === null ? this.selfNode?.avatar : this.players.get(sender)?.avatar;
      avatar?.playGesture("hug", at);
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
    return { ...(this.uyuni ? { bunkerId: this.activeBunkerId } : {}), x: this.self.x, z: this.self.z, yaw: this.skyRest?.yaw ?? this.fixedSeat?.yaw ?? this.self.yaw, moving: this.anchored ? false : this.self.moving };
  }

  getContinuityView(): ContinuityView {
    return { view: this.view, yaw: this.self.yaw, pitch: this.self.pitch, orbitYaw: this.orbitYaw,
      restSpot: this.skyRest?.spotId ?? this.fixedSeat?.spotId ?? (this.restSeat ? `sofa:${this.restSeat.shelterId}` : null),
      ...(this.skyLook ? { skyYaw: this.skyLook.yaw, skyPitch: this.skyLook.pitch } : {}) };
  }

  /** Restore the same visitor, while only the server may restore a shared resting-place claim. */
  restoreVisit(spawn: { x: number; z: number; yaw: number }, selfRest?: RestPresence, cameraState?: ContinuityView, preserveLocal = false, bounds?: Bounds) {
    if (this.disposed) return;
    this.cancelBunkerTransition();
    const layerChanged = this.setBunkerLayer(this.mapId === "uyuni" ? bunkerById(selfRest?.bunkerId)?.id ?? null : null);
    // A resumed room may have expanded since this engine was created.
    if (bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)
      && bounds.maxX - bounds.minX > 0.8 && bounds.maxZ - bounds.minZ > 0.7) {
      this.bounds = { ...bounds };
    }
    const saved = cameraState ?? this.getContinuityView();
    const origin = preserveLocal && !layerChanged ? this.returnFromSeat ?? this.self : spawn;
    const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const yaw = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
    const clamp = THREE.MathUtils.clamp;
    let x = finite(origin.x, finite(this.self.x, 0)), z = finite(origin.z, finite(this.self.z, 3));
    // A stale position may overlap a newly added piece of furniture. Project it out before rendering.
    for (let pass = 0; pass < 4; pass++) {
      x = clamp(x, this.bounds.minX + 0.4, this.bounds.maxX - 0.4);
      z = clamp(z, this.bounds.minZ + 0.3, this.bounds.maxZ - 0.4);
      if (!this.uyuni) for (const obstacle of this.obstacles) {
        if (Math.hypot(x - obstacle.x, z - obstacle.z) < 1e-4) x = obstacle.x + obstacle.r + 0.35;
      }
      [x, z] = this.collide(x, z);
    }
    this.self.x = clamp(x, this.bounds.minX + 0.4, this.bounds.maxX - 0.4);
    this.self.z = clamp(z, this.bounds.minZ + 0.3, this.bounds.maxZ - 0.4);
    this.self.yaw = yaw(finite(preserveLocal ? this.self.yaw : spawn.yaw, 0));
    this.self.pitch = clamp(finite(this.beforeSkyRest?.pitch, 0.07), -0.55, 0.5);
    this.self.moving = false;
    this.skyRest = null; this.skyLook = null; this.benchSeat = null; this.onsenSeat = null; this.pavilionSeat = null;
    this.restSeat = null; this.returnFromSeat = null; this.beforeSkyRest = null;
    this.garden?.cancelRide();
    this.eyeHeight = this.deckHeight(this.self.x, this.self.z) + EYE;
    this.keys.clear(); this.move = { x: 0, y: 0 }; this.look.active = false;
    this.cancelAutoWalk(); this.faceGoal = null;
    if (selfRest) this.applyRest(selfRest);
    this.setView(saved.view === "third" ? "third" : "first");
    const sameRest = saved.restSpot === this.getContinuityView().restSpot;
    this.orbitYaw = yaw(finite(saved.orbitYaw, this.self.yaw));
    if (!this.skyRest && !this.fixedSeat) {
      if (this.view === "first") this.self.yaw = yaw(finite(saved.yaw, this.self.yaw));
      this.self.pitch = sameRest ? clamp(finite(saved.pitch, 0.07), this.cloudSpa ? -1.05 : -0.55, this.cloudSpa ? 1 : 0.5) : 0.07;
    } else if (sameRest) {
      if (this.isBedLying && this.view === "first") {
        this.self.yaw = clamp(finite(saved.yaw, 0), -BED_VIEW.yawLimit, BED_VIEW.yawLimit);
        this.self.pitch = clamp(finite(saved.pitch, BED_VIEW.pitch), BED_VIEW.minPitch, BED_VIEW.maxPitch);
      } else if (this.floating) {
        this.self.pitch = this.view === "first" ? clamp(finite(saved.pitch, 0.05), -0.55, 0.5) : clamp(finite(saved.pitch, 0.5), 0.2, 1.25);
      } else if (this.skyRest) {
        this.self.pitch = this.view === "first"
          ? clamp(finite(saved.pitch, SKY_VIEW.pitch), SKY_VIEW.minPitch, SKY_VIEW.maxPitch)
          : clamp(finite(saved.pitch, 1.25), SKY_VIEW.thirdMinPitch, SKY_VIEW.thirdMaxPitch);
        if (this.view === "first") this.skyLook = this.limitSkyLook(finite(saved.skyYaw, 0), finite(saved.skyPitch, 0));
      } else {
        this.self.pitch = clamp(finite(saved.pitch, -0.08), this.cloudSpa ? -1.05 : -0.55, this.cloudSpa ? 1 : 0.5);
        if (this.view === "first") this.self.yaw = yaw(finite(saved.yaw, this.self.yaw));
      }
    }
    this.followSnap = true;
    this.updateSelf(0);
  }

  private facing(yaw = this.self.yaw) {
    return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  }

  start() {
    if (this.running || this.disposed) return;
    this.fireworkAudio?.setSceneRunning(!this.activeBunkerId);
    this.lastStarView = null;
    this.remoteClock?.resetPlayback();
    for (const player of this.players.values()) {
      player.motion?.reset();
      player.motionUpdatedAt = undefined;
      player.motionSampleAt = undefined;
    }
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
    this.cancelBunkerTransition();
    this.running = false;
    this.fireworkAudio?.setSceneRunning(false);
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.move = { x: 0, y: 0 };
    this.cancelAuto("cancelled");
    this.look.active = false;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.skyRenderMode = this.skyOnlyView;
    const size = beachRenderSettings(w, h, window.devicePixelRatio || 1, this.mobile, this.quality, this.skyRenderMode);
    if (!this.renderSize || size.width !== this.renderSize.width || size.height !== this.renderSize.height || size.pixelRatio !== this.renderSize.pixelRatio) {
      // One allocation sets both dimensions and DPR; unchanged frames never resize the canvas.
      this.renderer.setDrawingBufferSize(size.width, size.height, size.pixelRatio);
      this.renderSize = size;
    }
    this.camera.aspect = w / h;
    this.camera.fov = this.cameraFov();
    this.camera.updateProjectionMatrix();
    if (this.skyOnlyView && this.skyLook) {
      this.skyLook = this.limitSkyLook(this.skyLook.yaw, this.skyLook.pitch);
    }
  }

  private syncSkyResolution() {
    if (this.skyRenderMode !== this.skyOnlyView) this.resize();
  }

  private setQuality(level: "high" | "low") {
    if (this.quality === level) return;
    this.quality = level;
    this.renderer.shadowMap.enabled = this.mapId === "beach" && level === "high";
    this.uyuni?.setQuality(level === "low");
    this.bamboo?.setQuality(level === "low");
    this.garden?.setQuality(level === "low");
    this.cloudSpa?.setQuality(level === "low");
    this.baikal?.setQuality(level === "low");
    this.uyuniMoments?.setQuality(level);
    if (this.ultraSea) {
      this.ultraSea.enabled = level === "high";
      if (this.seaMat) this.seaMat.uniforms.uUltraRadius.value = this.ultraSea.enabled ? ULTRA_RADIUS : 0;
    }
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
    if (now >= this.qualityWarmupUntil && document.visibilityState !== "hidden" && elapsed > 0 && elapsed < 120) {
      this.frameAvg += (elapsed - this.frameAvg) * 0.06;
      if (this.quality === "high") {
        if (this.frameAvg > 34) { if (!this.slowSince) this.slowSince = now; else if (now - this.slowSince > 3000) this.setQuality("low"); }
        else this.slowSince = 0;
      }
    } else {
      this.slowSince = 0;
      this.frameAvg = 16;
    }
    this.time += dt;

    if (now - this.lastDaylightAt > 20_000) {
      this.lastDaylightAt = now;
      this.applyDaylight(this.mapDaylight());
    }

    this.updateSelf(dt);
    if (this.mapId === "beach") this.fireworkAudio?.updateBeachSound(this.self, FIRE, this.fireState?.logs ?? 0, dt);
    if (this.mapId === "bamboo") this.fireworkAudio?.updateBambooSound(dt);
    this.syncSkyResolution();
    this.updatePlayers(dt);
    this.updateFx(dt);
    this.updateWorld(dt);
    if (this.garden || this.baikal) this.updateRain();
    if (this.garden) {
      this.fireworkAudio?.updateGardenSound(insideHall(this.self.x, this.self.z), this.rainNow, dt);
      this.garden.renderReflection(this.renderer, this.camera);
    }
    if (this.ultraSea?.enabled && !this.activeBunkerId) this.ultraSea.prepare(dt, this.camera);
    this.drawScene();
  }

  /** Baikal prints through its own post stage; every other map goes straight to the canvas. */
  private drawScene() {
    if (this.baikal) this.baikal.render(this.renderer, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  private updateSelf(dt: number) {
    const transition = this.bunkerTransition;
    if (transition) {
      transition.elapsed += dt;
      if (transition.elapsed >= .7 && !transition.swapped) {
        transition.swapped = true; this.applyRest(transition.confirmed);
        this.orbitYaw = this.self.yaw + (transition.confirmed.bunkerId ? 1.05 : 0); this.eyeHeight = this.deckHeight(this.self.x, this.self.z) + EYE;
      }
      this.self.moving = false;
      const enter = Boolean(transition.confirmed.bunkerId);
      this.bunkerClimbOffset = (enter ? -1 : 1) * (transition.swapped ? -(1 - Math.min(1, (transition.elapsed - .7) / .7)) : transition.elapsed / .7) * .6;
      if (this.view === "third") this.placeFollowCamera(dt);
      else { this.camera.position.set(this.self.x, this.eyeHeight, this.self.z); this.camera.rotation.set(this.self.pitch, this.self.yaw, 0, "YXZ"); }
      this.camera.position.y += this.bunkerClimbOffset;
      this.sky.position.copy(this.camera.position); this.updateSelfAvatar(dt);
      if (transition.elapsed >= 1.4) { this.cancelBunkerTransition(); this.followSnap = true; this.updateStargazingState(); }
      return;
    }
    this.camera.layers?.set(this.skyOnlyView ? 1 : 0);
    if (this.skyRest) {
      if (this.floating) this.driftOnWater(dt);
      else { this.self.x = this.skyRest.x; this.self.z = this.skyRest.z; this.self.moving = false; }
      this.placeStargazingCamera(dt);
      this.sky.position.copy(this.camera.position);
      this.updateSelfAvatar(dt);
      this.updateStargazingState();
      if (this.nearFire) { this.nearFire = false; this.handlers.onFireRangeChange?.(false); }
      return;
    }
    if (this.fixedSeat) {
      this.self.x = this.fixedSeat.x; this.self.z = this.fixedSeat.z; this.self.moving = false;
      this.eyeHeight = this.fixedSeat.avatarY + 0.78;
      if (this.view === "third") this.placeBenchCamera(dt);
      else {
        this.camera.position.set(this.self.x, this.eyeHeight, this.self.z);
        this.camera.rotation.set(this.self.pitch, this.self.yaw, 0, "YXZ");
      }
      this.sky.position.copy(this.camera.position);
      this.updateSelfAvatar(dt);
      this.updateStargazingState();
      const near = Boolean(this.benchSeat);
      if (this.nearFire !== near) { this.nearFire = near; this.handlers.onFireRangeChange?.(near); }
      return;
    }
    if (this.garden?.isRiding) {
      // 나룻배 위: 몸은 배를 따라가고, 시선만 자유롭다.
      const pose = this.garden.boatPose;
      this.self.x = pose.x; this.self.z = pose.z; this.self.moving = false;
      this.move = { x: 0, y: 0 };
      this.eyeHeight += (BOAT_DECK_Y + 1.12 - this.eyeHeight) * Math.min(1, dt * 6);
      if (this.view === "third") this.placeFollowCamera(dt);
      else {
        this.camera.position.set(this.self.x, this.eyeHeight + Math.sin(this.time * 1.1) * 0.02, this.self.z);
        this.camera.rotation.set(this.self.pitch, this.self.yaw, 0, "YXZ");
      }
      this.sky.position.copy(this.camera.position);
      this.updateSelfAvatar(dt);
      this.updateStargazingState();
      return;
    }
    const k = this.keys;
    let mx = this.move.x, my = this.move.y; // 조이스틱: 위로 밀면 앞으로
    if (k.has("w") || k.has("ArrowUp")) my += 1;
    if (k.has("s") || k.has("ArrowDown")) my -= 1;
    if (k.has("a")) mx -= 1;
    if (k.has("d")) mx += 1;
    const turn = (k.has("ArrowLeft") || k.has("q") ? 1 : 0) - (k.has("ArrowRight") || k.has("e") ? 1 : 0);
    if (turn) {
      if (this.view === "third") this.orbitYaw += turn * 1.9 * dt;
      else this.self.yaw += turn * 1.9 * dt;
      this.faceGoal = null;
    }
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
        const movementYaw = this.view === "third" ? this.orbitYaw : this.self.yaw;
        const f = this.facing(movementYaw);
        const r = { x: Math.cos(movementYaw), z: -Math.sin(movementYaw) };
        const dx = f.x * my + r.x * mx, dz = f.z * my + r.z * mx;
        if (this.view === "third") {
          const turn = Math.atan2(-dx, -dz) - this.self.yaw;
          this.self.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 12);
        }
        const nx = this.self.x + dx * speed * dt;
        const nz = this.self.z + dz * speed * dt;
        const [cx, cz] = this.collide(nx, nz, true);
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
      if (this.view === "first") this.self.pitch += (g.pitch - this.self.pitch) * ease;
      if (Math.abs(dYaw) < 0.01 && (this.view === "third" || Math.abs(g.pitch - this.self.pitch) < 0.01)) this.faceGoal = null;
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
    const near = this.mapId === "beach" && Math.hypot(this.self.x - FIRE.x, this.self.z - FIRE.z) <= 4.6;
    if (near !== this.nearFire) { this.nearFire = near; this.handlers.onFireRangeChange?.(near); }
  }

  private limitSkyLook(yaw: number, pitch: number) {
    yaw = THREE.MathUtils.clamp(yaw, -SKY_VIEW.headYawLimit, SKY_VIEW.headYawLimit);
    pitch = THREE.MathUtils.clamp(pitch, -SKY_VIEW.headPitchLimit, SKY_VIEW.headPitchLimit);
    const base = THREE.MathUtils.clamp(this.self.pitch, SKY_VIEW.minPitch, SKY_VIEW.maxPitch);
    const s = Math.sin(base), c = Math.cos(base), vertical = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const horizontal = vertical * this.camera.aspect;
    const fitsSky = (amount: number) => {
      const x = pitch * amount, y = yaw * amount;
      const forwardY = c * Math.sin(x) + s * Math.cos(y) * Math.cos(x);
      const upY = c * Math.cos(x) - s * Math.cos(y) * Math.sin(x);
      const rightY = s * Math.sin(y);
      // Keep even the lowest screen corner above the horizon at the existing lens/aspect.
      return forwardY - vertical * Math.abs(upY) - horizontal * Math.abs(rightY) >= 0.015;
    };
    let low = 0, high = 1;
    if (fitsSky(1)) return { yaw, pitch };
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      if (fitsSky(mid)) low = mid; else high = mid;
    }
    return { yaw: yaw * low, pitch: pitch * low };
  }

  private orientSkyCamera() {
    this.camera.rotation.set(THREE.MathUtils.clamp(this.self.pitch, SKY_VIEW.minPitch, SKY_VIEW.maxPitch), this.self.yaw, 0, "YXZ");
    // Rebuild from the stable rest orientation every frame: no accumulated roll, zoom or body turn.
    this.camera.rotateY(this.skyLook?.yaw ?? 0);
    this.camera.rotateX(this.skyLook?.pitch ?? 0);
  }

  /** Joystick and keys steer a floating body: it eases up to a slow glide and coasts to a stop inside its bath. */
  private driftOnWater(dt: number) {
    const rest = this.skyRest!, home = ONSEN_FLOATS[rest.slot], k = this.keys, velocity = this.floatVelocity;
    let mx = this.move.x, my = this.move.y;
    if (k.has("w") || k.has("ArrowUp")) my += 1;
    if (k.has("s") || k.has("ArrowDown")) my -= 1;
    if (k.has("a")) mx -= 1;
    if (k.has("d")) mx += 1;
    const turn = (k.has("ArrowLeft") || k.has("q") ? 1 : 0) - (k.has("ArrowRight") || k.has("e") ? 1 : 0);
    if (turn) {
      if (this.view === "third") this.orbitYaw += turn * 1.9 * dt;
      else this.self.yaw += turn * 1.9 * dt;
    }
    const length = Math.hypot(mx, my);
    if (length > 1) { mx /= length; my /= length; }
    const steering = this.view === "third" ? this.orbitYaw : this.self.yaw;
    const forward = this.facing(steering), right = { x: Math.cos(steering), z: -Math.sin(steering) };
    const ease = Math.min(1, dt * 2.2);
    velocity.x += ((forward.x * my + right.x * mx) * FLOAT_SPEED - velocity.x) * ease;
    velocity.z += ((forward.z * my + right.z * mx) * FLOAT_SPEED - velocity.z) * ease;
    let x = this.self.x + velocity.x * dt, z = this.self.z + velocity.z * dt;
    const fromX = x - home.centerX, fromZ = z - home.centerZ, distance = Math.hypot(fromX, fromZ);
    if (distance > ONSEN_FLOAT_RADIUS) {
      const outX = fromX / distance, outZ = fromZ / distance, outward = velocity.x * outX + velocity.z * outZ;
      x = home.centerX + outX * ONSEN_FLOAT_RADIUS;
      z = home.centerZ + outZ * ONSEN_FLOAT_RADIUS;
      if (outward > 0) { velocity.x -= outX * outward; velocity.z -= outZ * outward; }
    }
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.12 && this.view === "third") {
      const change = Math.atan2(-velocity.x, -velocity.z) - this.self.yaw;
      this.self.yaw += Math.atan2(Math.sin(change), Math.cos(change)) * Math.min(1, dt * 3);
    }
    this.self.x = x; this.self.z = z; this.self.moving = speed > 0.08;
    rest.x = x; rest.z = z; rest.yaw = this.self.yaw;
  }

  /** Lying eyes look at the sky; the alternate camera keeps all eight mats in view. */
  private placeStargazingCamera(dt: number) {
    const resting = this.floatingPose(this.skyRest);
    if (!resting) return;
    if (resting.spotId === "onsen-float") {
      const surface = resting.avatarY!;
      if (this.view === "first") {
        const head = stargazingBodyPoint(resting, 1);
        this.camera.position.set(head.x, surface + 0.92, head.z);
        this.camera.rotation.set(this.self.pitch, this.self.yaw, 0, "YXZ");
        return;
      }
      const focus = stargazingBodyPoint(resting, 0.9);
      const elevation = THREE.MathUtils.clamp(this.self.pitch, 0.2, 1.25);
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
      const reach = Math.max(4.4, 1.55 / (Math.tan(halfFov) * Math.max(0.3, Math.min(1, this.camera.aspect))));
      const horizontal = Math.cos(elevation) * reach;
      const wanted = new THREE.Vector3(focus.x + Math.sin(this.orbitYaw) * horizontal,
        surface + Math.sin(elevation) * reach + 0.15, focus.z + Math.cos(this.orbitYaw) * horizontal);
      // The bath is sunken and walled by rock: the orbit stays over it.
      const home = ONSEN_FLOATS[resting.slot];
      for (let k = 1; k >= 0.1 && Math.hypot(wanted.x - home.centerX, wanted.z - home.centerZ) > 5.6; k -= 0.05) {
        wanted.x = focus.x + Math.sin(this.orbitYaw) * horizontal * k;
        wanted.z = focus.z + Math.cos(this.orbitYaw) * horizontal * k;
      }
      if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
      else this.followCam.lerp(wanted, Math.min(1, dt * 10));
      this.camera.position.copy(this.followCam);
      this.camera.lookAt(focus.x, surface + 0.08, focus.z);
      return;
    }
    if (this.isBedLying) {
      if (this.view === "first") {
        // Rest above the raised pillow, looking through the open sea-facing side.
        const incline = resting.incline ?? 0;
        const head = stargazingBodyPoint(resting, BED_VIEW.headDistance * Math.cos(incline));
        const eyeY = (resting.avatarY ?? 0.82) + BED_VIEW.headDistance * Math.sin(incline) + BED_VIEW.eyeOffset;
        this.camera.position.set(head.x, eyeY, head.z);
        this.camera.rotation.set(THREE.MathUtils.clamp(this.self.pitch, BED_VIEW.minPitch, BED_VIEW.maxPitch),
          THREE.MathUtils.clamp(this.self.yaw, -BED_VIEW.yawLimit, BED_VIEW.yawLimit), 0, "YXZ");
        return;
      }
      // The open sea-facing front is the only sightline: stay below the roof and in front of the bed.
      const shelter = this.uyuni ? uyuniHotelForSpot(resting.spotId)! : SHELTERS.find((s) => `hut-${s.id}` === resting.spotId)!;
      const wanted = new THREE.Vector3(shelter.x + (resting.x - shelter.x) * 0.85, this.uyuni ? 3.15 : 2.85, shelter.z - 2.9);
      if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
      else this.followCam.lerp(wanted, Math.min(1, dt * 10));
      this.camera.position.copy(this.followCam);
      this.camera.lookAt(resting.x, this.uyuni ? 1.32 : 1.02, resting.z + 0.9);
      return;
    }
    if (this.view === "first") {
      const head = stargazingBodyPoint(resting, 1.42);
      this.camera.position.set(head.x, STARGAZING.avatarY + 0.16, head.z);
      this.orientSkyCamera();
      return;
    }
    const elevation = THREE.MathUtils.clamp(this.self.pitch, SKY_VIEW.thirdMinPitch, SKY_VIEW.thirdMaxPitch);
    const reach = stargazingCameraDistance(this.camera.fov, this.camera.aspect, elevation);
    const horizontal = Math.cos(elevation) * reach;
    const wanted = new THREE.Vector3(STARGAZING.x + Math.sin(this.orbitYaw) * horizontal,
      Math.sin(elevation) * reach + 0.4, STARGAZING.z + Math.cos(this.orbitYaw) * horizontal);
    if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
    else this.followCam.lerp(wanted, Math.min(1, dt * 10));
    this.camera.position.copy(this.followCam);
    this.camera.lookAt(STARGAZING.x, 0.05, STARGAZING.z);
  }

  /** Keep both the seated character and the fire in view, including narrow phone screens. */
  private placeBenchCamera(dt: number) {
    const direction = this.facing(this.orbitYaw);
    const reach = this.activeBunkerId ? 3.1 : FOLLOW_DISTANCE_SEATED;
    const baseY = (this.cloudSpa || this.baikal) && this.pavilionSeat ? this.pavilionSeat.baseY : (this.fixedSeat?.avatarY ?? 0.52) - 0.52;
    const pond = this.pavilionSeat?.spotId.startsWith("pond-bench-") === true;
    // Any pool seat that faces the nearby cloud edge looks down over it at the valley, not just the lowest pool.
    const cityVista = Boolean(this.cloudSpa && this.pavilionSeat && this.pavilionSeat.spotId !== "cloud-lounge"
      && cloudSpaEdgeAhead(this.self.x, this.self.z, direction.x, direction.z, 30) <= 30);
    // Look over the bench onto the water so a seated head cannot hide a coin or duck on a phone.
    // Over a cloud edge the orbit climbs high enough that the valley shows past the shelf, not just a sliver of it.
    const eyeY = baseY + (cityVista ? 10 : pond ? 4.2 : this.cloudSpa && this.pavilionSeat?.spotId === "cloud-lounge" ? 3.8 : 2.5) - this.self.pitch * 1.4;
    const wanted = new THREE.Vector3(this.self.x - direction.x * reach,
      eyeY, this.self.z - direction.z * reach);
    // Pavilion seats face outward, so the orbit sits inside the roof: stay below the rafters.
    const seatCeiling = this.baikal ? baikalCeilingHeight(wanted.x, wanted.z) : this.cloudSpa ? cloudSpaCeilingHeight(wanted.x, wanted.z) : this.activeBunkerId ? bunkerById(this.activeBunkerId)!.ceilingY : this.bamboo ? bambooCeilingHeight(wanted.x, wanted.z) : this.garden ? gardenCeilingHeight(wanted.x, wanted.z) : null;
    if (seatCeiling !== null) wanted.y = Math.min(wanted.y, seatCeiling - 0.2);
    // Onsen seats have their backs to the rock: the orbit stays over the bath instead of ending up inside the hillside.
    if (this.onsenSeat) {
      wanted.y += 0.55; // The bath is sunken: look down over its stone rim.
      for (let k = 1; k >= 0.1 && Math.hypot(wanted.x - this.onsenSeat.centerX, wanted.z - this.onsenSeat.centerZ) > 5.4; k -= 0.05) {
        wanted.x = this.self.x - direction.x * reach * k;
        wanted.z = this.self.z - direction.z * reach * k;
      }
    }
    if (this.garden || this.cloudSpa || this.baikal || this.activeBunkerId) for (let k = 1; k >= 0.1 && (!this.cameraFree(wanted) || (this.activeBunkerId && !this.hotelCameraSightClear(wanted, baseY + 1.25)) || ((this.cloudSpa || this.baikal) && !this.cloudSpaCameraSightClear(wanted, baseY + 1.25))); k -= 0.15) {
      wanted.set(this.self.x - direction.x * reach * k, eyeY, this.self.z - direction.z * reach * k);
    }
    if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
    else this.followCam.lerp(wanted, Math.min(1, dt * 10));
    if (this.activeBunkerId && (!this.cameraFree(this.followCam) || !this.hotelCameraSightClear(this.followCam, baseY + 1.25))) this.followCam.copy(wanted);
    if ((this.cloudSpa || this.baikal) && (!this.cameraFree(this.followCam) || !this.cloudSpaCameraSightClear(this.followCam, baseY + 1.25))) this.followCam.copy(wanted);
    this.camera.position.copy(this.followCam);
    const ahead = cityVista ? 13 : pond ? 4.5 : 1.4;
    this.camera.lookAt(this.self.x + direction.x * ahead, baseY + (cityVista ? -8 : pond ? .7 : 1.0), this.self.z + direction.z * ahead);
  }

  /** Follow the standing character, shortening the orbit near shelter walls. */
  private placeFollowCamera(dt: number) {
    const x = this.self.x, z = this.self.z;
    const focusY = this.deckHeight(x, z) + (this.restSeat ? 1.0 : 1.25);
    const elev = Math.max(0.08, Math.min(1.0, 0.4 - this.self.pitch * 0.8));
    const f = this.facing(this.orbitYaw);
    const reach = this.activeBunkerId ? 3.6 : this.restSeat ? FOLLOW_DISTANCE_SEATED : FOLLOW_DISTANCE;
    const ceiling = this.baikal ? baikalCeilingHeight(x, z) : this.cloudSpa ? cloudSpaCeilingHeight(x, z) : this.activeBunkerId ? bunkerById(this.activeBunkerId)!.ceilingY : this.uyuni ? uyuniHotelCeilingHeight(x, z) : this.bamboo ? bambooCeilingHeight(x, z) : this.garden ? gardenCeilingHeight(x, z) : hotSpringCeilingHeight(x, z);
    const cosE = Math.cos(elev), sinE = Math.sin(elev);
    const wanted = new THREE.Vector3();
    for (let k = 1; k >= 0.06; k -= 0.06) {
      wanted.set(x - f.x * reach * k * cosE, focusY + reach * k * sinE, z - f.z * reach * k * cosE);
      if (this.uyuni && this.restSeat) wanted.y = Math.max(2.05, wanted.y);
      if (ceiling !== null) wanted.y = Math.min(wanted.y, ceiling - 0.18);
      if (this.cameraFree(wanted) && (!this.uyuni || this.hotelCameraSightClear(wanted, focusY)) && (!(this.cloudSpa || this.baikal) || this.cloudSpaCameraSightClear(wanted, focusY))) break;
    }
    this.bamboo?.clipGuestbookCamera(x, focusY, z, wanted);
    if (this.followSnap) { this.followCam.copy(wanted); this.followSnap = false; }
    else {
      this.followCam.lerp(wanted, Math.min(1, dt * 10));
      this.bamboo?.clipGuestbookCamera(x, focusY, z, this.followCam);
    }
    if ((this.cloudSpa || this.baikal) && (!this.cameraFree(this.followCam) || !this.cloudSpaCameraSightClear(this.followCam, focusY))) this.followCam.copy(wanted);
    // An interpolated orbit must not cut through the curved roof between two valid positions.
    if (this.uyuni && (!this.cameraFree(this.followCam) || !this.hotelCameraSightClear(this.followCam, focusY))) this.followCam.copy(wanted);
    this.camera.position.copy(this.followCam);
    // 캐릭터 머리 조금 위를 바라봐서 캐릭터는 화면 아래쪽, 앞 풍경은 위쪽에 넉넉히 들어온다
    this.camera.lookAt(x, focusY + (ceiling !== null ? 0.45 : this.mobile ? 1.1 : 0.7), z);
  }

  private hotelCameraSightClear(to: THREE.Vector3, focusY: number) {
    if (this.activeBunkerId) {
      const steps = Math.max(1, Math.ceil(to.distanceTo(new THREE.Vector3(this.self.x, focusY, this.self.z)) / .12));
      const point = new THREE.Vector3();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        point.set(this.self.x + (to.x - this.self.x) * t, focusY + (to.y - focusY) * t, this.self.z + (to.z - this.self.z) * t);
        if (!this.cameraFree(point)) return false;
      }
      return true;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - this.self.x, to.y - focusY, to.z - this.self.z) / 0.15));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = this.self.x + (to.x - this.self.x) * t,
        z = this.self.z + (to.z - this.self.z) * t, y = focusY + (to.y - focusY) * t;
      const ceiling = uyuniHotelCeilingHeight(x, z);
      if (ceiling !== null && y >= ceiling - 0.18) return false;
      for (const hotel of UYUNI_HOTELS) {
        if (Math.abs(x - hotel.x) < 4.9 && Math.abs(z - hotel.z - 4.8) < 0.25) return false;
      }
    }
    return true;
  }

  private cloudSpaCameraSightClear(to: THREE.Vector3, focusY: number) {
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - this.self.x, to.z - this.self.z) / .18));
    const point = new THREE.Vector3();
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      point.set(this.self.x + (to.x - this.self.x) * t, focusY + (to.y - focusY) * t, this.self.z + (to.z - this.self.z) * t);
      if (!this.cameraFree(point)) return false;
    }
    return true;
  }

  private cameraFree(p: THREE.Vector3) {
    const bunker = bunkerById(this.activeBunkerId);
    if (bunker) {
      const b = bunker.bounds;
      if (p.x < b.minX + .25 || p.x > b.maxX - .25 || p.z < b.minZ + .25 || p.z > b.maxZ - .25 || p.y < bunker.floorY + .25 || p.y > bunker.ceilingY - .25) return false;
      return !bunkerColliders(bunker.id).some(wall => (wall.kind === "wall" || wall.kind === "shelf" || wall.kind === "ladder")
        && p.x > wall.minX - .2 && p.x < wall.maxX + .2 && p.z > wall.minZ - .2 && p.z < wall.maxZ + .2);
    }
    const b = this.bounds;
    if (p.x < b.minX + 0.3 || p.x > b.maxX - 0.3 || p.z < b.minZ + 0.3 || p.z > b.maxZ - 0.3) return false;
    if (this.baikal) {
      // Cabin walls block the orbit at every height; furniture never does.
      for (const wall of BAIKAL_WALLS) if (p.x > wall.minX - .2 && p.x < wall.maxX + .2 && p.z > wall.minZ - .2 && p.z < wall.maxZ + .2 && p.y < 8) return false;
      const ceiling = baikalCeilingHeight(p.x, p.z);
      return (ceiling === null || p.y < ceiling - .2) && p.y > baikalFloorHeight(p.x, p.z) + .2;
    }
    if (this.cloudSpa) {
      for (let i = 0; i < 5; i++) {
        const wall = CLOUD_SPA_WALLS[i];
        if (p.x > wall.minX - .2 && p.x < wall.maxX + .2 && p.z > wall.minZ - .2 && p.z < wall.maxZ + .2 && p.y < CLOUD_SPA_RESORT.ceilingY + 6) return false;
      }
      const ceiling = cloudSpaCeilingHeight(p.x, p.z);
      return (ceiling === null || p.y < ceiling - .2) && p.y > cloudSpaFloorHeight(p.x, p.z) + .2;
    }
    if (this.bamboo) {
      // Keep the orbit out of the stalks: on the path, a yard, or just beyond the fence.
      if (!onTrail(p.x, p.z) && nearestOnTrail(p.x, p.z).distance > TRAIL_WALK_HALF + 0.9) return false;
      if (p.y < PAVILION_POST_HEIGHT + 0.6) for (const o of this.obstacles) if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.15) return false;
      const ceiling = bambooCeilingHeight(p.x, p.z);
      return (ceiling === null || p.y < ceiling - 0.18) && p.y >= this.deckHeight(p.x, p.z) + 0.2;
    }
    if (this.garden) {
      // Hall walls block the orbit at every height; the island railing only near the deck.
      for (const wall of GARDEN_WALLS) if (p.x > wall.minX - 0.2 && p.x < wall.maxX + 0.2 && p.z > wall.minZ - 0.2 && p.z < wall.maxZ + 0.2 && p.y < 14.5) return false;
      const ceiling = gardenCeilingHeight(p.x, p.z);
      return (ceiling === null || p.y < ceiling - 0.18) && p.y >= gardenFloorHeight(p.x, p.z) + 0.2;
    }
    if (this.uyuni) {
      // Furniture and low terrace rails do not block a camera above their tops.
      if (p.y < 1.65) for (const wall of UYUNI_HOTEL_COLLIDERS) if (p.x > wall.minX - 0.2 && p.x < wall.maxX + 0.2 && p.z > wall.minZ - 0.2 && p.z < wall.maxZ + 0.2) return false;
      for (const hotel of UYUNI_HOTELS) {
        if (Math.abs(p.x - hotel.x) < 4.9 && Math.abs(p.z - hotel.z - 4.8) < 0.3) return false;
      }
      const ceiling = uyuniHotelCeilingHeight(p.x, p.z);
      return (ceiling === null || p.y < ceiling - 0.18) && p.y >= uyuniHotelFloorHeight(p.x, p.z) + 0.2;
    }
    for (const w of SHELTER_COLLIDERS) if (p.x > w.minX - 0.25 && p.x < w.maxX + 0.25 && p.z > w.minZ - 0.25 && p.z < w.maxZ + 0.25) return false;
    for (const w of HOT_SPRING_COLLIDERS) if (p.x > w.minX - 0.15 && p.x < w.maxX + 0.15 && p.z > w.minZ - 0.15 && p.z < w.maxZ + 0.15) return false;
    const ceiling = hotSpringCeilingHeight(p.x, p.z);
    if (ceiling !== null && p.y > ceiling - 0.12) return false;
    const floor = hotSpringFloorHeight(p.x, p.z);
    if (floor !== null && p.y < floor + 0.2) return false;
    return true;
  }

  private updateSelfAvatar(dt: number) {
    this.updateSelfAvatarBase(dt);
    const chibi = this.chibiSelf, n = this.selfNode;
    if (!chibi || !n) return;
    const tooClose = (this.activeBunkerId || this.cloudSpa || this.baikal) && Math.hypot(this.camera.position.x - this.self.x, this.camera.position.z - this.self.z) < 1.35;
    const shown = this.view === "third" && !tooClose;
    const posed = Boolean(this.floatingPose(this.skyRest) || this.fixedSeat || this.restSeat);
    const use = shown && !posed;
    chibi.object.visible = use;
    if (!use) { chibi.resetFollow(); return; }
    if (n.avatar) n.avatar.root.visible = false;
    n.sprite.visible = false;
    n.shadow.visible = false;
    const y = this.deckHeight(this.self.x, this.self.z) + (this.bunkerClimbOffset ?? 0);
    // 바닷가의 yaw 는 (-sin, -cos) 을 보고, 치비는 (sin, cos) 을 본다
    chibi.follow(dt, this.self.x, y, this.self.z, this.self.yaw + Math.PI, this.self.moving);
    this.markWading(chibi.object, this.self.z);
  }

  /** First-person hides both renderers; the sprite remains a position/fallback anchor. */
  private updateSelfAvatarBase(dt: number) {
    const n = this.selfNode;
    if (!n) return;
    // In a narrow indoor orbit the character must not fill the lens when a wall or ladder pulls it forward.
    const tooClose = (this.activeBunkerId || this.cloudSpa || this.baikal) && Math.hypot(this.camera.position.x - this.self.x, this.camera.position.z - this.self.z) < 1.35;
    const shown = this.view === "third" && !tooClose;
    const avatar = this.syncAvatar(n, this.skin, this.self.x, this.self.z);
    this.markWading(avatar?.root, this.self.z);
    const lying = this.floatingPose(this.skyRest);
    avatar?.update(dt, {
      ...this.self, y: this.deckHeight(this.self.x, this.self.z) + (this.bunkerClimbOffset ?? 0), visible: shown, lying,
      seated: this.fixedSeat ?? (this.restSeat ? { ...this.restSeat, avatarY: this.deckHeight(this.restSeat.x, this.restSeat.z) + 0.52 } : null),
    });
    n.sprite.visible = shown && !avatar;
    if (!this.skyRest || !n.sprite.visible) this.pixelDepth?.update(n.sprite, this.skin, false);
    n.shadow.visible = shown;
    if (!shown) return;
    if (this.fixedSeat || this.restSeat) {
      const baseY = this.onsenSeat ? this.onsenSeat.baseY : this.pavilionSeat ? this.pavilionSeat.baseY : this.restSeat ? this.deckHeight(this.restSeat.x, this.restSeat.z) : 0;
      const seat = this.fixedSeat ?? { ...this.restSeat!, avatarY: baseY + 0.52 }, cam = this.camera.position;
      n.sprite.position.set(seat.x, baseY, seat.z);
      n.sprite.rotation.set(0, Math.atan2(cam.x - seat.x, cam.z - seat.z), 0, "YXZ");
      shapeSeatedAvatar(n.sprite, { yaw: seat.yaw, avatarY: seat.avatarY - baseY });
      n.shadow.visible = !this.onsenSeat;
      n.shadow.position.set(seat.x, (this.pavilionSeat ? this.deckHeight(seat.x, seat.z) : baseY) + 0.015, seat.z);
      this.setFrameOn(n.tex, viewFor(seat.yaw, seat.x, seat.z, cam), CHAR_ANIM.idle.from, this.skin);
      return;
    }
    shapeSeatedAvatar(n.sprite, null);
    if (lying) {
      applyLyingTransform(n.sprite, lying);
      this.pixelDepth?.update(n.sprite, this.skin, n.sprite.visible);
      n.shadow.visible = false;
      this.setFrameOn(n.tex, CHAR_VIEW.front, CHAR_ANIM.idle.from, this.skin);
      return;
    }
    const deck = this.deckHeight(this.self.x, this.self.z) + (this.bunkerClimbOffset ?? 0);
    const cam = this.camera.position;
    n.sprite.position.set(this.self.x, deck, this.self.z);
    n.sprite.rotation.set(0, Math.atan2(cam.x - this.self.x, cam.z - this.self.z), 0, "YXZ");
    n.shadow.position.set(this.self.x, deck + 0.015, this.self.z);
    n.animT += dt;
    this.setFrameOn(n.tex, viewFor(this.self.yaw, this.self.x, this.self.z, cam), charFrame(this.self.moving, n.animT), this.skin);
  }

  private collide(x: number, z: number, walking = false): [number, number] {
    if (this.baikal) {
      // Walls, furniture, hummocks and larches, then the plain's own edge.
      const point = resolveWalls(x, z, BAIKAL_COLLIDERS);
      return resolveBaikalWalk(point[0], point[1]);
    }
    if (this.cloudSpa) {
      const project = (x: number, z: number) => {
        const point = resolveWalls(x, z, CLOUD_SPA_WALLS);
        return resolveCloudSpaWalk(point[0], point[1]);
      };
      const target = project(x, z);
      if (!walking || this.cloudSpaStepClear(target[0], target[1])) return target;
      // The fronts of the terraces are steep; keep walking on the broad side steps instead of jumping floors.
      const slides = [project(target[0], this.self.z), project(this.self.x, target[1])]
        .filter(p => this.cloudSpaStepClear(p[0], p[1]))
        .sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z));
      return slides[0] ?? [this.self.x, this.self.z];
    }
    const bunker = bunkerById(this.activeBunkerId);
    if (bunker) {
      const b = bunker.bounds;
      [x, z] = resolveWalls(x, z, bunkerColliders(bunker.id));
      return [THREE.MathUtils.clamp(x, b.minX + .4, b.maxX - .4), THREE.MathUtils.clamp(z, b.minZ + .4, b.maxZ - .4)];
    }
    if (this.uyuni) return resolveWalls(x, z, UYUNI_HOTEL_COLLIDERS);
    for (const o of this.obstacles) {
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + 0.35;
      if (d < min && d > 1e-4) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
    }
    if (this.bamboo) {
      // Posts and the back railing, then the fenced corridor: the walker never enters the stalks.
      const railed = resolveWalls(x, z, BAMBOO_PAVILION_COLLIDERS);
      return resolveTrail(railed[0], railed[1]);
    }
    if (this.garden) {
      // Hall walls and the pavilion railing, then the shore paths, piers, bridge and hall floor: never into the water.
      const walled = resolveWalls(x, z, GARDEN_WALLS);
      return resolveGardenWalk(walled[0], walled[1]);
    }
    const sheltered = resolveWalls(x, z, SHELTER_COLLIDERS);
    return resolveWalls(sheltered[0], sheltered[1], HOT_SPRING_COLLIDERS);
  }

  private cloudSpaStepClear(x: number, z: number) {
    const distance = Math.hypot(x - this.self.x, z - this.self.z);
    const count = Math.max(1, Math.ceil(distance / .08));
    let previous = cloudSpaFloorHeight(this.self.x, this.self.z);
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const height = cloudSpaFloorHeight(this.self.x + (x - this.self.x) * t, this.self.z + (z - this.self.z) * t);
      if (Math.abs(height - previous) > .38) return false;
      previous = height;
    }
    return true;
  }

  private deckHeight(x: number, z: number) {
    if (this.baikal) return baikalFloorHeight(x, z);
    if (this.cloudSpa) return cloudSpaFloorHeight(x, z);
    if (this.activeBunkerId) return bunkerById(this.activeBunkerId)!.floorY;
    if (this.uyuni) return uyuniHotelFloorHeight(x, z);
    if (this.bamboo) return this.bamboo.floorHeight(x, z);
    if (this.garden) return gardenFloorHeight(x, z);
    const ledge = onsenLedgeHeight(x, z);
    if (ledge !== null) return ledge;
    const spring = hotSpringFloorHeight(x, z);
    if (spring !== null) return spring;
    if (this.mapId === "beach" && z < 0) return sandHeight(z);
    return SHELTERS.find((s) => Math.abs(x - s.x) <= s.width / 2 && Math.abs(z - s.z) <= s.depth / 2)?.floorY ?? 0;
  }

  private nearbySeat() {
    if (this.bamboo || this.garden || this.cloudSpa || this.baikal || this.activeBunkerId) return null;
    if (this.uyuni) {
      const hotel = nearbyUyuniHotel(this.self.x, this.self.z);
      if (!hotel) return null;
      return UYUNI_HOTEL_SEATS.filter(seat => seat.shelterId === `hotel-${hotel.id}`)
        .map(seat => ({ seat, distance: Math.hypot(this.self.x - seat.x, this.self.z - seat.z) }))
        .filter(candidate => candidate.distance <= 2.25).sort((a, b) => a.distance - b.distance)[0]?.seat ?? null;
    }
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

  /** Nearby sofas face the lounge; walking or the same action gets up. */
  toggleRest() {
    if (this.disposed || this.skyRest || this.fixedSeat) return;
    if (this.restSeat) { this.standUp(); return; }
    const seat = this.nearbySeat();
    if (!seat) return;
    this.returnFromSeat = { x: this.self.x, z: this.self.z };
    this.restSeat = seat;
    this.self.x = seat.x;
    this.self.z = seat.z;
    this.self.yaw = seat.yaw;
    this.orbitYaw = seat.yaw + (this.uyuni ? Math.PI : 0);
    if (this.uyuni) this.followSnap = true;
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
    const now = performance.now(), renderAt = this.remoteClock?.frameTime(now);
    let selectedNode: PlayerNode | null = null;
    for (const [pid, p] of this.players) {
      const claimed = claimedRestSlot(p.data), drifting = claimed?.spotId === "onsen-float";
      const seated = claimedSeatSlot(p.data);
      const onsenSeat = claimedOnsenSeat(p.data), onsenSeated = Boolean(onsenSeat);
      const fixed = drifting ? null : claimed ?? seated;
      const far = Math.hypot(p.target.x - p.cur.x, p.target.z - p.cur.z);
      if (fixed) { p.cur.x = fixed.x; p.cur.z = fixed.z; p.cur.yaw = fixed.yaw; p.cur.moving = false; }
      else if (p.motion && renderAt !== undefined) p.motion.write(renderAt, now, p.cur);
      else if (far > 7) { p.cur.x = p.target.x; p.cur.z = p.target.z; }
      else { p.cur.x += (p.target.x - p.cur.x) * smooth; p.cur.z += (p.target.z - p.cur.z) * smooth; }
      const walking = !fixed && !drifting && (p.motion ? p.cur.moving : p.target.moving || far > 0.12);
      p.animT += dt;
      const frame = charFrame(walking, p.animT);
      const turn = p.target.yaw - p.cur.yaw;
      if (!fixed && !p.motion) p.cur.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * smooth;
      const resting = this.floatingPose(claimed && drifting ? { ...claimed, x: p.cur.x, z: p.cur.z, yaw: p.cur.yaw } : claimed);
      // Pavilion seats are on the deck edge with legs over the side: the folded sprite stands on the ground below.
      const pavilionSeat = seated !== null ? (this.baikal ? claimedBaikalSeat(p.data) : this.cloudSpa ? claimedCloudSpaSeat(p.data) : this.uyuni ? claimedBunkerSeat(p.data) : this.garden ? claimedGardenSeat(p.data) : claimedPavilionSeat(p.data)) : null;
      if (!seated) shapeSeatedAvatar(p.sprite, null);
      if (resting) {
        applyLyingTransform(p.sprite, resting);
        this.setFrame(p, CHAR_VIEW.front, CHAR_ANIM.idle.from, p.data.skin);
      } else {
        p.sprite.rotation.set(0, Math.atan2(cam.x - p.cur.x, cam.z - p.cur.z), 0, "YXZ");
        if (seated) shapeSeatedAvatar(p.sprite, { yaw: seated.yaw, avatarY: seated.avatarY - (onsenSeat ? onsenSeat.baseY : pavilionSeat ? pavilionSeat.baseY : 0) });
        this.setFrame(p, viewFor(p.cur.yaw, p.cur.x, p.cur.z, cam), frame, p.data.skin);
      }
      const dl = Math.hypot(p.cur.x - cam.x, p.cur.z - cam.z);
      if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - dt * 2.2);
      const hop = !fixed && p.bounce > 0 ? Math.abs(Math.sin(p.bounce * Math.PI * 2)) * 0.22 * p.bounce : 0;
      const deck = this.deckHeight(p.cur.x, p.cur.z);
      if (!resting) p.sprite.position.set(p.cur.x, onsenSeat ? onsenSeat.baseY : pavilionSeat ? pavilionSeat.baseY : deck + hop, p.cur.z);
      const avatar = this.syncAvatar(p, p.data.skin, p.cur.x, p.cur.z);
      this.markWading(avatar?.root, p.cur.z);
      p.sprite.visible = !avatar;
      this.pixelDepth?.update(p.sprite, p.data.skin, Boolean(resting) && p.sprite.visible);
      avatar?.update(dt, { ...p.cur, y: deck + hop, moving: walking, visible: true, lying: resting, seated });
      p.shadow.visible = !resting && !onsenSeated;
      p.shadow.position.set(p.cur.x, deck + 0.015, p.cur.z);
      if (p.label) {
        if (resting) {
          const outside = stargazingBodyPoint(resting, -0.38);
          p.label.position.set(outside.x, (resting.avatarY ?? STARGAZING.avatarY) + 0.18, outside.z);
          p.label.scale.set(1.5, 0.375, 1);
          p.label.visible = pid === this.selected && dl > 2.5 && dl < 20;
        } else {
          p.label.position.set(p.cur.x, seated ? seated.avatarY + 1.22 : deck + AVATAR_HEIGHT + 0.14 + hop, p.cur.z);
          p.label.scale.set(2.2, 0.55, 1);
          p.label.visible = dl > 2.5 && dl < 24;
        }
      }
      if (pid === this.selected) selectedNode = p;
    }
    if (selectedNode) {
      const resting = this.floatingPose(claimedRestSlot(selectedNode.data));
      const point = resting ? stargazingBodyPoint(resting, AVATAR_HEIGHT / 2) : selectedNode.cur;
      this.ring.position.set(point.x, resting ? (resting.avatarY ?? STARGAZING.avatarY) + 0.01 : this.deckHeight(point.x, point.z) + 0.03, point.z);
      const s = 1 + Math.sin(this.time * 5) * 0.07;
      this.ring.scale.set(s, s, 1);
      this.ringMat.opacity = 0.75 + Math.sin(this.time * 5) * 0.2;
    }
  }

  private updateWorld(dt: number) {
    this.skyMat.uniforms.uTime.value = this.time;
    const motion = this.skyMat.uniforms.uStarMotion;
    if ((this.uyuni || this.bamboo || this.cloudSpa || this.baikal) && motion && this.skyMat.uniforms.uStars.value > 0) {
      const orientation = this.camera.quaternion;
      const turn = this.lastStarView ? this.lastStarView.angleTo(orientation) / Math.max(dt, 0.001) : 0;
      const strength = Math.max(this.self.moving ? 0.72 : 0, THREE.MathUtils.smoothstep(turn, 0.025, 0.7));
      motion.value = THREE.MathUtils.damp(motion.value, strength, strength > motion.value ? 12 : 4, dt);
      (this.lastStarView ??= new THREE.Quaternion()).copy(orientation);
    }
    if (this.baikal) {
      const seated = this.baikalSeated;
      seated.length = 0;
      if (this.pavilionSeat) seated.push(this.pavilionSeat);
      for (const player of this.players.values()) { const seat = claimedBaikalSeat(player.data); if (seat) seated.push(seat); }
      this.baikal.update(this.time, this.camera, this.self, seated);
    } else if (this.cloudSpa) {
      this.cloudSpa.update(this.time, this.camera, this.self, this.pavilionSeat);
    } else if (this.uyuni) {
      this.uyuni.update(this.time, this.camera, this.self);
    } else if (this.bamboo) {
      this.bamboo.update(this.time, this.camera, this.self);
      if (this.festivalToys) {
        const now = performance.now() + this.festivalClockOffset;
        this.festivalToys.beginFrame(this.time);
        this.drawFestivalToy(this.festivalOwnPid, this.selfNode, this.ownFestival, this.fixedSeat ?? this.self, now, this.view === "first");
        for (const [pid, node] of this.players) this.drawFestivalToy(pid, node, node.data.festival, node.cur, now);
        this.festivalToys.endFrame(now);
      }
    } else if (this.garden) {
      const riders: RemoteRider[] = [];
      for (const [pid, node] of this.players) riders.push({ pid, x: node.cur.x, z: node.cur.z });
      const alighted = this.garden.update(this.time, this.camera, this.self, riders, this.pavilionSeat);
      if (alighted) this.finishRide(alighted);
      if (this.garden.boatStateChanged()) this.handlers.onBoatChange?.(this.garden.boatState);
    } else {
      this.seaMat.uniforms.uTime.value = this.time;
      this.fire?.setPowder(this.firePowder.sample(performance.now()));
      this.fire?.update(this.time, this.camera);
      this.cove.setFireFlare(this.fire?.flareAmount ?? 0);
      if (this.fire) this.cove.setFireTint(this.fire.lightColor);
      this.cove.update(this.time, this.camera);
      (this.seaMat.uniforms.uCamPos.value as THREE.Vector3).copy(this.camera.position);
      this.lanterns?.update(this.time);
    }
    this.fireworks?.update(this.camera, undefined, this.renderer.domElement.height);
    this.uyuniMoments?.update(this.camera, undefined, this.renderer.domElement.height);
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
    this.chibiSelf?.object.removeFromParent();
    this.chibiSelf = null;
    this.ultraSea?.dispose();
    this.ultraSea = null;
    if (this.selfNode) {
      this.pixelDepth?.remove(this.selfNode.sprite);
      this.selfNode.avatar?.dispose();
      this.scene.remove(this.selfNode.sprite, this.selfNode.shadow);
      this.selfNode.sprite.geometry.dispose();
      this.selfNode.mat.dispose();
      this.selfNode.tex.dispose();
      this.selfNode = null;
    }
    this.avatarModels?.dispose();
    this.avatarModels = null;
    this.femaleAvatarModels?.dispose();
    this.femaleAvatarModels = null;
    this.onsenAvatarModels?.dispose();
    this.onsenAvatarModels = null;
    this.femaleOnsenAvatarModels?.dispose();
    this.femaleOnsenAvatarModels = null;
    this.pixelDepth?.dispose();
    this.pixelDepth = null;
    for (const f of this.fx) { this.scene.remove(f.sprite); f.mat.dispose(); }
    this.fx = [];
    this.careGestures?.dispose();
    this.careGestures = null;
    this.lanterns?.dispose();
    this.lanterns = null;
    this.fireworks?.dispose();
    this.fireworks = null;
    this.fireworkAudio?.dispose();
    this.fireworkAudio = null;
    this.uyuniMoments?.dispose();
    this.uyuniMoments = null;
    this.sparklerActors.clear();
    this.momentOwnPid = null;
    this.fire?.dispose();
    this.fire = null;
    this.uyuni?.dispose(); this.uyuni = null;
    this.bamboo?.dispose();
    this.garden?.dispose();
    this.garden = null;
    this.festivalToys?.dispose();
    this.bamboo = null;
    this.cloudSpa?.dispose(); this.cloudSpa = null;
    this.baikal?.dispose(); this.baikal = null;
    const textures = new Set<THREE.Texture>([...(this.uyuniTextures ?? []), ...(this.cloudSpaTextures ?? []), ...(this.baikalTextures ?? [])]);
    this.cloudSpaTextures = [];
    this.baikalTextures = [];
    this.uyuniTextures = [];
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
