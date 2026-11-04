import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { assets } from "./assets-fixture.mjs";
import { GLTFLoader as ThreeGLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...assets, ...dependencies };
  vm.runInNewContext(`${source}\nglobalThis.api = { ${names.join(",")} };`, context);
  return context.api;
}
const { buildFirewood } = await load("../lib/beach/firewood.ts", { THREE }, ["buildFirewood"]);
const { CoastalFire, fireFuelProfile } = await load("../lib/beach/fire.ts", { THREE, buildFirewood }, ["CoastalFire", "fireFuelProfile"]);
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

function meshBounds(mesh, count = mesh.count) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
  const vertices = mesh.geometry.getAttribute("position"), point = new THREE.Vector3();
  for (let instance = 0; instance < count; instance++) {
    mesh.getMatrixAt(instance, local);
    world.multiplyMatrices(mesh.matrixWorld, local);
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      point.fromBufferAttribute(vertices, vertex).applyMatrix4(world);
      assert.ok(Number.isFinite(point.x + point.y + point.z));
      bounds.expandByPoint(point);
    }
  }
  return bounds;
}

function settle(fire, time, camera, frames = 600) {
  for (let i = 0; i < frames; i++) fire.update(time + i / 60, camera);
  return time + frames / 60;
}

test("all twelve split logs form a compact crossed pile with valid natural wood geometry", () => {
  const scene = new THREE.Scene(), logs = buildFirewood(scene, 4, 12);
  assert.equal(logs.name, "campfire-charred-logs");
  assert.equal(logs.instanceMatrix.count, 12);
  assert.equal(logs.count, 3);
  const bounds = meshBounds(logs, 12), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x <= 1.7 && size.z <= 1.7, `wood stays compact, actual extent ${size.x} × ${size.z}`);
  assert.ok(bounds.min.y >= -0.015 && bounds.max.y <= .45, `the pile sits low on sand, ${bounds.min.y}..${bounds.max.y}`);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).x - 4) < .25);
  assert.ok(Math.abs(bounds.getCenter(new THREE.Vector3()).z - 12) < .25);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  logs.getMatrixAt(0, a); logs.getMatrixAt(1, b);
  logs.geometry.computeBoundingBox();
  const localSize = logs.geometry.boundingBox.getSize(new THREE.Vector3());
  const axis = localSize.z >= localSize.y && localSize.z >= localSize.x ? new THREE.Vector3(0, 0, 1) : localSize.y >= localSize.x ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const first = axis.clone().transformDirection(a), second = axis.clone().transformDirection(b);
  assert.ok(Math.abs(first.dot(second)) < .8, "the first pieces cross rather than form a parallel bundle");
  const normals = logs.geometry.getAttribute("normal"), uv = logs.geometry.getAttribute("uv");
  assert.ok(normals && uv && normals.count === logs.geometry.getAttribute("position").count);
  for (let i = 0; i < normals.count; i++) assert.ok(Number.isFinite(normals.getX(i) + normals.getY(i) + normals.getZ(i)));
});

test("fuel zero through twelve controls visible wood, monotone flame height, and a double-height full fire", () => {
  const scene = new THREE.Scene(), fire = new CoastalFire(scene, 0, 12), camera = new THREE.PerspectiveCamera();
  const logs = scene.getObjectByName("campfire-charred-logs"), uniforms = fire.material.uniforms;
  let previousHeight = -Infinity, time = 0;
  for (let fuel = 0; fuel <= 12; fuel++) {
    const profile = fireFuelProfile(fuel);
    assert.ok(profile.heightScale > previousHeight, `adding wood ${fuel} increases the flame envelope`);
    previousHeight = profile.heightScale;
    fire.setState(fuel, "amber");
    assert.equal(logs.count, fuel, "empty fuel never leaves unused logs drawn");
    time = settle(fire, time, camera);
    close(uniforms.uHeightScale.value, profile.heightScale);
    close(uniforms.uWidthScale.value, profile.widthScale);
    close(uniforms.uMotion.value, profile.motion);
    close(uniforms.uFlameOpacity.value, profile.flameOpacity);
    close(uniforms.uPower.value, profile.power);
  }
  close(fireFuelProfile(6).heightScale, 1);
  close(fireFuelProfile(12).heightScale, 2);
  close(fireFuelProfile(12).power, 1, 1e-9);
  assert.ok(fireFuelProfile(0).heightScale <= .2 && fireFuelProfile(0).flameOpacity <= .15, "an empty campfire stays a small ember flicker, not a tall flame");
  for (const badFuel of [-20, 80, NaN, Infinity]) {
    const profile = fireFuelProfile(badFuel);
    assert.ok(Object.values(profile).every(Number.isFinite));
    assert.ok(profile.heightScale >= .1 && profile.heightScale <= 2);
  }
});

