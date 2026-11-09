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
const layout = await load("../lib/beach/cloud-spa-layout.ts", {}, [
  "CLOUD_SPA_BOUNDS", "CLOUD_SPA_SPAWN", "CLOUD_SPA_APRON", "CLOUD_SPA_TERRACE", "CLOUD_SPA_CHANNEL", "CLOUD_SPA_CHANNELS", "CLOUD_SPA_POOLS", "CLOUD_SPA_RESORT", "CLOUD_SPA_PLACES", "CLOUD_SPA_SEATS", "CLOUD_SPA_OUTWARD_SLOTS", "CLOUD_SPA_WALLS",
  "cloudSpaFloorHeight", "cloudSpaGroundHeight", "cloudSpaWaterDepth", "cloudSpaCeilingHeight", "cloudSpaChannelFrame", "cloudSpaChannelPoint", "cloudSpaChannelHeight", "cloudSpaChannelAt",
  "cloudSpaTerraceRadius", "cloudSpaInsideIsland", "cloudSpaIslandRange", "cloudSpaIslandSpan", "cloudSpaEdgeAhead", "cloudSpaCanStep", "resolveCloudSpaWalk", "nearbyCloudSpaPlace", "cloudSpaForSpot", "claimedCloudSpaSeat", "cloudSpaSeat",
]);
const textiles = await load("../lib/beach/shelter-textiles.ts", {}, ["createShelterPillowGeometry"]);
const materials = await load("../lib/beach/cloud-spa-materials.ts", {}, ["createCloudSpaCottonMaterial", "createCloudSpaCottonUniforms", "CLOUD_SPA_LAMP_COUNT"]);
const geometry = await load("../lib/beach/cloud-spa-geometry.ts", { ...layout, ...textiles, ...materials }, ["buildCloudSpaGround", "cloudSpaViewGap", "buildCloudSpaScenery"]);
const cityApi = await load("../lib/beach/cloud-spa-city.ts", {}, ["CLOUD_SPA_CITY", "cloudSpaCityMountainGeometry", "buildCloudSpaCity"]);
const { CloudSpaWorld } = await load("../lib/beach/cloud-spa.ts", { ...layout, ...geometry, ...materials, ...cityApi, CLOUD_SPA_SKY_FUNCTIONS: "", CLOUD_SPA_SKY_UNIFORMS: "" }, ["CloudSpaWorld"]);
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fixture = (low = false) => {
  const scene = new THREE.Scene(), textures = { wood: new THREE.Texture(), cotton: new THREE.Texture(), cloud: new THREE.Texture(), city: new THREE.Texture(), surface: new THREE.Texture() };
  const world = new CloudSpaWorld(scene, {}, textures, low); scene.updateMatrixWorld(true); return { scene, textures, world };
};
const clean = f => { f.world.dispose(); Object.values(f.textures).forEach(t => t.dispose()); };
const lowest = layout.CLOUD_SPA_POOLS.at(-1);

