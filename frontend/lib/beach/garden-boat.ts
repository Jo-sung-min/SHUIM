import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BOAT_DECK_Y, BOAT_SEAT_Y, BOAT_ROUTE, BOAT_SPEED, BOAT_STOPS, BOAT_STOP_SECONDS, type BoatPose, type BoatStop, boatBobAt, boatHeadingAt, boatPoseAt, isWater, nearestBoatStop, nextBoatStop,
} from "./garden-layout";

export interface BoatRideState {
  /** 잔교 끝에 서 있어 탈 수 있는 정류장 */
  near: BoatStop | null;
  riding: boolean;
  /** 정류장에 멈춰 있는 중 (바로 내릴 수 있다) */
  docked: boolean;
  stop: BoatStop | null;
  nextStop: BoatStop | null;
  alightArmed: boolean;
}
export interface RemoteRider { pid: string; x: number; z: number }

const MAX_BOATS = 16;

function colored(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const color = new THREE.Color(hex), count = geometry.getAttribute("position").count, values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(values, i * 3);
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

/** A narrow keel opens into a rounded, rising bow. The bow is local -z, like engine yaw. */
function hullPoint(t: number, u: number, inner = false): THREE.Vector3 {
  const belly = Math.sin(Math.PI * t), edge = Math.abs(u);
  const width = 0.975 * Math.pow(Math.max(0, belly), 0.70);
  const sheer = 0.25 * Math.pow(1 - belly, 2);
  return new THREE.Vector3(width * u * (inner ? 0.955 : 1),
    -0.32 + 0.97 * Math.pow(edge, 2.25) + sheer + (inner ? 0.045 : 0), (t - 0.5) * 4.85);
}

/** Curved timber strakes carry real thickness and separate grain rather than a faceted bowl. */
function hullPlank(side: number, band: number, inner: boolean): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const along = 36, across = 2;
  for (let i = 0; i <= along; i++) for (let j = 0; j <= across; j++) {
    const t = i / along, u = side * (band + j / across) / 7;
    const p = hullPoint(t, u, inner);
    positions.push(p.x, p.y, p.z); uv.push(t * 5, u);
  }
  for (let i = 0; i < along; i++) for (let j = 0; j < across; j++) {
    const a = i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
    // Each face is lit from its own side; the open hull remains opaque from outside.
    if ((side > 0) !== inner) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Open wooden ferry: clinker planking, bent ribs, thwarts, oars, rope and a brass bow lantern. */
export function boatGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const place = (geometry: THREE.BufferGeometry, hex: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    parts.push(colored(geometry, hex));
  };
  const tube = (points: THREE.Vector3[], radius: number, hex: number, steps = 30, sides = 5) =>
    place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), steps, radius, sides, false), hex);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, hex: number, endRadius = radius) => {
    const axis = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(endRadius, radius, axis.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
    const c = a.clone().add(b).multiplyScalar(0.5); place(g, hex, c.x, c.y, c.z);
  };
  const outer = [0x624530, 0x765039, 0x855b3c, 0x976c46, 0xa4784d, 0x987047, 0xb08455];
  const inner = [0x9e774f, 0xaf8758, 0xb68e60, 0xc09a6c, 0xb48b59, 0xc5a174, 0xc2a175];
  for (const side of [-1, 1]) {
    for (let band = 0; band < 7; band++) {
      place(hullPlank(side, band, false), outer[band]);
      place(hullPlank(side, band, true), inner[band]);
      if (band > 1) {
        // The fine dark lap between overlapping boards is readable in grazing light.
        const seam = Array.from({ length: 19 }, (_, i) => hullPoint(i / 18, side * band / 7));
        tube(seam, 0.008, 0x6b4b33, 24, 3);
      }
    }
    const rail = Array.from({ length: 25 }, (_, i) => hullPoint(i / 24, side).add(new THREE.Vector3(0, 0.025, 0)));
    tube(rail, 0.055, 0x62412b, 40, 8);
    tube(rail.map(p => p.clone().add(new THREE.Vector3(-side * .015, .025, 0))), .018, 0xd4ad74, 36, 5);
  }
  // Curved steam-bent frames remain visible inside the hull between the three benches.
  for (const t of [.13, .25, .38, .50, .62, .75, .87]) {
    const points = Array.from({ length: 17 }, (_, i) => hullPoint(t, i / 8 - 1, true).add(new THREE.Vector3(0, .022, 0)));
    tube(points, .028, 0x785437, 18, 5);
  }
  // Separate floorboards leave narrow seams and make the shallow bilge legible.
  for (let i = -2; i <= 2; i++) {
    const length = 3.10 - Math.abs(i) * .20;
    place(new THREE.BoxGeometry(.18, .055, length), i % 2 ? 0xb38a58 : 0xc29a67, i * .192, .075, .04);
    for (const z of [-1.05, .95]) place(new THREE.CylinderGeometry(.013, .013, .004, 6), 0x655445, i * .192, .105, z);
  }
  for (const z of [-1.24, 0, 1.25]) {
    const width = z === 0 ? 1.78 : 1.44;
    // Middle seat top is the one shared with every local and remote rider.
    const top = z === 0 ? BOAT_SEAT_Y - .055 : .56;
    for (const dz of [-.105, .105]) place(new THREE.BoxGeometry(width, .065, .198), 0xb78a53, 0, top - .0325, z + dz);
    for (const side of [-1, 1]) {
      place(new THREE.BoxGeometry(.075, .28, .34), 0x785235, side * (width / 2 - .12), top - .17, z);
      for (const dz of [-.11, .11]) place(new THREE.CylinderGeometry(.017, .017, .006, 8), 0x70604b, side * (width / 2 - .09), top + .003, z + dz);
    }
  }
  // A low sage cushion softens the centre seat without hiding the sitter's legs.
  const cushion = new THREE.CapsuleGeometry(.19, .50, 4, 10);
  cushion.rotateZ(Math.PI / 2); cushion.scale(1, .14, 1);
  place(cushion, 0x6b9380, 0, BOAT_SEAT_Y - .027, .015);
  for (const x of [-.22, .22]) place(new THREE.SphereGeometry(.018, 6, 4), 0x96b09a, x, BOAT_SEAT_Y - .005, .015);
  // Two resting oars sit in brass rowlocks along the sides, keeping the boarding width compact.
  for (const side of [-1, 1]) {
    const grip = new THREE.Vector3(side * .73, .79, -.70), blade = new THREE.Vector3(side * 1.18, .43, 1.76);
    beam(grip, blade, .027, 0xbd9058, .021);
    beam(grip, grip.clone().lerp(blade, .13), .036, 0x68472e);
    const paddle = new THREE.CapsuleGeometry(.12, .48, 3, 8);
    paddle.rotateX(Math.PI / 2); paddle.scale(1, .20, 1);
    place(paddle, 0xab7b45, blade.x, blade.y, blade.z, -.145, side * .18);
    place(new THREE.TorusGeometry(.065, .013, 5, 10, Math.PI * 1.45), 0xb49459, side * .94, .73, .32, 0, Math.PI / 2, .2);
    place(new THREE.CylinderGeometry(.022, .025, .15, 7), 0x8c743e, side * .94, .64, .32);
  }
  // Bow and stern breasthooks cap the joined planks; a little coil ties the ferry to its pier.
  for (const z of [-2.12, 2.12]) {
    const cap = new THREE.CylinderGeometry(.26, .26, .055, 3); cap.scale(1, 1, 1.45);
    place(cap, 0x9b7045, 0, .73, z, 0, z < 0 ? 0 : Math.PI);
    place(new THREE.CylinderGeometry(.035, .045, .17, 8), 0x65442d, 0, .84, z);
  }
  const rope = Array.from({ length: 73 }, (_, i) => {
    const angle = i / 72 * Math.PI * 6, r = .075 + i / 72 * .12;
    return new THREE.Vector3(Math.cos(angle) * r, .578 + i / 72 * .008, 1.24 + Math.sin(angle) * r);
  });
  tube(rope, .014, 0xc5b58c, 72, 4);
  // Warm opaque glass and a fine dark cage read in daylight and stay subtle at night.
  tube([new THREE.Vector3(0, .84, -2.30), new THREE.Vector3(0, 1.21, -2.30),
    new THREE.Vector3(0, 1.24, -2.17), new THREE.Vector3(0, 1.15, -2.11)], .014, 0x675032, 12, 5);
  place(new THREE.TorusGeometry(.065, .01, 5, 10), 0x9c7a40, 0, 1.12, -2.11);
  place(new THREE.CylinderGeometry(.105, .13, .055, 8), 0x7c5f35, 0, .99, -2.11);
  place(new THREE.CylinderGeometry(.095, .095, .20, 8), 0xffdc98, 0, .865, -2.11);
  place(new THREE.CylinderGeometry(.12, .11, .045, 8), 0x7c5f35, 0, .74, -2.11);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    place(new THREE.CylinderGeometry(.009, .009, .23, 5), 0x735735, Math.cos(a) * .095, .865, -2.11 + Math.sin(a) * .095);
  }
  // Merge once for the whole fleet, and release both original and converted temporary geometries.
  const flat = parts.map(part => part.index ? part.toNonIndexed() : part);
  const merged = mergeGeometries(flat, false)!;
  for (let i = 0; i < parts.length; i++) { if (flat[i] !== parts[i]) flat[i].dispose(); parts[i].dispose(); }
  merged.translate(0, -BOAT_SEAT_Y, 0);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * 나룻배. 내 배는 잔교 앞에 매여 있다가 타면 정해진 경로를 돌고, 정류장마다 10초 멈춘다.
 * 다른 사람은 물 위에 있으면 그 사람 밑에 배를 그린다 (서버 상태 없음). 배는 한 인스턴스 메시로 그린다.
 */
