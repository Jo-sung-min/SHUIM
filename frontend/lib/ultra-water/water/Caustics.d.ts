import type * as THREE from "three";
export const CAUSTICS_GLSL: string;
export class WaveCaustics {
  constructor(renderer: THREE.WebGLRenderer, sim: unknown);
  uniforms: Record<string, THREE.IUniform>;
  update(sunDir: THREE.Vector3): void;
}