test("five terraces descend in three-metre steps, lower pools hug the upper lip, and thirty-six canonical claims keep their floor", () => {
  assert.equal(layout.CLOUD_SPA_POOLS.length, 5); assert.equal(layout.CLOUD_SPA_SEATS.length, 36);
  assert.equal(layout.CLOUD_SPA_CHANNELS.length, 4); assert.equal(layout.CLOUD_SPA_PLACES.filter(p => p.kind === "lounge").length, 1);
  close(layout.CLOUD_SPA_CHANNEL.steps * layout.CLOUD_SPA_CHANNEL.rise, layout.CLOUD_SPA_TERRACE.drop, 1e-9);
  for (const [index, pool] of layout.CLOUD_SPA_POOLS.entries()) {
    close(pool.deckY, 18.8 - index * layout.CLOUD_SPA_TERRACE.drop); close(pool.waterY, pool.deckY - .25); close(pool.floorY, pool.deckY - 1.25);
    if (index > 0) {
      const upper = layout.CLOUD_SPA_POOLS[index - 1], gap = Math.hypot(pool.x - upper.x, pool.z - upper.z);
      assert.ok(gap < upper.radius + pool.radius - 2, `${pool.id} wraps around the wall of ${upper.id}`);
      assert.ok(gap > upper.radius + 7, "yet each basin keeps room for its own seats");
    }
    for (let slot = 0; slot < 6; slot++) {
      const seat = layout.cloudSpaSeat(pool.spotId, slot), angle = slot * Math.PI / 3;
      close(Math.hypot(seat.x - pool.x, seat.z - pool.z), pool.radius - 3);
      close(seat.baseY, pool.floorY); close(seat.avatarY, pool.floorY + .5); close(layout.cloudSpaFloorHeight(seat.x, seat.z), seat.baseY);
      assert.equal(layout.cloudSpaChannelAt(seat.x, seat.z), null, "no seat sits in a rill");
      assert.equal(layout.nearbyCloudSpaPlace(seat.x, seat.z)?.spotId, pool.spotId);
      assert.equal(layout.claimedCloudSpaSeat({ pose: "sitting", spotId: pool.spotId, slot }), seat);
      const outward = layout.CLOUD_SPA_OUTWARD_SLOTS[pool.spotId].includes(slot), expected = angle + (outward ? Math.PI : 0);
      close(Math.sin(seat.yaw), Math.sin(expected)); close(Math.cos(seat.yaw), Math.cos(expected));
      // Outward seats look straight at a nearby cloud edge, so the seated camera rises to show the valley.
      const ahead = layout.cloudSpaEdgeAhead(seat.x, seat.z, -Math.sin(seat.yaw), -Math.cos(seat.yaw), 30);
      assert.equal(ahead <= 30, outward, `${seat.id} edge ahead ${ahead}`);
      assert.ok(distance(layout.resolveCloudSpaWalk(seat.x, seat.z), [seat.x, seat.z]) < 1e-6);
    }
  }
  for (const slot of [-1, 6, .1, NaN]) assert.equal(layout.cloudSpaSeat("cloud-pool-1", slot), null);
  assert.equal(layout.claimedCloudSpaSeat({ pose: "lying", spotId: "cloud-pool-1", slot: 0 }), null);
  assert.equal(layout.nearbyCloudSpaPlace(NaN, 0), null);
  close(layout.cloudSpaCeilingHeight(0, 104), 29.2); assert.equal(layout.cloudSpaCeilingHeight(0, 70), null);
  close(layout.cloudSpaFloorHeight(layout.CLOUD_SPA_SPAWN.x, layout.CLOUD_SPA_SPAWN.z), 18.8);
});

