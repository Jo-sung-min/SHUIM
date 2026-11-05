import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  let source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  // Keep the actual key-handler body; expose its binding without constructing WebGL.
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonKey\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onKey($1) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}

const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry },
  ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot", "buildFireBenches"]);
const resting = await load("../lib/beach/stargazing.ts", { THREE },
  ["STARGAZING", "claimedStargazingSlot", "applyLyingTransform", "stargazingBodyPoint", "stargazingApproach", "stargazingCameraDistance"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const bedding = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles },
  ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "BED_CAPACITY", "claimedBedSlot"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["findClearApproach", "resolveWalls"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...benches, ...resting, ...bedding, ...navigation,
  CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
}, ["BeachEngine"]);
const { FIRE_BENCH_SEATS, FIRE_BENCH_REACH } = benches;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} ≈ ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const claim = slot => ({ pose: "sitting", spotId: "fire-benches", slot, x: -999, z: -999, yaw: -999 });
const remote = (pid, slot, extra = {}) => ({ pid, id: pid, nick: "불멍", skin: 0, moving: true, ...claim(slot), ...extra });

function fixture(aspect = 390 / 844) {
  const states = [], actions = [], views = [];
  const seat = FIRE_BENCH_SEATS[0];
  const camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 520);
  camera.rotation.order = "YXZ";
  const scene = new THREE.Scene(), obstacles = [{ x: 0, z: 12, r: 1.35 }];
  benches.buildFireBenches(scene, obstacles);
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    disposed: false, inputPaused: false, scene, camera, sky: new THREE.Mesh(), followCam: new THREE.Vector3(), followSnap: true,
    self: { x: seat.x - Math.sin(seat.yaw), z: seat.z - Math.cos(seat.yaw), yaw: 0.2, pitch: 0.07, moving: false, bobT: 0 },
    view: "first", mobile: aspect < 0.75, skyRest: null, beforeSkyRest: null, benchSeat: null,
    restSeat: null, returnFromSeat: null, lastRestState: "", lastStargazingState: "", lastBenchState: "", lastBedState: "",
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin: 0, time: 0, nearFire: false,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(), look: { active: false, moved: false },
    bounds: { minX: -22, maxX: 22, minZ: -1, maxZ: 31 }, obstacles,
    handlers: { onSelect() {}, onBenchChange: value => states.push(value), onBenchAction: () => actions.push("request"), onViewChange: view => views.push(view) },
    deckHeight: () => 0, eyeHeight: 1.55,
  });
  engine.selfNode = engine.createSelfAvatar();
  const key = (key, extra = {}) => {
    let prevented = false;
    engine.onKey({ key, type: "keydown", repeat: false, target: null, preventDefault() { prevented = true; }, ...extra });
    return prevented;
  };
  return { engine, scene, camera, states, actions, views, key };
}

test("E only requests a server claim and never seats or moves the player optimistically", () => {
  const { engine, actions, key } = fixture();
  const before = { ...engine.self };
  assert.equal(engine.getBenchState().near, true);
  assert.equal(key("e"), true);
  assert.deepEqual(actions, ["request"]);
  assert.equal(engine.isBenchSeated, false);
  assert.deepEqual(engine.self, before);
  assert.equal(engine.viewMode, "first");
  assert.equal(engine.auto, null);
  key("e", { repeat: true }); key("e", { type: "keyup" });
  key("e", { target: { tagName: "INPUT" } });
  assert.equal(actions.length, 1, "repeats, releases and text entry cannot submit another request");
  engine.inputPaused = true; key("e");
  assert.equal(actions.length, 1, "an open dialog pauses the interaction key");
});

