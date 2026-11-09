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
  "BAIKAL_BOUNDS", "BAIKAL_SPAWN", "BAIKAL_SEAT_REACH", "BAIKAL_TERRACE", "BAIKAL_SHORE", "BAIKAL_CABIN", "BAIKAL_WIND", "BAIKAL_BLOCKS", "BAIKAL_CLUSTERS",
  "BAIKAL_PLACES", "BAIKAL_SEATS", "BAIKAL_WALLS", "BAIKAL_FURNITURE", "BAIKAL_TREES", "BAIKAL_BLOCK_COLLIDERS", "BAIKAL_COLLIDERS", "STORM_PERIOD_MS",
  "baikalRoofHeight", "insideBaikalCabin", "underBaikalRoof", "baikalCeilingHeight", "baikalShoreHeight", "baikalTerraceHeight", "baikalFloorHeight", "baikalSnowCover",
  "baikalStormAt", "baikalForSpot", "baikalSeat", "claimedBaikalSeat", "nearbyBaikalPlace", "resolveBaikalWalk",
]);
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["seededRandom"]);
const textiles = await load("../lib/beach/shelter-textiles.ts", {}, ["createShelterPillowGeometry"]);
const glow = await load("../lib/beach/bamboo-shader.ts", { UYUNI_SKY_FUNCTIONS: "", UYUNI_SKY_UNIFORMS: "" }, ["BAMBOO_GLOW_VERT", "BAMBOO_GLOW_FRAG"]);
const skyStubs = { BAIKAL_SKY_FUNCTIONS: "", BAIKAL_SKY_UNIFORMS: "", UYUNI_SKY_FUNCTIONS: "", UYUNI_SKY_UNIFORMS: "" };
const materials = await load("../lib/beach/baikal-materials.ts", { ...layout, ...skyStubs },
  ["createBaikalUniforms", "createBaikalIceMaterial", "createBaikalHummockMaterial", "createBaikalGlassMaterial", "createBaikalSnowMaterial", "createBaikalDriftMaterial", "createBaikalFlameMaterial"]);
const geometry = await load("../lib/beach/baikal-geometry.ts", { ...layout, ...materials, ...textiles, ...glow }, ["buildBaikalHummocks", "buildBaikalShore", "buildBaikalCabin"]);
const snow = await load("../lib/beach/baikal-snow.ts", { ...layout, ...materials, ...trail }, ["BaikalSnow"]);
const { BaikalWorld } = await load("../lib/beach/baikal.ts", { ...layout, ...materials, ...geometry, ...snow }, ["BaikalWorld"]);
const daylight = await load("../lib/beach/daylight.ts", { process: { env: { NODE_ENV: "test" } }, URLSearchParams }, ["baikalDaylightAt", "rainOverride"]);
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const inRect = (rect, x, z) => x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ;
const c = layout.BAIKAL_CABIN;

test("five cabin pieces seat twelve, every seat sits on the deck and faces the way its server row says", () => {
  assert.equal(layout.BAIKAL_PLACES.length, 5); assert.equal(layout.BAIKAL_SEATS.length, 12);
  const expected = {
    "baikal-sofa": [[-23, 3.8], [-23, 5.3], [-23, 6.8], [-23, 8.3]], "baikal-side": [[-23.6, 11], [-22, 11], [-20.4, 11]],
    "baikal-hearth": [[-24.6, 1.4], [-22.2, 1.4]], "baikal-chair": [[-18.6, 12.2]], "baikal-porch": [[-14.6, 8.6], [-14.6, 10.2]],
  };
  for (const seat of layout.BAIKAL_SEATS) {
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
  assert.ok(cabin.lamps.length >= 8 && cabin.candles.length === 3);
  for (const lamp of cabin.lamps) assert.ok(lamp.y > c.floorY && lamp.y < c.floorY + c.highEave);
  close(cabin.hearth.x, -23.4, 1e-9);
  cabin.applyNight(0); cabin.applyNight(1); cabin.dispose(); cabin.dispose();
});