test("each rill is a walkable staircase from pool to pool, while the terrace walls beside it refuse a step", () => {
  for (const channel of layout.CLOUD_SPA_CHANNELS) {
    let previous = null, risers = 0, lowestSeen = Infinity;
    for (let i = 0; i <= 800; i++) {
      const along = channel.length * i / 800, [x, z] = layout.cloudSpaChannelPoint(channel, along, 0), height = layout.cloudSpaFloorHeight(x, z);
      assert.ok(Number.isFinite(height)); assert.ok(distance(layout.resolveCloudSpaWalk(x, z), [x, z]) < 1e-6, "the rill never snaps sideways");
      if (previous) { assert.ok(layout.cloudSpaCanStep(previous[0], previous[1], x, z), `${channel.id} step at ${along}`); if (height < previous[2] - .2) risers++; }
      assert.ok(height <= (previous?.[2] ?? Infinity) + 1e-6 || along < channel.lipEnd, "water only ever flows downhill past the lip");
      lowestSeen = Math.min(lowestSeen, height); previous = [x, z, height];
    }
    assert.equal(risers, layout.CLOUD_SPA_CHANNEL.steps); close(lowestSeen, channel.lower.floorY);
    const sill = channel.upper.deckY - layout.CLOUD_SPA_CHANNEL.sill, [sx, sz] = layout.cloudSpaChannelPoint(channel, channel.upper.radius + .4, 0);
    close(layout.cloudSpaFloorHeight(sx, sz), sill, 1e-6); assert.ok(sill < channel.upper.waterY, "the upper pool spills over its sill");
    for (let k = 0; k < layout.CLOUD_SPA_CHANNEL.steps; k++) {
      const [x, z] = layout.cloudSpaChannelPoint(channel, channel.lipEnd + (k + .5) * layout.CLOUD_SPA_CHANNEL.run, 1.5);
      close(layout.cloudSpaFloorHeight(x, z), sill - layout.CLOUD_SPA_CHANNEL.rise * (k + 1), 1e-6);
      assert.ok(layout.cloudSpaGroundHeight(x, z) < layout.cloudSpaFloorHeight(x, z), "the mesh ramp hides beneath the tread slabs");
    }
    // Off the rill, the upper lip stands directly above the lower basin: a three-metre wall, not a slope.
    const lipAlong = Math.sqrt((channel.upper.radius + .6) ** 2 - 36), basinAlong = Math.sqrt((channel.upper.radius + 1.4) ** 2 - 36);
    const [lx, lz] = layout.cloudSpaChannelPoint(channel, lipAlong, 6), [bx, bz] = layout.cloudSpaChannelPoint(channel, basinAlong, 6);
    close(layout.cloudSpaFloorHeight(lx, lz), channel.upper.deckY); assert.ok(layout.cloudSpaFloorHeight(bx, bz) < channel.lower.waterY);
    assert.equal(layout.cloudSpaCanStep(lx, lz, bx, bz), false);
  }
  for (const [x, z] of [[70, 0], [-70, 0], [0, -120], [0, 130]]) {
    const safe = layout.resolveCloudSpaWalk(x, z); assert.ok(distance(safe, [x, z]) > 1); assert.ok(layout.cloudSpaInsideIsland(...safe));
    assert.ok(safe[0] >= layout.CLOUD_SPA_BOUNDS.minX && safe[0] <= layout.CLOUD_SPA_BOUNDS.maxX);
    assert.ok(safe[1] >= layout.CLOUD_SPA_BOUNDS.minZ && safe[1] <= layout.CLOUD_SPA_BOUNDS.maxZ);
  }
  assert.deepEqual(Array.from(layout.resolveCloudSpaWalk(Infinity, NaN)), [0, 91]);
  const range = layout.cloudSpaIslandRange();
  assert.ok(range.minZ > layout.CLOUD_SPA_BOUNDS.minZ && range.maxZ < layout.CLOUD_SPA_BOUNDS.maxZ, "the island fits the server bounds");
  for (let z = range.minZ + .5; z < range.maxZ; z += 2) { const span = layout.cloudSpaIslandSpan(z); assert.ok(span && span[0] < span[1] && span[0] > -45 && span[1] < 45); }
  for (const pool of layout.CLOUD_SPA_POOLS) {
    const edges = [0, 1, 2, 3, 4, 5].map(slot => layout.cloudSpaEdgeAhead(pool.x, pool.z, Math.sin(slot * Math.PI / 3), Math.cos(slot * Math.PI / 3), 60));
    assert.ok(edges.some(d => d <= 30), `${pool.id} has an open cloud edge within thirty metres for the valley view`);
  }
  assert.equal(layout.cloudSpaEdgeAhead(0, 104, 0, 1, 10), Infinity);
});

