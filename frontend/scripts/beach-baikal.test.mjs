import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { THREE, RoundedBoxGeometry, ConvexGeometry, mergeGeometries, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const layout = await load("../lib/beach/baikal-layout.ts", {}, [
  "BAIKAL_BOUNDS", "BAIKAL_SPAWN", "BAIKAL_SEAT_REACH", "BAIKAL_TERRACE", "BAIKAL_TERRACES", "BAIKAL_SHORE", "BAIKAL_CABIN", "BAIKAL_CABINS", "BAIKAL_JOURNEY_ROUTE", "BAIKAL_WIND", "BAIKAL_BLOCKS", "BAIKAL_CLUSTERS", "BAIKAL_COZY_LIGHTS", "BAIKAL_SNOW_DRIFT_BOX", "BAIKAL_ROOM_OCCLUSION_BOX",
  "BAIKAL_PLACES", "BAIKAL_SEATS", "BAIKAL_WALLS", "BAIKAL_FURNITURE", "BAIKAL_TREES", "BAIKAL_BLOCK_COLLIDERS", "BAIKAL_COLLIDERS", "STORM_PERIOD_MS",
  "baikalRoofHeight", "baikalRoofAt", "baikalCabinAt", "baikalCabinArrivalAt", "insideBaikalCabin", "underBaikalRoof", "baikalCeilingHeight", "baikalShoreHeight", "baikalTerraceHeight", "baikalFloorHeight", "baikalSnowCover",
  "baikalStormAt", "baikalForSpot", "baikalSeat", "claimedBaikalSeat", "nearbyBaikalPlace", "resolveBaikalWalk",
]);
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["seededRandom"]);
const navigation = await load("../lib/beach/navigation.ts", {}, ["findWalkingPath", "resolveWalls"]);
const glow = await load("../lib/beach/bamboo-shader.ts", { UYUNI_SKY_FUNCTIONS: "", UYUNI_SKY_UNIFORMS: "" }, ["BAMBOO_GLOW_VERT", "BAMBOO_GLOW_FRAG"]);
const skyStubs = { BAIKAL_SKY_FUNCTIONS: "", BAIKAL_SKY_UNIFORMS: "", UYUNI_SKY_FUNCTIONS: "", UYUNI_SKY_UNIFORMS: "" };
const materials = await load("../lib/beach/baikal-materials.ts", { ...layout, ...skyStubs },
  ["createBaikalUniforms", "createBaikalIceMaterial", "createBaikalHummockMaterial", "createBaikalGlassMaterial", "createBaikalSnowMaterial", "createBaikalDriftMaterial", "createBaikalFlameMaterial"]);
const cozy = await load("../lib/beach/baikal-cozy.ts", { ...layout }, ["applyCozyLighting", "createBaikalFurMaterial", "cushionGeometry", "curtainGeometry", "drapeGeometry", "furPatchGeometry", "logGeometry", "poufGeometry", "softBoxGeometry"]);
const geometry = await load("../lib/beach/baikal-geometry.ts", { ...layout, ...materials, ...cozy, ...glow }, ["buildBaikalHummocks", "buildBaikalShore", "buildBaikalCabin"]);
const snow = await load("../lib/beach/baikal-snow.ts", { ...layout, ...materials, ...trail }, ["BaikalSnow"]);
const vapor = await load("../lib/beach/baikal-vapor.ts", {}, ["BaikalVapor"]);
const { BaikalWorld } = await load("../lib/beach/baikal.ts", { ...layout, ...materials, ...geometry, ...snow, ...vapor }, ["BaikalWorld"]);
const daylight = await load("../lib/beach/daylight.ts", { process: { env: { NODE_ENV: "test" } }, URLSearchParams }, ["baikalDaylightAt", "rainOverride"]);
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const inRect = (rect, x, z) => x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ;
const c = layout.BAIKAL_CABIN;

