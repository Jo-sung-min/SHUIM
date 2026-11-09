import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import type { BeachAvatarState } from "./rigged-avatar";
import { SPARKLER_DRAW_END, SPARKLER_RELEASE_END } from "./sparkler-timing";

export const PAPER_AVATAR_FRONT_URL = "/characters/mongsil/front-v1.webp";
export const PAPER_AVATAR_BACK_URL = "/characters/mongsil/back-v1.webp";
export const PAPER_AVATAR_LEFT_URL = "/characters/mongsil/left-v1.webp";
export const PAPER_AVATAR_RIGHT_URL = "/characters/mongsil/right-v1.webp";
export const PAPER_AVATAR_HEIGHT = 1.8;
export const PAPER_AVATAR_DEPTH = 0;
const SEAT_SUPPORT_Y = 0.25;
const MORPHS = ["wave", "hug", "hold", "drawX", "drawY"] as const;
type PaperMorph = typeof MORPHS[number];
type PaperView = "front" | "left" | "back" | "right";
const VIEWS: PaperView[] = ["front", "left", "back", "right"];
const VIEW_URLS = [PAPER_AVATAR_FRONT_URL, PAPER_AVATAR_LEFT_URL, PAPER_AVATAR_BACK_URL, PAPER_AVATAR_RIGHT_URL];
interface PaperFrame {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  hand: THREE.Vector3;
  handDeltas: THREE.Vector3[];
}
interface PaperTemplate { frames: Record<PaperView, PaperFrame>; textures: THREE.Texture[] }

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** One small paper deformation, shared by the front, back, edge and prop grip. */
function deformation(x: number, y: number, morph: PaperMorph, width: number, out: THREE.Vector3, view: PaperView = "front", hand?: THREE.Vector3) {
  const scale = width / (512 / 672 * PAPER_AVATAR_HEIGHT);
  const mirror = view === "back" ? -1 : 1;
  const localX = x / scale * mirror;
  const profile = view === "left" || view === "right";
  const arm = profile && hand
    ? (1 - smooth(.10, .29, Math.abs(x - hand.x))) * (1 - smooth(.70, .86, y)) * smooth(.25, .40, y)
    : smooth(.25, .42, Math.abs(localX)) * (1 - smooth(.72, .88, y)) * smooth(.26, .40, y);
  out.set(0, 0, 0);
  if (morph === "hug") return out.set(-x * .27, .10, .10).multiplyScalar(arm);
  if (!profile && localX >= 0) return out;
  if (profile && morph === "wave") return out.set(view === "left" ? -.08 : .08, .28, .025).multiplyScalar(arm);
  if (morph === "wave") {
    const px = localX + .29, py = y - .72, angle = -.95;
    return out.set((Math.cos(angle) * px - Math.sin(angle) * py - px) * scale * mirror,
      Math.sin(angle) * px + Math.cos(angle) * py - py, .025).multiplyScalar(arm);
  }
  if (morph === "hold") return out.set(profile ? (view === "left" ? -.11 : .11) : .08 * scale * mirror, profile ? .34 : .42, .08).multiplyScalar(arm);
  if (morph === "drawX") return out.set(.12 * scale, 0, 0).multiplyScalar(arm);
  return out.set(0, .17, 0).multiplyScalar(arm);
}

function addMorphs(geometry: THREE.BufferGeometry, width: number, view: PaperView, hand: THREE.Vector3) {
  const position = geometry.getAttribute("position"), delta = new THREE.Vector3();
  if (!position.count) return;
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = MORPHS.map(name => {
    const values = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      deformation(position.getX(i), position.getY(i), name, width, delta, view, hand);
      delta.toArray(values, i * 3);
    }
    const attribute = new THREE.Float32BufferAttribute(values, 3);
    attribute.name = name;
    return attribute;
  });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** Each direction has its own painted, rounded silhouette; there is no thin side mesh. */
function prepareTemplate(textures: THREE.Texture[]): PaperTemplate {
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const aspect = (image?.width ?? 0) / (image?.height ?? 0);
    if (!Number.isFinite(aspect) || aspect < .25 || aspect > 2) throw new Error("Invalid avatar image");
  }
  const frames = {} as Record<PaperView, PaperFrame>;
  for (let i = 0; i < VIEWS.length; i++) {
    const view = VIEWS[i], map = textures[i];
    const image = map.image as { width: number; height: number };
    const width = image.width / image.height * PAPER_AVATAR_HEIGHT;
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(width, PAPER_AVATAR_HEIGHT, 32, 44);
    geometry.translate(0, PAPER_AVATAR_HEIGHT / 2, 0);
    // Front/back palms are mirrored. Profile art is aligned to the same body height.
    const handX = view === "front" ? 74 / 512 : view === "back" ? 438 / 512 : view === "left" ? .56 : .44;
    const handV = view === "front" || view === "back" ? 485 / 672 : .80;
    const hand = new THREE.Vector3((handX - .5) * width, (1 - handV) * PAPER_AVATAR_HEIGHT, .008);
    addMorphs(geometry, width, view, hand);
    const material = new THREE.MeshBasicMaterial({ map, alphaTest: .12, transparent: false,
      depthWrite: true, toneMapped: false, side: THREE.DoubleSide });
    const handDeltas = MORPHS.map(morph => deformation(hand.x, hand.y, morph, width, new THREE.Vector3(), view, hand));
    frames[view] = { geometry, material, hand, handDeltas };
  }
  return { frames, textures };
}
function disposeTextures(textures: THREE.Texture[]) {
  const images = new Set<{ close: () => void }>();
  for (const texture of new Set(textures)) {
    texture.dispose();
    const image = texture.source.data as { close?: () => void } | null;
    if (image && typeof image.close === "function") images.add(image as { close: () => void });
  }
  for (const image of images) image.close();
}