test("a valid claim fixes position and body direction while duplicate ticks preserve the dragged camera", () => {
  const { engine, camera, views } = fixture();
  const seat = FIRE_BENCH_SEATS[3];
  engine.applyRest(claim(3));
  assert.equal(engine.isBenchSeated, true);
  assert.equal(engine.isLying, false);
  assert.deepEqual(views, ["third"]);
  close(engine.self.x, seat.x); close(engine.self.z, seat.z); close(engine.self.yaw, seat.yaw);
  engine.orbitYaw += 0.7; engine.self.pitch = 0.2;
  engine.updateSelf(0.1);
  const yaw = engine.orbitYaw, beforeCamera = camera.position.clone(), rotation = camera.quaternion.clone();
  engine.applyRest(claim(3)); engine.updateSelf(0.1);
  close(engine.orbitYaw, yaw); close(engine.self.yaw, seat.yaw); close(engine.self.pitch, 0.2);
  assert.ok(beforeCamera.distanceTo(camera.position) < 1e-6 && rotation.angleTo(camera.quaternion) < 1e-6);
  close(engine.getSelf().yaw, seat.yaw, "camera dragging never changes the body's server yaw");
  assert.equal(engine.getSelf().moving, false);
  engine.setView("first"); engine.updateSelf(0.1);
  close(camera.position.x, seat.x); close(camera.position.z, seat.z); close(camera.position.y, 1.3);
  assert.equal(engine.selfNode.sprite.visible, false);
  assert.equal(camera.layers.mask, 1, "sitting keeps beach geometry visible, including the fire");
});

test("standing uses the confirmed safe return position once and restores normal movement", () => {
  const { engine, key, actions } = fixture();
  const before = { ...engine.self };
  engine.applyRest(claim(0));
  engine.updateSelf(0.1);
  key("Escape");
  assert.equal(actions.length, 1);
  assert.equal(engine.isBenchSeated, true, "Escape requests standing but cannot release the server seat locally");
  engine.applyRest({ pose: "standing", x: NaN, z: before.z, yaw: 0 });
  assert.equal(engine.isBenchSeated, true, "an invalid return position cannot corrupt a valid seat");
  const stand = { pose: "standing", spotId: null, slot: null, x: before.x, z: before.z, yaw: 0.3 };
  engine.applyRest(stand); engine.updateSelf(0.1);
  assert.equal(engine.isBenchSeated, false);
  close(engine.self.x, before.x); close(engine.self.z, before.z); close(engine.self.pitch, before.pitch);
  close(engine.eyeHeight, 1.55);
  assert.equal(engine.selfNode.sprite.geometry.userData.seated, false);
  engine.setMove(0, 1); engine.updateSelf(0.1);
  assert.ok(Math.hypot(engine.self.x - before.x, engine.self.z - before.z) > 0.2);
  const afterMove = { ...engine.self };
  engine.applyRest(stand);
  assert.deepEqual(engine.self, afterMove, "ordinary standing ticks cannot snap the player back");
});

test("confirmation cancels an active walk and seated keyboard, joystick and new walks cannot move the player", async () => {
  const { engine, key } = fixture();
  const walk = engine.walkToFire();
  assert.ok(engine.auto);
  engine.keys.add("w"); engine.setMove(1, 1);
  engine.applyRest(claim(0));
  assert.equal(await walk, "cancelled");
  assert.equal(engine.auto, null);
  assert.equal(engine.keys.size, 0);
  assert.deepEqual(plain(engine.move), { x: 0, y: 0 });
  key("w"); assert.equal(key("ArrowUp"), true);
  engine.setMove(1, 1);
  // Even stale input from a previous frame cannot move an authoritative seated pose.
  engine.keys.add("w"); engine.move = { x: 1, y: 1 };
  for (let frame = 0; frame < 10; frame++) engine.updateSelf(0.05);
  close(engine.self.x, FIRE_BENCH_SEATS[0].x); close(engine.self.z, FIRE_BENCH_SEATS[0].z);
  assert.equal(engine.self.moving, false);
  assert.equal(await engine.walkToFire(), "cancelled");
  assert.equal(await engine.walkToStargazing(), "cancelled");
  assert.equal(await engine.walkToBed("hut-pine"), "cancelled");
  assert.equal(engine.auto, null);
});

