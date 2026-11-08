import * as THREE from "three";

// Keep these authoritative slots aligned with BeachRoom's onsen rest claims.
export const ONSEN_REST_REACH = 2.2;
/** Every bath owns one run of slots, in this order. BeachRoom numbers its slots the same way. */
export const ONSEN_BATHS = [
  { x: 0, z: 45, lift: 0 }, // At the front, opening onto the sea.
  { x: -7.6, z: 55, lift: 4 }, { x: 7.6, z: 55, lift: 4 }, // One travertine step up, close enough to pour into it.
] as const;
export const ONSEN_SEATS_PER_BATH = 9, ONSEN_FLOATS_PER_BATH = 3;
// Measured on the rigged avatar: the head starts 0.93 above the feet when standing and 0.63 above the seat when sitting,
// so both leave the water just under the chin.
export const ONSEN_SEAT_Y = 16.9;
export const ONSEN_FLOAT_Y = 17.41;
export const ONSEN_FLOAT_BOB = 0.025;
const FLOOR_Y = 16.6, SEAT_RADIUS = 3.55;
// A bench around three sides of the bowl, open toward the sea, so it reads as a C from above.
const LEDGE_INNER = 3.2, LEDGE_OUTER = 3.84;
const LEDGE_START = -45 * Math.PI / 180, LEDGE_END = 225 * Math.PI / 180, LEDGE_SPAN = LEDGE_END - LEDGE_START;

export interface OnsenRestSlot {
  id: string;
  spotId: "onsen-benches" | "onsen-float";
  slot: number;
  x: number;
  z: number;
  yaw: number;
  avatarY: number;
  incline: number;
  /** Stone floor under this place; the bath it belongs to may be raised. */
  baseY: number;
  /** Middle of the bath this place belongs to. */
  centerX: number;
  centerZ: number;
}

export const ONSEN_SEATS: readonly OnsenRestSlot[] = ONSEN_BATHS.flatMap((place, bath) => Array.from({ length: ONSEN_SEATS_PER_BATH }, (_, seat) => {
  const angle = (-30 + seat * 30) * Math.PI / 180, slot = bath * ONSEN_SEATS_PER_BATH + seat;
  return {
    id: `onsen-bench-${slot}`, spotId: "onsen-benches" as const, slot,
    x: place.x + Math.cos(angle) * SEAT_RADIUS, z: place.z + Math.sin(angle) * SEAT_RADIUS,
    yaw: Math.atan2(Math.cos(angle), Math.sin(angle)), avatarY: ONSEN_SEAT_Y + place.lift, incline: 0, baseY: FLOOR_Y + place.lift, centerX: place.x, centerZ: place.z, // Every seat faces the middle of the bath.
  };
}));

/** Feet point toward the pool centre; the head points toward the open sea. */
export const ONSEN_FLOATS: readonly OnsenRestSlot[] = ONSEN_BATHS.flatMap((place, bath) => [-2.4, 0, 2.4].map((x, spot) => {
  const slot = bath * ONSEN_FLOATS_PER_BATH + spot;
  return {
    id: `onsen-float-${slot}`, spotId: "onsen-float" as const, slot,
    x: place.x + x, z: place.z - 1.7, yaw: 0, avatarY: ONSEN_FLOAT_Y + place.lift, incline: 0, baseY: FLOOR_Y + place.lift, centerX: place.x, centerZ: place.z,
  };
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

/** The bench stays walkable; the side open to the sea and the pool centre remain clear. */
export function onsenLedgeHeight(x: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  for (const place of ONSEN_BATHS) {
    const radius = Math.hypot(x - place.x, z - place.z), around = (Math.atan2(z - place.z, x - place.x) - LEDGE_START + Math.PI * 4) % (Math.PI * 2);
    if (radius >= LEDGE_INNER && radius <= LEDGE_OUTER && around <= LEDGE_SPAN) return ONSEN_SEAT_Y + place.lift;
  }
  return null;
}

/** One slow breath of buoyancy, with stable individual phases and no cumulative drift. */
export function onsenFloatingY(time: number, slot: number): number {
  const seconds = Number.isFinite(time) ? time : 0;
  const valid = Number.isInteger(slot) && slot >= 0 && slot < ONSEN_FLOATS.length;
  return (valid ? ONSEN_FLOATS[slot].avatarY : ONSEN_FLOAT_Y) + Math.sin(seconds * 0.8 + (valid ? slot * 0.9 : 0)) * ONSEN_FLOAT_BOB;
}

/** A closed wedge with a genuinely level top. One per seat, joined into the C of the bench. */
function ledgeSegment(inner: number, outer: number, bottom: number, top: number) {
  const span = LEDGE_SPAN / ONSEN_SEATS_PER_BATH, segments = 8;
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
  const count = ONSEN_BATHS.length * ONSEN_SEATS_PER_BATH;
  const base = new THREE.InstancedMesh(ledgeSegment(3.23, 3.81, FLOOR_Y + 0.005, ONSEN_SEAT_Y - 0.105), stone, count);
  const top = new THREE.InstancedMesh(ledgeSegment(LEDGE_INNER, LEDGE_OUTER, ONSEN_SEAT_Y - 0.13, ONSEN_SEAT_Y), stone, count);
  base.name = "onsen-ledge-foundation"; top.name = "onsen-ledge-flat-seats";
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (const mesh of [base, top]) {
    for (let slot = 0; slot < count; slot++) {
      const seat = slot % ONSEN_SEATS_PER_BATH;
      const place = ONSEN_BATHS[Math.floor(slot / ONSEN_SEATS_PER_BATH)];
      transform.position.set(place.x, place.lift, place.z);
      transform.rotation.set(0, -(LEDGE_START + seat * LEDGE_SPAN / ONSEN_SEATS_PER_BATH), 0);
      transform.updateMatrix(); mesh.setMatrixAt(slot, transform.matrix);
      mesh.setColorAt(slot, tint.setScalar(0.94 + seat % 3 * 0.025));
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
