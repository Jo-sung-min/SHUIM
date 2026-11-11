import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, dependencies, names) {
  const source = stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"), { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { THREE, mergeGeometries, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const trail = await load("../lib/beach/bamboo-trail.ts", {}, [
  "PAVILION_HALF", "PAVILION_REACH", "PAVILION_RISE", "PAVILION_STEP_HALF_WIDTH", "PAVILION_STEP_LENGTH", "PAVILION_POST_HEIGHT", "PAVILION_EAVE",
  "PAVILION_SEAT_CAPACITY", "TRAIL_WALK_HALF", "nearestOnTrail", "sampleCatmullRom", "seededRandom",
]);
const layout = await load("../lib/beach/garden-layout.ts", trail, [
  "GARDEN_PHOTO_ZONE", "GARDEN_WALK_RADIUS", "GROUND_Y", "LAKE", "insideHall", "lakeSigned", "onGardenGround", "GARDEN_POLYLINES", "onPier", "onBridge",
]);
const { buildGardenPhotoZone, gardenFestivalSites, GARDEN_FESTIVAL_RADIUS } = await load("../lib/beach/garden-photo-zone.ts", layout, ["buildGardenPhotoZone", "gardenFestivalSites", "GARDEN_FESTIVAL_RADIUS"]);

test("photo pockets wrap the walkable perimeter while preserving the lake and castle approaches", () => {
  const sites = gardenFestivalSites();
  assert.equal(sites.length, 16);
  assert.equal(new Set(sites.map(site => site.theme)).size, 4);
  assert.ok(Math.abs(GARDEN_FESTIVAL_RADIUS - (layout.LAKE.z - (layout.GARDEN_PHOTO_ZONE.z - 1.75))) < 1e-9, "every space follows the SOROW arch circle");
  for (const site of sites) {
    assert.ok(Math.abs(Math.hypot(site.x - layout.LAKE.x, site.z - layout.LAKE.z) - GARDEN_FESTIVAL_RADIUS) < 1e-9);
    assert.ok(layout.onGardenGround(site.x, site.z));
    assert.ok(layout.lakeSigned(site.x, site.z) > 5);
    assert.ok(!layout.insideHall(site.x, site.z, 6));
    assert.ok(!layout.onPier(site.x, site.z, 3) && !layout.onBridge(site.x, site.z, 3));
    assert.ok(trail.nearestOnTrail(site.x, site.z, layout.GARDEN_POLYLINES).distance > 3, `sculpture at ${site.x},${site.z} clears the main path`);
    // The entire posing circle stays on the existing ground contract.
    const cx = site.x, cz = site.z;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      assert.ok(layout.onGardenGround(cx + Math.cos(a) * 1.7, cz + Math.sin(a) * 1.7));
    }
  }
  // Every open eighth of the map has a photo pocket; the north is the castle.
  for (const angle of [0, Math.PI / 4, Math.PI * .75, Math.PI, Math.PI * 1.25, Math.PI * 1.75]) {
    assert.ok(sites.some(site => Math.acos(Math.cos(site.angle - angle)) < Math.PI / 8));
  }
});

