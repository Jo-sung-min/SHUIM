/**
 * 바닷가 모래사장과 물속 바닥의 모양 (렌더링 없이 쓰는 순수 함수). 사람의 발 높이(엔진 deckHeight),
 * 모래 메시, 가까운 바다(ultra-sea.ts)의 해안 지도가 모두 이 한 곳의 식을 쓴다.
 */
import * as THREE from "three";

/** 평평한 모래(y=0)가 끝나고 물가 경사가 시작하는 곳. 사람은 경사를 따라 서버 경계(z −15, 양쪽 바위 끝 앞)까지 물에 걸어 들어간다. */
export const BEACH_EDGE_Z = -1.2;
/** 굴절용으로 다시 그리는 레이어(모래·바닥, 물에 들어간 사람, 데스크톱은 절벽까지) */
export const REFRACT_LAYER = 2;

/**
 * 모래 높이(월드 y): 걷는 곳은 0, 그 앞은 물가로 기울다가 얕은 바다로 이어진다.
 * 깊이는 3m 남짓에서 멈추고 먼 바다까지 계속돼, 맑은 물 아래 바닥이 멀어질수록 서서히 물빛에 잠긴다.
 */
export function sandHeight(z: number) {
  if (z >= BEACH_EDGE_Z) return 0;
  const u = BEACH_EDGE_Z - z;
  if (u <= 2) return -0.14 * u;
  const v = u - 2;
  return -(0.28 + 2.8 * (1 - Math.exp(-v / 45)));
}

/**
 * 모래사장 + 물가 경사 + 물속 바닥을 한 장으로. 무늬 좌표는 원래 모래 평면(240×150, z −3~147)과 같다.
 * 바닥은 원본 물이 덮는 원(ULTRA_RADIUS) 너머까지 넓게 깔아, 어느 쪽을 봐도 굴절 화면에 빈 곳이 없다.
 */
export function beachSandGeometry() {
  const zs: number[] = [];
  for (let z = -330; z < -60; z += 10) zs.push(z);
  for (let z = -60; z < -12; z += 2) zs.push(z);
  for (let z = -12; z < BEACH_EDGE_Z; z += 0.25) zs.push(z);
  zs.push(BEACH_EDGE_Z, 147);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const z of zs) for (const x of [-330, 330]) {
    pos.push(x, sandHeight(z), z);
    uv.push((x + 120) / 240, (147 - z) / 150);
  }
  for (let r = 0; r < zs.length - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
