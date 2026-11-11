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
  "BRIDGE_Y", "GARDEN_BRIDGE", "GARDEN_LANTERNS", "GARDEN_PAVILIONS", "GARDEN_PIERS", "GARDEN_PHOTO_ZONE", "GROUND_Y", "HALL", "HALL_BENCH_HEIGHT", "HALL_SEAT_LX", "HALL_STAIR_HALF", "HALL_STAIR_RUN",
  "HALL_TIERS", "PIER_Y", "WATER_Y", "gardenPavilionWorld", "pierEnd", "GARDEN_SEATS",
  "BOAT_STOPS", "GARDEN_POLYLINES", "GARDEN_POND_BENCHES", "GARDEN_WILLOWS", "GARDEN_WALK_RADIUS", "LAKE", "insideHall", "lakeRadiusAt", "lakeSigned", "onBridge", "onPier",
]);
const roofs = await load("../lib/beach/bamboo-pavilions.ts", trail, ["hipRoofGeometry", "hipRidgeGeometry", "roofTileTexture"]);
const stone = await load("../lib/beach/bamboo.ts", trail, ["stoneLanternGeometry"]);
const ink = await load("../lib/beach/garden-ink.ts", { ...trail, ...layout }, ["plasterTexture", "latticeTexture"]);
const skyBase = await load("../lib/beach/sky-shader.ts", {}, ["SKY_FUNCTIONS", "SKY_UNIFORMS"]);
const coast = await load("../lib/beach/uyuni-coast.ts", {}, ["UYUNI_COAST_FUNCTIONS"]);
const sky = await load("../lib/beach/uyuni-shader.ts", { ...skyBase, ...coast }, ["UYUNI_SKY_FUNCTIONS", "UYUNI_SKY_UNIFORMS"]);
const gardenShaders = await load("../lib/beach/garden-shader.ts", sky, ["GARDEN_GLASS_VERT", "GARDEN_GLASS_FRAG"]);
const bambooShaders = await load("../lib/beach/bamboo-shader.ts", sky, ["BAMBOO_GLOW_VERT", "BAMBOO_GLOW_FRAG"]);
const photo = await load("../lib/beach/garden-photo-zone.ts", layout, ["buildGardenPhotoZone"]);
const castle = await load("../lib/beach/garden-castle.ts", { ...layout, ...trail }, ["buildGardenCastle"]);
const { buildGardenStructures, toonGradient } = await load("../lib/beach/garden-hall.ts", {
  ...trail, ...layout, ...roofs, ...stone, ...ink, ...gardenShaders, ...bambooShaders, ...photo, ...castle,
}, ["buildGardenStructures", "toonGradient"]);
const { gardenDetailSites, buildGardenLandscapeDetail } = await load("../lib/beach/garden-landscape-detail.ts", { ...trail, ...layout }, ["gardenDetailSites", "buildGardenLandscapeDetail"]);

function build(mobile) {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), gradient = toonGradient();
  const structures = buildGardenStructures(scene, { wood }, gradient, mobile);
  scene.updateMatrixWorld(true);
  return { scene, wood, gradient, structures };
}

test("clear hall glazing preserves the outside view in every weather without texture resources", () => {
  const { scene, structures, wood, gradient } = build(true);
  const glass = scene.getObjectByName("garden-hall-glass"), material = glass.material;
  assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  assert.equal(material.side, THREE.DoubleSide); assert.equal(material.forceSinglePass, true);
  assert.equal(material.uniforms.uGlassOpacity.value, .008, "head-on clear glass barely tints the landscape");
  assert.equal(material.uniforms.uGlassEdgeOpacity.value, .035);
  assert.ok(material.uniforms.uGlassOpacity.value + material.uniforms.uGlassEdgeOpacity.value < .05, "even glancing glass cannot become a cloudy sheet");
  assert.ok(Object.values(material.uniforms).every(uniform => !uniform.value?.isTexture), "clear glass needs no image or fallback texture");
  const version = material.version, geometry = glass.geometry;
  for (const rain of [0, .25, 1, .4, 0]) {
    structures.applyDaylight({ lanterns: rain ? 1 : 0 }, rain); structures.setTime(100);
    assert.equal(material.uniforms.uGlassOpacity.value, .008);
    assert.equal(material.uniforms.uGlassEdgeOpacity.value, .035);
    assert.equal(material.version, version, "weather never recompiles the clear glass");
    assert.equal(glass.geometry, geometry);
  }
  structures.dispose(); structures.dispose();
  wood.dispose(); gradient.dispose();
});

