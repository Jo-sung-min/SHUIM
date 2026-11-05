import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export const MALE_AVATAR_MODEL_URL = "/beach/models/tripo-male-rigged-mobile-v3.glb";
export const FEMALE_AVATAR_MODEL_URL = "/beach/models/tripo-female-rigged-mobile-v2.glb";
export const MALE_ONSEN_AVATAR_MODEL_URL = "/beach/models/tripo-male-onsen-mobile-v2.glb";
export const FEMALE_ONSEN_AVATAR_MODEL_URL = "/beach/models/tripo-female-onsen-mobile-v2.glb";
export type AvatarKind = "male" | "female" | "male-onsen" | "female-onsen";
const AVATAR_MODEL_URLS: Record<AvatarKind, string> = {
  male: MALE_AVATAR_MODEL_URL, female: FEMALE_AVATAR_MODEL_URL,
  "male-onsen": MALE_ONSEN_AVATAR_MODEL_URL, "female-onsen": FEMALE_ONSEN_AVATAR_MODEL_URL,
};
const HEIGHT = 1.8;
const MAT_SURFACE_Y = 0.082;
const BODY_SUPPORT_BONE = /^(Hips|Spine\d*|(?:Left|Right)(?:UpLeg|Leg|Foot|ToeBase))$/;

export interface BeachAvatarState {
  x: number; z: number; yaw: number; moving: boolean; visible: boolean; y?: number;
  lying?: { x: number; z: number; yaw: number; avatarY?: number; incline?: number } | null;
  seated?: { x: number; z: number; yaw: number; avatarY: number } | null;
}

interface BoneRest {
  bone: THREE.Bone;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  animatedPosition: THREE.Vector3;
  animatedQuaternion: THREE.Quaternion;
  animatedScale: THREE.Vector3;
}

interface AvatarTemplateData {
  scale: number;
  x: number;
  y: number;
  z: number;
  backDepth: number;
  walk: THREE.AnimationClip | null;
}

/** Tripo's female rig has different names, but the same direct limb chains. */
function boneName(name: string) {
  const bare = name.replace(/^mixamorig[:_]?/i, "");
  const central: Record<string, string> = { Hip: "Hips", Waist: "Spine", Spine01: "Spine1", Spine02: "Spine2", NeckTwist02: "Neck" };
  if (central[bare]) return central[bare];
  const limb = /^(L|R)_(Clavicle|Upperarm|Forearm|Hand|Thigh|Calf|Foot|ToeBase)$/.exec(bare);
  if (!limb) return bare;
  const parts: Record<string, string> = { Clavicle: "Shoulder", Upperarm: "Arm", Forearm: "ForeArm", Hand: "Hand", Thigh: "UpLeg", Calf: "Leg", Foot: "Foot", ToeBase: "ToeBase" };
  return `${limb[1] === "L" ? "Left" : "Right"}${parts[limb[2]]}`;
}

/** Bounds and animation tracks are immutable for one downloaded model. */
function prepareAvatarTemplate(root: THREE.Object3D, clips: THREE.AnimationClip[], bounds: THREE.Box3): AvatarTemplateData {
  const scale = HEIGHT / (bounds.max.y - bounds.min.y), center = bounds.getCenter(new THREE.Vector3());
  let hips: THREE.Bone | undefined;
  root.traverse(object => { if (object instanceof THREE.Bone && boneName(object.name) === "Hips") hips = object; });
  const walk = clips.find(clip => /walk/i.test(clip.name))?.clone() ?? null;
  // Network movement owns horizontal travel; preserve the original vertical step.
  if (walk && hips) for (const track of walk.tracks) {
    if (track.name !== `${hips.name}.position`) continue;
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = hips.position.x;
      track.values[i + 2] = hips.position.z;
    }
  }
  return { scale, x: -center.x * scale, y: -bounds.min.y * scale, z: -center.z * scale,
    backDepth: (center.z - bounds.min.z) * scale, walk };
}

