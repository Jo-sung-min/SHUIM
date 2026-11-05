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
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonKey\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onKey($1) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const stars = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "stargazingSlot", "claimedStargazingSlot", "stargazingBodyPoint", "stargazingApproach", "stargazingCameraDistance", "applyLyingTransform", "buildStargazingZone"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const huts = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "BED_CAPACITY", "bedSlot", "claimedBedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["resolveWalls", "findWalkingPath", "findClearApproach"]);
let now = 0;
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...stars, ...huts, ...benches, ...navigation, CAMPFIRE: { x: 0, z: 12 }, performance: { now: () => now }, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  document: { createElement: () => ({ getContext: () => null }) },
  window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 },
}, ["BeachEngine"]);
const { STARGAZING, stargazingSlot } = stars;
const { UYUNI_HOTELS, UYUNI_HOTEL_DECK, UYUNI_HOTEL_COLLIDERS, UYUNI_HOTEL_SEATS,
  uyuniHotelBedSlot, uyuniHotelFloorHeight, uyuniHotelCeilingHeight } = hotSpring;
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message = `${actual} ≈ ${expected}`) => assert.ok(Math.abs(actual - expected) < 1e-6, message);
const pool = kind => ({ ready: true, canLoad: true, create() {
  return { kind, root: new THREE.Group(), states: [], update(dt, state) { this.states.push({ dt, ...state }); }, dispose() {} };
} });

function fixture(mapId = "beach") {
  const events = { fire: [], star: [], bench: [], onsen: [], quality: [], world: [], waterQuality: [], buffers: [] };
  const uyuni = mapId === "uyuni" ? {
    update: (...args) => events.world.push(args), setQuality: low => events.waterQuality.push(low),
  } : null;
  const camera = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 520);
  camera.rotation.order = "YXZ";
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId, uyuni, running: false, clock: { reset() {} }, disposed: false, inputPaused: false, scene: new THREE.Scene(), camera, sky: new THREE.Mesh(),
    self: { x: 0, z: 3, yaw: 0.2, pitch: 0.07, moving: false, bobT: 0 }, orbitYaw: 0.2,
    view: "first", mobile: true, followCam: new THREE.Vector3(), followSnap: true,
    skyRest: null, onsenSeat: null, benchSeat: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null,
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin: 0, time: 0, nearFire: false, eyeHeight: 1.55,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(), look: { active: false, moved: false },
    bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }, obstacles: [{ x: 0, z: 12, r: 1.35 }],
    avatarModels: pool("male"), femaleAvatarModels: pool("female"),
    onsenAvatarModels: pool("male-onsen"), femaleOnsenAvatarModels: pool("female-onsen"),
    onsenAvatarReady: true, femaleOnsenAvatarReady: true, onsenAvatarRequested: true, femaleOnsenAvatarRequested: true,
    quality: "high", skyRenderMode: false, canvas: { clientWidth: 390, clientHeight: 844 },
    renderer: { shadowMap: { enabled: mapId === "beach" }, domElement: { height: 717 },
      setDrawingBufferSize: (...args) => events.buffers.push(args) },
    handlers: { onSelect() {}, onFireRangeChange: value => events.fire.push(value),
      onStargazingChange: value => events.star.push(plain(value)), onBenchAction: () => events.bench.push("action"),
      onBenchChange: value => events.bench.push(plain(value)), onOnsenChange: value => events.onsen.push(plain(value)),
      onQuality: value => events.quality.push(value) },
  });
  engine.selfNode = engine.createSelfAvatar();
  return { engine, camera, events, uyuni };
}

