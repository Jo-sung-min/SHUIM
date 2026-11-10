/**
 * 뼈대 + 몸(몸·머리카락 한 메시) + 실루엣 선 + 얼굴(눈·입) + 바닥 그림자를 묶은 캐릭터 하나.
 * 지오메트리는 buildChibi() 결과를 공유하므로 여러 명을 만들어도 메싱은 한 번이다.
 */
import * as THREE from "three";
import type { ChibiBuild } from "./build";
import { ChibiMotion } from "./motion";
import { createBlobShadow, createFaceMaterial, createOutlineMaterial, createToonMaterial } from "./materials";

export interface ChibiMaterials {
  toon: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
  face: THREE.ShaderMaterial;
}

export function createChibiMaterials(): ChibiMaterials {
  return { toon: createToonMaterial(), outline: createOutlineMaterial(), face: createFaceMaterial() };
}

export class ChibiCharacter {
  readonly object = new THREE.Group();
  readonly body: THREE.SkinnedMesh;
  readonly outline: THREE.SkinnedMesh;
  readonly face: THREE.SkinnedMesh;
  readonly shadow: THREE.Mesh;
  readonly motion: ChibiMotion;
  readonly root: THREE.Bone;

  constructor(build: ChibiBuild, readonly materials: ChibiMaterials) {
    // 뼈대 복제 (지오메트리·재질은 공유)
    this.root = build.root.clone(true);
    const bones = new Map<string, THREE.Bone>();
    this.root.traverse(o => { if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone); });
    // clone 은 userData 를 JSON 으로 복사하므로 꼬리 벡터를 다시 옮긴다
    build.root.traverse(o => { const b = bones.get(o.name); if (b) b.userData.tail = (o.userData.tail as THREE.Vector3).clone(); });
    this.object.add(this.root);
    this.object.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(build.skeleton.bones.map(b => bones.get(b.name)!), build.skeleton.boneInverses);

    const skinned = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.name = name;
      m.frustumCulled = false; // 점프·눌림으로 경계가 바뀌므로 한 명짜리 뷰어에선 끈다
      m.bind(skeleton, new THREE.Matrix4());
      this.object.add(m);
      return m;
    };
    this.body = skinned(build.body, materials.toon, "ChibiBody");
    this.outline = skinned(build.body, materials.outline, "ChibiOutline");
    this.face = skinned(build.face, materials.face, "ChibiFace");
    this.face.morphTargetInfluences = new Array(build.face.morphAttributes.position?.length ?? 0).fill(0);
    this.outline.renderOrder = 1;
    // 실루엣 선 두께는 화면 픽셀 기준이라 그리는 캔버스 해상도를 알아야 한다. 어느 장면에 들어가도 스스로 맞춘다.
    const size = new THREE.Vector2();
    this.outline.onBeforeRender = renderer => {
      renderer.getDrawingBufferSize(size);
      const u = materials.outline.uniforms;
      (u.uRes.value as THREE.Vector2).copy(size);
      u.uWidth.value = ((materials.outline.userData.widthCss as number | undefined) ?? 0.9) * renderer.getPixelRatio();
    };
    this.face.renderOrder = 2;

    this.shadow = createBlobShadow();
    this.object.add(this.shadow);
    this.motion = new ChibiMotion(bones, this.face);
  }

  private followed: { x: number; z: number } | null = null;

  /**
   * 다른 장면(바닷가 등)의 캐릭터 상태를 따라간다. 위치·높이는 그룹이 옮기고, 이동 거리와 방향은 모션에 넘긴다.
   * yaw 는 이 캐릭터 기준(0 이면 +z 를 봄). 한 번에 너무 멀리 뛰면 순간이동으로 보고 방향을 바로 맞춘다.
   */
  follow(dt: number, x: number, y: number, z: number, yaw: number, moving: boolean) {
    const s = this.object.scale.x || 1;
    const last = this.followed;
    if (!last || Math.hypot(x - last.x, z - last.z) > 2) this.motion.snapYaw(yaw);
    this.motion.follow(last ? (x - last.x) / s : 0, last ? (z - last.z) / s : 0, yaw, moving);
    this.followed = { x, z };
    this.object.position.set(x, y, z);
    this.update(dt);
  }

  /** 다음 follow 를 순간이동으로 다루게 한다 (앉았다 일어남 등) */
  resetFollow() { this.followed = null; }

  /** 장면의 낮·노을·밤 색조 (sRGB 0~1) */
  setTint(r: number, g: number, b: number) {
    for (const m of Object.values(this.materials)) (m.uniforms.uTint.value as THREE.Color).setRGB(r, g, b, THREE.SRGBColorSpace);
  }

  update(dt: number) {
    this.motion.update(dt);
    const m = this.motion;
    const f = m.face;
    this.materials.face.uniforms.uGaze.value.set(f.gazeX, f.gazeY);
    this.materials.toon.uniforms.uBlush.value = 0.3 + 0.28 * f.smile;
    // 그림자: 발밑을 따라가고 뛰면 작고 옅어진다
    const lift = this.root.position.y;
    this.shadow.position.set(this.root.position.x, 0.002, this.root.position.z);
    this.shadow.rotation.z = -m.yaw;
    const s = 1 / (1 + lift * 2.2);
    this.shadow.scale.set(s, s, 1);
    (this.shadow.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.22 * s;
  }

  setOutline(on: boolean) { this.outline.visible = on; }
}
