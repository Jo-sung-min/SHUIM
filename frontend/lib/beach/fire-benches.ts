import * as THREE from "three";

export interface FireBench {
  id: string;
  index: number;
  x: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  seatY: number;
}

export interface FireBenchSeat {
  id: string;
  benchId: string;
  spotId: "fire-benches";
  slot: number;
  x: number;
  z: number;
  yaw: number;
  avatarY: number;
  incline: number;
}

export interface FireBenchObstacle { x: number; z: number; r: number }
export const FIRE_BENCH_REACH = 2.25;
const FIRE_CENTER = { x: 0, z: 12 };
const BENCH_RADIUS = 4;
const SEAT_HEIGHT = 0.52;

/** The half-step rotation leaves the sea and shelter approaches open along the Z axis. */
export const CAMPFIRE_BENCHES: readonly FireBench[] = Array.from({ length: 6 }, (_, index) => {
  const yaw = Math.PI / 6 + index * Math.PI / 3;
  return {
    id: `fire-bench-${index}`, index,
    x: FIRE_CENTER.x + Math.sin(yaw) * BENCH_RADIUS,
    z: FIRE_CENTER.z + Math.cos(yaw) * BENCH_RADIUS,
    yaw, width: 2.2, depth: 0.58, seatY: SEAT_HEIGHT,
  };
});

export const FIRE_BENCH_SEATS: readonly FireBenchSeat[] = CAMPFIRE_BENCHES.flatMap((bench) =>
  [-0.5, 0.5].map((offset, seatIndex) => ({
    id: `${bench.id}-seat-${seatIndex}`, benchId: bench.id,
    spotId: "fire-benches" as const, slot: bench.index * 2 + seatIndex,
    x: bench.x + Math.cos(bench.yaw) * offset,
    z: bench.z - Math.sin(bench.yaw) * offset,
    yaw: bench.yaw, avatarY: SEAT_HEIGHT, incline: 0,
  })),
);

/** Ignore invalid or stale claims instead of placing an avatar at an arbitrary coordinate. */
export function claimedFireBenchSlot(state: { pose?: string; spotId?: string | null; slot?: number | null }): FireBenchSeat | null {
  if (state.pose !== "sitting" || state.spotId !== "fire-benches" || typeof state.slot !== "number"
    || !Number.isInteger(state.slot) || state.slot < 0 || state.slot >= FIRE_BENCH_SEATS.length) return null;
  return FIRE_BENCH_SEATS[state.slot];
}

