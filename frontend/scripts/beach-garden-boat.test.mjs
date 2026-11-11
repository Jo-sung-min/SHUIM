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
  let source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"), { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/^export\s*\{[^}]*\};?\r?$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonPointerMove\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onPointerMove($1) {");
  const context = { THREE, mergeGeometries, RoundedBoxGeometry, ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const layout = await load("../lib/beach/garden-layout.ts", {}, [
  "BOAT_ROUTE", "BOAT_STOPS", "BOAT_SPEED", "BOAT_STOP_SECONDS", "BOAT_SEAT_Y", "BOAT_DECK_Y",
  "boatPoseAt", "boatSeatAt", "boatBobAt", "boatHeadingAt", "nearestBoatStop", "nextBoatStop", "isWater",
]);
const { GardenBoats, boatGeometry } = await load("../lib/beach/garden-boat.ts", layout, ["GardenBoats", "boatGeometry"]);
const { GARDEN_PIERS, pierEnd, PIER_Y } = hotSpring;
const near = (a, b, message = `${a} ≈ ${b}`, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, message);

function fleet() {
  const scene = new THREE.Scene(), gradient = new THREE.DataTexture();
  const boats = new GardenBoats(scene, gradient);
  return { scene, boats, close() { boats.dispose(); gradient.dispose(); } };
}

test("the open timber hull has finite smooth surfaces, an actual seat and a bounded single fleet draw", t => {
  const { scene, boats, close } = fleet(), g = boats.mesh.geometry;
  const positions = g.getAttribute("position"), normals = g.getAttribute("normal"), colors = g.getAttribute("color");
  for (const attr of [positions, normals, colors]) assert.ok(Array.from(attr.array).every(Number.isFinite));
  const triangles = positions.count / 3;
  assert.ok(triangles > 4000 && triangles < 14000, `detailed but bounded ${triangles} triangles`);
  assert.equal(scene.children.length, 1); assert.ok(boats.mesh.isInstancedMesh);
  assert.ok(boats.mesh.material.isMeshStandardMaterial, "wood has smooth lighting rather than stepped toon bands");
  g.computeBoundingBox();
  near(g.boundingBox.min.z, -2.48, "curved bow extent", .12);
  assert.ok(g.boundingBox.max.y + layout.BOAT_SEAT_Y < 1.35, "no canopy hides the seated passenger");
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, .015), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(mesh);
  assert.ok(hits.length > 0);
  near(hits[0].point.y, 0, "the cushion top coincides with the rocking origin", .012);
  const underside = new THREE.Raycaster(new THREE.Vector3(.4, -2, .3), new THREE.Vector3(0, 1, 0)).intersectObject(mesh);
  assert.ok(underside.length > 0, "outward hull normals remain visible from below the waterline");
  for (const direction of [-1, 1]) for (const x of [-.002, .002]) {
    const stem = new THREE.Raycaster(new THREE.Vector3(x, -.1, 0), new THREE.Vector3(0, 0, direction)).intersectObject(mesh);
    assert.ok(stem.some(hit => Math.abs(hit.point.z) > 2.3), "both pointed stems close at the centre without a water-visible slit");
  }
  const counts = new Map([[g, 0], [boats.mesh.material, 0], [boats.mesh, 0]]);
  for (const object of counts.keys()) object.addEventListener("dispose", () => counts.set(object, counts.get(object) + 1));
  close(); boats.dispose(); mesh.material.dispose();
  assert.equal(scene.children.length, 0); assert.ok([...counts.values()].every(count => count === 1));
  t.diagnostic(`${triangles} triangles per boat, one instanced draw for up to sixteen boats`);
});

test("boarding, departing, reserving the next stop and disembarking preserve the ferry route", () => {
  const { boats, close } = fleet();
  assert.equal(boats.board(0), null);
  for (let index = 0; index < GARDEN_PIERS.length; index++) {
    boats.update(0, 0, pierEnd(GARDEN_PIERS[index]), []);
    assert.equal(boats.board(0)?.id, layout.BOAT_STOPS[index].id);
    assert.equal(boats.state().docked, true);
    assert.equal(boats.board(0), null, "cannot board twice");
    assert.equal(boats.alight()?.id, layout.BOAT_STOPS[index].id);
    assert.equal(boats.isRiding, false); assert.equal(boats.isDocked, false);
  }
  boats.update(0, 0, pierEnd(GARDEN_PIERS[0]), []); boats.board(0);
  boats.update(3.1, .05, boats.pose, []);
  assert.equal(boats.isDocked, false);
  assert.equal(boats.alight(), "armed"); assert.equal(boats.state().alightArmed, true);
  let destination = null;
  for (let time = 3.15; time < 160 && !destination; time += .05) destination = boats.update(time, .05, boats.pose, []);
  assert.equal(destination?.id, layout.BOAT_STOPS[1].id);
  assert.equal(boats.isRiding, false); assert.equal(boats.isDocked, false); assert.equal(boats.state().alightArmed, false);
  boats.update(200, .05, pierEnd(GARDEN_PIERS[1]), []);
  assert.equal(boats.board(200)?.id, layout.BOAT_STOPS[1].id, "can immediately board again on the destination pier");
  boats.cancelRide(); assert.equal(boats.isRiding, false); assert.equal(boats.isDocked, false);
  close();
});

