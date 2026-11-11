import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hotSpring } from "./beach-world-fixture.mjs";

const layoutSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/garden-layout.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b)/g, "");
const layout = { ...hotSpring };
vm.runInNewContext(`${layoutSource}\nglobalThis.trees = GARDEN_WILLOWS;`, layout);
const source = await readFile(new URL("../lib/beach/garden.ts", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("const LAMP_INTENSITY"), source.indexOf("function heightfield"));
const build = source.slice(source.indexOf("  private buildWillows("), source.indexOf("  private buildReeds("));
const quality = source.slice(source.indexOf("  setQuality(low:"), source.indexOf("  setFireState("));
const context = { THREE, mergeGeometries, ...hotSpring, GARDEN_WILLOWS: layout.trees, GARDEN_TREE_VERT: "", GARDEN_TREE_FRAG: "", GARDEN_RIPPLE_COUNT: 8 };
vm.runInNewContext(stripTypeScriptTypes(`${helpers}\nclass TreeFixture { ${build}\n${quality} }\nglobalThis.TreeFixture = TreeFixture;`), context);

function buildTrees() {
  const world = new context.TreeFixture(), texture = new THREE.Texture(), wood = new THREE.Texture();
  Object.assign(world, { root: new THREE.Group(), geometries: [], materials: [], textures: [], low: false, disposed: false,
    rain: { setQuality() {} }, structures: { setQuality() {} }, water: { material: { uniforms: { uRainTaps: {}, uRippleLimit: {} } } }, reeds: {}, lastLampAt: {} });
  world.willowStrands = world.buildWillows(texture, () => ({}), wood);
  return { world, texture, wood, cleanup() { for (const geometry of world.geometries) geometry.dispose(); for (const material of world.materials) material.dispose(); for (const owned of world.textures) owned.dispose(); texture.dispose(); wood.dispose(); } };
}

test("leaf-only crowns use small, spatially distributed clusters above pedestrian height", () => {
  const fixture = buildTrees(), { world } = fixture;
  const geometry = world.willowStrands.geometry, centers = geometry.getAttribute("aLeaf"), shapes = geometry.getAttribute("aLeafSeed");
  assert.ok(geometry.instanceCount / layout.trees.length >= 12 && geometry.instanceCount / layout.trees.length <= 24);
  for (let treeIndex = 0; treeIndex < layout.trees.length; treeIndex++) {
    const tree = layout.trees[treeIndex], positions = [];
    for (let i = treeIndex; i < geometry.instanceCount; i += layout.trees.length) {
      const x = centers.getX(i) - tree.x, y = centers.getY(i) - tree.y, z = centers.getZ(i) - tree.z, width = centers.getW(i);
      assert.ok([x, y, z, width].every(Number.isFinite));
      assert.ok(width < 4.5 * tree.scale, "no full-height tree photograph panels remain");
      assert.ok(y - width * .6 > 2 * tree.scale, "leaf clusters do not hang through the walking area");
      assert.ok(Math.hypot(x, z) < 3.1 * tree.scale);
      assert.ok(shapes.getW(i) > .5 && shapes.getW(i) < 1);
      positions.push([x, y, z]);
    }
    assert.ok(Math.max(...positions.map(p => p[0])) - Math.min(...positions.map(p => p[0])) > 3.5 * tree.scale);
    assert.ok(Math.max(...positions.map(p => p[2])) - Math.min(...positions.map(p => p[2])) > 3.5 * tree.scale);
    assert.ok(Math.max(...positions.map(p => p[1])) > 6.5 * tree.scale, "the crown has a real upper volume");
  }
  assert.equal(world.root.children.length, 2, "all branches and foliage remain two draws, without lights or per-leaf objects");
  const branchGeometry = world.root.getObjectByName("garden-willow-trunks").geometry;
  assert.ok(Array.from(branchGeometry.getAttribute("position").array).every(Number.isFinite));
  assert.ok(branchGeometry.index.count / 3 < layout.trees.length * 500, "the tapered fork mesh remains mobile-sized");
  assert.notEqual(world.textures[0], fixture.wood, "bark UV edits own a clone of the shared wood texture");
  fixture.cleanup();
});

test("adaptive quality keeps a complete crown on every tree and restores all foliage", () => {
  const fixture = buildTrees(), { world } = fixture, geometry = world.willowStrands.geometry;
  const full = geometry.instanceCount;
  world.setQuality(true);
  assert.ok(geometry.instanceCount < full && geometry.instanceCount >= full * .75);
  assert.equal(geometry.instanceCount % layout.trees.length, 0, "no trees disappear when rendering fewer leaf clusters");
  const centers = geometry.getAttribute("aLeaf");
  for (let treeIndex = 0; treeIndex < layout.trees.length; treeIndex++) {
    const tree = layout.trees[treeIndex], heights = [];
    for (let i = treeIndex; i < geometry.instanceCount; i += layout.trees.length) heights.push((centers.getY(i) - tree.y) / tree.scale);
    assert.ok(Math.min(...heights) < 5.2 && Math.max(...heights) > 6.5, "both shoulders and top survive low quality");
  }
  world.setQuality(false);
  assert.equal(geometry.instanceCount, full);
  fixture.cleanup();
});
