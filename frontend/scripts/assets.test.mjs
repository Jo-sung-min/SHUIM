import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { assetsFor } from "./assets-fixture.mjs";

const CDN = "https://cdn.sorow.co.kr";
test("the spring water recording is served by the app, not the CDN", () => {
  assert.equal(assetsFor().assetUrl("/audio/onsen-water-v1.mp3"), "/audio/onsen-water-v1.mp3");
});

const MAP_TEXTURES = [
  "/garden/art/spring-hills-panorama-v1.webp", "/garden/art/willow-canopy-v1.webp",
  "/garden/art/grass-natural-v1.webp", "/garden/art/grass-natural-mobile-v1.webp",
  "/cloudspa/art/cloud-bank-v1.webp", "/cloudspa/art/cloud-bank-mobile-v1.webp",
  "/cloudspa/art/cloud-surface-v1.webp", "/cloudspa/art/cloud-surface-mobile-v1.webp",
  ...["nw", "ne", "sw", "se"].map(direction => `/cloudspa/art/city-${direction}-v2.webp`),
];
test("public media defaults to the verified CDN and supports an optional replacement origin", () => {
  const paths = ["/splash.webp", "/sorow-logo.png", "/beach/chars-v2.png", "/feed/moon-wave.svg", "/beach/models/tripo-female-onsen-mobile-v2.glb", "/beach/fx/firework-boom-v1.mp3", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/apple-icon.png", "/garden/art/spring-hills-panorama-v1.webp", "/garden/art/willow-canopy-v1.webp"];
  for (const path of paths) {
    assert.equal(assetsFor().assetUrl(path), `${CDN}${path}`);
    assert.equal(assetsFor(` ${CDN}/// `).assetUrl(path), `${CDN}${path}`);
    assert.equal(assetsFor(`${CDN}/static/`).assetUrl(path), `${CDN}/static${path}`);
    assert.equal(assetsFor("https://media.example.com/").assetUrl(path), `https://media.example.com${path}`);
  }
  for (const base of ["", "invalid", "javascript:alert(1)", "https://user:secret@cdn.sorow.co.kr", `${CDN}?key=value`, `${CDN}#fragment`]) {
    assert.equal(assetsFor(base).assetUrl(paths[0]), `${CDN}${paths[0]}`);
  }
  assert.equal(assetsFor(CDN).assetUrl("/beach/real/soft sand.webp?v=2#detail"), `${CDN}/beach/real/soft%20sand.webp?v=2#detail`);
});

test("garden and cloud spa art use the CDN for desktop, mobile and map cards", () => {
  for (const base of [CDN, "https://media.example.com/static"]) {
    const { assetUrl, assetCssUrl } = assetsFor(base);
    for (const path of [...MAP_TEXTURES, "/cloudspa/art/city-nw-card-v2.webp"]) {
      assert.equal(assetUrl(path), `${base}${path}`);
      assert.equal(assetCssUrl(path), `url("${base}${path}")`);
    }
    assert.equal(assetUrl("/cloudspa/art/city-nw-v2.webp?v=2#detail"), `${base}/cloudspa/art/city-nw-v2.webp?v=2#detail`);
  }
});

test("CDN mapping leaves API, private uploads, external images and app navigation untouched", () => {
  const { assetUrl } = assetsFor(CDN);
  for (const path of [
    "/api/site/favicon?v=7", "/api/private/photo.png", "/uploads/member/photo.jpg", "/beach/../api/photo.jpg",
    "/beach/%2e%2e/api/photo.jpg", "/beach", "/beach/models/source.json", "/manifest.webmanifest",
    "/offline.html", "/sw.js", "//private.example/photo.jpg",
    "/garden?communityId=jc-exam", "/cloudspa?communityId=jc-exam", "/uyuni?communityId=jc-exam",
    "/garden/private/photo.webp", "/cloudspa/uploads/photo.webp", "/cloudspa/art/manifest.json",
    "/garden/art/../../api/photo.jpg", "/cloudspa/art/%2e%2e/%2e%2e/uploads/photo.jpg",
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

test("installation icons and the default favicon need no public image files, while custom site images retain their API", async () => {
  const siteSource = stripTypeScriptTypes(await readFile(new URL("../lib/site.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
  const siteContext = { ...assetsFor(), process: { env: {} } };
  vm.runInNewContext(`${siteSource}\nglobalThis.api = { SITE, EMPTY_SITE, faviconHref, ogHref, siteDescription, siteTitle };`, siteContext);
  const site = siteContext.api;
  assert.equal(site.faviconHref(site.EMPTY_SITE), `${CDN}/favicon.svg`);
  assert.equal(site.faviconHref({ ...site.EMPTY_SITE, faviconAt: 123 }), "/api/site/favicon?v=123");
  assert.equal(site.ogHref(site.EMPTY_SITE), "/og", "the default share image is drawn by its route");
  assert.equal(site.ogHref({ ...site.EMPTY_SITE, ogAt: 456 }), "/api/site/og?v=456");
  const manifestSource = stripTypeScriptTypes(await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace("export default async function", "async function");
  const context = { ...assetsFor(), ...site, loadSiteSettings: async () => site.EMPTY_SITE };
  vm.runInNewContext(`${manifestSource}\nglobalThis.run = manifest;`, context);
  const manifest = await context.run();
  assert.deepEqual(Array.from(manifest.icons, icon => icon.src), ["icon-192.png", "icon-512.png", "icon-512-maskable.png"].map(name => `${CDN}/${name}`));
  assert.equal(manifest.icons[2].purpose, "maskable");
  assert.equal(manifest.start_url, "/"); assert.equal(manifest.scope, "/");
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
  const environmentPaths = ["/beach/real/white-sand-v1.webp", "/beach/real/white-cotton-v1.webp", ...MAP_TEXTURES];
  for (const path of environmentPaths) engine.loadEnvironmentTexture(path);
  await Promise.all(engine.assetLoads);
  // Mark disposed to exercise requests and their late-load cleanup without constructing actors.
  engine.disposed = true; await engine.loadAtlases();
  const expected = [
    "/beach/real/rock.jpg", "/beach/real/shelter-wood-v2.webp", "/beach/real/fabric-normal-v2.webp",
    "/beach/real/wood-normal.jpg", "/beach/real/wood.jpg", "/beach/real/sky-lantern-v2.png", "/beach/fx/firework-spark-v1.webp",
    "/beach/models/tripo-male-rigged-mobile-v3.glb", "/beach/models/tripo-female-rigged-mobile-v2.glb",
    "/beach/models/tripo-male-onsen-mobile-v2.glb", "/beach/models/tripo-female-onsen-mobile-v2.glb",
    "/beach/models/tripo-firewood-mobile-v2.glb", ...environmentPaths, "/beach/chars-v2.png", "/beach/props.png",
  ];
  assert.deepEqual(new Set(requests), new Set(expected.map(path => CDN + path)));
  lanterns.dispose(); fireworks.dispose(); campfire.dispose();
});
