import * as THREE from "three";
import { assetLoader, assetUrl } from "../assets";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const MODEL_URL = "/beach/models/tripo-firewood-mobile-v2.glb";
const MODEL_WIDTH = 1.82;

/** Dispose loaded resources even when the visitor leaves before GLTFLoader completes. */
function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) {
    texture.dispose();
    const bitmap = texture.source.data as { close?: () => void } | null;
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
  }
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

/** The supplied charred-wood model remains as an ember bed after the fuel is gone. */
export class TripoCampfireModel {
  readonly ready: Promise<void>;
  private root = new THREE.Group();
  private loaded: THREE.Object3D | null = null;
  private disposed = false;
  private fuel = 3;
  private targetHeight = 1;
  private glow = { value: 0.72 };
  private fallback: THREE.Object3D[];

  constructor(scene: THREE.Scene, x: number, z: number, fallback: THREE.Object3D[]) {
    this.fallback = fallback;
    this.root.name = "campfire-tripo-model";
    this.root.position.set(x, 0.028, z);
    scene.add(this.root);
    this.setFuel(this.fuel);
    this.ready = assetLoader(new GLTFLoader()).setMeshoptDecoder(MeshoptDecoder).loadAsync(assetUrl(MODEL_URL)).then((gltf) => {
      const model = gltf.scene;
      if (this.disposed) { disposeModel(model); return; }
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const width = Math.max(size.x, size.z);
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(size.y)) {
        disposeModel(model);
        return;
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = MODEL_WIDTH / width;
      model.scale.multiplyScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          // Heat belongs only to the orange cracks baked into the supplied texture.
          // The wood remains dark, including when violet or blue powder is burning.
          material.metalness = 0;
          material.roughness = 0.96;
          material.emissive.set(0xffffff);
          material.emissiveIntensity = 1;
          material.normalScale.setScalar(0.68);
          material.onBeforeCompile = (shader) => {
            shader.uniforms.uTripoEmberGlow = this.glow;
            shader.fragmentShader = `uniform float uTripoEmberGlow;\n${shader.fragmentShader}`
              .replace("#include <emissivemap_fragment>", `
                #include <emissivemap_fragment>
                #ifdef USE_MAP
                  vec3 emberTexel = texture2D(map, vMapUv).rgb;
                  float warmCrack = smoothstep(0.045, 0.26, emberTexel.r - max(emberTexel.g, emberTexel.b));
                  warmCrack *= smoothstep(0.1, 0.46, emberTexel.r);
                  totalEmissiveRadiance = vec3(1.0, 0.18, 0.022) * warmCrack * uTripoEmberGlow;
                #else
                  totalEmissiveRadiance = vec3(0.0);
                #endif
              `);
          };
          material.customProgramCacheKey = () => "tripo-campfire-embers-v1";
        }
      });
      this.loaded = model;
      this.root.add(model);
      this.root.scale.y = this.targetHeight;
      for (const object of this.fallback) object.visible = false;
    }).catch(() => {
      // A missing/unsupported asset must never prevent entering the beach.
      // Procedural wood and coals stay visible until a model has loaded successfully.
    });
  }

  setFuel(logs: number) {
    this.fuel = Number.isFinite(logs) ? Math.round(THREE.MathUtils.clamp(logs, 0, 12)) : 3;
    this.targetHeight = 0.68 + 0.32 * THREE.MathUtils.smoothstep(this.fuel / 12, 0, 1);
  }

  update(dt: number, emberGlow: number, power: number) {
    if (this.disposed) return;
    this.root.scale.y = THREE.MathUtils.damp(this.root.scale.y, this.targetHeight, 1.6, dt);
    this.glow.value = emberGlow * (0.66 + THREE.MathUtils.clamp(power, 0, 1) * 0.28);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.loaded) disposeModel(this.loaded);
    this.loaded = null;
    this.root.removeFromParent();
  }
}
