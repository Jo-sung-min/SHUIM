import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  let source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonPointerMove\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onPointerMove($1) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const stars = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "claimedStargazingSlot", "stargazingBodyPoint", "stargazingCameraDistance", "applyLyingTransform"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const huts = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "BED_CAPACITY", "claimedBedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const effects = [];
class EffectsSpy {
  constructor(scene, options) { this.scene = scene; this.options = options; this.applied = []; this.updated = []; this.disposed = 0; effects.push(this); }
  apply(events, serverTime) { this.applied.push({ events, serverTime }); }
  update(camera) { this.updated.push(camera); }
  dispose() { this.disposed++; }
}
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...stars, ...huts, ...benches, CAMPFIRE: { x: 0, z: 12 }, performance,
  BeachFireworks: EffectsSpy, cancelAnimationFrame() {}, window: { removeEventListener() {} },
  document: { createElement: () => ({ getContext: () => null }) },
}, ["BeachEngine"]);
const { ONSEN_SEATS, ONSEN_FLOATS, onsenFloatingY, HOT_SPRING } = hotSpring;
const plain = value => JSON.parse(JSON.stringify(value));
const close = (a, b, message = `${a} ≈ ${b}`) => assert.ok(Math.abs(a - b) < 1e-6, message);
const claim = (slot, pose) => ({ ...slot, pose });
const standing = { pose: "standing", spotId: null, slot: null, x: 0, z: 45, yaw: 0.3 };

function pool(kind) {
  return { ready: true, canLoad: true, create() {
    const root = new THREE.Group();
    return { kind, root, states: [], update(dt, state) { this.states.push({ dt, ...state }); root.visible = state.visible; }, dispose() { root.removeFromParent(); } };
  }, dispose() {} };
}
function fixture(skin = 0) {
  const changes = [], camera = new THREE.PerspectiveCamera(78, 390 / 844, 0.1, 520);
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null, sparklerActors: new Map(), momentOwnPid: null,
    scene: new THREE.Scene(), camera, sky: new THREE.Mesh(), followCam: new THREE.Vector3(), followSnap: true,
    self: { x: 0, z: 45, yaw: 0.2, pitch: 0.07, moving: false, bobT: 0 }, view: "first", mobile: false,
    skyRest: null, onsenSeat: null, benchSeat: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null,
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin, time: 0, nearFire: false, eyeHeight: 18.4,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(), look: { active: false },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }), removeEventListener() {} },
    handlers: { onSelect() {}, onOnsenChange: state => changes.push(plain(state)) },
    avatarModels: pool("male"), femaleAvatarModels: pool("female"),
    onsenAvatarModels: pool("male-onsen"), onsenAvatarReady: true, onsenAvatarRequested: true,
    femaleOnsenAvatarModels: pool("female-onsen"), femaleOnsenAvatarReady: true, femaleOnsenAvatarRequested: true,
    fireworks: null, fx: [], clock: { dispose() {} }, renderer: { domElement: { height: 900 }, dispose() {} },
  });
  engine.selfNode = engine.createSelfAvatar();
  return { engine, camera, changes };
}
function visitor(id, slot, pose, skin = 0) {
  // Deliberately conflicting x/z/moving checks that claims, not stale movement, anchor the actor.
  return { pid: id, nick: id, skin, yaw: 1.1, moving: true, ...claim(slot, pose), ...(pose === "lying" ? {} : { x: 0, z: 3 }) };
}

