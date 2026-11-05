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
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const resting = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "claimedStargazingSlot", "stargazingBodyPoint"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const bedding = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["claimedBedSlot", "bedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const { CareGestures } = await load("../lib/beach/care-effects.ts", { THREE }, ["CareGestures"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...resting, ...bedding, ...benches, CareGestures, CAMPFIRE: { x: 0, z: 12 },
  cancelAnimationFrame() {}, window: { removeEventListener() {} },
}, ["BeachEngine"]);

function fixture(view = "third") {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 100);
  camera.position.set(0, 1.55, 5); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const fxTex = Object.fromEntries(["heart", "sparkle", "leaf", "glow", "petal"].map(kind => [kind, new THREE.Texture()]));
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    scene, camera, players: new Map(), fxTex, fx: [], careGestures: null,
    disposed: false, view, self: { x: 0, z: 3, yaw: 0, moving: false }, skyRest: null,
    deckHeight: () => 0.18, selfNode: null, lanterns: null, auto: null,
    keys: new Set(), move: { x: 0, y: 0 }, look: { active: false },
    clock: { dispose() {} }, canvas: { removeEventListener() {} }, renderer: { dispose() {} },
  });
  const addPlayer = (pid, x, z, rest) => {
    const node = { data: { pid, pose: "standing", ...rest }, cur: { x, z, yaw: 0 }, bounce: 0 };
    engine.players.set(pid, node);
    return node;
  };
  return { engine, scene, camera, addPlayer };
}

test("confirmed wave animates the sender while acknowledgement sparkles mark the recipient", () => {
  const { engine, scene, addPlayer } = fixture();
  const source = addPlayer("sender", 5, 2), target = addPlayer("recipient", -4, 3);
  engine.playCare("wave", "recipient", "sender");
  const gesture = scene.getObjectByName("care-wave");
  assert.ok(gesture);
  assert.ok(gesture.position.distanceTo(new THREE.Vector3(source.cur.x, 1.21, source.cur.z)) < 1);
  assert.equal(engine.fx.length, 3);
  assert.ok(engine.fx.every(f => Math.abs(f.base.x - target.cur.x) < 0.3));
  engine.updateFx(0.2);
  const firstRotation = gesture.children[0].rotation.z;
  engine.updateFx(0.2);
  assert.notEqual(gesture.children[0].rotation.z, firstRotation, "the hand visibly waves");
  source.cur.x += 2; engine.updateFx(0.1);
  assert.ok(Math.abs(gesture.position.x - source.cur.x) < 0.6, "the greeting follows the moving sender");
  assert.equal(target.bounce, 0, "the recipient is not animated as the sender");
  engine.updateFx(3);
  assert.equal(scene.getObjectByName("care-wave"), undefined);
  assert.equal(engine.fx.length, 0);
});

test("legacy calls remain valid and first-person greetings stay compact", () => {
  const { engine, scene } = fixture("first");
  engine.playCare("wave", null);
  engine.updateFx(0.3);
  const gesture = scene.getObjectByName("care-wave");
  assert.ok(gesture);
  assert.ok(gesture.scale.x <= 0.24);
  assert.ok(gesture.position.distanceTo(engine.camera.position) < 2);
  engine.playCare("comfort", null);
  assert.ok(engine.fx.some(f => f.kind === "leaf"));
  engine.dispose();
});

test("hug wraps a resting body above the duvet without moving the authoritative pose", () => {
  const { engine, scene, camera, addPlayer } = fixture();
  const bed = bedding.bedSlot("hut-pine", 1);
  const target = addPlayer("resting", bed.x, bed.z, { pose: "lying", ...bed });
  const before = { ...target.cur };
  camera.position.set(-13, 2.35, 20.55); camera.lookAt(-13, 0.85, 23.75); camera.updateMatrixWorld();
  engine.playCare("hug", "resting", null); engine.updateFx(0.4);
  const gesture = scene.getObjectByName("care-hug");
  assert.equal(gesture.children.length, 2, "two embracing arcs surround the torso");
  assert.ok(gesture.position.y > 1.06, "the pulse clears the duvet surface");
  assert.ok(gesture.quaternion.angleTo(camera.quaternion) < 1e-8, "the gesture remains readable above flat avatars");
  assert.deepEqual(target.cur, before);
  assert.equal(target.bounce, 0, "lying people do not jump out of their beds");
  assert.equal(engine.fx.filter(f => f.kind === "heart").length, 4);
  const glow = engine.fx.find(f => f.kind === "glow");
  assert.ok(glow.sprite.scale.x < 1.6, "hug glow cannot cover the scene with a large disk");
  engine.updateFx(3);
  assert.equal(scene.getObjectByName("care-hug"), undefined);
  assert.equal(engine.fx.length, 0);
});

