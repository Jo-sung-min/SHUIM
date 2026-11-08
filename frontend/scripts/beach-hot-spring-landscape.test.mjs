import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/hot-spring-landscape.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=function\b|const\b)/g, "");
const context = { THREE, ...hotSpring };
vm.runInNewContext(`${source}\nglobalThis.api = { buildHotSpringLandscape };`, context);
const { buildHotSpringLandscape } = context.api;
const { HOT_SPRING: spa, HOT_SPRING_PATH: path, hotSpringFloorHeight: floor } = hotSpring;

function fixture(material) {
  const scene = new THREE.Scene();
  const hillside = buildHotSpringLandscape(scene, material);
  scene.updateMatrixWorld(true);
  const mesh = hillside.group.getObjectByName("onsen-continuous-cliff-shell");
  const cast = (origin, direction, far) => new THREE.Raycaster(
    new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0.001, far,
  ).intersectObject(mesh, false);
  return { scene, hillside, mesh, cast };
}

test("the connected hillside closes the ground facade and has just one real ground entrance", () => {
  const { mesh, cast, hillside } = fixture();
  const bounds = new THREE.Box3().setFromObject(mesh);
  assert.ok(bounds.min.x <= -25 && bounds.max.x >= 25);
  assert.ok(Math.abs(bounds.min.z - 32.65) < 1e-4, "no rock crosses the central house's rear wall at z=32.5");
  assert.ok(bounds.min.y < 0 && bounds.max.z >= 57, "the shell extends into the ground and reaches the original rear ridge");
  for (let x = -24.5; x <= 24.5; x += 0.5) {
    for (const y of [0.1, 1.55, 2.6, 6, 12, 16]) {
      const entrance = x > 5.7 && x < 7.3 && y < 2.5;
      assert.equal(cast([x, y, 32], [0, 0, 1], 1).length === 0, entrance, `continuous front face at x=${x}, y=${y}`);
    }
  }
  for (const x of [6.15, 6.5, 6.85]) for (const y of [0.1, 0.9, 1.8, 2.2]) {
    assert.equal(cast([x, y, 32.2], [0, 0, 1], 1.3).length, 0, "the entrance admits a walking body into the north-to-east turn");
  }
  hillside.dispose();
});

test("beach and house-side sight lines meet the natural cliff before stairs or the bath foundation", () => {
  const { cast, hillside } = fixture();
  const origins = [[0, 1.55, 12], [-13, 1.55, 31], [19, 1.55, 30], [6.5, 1.55, 28]];
  const targets = [[0, spa.deckY - 0.5, 45], [11.5, floor(11.5, 42) + 1, 42], [8.7, floor(8.7, 48) + 1, 48], [11.5, 3.5, 33.5]];
  for (const origin of origins) for (const target of targets) {
    const direction = target.map((value, index) => value - origin[index]);
    const distance = Math.hypot(...direction);
    const hits = cast(origin, direction, distance - 0.05);
    assert.ok(hits.length > 0, `solid cliff conceals ${target.join(",")} from ${origin.join(",")}`);
  }
  hillside.dispose();
});

test("shared cliff edges have no cracks beyond the two entrances and the buried bottom edge", () => {
  const { mesh, hillside } = fixture();
  const attribute = mesh.geometry.getAttribute("position"), index = mesh.geometry.index;
  const vertices = Array.from({ length: attribute.count }, (_, i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]);
  const keys = vertices.map(point => point.map(value => Math.round(value * 1e4)).join(","));
  const edges = new Map();
  for (let i = 0; i < index.count; i += 3) {
    for (let side = 0; side < 3; side++) {
      const a = index.getX(i + side), b = index.getX(i + (side + 1) % 3);
      if (keys[a] === keys[b]) continue;
      const key = [keys[a], keys[b]].sort().join("|");
      const edge = edges.get(key) ?? { a: vertices[a], b: vertices[b], count: 0 };
      edge.count++; edges.set(key, edge);
    }
  }
  for (const { a, b, count } of edges.values()) {
    assert.ok(count <= 2, "the shell does not contain overlapping triangles");
    if (count === 2) continue;
    const bottom = a[1] < -0.199 && b[1] < -0.199;
    const entry = [a, b].every(([x, y, z]) => x >= 5.699 && x <= 7.301 && y <= 2.501 && z < 33);
    const exit = [a, b].every(([x, y, z]) => x > 6.8 && Math.abs(z - 45) < 1.001 && y >= 17.699 && y <= 20.651);
    const stair = [a, b].every(([x, y, z]) => Math.abs(x) < 2.4 && z > 49.5 && y > 15.5);
    assert.ok(bottom || entry || exit || stair, `unplanned open seam ${a.join(",")} → ${b.join(",")}`);
  }
  hillside.dispose();
});

