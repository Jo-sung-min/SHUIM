import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|class\b|const\b)/g, "");
  const context = { ...dependencies }; vm.runInNewContext(`${source}\nglobalThis.api = {${names.join(",")}};`, context); return context.api;
}
const layout = await load("../lib/beach/garden-layout.ts", hotSpring, ["GARDEN_POND_BENCHES", "GARDEN_SEATS", "GARDEN_PIERS", "GARDEN_WILLOWS", "GROUND_Y", "WATER_Y", "LAKE", "gardenPavilionWorld", "gardenSeat", "isWater", "lakeSigned", "onStructure", "onGardenGround", "resolveGardenWalk"]);
let localTime = 0;
const { GardenPond, gardenMomentWaterTarget } = await load("../lib/beach/garden-pond.ts", { THREE, mergeGeometries, RoundedBoxGeometry, ...layout, performance: { now: () => localTime } }, ["GardenPond", "gardenMomentWaterTarget"]);
const benchSeats = layout.GARDEN_SEATS.filter(seat => seat.spotId.startsWith("pond-bench-"));
const epoch = 100_000;
const event = (kind, id, age = 0, seat = benchSeats[0]) => ({ id, pid: "reader", kind, x: seat.x, z: seat.z, yaw: seat.yaw, startedAt: epoch - age, durationMs: kind === "coin" ? 6000 : 90000 });
function build(low = false) { localTime = 0; const scene = new THREE.Scene(), pond = new GardenPond(scene, low); return { scene, pond, mesh: name => scene.getObjectByName(`garden-pond-${name}`) }; }
const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
function instancePose(mesh, index = 0) { mesh.getMatrixAt(index, matrix); matrix.decompose(position, rotation, scale); return { position: position.clone(), scale: scale.clone() }; }

test("six server-aligned two-person benches preserve all original seats and remain walkable", () => {
  assert.equal(layout.GARDEN_SEATS.length, 42); assert.equal(benchSeats.length, 12);
  assert.equal(layout.GARDEN_SEATS.filter(seat => !seat.spotId.startsWith("pond-bench-")).length, 30);
  const expected = [["sw", -21.31678586, 9.13041650], ["se", 27.05566953, 15.49022060], ["w", -34.83661939, 34], ["e", 39.92414302, 34], ["nw", -30.53993522, 53.43450423], ["ne", 27.90771696, 51.75945625]];
  for (const [id, x, z] of expected) {
    const bench = layout.GARDEN_POND_BENCHES.find(bench => bench.id === `pond-bench-${id}`);
    assert.deepEqual([bench.x, bench.z], [x, z]);
    const dx = layout.LAKE.x - x, dz = layout.LAKE.z - z, distance = Math.hypot(dx, dz);
    assert.ok(Math.abs(bench.fx * dx + bench.fz * dz - distance) < 1e-9, "each bench faces directly into the pond");
    assert.ok(Math.abs(Math.hypot(bench.fx, bench.fz) - 1) < 1e-9);
    assert.ok(layout.lakeSigned(x, z) >= 1.09 && layout.lakeSigned(x, z) <= 1.31, "the bench sits immediately behind the water's edge");
    assert.equal(layout.gardenSeat(bench.spotId, 2), null);
    for (const slot of [0, 1]) {
      const seat = layout.gardenSeat(bench.spotId, slot);
      assert.equal(seat.avatarY, layout.GROUND_Y + .45); assert.equal(seat.baseY, layout.GROUND_Y);
      assert.ok(Math.abs(-Math.sin(seat.yaw) - bench.fx) < 1e-9 && Math.abs(-Math.cos(seat.yaw) - bench.fz) < 1e-9, "both seated bodies face the water");
      assert.ok(layout.onGardenGround(seat.x, seat.z));
      assert.equal(layout.onStructure(seat.x, seat.z), false, "shore benches cannot occupy the pier or a boat boarding place");
      const landing = layout.resolveGardenWalk(seat.x, seat.z);
      assert.equal(landing[0], seat.x); assert.equal(landing[1], seat.z);
      assert.ok(Math.abs(Math.hypot(seat.x - x, seat.z - z) - .6) < 1e-9);
      if (id === "se") {
        const camera = { x: seat.x - bench.fx * 4.3, z: seat.z - bench.fz * 4.3 };
        assert.ok(layout.GARDEN_WILLOWS.every(tree => Math.hypot(tree.x - camera.x, tree.z - camera.z) > 4.5), "the relocated seat's camera stays clear of willow crowns");
        for (const pier of layout.GARDEN_PIERS) for (let t = -4.3; t <= 6; t += .25) {
          const px = seat.x + bench.fx * t, pz = seat.z + bench.fz * t;
          const along = Math.max(0, Math.min(pier.length, (px - pier.x) * pier.dx + (pz - pier.z) * pier.dz));
          assert.ok(Math.hypot(px - pier.x - pier.dx * along, pz - pier.z - pier.dz * along) - pier.halfWidth > 4,
            "the camera-to-duck view passes beside the dock instead of over the boarding area");
        }
      }
    }
    const behind = layout.gardenPavilionWorld(bench, 0, -1.4);
    assert.ok(layout.onGardenGround(behind.x, behind.z), "the resting bay leaves space to pass behind the bench");
  }
});

