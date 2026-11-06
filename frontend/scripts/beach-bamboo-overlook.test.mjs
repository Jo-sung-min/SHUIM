import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed, { mode: "transform" })
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api={${names.join(",")}};`, context);
  return context.api;
}
const trail = await load("../lib/beach/bamboo-trail.ts", {}, ["BAMBOO_PAVILIONS"]);
const { bambooDaylightAt, bambooSunsetAmount } = await load("../lib/beach/daylight.ts", {}, ["bambooDaylightAt", "bambooSunsetAmount"]);
async function fixture(hour) {
  const requests = [], now = { value: 1000 };
  class TextureLoader {
    load(url, complete, progress, fail) {
      const texture = new THREE.Texture(), entry = { url, texture, complete: () => complete(texture), fail, disposals: 0 };
      texture.addEventListener("dispose", () => entry.disposals++); requests.push(entry); return texture;
    }
  }
  const { buildBambooOverlook } = await load("../lib/beach/bamboo-overlook.ts", {
    THREE: { ...THREE, TextureLoader }, ...trail, bambooSunsetAmount, Date: { now: () => now.value },
    assetUrl: path => "https://cdn.sorow.co.kr" + path, assetLoader: loader => loader,
  }, ["buildBambooOverlook"]);
  const parent = new THREE.Group(), overlook = buildBambooOverlook(parent, { value: 0 });
  const city = parent.getObjectByName("bamboo-city"), uniforms = city.material.uniforms;
  const setHour = value => overlook.applyDaylight(bambooDaylightAt(value));
  setHour(hour);
  return { parent, overlook, city, uniforms, requests, now, setHour };
}

test("a night visit keeps the original panorama and never downloads a morning texture", async () => {
  const h = await fixture(22);
  assert.equal(h.requests.length, 1); assert.ok(h.requests[0].url.endsWith("bamboo-summit-seoul-v4.webp"));
  assert.equal(h.uniforms.uNight.value, 1); assert.equal(h.uniforms.uMorningReady.value, 0);
  h.requests[0].complete(); assert.ok(h.city.visible);
  h.setHour(20); h.setHour(1); assert.equal(h.requests.length, 1);
  assert.equal(h.uniforms.uRiver.value, h.requests[0].texture);
  h.overlook.dispose(); h.overlook.dispose(); assert.equal(h.requests[0].disposals, 1);
});

test("morning and dusk use the matching image while the existing night texture remains the silhouette source", async () => {
  const h = await fixture(9);
  assert.equal(h.requests.length, 2); assert.ok(h.requests[1].url.endsWith("bamboo-summit-seoul-morning-v1.webp"));
  assert.equal(h.uniforms.uMorningReady.value, 0, "in-flight data is never sampled");
  h.requests[0].complete(); h.requests[1].complete();
  assert.equal(h.requests[0].texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(h.requests[1].texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(h.city.material.toneMapped, false, "the panorama keeps its photograph colors");
  assert.equal(h.uniforms.uMorningReady.value, 1); assert.equal(h.uniforms.uMorning.value, h.requests[1].texture);
  assert.equal(h.uniforms.uRiver.value, h.requests[0].texture, "shared UV and original alpha stay unchanged");
  assert.equal(h.uniforms.uNight.value, 0, "daytime city lights and twinkling are disabled");
  h.setHour(18); assert.ok(h.uniforms.uNight.value > 0 && h.uniforms.uNight.value < .92);
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].disposals, 0);
  h.setHour(20); assert.equal(h.requests[1].disposals, 1); assert.equal(h.uniforms.uMorningReady.value, 0);
  assert.equal(h.uniforms.uMorning.value, h.requests[0].texture, "night drops the extra GPU panorama");
  h.setHour(8); assert.equal(h.requests.length, 3);
  h.requests[2].complete(); assert.equal(h.uniforms.uMorningReady.value, 1);
  h.overlook.dispose(); assert.ok(h.requests.every(request => request.disposals === 1));
});

test("dusk perspective fades in without changing the shared geometry, silhouette or day/night endpoints", async () => {
  const h = await fixture(12), geometry = h.city.geometry;
  h.requests[0].complete(); h.requests[1].complete();
  const vertices = geometry.getAttribute("position").array.slice(), alphaSource = h.uniforms.uRiver.value;
  for (const hour of [0, 6, 12, 17.5, 20, 22, 24]) { h.setHour(hour); assert.equal(h.uniforms.uDusk.value, 0); }
  h.setHour(17.75); assert.equal(h.uniforms.uDusk.value, .5);
  h.setHour(18); assert.equal(h.uniforms.uDusk.value, 1);
  h.setHour(19.5); assert.equal(h.uniforms.uDusk.value, .5);
  assert.equal(h.city.geometry, geometry); assert.deepEqual(geometry.getAttribute("position").array, vertices);
  assert.equal(h.uniforms.uRiver.value, alphaSource, "dusk cannot replace the original tower/sky silhouette");
  assert.ok(h.city.material.fragmentShader.includes("valley = mix(valley, duskRidge, uDusk)"));
  h.overlook.dispose();
});

test("a failed morning download retains the visible city and retries after its cooldown", async () => {
  const h = await fixture(9); h.requests[0].complete(); h.requests[1].fail(new Error("temporary failure"));
  assert.ok(h.city.visible); assert.equal(h.uniforms.uMorningReady.value, 0); assert.equal(h.requests[1].disposals, 1);
  h.setHour(9); assert.equal(h.requests.length, 2);
  h.now.value += 15001; h.setHour(9); assert.equal(h.requests.length, 3);
  h.requests[2].complete(); assert.equal(h.uniforms.uMorningReady.value, 1);
  h.overlook.dispose(); assert.ok(h.requests.every(request => request.disposals === 1));
});

test("a late morning response cannot resurrect an old request after nightfall or disposal", async () => {
  const h = await fixture(9), old = h.requests[1];
  h.setHour(22); assert.equal(old.disposals, 1); h.setHour(9);
  const current = h.requests[2]; current.complete(); old.complete();
  assert.equal(h.uniforms.uMorning.value, current.texture); assert.equal(old.disposals, 1);
  h.setHour(22); h.setHour(9); const pending = h.requests[3];
  h.overlook.dispose(); pending.complete(); h.requests[0].complete(); h.setHour(9);
  assert.equal(h.parent.children.length, 0); assert.equal(h.requests.length, 4);
  assert.ok(h.requests.every(request => request.disposals === 1));
});