test("every existing stair flight keeps its head and body volume clear of the new landscape", () => {
  const { cast, hillside } = fixture();
  for (let leg = 0; leg < path.length - 1; leg++) {
    const a = path[leg], b = path[leg + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
    const samples = Math.ceil(length / 0.12);
    for (let index = 0; index <= samples; index++) {
      const x = a.x + (b.x - a.x) * index / samples, z = a.z + (b.z - a.z) * index / samples;
      const y = floor(x, z);
      for (const side of [-0.25, 0, 0.25]) {
        assert.equal(cast([x + dz * side, y + 0.03, z - dx * side], [0, 1, 0], 1.95).length, 0,
          `clear body at ${x},${z} with lateral offset ${side}`);
      }
      if (index < samples) for (const height of [0.2, 0.9, 1.7]) {
        assert.equal(cast([x, y + height, z], [dx, 0, dz], Math.min(0.13, length / samples)).length, 0,
          `no invisible cliff plane cuts across flight ${leg}`);
      }
    }
  }
  for (const z of [44.5, 45, 45.5]) for (const y of [18.05, 18.8, 19.7]) {
    assert.equal(cast([7.65, y, z], [-1, 0, 0], 1.7).length, 0, "the upper cave opens onto the deck through a real hole");
  }
  hillside.dispose();
});

test("the covered hillside retains the open sky and the entire sea-facing bathing horizon", () => {
  const { cast, hillside } = fixture();
  const eyeY = spa.floorY + 1.55;
  for (let degrees = -158; degrees <= -22; degrees += 2) {
    const angle = degrees * Math.PI / 180;
    assert.equal(cast([0, eyeY, 45], [Math.cos(angle), 0, Math.sin(angle)], 65).length, 0,
      `the rock stays below the ocean horizon at ${degrees} degrees`);
  }
  for (const [x, z] of [[0, 45], [-3, 44], [3, 46], [0, 41]]) {
    assert.equal(cast([x, eyeY, z], [0, 1, 0], 100).length, 0, "the pool is open to the night sky");
  }
  for (const point of [[8.7, 45], [15, 40], [12, 45]]) {
    assert.ok(cast([point[0], 30, point[1]], [0, -1, 0], 15).length, "the terrain roof covers exposed tunnel structures");
  }
  hillside.dispose();
});

test("the upper baths get lighter shells that face the sea and meet in the middle", () => {
  const { hillside } = fixture();
  const shells = hillside.group.children.filter((child) => child.name.startsWith("onsen-upper-cliff-shell"));
  assert.equal(shells.length, 2);
  for (const shell of shells) {
    assert.ok(shell.geometry.index.count / 3 < 14000, `triangles=${shell.geometry.index.count / 3}`);
    assert.equal(shell.castShadow, false);
  }
  const blocked = (mesh, origin, direction, far) => new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0.001, far).intersectObject(mesh, false).length > 0;
  const [left, right] = shells, eye = spa.deckY + 4 + 1.55;
  assert.equal(blocked(left, [-7.6, eye, 55], [0, 0, -1], 14), false, "the left bath opens toward the sea");
  assert.equal(blocked(right, [7.6, eye, 55], [0, 0, -1], 14), false, "the right bath opens toward the sea");
  assert.equal(blocked(left, [-7.6, eye, 55], [0, 0, 1], 9), true, "the land side stays closed");
  assert.equal(blocked(left, [-7.6, eye, 60], [1, 0, 0], 8), true, "rock separates the two baths behind the stair head");
  hillside.dispose();
});

test("the single draw reuses the existing triplanar stone shader and releases only owned resources", () => {
  const map = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map });
  material.onBeforeCompile = (shader) => { shader.fragmentShader += "\n// existing world-scale rock"; };
  material.customProgramCacheKey = () => "existing-cove-rock";
  const { hillside, mesh, scene } = fixture(material);
  assert.equal(hillside.group.children.length, 3, "the first hill plus one shell per upper bath");
  assert.ok(mesh.geometry.index.count / 3 < 35000, `triangles=${mesh.geometry.index.count / 3}`);
  assert.equal(mesh.material.map, map);
  assert.equal(mesh.material.onBeforeCompile, material.onBeforeCompile);
  assert.equal(mesh.material.customProgramCacheKey(), "existing-cove-rock");
  let textures = 0, originalMaterials = 0, ownedMaterials = 0, geometry = 0;
  map.addEventListener("dispose", () => textures++);
  material.addEventListener("dispose", () => originalMaterials++);
  mesh.material.addEventListener("dispose", () => ownedMaterials++);
  mesh.geometry.addEventListener("dispose", () => geometry++);
  hillside.dispose(); hillside.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(textures, 0); assert.equal(originalMaterials, 0);
  assert.equal(ownedMaterials, 1); assert.equal(geometry, 1);
});
