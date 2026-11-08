import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/^export \{[^\n]+\} from [^\n]+$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(",")} };`, context);
  return context.api;
}

const trail = await load("../lib/beach/bamboo-trail.ts", {}, [
  "BAMBOO_BOUNDS", "TRAIL_WALK_HALF", "PAVILION_REACH", "PAVILION_SEAT_CAPACITY", "PAVILION_RISE", "DECK_RISE", "DECK_BENCH_HEIGHT",
  "MOUNTAIN", "SUMMIT", "MEADOW", "SUMMIT_HEIGHT",
  "BAMBOO_PAVILIONS", "BAMBOO_PAVILION_SEATS", "BAMBOO_PAVILION_OBSTACLES", "BAMBOO_PAVILION_COLLIDERS", "BAMBOO_LANTERNS", "BAMBOO_FENCES",
  "BAMBOO_GUESTBOOK", "BAMBOO_GUESTBOOK_OBSTACLES", "isNearBambooGuestbook",
  "TRAIL_POLYLINES", "pavilionWorld", "pavilionLocal", "pavilionSeat", "claimedPavilionSeat", "nearbyBambooPavilion", "summitGroveSites",
  "mountainHeight", "groundHeight", "bambooFloorHeight", "bambooCeilingHeight", "nearestOnTrail", "onTrail", "resolveTrail", "bambooStalkSites", "trailLength",
  "SECRET_GARDEN", "SECRET_GARDEN_ZONES", "SECRET_GARDEN_PATHS", "insideSecretGarden",
]);
const { daylightAt, bambooDaylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt", "bambooDaylightAt"]);
const maps = await load("../lib/beach/maps.ts", {}, ["MAPS", "mapHref"]);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
const byId = id => trail.BAMBOO_PAVILIONS.find(p => p.id === id);

const { BambooFestivalToys } = await load("../lib/beach/bamboo-festival-toys.ts", { THREE }, ["BambooFestivalToys"]);

test("the held balloon and fan stay inside the first-person frame in portrait and landscape", () => {
  const scene = new THREE.Scene(), toys = new BambooFestivalToys(scene);
  const world = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const aspect of [320/932, 390/844, 16/9, 844/390]) {
    const camera = new THREE.PerspectiveCamera(82, aspect, .1, 520);
    camera.position.set(3, 22, 98);
    camera.rotation.set(.4, 2.6, 0, "YXZ");
    for (const kind of ["fan", "balloon"]) {
      toys.beginFrame(3.2);
      toys.hold(kind, point, 0, "visitor", camera, 215);
      toys.endFrame(3200);
      const batch = scene.getObjectByName(kind === "fan" ? "festival-taegeuk-fan" : "festival-balloon-film");
      batch.getMatrixAt(0, world);
      assert.equal(batch.geometry.getAttribute("firstPersonToy").getX(0), 1);
      const vertices = batch.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(world).project(camera);
        assert.ok(Math.abs(point.x) < .88 && point.y > -.71 && point.y < .75, `${kind} screen bounds at ${aspect}`);
        assert.ok(Math.abs(point.z) < 1);
      }
    }
  }
  toys.dispose();
});

test("other visitors see a shared colored globe above the avatar and a fan extending out from the palm", () => {
  const scene = new THREE.Scene(), toys = new BambooFestivalToys(scene);
  const grip = new THREE.Vector3(.24, .51, 0), world = new THREE.Matrix4(), point = new THREE.Vector3();
  toys.beginFrame(2);
  for (const [id, hue] of [["one", 320], ["two", 320], ["three", 45]]) toys.hold("balloon", grip, 0, id, undefined, hue);
  toys.hold("fan", grip, 0, "visitor");
  toys.endFrame(2000);
  const shell = scene.getObjectByName("festival-balloon-film"), halo = scene.getObjectByName("festival-balloon-leds");
  const colors = [0, 1, 2].map(i => { const c = new THREE.Color(); shell.getColorAt(i, c); return c.getHex(); });
  assert.equal(colors[0], colors[1]); assert.notEqual(colors[0], colors[2]);
  assert.deepEqual(halo.instanceColor.array.slice(0, 9), shell.instanceColor.array.slice(0, 9));
  assert.equal(shell.geometry.getAttribute("firstPersonToy").getX(0), 0, "remote toys retain ordinary scene depth");
  shell.getMatrixAt(0, world);
  shell.geometry.computeBoundingBox();
  assert.ok(shell.geometry.boundingBox.clone().applyMatrix4(world).min.y > 1.9);
  const fan = scene.getObjectByName("festival-taegeuk-fan");
  fan.getMatrixAt(0, world);
  assert.ok(point.setFromMatrixPosition(world).distanceTo(grip) < 1e-6);
  const paper = fan.geometry.getAttribute("paper"), vertices = fan.geometry.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) if (paper.getX(i) === 1) {
    assert.ok(point.fromBufferAttribute(vertices, i).applyMatrix4(world).x > .31, "the paper clears the chest");
  }
  toys.dispose();
});

test("the festival board stands beside the deck and can be approached from the trail", async () => {
  const board = trail.BAMBOO_GUESTBOOK;
  const deck = trail.BAMBOO_PAVILIONS.find(p => p.kind === "deck");
  const obstacles = trail.BAMBOO_GUESTBOOK_OBSTACLES;
  const radius = 0.25;
  for (const post of obstacles) assert.ok(post.x - post.r > deck.x + 4.5);
  const clear = (x, z) => obstacles.every(o => Math.hypot(x - o.x, z - o.z) > o.r + radius);
  near(Math.sin(board.yaw), -1, "the front faces the viewer looking left from the deck");
  near(Math.cos(board.yaw), 0, "the panel runs parallel to the rail");
  near(board.z, deck.z, "turning exactly left from the middle centres the panel");
  const boardFloor = trail.bambooFloorHeight(board.x, board.z);
  const { buildBambooGuestbook } = await load("../lib/beach/bamboo-guestbook.ts", { ...trail, THREE, mergeGeometries }, ["buildBambooGuestbook"]);
  const parent = new THREE.Group(), model = buildBambooGuestbook(parent);
  const physical = parent.getObjectByName("bamboo-summit-guestbook");
  const frame = physical.children[0].geometry, stone = new THREE.Color(0x807773);
  const vertices = frame.getAttribute("position"), colors = frame.getAttribute("color");
  for (const end of [-1, 1]) {
    const corners = [];
    for (let i = 0; i < vertices.count; i++) {
      if (Math.sign(vertices.getX(i)) !== end || Math.abs(colors.getX(i) - stone.r) > 1e-6) continue;
      corners.push(physical.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i)));
    }
    assert.ok(corners.length > 0);
    const low = Math.min(...corners.map(p => p.y));
    const high = Math.max(...corners.map(p => p.y));
    for (const p of corners) {
      const ground = trail.bambooFloorHeight(p.x, p.z);
      assert.ok(low < ground && high > ground, "the stone extends into the hillside at every corner");
    }
  }
  model.dispose();
  for (const [width, height] of [[360, 800], [390, 844]]) {
    const camera = new THREE.PerspectiveCamera(82, width / height, 0.1, 500);
    camera.position.set(deck.x, deck.floorY + 1.55, deck.z);
    camera.rotation.y = -Math.PI / 2;
    camera.updateMatrixWorld();
    for (const sign of [-1, 1]) {
      const lampEdge = new THREE.Vector3(board.x - 0.22, boardFloor + 1.62 * board.scale, board.z + sign * 2.22 * board.scale);
      assert.ok(Math.abs(lampEdge.project(camera).x) < 0.97, "both lanterns fit a straight left turn on a portrait phone");
    }
  }
  for (let along = -board.halfWidth; along <= board.halfWidth; along += 0.05) {
    assert.equal(clear(board.x + along * Math.cos(board.yaw), board.z - along * Math.sin(board.yaw)), false);
  }
  const x = board.x + Math.sin(board.yaw) * 1.4;
  const z = board.z + Math.cos(board.yaw) * 1.4;
  assert.ok(clear(x, z) && Math.hypot(x - board.x, z - board.z) < board.reach);
  assert.ok(trail.onTrail(x, z));
  for (const dz of [-board.halfWidth, 0, board.halfWidth]) {
    assert.ok(trail.isNearBambooGuestbook(x, board.z + dz), "both ends can be read up close");
  }
  assert.ok(trail.isNearBambooGuestbook(deck.x + 4.1, deck.z), "the prompt reaches the left rail");
  assert.equal(trail.isNearBambooGuestbook(deck.x, deck.z), false);
  assert.equal(trail.isNearBambooGuestbook(board.x + 4.0, board.z), false, "the longer reading distance applies only in front");
  assert.equal(trail.isNearBambooGuestbook(deck.x + 4.1, board.z + board.halfWidth + 2.0), false);
  const lamp = trail.BAMBOO_LANTERNS.find(p => p.pavilionId === deck.id && p.x > deck.x);
  for (const seat of trail.BAMBOO_PAVILION_SEATS.filter(p => p.pavilionId === deck.id)) {
    const lampFraction = (lamp.x - seat.x) / (board.x - seat.x);
    const visibleZ = seat.z + (lamp.z - seat.z) / lampFraction;
    assert.ok(Math.abs(visibleZ - board.z) > board.halfWidth + 0.4, "the near deck lantern stays clear of the notes");
  }
  for (const seat of trail.BAMBOO_PAVILION_SEATS) assert.ok(clear(seat.x, seat.z));
});

test("the follow camera stops before the large board even when its target lies beyond it", async () => {
  const { buildBambooGuestbook } = await load("../lib/beach/bamboo-guestbook.ts", { ...trail, THREE, mergeGeometries }, ["buildBambooGuestbook"]);
  const model = buildBambooGuestbook(new THREE.Group());
  const board = trail.BAMBOO_GUESTBOOK, y = trail.bambooFloorHeight(board.x, board.z) + 1.25;
  for (const side of [-1, 1]) {
    const fromX = board.x + side * 2.3;
    const camera = new THREE.Vector3(board.x - side * 2.67, y + 1.6, board.z);
    model.clipCamera(fromX, y, board.z, camera);
    assert.ok(side * (camera.x - board.x) > 0.15, "the board never cuts between the camera and the visitor");
    assert.ok(Math.abs(camera.x - fromX) > 0.5, "leave room for the avatar");
  }
  const outside = new THREE.Vector3(board.x + 3, y, board.z + board.halfWidth + 2);
  const before = outside.clone();
  model.clipCamera(board.x - 2, y, outside.z, outside);
  assert.ok(outside.equals(before), "the orbit stays free beyond the end of the board");
  model.dispose();
});

test("the summit's bamboo frames the river from the book, both ends of the bench and the front rail", () => {
  const sites = trail.summitGroveSites(trail.groundHeight);
  const radians = Math.PI / 180;
  assert.ok(sites.length <= 255, "the mobile grove fits in the existing instanced batches");
  for (const side of [-1, 1]) {
    const grove = sites.filter(site => Math.sign(site.x) === side);
    for (const site of grove) {
      assert.equal(trail.onTrail(site.x, site.z), false);
      for (const eyeX of [-3.75, 0, 3.75]) for (const eyeZ of [97.6, 102.2, 109.4]) {
        const angle = Math.abs(Math.atan2(site.x-eyeX, site.z-eyeZ));
        const crown = Math.asin(3.8 / Math.hypot(site.x-eyeX, site.z-eyeZ));
        assert.ok(angle - crown > 36 * radians, "the central bridge and tower remain open");
      }
    }
    for (const [eyeX, eyeZ] of [[3.1, 98.25], [-3.75, 102.2], [3.75, 102.2], [0, 109.4]]) {
      for (const bearing of [80, 90, 100]) {
        const flanking = grove.filter(site =>
          Math.abs(side * Math.atan2(site.x - eyeX, site.z - eyeZ) - bearing * radians) < 8 * radians);
        assert.ok(flanking.some(site => site.height < 6) && flanking.some(site => site.height > 10),
          "young and mature stems screen the bare lateral slope");
        const depths = flanking.map(site => Math.hypot(site.x - eyeX, site.z - eyeZ));
        assert.ok(Math.max(...depths) - Math.min(...depths) > 7, `the stands overlap at different distances: side=${side}, eye=${eyeX},${eyeZ}, bearing=${bearing}, depths=${depths.map(d => d.toFixed(1))}`);
      }
    }
  }
});

test("the loop is a long climb that starts at the shared arrival point and stays inside the wider room", () => {
  const loop = trail.TRAIL_POLYLINES.find(line => line.id === "loop");
  assert.ok(loop.closed && loop.points.length >= 100);
  const length = trail.trailLength(loop);
  assert.ok(length > 200 && length < 280, `loop length ${length}`);
  for (const [x, z] of loop.points) {
    assert.ok(x > trail.BAMBOO_BOUNDS.minX + 1.5 && x < trail.BAMBOO_BOUNDS.maxX - 1.5, `x ${x}`);
    assert.ok(z > trail.BAMBOO_BOUNDS.minZ + 1 && z < trail.BAMBOO_BOUNDS.maxZ - 1, `z ${z}`);
  }
  assert.deepEqual([trail.BAMBOO_BOUNDS.minX, trail.BAMBOO_BOUNDS.maxX, trail.BAMBOO_BOUNDS.minZ, trail.BAMBOO_BOUNDS.maxZ], [-55, 44, -4, 115]);
  assert.ok(trail.onTrail(0, 3), "the server's arrival point is on the entrance stem");
  assert.ok(trail.onTrail(0.8, 3.4) && trail.onTrail(-1.2, 3.2));
  assert.deepEqual([...trail.TRAIL_POLYLINES].filter(line => !line.id.startsWith("secret-")).map(line => line.id), ["loop", "entrance", "spur-step", "spur-wind", "spur-pine", "spur-moon", "spur-summit"]);
});

test("the mountain rises from a flat trailhead to a flat summit, with the path terraced across the slope", () => {
  assert.ok(Math.abs(trail.mountainHeight(0, 3)) < 0.8, "the trailhead is level ground");
  assert.ok(trail.SUMMIT_HEIGHT > 18 && trail.SUMMIT_HEIGHT < 22, `summit ${trail.SUMMIT_HEIGHT}`);
  const foot = trail.groundHeight(0, 7), middle = trail.groundHeight(-26, 40), top = trail.groundHeight(0, 90);
  assert.ok(foot < middle && middle < top, `the loop climbs: ${foot} < ${middle} < ${top}`);
  assert.ok(top > trail.SUMMIT_HEIGHT - 0.5, "the top of the loop is on the summit plateau");
  for (const [x, z] of [[-26, 40], [25, 56], [19, 26]]) {
    const hit = trail.nearestOnTrail(x, z);
    const across = { x: -hit.tz, z: hit.tx };
    const left = trail.groundHeight(hit.x + across.x, hit.z + across.z), right = trail.groundHeight(hit.x - across.x, hit.z - across.z);
    assert.ok(Math.abs(left - right) < 0.05, `no sideways tilt across the path at (${x}, ${z}): ${left} vs ${right}`);
  }
  for (const clearing of [trail.SUMMIT, trail.MEADOW]) {
    const centre = trail.groundHeight(clearing.x, clearing.z);
    for (const [dx, dz] of [[3, 0], [-3, 2], [0, -4]]) assert.ok(Math.abs(trail.groundHeight(clearing.x + dx, clearing.z + dz) - centre) < 0.02, "clearings are flat");
  }
  assert.ok(trail.groundHeight(0, 140) < trail.SUMMIT_HEIGHT - 6, "beyond the summit the slope falls away toward the city");
});

test("the hidden arboretum is reached behind Moon Pavilion by a continuous dogleg and a straight path to three photo bays", () => {
  const paths = trail.SECRET_GARDEN_PATHS, zones = trail.SECRET_GARDEN_ZONES;
  assert.equal(zones.length, 3);
  assert.ok(trail.SECRET_GARDEN.maxX - trail.SECRET_GARDEN.minX >= 30, "both wings fit a spacious planted backdrop");
  assert.equal(trail.SECRET_GARDEN.spineX, (trail.SECRET_GARDEN.minX + trail.SECRET_GARDEN.maxX) / 2);
  const spine = paths.find(path => path.id === "secret-spine");
  assert.ok(spine.points.every(point => point[0] === trail.SECRET_GARDEN.spineX));
  assert.ok(spine.points.at(-1)[1] - spine.points[0][1] >= 20);
  const entrance = paths.find(path => path.id === "secret-entrance");
  assert.ok(entrance.points.some(([x, z]) => x < -24 && z < trail.SECRET_GARDEN.minZ), "the concealed bend precedes the garden reveal");
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let previousY = trail.bambooFloorHeight(...a);
    for (let step = 0; step <= Math.ceil(length * 10); step++) {
      const t = step / Math.ceil(length * 10), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      assert.ok(trail.onTrail(x, z), `${path.id} is connected at ${x},${z}`);
      assert.deepEqual([...trail.resolveTrail(x, z)], [x, z], "walking does not snap away from the entrance or branch");
      assert.ok(x > trail.BAMBOO_BOUNDS.minX + .4 && x < trail.BAMBOO_BOUNDS.maxX - .4 && z < trail.BAMBOO_BOUNDS.maxZ - .4);
      assert.ok(!trail.BAMBOO_PAVILION_COLLIDERS.some(wall => x > wall.minX - .25 && x < wall.maxX + .25 && z > wall.minZ - .25 && z < wall.maxZ + .25), "entrance skirts the pavilion back railing");
      const y = trail.bambooFloorHeight(x, z);
      assert.ok(Math.abs(y - previousY) < .12, `no hidden floor step on ${path.id}: ${y - previousY}`);
      previousY = y;
    }
  }
  for (const zone of zones) {
    assert.ok(trail.insideSecretGarden(zone.x, zone.z));
    for (let i = 0; i < 12; i++) {
      const x = zone.x + Math.cos(i / 12 * Math.PI * 2) * 2, z = zone.z + Math.sin(i / 12 * Math.PI * 2) * 2;
      assert.ok(trail.onTrail(x, z), "a photographer can stand around each sculpture");
      assert.deepEqual([...trail.resolveTrail(x, z)], [x, z]);
      assert.ok(Math.abs(trail.groundHeight(x, z) - trail.groundHeight(zone.x, zone.z)) < .001, "expanded photo bays are level across their full posing disk");
    }
  }
  assert.equal(trail.onTrail(-20, 96), false, "the summit does not open a second shortcut through the screening bamboo");
  assert.ok(trail.bambooStalkSites().every(stalk => !trail.insideSecretGarden(stalk.x, stalk.z, .5)), "random forest trunks do not grow through the planted garden");
});

test("rendered terrain height can correct walking while pavilion floors retain their precise seat and step levels", () => {
  assert.equal(trail.bambooFloorHeight(-38, 100, () => 12.345), 12.345);
  const pavilion = byId("moon");
  assert.equal(trail.bambooFloorHeight(pavilion.x, pavilion.z, () => -100), pavilion.floorY);
});

test("the corridor slides a walker back toward the path, a yard or a clearing instead of stopping", () => {
  assert.deepEqual([...trail.resolveTrail(0, 3)], [0, 3]);
  const [x, z] = trail.resolveTrail(3, 1);
  assert.ok(trail.onTrail(x, z));
  assert.ok(Math.abs(trail.nearestOnTrail(x, z).distance - trail.TRAIL_WALK_HALF) < 0.02, "pushed back to the inside of the fence line");
  assert.ok(Math.abs(z - 1) < 0.3 && x > 1.3, "the push is perpendicular to the entrance stem");
  const moon = byId("wind");
  assert.ok(trail.onTrail(moon.x, moon.z), "the deck itself is walkable");
  const outside = trail.pavilionWorld(moon, 1, -5);
  const [yx, yz] = trail.resolveTrail(outside.x, outside.z);
  const local = trail.pavilionLocal(moon, yx, yz);
  assert.ok(Math.abs(local.lz + 3.4) < 0.01, `clamped to the yard edge (${local.lz})`); near(local.lx, 1, "the other axis is untouched");
  assert.ok(trail.onTrail(trail.SUMMIT.x + 9, trail.SUMMIT.z - 6), "the open summit can be walked freely");
  assert.ok(trail.onTrail(trail.MEADOW.x + 3, trail.MEADOW.z + 4), "so can the meadow");
  const [sx, sz] = trail.resolveTrail(trail.SUMMIT.x + 30, trail.SUMMIT.z);
  assert.ok(trail.onTrail(sx, sz) && Math.hypot(sx - trail.SUMMIT.x, sz - trail.SUMMIT.z) < trail.SUMMIT.radius, "pushed back inside the summit edge");
  for (let i = 0; i < 400; i++) {
    const px = -44 + (i * 7919) % 88, pz = -4 + (i * 104729) % 119;
    const [rx, rz] = trail.resolveTrail(px, pz);
    assert.ok(trail.onTrail(rx, rz), `resolved point (${rx}, ${rz}) from (${px}, ${pz}) is walkable`);
  }
});

test("pavilion seats mirror the server table; the summit deck seats a row facing the city", () => {
  assert.equal(trail.BAMBOO_PAVILIONS.length, 5);
  assert.equal(trail.BAMBOO_PAVILION_SEATS.length, 30);
  assert.equal(trail.PAVILION_SEAT_CAPACITY, 6);
  const moon = byId("moon");
  const moonSeats = trail.BAMBOO_PAVILION_SEATS.filter(seat => seat.spotId === "pavilion-moon");
  const expected = [[-15.58, 78.3, -Math.PI / 2], [-15.58, 81.7, -Math.PI / 2], [-18.9, 77.58, 0], [-17.1, 77.58, 0], [-18.9, 82.42, Math.PI], [-17.1, 82.42, Math.PI]];
  moonSeats.forEach((seat, slot) => {
    assert.equal(seat.slot, slot);
    near(seat.x, expected[slot][0], `seat ${slot} x`); near(seat.z, expected[slot][1], `seat ${slot} z`); near(seat.yaw, expected[slot][2], `seat ${slot} yaw`);
    near(seat.avatarY, moon.floorY, "hips rest on the deck edge");
    near(seat.baseY, moon.groundY, "folded legs reach the flattened ground");
    const ahead = { x: seat.x - Math.sin(seat.yaw) * 1.5, z: seat.z - Math.cos(seat.yaw) * 1.5 };
    assert.ok(trail.bambooFloorHeight(ahead.x, ahead.z) < moon.floorY - 0.3, "every seat looks out over the edge of the deck");
    near(trail.bambooFloorHeight(seat.x, seat.z), moon.floorY, "the seat itself is on the deck");
  });
  near(moon.floorY, moon.groundY + trail.PAVILION_RISE, "the deck stands on its flattened pad");
  const wind = trail.pavilionSeat("pavilion-wind", 0);
  near(wind.x, -30.58, "meadow pavilion step seat x"); near(wind.z, 48.3, "meadow pavilion step seat z"); near(wind.yaw, -Math.PI / 2, "faces +X toward the loop");
  const deck = byId("summit");
  assert.equal(deck.kind, "deck");
  near(deck.floorY, deck.groundY + trail.DECK_RISE, "the deck is raised on the summit");
  for (let slot = 0; slot < 6; slot++) {
    const seat = trail.pavilionSeat("pavilion-summit", slot);
    near(seat.x, 3.75 - 1.5 * slot, `deck seat ${slot} x`); near(seat.z, 102.2, `deck seat ${slot} z`); near(seat.yaw, Math.PI, "every deck seat faces north, toward the city");
    near(seat.avatarY, deck.floorY + trail.DECK_BENCH_HEIGHT, "the bench is above the deck"); near(seat.baseY, deck.floorY, "feet rest on the deck");
    near(trail.bambooFloorHeight(seat.x, seat.z), deck.floorY, "the bench stands on the deck");
  }
  assert.equal(trail.pavilionSeat("pavilion-wind", 6), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "lying", spotId: "pavilion-wind", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "fire-benches", slot: 0 }), null);
  assert.equal(trail.claimedPavilionSeat({ pose: "sitting", spotId: "pavilion-pine", slot: 5 }).id, "pavilion-pine-seat-5");
  assert.equal(trail.nearbyBambooPavilion(-19.0, 77.7)?.id, "moon");
  assert.equal(trail.nearbyBambooPavilion(3.6, 101.9)?.id, "summit");
  assert.equal(trail.nearbyBambooPavilion(-18, 75), null);
  assert.equal(trail.nearbyBambooPavilion(0, 3), null);
});

test("decks, steps, posts, railings and the roof clearance keep walking and the camera consistent", () => {
  const wind = byId("wind");
  const steps = trail.pavilionWorld(wind, 0, 3.1);
  const height = trail.bambooFloorHeight(steps.x, steps.z);
  assert.ok(height > wind.groundY && height < wind.floorY, `ramp height ${height}`);
  const beside = trail.pavilionWorld(wind, 2, 3.1);
  near(trail.bambooFloorHeight(beside.x, beside.z), trail.groundHeight(beside.x, beside.z), "the ramp is only in front of the steps");
  const deck = byId("summit"), deckSteps = trail.pavilionWorld(deck, 0, -3.3);
  const deckRamp = trail.bambooFloorHeight(deckSteps.x, deckSteps.z);
  assert.ok(deckRamp > deck.groundY && deckRamp < deck.floorY, "the deck's steps are on the side away from the view");
  assert.equal(trail.bambooCeilingHeight(0, 3), null);
  assert.equal(trail.bambooCeilingHeight(deck.x, deck.z), null, "the viewing deck has no roof");
  const edge = trail.pavilionWorld(wind, 3.2, 0);
  const centre = trail.bambooCeilingHeight(wind.x, wind.z), eave = trail.bambooCeilingHeight(edge.x, edge.z);
  assert.ok(centre > eave && eave > wind.floorY + 2.5, `ceiling ${centre} / ${eave}`);
  assert.equal(trail.BAMBOO_PAVILION_OBSTACLES.length, 24);
  assert.equal(trail.BAMBOO_PAVILION_COLLIDERS.length, 7);
  for (const wall of trail.BAMBOO_PAVILION_COLLIDERS) {
    assert.ok(wall.maxX > wall.minX && wall.maxZ > wall.minZ);
    const seatInside = trail.BAMBOO_PAVILION_SEATS.some(seat => seat.x > wall.minX - 0.3 && seat.x < wall.maxX + 0.3 && seat.z > wall.minZ - 0.3 && seat.z < wall.maxZ + 0.3);
    assert.equal(seatInside, false, "no seat sits inside a railing");
  }
  for (const seat of trail.BAMBOO_PAVILION_SEATS) {
    assert.ok(trail.onTrail(seat.x, seat.z), "seats are reachable inside the yard corridor");
    assert.ok(trail.BAMBOO_PAVILION_OBSTACLES.every(post => Math.hypot(post.x - seat.x, post.z - seat.z) > 0.16 + 0.3), "seats are clear of the posts");
  }
});

test("lanterns, fences and stalks keep off the walkway, the yards and the open clearings", () => {
  const stones = trail.BAMBOO_LANTERNS.filter(l => l.kind === "stone"), paper = trail.BAMBOO_LANTERNS.filter(l => l.kind === "paper");
  assert.ok(stones.length >= 45 && stones.length <= 80, `stone lanterns ${stones.length}`);
  assert.equal(paper.length, 10);
  for (const lantern of stones) {
    const d = trail.nearestOnTrail(lantern.x, lantern.z).distance;
    assert.ok(d > 1.8 && d < 2.3, `lantern beside the path, not on it (${d})`);
    near(lantern.y, trail.groundHeight(lantern.x, lantern.z), "stone lanterns stand on the ground");
  }
  for (const lantern of paper) assert.ok(lantern.y > trail.groundHeight(lantern.x, lantern.z) + 1.5, "paper lanterns hang above head height");
  assert.ok(trail.BAMBOO_FENCES.length > 120, `fence runs ${trail.BAMBOO_FENCES.length}`);
  for (const run of trail.BAMBOO_FENCES) {
    const mx = (run.ax + run.bx) / 2, mz = (run.az + run.bz) / 2, d = trail.nearestOnTrail(mx, mz).distance;
    assert.ok(d > 1.2 && d < 2.0, `fence offset ${d}`);
    assert.ok(Math.hypot(mx - trail.SUMMIT.x, mz - trail.SUMMIT.z) > trail.SUMMIT.radius - 1.1, "no fence crosses the open summit");
  }
  const sites = trail.bambooStalkSites();
  assert.ok(sites.length > 2500 && sites.length < 8000, `stalk count ${sites.length}`);
  assert.ok(sites.every(site => site.z <= trail.SUMMIT.z + 1), "the river-facing northern slopes have no distant leafless stalks against the skyline");
  for (const site of sites) {
    assert.ok(trail.nearestOnTrail(site.x, site.z).distance >= 2.6, "no stalk stands on the lanterns, fence or brush");
    assert.equal(trail.onTrail(site.x, site.z), false);
    assert.ok(Math.hypot(site.x - trail.SUMMIT.x, site.z - trail.SUMMIT.z) > trail.SUMMIT.radius + 3.9, "the summit is clear of bamboo");
    assert.ok(site.height >= 8.5 && site.height <= 13 && site.radius >= 0.055 && site.radius <= 0.1);
    near(site.y, trail.groundHeight(site.x, site.z), "stalks grow out of the slope");
  }
  assert.equal(JSON.stringify(trail.bambooStalkSites().slice(0, 3)), JSON.stringify(sites.slice(0, 3)), "placement is deterministic");
});

test("the forest palette keeps the shared clock, closes the fog in and turns the lanterns on with the stars", () => {
  for (const hour of [6, 12, 17.75, 19, 21, 2]) {
    const base = daylightAt(hour), forest = bambooDaylightAt(hour);
    assert.equal(forest.hour, base.hour);
    assert.equal(forest.lanterns, base.lanterns);
    assert.equal(forest.stars, base.stars);
    assert.deepEqual([...forest.sun], [...base.sun]);
    assert.equal(forest.fogNear, 14); assert.equal(forest.fogFar, 62);
    assert.ok(forest.fog.every((v, i) => v >= 0 && v <= 1 && Number.isFinite(base.fog[i])));
  }
  assert.ok(bambooDaylightAt(12).fog[1] > bambooDaylightAt(12).fog[2], "daytime haze is green, not blue");
  assert.ok(bambooDaylightAt(23).fog.every(v => v < 0.12), "deep night fog is dark");
  assert.ok(bambooDaylightAt(12).tint[1] >= bambooDaylightAt(12).tint[0], "canopy shade favours green on the sprites");
  assert.equal(bambooDaylightAt(13).lanterns, 0); assert.equal(bambooDaylightAt(22).lanterns, 1);
  assert.equal(maps.MAPS.bamboo.name, "대나무숲");
  assert.equal(maps.mapHref("bamboo", "circle / one"), "/bamboo?communityId=circle%20%2F%20one");
});

test("bamboo is a private fullscreen route that reuses the scene with its own map id", async () => {
  const [route, layout, tabbar, scene, net] = await Promise.all(["../app/bamboo/page.tsx", "../app/bamboo/layout.tsx", "../components/TabBar.tsx", "../components/beach/BeachScene.tsx", "../lib/beach/net.ts"]
    .map(file => readFile(new URL(file, import.meta.url), "utf8")));
  assert.match(route, /search\.get\("communityId"\)/);
  assert.match(route, /<BeachScene[^>]+communityId=\{communityId\}[^>]+mapId="bamboo"/);
  assert.match(layout, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(tabbar, /path === "\/bamboo"/);
  assert.match(scene, /\(mapId === "bamboo" \|\| mapId === "garden" \|\| mapId === "cloudspa"\) && \(pavilion\.near \|\| pavilion\.seated/, "the shared seat button appears in the forest, garden and cloud spa");
  const seatNoun = scene.match(/const seatNoun = ([^;]+);/)?.[1];
  assert.ok(seatNoun, "seating contexts expose their own place name");
  for (const [kind, label] of [["deck", "전망대"], ["hall", "자리"], ["bench", "벤치"], ["pavilion", "정자"], ["pool", "온천"], ["lounge", "소파"]]) {
    assert.equal(vm.runInNewContext(seatNoun, { pavilion: { kind }, cloudPool: kind === "pool", cloudLounge: kind === "lounge" }), label, `${kind} keeps its own seating wording`);
  }
  assert.match(net, /pavilionEnabled: \(mapId === "bamboo" \|\| mapId === "garden" \|\| mapId === "cloudspa"\)/);
  assert.match(net, /"pavilion-wind", "pavilion-moon", "pavilion-pine", "pavilion-step", "pavilion-summit"/, "pavilion claims are validated like the other seats");
});
