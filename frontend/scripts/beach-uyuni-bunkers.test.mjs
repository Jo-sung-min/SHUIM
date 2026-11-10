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
  "nearbyBunkerEntry", "nearbyBunkerLadder", "nearbyBunkerSofa", "bunkerColliders", "BUNKER_EXTENT", "BUNKER_SPRING_LOCAL", "BUNKER_HEARTH_LOCAL", "BUNKER_ENTRY", "BUNKER_TERRACE", "BUNKER_GALLERY", "BUNKER_LAGOON", "bunkerFloorAt", "bunkerCeilingAt", "bunkerFloorRise", "BUNKER_GAMES_LOCAL", "BUNKER_GAME_TABLES", "BUNKER_GAME_REACH", "nearbyBunkerGame",
]);
const baikalLayout = await load("../lib/beach/baikal-layout.ts", {}, ["BAIKAL_CABIN", "BAIKAL_CABINS", "BAIKAL_COZY_PER_ROOM", "BAIKAL_ROOM_OCCLUSION_BOX", "baikalRoofHeight"]);
const cozy = await load("../lib/beach/baikal-cozy.ts", baikalLayout, ["cushionGeometry", "drapeGeometry", "logGeometry", "poufGeometry", "softBoxGeometry"]);
const bunkers = await load("../lib/beach/uyuni-bunkers.ts", { ...layout, ...cozy, createBaikalFlameMaterial: () => new THREE.MeshBasicMaterial() }, ["buildUyuniBunkers", "BED_LAYER", "LAGOON_FALLS"]);
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

test("the hall is closed on every side and overhead, and the layout knows the headroom under each gallery", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    f.control.setActive(bunker.id);
    const shell = ["cream-plaster", "white-marble", "warm-oak"].map(name => f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`));
    const cast = (x, y, z, dx, dy, dz) => new THREE.Raycaster(new THREE.Vector3(bunker.x + x, bunker.floorY + y, bunker.z + z), new THREE.Vector3(dx, dy, dz)).intersectObjects(shell, false)[0];
    const walls = layout.bunkerColliders(bunker.id).filter(collider => collider.kind === "wall"), seen = new Set();
    for (const dx of [-17, -13, -7, 0, 7, 13, 17]) for (const dz of [-8.4, -6, -2, 0, 6, 12, 18, 21]) {
      if (walls.some(wall => pointIn(bunker.x + dx, bunker.z + dz, wall))) continue;
      const headroom = layout.bunkerCeilingAt(bunker.id, bunker.x + dx, bunker.z + dz) - bunker.floorY, hit = cast(dx, layout.bunkerFloorRise(dx, dz) + 1.6, dz, 0, 1, 0);
      assert.ok(hit, "there is no sky opening above any part of the hall");
      // A beam may hang a hand below the ceiling proper; nothing else comes between a visitor and the height the camera is given.
      assert.ok(Math.abs(hit.point.y - bunker.floorY - headroom) < .45, `${hit.point.y - bunker.floorY} overhead at ${dx},${dz} where the layout says ${headroom}`);
      seen.add(headroom);
    }
    assert.deepEqual([...seen].sort((a, b) => a - b), [layout.BUNKER_GALLERY.under, layout.BUNKER_ENTRY.ceiling, 12]);
    for (const [dx, dz, distance] of [[1, 0, 18], [-1, 0, 18], [0, 1, 25], [0, -1, 11]]) { const hit = cast(0, 8, 2, dx, 0, dz); assert.ok(hit); close(hit.distance, distance); }
    for (const dx of [1, -1]) { const hit = cast(0, 2.5, -4.6, dx, 0, 0); assert.ok(hit); close(hit.distance, 18); assert.match(hit.object.name, /warm-oak/, "timber lines the walls to above head height"); }
    const marble = f.scene.getObjectByName(`uyuni-bunker-white-marble-${bunker.id}`);
    const hit = new THREE.Raycaster(new THREE.Vector3(bunker.arrival.x, bunker.floorY + .1, bunker.arrival.z), new THREE.Vector3(0, -1, 0)).intersectObject(marble)[0];
    close(hit.point.y, bunker.floorY);
    assert.equal(f.scene.getObjectByName(`uyuni-bunker-hatch-${bunker.id}`).visible, false, "the hall rises through the deck, so the hatches above are put away while anyone is inside");
  }
  cleanup(f);
});

test("marble, rug or stair is underfoot everywhere a visitor can walk, at the height the layout gives", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    const ground = ["white-marble", "wool-rug"].map(name => f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`));
    const colliders = layout.bunkerColliders(bunker.id), free = (x, z) => !colliders.some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .35));
    let checked = 0, upstairs = 0;
    for (let x = -17.2; x <= 17.2; x += 1.1) for (let z = -8.2; z <= 26.2; z += 1.1) {
      if (!free(x, z)) continue;
      const want = layout.bunkerFloorAt(bunker.id, bunker.x + x, bunker.z + z);
      const hit = new THREE.Raycaster(new THREE.Vector3(bunker.x + x, want + .5, bunker.z + z), new THREE.Vector3(0, -1, 0)).intersectObjects(ground, false)[0];
      assert.ok(hit, `there is floor at ${x},${z}`);
      assert.ok(Math.abs(hit.point.y - want) < .25, `the floor at ${x},${z} is ${hit.point.y - want} off`);
      checked++; if (want > bunker.floorY + 4) upstairs++;
    }
    assert.ok(checked > 400 && upstairs > 100, `${checked} points, ${upstairs} of them upstairs`);
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

