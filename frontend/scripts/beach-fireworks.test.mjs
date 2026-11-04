import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/fireworks.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=function\b|class\b|const\b)/g, "");
const event = (id = "one", startedAt = 100_000, seed = 1785) => ({ id, seed, startedAt, durationMs: 12_000 });

function fixture({ mobile = false, dom = true, height = 844 } = {}) {
  let time = 100_000;
  const requests = [];
  class TextureLoader {
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      requests.push({ url, texture, onLoad, onError });
      return texture;
    }
  }
  const context = { THREE: { ...THREE, TextureLoader }, Date: { now: () => time }, ...assets };
  if (dom) { context.document = {}; context.window = { innerHeight: height }; }
  vm.runInNewContext(`${source}\nglobalThis.api = { BeachFireworks, fireworkGeometry, FIREWORK_SPARK_URL };`, context);
  const scene = new THREE.Scene(), fireworks = new context.api.BeachFireworks(scene, { mobile });
  return { ...context.api, scene, fireworks, requests, setTime(value) { time = value; },
    load(index = 0) { requests[index].onLoad(requests[index].texture); } };
}

test("seeded trajectories are deterministic and mobile uses fewer finite particles at the same burst centers", () => {
  const { fireworkGeometry } = fixture({ dom: false });
  const geometry = fireworkGeometry(1785), copy = fireworkGeometry(1785), different = fireworkGeometry(1786);
  const mobile = fireworkGeometry(1785, true), zero = fireworkGeometry(0, true), max = fireworkGeometry(2_147_483_646, true);
  for (const name of Object.keys(geometry.attributes)) assert.deepEqual(geometry.attributes[name].array, copy.attributes[name].array, name);
  assert.notDeepEqual(geometry.getAttribute("velocity").array, different.getAttribute("velocity").array);
  assert.ok(mobile.getAttribute("position").count < geometry.getAttribute("position").count * 0.6);
  assert.ok(mobile.getAttribute("position").count < 1600 && geometry.getAttribute("position").count < 3600);
  const centers = mesh => {
    const p = mesh.getAttribute("position"), values = new Set();
    for (let index = 0; index < p.count; index++) values.add([p.getX(index), p.getY(index), p.getZ(index)].join(","));
    return [...values].sort();
  };
  assert.deepEqual(centers(mobile), centers(geometry));
  for (const candidate of [geometry, mobile, zero, max]) {
    const count = candidate.getAttribute("position").count;
    for (const attribute of Object.values(candidate.attributes)) {
      assert.equal(attribute.count, count);
      assert.ok(attribute.array.every(Number.isFinite), "no invalid seed-derived vertex or color reaches the shader");
    }
    const p = candidate.getAttribute("position"), timing = candidate.getAttribute("timing"), details = candidate.getAttribute("detail");
    let overSea = 0, overhead = 0;
    for (let index = 0; index < count; index++) {
      assert.ok(p.getY(index) >= 40, "explosions stay far above visitors");
      if (p.getZ(index) < -40) overSea++; else if (p.getY(index) > 60) overhead++;
      assert.ok(timing.getX(index) + timing.getY(index) + timing.getZ(index) <= 12, "all tails expire inside the authoritative show duration");
      assert.ok(details.getX(index) > 0 && details.getZ(index) >= 0 && details.getZ(index) <= 1);
    }
    assert.ok(overSea > count / 2 && overhead > 0, "ocean bursts and an overhead finale serve both standing and lying viewers");
  }
  for (const candidate of [geometry, copy, different, mobile, zero, max]) candidate.dispose();
});

test("late joiners start at the shared age and duplicate or delayed snapshots never rewind an existing show", () => {
  const { fireworks, scene, setTime } = fixture();
  fireworks.apply([event("show", 195_000)], 200_000);
  fireworks.update();
  const points = scene.children[0];
  assert.equal(points.material.uniforms.uAge.value, 5, "the initial server-local clock offset is respected");
  setTime(101_000); fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 6);
  fireworks.apply([event("show", 195_000)], 200_000);
  fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 6, "an equal server timestamp cannot reset the clock offset");
  setTime(102_000);
  fireworks.apply([event("show", 195_000)], 200_500);
  fireworks.update();
  assert.equal(points.material.uniforms.uAge.value, 7, "even a newer but delayed snapshot cannot turn the current animation backward");
  fireworks.apply([event("old-response", 195_000)], 199_000);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0], points, "duplicates retain one existing geometry and material");
  setTime(107_000); fireworks.update();
  assert.equal(scene.children.length, 0, "the shared show expires at its absolute end, not twelve seconds after joining");
  fireworks.apply([event("show", 195_000)], 207_000);
  assert.equal(scene.children.length, 0, "the completed event cannot replay");
  fireworks.dispose();
});

