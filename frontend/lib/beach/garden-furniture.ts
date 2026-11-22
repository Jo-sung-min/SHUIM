import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GARDEN_POND_BENCHES, GROUND_Y, HALL, HALL_BENCH_HEIGHT, HALL_TIERS, WINDOW_CHAIR_OFFSET, WISTERIA_BENCH_ID } from "./garden-layout";
import { SPRING_PHOTO_COURTS } from "./garden-photo-zone";

interface Placement { x: number; y: number; z: number; yaw: number; scale: number }
interface Exhibit { model: string; placements: Placement[]; ready?: () => void; indoor?: boolean }

/** Stream one embedded-texture GLB at a time, nearest first. The original
 * seats remain usable until their replacements and textures finish loading. */
export class GardenFurniture {
  private readonly loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly pending: Exhibit[];
  private readonly root = new THREE.Group();
  private readonly resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private readonly bitmaps = new Set<ImageBitmap>();
  private loading = false;
  private disposed = false;

  constructor(parent: THREE.Object3D, replaceChairs: () => void, replaceBench: () => void) {
    this.root.name = "garden-spring-furniture";
    parent.add(this.root);
    const bench = GARDEN_POND_BENCHES.find(b => b.id === WISTERIA_BENCH_ID)!;
    const window = HALL_TIERS[0];
    this.pending = [
      ...SPRING_PHOTO_COURTS.map(({ model, ...pose }) => ({ model, placements: [{ ...pose, y: GROUND_Y }] })),
      { model: "wisteria-bench", ready: replaceBench, placements: [{
        x: bench.x, y: bench.groundY, z: bench.z, yaw: Math.atan2(bench.fx, bench.fz),
        scale: (bench.floorY - bench.groundY) / .183,
      }] },
      { model: "reading-chair", indoor: true, ready: replaceChairs, placements: [-1, 1].map(side => ({
        x: HALL.x + side * WINDOW_CHAIR_OFFSET, y: window.y, z: HALL.glassZ + (window.from + window.to) / 2,
        yaw: Math.PI, scale: HALL_BENCH_HEIGHT / .485,
      })) },
    ];
  }

  update(x: number, z: number) {
    if (this.disposed || this.loading || !this.pending.length) return;
    let next = -1, nearest = Infinity;
    for (const [i, exhibit] of this.pending.entries()) {
      const p = exhibit.placements[0], distance = Math.hypot(x - p.x, z - p.z);
      if (exhibit.indoor && distance > 45) continue;
      if (distance < nearest) { nearest = distance; next = i; }
    }
    if (next < 0) return;
    this.loading = true;
    const [exhibit] = this.pending.splice(next, 1);
    void this.loader.loadAsync(`/garden/models/${exhibit.model}-mobile-v1.glb`).then(({ scene }) => {
      scene.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        this.resources.add(node.geometry);
        for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
          this.resources.add(mat);
          for (const value of Object.values(mat)) if (value instanceof THREE.Texture) {
            this.resources.add(value);
            const image = value.source.data;
            if (image && typeof image.close === "function") this.bitmaps.add(image);
          }
        }
        node.layers.enable(2);
        node.receiveShadow = true;
      });
      if (this.disposed) { this.release(); return; }
      for (const [i, p] of exhibit.placements.entries()) {
        const instance = i === 0 ? scene : scene.clone();
        instance.position.set(p.x, p.y, p.z); instance.rotation.y = p.yaw; instance.scale.setScalar(p.scale);
        instance.name = `garden-${exhibit.model}-${i + 1}`;
        this.root.add(instance);
      }
      exhibit.ready?.();
    }).catch(() => { /* Keep the walk and seat fallbacks available if a model fails. */ })
      .finally(() => { this.loading = false; });
  }

  private release() {
    for (const resource of this.resources) resource.dispose();
    for (const bitmap of this.bitmaps) bitmap.close();
    this.resources.clear(); this.bitmaps.clear();
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent(); this.root.clear(); this.release();
  }
}
