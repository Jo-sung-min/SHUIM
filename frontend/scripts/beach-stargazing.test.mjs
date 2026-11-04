import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { inflateSync } from "node:zlib";
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
  // Execute the real drag handler without constructing the WebGL renderer.
  if (file.endsWith("/engine.ts")) source = source.replace(/\bonPointerMove\s*=\s*\(([^)]*)\)\s*=>\s*\{/, "onPointerMove($1) {");
  const context = { ...hotSpring, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const geometry = await load("../lib/beach/stargazing.ts", { THREE }, ["STARGAZING", "stargazingSlot", "claimedStargazingSlot", "stargazingBodyPoint", "applyLyingTransform", "stargazingApproach", "stargazingCameraDistance", "buildStargazingZone"]);
const { STARGAZING, stargazingSlot, stargazingBodyPoint, applyLyingTransform, stargazingApproach, buildStargazingZone } = geometry;
const atlas = await load("../lib/beach/atlas.ts", {}, ["CHAR_ATLAS", "CHAR_VIEW", "CHAR_ANIM"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const bedding = await load("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry, ...textiles }, ["SHELTERS", "SHELTER_SEATS", "SHELTER_COLLIDERS", "BED_CAPACITY", "BED_AVATAR_Y", "bedSlot", "claimedBedSlot", "buildShelters"]);
const benches = await load("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["FIRE_BENCH_SEATS", "FIRE_BENCH_REACH", "claimedFireBenchSlot"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["findClearApproach", "findWalkingPath", "resolveWalls"]);
const { BeachEngine } = await load("../lib/beach/engine.ts", {
  THREE, ...geometry, ...atlas, ...bedding, ...benches, ...navigation, CAMPFIRE: { x: 0, z: 12 }, performance,
  document: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
}, ["BeachEngine"]);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} ≈ ${expected}`);
const rest = (slot) => ({ pose: "lying", ...stargazingSlot(slot) });
const standing = { pose: "standing", spotId: null, slot: null, x: 2, z: 4, yaw: 0.3 };

// Read the approved sprite pixels: a geometric point high on the head only tests hair visibility.
const spritePng = await readFile(new URL("../public/beach/chars-v2.png", import.meta.url));
const spriteWidth = spritePng.readUInt32BE(16), spriteHeight = spritePng.readUInt32BE(20);
const compressedPixels = [];
for (let offset = 8; offset < spritePng.length;) {
  const length = spritePng.readUInt32BE(offset);
  if (spritePng.toString("ascii", offset + 4, offset + 8) === "IDAT") compressedPixels.push(spritePng.subarray(offset + 8, offset + 8 + length));
  offset += length + 12;
}
const scanlines = inflateSync(Buffer.concat(compressedPixels)), stride = spriteWidth * 4;
const spritePixels = Buffer.alloc(spriteHeight * stride);
for (let y = 0; y < spriteHeight; y++) {
  const filter = scanlines[y * (stride + 1)];
  for (let x = 0; x < stride; x++) {
    const at = y * stride + x, a = x >= 4 ? spritePixels[at - 4] : 0, b = y ? spritePixels[at - stride] : 0;
    const c = x >= 4 && y ? spritePixels[at - stride - 4] : 0;
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    const prediction = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
    spritePixels[at] = (scanlines[y * (stride + 1) + x + 1] + prediction) & 255;
  }
}
const facePixels = [
  { skin: 0, x: 29, y: 32 }, { skin: 0, x: 43, y: 32 }, { skin: 0, x: 35, y: 36 },
  { skin: 1, x: 29, y: 30 }, { skin: 1, x: 43, y: 30 }, { skin: 1, x: 35, y: 34 },
];
for (const pixel of facePixels) {
  const offset = ((pixel.skin * atlas.CHAR_ATLAS.cellH + pixel.y) * spriteWidth + pixel.x) * 4;
  assert.equal(spritePixels[offset + 3], 255, "face samples must belong to opaque approved character artwork");
}

function fixture() {
  const states = [];
  const camera = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 520);
  camera.rotation.order = "YXZ";
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    scene: new THREE.Scene(), camera, sky: new THREE.Mesh(), followCam: new THREE.Vector3(), followSnap: true,
    self: { x: 0, z: 3, yaw: 0.2, pitch: 0.07, moving: false, bobT: 0 }, view: "first", mobile: false,
    skyRest: null, beforeSkyRest: null, restSeat: null, returnFromSeat: null, lastRestState: "", lastStargazingState: "",
    keys: new Set(), move: { x: 0, y: 0 }, auto: null, faceGoal: null, players: new Map(), selected: null,
    charTex: new THREE.Texture(), daylight: { tint: [1, 1, 1] }, skin: 0, time: 0, nearFire: false,
    shadowGeo: new THREE.PlaneGeometry(1, 1), shadowMat: new THREE.MeshBasicMaterial(),
    ring: new THREE.Mesh(), ringMat: new THREE.MeshBasicMaterial(),
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, look: { active: false },
    handlers: { onSelect() {}, onStargazingChange: (state) => states.push(state) },
    deckHeight: () => 0, eyeHeight: 1.55,
  });
  engine.selfNode = engine.createSelfAvatar();
  return { engine, camera, states };
}

test("the client circle matches the server's authoritative center, radius and eight slots", async () => {
  const java = await readFile(new URL("../../backend/src/main/java/kr/co/shuim/beach/BeachRoom.java", import.meta.url), "utf8");
  const number = (name) => Number(java.match(new RegExp(`\\b${name}\\s*=\\s*([\\d.]+)`))?.[1]);
  assert.equal(STARGAZING.id, java.match(/REST_SPOT\s*=\s*"([^"]+)"/)?.[1]);
  assert.equal(STARGAZING.capacity, number("REST_SLOTS"));
  assert.equal(STARGAZING.x, number("REST_X"));
  assert.equal(STARGAZING.z, number("REST_Z"));
  assert.equal(STARGAZING.feetRadius, number("REST_FEET_RADIUS"));
  assert.ok(STARGAZING.approachRadius + 0.3 < number("REST_REACH"), "automatic arrival is safely inside server reach");
  assert.ok(STARGAZING.nearRadius <= number("REST_REACH"));
});

test("all eight flat avatars keep their feet on the assigned mat and heads facing inward", () => {
  for (let i = 0; i < 8; i++) {
    const slot = stargazingSlot(i), object = new THREE.Object3D();
    applyLyingTransform(object, slot);
    object.updateMatrixWorld();
    const feet = new THREE.Vector3(0, 0, 0).applyMatrix4(object.matrixWorld);
    const head = new THREE.Vector3(0, 1.8, 0).applyMatrix4(object.matrixWorld);
    close(feet.x, slot.x); close(feet.z, slot.z); close(head.y, STARGAZING.avatarY);
    close(Math.hypot(head.x - 7, head.z - 7), 2.65 - 1.8);
    const frontNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(object.quaternion);
    close(frontNormal.y, 1, "the front artwork faces the sky");
  }
  assert.equal(stargazingSlot(-1), null);
  assert.equal(stargazingSlot(8), null);
});

test("the visible circle contains eight radial mats and its approach stays outside their feet", () => {
  const scene = new THREE.Scene();
  const zone = buildStargazingZone(scene);
  zone.updateMatrixWorld(true);
  const mats = zone.children.filter((object) => object.name.startsWith("stargazing-mat-"));
  assert.equal(mats.length, 8);
  for (const mat of mats) {
    const slot = stargazingSlot(mat.userData.slot);
    const feet = new THREE.Vector3().applyMatrix4(mat.matrixWorld);
    close(feet.x, slot.x); close(feet.z, slot.z);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(mat.matrixWorld);
    close(normal.y, 1);
  }
  for (const [x, z] of [[0, 3], [7, 7], [20, 30]]) {
    const approach = stargazingApproach(x, z);
    close(Math.hypot(approach.x - 7, approach.z - 7), 3.8);
  }
});

test("walking to the circle does not claim a mat, and cancelling leaves the player standing", async () => {
  const { engine } = fixture();
  const walk = engine.walkToStargazing();
  assert.equal(engine.isLying, false);
  engine.cancelAutoWalk();
  assert.equal(await walk, "cancelled");
  assert.equal(engine.isLying, false);
});

test("confirmed lying blocks movement, preserves dragged sky view across ticks, and standing only applies once", () => {
  const { engine, camera } = fixture();
  engine.applyRest(standing);
  close(engine.self.x, 0, "ordinary standing ticks must not snap a walking player");
  engine.applyRest(rest(0));
  assert.equal(engine.isLying, true);
  assert.equal(engine.viewMode, "third", "lying begins with the character visible");
  engine.setView("first");
  engine.self.pitch = 0.97; engine.self.yaw = 0.8;
  engine.applyRest(rest(0));
  close(engine.self.pitch, 0.97); close(engine.self.yaw, 0.8);
  engine.keys.add("w"); engine.move = { x: 1, y: 1 };
  engine.updateSelf(0.1);
  close(engine.self.x, rest(0).x); close(engine.self.z, rest(0).z);
  assert.equal(engine.self.moving, false);
  close(engine.getSelf().yaw, rest(0).yaw, "head dragging never rotates the body's server pose");
  const head = stargazingBodyPoint(rest(0), 1.42);
  close(camera.position.x, head.x); close(camera.position.z, head.z);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > 0.7);
  assert.equal(camera.layers.mask, 2, "only the dedicated sky layer renders; cliffs and buildings are excluded");
  engine.applyRest(standing);
  assert.equal(engine.isLying, false);
  close(engine.self.x, 2); close(engine.self.pitch, 0.07);
  engine.self.x = 3;
  engine.applyRest(standing);
  close(engine.self.x, 3);
});

test("overhead view fits the complete circle at phone and narrow desktop aspect ratios", () => {
  for (const aspect of [320 / 844, 390 / 844, 1920 / 911]) {
    const { engine, camera } = fixture();
    camera.aspect = aspect; camera.updateProjectionMatrix();
    engine.applyRest(rest(0)); engine.setView("third"); engine.updateSelf(0.016);
    camera.updateMatrixWorld();
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
      const point = new THREE.Vector3(7 + Math.sin(angle) * 3.4, 0, 7 + Math.cos(angle) * 3.4).project(camera);
      assert.ok(Math.abs(point.x) < 0.95 && Math.abs(point.y) < 0.95, "the circle has a clear margin on every edge");
    }
  }
});

test("remote lying poses stay fixed as the camera moves, occupancy deduplicates slots, and labels stay modest", () => {
  const { engine, camera, states } = fixture();
  const players = [1, 2, 7, 1].map((slot, i) => ({ pid: `p${i}`, id: `u${i}`, nick: "별", skin: i % 2, moving: false, ...rest(slot) }));
  engine.setPlayers(players); engine.applyRest(rest(0)); engine.updatePlayers(1);
  assert.equal(states.at(-1).occupied, 4);
  const node = engine.players.get("p0");
  const before = node.sprite.quaternion.clone();
  camera.position.set(15, 10, 20); engine.updatePlayers(1);
  assert.ok(before.equals(node.sprite.quaternion), "lying sprites never spin toward the camera");
  assert.equal(node.shadow.visible, false);
  assert.equal(node.label.visible, false, "unselected lying names never cover the circle");
  engine.setPlayers([{ ...players[0], pose: "standing", spotId: null, slot: null }]);
  camera.position.set(players[0].x + 1, 1, players[0].z); engine.updatePlayers(1);
  close(node.sprite.rotation.x, 0);
  assert.equal(node.shadow.visible, true);
  assert.equal(node.label.visible, false, "a nearby name badge cannot fill the screen");
});

test("every hut bed keeps the face visible above the duvet and the camera below the real roof", () => {
  for (const shelter of bedding.SHELTERS) for (let slot = 0; slot < 3; slot++) {
    for (const aspect of [390 / 844, 1920 / 911]) {
      const { engine, camera } = fixture();
      camera.aspect = aspect; camera.updateProjectionMatrix();
      bedding.buildShelters(engine.scene);
      const bed = bedding.bedSlot(`hut-${shelter.id}`, slot);
      engine.applyRest({ pose: "lying", ...bed });
      assert.equal(engine.viewMode, "third");
      assert.equal(engine.isBedLying, true);
      engine.updateSelf(0.016);
      engine.scene.updateMatrixWorld(true); camera.updateMatrixWorld();
      assert.equal(camera.layers.mask, 1);
      assert.ok(camera.position.y < 3.1 && camera.position.z < shelter.z - 2, "camera stays inside the open front, below rafters");
      const roomMeshes = engine.scene.children.filter((node) => node.name.startsWith("shelters-"));
      for (const pixel of facePixels) {
        const face = new THREE.Vector3((pixel.x + .5 - 36) * 1.8 / 104, (104 - pixel.y - .5) * 1.8 / 104, 0).applyMatrix4(engine.selfNode.sprite.matrixWorld);
        const projected = face.clone().project(camera);
        assert.ok(Math.abs(projected.x) < .9 && Math.abs(projected.y) < .9, "actual eyes and cheeks remain inside portrait and landscape framing");
        const distance = camera.position.distanceTo(face);
        const sightline = new THREE.Raycaster(camera.position, face.clone().sub(camera.position).normalize(), 0.05, distance - .005);
        assert.equal(sightline.intersectObjects(roomMeshes, false).length, 0, `slot ${slot} in ${shelter.id}: actual face pixel ${pixel.skin}/${pixel.x}/${pixel.y} is visible above the duvet`);
      }
      const chest = new THREE.Vector3(0, .7, 0).applyMatrix4(engine.selfNode.sprite.matrixWorld);
      const duvetRay = new THREE.Raycaster(chest.clone().add(new THREE.Vector3(0, .5, 0)), new THREE.Vector3(0, -1, 0), 0, .5);
      assert.ok(duvetRay.intersectObject(engine.scene.getObjectByName("shelters-duvets"), false).length > 0, "the soft duvet covers the body above the avatar plane");
    }
  }
});

test("every bed offers a low first-person sea view above its pillow and through the actual open front", () => {
  for (const shelter of bedding.SHELTERS) for (let slot = 0; slot < 3; slot++) {
    for (const aspect of [390 / 844, 1920 / 911]) {
      const { engine, camera } = fixture();
      camera.aspect = aspect; camera.updateProjectionMatrix();
      bedding.buildShelters(engine.scene);
      const bed = bedding.bedSlot(`hut-${shelter.id}`, slot);
      engine.applyRest({ pose: "lying", ...bed });
      engine.setView("first"); engine.updateSelf(0.016);
      engine.scene.updateMatrixWorld(true); camera.updateMatrixWorld();
      assert.equal(engine.viewMode, "first");
      assert.equal(engine.selfNode.sprite.visible, false, "first person hides only the local character");
      assert.equal(camera.layers.mask, 1, "the beach and hut stay visible instead of switching to the sky-only layer");
      const body = new THREE.Object3D();
      applyLyingTransform(body, bed); body.updateMatrixWorld();
      const head = new THREE.Vector3(0, 1.42, 0).applyMatrix4(body.matrixWorld);
      close(camera.position.x, head.x); close(camera.position.z, head.z);
      assert.ok(camera.position.y > head.y + 0.1 && camera.position.y < head.y + 0.2, "eyes clear the raised head and pillow");
      assert.ok(camera.position.y > 1.2 && camera.position.y < 1.5, "lying keeps a low resting eye height below the roof");
      assert.ok(camera.getWorldDirection(new THREE.Vector3()).z < -0.99, "the initial view faces the sea at negative Z");
      close(engine.getSelf().yaw, bed.yaw, "camera direction never turns the body away from its assigned bed");
      const roomMeshes = engine.scene.children.filter(node => node.name.startsWith("shelters-"));
      // Solid window frames are intentional. Each bed has a clear default view,
      // plus a line through the center doorway and its nearest picture window.
      const openingZ = shelter.z - shelter.depth / 2 - 0.15;
      const targets = slot === 1 ? [shelter.x] : [bed.x, shelter.x, shelter.x + Math.sign(bed.x - shelter.x) * 3.3];
      for (const targetX of targets) {
        const yaw = Math.atan2(camera.position.x - targetX, camera.position.z - openingZ), pitch = 0;
        assert.ok(Math.abs(yaw) <= 0.3, "the opening is within the bed's comfortable turning range");
        engine.self.yaw = yaw; engine.self.pitch = pitch;
        engine.updateSelf(0.016); camera.updateMatrixWorld();
        const direction = camera.getWorldDirection(new THREE.Vector3());
        const distanceToOpening = (shelter.z - shelter.depth / 2 - 0.15 - camera.position.z) / direction.z;
        const sightline = new THREE.Raycaster(camera.position, direction, 0.05, distanceToOpening);
        assert.equal(sightline.intersectObjects(roomMeshes, false).length, 0,
          `${shelter.id}/${slot}: bed view clears quilt, curtains and rafters at yaw ${yaw}, pitch ${pitch}`);
      }
    }
  }
});

test("bed dragging uses sea-view limits, duplicate claims preserve the view, and standing restores the prior pitch", () => {
  const { engine, camera } = fixture();
  const drag = (dx, dy) => {
    engine.look = { active: true, id: 1, lx: 0, ly: 0, sx: 0, sy: 0, moved: false };
    engine.onPointerMove({ pointerId: 1, pointerType: "touch", clientX: dx, clientY: dy });
  };
  const bed = bedding.bedSlot("hut-wave", 1);
  engine.applyRest({ pose: "lying", ...bed });
  engine.toggleView();
  assert.equal(engine.viewMode, "first");
  close(engine.self.yaw, 0);
  assert.ok(Math.abs(engine.self.pitch) < 0.1, "bed view does not inherit the upward star-view angle");
  drag(10000, 10000);
  close(engine.self.yaw, -0.3); close(engine.self.pitch, -0.08);
  drag(-10000, -10000);
  close(engine.self.yaw, 0.3); close(engine.self.pitch, 0.18);
  engine.applyRest({ pose: "lying", ...bed });
  close(engine.self.yaw, 0.3); close(engine.self.pitch, 0.18);
  engine.updateSelf(0.016); camera.updateMatrixWorld();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).z < -0.9, "dragged view remains through the sea-facing opening");
  engine.toggleView(); engine.updateSelf(0.016);
  assert.equal(engine.viewMode, "third");
  assert.equal(engine.selfNode.sprite.visible, true);
  assert.ok(camera.position.y < 3.1 && camera.position.z < bed.z - 3, "third person returns to the front of the deeper bedroom");
  engine.toggleView();
  close(engine.self.yaw, 0);
  assert.ok(Math.abs(engine.self.pitch) < 0.1);
  engine.applyRest(standing); engine.updateSelf(0.016);
  assert.equal(engine.isLying, false);
  close(engine.self.x, standing.x); close(engine.self.z, standing.z);
  close(engine.self.yaw, standing.yaw); close(engine.self.pitch, 0.07);
  close(camera.position.y, 1.55, "standing restores ordinary eye height");
});

test("star-view dragging retains its sky-only first-person and overhead third-person limits", () => {
  const { engine, camera } = fixture();
  const drag = dy => {
    engine.look = { active: true, id: 1, lx: 0, ly: 0, sx: 0, sy: 0, moved: false };
    engine.onPointerMove({ pointerId: 1, pointerType: "touch", clientX: 0, clientY: dy });
  };
  engine.applyRest(rest(2)); engine.setView("first");
  close(engine.self.pitch, 1.5);
  drag(10000); close(engine.self.pitch, 1.4);
  drag(-10000); close(engine.self.pitch, 1.56);
  engine.updateSelf(0.016);
  assert.equal(camera.layers.mask, 2);
  engine.setView("third");
  drag(10000); close(engine.self.pitch, 0.88);
  drag(-10000); close(engine.self.pitch, 1.5);
  engine.updateSelf(0.016);
  assert.equal(camera.layers.mask, 1);
  assert.equal(engine.selfNode.sprite.visible, true);
});

test("bed occupancy is per hut, excludes star mats, and local/remote occupants use the same raised pose", () => {
  const { engine, states } = fixture();
  const bed = bedding.bedSlot("hut-pine", 1);
  const bedEvents = [];
  engine.handlers.onBedChange = (state) => bedEvents.push(state);
  engine.applyRest({ pose: "lying", ...bed });
  const players = [bedding.bedSlot("hut-pine", 0), bedding.bedSlot("hut-wave", 1), stargazingSlot(0)]
    .map((claim, i) => ({ pid: `bed-${i}`, id: `u${i}`, nick: "쉼", skin: 0, moving: false, pose: "lying", ...claim }));
  engine.setPlayers(players); engine.updatePlayers(1); engine.updateSelf(0.016);
  assert.equal(engine.getBedState().occupied, 2);
  assert.equal(bedEvents.at(-1).spotId, "hut-pine");
  assert.equal(states.at(-1).lying, false);
  assert.equal(states.at(-1).occupied, 1, "beds never consume a circle mat");
  close(engine.players.get("bed-0").sprite.position.y, bedding.BED_AVATAR_Y);
  close(engine.selfNode.sprite.rotation.x, engine.players.get("bed-0").sprite.rotation.x);
  engine.applyRest({ pose: "standing", spotId: null, slot: null, x: -13, z: 21.8, yaw: 0 });
  assert.equal(engine.isLying, false);
  assert.equal(engine.getBedState().occupied, 1);
  assert.equal(engine.getBedState().lying, false);
});
