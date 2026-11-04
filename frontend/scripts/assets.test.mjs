import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { assetsFor } from "./assets-fixture.mjs";

const CDN = "https://cdn.sorow.co.kr";
test("public media uses the configured CDN with the same path, while an unset or invalid base stays local", () => {
  const paths = ["/splash.webp", "/sorow-logo.png", "/beach/chars-v2.png", "/feed/moon-wave.svg", "/beach/models/tripo-female-onsen-mobile-v1.glb"];
  for (const path of paths) {
    assert.equal(assetsFor().assetUrl(path), path);
    assert.equal(assetsFor(` ${CDN}/// `).assetUrl(path), `${CDN}${path}`);
    assert.equal(assetsFor(`${CDN}/static/`).assetUrl(path), `${CDN}/static${path}`);
  }
  for (const base of ["", "invalid", "javascript:alert(1)", "https://user:secret@cdn.sorow.co.kr", `${CDN}?key=value`, `${CDN}#fragment`]) {
    assert.equal(assetsFor(base).assetUrl(paths[0]), paths[0]);
  }
  assert.equal(assetsFor(CDN).assetUrl("/beach/real/soft sand.webp?v=2#detail"), `${CDN}/beach/real/soft%20sand.webp?v=2#detail`);
});

test("CDN mapping leaves API, private uploads, external images and native app icons untouched", () => {
  const { assetUrl } = assetsFor(CDN);
  for (const path of [
    "/api/site/favicon?v=7", "/api/private/photo.png", "/uploads/member/photo.jpg", "/beach/../api/photo.jpg",
    "/beach/%2e%2e/api/photo.jpg", "/beach", "/beach/models/source.json", "/manifest.webmanifest",
    "/icon-192.png", "/icon-512-maskable.png", "/apple-icon.png", "//private.example/photo.jpg",
    "https://uploads.example/photo.jpg?signature=abc", `${CDN}/beach/chars-v2.png`, "blob:local-photo", "data:image/png;base64,AA==",
  ]) assert.equal(assetUrl(path), path);
});

test("shared CSS images and anonymous loader credentials follow the same configuration", () => {
  const api = assetsFor(CDN), loader = { crossOrigin: "use-credentials", withCredentials: true };
  assert.equal(api.assetLoader(loader), loader);
  assert.deepEqual(loader, { crossOrigin: "anonymous", withCredentials: false });
  assert.equal(api.publicAssetStyles["--sorow-logo-image"], `url("${CDN}/sorow-logo.png")`);
  assert.equal(api.publicAssetStyles["--beach-character-atlas"], `url("${CDN}/beach/chars-v2.png")`);
  assert.equal(api.publicAssetStyles["--beach-landscape-image"], `url("${CDN}/beach/real/paradise-panorama-v1.webp")`);
});

test("actual Three.js loading entry points request CDN textures and models with capture-safe CORS", async () => {
  const requests = [];
  class TextureLoader {
    load(url, onLoad) {
      assert.equal(this.crossOrigin, "anonymous"); assert.equal(this.withCredentials, false);
      const texture = new THREE.Texture(); requests.push(url); queueMicrotask(() => onLoad?.(texture)); return texture;
    }
    loadAsync(url) { return new Promise(resolve => this.load(url, resolve)); }
  }
  class GLTFLoader {
    setMeshoptDecoder() { return this; }
    loadAsync(url) {
      assert.equal(this.crossOrigin, "anonymous"); assert.equal(this.withCredentials, false);
      requests.push(url); return Promise.reject(new Error("A failed CDN request preserves the existing fallback"));
    }
  }
  async function load(file, names, dependencies = {}) {
    const source = stripTypeScriptTypes(await readFile(new URL(`../lib/beach/${file}.ts`, import.meta.url), "utf8"))
      .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|class\b|const\b)/g, "");
    const context = { THREE: { ...THREE, TextureLoader }, GLTFLoader, MeshoptDecoder: {}, ...assetsFor(CDN), document: {}, ...dependencies };
    vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context); return context.api;
  }
  const cove = await load("cove", ["surfaceTexture"]); cove.surfaceTexture("rock", true);
  const shelters = await load("shelters", ["shelterTexture"]); shelters.shelterTexture("wood", true); shelters.shelterTexture("fabric-normal");
  const benches = await load("fire-benches", ["woodTexture"]); benches.woodTexture("wood-normal");
  const wood = await load("firewood", ["buildFirewood"]);
  const scene = new THREE.Scene(); wood.buildFirewood(scene, 0, 0);
  const { SkyLanterns } = await load("lanterns", ["SkyLanterns"]); const lanterns = new SkyLanterns(scene, 1);
  const { BeachFireworks } = await load("fireworks", ["BeachFireworks"]);
  const fireworks = new BeachFireworks(scene, { mobile: true });
  const now = Date.now(); fireworks.apply([{ id: "cdn-test", seed: 1, startedAt: now, durationMs: 12_000 }], now);
  const { BeachAvatarModels } = await load("rigged-avatar", ["BeachAvatarModels"]);
  for (const kind of ["male", "female", "male-onsen", "female-onsen"]) { const models = new BeachAvatarModels(kind); await models.load(); assert.equal(models.create(), null); models.dispose(); }
  const { TripoCampfireModel } = await load("campfire-model", ["TripoCampfireModel"]);
  const campfire = new TripoCampfireModel(scene, 0, 0, []); await campfire.ready;
  const atlas = await load("atlas", ["CHAR_ANIM", "CHAR_ATLAS", "CHAR_VIEW"]);
  const { BeachEngine } = await load("engine", ["BeachEngine"], { ...atlas, CAMPFIRE: { x: 0, z: 12 } });
  const engine = Object.assign(Object.create(BeachEngine.prototype), { assetLoads: [], renderer: { capabilities: { getMaxAnisotropy: () => 4 } } });
  engine.loadEnvironmentTexture("/beach/real/white-sand-v1.webp"); await Promise.all(engine.assetLoads);
  // Mark disposed to exercise requests and their late-load cleanup without constructing actors.
  engine.disposed = true; await engine.loadAtlases();
  const expected = [
    "/beach/real/rock.jpg", "/beach/real/shelter-wood-v2.webp", "/beach/real/fabric-normal-v2.webp",
    "/beach/real/wood-normal.jpg", "/beach/real/wood.jpg", "/beach/real/sky-lantern-v2.png", "/beach/fx/firework-spark-v1.webp",
    "/beach/models/tripo-male-rigged-mobile-v3.glb", "/beach/models/tripo-female-rigged-mobile-v2.glb",
    "/beach/models/tripo-male-onsen-mobile-v1.glb", "/beach/models/tripo-female-onsen-mobile-v1.glb",
    "/beach/models/tripo-firewood-mobile-v2.glb", "/beach/real/white-sand-v1.webp", "/beach/chars-v2.png", "/beach/props.png",
  ];
  assert.deepEqual(new Set(requests), new Set(expected.map(path => CDN + path)));
  lanterns.dispose(); fireworks.dispose(); campfire.dispose();
});