/** Four directional pictures and shared geometry for every mascot in a visit. */
export class PaperAvatarModels {
  readonly kind = "mongsil" as const;
  private pending: Promise<void> | null = null;
  private template: PaperTemplate | null = null;
  private actors = new Set<PaperAvatar>();
  private disposed = false;
  private retryAfter = 0;
  private camera?: THREE.Camera;

  constructor(camera?: THREE.Camera) { this.camera = camera; }

  get ready() { return !this.disposed && this.template !== null; }
  get canLoad() { return !this.disposed && !this.template && !this.pending && Date.now() >= this.retryAfter; }

  load(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.canLoad) return Promise.resolve();
    const loader = assetLoader(new THREE.TextureLoader());
    this.pending = Promise.allSettled(VIEW_URLS
      .map(url => Promise.resolve().then(() => loader.loadAsync(assetUrl(url)))))
      .then(results => {
        const textures = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        if (this.disposed || textures.length !== VIEWS.length) { disposeTextures(textures); return; }
        try { this.template = prepareTemplate(textures); }
        catch { disposeTextures(textures); }
      }).finally(() => {
        this.pending = null;
        if (!this.disposed && !this.template) this.retryAfter = Date.now() + 5000;
      });
    return this.pending;
  }

  create(): PaperAvatar | null {
    if (!this.ready || !this.template) return null;
    const actor = new PaperAvatar(this.template, removed => this.actors.delete(removed), this.camera);
    this.actors.add(actor);
    return actor;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const actor of [...this.actors]) actor.dispose();
    if (this.template) {
      for (const frame of Object.values(this.template.frames)) { frame.geometry.dispose(); frame.material.dispose(); }
      disposeTextures(this.template.textures);
      this.template = null;
    }
  }
}

/** A rounded illustrated puppet with camera-relative front, profile and back artwork. */
export class PaperAvatar {
  readonly kind = "mongsil" as const;
  readonly root = new THREE.Group();
  private pose = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private influences = new Float32Array(MORPHS.length);
  private time = 0;
  private walkWeight = 0;
  private disposed = false;
  private state: BeachAvatarState | null = null;
  private gesture: { kind: "wave" | "hug"; age: number; target?: { x: number; z: number } } | null = null;
  private localTarget = new THREE.Vector3();
  private template: PaperTemplate;
  private onDispose: (actor: PaperAvatar) => void;
  private camera?: THREE.Camera;
  private cameraPosition = new THREE.Vector3();
  private view: PaperView = "front";

  constructor(template: PaperTemplate, onDispose: (actor: PaperAvatar) => void = () => {}, camera?: THREE.Camera) {
    this.template = template; this.onDispose = onDispose;
    this.camera = camera;
    this.root.name = "paper-avatar-mongsil";
    this.pose.name = "paper-avatar-pose";
    this.root.add(this.pose);
    VIEWS.forEach(view => {
      const frame = template.frames[view];
      const mesh = new THREE.Mesh(frame.geometry, frame.material);
      mesh.name = `paper-${view}`; mesh.visible = view === this.view;
      mesh.castShadow = false; mesh.receiveShadow = false;
      this.meshes.push(mesh); this.pose.add(mesh);
    });
  }

  private applyMorphs() {
    for (const mesh of this.meshes) if (mesh.morphTargetInfluences) {
      for (let i = 0; i < MORPHS.length; i++) mesh.morphTargetInfluences[i] = this.influences[i];
    }
  }

