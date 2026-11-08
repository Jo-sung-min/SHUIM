import * as THREE from "three";

export const STARGAZING = {
  id: "starlight", x: 7, z: 7, capacity: 8,
  feetRadius: 2.65, approachRadius: 3.8, nearRadius: 4.6,
  avatarY: 0.125,
} as const;

export interface StargazingSlot { slot: number; spotId: string; x: number; z: number; yaw: number; avatarY?: number; incline?: number; roll?: number }
export interface StargazingState { near: boolean; lying: boolean; occupied: number; capacity: number }

export function stargazingSlot(slot: number): StargazingSlot | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= STARGAZING.capacity) return null;
  const yaw = slot * Math.PI * 2 / STARGAZING.capacity;
  return { slot, spotId: STARGAZING.id, x: STARGAZING.x + Math.sin(yaw) * STARGAZING.feetRadius,
    z: STARGAZING.z + Math.cos(yaw) * STARGAZING.feetRadius, yaw };
}

export function claimedStargazingSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }): StargazingSlot | null {
  return state.pose === "lying" && state.spotId === STARGAZING.id && typeof state.slot === "number" ? stargazingSlot(state.slot) : null;
}

/** Geometry is authored with a feet pivot: local +Y points toward the head. */
export function stargazingBodyPoint(slot: StargazingSlot, distance: number) {
  return { x: slot.x - Math.sin(slot.yaw) * distance, z: slot.z - Math.cos(slot.yaw) * distance };
}

export function applyLyingTransform(object: THREE.Object3D, slot: StargazingSlot) {
  object.position.set(slot.x, slot.avatarY ?? STARGAZING.avatarY, slot.z);
  object.rotation.set(-Math.PI / 2 + (slot.incline ?? 0), slot.yaw, slot.roll ?? 0, "YXZ");
}

export function stargazingApproach(x: number, z: number) {
  let dx = x - STARGAZING.x, dz = z - STARGAZING.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) { dx = 0; dz = 1; }
  else { dx /= distance; dz /= distance; }
  return { x: STARGAZING.x + dx * STARGAZING.approachRadius, z: STARGAZING.z + dz * STARGAZING.approachRadius };
}

/** Fit the entire circle even in a narrow desktop window, independently of device detection. */
export function stargazingCameraDistance(fov: number, aspect: number, elevation: number) {
  const halfFov = THREE.MathUtils.degToRad(fov) / 2;
  const narrow = Math.max(0.1, Math.min(1, aspect));
  return Math.max(9, 3.9 / (Math.tan(halfFov) * narrow) + 3.5 * Math.cos(elevation));
}

function roundedMat(width: number, length: number, radius: number) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  shape.moveTo(x + radius, 0);
  shape.lineTo(x + width - radius, 0);
  shape.quadraticCurveTo(x + width, 0, x + width, radius);
  shape.lineTo(x + width, length - radius);
  shape.quadraticCurveTo(x + width, length, x + width - radius, length);
  shape.lineTo(x + radius, length);
  shape.quadraticCurveTo(x, length, x, length - radius);
  shape.lineTo(x, radius);
  shape.quadraticCurveTo(x, 0, x + radius, 0);
  return shape;
}

/** A low rope circle and eight woven mats mark the shared sky-viewing space, without signage. */
export function buildStargazingZone(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = "stargazing-starlight";
  group.position.set(STARGAZING.x, 0, STARGAZING.z);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xa88c68, roughness: 1 });
  for (const radius of [3.25, 3.38]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 5, 96), ropeMat);
    rope.rotation.x = -Math.PI / 2;
    rope.position.y = 0.026;
    group.add(rope);
  }
  const matGeometry = new THREE.ExtrudeGeometry(roundedMat(0.94, 2.12, 0.09), {
    depth: 0.022, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.012, bevelThickness: 0.009,
  });
  const insetGeometry = new THREE.ShapeGeometry(roundedMat(0.81, 1.94, 0.06));
  const matBorder = new THREE.MeshStandardMaterial({ color: 0x748f91, roughness: 0.98 });
  const matBorderWarm = new THREE.MeshStandardMaterial({ color: 0xab9b80, roughness: 0.98 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xe6d8ba, roughness: 1, side: THREE.DoubleSide });
  const pillowMaterial = new THREE.MeshStandardMaterial({ color: 0xf2e7d3, roughness: 1 });
  const pillowGeometry = new THREE.SphereGeometry(1, 14, 8);
  const weavePoints: number[] = [];
  for (let i = 0; i < 24; i++) {
    const y = 0.16 + i * 0.074;
    weavePoints.push(-0.375, y, 0.037, 0.375, y, 0.037);
  }
  const weaveGeometry = new THREE.BufferGeometry();
  weaveGeometry.setAttribute("position", new THREE.Float32BufferAttribute(weavePoints, 3));
  const weaveMaterial = new THREE.LineBasicMaterial({ color: 0x9e8b6a, transparent: true, opacity: 0.28, depthWrite: false });
  for (let i = 0; i < STARGAZING.capacity; i++) {
    const slot = stargazingSlot(i)!;
    const mat = new THREE.Group();
    mat.name = `stargazing-mat-${i}`;
    mat.userData.slot = i;
    mat.position.set(slot.x - STARGAZING.x, 0.045, slot.z - STARGAZING.z);
    mat.rotation.set(-Math.PI / 2, slot.yaw, 0, "YXZ");
    const base = new THREE.Mesh(matGeometry, i % 2 ? matBorderWarm : matBorder);
    base.receiveShadow = true;
    mat.add(base);
    const inset = new THREE.Mesh(insetGeometry, linen);
    inset.position.set(0, 0.085, 0.035);
    inset.receiveShadow = true;
    mat.add(inset, new THREE.LineSegments(weaveGeometry, weaveMaterial));
    const pillow = new THREE.Mesh(pillowGeometry, pillowMaterial);
    pillow.position.set(0, 1.7, 0.036);
    pillow.scale.set(0.30, 0.145, 0.035);
    pillow.receiveShadow = true;
    mat.add(pillow);
    group.add(mat);
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const radius = i % 2 ? 0.14 : 0.35;
    const x = Math.sin(angle) * radius, y = Math.cos(angle) * radius;
    if (i === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const emblem = new THREE.Mesh(new THREE.ShapeGeometry(starShape), new THREE.MeshStandardMaterial({ color: 0xbca77e, roughness: 0.85, side: THREE.DoubleSide }));
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.027;
  group.add(emblem);
  scene.add(group);
  return group;
}
