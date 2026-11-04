import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";

const typed = await readFile(new URL("../lib/beach/lanterns.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=class\b)/g, "");
function setup() {
  const requests = [];
  class TextureLoader {
    load(url, onLoad, _progress, onError) {
      const texture = new THREE.Texture();
      requests.push({ url, texture, onLoad, onError });
      return texture;
    }
  }
  const context = { THREE: { ...THREE, TextureLoader }, ...assets };
  vm.runInNewContext(`${source}\nglobalThis.createLanterns = (scene, count) => new SkyLanterns(scene, count);`, context);
  const scene = new THREE.Scene();
  const lanterns = context.createLanterns(scene, 22);
  const paper = scene.getObjectByName("sky-lantern-paper");
  const glow = scene.getObjectByName("sky-lantern-glow");
  const far = scene.getObjectByName("sky-lantern-distance");
  const load = () => {
    requests[0].texture.image = { width: 512, height: 512 };
    requests[0].onLoad(requests[0].texture);
  };
  return { scene, lanterns, paper, glow, far, requests, load };
}

test("paper lanterns wait for the true-alpha image and stay above the sea", () => {
  const { lanterns, paper, glow, far, requests, load } = setup();
  assert.equal(requests[0].url, assets.assetUrl("/beach/real/sky-lantern-v2.png"));
  assert.equal(paper.geometry.instanceCount, 22);
  assert.equal(far.geometry.getAttribute("aBase").count, 66);
  const bases = paper.geometry.getAttribute("aBase");
  for (let i = 0; i < bases.count; i++) {
    assert.ok(bases.getY(i) >= 6, "even the nearest paper lanterns remain well above head height");
    assert.ok(bases.getZ(i) <= -20, "paper lanterns drift over the sea, away from the beach");
  }
  lanterns.setAmount(1);
  lanterns.update(1);
  assert.equal(far.visible, true);
  assert.equal(paper.visible, false, "never show an unloaded image plane");
  assert.equal(glow.visible, false);
  load();
  assert.equal(paper.visible, true);
  assert.equal(glow.visible, true);
  assert.equal(requests[0].texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(requests[0].texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(paper.material.uniforms.uAspect.value, 1, "the square texture keeps its paper silhouette unstretched");
  lanterns.setAmount(0);
  for (let time = 1.1; time <= 8; time += 0.1) lanterns.update(time);
  assert.equal(paper.visible, false);
  assert.equal(glow.visible, false);
  assert.equal(far.visible, false);
  lanterns.dispose();
});

test("dispose removes shared geometry, materials and texture exactly once", () => {
  const { scene, lanterns, paper, glow, far, requests, load } = setup();
  load();
  const resources = new Set([paper.geometry, glow.geometry, far.geometry, paper.material, glow.material, far.material, requests[0].texture]);
  const disposals = new Map();
  for (const resource of resources) resource.addEventListener("dispose", () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  lanterns.dispose();
  lanterns.dispose();
  lanterns.update(20);
  assert.equal(scene.children.length, 0, "the engine's later scene traversal cannot dispose these twice");
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
  assert.equal(paper.material.uniforms.uPaper.value, null);
});

test("a late texture completion cannot revive disposed lanterns or retain its image", () => {
  const { scene, lanterns, paper, glow, far, requests, load } = setup();
  let textureDisposals = 0;
  requests[0].texture.addEventListener("dispose", () => textureDisposals++);
  lanterns.setAmount(1);
  lanterns.dispose();
  load();
  lanterns.update(5);
  assert.equal(scene.children.length, 0);
  assert.equal(textureDisposals, 1);
  assert.equal(requests[0].texture.image, null);
  assert.equal(paper.material.uniforms.uPaper.value, null);
  for (const object of [paper, glow, far]) assert.equal(object.visible, false);
});

test("image failure keeps paper and its halo hidden without leaking the pending texture", () => {
  const { lanterns, paper, glow, requests } = setup();
  let textureDisposals = 0;
  requests[0].texture.addEventListener("dispose", () => textureDisposals++);
  requests[0].onError(new Error("image unavailable"));
  lanterns.setAmount(1);
  lanterns.update(2);
  assert.equal(paper.visible, false);
  assert.equal(glow.visible, false);
  lanterns.dispose();
  assert.equal(textureDisposals, 1);
});
