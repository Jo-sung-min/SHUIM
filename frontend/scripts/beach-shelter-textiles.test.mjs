import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const code = stripTypeScriptTypes(await readFile(new URL("../lib/beach/shelter-textiles.ts", import.meta.url), "utf8"))
  .replace(/^import[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b)/g, "");
const context = { THREE };
vm.runInNewContext(`${code}\nglobalThis.api={createShelterDuvetGeometry,createShelterPillowGeometry,createShelterTextileMaterial};`, context);
const { createShelterDuvetGeometry, createShelterPillowGeometry, createShelterTextileMaterial } = context.api;

test("soft textiles are closed mobile-sized volumes with the original bedding bounds", () => {
  for (const create of [createShelterDuvetGeometry, createShelterPillowGeometry]) {
    const geometry = create(), edges = new Map();
    assert.ok(geometry.index.count / 3 < 2200, "one shared geometry stays below the mobile triangle budget");
    assert.ok([...geometry.attributes.position.array, ...geometry.attributes.normal.array].every(Number.isFinite));
    for (const axis of ["x", "y", "z"]) {
      assert.ok(Math.abs(geometry.boundingBox.min[axis] + 0.5) < 1e-6);
      assert.ok(Math.abs(geometry.boundingBox.max[axis] - 0.5) < 1e-6);
    }
    const index = geometry.index.array;
    for (let t = 0; t < index.length; t += 3) for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
      const edge = `${Math.min(a, b)},${Math.max(a, b)}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2), "top, underside and welt form a watertight cloth silhouette");
    geometry.dispose();
  }
});

test("the central quilt covers lying bodies while rolled edges and pillows retain visible loft", () => {
  const duvet = createShelterDuvetGeometry(), pillow = createShelterPillowGeometry();
  const material = createShelterTextileMaterial();
  const mesh = new THREE.Mesh(duvet, material);
  mesh.scale.set(1.88, 0.2, 1.44); mesh.position.set(0, 0.97, 0); mesh.updateMatrixWorld(true);
  for (const x of [-0.18, 0, 0.18]) for (const z of [-0.25, 0, 0.25]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
    const surface = ray.intersectObject(mesh)[0];
    assert.ok(surface && surface.point.y > 1.068 && surface.point.y <= 1.070001,
      "cloth folds leave the established covered-body height intact");
  }
  const pillowMesh = new THREE.Mesh(pillow, material); pillowMesh.updateMatrixWorld(true);
  const heightAt = x => new THREE.Raycaster(new THREE.Vector3(x, 1, 0), new THREE.Vector3(0, -1, 0)).intersectObject(pillowMesh)[0].point.y;
  assert.ok(heightAt(0) > heightAt(0.43) + 0.2, "the pillow visibly rounds away from its soft centre");
  duvet.dispose(); pillow.dispose(); material.dispose();
});

test("textiles reuse one cotton map for subtle relief without allocating extra normal or roughness maps", () => {
  const map = new THREE.Texture(), material = createShelterTextileMaterial(map);
  assert.equal(material.map, map); assert.equal(material.bumpMap, map);
  assert.equal(material.normalMap, null); assert.equal(material.roughnessMap, null);
  assert.equal(material.vertexColors, true);
  assert.ok(material.roughness >= 0.95 && material.bumpScale < 0.003);
  assert.equal(material.transparent, false);
  assert.equal(material.side, THREE.FrontSide, "closed volumes need only one face draw");
  material.dispose(); map.dispose();
});