test("the original five cabin pieces preserve their twelve seat IDs and positions as the journey grows", () => {
  assert.equal(layout.BAIKAL_PLACES.length, 15); assert.equal(layout.BAIKAL_SEATS.length, 36);
  const expected = {
    "baikal-sofa": [[-23, 3.8], [-23, 5.3], [-23, 6.8], [-23, 8.3]], "baikal-side": [[-23.6, 11], [-22, 11], [-20.4, 11]],
    "baikal-hearth": [[-24.6, 1.4], [-22.2, 1.4]], "baikal-chair": [[-18.6, 12.2]], "baikal-porch": [[-14.6, 8.6], [-14.6, 10.2]],
  };
  for (const seat of layout.BAIKAL_SEATS.filter(seat => expected[seat.spotId])) {
    const [x, z] = expected[seat.spotId][seat.slot];
    close(seat.x, x, 1e-9); close(seat.z, z, 1e-9);
    const place = layout.baikalForSpot(seat.spotId);
    close(seat.yaw, Math.atan2(-place.fx, -place.fz), 1e-12);
    assert.ok(seat.x >= c.minX && seat.x <= c.porchMaxX && seat.z >= c.minZ && seat.z <= c.maxZ, `${seat.id} is inside the cabin or on its porch`);
    close(layout.baikalFloorHeight(seat.x, seat.z), c.floorY); close(seat.baseY, c.floorY);
    assert.ok(seat.avatarY > c.floorY + .25 && seat.avatarY < c.floorY + .6);
    assert.deepEqual(layout.claimedBaikalSeat({ pose: "sitting", spotId: seat.spotId, slot: seat.slot }), seat);
    assert.ok(layout.BAIKAL_FURNITURE.some(rect => inRect(rect, seat.x, seat.z)) || seat.spotId === "baikal-hearth", `${seat.id} rests on a piece of furniture`);
    assert.ok(!layout.BAIKAL_WALLS.some(rect => inRect(rect, seat.x, seat.z)), `${seat.id} is clear of the walls`);
  }
  assert.equal(layout.claimedBaikalSeat({ pose: "sitting", spotId: "baikal-chair", slot: 1 }), null);
  assert.equal(layout.claimedBaikalSeat({ pose: "lying", spotId: "baikal-sofa", slot: 0 }), null);
  assert.equal(layout.nearbyBaikalPlace(-22.3, 5.3)?.spotId, "baikal-sofa");
  assert.equal(layout.nearbyBaikalPlace(0, 40), null);
  const sofaYaw = layout.BAIKAL_SEATS.find(seat => seat.spotId === "baikal-sofa").yaw;
  close(-Math.sin(sofaYaw), 1, 1e-9); close(-Math.cos(sofaYaw), 0, 1e-9);
  assert.equal(layout.BAIKAL_PLACES.find(place => place.kind === "hearth").spotId, "baikal-hearth");
});

test("the ground is level ice except the cabin mound, the deck and the western bank", () => {
  close(layout.baikalFloorHeight(layout.BAIKAL_SPAWN.x, layout.BAIKAL_SPAWN.z), 0);
  close(layout.baikalFloorHeight(40, -10), 0);
  close(layout.baikalFloorHeight(layout.BAIKAL_TERRACE.x, layout.BAIKAL_TERRACE.z + 11), layout.BAIKAL_TERRACE.height);
  close(layout.baikalFloorHeight(-12.5, 6), layout.BAIKAL_TERRACE.height, .02);
  close(layout.baikalFloorHeight(-14, 6), c.floorY);
  assert.ok(c.floorY - layout.baikalFloorHeight(-12.9, 6) < .38, "one easy step from the mound onto the porch");
  assert.ok(layout.baikalShoreHeight(-36) === 0 && layout.baikalShoreHeight(-48) > .5 && layout.baikalShoreHeight(-60) >= 3 && layout.baikalShoreHeight(-120) > 3);
  assert.equal(layout.baikalFloorHeight(Number.NaN, 0), 0);
  for (let x = -36; x > -120; x -= 1) assert.ok(layout.baikalShoreHeight(x - 1) - layout.baikalShoreHeight(x) < .38, "the bank is walkable everywhere");
  close(layout.baikalSnowCover(-23, 6), 1); close(layout.baikalSnowCover(30, 30), 0);
  assert.equal(layout.baikalCeilingHeight(0, 40), null);
  const inside = layout.baikalCeilingHeight(-20, 6);
  assert.ok(inside > c.floorY + c.lowEave && inside < c.floorY + c.highEave);
  assert.ok(layout.baikalRoofHeight(c.maxX) > layout.baikalRoofHeight(c.minX), "the roof rises towards the glass");
  assert.ok(layout.insideBaikalCabin(-20, 6) && !layout.insideBaikalCabin(-14.5, 6) && layout.underBaikalRoof(-14.5, 6) && !layout.underBaikalRoof(-10, 6));
});

