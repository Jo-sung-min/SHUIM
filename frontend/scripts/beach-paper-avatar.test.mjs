import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";
import * as sparklerTiming from "../lib/beach/sparkler-timing.ts";

const typed = await readFile(new URL("../lib/beach/paper-avatar.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const state = (extra = {}) => ({ x: 0, z: 0, yaw: 0, moving: false, visible: true, ...extra });
function texture() { return new THREE.Texture({ width: 512, height: 672 }); }
function runtime(load = () => Promise.resolve(texture()), { clock = Date.now } = {}) {
  const requests = [];
  class Loader { loadAsync(url) { requests.push(url); return load(url); } }
  const context = { THREE: { ...THREE, TextureLoader: Loader }, Date: { now: clock }, ...assets, ...sparklerTiming };
  vm.runInNewContext(`${source}\nglobalThis.api = { PaperAvatarModels, PaperAvatar, PAPER_AVATAR_HEIGHT, PAPER_AVATAR_DEPTH };`, context);
  return { ...context.api, requests };
}
async function ready(options) {
  const api = runtime(undefined, options), pool = new api.PaperAvatarModels(options?.camera);
  await pool.load();
  assert.equal(pool.ready, true);
  return { api, pool, actor: pool.create() };
}
function countDisposals(resource) { let count = 0; resource.addEventListener("dispose", () => count++); return () => count; }
function finiteActor(actor) {
  actor.root.updateMatrixWorld(true);
  assert.ok(actor.root.matrixWorld.elements.every(Number.isFinite));
  const vertex = new THREE.Vector3();
  actor.root.traverse(object => {
    if (!object.isMesh) return;
    for (let i = 0; i < object.geometry.attributes.position.count; i += 31) {
      object.getVertexPosition(i, vertex).applyMatrix4(object.matrixWorld);
      assert.ok(vertex.toArray().every(Number.isFinite));
    }
  });
}

test("four picture downloads and immutable geometry serve a crowd, with separate animation weights", async () => {
  const api = runtime(), pool = new api.PaperAvatarModels();
  assert.equal(pool.create(), null);
  const first = pool.load(), duplicate = pool.load();
  assert.equal(first, duplicate);
  await first;
  const actors = Array.from({ length: 100 }, () => pool.create());
  assert.deepEqual(api.requests, ["front", "left", "back", "right"].map(view => assets.assetUrl(`/characters/mongsil/${view}-v1.webp`)));
  const front = actors[0].root.getObjectByName("paper-front");
  for (const actor of actors) {
    const other = actor.root.getObjectByName("paper-front");
    assert.equal(other.geometry, front.geometry);
    assert.equal(other.material, front.material);
    if (actor !== actors[0]) assert.notEqual(other.morphTargetInfluences, front.morphTargetInfluences);
  }
  actors[0].playGesture("wave");
  for (let i = 0; i < 6; i++) actors[0].update(.1, state());
  assert.ok(front.morphTargetInfluences[0] > .5);
  assert.equal(actors[1].root.getObjectByName("paper-front").morphTargetInfluences[0], 0);
  pool.dispose();
});

test("all four directional pictures retain their width through a complete camera orbit", async () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 50);
  const { pool, actor, api } = await ready({ camera });
  const current = state({ yaw: Math.PI });
  const expected = [[0, "front"], [Math.PI / 2, "left"], [Math.PI, "back"], [-Math.PI / 2, "right"]];
  for (const [angle, name] of expected) {
    camera.position.set(Math.sin(angle) * 6, 1, Math.cos(angle) * 6); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
    actor.update(0, current);
    const visible = actor.meshes.filter(mesh => mesh.visible);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].name, `paper-${name}`);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(visible[0].matrixWorld);
    assert.ok(normal.dot(new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle))) > .999);
    const a = visible[0].localToWorld(new THREE.Vector3(-.6, .8, 0)).project(camera);
    const b = visible[0].localToWorld(new THREE.Vector3(.6, .8, 0)).project(camera);
    assert.ok(Math.abs(b.x - a.x) > .4, "the illustrated body never turns edge-on");
    assert.equal(visible[0].material.toneMapped, false);
    assert.equal(visible[0].material.transparent, false);
    assert.equal(visible[0].material.depthWrite, true);
    assert.equal(visible[0].material.alphaTest, .12);
    assert.equal(visible[0].castShadow, false);
    assert.ok(Math.abs(visible[0].geometry.attributes.position.getY(0) - api.PAPER_AVATAR_HEIGHT) < 1e-6);
  }
  assert.equal(actor.root.getObjectByName("paper-edge"), undefined);
  assert.equal(new Set(actor.meshes.map(mesh => mesh.material.map)).size, 4);
  pool.dispose();
});