/** Paint in bind-space so facial details follow the skin without changing the packed UV atlas. */
export function prepareAvatarFace(root: THREE.Object3D, kind: AvatarKind, bounds = new THREE.Box3().setFromObject(root, true)) {
  // The yukata has its own facial geometry and atlas. Preserve its original face
  // until a separate bind-space mask has been measured for this model.
  if (kind === "male-onsen" || kind === "female-onsen") return;
  const scale = HEIGHT / (bounds.max.y - bounds.min.y), center = bounds.getCenter(new THREE.Vector3());
  const point = new THREE.Vector3();
  const leftEye = kind === "female" ? -0.139 : -0.157;
  const rightEye = kind === "female" ? 0.185 : 0.155;
  const eyeY = kind === "female" ? 1.167 : 1.100;
  const mouthX = kind === "female" ? 0.025 : 0.000;
  const mouthY = kind === "female" ? 1.015 : 0.950;
  const frontZ = kind === "female" ? 0.23 : 0.19;
  const prepared = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const position = object.geometry.getAttribute("position"), joints = object.geometry.getAttribute("skinIndex"), weights = object.geometry.getAttribute("skinWeight");
    const face = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i++) {
      object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld);
      let headWeight = 0;
      for (let j = 0; j < 4; j++) if (boneName(object.skeleton.bones[joints.getComponent(i, j)].name) === "Head") headWeight += weights.getComponent(i, j);
      face.set([(point.x - center.x) * scale, (point.y - bounds.min.y) * scale, (point.z - center.z) * scale, headWeight], i * 4);
    }
    object.geometry.setAttribute("beachFacePosition", new THREE.Float32BufferAttribute(face, 4));
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) continue;
      prepared.add(material);
      material.onBeforeCompile = shader => {
        shader.uniforms.beachEyes = { value: new THREE.Vector4(leftEye, rightEye, eyeY, frontZ) };
        shader.uniforms.beachSmile = { value: new THREE.Vector2(mouthX, mouthY) };
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 beachFacePosition;\nvarying vec4 vBeachFace;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBeachFace = beachFacePosition;");
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec4 vBeachFace;\nuniform vec4 beachEyes;\nuniform vec2 beachSmile;")
          .replace("#include <map_fragment>", `#include <map_fragment>
            float faceFront = smoothstep(0.45, 0.85, vBeachFace.w) * smoothstep(beachEyes.w, beachEyes.w + 0.025, vBeachFace.z);
            float eyeLeft = length((vBeachFace.xy - vec2(beachEyes.x, beachEyes.z)) / vec2(0.10, 0.12));
            float eyeRight = length((vBeachFace.xy - vec2(beachEyes.y, beachEyes.z)) / vec2(0.10, 0.12));
            float eyeRegion = 1.0 - smoothstep(0.78, 1.0, min(eyeLeft, eyeRight));
            float chroma = (diffuseColor.r - max(diffuseColor.g, diffuseColor.b)) / max(0.01, diffuseColor.r);
            float pigment = (1.0 - smoothstep(0.12, 0.22, max(diffuseColor.g, diffuseColor.b))) * smoothstep(0.12, 0.30, chroma);
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.50, 0.48), faceFront * eyeRegion * pigment);
            float smileX = (vBeachFace.x - beachSmile.x) / 0.045;
            float smileY = beachSmile.y + 0.014 * smileX * smileX;
            float smileStroke = 1.0 - smoothstep(0.0025, 0.006, abs(vBeachFace.y - smileY));
            float smileEnds = 1.0 - smoothstep(0.70, 1.0, abs(smileX));
            diffuseColor.rgb *= mix(vec3(1.0), vec3(0.38, 0.16, 0.12), smileStroke * smileEnds * faceFront * 0.78);
          `);
      };
      material.customProgramCacheKey = () => `beach-face-v1-${kind}`;
      material.needsUpdate = true;
    }
  });
}