test("walls leave the doorway open, furniture and hummocks keep the spawn, the door path and the terrace clear", () => {
  const door = [-16, 0], blocked = [-16, 6];
  assert.ok(!layout.BAIKAL_WALLS.some(rect => inRect(rect, ...door)), "the doorway is open");
  assert.ok(layout.BAIKAL_WALLS.some(rect => inRect(rect, ...blocked)), "the glass wall is solid beside the door");
  for (const point of [[0, 40], [-19, 0], [-17, 0], [-14.5, 0], [-12, 0], [-21, 4], [-21, 9.5]])
    assert.ok(!layout.BAIKAL_COLLIDERS.some(rect => inRect(rect, ...point)), `${point} is walkable`);
  assert.equal(layout.BAIKAL_BLOCKS.filter(block => block.solid).length >= 70, true);
  assert.equal(layout.BAIKAL_BLOCKS.filter(block => !block.solid).length, 150);
  for (const block of layout.BAIKAL_BLOCKS.filter(block => block.solid)) {
    assert.ok(Math.hypot(block.x - layout.BAIKAL_SPAWN.x, block.z - layout.BAIKAL_SPAWN.z) >= 6 || block.size < .5, "nothing stands on the newcomer");
    assert.ok(Math.hypot(block.x - layout.BAIKAL_TERRACE.x, block.z - layout.BAIKAL_TERRACE.z) > layout.BAIKAL_TERRACE.radius + 5, "the cabin mound stays clear");
    assert.ok(block.x >= layout.BAIKAL_BOUNDS.minX && block.x <= layout.BAIKAL_BOUNDS.maxX && block.z >= layout.BAIKAL_BOUNDS.minZ && block.z <= layout.BAIKAL_BOUNDS.maxZ);
  }
  const hero = layout.BAIKAL_BLOCKS.filter(block => block.x >= 8 && block.x <= 21 && block.z >= 8 && block.z <= 26);
  assert.ok(hero.length >= 16 && hero.some(block => block.size >= 2), "a hero cluster with large jewels faces the glass wall");
  assert.deepEqual([...layout.resolveBaikalWalk(500, -500)], [layout.BAIKAL_BOUNDS.maxX - .4, layout.BAIKAL_BOUNDS.minZ + .4]);
  assert.deepEqual([...layout.resolveBaikalWalk(Number.NaN, 3)], [layout.BAIKAL_SPAWN.x, layout.BAIKAL_SPAWN.z]);
  assert.ok(layout.BAIKAL_TREES.every(tree => tree.x < -40), "larches grow on the bank, not on the ice");
});

test("the storm cycles every six minutes: blizzard, easing, lull, building", () => {
  const P = layout.STORM_PERIOD_MS;
  assert.equal(layout.baikalStormAt(0), 1); assert.equal(layout.baikalStormAt(100_000), 1);
  close(layout.baikalStormAt(180_000), .65, 1e-9); close(layout.baikalStormAt(250_000), .3);
  close(layout.baikalStormAt(330_000), .65, 1e-9); assert.equal(layout.baikalStormAt(P), 1);
  assert.equal(layout.baikalStormAt(P * 7 + 50_000), 1); assert.ok(layout.baikalStormAt(-10_000) > .9, "ten seconds before a cycle the storm is almost back");
  assert.equal(layout.baikalStormAt(Number.NaN), 1);
  for (let t = 0; t < P; t += 1000) { const s = layout.baikalStormAt(t); assert.ok(s >= .3 && s <= 1); assert.ok(Math.abs(s - layout.baikalStormAt(t + 1000)) < .02, "the storm never jumps"); }
  const d = daylight.baikalDaylightAt(21);
  assert.equal(d.fogNear, 60); assert.equal(d.fogFar, 320); assert.ok(d.fog[2] > d.fog[0], "night fog is slate blue");
  const noon = daylight.baikalDaylightAt(12); assert.ok(noon.fog[0] > .7 && noon.cloudAmount === .7);
  assert.equal(daylight.rainOverride("?storm=0.4"), .4); assert.equal(daylight.rainOverride("?rain=1"), 1); assert.equal(daylight.rainOverride(""), null);
});

