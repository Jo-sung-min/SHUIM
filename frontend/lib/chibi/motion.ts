/**
 * 말랑한 절차적 애니메이션.
 *
 * - 방향 전환: 머리 → 가슴 → 골반 순서로 스프링이 목표 방향을 따라간다(감쇠가 1보다 작아 멈출 때 살짝 흔들리며 선다).
 * - 걷기: 보폭과 이동 속도를 같은 값으로 묶은 발 궤적 + 2관절 IK → 디딘 발이 땅에서 미끄러지지 않는다.
 *         착지마다 몸이 살짝 눌렸다가(squash) 발이 뜨면 돌아온다. 머리·팔·머리카락은 몸 가속도를 받아 한 박자 늦게 따라온다.
 * - 점프: 웅크림(눌림) → 도약(늘어남) → 공중(원래 비율) → 착지(눌렸다 탄력 있게 복원).
 * - 머리카락: VRM 스프링 본 방식(관성 + 복원력 + 중력, 머리·몸 구 충돌, 각도 제한).
 * - 표정: 불규칙한 눈 깜빡임(가끔 두 번), 미소·놀람·졸림은 스프링으로 섞인다.
 * 모든 변형은 실루엣이 무너지지 않게 범위를 제한한다.
 */
import * as THREE from "three";
import { FACE_MORPHS } from "./face";

export interface MotionSettings {
  /** 전체 애니메이션 속도 배율 */
  speed: number;
  /** 0 = 단단, 1 = 아주 말랑 */
  softness: number;
  /** 걷는 속도 m/s (키 1 기준) */
  walkSpeed: number;
}

export type Locomotion = "idle" | "walk";

