import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const layout = await load("../lib/beach/uyuni-hotel-layout.ts", {}, ["UYUNI_HOTELS", "UYUNI_HOTEL_DECK", "UYUNI_HOTEL_COLLIDERS", "UYUNI_HOTEL_SEATS", "UYUNI_HOTEL_BED_CAPACITY", "uyuniHotelForSpot", "uyuniHotelBedSlot", "claimedUyuniHotelBed", "nearbyUyuniHotel", "uyuniHotelFloorHeight", "uyuniHotelCeilingHeight"]);
const nav = await load("../lib/beach/navigation.ts", {}, ["findWalkingPath", "resolveWalls"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const { buildUyuniHotels } = await load("../lib/beach/uyuni-hotels.ts", { THREE, RoundedBoxGeometry, ...layout, ...textiles }, ["buildUyuniHotels"]);
const { daylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt"]);
const bounds = { minX: -22, maxX: 22, minZ: -1, maxZ: 55 };
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b, message = `${a} ≈ ${b}`) => assert.ok(Math.abs(a - b) < 1e-5, message);

test("two compact hotels preserve the shared sky circle, and each has two server-aligned sea-facing beds", () => {
  assert.equal(layout.UYUNI_HOTELS.length, 2);
  assert.equal(layout.UYUNI_HOTEL_BED_CAPACITY, 2);
  for (const hotel of layout.UYUNI_HOTELS) {
    assert.ok(hotel.x - 5.8 > bounds.minX && hotel.x + 5.8 < bounds.maxX);
    assert.ok(hotel.z - 11.5 > bounds.minZ && hotel.z + 4.9 < bounds.maxZ);
    assert.ok(Math.hypot(hotel.x - 7, hotel.z - 7) > 12);
    for (let slot = 0; slot < 2; slot++) {
      const bed = layout.uyuniHotelBedSlot(`hotel-${hotel.id}`, slot);
      near(bed.x, hotel.x + (slot - .5) * 3); near(bed.z, hotel.z + 1.5);
      near(bed.yaw, Math.PI); near(bed.avatarY, 1.12);
      assert.deepEqual(plain(layout.claimedUyuniHotelBed({ ...bed, pose: "lying" })), plain(bed));
    }
    for (const slot of [-1, 2, 0.5, NaN]) assert.equal(layout.uyuniHotelBedSlot(`hotel-${hotel.id}`, slot), null);
    assert.equal(layout.claimedUyuniHotelBed({ spotId: `hotel-${hotel.id}`, slot: 0, pose: "sitting" }), null);
  }
  assert.equal(layout.uyuniHotelBedSlot("hut-pine", 0), null);
  assert.equal(layout.uyuniHotelFloorHeight(7, 7), 0);
});

test("front ramps climb continuously, decks stay dry and bed reach never extends through hotel walls", () => {
  for (const hotel of layout.UYUNI_HOTELS) {
    for (let step = 0; step <= 30; step++) {
      const z = hotel.z - 11.5 + step * .1;
      near(layout.uyuniHotelFloorHeight(hotel.x, z), hotel.floorY * step / 30);
    }
    near(layout.uyuniHotelFloorHeight(hotel.x, hotel.z), hotel.floorY);
    assert.equal(layout.uyuniHotelFloorHeight(hotel.x + 5.81, hotel.z), 0);
    assert.equal(layout.nearbyUyuniHotel(hotel.x, hotel.z).id, hotel.id);
    for (const [x, z] of [[hotel.x + 4.5, hotel.z], [hotel.x, hotel.z + 4.6], [hotel.x, hotel.z - 5.1]]) {
      assert.equal(layout.nearbyUyuniHotel(x, z), null);
    }
    near(layout.uyuniHotelCeilingHeight(hotel.x, hotel.z), 5.28);
    assert.ok(layout.uyuniHotelCeilingHeight(hotel.x + 3.3, hotel.z) > hotel.floorY + 2.7);
    assert.equal(layout.uyuniHotelCeilingHeight(hotel.x, hotel.z - 5), null);
  }
});

test("walking routes enter both open fronts, avoid furnishings and return to the shared sky circle", () => {
  const clear = p => {
    const result = nav.resolveWalls(p.x, p.z, layout.UYUNI_HOTEL_COLLIDERS, .4);
    near(result[0], p.x); near(result[1], p.z);
  };
  for (const hotel of layout.UYUNI_HOTELS) {
    const bedApproach = { x: hotel.x, z: hotel.z + .3 };
    const via = [{ x: 0, z: 3.4 }, { x: hotel.x, z: hotel.z - 12 }, bedApproach, { x: 7, z: 10.8 }];
    for (let i = 0; i < via.length - 1; i++) {
      const path = nav.findWalkingPath(via[i], via[i + 1], [], layout.UYUNI_HOTEL_COLLIDERS, bounds);
      assert.ok(path?.length, `open hotel ${hotel.id}, route ${i}`);
      let previous = via[i];
      for (const point of path) {
        const steps = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / .1);
        for (let n = 0; n <= steps; n++) clear({ x: previous.x + (point.x - previous.x) * n / (steps || 1), z: previous.z + (point.z - previous.z) * n / (steps || 1) });
        previous = point;
      }
    }
  }
});

test("hotel meshes remain finite, bounded and light enough to share one mobile scene", () => {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), cotton = new THREE.Texture();
  const hotels = buildUyuniHotels(scene, { wood, cotton });
  scene.updateMatrixWorld(true);
  assert.ok(scene.getObjectByName("uyuni-hotels"));
  let triangles = 0, draws = 0, lights = 0;
  scene.traverse(object => {
    if (object.isLight) lights++;
    if (!object.isMesh) return;
    draws++;
    const position = object.geometry.getAttribute("position");
    assert.ok(Array.from(position.array).every(Number.isFinite), object.name);
    triangles += (object.geometry.index?.count ?? position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    assert.equal(object.castShadow, false, "hotels never turn mobile shadow passes back on");
  });
  assert.equal(lights, 0);
  assert.ok(triangles < 80000, `${triangles} hotel triangles`);
  assert.ok(draws < 90, `${draws} hotel draw calls`);
  for (const hotel of layout.UYUNI_HOTELS) {
    const roof = scene.getObjectByName(`uyuni-hotel-roof-${hotel.id}`);
    assert.ok(roof);
    const box = new THREE.Box3().setFromObject(roof);
    assert.ok(box.max.y < 6 && box.max.y > 5);
    // From a pillow, the front remains open at the eye line all the way to the terrace.
    for (const slot of [0, 1]) {
      const bed = layout.uyuniHotelBedSlot(`hotel-${hotel.id}`, slot);
      const eye = new THREE.Vector3(bed.x, bed.avatarY + 1.42 * Math.sin(bed.incline) + .16, bed.z + 1.42 * Math.cos(bed.incline));
      const ray = new THREE.Raycaster(eye, new THREE.Vector3(0, 0, -1), .3, 40);
      const opaque = ray.intersectObjects(scene.children, true).filter(hit => {
        const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
        return material.visible && (!material.transparent || material.opacity > .9);
      });
      assert.equal(opaque.length, 0, `bed ${hotel.id}/${slot} has an uninterrupted sea view: ${opaque[0]?.object.name}`);
    }
  }
  let disposed = 0;
  wood.addEventListener("dispose", () => disposed++); cotton.addEventListener("dispose", () => disposed++);
  hotels.applyDaylight(daylightAt(12)); hotels.applyDaylight(daylightAt(22));
  hotels.dispose(); hotels.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, 0, "injected CDN textures belong to the engine");
});
