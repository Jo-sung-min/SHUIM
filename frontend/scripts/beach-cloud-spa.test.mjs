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
  "CLOUD_SPA_BOUNDS", "CLOUD_SPA_ISLAND", "CLOUD_SPA_SPAWN", "CLOUD_SPA_POOLS", "CLOUD_SPA_RESORT", "CLOUD_SPA_PLACES", "CLOUD_SPA_SEATS", "CLOUD_SPA_CONNECTIONS", "CLOUD_SPA_STAIR_BREAKS", "CLOUD_SPA_WALLS",
  "cloudSpaFloorHeight", "cloudSpaCeilingHeight", "cloudSpaConnectionPosition", "cloudSpaStairHeight", "cloudSpaTerraceRadius", "cloudSpaMountainHalfWidth", "cloudSpaStairRouteX", "cloudSpaCanStep", "resolveCloudSpaWalk", "nearbyCloudSpaPlace", "cloudSpaForSpot", "claimedCloudSpaSeat", "cloudSpaSeat",
]);
const textiles = await load("../lib/beach/shelter-textiles.ts", {}, ["createShelterPillowGeometry"]);
const materials = await load("../lib/beach/cloud-spa-materials.ts", {}, ["createCloudSpaCloudMaterial"]);
const geometry = await load("../lib/beach/cloud-spa-geometry.ts", { ...layout, ...textiles, ...materials }, ["cloudSpaGroundGeometry", "cloudSpaViewGap", "buildCloudSpaScenery"]);
const cityApi = await load("../lib/beach/cloud-spa-city.ts", {}, ["CLOUD_SPA_CITY", "cloudSpaCityMountainGeometry", "buildCloudSpaCity"]);
const { CloudSpaWorld } = await load("../lib/beach/cloud-spa.ts", { ...layout, ...geometry, ...materials, ...cityApi, CLOUD_SPA_SKY_FUNCTIONS: "", CLOUD_SPA_SKY_UNIFORMS: "" }, ["CloudSpaWorld"]);
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fixture = (low = false) => {
  const scene = new THREE.Scene(), textures = { wood: new THREE.Texture(), cotton: new THREE.Texture(), cloud: new THREE.Texture(), city: new THREE.Texture(), surface: new THREE.Texture() };
  const world = new CloudSpaWorld(scene, {}, textures, low); scene.updateMatrixWorld(true); return { scene, textures, world };
};
const clean = f => { f.world.dispose(); Object.values(f.textures).forEach(t => t.dispose()); };

test("five genuinely round thermal terraces descend in four-metre steps with thirty-six canonical claims", () => {
  assert.equal(layout.CLOUD_SPA_POOLS.length, 5); assert.equal(layout.CLOUD_SPA_SEATS.length, 36);
  assert.equal(layout.CLOUD_SPA_CONNECTIONS.length, 4); assert.equal(layout.CLOUD_SPA_PLACES.filter(p => p.kind === "lounge").length, 1);
  for (const [index, pool] of layout.CLOUD_SPA_POOLS.entries()) {
    close(pool.deckY, 18.8 - index * 4); close(pool.waterY, pool.deckY - .25); close(pool.floorY, pool.deckY - 1.25);
    for (let slot = 0; slot < 6; slot++) {
      const seat = layout.cloudSpaSeat(pool.spotId, slot), angle = slot * Math.PI / 3;
      close(Math.hypot(seat.x - pool.x, seat.z - pool.z), pool.radius - 3);
      close(seat.baseY, pool.floorY); close(seat.avatarY, pool.floorY + .5); close(layout.cloudSpaFloorHeight(seat.x, seat.z), seat.baseY);
      assert.equal(layout.nearbyCloudSpaPlace(seat.x, seat.z)?.spotId, pool.spotId);
      assert.equal(layout.claimedCloudSpaSeat({ pose: "sitting", spotId: pool.spotId, slot }), seat);
      const outward = index === 4 && slot >= 2 && slot <= 4, expected = angle + (outward ? Math.PI : 0);
      close(Math.sin(seat.yaw), Math.sin(expected)); close(Math.cos(seat.yaw), Math.cos(expected));
      assert.ok(distance(layout.resolveCloudSpaWalk(seat.x, seat.z), [seat.x, seat.z]) < 1e-6);
    }
  }
  for (const slot of [-1, 6, .1, NaN]) assert.equal(layout.cloudSpaSeat("cloud-pool-1", slot), null);
  assert.equal(layout.claimedCloudSpaSeat({ pose: "lying", spotId: "cloud-pool-1", slot: 0 }), null);
  assert.equal(layout.nearbyCloudSpaPlace(NaN, 0), null);
  close(layout.cloudSpaCeilingHeight(0, 104), 29.2); assert.equal(layout.cloudSpaCeilingHeight(0, 70), null);
});

