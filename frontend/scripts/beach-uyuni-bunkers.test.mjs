import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { THREE, RoundedBoxGeometry, mergeGeometries, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const hotels = await load("../lib/beach/uyuni-hotel-layout.ts", {}, ["UYUNI_HOTELS", "uyuniHotelFloorHeight"]);
const layout = await load("../lib/beach/uyuni-bunker-layout.ts", hotels, [
  "UYUNI_BUNKERS", "BUNKER_FLOOR_Y", "BUNKER_CEILING_Y", "BUNKER_LADDER_LOCAL", "BUNKER_SOFA_LOCAL", "BUNKER_SEATS", "BUNKER_COLLIDERS",
  "BUNKER_PLAYER_INSET", "BUNKER_INTERACTION_REACH", "BUNKER_SEAT_REACH", "bunkerById", "bunkerForSpot", "bunkerSeat", "claimedBunkerSeat",
  "nearbyBunkerEntry", "nearbyBunkerLadder", "nearbyBunkerSofa", "bunkerColliders", "BUNKER_EXTENT", "BUNKER_SPRING_LOCAL", "BUNKER_HEARTH_LOCAL", "BUNKER_ENTRY", "BUNKER_TERRACE", "BUNKER_LAGOON", "bunkerFloorAt", "bunkerCeilingAt", "bunkerFloorRise", "BUNKER_GAMES_LOCAL", "BUNKER_GAME_TABLES", "BUNKER_GAME_REACH", "nearbyBunkerGame",
  "BUNKER_HALL", "BUNKER_ENTRY_COLUMNS", "BUNKER_FOUNTAIN", "BUNKER_HEARTH_ANGLE", "BUNKER_DAYBED_ANGLE", "BUNKER_TREES_LOCAL", "BUNKER_PAVILION_LOCAL", "hallPoint", "hallRadius", "hallAngle", "hallReach", "hallInward",
  "stairClimb", "stairProgress", "bunkerCeilingRise", "bunkerInside", "lagoonRadius", "inLagoon", "resolveBunkerWalk", "bunkerFootingClear", "bunkerStepClear",
]);
const baikalLayout = await load("../lib/beach/baikal-layout.ts", {}, ["BAIKAL_CABIN", "BAIKAL_CABINS", "BAIKAL_COZY_PER_ROOM", "BAIKAL_ROOM_OCCLUSION_BOX", "baikalRoofHeight"]);
const cozy = await load("../lib/beach/baikal-cozy.ts", baikalLayout, ["cushionGeometry", "drapeGeometry", "logGeometry", "poufGeometry", "softBoxGeometry"]);
const bunkers = await load("../lib/beach/uyuni-bunkers.ts", { ...layout, ...cozy, createBaikalFlameMaterial: () => new THREE.MeshBasicMaterial() }, ["buildUyuniBunkers", "BED_LAYER", "LAGOON_FALLS", "cushionPose", "CUSHION_THICKNESS"]);
const { buildUyuniBunkers } = bunkers;
const close = (actual, expected, message = `${actual} ≈ ${expected}`) => assert.ok(Math.abs(actual - expected) < 1e-5, message);
function fixture(options = {}, prepared = true) {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), cotton = new THREE.Texture();
  const control = buildUyuniBunkers(scene, { wood, cotton }, options);
  if (prepared) assert.equal(control.prepare(), true);
  scene.updateMatrixWorld(true);
  return { scene, wood, cotton, control };
}
function roomCost(f, id) {
  let draws = 0, triangles = 0;
  f.scene.getObjectByName(`uyuni-bunker-room-${id}`).traverse(object => {
    if (object.isMesh) { draws++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; }
  });
  return { draws, triangles };
}
function cleanup(fixture) { fixture.control.dispose(); fixture.wood.dispose(); fixture.cotton.dispose(); }
const pointIn = (x, z, rect, margin = 0) => x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin;

