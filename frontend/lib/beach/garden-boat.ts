import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BOAT_DECK_Y, BOAT_ROUTE, BOAT_SPEED, BOAT_STOPS, BOAT_STOP_SECONDS, type BoatPose, type BoatStop, boatPoseAt, isWater, nearestBoatStop, nextBoatStop,
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

/** 선체: 양끝이 뾰족하게 들린 길이 4.6 m 의 나룻배. 가로 6단 × 세로 11단으로 떠서 만든다. */
function hullGeometry(): THREE.BufferGeometry {
  const L = 4.6, nAlong = 11, nAcross = 7;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= nAlong; i++) {
    const t = i / nAlong, along = (t - 0.5) * L;
    const width = 0.82 * Math.pow(Math.sin(Math.PI * t), 0.5) + 0.03;
    const endLift = 0.28 * Math.pow(1 - Math.sin(Math.PI * t), 1.6);
    for (let j = 0; j <= nAcross; j++) {
      const u = j / nAcross * 2 - 1;
      // 바닥은 둥근 V, 뱃전은 위로 벌어진다.
      const x = width * u * (1 + 0.15 * Math.abs(u));
      const y = -0.38 + 0.42 * u * u * u * u + endLift + (Math.abs(u) > 0.95 ? 0.52 : 0);
      positions.push(x, Math.min(y, 0.55), along);
      uvs.push(j / nAcross, t);
    }
  }
  for (let i = 0; i < nAlong; i++) for (let j = 0; j < nAcross; j++) {
    const a = i * (nAcross + 1) + j, b = a + 1, c = a + nAcross + 1, d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 선체 + 갑판 + 대나무 지붕 덮개 + 뱃머리 등 (한 지오메트리, 정점 색). 로컬 +z 가 뱃머리. */
export function boatGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const place = (geometry: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    geometry.applyMatrix4(m);
    parts.push(colored(geometry, hex));
  };
  const hull = hullGeometry();
  place(hull, 0x5a3f2c, 0, 0, 0);
  const inner = hullGeometry();
  inner.scale(0.9, 0.9, 0.97);
  place(inner, 0x8a6a48, 0, 0.05, 0, 1, 1, 1);
  place(new THREE.BoxGeometry(1.2, 0.06, 2.9), 0x9c7b55, 0, BOAT_DECK_Y - 0.03, 0.1);
  place(new THREE.BoxGeometry(1.0, 0.05, 0.35), 0x6d4f36, 0, BOAT_DECK_Y + 0.33, -1.1);
  for (const x of [-0.62, 0.62]) for (const z of [-0.9, 1.1]) place(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), 0xc9a862, x, BOAT_DECK_Y + 0.75, z);
  const canopy = new THREE.CylinderGeometry(0.95, 0.95, 2.6, 14, 1, true, 0, Math.PI);
  canopy.rotateZ(Math.PI / 2); canopy.rotateY(Math.PI / 2);
  place(canopy, 0xd9c08a, 0, BOAT_DECK_Y + 1.05, 0.1);
  for (const z of [-1.2, 1.4]) {
    const rib = new THREE.TorusGeometry(0.97, 0.03, 5, 16, Math.PI);
    place(rib, 0x8a6b3a, 0, BOAT_DECK_Y + 1.05, z, 1, 1, 1, 0, 0, 0);
  }
  place(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), 0x4a3524, 0, BOAT_DECK_Y + 1.2, 2.25, 1, 1, 1, 0.35);
  place(new THREE.SphereGeometry(0.11, 8, 6), 0xfff1d6, 0, BOAT_DECK_Y + 0.95, 2.36);
  const merged = mergeGeometries(parts.map((part) => part.index ? part.toNonIndexed() : part), false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * 나룻배. 내 배는 잔교 앞에 매여 있다가 타면 정해진 경로를 돌고, 정류장마다 10초 멈춘다.
 * 다른 사람은 물 위에 있으면 그 사람 밑에 배를 그린다 (서버 상태 없음). 배는 한 인스턴스 메시로 그린다.
 */
export class GardenBoats {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshToonMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private riding = false;
  private docked = false;
  private s = BOAT_ROUTE.stopAt[0];
  private departAt = 0;
  private alightArmed = false;
  private stopIndex: number | null = 0;
  private nearStop: BoatStop | null = null;
  private lastKey = "";
  private readonly headings = new Map<string, { x: number; z: number; yaw: number }>();
  private readonly transform = new THREE.Object3D();
  private wakeAt = -Infinity;
  private disposed = false;
  /** 내 배가 마지막으로 선 위치 (안 탈 땐 가까운 잔교, 타면 경로 위) */
  private ownPose: BoatPose = boatPoseAt(BOAT_ROUTE.stopAt[0]);

  constructor(parent: THREE.Object3D, gradient: THREE.DataTexture) {
    this.geometry = boatGeometry();
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
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
      this.riding = false; this.alightArmed = false;
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
          if (this.alightArmed) { this.riding = false; this.alightArmed = false; alighted = BOAT_STOPS[next]; }
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
    const bob = Math.sin(time * 1.1) * 0.02;
    this.transform.position.set(this.ownPose.x, bob + (this.riding && !this.docked ? 0.01 : 0), this.ownPose.z);
    this.transform.rotation.set(Math.sin(time * 0.9) * 0.01, this.ownPose.yaw, Math.sin(time * 1.3) * 0.015);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(count++, this.transform.matrix);
    const seen = new Set<string>();
    for (const rider of riders) {
      if (count >= MAX_BOATS) break;
      if (!isWater(rider.x, rider.z)) continue;
      seen.add(rider.pid);
      let heading = this.headings.get(rider.pid);
      if (!heading) { heading = { x: rider.x, z: rider.z, yaw: 0 }; this.headings.set(rider.pid, heading); }
      const moved = Math.hypot(rider.x - heading.x, rider.z - heading.z);
      if (moved > 0.08) { heading.yaw = Math.atan2(-(rider.x - heading.x), -(rider.z - heading.z)); heading.x = rider.x; heading.z = rider.z; }
      this.transform.position.set(rider.x, Math.sin(time * 1.1 + count) * 0.02, rider.z);
      this.transform.rotation.set(0, heading.yaw, Math.sin(time * 1.3 + count) * 0.015);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(count++, this.transform.matrix);
    }
    for (const pid of this.headings.keys()) if (!seen.has(pid)) this.headings.delete(pid);
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