test("local and remote pelvis anchors follow the rendered boat's bob and route heading exactly", () => {
  const { boats, close } = fleet(), matrix = new THREE.Matrix4();
  boats.update(0, 0, pierEnd(GARDEN_PIERS[0]), []); boats.board(0);
  for (const time of [0, .3, 2.5, 4, 8]) {
    const remotePose = layout.boatPoseAt(40 + time);
    boats.update(time, .05, boats.pose, [{ pid: "friend", ...remotePose }, { pid: "land", x: 0, z: -11 }]);
    assert.equal(boats.mesh.count, 2);
    for (const [index, pose] of [[0, boats.pose], [1, remotePose]]) {
      boats.mesh.getMatrixAt(index, matrix);
      const actual = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix), expected = layout.boatSeatAt(pose, time);
      near(actual.x, expected.x, "seat x agrees", 1e-5); near(actual.y, expected.avatarY); near(actual.z, expected.z, "seat z agrees", 1e-5);
      const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
      const heading = index ? layout.boatHeadingAt(pose.x, pose.z) : pose.yaw;
      assert.ok(forward.dot(new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))) > .999, "bow follows canonical travel direction");
    }
  }
  boats.update(9, .05, boats.pose, [{ pid: "friend", ...pierEnd(GARDEN_PIERS[1]) }]);
  assert.equal(boats.mesh.count, 1, "remote boats disappear as soon as their rider reaches land");
  close();
});

const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const stars = await load("../lib/beach/stargazing.ts", {}, ["STARGAZING", "claimedStargazingSlot", "stargazingBodyPoint", "stargazingCameraDistance", "applyLyingTransform"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", {}, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const huts = await load("../lib/beach/shelters.ts", textiles, ["SHELTERS", "SHELTER_SEATS", "BED_CAPACITY", "claimedBedSlot"]);
const benches = await load("../lib/beach/fire-benches.ts", {}, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  ...atlas, ...stars, ...huts, ...benches, performance, CAMPFIRE: { x: 0, z: 12 },
  document: { createElement: () => ({ getContext: () => null }) },
}, ["BeachEngine"]);
function pool() {
  return { ready: true, canLoad: true, create() {
    const root = new THREE.Group();
    return { root, states: [], update(dt, state) { this.states.push({ ...state }); root.visible = state.visible; }, dispose() {} };
  } };
}
function engineFixture(skin = 0, aspect = 390 / 844) {
  const f = fleet(), boats = f.boats, pose = layout.boatPoseAt(0);
  const garden = {
    get isRiding() { return boats.isRiding; }, get boatPose() { return boats.pose; }, get boatState() { return boats.state(); },
    boardBoat: () => boats.board(0), alightBoat: () => boats.alight(),
    update: (time, camera, self, riders) => boats.update(time, .05, self, riders), boatStateChanged: () => boats.changed(),
  };
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "garden", bounds: hotSpring.GARDEN_BOUNDS, obstacles: hotSpring.GARDEN_OBSTACLES, garden, uyuni: null, bamboo: null, cloudSpa: null, baikal: null,
    scene: f.scene, camera: new THREE.PerspectiveCamera(78, aspect, .1, 520), sky: new THREE.Mesh(), followCam: new THREE.Vector3(), followSnap: true,
    self: { ...pose, pitch: .02, moving: false, bobT: 0 }, orbitYaw: pose.yaw + .42, view: "third", mobile: false,
    skyRest: null, onsenSeat: null, benchSeat: null, pavilionSeat: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null,
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin, time: 0, nearFire: false, eyeHeight: 2,
    skyMat: { uniforms: { uTime: { value: 0 } } }, eyeFloor: PIER_Y, eyeLift: 1.55,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(), ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(),
    handlers: { onSelect() {} }, avatarModels: pool(), femaleAvatarModels: pool(), look: { active: false },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) },
  });
  engine.selfNode = engine.createSelfAvatar(); engine.cancelAutoWalk = () => {};
  boats.update(0, 0, pierEnd(GARDEN_PIERS[0]), []);
  return { ...f, engine };
}