test("hotel hatches, safe arrivals and twelve stable sofa claims match the underground contract", () => {
  assert.equal(layout.UYUNI_BUNKERS.length, 2); assert.equal(layout.BUNKER_SEATS.length, 12);
  for (const [index, bunker] of layout.UYUNI_BUNKERS.entries()) {
    const hotel = hotels.UYUNI_HOTELS[index];
    close(bunker.x, hotel.x); close(bunker.z, hotel.z);
    close(bunker.entry.x, hotel.x); close(bunker.entry.z, hotel.z - 6.8); close(bunker.entry.y, hotels.uyuniHotelFloorHeight(bunker.entry.x, bunker.entry.z));
    close(bunker.arrival.z, hotel.z - 5.4); close(bunker.arrival.y, -8.6); close(bunker.ceilingY - bunker.floorY, 12);
    assert.equal(layout.nearbyBunkerEntry(bunker.entry.x, bunker.entry.z)?.id, bunker.id);
    assert.equal(layout.nearbyBunkerLadder(bunker.id, bunker.arrival.x, bunker.arrival.z)?.id, bunker.id);
    assert.equal(layout.nearbyBunkerLadder(null, bunker.entry.x, bunker.entry.z), null, "outdoor visitors cannot use an indoor ladder by horizontal position alone");
    for (const collider of layout.bunkerColliders(bunker.id)) assert.ok(!pointIn(bunker.arrival.x, bunker.arrival.z, collider, .35), "the arrival leaves room for the full avatar collider");
    for (let slot = 0; slot < 6; slot++) {
      const seat = layout.bunkerSeat(bunker.spotId, slot), side = slot < 3 ? -1 : 1;
      close(seat.x, bunker.x + side * 5.3); close(seat.z, bunker.z + (slot % 3 - 1) * 1.8);
      close(seat.yaw, side * Math.PI / 2); close(seat.avatarY, -8.08); close(seat.baseY, -8.6);
      assert.equal(layout.claimedBunkerSeat({ pose: "sitting", spotId: bunker.spotId, slot }), seat);
      assert.equal(layout.nearbyBunkerSofa(bunker.id, seat.x - side, seat.z)?.id, bunker.id);
      assert.equal(layout.nearbyBunkerSofa(null, seat.x, seat.z), null);
    }
  }
  for (const slot of [-1, 6, .5, NaN, Infinity]) assert.equal(layout.bunkerSeat("bunker-dawn-sofa", slot), null);
  assert.equal(layout.claimedBunkerSeat({ pose: "lying", spotId: "bunker-dawn-sofa", slot: 0 }), null);
  assert.equal(layout.bunkerById("unknown"), null); assert.equal(layout.bunkerForSpot("hotel-dawn"), null);
  assert.equal(layout.nearbyBunkerEntry(NaN, 0), null);
});

test("only low flush deck hatches render outside and only one visited room contributes indoor lights", () => {
  const f = fixture();
  const visible = () => { let lights = 0, meshes = 0; f.scene.traverseVisible(object => { if (object.isLight) lights++; if (object.isMesh) meshes++; }); return { lights, meshes }; };
  assert.deepEqual(visible(), { lights: 0, meshes: 6 });
  for (const bunker of layout.UYUNI_BUNKERS) {
    const hatch = f.scene.getObjectByName(`uyuni-bunker-hatch-wood-${bunker.id}`);
    const hit = new THREE.Raycaster(new THREE.Vector3(bunker.entry.x + .3, 2, bunker.entry.z), new THREE.Vector3(0, -1, 0)).intersectObject(hatch)[0];
    close(hit.point.y, bunker.entry.y + .017); assert.ok(hit.point.y > hotels.uyuniHotelFloorHeight(hit.point.x, hit.point.z) + .01);
    const bounds = new THREE.Box3().setFromObject(f.scene.getObjectByName(`uyuni-bunker-hatch-${bunker.id}`));
    assert.ok(bounds.max.y < bunker.entry.y + .06, "the hidden entrance has no large above-ground structure");
    f.control.setActive(bunker.id);
    assert.equal(visible().lights, 3);
    for (const other of layout.UYUNI_BUNKERS) assert.equal(f.scene.getObjectByName(`uyuni-bunker-room-${other.id}`).visible, other.id === bunker.id);
  }
  f.control.setActive(null); assert.deepEqual(visible(), { lights: 0, meshes: 6 });
  cleanup(f);
});