test("the visible cotton top, the tread slabs and the submerged tint agree with movement height", () => {
  for (const low of [true, false]) {
    const ground = geometry.buildCloudSpaGround(low), material = new THREE.MeshBasicMaterial(), floor = new THREE.Mesh(ground.geometry, material);
    floor.updateMatrixWorld(true);
    const hit = (x, z, object = floor) => new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)).intersectObject(object)[0];
    for (const pool of layout.CLOUD_SPA_POOLS) for (const fraction of [.12, .45, .8, .94]) for (let a = 0; a < 6; a++) {
      const x = pool.x + Math.sin(a) * pool.radius * fraction, z = pool.z + Math.cos(a) * pool.radius * fraction, h = hit(x, z);
      assert.ok(h); assert.ok(h.face.normal.y > .8); close(h.point.y, layout.cloudSpaGroundHeight(x, z), .065);
    }
    for (const [x, z] of [[0, 91], [0, 94], [0, 104], [15, 96]]) { assert.ok(hit(x, z)); close(hit(x, z).point.y, 18.8, .01); }
    for (const channel of layout.CLOUD_SPA_CHANNELS) for (let i = 0; i <= 10; i++) {
      const [x, z] = layout.cloudSpaChannelPoint(channel, channel.length * i / 10, 0);
      assert.ok(hit(x, z), "continuous cotton joins every pool along its rill");
    }
    assert.equal(hit(70, 0), undefined); assert.equal(hit(0, -100), undefined);
    const depth = ground.geometry.getAttribute("aDepth"), positions = ground.geometry.getAttribute("position");
    let wet = 0;
    for (let i = 0; i < positions.count; i++) {
      for (const value of [positions.getX(i), positions.getY(i), positions.getZ(i), depth.getX(i)]) assert.ok(Number.isFinite(value));
      if (depth.getX(i) > .5) wet++;
    }
    assert.ok(wet > 500, "basin floors carry their water depth");
    assert.ok(ground.outline.length > 100);
    for (const point of ground.outline) { const span = layout.cloudSpaIslandSpan(point.z); assert.ok(span && Math.min(Math.abs(point.x - span[0]), Math.abs(point.x - span[1])) < 1e-3, "the outline runs along the island span"); close(point.y, layout.cloudSpaGroundHeight(point.x, point.z), 1e-6); }
    // A terrace wall is upright: between the upper lip and the lower water the top drops within a hand's breadth of ground.
    const channel = layout.CLOUD_SPA_CHANNELS[0], wallHits = [], lipAngle = 230 * Math.PI / 180, lipRadius = channel.upper.radius + layout.CLOUD_SPA_TERRACE.lip;
    const wallX = channel.upper.x + Math.sin(lipAngle) * lipRadius, wallZ = channel.upper.z + Math.cos(lipAngle) * lipRadius;
    for (let x = wallX - .5; x <= wallX + .5; x += .04) { const h = hit(x, wallZ); if (h) wallHits.push(h.point.y); }
    assert.ok(Math.max(...wallHits) - Math.min(...wallHits) > 2.5, "the lip drops into the lower basin in the mesh");
    // Between two terrain rows a diagonal wall becomes one steep ribbon no wider than the row spacing, never a gentle slope.
    assert.ok(wallHits.filter(y => y > channel.lower.deckY + .3 && y < channel.upper.deckY - .3).length <= 18, `the lip wall stands steeply in the mesh: ${wallHits.map(y => y.toFixed(2)).join(" ")}`);
    ground.geometry.dispose(); material.dispose();
  }
  const f = fixture(true), slabs = f.scene.getObjectByName("cloud-spa-travertine");
  for (const channel of layout.CLOUD_SPA_CHANNELS) for (let k = 0; k < layout.CLOUD_SPA_CHANNEL.steps; k++) {
    const [x, z] = layout.cloudSpaChannelPoint(channel, channel.lipEnd + (k + .5) * layout.CLOUD_SPA_CHANNEL.run, 0);
    const h = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)).intersectObject(slabs)[0];
    assert.ok(h, "every tread is a visible slab"); close(h.point.y, layout.cloudSpaFloorHeight(x, z), .02);
  }
  const rills = f.scene.getObjectByName("cloud-spa-flowing-rills");
  assert.ok(rills.material.transparent); assert.equal(rills.geometry.getAttribute("aFlow").itemSize, 2);
  assert.equal(rills.geometry.index.count / 6, layout.CLOUD_SPA_CHANNELS.length * (1 + 2 * layout.CLOUD_SPA_CHANNEL.steps), "one sill sheet, one tread sheet and one fall per step");
  clean(f);
});

test("five water circles use their own height while the lowest southern lip looks straight down at the city", () => {
  const f = fixture(true), water = f.world.water.geometry, positions = water.getAttribute("position"), pools = water.getAttribute("aPool");
  assert.equal(pools.itemSize, 4); assert.equal(f.world.city.position.y, -170); assert.equal(f.world.city.material.fog, false);
  const seen = new Set();
  for (let i = 0; i < positions.count; i++) {
    const pool = layout.CLOUD_SPA_POOLS.find(p => Math.abs(p.x - pools.getX(i)) < 1e-4 && Math.abs(p.z - pools.getY(i)) < 1e-4);
    assert.ok(pool); close(positions.getY(i), pool.waterY); close(pools.getW(i), pool.deckY); seen.add(pool.id);
  }
  assert.equal(seen.size, 5);
  const origin = new THREE.Vector3(lowest.x, lowest.deckY + 1.55, lowest.z - lowest.radius - .4), direction = new THREE.Vector3(0, -Math.sin(1.05), -Math.cos(1.05));
  const ray = new THREE.Raycaster(origin, direction), opaque = [];
  f.scene.traverse(o => { if (o.isMesh && !o.material.transparent && !o.name.startsWith("cloud-spa-city")) opaque.push(o); });
  const obstructions = ray.intersectObjects(opaque, false);
  assert.equal(obstructions.length, 0, `the deck leaves the city overlook open: ${obstructions.map(h => h.object.name + ":" + h.point.toArray().join(",")).join(";")}`);
  assert.ok(ray.intersectObject(f.world.city)[0], "the downward view reaches real city geometry");
  const cloud = f.scene.getObjectByName("cloud-spa-cotton-cloud");
  assert.ok(cloud.material.transparent && cloud.material.depthWrite, "the cotton shell erodes at its silhouette yet still occludes");
  for (const x of [-9, 0, 9]) {
    const lipHit = new THREE.Raycaster(new THREE.Vector3(lowest.x + x, lowest.deckY - .6, lowest.z - 45), new THREE.Vector3(0, 0, 1)).intersectObject(cloud)[0];
    assert.ok(lipHit && lipHit.point.z < lowest.z - lowest.radius + 3 && lipHit.point.y < lowest.deckY, "the final pool has a closed front below the rim instead of a see-through slit");
  }
  // Every pool seat that faces the nearby edge sees the valley: the cloud ends within thirty metres in at least one seat direction.
  for (const pool of layout.CLOUD_SPA_POOLS) {
    const seats = layout.CLOUD_SPA_SEATS.filter(s => s.spotId === pool.spotId);
    assert.ok(seats.filter(s => layout.cloudSpaEdgeAhead(s.x, s.z, -Math.sin(s.yaw), -Math.cos(s.yaw), 30) <= 30).length >= 2, `${pool.id} offers seats with an open view down`);
  }
  // Banks skirt the edge below the shelf: no bank billboard centre rises above the cloud top beside it.
  const clouds = f.scene.getObjectByName("cloud-spa-photographic-banks-and-steam"), placed = clouds.geometry.getAttribute("aCloud"), form = clouds.geometry.getAttribute("aForm");
  let banks = 0;
  for (let i = 0; i < placed.count; i++) if (form.getW(i) === 0) { banks++; assert.ok(placed.getY(i) + placed.getW(i) * form.getY(i) * .5 < 19.6, "bank tops stay near or below the shelf"); }
  assert.ok(banks > 60, `the whole scalloped edge is skirted: ${banks}`);
  assert.equal(clouds.material.uniforms.uWalker.value.x, 0);
  clean(f);
});