test("bursts stay bounded and removing an actor immediately removes its gesture", () => {
  const { engine, scene, addPlayer } = fixture();
  addPlayer("sender", 2, 1); addPlayer("recipient", -2, 1);
  for (let i = 0; i < 12; i++) engine.playCare("wave", "recipient", "sender");
  assert.equal(scene.children.filter(o => o.name === "care-wave").length, 8);
  engine.players.delete("sender"); engine.updateFx(0.01);
  assert.equal(scene.children.filter(o => o.name === "care-wave").length, 0);
  engine.updateFx(3);
  assert.equal(engine.fx.length, 0);
});

test("effect materials expire once, shared geometry survives until disposal, and atlas regions are released", () => {
  const { engine, scene } = fixture();
  const disposed = new Map(), watch = resource => {
    disposed.set(resource, 0);
    resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource) + 1));
  };
  for (const texture of Object.values(engine.fxTex)) watch(texture);
  engine.playCare("wave", null, null); engine.playCare("hug", null, null);
  const materials = new Set();
  scene.traverse(node => {
    if (node.material) materials.add(node.material);
  });
  // Sprite quads are shared by Three itself; the gesture service owns only its four geometries.
  const owned = new Set([engine.careGestures.hand, engine.careGestures.outline, engine.careGestures.marks, engine.careGestures.arc]);
  for (const resource of [...owned, ...materials]) watch(resource);
  engine.updateFx(4);
  for (const material of materials) assert.equal(disposed.get(material), 1);
  for (const resource of [...owned, ...Object.values(engine.fxTex)]) assert.equal(disposed.get(resource), 0);
  engine.dispose();
  for (const resource of [...owned, ...Object.values(engine.fxTex)]) assert.equal(disposed.get(resource), 1);
  assert.equal(scene.children.length, 0);
  engine.playCare("wave", null, null);
  assert.equal(scene.children.length, 0, "a disposed engine cannot create late effects");
});

function gestureAvatar() {
  return { calls: [], playGesture(kind, target) { this.calls.push({ kind, x: target?.x, z: target?.z }); } };
}

test("confirmed care events animate the 3D sender and face the recipient, including local self", () => {
  const { engine, addPlayer } = fixture();
  const source = addPlayer("sender", 5, 2), target = addPlayer("recipient", -4, 3);
  source.avatar = gestureAvatar(); target.avatar = gestureAvatar();
  engine.selfNode = { avatar: gestureAvatar() };
  assert.equal(source.avatar.calls.length, 0, "avatar creation alone does not trigger a social action");
  engine.playCare("wave", "recipient", "sender");
  assert.deepEqual(source.avatar.calls, [{ kind: "wave", x: -4, z: 3 }]);
  assert.equal(target.avatar.calls.length, 0, "the recipient must not wave instead of the sender");
  engine.playCare("hug", "recipient", null);
  assert.deepEqual(engine.selfNode.avatar.calls, [{ kind: "hug", x: -4, z: 3 }]);
  assert.equal(target.avatar.calls.length, 0, "receiving a hug does not initiate another hug");
  engine.playCare("hug", null, "sender");
  assert.deepEqual(source.avatar.calls.at(-1), { kind: "hug", x: 0, z: 3 });
});

test("a vanished hug recipient or disposed engine cannot trigger a 3D social pose", () => {
  const { engine, addPlayer } = fixture();
  const source = addPlayer("sender", 5, 2); source.avatar = gestureAvatar();
  engine.playCare("hug", "missing-recipient", "sender");
  assert.equal(source.avatar.calls.length, 0);
  engine.disposed = true; engine.playCare("wave", null, "sender");
  assert.equal(source.avatar.calls.length, 0);
});
