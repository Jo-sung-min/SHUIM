import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const layout = await load("../lib/beach/uyuni-hotel-layout.ts", {}, ["UYUNI_HOTELS", "uyuniHotelBedSlot", "uyuniHotelFloorHeight", "uyuniHotelCeilingHeight"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", { THREE }, ["createShelterDuvetGeometry", "createShelterPillowGeometry", "createShelterTextileMaterial"]);
const { buildUyuniHotels } = await load("../lib/beach/uyuni-hotels.ts", { THREE, RoundedBoxGeometry, ...layout, ...textiles }, ["buildUyuniHotels"]);
const { daylightAt } = await load("../lib/beach/daylight.ts", {}, ["daylightAt"]);
const close = (a, b, message = `${a} ≈ ${b}`) => assert.ok(Math.abs(a - b) < 1e-5, message);
function fixture() {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), cotton = new THREE.Texture();
  const control = buildUyuniHotels(scene, { wood, cotton }); scene.updateMatrixWorld(true);
  return { scene, wood, cotton, control };
}
function instance(scene, name, index) {
  const batch = scene.getObjectByName(name), mesh = new THREE.Mesh(batch.geometry, batch.material);
  batch.getMatrixAt(index, mesh.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.updateMatrixWorld(); return mesh;
}

test("two overwater hotels reuse two injected textures and keep mobile geometry and draw costs bounded", t => {
  const { scene, wood, cotton } = fixture(), geometries = new Set(), materials = new Set();
  let triangles = 0, draws = 0;
  for (const hotel of layout.UYUNI_HOTELS) assert.ok(scene.getObjectByName(`uyuni-hotel-${hotel.id}`));
  scene.traverse(object => {
    assert.ok(!object.isLight, "emissive shades add no real-time lights");
    if (!object.isMesh) return;
    assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    draws++; geometries.add(object.geometry); materials.add(object.material);
  });
  assert.ok(triangles < 40_000, `${triangles} rendered triangles`);
  assert.ok(draws <= 48, `${draws} draws for both furnished hotels`);
  t.diagnostic(`${triangles} rendered triangles, ${draws} shared batches/meshes, ${geometries.size} geometries`);
  for (const material of materials) for (const value of Object.values(material)) {
    if (value?.isTexture) assert.ok(value === wood || value === cotton, "the loader owns every hotel image");
  }
  assert.equal(wood.repeat.x, 1); assert.equal(cotton.repeat.x, 1, "rendering cannot alter injected texture transforms");
  for (const geometry of geometries) {
    for (const attribute of ["position", "normal", "uv"]) {
      assert.ok(geometry.attributes[attribute], `${geometry.name} supplies ${attribute}`);
      assert.ok([...geometry.attributes[attribute].array].every(Number.isFinite));
    }
    assert.equal(geometry.attributes.uv.count, geometry.attributes.position.count);
  }
});

test("closed cocoon shells have inward room normals, outward roof normals and a completely open front", () => {
  const { scene } = fixture();
  for (const hotel of layout.UYUNI_HOTELS) {
    const roof = scene.getObjectByName(`uyuni-hotel-roof-${hotel.id}`);
    const upward = new THREE.Raycaster(new THREE.Vector3(hotel.x, 2, hotel.z), new THREE.Vector3(0, 1, 0)).intersectObject(roof)[0];
    assert.ok(upward); assert.ok(upward.face.normal.y < -0.99);
    close(upward.point.y, layout.uyuniHotelCeilingHeight(hotel.x, hotel.z));
    const downward = new THREE.Raycaster(new THREE.Vector3(hotel.x, 8, hotel.z), new THREE.Vector3(0, -1, 0)).intersectObject(roof)[0];
    assert.ok(downward); assert.ok(downward.face.normal.y > 0.99); close(downward.point.y - upward.point.y, 0.13);
    for (const x of [-3.5, -2, 0, 2, 3.5]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(hotel.x + x, 1.65, hotel.z - 9), new THREE.Vector3(0, 0, 1));
      assert.equal(ray.intersectObject(roof).length, 0, "no front wall or hidden end cap crosses the entrance");
      assert.ok(ray.intersectObject(scene.getObjectByName(`uyuni-hotel-back-${hotel.id}`)).length > 0, "the rear remains private");
    }
    for (const direction of [-1, 1]) {
      const side = new THREE.Raycaster(new THREE.Vector3(hotel.x, 1.8, hotel.z), new THREE.Vector3(direction, 0, 0)).intersectObject(roof)[0];
      assert.ok(side); assert.ok(side.face.normal.x * direction < 0);
    }
  }
});

test("ramps meet the raised rounded deck continuously and preserve the central sea-view path", () => {
  const { scene } = fixture();
  for (const hotel of layout.UYUNI_HOTELS) {
    const ramp = scene.getObjectByName(`uyuni-hotel-ramp-${hotel.id}`), deck = scene.getObjectByName(`uyuni-hotel-deck-${hotel.id}`);
    for (const dz of [-11.49, -10.5, -9.5, -8.51, -8.49, -7, 0, 4.8]) {
      const hit = new THREE.Raycaster(new THREE.Vector3(hotel.x, 3, hotel.z + dz), new THREE.Vector3(0, -1, 0)).intersectObjects([ramp, deck])[0];
      assert.ok(hit); close(hit.point.y, layout.uyuniHotelFloorHeight(hotel.x, hotel.z + dz));
    }
    const camera = new THREE.Vector3(hotel.x, 1.8, hotel.z - 4.8);
    const blockers = new THREE.Raycaster(camera, new THREE.Vector3(0, 0, -1), 0, 9).intersectObject(scene, true);
    assert.equal(blockers.length, 0, "neither a front rail nor the twin sunbeds block the central water view");
    for (const side of [-1, 1]) {
      const rail = new THREE.Raycaster(new THREE.Vector3(hotel.x, 1.12, hotel.z - 6), new THREE.Vector3(side, 0, 0), 0, 6)
        .intersectObject(scene.getObjectByName("uyuni-hotel-side-rails"))[0];
      assert.ok(rail, "side deck colliders have visible low timber rails");
      assert.ok(Math.abs(rail.point.x - hotel.x - side * 5.7) < 0.04);
    }
  }
});

test("two beds per hotel share soft textiles, fit the agreed footprints and leave resting faces above the covers", () => {
  const { scene } = fixture();
  assert.equal(scene.getObjectByName("uyuni-hotel-duvets").count, 4);
  for (const [hotelIndex, hotel] of layout.UYUNI_HOTELS.entries()) for (let slot = 0; slot < 2; slot++) {
    const index = hotelIndex * 2 + slot, claim = layout.uyuniHotelBedSlot(`hotel-${hotel.id}`, slot);
    const base = instance(scene, "uyuni-hotel-bed-bases", index), mattress = instance(scene, "uyuni-hotel-mattresses", index);
    const bounds = new THREE.Box3().setFromObject(base), quilt = instance(scene, "uyuni-hotel-duvets", index);
    close(bounds.min.x, claim.x - 1.05); close(bounds.max.x, claim.x + 1.05);
    close(bounds.min.z, hotel.z + 1.1); close(bounds.max.z, hotel.z + 3.8);
    close(new THREE.Box3().setFromObject(mattress).max.y, 1.06);
    const headZ = claim.z + 1.8 * Math.cos(claim.incline), headY = claim.avatarY + 1.8 * Math.sin(claim.incline);
    const quiltBounds = new THREE.Box3().setFromObject(quilt);
    assert.ok(headZ > quiltBounds.max.z + 0.2 && headY > quiltBounds.max.y + 0.1);
    for (const dx of [-0.3, 0, 0.3]) for (const dz of [1.5, 2.02, 2.4]) {
      const cover = new THREE.Raycaster(new THREE.Vector3(claim.x + dx, 2, hotel.z + dz), new THREE.Vector3(0, -1, 0)).intersectObject(quilt)[0];
      assert.ok(cover && cover.point.y >= 1.37, "central loft covers the unchanged resting hands and feet");
    }
    const pillow = instance(scene, "uyuni-hotel-pillows", index);
    for (const bedding of [quilt, pillow]) {
      const bottom = new THREE.Raycaster(new THREE.Vector3(bedding.position.x, 0.8, bedding.position.z), new THREE.Vector3(0, 1, 0)).intersectObject(bedding)[0];
      const support = new THREE.Raycaster(new THREE.Vector3(bedding.position.x, 1.5, bedding.position.z), new THREE.Vector3(0, -1, 0)).intersectObject(mattress)[0];
      assert.ok(bottom && support); assert.ok(bottom.point.y <= support.point.y + 0.002, "soft bedding settles into the mattress instead of levitating");
    }
    const front = new THREE.Raycaster(new THREE.Vector3(claim.x, headY, headZ), new THREE.Vector3(0, 0, -1), 0, 12);
    assert.equal(front.intersectObjects([scene.getObjectByName(`uyuni-hotel-roof-${hotel.id}`), scene.getObjectByName("uyuni-hotel-curtains")]).length, 0);
  }
  const sofa = instance(scene, "uyuni-hotel-sofa-seats", 0);
  close(new THREE.Box3().setFromObject(sofa).max.y, 1.05);
});

test("the entire oval rug has a solid upward top surface separated from the deck", () => {
  const { scene } = fixture();
  for (let index = 0; index < layout.UYUNI_HOTELS.length; index++) {
    const rug = instance(scene, "uyuni-hotel-rugs", index), hotel = layout.UYUNI_HOTELS[index];
    const deck = scene.getObjectByName(`uyuni-hotel-deck-${hotel.id}`);
    for (const radius of [0, 0.3, 0.65, 0.95]) for (let step = 0; step < 48; step++) {
      const angle = step / 48 * Math.PI * 2;
      const origin = new THREE.Vector3(rug.position.x + Math.cos(angle) * radius * 2.45, 2, rug.position.z + Math.sin(angle) * radius * 2.25);
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
      const top = ray.intersectObject(rug)[0], floor = ray.intersectObject(deck)[0];
      assert.ok(top && floor, "every quadrant and cap triangle remains filled");
      assert.ok(top.face.normal.y > 0.99);
      close(top.point.y, 0.51); assert.ok(top.point.y - floor.point.y > 0.029, "a 3cm top gap prevents floor z-fighting");
    }
  }
});

test("nighttime lamps glow warmly without changing the shared wood or cotton resources", () => {
  const { scene, control, wood, cotton } = fixture();
  const shade = scene.getObjectByName("uyuni-hotel-lamps").material;
  control.applyDaylight(daylightAt(12)); const day = shade.emissiveIntensity;
  for (let hour = 0; hour <= 24; hour += 0.25) {
    control.applyDaylight(daylightAt(hour));
    assert.ok(Number.isFinite(shade.emissiveIntensity) && shade.emissiveIntensity >= 0.1 && shade.emissiveIntensity <= 1);
  }
  control.applyDaylight(daylightAt(0)); assert.ok(shade.emissiveIntensity > day * 4);
  assert.ok(shade.emissive.r > shade.emissive.b);
  assert.equal(scene.getObjectByName("uyuni-hotel-duvets").material.map, cotton);
  assert.equal(scene.getObjectByName("uyuni-hotel-bed-bases").material.map, wood);
});

test("hotel cleanup releases shared geometry and materials exactly once while retaining injected textures", () => {
  const { scene, control, wood, cotton } = fixture(), counts = new Map();
  const retained = new THREE.Group(); scene.add(retained);
  assert.equal(control.root, scene.getObjectByName("uyuni-hotels"));
  control.root.traverse(object => {
    if (!object.isMesh) return;
    for (const resource of [object.geometry, object.material, ...(object.isInstancedMesh ? [object] : [])]) if (!counts.has(resource)) {
      counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
    }
  });
  let textureDisposals = 0;
  for (const texture of [wood, cotton]) texture.addEventListener("dispose", () => textureDisposals++);
  control.dispose(); control.dispose(); control.applyDaylight(daylightAt(0));
  assert.deepEqual(scene.children, [retained]); assert.equal(control.root.children.length, 0);
  assert.ok([...counts.values()].every(count => count === 1)); assert.equal(textureDisposals, 0);
});
