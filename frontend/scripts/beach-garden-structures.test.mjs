import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/^export\s*\{[^}]*\};?\r?$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { THREE, mergeGeometries, RoundedBoxGeometry, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}

const trail = await load("../lib/beach/bamboo-trail.ts", {}, [
  "PAVILION_HALF", "PAVILION_REACH", "PAVILION_RISE", "PAVILION_STEP_HALF_WIDTH", "PAVILION_STEP_LENGTH", "PAVILION_POST_HEIGHT", "PAVILION_EAVE",
  "PAVILION_SEAT_CAPACITY", "TRAIL_WALK_HALF", "nearestOnTrail", "sampleCatmullRom", "seededRandom",
]);
const layout = await load("../lib/beach/garden-layout.ts", trail, [
  "BRIDGE_Y", "GARDEN_BRIDGE", "GARDEN_LANTERNS", "GARDEN_PAVILIONS", "GARDEN_PIERS", "GATE_WALL_Z", "GROUND_Y", "HALL", "HALL_BENCH_HEIGHT", "HALL_SEAT_LX", "HALL_STAIR_HALF", "HALL_STAIR_RUN",
  "HALL_TIERS", "PIER_Y", "WATER_Y", "gardenPavilionWorld", "pierEnd", "GARDEN_SEATS",
  "BOAT_STOPS", "GARDEN_POLYLINES", "GARDEN_WILLOWS", "LAKE", "insideHall", "lakeRadiusAt", "lakeSigned", "onBridge", "onPier",
]);
const roofs = await load("../lib/beach/bamboo-pavilions.ts", trail, ["hipRoofGeometry", "hipRidgeGeometry", "roofTileTexture"]);
const stone = await load("../lib/beach/bamboo.ts", trail, ["stoneLanternGeometry"]);
const ink = await load("../lib/beach/garden-ink.ts", { ...trail, ...layout }, ["plasterTexture", "latticeTexture"]);
const skyBase = await load("../lib/beach/sky-shader.ts", {}, ["SKY_FUNCTIONS", "SKY_UNIFORMS"]);
const coast = await load("../lib/beach/uyuni-coast.ts", {}, ["UYUNI_COAST_FUNCTIONS"]);
const sky = await load("../lib/beach/uyuni-shader.ts", { ...skyBase, ...coast }, ["UYUNI_SKY_FUNCTIONS", "UYUNI_SKY_UNIFORMS"]);
const gardenShaders = await load("../lib/beach/garden-shader.ts", sky, ["GARDEN_GLASS_VERT", "GARDEN_GLASS_FRAG"]);
const bambooShaders = await load("../lib/beach/bamboo-shader.ts", sky, ["BAMBOO_GLOW_VERT", "BAMBOO_GLOW_FRAG"]);
const { buildGardenStructures, toonGradient } = await load("../lib/beach/garden-hall.ts", {
  ...trail, ...layout, ...roofs, ...stone, ...ink, ...gardenShaders, ...bambooShaders,
}, ["buildGardenStructures", "toonGradient"]);
const { gardenDetailSites, buildGardenLandscapeDetail } = await load("../lib/beach/garden-landscape-detail.ts", { ...trail, ...layout }, ["gardenDetailSites", "buildGardenLandscapeDetail"]);

function build(mobile) {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), gradient = toonGradient();
  const structures = buildGardenStructures(scene, { wood }, gradient, mobile);
  scene.updateMatrixWorld(true);
  return { scene, wood, gradient, structures };
}

test("rounded hall cushions still meet all 24 server-aligned seat positions", () => {
  const { scene, structures, gradient } = build(true);
  const cushions = [scene.getObjectByName("garden-linen-cushions"), scene.getObjectByName("garden-sage-cushions")];
  assert.ok(cushions.every(Boolean));
  for (const seat of layout.GARDEN_SEATS.filter(seat => seat.spotId.startsWith("hall-tier-"))) {
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + 0.2, seat.z), new THREE.Vector3(0, -1, 0), 0, 0.3);
    const hit = ray.intersectObjects(cushions)[0];
    assert.ok(hit, `${seat.id} lands on its cushion`);
    assert.ok(Math.abs(hit.point.y - seat.avatarY) < 1e-5, `${seat.id} height stays aligned`);
  }
  // The stair centre remains free of new cushions and ceramics at walking height.
  const ceramics = scene.getObjectByName("garden-ivory-ceramic");
  for (const z of [62.6, 67.4, 71.8, 77]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 6, z), new THREE.Vector3(0, -1, 0), 0, 6);
    assert.equal(ray.intersectObjects([...cushions, ceramics]).length, 0);
  }
  structures.dispose(); gradient.dispose();
});

