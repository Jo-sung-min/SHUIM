/**
 * design.ts 의 설계를 실제 SkinnedMesh 로 만든다.
 *  1) 파트마다 SDF 격자 → surface nets → 표면으로 정점 투영 (매끈한 노멀)
 *  2) 정점마다 가까운 도형들의 거리로 색과 뼈 가중치를 부드럽게 섞는다 (색 경계는 또렷, 가중치는 넓게)
 *  3) 다른 덩어리가 가까이 덮는 곳(앞머리 아래 이마, 턱 아래 목, 머리카락 안쪽)을 굽어 둔다 → 툰 그림자
 *  4) 뼈대를 만들고 몸+머리카락을 메시 하나로 묶는다 (드로우 콜 최소화)
 */
import * as THREE from "three";
import { BONES, PALETTE, chibiParts, type Part, type Weights } from "./design";
import { evalPrims, type Prim, type Vec3 } from "./sdf";
import { surfaceNets } from "./mesher";
import { buildFaceGeometry } from "./face";

export interface ChibiBuild {
  root: THREE.Bone;
  bones: Map<string, THREE.Bone>;
  skeleton: THREE.Skeleton;
  body: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  stats: { bodyTriangles: number; faceTriangles: number; ms: number };
}

export interface BuildOptions {
  /** 1 이 기본. 2 면 격자가 두 배 성겨 삼각형이 약 1/4 */
  coarse?: number;
}

function partBounds(prims: Prim[], pad: number): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.op !== "union") continue;
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], p.bc[a] - p.br - pad);
      max[a] = Math.max(max[a], p.bc[a] + p.br + pad);
    }
  }
  min[1] = Math.max(min[1], -0.02);
  return { min, max };
}

const colorCache = new Map<string, THREE.Color>();
function paletteColor(tag: string) {
  let c = colorCache.get(tag);
  if (!c) { c = new THREE.Color(PALETTE[tag] ?? "#ff00ff"); colorCache.set(tag, c); }
  return c;
}

interface PartMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array; colors: Float32Array; weights: Weights[] }

function meshPart(part: Part, coarse: number): PartMesh {
  const f = (x: number, y: number, z: number) => evalPrims(part.prims, x, y, z);
  const h = part.h * coarse;
  const { min, max } = partBounds(part.prims, h * 2);
  const raw = surfaceNets(f, min, max, h);
  const n = raw.positions.length / 3;
  const colors = new Float32Array(n * 4);
  const weights: Weights[] = new Array(n);
  const unions = part.prims.filter(p => p.op === "union");
  const d = new Float64Array(unions.length);
  for (let v = 0; v < n; v++) {
    const x = raw.positions[v * 3], y = raw.positions[v * 3 + 1], z = raw.positions[v * 3 + 2];
    let dmin = Infinity;
    for (let i = 0; i < unions.length; i++) {
      const p = unions[i];
      const lb = Math.hypot(x - p.bc[0], y - p.bc[1], z - p.bc[2]) - p.br;
      d[i] = lb > 0.12 ? lb : p.eval(x, y, z);
      if (d[i] < dmin) dmin = d[i];
    }
    let cr = 0, cg = 0, cb = 0, cs = 0, ws = 0;
    const w: Weights = {};
    for (let i = 0; i < unions.length; i++) {
      const gap = d[i] - dmin;
      const ac = Math.exp(-gap / part.colorSharpness);
      if (ac > 1e-4) {
        const c = paletteColor(unions[i].tag);
        cr += c.r * ac; cg += c.g * ac; cb += c.b * ac; cs += ac;
      }
      const aw = Math.exp(-gap / part.weightBlend);
      if (aw > 1e-3) {
        const fn = unions[i].data?.weight as ((x: number, y: number, z: number, t: number) => Weights) | undefined;
        const t = unions[i].along ? unions[i].along!(x, y, z) : 0;
        const wi = fn ? fn(x, y, z, t) : part.weights(x, y, z);
        for (const k in wi) w[k] = (w[k] ?? 0) + wi[k] * aw;
        ws += aw;
      }
    }
    colors[v * 4] = cr / cs; colors[v * 4 + 1] = cg / cs; colors[v * 4 + 2] = cb / cs;
    for (const k in w) w[k] /= ws;
    weights[v] = w;
  }
  return { ...raw, colors, weights };
}