test("view selection uses character world direction and a stable eight-degree boundary margin", async () => {
  const camera = new THREE.PerspectiveCamera(), { pool, actor } = await ready({ camera });
  const at = degrees => { const angle = degrees * Math.PI / 180; camera.position.set(Math.sin(angle) * 5, 1, Math.cos(angle) * 5); camera.updateMatrixWorld(true); };
  at(0); actor.update(0, state({ yaw: Math.PI })); assert.equal(actor.view, "front");
  for (const degrees of [44, 47, 43, 51]) { at(degrees); actor.update(0, state({ yaw: Math.PI })); assert.equal(actor.view, "front"); }
  at(55); actor.update(0, state({ yaw: Math.PI })); assert.equal(actor.view, "left");
  for (const degrees of [48, 44, 39]) { at(degrees); actor.update(0, state({ yaw: Math.PI })); assert.equal(actor.view, "left"); }
  at(35); actor.update(0, state({ yaw: Math.PI })); assert.equal(actor.view, "front");
  at(0); actor.update(0, state({ yaw: 0 })); assert.equal(actor.view, "back", "rotating the person reverses the visible side");
  at(90); actor.update(0, state({ yaw: 0 })); assert.equal(actor.view, "right");
  actor.update(0, state({ lying: { x: 0, z: 0, yaw: .3, avatarY: .1 } }));
  assert.equal(actor.view, "front");
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(actor.root.getObjectByName("paper-front").matrixWorld);
  assert.ok(normal.y > .999, "lying art faces the sky instead of following the camera upright");
  pool.dispose();
});
test("foot, short seated legs and face-up lying pose remain finite and use canonical map heights", async () => {
  const { pool, actor, api } = await ready();
  actor.update(0, state({ x: 3, z: -5, y: 2.8, yaw: 0 }));
  assert.equal(actor.root.position.y, 2.8);
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
  assert.ok(direction.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);
  const pose = actor.root.getObjectByName("paper-avatar-pose");
  for (let i = 0; i < 8; i++) actor.update(.1, state({ seated: { x: 2, z: 4, yaw: .7, avatarY: 1.12 } }));
  const hip = pose.localToWorld(new THREE.Vector3(0, .25, 0));
  assert.ok(Math.abs(hip.y - 1.12) < 1e-8, "breathing does not make the body float off its seat");
  assert.equal(actor.root.position.x, 2);
  actor.update(.1, state({ lying: { x: 4, z: 9, yaw: .3, avatarY: 1.4 } }));
  const backContact = pose.localToWorld(new THREE.Vector3(0, .8, -api.PAPER_AVATAR_DEPTH / 2));
  assert.ok(Math.abs(backContact.y - 1.412) < 1e-8, "lying art has a tiny separation from the mat to avoid flickering");
  actor.update(.1, state({ lying: { x: 4, z: 9, yaw: .3, avatarY: 1.4, incline: .3, roll: .07 } }));
  finiteActor(actor);
  actor.update(Number.NaN, state({ moving: true })); finiteActor(actor);
  actor.update(1, state({ x: Number.NaN }));
  assert.equal(actor.root.visible, false);
  assert.equal(actor.getSparklerGrip(), null);
  pool.dispose();
});

