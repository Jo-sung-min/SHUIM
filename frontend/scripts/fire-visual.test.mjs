import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

async function load(file, dependencies, names) {
  const typed = await readFile(new URL(file, import.meta.url), "utf8");
  const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
  const context = { ...dependencies };
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