test("the hall is thirty-six metres square on two levels, with clear ways round the lagoon and up both stairs", () => {
  const T = layout.BUNKER_TERRACE, L = layout.BUNKER_LAGOON;
  for (const bunker of layout.UYUNI_BUNKERS) {
    close(bunker.bounds.maxX - bunker.bounds.minX, 36); close(bunker.bounds.maxZ - bunker.bounds.minZ, 36);
    close(bunker.bounds.minZ, bunker.z - 9, "the ladder wall has not moved");
    const colliders = layout.bunkerColliders(bunker.id), free = (x, z) => !colliders.some(collider => pointIn(bunker.x + x, bunker.z + z, collider, .35));
    const height = (x, z) => layout.bunkerFloorAt(bunker.id, bunker.x + x, bunker.z + z) - bunker.floorY;
    for (const collider of colliders.filter(collider => collider.kind !== "wall")) {
      assert.ok(collider.minX >= bunker.bounds.minX - 1e-9 && collider.maxX <= bunker.bounds.maxX + 1e-9 && collider.minZ >= bunker.bounds.minZ - 1e-9 && collider.maxZ <= bunker.bounds.maxZ + .1);
    }
    for (const side of [-1, 1]) {
      for (let z = -4.4; z <= 8; z += .4) assert.ok(free(side * 9.4, z), `the ${side < 0 ? "west" : "east"} aisle is clear at ${z}`);
      let last = 0;
      for (let z = T.stairZ - .4; z <= T.z + .8; z += .2) {
        const x = side * (T.stairInner + T.stairOuter) / 2, now = height(x, z);
        assert.ok(free(x, z), `the ${side < 0 ? "west" : "east"} stair is clear at ${z}`);
        assert.ok(now >= last && now - last < .25, "the stair climbs without a jump"); last = now;
      }
      close(last, T.height);
      for (let x = T.stairOuter - .5; x >= 9.4; x -= .4) assert.ok(free(side * x, T.z + .9), "the head of the stair opens on to the terrace");
    }
    for (let x = -9.4; x <= 9.4; x += .4) { assert.ok(free(x, 8.4), "the lagoon kerb can be walked from stair to stair"); assert.ok(free(x, 20.6), "so can the terrace behind the falls"); }
    close(height(0, 8.4), 0); close(height(0, 20.6), T.height); close(height(0, 26), T.height);
    assert.ok(!free(layout.BUNKER_HEARTH_LOCAL.x, layout.BUNKER_HEARTH_LOCAL.z)); assert.ok(!free(layout.BUNKER_SPRING_LOCAL.x, layout.BUNKER_SPRING_LOCAL.z));
    for (let x = L.minX; x <= L.maxX; x += .5) for (let z = L.minZ; z <= L.maxZ; z += .5) assert.ok(!free(x, z), "nobody walks into the lagoon");
  }
});