test("the world builds its ice, hummocks, cabin, stove and blizzard, honours quality and storm, and disposes cleanly", () => {
  const scene = new THREE.Scene(), textures = { wood: new THREE.Texture(), cotton: new THREE.Texture() };
  const sky = { uTime: { value: 0 }, uStars: { value: 0 } };
  const world = new BaikalWorld(scene, sky, textures, false);
  scene.updateMatrixWorld(true);
  const names = []; scene.traverse(o => names.push(o.name));
  for (const name of ["baikal-frozen-lake", "baikal-hummocks-0", "baikal-hummocks-3", "baikal-snow-banks", "baikal-shore-bank", "baikal-cabin-mound", "baikal-larches",
    "baikal-glass-wall", "baikal-boucle", "baikal-oak", "baikal-iron", "baikal-lamp-glow", "baikal-stove-flames", "baikal-stove-light", "baikal-blizzard-flakes", "baikal-blowing-snow-sheets", "baikal-far-village-lights"])
    assert.ok(names.includes(name), `${name} is in the scene`);
  assert.ok(sky.uStorm, "the storm strength is shared with the sky");
  world.setStorm(.4); close(sky.uStorm.value, .4);
  const flakes = scene.getObjectByName("baikal-blizzard-flakes");
  assert.equal(flakes.geometry.instanceCount, 6000);
  world.setQuality(true); assert.equal(flakes.geometry.instanceCount, 2500); assert.equal(world.shared.uLayers.value, 2);
  world.setQuality(false); assert.equal(flakes.geometry.instanceCount, 6000); assert.equal(world.shared.uLayers.value, 3);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(3, 1.6, 30);
  world.applyDaylight(daylight.baikalDaylightAt(21));
  assert.ok(world.shared.uCabinLight.value.w > .9, "at night the window light spills onto the snow");
  world.applyDaylight(daylight.baikalDaylightAt(12));
  assert.equal(world.shared.uCabinLight.value.w, 0, "by day the spill is off");
  world.update(1, camera, { x: 3, z: 30, moving: true }, null);
  close(scene.getObjectByName("baikal-frozen-lake").position.x, 3); close(world.shared.uWalker.value.y, 30);
  world.update(1.5, camera, { x: 3, z: 30, moving: true }, { spotId: "baikal-sofa", slot: 1 });
  world.update(3, camera, { x: 3, z: 30 }, { spotId: "baikal-sofa", slot: 1 });
  assert.ok(scene.getObjectByName("baikal-seat-light").intensity > .5, "the reading light follows the confirmed seat");
  assert.ok(world.shared.uDrift.value.length() > 0, "the wind drift accumulates");
  world.applyFog(daylight.baikalDaylightAt(21), false); const outside = world.fogFar;
  world.applyFog(daylight.baikalDaylightAt(21), true); assert.ok(world.fogFar > outside * 2, "indoors the fog opens up");
  world.dispose(); assert.equal(scene.children.length, 0);
  world.dispose(); world.update(4, camera);
});

test("the cabin's seat pieces stand where the layout says and the glass wall carries per-pane sizes", () => {
  const scene = new THREE.Scene(), shared = materials.createBaikalUniforms({ uTime: { value: 0 } });
  const cabin = geometry.buildBaikalCabin(scene, { wood: new THREE.Texture(), cotton: new THREE.Texture() }, shared, false);
  const glass = scene.getObjectByName("baikal-glass-wall");
  assert.ok(glass.geometry.getAttribute("aPane"), "every pane knows its width and height for the frost");
  assert.ok(glass.geometry.getAttribute("position").count >= 4 * 21, "at least twenty-one panes");
  assert.ok(cabin.lamps.length >= 30 && cabin.candles.length === 9);
  for (const lamp of cabin.lamps) assert.ok(lamp.y > c.floorY && lamp.y < c.floorY + c.highEave);
  close(cabin.hearth.x, -23.4, 1e-9);
  cabin.applyNight(0); cabin.applyNight(1); cabin.dispose(); cabin.dispose();
});