test("remote samples render smoothly without changing 100 identities, and old room responses cannot remove them", () => {
  now = 100;
  const { engine } = fixture(), epoch = 1_800_000_000_000;
  const players = Array.from({ length: 100 }, (_, i) => ({ pid: `p${i}`, nick: `visitor${i}`, skin: i % 8,
    x: i * 0.1, z: 2, yaw: 0, moving: true, pose: "standing", updatedAt: epoch }));
  engine.setPlayers(players, { serverTime: epoch, sentAt: 0, receivedAt: 100 });
  const nodes = [...engine.players.values()];
  now = 450;
  engine.setPlayers(players.map(p => ({ ...p, x: p.x + 1.225, updatedAt: epoch + 350 })),
    { serverTime: epoch + 350, sentAt: 350, receivedAt: 450 });
  now = 600; engine.updatePlayers(0.016);
  const before = nodes[0].cur.x;
  now += 16; engine.updatePlayers(0.016);
  close(nodes[0].cur.x - before, 0.056);
  engine.setPlayers([], { serverTime: epoch + 200, sentAt: 550, receivedAt: 620 });
  assert.equal(engine.players.size, 100);
  [...engine.players.values()].forEach((node, i) => {
    assert.equal(node, nodes[i]); assert.equal(node.data.skin, i % 8);
    assert.equal(node.avatar ? node.avatar.states.at(-1).visible : node.sprite.visible, true);
  });
  now = 800;
  engine.setPlayers(players.map(p => ({ ...p, x: p.x + 1.225, updatedAt: epoch + 350 })),
    { serverTime: epoch + 700, sentAt: 700, receivedAt: 800 });
  assert.equal(nodes[0].motion.samples.length, 2, "heartbeat is not a fresh stop at the same position");
});

test("remote seated and lying claims snap immediately and returning to standing never interpolates through furniture", () => {
  const { engine } = fixture(); now = 0;
  const player = { pid: "friend", nick: "friend", skin: 0, x: 0, z: 3, yaw: 0, moving: true };
  engine.setPlayers([player]); const node = engine.players.get("friend");
  const bench = benches.FIRE_BENCH_SEATS[3]; now = 350;
  engine.setPlayers([{ ...player, ...bench, pose: "sitting" }]); engine.updatePlayers(0.016);
  close(node.cur.x, bench.x); close(node.cur.z, bench.z); assert.equal(node.avatar.states.at(-1).moving, false);
  now = 700; engine.setPlayers([{ ...player, x: 2, z: 4, pose: "standing" }]); engine.updatePlayers(0.016);
  close(node.cur.x, 2); close(node.cur.z, 4);
  const lying = stargazingSlot(1); now = 1050;
  engine.setPlayers([{ ...player, ...lying, pose: "lying" }]); engine.updatePlayers(0.016);
  close(node.cur.x, lying.x); assert.equal(node.avatar.states.at(-1).lying.slot, 1);
});

test("restarting rendering keeps shown remote positions and waits for fresh authoritative samples", () => {
  const { engine } = fixture(); now = 0;
  const player = { pid: "friend", nick: "friend", skin: 0, x: 0, z: 3, yaw: 0, moving: true };
  engine.setPlayers([player]); now = 350; engine.setPlayers([{ ...player, x: 1.2 }]);
  now = 600; engine.updatePlayers(0.016); const node = engine.players.get("friend"), before = node.cur.x;
  engine.stop(); now = 60_000; engine.start(); engine.updatePlayers(0.016);
  close(node.cur.x, before); assert.equal(node.avatar.states.at(-1).moving, false);
  engine.setPlayers([{ ...player, x: 6 }]); engine.updatePlayers(0.016);
  close(node.cur.x, 6); assert.equal(engine.players.get("friend"), node);
});