function skeletonsIn(root: THREE.Object3D) {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
  return skeletons;
}

/** Geometry/materials belong to the pool; each actor only owns its cloned skeleton. */
function disposeTemplate(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<{ close: () => void }>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const skeleton of skeletonsIn(root)) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) {
    texture.dispose();
    const data = texture.source.data as { close?: () => void } | null;
    if (data && typeof data.close === "function") bitmaps.add(data as { close: () => void });
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

/** One download per beach visit, with independent animation state for every person. */
export class BeachAvatarModels {
  readonly kind: AvatarKind;
  private pending: Promise<void> | null = null;
  private template: THREE.Group | null = null;
  private clips: THREE.AnimationClip[] = [];
  private prepared: AvatarTemplateData | undefined;
  private actors = new Set<BeachAvatar>();
  private disposed = false;
  private retryAfter = 0;

  constructor(kind: AvatarKind = "male") { this.kind = kind; }

  get ready(): boolean { return !this.disposed && this.template !== null; }

  /** A failed mobile download can recover in the same visit without retrying every frame. */
  get canLoad(): boolean {
    return !this.disposed && !this.template && !this.pending && Date.now() >= this.retryAfter;
  }

  load(): Promise<void> {
    if (this.disposed || this.template) return Promise.resolve();
    if (this.pending) return this.pending;
    if (!this.canLoad) return Promise.resolve();
    const url = AVATAR_MODEL_URLS[this.kind];
    this.pending = assetLoader(new GLTFLoader()).setMeshoptDecoder(MeshoptDecoder).loadAsync(assetUrl(url)).then(gltf => {
      if (this.disposed) { disposeTemplate(gltf.scene); return; }
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
      const height = bounds.max.y - bounds.min.y;
      if (!Number.isFinite(height) || height <= 0 || !skeletonsIn(gltf.scene).size) {
        disposeTemplate(gltf.scene);
        return;
      }
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        // The small contact shadow is already drawn by the engine. Avoid a shadow-map
        // pass for every animated person on mobile, while receiving the warm scene light.
        object.castShadow = false;
        object.receiveShadow = true;
        object.frustumCulled = true;
        if (object instanceof THREE.SkinnedMesh) {
          object.computeBoundingSphere();
          if (object.boundingSphere) object.boundingSphere.radius *= 1.35;
        }
        object.renderOrder = 0;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.metalness = 0;
          material.roughness = Math.max(0.8, material.roughness);
          material.emissive.set(0x000000);
          material.emissiveIntensity = 0;
        }
      });
      prepareAvatarFace(gltf.scene, this.kind, bounds);
      this.template = gltf.scene;
      this.clips = gltf.animations;
      this.prepared = prepareAvatarTemplate(gltf.scene, gltf.animations, bounds);
    }).catch(() => {
      // Keep the existing sprite usable when the model cannot be downloaded/decoded.
    }).finally(() => {
      this.pending = null;
      if (!this.disposed && !this.template) this.retryAfter = Date.now() + 5000;
    });
    return this.pending;
  }

  create(): BeachAvatar | null {
    if (this.disposed || !this.template) return null;
    const actor = new BeachAvatar(this.template, this.clips, removed => this.actors.delete(removed), this.kind, this.prepared);
    this.actors.add(actor);
    return actor;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const actor of [...this.actors]) actor.dispose();
    if (this.template) disposeTemplate(this.template);
    this.template = null;
    this.clips = [];
    this.prepared = undefined;
  }
}