test("the journey has three distinct arrivals, canonical translated seats and a much longer final leg", () => {
  const sites = layout.BAIKAL_CABINS;
  assert.deepEqual(Array.from(sites, c => [c.id, c.x, c.z]), [["warm", -23, 6], ["refuge", 12, -72], ["aurora", 65, -195]]);
  assert.equal(layout.BAIKAL_BOUNDS.minZ, -240);
  assert.ok(Math.hypot(sites[2].x - sites[1].x, sites[2].z - sites[1].z) > 1.5 * Math.hypot(sites[1].x - sites[0].x, sites[1].z - sites[0].z));
  for (const site of sites) {
    const prefix = site.id === "warm" ? "baikal-" : `baikal-${site.id}-`;
    for (const kind of ["sofa", "side", "hearth", "chair", "porch"]) {
      const source = layout.BAIKAL_SEATS.filter(s => s.spotId === `baikal-${kind}`);
      const seats = layout.BAIKAL_SEATS.filter(s => s.spotId === `${prefix}${kind}`);
      assert.equal(seats.length, source.length);
      seats.forEach((seat, i) => {
        close(seat.x, source[i].x + site.offsetX); close(seat.z, source[i].z + site.offsetZ); close(seat.yaw, source[i].yaw);
        close(layout.baikalFloorHeight(seat.x, seat.z), seat.baseY);
        assert.ok(layout.underBaikalRoof(seat.x, seat.z));
        assert.equal(layout.baikalCabinArrivalAt(seat.x, seat.z)?.id, site.id);
      });
    }
    assert.equal(layout.baikalCabinArrivalAt(site.x, site.z)?.id, site.id);
    assert.equal(layout.baikalCabinArrivalAt(site.minX - .4, site.z), null, "passing the outside back wall is not arriving");
    assert.equal(layout.baikalCabinArrivalAt(site.porchMaxX + .4, site.z), null, "the visitor must reach the porch, not just see it");
    assert.equal(layout.baikalCabinArrivalAt(site.porchMaxX - .4, site.doorMinZ + 1)?.id, site.id);
  }
});

test("a full-width walker can follow the complete journey, enter every door and reach every seat", () => {
  const clear = (x, z) => {
    const point = navigation.resolveWalls(x, z, layout.BAIKAL_COLLIDERS, .4);
    return Math.hypot(point[0] - x, point[1] - z) < 1e-7;
  };
  for (let i = 1; i < layout.BAIKAL_JOURNEY_ROUTE.length; i++) {
    const a = layout.BAIKAL_JOURNEY_ROUTE[i - 1], b = layout.BAIKAL_JOURNEY_ROUTE[i], count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .2);
    for (let s = 0; s <= count; s++) assert.ok(clear(a[0] + (b[0] - a[0]) * s / count, a[1] + (b[1] - a[1]) * s / count), `clear journey leg ${i} sample ${s}`);
  }
  for (const site of layout.BAIKAL_CABINS) {
    const entryZ = (site.doorMinZ + site.doorMaxZ) / 2, inside = { x: site.maxX - 2, z: entryZ };
    let previous = layout.baikalFloorHeight(site.porchMaxX + 3, entryZ);
    for (let x = site.porchMaxX + 3; x >= inside.x; x -= .1) {
      assert.ok(clear(x, entryZ), `${site.id} doorway clear at ${x}`);
      const height = layout.baikalFloorHeight(x, entryZ); assert.ok(Math.abs(height - previous) < .38, "porch step is climbable"); previous = height;
    }
    for (const seat of layout.BAIKAL_SEATS.filter(s => layout.baikalCabinArrivalAt(s.x, s.z)?.id === site.id)) {
      const target = { x: seat.x - Math.sin(seat.yaw), z: seat.z - Math.cos(seat.yaw) };
      assert.ok(clear(target.x, target.z), `${seat.id} has room for a standing visitor`);
      assert.ok(Math.hypot(target.x - seat.x, target.z - seat.z) < layout.BAIKAL_SEAT_REACH);
      assert.ok(navigation.findWalkingPath(inside, target, [], layout.BAIKAL_COLLIDERS, layout.BAIKAL_BOUNDS, 3), `${seat.id} can be approached from the door`);
    }
  }
  for (const block of layout.BAIKAL_BLOCKS.filter(b => !b.solid))
    assert.ok(block.x < layout.BAIKAL_BOUNDS.minX || block.x > layout.BAIKAL_BOUNDS.maxX || block.z < layout.BAIKAL_BOUNDS.minZ || block.z > layout.BAIKAL_BOUNDS.maxZ, "decorative ice without a collider stays beyond the playable plain");
});

