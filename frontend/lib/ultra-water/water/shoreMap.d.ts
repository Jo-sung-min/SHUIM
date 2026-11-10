import type * as THREE from "three";
export interface ShoreMap { texture: THREE.Texture; travel: THREE.Texture; surf: THREE.Texture; extent: number }
export function bakeShoreMap(heightFn: (x: number, z: number) => number, extent: number, size?: number, obstacle?: ((x: number, z: number) => number) | null): ShoreMap;