test("the oval hall is closed on every side and overhead, and the layout knows the headroom under the balcony and the dome", () => {
  const f = fixture(), H = layout.BUNKER_HALL;
  for (const bunker of layout.UYUNI_BUNKERS) {
    f.control.setActive(bunker.id);
    const plaster = f.scene.getObjectByName(`uyuni-bunker-cream-plaster-${bunker.id}`), oak = f.scene.getObjectByName(`uyuni-bunker-warm-oak-${bunker.id}`), skylight = f.scene.getObjectByName(`uyuni-bunker-lamp-glow-${bunker.id}`);
    const cast = (x, y, z, dx, dy, dz, targets) => new THREE.Raycaster(new THREE.Vector3(bunker.x + x, bunker.floorY + y, bunker.z + z), new THREE.Vector3(dx, dy, dz).normalize()).intersectObjects(targets, false)[0];
    // Level rays from the middle of the hall meet the plaster wall where the oval says it is.
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, hit = cast(0, 6.4, H.cz, Math.sin(a) * H.a, 0, Math.cos(a) * H.b, [plaster]);
      assert.ok(hit, `wall at ${a}`);
      const lx = hit.point.x - bunker.x, lz = hit.point.z - bunker.z;
      assert.ok(Math.abs(layout.hallRadius(lx, lz) - 1) < .01, `the wall stands on the oval at ${a}: ${layout.hallRadius(lx, lz)}`);
    }
    // Overhead: the dome everywhere in the open hall, with lit alabaster in its eye, and the balcony's timber underside over the ladder.
    let domes = 0;
    for (const [x, z] of [[.3, 9.2], [6, 2], [-7, 6], [.4, -2], [10, 9], [-3, 20], [5, 24], [-11, 14]]) {
      const want = layout.bunkerCeilingRise(x, z), hit = cast(x, layout.bunkerFloorRise(x, z) + 1.6, z, 0, 1, 0, [plaster, skylight]);
      assert.ok(hit, `there is no sky opening above ${x},${z}`);
      assert.ok(Math.abs(hit.point.y - bunker.floorY - want) < .3, `${hit.point.y - bunker.floorY} overhead at ${x},${z} where the layout says ${want}`);
      domes++;
    }
    for (const [x, z] of [[-2.2, -7.4], [2.4, -7.6], [-6.5, -5.6]]) {
      const hit = cast(x, 1.6, z, 0, 1, 0, [oak, plaster]);
      assert.ok(hit); assert.match(hit.object.name, /warm-oak/); close(layout.bunkerCeilingRise(x, z), layout.BUNKER_ENTRY.ceiling);
      assert.ok(Math.abs(hit.point.y - bunker.floorY - layout.BUNKER_ENTRY.ceiling) < .1);
    }
    assert.equal(domes, 8);
    close(layout.bunkerCeilingRise(0, H.cz), 12); close(layout.bunkerCeilingRise(H.a * .999, H.cz), H.wall + 4 * Math.sqrt(1 - .999 * .999), "the dome springs from the top of the wall");
    const marble = f.scene.getObjectByName(`uyuni-bunker-white-marble-${bunker.id}`);
    const floorHit = new THREE.Raycaster(new THREE.Vector3(bunker.arrival.x, bunker.floorY + .1, bunker.arrival.z), new THREE.Vector3(0, -1, 0)).intersectObject(marble)[0];
    close(floorHit.point.y, bunker.floorY);
    assert.equal(f.scene.getObjectByName(`uyuni-bunker-hatch-${bunker.id}`).visible, false, "the hall rises through the deck, so the hatches above are put away while anyone is inside");
  }
  cleanup(f);
});