test("one resort has a clear indoor lounge with no storm-cloud penetration into its usable room", () => {
  const f = fixture(true), clouds = f.scene.getObjectByName("cloud-spa-photographic-banks-and-steam"), placed = clouds.geometry.getAttribute("aCloud"), form = clouds.geometry.getAttribute("aForm");
  assert.equal(f.scene.getObjectByName("cloud-spa-cotton-storm"), undefined, "the storm cloud is smoke, not solid spheres");
  let storm = 0;
  for (let i = 0; i < placed.count; i++) {
    if (form.getW(i) !== 3) continue;
    storm++;
    const x = placed.getX(i), y = placed.getY(i), z = placed.getZ(i);
    assert.ok(!(Math.abs(x) < 18.75 && z > 91.75 && z < 116.25 && y > 18.8 && y < 29.2), "dark cloud billboards centre outside the interior shell");
  }
  assert.ok(storm >= 20, `the hall wears a storm crown, flanks and a bank: ${storm}`);
  const seats = layout.CLOUD_SPA_SEATS.filter(s => s.spotId === "cloud-lounge"), linen = f.scene.getObjectByName("cloud-spa-linen");
  for (const seat of seats) {
    const hit = new THREE.Raycaster(new THREE.Vector3(seat.x, seat.avatarY + .2, seat.z), new THREE.Vector3(0, -1, 0)).intersectObject(linen)[0];
    assert.ok(hit); close(hit.point.y, seat.avatarY, .01);
  }
  clean(f);
});

