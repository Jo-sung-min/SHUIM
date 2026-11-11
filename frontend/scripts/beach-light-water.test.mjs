import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

const load = async (path, exports, globals = {}) => {
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), "utf8"))
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/\bexport\s+(?=const\b|function\b|class\b)/g, "");
  const context = { THREE, ...globals };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${exports} };`, context);
  return context.api;
};
const { HORIZON_MELT } = await load("../lib/beach/sky-shader.ts", "HORIZON_MELT");
const { BeachUltraSea } = await load("../lib/beach/ultra-sea.ts", "BeachUltraSea", { HORIZON_MELT });
const { sandHeight } = await load("../lib/beach/shore-terrain.ts", "sandHeight");

function fixture(tier = "mobile") {
  // Starting the scene and changing daylight must never allocate/render/read GPU
  // targets; this fails immediately if a hidden water preparation pass returns.
  const renderer = new Proxy({}, { get(_target, name) { throw new Error(`Unexpected water renderer access: ${String(name)}`); } });
  const scene = new THREE.Scene(), photo = new THREE.Texture();
  const tint = { value: new THREE.Vector3(1, 1, 1) };
  const water = new BeachUltraSea(renderer, scene, { photo, photoTint: tint, tier, skyFragment: "", skyUniforms: {} });
  return { renderer, scene, photo, tint, water };
}

test("water construction, daylight and animation never draw an offscreen scene or require float targets", () => {
  const { renderer, scene, water, tint } = fixture();
  assert.equal(BeachUltraSea.supported(renderer), true);
  assert.equal(scene.children.length, 1);
  assert.equal(water.surface.material.transparent, true);
  assert.equal(water.surface.material.depthWrite, false);
  const camera = new THREE.PerspectiveCamera();
  for (let frame = 0; frame < 120; frame++) water.prepare(1 / 60, camera);
  assert.ok(Math.abs(water.surface.uniforms.uTime.value - 2) < 1e-9);
  assert.equal(water.sandUniforms.uTime, water.surface.uniforms.uTime);
  water.setDaylight([0, 1, 1], [1, 0.8, 0.6], tint.value, false);
  assert.ok(water.surface.uniforms.uLightColor.value.length() < 0.01);
  water.enabled = false;
  assert.equal(water.surface.mesh.visible, false);
  water.enabled = true;
  assert.equal(water.enabled, true);
  water.dispose();
});

test("the mobile surface stays below 300 KB, with valid upward facing triangles and full cove coverage", () => {
  for (const tier of ["mobile", "high"]) {
    const { water } = fixture(tier);
    const geometry = water.surface.mesh.geometry;
    const position = geometry.attributes.position, index = geometry.index;
    const bytes = position.array.byteLength + index.array.byteLength;
    assert.ok(bytes < (tier === "mobile" ? 300_000 : 400_000), `${tier} water geometry uses ${bytes} bytes`);
    assert.ok(Math.max(...index.array) < position.count);
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.min.x <= -260 && geometry.boundingBox.max.x >= 260);
    assert.ok(geometry.boundingBox.min.z <= -260 && geometry.boundingBox.max.z >= 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
      assert.ok(b.sub(a).cross(c.sub(a)).y > 0, `inverted triangle ${i / 3}`);
    }
    water.dispose();
  }
});

test("the actual shoreline shader follows the terrain height so the transparent surface cannot cut a false shore", () => {
  const { water } = fixture();
  const body = water.surface.material.fragmentShader.match(/float coastBed\(float z\) \{([\s\S]*?)\n\}/)[1]
    .replace(/\bfloat\s+(\w+)\s*=/g, "let $1 =");
  const shaderBed = new Function("exp", `return z => { ${body} };`)(Math.exp);
  for (let z = -300; z <= 3; z += 0.17) assert.ok(Math.abs(shaderBed(z) - sandHeight(z)) < 1e-10);
  water.dispose();
});

test("disposing water releases only its own resources and is safe twice", () => {
  const { scene, photo, water } = fixture();
  let textureDisposals = 0, materialDisposals = 0, geometryDisposals = 0;
  photo.addEventListener("dispose", () => textureDisposals++);
  water.surface.material.addEventListener("dispose", () => materialDisposals++);
  water.surface.mesh.geometry.addEventListener("dispose", () => geometryDisposals++);
  water.dispose(); water.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(textureDisposals, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(geometryDisposals, 1);
});