test("a single cloud mountain joins every terrace with broad stairs and no walkable gap", () => {
  for (const link of layout.CLOUD_SPA_CONNECTIONS) {
    const p = layout.cloudSpaConnectionPosition(link, link.ax, link.az);
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, x = link.ax + (link.bx - link.ax) * t, z = link.az + (link.bz - link.az) * t;
      assert.ok(distance(layout.resolveCloudSpaWalk(x, z), [x, z]) < 1e-6, "centre-to-centre path never snaps sideways");
      assert.ok(Number.isFinite(layout.cloudSpaFloorHeight(x, z)));
    }
    for (let i = 1; i <= 500; i++) {
      const z0 = link.az + (link.bz - link.az) * (i - 1) / 500, z1 = link.az + (link.bz - link.az) * i / 500;
      for (const side of [-1, 1]) assert.ok(layout.cloudSpaCanStep(side * layout.cloudSpaStairRouteX(z0), z0, side * layout.cloudSpaStairRouteX(z1), z1));
    }
  }
  for (const [x, z] of [[70, 0], [-70, 0], [0, -120], [0, 130]]) {
    const safe = layout.resolveCloudSpaWalk(x, z); assert.ok(distance(safe, [x, z]) > 1);
    assert.ok(safe[0] >= layout.CLOUD_SPA_BOUNDS.minX && safe[0] <= layout.CLOUD_SPA_BOUNDS.maxX);
    assert.ok(safe[1] >= layout.CLOUD_SPA_BOUNDS.minZ && safe[1] <= layout.CLOUD_SPA_BOUNDS.maxZ);
  }
  assert.deepEqual(Array.from(layout.resolveCloudSpaWalk(Infinity, NaN)), [0, 91]);
  for (const [x, z] of [[0, 54], [0, 22], [0, -10], [0, -46]]) assert.deepEqual(Array.from(layout.resolveCloudSpaWalk(x, z)), [x, z], "the land between baths is connected, not separate floating coins");
});

test("the visible mountain floor, round basins and exact stair risers agree with movement height", () => {
  for (const low of [true, false]) {
    const g = geometry.cloudSpaGroundGeometry(low), material = new THREE.MeshBasicMaterial(), floor = new THREE.Mesh(g, material);
    floor.updateMatrixWorld(true);
    const hit = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)).intersectObject(floor)[0];
    for (const pool of layout.CLOUD_SPA_POOLS) for (const fraction of [.12, .45, .8, .94]) for (let a = 0; a < 6; a++) {
      const radius = pool.radius, x = pool.x + Math.sin(a) * radius * fraction, z = pool.z + Math.cos(a) * radius * fraction, h = hit(x, z);
      assert.ok(h); assert.ok(h.face.normal.y > .8); close(h.point.y, layout.cloudSpaFloorHeight(x, z), .065);
    }
    for (const link of layout.CLOUD_SPA_CONNECTIONS) {
      for (let i = 0; i < 32; i++) {
        const z = link.az + (link.bz - link.az) * (i + .5) / 32, x = layout.cloudSpaStairRouteX(z), h = hit(x, z);
        assert.ok(h, "all treads face upward and support an avatar"); close(h.point.y, layout.cloudSpaFloorHeight(x, z), .02);
      }
    }
    for (const [x, z] of [[0, 91], [0, 94], [0, 104], [15, 96]]) { assert.ok(hit(x, z)); close(hit(x, z).point.y, 18.8); }
    for (const [x, z] of [[0, 54], [0, 22], [0, -10], [0, -46]]) assert.ok(hit(x, z), "continuous ground closes the old gaps between circular islands");
    assert.equal(hit(70, 0), undefined);
    for (const value of g.getAttribute("position").array) assert.ok(Number.isFinite(value));
    g.dispose(); material.dispose();
  }
});

test("five water circles use their own height while a clear lowest southern overlook sees the city below", () => {
  const f = fixture(true), water = f.world.water.geometry, positions = water.getAttribute("position"), pools = water.getAttribute("aPool");
  assert.equal(pools.itemSize, 4); assert.equal(f.world.city.position.y, -170); assert.equal(f.world.city.material.fog, false);
  const seen = new Set();
  for (let i = 0; i < positions.count; i++) {
    const pool = layout.CLOUD_SPA_POOLS.find(p => Math.abs(p.x - pools.getX(i)) < 1e-4 && Math.abs(p.z - pools.getY(i)) < 1e-4);
    assert.ok(pool); close(positions.getY(i), pool.waterY); close(pools.getW(i), pool.deckY); seen.add(pool.id);
  }
  assert.equal(seen.size, 5);
  const origin = new THREE.Vector3(0, 4.35, -89.4), direction = new THREE.Vector3(0, -Math.sin(1.05), -Math.cos(1.05));
  const ray = new THREE.Raycaster(origin, direction), opaque = [];
  f.scene.traverse(o => { if (o.isMesh && !o.material.transparent && !o.name.startsWith("cloud-spa-city")) opaque.push(o); });
  const obstructions = ray.intersectObjects(opaque, false);
  assert.equal(obstructions.length, 0, `cloud billows and the deck leave the city overlook open: ${obstructions.map(h => h.object.name + ":" + h.point.toArray().join(",")).join(";")}`);
  assert.ok(ray.intersectObject(f.world.city)[0], "the downward view reaches real city geometry");
  const cloud = f.scene.getObjectByName("cloud-spa-moonlit-cloud");
  for (const x of [-9, 0, 9]) {
    const lipHit = new THREE.Raycaster(new THREE.Vector3(x, .5, -105), new THREE.Vector3(0, 0, 1)).intersectObject(cloud)[0];
    assert.ok(lipHit && lipHit.point.z < -84, "the final pool has a closed front below the rim instead of a see-through slit");
  }
  clean(f);
});

test("one resort has a clear indoor lounge with no storm-cloud penetration into its usable room", () => {
  const f = fixture(true), storm = f.scene.getObjectByName("cloud-spa-single-storm-resort"), positions = storm.geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    assert.ok(!(Math.abs(x) < 18.75 && z > 91.75 && z < 116.25 && y > 18.8 && y < 29.2), "dark cloud geometry stays outside the interior shell");
  }
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