test("rounded seat tops match all twelve avatar heights with no separate ground pads", () => {
  for (const low of [true, false]) {
    const { scene, pond, mesh } = build(low); scene.updateMatrixWorld(true);
    const bench = mesh("bench-wood");
    for (const seat of benchSeats) {
      const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .1, seat.z), new THREE.Vector3(0, -1, 0), 0, .2);
      const hit = ray.intersectObject(bench)[0];
      assert.ok(hit && Math.abs(hit.point.y - seat.avatarY) < 1e-5, `${seat.id} rests on a rounded wood seat`);
    }
    const statics = scene.children[0].children.filter(object => object.isMesh && !object.isInstancedMesh);
    assert.equal(statics.length, 2);
    assert.equal(mesh("bench-gravel"), undefined);
    let lights = 0;
    scene.traverse(object => {
      if (object.isLight) lights++;
      if (!object.isMesh) return;
      assert.equal(object.castShadow, false); assert.ok(object.layers.isEnabled(2));
      assert.ok(Array.from(object.geometry.getAttribute("position").array).every(Number.isFinite));
    });
    assert.equal(lights, 0);
    pond.dispose();
  }
});

test("every bench sends coins and ducks into open water, away from the island and structures", () => {
  for (const seat of benchSeats) {
    const target = gardenMomentWaterTarget(seat.x, seat.z);
    assert.ok(target && layout.isWater(target.x, target.z));
    assert.ok(Math.hypot(target.x - seat.x, target.z - seat.z) >= 6 - 1e-9, "small effects land beyond the seated silhouette");
    assert.ok(layout.lakeSigned(target.x, target.z) < -2.2, "duck bob/drift has room clear of the shore");
    const bench = layout.GARDEN_POND_BENCHES.find(bench => bench.spotId === seat.spotId);
    assert.ok(Math.abs((target.x - seat.x) * bench.fz - (target.z - seat.z) * bench.fx) < 1e-9, "the wish stays in front of the seated portrait camera");
  }
  assert.equal(gardenMomentWaterTarget(NaN, 20), null);
});

test("coin flight lands into three gentle expanding rings and late joins use their true age", () => {
  const { pond, mesh } = build();
  pond.apply([event("coin", "coin-a")], epoch);
  pond.update(0, 0);
  assert.equal(mesh("coins").count, 1); assert.equal(mesh("coin-ripples").count, 0);
  const start = instancePose(mesh("coins")).position;
  assert.ok(Math.abs(start.y - layout.GROUND_Y - 1.05) < 1e-5);
  localTime = 600; pond.update(.6, 0);
  assert.ok(instancePose(mesh("coins")).position.y > start.y, "coin has a visible arc above the hand");
  localTime = 2200; pond.update(2.2, 0);
  assert.equal(mesh("coins").count, 0); assert.equal(mesh("coin-ripples").count, 3);
  const first = instancePose(mesh("coin-ripples"));
  const target = gardenMomentWaterTarget(benchSeats[0].x, benchSeats[0].z);
  assert.ok(Math.hypot(first.position.x - target.x, first.position.z - target.z) < 1e-5, "the actual ripple uses the open-water landing target");
  localTime += 200; pond.update(2.4, 0);
  assert.ok(instancePose(mesh("coin-ripples")).scale.x > first.scale.x);
  pond.apply([event("coin", "late", 3000)], epoch + 2400); pond.update(2.4, 0);
  assert.equal(mesh("coins").count, 0, "late events never replay a fresh throw");
  localTime = 10000; pond.update(10, 0);
  assert.equal(mesh("coin-ripples").count, 0);
  pond.dispose();
});