class Spring {
  x: number; v = 0;
  constructor(x = 0) { this.x = x; }
  step(target: number, freq: number, zeta: number, dt: number, force = 0) {
    const w = 2 * Math.PI * freq;
    // 큰 dt 에서도 터지지 않게 쪼갠다
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = w * w * (target - this.x) - 2 * zeta * w * this.v + force;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface SpringJoint {
  bone: THREE.Bone;
  tail: THREE.Vector3; // 휴식 자세 꼬리(뼈 로컬)
  cur: THREE.Vector3;
  prev: THREE.Vector3;
  stiffness: number;
  drag: number;
  gravity: number;
  radius: number;
  maxAngle: number;
}

interface Collider { bone: THREE.Bone; offset: THREE.Vector3; radius: number }

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

export class ChibiMotion {
  settings: MotionSettings = { speed: 1, softness: 0.6, walkSpeed: 0.32 };
  locomotion: Locomotion = "idle";
  /** 걷기 모드에서 이 반경을 벗어나면 안쪽으로 돌아선다 */
  wanderRadius = 1.4;

  // 위치·방향
  readonly position = new THREE.Vector3();
  targetYaw = 0;
  private headYaw = new Spring(); private chestYaw = new Spring(); private rootYaw = new Spring();
  private walk = new Spring(); // 걷기 섞임 0..1
  private stepIdle = new Spring(); // 제자리 회전 종종걸음
  private phase = 0;
  // 한 걸음 주기(좌우 한 번씩) 동안 나아가는 거리와 발이 땅에 닿아 있는 비율. 빠를수록 보폭이 길고 땅에 닿는 시간이 짧다(종종 뛰기).
  private cycle = 0.24; private duty = 0.56;
  private run = new Spring();
  // 디딤 보폭 섞임: 몸이 움직이는 동안은 1 이어야 디딘 발이 땅에 붙는다 (걷기 섞임 wb 와 따로, 빨리 따라간다)
  private stride = new Spring();
  // 게임 엔진이 위치를 정하는 모드 (바닷가 등)
  private external = false; private extDist = 0;
  private y = 0; private vy = 0; private airborne = false;
  private jumpT = -1;
  private squash = new Spring(); private squashTarget = 0;
  private crouch = new Spring(); private crouchTarget = 0;
  private headPitch = new Spring(); private headRoll = new Spring();
  private armPitch = new Spring(); private armSpread = new Spring();
  private prevVel = new THREE.Vector3(); private vel = new THREE.Vector3(); private accel = new THREE.Vector3();
  private lastPos = new THREE.Vector3(); private lastY = 0;
  private time = 0;

  // 표정
  smileTarget = 0; surpriseTarget = 0; sleepy = 0; autoBlink = true;
  private smile = new Spring(); private surprise = new Spring();
  private blinkClock = 2; private blinkT = -1; private doubleBlink = false;
  private gaze = new THREE.Vector2(); private gazeTarget = new THREE.Vector2(); private gazeClock = 2;
  readonly face = { blink: 0, sleepy: 0, smile: 0, surprise: 0, gazeX: 0, gazeY: 0 };

  private bones: Map<string, THREE.Bone>;
  private rest = new Map<string, THREE.Vector3>();
  private joints: SpringJoint[] = [];
  private colliders: Collider[] = [];
  private lenThigh: number; private lenShin: number;

  constructor(bones: Map<string, THREE.Bone>, private faceMesh?: THREE.SkinnedMesh) {
    this.bones = bones;
    for (const [n, b] of bones) this.rest.set(n, b.position.clone());
    this.lenThigh = this.b("LowerLeg_L").position.length();
    this.lenShin = this.b("Foot_L").position.length();
    const hair = (name: string, stiffness: number, drag: number, gravity: number, maxAngle: number) => {
      const bone = this.b(name);
      const tail = (bone.userData.tail as THREE.Vector3).clone();
      bone.updateWorldMatrix(true, false);
      const w = bone.localToWorld(tail.clone());
      this.joints.push({ bone, tail, cur: w.clone(), prev: w.clone(), stiffness, drag, gravity, radius: 0.03, maxAngle });
    };
    for (const n of ["HairFront_C", "HairFront_L", "HairFront_R"]) hair(n, 2.4, 0.45, 0.05, 0.28);
    for (const s of ["_L", "_R"]) { hair(`HairSide1${s}`, 1.7, 0.4, 0.1, 0.45); hair(`HairSide2${s}`, 1.3, 0.38, 0.12, 0.55); }
    for (const s of ["_C", "_L", "_R"]) { hair(`HairBack1${s}`, 1.5, 0.42, 0.12, 0.35); hair(`HairBack2${s}`, 1.05, 0.38, 0.16, 0.45); }
    this.colliders = [
      { bone: this.b("Head"), offset: new THREE.Vector3(0, 0.2, 0.0), radius: 0.2 },
      { bone: this.b("Chest"), offset: new THREE.Vector3(0, 0.0, 0), radius: 0.115 },
      { bone: this.b("Hips"), offset: new THREE.Vector3(0, -0.03, 0), radius: 0.155 },
    ];
  }

  private b(name: string) {
    const b = this.bones.get(name);
    if (!b) throw new Error(`missing bone ${name}`);
    return b;
  }

  // ------------------------------------------------------------ 조작
  setLocomotion(mode: Locomotion) { this.locomotion = mode; }
  turnBy(rad: number) { this.targetYaw = this.rootYaw.x + rad; }
  jump() { if (!this.airborne && this.jumpT < 0) this.jumpT = 0; }
  get yaw() { return this.rootYaw.x; }
  get isAirborne() { return this.airborne || this.jumpT >= 0; }

  /**
   * 바깥(게임 엔진)이 위치·방향을 정할 때 매 프레임 update 전에 부른다.
   * dx/dz 는 이번 프레임에 움직인 거리(캐릭터 단위). 걸음 위상은 이 거리로 돌아 발이 미끄러지지 않고,
   * 방향은 머리→가슴→골반 스프링이 뒤따른다. 루트 뼈는 제자리에 두고 위치는 바깥 그룹이 옮긴다.
   */
  follow(dx: number, dz: number, yaw: number, moving: boolean) {
    this.external = true;
    const d = Math.hypot(dx, dz);
    if (Number.isFinite(d) && d < 1) { this.extDist += d; this.position.x += dx; this.position.z += dz; }
    if (Number.isFinite(yaw)) this.targetYaw = this.rootYaw.x + wrap(yaw - this.rootYaw.x);
    this.locomotion = moving ? "walk" : "idle";
  }

  /** 순간이동처럼 끊긴 뒤에는 방향 스프링을 바로 맞춘다 */
  snapYaw(yaw: number) {
    for (const s of [this.headYaw, this.chestYaw, this.rootYaw]) { s.x = yaw; s.v = 0; }
    this.targetYaw = yaw;
  }

  // ------------------------------------------------------------ 매 프레임
  update(rawDt: number) {
    const dt = clamp(rawDt, 0, 1 / 20) * this.settings.speed;
    if (dt <= 0) return;
    this.time += dt;
    const soft = this.settings.softness;
    const looseF = THREE.MathUtils.lerp(1.25, 0.72, soft); // 말랑할수록 스프링이 느슨
    const looseZ = THREE.MathUtils.lerp(0.82, 0.42, soft); // 말랑할수록 덜 감쇠(더 출렁)

    // --- 걷기 자동 조종: 반경 밖이면 안쪽으로 돌아선다
    if (this.locomotion === "walk" && !this.external) {
      const r = Math.hypot(this.position.x, this.position.z);
      const fwdX = Math.sin(this.targetYaw), fwdZ = Math.cos(this.targetYaw);
      if (r > this.wanderRadius && (this.position.x * fwdX + this.position.z * fwdZ) > 0) {
        const home = Math.atan2(-this.position.x, -this.position.z);
        this.targetYaw = this.rootYaw.x + wrap(home + (Math.random() - 0.5) * 1.1 - this.rootYaw.x);
      }
    }

    // --- 방향: 머리가 먼저, 가슴, 골반 순
    const t = this.targetYaw;
    const hy = this.headYaw.step(t, 2.4 * looseF, Math.max(0.5, looseZ + 0.08), dt);
    let cy = this.chestYaw.step(t, 1.55 * looseF, looseZ + 0.04, dt);
    let ry = this.rootYaw.step(t, 1.12 * looseF, looseZ, dt);
    // 몸이 너무 비틀리지 않게: 머리-가슴 ±0.65, 가슴-골반 ±0.4
    if (hy - cy > 0.65) { cy = this.chestYaw.x = hy - 0.65; } else if (hy - cy < -0.65) { cy = this.chestYaw.x = hy + 0.65; }
    if (cy - ry > 0.4) { ry = this.rootYaw.x = cy - 0.4; } else if (cy - ry < -0.4) { ry = this.rootYaw.x = cy + 0.4; }
    const yawErr = wrap(t - ry);

    // --- 이동
    const walking = this.locomotion === "walk";
    const wb = this.walk.step(walking ? 1 : 0, 1.6, 1.0, dt);
    const turningInPlace = !walking && Math.abs(yawErr) > 0.12 && !this.airborne ? 1 : 0;
    const sb = this.stepIdle.step(turningInPlace, 2.2, 1.0, dt);
    const align = Math.pow(Math.max(0, Math.cos(yawErr)), 2);
    let speed: number;
    if (this.external) { speed = this.extDist / dt; this.extDist = 0; }
    else {
      speed = this.settings.walkSpeed * clamp(wb, 0, 1) * (0.35 + 0.65 * align);
      this.position.addScaledVector(_v1.set(Math.sin(ry), 0, Math.cos(ry)), speed * dt);
    }
    const runT = clamp(this.run.step(smooth(0.45, 1.6, speed), 2.5, 1, dt), 0, 1);
    this.cycle = 0.24 + 0.26 * runT;
    this.duty = 0.56 - 0.2 * runT;
    // 걷기 위상은 실제 이동 거리로 진행 → 보폭과 속도가 늘 맞는다. 제자리 회전 때는 시간으로 진행.
    const prevPhase = this.phase;
    this.phase = (this.phase + (speed * dt) / this.cycle + sb * dt * 1.7 * (1 - clamp(wb, 0, 1))) % 1;
    const stepAmt = Math.max(clamp(wb, 0, 1), sb);
    // 착지 순간(위상 0, 0.5 통과)마다 살짝 눌림
    const crossed = (a: number) => (prevPhase < a && this.phase >= a) || (a === 0 && this.phase < prevPhase);
    if (!this.airborne && (crossed(0) || crossed(0.5))) this.squash.v -= (0.22 + 0.25 * soft) * stepAmt;

    // --- 점프
    const g = 5.2, jumpH = 0.2;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      this.crouchTarget = 0.032; this.squashTarget = -0.085 * (0.6 + 0.6 * soft);
      if (this.jumpT > 0.17) {
        this.jumpT = -1; this.airborne = true; this.vy = Math.sqrt(2 * g * jumpH);
        this.crouchTarget = 0; this.squash.v += 1.4 * (0.6 + 0.6 * soft);
      }
    } else if (!this.airborne) { this.crouchTarget = 0; this.squashTarget = 0; }
    if (this.airborne) {
      this.vy -= g * dt; this.y += this.vy * dt;
      const vy0 = Math.sqrt(2 * g * jumpH);
      this.squashTarget = 0.07 * (0.6 + 0.6 * soft) * clamp(this.vy / vy0, 0, 1) + 0.02 * clamp(-this.vy / vy0, 0, 1);
      if (this.y <= 0 && this.vy < 0) {
        this.y = 0; this.airborne = false; this.squashTarget = 0;
        this.squash.v -= (1.7 + 1.2 * soft) * clamp(-this.vy / vy0, 0.4, 1.2);
        this.crouch.v += 0.75 * clamp(-this.vy / vy0, 0.4, 1.2);
      }
    }
    const crouch = this.crouch.step(this.crouchTarget, 4.2 * looseF, 0.55, dt);
    const sq = clamp(this.squash.step(this.squashTarget, 3.6 * looseF, looseZ * 0.75, dt), -0.13, 0.11);

    // --- 가속도 (머리·팔·머리카락의 늦은 반응 입력)
    this.vel.set((this.position.x - this.lastPos.x) / dt, (this.y - this.lastY) / dt, (this.position.z - this.lastPos.z) / dt);
    this.accel.subVectors(this.vel, this.prevVel).divideScalar(dt);
    this.accel.clampLength(0, 30);
    this.prevVel.copy(this.vel); this.lastPos.copy(this.position); this.lastY = this.y;
    const aFwd = this.accel.x * Math.sin(ry) + this.accel.z * Math.cos(ry);
    const aSide = this.accel.x * Math.cos(ry) - this.accel.z * Math.sin(ry);
    // 회전 중의 원심력 → 기울기
    const turnRate = this.rootYaw.v;

    // --- 숨쉬기·잔흔들림
    const tm = this.time;
    const breath = Math.sin((tm * 2 * Math.PI) / 3.4);
    const sway = Math.sin((tm * 2 * Math.PI) / 5.1) * 0.6 + Math.sin((tm * 2 * Math.PI) / 2.3 + 1.3) * 0.4;
    const idleW = 1 - clamp(wb, 0, 1) * 0.6;

    // --- 걷기 리듬
    const ph = this.phase * 2 * Math.PI;
    // 뛸 때는 골반을 낮춰 짧은 다리가 긴 보폭에 닿게 한다
    const bob = (0.5 - 0.5 * Math.cos(2 * ph)) * (0.011 + 0.01 * runT) * stepAmt - (0.009 + 0.035 * runT) * stepAmt;

    // ================= 뼈에 적용
    const root = this.b("Root");
    if (this.external) root.position.set(0, this.y, 0);
    else root.position.set(this.position.x, this.y, this.position.z);
    root.quaternion.setFromAxisAngle(Y, ry);
    // 부피를 지키는 눌림/늘어남 (발바닥 기준)
    root.scale.set(1 / Math.sqrt(1 + sq), 1 + sq, 1 / Math.sqrt(1 + sq));

    const hips = this.b("Hips");
    hips.position.copy(this.rest.get("Hips")!).add(_v2.set(0, bob - crouch + breath * 0.0015 * idleW, 0));
    _e.set(
      0.03 * stepAmt + crouch * 0.8,
      0.07 * Math.sin(ph) * stepAmt + 0.02 * sway * idleW,
      0.035 * Math.sin(ph) * stepAmt + 0.012 * sway * idleW - turnRate * 0.02, "XYZ");
    hips.quaternion.setFromEuler(_e);

    // 몸통 비틀림: 가슴이 골반보다 앞서고, 걸을 때는 골반 반대로 돈다
    const twist = cy - ry;
    const spine = this.b("Spine"), chest = this.b("Chest");
    _e.set(-crouch * 0.6 + (0.02 + 0.13 * runT) * stepAmt, twist * 0.45 - 0.045 * Math.sin(ph) * stepAmt, -0.02 * Math.sin(ph) * stepAmt, "XYZ");
    spine.quaternion.setFromEuler(_e);
    _e.set(-crouch * 0.4 + breath * 0.012 * idleW, twist * 0.55 - 0.035 * Math.sin(ph) * stepAmt, -0.012 * sway * idleW, "XYZ");
    chest.quaternion.setFromEuler(_e);
    const bs = 1 + breath * 0.012 * idleW;
    chest.scale.set(1 + breath * 0.008 * idleW, bs, 1 + breath * 0.008 * idleW);

    // 머리 스프링: 몸의 가속도를 받아 한 박자 늦게 끄덕이고 기운다. 목 40% / 머리 60% 로 나눠 꺾인 관절처럼 보이지 않게.
    const hp = this.headPitch.step(0, 2.6 * looseF, looseZ, dt, this.accel.y * 0.55 * (0.6 + 0.8 * soft) + aFwd * 0.9);
    const hr = this.headRoll.step(0, 2.4 * looseF, looseZ, dt, -aSide * 0.9 - turnRate * 0.9);
    const headLook = hy - cy;
    const nod = Math.sin((tm * 2 * Math.PI) / 4.2) * 0.022 * idleW + Math.cos(2 * ph) * 0.018 * stepAmt;
    const tilt = Math.sin((tm * 2 * Math.PI) / 6.3 + 0.7) * 0.03 * idleW;
    const surpriseBack = -0.1 * this.surprise.x;
    const pitchAll = clamp(hp, -0.3, 0.3) + nod + surpriseBack + crouch * 0.6;
    const rollAll = clamp(hr, -0.25, 0.25) + tilt;
    _e.set(pitchAll * 0.4, headLook * 0.42, rollAll * 0.4, "YXZ");
    this.b("Neck").quaternion.setFromEuler(_e);
    _e.set(pitchAll * 0.6, headLook * 0.58, rollAll * 0.6, "YXZ");
    this.b("Head").quaternion.setFromEuler(_e);

    // 팔: 다리와 반대로 흔들고, 몸 가속도에 따라 늦게 펄럭인다
    const ap = this.armPitch.step(0, 2.2 * looseF, looseZ, dt, aFwd * 2.2);
    const as = this.armSpread.step(0, 2.0 * looseF, looseZ, dt, this.accel.y * 1.0 * (0.6 + 0.8 * soft));
    for (const [s, sgn] of [["_L", 1], ["_R", -1]] as const) {
      const swing = Math.cos(ph) * (0.42 + 0.22 * runT) * stepAmt * (s === "_L" ? 1 : -1);
      const idleArm = Math.sin((tm * 2 * Math.PI) / 3.4 + (s === "_L" ? 0 : 0.6)) * 0.03 * idleW;
      const spread = clamp(as, -0.35, 0.6) + 0.08 * stepAmt + idleArm + 0.15 * this.surprise.x;
      _e.set(clamp(swing - ap, -0.7, 0.7), 0, sgn * spread, "XYZ");
      this.b(`UpperArm${s}`).quaternion.setFromEuler(_e);
      _e.set(-0.12 * stepAmt - Math.max(0, swing) * 0.3, 0, sgn * 0.05 * stepAmt, "XYZ");
      this.b(`LowerArm${s}`).quaternion.setFromEuler(_e);
    }

    // 다리 IK: 발 궤적은 루트 공간에서 정한다. 디딤 구간은 이동 속도와 정확히 반대로 움직인다.
    root.updateMatrixWorld(true);
    // 위상이 이동 거리로 돌기 때문에, 움직이는 동안 디딤 구간 이동량이 duty·cycle 과 같아야 발이 미끄러지지 않는다.
    // 걷기 시작(바닷가는 첫 프레임부터 전속력)·멈춤 때만 짧게 섞인다.
    const strideMix = clamp(this.stride.step(speed > 0.02 ? 1 : 0, 6, 1, dt), 0, 1);
    const travel = this.cycle * this.duty * strideMix;
    const lift = (0.034 + 0.022 * runT) * stepAmt;
    for (const [s, off] of [["_L", 0], ["_R", 0.5]] as const) {
      let p = (this.phase + off) % 1;
      const duty = this.duty;
      let dz = 0, dy = 0, toe = 0;
      if (p < duty) { const u = p / duty; dz = travel / 2 - u * travel; }
      else { p = (p - duty) / (1 - duty); const e = smooth(0, 1, p); dz = -travel / 2 + e * travel; dy = lift * Math.sin(Math.PI * p); toe = -0.35 * Math.sin(Math.PI * p) * stepAmt; }
      if (this.airborne) { dy += 0.03; dz += 0.012; toe = 0.25; }
      this.solveLeg(s, dz, dy, toe);
    }

    // 표정
    this.updateFace(dt);

    // 머리카락 (나머지 뼈가 다 정해진 뒤)
    root.updateMatrixWorld(true);
    this.updateSprings(dt, soft);
  }

  /** 2관절 IK: 루트 공간에서 발목 목표를 정하고 무릎은 앞으로 굽힌다 */
  private solveLeg(s: "_L" | "_R", dz: number, dy: number, toe: number) {
    const hips = this.b("Hips"), upper = this.b(`UpperLeg${s}`), lower = this.b(`LowerLeg${s}`), foot = this.b(`Foot${s}`);
    // 루트 공간의 골반 자세
    const qH = _q1.copy(hips.quaternion);
    const hip = _v1.copy(upper.position).applyQuaternion(qH).add(hips.position);
    const restAnkle = _v2.copy(this.rest.get(`UpperLeg${s}`)!).add(this.rest.get(`LowerLeg${s}`)!).add(this.rest.get(`Foot${s}`)!).add(this.rest.get("Hips")!);
    const target = restAnkle.add(_v3.set(0, dy, dz));
    const d = _v4.subVectors(target, hip);
    const L1 = this.lenThigh, L2 = this.lenShin;
    const dist = clamp(d.length(), 0.02, (L1 + L2) * 0.999);
    d.normalize();
    const a1 = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    // 무릎은 골반 앞쪽으로
    const f = _v3.set(0, 0, 1).applyQuaternion(qH);
    f.addScaledVector(d, -f.dot(d)).normalize();
    const knee = new THREE.Vector3().copy(hip).addScaledVector(d, Math.cos(a1) * L1).addScaledVector(f, Math.sin(a1) * L1);
    const ankle = new THREE.Vector3().copy(hip).addScaledVector(d, dist);
    const restThigh = _v2.copy(lower.position).normalize();
    const qThigh = _q2.setFromUnitVectors(restThigh, knee.clone().sub(hip).normalize());
    const restShin = this.rest.get(`Foot${s}`)!.clone().normalize();
    const qShin = _q3.setFromUnitVectors(restShin, ankle.sub(knee).normalize());
    // 로컬로: upper = qH⁻¹·qThigh, lower = qThigh⁻¹·qShin, foot = qShin⁻¹·(발은 거의 수평)
    upper.quaternion.copy(qH).invert().multiply(qThigh);
    lower.quaternion.copy(qThigh).invert().multiply(qShin);
    const qFoot = new THREE.Quaternion().setFromAxisAngle(X, toe);
    foot.quaternion.copy(qShin).invert().multiply(qFoot);
  }

  private updateFace(dt: number) {
    const sm = this.smile.step(this.smileTarget, 3.2, 0.9, dt);
    const su = this.surprise.step(this.surpriseTarget, 4.5, 0.62, dt);
    // 깜빡임: 2~5.5초 간격, 18% 확률로 연속 두 번. 놀랐을 땐 참는다.
    let blink = 0;
    if (this.autoBlink && su < 0.4) {
      this.blinkClock -= dt;
      if (this.blinkClock <= 0 && this.blinkT < 0) {
        this.blinkT = 0;
        this.doubleBlink = Math.random() < 0.18;
        this.blinkClock = 2 + Math.random() * 3.5;
      }
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT, close = 0.065, hold = 0.035, open = 0.11;
      blink = t < close ? smooth(0, close, t) : t < close + hold ? 1 : 1 - smooth(close + hold, close + hold + open, t);
      if (t > close + hold + open) {
        if (this.doubleBlink) { this.doubleBlink = false; this.blinkT = -0.08; }
        else this.blinkT = -1;
      }
      if (this.blinkT < -0.5) this.blinkT = -1;
    }
    if (this.blinkT < 0 && this.blinkT > -0.5) { this.blinkT += dt; if (this.blinkT >= 0) this.blinkT = 0.0001; }
    // 시선: 가끔 아주 조금 옮긴다
    this.gazeClock -= dt;
    if (this.gazeClock <= 0) { this.gazeClock = 1.2 + Math.random() * 3; this.gazeTarget.set((Math.random() - 0.5) * 0.007, (Math.random() - 0.5) * 0.004); }
    this.gaze.lerp(this.gazeTarget, 1 - Math.exp(-dt * 18));

    this.face.blink = blink;
    this.face.surprise = clamp(su, 0, 1.1) * (1 - blink);
    this.face.smile = clamp(sm, 0, 1) * (1 - 0.7 * blink);
    this.face.sleepy = this.sleepy * (1 - blink) * (1 - clamp(su, 0, 1));
    this.face.gazeX = this.gaze.x; this.face.gazeY = this.gaze.y;
    const m = this.faceMesh;
    if (m?.morphTargetInfluences) {
      FACE_MORPHS.forEach((name, i) => { m.morphTargetInfluences![i] = this.face[name]; });
    }
  }

  private updateSprings(rawDt: number, soft: number) {
    const stepDt = 1 / 60;
    const n = Math.min(4, Math.max(1, Math.round(rawDt / stepDt)));
    const dt = rawDt / n;
    const stiffMul = THREE.MathUtils.lerp(1.5, 0.7, soft), dragMul = THREE.MathUtils.lerp(1.25, 0.8, soft);
    for (let it = 0; it < n; it++) {
      for (const j of this.joints) {
        const bone = j.bone, parent = bone.parent!;
        parent.updateWorldMatrix(false, false);
        bone.quaternion.identity();
        bone.updateMatrixWorld(false);
        const head = _v1.setFromMatrixPosition(bone.matrixWorld);
        parent.getWorldQuaternion(_q1);
        const scale = parent.matrixWorld.getMaxScaleOnAxis();
        const len = j.tail.length() * scale;
        const restDir = _v2.copy(j.tail).normalize().applyQuaternion(_q1);
        // 관성 + 복원 + 중력 (프레임 기준 VRM 공식을 60Hz 단위로)
        const k = dt * 60;
        const next = _v3.copy(j.cur)
          .addScaledVector(_v4.subVectors(j.cur, j.prev), Math.pow(1 - clamp(j.drag * dragMul, 0, 0.95), k))
          .addScaledVector(restDir, j.stiffness * stiffMul * dt * len * 6)
          .addScaledVector(Y, -j.gravity * dt * len * 6);
        // 길이 유지
        next.sub(head).normalize().multiplyScalar(len).add(head);
        // 머리·몸 충돌
        for (const c of this.colliders) {
          c.bone.updateWorldMatrix(false, false);
          const cc = _v4.copy(c.offset).applyMatrix4(c.bone.matrixWorld);
          const r = c.radius * c.bone.matrixWorld.getMaxScaleOnAxis() + j.radius;
          const dv = next.clone().sub(cc);
          const dl = dv.length();
          if (dl < r && dl > 1e-6) next.copy(cc).addScaledVector(dv, r / dl);
        }
        next.sub(head).normalize().multiplyScalar(len).add(head);
        // 각도 제한: 휴식 방향에서 너무 멀어지지 않게
        const dir = _v4.copy(next).sub(head).normalize();
        const ang = Math.acos(clamp(dir.dot(restDir), -1, 1));
        if (ang > j.maxAngle) {
          const axis = new THREE.Vector3().crossVectors(restDir, dir).normalize();
          dir.copy(restDir).applyAxisAngle(axis, j.maxAngle);
          next.copy(head).addScaledVector(dir, len);
        }
        j.prev.copy(j.cur);
        j.cur.copy(next);
        // 회전으로 되돌리기 (부모 공간)
        const local = dir.applyQuaternion(_q1.invert());
        bone.quaternion.setFromUnitVectors(_v2.copy(j.tail).normalize(), local);
        bone.updateMatrixWorld(true);
      }
    }
  }
}