function cullBuried(m: PartMesh, other: (x: number, y: number, z: number) => number, margin: number) {
  const n = m.positions.length / 3;
  const buried = new Uint8Array(n);
  for (let v = 0; v < n; v++) buried[v] = other(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]) < -margin ? 1 : 0;
  const keep: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t], b = m.indices[t + 1], c = m.indices[t + 2];
    if (buried[a] && buried[b] && buried[c]) continue;
    keep.push(a, b, c);
  }
  m.indices = new Uint32Array(keep);
}

/** 주변 덩어리가 덮는 정도(0~1). 툰 셰이더가 이 값만큼 그림자 쪽으로 기운다. */
function bakeCover(m: PartMesh, all: (x: number, y: number, z: number) => number, strength: number, reach: number) {
  const n = m.positions.length / 3;
  // 격자보다 짧게 재면 표면 계단이 얼룩으로 잡히므로, 거친 파트일수록 멀리서 잰다
  const steps = [0.016 * reach, 0.034 * reach, 0.06 * reach];
  const share = [0.45, 0.33, 0.22];
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    const nx = m.normals[v * 3], ny = m.normals[v * 3 + 1], nz = m.normals[v * 3 + 2];
    let occ = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const dd = all(x + nx * s, y + ny * s, z + nz * s);
      occ += share[i] * Math.max(0, Math.min(1, (s - dd) / s));
    }
    const t = Math.max(0, Math.min(1, (occ - 0.12) / 0.45));
    m.colors[v * 4 + 3] = t * t * (3 - 2 * t) * strength;
  }
}

type AttrArray = Float32Array | Uint16Array;
interface GeoData {
  attributes: Record<string, { array: AttrArray; itemSize: number }>;
  index: Uint32Array;
  morphs: { name: string; array: Float32Array }[];
}
/** 메싱 결과: 순수 배열 묶음 (뼈대·지오메트리는 assembleChibi 가 만든다) */
export interface ChibiData { body: GeoData; face: GeoData; ms: number }

function toData(g: THREE.BufferGeometry): GeoData {
  const attributes: GeoData["attributes"] = {};
  for (const [k, a] of Object.entries(g.attributes)) attributes[k] = { array: (a as THREE.BufferAttribute).array as AttrArray, itemSize: a.itemSize };
  const idx = g.index!.array;
  return {
    attributes,
    index: idx instanceof Uint32Array ? idx : new Uint32Array(idx),
    morphs: (g.morphAttributes.position ?? []).map(a => ({ name: a.name, array: a.array as Float32Array })),
  };
}