test("walking is gentle, gestures replay, and shared vertices never accumulate deformation", async () => {
  const { pool, actor } = await ready();
  const mesh = actor.root.getObjectByName("paper-front"), before = Array.from(mesh.geometry.attributes.position.array);
  let highest = 0, rotation = 0;
  for (let i = 0; i < 30; i++) {
    actor.update(.05, state({ moving: true }));
    const pose = actor.root.getObjectByName("paper-avatar-pose");
    highest = Math.max(highest, pose.position.y); rotation = Math.max(rotation, Math.abs(pose.rotation.z));
  }
  assert.ok(highest > .01 && highest < .03);
  assert.ok(rotation > .02 && rotation < .05);
  for (const kind of ["wave", "hug"]) {
    actor.playGesture(kind);
    for (let i = 0; i < 6; i++) actor.update(.1, state());
    const index = kind === "wave" ? 0 : 1;
    assert.ok(mesh.morphTargetInfluences[index] > .5);
    actor.playGesture(kind); actor.update(0, state());
    assert.equal(mesh.morphTargetInfluences[index], 0, "replay starts its own entrance");
    for (let i = 0; i < 26; i++) actor.update(.1, state());
    assert.equal(mesh.morphTargetInfluences[index], 0, "finished action returns to original art");
  }
  assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), before);
  finiteActor(actor); pool.dispose();
});

test("sparkler returns the illustrated palm, moves within its arm range and keeps first-person hidden", async () => {
  const { pool, actor } = await ready();
  assert.equal(actor.getSparklerGrip(), null);
  const current = state({ x: 3, z: 4, y: 2.8, yaw: .4, visible: false });
  actor.update(0, current);
  const neutral = actor.getSparklerGrip();
  const target = new THREE.Vector3(100, 200, -300), original = target.clone();
  const actual = actor.poseSparkler(target, 2);
  assert.ok(actual.distanceTo(neutral) > .2 && actual.distanceTo(neutral) < .7);
  assert.ok(actual.distanceTo(target) > 100, "caller cannot teleport the illustrated hand");
  assert.ok(actual.distanceTo(actor.getSparklerGrip()) < 1e-9);
  assert.ok(target.equals(original));
  assert.equal(actor.root.visible, false);
  // Action weights stay synchronized when a camera orbit selects another picture.
  const meshes = ["paper-front", "paper-back", "paper-left", "paper-right"].map(name => actor.root.getObjectByName(name));
  assert.deepEqual(meshes[0].morphTargetInfluences, meshes[1].morphTargetInfluences);
  assert.deepEqual(meshes[0].morphTargetInfluences, meshes[2].morphTargetInfluences);
  const front = meshes[0], hand = actor.template.frames.front.hand, vertex = new THREE.Vector3();
  let nearest = -1, distance = Infinity;
  for (let i = 0; i < front.geometry.attributes.position.count; i++) {
    vertex.fromBufferAttribute(front.geometry.attributes.position, i);
    if (vertex.distanceTo(hand) < distance) { distance = vertex.distanceTo(hand); nearest = i; }
  }
  front.getVertexPosition(nearest, vertex).applyMatrix4(front.matrixWorld);
  assert.ok(vertex.distanceTo(actual) < .05, "prop is attached to the rendered hand vertices");
  actor.update(0, current);
  assert.ok(actor.getSparklerGrip().distanceTo(neutral) < 1e-8, "next update resets prop pose without drift");
  for (const extra of [{ moving: true }, { seated: { x: 0, z: 0, yaw: 0, avatarY: .5 } }, { lying: { x: 0, z: 0, yaw: 0 } }]) {
    actor.update(0, state(extra)); assert.equal(actor.poseSparkler(target, 2), null);
  }
  actor.update(0, state());
  for (const age of [-1, NaN, Infinity, sparklerTiming.SPARKLER_RELEASE_END]) assert.equal(actor.poseSparkler(target, age), null);
  assert.equal(actor.poseSparkler(new THREE.Vector3(NaN, 0, 0), 1), null);
  finiteActor(actor); pool.dispose();
});

test("standing gestures face their partner while walking and reserved seating keep their authoritative facing", async () => {
  const { pool, actor } = await ready();
  for (const kind of ["wave", "hug"]) {
    actor.playGesture(kind, { x: 6, z: 4 });
    actor.update(.1, state({ x: 3, z: 4, yaw: .2 }));
    assert.ok(Math.abs(actor.root.rotation.y - Math.PI / 2) < 1e-8);
    actor.update(.1, state({ x: 3, z: 4, yaw: .2, moving: true }));
    assert.ok(Math.abs(actor.root.rotation.y - (.2 + Math.PI)) < 1e-8);
    actor.update(.1, state({ seated: { x: 3, z: 4, yaw: .7, avatarY: .6 } }));
    assert.ok(Math.abs(actor.root.rotation.y - (.7 + Math.PI)) < 1e-8);
  }
  actor.playGesture("wave", { x: NaN, z: Infinity });
  actor.update(.1, state()); finiteActor(actor);
  pool.dispose();
});

