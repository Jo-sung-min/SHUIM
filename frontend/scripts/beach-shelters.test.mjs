import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

async function loadModule(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed)
    .replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(", ")} };`, context);
  return context.api;
}

const shelters = await loadModule("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "buildShelters"]);
const { SHELTERS, SHELTER_SEATS, SHELTER_COLLIDERS } = shelters;
const { resolveWalls } = await loadModule("../lib/beach/navigation.ts", {}, ["resolveWalls"]);
const { Cove, CAMPFIRE } = await loadModule("../lib/beach/cove.ts", { THREE, ...shelters }, ["Cove", "CAMPFIRE"]);
const { BeachEngine, PLACEMENT } = await loadModule("../lib/beach/engine.ts", {
  THREE, ...shelters, resolveWalls, CAMPFIRE, CHAR_FRAME: { walk1: 1, idle: 0, walk2: 2 },
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
    disposed: false,
    self: { x, z, yaw, moving: false, pitch: 0, bobT: 0 },
    bounds, obstacles, keys: new Set(), joy: { active: false, x: 0, y: 0 },
    restSeat: null, returnFromSeat: null, lastRestState: "", eyeHeight: 1.55,
    camera: { position: new THREE.Vector3(), rotation: new THREE.Euler() },
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
      assert.equal(seat.yaw, 0, "resting faces the ocean at negative Z");
      assert.ok(Math.abs(seat.x - shelter.x) < shelter.width / 2 - 0.4);
      assert.ok(Math.abs(seat.z - shelter.z) < shelter.depth / 2 - 0.4);
    }
  }
});

test("players can enter every shelter through its open front and walk back out", () => {
  for (const shelter of SHELTERS) {
    for (const seat of SHELTER_SEATS.filter((candidate) => candidate.shelterId === shelter.id)) {
      const front = shelter.z - shelter.depth / 2;
      const { engine } = createWalker(seat.x, front - 0.7);
      walk(engine, 10, Math.PI);
      assert.ok(engine.self.z > front + 1.5, `${seat.id} has a usable entrance`);
      assert.ok(engine.nearbySeat(), `${seat.id} can be reached from its entrance`);
      assert.ok(Math.abs(engine.self.x - seat.x) < 1e-8);
      walk(engine, 12, 0);
      assert.ok(engine.self.z < front - 0.7, `${seat.id} has a usable exit`);
    }
  }
});

test("walls and benches stop walking at maximum sprint step without sealing the opening", () => {
  for (const shelter of SHELTERS) {
    for (const direction of [-1, 1]) {
      const { engine } = createWalker(shelter.x, shelter.z - 0.3);
      walk(engine, 30, direction < 0 ? Math.PI / 2 : -Math.PI / 2);
      assert.ok(Math.abs(engine.self.x - shelter.x) <= shelter.width / 2 - 0.54);
    }
    const { engine } = createWalker(shelter.x, shelter.z - 0.3);
    walk(engine, 30, Math.PI);
    assert.ok(engine.self.z < shelter.z + 0.25, "bench stays solid until the player chooses to sit");
    let x = shelter.x, z = shelter.z + shelter.depth / 2 + 1;
    for (let i = 0; i < 30; i++) [x, z] = resolveWalls(x, z - 0.256, SHELTER_COLLIDERS);
    assert.ok(z >= shelter.z + shelter.depth / 2 + 0.349, "back wall blocks entry from behind");
  }
});

test("all seats lower the viewpoint toward the ocean and allow getting up or walking away", () => {
  for (const seat of SHELTER_SEATS) {
    const { engine, restEvents } = createWalker(seat.x, seat.z - 1.05);
    const start = { x: engine.self.x, z: engine.self.z };
    const standingEye = engine.deckHeight(start.x, start.z) + 1.55;
    engine.toggleRest();
    assert.equal(engine.restSeat.id, seat.id);
    assert.equal(engine.self.x, seat.x);
    assert.equal(engine.self.z, seat.z);
    assert.equal(engine.self.yaw, 0);
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