function fromData(d: GeoData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(d.attributes)) g.setAttribute(k, new THREE.BufferAttribute(a.array, a.itemSize));
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  if (d.morphs.length) {
    g.morphTargetsRelative = true;
    g.morphAttributes.position = d.morphs.map(m => { const a = new THREE.BufferAttribute(m.array, 3); a.name = m.name; return a; });
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * 무거운 부분(메싱·가중치·그림자 굽기)을 몇 단계로 나눈다. 단계마다 멈춰(yield) 브라우저가 한 번씩 숨을 쉬게 한다.
 * (예전엔 Web Worker 로 돌렸지만, `new Worker(new URL(..., import.meta.url))` 가 Turbopack 프로덕션 빌드를 멈춰 세웠다.)
 */
function* buildChibiSteps(opts: BuildOptions = {}): Generator<void, ChibiData, void> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const coarse = opts.coarse ?? 1;
  const defs = chibiParts();
  const sdf = new Map(defs.map(p => [p.name, (x: number, y: number, z: number) => evalPrims(p.prims, x, y, z)]));
  const union = (names: string[]) => {
    const fs = names.map(n => sdf.get(n)!);
    return (x: number, y: number, z: number) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y, z)); return d; };
  };
  const parts: PartMesh[] = [];
  for (const p of defs) { parts.push(meshPart(p, coarse)); yield; }
  // 다른 덩어리 속에 완전히 묻힌 삼각형(머리카락 속 두개골 뒤, 몸통 속 옷깃 안쪽 등)은 보이지 않으니 버린다
  defs.forEach((p, i) => cullBuried(parts[i], union(defs.filter(o => o !== p).map(o => o.name)), 0.004));
  yield;
  defs.forEach((p, i) => { if (p.cover.length) bakeCover(parts[i], union(p.cover), p.coverStrength, Math.max(1, (p.h * coarse) / 0.0115)); });
  yield;
  const boneIndex = new Map(BONES.map((b, i) => [b.name, i]));

  // 합치기: 몸·옷깃·머리카락·앞머리·리본을 한 지오메트리로 (드로우 콜 1)
  const total = parts.reduce((s, p) => s + p.positions.length / 3, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 4);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  const idxCount = parts.reduce((s, p) => s + p.indices.length, 0);
  const idx = new Uint32Array(idxCount);
  let base = 0, at = 0;
  for (const p of parts) {
    const n = p.positions.length / 3;
    pos.set(p.positions, base * 3); nor.set(p.normals, base * 3); col.set(p.colors, base * 4);
    for (let v = 0; v < n; v++) {
      const top = Object.entries(p.weights[v]).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      top.forEach(([name, w], j) => {
        const bi = boneIndex.get(name);
        if (bi === undefined) throw new Error(`unknown bone ${name}`);
        si[(base + v) * 4 + j] = bi;
        sw[(base + v) * 4 + j] = w / sum;
      });
    }
    for (let i = 0; i < p.indices.length; i++) idx[at++] = p.indices[i] + base;
    base += n;
  }
  const face = buildFaceGeometry(sdf.get("body")!, boneIndex.get("Head")!);
  const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  return {
    body: { attributes: { position: { array: pos, itemSize: 3 }, normal: { array: nor, itemSize: 3 }, color: { array: col, itemSize: 4 }, skinIndex: { array: si, itemSize: 4 }, skinWeight: { array: sw, itemSize: 4 } }, index: idx, morphs: [] },
    face: toData(face),
    ms,
  };
}

/** 배열 묶음 → 뼈대 + SkinnedMesh 용 지오메트리 (가벼움, 메인 스레드) */
export function assembleChibi(data: ChibiData): ChibiBuild {
  const bones = new Map<string, THREE.Bone>();
  const list: THREE.Bone[] = [];
  for (const def of BONES) {
    const b = new THREE.Bone();
    b.name = def.name;
    const parent = def.parent ? BONES.find(d => d.name === def.parent)! : null;
    b.position.set(def.pos[0] - (parent?.pos[0] ?? 0), def.pos[1] - (parent?.pos[1] ?? 0), def.pos[2] - (parent?.pos[2] ?? 0));
    if (def.tail) b.userData.tail = new THREE.Vector3(def.tail[0] - def.pos[0], def.tail[1] - def.pos[1], def.tail[2] - def.pos[2]);
    if (def.parent) bones.get(def.parent)!.add(b);
    bones.set(def.name, b);
    list.push(b);
  }
  // 꼬리 위치가 없는 뼈는 첫 자식 쪽을 꼬리로 (스프링 본 길이)
  for (const b of list) if (!b.userData.tail) {
    const child = b.children.find(c => (c as THREE.Bone).isBone) as THREE.Bone | undefined;
    b.userData.tail = child ? child.position.clone() : new THREE.Vector3(0, 0.05, 0);
  }
  const root = bones.get("Root")!;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  const body = fromData(data.body), face = fromData(data.face);
  return {
    root, bones, skeleton, body, face,
    stats: { bodyTriangles: data.body.index.length / 3, faceTriangles: data.face.index.length / 3, ms: data.ms },
  };
}

/** 한 번에 끝까지 (테스트·노드용) */
export function buildChibiData(opts: BuildOptions = {}): ChibiData {
  const steps = buildChibiSteps(opts);
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

export function buildChibi(opts: BuildOptions = {}): ChibiBuild {
  return assembleChibi(buildChibiData(opts));
}

/** 브라우저용: 단계 사이마다 이벤트 루프에 양보해 화면이 길게 멈추지 않는다 */
export async function buildChibiAsync(opts: BuildOptions = {}): Promise<ChibiBuild> {
  const steps = buildChibiSteps(opts);
  for (;;) {
    const r = steps.next();
    if (r.done) return assembleChibi(r.value);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}
