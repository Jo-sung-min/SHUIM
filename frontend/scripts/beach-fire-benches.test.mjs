import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";

async function loadModule(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b)/g, "");
  const context = { ...assets, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(", ")} };`, context);
  return context.api;
}

const { CAMPFIRE_BENCHES, FIRE_BENCH_SEATS, FIRE_BENCH_REACH, claimedFireBenchSlot, buildFireBenches } =
  await loadModule("../lib/beach/fire-benches.ts", { THREE },
    ["CAMPFIRE_BENCHES", "FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot", "buildFireBenches"]);
const { findClearApproach } = await loadModule("../lib/beach/navigation.ts", {}, ["findClearApproach"]);
const center = { x: 0, z: 12 };
const near = (actual, expected, description) => assert.ok(Math.abs(actual - expected) < 1e-6, description);

test("six paired benches face the campfire with two distinct, reachable seats apiece", () => {
  assert.equal(CAMPFIRE_BENCHES.length, 6);
  assert.equal(FIRE_BENCH_SEATS.length, 12);
  assert.equal(new Set(FIRE_BENCH_SEATS.map(seat => seat.slot)).size, 12);
  assert.equal(new Set(FIRE_BENCH_SEATS.map(seat => seat.id)).size, 12);
  assert.equal(FIRE_BENCH_REACH, 2.25);
  for (const bench of CAMPFIRE_BENCHES) {
    near(Math.hypot(bench.x - center.x, bench.z - center.z), 4, "the fire keeps equal space around every bench");
    const seats = FIRE_BENCH_SEATS.filter(seat => seat.benchId === bench.id);
    assert.equal(seats.length, 2);
    near(Math.hypot(seats[0].x - seats[1].x, seats[0].z - seats[1].z), 1, "neighbors sit a full meter apart");
    for (const seat of seats) {
      assert.equal(seat.spotId, "fire-benches");
      near(seat.avatarY, bench.seatY, "avatar anchor is on the seat");
      near(seat.yaw, bench.yaw, "both seats face inward");
      const aimX = seat.x - Math.sin(seat.yaw) * 4;
      const aimZ = seat.z - Math.cos(seat.yaw) * 4;
      near(Math.hypot(aimX - center.x, aimZ - center.z), 0.5, "each seated view looks into the fire ring");
      near(Math.hypot(seat.x - bench.x, seat.z - bench.z), 0.5, "each avatar fits on its half of the bench");
    }
    const opposite = CAMPFIRE_BENCHES[(bench.index + 3) % 6];
    near(bench.x + opposite.x, center.x * 2, "opposing benches have balanced X positions");
    near(bench.z + opposite.z, center.z * 2, "opposing benches have balanced Z positions");
  }
});

test("only server sitting claims with valid fire-bench slots resolve", () => {
  for (const seat of FIRE_BENCH_SEATS) {
    assert.equal(claimedFireBenchSlot({ pose: "sitting", spotId: "fire-benches", slot: seat.slot }), seat);
  }
  for (const slot of [-1, 12, 0.5, NaN, Infinity, "0", null, undefined]) {
    assert.equal(claimedFireBenchSlot({ pose: "sitting", spotId: "fire-benches", slot }), null);
  }
  for (const pose of ["lying", "standing", undefined]) {
    assert.equal(claimedFireBenchSlot({ pose, spotId: "fire-benches", slot: 0 }), null);
  }
  assert.equal(claimedFireBenchSlot({ pose: "sitting", spotId: "hut-wave", slot: 0 }), null);
});

test("log benches share two shadowed instance batches, retain seat height and preserve the source wood material", () => {
  const scene = new THREE.Scene(), obstacles = [];
  const wood = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(), normalMap: new THREE.Texture(), color: 0xc4a878,
    normalScale: new THREE.Vector2(0.4, 0.5), roughness: 0.72,
  });
  const sourceShader = () => {};
  wood.onBeforeCompile = sourceShader;
  const originalColor = wood.color.clone(), originalNormalScale = wood.normalScale.clone();
  const group = buildFireBenches(scene, obstacles, wood);
  assert.equal(group.parent, scene);
  assert.equal(group.name, "campfire-benches");
  assert.equal(group.children.length, 2, "six trunks and their cut ends need only two draw batches");
  const logs = group.getObjectByName("campfire-bench-logs");
  const ends = group.getObjectByName("campfire-bench-log-ends");
  assert.equal(logs?.count, 6);
  assert.equal(ends?.count, 12);
  for (const mesh of group.children) {
    assert.ok(mesh.isInstancedMesh);
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
    assert.ok(mesh.boundingBox.min.x >= -5.2 && mesh.boundingBox.max.x <= 5.2
      && mesh.boundingBox.min.z >= 6.8 && mesh.boundingBox.max.z <= 17.2,
    "all bench geometry stays inside the campfire ring's furnishing footprint");
  }
  assert.notEqual(logs.material, wood, "bark uses a separate material so other cove timber cannot change");
  assert.equal(logs.material.map, wood.map, "bark reuses the existing wood photograph");
  assert.equal(logs.material.normalMap, wood.normalMap, "bark reuses the existing normal texture");
  assert.notEqual(ends.material, wood);
  assert.notEqual(ends.material, logs.material, "cut ends have their own light wood surface");
  assert.ok(wood.color.equals(originalColor));
  assert.ok(wood.normalScale.equals(originalNormalScale));
  assert.equal(wood.roughness, 0.72);
  assert.equal(wood.onBeforeCompile, sourceShader, "the source wood shader remains unchanged");
  const tints = new Set(), color = new THREE.Color();
  assert.ok(logs.instanceColor, "individual logs have subtle color variation");
  for (let index = 0; index < logs.count; index++) {
    logs.getColorAt(index, color);
    tints.add(color.toArray().map(value => value.toFixed(4)).join(","));
  }
  assert.ok(tints.size > 1);
  const transform = new THREE.Matrix4();
  logs.geometry.computeBoundingBox();
  for (let index = 0; index < logs.count; index++) {
    logs.getMatrixAt(index, transform);
    const bounds = logs.geometry.boundingBox.clone().applyMatrix4(transform);
    near(bounds.max.y, 0.52, "the physical seat matches the sitting anchor");
  }
  assert.equal(obstacles.length, 36);
  for (let index = 0; index < obstacles.length; index++) {
    if (index % 6 === 5) continue;
    const a = obstacles[index], b = obstacles[index + 1];
    const spacing = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(spacing >= 0.3 && spacing <= 0.4, "a smooth overlapping collision chain has no walk-through gaps");
  }
});

test("the sea and shelter entrances stay open for a full-width moving avatar", () => {
  const obstacles = [];
  buildFireBenches(new THREE.Scene(), obstacles);
  for (const x of [-0.45, 0, 0.45]) {
    for (let z = 5; z <= 19; z += 0.05) {
      for (const obstacle of obstacles) {
        assert.ok(Math.hypot(x - obstacle.x, z - obstacle.z) >= obstacle.r + 0.35,
          `the central 0.9 m walking corridor is clear at (${x}, ${z})`);
      }
    }
  }
  for (const seat of FIRE_BENCH_SEATS) {
    const approach = { x: seat.x - Math.sin(seat.yaw), z: seat.z - Math.cos(seat.yaw) };
    for (const obstacle of obstacles) {
      assert.ok(Math.hypot(approach.x - obstacle.x, approach.z - obstacle.z) >= obstacle.r + 0.35,
        `seat ${seat.slot} has an unobstructed approach on its fire-facing side`);
    }
  }
});

test("automatic fire approach keeps a clear segment from the star circle and all cardinal directions", () => {
  const obstacles = [{ ...center, r: 1.35 }];
  buildFireBenches(new THREE.Scene(), obstacles);
  const bounds = { minX: -22, maxX: 22, minZ: -1, maxZ: 31 };
  for (const preferredRadius of [3.2, 4.2]) {
    for (const [x, z] of [[7, 10.8], [0, 3], [9, 12], [0, 22], [-9, 12]]) {
      const target = findClearApproach({ x, z }, center, preferredRadius, obstacles, [], bounds);
      assert.ok(target, `a viewing spot exists from (${x}, ${z})`);
      const radius = Math.hypot(target.x - center.x, target.z - center.z);
      assert.ok(radius >= 3.2 - 1e-6 && radius <= 4.6, "the destination stays within fire interaction distance");
      if (preferredRadius === 4.2) near(radius, 4.2, "mobile retains its wider fire view");
      for (let step = 0; step <= 150; step++) {
        const px = x + (target.x - x) * step / 150, pz = z + (target.z - z) * step / 150;
        for (const obstacle of obstacles) {
          assert.ok(Math.hypot(px - obstacle.x, pz - obstacle.z) >= obstacle.r + 0.35 - 1e-5,
            `route from (${x}, ${z}) reaches the fire without cutting through a bench`);
        }
      }
    }
  }
});
