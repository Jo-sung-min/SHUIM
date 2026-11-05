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
    .replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  // Execute the production input handlers without creating a WebGL renderer.
  if (file.endsWith("/engine.ts")) source = source.replace(/\b(onPointerDown|onPointerMove|onPointerUp|onKey)\s*=\s*\(([^)]*)\)\s*=>\s*\{/g, "$1($2) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api={${names.join(",")}};`, context);
  return context.api;
}

const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const resting = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "stargazingSlot", "claimedStargazingSlot", "applyLyingTransform", "stargazingBodyPoint", "stargazingCameraDistance"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const bedding = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "BED_CAPACITY", "claimedBedSlot", "bedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["resolveWalls"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...atlas, ...resting, ...bedding, ...benches, ...navigation, CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ getContext: () => null }) },
  window: { devicePixelRatio: 3 },
}, ["BeachEngine"]);
const close = (value, expected, message) => assert.ok(Math.abs(value - expected) < 1e-6, message ?? `${value} ≈ ${expected}`);
const angleClose = (value, expected, message) => close(Math.atan2(Math.sin(value - expected), Math.cos(value - expected)), 0, message);

function fixture() {
  const camera = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 520);
  camera.rotation.order = "YXZ";
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    disposed: false, inputPaused: false, scene: new THREE.Scene(), camera, sky: new THREE.Mesh(),
    self: { x: 0, z: 8, yaw: 0, pitch: 0.07, moving: false, bobT: 0 }, orbitYaw: 0,
    view: "third", mobile: false, followCam: new THREE.Vector3(), followSnap: true,
    skyRest: null, benchSeat: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null,
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(),
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin: 2, time: 0, nearFire: false,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    bounds: { minX: -30, maxX: 30, minZ: -15, maxZ: 35 }, obstacles: [],
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) },
    look: { active: false }, handlers: {}, eyeHeight: 1.55,
  });
  engine.selfNode = engine.createSelfAvatar();
  const drag = (dx, dy = 0, pointerType = "mouse") => {
    const base = { pointerId: 1, pointerType, clientX: 200, clientY: 200 };
    engine.onPointerDown(base);
    engine.onPointerMove({ ...base, clientX: 200 + dx, clientY: 200 + dy });
    engine.onPointerUp({ ...base, type: "pointerup" });
  };
  const key = key => engine.onKey({ key, type: "keydown", repeat: false, target: null, preventDefault() {} });
  return { engine, camera, drag, key };
}

test("mouse and touch orbit reveal the front of a stationary avatar without changing the shared body yaw", () => {
  for (const [type, sensitivity] of [["mouse", 0.0042], ["touch", 0.0072]]) {
    const { engine, camera, drag } = fixture();
    engine.updateSelf(0.1);
    assert.ok(camera.position.z > engine.self.z, "initial view is behind the body");
    const before = engine.getSelf();
    const frame = () => Math.round(engine.selfNode.tex.offset.x * atlas.CHAR_ATLAS.cols);
    assert.ok(frame() >= atlas.CHAR_VIEW.back);
    drag(-Math.PI / sensitivity, 0, type); engine.updateSelf(0.1);
    assert.ok(camera.position.z < engine.self.z, "a half orbit reaches the character's face");
    assert.ok(frame() < atlas.CHAR_VIEW.back, "the pixel fallback displays its front artwork");
    assert.deepEqual(engine.getSelf(), before, "looking around cannot move or turn the network avatar");
    const held = camera.position.clone();
    for (let i = 0; i < 60; i++) engine.updateSelf(1 / 60);
    assert.ok(camera.position.distanceTo(held) < 1e-6, "releasing the drag does not snap back behind the avatar");
  }
});

test("movement follows the orbited camera and turns only the moving body, then keeps the chosen angle on stop", () => {
  const { engine, drag } = fixture();
  drag(-Math.PI / 2 / 0.0042);
  const start = { ...engine.self }, orbit = engine.orbitYaw;
  engine.setMove(0, 1); engine.updateSelf(0.1);
  assert.ok(engine.self.x < start.x - 0.3);
  close(engine.self.z, start.z);
  angleClose(engine.self.yaw, Math.PI / 2);
  close(engine.orbitYaw, orbit);
  engine.setMove(1, 0); engine.updateSelf(0.1);
  assert.ok(engine.self.z < start.z - 0.3, "right input is relative to the camera, even after the body turns");
  angleClose(engine.self.yaw, 0);
  close(engine.orbitYaw, orbit);
  engine.setMove(0, 0);
  for (let i = 0; i < 60; i++) engine.updateSelf(1 / 60);
  close(engine.orbitYaw, orbit); angleClose(engine.self.yaw, 0);
  assert.equal(engine.getSelf().moving, false);
});

