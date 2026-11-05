import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function loadModule(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed)
    .replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(", ")} };`, context);
  return context.api;
}

const textiles = await loadModule("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const shelters = await loadModule("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "buildShelters", "BED_CAPACITY", "bedSlot", "claimedBedSlot"]);
const { SHELTERS, SHELTER_SEATS, SHELTER_COLLIDERS } = shelters;
const { findClearApproach, findWalkingPath, resolveWalls } = await loadModule("../lib/beach/navigation.ts", {}, ["findClearApproach", "findWalkingPath", "resolveWalls"]);
const { buildNightLights } = await loadModule("../lib/beach/night-lights.ts", { THREE }, ["buildNightLights"]);
const benches = await loadModule("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot", "buildFireBenches"]);
const { Cove, CAMPFIRE } = await loadModule("../lib/beach/cove.ts", { THREE, ...shelters, ...benches, buildNightLights }, ["Cove", "CAMPFIRE"]);
const stargazing = await loadModule("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "claimedStargazingSlot"]);
const { BeachEngine, PLACEMENT } = await loadModule("../lib/beach/engine.ts", {
  THREE, ...shelters, ...stargazing, ...benches, findClearApproach, findWalkingPath, resolveWalls, CAMPFIRE, CHAR_ANIM: { idle: { from: 0, length: 4 }, walk: { from: 4, length: 6 } },
}, ["BeachEngine", "PLACEMENT"]);
const backendSource = await readFile(new URL("../../backend/src/main/java/kr/co/shuim/beach/BeachRoom.java", import.meta.url), "utf8");
const boundValue = (name) => Number(backendSource.match(new RegExp(`\\b${name} = (-?\\d+(?:\\.\\d+)?)`))?.[1]);
const bounds = { minX: boundValue("MIN_X"), maxX: boundValue("MAX_X"), minZ: boundValue("MIN_Z"), maxZ: boundValue("MAX_Z") };
assert.ok(Object.values(bounds).every(Number.isFinite), "BeachRoom publishes finite movement bounds");

const scene = new THREE.Scene();
const obstacles = [];
new Cove(scene, obstacles);
obstacles.push(...PLACEMENT.filter((p) => p.r).map(({ x, z, r }) => ({ x, z, r })), { ...CAMPFIRE, r: 1.35 });

function createWalker(x, z, yaw = Math.PI) {
  const restEvents = [];
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    disposed: false,
    self: { x, z, yaw, moving: false, pitch: 0, bobT: 0 },
    bounds, obstacles, keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, view: "first",
    restSeat: null, returnFromSeat: null, lastRestState: "", eyeHeight: 1.55,
    players: new Map(), skyRest: null, lastStargazingState: "",
    camera: { position: new THREE.Vector3(), rotation: new THREE.Euler(), aspect: 16 / 9 },
    look: { active: false, moved: false },
    sky: { position: new THREE.Vector3() },
    handlers: { onJoystick() {}, onRestChange(value) { restEvents.push(value); } },
  });
  return { engine, restEvents };
}

function walk(engine, frames, yaw) {
  engine.self.yaw = yaw;
  engine.keys = new Set(["w", "Shift"]);
  for (let i = 0; i < frames; i++) engine.updateSelf(0.05);
  engine.keys.clear();
  engine.updateSelf(0.05);
}

test("fire approach avoids real benches from the star circle and all cardinal directions", async () => {
  const starts = [[7, 10.8], [0, 3], [9, 12], [0, 22], [-9, 12]];
  for (const aspect of [390 / 844, 16 / 9]) {
    for (const [x, z] of starts) {
      const { engine } = createWalker(x, z);
      engine.camera.aspect = aspect;
      const arrival = engine.walkToFire();
      const target = engine.auto.path[0];
      const description = `${aspect < 0.75 ? "mobile" : "desktop"} from (${x}, ${z})`;
      const targetRadius = Math.hypot(target.x - CAMPFIRE.x, target.z - CAMPFIRE.z);
      assert.ok(targetRadius >= 3.2 - 1e-8 && targetRadius <= 4.6, `${description} keeps a usable viewing distance`);
      if (aspect < 0.75) assert.ok(Math.abs(targetRadius - 4.2) < 1e-8, `${description} preserves the wider mobile view`);
      for (let i = 0; i <= 100; i++) {
        const px = x + (target.x - x) * i / 100, pz = z + (target.z - z) * i / 100;
        for (const obstacle of obstacles) {
          assert.ok(Math.hypot(px - obstacle.x, pz - obstacle.z) >= obstacle.r + 0.35 - 1e-5, `${description} has a clear route around the benches`);
        }
      }
      for (let frame = 0; frame < 600 && engine.auto; frame++) engine.stepAuto(0.05);
      if (engine.auto) engine.cancelAutoWalk();
      assert.equal(await arrival, "arrived", `${description} arrives without a detour loop`);
      assert.ok(Math.hypot(engine.self.x - CAMPFIRE.x, engine.self.z - CAMPFIRE.z) <= 5, `${description} stays inside the server interaction radius`);
    }
  }
});

test("each ocean-facing shelter and its seats stay inside the server's walkable beach", () => {
  assert.ok(SHELTERS.length >= 3);
  for (const shelter of SHELTERS) {
    assert.ok(shelter.x - shelter.width / 2 > bounds.minX + 0.4);
    assert.ok(shelter.x + shelter.width / 2 < bounds.maxX - 0.4);
    assert.ok(shelter.z - shelter.depth / 2 > bounds.minZ + 0.3);
    assert.ok(shelter.z + shelter.depth / 2 < bounds.maxZ - 0.4);
    const seats = SHELTER_SEATS.filter((seat) => seat.shelterId === shelter.id);
    assert.ok(seats.length > 1);
    for (const seat of seats) {
      assert.equal(seat.yaw, Math.sign(seat.x - shelter.x) * Math.PI / 2, "the two sofas face one another across the lounge");
      assert.ok(Math.abs(seat.x - shelter.x) < shelter.width / 2 - 0.4);
      assert.ok(Math.abs(seat.z - shelter.z) < shelter.depth / 2 - 0.4);
    }
  }
});

test("players enter through the central doorway, reach both sofa aisles and walk back out", () => {
  for (const shelter of SHELTERS) {
    for (const seat of SHELTER_SEATS.filter((candidate) => candidate.shelterId === shelter.id)) {
      const front = shelter.z - shelter.depth / 2;
      const side = Math.sign(seat.x - shelter.x);
      const { engine } = createWalker(shelter.x, front - 0.7);
      walk(engine, 5, Math.PI);
      const entranceZ = engine.self.z;
      assert.ok(entranceZ > front + 0.55 && entranceZ < front + 0.9, "a clear turning space remains between the door and table");
      walk(engine, 9, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      const aisleX = engine.self.x;
      assert.ok(Math.abs(aisleX - shelter.x) > 2.2, "the doorway connects to either side of the coffee table");
      const approachFrames = Math.round((seat.z - entranceZ) / 0.256);
      walk(engine, approachFrames, Math.PI);
      assert.ok(Math.abs(engine.self.z - seat.z) < 0.15, `${seat.id} has a usable entrance`);
      assert.equal(engine.nearbySeat()?.id, seat.id, `${seat.id} can be reached from its entrance`);
      assert.ok(Math.abs(engine.self.x - aisleX) < 1e-8);
      walk(engine, approachFrames, 0);
      walk(engine, 9, side < 0 ? -Math.PI / 2 : Math.PI / 2);
      assert.ok(Math.abs(engine.self.x - shelter.x) < 1e-8);
      walk(engine, 6, 0);
      assert.ok(engine.self.z < front - 0.7, `${seat.id} has a usable exit`);
    }
  }
});

test("sofas, bedside tables and coffee tables are solid while the bed approach stays open", () => {
  for (const shelter of SHELTERS) {
    const bedZ = shelter.z + 1.6, loungeZ = shelter.z - 1.8;
    for (const side of [-1, 1]) {
      const tableX = shelter.x + side * 3.6;
      const { engine } = createWalker(tableX, bedZ + 0.1);
      walk(engine, 6, Math.PI);
      assert.ok(engine.self.z <= bedZ + 0.501, "a bedside table blocks walking through its front");
      const sofa = createWalker(shelter.x + side * 2.25, loungeZ - 2.1).engine;
      walk(sofa, 10, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      assert.ok(Math.abs(sofa.self.x - shelter.x) <= 2.951, "the sofa blocks walking across its cushions");
    }
    const coffee = createWalker(shelter.x, loungeZ - 3.5).engine;
    walk(coffee, 12, Math.PI);
    assert.ok(coffee.self.z <= loungeZ - 2.999, "the coffee table blocks walking through its front");
    const { engine } = createWalker(shelter.x - 2.25, bedZ - 0.95);
    walk(engine, 17, -Math.PI / 2);
    assert.ok(engine.self.x > shelter.x + 2, "guests can cross behind the coffee table to all three bed places");
    assert.ok(Math.abs(engine.self.z - (bedZ - 0.95)) < 1e-8);
  }
});

test("walls and bed frame stop walking at maximum sprint step without sealing the opening", () => {
  for (const shelter of SHELTERS) {
    for (const direction of [-1, 1]) {
      const { engine } = createWalker(shelter.x + direction * 3.8, shelter.z + 0.15);
      walk(engine, 30, direction < 0 ? Math.PI / 2 : -Math.PI / 2);
      assert.ok(Math.abs(engine.self.x - shelter.x) <= shelter.width / 2 - 0.54);
      assert.ok(Math.abs(engine.self.x - shelter.x) > shelter.width / 2 - 0.6, "the side wall itself stops the clear side aisle");
    }
    const bedZ = shelter.z + 1.6;
    const { engine } = createWalker(shelter.x, bedZ - 0.95);
    walk(engine, 30, Math.PI);
    assert.ok(engine.self.z <= bedZ - 0.749, "the bed frame stays solid until the player chooses to lie down");
    let x = shelter.x, z = shelter.z + shelter.depth / 2 + 1;
    for (let i = 0; i < 30; i++) [x, z] = resolveWalls(x, z - 0.256, SHELTER_COLLIDERS);
    assert.ok(z >= shelter.z + shelter.depth / 2 + 0.349, "back wall blocks entry from behind");
  }
});

test("real front windows admit the sea view while their lower walls stop walking through them", () => {
  scene.updateMatrixWorld(true);
  const roomMeshes = scene.children.filter(node => node.name.startsWith("shelters-"));
  for (const shelter of SHELTERS) {
    const front = shelter.z - shelter.depth / 2;
    for (const offset of [-2.8, 0, 2.8]) {
      const view = new THREE.Raycaster(new THREE.Vector3(shelter.x + offset, 1.6, front + 1.5), new THREE.Vector3(0, 0, -1), 0.05, 2);
      assert.equal(view.intersectObjects(roomMeshes, false).length, 0, "door and both actual window openings reveal the beach at eye level");
      if (offset !== 0) {
        const { engine } = createWalker(shelter.x + offset, front - 0.7);
        walk(engine, 8, Math.PI);
        assert.ok(engine.self.z <= front - 0.349, "window sill walls cannot be used as doorways");
      }
    }
  }
});

test("all rear walls remain closed while the outside aisle leads to the cave entrance", () => {
  scene.updateMatrixWorld(true);
  const roomMeshes = scene.children.filter(node => node.name.startsWith("shelters-"));
  for (const house of SHELTERS) {
    const view = new THREE.Raycaster(new THREE.Vector3(house.x + 3.9, 1.6, house.z + house.depth / 2 - 0.6), new THREE.Vector3(0, 0, 1), 0.05, 1.2);
    const hits = view.intersectObjects(roomMeshes, false);
    assert.ok(hits.length > 0, "a continuous timber wall closes the former rear doorway in every house");
    let x = house.x + 3.9, z = house.z + house.depth / 2 - 0.6;
    for (let frame = 0; frame < 8; frame++) [x, z] = resolveWalls(x, z + 0.256, SHELTER_COLLIDERS);
    assert.ok(z <= house.z + house.depth / 2 - 0.549, "the visible rear wall also blocks walking");
  }
  const { engine } = createWalker(6.5, 19);
  walk(engine, 56, Math.PI);
  assert.ok(Math.abs(engine.self.x - 6.5) < 1e-8 && Math.abs(engine.self.z - 33.336) < 1e-8,
    "guests walk between the houses to the external cave mouth without entering a bedroom");
  const atMouth = engine.collide(6.5, 33.5);
  assert.ok(Math.abs(atMouth[0] - 6.5) < 1e-8 && Math.abs(atMouth[1] - 33.5) < 1e-8,
    "the cave threshold remains clear of house walls and restored furniture");
  walk(engine, 56, 0);
  assert.ok(Math.abs(engine.self.x - 6.5) < 1e-8 && Math.abs(engine.self.z - 19) < 1e-8,
    "the same outdoor path provides a clear return to the beach");
});

test("all sofa seats lower the viewpoint, face the lounge and allow getting up or walking away", () => {
  for (const seat of SHELTER_SEATS) {
    const { engine, restEvents } = createWalker(seat.x + Math.sin(seat.yaw) * -1.25, seat.z);
    const start = { x: engine.self.x, z: engine.self.z };
    const standingEye = engine.deckHeight(start.x, start.z) + 1.55;
    engine.toggleRest();
    assert.equal(engine.restSeat.id, seat.id);
    assert.equal(engine.self.x, seat.x);
    assert.equal(engine.self.z, seat.z);
    assert.equal(engine.self.yaw, seat.yaw);
    for (let i = 0; i < 20; i++) engine.updateSelf(0.05);
    assert.ok(engine.camera.position.y < standingEye - 0.2);
    assert.equal(restEvents.at(-1).seated, true);
    engine.toggleRest();
    assert.equal(engine.restSeat, null);
    assert.equal(engine.self.x, start.x);
    assert.equal(engine.self.z, start.z);
    const clear = engine.collide(engine.self.x, engine.self.z);
    assert.equal(clear[0], start.x);
    assert.equal(clear[1], start.z);
    engine.toggleRest();
    walk(engine, 1, 0);
    assert.equal(engine.restSeat, null, "walking automatically gets the player up");
    assert.ok(engine.self.z < start.z);
    assert.equal(restEvents.at(-1).seated, false);
  }
});

test("players cannot sit through the outside side or back walls", () => {
  for (const shelter of SHELTERS) {
    for (const [x, z] of [
      [shelter.x - shelter.width / 2 - 0.1, shelter.z + 0.9],
      [shelter.x + shelter.width / 2 + 0.1, shelter.z + 0.9],
      [shelter.x, shelter.z + shelter.depth / 2 + 0.1],
    ]) {
      const { engine } = createWalker(x, z);
      engine.toggleRest();
      assert.equal(engine.restSeat, null);
      assert.equal(engine.self.x, x);
      assert.equal(engine.self.z, z);
    }
  }
});
