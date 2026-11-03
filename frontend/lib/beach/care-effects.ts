import * as THREE from "three";

export interface CareAnchor { position: THREE.Vector3; close: boolean; resting: boolean }
type GestureKind = "wave" | "hug";
interface Gesture {
  kind: GestureKind; actor: string | null; group: THREE.Group;
  materials: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[];
  life: number; ttl: number;
}

/** Small camera-facing gestures; avatar textures and authoritative poses remain untouched. */
export class CareGestures {
  private active: Gesture[] = [];
  private disposed = false;
  private hand: THREE.ShapeGeometry;
  private outline: THREE.BufferGeometry;
  private marks: THREE.BufferGeometry;
  private arc = new THREE.TorusGeometry(0.62, 0.018, 4, 32, Math.PI * 0.88);
  private right = new THREE.Vector3();
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private anchor: (actor: string | null) => CareAnchor | null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    anchor: (actor: string | null) => CareAnchor | null,
  ) {
    this.scene = scene; this.camera = camera; this.anchor = anchor;
    const hand = new THREE.Shape();
    hand.moveTo(-0.13, -0.43);
    hand.lineTo(-0.23, -0.23); hand.lineTo(-0.43, -0.02);
    hand.quadraticCurveTo(-0.49, 0.07, -0.41, 0.11);
    hand.quadraticCurveTo(-0.35, 0.15, -0.29, 0.06); hand.lineTo(-0.22, -0.03);
    hand.lineTo(-0.27, 0.34); hand.quadraticCurveTo(-0.28, 0.43, -0.21, 0.44);
    hand.quadraticCurveTo(-0.14, 0.44, -0.13, 0.36); hand.lineTo(-0.105, 0.13);
    hand.lineTo(-0.14, 0.49); hand.quadraticCurveTo(-0.14, 0.58, -0.065, 0.58);
    hand.quadraticCurveTo(0.01, 0.58, 0.01, 0.49); hand.lineTo(0.025, 0.17);
    hand.lineTo(0.045, 0.52); hand.quadraticCurveTo(0.05, 0.61, 0.12, 0.60);
    hand.quadraticCurveTo(0.195, 0.59, 0.18, 0.50); hand.lineTo(0.15, 0.17);
    hand.lineTo(0.225, 0.41); hand.quadraticCurveTo(0.25, 0.49, 0.32, 0.46);
    hand.quadraticCurveTo(0.38, 0.43, 0.35, 0.35); hand.lineTo(0.28, 0.02);
    hand.quadraticCurveTo(0.28, -0.12, 0.16, -0.28); hand.lineTo(0.14, -0.43);
    hand.closePath();
    this.hand = new THREE.ShapeGeometry(hand, 5);
    this.outline = new THREE.BufferGeometry().setFromPoints(hand.getPoints(5));
    const marks: THREE.Vector3[] = [];
    for (let arc = 0; arc < 2; arc++) {
      const radius = 0.18 + arc * 0.14;
      for (let step = 0; step < 9; step++) {
        for (const part of [step, step + 1]) {
          const theta = -0.25 + part / 9 * 1.25;
          marks.push(new THREE.Vector3(0.35 + Math.cos(theta) * radius, 0.24 + Math.sin(theta) * radius, 0.01));
        }
      }
    }
    this.marks = new THREE.BufferGeometry().setFromPoints(marks);
  }

  play(kind: GestureKind, actor: string | null) {
    if (this.disposed || !this.anchor(actor)) return;
    // Room bursts stay bounded even if several people greet the same player together.
    while (this.active.length >= 8) this.remove(this.active[0]);
    const group = new THREE.Group();
    group.name = `care-${kind}`;
    const materials: Gesture["materials"] = [];
    if (kind === "wave") {
      const fill = new THREE.MeshBasicMaterial({ color: 0xffe4b8, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const stroke = new THREE.LineBasicMaterial({ color: 0xb68b58, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const motion = new THREE.LineBasicMaterial({ color: 0xffedc9, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const palm = new THREE.Mesh(this.hand, fill);
      const edge = new THREE.LineLoop(this.outline, stroke); edge.position.z = 0.002;
      palm.add(edge);
      group.add(palm, new THREE.LineSegments(this.marks, motion));
      materials.push(fill, stroke, motion);
    } else {
      for (const color of [0xffc3d2, 0xffe0ca]) {
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        group.add(new THREE.Mesh(this.arc, material));
        materials.push(material);
      }
    }
    group.traverse(object => { object.renderOrder = 5; });
    this.scene.add(group);
    this.active.push({ kind, actor, group, materials, life: 0, ttl: kind === "wave" ? 2.05 : 2.35 });
    this.update(0);
  }

  update(dt: number) {
    if (this.disposed) return;
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (const gesture of [...this.active]) {
      gesture.life += Math.max(0, dt);
      const anchor = this.anchor(gesture.actor), t = gesture.life / gesture.ttl;
      if (!anchor || t >= 1) { this.remove(gesture); continue; }
      const fade = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.27);
      gesture.group.position.copy(anchor.position);
      gesture.group.quaternion.copy(this.camera.quaternion);
      if (gesture.kind === "wave") {
        const close = anchor.close;
        gesture.group.position.addScaledVector(this.right, close ? 0.23 : 0.53);
        gesture.group.position.y += close ? 0.12 : anchor.resting ? 0.4 : 0.65;
        gesture.group.scale.setScalar(close ? 0.23 : 0.48);
        gesture.group.children[0].rotation.z = Math.sin(gesture.life * 13) * 0.28 * fade;
        gesture.materials[0].opacity = fade * 0.96;
        gesture.materials[1].opacity = fade * 0.8;
        gesture.materials[2].opacity = fade * (0.5 + Math.sin(gesture.life * 13) * 0.22);
      } else {
        const pulse = Math.sin(t * Math.PI), size = anchor.close ? 0.6 : 1;
        gesture.group.scale.set(size * (1.1 - pulse * 0.15), size * (anchor.resting ? 0.62 : 0.82), size);
        gesture.group.children[0].rotation.z = 0.2 + pulse * 0.26;
        gesture.group.children[1].rotation.z = Math.PI + 0.2 - pulse * 0.26;
        for (const material of gesture.materials) material.opacity = fade * (0.42 + Math.sin(t * Math.PI * 4) * 0.08);
      }
    }
  }

  private remove(gesture: Gesture) {
    this.scene.remove(gesture.group);
    for (const material of gesture.materials) material.dispose();
    this.active.splice(this.active.indexOf(gesture), 1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const gesture of [...this.active]) this.remove(gesture);
    for (const geometry of [this.hand, this.outline, this.marks, this.arc]) geometry.dispose();
  }
}