for (const skin of [0, 1]) test(`local skin ${skin} sits on the real bench, follows bobbing and stands immediately after alighting`, () => {
  const { engine, boats, close } = engineFixture(skin);
  assert.equal(engine.toggleBoat(), "boarded");
  for (const time of [0, .6, 2.2]) {
    engine.time = time; boats.update(time, .05, engine.self, []); engine.updateSelfAvatarBase(.05);
    const state = engine.selfNode.avatar.states.at(-1), seat = layout.boatSeatAt(boats.pose, time);
    assert.ok(state.seated); near(state.seated.avatarY, seat.avatarY); near(state.seated.yaw, boats.pose.yaw);
    assert.equal(state.moving, false); assert.equal(engine.selfNode.shadow.visible, false);
    assert.equal(engine.selfNode.sprite.geometry.userData.seated, true, "pixel fallback has the same seated silhouette");
  }
  engine.view = "first"; engine.updateSelfAvatarBase(0); assert.equal(engine.selfNode.avatar.root.visible, false);
  engine.view = "third";
  assert.equal(engine.toggleBoat(), "alighted"); engine.updateSelfAvatarBase(0);
  assert.equal(engine.selfNode.avatar.states.at(-1).seated, null); assert.equal(engine.selfNode.sprite.geometry.userData.seated, false);
  near(engine.eyeHeight, PIER_Y + 1.55); assert.ok(!layout.isWater(engine.self.x, engine.self.z));
  close();
});

test("remote riders receive a seated pose and lose it when the same player reaches the pier", () => {
  const { engine, close } = engineFixture();
  const pose = layout.boatPoseAt(45);
  const player = engine.createPlayer({ pid: "friend", nick: "friend", skin: 1, ...pose, moving: true, pose: "standing", spotId: null, slot: null });
  engine.players.set("friend", player);
  engine.updatePlayers(.05);
  const state = player.avatar.states.at(-1);
  assert.ok(state.seated); assert.equal(state.moving, false); near(state.seated.avatarY, layout.BOAT_SEAT_Y);
  near(state.seated.yaw, layout.boatHeadingAt(pose.x, pose.z)); assert.equal(player.shadow.visible, false);
  Object.assign(player.cur, pierEnd(GARDEN_PIERS[1])); Object.assign(player.target, player.cur, { moving: false });
  engine.updatePlayers(.05);
  assert.equal(player.avatar.states.at(-1).seated, null); assert.equal(player.sprite.geometry.userData.seated, false);
  close();
});

test("portrait and landscape boat cameras keep hull and seated head inside the view", () => {
  for (const aspect of [390 / 844, 16 / 9]) {
    const { engine, boats, close } = engineFixture(0, aspect);
    engine.toggleBoat(); engine.placeBoatCamera(0); engine.camera.updateMatrixWorld(true);
    const pose = boats.pose;
    for (const x of [-1.3, 1.3]) for (const y of [-.32, 1.9]) for (const z of [-2.5, 2.5]) {
      const p = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw).add(new THREE.Vector3(pose.x, 0, pose.z)).project(engine.camera);
      assert.ok(Math.abs(p.x) < .98 && Math.abs(p.y) < .98, `whole boat stays framed at ${aspect}: ${p.x}, ${p.y}`);
    }
    close();
  }
});

test("the rendered frame shares one boat position and a seated first-person eye without steering the passenger", () => {
  const { engine, boats, close } = engineFixture();
  engine.toggleBoat(); engine.view = "first";
  engine.self.yaw += .65; const lookYaw = engine.self.yaw;
  for (const time of [1, 4, 4.05, 4.10]) {
    engine.time = time;
    engine.updateSelf(.05); engine.updatePlayers(.05); engine.updateWorld(.05);
    const seat = layout.boatSeatAt(boats.pose, time), state = engine.selfNode.avatar.states.at(-1);
    near(engine.self.x, boats.pose.x); near(engine.self.z, boats.pose.z);
    near(state.seated.x, boats.pose.x); near(state.seated.z, boats.pose.z);
    near(engine.camera.position.y, seat.avatarY + .78);
    near(engine.camera.position.x, boats.pose.x); near(engine.camera.position.z, boats.pose.z);
    near(engine.self.yaw, lookYaw, "the passenger can keep looking away from the boat's heading");
    assert.equal(state.visible, false);
  }
  close();
});

test("reserved alighting restores the standing avatar and pier camera in the arrival frame", () => {
  const { engine, boats, close } = engineFixture();
  engine.toggleBoat(); engine.updateSelfAvatarBase(0);
  boats.update(4, .05, boats.pose, []); engine.toggleBoat();
  boats.s = layout.BOAT_ROUTE.stopAt[1] - .02;
  boats.ownPose = layout.boatPoseAt(boats.s);
  engine.time = 5;
  engine.updateWorld(.05);
  assert.equal(boats.isRiding, false);
  assert.equal(engine.selfNode.avatar.states.at(-1).seated, null);
  assert.equal(engine.selfNode.sprite.geometry.userData.seated, false);
  assert.ok(!layout.isWater(engine.self.x, engine.self.z));
  near(engine.eyeHeight, PIER_Y + 1.55);
  assert.ok(engine.camera.position.toArray().every(Number.isFinite));
  close();
});
