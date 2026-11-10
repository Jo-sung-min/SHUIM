import type * as THREE from "three";
export const SHORE_GLSL: string;
export const SWASH_GLSL: string;
export const WATER_GLSL: string;
export class OceanSurface {
  constructor(sim: unknown, shore: unknown, sky: { cube: THREE.Texture; cubeSize: number; sunDir: THREE.Vector3; sunColor: THREE.Vector3 }, floatShadow: Record<string, THREE.IUniform>);
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  grids: THREE.BufferGeometry[];
  update(camera: THREE.PerspectiveCamera, time: number): void;
}