test("keyboard orbit and view toggles keep first-person looking aligned without turning a visible third-person body", () => {
  const { engine, camera, drag, key } = fixture();
  key("ArrowLeft"); engine.updateSelf(0.1); engine.keys.clear();
  close(engine.self.yaw, 0); close(engine.orbitYaw, 0.19);
  drag(-80); engine.updateSelf(0.1);
  const orbit = engine.orbitYaw;
  key("v"); engine.updateSelf(0.1);
  assert.equal(engine.viewMode, "first");
  close(engine.self.yaw, orbit);
  angleClose(camera.rotation.y, orbit);
  assert.equal(engine.selfNode.sprite.visible, false);
  drag(100); engine.updateSelf(0.1);
  angleClose(engine.getSelf().yaw, orbit - 0.42, "first-person drag still changes the usual looking direction");
  const firstYaw = engine.self.yaw;
  key("v"); engine.updateSelf(0.1);
  assert.equal(engine.viewMode, "third");
  close(engine.orbitYaw, firstYaw); close(engine.self.yaw, firstYaw);
  drag(100); close(engine.self.yaw, firstYaw);
});

test("first-person view reveals more scenery in both portrait and landscape without widening the third-person orbit", () => {
  for (const mobile of [false, true]) for (const aspect of [390 / 844, 16 / 9]) {
    const { engine, camera } = fixture();
    engine.mobile = mobile;
    engine.canvas = { clientWidth: aspect * 900, clientHeight: 900 };
    engine.renderer = { setDrawingBufferSize() {} };
    engine.resize();
    camera.updateMatrixWorld(true);
    const originalFov = camera.fov, originalProjection = camera.projectionMatrix.clone();
    const edge = new THREE.Vector3(Math.tan(THREE.MathUtils.degToRad(originalFov / 2)) * aspect * 10 * 1.15, 0, -10);
    assert.ok(edge.clone().project(camera).x > 1, "this scenery starts outside the old view");
    engine.setView("first");
    assert.ok(edge.clone().project(camera).x < 1, "the wider first-person projection reveals it");
    const wide = camera.fov;
    engine.resize();
    assert.equal(camera.fov, wide, "viewport resizing preserves the selected view's lens");
    engine.setView("third");
    assert.equal(camera.fov, originalFov);
    assert.ok(camera.projectionMatrix.equals(originalProjection), "switching back preserves the existing avatar framing");
  }
});

test("automatic travel and arrival turn the body toward their target while leaving the orbit and pitch alone", async () => {
  const { engine, drag } = fixture();
  drag(-Math.PI / 0.0042, -40);
  const orbit = engine.orbitYaw, pitch = engine.self.pitch;
  const travel = engine.walkTo({ x: 2, z: 8 }, { x: 2, z: 12 });
  engine.look.active = true; engine.look.moved = true;
  engine.updateSelf(0.1);
  assert.ok(engine.self.x > 0.3); close(engine.self.z, 8);
  assert.ok(engine.self.yaw < 0, "third-person camera dragging cannot prevent the walking body from facing its path");
  for (let i = 0; i < 100; i++) engine.updateSelf(0.1);
  assert.equal(await travel, "arrived");
  close(engine.orbitYaw, orbit); close(engine.self.pitch, pitch);
  assert.equal(engine.self.moving, false);
  const targetYaw = Math.atan2(-(2 - engine.self.x), -(12 - engine.self.z));
  assert.ok(Math.abs(Math.atan2(Math.sin(engine.self.yaw - targetYaw), Math.cos(engine.self.yaw - targetYaw))) < 0.01);
});

test("bench and mat orbits preserve assigned body poses, duplicate claims, and constrained bed views", () => {
  for (const claim of [
    { pose: "sitting", spotId: "fire-benches", slot: 3 },
    { pose: "lying", ...resting.stargazingSlot(2) },
  ]) {
    const { engine, camera, drag } = fixture();
    engine.applyRest(claim); engine.updateSelf(0.1);
    const before = engine.getSelf(), position = camera.position.clone();
    drag(-100); engine.updateSelf(0.1);
    assert.ok(position.distanceTo(camera.position) > 0.1);
    assert.deepEqual(engine.getSelf(), before);
    close(engine.self.yaw, before.yaw);
    const orbit = engine.orbitYaw;
    engine.applyRest(claim); engine.updateSelf(0.1);
    close(engine.orbitYaw, orbit);
  }
  const { engine, camera, drag } = fixture(), bed = bedding.bedSlot("hut-wave", 1);
  engine.applyRest({ pose: "lying", ...bed }); engine.updateSelf(0.1);
  const outside = camera.position.clone(); drag(300, 200); engine.updateSelf(0.1);
  assert.ok(outside.distanceTo(camera.position) < 1e-6, "bed overview stays inside the safe opening below the roof");
  engine.setView("first"); drag(10000, 10000); engine.updateSelf(0.1);
  close(engine.self.yaw, -0.3); close(engine.self.pitch, -0.08);
  close(engine.getSelf().yaw, bed.yaw);
  engine.applyRest({ pose: "standing", x: 0, z: 21, yaw: 0.2 });
  close(engine.self.yaw, 0.2); close(engine.self.pitch, 0.07);
});