test("water comes down the cliff into the lagoon where nobody can walk, and everything green moves in the air", () => {
  const f = fixture(), L = layout.BUNKER_LAGOON, T = layout.BUNKER_TERRACE;
  for (const bunker of layout.UYUNI_BUNKERS) {
    const water = f.scene.getObjectByName(`uyuni-bunker-spring-water-${bunker.id}`), wet = layout.bunkerColliders(bunker.id).filter(collider => collider.kind === "plant");
    assert.ok(water.material.isShaderMaterial); assert.equal(water.material.transparent, true, "a fall is glassy between its strands");
    const position = water.geometry.attributes.position, kind = water.geometry.attributes.color;
    let falling = 0, running = 0, lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < position.count; i++) {
      assert.ok(wet.some(collider => pointIn(bunker.x + position.getX(i), bunker.z + position.getZ(i), collider, .05)), "water stays where nobody can stand");
      assert.ok(kind.getX(i) > 0, "every part of it is moving");
      if (kind.getY(i) > 0) { falling++; lowest = Math.min(lowest, position.getY(i)); highest = Math.max(highest, position.getY(i)); } else running++;
    }
    assert.ok(falling > 40 && running > 40);
    // Heights inside a room are measured from its own floor.
    close(lowest, L.level, "the falls reach the lagoon"); assert.ok(highest > T.height - .1, "and start at the terrace");
    for (const [x, reach, strength] of bunkers.LAGOON_FALLS) { assert.ok(x > L.minX && x < L.maxX && reach > 0 && reach < L.maxZ - L.minZ && strength > 0, "each fall lands in the lagoon"); }
    // The lagoon is drawn by the hall itself until the sea engine takes it over; its bed and the cliff are what that engine sees through the water.
    const lagoon = f.scene.getObjectByName(`uyuni-bunker-lagoon-${bunker.id}`);
    assert.equal(lagoon.visible, true); f.control.setLagoonDrawn(false); assert.equal(lagoon.visible, false); f.control.setLagoonDrawn(true); assert.equal(lagoon.visible, true);
    for (const name of ["lagoon-bed", "cliff-rock"]) assert.ok(f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`).layers.isEnabled(bunkers.BED_LAYER));
    assert.ok(!f.scene.getObjectByName(`uyuni-bunker-white-marble-${bunker.id}`).layers.isEnabled(bunkers.BED_LAYER));
    for (const name of ["garden-leaves", "leaf-sprays"]) {
      const leaves = f.scene.getObjectByName(`uyuni-bunker-${name}-${bunker.id}`), sway = leaves.geometry.attributes.aSway;
      assert.equal(sway.count, leaves.geometry.attributes.position.count);
      let still = Infinity, moving = 0;
      for (let i = 0; i < sway.count; i++) { still = Math.min(still, sway.getX(i)); moving = Math.max(moving, sway.getX(i)); }
      assert.ok(moving > .3, "leaves move"); if (name === "garden-leaves") assert.equal(still, 0, "stalks hold still while leaf tips move");
      assert.equal(leaves.material.side, THREE.DoubleSide);
    }
    assert.ok(f.scene.getObjectByName(`uyuni-bunker-petals-${bunker.id}`).geometry.instanceCount > 50, "petals drift through the hall");
  }
  cleanup(f);
});
