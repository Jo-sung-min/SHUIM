import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" })
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];?\r?$/gm, "")
    .replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { THREE, mergeGeometries, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api={${names.join(",")}};`, context);
  return context.api;
}
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["SECRET_GARDEN", "SECRET_GARDEN_ZONES", "SECRET_GARDEN_PATHS", "groundHeight", "insideSecretGarden", "seededRandom", "resolveTrail"]);
const stars = await load("../lib/beach/bamboo-garden-stars.ts", trail, ["buildBambooGardenStars"]);
const { buildBambooSecretGarden } = await load("../lib/beach/bamboo-secret-garden.ts", { ...trail, ...stars }, ["buildBambooSecretGarden"]);
const build = () => { const parent = new THREE.Scene(), time = { value: 0 }; const garden = buildBambooSecretGarden(parent, time); parent.updateMatrixWorld(true); return { parent, garden, time }; };

test("three inhabited photo clearings share bounded instanced gardens and one fairy-light draw", t => {
  const { parent, garden } = build();
  let draws = 0, triangles = 0;
  parent.traverse(object => {
    assert.ok(!object.isLight, "no extra lighting pass");
    if (!object.isMesh && !object.isPoints) return;
    draws++; assert.ok(!object.castShadow);
    const p = object.geometry.getAttribute("position");
    assert.ok(Array.from(p.array).every(Number.isFinite), object.name);
    if (object.isMesh) triangles += (object.geometry.index?.count ?? p.count) / 3 * (object.isInstancedMesh ? object.count : 1);
    if (object.isInstancedMesh) assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));
  });
  const light = parent.getObjectByName("secret-garden-fairy-bulbs"), count = light.geometry.getAttribute("position").count;
  t.diagnostic(`${draws} draws, ${triangles} triangles, ${count} bulbs, zero new lights`);
  assert.ok(draws <= 15); assert.ok(triangles < 140000); assert.ok(count > 65000 && count < 125000);
  const positions = light.geometry.getAttribute("position");
  let raisedAhead = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    if (Math.abs(x - trail.SECRET_GARDEN.spineX) < 14 && z > 100 && positions.getY(i) > trail.groundHeight(x, z) + 4) raisedAhead++;
  }
  t.diagnostic(`Upper planted lights: ${raisedAhead}`);
  assert.ok(raisedAhead > 10000, "tall planted forms fill the forward view without the removed suspended ornaments");
  garden.setQuality(true); assert.ok(light.geometry.drawRange.count <= Math.ceil(count * .7));
  assert.equal(light.material.uniforms.uPointLimit.value, 8, "denser LEDs use smaller mobile glows to bound overdraw");
  garden.setQuality(false); assert.equal(light.geometry.drawRange.count, count);
  const walls = [parent.getObjectByName("secret-garden-opaque-backing"), parent.getObjectByName("secret-garden-bamboo-screen")];
  for (const zone of trail.SECRET_GARDEN_ZONES) {
    const ray = new THREE.Raycaster(new THREE.Vector3(zone.x, trail.groundHeight(zone.x, zone.z) + .3, zone.z), new THREE.Vector3(0, 1, 0), 0, 2.1);
    assert.equal(ray.intersectObjects(walls).length, 0, `${zone.id} has a clear posing area`);
  }
  garden.dispose();
});

test("the wider garden fills photo backdrops with rooted light plants and leaves the central sky free of floating line ornaments", () => {
  const { parent, garden } = build(), positions = parent.getObjectByName("secret-garden-fairy-bulbs").geometry.getAttribute("position");
  const points = Array.from({ length: positions.count }, (_, i) => ({ x: positions.getX(i), y: positions.getY(i), z: positions.getZ(i) }));
  const height = p => p.y - trail.groundHeight(p.x, p.z);
  const trees = garden.root.userData.treeSites;
  assert.ok(trees.length >= 12);
  for (const [x, z, , shape] of trees) {
    assert.ok(points.some(p => Math.hypot(p.x - x, p.z - z) < .7 && height(p) > .01 && height(p) < .15), `${shape} at ${x},${z} has visible lit roots`);
    if (shape === "willow") assert.ok(points.filter(p => Math.hypot(p.x - x, p.z - z) > 1.4 && Math.hypot(p.x - x, p.z - z) < 2 && height(p) < .6).length > 35, "weeping strands reach nearly to the soil");
  }
  assert.equal(points.filter(p => Math.abs(p.x - trail.SECRET_GARDEN.spineX) < 2.1 && p.z > 101 && p.z < 109.1 && height(p) > 3).length, 0, "no arches, stars, hearts or unsupported globes float over the forward walk");
  for (const zone of trail.SECRET_GARDEN_ZONES) {
    const direction = Math.sign(zone.x - trail.SECRET_GARDEN.spineX);
    assert.ok(points.filter(p => (p.x - zone.x) * direction > 3 && (p.x - zone.x) * direction < 5.6 && Math.abs(p.z - zone.z) < 3.3 && height(p) > .1 && height(p) < 4).length > 1400, `${zone.id} has a planted mid/low backdrop behind the photo ornament`);
  }
  for (const motif of garden.root.userData.wallMotifs) {
    assert.ok(motif.height > 5);
    assert.ok(motif.side
      ? Math.min(Math.abs(motif.x - trail.SECRET_GARDEN.minX), Math.abs(motif.x - trail.SECRET_GARDEN.maxX)) < 1.1
      : Math.abs(motif.z - trail.SECRET_GARDEN.maxZ) < .7, "colourful hearts and stars mount in front of the screen's projecting stems, away from the central sky");
  }
  garden.dispose();
});

test("the surprise garden lights remain hidden outside, reveal gradually after entry and switch off in daytime", () => {
  const { parent, garden, time } = build(), light = parent.getObjectByName("secret-garden-fairy-bulbs");
  garden.applyDaylight({ lanterns: 1 }); garden.update(0, { x: -18, z: 80 }); garden.update(1, { x: -22, z: 80 });
  assert.ok(!light.visible); assert.equal(light.material.uniforms.uReveal.value, 0);
  garden.update(1.1, { x: -32, z: 86 }); assert.ok(light.visible);
  assert.ok(light.material.uniforms.uReveal.value > 0 && light.material.uniforms.uReveal.value < .2);
  for (let i = 2; i < 50; i++) garden.update(1 + i * .1, { x: -32, z: 86 });
  assert.ok(light.material.uniforms.uReveal.value > .99);
  assert.equal(parent.getObjectByName("secret-garden-tree-crowns").visible, false, "night silhouettes are made of light points without opaque green blobs");
  assert.equal(parent.getObjectByName("secret-garden-topiary").visible, false);
  assert.ok(parent.getObjectByName("secret-garden-opaque-backing").material.color.r < .5, "night foliage stays dark behind the colourful LEDs");
  garden.applyDaylight({ lanterns: 0 }); garden.update(6.1, { x: -32, z: 86 }); assert.ok(!light.visible);
  assert.equal(parent.getObjectByName("secret-garden-tree-crowns").visible, true, "daytime still has natural foliage");
  assert.equal(parent.getObjectByName("secret-garden-opaque-backing").material.color.r, 1, "the backdrop dimmer is completely disabled by daylight");
  garden.applyDaylight({ lanterns: 1 }); garden.update(6.2, { x: -18, z: 80 }); assert.ok(!light.visible);
  assert.equal(time.value, 6.2); assert.ok(garden.root.visible, "the opaque boundary remains present from the pavilion");
  garden.dispose();
});

test("a small bounded swarm stays near the walk with readable mobile glows and reveals only inside at night", () => {
  const { parent, garden } = build(), fireflies = parent.getObjectByName("secret-garden-fireflies");
  const p = fireflies.geometry.getAttribute("position"), flights = fireflies.geometry.getAttribute("aFlight");
  assert.equal(p.count, 84);
  const phases = new Set();
  for (let i = 0; i < p.count; i++) {
    assert.ok(trail.insideSecretGarden(p.getX(i), p.getZ(i), -1), "drift has spare space at every boundary");
    const y = p.getY(i) - trail.groundHeight(p.getX(i), p.getZ(i));
    assert.ok(y - .3 > .5 && y + .3 < 2.5);
    assert.ok(Math.PI * 2 / flights.getY(i) >= 2.5 && Math.PI * 2 / flights.getY(i) <= 5, "no fast flashing");
    phases.add(flights.getX(i));
  }
  assert.ok(phases.size > 80, "fireflies do not blink in unison");
  let nearWalk = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - trail.SECRET_GARDEN.spineX) < 4.5) nearWalk++;
  assert.ok(nearWalk >= 56, "most of the unchanged swarm is visible beside the walk rather than lost among distant LEDs");
  garden.setQuality(true); assert.equal(fireflies.geometry.drawRange.count, 84); assert.equal(fireflies.material.uniforms.uFireflyLimit.value, 12);
  garden.setQuality(false); assert.equal(fireflies.geometry.drawRange.count, 84);
  garden.applyDaylight({ lanterns: 1 }); garden.update(0, { x: -18, z: 80 }); assert.equal(fireflies.visible, false);
  garden.update(.1, { x: -38, z: 86 }); assert.equal(fireflies.visible, true);
  garden.applyDaylight({ lanterns: 0 }); garden.update(.2, { x: -38, z: 86 }); assert.equal(fireflies.visible, false);
  garden.applyDaylight({ lanterns: 1 }); garden.update(.3, { x: -18, z: 80 }); assert.equal(fireflies.visible, false);
  garden.dispose();
});

test("the star backdrop stays on the inner walls, preserves all faces on mobile and shares the secret night reveal", () => {
  const { parent, garden } = build(), backdrop = parent.getObjectByName("secret-garden-star-backdrop");
  const starPoints = parent.getObjectByName("secret-garden-backdrop-stars"), geometry = starPoints.geometry;
  const position = geometry.getAttribute("position");
  assert.ok(position.count <= 1000, "sparse wall stars leave dark space around the photo ornaments");
  assert.ok(Object.values(geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0) < 80000,
    "the new backdrop stays within a small fixed buffer budget without texture downloads");
  garden.setQuality(true);
  assert.equal(geometry.drawRange.count, position.count, "phones retain the same stars with smaller glows instead of gaps");
  const faces = new Set(), entranceWings = { left: 0, right: 0 }, halves = { upper: 0, lower: 0 };
  for (let i = 0; i < geometry.drawRange.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    assert.ok(trail.insideSecretGarden(x, z));
    const height = y - trail.groundHeight(x, z);
    assert.ok(height >= .89 && height < 10.51, "sparse sparkles cover the whole wall without spilling over its edges");
    halves[height < 5.7 ? "lower" : "upper"]++;
    if (z < 85.6) faces.add("entrance");
    else if (z > trail.SECRET_GARDEN.maxZ - 1.1) faces.add("rear");
    else if (x < trail.SECRET_GARDEN.minX + 1.7) { faces.add("left"); if (z < 92) entranceWings.left++; }
    else if (x > trail.SECRET_GARDEN.maxX - 1.7) { faces.add("right"); if (z < 92) entranceWings.right++; }
    else assert.fail("decorative stars must stay against the walls, away from the open walk");
  }
  assert.equal(faces.size, 4);
  assert.equal(halves.upper, halves.lower, "the upper and lower halves have the same number of stars");
  assert.ok(entranceWings.left >= 35 && entranceWings.right >= 35, "both extended entrance walls retain sparse twinkles");
  garden.applyDaylight({ lanterns: 1 }); garden.update(0, { x: -18, z: 80 }); assert.equal(backdrop.visible, false);
  garden.update(.1, { x: -38, z: 86 }); assert.equal(backdrop.visible, true);
  garden.applyDaylight({ lanterns: 0 }); garden.update(.2, { x: -38, z: 86 }); assert.equal(backdrop.visible, false);
  garden.applyDaylight({ lanterns: 1 }); garden.update(.3, { x: -18, z: 80 }); assert.equal(backdrop.visible, false);
  garden.setQuality(false); assert.equal(geometry.drawRange.count, position.count);
  garden.dispose();
});

test("the entrance has a visible clear doorway while its sides and header remain private", () => {
  const { parent, garden } = build(), veil = parent.getObjectByName("secret-garden-entrance-night-veil");
  const base = trail.groundHeight(-38, 85.25);
  for (const x of [-39.2, -38, -36.8]) for (const height of [.6, 1.6, 2.7]) {
    const opening = new THREE.Raycaster(new THREE.Vector3(x, base + height, 90), new THREE.Vector3(0, 0, -1));
    assert.equal(opening.intersectObject(veil).length, 0, "the walking exit is visibly open, not merely non-colliding");
  }
  const fromInside = new THREE.Raycaster(new THREE.Vector3(-42, base + 1.6, 90), new THREE.Vector3(0, 0, -1));
  const header = new THREE.Raycaster(new THREE.Vector3(-38, base + 4.5, 90), new THREE.Vector3(0, 0, -1));
  const fromOutside = new THREE.Raycaster(new THREE.Vector3(-42, base + 1.6, 82), new THREE.Vector3(0, 0, 1));
  assert.equal(veil.material.side, THREE.FrontSide);
  assert.ok(fromInside.intersectObject(veil).length > 0, "the entrance wings remain enclosed");
  assert.ok(header.intersectObject(veil).length > 0, "the space above the door remains screened");
  assert.equal(fromOutside.intersectObject(veil).length, 0, "the back face cannot hide the forest from outside");
  const stars = parent.getObjectByName("secret-garden-backdrop-stars").geometry.getAttribute("position");
  for (let i = 0; i < stars.count; i++) {
    const x = stars.getX(i), z = stars.getZ(i), height = stars.getY(i) - trail.groundHeight(x, z);
    assert.ok(!(z < 86 && Math.abs(x + 38) < 1.7 && height < 3.4), "no star curtain crosses the visible doorway");
  }
  for (let i = 0; i <= 24; i++) {
    const x = i <= 20 ? -34 - 4 * i / 20 : -38;
    const z = i <= 20 ? 80 + 5 * i / 20 : 85 + (i - 20) / 4;
    const resolved = trail.resolveTrail(x, z);
    assert.ok(Math.hypot(resolved[0] - x, resolved[1] - z) < .001, "the entrance path remains passable");
  }
  garden.dispose();
});

test("dark entrance wings close the side gaps while the approach and every branch stay clear", () => {
  const { parent, garden } = build(), walls = [parent.getObjectByName("secret-garden-opaque-backing"), parent.getObjectByName("secret-garden-bamboo-screen")];
  assert.equal(parent.getObjectByName("secret-garden-entrance-reeds"), undefined, "the large solid reeds at the entrance were removed");
  const backing = walls[0], position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  for (let i = 0; i < backing.count; i++) {
    const matrix = new THREE.Matrix4(); backing.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale);
    assert.ok(position.z >= 85.25, "the backing starts at the room edge, not in the approach corridor");
    if (position.z < 92) assert.ok(Math.abs(position.x - trail.SECRET_GARDEN.spineX) > 12, "new columns stay along the side perimeter");
  }
  for (const z of [85.5, 87, 90, 91.5]) for (const height of [1.6, 7]) for (const side of [-1, 1]) {
    const origin = new THREE.Vector3(-38, trail.groundHeight(-38, z) + height, z);
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(side, 0, 0));
    assert.ok(ray.intersectObject(backing).length > 0, `opaque columns close the ${side < 0 ? "west" : "east"} gap at ${z}`);
  }
  const expandedWalls = [];
  for (const wall of walls) {
    wall.geometry.computeBoundingBox();
    for (let i = 0; i < wall.count; i++) {
      const matrix = new THREE.Matrix4(); wall.getMatrixAt(i, matrix);
      expandedWalls.push(wall.geometry.boundingBox.clone().applyMatrix4(matrix).expandByScalar(.3));
    }
  }
  for (const path of trail.SECRET_GARDEN_PATHS) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let sample = 0; sample <= 40; sample++) {
      const t = sample / 40;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const body = new THREE.Vector3(x, trail.groundHeight(x, z) + 1, z);
      assert.ok(!expandedWalls.some(box => box.containsPoint(body)), `${path.id} at ${x},${z} leaves room for the character's body`);
      for (const side of [-.3, 0, .3]) {
        const px = x - (b[1] - a[1]) / length * side, pz = z + (b[0] - a[0]) / length * side;
        const ray = new THREE.Raycaster(new THREE.Vector3(px, trail.groundHeight(px, pz) + .25, pz), new THREE.Vector3(0, 1, 0), 0, 2);
        assert.equal(ray.intersectObjects(walls).length, 0, `${path.id} at ${px},${pz} clear of screen walls`);
      }
    }
  }
  garden.dispose();
});

test("all owned buffers, materials and instance resources release exactly once", () => {
  const { parent, garden } = build(), resources = new Set();
  parent.traverse(object => {
    if (!object.geometry) return; resources.add(object.geometry); resources.add(object.material);
    if (object.isInstancedMesh) resources.add(object);
  });
  const counts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  garden.dispose(); garden.dispose(); assert.equal(parent.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});