function floorHits(scene, x, z) {
  const surfaces = ["garden-oak-floor", "garden-weathered-timber", "garden-stone-foundation"].map(name => scene.getObjectByName(name));
  return new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0), 0, 6).intersectObjects(surfaces);
}

test("hall decks and tier edges have a single visible surface instead of coplanar wood and stone", () => {
  const { scene, structures, gradient } = build(true);
  for (const tier of layout.HALL_TIERS) {
    for (const z of [layout.HALL.glassZ + tier.from + 0.04, layout.HALL.glassZ + tier.from + 0.63]) {
      const hits = floorHits(scene, layout.HALL.x + 5.31, z);
      assert.ok(hits.length > 0);
      assert.ok(Math.abs(hits[0].point.y - tier.y) < 1e-5, "floor height remains aligned with walking height");
      const atFloor = hits.filter(hit => Math.abs(hit.point.y - tier.y) < 1e-5);
      assert.equal(atFloor.length, 1, `tier ${tier.y}, z ${z}: ${atFloor.map(hit => hit.object.name).join(", ")} must not fight for the same depth`);
    }
  }
  structures.dispose(); gradient.dispose();
});

test("all hall stair treads stay exposed without overlapping a tier landing", () => {
  const { scene, structures, gradient } = build(false);
  for (let index = 0; index < layout.HALL_TIERS.length - 1; index++) {
    const lower = layout.HALL_TIERS[index], upper = layout.HALL_TIERS[index + 1];
    const boundary = layout.HALL.glassZ + lower.to;
    for (let step = 0; step < 3; step++) {
      const z = boundary - layout.HALL_STAIR_RUN / 2 + layout.HALL_STAIR_RUN * (step + 0.63) / 3;
      const top = lower.y + (upper.y - lower.y) * (step + 1) / 3;
      const hits = floorHits(scene, layout.HALL.x + 0.37, z);
      assert.ok(Math.abs(hits[0].point.y - top) < 1e-5, `tier ${index}, tread ${step} is not buried under the next floor`);
      assert.equal(hits.filter(hit => Math.abs(hit.point.y - top) < 1e-5).length, 1, `tier ${index}, tread ${step} has no overlapping top faces`);
    }
    for (const [z, top] of [[boundary - layout.HALL_STAIR_RUN / 2 - 0.04, lower.y], [boundary + layout.HALL_STAIR_RUN / 2 + 0.04, upper.y]]) {
      const hits = floorHits(scene, layout.HALL.x + 0.37, z);
      assert.ok(Math.abs(hits[0].point.y - top) < 1e-5, "landings still join the stair run");
    }
  }
  structures.dispose(); gradient.dispose();
});

test("elevated hall decks and stair sides have solid risers instead of exposing green ground underneath", () => {
  const { scene, structures, gradient } = build(true);
  const floor = scene.getObjectByName("garden-oak-floor");
  for (let index = 0; index < layout.HALL_TIERS.length - 1; index++) {
    const lower = layout.HALL_TIERS[index], boundary = layout.HALL.glassZ + lower.to;
    // Look under the higher deck, above the lower walking surface. A thin slab leaves a hole.
    const front = new THREE.Raycaster(new THREE.Vector3(layout.HALL.x + 5.31, lower.y + .1, boundary - .4), new THREE.Vector3(0, 0, 1), 0, .6);
    const frontHit = front.intersectObject(floor)[0];
    assert.ok(frontHit && Math.abs(frontHit.point.z - boundary) < 1e-5, `tier ${index + 1} has a closed front riser`);
    // The side of the highest tread must also be filled below its former thin top slab.
    const side = new THREE.Raycaster(new THREE.Vector3(layout.HALL.x + .37, lower.y + .1, boundary + layout.HALL_STAIR_RUN * .35), new THREE.Vector3(1, 0, 0), 0, layout.HALL_STAIR_HALF);
    const previousSide = floor.material.side;
    floor.material.side = THREE.DoubleSide;
    const sideHit = side.intersectObject(floor)[0];
    floor.material.side = previousSide;
    assert.ok(sideHit && Math.abs(sideHit.point.x - (layout.HALL.x + layout.HALL_STAIR_HALF)) < 1e-5, `tier ${index + 1} stair side reaches its foundation`);
  }
  structures.dispose(); gradient.dispose();
});

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