test("marble, rug or stair is underfoot everywhere a visitor can walk, at the height the layout gives", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    const ground = ["white-marble", "wool-rug"].map(name => f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`));
    const colliders = layout.bunkerColliders(bunker.id), free = (x, z) => !colliders.some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .35));
    let checked = 0, upstairs = 0, climbing = 0;
    for (let x = -15; x <= 15; x += .9) for (let z = -9; z <= 27; z += .9) {
      const [wx, wz] = layout.resolveBunkerWalk(x, z);
      if (Math.hypot(wx - x, wz - z) > 1e-9 || !free(x, z) || !layout.bunkerFootingClear(x, z)) continue;
      const want = layout.bunkerFloorAt(bunker.id, bunker.x + x, bunker.z + z);
      const hit = new THREE.Raycaster(new THREE.Vector3(bunker.x + x, want + .5, bunker.z + z), new THREE.Vector3(0, -1, 0)).intersectObjects(ground, false)[0];
      assert.ok(hit, `there is floor at ${x},${z}`);
      assert.ok(Math.abs(hit.point.y - want) < .12, `the floor at ${x},${z} is ${hit.point.y - want} off`);
      checked++; if (want > bunker.floorY + 4) upstairs++; else if (want > bunker.floorY + .2) climbing++;
    }
    assert.ok(checked > 450 && upstairs > 70 && climbing > 20, `${checked} points, ${upstairs} of them upstairs and ${climbing} on the stairs`);
  }
  cleanup(f);
});

test("each authoritative sofa hip meets a rounded cushion while the wide entry route stays clear", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    const cushions = f.scene.getObjectByName(`uyuni-bunker-boucle-${bunker.id}`);
    for (const seat of layout.BUNKER_SEATS.filter(seat => seat.spotId === bunker.spotId)) {
      const hit = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .12, seat.z), new THREE.Vector3(0, -1, 0), 0, .3).intersectObject(cushions)[0];
      assert.ok(hit); close(hit.point.y, seat.avatarY, "seated avatars touch the top rather than float or sink");
    }
    for (const x of [-1.5, 0, 1.5]) for (const z of [-5.4, -4.6, -3.6, -2.6]) {
      assert.ok(!layout.bunkerColliders(bunker.id).some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .35)));
    }
  }
  cleanup(f);
});

test("two furnished rooms share finite mobile-bounded geometry, injected textures and shadow-free lighting", t => {
  const f = fixture(), allGeometries = new Set(), materials = new Set();
  for (const bunker of layout.UYUNI_BUNKERS) {
    let draws = 0, triangles = 0, points = 0;
    const room = f.scene.getObjectByName(`uyuni-bunker-room-${bunker.id}`);
    room.traverse(object => {
      assert.equal(object.castShadow, false);
      if (object.isPointLight) points++;
      if (!object.isMesh) return;
      draws++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      allGeometries.add(object.geometry); materials.add(object.material);
      assert.equal(object.receiveShadow, false);
    });
    assert.equal(points, 2); assert.ok(draws <= 22, `${draws} room draws`); assert.ok(triangles < 170_000, `${triangles} room triangles`);
    t.diagnostic(`${bunker.id}: ${draws} room draws, ${triangles} triangles`);
  }
  for (const geometry of allGeometries) for (const name of ["position", "normal", "uv"]) {
    assert.ok(geometry.attributes[name]); assert.ok([...geometry.attributes[name].array].every(Number.isFinite));
  }
  const a = f.scene.getObjectByName("uyuni-bunker-room-dawn"), b = f.scene.getObjectByName("uyuni-bunker-room-dusk");
  for (let i = 0; i < a.children.length; i++) if (a.children[i].isMesh) {
    assert.equal(a.children[i].geometry, b.children[i].geometry); assert.equal(a.children[i].material, b.children[i].material);
  }
  assert.equal(f.wood.repeat.x, 1); assert.equal(f.cotton.repeat.x, 1);
  assert.equal(f.scene.getObjectByName("uyuni-bunker-boucle-dawn").material.map, f.cotton);
  assert.equal(f.scene.getObjectByName("uyuni-bunker-warm-oak-dawn").material.map, f.wood);
  cleanup(f);
});

test("the room lights itself and keeps a breathing fire without shadow passes or extra scene lights", () => {
  const f = fixture();
  f.control.setActive("dawn");
  const flames = f.scene.getObjectByName("uyuni-bunker-flames-dawn");
  assert.ok(flames.isInstancedMesh); assert.ok(flames.count > 0);
  const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <lights_fragment_begin>\n#include <aomap_fragment>" };
  f.scene.getObjectByName("uyuni-bunker-cream-plaster-dawn").material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uRoomLight.value.length > 4);
  assert.match(shader.fragmentShader, /uRoomFire/);
  assert.doesNotMatch(shader.fragmentShader, /NUM_POINT_LIGHTS > 0 \) && defined\( RE_Direct/, "visitor lights do not also wash the walls");
  const seen = new Set();
  for (let time = 0; time < 40; time += .37) { f.control.update(time); seen.add(shader.uniforms.uRoomFire.value.toFixed(3)); assert.ok(shader.uniforms.uRoomFire.value > .8 && shader.uniforms.uRoomFire.value < 1.25, "it pulses, never strobes"); }
  assert.ok(seen.size > 10);
  cleanup(f);
});

test("each lodge has one omok and one othello table in reach of open floor, and only the live stones are drawn", () => {
  const f = fixture();
  assert.deepEqual(Array.from(layout.BUNKER_GAME_TABLES, table => table.id), ["bunker-dawn-omok", "bunker-dawn-othello", "bunker-dusk-omok", "bunker-dusk-othello"]);
  for (const table of layout.BUNKER_GAME_TABLES) {
    const bunker = layout.bunkerById(table.bunkerId);
    assert.equal(layout.nearbyBunkerGame(bunker.id, table.x + 1.6, table.z)?.id, table.id);
    assert.equal(layout.nearbyBunkerGame(null, table.x, table.z), null, "nothing is usable from above ground");
    assert.equal(layout.nearbyBunkerGame(bunker.id, table.x, table.z + 2.5), null);
    assert.ok(!layout.bunkerColliders(bunker.id).some(collider => pointIn(table.x, table.z - 1.2, collider, .3)), "a visitor can stand at the table");
  }
  f.control.setActive("dawn");
  const stones = f.scene.getObjectByName("uyuni-bunker-stones-dawn"), omok = { id: "bunker-dawn-omok", game: "omok", size: 15, version: 1, cells: `BW${".".repeat(223)}` };
  assert.equal(stones.count, 0);
  f.control.setBoardGames([omok, { id: "bunker-dawn-othello", game: "othello", size: 8, version: 1, cells: `${".".repeat(27)}WB${".".repeat(35)}` }]);
  assert.equal(stones.count, 4);
  f.control.setBoardGames([{ ...omok, version: 2, cells: ".".repeat(225) }]);
  assert.equal(stones.count, 0, "a cleared board leaves no stones behind");
  cleanup(f);
});

test("owned room resources dispose exactly once and injected hotel textures remain alive", () => {
  const f = fixture(), counts = new Map(), retained = new THREE.Group(); f.scene.add(retained);
  const track = resource => {
    if (!resource || counts.has(resource)) return;
    counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  };
  f.control.root.traverse(object => {
    if (!object.isMesh) return;
    track(object.geometry); track(object.material);
    for (const value of Object.values(object.material)) if (value?.isTexture && value !== f.wood && value !== f.cotton) track(value);
  });
  let injectedDisposals = 0;
  for (const texture of [f.wood, f.cotton]) texture.addEventListener("dispose", () => injectedDisposals++);
  f.control.setActive("dawn"); f.control.dispose(); f.control.dispose(); f.control.setActive("dusk");
  assert.deepEqual(f.scene.children, [retained]); assert.equal(f.control.root.children.length, 0);
  assert.ok([...counts.values()].every(count => count === 1)); assert.equal(injectedDisposals, 0);
  f.wood.dispose(); f.cotton.dispose();
});

test("nothing underground is built until a visitor heads for a hatch, and then only a little at a time", () => {
  const f = fixture({}, false);
  for (const bunker of layout.UYUNI_BUNKERS) assert.equal(f.scene.getObjectByName(`uyuni-bunker-room-${bunker.id}`).children.length, 0);
  let calls = 1;
  while (!f.control.prepare(0)) calls++;
  assert.ok(calls > 20, `${calls} small steps rather than one long pause`);
  assert.ok(roomCost(f, "dawn").triangles > 10_000);
  const late = fixture({}, false);
  late.control.setActive("dusk");
  assert.ok(roomCost(late, "dusk").draws > 10, "going straight down still finds a finished room");
  cleanup(f); cleanup(late);
});

test("a phone gets a lighter room whose lights are all summed per vertex", t => {
  const desktop = fixture(), phone = fixture({ mobile: true });
  const full = roomCost(desktop, "dawn"), lite = roomCost(phone, "dawn");
  t.diagnostic(`phone: ${lite.draws} room draws, ${lite.triangles} triangles`);
  assert.equal(lite.draws, full.draws); assert.ok(lite.triangles < full.triangles * .75); assert.ok(lite.triangles < 95_000, `${lite.triangles} phone triangles`);
  const compiled = f => {
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <lights_fragment_begin>\n#include <aomap_fragment>" };
    f.scene.getObjectByName("uyuni-bunker-cream-plaster-dawn").material.onBeforeCompile(shader);
    return shader;
  };
  for (const seat of layout.BUNKER_SEATS.filter(seat => seat.spotId === "bunker-dawn-sofa")) {
    const hit = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .12, seat.z), new THREE.Vector3(0, -1, 0), 0, .3).intersectObject(phone.scene.getObjectByName("uyuni-bunker-boucle-dawn"))[0];
    assert.ok(hit); close(hit.point.y, seat.avatarY, "the simpler cushions still meet a seated visitor");
  }
  const count = compiled(desktop).uniforms.uRoomLight.value.length;
  assert.ok(compiled(phone).vertexShader.includes(`for (int i = 0; i < ${count}; i++)`));
  assert.ok(!compiled(phone).fragmentShader.includes("for (int i = 0;"), "matte surfaces on a phone run no light loop per pixel");
  assert.ok(compiled(desktop).vertexShader.includes("for (int i = 6;")); assert.ok(compiled(desktop).fragmentShader.includes("for (int i = 0; i < 6;"));
  cleanup(desktop); cleanup(phone);
});

test("the hall is an oval on two levels: a way round the lake, and two stairs that climb without a jolt", () => {
  const T = layout.BUNKER_TERRACE, L = layout.BUNKER_LAGOON, H = layout.BUNKER_HALL;
  for (const bunker of layout.UYUNI_BUNKERS) {
    close(bunker.bounds.maxX - bunker.bounds.minX, 36); close(bunker.bounds.maxZ - bunker.bounds.minZ, 36);
    close(bunker.bounds.minZ, bunker.z - 9, "the server's room has not moved");
    for (const corner of [[-17, -8], [17, 26], [-17, 26]]) assert.ok(!layout.bunkerInside(...corner), "the corners of the old square room are outside the oval");
    assert.ok(H.a < H.b, "the oval runs from the ladder to the back of the hall");
    const colliders = layout.bunkerColliders(bunker.id), free = (x, z) => !colliders.some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .35));
    for (const collider of colliders) assert.ok(layout.bunkerInside((collider.minX + collider.maxX) / 2 - bunker.x, (collider.minZ + collider.maxZ) / 2 - bunker.z), "all the furniture stands inside the oval");
    // A walk all round the lake, outside its kerb.
    let open = 0;
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2, x = L.x + (L.a + L.kerb + .6) * Math.sin(a), z = L.z + (L.b + L.kerb + .6) * Math.cos(a);
      if (free(x, z) && layout.bunkerFloorRise(x, z) === 0 && layout.bunkerFootingClear(x, z)) open++;
    }
    assert.ok(open >= 44, `${open} of 48 points round the lake are open floor`);
    for (let x = -L.a; x <= L.a; x += .5) for (let z = L.z - L.b; z <= L.z + L.b; z += .5) {
      if (!layout.inLagoon(x, z)) continue;
      const [wx, wz] = layout.resolveBunkerWalk(x, z);
      assert.ok(layout.lagoonRadius(wx, wz) >= 1, "nobody walks into the lake");
    }
    // Each stair climbs from the floor to the terrace with no step in the walking height and no sudden change of slope.
    for (const side of [-1, 1]) for (const radius of [.84, .9, .96]) {
      let last = null, lastSlope = null, steepest = 0;
      const count = 400;
      for (let i = 0; i <= count; i++) {
        const angle = side * (T.foot + .05 - (T.foot - T.top + .1) * i / count), p = layout.hallPoint(radius, angle), height = layout.bunkerFloorRise(p.x, p.z);
        if (last) {
          const run = Math.hypot(p.x - last.x, p.z - last.z), slope = (height - last.height) / run;
          assert.ok(slope >= -1e-9 && height - last.height < .03, `the climb at ${angle} never jumps`);
          if (lastSlope !== null) assert.ok(Math.abs(slope - lastSlope) < .02, `the slope at ${angle} changes by ${slope - lastSlope}`);
          lastSlope = slope; steepest = Math.max(steepest, slope);
        }
        last = { x: p.x, z: p.z, height };
      }
      close(last.height, T.height); assert.ok(steepest < .36, `the stair is gentle: ${steepest}`);
      const mid = layout.hallPoint(radius, side * (T.top + T.foot) / 2);
      assert.ok(free(mid.x, mid.z), "nothing stands on the stair");
    }
    close(layout.bunkerFloorRise(0, 0), 0); close(layout.bunkerFloorRise(0, H.cz + H.b * .8), T.height);
    // The edges between the levels hold a walker back: off the terrace, off the open side of a stair, and up the terrace face.
    const edge = layout.hallPoint(T.edge, 0);
    assert.ok(!layout.bunkerStepClear(edge.x, edge.z + .6, edge.x, edge.z - .6), "nobody steps off the terrace");
    assert.ok(!layout.bunkerStepClear(edge.x, edge.z - .6, edge.x, edge.z + .6), "nor up its face");
    assert.ok(!layout.bunkerFootingClear(edge.x, edge.z + .1), "nor stands out on the ledge in front of the rail");
    const stair = layout.hallPoint(T.stair + .1, 1.4), below = layout.hallPoint(T.stair - .1, 1.4);
    assert.ok(!layout.bunkerStepClear(stair.x, stair.z, below.x, below.z), "nor drops off the side of a stair");
    const foot = layout.hallPoint(.9, T.foot + .1), first = layout.hallPoint(.9, T.foot - .05);
    assert.ok(layout.bunkerStepClear(foot.x, foot.z, first.x, first.z), "but walks on to the foot of a stair");
  }
});

test("water stays where nobody can stand, the lake is drawn clear until the sea engine takes it, and everything green moves", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    const water = f.scene.getObjectByName(`uyuni-bunker-spring-water-${bunker.id}`), basin = layout.bunkerColliders(bunker.id).filter(collider => collider.kind === "plant");
    assert.ok(water.material.isShaderMaterial); assert.equal(water.material.transparent, true, "falling water is glassy between its strands");
    const position = water.geometry.attributes.position, kind = water.geometry.attributes.color;
    let falling = 0, lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i);
      assert.ok(layout.lagoonRadius(x, z) < 1 || basin.some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .05)), `water at ${x},${z} stays where nobody can stand`);
      assert.ok(kind.getX(i) > 0, "every part of it is moving");
      if (kind.getY(i) > 0) { falling++; lowest = Math.min(lowest, position.getY(i)); highest = Math.max(highest, position.getY(i)); }
    }
    assert.ok(falling > 40);
    close(lowest, layout.BUNKER_LAGOON.level, "the fountain spills into the lake"); assert.ok(highest > layout.BUNKER_TERRACE.height - .1, "and the fall starts at the terrace");
    for (const [x, z, strength] of bunkers.LAGOON_FALLS) assert.ok(layout.inLagoon(x, z) && strength > 0, "water falls into the lake");
    const lake = f.scene.getObjectByName(`uyuni-bunker-lagoon-${bunker.id}`);
    assert.equal(lake.material.transparent, true, "the lake's own water is clear: the bed shows through it");
    assert.equal(lake.visible, true); f.control.setLagoonDrawn(false); assert.equal(lake.visible, false); f.control.setLagoonDrawn(true); assert.equal(lake.visible, true);
    const lakePosition = lake.geometry.attributes.position;
    for (let i = 0; i < lakePosition.count; i++) assert.ok(layout.lagoonRadius(lakePosition.getX(i), lakePosition.getZ(i)) < 1, "the lake's water stays inside its kerb");
    assert.ok(f.scene.getObjectByName(`uyuni-bunker-lagoon-bed-${bunker.id}`).layers.isEnabled(bunkers.BED_LAYER));
    assert.ok(!f.scene.getObjectByName(`uyuni-bunker-white-marble-${bunker.id}`).layers.isEnabled(bunkers.BED_LAYER));
    for (const name of ["garden-leaves", "leaf-sprays", "trailing-willow"]) {
      const leaves = f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`), sway = leaves.geometry.attributes.aSway;
      assert.equal(sway.count, leaves.geometry.attributes.position.count);
      let still = Infinity, moving = 0;
      for (let i = 0; i < sway.count; i++) { still = Math.min(still, sway.getX(i)); moving = Math.max(moving, sway.getX(i)); }
      assert.ok(moving > .3, `${name} moves`); if (name !== "leaf-sprays") assert.equal(still, 0, "stalks and the tops of trailing stems hold still");
      assert.equal(leaves.material.side, THREE.DoubleSide);
    }
    assert.ok(f.scene.getObjectByName(`uyuni-bunker-petals-${bunker.id}`).geometry.instanceCount > 50, "petals drift through the hall");
    // Spray rises only where falling water meets water: round the fountain in the lake and in the basin under the terrace fall.
    const spray = f.scene.getObjectByName(`uyuni-bunker-splashes-${bunker.id}`), drops = spray.geometry.attributes.aDrop;
    assert.ok(spray.geometry.instanceCount > 150 && spray.material.transparent && !spray.material.depthWrite);
    for (let i = 0; i < drops.count; i++) {
      const x = drops.getX(i), y = drops.getY(i), z = drops.getZ(i);
      const lake = layout.lagoonRadius(x, z) < 1 && Math.abs(y - layout.BUNKER_LAGOON.level) < .05, basinDrop = basin.some(collider => pointIn(bunker.x + x, bunker.z + z, collider)) && y > .3 && y < layout.BUNKER_FOUNTAIN.rim;
      assert.ok(lake || basinDrop, `a drop at ${x},${y},${z} starts on water`);
    }
  }
  assert.equal(f.scene.getObjectByName("uyuni-bunker-trailing-willow-dawn").material.visible, false, "the willow photograph is not drawn before it has arrived");
  cleanup(f);
});