test("clock-offset corrections cannot lose a quick authoritative stand transition", () => {
  const { engine } = fixture(), epoch = 1_800_000_000_000, seat = benches.FIRE_BENCH_SEATS[0];
  const player = { pid: "friend", nick: "friend", skin: 0, ...seat, pose: "sitting", moving: false, updatedAt: epoch };
  now = 100;
  engine.setPlayers([player], { serverTime: epoch, sentAt: 0, receivedAt: 100 });
  const node = engine.players.get("friend");
  now = 350;
  const standing = { ...player, x: -3, z: 5, pose: "standing", spotId: null, slot: null, updatedAt: epoch + 1 };
  engine.setPlayers([standing], { serverTime: epoch + 300, sentAt: 300, receivedAt: 350 });
  engine.updatePlayers(0.016);
  close(node.cur.x, -3); close(node.cur.z, 5); assert.equal(node.avatar.states.at(-1).seated, null);
  now = 700;
  engine.setPlayers([standing], { serverTime: epoch + 650, sentAt: 650, receivedAt: 700 });
  engine.updatePlayers(0.016); close(node.cur.x, -3); close(node.cur.z, 5);
});

test("initial restoration uses server coordinates and camera, while an in-memory visit keeps the latest local walk", () => {
  const { engine, camera } = fixture();
  const saved = { view: "first", yaw: 1.2, pitch: 0.2, orbitYaw: -0.7, restSpot: null };
  engine.keys.add("w"); engine.move.y = 1; engine.look.active = true;
  engine.restoreVisit({ x: -5, z: 5, yaw: 0.3 }, undefined, saved);
  close(engine.self.x, -5); close(engine.self.z, 5); close(engine.self.yaw, 1.2); close(engine.self.pitch, 0.2);
  close(camera.position.x, -5); close(camera.position.z, 5); assert.equal(engine.keys.size, 0);
  assert.equal(engine.move.y, 0); assert.equal(engine.look.active, false); assert.equal(engine.self.moving, false);
  Object.assign(engine.self, { x: 4, z: 5 });
  engine.restoreVisit({ x: 0, z: 3, yaw: 0 }, undefined, undefined, true);
  close(engine.self.x, 4); close(engine.self.z, 5); close(engine.self.yaw, 1.2);
  engine.restoreVisit({ x: -8, z: 4, yaw: 0.9 }, undefined, { ...saved, view: "third" });
  close(engine.self.x, -8); close(engine.self.yaw, 0.9); close(engine.orbitYaw, -0.7);
});

test("restoration rejects unsafe coordinates and clears lost claims instead of leaving the visitor on a bed", () => {
  const { engine } = fixture();
  engine.restoreVisit({ x: 0, z: 12, yaw: Infinity }, undefined,
    { view: "first", yaw: NaN, pitch: Infinity, orbitYaw: NaN, restSpot: null });
  assert.ok(Math.hypot(engine.self.x, engine.self.z - 12) >= 1.7 - 1e-6);
  assert.ok([engine.self.x, engine.self.z, engine.self.yaw, engine.self.pitch, engine.orbitYaw].every(Number.isFinite));
  engine.restoreVisit({ x: 1000, z: -1000, yaw: 0 });
  assert.ok(engine.self.x <= 79.6 && engine.self.z >= -79.7);
  const slot = stargazingSlot(0); engine.applyRest({ ...slot, pose: "lying" }); engine.setView("first");
  const saved = engine.getContinuityView();
  engine.restoreVisit({ x: -6, z: 4, yaw: 0.4 }, { pose: "standing", x: -6, z: 4, yaw: 0.4 }, saved);
  assert.equal(engine.skyRest, null); assert.equal(engine.fixedSeat, null);
  close(engine.self.x, -6); close(engine.self.pitch, 0.07); assert.equal(engine.camera.layers.mask, 1);
});

