import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

async function loadModule(file, dependencies, exports) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed)
    .replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports.join(", ")} };`, context);
  return context.api;
}

const { buildShelters } = await loadModule("../lib/beach/shelters.ts", { THREE, RoundedBoxGeometry }, ["buildShelters"]);
const { buildNightLights } = await loadModule("../lib/beach/night-lights.ts", { THREE }, ["buildNightLights"]);
const { CAMPFIRE_BENCHES, buildFireBenches } = await loadModule("../lib/beach/fire-benches.ts", { THREE, RoundedBoxGeometry }, ["CAMPFIRE_BENCHES", "buildFireBenches"]);
const { Cove, CAMPFIRE } = await loadModule("../lib/beach/cove.ts", { THREE, buildShelters, buildNightLights, buildFireBenches }, ["Cove", "CAMPFIRE"]);
const { daylightAt } = await loadModule("../lib/beach/daylight.ts", {}, ["daylightAt"]);
const scene = new THREE.Scene(), obstacles = [];
const cove = new Cove(scene, obstacles);

test("the original stone walls enclose both sides without entering the playable beach", () => {
  const ridge = scene.getObjectByName("cove-original-ridge");
  assert.ok(ridge?.isMesh);
  const positions = ridge.geometry.getAttribute("position");
  assert.equal(positions.count, 23379, "the original wall resolution is restored");
  assert.equal(ridge.geometry.index.count, 138816);
  let left = 0, right = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    assert.ok(Number.isFinite(x + y + z));
    if (z >= -1 && z <= 31) {
      assert.ok(Math.abs(x) > 22, "the walls stay outside the walkable rectangle");
      if (x < -22) left++;
      if (x > 22) right++;
    }
  }
  assert.ok(left > 3500 && right > 3500, "both side walls retain continuous substantial surfaces");
  ridge.geometry.computeBoundingBox();
  const { min, max } = ridge.geometry.boundingBox;
  assert.ok(min.x > -40 && min.x < -39 && max.x > 39 && max.x < 40);
  assert.ok(min.z > -17 && min.z < -16 && max.z > 51 && max.z < 52);
  assert.ok(max.y > 43 && max.y < 45, "the original tall stone silhouette is preserved");
  assert.equal(ridge.castShadow, true);
  assert.equal(ridge.receiveShadow, true);
});

test("restored cliffs use the original pale rock surface without added crest vegetation", () => {
  assert.equal(scene.getObjectByName("paradise-crest-vegetation"), undefined);
  assert.equal(scene.getObjectByName("paradise-distant-ridge"), undefined);
  const ridge = scene.getObjectByName("cove-original-ridge");
  const material = ridge.material;
  assert.ok(material.isMeshStandardMaterial && material.map && material.normalMap);
  assert.equal(material.color.getHex(), 0xe9e6df);
  assert.equal(material.normalScale.x, .65);
  assert.equal(material.normalScale.y, .65);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  assert.doesNotMatch(shader.fragmentShader, /moss/i, "green moss does not replace the restored stone surface");
});

test("campfire benches replace decorative logs while other scenery keeps its existing obstacles", () => {
  assert.equal(CAMPFIRE.x, 0);
  assert.equal(CAMPFIRE.z, 12);
  assert.equal(obstacles.length, 48, "eight boulders, 36 bench circles and four light posts collide");
  const expectedBenches = [];
  buildFireBenches(new THREE.Scene(), expectedBenches);
  for (const expected of expectedBenches) {
    assert.equal(obstacles.filter(o => o.x === expected.x && o.z === expected.z && o.r === expected.r).length, 1,
      "cove adds each shared bench collider exactly once");
  }
  for (const bench of CAMPFIRE_BENCHES) {
    assert.ok(obstacles.some(o => Math.hypot(o.x - bench.x, o.z - bench.z) < o.r), "each visible bench remains solid");
  }
});

test("after 22:00 the beach has a dim moonlit fill instead of globally bright white sand", () => {
  cove.applyDaylight(daylightAt(0));
  const fill = scene.children.find(o => o.isHemisphereLight);
  const sun = scene.children.find(o => o.isDirectionalLight);
  assert.ok(fill.intensity >= .08 && fill.intensity <= .2, "deep night keeps only a small readable sky fill");
  assert.ok(sun.intensity >= .03 && sun.intensity <= .1, "moonlight is gentle enough for local lamps to dominate");
  assert.ok(fill.color.r < fill.color.b * 1.1, "global fill is not orange; fire supplies local warmth");
  const nightFill = fill.intensity, nightSun = sun.intensity;
  cove.applyDaylight(daylightAt(12));
  assert.ok(fill.intensity >= 1.5 && fill.intensity > nightFill * 8, "bright daytime lighting is preserved");
  assert.ok(sun.intensity >= 1.5 && sun.intensity > nightSun * 12);
  const evening = daylightAt(21.5), midnight = daylightAt(0);
  assert.ok(Math.max(...midnight.sandTint) < Math.min(...evening.sandTint) * .65);
  assert.ok(Math.max(...midnight.fog) < .15, "a bright fog curtain cannot wash out the dark beach");
  assert.ok(Math.max(...midnight.seaDeep) < .12);
});

test("deep night eases in before 22:00, stays dark across midnight, and eases out through dawn", () => {
  for (const hour of [22, 23, 0, 1, 4.5, 24, -1, 48]) assert.equal(daylightAt(hour).deepNight, 1);
  for (const hour of [5.5, 8.5, 12, 16, 18, 21.5]) assert.equal(daylightAt(hour).deepNight, 0);
  let previous = 0;
  for (let minute = 0; minute <= 30; minute++) {
    const depth = daylightAt(21.5 + minute / 60).deepNight;
    assert.ok(depth >= previous && depth <= 1, "evening transition darkens monotonically");
    previous = depth;
  }
  assert.equal(previous, 1);
  previous = 1;
  for (let minute = 0; minute <= 60; minute++) {
    const depth = daylightAt(4.5 + minute / 60).deepNight;
    assert.ok(depth <= previous && depth >= 0, "dawn transition brightens monotonically");
    previous = depth;
  }
  assert.equal(previous, 0);
  const channels = ["deepNight", "skyTop", "skyHorizon", "cloud", "fog", "seaDeep", "seaShallow", "foam", "sandTint", "tint", "specular", "sun", "moon"];
  for (const boundary of [21.5, 22, 24, 4.5, 5.5]) {
    const before = daylightAt(boundary - 1e-5), after = daylightAt(boundary + 1e-5);
    for (const channel of channels) {
      const a = Array.isArray(before[channel]) ? before[channel] : [before[channel]];
      const b = Array.isArray(after[channel]) ? after[channel] : [after[channel]];
      assert.ok(a.every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]) < .0001), `${channel} stays continuous across ${boundary}:00`);
    }
  }
});

test("the noon palette remains unchanged while late-night sea and sky lose their bright haze", () => {
  const noon = daylightAt(12);
  const rgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
  const closeRgb = (actual, expected) => expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 1e-10));
  closeRgb(noon.sandTint, [1, 1, 1]); closeRgb(noon.tint, [1, 1, 1]);
  closeRgb(noon.skyTop, rgb(0x2f85e6)); closeRgb(noon.seaShallow, rgb(0x5fd2de));
  closeRgb(noon.fog, rgb(0xdbeffb));
  assert.equal(noon.deepNight, 0);
  for (let minute = 0; minute < 24 * 60; minute++) {
    const value = daylightAt(minute / 60);
    assert.ok(value.deepNight >= 0 && value.deepNight <= 1);
    for (const channel of ["skyTop", "skyHorizon", "seaDeep", "seaShallow", "sandTint", "tint", "fog"]) {
      assert.ok(value[channel].every(component => Number.isFinite(component) && component >= 0 && component <= 1));
    }
  }
});

test("warm nighttime lamps stay local, use a fixed mobile light budget, and dim in daylight", () => {
  cove.applyDaylight(daylightAt(0));
  const pointLights = [];
  scene.traverse(object => { if (object.isPointLight) pointLights.push(object); });
  const firstPoint = scene.children.find(object => object.isPointLight);
  assert.equal(firstPoint.position.x, CAMPFIRE.x);
  assert.equal(firstPoint.position.z, CAMPFIRE.z, "the original first light remains the campfire for existing callers");
  const pathLights = pointLights.filter(light => light.name.startsWith("coastal-lantern-light-"));
  const hutLights = pointLights.filter(light => light.name.startsWith("shelter-light-"));
  assert.equal(pathLights.length, 4);
  assert.equal(hutLights.length, 3, "the real hut lights are included in the performance budget");
  assert.ok(pointLights.length <= 8, "glowing decorations do not each create another point light");
  const nightIntensity = new Map();
  for (const light of [...pathLights, ...hutLights]) {
    assert.equal(light.castShadow, false, "local lamps never allocate shadow-map passes");
    assert.equal(light.decay, 2);
    assert.ok(light.color.r > light.color.g && light.color.g > light.color.b, "warmth comes from amber lamps, not global orange fill");
    assert.ok(light.distance > 0 && light.distance <= 11, "every lamp has a finite local range");
    assert.ok(light.intensity > 0 && light.intensity <= 9);
    nightIntensity.set(light, light.intensity);
  }
  for (const light of pathLights) {
    assert.ok(light.distance <= 5 && light.intensity <= 3, "path lamps create small pools instead of lighting the whole beach");
  }
  const pools = scene.getObjectByName("coastal-lantern-ground-pools"), halos = scene.getObjectByName("coastal-lantern-halos");
  assert.ok(pools?.isInstancedMesh && pools.count > 0 && pools.count <= 16);
  assert.ok(halos?.isInstancedMesh && halos.count > 0 && halos.count <= 80);
  for (const glow of [pools, halos]) {
    assert.equal(glow.castShadow, false);
    assert.equal(glow.material.depthWrite, false, "soft glows cannot write opaque squares over the ground");
  }
  let before = 0;
  scene.traverse(() => before++);
  for (let sample = 0; sample < 120; sample++) cove.applyDaylight(daylightAt(21.5 + sample / 240));
  let after = 0;
  scene.traverse(() => after++);
  assert.equal(after, before, "time transitions reuse the same lights and glow meshes");
  cove.applyDaylight(daylightAt(12));
  for (const light of [...pathLights, ...hutLights]) assert.ok(light.intensity <= nightIntensity.get(light) * .2, "daylight dims local lamps without changing daytime sky brightness");
});

let lightTime = 0;
function settleFire(seconds = 5) {
  for (let i = 0; i < seconds * 60; i++) cove.update(lightTime += 1 / 60);
  return scene.children.find(o => o.isPointLight);
}

test("bare embers stay dim, local and amber even after a colored flare, with a slow quiet breath", () => {
  cove.applyDaylight(daylightAt(0));
  cove.setFireState(12, "violet");
  cove.setFireFlare(1);
  settleFire();
  cove.setFireState(0, "violet");
  cove.setFireTint(new THREE.Color(0xc08eff));
  const light = settleFire();
  assert.ok(light.intensity < 0.75, "an empty pit does not light the whole beach");
  assert.ok(light.distance < 4.3, "remaining warmth is confined to the fire pit");
  assert.ok(light.color.r > light.color.g && light.color.g > light.color.b, "empty embers return to amber instead of retaining purple powder");
  let min = Infinity, max = 0, previous = light.intensity;
  for (let i = 0; i < 12 * 60; i++) {
    cove.update(lightTime += 1 / 60);
    min = Math.min(min, light.intensity); max = Math.max(max, light.intensity);
    assert.ok(Math.abs(light.intensity - previous) < 0.002, "no abrupt ember flicker between frames");
    previous = light.intensity;
  }
  assert.ok(max / min < 1.05, "the ember breath stays subtle across a full cycle");
});

test("full flames keep bounded nearby illumination while preserving visible powder hue", () => {
  cove.applyDaylight(daylightAt(0));
  cove.setFireFlare(0);
  cove.setFireState(3, "amber");
  const light = settleFire();
  const smallFireIntensity = light.intensity;
  cove.setFireState(12, "amber");
  settleFire();
  assert.ok(light.intensity > smallFireIntensity);
  assert.ok(light.intensity < 21, "double-height flames do not double the scene exposure");
  assert.ok(light.distance < 10 && light.decay === 2, "firelight falls off before covering the whole gathering area");
  const amber = light.color.clone();
  cove.setFireTint(new THREE.Color(0xc08eff));
  settleFire();
  assert.ok(light.color.b > light.color.g, "purple powder remains visible in the nearby light");
  assert.ok(Math.hypot(light.color.r - amber.r, light.color.g - amber.g, light.color.b - amber.b) > 0.2, "powder tint is preserved instead of becoming white");
  cove.setFireFlare(100);
  settleFire(1);
  assert.ok(light.intensity < 26, "fresh wood has a bounded warm lift");
});
