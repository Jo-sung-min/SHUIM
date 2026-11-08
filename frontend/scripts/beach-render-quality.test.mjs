import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { hotSpring } from "./beach-world-fixture.mjs";

const shaderSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/sky-shader.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=const\b)/g, "");
const shaders = {};
vm.runInNewContext(`${shaderSource}\nglobalThis.SKY_FRAGMENT = SKY_FRAGMENT;`, shaders);
const atlasSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/atlas.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=const\b)/g, "");
const atlas = {};
vm.runInNewContext(`${atlasSource}\nglobalThis.CHAR_ANIM = CHAR_ANIM;`, atlas);
const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/engine.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const document = { visibilityState: "visible" };
const context = { ...hotSpring, THREE, CHAR_ANIM: atlas.CHAR_ANIM, SKY_FRAGMENT: shaders.SKY_FRAGMENT, document, performance: { now: () => 10_000 },
  CAMPFIRE: { x: 0, z: 12 },
  window: { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 } };
vm.runInNewContext(`${source}\nglobalThis.api = { BeachEngine, beachRenderSettings };`, context);
const { BeachEngine, beachRenderSettings } = context.api;
const physicalPixels = size => Math.floor(size.width * size.pixelRatio) * Math.floor(size.height * size.pixelRatio);

function fixture() {
  const buffers = [], qualityChanges = [];
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    canvas: { clientWidth: 390, clientHeight: 844 }, mobile: true, quality: "high", skyRenderMode: false,
    camera: new THREE.PerspectiveCamera(), view: "first", skyRest: null,
    renderer: { setDrawingBufferSize: (width, height, pixelRatio) => buffers.push({ width, height, pixelRatio }), shadowMap: { enabled: true }, render() {} },
    handlers: { onQuality: value => qualityChanges.push(value) },
  });
  return { engine, buffers, qualityChanges };
}

test("normal mobile keeps its existing budget while the low tier no longer enlarges a 0.65x canvas", () => {
  const normal = beachRenderSettings(390, 844, 3, true, "high", false);
  assert.equal(normal.pixelRatio, 1.3);
  assert.equal(normal.width, 332); assert.equal(normal.height, 717);
  assert.ok(physicalPixels(normal) < 410_000);
  const low = beachRenderSettings(390, 844, 3, true, "low", false);
  assert.equal(low.pixelRatio, 1);
  assert.equal(low.width, normal.width); assert.equal(low.height, normal.height);
  assert.ok(low.width / 390 >= .85 && physicalPixels(low) < 240_000);
  const desktop = beachRenderSettings(1920, 1080, 3, false, "high", false);
  assert.equal(desktop.width, 1920); assert.equal(desktop.pixelRatio, 1.5);
});

test("mobile sky viewing gains detail without exceeding DPR2 or 1.5 million physical pixels", () => {
  for (const [width, height] of [[390, 844], [430, 932], [844, 390], [1024, 1366], [2732, 2048]]) {
    for (const quality of ["high", "low"]) {
      const size = beachRenderSettings(width, height, 3, true, quality, true);
      assert.equal(size.width, width); assert.equal(size.height, height);
      assert.ok(size.pixelRatio <= 2);
      assert.ok(physicalPixels(size) <= 1_500_000);
    }
  }
  assert.equal(beachRenderSettings(390, 844, 1, true, "high", true).pixelRatio, 1, "no artificial supersampling on a DPR1 device");
  assert.ok(physicalPixels(beachRenderSettings(390, 844, 3, true, "low", true)) > 5 * physicalPixels(beachRenderSettings(390, 844, 3, true, "low", false)));
});