  private faceCamera(lying: boolean) {
    if (lying) { this.view = "front"; this.pose.rotation.y = 0; }
    else if (this.camera) {
      this.camera.getWorldPosition(this.cameraPosition);
      const dx = this.cameraPosition.x - this.root.position.x, dz = this.cameraPosition.z - this.root.position.z;
      if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > .001) {
        const angle = Math.atan2(dx, dz) - this.root.rotation.y;
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
        const center = VIEWS.indexOf(this.view) * Math.PI / 2;
        // An eight-degree margin prevents art flicker around diagonal camera angles.
        if (Math.abs(wrap(angle - center)) > Math.PI / 4 + Math.PI * 8 / 180) {
          this.view = VIEWS[((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4];
        }
        this.pose.rotation.y = angle;
      }
    }
    for (let i = 0; i < this.meshes.length; i++) this.meshes[i].visible = VIEWS[i] === this.view;
  }

  update(dt: number, state: BeachAvatarState) {
    if (this.disposed) return;
    const rest = state.lying ?? state.seated;
    if (![state.x, state.z, state.yaw, state.y ?? 0, ...(rest ? [rest.x, rest.z, rest.yaw, rest.avatarY ?? .082] : [])].every(Number.isFinite)) {
      this.state = null; this.root.visible = false; return;
    }
    this.state = state;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, .1) : 0;
    this.time += delta;
    this.root.visible = state.visible;
    this.influences.fill(0);
    this.pose.position.set(0, 0, 0); this.pose.rotation.set(0, 0, 0, "YXZ"); this.pose.scale.set(1, 1, 1);
    this.walkWeight += ((state.moving && !rest ? 1 : 0) - this.walkWeight) * (1 - Math.exp(-delta * 12));
    if (this.gesture) {
      this.gesture.age += delta;
      const duration = this.gesture.kind === "wave" ? 2.05 : 2.35;
      if (this.gesture.age >= duration) this.gesture = null;
    }
    if (state.lying) {
      const lying = state.lying;
      const incline = Number.isFinite(lying.incline) ? lying.incline! : 0;
      const roll = Number.isFinite(lying.roll) ? lying.roll! : 0;
      this.root.position.set(lying.x, (lying.avatarY ?? .082) + .012, lying.z);
      this.root.rotation.set(-Math.PI / 2 + incline, lying.yaw, roll, "YXZ");
    } else {
      const seated = state.seated;
      this.root.rotation.set(0, (seated?.yaw ?? state.yaw) + Math.PI, 0, "YXZ");
      const breath = 1 + Math.sin(this.time * 2.2) * .004;
      this.pose.scale.set(1, breath, 1);
      if (seated) {
        // Short illustrated feet dangle below the hip contact, without sinking the head into the seat.
        this.root.position.set(seated.x, seated.avatarY - SEAT_SUPPORT_Y * breath, seated.z);
      } else {
        this.root.position.set(state.x, state.y ?? 0, state.z);
        this.pose.position.y = Math.abs(Math.sin(this.time * 8.5)) * .025 * this.walkWeight;
        this.pose.rotation.z = Math.sin(this.time * 8.5) * .045 * this.walkWeight;
      }
      if (this.gesture && !state.moving) {
        const { kind, age } = this.gesture, duration = kind === "wave" ? 2.05 : 2.35;
        const target = this.gesture.target;
        if (target && !seated && Math.hypot(target.x - state.x, target.z - state.z) > .001) {
          this.root.rotation.y = Math.atan2(target.x - state.x, target.z - state.z);
        }
        const envelope = smooth(0, .25, age) * (1 - smooth(duration - .4, duration, age));
        this.influences[kind === "wave" ? 0 : 1] = envelope * (kind === "wave" ? .84 + Math.sin(age * 12) * .16 : 1);
      }
    }
    this.faceCamera(!!state.lying);
    this.applyMorphs();
    this.root.updateMatrixWorld(true);
  }

  playGesture(kind: "wave" | "hug", target?: { x: number; z: number }) {
    if (!this.disposed) this.gesture = { kind, age: 0,
      target: target && Number.isFinite(target.x) && Number.isFinite(target.z) ? { ...target } : undefined };
  }

  getSparklerGrip(out = new THREE.Vector3()): THREE.Vector3 | null {
    if (this.disposed || !this.state) return null;
    const frame = this.template.frames[this.view];
    out.copy(frame.hand);
    for (let i = 0; i < MORPHS.length; i++) out.addScaledVector(frame.handDeltas[i], this.influences[i]);
    this.root.updateMatrixWorld(true);
    return this.pose.localToWorld(out);
  }

  poseSparkler(target: THREE.Vector3, age: number): THREE.Vector3 | null {
    const state = this.state;
    if (this.disposed || !state || state.moving || state.lying || state.seated ||
      ![target.x, target.y, target.z, age].every(Number.isFinite) || age < 0 || age >= SPARKLER_RELEASE_END) return null;
    const envelope = smooth(0, .35, age) * (1 - smooth(SPARKLER_DRAW_END, SPARKLER_RELEASE_END, age));
    this.root.updateMatrixWorld(true);
    this.localTarget.copy(target); this.pose.worldToLocal(this.localTarget);
    const frame = this.template.frames[this.view], held = frame.hand, delta = frame.handDeltas[2];
    this.influences[0] = 0; this.influences[1] = 0;
    this.influences[2] = envelope;
    this.influences[3] = clamp((this.localTarget.x - held.x - delta.x) / .12, -1, 1) * envelope;
    this.influences[4] = clamp((this.localTarget.y - held.y - delta.y) / .17, -1, 1) * envelope;
    this.applyMorphs();
    // This is the actual deformed illustrated palm, never the requested remote point.
    return this.getSparklerGrip();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.visible = false; this.root.removeFromParent(); this.root.clear();
    this.pose.clear(); this.meshes.length = 0; this.state = null;
    this.onDispose(this);
  }
}