test("the Christmas festival remains eight draws with finite geometry and no added lights", t => {
  for (const mobile of [true, false]) {
    const scene = new THREE.Scene(), photo = buildGardenPhotoZone(scene, mobile);
    let triangles = 0, meshes = 0, points = 0;
    const resources = new Set();
    scene.traverse(object => {
      assert.ok(!object.isLight);
      if (!object.isMesh && !object.isPoints) return;
      if (object.isMesh) { meshes++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3; }
      if (object.isPoints) points += object.geometry.getAttribute("position").count;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(Array.from(attribute.array).every(Number.isFinite));
      assert.ok(object.layers.isEnabled(2)); assert.equal(object.castShadow, false);
      resources.add(object.geometry); resources.add(object.material);
    });
    assert.equal(meshes, 7); assert.equal(photo.root.children.length, 8);
    assert.ok(points > 1000 && points < 2500, `${points} batched fairy lights`);
    assert.ok(triangles < 100000, `${triangles} festival triangles`);
    const core = scene.getObjectByName("photo-neon-core").geometry.getAttribute("position");
    for (let vertex = 0; vertex < core.count; vertex++) assert.ok(core.getY(vertex) > layout.GROUND_Y + .07, "no glowing floor outline or perimeter ribbon remains");
    const captions = scene.getObjectByName("garden-photo-sign").geometry;
    const vertices = captions.getAttribute("position"), normals = captions.getAttribute("normal");
    for (let first = 0; first < vertices.count; first += 4) {
      const centre = new THREE.Vector3();
      for (let vertex = first; vertex < first + 4; vertex++) centre.add(new THREE.Vector3().fromBufferAttribute(vertices, vertex));
      centre.multiplyScalar(.25);
      const towardLawn = new THREE.Vector3(layout.LAKE.x - centre.x, 0, layout.LAKE.z - centre.z);
      assert.ok(new THREE.Vector3().fromBufferAttribute(normals, first).dot(towardLawn) > 0, "caption fronts face visitors inside the garden, so lettering is not mirrored");
    }
    photo.applyDaylight(1);
    assert.equal(scene.getObjectByName("garden-festival-fairy-lights").material.uniforms.uNight.value, 1);
    assert.equal(scene.getObjectByName("photo-neon-core").material.color.r, 1);
    photo.applyDaylight(NaN);
    assert.equal(scene.getObjectByName("photo-neon-halo").material.opacity, 0);
    const disposed = new Map([...resources].map(resource => [resource, 0]));
    for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, disposed.get(resource) + 1));
    photo.dispose(); photo.dispose();
    assert.equal(scene.children.length, 0); assert.ok([...disposed.values()].every(count => count === 1));
    t.diagnostic(`${mobile ? "mobile" : "desktop"}: ${meshes} meshes + one Points batch, ${triangles} triangles, ${points} fairy bulbs`);
  }
});

test("Christmas trees have dense tapered evergreen silhouettes, star toppers and elevated fairy lights", () => {
  const scene = new THREE.Scene(), photo = buildGardenPhotoZone(scene, true);
  scene.updateMatrixWorld(true);
  const fir = scene.getObjectByName("photo-christmas-evergreens");
  assert.ok(fir?.isMesh && fir.material.isMeshStandardMaterial);
  assert.equal(photo.root.userData.christmasTrees.length, 16);
  for (const tree of photo.root.userData.christmasTrees) {
    const widthAt = height => {
      const ray = new THREE.Raycaster(new THREE.Vector3(tree.x - 4, layout.GROUND_Y + height, tree.z), new THREE.Vector3(1, 0, 0), 0, 4);
      const hit = ray.intersectObject(fir)[0];
      assert.ok(hit, "dense evergreen foliage covers the tree body");
      return tree.x - hit.point.x;
    };
    assert.ok(widthAt(tree.height * .28) > widthAt(tree.height * .84) * 1.5, "the lower boughs widen into a Christmas-tree silhouette");
    const star = new THREE.Raycaster(new THREE.Vector3(tree.x, layout.GROUND_Y + tree.height + .27, tree.z - 1), new THREE.Vector3(0, 0, 1), 0, 2);
    assert.ok(star.intersectObject(scene.getObjectByName("photo-neon-core")).length > 0, "each evergreen carries a solid golden star");
  }
  photo.dispose();
});

test("south court and centre lawn retain clear walking-height sightlines", () => {
  const scene = new THREE.Scene(), photo = buildGardenPhotoZone(scene, true);
  scene.updateMatrixWorld(true);
  const meshes = photo.root.children.filter(object => object.isMesh);
  for (const x of [-4, -2, 0, 2, 4]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, layout.GROUND_Y + 1.5, -10), new THREE.Vector3(0, 0, -1), 0, 9);
    assert.equal(ray.intersectObjects(meshes).length, 0);
  }
  for (const x of [-12, 0, 12]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, layout.GROUND_Y + 1.5, 0), new THREE.Vector3(0, 0, 1), 0, 54);
    assert.equal(ray.intersectObjects(meshes).length, 0);
  }
  photo.dispose();
});