test("sky-only transitions resize once and standing, third-person and bed views restore normal rendering", () => {
  const { engine, buffers } = fixture();
  engine.resize();
  const original = buffers[0];
  engine.skyRest = { spotId: "stargazing", slot: 0 };
  engine.syncSkyResolution();
  assert.equal(buffers.length, 2); assert.equal(buffers[1].pixelRatio, 2);
  for (let frame = 0; frame < 240; frame++) engine.syncSkyResolution();
  engine.resize();
  assert.equal(buffers.length, 2, "unchanged frames and duplicate resize notifications do not reallocate");
  engine.skyRest = null; engine.syncSkyResolution();
  assert.deepEqual(buffers.at(-1), original);
  engine.skyRest = { spotId: "onsen-float", slot: 1 }; engine.syncSkyResolution();
  assert.deepEqual(buffers.at(-1), original, "a floating visitor still sees the bath, so it keeps the normal budget");
  engine.skyRest = { spotId: "stargazing", slot: 0 }; engine.syncSkyResolution();
  assert.equal(buffers.at(-1).pixelRatio, 2);
  engine.view = "third"; engine.syncSkyResolution();
  assert.deepEqual(buffers.at(-1), original);
  engine.view = "first"; engine.skyRest = { spotId: "hut-wave", slot: 1 }; engine.syncSkyResolution();
  assert.deepEqual(buffers.at(-1), original, "a bed still renders furniture and does not enter the sky-only budget");
});

test("quality changes preserve the sky budget and apply the low world tier immediately on return", () => {
  const { engine, buffers, qualityChanges } = fixture();
  engine.skyRest = { spotId: "stargazing", slot: 0 };
  engine.resize(); engine.setQuality("low");
  assert.equal(buffers.length, 1, "the sky-only resolution is independent of world shadow quality");
  assert.equal(engine.renderer.shadowMap.enabled, false);
  assert.deepEqual(qualityChanges, ["low"]);
  engine.skyRest = null; engine.syncSkyResolution();
  assert.equal(buffers.at(-1).pixelRatio, 1); assert.equal(buffers.at(-1).width, 332);
  engine.setQuality("low");
  assert.equal(buffers.length, 2);
});

test("fireworks receive the current physical buffer height across sky and world resolutions", () => {
  const heights = [], { engine } = fixture();
  Object.assign(engine, {
    time: 1, skyMat: { uniforms: { uTime: {} } },
    seaMat: { uniforms: { uTime: {}, uCamPos: { value: new THREE.Vector3() } } },
    cove: { setFireFlare() {}, update() {} },
    fireworks: { update(camera, now, height) { assert.equal(camera, engine.camera); assert.equal(now, undefined); heights.push(height); } },
  });
  engine.renderer.domElement = { height: 1688 };
  engine.updateWorld(.016);
  engine.renderer.domElement.height = 717;
  engine.updateWorld(.016);
  assert.deepEqual(heights, [1688, 717], "particle sizes follow physical resolution rather than shrinking at DPR2");
});

test("beach field audio receives the avatar position and the last confirmed log count", () => {
  const { engine } = fixture();
  const heard = [], avatar = { x: 1, z: 12 };
  Object.assign(engine, {
    self: avatar, fireState: null, time: 0, lastRender: 10_000, lastDaylightAt: 10_000,
    clock: { update() {}, getDelta: () => 0.016 },
    updateSelf() {}, syncSkyResolution() {}, updatePlayers() {}, updateFx() {}, updateWorld() {},
    cove: { setFireState() {} },
    firePowder: { sync(state) { return { accepted: state.serverTime >= 1 }; } },
    fireworkAudio: { updateBeachSound(position, fire, logs) {
      assert.equal(position, avatar);
      assert.equal(fire, context.CAMPFIRE);
      heard.push(logs);
    } },
  });
  engine.frame();
  for (const [serverTime, logs] of [[1, 1], [2, 0], [0, 3]]) {
    engine.setFireState({ serverTime, logs, color: "amber" });
    engine.frame();
  }
  engine.mapId = "uyuni";
  engine.frame();
  assert.deepEqual(heard, [0, 1, 0, 0], "only an accepted beach snapshot can supply fuel to the crackle");
});