test("natural garden materials remain merged and bounded without new light or shadow passes", () => {
  for (const mobile of [true, false]) {
    const { scene, structures, gradient } = build(mobile);
    let triangles = 0, meshes = 0, lights = 0;
    scene.traverse(object => {
      if (object.isLight) lights++;
      if (!object.isMesh) return;
      meshes++;
      assert.ok(object.layers.isEnabled(2), `${object.name} is available to the lake reflection`);
      assert.equal(object.castShadow, false);
      const p = object.geometry.getAttribute("position");
      assert.ok(Array.from(p.array).every(Number.isFinite), `${object.name} finite geometry`);
      triangles += (object.geometry.index?.count ?? p.count) / 3 * (object.isInstancedMesh ? object.count : 1);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) assert.ok(!material.isMeshToonMaterial, `${object.name} avoids stepped flat shading`);
    });
    assert.equal(lights, 0);
    assert.ok(meshes <= 29, `${meshes} material batches`);
    assert.ok(triangles < 90000, `${triangles} structure triangles`);
    const warmWood = scene.getObjectByName("garden-pavilion-timber").material;
    assert.ok(warmWood.color.r < warmWood.color.g * 2.1, "pavilion wood stays warm brown instead of saturated red");
    structures.dispose(); gradient.dispose();
  }
});

test("day, rain and night update the shared lamps and release owned GPU resources once", () => {
  const { scene, structures, wood, gradient } = build(false);
  const resources = new Set();
  scene.traverse(object => {
    if (!object.isMesh) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
  });
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  let sharedDisposals = 0;
  wood.addEventListener("dispose", () => sharedDisposals++);
  gradient.addEventListener("dispose", () => sharedDisposals++);
  structures.applyDaylight({ lanterns: 0 }, 0);
  assert.equal(scene.getObjectByName("garden-glow").visible, false);
  structures.applyDaylight({ lanterns: 0 }, 0.7);
  const glow = scene.getObjectByName("garden-glow");
  assert.ok(glow.visible && glow.material.uniforms.uNight.value > 0, "rain lamps have a visible glow even in daytime");
  structures.applyDaylight({ lanterns: 1 }, 0);
  structures.setRain(0.5); structures.setTime(15);
  const glass = scene.getObjectByName("garden-hall-glass").material;
  assert.equal(glass.uniforms.uRain.value, 0.5);
  assert.equal(glass.uniforms.uTime.value, 15);
  const beads = scene.getObjectByName("garden-chandelier-crystals"), full = beads.count;
  structures.setQuality(true); assert.ok(beads.count < full);
  structures.setQuality(false); assert.equal(beads.count, full);
  structures.dispose(); structures.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(sharedDisposals, 0);
  assert.ok([...counts.values()].every(count => count === 1), "rendered geometries and materials dispose exactly once");
  gradient.dispose(); wood.dispose();
});

test("shore planting stays in small land clusters and leaves walks and boat boarding clear", () => {
  const desktop = gardenDetailSites(false), mobile = gardenDetailSites(true);
  assert.ok(desktop.length > 50 && desktop.length < 300, `${desktop.length} clustered details`);
  assert.ok(mobile.length < desktop.length && mobile.length > 40);
  for (const site of desktop) {
    const radius = site.kind === "rock" ? site.scale * 0.95 : 0.18;
    assert.ok(layout.lakeSigned(site.x, site.z) >= 0.45, "planting rests on the flat land bank");
    assert.ok(!layout.insideHall(site.x, site.z, 3));
    assert.ok(trail.nearestOnTrail(site.x, site.z, layout.GARDEN_POLYLINES).distance > trail.TRAIL_WALK_HALF + radius + 0.3, "the entire detail clears the walking corridor");
    assert.ok(!layout.onPier(site.x, site.z, radius + 0.6) && !layout.onBridge(site.x, site.z, radius + 0.6));
    for (const stop of layout.BOAT_STOPS) assert.ok(Math.hypot(stop.x - site.x, stop.z - site.z) >= 4.2 + radius);
  }
  const key = site => `${site.kind}:${site.x}:${site.z}`;
  const full = new Set(desktop.map(key));
  assert.ok(mobile.every(site => full.has(key(site))), "mobile thins the same planting design");
});

test("near shore stones, grasses and blooms add only three finite batches with bounded triangles", t => {
  for (const mobile of [true, false]) {
    const scene = new THREE.Scene(), details = buildGardenLandscapeDetail(scene, mobile);
    let count = 0, triangles = 0, disposed = 0;
    scene.traverse(object => {
      assert.ok(!object.isLight);
      if (!object.isMesh) return;
      count++;
      const p = object.geometry.getAttribute("position");
      assert.ok(Array.from(p.array).every(Number.isFinite));
      assert.ok(Array.from(object.geometry.getAttribute("normal").array).every(Number.isFinite));
      triangles += (object.geometry.index?.count ?? p.count) / 3;
      assert.ok(object.layers.isEnabled(2));
      assert.equal(object.castShadow, false);
      object.geometry.addEventListener("dispose", () => disposed++);
      object.material.addEventListener("dispose", () => disposed++);
    });
    assert.equal(count, 3);
    assert.ok(triangles < 20000, `${triangles} near-shore triangles`);
    t.diagnostic(`${mobile ? "mobile" : "desktop"}: ${gardenDetailSites(mobile).length} details, ${count} draws, ${triangles} triangles`);
    details.dispose(); details.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(disposed, 6);
  }
});
