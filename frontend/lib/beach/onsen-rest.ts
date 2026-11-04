import * as THREE from "three";

// Keep these authoritative slots aligned with BeachRoom's onsen rest claims.
export const ONSEN_REST_REACH = 2.2;
export const ONSEN_SEAT_Y = 17.12;
export const ONSEN_FLOAT_Y = 17.76;
export const ONSEN_FLOAT_BOB = 0.025;
const CENTER_Z = 45, FLOOR_Y = 16.85, SEAT_RADIUS = 3.55;
const LEDGE_INNER = 3.2, LEDGE_OUTER = 3.9;
const LEDGE_START = 8 * Math.PI / 180, LEDGE_END = 172 * Math.PI / 180;

export interface OnsenRestSlot {
  id: string;
  spotId: "onsen-benches" | "onsen-float";
  slot: number;
  x: number;
  z: number;
  yaw: number;
  avatarY: number;
  incline: number;
}

export const ONSEN_SEATS: readonly OnsenRestSlot[] = Array.from({ length: 6 }, (_, slot) => {
  const angle = (15 + slot * 30) * Math.PI / 180;
  return {
    id: `onsen-bench-${slot}`, spotId: "onsen-benches", slot,
    x: Math.cos(angle) * SEAT_RADIUS, z: CENTER_Z + Math.sin(angle) * SEAT_RADIUS,
    yaw: 0, avatarY: ONSEN_SEAT_Y, incline: 0,
  };
});

/** Feet point toward the pool centre; the head points toward the open sea. */
export const ONSEN_FLOATS: readonly OnsenRestSlot[] = [-2.4, 0, 2.4].map((x, slot) => ({
  id: `onsen-float-${slot}`, spotId: "onsen-float", slot,
  x, z: 43.3, yaw: 0, avatarY: ONSEN_FLOAT_Y, incline: 0,
}));

type RestClaim = { pose?: string; spotId?: string | null; slot?: number | null };
function validSlot(state: RestClaim, pose: string, id: OnsenRestSlot["spotId"], slots: readonly OnsenRestSlot[]) {
  return state.pose === pose && state.spotId === id && typeof state.slot === "number"
    && Number.isInteger(state.slot) && state.slot >= 0 && state.slot < slots.length ? slots[state.slot] : null;
}

export function claimedOnsenSeat(state: RestClaim): OnsenRestSlot | null {
  return validSlot(state, "sitting", "onsen-benches", ONSEN_SEATS);
}

export function claimedOnsenFloat(state: RestClaim): OnsenRestSlot | null {
  return validSlot(state, "lying", "onsen-float", ONSEN_FLOATS);
}

/** The shallow stone step stays walkable; the side entrance and the pool centre remain clear. */
export function onsenLedgeHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const radius = Math.hypot(x, z - CENTER_Z), angle = Math.atan2(z - CENTER_Z, x);
  return radius >= LEDGE_INNER && radius <= LEDGE_OUTER && angle >= LEDGE_START && angle <= LEDGE_END
    ? ONSEN_SEAT_Y : null;
}

/** One slow breath of buoyancy, with stable individual phases and no cumulative drift. */
export function onsenFloatingY(time: number, slot: number): number {
  const seconds = Number.isFinite(time) ? time : 0;
  const phase = Number.isInteger(slot) && slot >= 0 && slot < ONSEN_FLOATS.length ? slot * 0.9 : 0;
  return ONSEN_FLOAT_Y + Math.sin(seconds * 0.8 + phase) * ONSEN_FLOAT_BOB;
}

/** A closed wedge with a genuinely level top. Six instances join into a low half-ring. */
function ledgeSegment(inner: number, outer: number, bottom: number, top: number) {
  const span = (LEDGE_END - LEDGE_START) / 6, segments = 8;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const point = (radius: number, angle: number, y: number): [number, number, number] => [
    Math.cos(angle) * radius, y, Math.sin(angle) * radius,
  ];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const offset = positions.length / 3;
    for (const p of [a, b, c, d]) { positions.push(...p); uvs.push(p[0] / 1.5, (p[2] + p[1]) / 1.5); }
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  };
  for (let i = 0; i < segments; i++) {
    const a = i / segments * span, b = (i + 1) / segments * span;
    quad(point(inner, a, top), point(inner, b, top), point(outer, b, top), point(outer, a, top));
    quad(point(inner, a, bottom), point(outer, a, bottom), point(outer, b, bottom), point(inner, b, bottom));
    quad(point(outer, a, bottom), point(outer, a, top), point(outer, b, top), point(outer, b, bottom));
    quad(point(inner, a, bottom), point(inner, b, bottom), point(inner, b, top), point(inner, a, top));
  }
  quad(point(inner, 0, bottom), point(inner, 0, top), point(outer, 0, top), point(outer, 0, bottom));
  quad(point(inner, span, bottom), point(outer, span, bottom), point(outer, span, top), point(inner, span, top));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Shared rock maps and two draw batches; no lights, images or per-seat objects. */
export function buildOnsenRest(scene: THREE.Scene, sourceStone?: THREE.MeshStandardMaterial) {
  const group = new THREE.Group(); group.name = "onsen-rest-ledge";
  const stone = sourceStone?.clone() ?? new THREE.MeshStandardMaterial({ color: 0x8a877c, roughness: 0.9 });
  if (sourceStone) {
    stone.onBeforeCompile = sourceStone.onBeforeCompile;
    stone.customProgramCacheKey = sourceStone.customProgramCacheKey;
  }
  stone.roughness = 0.88;
  const base = new THREE.InstancedMesh(ledgeSegment(3.23, 3.87, FLOOR_Y + 0.005, 17.015), stone, 6);
  const top = new THREE.InstancedMesh(ledgeSegment(LEDGE_INNER, LEDGE_OUTER, 16.99, ONSEN_SEAT_Y), stone, 6);
  base.name = "onsen-ledge-foundation"; top.name = "onsen-ledge-flat-seats";
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (const mesh of [base, top]) {
    for (let slot = 0; slot < 6; slot++) {
      transform.position.set(0, 0, CENTER_Z);
      transform.rotation.set(0, -(LEDGE_START + slot * (LEDGE_END - LEDGE_START) / 6), 0);
      transform.updateMatrix(); mesh.setMatrixAt(slot, transform.matrix);
      mesh.setColorAt(slot, tint.setScalar(0.94 + slot % 3 * 0.025));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
  }
  scene.add(group);
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of [base, top]) { mesh.geometry.dispose(); mesh.dispose(); }
    stone.dispose(); group.removeFromParent();
    // Texture maps are shared with the cove and disposed by their owner.
  } };
}
