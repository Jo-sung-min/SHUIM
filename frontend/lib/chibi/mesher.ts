/**
 * Surface Nets: SDF 격자에서 표면을 사각형 메시로 뽑는다.
 * 마칭 큐브보다 삼각형이 고르고 수가 적다. 뽑은 정점은 거리장 기울기를 따라 실제 표면으로 끌어당기고,
 * 노멀도 기울기에서 구해 이음새 없이 매끈한 음영을 만든다.
 */
import type { Vec3 } from "./sdf";

export interface RawMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function gradient(f: (x: number, y: number, z: number) => number, x: number, y: number, z: number, e: number): Vec3 {
  const gx = f(x + e, y, z) - f(x - e, y, z);
  const gy = f(x, y + e, z) - f(x, y - e, z);
  const gz = f(x, y, z + e) - f(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

export function surfaceNets(f: (x: number, y: number, z: number) => number, min: Vec3, max: Vec3, h: number): RawMesh {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // 성긴 격자(4칸 블록)로 먼저 재고, 표면이 지나갈 수 있는 블록만 촘촘히 잰다.
  // 먼 블록은 모퉁이 값의 부호만 쓰면 되므로 그대로 채운다 (계산량 약 1/5).
  const B = 4;
  const bx = Math.ceil((nx - 1) / B) + 1, by = Math.ceil((ny - 1) / B) + 1, bz = Math.ceil((nz - 1) / B) + 1;
  const coarse = new Float32Array(bx * by * bz);
  const bid = (i: number, j: number, k: number) => i + bx * (j + by * k);
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++)
    coarse[bid(i, j, k)] = f(min[0] + i * B * h, min[1] + j * B * h, min[2] + k * B * h);
  const reach = B * h * 0.87 + h * 1.5; // 블록 반 대각선 + 여유
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.min(bx - 1, Math.round(i / B)), cj = Math.min(by - 1, Math.round(j / B)), ck = Math.min(bz - 1, Math.round(k / B));
    const c = coarse[bid(ci, cj, ck)];
    val[id(i, j, k)] = Math.abs(c) > reach * 1.15 ? c : f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  }

  const cells = (nx - 1) * (ny - 1) * (nz - 1);
  const cellVert = new Int32Array(cells).fill(-1);
  const cid = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) {
      const v = val[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
      cv[c] = v;
      if (v < 0) neg++;
    }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
      sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
      sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
      n++;
    }
    cellVert[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }

  // 표면 쪽으로 끌어당기기 + 노멀
  const count = pos.length / 3;
  const positions = new Float32Array(pos);
  const normals = new Float32Array(count * 3);
  const e = h * 0.15;
  for (let v = 0; v < count; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const ox = x, oy = y, oz = z;
    for (let it = 0; it < 4; it++) {
      const d = f(x, y, z);
      if (Math.abs(d) < h * 0.002) break;
      const g = gradient(f, x, y, z, e);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    // 격자 한 칸 이상 튀면 원래 자리 근처로 되돌린다(얇은 곳에서 반대편 표면으로 넘어가는 것 방지)
    const mx = x - ox, my = y - oy, mz = z - oz, ml = Math.hypot(mx, my, mz);
    if (ml > h * 0.9) { const s = (h * 0.9) / ml; x = ox + mx * s; y = oy + my * s; z = oz + mz * s; }
    positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
    const g = gradient(f, x, y, z, e);
    normals[v * 3] = g[0]; normals[v * 3 + 1] = g[1]; normals[v * 3 + 2] = g[2];
  }

  // 부호가 바뀌는 격자 모서리마다 그 모서리를 둘러싼 4칸의 정점으로 사각형
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // 짧은 대각선으로 나눈다
    const P = positions;
    const dac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const dbd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[id(i, j, k)] < 0;
    // x 방향 모서리 (i,j,k)-(i+1,j,k): 둘레 칸 (i, j-1..j, k-1..k)
    if (i < nx - 1 && v0 !== (val[id(i + 1, j, k)] < 0))
      quad(cellVert[cid(i, j - 1, k - 1)], cellVert[cid(i, j, k - 1)], cellVert[cid(i, j, k)], cellVert[cid(i, j - 1, k)], !v0);
    if (j < ny - 1 && v0 !== (val[id(i, j + 1, k)] < 0))
      quad(cellVert[cid(i - 1, j, k - 1)], cellVert[cid(i - 1, j, k)], cellVert[cid(i, j, k)], cellVert[cid(i, j, k - 1)], !v0);
    if (k < nz - 1 && v0 !== (val[id(i, j, k + 1)] < 0))
      quad(cellVert[cid(i - 1, j - 1, k)], cellVert[cid(i, j - 1, k)], cellVert[cid(i, j, k)], cellVert[cid(i - 1, j, k)], !v0);
  }
  // 감기 방향을 노멀과 맞춘다 (격자 규칙을 외우는 대신 검사로)
  const out = new Uint32Array(idx);
  for (let t = 0; t < out.length; t += 3) {
    const a = out[t], b = out[t + 1], c = out[t + 2];
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const wx = positions[c * 3] - positions[a * 3], wy = positions[c * 3 + 1] - positions[a * 3 + 1], wz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
    const nx_ = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny_ = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz_ = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (cx * nx_ + cy * ny_ + cz * nz_ < 0) { out[t + 1] = c; out[t + 2] = b; }
  }
  return { positions, normals, indices: out };
}