/** Rigged actor. Hands retain their own corrected bind pose during every action. */
export class BeachAvatar {
  readonly kind: AvatarKind;
  readonly root = new THREE.Group();
  private normalized = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private walk: THREE.AnimationAction | null = null;
  private bones = new Map<string, BoneRest>();
  private restHipHeight = 0.5;
  private seatedSupport: THREE.Vector3 | null = null;
  private backDepth = 0.15;
  private baseY = 0;
  private lyingLifts = new Map<number, number>();
  private time = 0;
  private walkWeight = 0;
  private disposed = false;
  private gesture: { kind: "wave" | "hug"; age: number; target?: { x: number; z: number } } | null = null;
  private onDispose: (actor: BeachAvatar) => void;
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private q3 = new THREE.Quaternion();

  constructor(template: THREE.Object3D, clips: THREE.AnimationClip[], onDispose: (actor: BeachAvatar) => void = () => {}, kind: AvatarKind = "male", prepared?: AvatarTemplateData) {
    this.kind = kind;
    this.onDispose = onDispose;
    this.root.name = `beach-${kind}-avatar`;
    this.root.visible = false;
    this.model = cloneSkeleton(template);
    this.normalized.add(this.model);
    this.root.add(this.normalized);
    if (!prepared) {
      this.root.updateMatrixWorld(true);
      prepared = prepareAvatarTemplate(this.model, clips, new THREE.Box3().setFromObject(this.model, true));
    }
    this.normalized.scale.setScalar(prepared.scale);
    this.normalized.position.set(prepared.x, prepared.y, prepared.z);
    this.baseY = this.normalized.position.y;
    this.backDepth = prepared.backDepth;
    this.model.traverse(object => {
      if (!(object instanceof THREE.Bone)) return;
      this.bones.set(boneName(object.name), {
        bone: object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
        animatedPosition: object.position.clone(), animatedQuaternion: object.quaternion.clone(), animatedScale: object.scale.clone(),
      });
    });
    this.root.updateMatrixWorld(true);
    const hips = this.bones.get("Hips");
    if (hips) this.restHipHeight = hips.bone.getWorldPosition(new THREE.Vector3()).y;
    this.mixer = new THREE.AnimationMixer(this.model);
    if (prepared.walk) {
      this.walk = this.mixer.clipAction(prepared.walk);
      this.walk.setEffectiveWeight(0).setEffectiveTimeScale(2).play();
      this.mixer.update(0);
    }
  }

  playGesture(kind: "wave" | "hug", target?: { x: number; z: number }) {
    if (this.disposed) return;
    this.gesture = { kind, age: 0, target: target ? { ...target } : undefined };
  }

  /** Aim a limb in avatar coordinates without assuming Tripo's local bone axes. */
  private aim(name: string, childName: string, x: number, y: number, z: number, weight = 1) {
    const rest = this.bones.get(name), child = this.bones.get(childName);
    if (!rest || !child || !rest.bone.parent) return;
    // These queries update the needed ancestor paths, including limbs posed earlier
    // in this frame. Updating the entire skeleton here repeats that work per limb.
    this.root.getWorldQuaternion(this.q1);
    rest.bone.parent.getWorldQuaternion(this.q2).invert();
    this.v1.set(x, y, z).normalize().applyQuaternion(this.q1).applyQuaternion(this.q2).normalize();
    this.v2.copy(child.position).normalize().applyQuaternion(rest.quaternion).normalize();
    this.q3.setFromUnitVectors(this.v2, this.v1).multiply(rest.quaternion);
    rest.bone.quaternion.slerp(this.q3, weight);
  }

  private seatedPose() {
    for (const side of ["Left", "Right"]) {
      const sign = side === "Left" ? 1 : -1;
      this.aim(`${side}UpLeg`, `${side}Leg`, sign * 0.08, -0.42, 0.91);
      this.aim(`${side}Leg`, `${side}Foot`, 0, -1, -0.08);
      this.aim(`${side}Foot`, `${side}ToeBase`, 0, -0.18, 1);
      this.aim(`${side}Arm`, `${side}ForeArm`, sign * 0.2, -0.9, 0.35, 0.75);
      this.aim(`${side}ForeArm`, `${side}Hand`, -sign * 0.18, -0.65, 0.75, 0.75);
    }
  }

