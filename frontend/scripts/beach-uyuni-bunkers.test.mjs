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
  "nearbyBunkerEntry", "nearbyBunkerLadder", "nearbyBunkerSofa", "bunkerColliders",
]);
const textiles = await load("../lib/beach/shelter-textiles.ts", {}, ["createShelterPillowGeometry"]);
const { buildUyuniBunkers } = await load("../lib/beach/uyuni-bunkers.ts", { ...layout, ...textiles }, ["buildUyuniBunkers"]);
const close = (actual, expected, message = `${actual} ≈ ${expected}`) => assert.ok(Math.abs(actual - expected) < 1e-5, message);
function fixture() {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), cotton = new THREE.Texture();
  const control = buildUyuniBunkers(scene, { wood, cotton }); scene.updateMatrixWorld(true);
  return { scene, wood, cotton, control };
}
function cleanup(fixture) { fixture.control.dispose(); fixture.wood.dispose(); fixture.cotton.dispose(); }
const pointIn = (x, z, rect, margin = 0) => x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin;

test("hotel hatches, safe arrivals and twelve stable sofa claims match the underground contract", () => {
  assert.equal(layout.UYUNI_BUNKERS.length, 2); assert.equal(layout.BUNKER_SEATS.length, 12);
  for (const [index, bunker] of layout.UYUNI_BUNKERS.entries()) {
    const hotel = hotels.UYUNI_HOTELS[index];
    close(bunker.x, hotel.x); close(bunker.z, hotel.z);
    close(bunker.entry.x, hotel.x); close(bunker.entry.z, hotel.z - 6.8); close(bunker.entry.y, hotels.uyuniHotelFloorHeight(bunker.entry.x, bunker.entry.z));
    close(bunker.arrival.z, hotel.z - 5.4); close(bunker.arrival.y, -8.6); close(bunker.ceilingY - bunker.floorY, 6);
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

test("all room walls and the entire ceiling are closed, including the wooden ladder hatch", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    f.control.setActive(bunker.id);
    const ceiling = f.scene.getObjectByName(`uyuni-bunker-ceiling-plaster-${bunker.id}`);
    for (const dx of [-9.8, -5, 0, 5, 9.8]) for (const dz of [-8.8, -6.8, 0, 6, 8.8]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(bunker.x + dx, bunker.floorY + 1.6, bunker.z + dz), new THREE.Vector3(0, 1, 0)).intersectObject(ceiling)[0];
      assert.ok(hit, "there is no sky opening above any part of the library"); close(hit.point.y, bunker.ceilingY); assert.ok(hit.face.normal.y < -.99);
    }
    const walls = f.scene.getObjectByName(`uyuni-bunker-limestone-walls-${bunker.id}`);
    for (const [dx, dz, distance] of [[1, 0, 10], [-1, 0, 10], [0, 1, 9], [0, -1, 9]]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(bunker.x, bunker.floorY + 2.5, bunker.z), new THREE.Vector3(dx, 0, dz)).intersectObject(walls)[0];
      assert.ok(hit); close(hit.distance, distance);
    }
    const floor = f.scene.getObjectByName(`uyuni-bunker-limestone-floor-${bunker.id}`);
    const hit = new THREE.Raycaster(new THREE.Vector3(bunker.arrival.x, bunker.floorY + .1, bunker.arrival.z), new THREE.Vector3(0, -1, 0)).intersectObject(floor)[0];
    close(hit.point.y, bunker.floorY);
  }
  cleanup(f);
});

test("each authoritative sofa hip meets a rounded cushion while the wide entry route stays clear", () => {
  const f = fixture();
  for (const bunker of layout.UYUNI_BUNKERS) {
    const cushions = f.scene.getObjectByName(`uyuni-bunker-ivory-linen-${bunker.id}`);
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
    assert.equal(points, 2); assert.ok(draws <= 18, `${draws} room draws`); assert.ok(triangles < 100_000, `${triangles} room triangles`);
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
  assert.equal(f.scene.getObjectByName("uyuni-bunker-ivory-linen-dawn").material.map, f.cotton);
  assert.equal(f.scene.getObjectByName("uyuni-bunker-warm-oak-dawn").material.map, f.wood);
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
