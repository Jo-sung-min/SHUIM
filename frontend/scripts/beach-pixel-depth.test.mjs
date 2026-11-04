import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

async function source(file) {
  return stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
}
const atlasContext = {};
vm.runInNewContext(`${await source("../lib/beach/atlas.ts")}\nglobalThis.api={CHAR_ATLAS,CHAR_VIEW,CHAR_ANIM};`, atlasContext);
const typed = await source("../lib/beach/pixel-avatar-depth.ts");
const load = (document) => {
  const context = { THREE, ...atlasContext.api, document };
  vm.runInNewContext(`${typed}\nglobalThis.api={pixelAvatarDepthGeometry,PixelAvatarDepth,PIXEL_AVATAR_DEPTH};`, context);
  return context.api;
};
const frame = (rows) => {
  const height = rows.length, width = rows[0].length, data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { data[(y * width + x) * 4 + 3] = pixel === "#" ? 255 : 0; }));
  return { width, height, data };
};

test("lying pixel geometry has bevelled shaded sides and retains transparent cutouts", () => {
  const { pixelAvatarDepthGeometry, PIXEL_AVATAR_DEPTH } = load();
  const pixels = frame(["###", "#.#", "###"]);
  const geometry = pixelAvatarDepthGeometry(pixels, 1.8);
  assert.ok(Math.abs(geometry.boundingBox.max.z - geometry.boundingBox.min.z - PIXEL_AVATAR_DEPTH) < 1e-7);
  assert.ok(Math.abs(0.125 + geometry.boundingBox.min.z - 0.08) < 1e-7, "the underside rests on the mat rather than burying the extra depth");
  assert.ok(geometry.boundingBox.max.y > 1.8 && geometry.boundingBox.max.y <= 1.806, "the bevel extends only slightly beyond the original artwork");
  const uv = geometry.attributes.uv;
  for (let vertex = 0; vertex < uv.count - 4; vertex++) {
    const x = Math.floor(uv.getX(vertex) * pixels.width);
    const y = Math.floor((1 - uv.getY(vertex)) * pixels.height);
    assert.equal(pixels.data[(y * pixels.width + x) * 4 + 3], 255, "side colour samples an opaque outline pixel");
  }
  const color = geometry.attributes.color;
  assert.ok([...color.array].every((value) => value >= 0.5 && value <= 1));
  assert.ok(new Set(color.array).size > 2, "the bevel and lower edges have distinct shading");
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const object = new THREE.Mesh(geometry, material);
  object.updateMatrixWorld(true);
  const sideRay = new THREE.Raycaster(new THREE.Vector3(3, 0.9, -0.005), new THREE.Vector3(-1, 0, 0));
  assert.ok(sideRay.intersectObject(object).length > 0, "a grazing side view sees actual surfaces rather than stacked paper planes");
  const holeRay = new THREE.Raycaster(new THREE.Vector3(0, 0.9, -0.005), new THREE.Vector3(1, 0, 0));
  const innerSide = holeRay.intersectObject(object)[0];
  assert.ok(innerSide && innerSide.distance > 0.29 && innerSide.distance < 0.31, "the inner transparent hole has its own sidewall instead of being filled in");
  geometry.dispose(); material.dispose();
});

test("depth shares atlas texture, preserves standing actors, and releases its owned resources once", () => {
  let sourceRow = 0;
  const frames = [frame(["##", "#."]), frame([".#", "##"])];
  const context = {
    clearRect() {},
    drawImage(_image, _x, y) { sourceRow = y / atlasContext.api.CHAR_ATLAS.cellH; },
    getImageData() { return frames[sourceRow]; },
  };
  const { PixelAvatarDepth } = load({ createElement: () => ({ getContext: () => context }) });
  const texture = new THREE.Texture({ width: 2880, height: 208 });
  const pool = new PixelAvatarDepth(texture, 1.8);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const first = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  const second = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  pool.update(first, 1, false);
  assert.equal(first.children.length, 0);
  pool.update(first, 1, true); pool.update(second, 1, true);
  const child = first.getObjectByName("lying-pixel-depth");
  assert.notEqual(child.material, material);
  assert.equal(child.material.map, material.map, "front and side use the same atlas texture transforms");
  assert.equal(child.material.vertexColors, true);
  assert.equal(material.vertexColors, false, "the original artwork keeps its own material unchanged");
  assert.equal(child.geometry, second.children[0].geometry);
  assert.ok(first.geometry.attributes.position.getZ(0) > 0, "the front is lifted with the volume");
  let releases = 0, materialReleases = 0, sideMaterialReleases = 0;
  child.geometry.addEventListener("dispose", () => releases++);
  material.addEventListener("dispose", () => materialReleases++);
  child.material.addEventListener("dispose", () => sideMaterialReleases++);
  material.color.setRGB(0.3, 0.4, 0.5);
  pool.update(first, 1, true);
  assert.ok(child.material.color.equals(material.color), "daylight tint also reaches the sidewall");
  pool.update(first, 1, false);
  assert.equal(child.visible, false, "standing returns to the original flat sprite");
  assert.equal(first.geometry.attributes.position.getZ(0), 0);
  assert.ok(second.geometry.attributes.position.getZ(0) > 0, "another lying actor keeps its own shape");
  pool.update(first, 1, true);
  assert.equal(child.visible, true);
  pool.remove(first);
  assert.equal(first.children.length, 0);
  assert.equal(sideMaterialReleases, 1);
  assert.equal(releases, 0, "another character still uses this geometry");
  pool.update(second, 0, true);
  assert.notEqual(second.children[0].geometry, child.geometry, "skin changes use the matching outline");
  pool.dispose(); pool.dispose();
  assert.equal(second.children.length, 0);
  assert.equal(second.geometry.attributes.position.getZ(0), 0);
  assert.equal(releases, 1);
  assert.equal(materialReleases, 0, "actor-owned materials are released by the engine, not the shared pool");
  first.geometry.dispose(); second.geometry.dispose(); material.dispose(); texture.dispose();
});