test("a scatter cushion rests on the seat and lies flat against what is behind it, never sinking into it", () => {
  const corners = [];
  for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) corners.push([x, y, z]);
  for (const lean of [0, .12, .17, .22, .4]) for (const size of [.42, .54, .62]) for (const twist of [-.12, 0, .1]) for (const inward of [{ x: -1, z: 0 }, { x: .6, z: .8 }]) {
    const foot = { x: 1, y: .55, z: -2 }, pose = bunkers.cushionPose(foot, inward, lean, .3, size, twist, 0);
    // The face the cushion leans on passes through the foot, tilted back by the lean.
    const normal = new THREE.Vector3(inward.x * Math.cos(lean), Math.sin(lean), inward.z * Math.cos(lean));
    let lowest = Infinity, deepest = Infinity;
    for (const [cx, cy, cz] of corners) {
      const p = new THREE.Vector3(cx * size, cy * bunkers.CUSHION_THICKNESS, cz * size).applyMatrix4(pose);
      lowest = Math.min(lowest, p.y); deepest = Math.min(deepest, p.clone().sub(new THREE.Vector3(foot.x, foot.y, foot.z)).dot(normal));
    }
    assert.ok(deepest > -.001, `lean ${lean} size ${size} twist ${twist}: the back of the cushion stays in front of the face (${deepest})`);
    assert.ok(deepest < .02, "and touches it rather than floating");
    assert.ok(lowest > foot.y - .001 && lowest < foot.y + .06, `its lowest corner rests on the seat (${lowest - foot.y})`);
  }
});