test("three closed roofs shelter their seats while the observatory sofa has an unobstructed eastern sky view", () => {
  const scene = new THREE.Scene(), wood = new THREE.Texture(), cotton = new THREE.Texture();
  const shared = materials.createBaikalUniforms({ uTime: { value: 0 } });
  const shore = geometry.buildBaikalShore(scene, shared, { wood, cotton }, false);
  const cabin = geometry.buildBaikalCabin(scene, { wood, cotton }, shared, false); scene.updateMatrixWorld(true);
  const opaque = []; cabin.root.traverse(o => { if (o.isMesh && !o.material.transparent) opaque.push(o); });
  const cast = (from, direction, far = 20, objects = opaque) => new THREE.Raycaster(from, direction.normalize(), .001, far).intersectObjects(objects, false);
  for (const site of layout.BAIKAL_CABINS) {
    for (const x of [site.minX + 1, site.x, site.maxX - 1, site.porchMaxX - .3]) {
      for (const z of [site.minZ + .5, site.z, site.maxZ - .5]) {
        const hits = cast(new THREE.Vector3(x, 2.8, z), new THREE.Vector3(0, 1, 0));
        assert.ok(hits.length, `${site.id} roof is closed over ${x},${z}`);
        assert.ok(hits[0].point.y <= layout.baikalRoofAt(x, z) + .6);
        assert.ok(layout.baikalCeilingHeight(x, z) > 2.8);
      }
    }
    const floorHits = cast(new THREE.Vector3(site.maxX - 2, 2, site.doorMinZ + 1), new THREE.Vector3(0, -1, 0));
    close(floorHits[0].point.y, site.floorY, .025);
    const mound = scene.getObjectByName(site.id === "warm" ? "baikal-cabin-mound" : `baikal-${site.id}-mound`);
    const bankHits = cast(new THREE.Vector3(site.x, 2, site.z), new THREE.Vector3(0, -1, 0), 5, [mound]);
    assert.ok(bankHits[0].point.y < site.floorY - .2, "snow terrain does not cover the timber floor");
  }
  for (const seat of layout.BAIKAL_SEATS.filter(s => s.spotId === "baikal-aurora-sofa")) {
    const hits = cast(new THREE.Vector3(seat.x + .45, seat.avatarY + .9, seat.z), new THREE.Vector3(1, .32, 0), 24);
    assert.equal(hits.length, 0, `low aurora remains visible from ${seat.id}`);
  }
  assert.equal(cabin.hearths.length, 3); assert.equal(cabin.cabinLights.length, 9);
  assert.equal(new Set(cabin.cabinLights.map(l => l.color)).size, 3);
  assert.ok(scene.getObjectByName("baikal-refuge-ceramic")); assert.ok(scene.getObjectByName("baikal-observatory-brass"));
  assert.ok(opaque.length <= 30, "the three furnished cabins share bounded draw batches");
  const resources = new Set(); cabin.root.traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material) resources.add(o.material); });
  const counts = new Map([...resources].map(resource => [resource, 0]));
  resources.forEach(resource => resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1)));
  let externalDisposed = 0; for (const texture of [wood, cotton]) texture.addEventListener("dispose", () => externalDisposed++);
  cabin.dispose(); cabin.dispose(); shore.dispose(); shore.dispose();
  assert.ok([...counts.values()].every(count => count === 1), "owned cabin buffers and materials dispose exactly once");
  assert.equal(externalDisposed, 0, "injected texture ownership remains with the engine"); assert.equal(scene.children.length, 0);
});

test("aurora reward opens smoothly only after the final arrival, is shared with reflections and fades when leaving", () => {
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x9ca9bd, 60, 320);
  const sky = { uTime: { value: 0 }, uStars: { value: 1 } }, textures = { wood: new THREE.Texture(), cotton: new THREE.Texture(), snow: new THREE.Texture(), ice: new THREE.Texture() };
  const world = new BaikalWorld(scene, sky, textures, false), camera = new THREE.PerspectiveCamera();
  const final = layout.BAIKAL_CABINS[2]; let time = 0;
  const frames = (count, at = final) => { for (let i = 0; i < count; i++) { time += .1; world.update(time, camera, at, null); } };
  world.applyDaylight(daylight.baikalDaylightAt(21)); world.setStorm(1);
  frames(30); assert.equal(sky.uAurora.value, 0, "jumping straight to the last cabin does not unlock the reward");
  world.setJourney(2); frames(30); assert.equal(sky.uAurora.value, 0);
  world.setJourney(3); frames(1);
  assert.ok(sky.uAurora.value > 0 && sky.uAurora.value < .1, "the reveal eases in instead of flashing on");
  const first = sky.uAurora.value; frames(1); assert.ok(sky.uAurora.value > first);
  frames(160); assert.ok(sky.uAurora.value > .999);
  assert.equal(world.shared.uAurora, sky.uAurora, "the ice reflection and sky use the same reveal");
  assert.ok(world.shared.uStorm.value < .07, "the last window opens into a calm local view");
  assert.equal(world.stormAmount, 1, "the shared room weather is preserved");
  const leaving = { x: final.x, z: final.z + 80 };
  frames(1, leaving); assert.ok(sky.uAurora.value > .8 && sky.uAurora.value < .999, "leaving fades rather than snapping");
  frames(200, leaving); assert.ok(sky.uAurora.value < .00001); assert.ok(world.shared.uStorm.value > .999);
  world.setJourney(Number.NaN); frames(30); assert.ok(sky.uAurora.value < .00001, "invalid progress cannot unlock the view");
  assert.equal(world.shared.uSnowPhoto.value, textures.snow); assert.equal(world.shared.uIcePhoto.value, textures.ice);
  let disposedPhotos = 0; Object.values(textures).forEach(texture => texture.addEventListener("dispose", () => disposedPhotos++));
  world.dispose(); world.dispose(); assert.equal(disposedPhotos, 0, "photo textures are borrowed from the engine");
});