test("castle masonry preserves the hall doors, glass sightlines and central aisle", () => {
  const { scene, structures, gradient } = build(true), castle = scene.getObjectByName("garden-castle");
  const glass = scene.getObjectByName("garden-hall-glass");
  glass.geometry.computeBoundingBox();
  assert.equal(glass.geometry.getAttribute("position").count, 7 * 4 * 4, "every original glass pane remains");
  assert.equal(glass.geometry.boundingBox.min.z, layout.HALL.glassZ);
  for (const side of [-1, 1]) for (const offset of [-1.05, 0, 1.05]) for (const y of [2.65, 3.4, 4.4, 5.35]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(side * 17, y, layout.HALL.doorZ + offset), new THREE.Vector3(-side, 0, 0), 0, 4);
    assert.equal(ray.intersectObject(castle, true).length, 0, "stone does not encroach on either existing side doorway");
  }
  for (const seat of layout.GARDEN_SEATS.filter(seat => seat.spotId.startsWith("hall-tier-"))) {
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .85, layout.HALL.glassZ + 1), new THREE.Vector3(0, 0, -1), 0, 2);
    assert.equal(ray.intersectObject(castle, true).length, 0, `${seat.id} keeps a clear lake view through the glass`);
  }
  for (const z of [62.6, 67.4, 71.8, 77]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, z), new THREE.Vector3(0, -1, 0), 0, 4.3);
    assert.equal(ray.intersectObject(castle, true).length, 0, "the castle exterior never enters the stairs");
  }
  structures.dispose(); gradient.dispose();
});

test("reading chairs provide backs and private side wings without changing seat height or the stair corridor", () => {
  const { scene, structures, gradient } = build(false);
  const upholstery = [scene.getObjectByName("garden-linen-cushions"), scene.getObjectByName("garden-sage-cushions")];
  for (const seat of layout.GARDEN_SEATS.filter(seat => seat.spotId.startsWith("hall-tier-"))) {
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.baseY + 1.12, seat.z), new THREE.Vector3(0, 0, 1), 0, .85);
    assert.ok(ray.intersectObjects(upholstery).length, `${seat.id} has a padded back`);
    const forward = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .5, seat.z), new THREE.Vector3(0, 0, -1), 0, .85);
    assert.equal(forward.intersectObjects(upholstery).length, 0, `${seat.id} remains open toward the lake`);
  }
  for (const x of [-1.8, 0, 1.8]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 3.5, 61), new THREE.Vector3(0, 0, 1), 0, 18);
    assert.equal(ray.intersectObjects(upholstery).length, 0, "chair arms and sofa wings stay outside the full stair aisle");
  }
  // Both outer rear pairs share continuous padding between their unchanged seat anchors.
  for (const x of [-9, 9]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 4.6, 77), new THREE.Vector3(0, -1, 0), 0, 2);
    assert.ok(ray.intersectObjects(upholstery).length, "rear paired seats are joined by a soft shared cushion");
  }
  structures.dispose(); gradient.dispose();
});