test("onsen controls follow water, 2.2m reach and occupied slots without claiming a place", () => {
  const { engine, changes } = fixture();
  assert.equal(engine.onsenState.inWater, true);
  assert.equal(engine.onsenState.canSit, false);
  assert.equal(engine.onsenState.canFloat, true);
  Object.assign(engine.self, { x: 6, z: 45 });
  assert.equal(engine.onsenState.inWater, false);
  assert.equal(engine.onsenState.canFloat, false);
  Object.assign(engine.self, { x: ONSEN_SEATS[0].x, z: ONSEN_SEATS[0].z });
  assert.equal(engine.onsenState.canSit, true);
  const occupants = ONSEN_SEATS.map((s, i) => visitor(`seat-${i}`, s, "sitting"));
  engine.setPlayers([...occupants, visitor("duplicate", ONSEN_SEATS[0], "sitting"), visitor("wrong-pose", ONSEN_FLOATS[0], "sitting")]);
  assert.deepEqual(plain(engine.onsenState.occupiedSeats), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(plain(engine.onsenState.occupiedFloats), []);
  assert.equal(engine.onsenState.canSit, false);
  const count = changes.length; engine.updateOnsenState(); engine.updateOnsenState();
  assert.equal(changes.length, count, "stable frames do not rerender the controls");
  assert.equal(engine.fixedSeat, null); assert.equal(engine.skyRest, null);
  Object.assign(engine.self, { x: 0, z: 41.1 });
  assert.equal(engine.onsenState.canFloat, true, "any free place in this bath will do");
  engine.setPlayers([0, 1, 2].map((slot) => visitor(`float-${slot}`, ONSEN_FLOATS[slot], "lying")));
  assert.equal(engine.onsenState.canFloat, false, "a full bath offers nothing");
});

test("confirmed onsen seats pin both genders to the stone ledge, preserve view and release on standing", async () => {
  for (const skin of [0, 3]) for (const seat of ONSEN_SEATS) {
    const { engine, camera } = fixture(skin);
    engine.applyRest(claim(seat, "sitting"));
    assert.equal(engine.onsenState.sitting, true); assert.equal(engine.isBenchSeated, false);
    assert.equal(engine.viewMode, "third");
    engine.setMove(1, 1); engine.keys.add("w");
    assert.equal(await engine.walkToFire(), "cancelled");
    engine.updateSelf(1);
    close(engine.self.x, seat.x); close(engine.self.z, seat.z);
    assert.equal(engine.getSelf().moving, false);
    assert.equal(engine.selfNode.avatar.kind, skin === 3 ? "female-onsen" : "male-onsen");
    const pose = engine.selfNode.avatar.states.at(-1);
    close(pose.seated.avatarY, seat.avatarY); assert.equal(pose.lying, null);
    assert.equal(engine.selfNode.shadow.visible, false); assert.ok(camera.position.y > 18);
    assert.ok(Math.hypot(camera.position.x - seat.centerX, camera.position.z - seat.centerZ) <= 5.4 + 1e-6, "the seated orbit stays over the bath, out of the rock behind the bench");
    close(engine.deckHeight(seat.x, seat.z), seat.avatarY, "standing step and seated contact share the actual ledge top");
    engine.setView("first"); engine.self.pitch = 0.22; engine.self.yaw = 0.6;
    engine.applyRest(claim(seat, "sitting")); engine.updateSelf(0.1);
    close(engine.self.pitch, 0.22); close(engine.self.yaw, 0.6);
    close(camera.position.y, seat.avatarY + 0.78);
    assert.equal(engine.selfNode.avatar.root.visible, false);
    engine.applyRest(standing); engine.updateSelf(0);
    assert.equal(engine.onsenState.sitting, false); assert.equal(engine.skyRest, null);
    close(engine.eyeHeight, HOT_SPRING.floorY + 1.55); close(engine.self.pitch, 0.07);
    close(engine.self.x, standing.x); close(engine.self.z, standing.z);
    assert.equal(camera.layers.mask, 1);
  }
});

test("floating uses the assigned pool location and buoyancy for body, sky eyes, care and remote players", () => {
  for (const skin of [0, 3]) for (const slot of ONSEN_FLOATS) {
    const { engine, camera } = fixture(skin);
    engine.setPlayers([visitor("floating", slot, "lying", skin)]);
    engine.applyRest(claim(slot, "lying"));
    assert.equal(engine.isLying, true); assert.equal(engine.isBedLying, false);
    assert.equal(engine.onsenState.floating, true); assert.equal(engine.onsenState.canSit, false);
    assert.deepEqual(plain(engine.onsenState.occupiedFloats), [slot.slot], "local and remote duplicate claims count once");
    for (const time of [0, 0.9, 3, 11]) {
      engine.time = time; engine.updateSelf(1); engine.updatePlayers(1);
      const expected = onsenFloatingY(time, slot.slot), local = engine.selfNode.avatar.states.at(-1);
      const remote = engine.players.get("floating").avatar.states.at(-1);
      close(local.lying.avatarY, expected); close(remote.lying.avatarY, expected);
      assert.equal(local.seated, null); assert.equal(remote.seated, null); assert.equal(remote.moving, false);
      close(remote.x, slot.x); close(remote.z, slot.z);
      assert.ok(camera.position.z > 38 && camera.position.y > 18, "the view stays over the onsen, not the beach mats");
      const head = new THREE.Vector3(slot.x, expected + 0.9, slot.z + 0.7);
      camera.updateMatrixWorld(); const screen = head.project(camera);
      assert.ok(Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95, "the whole floating body fits a narrow phone view");
    }
    engine.setView("first"); engine.updateSelf(1);
    const pose = engine.floatingPose(engine.skyRest);
    close(camera.position.x, pose.x - Math.sin(pose.yaw)); close(camera.position.z, pose.z - Math.cos(pose.yaw));
    close(camera.position.y, onsenFloatingY(engine.time, slot.slot) + 0.92);
    assert.equal(camera.layers.mask, 1, "a floating visitor still sees the bath");
    assert.equal(engine.selfNode.avatar.root.visible, false);
    assert.ok(Math.abs(camera.getWorldDirection(new THREE.Vector3()).y) < 0.2, "and looks across the water");
    engine.self.yaw = 0.8; engine.self.pitch = 1.43;
    engine.applyRest(claim(slot, "lying"));
    close(engine.self.yaw, 0.8); close(engine.self.pitch, 1.43);
    engine.setView("third");
    const anchor = engine.careAnchor("floating"), localAnchor = engine.careAnchor(null);
    close(anchor.position.y, localAnchor.position.y);
    engine.setView("first"); engine.updateSelf(0);
    engine.applyRest(standing); engine.updateSelf(0);
    assert.equal(camera.layers.mask, 1); assert.equal(engine.onsenState.floating, false);
  }
});

test("a floating body is reclined, glides with the controls, coasts to a stop and stays in its bath", () => {
  const { engine } = fixture(), slot = ONSEN_FLOATS[1];
  engine.applyRest(claim(slot, "lying"));
  assert.equal(engine.selfNode.avatar === undefined, false);
  engine.setMove(0, 1);
  const start = { x: engine.self.x, z: engine.self.z };
  for (let frame = 0; frame < 30; frame++) { engine.time += 0.05; engine.updateSelf(0.05); }
  assert.ok(Math.hypot(engine.self.x - start.x, engine.self.z - start.z) > 0.5, "the joystick moves the body");
  assert.equal(engine.getSelf().moving, true);
  assert.equal(engine.onsenState.floating, true);
  const lying = engine.selfNode.avatar.states.at(-1).lying;
  assert.ok(lying.incline > 0.5, "half reclined");
  assert.ok(Number.isFinite(lying.roll), "with a gentle sway");
  for (let frame = 0; frame < 900; frame++) { engine.time += 0.05; engine.updateSelf(0.05); }
  assert.ok(Math.hypot(engine.self.x - slot.centerX, engine.self.z - slot.centerZ) <= 3.5 + 1e-9, "the drift stops at the edge of the bath");
  engine.setMove(0, 0);
  for (let frame = 0; frame < 120; frame++) { engine.time += 0.05; engine.updateSelf(0.05); }
  assert.equal(engine.getSelf().moving, false, "and coasts to rest");
  assert.equal(slot.x, ONSEN_FLOATS[1].x, "the shared table never moves");
  engine.applyRest(standing);
  const seat = fixture().engine;
  seat.applyRest(claim(ONSEN_SEATS[0], "sitting"));
  seat.setMove(0, 1);
  assert.equal(seat.move.y, 0, "a seat still holds its visitor");
});

test("another visitor's float follows the position the server reports", () => {
  const { engine } = fixture(), slot = ONSEN_FLOATS[1];
  engine.setPlayers([visitor("friend", slot, "lying")]); engine.updatePlayers(1);
  const node = engine.players.get("friend");
  engine.setPlayers([{ ...visitor("friend", slot, "lying"), x: slot.x + 1.5, z: slot.z + 1, yaw: 2 }]);
  node.motion = undefined; // The interpolation buffer runs on wall-clock time; this exercises the plain follow path.
  for (let frame = 0; frame < 60; frame++) { engine.time += 0.1; engine.updatePlayers(0.1); }
  close(node.cur.x, slot.x + 1.5, `x=${node.cur.x}`); close(node.cur.z, slot.z + 1, `z=${node.cur.z}`);
  const state = node.avatar.states.at(-1);
  assert.equal(state.moving, false, "floating never plays the walk cycle");
  assert.ok(Math.hypot(state.lying.x - node.cur.x, state.lying.z - node.cur.z) < 0.7, "the body is drawn around that position");
});

test("remote onsen sit, float, stand and gender changes use the same authoritative poses", () => {
  const { engine } = fixture();
  for (const skin of [0, 3]) {
    const seat = ONSEN_SEATS[4], floating = ONSEN_FLOATS[2];
    engine.setPlayers([visitor("friend", seat, "sitting", skin)]); engine.updatePlayers(0.1);
    const node = engine.players.get("friend");
    close(node.cur.x, seat.x); close(node.cur.z, seat.z);
    assert.equal(node.avatar.states.at(-1).seated, seat);
    assert.equal(node.avatar.states.at(-1).moving, false); assert.equal(node.shadow.visible, false);
    close(node.label.position.y, seat.avatarY + 1.22);
    engine.setPlayers([visitor("friend", floating, "lying", skin)]); engine.updatePlayers(0.1);
    assert.equal(engine.players.get("friend"), node);
    assert.equal(node.avatar.states.at(-1).seated, null);
    close(node.avatar.states.at(-1).lying.avatarY, onsenFloatingY(engine.time, 2));
    engine.setPlayers([{ pid: "friend", nick: "friend", skin, ...standing, moving: false }]); engine.updatePlayers(1);
    const state = node.avatar.states.at(-1);
    assert.equal(state.lying, null); assert.equal(state.seated, null); close(state.y, HOT_SPRING.floorY);
  }
});

test("invalid onsen claims cannot move or displace a valid resting actor", () => {
  const { engine } = fixture();
  engine.applyRest(claim(ONSEN_SEATS[1], "sitting"));
  for (const invalid of [
    { pose: "sitting", spotId: "onsen-benches", slot: 27 },
    { pose: "lying", spotId: "onsen-float", slot: -1 },
    { pose: "lying", spotId: "onsen-float", slot: 0.5 },
    { pose: "sitting", spotId: "onsen-float", slot: 0 },
    { ...standing, x: NaN },
  ]) engine.applyRest(invalid);
  assert.equal(engine.onsenSeat, ONSEN_SEATS[1]); assert.equal(engine.skyRest, null);
  close(engine.self.x, ONSEN_SEATS[1].x); close(engine.self.z, ONSEN_SEATS[1].z);
});

test("male and female robe downloads remain independent when both visitors arrive together", async () => {
  const { engine } = fixture();
  let resolveMale, resolveFemale, maleLoads = 0, femaleLoads = 0;
  Object.assign(engine, {
    onsenAvatarRequested: false, onsenAvatarReady: false, femaleOnsenAvatarRequested: false, femaleOnsenAvatarReady: false,
    onsenAvatarModels: { ...pool("male-onsen"), load: () => { maleLoads++; return new Promise(resolve => { resolveMale = resolve; }); } },
    femaleOnsenAvatarModels: { ...pool("female-onsen"), load: () => { femaleLoads++; return new Promise(resolve => { resolveFemale = resolve; }); } },
  });
  const nodes = [0, 3].map(skin => ({ skin, node: { avatar: null } }));
  for (let tick = 0; tick < 3; tick++) for (const { skin, node } of nodes) engine.syncAvatar(node, skin, 0, 45);
  assert.deepEqual([maleLoads, femaleLoads], [1, 1]);
  resolveFemale(); await Promise.resolve();
  for (const { skin, node } of nodes) engine.syncAvatar(node, skin, 0, 45);
  assert.deepEqual(nodes.map(x => x.node.avatar.kind), ["male", "female-onsen"]);
  engine.disposed = true; resolveMale(); await Promise.resolve();
  assert.equal(engine.onsenAvatarReady, false, "an outstanding request cannot resurrect a disposed room");
});

test("a failed everyday model download retries after the pool cooldown and replaces the fallback without rejoining", async () => {
  for (const [skin, name, kind] of [[0, "avatarModels", "male"], [3, "femaleAvatarModels", "female"]]) {
    const { engine } = fixture(skin);
    let loads = 0, ready = false, pending = false, coolingDown = true, finish;
    const template = pool(kind);
    engine[name] = {
      get ready() { return ready; },
      get canLoad() { return !ready && !pending && !coolingDown; },
      load() {
        loads++; pending = true;
        return new Promise(resolve => { finish = () => { ready = true; pending = false; resolve(); }; });
      },
      create() { return ready ? template.create() : null; },
    };
    const local = { avatar: null }, visitor = { avatar: null };
    const sync = () => { for (const node of [local, visitor]) engine.syncAvatar(node, skin, 0, 0); };
    sync(); sync();
    assert.equal(loads, 0, "failed requests respect the pool cooldown");
    assert.equal(local.avatar, null);
    coolingDown = false;
    sync(); sync(); sync();
    assert.equal(loads, 1, "actors share one pending retry, not one request per frame or visitor");
    finish(); await Promise.resolve(); sync();
    assert.equal(local.avatar.kind, kind); assert.equal(visitor.avatar.kind, kind);
    assert.notEqual(local.avatar, visitor.avatar, "each actor gets its own rig");
    const previous = local.avatar; sync();
    assert.equal(local.avatar, previous); assert.equal(loads, 1);
  }
});

test("legacy pixel selections resolve to 3D characters and matching onsen robes", () => {
  const { engine } = fixture();
  for (const [skin, kind] of [[0, "male"], [1, "female"], [2, "male"], [3, "female"]]) {
    const node = { avatar: null };
    engine.syncAvatar(node, skin, 0, 0);
    assert.equal(node.avatar.kind, kind);
    engine.syncAvatar(node, skin, 0, 45);
    assert.equal(node.avatar.kind, `${kind}-onsen`);
    engine.syncAvatar(node, skin, 0, 0);
    assert.equal(node.avatar.kind, kind);
  }
});

test("fireworks allocate on the first room event, forward clocks and updates, and are released with both robe pools", () => {
  const { engine, camera } = fixture();
  let poolsDisposed = 0;
  let paperDisposed = 0;
  engine.paperAvatarModels = { dispose() { paperDisposed++; } };
  engine.onsenAvatarModels.dispose = engine.femaleOnsenAvatarModels.dispose = () => poolsDisposed++;
  const count = effects.length;
  engine.applyFireworks([], 1000); assert.equal(effects.length, count);
  const events = [{ id: "shared", seed: 9, startedAt: 1000, durationMs: 12_000 }];
  engine.applyFireworks(events, 1200); engine.applyFireworks(events, 1300);
  assert.equal(effects.length, count + 1);
  const manager = effects.at(-1);
  assert.deepEqual(plain(manager.options), { mobile: false, grand: true, reflectWater: false }); assert.equal(manager.scene, engine.scene);
  assert.deepEqual(manager.applied.map(x => x.serverTime), [1200, 1300]);
  Object.assign(engine, { skyMat: { uniforms: { uTime: {} } }, seaMat: { uniforms: { uTime: {}, uCamPos: { value: new THREE.Vector3() } } },
    cove: { setFireFlare() {}, update() {} } });
  engine.updateWorld(0.1); assert.equal(manager.updated.at(-1), camera);
  engine.dispose(); assert.equal(manager.disposed, 1); assert.equal(poolsDisposed, 2);
  assert.equal(paperDisposed, 1); assert.equal(engine.paperAvatarModels, null);
  engine.applyFireworks(events, 1400); assert.equal(effects.length, count + 1);
});