test("garden rain audio follows the avatar across both hall doors and the current weather, not the orbit camera", () => {
  const { engine } = fixture(), heard = [];
  Object.assign(engine, {
    mapId: "garden", self: { x: 0, z: -11 }, rainNow: 0, time: 0, lastRender: 10_000, lastDaylightAt: 10_000,
    clock: { update() {}, getDelta: () => .016 },
    updateSelf() {}, syncSkyResolution() {}, updatePlayers() {}, updateFx() {}, updateWorld() {},
    updateRain() { this.rainNow = .7; }, garden: { renderReflection() {} },
    fireworkAudio: { updateGardenSound(inside, rain, dt) { heard.push({ inside, rain, dt }); } },
  });
  for (const [x, z, expected] of [[0, -11, false], [-16, 76, false], [-14.8, 76, true], [0, 62, true], [14.8, 76, true], [16, 76, false], [0, 81, false]]) {
    engine.self.x = x; engine.self.z = z;
    engine.camera.position.set(expected ? 22 : 0, 3, 70);
    engine.rainNow = 0; engine.frame();
    assert.deepEqual(heard.at(-1), { inside: expected, rain: .7, dt: .016 }, `${x},${z} uses the freshly updated weather and avatar boundary`);
  }
});

test("walking and camera turns brighten stars, then settle independently in both night skies", () => {
  for (const map of ["bamboo", "uyuni"]) {
    const { engine } = fixture();
    const motion = { value: 0 };
    Object.assign(engine, { mapId: map, [map]: { update() {} }, self: { moving: false },
      skyMat: { uniforms: { uTime: {}, uStars: { value: 1 }, uStarMotion: motion } } });
    engine.updateWorld(1 / 60);
    assert.equal(motion.value, 0);
    engine.camera.rotateY(0.1);
    engine.updateWorld(1 / 60);
    assert.ok(motion.value > 0.1);
    engine.self.moving = true;
    for (let i = 0; i < 30; i++) engine.updateWorld(1 / 30);
    assert.ok(motion.value > 0.7);
    engine.self.moving = false;
    for (let i = 0; i < 60; i++) engine.updateWorld(1 / 30);
    assert.ok(motion.value < 0.001);
  }
});

test("asset warmup, hidden tabs and long interruptions cannot permanently downgrade the scene", () => {
  for (const scenario of ["warmup", "hidden", "interrupted", "visible-slow"]) {
    const { engine, qualityChanges } = fixture();
    Object.assign(engine, { qualityWarmupUntil: scenario === "warmup" ? 12_000 : 0,
      frameAvg: 40, slowSince: 1, lastRender: scenario === "interrupted" ? 9_000 : 9_960,
      lastDaylightAt: 10_000, time: 0, clock: { update() {}, getDelta: () => .04 },
      updateSelf() {}, updatePlayers() {}, updateFx() {}, updateWorld() {}, syncSkyResolution() {},
    });
    document.visibilityState = scenario === "hidden" ? "hidden" : "visible";
    engine.frame();
    assert.deepEqual(qualityChanges, scenario === "visible-slow" ? ["low"] : [], scenario);
    if (scenario !== "visible-slow") assert.equal(engine.slowSince, 0);
  }
  document.visibilityState = "visible";
});

test("the detailed sky still renders one inexpensive background mesh without lights, shadows or new assets", () => {
  const requested = [];
  const engine = Object.assign(Object.create(BeachEngine.prototype), {
    mapId: "beach", uyuni: null,
    scene: new THREE.Scene(), loadEnvironmentTexture: path => { requested.push(path); return new THREE.Texture(); },
  });
  engine.buildSky();
  assert.deepEqual(requested, ["/beach/real/paradise-panorama-v1.webp"]);
  assert.equal(engine.scene.children.length, 1);
  assert.ok(engine.sky.layers.isEnabled(1));
  assert.equal(engine.sky.geometry.index.count / 3, 1, "one background triangle has no internal seams");
  const positions = engine.sky.geometry.getAttribute("position");
  const triangle = new THREE.Triangle(...[0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(positions, i)));
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    assert.ok(triangle.containsPoint(new THREE.Vector3(x, y, 0)), "the background covers every viewport corner");
  }
  assert.equal(engine.skyMat.side, THREE.FrontSide);
  assert.equal(engine.sky.frustumCulled, false, "screen-space geometry remains visible at every camera angle");
  assert.equal(engine.sky.castShadow, false); assert.equal(engine.sky.receiveShadow, false);
  assert.equal(engine.skyMat.depthWrite, false); assert.equal(engine.skyMat.depthTest, false);
  assert.equal(engine.skyMat.fog, false);
  engine.sky.geometry.dispose(); engine.skyMat.dispose(); engine.photo.dispose();
});