test("ducks bob gently, appear in reflections, glow only at night and honor expiry", () => {
  const { pond, mesh } = build();
  pond.apply([event("duck", "duck-a", 2000)], epoch); pond.update(2, 0);
  assert.equal(mesh("ducks").count, 1); assert.equal(mesh("ducks").material.emissiveIntensity, 0);
  assert.equal(mesh("duck-halos").material.uniforms.uStrength.value, 0);
  const first = instancePose(mesh("ducks")).position;
  const target = gardenMomentWaterTarget(benchSeats[0].x, benchSeats[0].z);
  assert.ok(Math.hypot(first.x - target.x, first.z - target.z) < .86, "the duck drifts gently around the same open-water target");
  localTime = 500; pond.update(2.5, 1);
  assert.ok(mesh("ducks").material.emissiveIntensity > .3);
  assert.equal(mesh("duck-halos").material.uniforms.uStrength.value, 1);
  assert.ok(Math.abs(instancePose(mesh("ducks")).position.y - first.y) > 1e-5);
  assert.ok(Math.abs(instancePose(mesh("ducks")).position.y - layout.WATER_Y) < .06);
  pond.update(3, 0); assert.equal(mesh("ducks").material.emissiveIntensity, 0);
  localTime = 91000; pond.update(93, 1); assert.equal(mesh("ducks").count, 0);
  pond.dispose();
});

test("stale snapshots cannot rewind events and equal-time launches merge without dropping a neighbor", () => {
  const { pond, mesh } = build();
  const a = event("duck", "a", 2000), b = event("duck", "b", 2000, benchSeats[1]);
  pond.apply([a], epoch); pond.apply([b], epoch); pond.update(1, 0);
  assert.equal(mesh("ducks").count, 2);
  pond.apply([], epoch - 1); pond.update(1, 0); assert.equal(mesh("ducks").count, 2);
  pond.apply([a], epoch + 1000); pond.update(2, 0); assert.equal(mesh("ducks").count, 1);
  pond.dispose();
});

test("untrusted or excessive events stay finite and GPU instances remain bounded", () => {
  const { pond, mesh } = build(true);
  const events = Array.from({ length: 60 }, (_, i) => event(i % 2 ? "duck" : "coin", `event-${i}`, 400));
  events.push({ ...event("duck", "bad"), x: NaN }, { ...event("coin", "future"), startedAt: epoch + 10000 });
  pond.apply(events, epoch); pond.update(NaN, NaN);
  assert.equal(mesh("ducks").count, 24); assert.equal(mesh("coins").count, 12);
  assert.equal(mesh("ducks").material.emissiveIntensity, 0);
  for (const name of ["ducks", "coins", "duck-halos"]) assert.ok(Array.from(mesh(name).instanceMatrix.array).every(Number.isFinite));
  localTime = 2200; pond.update(3, Infinity); assert.ok(mesh("coin-ripples").count <= 36);
  pond.dispose();
});

test("pond ownership disposes geometries, materials and instance buffers once without touching neighbors", () => {
  const { scene, pond } = build();
  const neighbor = new THREE.Sprite(); scene.add(neighbor);
  let neighborDisposed = 0; const onNeighborDispose = () => neighborDisposed++;
  neighbor.geometry.addEventListener("dispose", onNeighborDispose);
  const resources = new Set();
  pond.root.traverse(object => {
    if (!object.isMesh) return;
    resources.add(object.geometry); resources.add(object.material); if (object.isInstancedMesh) resources.add(object);
  });
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  pond.dispose(); pond.dispose(); pond.apply([event("duck", "after")], epoch); pond.update(0, 1);
  assert.ok([...counts.values()].every(count => count === 1)); assert.equal(neighborDisposed, 0);
  assert.equal(scene.children.length, 1); assert.equal(scene.children[0], neighbor);
  neighbor.geometry.removeEventListener("dispose", onNeighborDispose); neighbor.material.dispose();
});