test("light pooling follows the nearest cabin and all three shader roof masks match their physical roofs", () => {
  const scene = new THREE.Scene(), sky = { uTime: { value: 0 }, uStars: { value: 1 } };
  const world = new BaikalWorld(scene, sky, { wood: new THREE.Texture(), cotton: new THREE.Texture() }, false);
  const camera = new THREE.PerspectiveCamera(); world.applyDaylight(daylight.baikalDaylightAt(21));
  let time = 0;
  for (const [i, site] of layout.BAIKAL_CABINS.entries()) {
    world.update(++time, camera, site, null);
    const visible = []; scene.traverse(o => { if (o.isPointLight && o.visible && o.name !== "baikal-seat-light") visible.push(o); });
    assert.equal(visible.length, 4, "three pendants and one stove light illuminate the current room");
    assert.ok(visible.every(light => !light.castShadow && Math.hypot(light.position.x - site.x, light.position.z - site.z) < 10));
    assert.ok(world.isInside(site.x, site.z));
    const roof = world.shared.uRoofs.value[i], line = world.shared.uRoofLines.value[i];
    for (const seat of layout.BAIKAL_SEATS.filter(seat => layout.baikalCabinArrivalAt(seat.x, seat.z)?.id === site.id)) {
      assert.ok(seat.x >= roof.x && seat.x <= roof.y && seat.z >= roof.z && seat.z <= roof.w, "snow mask covers seated visitors and porch");
      close(line.x + line.y * seat.x, layout.baikalRoofAt(seat.x, seat.z));
    }
  }
  world.setQuality(true);
  const mobileVisible = []; scene.traverse(o => { if (o.isPointLight && o.visible && o.name !== "baikal-seat-light") mobileVisible.push(o); });
  assert.equal(mobileVisible.length, 3, "mobile uses two pooled pendants and one stove");
  world.dispose();
});

test("upholstery is smooth and closed, with baked shade in its seams", () => {
  const box = cozy.softBoxGeometry(1.2, .3, .9, { radius: .1, crown: .05, bulge: .02, wrinkle: .006, sag: .03, seed: 2.3, seg: 10 });
  const position = box.getAttribute("position"), normal = box.getAttribute("normal"), color = box.getAttribute("color");
  for (let i = 0; i < position.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(normal, i), p = new THREE.Vector3().fromBufferAttribute(position, i);
    close(n.length(), 1, 1e-3);
    assert.ok(n.dot(p) > 0, "normals point out of the cushion, including over the rounded seams");
    assert.ok(color.getX(i) > 0 && color.getX(i) <= 1, "baked shade stays a multiplier");
    assert.ok(Math.abs(p.x) <= .64 && Math.abs(p.y) <= .22 && Math.abs(p.z) <= .49, "the ballooning stays close to the nominal size");
  }
  box.computeBoundingBox(); assert.ok(box.boundingBox.max.y > .15 + .02, "the top panel crowns above the frame");
  // Every edge of a scatter cushion borders at least two triangles: no holes along the seam, even at the pinched corners.
  const pillow = cozy.cushionGeometry(.5, .5, .2, 1.3, 12), index = pillow.index.array, edges = new Map();
  for (let i = 0; i < index.length; i += 3) for (const [a, b] of [[index[i], index[i + 1]], [index[i + 1], index[i + 2]], [index[i + 2], index[i]]]) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  assert.ok([...edges.values()].every(count => count >= 2));
});

