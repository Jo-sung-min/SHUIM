import type * as THREE from "three";
export const FLOAT_SHADOW_GLSL: string;
export class FloaterShadow {
  constructor(size?: number);
  uniforms: Record<string, THREE.IUniform>;
  target: THREE.WebGLRenderTarget;
  clear(renderer: THREE.WebGLRenderer): void;
}