  /** Seat the visible pelvis, not its internal joint; skirts and hanging legs are not support points. */
  private seatedContact() {
    const hips = this.bones.get("Hips");
    if (!hips) return new THREE.Vector3(0, this.restHipHeight, 0);
    const inverse = this.root.matrixWorld.clone().invert();
    const center = hips.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse);
    let bottom = Infinity;
    this.model.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const positions = object.geometry.getAttribute("position");
      const joints = object.geometry.getAttribute("skinIndex"), weights = object.geometry.getAttribute("skinWeight");
      if (!positions || !joints || !weights) return;
      const pelvis = object.skeleton.bones.map(bone => /^(Hips|Pelvis)$/.test(boneName(bone.name)));
      for (let index = 0; index < positions.count; index++) {
        let strongest = 0;
        for (let slot = 1; slot < 4; slot++) if (weights.getComponent(index, slot) > weights.getComponent(index, strongest)) strongest = slot;
        if (!pelvis[joints.getComponent(index, strongest)]) continue;
        object.getVertexPosition(index, this.v1).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        if (this.v1.y <= center.y) bottom = Math.min(bottom, this.v1.y);
      }
    });
    center.y = Number.isFinite(bottom) ? bottom : center.y;
    return center;
  }

  /** Hair and the oversized head must not lift the back and legs off the mat. */
  private bodyContactY() {
    let bottom = Infinity;
    this.root.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const position = object.geometry.getAttribute("position");
      const joints = object.geometry.getAttribute("skinIndex"), weights = object.geometry.getAttribute("skinWeight");
      if (!position || !joints || !weights) return;
      const supports = object.skeleton.bones.map(bone => BODY_SUPPORT_BONE.test(boneName(bone.name)));
      for (let index = 0; index < position.count; index++) {
        let support = 0;
        for (let slot = 0; slot < 4; slot++) {
          if (supports[joints.getComponent(index, slot)]) support += weights.getComponent(index, slot);
        }
        if (support < 0.5) continue;
        object.getVertexPosition(index, this.v1).applyMatrix4(object.matrixWorld);
        bottom = Math.min(bottom, this.v1.y);
      }
    });
    return bottom;
  }

  update(dt: number, state: BeachAvatarState) {
    if (this.disposed) return;
    const step = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.time += step;
    this.root.visible = state.visible;
    if (this.gesture) {
      this.gesture.age += step;
      if (this.gesture.age >= (this.gesture.kind === "wave" ? 2.05 : 2.35)) this.gesture = null;
    }
    const lying = state.lying, seated = !lying && state.seated;
    const walking = state.moving && !lying && !seated;
    this.walkWeight = THREE.MathUtils.damp(this.walkWeight, walking ? 1 : 0, 12, step);
    if (this.walkWeight < 0.001) this.walkWeight = 0;
    if (lying || seated) this.walkWeight = 0;

    this.normalized.position.y = this.baseY;
    // Mats and beds support the body independently of long hair and oversized heads.
    // Beds lower that support surface to tuck the torso and legs under the quilt.
    const lyingSurfaceY = lying ? (lying.avatarY ?? MAT_SURFACE_Y) - ((lying.incline ?? 0) > 0 ? 0.2 : 0) : 0;
    if (lying) {
      this.root.position.set(lying.x, lyingSurfaceY + (this.lyingLifts.get(lying.incline ?? 0) ?? this.backDepth), lying.z);
      this.root.rotation.set(-Math.PI / 2 + (lying.incline ?? 0), lying.yaw, 0, "YXZ");
    } else if (seated) {
      this.root.position.set(seated.x, seated.avatarY - this.restHipHeight, seated.z);
      this.root.rotation.set(0, seated.yaw + Math.PI, 0, "YXZ");
    } else {
      this.root.position.set(state.x, state.y ?? 0, state.z);
      this.root.rotation.set(0, state.yaw + Math.PI, 0, "YXZ");
      const target = this.gesture?.target;
      if (target && !walking && Math.hypot(target.x - state.x, target.z - state.z) > 0.01) {
        this.root.rotation.y = Math.atan2(target.x - state.x, target.z - state.z);
      }
      this.normalized.position.y += Math.sin(this.time * 1.8) * 0.006 * (1 - this.walkWeight);
    }
    if (!state.visible) return;
    for (const rest of this.bones.values()) {
      // Restore the last mixer result before applying a procedural pose. Restoring
      // bind pose instead would bypass PropertyMixer's unchanged-value cache.
      rest.bone.position.copy(rest.animatedPosition);
      rest.bone.quaternion.copy(rest.animatedQuaternion);
      rest.bone.scale.copy(rest.animatedScale);
    }
    this.walk?.setEffectiveWeight(this.walkWeight);
    this.mixer.update(step);
    for (const rest of this.bones.values()) {
      rest.animatedPosition.copy(rest.bone.position);
      rest.animatedQuaternion.copy(rest.bone.quaternion);
      rest.animatedScale.copy(rest.bone.scale);
    }
    if (seated) this.seatedPose();
    if (lying) {
      // A relaxed pose on the back, with hands beside the body. Rotation of the
      // entire actor supplies the lying pose; hands keep their proven bind pose.
      this.aim("Neck", "Head", 0, 0.9, 0.435);
      for (const side of ["Left", "Right"]) {
        const sign = side === "Left" ? 1 : -1;
        this.aim(`${side}Arm`, `${side}ForeArm`, sign * 0.32, -0.95, 0.06, 0.5);
        this.aim(`${side}ForeArm`, `${side}Hand`, sign * 0.08, -1, 0.04, 0.5);
      }
    }
    if (this.gesture && !lying) {
      const duration = this.gesture.kind === "wave" ? 2.05 : 2.35;
      const weight = Math.min(1, this.gesture.age / 0.3) * Math.min(1, (duration - this.gesture.age) / 0.45);
      if (this.gesture.kind === "wave") {
        this.aim("RightArm", "RightForeArm", -0.9, 0.2, 0.35, weight);
        this.aim("RightForeArm", "RightHand", Math.sin(this.gesture.age * 11) * 0.45, 1, 0.18, weight);
      } else {
        for (const side of ["Left", "Right"]) {
          const sign = side === "Left" ? 1 : -1;
          this.aim(`${side}Arm`, `${side}ForeArm`, sign * 0.65, -0.35, 0.76, weight);
          this.aim(`${side}ForeArm`, `${side}Hand`, -sign * 0.62, 0.12, 0.8, weight);
        }
      }
    }
    this.root.updateMatrixWorld(true);
    if (seated) {
      // This pose is fixed: scan its support surface once, then reuse the offset
      // for every log/sofa, yaw and frame without reskinning the mesh for contact.
      this.seatedSupport ??= this.seatedContact();
      this.v1.copy(this.seatedSupport).applyQuaternion(this.root.quaternion);
      this.root.position.set(seated.x - this.v1.x, seated.avatarY - this.v1.y, seated.z - this.v1.z);
      this.root.updateMatrixWorld(true);
    }
    if (lying && !this.lyingLifts.has(lying.incline ?? 0)) {
      const bodyBottom = this.bodyContactY();
      const bottom = Number.isFinite(bodyBottom) ? bodyBottom : new THREE.Box3().setFromObject(this.root, true).min.y;
      const lift = this.root.position.y - bottom;
      this.lyingLifts.set(lying.incline ?? 0, lift);
      this.root.position.y = lyingSurfaceY + lift;
      this.root.updateMatrixWorld(true);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const skeleton of skeletonsIn(this.model)) skeleton.dispose();
    this.root.removeFromParent();
    this.root.clear();
    this.bones.clear();
    this.gesture = null;
    this.onDispose(this);
  }
}