function woodTexture(name: string, color = false) {
  const texture = typeof document === "undefined" ? new THREE.Texture()
    : new THREE.TextureLoader().load(`/beach/real/${name}.jpg`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const LOG_CENTER_Y = 0.25;
const LOG_RADIUS = 0.282;
const LOG_SEGMENTS = 48;
const WOOD_GRAIN = `
  varying vec3 vBenchWood;
  float benchHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float benchNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(benchHash(i), benchHash(i + vec2(1.0, 0.0)), f.x),
      mix(benchHash(i + vec2(0.0, 1.0)), benchHash(i + vec2(1.0)), f.x), f.y);
  }
`;

/** Slightly irregular bark with a gently worn top at the existing sitting height. */
function logSection(angle: number, along: number) {
  const bend = Math.sin((along + 1.1) / 2.2 * Math.PI);
  const radius = LOG_RADIUS + Math.cos(angle * 13) * 0.004 + Math.cos(angle * 23) * 0.002
    + Math.sin(angle * 7 + along * 2) * bend * 0.002;
  return { y: Math.min(SEAT_HEIGHT - LOG_CENTER_Y, Math.cos(angle) * radius), z: Math.sin(angle) * radius };
}

function logGeometry() {
  const geometry = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS, 2.2, LOG_SEGMENTS, 10, true);
  geometry.rotateZ(-Math.PI / 2);
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), angle = Math.atan2(positions.getZ(i), positions.getY(i));
    const section = logSection(angle, x);
    positions.setXYZ(i, x, section.y, section.z);
    uv.setXY(i, (x + 1.1) / 1.8, angle / (Math.PI * 2));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function logEndGeometry() {
  const geometry = new THREE.CircleGeometry(LOG_RADIUS, LOG_SEGMENTS);
  geometry.rotateY(Math.PI / 2);
  const positions = geometry.getAttribute("position");
  for (let i = 1; i < positions.count; i++) {
    const section = logSection(Math.atan2(positions.getZ(i), positions.getY(i)), 1.1);
    positions.setXYZ(i, 0, section.y, section.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function grainMaterial(material: THREE.MeshStandardMaterial, cutEnd: boolean) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vBenchWood;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBenchWood = position;");
    shader.fragmentShader = `${WOOD_GRAIN}\n${shader.fragmentShader}`
      .replace("#include <map_fragment>", cutEnd ? `
        #include <map_fragment>
        vec2 p = vec2(vBenchWood.z + 0.018, vBenchWood.y * 1.04 - 0.012);
        float radius = length(p), angle = atan(p.y, p.x);
        float grain = benchNoise(p * 65.0);
        float rings = smoothstep(0.3, 0.85, sin(radius * 225.0 + grain * 1.4 + sin(angle * 3.0) * 0.6));
        float cracks = (1.0 - smoothstep(0.015, 0.05, abs(sin(angle * 2.0 + 0.6))))
          * smoothstep(0.09, 0.23, radius);
        float barkEdge = smoothstep(0.255, 0.28, length(vBenchWood.yz));
        diffuseColor.rgb *= 0.92 + grain * 0.09 - rings * 0.21 - cracks * 0.38;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.28, 0.24, 0.2), barkEdge);
      ` : `
        #include <map_fragment>
        float angle = atan(vBenchWood.z, vBenchWood.y);
        float grain = benchNoise(vec2(vBenchWood.x * 3.5, angle * 12.0));
        float furrow = smoothstep(0.55, 0.94, sin(angle * 37.0 + grain * 3.0 + vBenchWood.x * 0.9));
        float fine = benchNoise(vec2(vBenchWood.x * 22.0, angle * 75.0));
        diffuseColor.rgb *= 0.8 + grain * 0.35 + fine * 0.12 - furrow * 0.3;
      `);
  };
  material.customProgramCacheKey = () => cutEnd ? "campfire-log-cut-end-v1" : "campfire-log-bark-v1";
  return material;
}

/** Whole logs rest in the sand; bark and visible growth rings share just two draw batches. */
export function buildFireBenches(scene: THREE.Scene, obstacles: FireBenchObstacle[], woodMaterial?: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();
  group.name = "campfire-benches";
  const wood = woodMaterial?.clone() ?? new THREE.MeshStandardMaterial({
    map: woodTexture("wood", true), normalMap: woodTexture("wood-normal"),
    normalScale: new THREE.Vector2(0.4, 0.4),
  });
  wood.color.setHex(0xc2ab8c);
  wood.normalScale.set(0.65, 0.65);
  wood.roughness = 1;
  const logs = new THREE.InstancedMesh(logGeometry(), grainMaterial(wood, false), 6);
  const ends = new THREE.InstancedMesh(logEndGeometry(), grainMaterial(new THREE.MeshStandardMaterial({
    color: 0xd1ae7b, roughness: 0.96, side: THREE.DoubleSide,
  }), true), 12);
  logs.name = "campfire-bench-logs";
  ends.name = "campfire-bench-log-ends";
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  const place = (mesh: THREE.InstancedMesh, index: number, bench: FireBench, x: number) => {
    const sin = Math.sin(bench.yaw), cos = Math.cos(bench.yaw);
    transform.position.set(bench.x + cos * x, LOG_CENTER_Y, bench.z - sin * x);
    transform.rotation.set(0, bench.yaw, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  };
  for (const bench of CAMPFIRE_BENCHES) {
    place(logs, bench.index, bench, 0);
    logs.setColorAt(bench.index, tint.setHSL(0.08 + bench.index * 0.004, 0.09, 0.91 + Math.sin(bench.index * 2.1) * 0.035));
    [-1.101, 1.101].forEach((x, index) => place(ends, bench.index * 2 + index, bench, x));
    // Overlapping 0.29 m circles follow the seat, with 0.328 m between centers.
    // Their rounded ends leave enough clearance for an avatar on both central paths.
    for (let i = 0; i < 6; i++) {
      const offset = -0.82 + i * 1.64 / 5;
      obstacles.push({
        x: bench.x + Math.cos(bench.yaw) * offset,
        z: bench.z - Math.sin(bench.yaw) * offset, r: 0.29,
      });
    }
  }
  for (const mesh of [logs, ends]) {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