test("castle roof covers the original hall and its silhouette costs only three merged draws", t => {
  for (const mobile of [true, false]) {
    const scene = new THREE.Scene(), stoneMap = new THREE.Texture(), slateMap = new THREE.Texture();
    const exterior = castle.buildGardenCastle(scene, { stone: stoneMap, slate: slateMap }, mobile);
    scene.updateMatrixWorld(true);
    let triangles = 0;
    assert.equal(exterior.root.children.length, 3);
    exterior.root.traverse(object => {
      if (!object.isMesh) return;
      const positions = object.geometry.getAttribute("position"), normals = object.geometry.getAttribute("normal");
      assert.ok(Array.from(positions.array).every(Number.isFinite));
      assert.ok(Array.from(normals.array).every(Number.isFinite));
      triangles += positions.count / 3;
      assert.ok(object.layers.isEnabled(2));
    });
    assert.ok(triangles < 22000, `${triangles} exterior triangles`);
    const bounds = new THREE.Box3().setFromObject(exterior.root);
    assert.ok(bounds.max.y > 31 && bounds.max.y < 35, "steep roofs and turrets have a controlled castle silhouette");
    assert.ok(bounds.min.x > -17 && bounds.max.x < 17 && bounds.min.z > 58 && bounds.max.z < 82, "details stay inside the old eave envelope");
    for (const x of [-14, -7, 0, 7, 14]) for (const z of [61, 67, 73, 79]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 36, z), new THREE.Vector3(0, -1, 0), 0, 19.5);
      assert.ok(ray.intersectObject(exterior.root, true).length, `roof remains closed above x=${x}, z=${z}`);
    }
    let sharedDisposed = 0;
    stoneMap.addEventListener("dispose", () => sharedDisposed++); slateMap.addEventListener("dispose", () => sharedDisposed++);
    exterior.dispose(); exterior.dispose();
    assert.equal(sharedDisposed, 0, "the castle borrows rather than disposes shared textures");
    stoneMap.dispose(); slateMap.dispose();
    t.diagnostic(`${mobile ? "mobile" : "desktop"}: three castle draws, ${triangles} triangles`);
  }
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
    assert.ok(meshes <= 41, `${meshes} material batches including the seven-mesh Christmas festival`);
    assert.ok(triangles < 190000, `${triangles} structure triangles`);
    const warmWood = scene.getObjectByName("garden-pavilion-timber").material;
    assert.ok(warmWood.color.r < warmWood.color.g * 2.1, "pavilion wood stays warm brown instead of saturated red");
    structures.dispose(); gradient.dispose();
  }
});

test("the old moon wall is open at eye height, and neon switches on without extra lights", t => {
  for (const mobile of [true, false]) {
    const { scene, structures, gradient } = build(mobile);
    const zone = scene.getObjectByName("garden-photo-zone");
    assert.ok(zone);
    let triangles = 0;
    zone.traverse(object => {
      assert.ok(!object.isLight);
      if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
    });
    assert.equal(zone.children.filter(object => object.isMesh).length, 7);
    assert.ok(triangles < 100000, `${triangles} neon court and perimeter triangles`);
    for (const x of [-4, -2, 0, 2, 4]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, layout.GROUND_Y + 1.5, -10), new THREE.Vector3(0, 0, -1), 0, 9);
      assert.equal(ray.intersectObject(structures.root, true).length, 0, `open sight and walking aisle at x=${x}`);
    }
    const halo = scene.getObjectByName("photo-neon-halo").material;
    const pools = scene.getObjectByName("photo-light-pools").material;
    structures.applyDaylight({ lanterns: 0 }, 0);
    assert.equal(halo.opacity, 0); assert.equal(pools.uniforms.uNight.value, 0);
    structures.applyDaylight({ lanterns: 1 }, 0);
    assert.ok(halo.opacity > 0); assert.equal(pools.uniforms.uNight.value, 1);
    assert.equal(scene.getObjectByName("photo-neon-core").material.color.r, 1);
    t.diagnostic(`${mobile ? "mobile" : "desktop"}: seven meshes + one Points batch, ${triangles} photo court/perimeter triangles, zero added lights`);
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
  structures.setTime(15);
  assert.equal(glow.material.uniforms.uTime.value, 15, "ambient lamp animation still receives time");
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