test("expired, future and malformed events never create a show or download its image", () => {
  const { fireworks, scene, requests } = fixture();
  for (const invalid of [null, event("expired", 88_000), event("future", 100_001), { ...event(), id: "" },
    { ...event(), id: 42 }, { ...event(), seed: -1 }, { ...event(), seed: Number.NaN },
    { ...event(), seed: 1.5 }, { ...event(), seed: Number.MAX_SAFE_INTEGER + 1 },
    { ...event(), startedAt: Number.POSITIVE_INFINITY }, { ...event(), durationMs: 120_000 }]) {
    fireworks.apply([invalid], 100_000);
  }
  fireworks.apply([event()], Number.NaN);
  fireworks.apply([event()], Number.POSITIVE_INFINITY);
  assert.equal(scene.children.length, 0); assert.equal(requests.length, 0);
  fireworks.apply([event("zero-seed", 100_000, 0)], 100_000);
  assert.equal(scene.children.length, 1, "a supported integer zero seed remains deterministic");
  fireworks.dispose();
});

test("active point draws stay bounded across repeated batches and expired shows free the next allocation", () => {
  const { fireworks, scene, setTime } = fixture({ mobile: true });
  fireworks.apply([event("one"), event("two"), event("ignored-third")], 100_000);
  assert.equal(scene.children.length, 2);
  const resources = scene.children.flatMap(object => [object.geometry, object.material]);
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  fireworks.apply([event("three"), event("four")], 100_001);
  assert.equal(scene.children.length, 2, "successive two-event responses cannot create unbounded simultaneous shows");
  for (const object of scene.children) {
    assert.equal(object.isPoints, true);
    assert.equal(object.castShadow, false); assert.equal(object.receiveShadow, false);
    assert.equal(object.layers.isEnabled(1), true, "sky-view cameras retain the show");
    assert.equal(object.frustumCulled, false, "shader-expanded trajectories are not clipped by undeformed positions");
    assert.equal(object.material.depthWrite, false); assert.equal(object.material.depthTest, true);
    assert.equal(object.material.blending, THREE.AdditiveBlending);
  }
  assert.equal(scene.children.some(object => object.isLight), false);
  setTime(112_010); fireworks.apply([event("next", 112_010)], 112_010);
  assert.equal(scene.children.length, 1);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  for (let index = 0; index < 80; index++) {
    const now = 130_000 + index * 15_000;
    setTime(now); fireworks.apply([event(`bounded-${index}`, now)], now);
    assert.ok(scene.children.length <= 2);
  }
  assert.ok(fireworks.seen.size <= 64, "finished-show identities use a bounded retry history");
  fireworks.dispose();
});

test("the optional alpha image loads once, while shader glow remains usable during loading or failure", () => {
  const { fireworks, scene, requests, load, FIREWORK_SPARK_URL } = fixture({ height: 2200 });
  fireworks.apply([event("one"), event("two")], 100_000); fireworks.update();
  assert.equal(requests.length, 1); assert.equal(requests[0].url, FIREWORK_SPARK_URL);
  for (const object of scene.children) {
    assert.equal(object.material.uniforms.uImage.value, 0);
    assert.equal(object.material.uniforms.uViewport.value, 1400, "point sizes have a bounded viewport multiplier");
  }
  load(); fireworks.update();
  assert.equal(requests[0].texture.colorSpace, THREE.SRGBColorSpace);
  for (const object of scene.children) {
    assert.equal(object.material.uniforms.uImage.value, 1);
    assert.equal(object.material.uniforms.uSpark.value, requests[0].texture);
  }
  fireworks.dispose();
  const failed = fixture();
  failed.fireworks.apply([event()], 100_000);
  failed.requests[0].onError(new Error("image unavailable")); failed.fireworks.update();
  assert.equal(failed.scene.children.length, 1);
  assert.equal(failed.scene.children[0].material.uniforms.uImage.value, 0);
  failed.fireworks.dispose();
});

test("disposing releases every owned GPU resource once and a late texture cannot revive the effect", () => {
  const ready = fixture();
  ready.fireworks.apply([event("one"), event("two")], 100_000); ready.load(); ready.fireworks.update();
  const resources = [...ready.scene.children.flatMap(object => [object.geometry, object.material]), ready.requests[0].texture];
  const disposed = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  ready.fireworks.dispose(); ready.fireworks.dispose(); ready.fireworks.update();
  ready.fireworks.apply([event("post-close")], 100_001);
  assert.equal(ready.scene.children.length, 0);
  for (const resource of resources) assert.equal(disposed.get(resource), 1);
  const delayed = fixture();
  delayed.fireworks.apply([event()], 100_000);
  let textureDisposals = 0;
  delayed.requests[0].texture.addEventListener("dispose", () => textureDisposals++);
  delayed.fireworks.dispose(); delayed.load(); delayed.fireworks.update();
  assert.equal(textureDisposals, 1); assert.equal(delayed.scene.children.length, 0);
});

test("the actual spark asset is a compact 256-pixel WebP with real transparency", async () => {
  const bytes = await readFile(new URL("../public/beach/fx/firework-spark-v1.webp", import.meta.url));
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8X");
  assert.ok(bytes[20] & 0x10, "the WebP alpha feature bit is enabled");
  assert.equal(bytes.readUIntLE(24, 3) + 1, 256); assert.equal(bytes.readUIntLE(27, 3) + 1, 256);
  assert.ok(bytes.length < 32 * 1024, `mobile spark download is ${bytes.length} bytes`);
});