test("quality changes preserve the design and disposal releases every owned resource once without touching injected images", () => {
  const f = fixture(), disposeCounts = new Map(), textureCounts = new Map(), meshes = [];
  for (const texture of Object.values(f.textures)) { textureCounts.set(texture, 0); texture.addEventListener("dispose", () => textureCounts.set(texture, textureCounts.get(texture) + 1)); }
  f.scene.traverse(o => {
    if (o.isMesh) { meshes.push(o); for (const r of [o.geometry, o.material]) if (!disposeCounts.has(r)) { disposeCounts.set(r, 0); r.addEventListener("dispose", () => disposeCounts.set(r, disposeCounts.get(r) + 1)); } }
    if (o.isLight || o.isMesh) assert.equal(o.castShadow, false);
  });
  assert.ok(meshes.length <= 24, `static materials are batched: ${meshes.length} draws`);
  const clouds = f.scene.getObjectByName("cloud-spa-photographic-banks-and-steam"), full = clouds.geometry.instanceCount;
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 21, 85);
  const d = { stars: 1, lanterns: 1, sun: [0, -1, 0], moon: [-.4, .7, .3] };
  f.world.applyDaylight(d); f.world.update(1, camera, { x: 0, z: 70, moving: true });
  const floor = f.scene.getObjectByName("cloud-spa-walkable-cloud"), lamps = floor.material.uniforms.uLamps.value;
  assert.equal(lamps.length, materials.CLOUD_SPA_LAMP_COUNT); assert.ok(lamps[0].w > 0, "the nearest lanterns light the cotton");
  assert.equal(floor.material.uniforms.uTime, f.scene.getObjectByName("cloud-spa-cotton-cloud").material.uniforms.uTime, "all cotton shares one clock");
  close(clouds.material.uniforms.uWalker.value.y, 70);
  f.world.setQuality(true); assert.ok(clouds.geometry.instanceCount < full); f.world.update(2, camera, { x: 1, z: 70, moving: true });
  f.world.setQuality(false); assert.equal(clouds.geometry.instanceCount, full);
  f.world.update(.1, camera); f.world.update(NaN, camera);
  for (const ripple of f.world.water.material.uniforms.uRipples.value) assert.ok([ripple.x, ripple.y, ripple.z, ripple.w].every(Number.isFinite));
  f.world.dispose(); f.world.dispose(); assert.equal(f.scene.children.length, 0);
  for (const count of disposeCounts.values()) assert.equal(count, 1);
  for (const count of textureCounts.values()) assert.equal(count, 0);
  Object.values(f.textures).forEach(t => t.dispose());
});

test("four detailed city photographs share one narrow-seam surface, while real mountain belts cover every image edge", () => {
  const scene = new THREE.Scene(), tiles = Array.from({ length: 4 }, () => new THREE.Texture()), city = cityApi.buildCloudSpaCity(scene, tiles, true);
  scene.updateMatrixWorld(true);
  const uniforms = city.city.material.uniforms;
  assert.equal(uniforms.uTiled.value, 1);
  for (const [index, name] of ["uCityNW", "uCityNE", "uCitySW", "uCitySE"].entries()) assert.equal(uniforms[name].value, tiles[index]);
  assert.equal(city.city.material.transparent, false, "the city edge is closed by terrain instead of fading away as a flat black rectangle");
  const mountains = city.root.children.filter(o => o !== city.city);
  assert.equal(mountains.length, 3);
  for (const mountain of mountains) {
    const positions = mountain.geometry.getAttribute("position"), levels = new Set();
    for (let i = 0; i < positions.count; i++) { assert.ok([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)); levels.add(Math.round(positions.getY(i))); }
    assert.ok(levels.size > 35, "each actual mountain belt has varied height and sloping faces");
    assert.equal(mountain.material.fog, false); assert.equal(mountain.castShadow, false);
  }
  for (const side of [-1, 1]) for (const along of [-550, -275, 0, 275, 550]) for (const axis of [0, 1]) {
    const x = axis ? along : side * 550, z = cityApi.CLOUD_SPA_CITY.z + (axis ? side * 550 : along);
    const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObjects(mountains)[0];
    assert.ok(hit && hit.point.y > -169, `city photo edge (${x},${z}) lies underneath an actual mountain foothill`);
  }
  city.update(8, .7);
  for (const mountain of mountains) { assert.equal(mountain.material.uniforms.uTime, uniforms.uTime); assert.equal(mountain.material.uniforms.uNight, uniforms.uNight); }
  assert.equal(uniforms.uTime.value, 8); assert.equal(uniforms.uNight.value, .7);
  city.update(NaN, Infinity); assert.equal(uniforms.uTime.value, 8); assert.equal(uniforms.uNight.value, .7);
  city.dispose(); tiles.forEach(t => t.dispose());
});

test("city fallback remains usable and city disposal preserves injected photos while releasing all four draw resources once", () => {
  const scene = new THREE.Scene(), tile = new THREE.Texture(), city = cityApi.buildCloudSpaCity(scene, [tile]);
  assert.equal(city.city.material.uniforms.uTiled.value, 0);
  let textureDisposals = 0; tile.addEventListener("dispose", () => textureDisposals++);
  const counts = [];
  for (const mesh of city.root.children) for (const resource of [mesh.geometry, mesh.material]) { const entry = { count: 0 }; counts.push(entry); resource.addEventListener("dispose", () => entry.count++); }
  city.dispose(); city.dispose(); city.update(99, 1);
  assert.equal(counts.length, 8); counts.forEach(entry => assert.equal(entry.count, 1)); assert.equal(textureDisposals, 0); assert.equal(scene.children.length, 0);
  tile.dispose();
});
