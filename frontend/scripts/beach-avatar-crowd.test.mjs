import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { readAssetBytes } from "./asset-bytes-fixture.mjs";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/rigged-avatar.ts", import.meta.url), "utf8"))
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
function runtime(legacy = false) {
  // The prior implementation recalculated every descendant before each aimed limb.
  const context = { THREE, cloneSkeleton };
  vm.runInNewContext(`${source}\nglobalThis.api = { BeachAvatar, prepareAvatarTemplate };`, context);
  if (legacy) {
    const prototype = context.api.BeachAvatar.prototype;
    const aim = prototype.aim;
    prototype.aim = function (...args) {
      this.root.updateMatrixWorld(true);
      return aim.apply(this, args);
    };
  }
  return context.api;
}
const { BeachAvatar: CurrentAvatar, prepareAvatarTemplate } = runtime(), { BeachAvatar: PriorAvatar } = runtime(true);
const files = { male: "tripo-male-rigged-mobile-v3.glb", female: "tripo-female-rigged-mobile-v2.glb",
  "male-onsen": "tripo-male-onsen-mobile-v2.glb", "female-onsen": "tripo-female-onsen-mobile-v2.glb" };
const models = await Promise.all(Object.entries(files).map(async ([kind, file]) => {
  const bytes = await readAssetBytes(`/beach/models/${file}`);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser => {
    parser.loadTextureImage = () => Promise.resolve(new THREE.Texture());
    return { name: "CPU_texture_decode" };
  });
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  gltf.scene.updateMatrixWorld(true);
  const prepared = prepareAvatarTemplate(gltf.scene, gltf.animations, new THREE.Box3().setFromObject(gltf.scene, true));
  return { kind, gltf, prepared };
}));
const state = (extra = {}) => ({ x: 1.25, y: 0.48, z: 4, yaw: 0.3, moving: false, visible: true, ...extra });
const closeArray = (actual, expected, message) => {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) assert.ok(Math.abs(actual[index] - expected[index]) < 1e-9, `${message} at ${index}`);
};
function comparePose(actual, expected) {
  const a = [], b = [];
  actual.root.traverse(object => a.push(object)); expected.root.traverse(object => b.push(object));
  assert.equal(a.length, b.length); assert.equal(actual.root.visible, expected.root.visible);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].name, b[i].name);
    closeArray(a[i].matrixWorld.elements, b[i].matrixWorld.elements, `${a[i].name} world pose`);
    if (!a[i].isSkinnedMesh) continue;
    const vertexA = new THREE.Vector3(), vertexB = new THREE.Vector3();
    for (let vertex = 0; vertex < a[i].geometry.attributes.position.count; vertex += 31) {
      a[i].getVertexPosition(vertex, vertexA).applyMatrix4(a[i].matrixWorld);
      b[i].getVertexPosition(vertex, vertexB).applyMatrix4(b[i].matrixWorld);
      closeArray(vertexA.toArray(), vertexB.toArray(), `${a[i].name} visible skin ${vertex}`);
    }
  }
}

test("ancestor-only pose updates preserve all four original models, gestures and rest transitions exactly", () => {
  for (const { kind, gltf, prepared } of models) {
    const current = new CurrentAvatar(gltf.scene, gltf.animations, undefined, kind, prepared);
    const prior = new PriorAvatar(gltf.scene, gltf.animations, undefined, kind);
    for (const actor of [current, prior]) {
      const scene = new THREE.Group(); scene.position.set(3, 0.8, -4); scene.rotation.y = 0.2;
      scene.add(actor.root); scene.updateMatrixWorld(true);
    }
    const steps = [state(), state({ moving: true }), state({ moving: true, yaw: -2.5 }), state(),
      state({ seated: { x: 3, z: 5, yaw: -1.3, avatarY: 1 } }),
      state({ lying: { x: 2, z: 8, yaw: Math.PI, avatarY: 0.082, incline: 0 } }),
      state({ lying: { x: -5, z: 10, yaw: -0.4, avatarY: 1.12, incline: 0.25 } }),
      state({ visible: false }), state(), state({ moving: true })];
    for (let index = 0; index < steps.length; index++) {
      if (index === 3 || index === 4) for (const actor of [current, prior]) actor.playGesture(index === 3 ? "wave" : "hug", { x: 5, z: 2 });
      for (let frame = 0; frame < 8; frame++) {
        current.update(1 / 60, steps[index]); prior.update(1 / 60, steps[index]);
        comparePose(current, prior);
      }
    }
    current.dispose(); prior.dispose();
  }
});

