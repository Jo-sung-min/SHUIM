/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as THREE from "three";
export const N: number;
export const CASCADE_LENGTHS: number[];
export function defaultOceanParams(): Record<string, number>;
export class OceanSim {
  constructor(renderer: THREE.WebGLRenderer, params?: Record<string, number>);
  params: Record<string, number>;
  dirty: boolean;
  lengths: number[];
  displacement: THREE.Texture[];
  slope: THREE.Texture[];
  update(dt: number, timer?: any): void;
  dispose?(): void;
}