export class GardenBoats {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private riding = false;
  private docked = false;
  private s = BOAT_ROUTE.stopAt[0];
  private departAt = 0;
  private alightArmed = false;
  private stopIndex: number | null = 0;
  private nearStop: BoatStop | null = null;
  private lastKey = "";
  private readonly transform = new THREE.Object3D();
  private wakeAt = -Infinity;
  private disposed = false;
  /** 내 배가 마지막으로 선 위치 (안 탈 땐 가까운 잔교, 타면 경로 위) */
  private ownPose: BoatPose = boatPoseAt(BOAT_ROUTE.stopAt[0]);

  constructor(parent: THREE.Object3D, _gradient: THREE.DataTexture) {
    this.geometry = boatGeometry();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .025 });
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBoatTimber;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBoatTimber = position;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vBoatTimber;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float timber = smoothstep(1.18, 1.6, diffuseColor.r / max(.02, diffuseColor.g));
          float grain = sin(vBoatTimber.y * 93.0 + vBoatTimber.x * 76.0 + sin(vBoatTimber.z * 2.9) * 1.7);
          float fineGrain = sin(vBoatTimber.y * 161.0 + vBoatTimber.x * 139.0 + sin(vBoatTimber.z * 4.3));
          diffuseColor.rgb *= 1.0 + timber * (grain * .035 + fineGrain * .018);
        `);
    };
    this.material.customProgramCacheKey = () => "garden-timber-boat-v1";
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_BOATS);
    this.mesh.name = "garden-boats";
    this.mesh.count = 1;
    this.mesh.layers.enable(2);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  get isRiding() { return this.riding; }
  get isDocked() { return this.docked; }
  get pose(): BoatPose { return this.ownPose; }

  state(): BoatRideState {
    const stop = this.stopIndex === null ? null : BOAT_STOPS[this.stopIndex];
    // Docked: the boat sits exactly on a stop, so look past it; under way the position already lies beyond the last stop.
    const nextIndex = this.riding ? nextBoatStop(this.s, this.docked ? 0.01 : 0) : null;
    return { near: this.nearStop, riding: this.riding, docked: this.docked, stop: this.docked ? stop : null,
      nextStop: nextIndex === null ? null : BOAT_STOPS[nextIndex], alightArmed: this.alightArmed };
  }
  /** 상태가 바뀌었을 때만 true (핸들러 호출용) */
  changed(): boolean {
    const st = this.state();
    const key = `${st.near?.id ?? ""}:${st.riding}:${st.docked}:${st.stop?.id ?? ""}:${st.nextStop?.id ?? ""}:${st.alightArmed}`;
    if (key === this.lastKey) return false;
    this.lastKey = key;
    return true;
  }

  /** 잔교 끝에서 타기. 탄 자리의 정류장에서 3초 뒤 출발한다. */
  board(time: number): BoatStop | null {
    if (this.riding || !this.nearStop) return null;
    const index = BOAT_STOPS.indexOf(this.nearStop);
    this.riding = true; this.docked = true; this.stopIndex = index; this.s = BOAT_ROUTE.stopAt[index];
    this.departAt = time + 3; this.alightArmed = false;
    this.ownPose = boatPoseAt(this.s);
    return this.nearStop;
  }
  /** 정류장에 서 있으면 바로 내리고, 떠가는 중이면 다음 정류장에서 내리기로 한다. 내렸으면 그 정류장을 돌려준다. */
  alight(): BoatStop | "armed" | null {
    if (!this.riding) return null;
    if (this.docked && this.stopIndex !== null) {
      const stop = BOAT_STOPS[this.stopIndex];
      this.riding = false; this.docked = false; this.alightArmed = false;
      return stop;
    }
    this.alightArmed = !this.alightArmed;
    return "armed";
  }
  cancelRide() { this.riding = false; this.docked = false; this.alightArmed = false; }

  /** 매 프레임: 내 배를 움직이고(타고 있으면) 가까운 잔교를 갱신한다. 내렸으면 정류장을 돌려준다. */
  update(time: number, dt: number, walker: { x: number; z: number }, riders: readonly RemoteRider[]): BoatStop | null {
    if (this.disposed) return null;
    let alighted: BoatStop | null = null;
    if (this.riding) {
      if (this.docked) {
        // Leave the stop a hair behind so the next frame's search finds the following one, never this one again.
        if (time >= this.departAt) { this.docked = false; this.stopIndex = null; this.s = (this.s + 0.3) % BOAT_ROUTE.total; }
      } else {
        const before = this.s;
        this.s = (this.s + BOAT_SPEED * dt) % BOAT_ROUTE.total;
        const next = nextBoatStop(before, 0), at = BOAT_ROUTE.stopAt[next];
        const ahead = ((at - before) % BOAT_ROUTE.total + BOAT_ROUTE.total) % BOAT_ROUTE.total;
        if (ahead <= BOAT_SPEED * dt + 1e-6) {
          this.s = at; this.docked = true; this.stopIndex = next; this.departAt = time + BOAT_STOP_SECONDS;
          if (this.alightArmed) { this.riding = false; this.docked = false; this.alightArmed = false; alighted = BOAT_STOPS[next]; }
        }
        if (time - this.wakeAt > 0.9) this.wakeAt = time;
      }
      this.ownPose = boatPoseAt(this.s);
      this.nearStop = null;
    } else {
      this.nearStop = nearestBoatStop(walker.x, walker.z);
      if (this.nearStop) {
        const index = BOAT_STOPS.indexOf(this.nearStop);
        this.ownPose = boatPoseAt(BOAT_ROUTE.stopAt[index]);
        this.stopIndex = index;
      } else if (this.stopIndex === null) {
        this.stopIndex = 0; this.ownPose = boatPoseAt(BOAT_ROUTE.stopAt[0]);
      }
    }
    // 인스턴스: 0 은 내 배, 나머지는 물 위의 다른 사람들
    let count = 0;
    const bob = boatBobAt(time);
    this.transform.position.set(this.ownPose.x, BOAT_SEAT_Y + bob, this.ownPose.z);
    this.transform.rotation.set(Math.sin(time * 0.9) * 0.01, this.ownPose.yaw, Math.sin(time * 1.3) * 0.015);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(count++, this.transform.matrix);
    for (const rider of riders) {
      if (count >= MAX_BOATS) break;
      if (!isWater(rider.x, rider.z)) continue;
      this.transform.position.set(rider.x, BOAT_SEAT_Y + bob, rider.z);
      this.transform.rotation.set(Math.sin(time * .9) * .01, boatHeadingAt(rider.x, rider.z), Math.sin(time * 1.3) * .015);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return alighted;
  }

  /** 뱃길 파문을 낼 위치 (움직이는 동안 0.9초마다) */
  wake(time: number): { x: number; z: number } | null {
    if (!this.riding || this.docked || time !== this.wakeAt) return null;
    return { x: this.ownPose.x - Math.sin(this.ownPose.yaw) * -1.6, z: this.ownPose.z - Math.cos(this.ownPose.yaw) * -1.6 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

export { BOAT_DECK_Y };
