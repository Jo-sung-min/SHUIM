import * as THREE from "three";

type Point = readonly [number, number];
type Vertex = { x: number; y: number; z: number };
export const BUNKER_STREAM_LEVEL = -.025;
export const BUNKER_STREAM_BED = -.085;
/** Slightly proud of the floor: flush slabs would flicker where their ends overlap the dry bank. */
export const BUNKER_STREAM_CROSSING_TOP = .03;
export const BUNKER_STREAM_CROSSINGS: readonly Point[] = [
  ...[-1, 1].flatMap(side => [[side * 7.78, 2.0], [side * 8.14, 6.8], [side * 7.45, -.65]] as Point[]),
  [1.15, 16.4],
];
const BED = BUNKER_STREAM_BED, HALF_WIDTH = .39;

/** Narrow brooks leave the furniture and the arrival clear, then feed the central pond. */
export const BUNKER_STREAM_PATHS: readonly (readonly Point[])[] = [
  [[-7.2, -3.7], [-7.7, -1.5], [-7.8, 2.6], [-8.3, 5.6], [-7.9, 8], [-6.8, 9.4], [-6.45, 10.6]],
  [[7.2, -3.7], [7.7, -1.5], [7.8, 2.6], [8.3, 5.6], [7.9, 8], [6.8, 9.4], [6.45, 10.6]],
  [[0, 17.98], [1.0, 17.25], [1.25, 16.2], [.7, 14.8], [0, 13.65]],
];

export function bunkerStreamBanks() {
  return BUNKER_STREAM_PATHS.map(path => {
    const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, "centripetal");
    const count = Math.ceil(curve.getLength() / .85);
    const left: Point[] = [], right: Point[] = [], centre: Point[] = [];
    for (let i = 0; i <= count; i++) {
      const p = curve.getPoint(i / count), tangent = curve.getTangent(i / count), nx = -tangent.z, nz = tangent.x;
      centre.push([p.x, p.z]); left.push([p.x + nx * HALF_WIDTH, p.z + nz * HALF_WIDTH]); right.push([p.x - nx * HALF_WIDTH, p.z - nz * HALF_WIDTH]);
    }
    return { left, right, centre };
  });
}

const banks = bunkerStreamBanks();
const cross = (a: Vertex, b: Vertex, p: Vertex) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
const area = (polygon: readonly Vertex[]) => polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.z - q.x * p.z; }, 0) / 2;
const area3 = (polygon: readonly Vertex[]) => {
  const normal = new THREE.Vector3();
  for (let i = 0; i < polygon.length; i++) { const p = polygon[i], q = polygon[(i + 1) % polygon.length]; normal.x += (p.y - q.y) * (p.z + q.z); normal.y += (p.z - q.z) * (p.x + q.x); normal.z += (p.x - q.x) * (p.y + q.y); }
  return normal.length() / 2;
};
const cuts = banks.flatMap(({ left, right }) => left.slice(0, -1).map((p, i) => {
  const polygon = [p, left[i + 1], right[i + 1], right[i]].map(([x, z]) => ({ x, y: 0, z }));
  if (area(polygon) < 0) polygon.reverse();
  return { polygon, minX: Math.min(...polygon.map(v => v.x)), maxX: Math.max(...polygon.map(v => v.x)), minZ: Math.min(...polygon.map(v => v.z)), maxZ: Math.max(...polygon.map(v => v.z)) };
}));

export function inBunkerStream(x: number, z: number, margin = .001): boolean {
  return cuts.some(cut => cut.polygon.every((a, i) => {
    const b = cut.polygon[(i + 1) % cut.polygon.length];
    return cross(a, b, { x, y: 0, z }) >= -margin * Math.hypot(b.x - a.x, b.z - a.z);
  }));
}

/** Split a convex polygon at one directed edge without snapping or overlapping the new faces. */
function split(polygon: readonly Vertex[], a: Vertex, b: Vertex) {
  const inside: Vertex[] = [], outside: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = cross(a, b, p), dq = cross(a, b, q);
    if (dp >= -1e-8) inside.push(p);
    if (dp <= 1e-8) outside.push(p);
    if ((dp > 1e-8 && dq < -1e-8) || (dp < -1e-8 && dq > 1e-8)) {
      const t = dp / (dp - dq), v = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t };
      inside.push(v); outside.push(v);
    }
  }
  return { inside, outside };
}

function fromPolygons(polygons: readonly (readonly Vertex[])[], height?: number, water = false) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [];
  for (const raw of polygons) {
    if (raw.length < 3 || (height === undefined ? area3(raw) : Math.abs(area(raw))) < 1e-9) continue;
    const polygon = height === undefined || area(raw) < 0 ? raw : [...raw].reverse();
    for (let i = 1; i < polygon.length - 1; i++) for (const p of [polygon[0], polygon[i], polygon[i + 1]]) {
      positions.push(p.x, height ?? p.y, p.z); uv.push(p.x * .35, p.z * .35);
      if (water) colors.push(.18, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (water) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Cut the floor itself into dry and wet polygons. Each removed triangle appears only once
 * in the water, so adjoining bends never stack translucent, coplanar water planes.
 */
export function carveBunkerStreams(source: THREE.BufferGeometry) {
  const attr = source.getAttribute("position"), index = source.getIndex(), count = index?.count ?? attr.count;
  const dry: Vertex[][] = [], wet: Vertex[][] = [];
  for (let i = 0; i < count; i += 3) {
    let pieces: Vertex[][] = [[0, 1, 2].map(k => { const v = index ? index.getX(i + k) : i + k; return { x: attr.getX(v), y: attr.getY(v), z: attr.getZ(v) }; })];
    for (const cut of cuts) {
      const next: Vertex[][] = [];
      for (const polygon of pieces) {
        if (polygon.every(p => p.x < cut.minX) || polygon.every(p => p.x > cut.maxX) || polygon.every(p => p.z < cut.minZ) || polygon.every(p => p.z > cut.maxZ)) { next.push(polygon); continue; }
        let remaining = polygon;
        const outside: Vertex[][] = [];
        for (let e = 0; e < cut.polygon.length && remaining.length > 2; e++) {
          const result = split(remaining, cut.polygon[e], cut.polygon[(e + 1) % cut.polygon.length]);
          if (result.outside.length > 2) outside.push(result.outside);
          remaining = result.inside;
        }
        if (remaining.length > 2 && area3(remaining) > 1e-9) { wet.push(remaining); next.push(...outside); }
        else next.push(polygon);
      }
      pieces = next;
    }
    dry.push(...pieces);
  }
  return { floor: fromPolygons(dry), water: fromPolygons(wet, BUNKER_STREAM_LEVEL, true), bed: fromPolygons(wet, BED) };
}

/** The thin cut faces of the stone floor seal the recessed banks. */
export function bunkerStreamBankGeometry() {
  const p: number[] = [], uv: number[] = [];
  for (const { left, right } of banks) for (const edge of [left, [...right].reverse()]) for (let i = 0; i < edge.length - 1; i++) {
    const [ax, az] = edge[i], [bx, bz] = edge[i + 1];
    for (const [x, y, z] of [[ax, 0, az], [bx, BED, bz], [ax, BED, az], [ax, 0, az], [bx, 0, bz], [bx, BED, bz]]) { p.push(x, y, z); uv.push(x * .35, z * .35); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(Array.from({ length: p.length / 3 }, (_, i) => i)); geometry.computeVertexNormals();
  return geometry;
}