test("every cozy light sits inside the room, the stove leads the list and spots hang from the ceiling", () => {
  const lights = layout.BAIKAL_COZY_LIGHTS;
  assert.ok(lights.length >= 8 && lights.length <= 16, "bounded per-pixel loop");
  assert.equal(lights[0].x, -23.4, "the stove is index 0, which the shader flickers");
  for (const l of lights) {
    assert.ok(l.x > c.minX && l.x < c.maxX && l.z > c.minZ && l.z < c.maxZ, "inside the first room's walls");
    assert.ok(l.power > 0 && l.r > 0 && l.g > 0 && l.b > 0);
    if (l.spot) assert.ok(l.y < layout.baikalRoofHeight(l.x) - .22 && l.y > c.floorY + 3, "a ceiling spot hangs just under the boards");
  }
  const uniforms = materials.createBaikalUniforms({ uTime: { value: 0 } });
  assert.equal(uniforms.uCozyPos.value.length, lights.length); assert.equal(uniforms.uRoomOrigins.value.length, layout.BAIKAL_CABINS.length);
  close(uniforms.uCozyPos.value[0].w, lights[0].power);
});

test("the furnished room is one instanced model tinted per stop, with flames, steam and fur", () => {
  const scene = new THREE.Scene(), sky = { uTime: { value: 0 }, uStars: { value: 1 } };
  const world = new BaikalWorld(scene, sky, { wood: new THREE.Texture(), cotton: new THREE.Texture() }, false);
  for (const name of ["baikal-floor", "baikal-boucle", "baikal-throws", "baikal-rug", "baikal-slate", "baikal-ceramic"]) {
    const mesh = scene.getObjectByName(name);
    assert.ok(mesh?.isInstancedMesh, `${name} is instanced`); assert.equal(mesh.count, layout.BAIKAL_CABINS.length);
  }
  const boucle = scene.getObjectByName("baikal-boucle"), first = new THREE.Color(), third = new THREE.Color();
  boucle.getColorAt(0, first); boucle.getColorAt(2, third); assert.notEqual(first.getHex(), third.getHex(), "each stop has its own palette");
  assert.ok(scene.getObjectByName("baikal-candle-flames").count >= 12);
  assert.ok(scene.getObjectByName("baikal-sheepskin").geometry.instanceCount > 8, "fur is drawn in shells");
  const camera = new THREE.PerspectiveCamera(), fur = scene.getObjectByName("baikal-sheepskin");
  world.update(1, camera, { x: -22, z: 6 }, null); assert.equal(fur.visible, true);
  world.update(2, camera, { x: 40, z: 40 }, null); assert.equal(fur.visible, false, "fur is only drawn up close");
  const vapor = scene.getObjectByName("baikal-chimney-smoke");
  assert.ok(vapor.geometry.instanceCount > 50); assert.equal(vapor.material.uniforms.uTime, world.shared.uTime);
  world.dispose(); assert.equal(scene.children.length, 0);
});

test("without a live renderer there is no bake and no print stage: the world draws straight through", () => {
  const scene = new THREE.Scene(), world = new BaikalWorld(scene, { uTime: { value: 0 }, uStars: { value: 0 } }, { wood: new THREE.Texture(), cotton: new THREE.Texture() }, false);
  assert.equal(world.shared.uHasIceVolume.value, 0); assert.equal(world.shared.uHasRoomCube.value, 0);
  let draws = 0; const camera = new THREE.PerspectiveCamera();
  world.render({ render(target, view) { assert.equal(target, scene); assert.equal(view, camera); draws++; } }, camera);
  assert.equal(draws, 1);
  world.prepareRoomLight(); assert.equal(world.shared.uHasRoomOcc.value, 0, "nothing is baked for an absent renderer");
  world.dispose();
});

test("the sky lights the far shore only at night and thins them in a storm", async () => {
  const source = await readFile(new URL("../lib/beach/baikal-sky.ts", import.meta.url), "utf8");
  assert.match(source, /baikalShoreLights\(d, far, night, storm\)/);
  assert.match(source, /night < 0\.02/); assert.match(source, /1\.0 - storm \* 0\.72/);
});