test("each profile and the back attach props to their own painted palm after camera rotation", async () => {
  const camera = new THREE.PerspectiveCamera(), { pool, actor } = await ready({ camera });
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    camera.position.set(Math.sin(angle) * 6, 1, Math.cos(angle) * 6); camera.updateMatrixWorld(true);
    actor.update(0, state({ yaw: Math.PI }));
    const neutral = actor.getSparklerGrip();
    const actual = actor.poseSparkler(new THREE.Vector3(1, 1.5, 1), 2);
    assert.ok(actual.distanceTo(neutral) < .8);
    const mesh = actor.meshes.find(candidate => candidate.visible), hand = actor.template.frames[actor.view].hand;
    const point = new THREE.Vector3(); let nearest = 0, best = Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      point.fromBufferAttribute(mesh.geometry.attributes.position, i);
      if (point.distanceTo(hand) < best) { best = point.distanceTo(hand); nearest = i; }
    }
    mesh.getVertexPosition(nearest, point).applyMatrix4(mesh.matrixWorld);
    assert.ok(point.distanceTo(actual) < .07, `${actor.view} palm follows its actual visible vertices`);
    finiteActor(actor);
  }
  pool.dispose();
});

test("an individual actor never disposes shared assets; the pool detaches every actor and releases each resource once", async () => {
  const { pool, actor } = await ready(), second = pool.create(), scene = new THREE.Scene();
  scene.add(actor.root, second.root);
  const resources = [...Object.values(actor.template.frames).flatMap(frame => [frame.geometry, frame.material]), ...actor.template.textures];
  const counts = resources.map(countDisposals);
  actor.dispose(); actor.dispose();
  assert.equal(scene.children.length, 1);
  assert.ok(counts.every(count => count() === 0));
  second.update(.1, state()); finiteActor(second);
  pool.dispose(); pool.dispose();
  assert.equal(scene.children.length, 0);
  assert.ok(counts.every(count => count() === 1));
  assert.equal(pool.ready, false); assert.equal(pool.canLoad, false); assert.equal(pool.create(), null);
  assert.equal(second.getSparklerGrip(), null);
});

test("partial download failure disposes successful images and retries only after the cooldown", async () => {
  let now = 0, fail = true, disposed = 0;
  const api = runtime(url => {
    if (url.includes("back") && fail) return Promise.reject(new Error("offline"));
    const result = texture(); result.addEventListener("dispose", () => disposed++); return Promise.resolve(result);
  }, { clock: () => now });
  const pool = new api.PaperAvatarModels();
  await pool.load();
  assert.equal(disposed, 3); assert.equal(pool.ready, false); assert.equal(pool.canLoad, false);
  await pool.load(); assert.equal(api.requests.length, 4);
  now = 5000; fail = false;
  assert.equal(pool.canLoad, true);
  await pool.load(); assert.equal(pool.ready, true); assert.equal(api.requests.length, 8);
  pool.dispose(); assert.equal(disposed, 7);
});

test("late downloads after leaving close images and release textures without resurrecting the pool", async () => {
  const resolve = [], images = [], textures = [];
  const api = runtime(() => new Promise(done => resolve.push(done))), pool = new api.PaperAvatarModels();
  const pending = pool.load();
  await Promise.resolve();
  pool.dispose();
  for (const done of resolve) {
    let closed = 0; const image = { width: 512, height: 672, close: () => closed++ };
    const value = new THREE.Texture(image); images.push(() => closed); textures.push(countDisposals(value)); done(value);
  }
  await pending;
  assert.equal(pool.ready, false); assert.equal(pool.create(), null);
  assert.ok(images.every(count => count() === 1)); assert.ok(textures.every(count => count() === 1));
});

test("directional artwork needs no canvas readback and uses only one visible draw", async () => {
  const { pool, actor } = await ready();
  assert.equal(actor.root.getObjectByName("paper-edge"), undefined);
  assert.ok(actor.root.getObjectByName("paper-front")); assert.ok(actor.root.getObjectByName("paper-back"));
  assert.equal(actor.meshes.filter(mesh => mesh.visible).length, 1);
  actor.update(.1, state()); finiteActor(actor); pool.dispose();
});