test("remote sit/stand transitions preserve head proportions and restore every standing vertex", () => {
  const { engine, camera } = fixture();
  const seat = FIRE_BENCH_SEATS[7];
  engine.setPlayers([remote("guest", 7, { pose: "standing", spotId: null, slot: null, x: seat.x, z: seat.z, yaw: seat.yaw, moving: false })]);
  engine.updatePlayers(1);
  const node = engine.players.get("guest"), original = node.sprite.geometry.getAttribute("position").array.slice();
  engine.setPlayers([remote("guest", 7)]); node.bounce = 0.5;
  engine.updatePlayers(1);
  close(node.cur.x, seat.x); close(node.cur.z, seat.z); close(node.cur.yaw, seat.yaw);
  assert.equal(node.target.moving, false);
  assert.equal(node.sprite.geometry.userData.seated, true);
  close(node.sprite.position.y, 0, "care bounce cannot lift a seated avatar off the bench");
  const positions = node.sprite.geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    if (original[i * 3 + 1] < 0.9) continue;
    close(positions.getX(i), original[i * 3], "head and torso width stays untouched");
    close(positions.getY(i) - original[i * 3 + 1], -0.2, "upper-body pixels translate together without shrinking");
  }
  camera.position.set(seat.x + 5, 2, seat.z); engine.updatePlayers(0.1);
  close(node.cur.yaw, seat.yaw, "remote body continues facing the fire when its billboard turns");
  engine.setPlayers([remote("guest", 7, { pose: "standing", spotId: null, slot: null, x: seat.x + 1, z: seat.z, yaw: 0, moving: false })]);
  engine.updatePlayers(1);
  assert.equal(node.sprite.geometry.userData.seated, false);
  const standingPositions = node.sprite.geometry.getAttribute("position");
  for (let i = 0; i < original.length; i++) close(standingPositions.array[i], original[i], "standing restores the original geometry");
  assert.equal(node.shadow.visible, true);
});

test("occupancy deduplicates valid claims and availability reflects only seats within reach", () => {
  const { engine, states } = fixture();
  const nearby = FIRE_BENCH_SEATS.filter(seat => Math.hypot(engine.self.x - seat.x, engine.self.z - seat.z) <= FIRE_BENCH_REACH);
  assert.ok(nearby.length > 0 && nearby.length < 12);
  const players = nearby.map(seat => remote(`guest-${seat.slot}`, seat.slot));
  players.push(remote("duplicate", nearby[0].slot));
  players.push(remote("invalid", 99, { x: 20, z: 20, yaw: 0 }));
  engine.setPlayers(players);
  let state = engine.getBenchState();
  assert.equal(state.occupied, nearby.length);
  assert.equal(state.capacity, 12);
  assert.equal(state.near, true);
  assert.equal(state.available, false, "a free seat across the fire does not falsely enable nearby seating");
  const freed = nearby.at(-1).slot;
  engine.setPlayers(players.filter(player => player.slot !== freed));
  state = engine.getBenchState();
  assert.equal(state.available, true);
  assert.equal(states.at(-1).available, true);
  engine.applyRest(claim(freed));
  assert.equal(engine.getBenchState().occupied, nearby.length, "the local confirmed seat counts once");
  engine.applyRest({ pose: "standing", x: 20, z: 2, yaw: 0 });
  state = engine.getBenchState();
  assert.equal(state.near, false);
  assert.equal(state.available, false);
});

test("all twelve third-person seats keep the avatar and fire inside phone and desktop framing", () => {
  for (const aspect of [320 / 844, 390 / 844, 1920 / 1080]) {
    const { engine, camera, scene } = fixture(aspect);
    for (const seat of FIRE_BENCH_SEATS) {
      engine.applyRest(claim(seat.slot)); engine.updateSelf(0.1);
      scene.updateMatrixWorld(true); camera.updateMatrixWorld();
      const points = [new THREE.Vector3(0, 0.2, 12), new THREE.Vector3(0, 3, 12)];
      const avatar = engine.selfNode.sprite, positions = avatar.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(avatar.matrixWorld));
      for (const point of points) {
        const projected = point.project(camera);
        assert.ok(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95 && projected.z > -1 && projected.z < 1,
          `slot ${seat.slot} keeps fire and full character in frame at aspect ${aspect}: ${projected.toArray()}`);
      }
    }
  }
});

test("malformed sitting claims leave standing or already-seated state untouched", () => {
  const { engine } = fixture();
  const malformed = [claim(-1), claim(12), claim(0.5), claim(NaN), { ...claim(0), slot: "0" },
    { ...claim(0), spotId: "hut-pine" }, { ...claim(0), pose: "lying" }, { pose: "sitting" }];
  const before = { ...engine.self };
  for (const state of malformed) engine.applyRest(state);
  assert.deepEqual(engine.self, before);
  assert.equal(engine.isBenchSeated, false);
  engine.applyRest(claim(5));
  const seated = { ...engine.self };
  for (const state of malformed) engine.applyRest(state);
  assert.equal(engine.isBenchSeated, true);
  assert.deepEqual(engine.self, seated);
});