test("a resumed Uyuni visit adopts expanded server bounds before restoring or preserving a walk", () => {
  const expanded = { minX: -22, maxX: 22, minZ: -50, maxZ: 55 };
  const oldBounds = { ...expanded, minZ: -1 };
  const { engine, camera } = fixture("uyuni");
  engine.bounds = { ...oldBounds };
  engine.restoreVisit({ x: 0, z: -45, yaw: 0 }, undefined, undefined, false, expanded);
  close(engine.self.z, -45); close(camera.position.z, -45);
  engine.setMove(0, 1); engine.updateSelf(20);
  close(engine.self.z, -49.7);
  engine.restoreVisit({ x: 0, z: -100, yaw: 0 });
  close(engine.self.z, -49.7);

  engine.bounds = { ...oldBounds }; engine.self.z = -45;
  engine.restoreVisit({ x: 0, z: 3, yaw: 0 }, undefined, undefined, true, expanded);
  close(engine.self.z, -45); close(camera.position.z, -45);
  expanded.minZ = -1;
  engine.restoreVisit({ x: 0, z: -45, yaw: 0 });
  close(engine.self.z, -45, "the live bounds do not retain a mutable response object");
});

test("invalid resume bounds retain the last valid limits and the beach still stops at its own shoreline", () => {
  const bounds = { minX: -22, maxX: 22, minZ: -1, maxZ: 55 };
  const { engine } = fixture("beach");
  engine.bounds = { ...bounds };
  for (const invalid of [
    { ...bounds, minZ: NaN }, { ...bounds, maxX: Infinity },
    { ...bounds, minZ: "-50" }, { ...bounds, minZ: 60 },
    { ...bounds, maxX: -21.5 }, { ...bounds, maxZ: -0.5 },
  ]) {
    engine.restoreVisit({ x: 0, z: -45, yaw: 0 }, undefined, undefined, false, invalid);
    close(engine.self.z, -0.7);
    assert.deepEqual(plain(engine.bounds), bounds);
  }
  engine.restoreVisit({ x: 0, z: 3, yaw: 0 }, undefined, undefined, false, bounds);
  engine.setMove(0, 1); engine.updateSelf(20);
  close(engine.self.z, -0.7);
});

test("confirmed rest keeps the chosen star or bed view, and only that server claim may restore a rest place", () => {
  const { engine } = fixture("uyuni"), slot = stargazingSlot(2);
  engine.applyRest({ ...slot, pose: "lying" }); engine.setView("first");
  engine.skyLook = engine.limitSkyLook(0.2, 0.1);
  const saved = engine.getContinuityView();
  engine.restoreVisit({ x: -4, z: 3, yaw: 0 }, { ...slot, pose: "lying" }, saved);
  assert.equal(engine.skyRest.slot, 2); assert.equal(engine.view, "first");
  close(engine.skyLook.yaw, saved.skyYaw); close(engine.skyLook.pitch, saved.skyPitch); assert.equal(engine.camera.layers.mask, 2);
  const bed = uyuniHotelBedSlot("hotel-dawn", 0);
  engine.applyRest({ ...bed, pose: "lying" }); engine.setView("first"); engine.self.yaw = 0.12; engine.self.pitch = 0.08;
  const bedView = engine.getContinuityView();
  engine.restoreVisit({ x: -4, z: 3, yaw: 0 }, { ...bed, pose: "lying" }, bedView);
  assert.equal(engine.skyRest.spotId, "hotel-dawn"); close(engine.self.yaw, 0.12); close(engine.self.pitch, 0.08);
  engine.restoreVisit({ x: -4, z: 3, yaw: 0 }, { ...benches.FIRE_BENCH_SEATS[0], pose: "sitting" }, bedView);
  assert.equal(engine.skyRest, null); assert.equal(engine.fixedSeat, null); close(engine.self.x, -4);
});

test("an unshared sofa returns to its safe approach when the same visitor reconnects", () => {
  const { engine } = fixture("uyuni"), seat = UYUNI_HOTEL_SEATS[0];
  Object.assign(engine.self, { x: seat.x + 1.2, z: seat.z }); const before = { x: engine.self.x, z: engine.self.z };
  engine.toggleRest(); assert.ok(engine.restSeat);
  engine.restoreVisit({ x: 0, z: 3, yaw: 0 }, undefined, undefined, true);
  assert.equal(engine.restSeat, null); close(engine.self.x, before.x); close(engine.self.z, before.z);
  assert.equal(engine.returnFromSeat, null);
});