test("quiet embers keep low static coal fragments and a small smooth glow instead of jitter", () => {
  const scene = new THREE.Scene(), fire = new CoastalFire(scene, 0, 12), camera = new THREE.PerspectiveCamera();
  fire.setState(0, "amber");
  const coals = scene.getObjectByName("campfire-charcoal"), bed = scene.getObjectByName("campfire-ember-bed");
  assert.ok(coals?.isInstancedMesh && coals.count > 0 && coals.count <= 20);
  assert.ok(bed?.isMesh, "one continuous ember bed remains under the small charcoal fragments");
  const bounds = meshBounds(coals), size = bounds.getSize(new THREE.Vector3());
  assert.ok(bounds.min.y >= -.015 && bounds.max.y <= .16, `embers stay close to the sand: ${bounds.min.y}..${bounds.max.y}`);
  assert.ok(size.x <= 1.9 && size.z <= 1.9);
  const originalTransforms = Array.from(coals.instanceMatrix.array);
  let time = settle(fire, 0, camera);
  assert.ok(fire.material.uniforms.uMotion.value <= .2, "empty-fire sway runs at a small fraction of the active fire motion");
  const glow = [];
  for (let frame = 0; frame < 900; frame++) {
    fire.update(time + frame / 60, camera);
    glow.push(fire.material.uniforms.uEmberGlow.value);
  }
  assert.ok(glow.every(value => Number.isFinite(value) && value > 0));
  assert.ok(Math.max(...glow) - Math.min(...glow) < .25, "slow ember breathing stays within a restrained glow range");
  const maxStep = Math.max(...glow.slice(1).map((value, i) => Math.abs(value - glow[i])));
  assert.ok(maxStep < .003, `no abrupt glow pulses at 60fps (${maxStep})`);
  assert.deepEqual(Array.from(coals.instanceMatrix.array), originalTransforms, "charcoal pieces never shake or move while glowing");
  assert.equal(scene.getObjectByName("campfire-charred-logs").count, 0);
});

test("adding and burning wood ease toward their new heights without overshoot", () => {
  const fire = new CoastalFire(new THREE.Scene(), 0, 12), camera = new THREE.PerspectiveCamera();
  fire.setState(0, "amber");
  let time = settle(fire, 0, camera);
  const start = fire.material.uniforms.uHeightScale.value;
  fire.setState(12, "amber");
  fire.update(time, camera);
  const first = fire.material.uniforms.uHeightScale.value;
  assert.ok(first > start && first < 2, "wood changes begin blending rather than jumping to full size");
  time = settle(fire, time + 1 / 60, camera);
  close(fire.material.uniforms.uHeightScale.value, 2);
  fire.setState(0, "amber");
  fire.update(time, camera);
  assert.ok(fire.material.uniforms.uHeightScale.value < 2 && fire.material.uniforms.uHeightScale.value > .16);
  settle(fire, time + 1 / 60, camera);
  close(fire.material.uniforms.uHeightScale.value, .16);
});

async function modelClass(loadAsync) {
  class GLTFLoader {
    setMeshoptDecoder(decoder) { assert.equal(decoder, MeshoptDecoder); this.decoder = decoder; return this; }
    loadAsync(url) { assert.equal(this.decoder, MeshoptDecoder, "compressed geometry needs the decoder before loading"); return loadAsync(url); }
  }
  return (await load("../lib/beach/campfire-model.ts", { THREE, GLTFLoader, MeshoptDecoder }, ["TripoCampfireModel"])).TripoCampfireModel;
}

function sampleModel() {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, .2, 1.2);
  geometry.translate(.1, .1, -.1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material));
  return { scene, geometry, material, texture };
}

