import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|class\b|const\b)/g, "");
  const context = { ...dependencies }; vm.runInNewContext(`${source}\nglobalThis.api = {${names.join(",")}};`, context); return context.api;
}
const layout = await load("../lib/beach/garden-layout.ts", hotSpring, ["GARDEN_PAVILIONS", "GARDEN_SEATS", "GROUND_Y", "WATER_Y", "HALL", "HALL_TIERS", "gardenFloorHeight", "isWater", "lakeSigned"]);
// The rain programs are independent of sky; unrelated shader interpolation has no bearing on them.
const shaders = await load("../lib/beach/garden-shader.ts", { UYUNI_SKY_FUNCTIONS: "", UYUNI_SKY_UNIFORMS: "" }, ["GARDEN_RAIN_VERT", "GARDEN_RAIN_FRAG"]);
const { GardenRain, GARDEN_RAIN_AREA, gardenRainSurface } = await load("../lib/beach/garden-rain.ts", { THREE, ...hotSpring, ...layout, ...shaders }, ["GardenRain", "GARDEN_RAIN_AREA", "gardenRainSurface"]);

function build() { const scene = new THREE.Scene(), time = { value: 1 }, rain = new GardenRain(scene, time); return { scene, time, rain }; }

test("rain billboards render from either side and remain one bounded draw on mobile", () => {
  const { scene, rain } = build();
  assert.equal(scene.children.length, 1);
  assert.equal(rain.mesh.material.side, THREE.DoubleSide, "reversed camera-facing winding must never hide all rain again");
  assert.equal(rain.mesh.material.depthWrite, false); assert.equal(rain.mesh.material.depthTest, true);
  assert.equal(rain.mesh.castShadow, false); assert.equal(rain.mesh.frustumCulled, false);
  assert.equal(rain.mesh.geometry.instanceCount, 1200);
  const attribute = rain.mesh.geometry.getAttribute("aDrop"), original = Array.from(attribute.array);
  rain.setQuality(true); assert.equal(rain.mesh.geometry.instanceCount, 500);
  rain.setQuality(false); assert.equal(rain.mesh.geometry.instanceCount, 1200);
  assert.deepEqual(Array.from(attribute.array), original, "quality changes retain the same deterministic rain field");
  rain.dispose();
});

test("both near and far sheets cover paths, benches and lake views without per-frame allocations", () => {
  const { rain, time } = build(), uniforms = rain.mesh.material.uniforms;
  assert.equal(uniforms.uTime, time, "the existing world clock drives the rain directly");
  assert.ok(uniforms.uNearSpan.value >= 24 && uniforms.uFarSpan.value >= 70);
  const drops = rain.mesh.geometry.getAttribute("aDrop");
  for (const count of [500, 1200]) {
    let far = 0, near = 0;
    for (let index = 0; index < count; index++) {
      assert.ok(drops.getX(index) >= 0 && drops.getX(index) < 1);
      assert.ok(drops.getY(index) >= 0 && drops.getY(index) < 1);
      assert.ok(drops.getZ(index) >= 0 && drops.getZ(index) < 1);
      if (drops.getW(index) === 1) far++; else near++;
    }
    assert.equal(far, count / 5); assert.equal(near, count * .8);
  }
  const texture = uniforms.uRainSurface.value;
  assert.equal(texture.image.data.byteLength, 256 * 256 * 4);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.generateMipmaps, false);
  rain.dispose();
});

test("rain terminates on outdoor paths and structures while lake drops reach the water surface", () => {
  const { rain } = build(), texture = rain.mesh.material.uniforms.uRainSurface.value;
  const decoded = (x, z) => {
    const area = GARDEN_RAIN_AREA;
    const ix = Math.floor((x - area.minX) / area.width * area.size), iz = Math.floor((z - area.minZ) / area.depth * area.size), offset = (iz * area.size + ix) * 4;
    const data = texture.image.data;
    return { y: (data[offset] * 256 + data[offset + 1]) / 65535 * 4, water: data[offset + 2] === 255 };
  };
  for (const [x, z] of [[0, -11], [-40.5, 34], [-33, 55], [33, 55], [24, 6], [0, 87]]) {
    const actual = decoded(x, z);
    assert.ok(Math.abs(actual.y - layout.GROUND_Y) < .001, `land at ${x}, ${z} stops the rain at ground height`);
    assert.equal(actual.water, false);
  }
  for (const [x, z] of [[0, 34], [14, 34], [-8, 24], [0, 50]]) {
    const surface = gardenRainSurface(x, z), actual = decoded(x, z);
    assert.equal(surface.water, true); assert.equal(surface.y, layout.WATER_Y);
    assert.equal(actual.water, true); assert.equal(actual.y, layout.WATER_Y, "rain never stops on the boat's virtual walking plane");
  }
  assert.ok(gardenRainSurface(21.5, 8.5).y >= layout.GROUND_Y, "raised pier surface blocks falling drops");
  rain.dispose();
});

test("exact roof footprints cover every indoor seat but leave outdoor benches in the rain", () => {
  const { rain } = build(), uniforms = rain.mesh.material.uniforms;
  const hall = uniforms.uRainHall.value, pavilion = uniforms.uRainPavilion.value;
  const inHall = seat => Math.abs(seat.x - hall.x) <= hall.z && Math.abs(seat.z - hall.y) <= hall.w;
  const inPavilion = seat => Math.max(Math.abs(seat.x - pavilion.x), Math.abs(seat.z - pavilion.y)) <= pavilion.z;
  for (const seat of layout.GARDEN_SEATS) {
    if (seat.spotId.startsWith("hall-tier-")) {
      assert.ok(inHall(seat)); assert.ok(uniforms.uRainHallRoof.value.x > seat.avatarY + 2);
    } else if (seat.spotId.startsWith("pavilion-")) {
      assert.ok(inPavilion(seat)); assert.ok(pavilion.w > seat.avatarY + 2);
    } else {
      assert.equal(inHall(seat) || inPavilion(seat), false, "pond benches remain under the open sky");
    }
  }
  assert.ok(hall.z > layout.HALL.halfX, "hall eaves extend the dry footprint beyond the wall");
  rain.dispose();
});

test("dry or invalid rain amounts hide the field and all owned resources release exactly once", () => {
  const { scene, rain } = build();
  for (const value of [0, -1, NaN, Infinity]) { rain.setAmount(value); assert.equal(rain.mesh.visible, false); assert.equal(rain.rain, 0); }
  rain.setAmount(4); assert.equal(rain.rain, 1); assert.equal(rain.mesh.visible, true);
  rain.setAmount(.5); assert.equal(rain.mesh.material.uniforms.uRain.value, .5);
  const resources = [rain.mesh.geometry, rain.mesh.material, rain.mesh.material.uniforms.uRainSurface.value];
  const counts = new Map(resources.map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource) + 1));
  rain.dispose(); rain.dispose(); rain.setAmount(1); rain.setQuality(true);
  assert.equal(scene.children.length, 0);
  assert.ok([...counts.values()].every(count => count === 1));
});