function crowd(Class) {
  const start = performance.now();
  const original = THREE.SkinnedMesh.prototype.getVertexPosition;
  let skinnedVertices = 0;
  THREE.SkinnedMesh.prototype.getVertexPosition = function(...args) { skinnedVertices++; return original.apply(this, args); };
  try {
    const people = Array.from({ length: 100 }, (_, index) => {
      const { kind, gltf, prepared } = models[index % models.length];
      const actor = new Class(gltf.scene, gltf.animations, undefined, kind, Class === CurrentAvatar ? prepared : undefined);
      const x = (index % 10 - 5) * 2, z = Math.floor(index / 10) * 2;
      const pose = index < 40 ? state({ x, z, moving: true }) : index < 80 ? state({ x, z })
        : index < 92 ? state({ seated: { x, z, yaw: 0.3, avatarY: 0.52 } })
          : state({ lying: { x, z, yaw: 0.3, avatarY: 0.082 } });
      return { actor, pose };
    });
    return { people, setupMs: performance.now() - start, skinnedVertices };
  } finally { THREE.SkinnedMesh.prototype.getVertexPosition = original; }
}
function frame(people) { for (const { actor, pose } of people) actor.update(1 / 60, pose); }
function worldVisits(people) {
  const original = THREE.Object3D.prototype.updateMatrixWorld;
  let visits = 0;
  THREE.Object3D.prototype.updateMatrixWorld = function(...args) { visits++; return original.apply(this, args); };
  try { frame(people); return visits; }
  finally { THREE.Object3D.prototype.updateMatrixWorld = original; }
}
function timings(people) {
  const frames = [];
  for (let sample = 0; sample < 40; sample++) { const start = performance.now(); frame(people); frames.push(performance.now() - start); }
  frames.sort((a, b) => a - b);
  return { medianMs: frames[20], p95Ms: frames[38] };
}

test("100 fully visible people retain independent animation while redundant hierarchy visits decrease", context => {
  const current = crowd(CurrentAvatar), prior = crowd(PriorAvatar);
  assert.equal(current.skinnedVertices, 0, "actor creation reuses the model's exact bounds without reskinning every vertex");
  assert.ok(prior.skinnedVertices > 100_000, "the baseline measures the previous per-person bounds scan");
  const clips = people => new Set(people.map(({ actor }) => actor.walk.getClip()));
  assert.equal(clips(current.people).size, 4, "one immutable walk clip is shared for each downloaded model");
  assert.equal(clips(prior.people).size, 100);
  assert.equal(new Set(current.people.map(({ actor }) => actor.mixer)).size, 100, "every person retains their own animation clock");
  const trackBytes = people => [...clips(people)].reduce((bytes, clip) => bytes + clip.tracks.reduce((total, track) => total + track.values.byteLength + track.times.byteLength, 0), 0);
  for (let i = 0; i < 8; i++) { frame(current.people); frame(prior.people); }
  const before = worldVisits(prior.people), after = worldVisits(current.people);
  assert.ok(after < before * 0.5, `${before} → ${after} hierarchy visits for the same 100 people`);
  for (const { actor } of current.people) assert.equal(actor.root.visible, true, "optimization cannot hide any crowd member");
  for (let index = 0; index < 100; index += 11) comparePose(current.people[index].actor, prior.people[index].actor);
  const oldTiming = timings(prior.people), newTiming = timings(current.people);
  context.diagnostic(JSON.stringify({ people: 100, moving: 40, idle: 40, seated: 12, lying: 8,
    hierarchyVisits: { before, after }, cpuAnimation: { before: oldTiming, after: newTiming },
    setupMs: { before: prior.setupMs, after: current.setupMs }, setupSkinnedVertices: { before: prior.skinnedVertices, after: current.skinnedVertices },
    walkTrackBytes: { before: trackBytes(prior.people), after: trackBytes(current.people) }, scope: "CPU animation only; no GPU draw or browser frame-rate claim" }));
  for (const { people } of [current, prior]) for (const { actor } of people) actor.dispose();
});