test("the Tripo model replaces fallback wood only after loading and keeps quiet embers at zero fuel", async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const Model = await modelClass(url => { assert.equal(url, "/beach/models/tripo-firewood-mobile-v2.glb"); return pending; });
  const scene = new THREE.Scene(), fallback = [new THREE.Group(), new THREE.Group()];
  scene.add(...fallback);
  const model = new Model(scene, 4, 12, fallback), source = sampleModel();
  assert.ok(fallback.every(object => object.visible), "a slow download does not leave an empty fire pit");
  model.setFuel(12);
  resolve({ scene: source.scene });
  await model.ready;
  assert.ok(fallback.every(object => !object.visible));
  const root = scene.getObjectByName("campfire-tripo-model");
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
  close(Math.max(size.x, size.z), 1.82);
  close(bounds.min.y, .028);
  close(bounds.getCenter(new THREE.Vector3()).x, 4);
  close(bounds.getCenter(new THREE.Vector3()).z, 12);
  const shader = { uniforms: {}, fragmentShader: "#include <emissivemap_fragment>" };
  source.material.onBeforeCompile(shader, null);
  const strengths = [];
  model.setFuel(0);
  for (let frame = 0; frame < 600; frame++) {
    model.update(1 / 60, .84 + Math.sin(frame / 60 * .48) * .055, .07);
    strengths.push(shader.uniforms.uTripoEmberGlow.value);
  }
  assert.ok(root.visible && source.scene.parent === root, "burnt wood remains in the ember bed");
  assert.ok(root.scale.y > .67 && root.scale.y < .7);
  assert.ok(strengths.every(value => value > .45 && value < .7), "embers stay warm rather than turning white");
  assert.ok(Math.max(...strengths.slice(1).map((value, i) => Math.abs(value - strengths[i]))) < .001);
  model.dispose();
});

test("leaving during model loading releases late geometry, materials, textures, and decoded images", async () => {
  let resolve;
  const Model = await modelClass(() => new Promise(done => { resolve = done; }));
  const scene = new THREE.Scene(), model = new Model(scene, 0, 12, []), source = sampleModel();
  const released = { geometry: 0, material: 0, texture: 0, bitmap: 0 };
  source.geometry.addEventListener("dispose", () => released.geometry++);
  source.material.addEventListener("dispose", () => released.material++);
  source.texture.addEventListener("dispose", () => released.texture++);
  source.texture.source.data = { close() { released.bitmap++; } };
  model.dispose();
  resolve({ scene: source.scene });
  await model.ready;
  model.dispose();
  assert.deepEqual(released, { geometry: 1, material: 1, texture: 1, bitmap: 1 });
  assert.equal(scene.getObjectByName("campfire-tripo-model"), undefined);
  assert.equal(source.scene.parent, null);
});

test("a failed model download preserves the working procedural campfire", async () => {
  const Model = await modelClass(() => Promise.reject(new Error("offline")));
  const fallback = [new THREE.Group(), new THREE.Group()], scene = new THREE.Scene();
  const model = new Model(scene, 0, 12, fallback);
  await model.ready;
  assert.ok(fallback.every(object => object.visible));
  model.dispose();
});

test("the shipped Tripo asset stays within mobile geometry and download budgets with no external resources", async () => {
  const bytes = await readFile(new URL("../public/beach/models/tripo-firewood-mobile-v2.glb", import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 1.25 * 1024 * 1024, `optimized download is ${bytes.length} bytes`);
  const jsonSize = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
  const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((n, primitive) => n + gltf.accessors[primitive.indices].count / 3, 0);
  assert.ok(triangles > 15000 && triangles < 40000, `the retained model contains ${triangles} triangles`);
  assert.ok(gltf.extensionsRequired.includes("EXT_meshopt_compression"));
  assert.ok(gltf.bufferViews.some(view => view.extensions?.EXT_meshopt_compression));
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
});

test("the shipped mobile model decodes with the same Three.js Meshopt loader used by the app", async () => {
  const bytes = await readFile(new URL("../public/beach/models/tripo-firewood-mobile-v2.glb", import.meta.url));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loader = new ThreeGLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Node has no browser image surface. Keep real geometry, transforms and Meshopt decoding;
  // texture image dimensions/encoding are verified separately by the asset conversion.
  loader.register(() => ({ name: "TEST_material_without_browser_images", loadMaterial: () => Promise.resolve(new THREE.MeshStandardMaterial()) }));
  const loaded = await loader.parseAsync(arrayBuffer, "");
  loaded.scene.updateMatrixWorld(true);
  let triangles = 0;
  loaded.scene.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const positions = geometry.getAttribute("position"), normals = geometry.getAttribute("normal");
    assert.ok(positions && normals && geometry.getAttribute("uv"));
    assert.equal(positions.count, normals.count);
    for (let i = 0; i < positions.count; i++) assert.ok(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i)));
    for (let i = 0; i < geometry.index.count; i++) assert.ok(geometry.index.getX(i) < positions.count);
    triangles += geometry.index.count / 3;
  });
  assert.equal(triangles, 28264);
  const size = new THREE.Box3().setFromObject(loaded.scene).getSize(new THREE.Vector3());
  assert.ok(size.x > .87 && size.x < .89 && size.z > .98 && size.z < 1.0,
    "Meshopt decoding preserves the original wood pile's measured footprint");
  assert.ok(size.y > .18 && size.y < .3, "the restored low wood pile keeps its real proportions");
  loaded.scene.traverse(object => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
});
