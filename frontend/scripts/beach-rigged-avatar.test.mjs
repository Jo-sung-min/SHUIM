import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { assets } from "./assets-fixture.mjs";

const bytes = await readFile(new URL("../public/beach/models/tripo-male-rigged-mobile-v3.glb", import.meta.url));
const modelFiles = { male: "tripo-male-rigged-mobile-v3.glb", female: "tripo-female-rigged-mobile-v2.glb", "male-onsen": "tripo-male-onsen-mobile-v1.glb", "female-onsen": "tripo-female-onsen-mobile-v1.glb" };
const typed = await readFile(new URL("../lib/beach/rigged-avatar.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/^import\s+[^\n]+\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");

async function model(kind = "male") {
  // Actual Meshopt + skin/animation decode. Only browser image decoding is stubbed.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(parser => {
    parser.loadTextureImage = () => Promise.resolve(new THREE.Texture());
    return { name: "CPU_texture_decode" };
  });
  const data = kind === "male" ? bytes : await readFile(new URL(`../public/beach/models/${modelFiles[kind]}`, import.meta.url));
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
}

function runtime(load, kind = "male") {
  let requests = 0;
  class Loader {
    setMeshoptDecoder(decoder) { assert.equal(decoder, MeshoptDecoder); return this; }
    loadAsync(url) { assert.equal(url, `/beach/models/${modelFiles[kind]}`); requests++; return load(); }
  }
  const context = { THREE, GLTFLoader: Loader, MeshoptDecoder, cloneSkeleton, ...assets };
  vm.runInNewContext(`${source}\nglobalThis.api = { BeachAvatarModels, BeachAvatar };`, context);
  return { ...context.api, requests: () => requests };
}

const state = (extra = {}) => ({ x: 0, z: 0, yaw: 0, moving: false, visible: true, ...extra });
const bone = (actor, name) => actor.root.getObjectByName(`mixamorig${name}`);
function mesh(actor) { let found; actor.root.traverse(o => { if (o.isSkinnedMesh) found = o; }); return found; }
function finiteSkin(actor) {
  actor.root.updateMatrixWorld(true);
  const object = mesh(actor), position = new THREE.Vector3();
  for (let i = 0; i < object.geometry.attributes.position.count; i += 31) {
    object.getVertexPosition(i, position).applyMatrix4(object.matrixWorld);
    assert.ok(position.toArray().every(Number.isFinite), "posed skin vertices remain finite");
  }
}

function pelvisSurfacePoint(actor) {
  actor.root.updateMatrixWorld(true);
  const lowest = new THREE.Vector3(0, Infinity, 0), point = new THREE.Vector3();
  actor.root.traverse(object => {
    if (!object.isSkinnedMesh) return;
    const joints = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight;
    for (let vertex = 0; vertex < weights.count; vertex++) {
      let strongest = 0;
      for (let slot = 1; slot < 4; slot++) if (weights.getComponent(vertex, slot) > weights.getComponent(vertex, strongest)) strongest = slot;
      const name = object.skeleton.bones[joints.getComponent(vertex, strongest)].name.replace(/^mixamorig[:_]?/i, "");
      if (!/^(Hip|Hips|Pelvis)$/.test(name)) continue;
      object.getVertexPosition(vertex, point).applyMatrix4(object.matrixWorld);
      if (point.y < lowest.y) lowest.copy(point);
    }
  });
  return lowest;
}

test("the corrected mobile asset loads once and shares render resources with independent skeletons", async () => {
  const gltf = await model(), api = runtime(() => Promise.resolve(gltf)), pool = new api.BeachAvatarModels();
  await Promise.all([pool.load(), pool.load()]);
  assert.equal(api.requests(), 1);
  const first = pool.create(), second = pool.create();
  assert.ok(first && second);
  assert.equal(mesh(first).geometry, mesh(second).geometry);
  assert.equal(mesh(first).material, mesh(second).material);
  assert.notEqual(mesh(first).skeleton, mesh(second).skeleton);
  assert.notEqual(bone(first, "LeftArm"), bone(second, "LeftArm"));
  first.update(0.1, state({ moving: true, x: 4, z: 9 }));
  second.update(0.1, state({ x: -3, z: -2 }));
  assert.notEqual(bone(first, "LeftUpLeg").quaternion.angleTo(bone(second, "LeftUpLeg").quaternion), 0);
  assert.equal(mesh(first).material.emissive.getHex(), 0, "character responds to night lighting");
  assert.equal(mesh(first).frustumCulled, true, "offscreen skinned actors can be culled");
  let releases = 0;
  mesh(first).geometry.addEventListener("dispose", () => releases++);
  first.dispose(); first.dispose();
  assert.equal(releases, 0, "one player leaving cannot dispose geometry used by others");
  finiteSkin(second);
  pool.dispose(); pool.dispose();
  assert.equal(releases, 1);
  assert.equal(second.root.children.length, 0);
  assert.equal(pool.create(), null);
});

test("walking stays in place and never restores the broken hand/finger animation", async () => {
  const gltf = await model(), api = runtime(() => Promise.resolve(gltf)), pool = new api.BeachAvatarModels();
  await pool.load();
  const actor = pool.create(), hips = bone(actor, "Hips"), hipStart = hips.position.clone();
  const hands = [];
  actor.root.traverse(object => { if (object.isBone && /Hand/.test(object.name)) hands.push([object, object.quaternion.clone()]); });
  assert.equal(hands.length, 42);
  for (let i = 0; i < 55; i++) {
    actor.update(0.1, state({ moving: true, x: i * 0.32, z: 7 }));
    assert.ok(Math.abs(hips.position.x - hipStart.x) < 1e-6);
    assert.ok(Math.abs(hips.position.z - hipStart.z) < 1e-6, "network travel is not duplicated by root motion");
    for (const [hand, rest] of hands) assert.ok(hand.quaternion.equals(rest), hand.name);
    assert.equal(actor.root.position.x, i * 0.32);
  }
  assert.ok(hips.position.y !== hipStart.y, "vertical step motion is preserved");
  finiteSkin(actor);
  pool.dispose();
});

test("standing, seated, and lying actors use the scene's feet and seat coordinates", async () => {
  const gltf = await model(), api = runtime(() => Promise.resolve(gltf)), pool = new api.BeachAvatarModels();
  await pool.load();
  const actor = pool.create();
  actor.update(0, state({ y: 0.18 }));
  let box = new THREE.Box3().setFromObject(actor.root, true);
  assert.ok(Math.abs(box.min.y - 0.18) < 0.001);
  assert.ok(Math.abs(box.max.y - box.min.y - 1.8) < 0.001);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
  assert.ok(forward.z < -0.999);
  actor.update(0.1, state({ seated: { x: 2, z: 9, yaw: Math.PI / 2, avatarY: 0.52 } }));
  const hips = bone(actor, "Hips").getWorldPosition(new THREE.Vector3());
  assert.ok(hips.y > 0.57, "the internal hip joint stays above the sitting surface");
  assert.ok(Math.abs(pelvisSurfacePoint(actor).y - 0.52) < 0.001, "the visible pelvis rests at the seat height");
  box = new THREE.Box3().setFromObject(actor.root, true);
  assert.ok(box.min.y >= -0.01, "folded feet do not pass through the ground");
  for (const slot of [
    { x: 7, z: 9.65, yaw: 0, avatarY: 0.125 },
    { x: 0, z: 24.9, yaw: Math.PI, avatarY: 0.82, incline: 0.25 },
  ]) {
    actor.update(0.1, state({ moving: true, lying: slot }));
    box = new THREE.Box3().setFromObject(actor.root, true);
    const isBed = (slot.incline ?? 0) > 0;
    if (isBed) assert.ok(Math.abs(box.min.y - (slot.avatarY - 0.2)) < 0.003, "the bed pillow surrounds the back of the head");
    else {
      assert.ok(box.min.y < slot.avatarY - 0.1, "the large head may enter the mat instead of lifting the body");
      const object = mesh(actor), joints = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight;
      let back = Infinity, legs = Infinity;
      for (let vertex = 0; vertex < object.geometry.attributes.position.count; vertex++) {
        let dominant = 0;
        for (let slot = 1; slot < 4; slot++) if (weights.getComponent(vertex, slot) > weights.getComponent(vertex, dominant)) dominant = slot;
        const name = object.skeleton.bones[joints.getComponent(vertex, dominant)].name;
        if (!/Spine|UpLeg|Leg/.test(name)) continue;
        const y = object.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(object.matrixWorld).y;
        if (/Spine/.test(name)) back = Math.min(back, y);
        else legs = Math.min(legs, y);
      }
      assert.ok(Math.abs(back - slot.avatarY) < 0.01, "the back touches the assigned surface");
      assert.ok(legs - slot.avatarY < 0.035, "the legs rest close to the mat instead of floating with the head");
    }
    const face = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.quaternion);
    assert.ok(face.y > 0.9, "lying actor faces the sky");
    const towardHead = new THREE.Vector3(0, 1, 0).applyQuaternion(actor.root.quaternion);
    assert.ok(towardHead.z * -Math.cos(slot.yaw) > 0.9, "head points toward the assigned pillow");
    finiteSkin(actor);
    if (isBed) {
      const object = mesh(actor), positions = object.geometry.attributes.position;
      const skinIndex = object.geometry.attributes.skinIndex, skinWeight = object.geometry.attributes.skinWeight;
      let upperChest = -Infinity, topOfFoot = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        let influence = 0, maximum = -1;
        for (let axis = 0; axis < 4; axis++) {
          const weight = skinWeight.array[i * 4 + axis];
          if (weight > maximum) { maximum = weight; influence = skinIndex.array[i * 4 + axis]; }
        }
        const name = object.skeleton.bones[influence].name;
        if (!/Spine[12]|Foot/.test(name)) continue;
        const y = object.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(object.matrixWorld).y;
        if (/Spine[12]/.test(name)) upperChest = Math.max(upperChest, y);
        if (/Foot/.test(name)) topOfFoot = Math.max(topOfFoot, y);
      }
      assert.ok(upperChest < 1.07, "shirt remains under the bed quilt");
      assert.ok(topOfFoot < 1.07, "shoes cannot poke through the quilt like detached feet");
      assert.ok(box.max.y > 1.4, "the head remains visible above the quilt");
    }
  }
  pool.dispose();
});

test("wave and hug animate the arms while preserving the repaired hands, and expire cleanly", async () => {
  const gltf = await model(), api = runtime(() => Promise.resolve(gltf)), pool = new api.BeachAvatarModels();
  await pool.load();
  const actor = pool.create(), upperArm = bone(actor, "RightArm"), armRest = upperArm.quaternion.clone();
  const hand = bone(actor, "RightHand"), handRest = hand.quaternion.clone();
  for (const kind of ["wave", "hug"]) {
    actor.playGesture(kind, { x: 2, z: 2 });
    for (let i = 0; i < 8; i++) actor.update(0.1, state());
    assert.ok(upperArm.quaternion.angleTo(armRest) > 0.2, `${kind} has a visible arm pose`);
    assert.ok(hand.quaternion.equals(handRest));
    finiteSkin(actor);
    for (let i = 0; i < 30; i++) actor.update(0.1, state());
    assert.ok(upperArm.quaternion.angleTo(armRest) < 1e-5, `${kind} returns to idle`);
  }
  pool.dispose();
});

test("the female rig uses retargeted walking, intact hands, and the same rest and care actions", async () => {
  const gltf = await model("female"), api = runtime(() => Promise.resolve(gltf), "female"), pool = new api.BeachAvatarModels("female");
  await pool.load();
  const actor = pool.create();
  assert.equal(actor.kind, "female");
  actor.update(0, state());
  const standing = new THREE.Box3().setFromObject(actor.root, true);
  assert.ok(Math.abs(standing.min.y) < 0.001);
  assert.ok(Math.abs(standing.max.y - 1.8) < 0.001);
  const hands = [];
  actor.root.traverse(o => { if (o.isBone && /(?:Hand|Thumb|Index|Middle|Ring|Pinky)/.test(o.name)) hands.push([o, o.quaternion.clone(), o.position.clone()]); });
  assert.ok(hands.length >= 2);
  const thigh = actor.root.getObjectByName("L_Thigh"), restThigh = thigh.quaternion.clone();
  for (let frame = 0; frame < 35; frame++) {
    actor.update(0.05, state({ moving: true }));
    for (const [hand, q, p] of hands) {
      assert.ok(hand.quaternion.equals(q), `${hand.name} keeps its own bind rotation`);
      assert.ok(hand.position.distanceTo(p) < 1e-6, `${hand.name} retains its own proportions`);
    }
    finiteSkin(actor);
    const box = new THREE.Box3().setFromObject(actor.root, true);
    assert.ok(box.max.y < 2.15 && box.min.y > -0.2, "walking cannot explode or shift the model vertically");
  }
  assert.ok(thigh.quaternion.angleTo(restThigh) > 0.05, "the retargeted walk moves the actual female rig");
  actor.update(0.1, state({ seated: { x: 2, z: 9, yaw: 0, avatarY: 0.7 } }));
  assert.ok(Math.abs(pelvisSurfacePoint(actor).y - 0.7) < 0.003);
  finiteSkin(actor);
  actor.update(0.1, state({ lying: { x: 7, z: 9.65, yaw: 0 } }));
  const back = actor.bodyContactY();
  assert.ok(Math.abs(back - 0.082) < 0.003, "the female back rests on the same mat surface");
  finiteSkin(actor);
  actor.update(0.1, state({ lying: { x: -1.9, z: 24.9, yaw: Math.PI, avatarY: 0.82, incline: 0.25 } }));
  assert.ok(Math.abs(actor.bodyContactY() - 0.62) < 0.003, "long hair does not lift the female body above the quilt");
  const bedBox = new THREE.Box3().setFromObject(actor.root, true);
  assert.ok(bedBox.max.y > 1.4, "her head remains above the quilt");
  const object = mesh(actor), skinWeights = object.geometry.attributes.skinWeight, skinJoints = object.geometry.attributes.skinIndex;
  let clothedTop = -Infinity;
  for (let i = 0; i < skinWeights.count; i++) {
    let weight = -1, joint = 0;
    for (let j = 0; j < 4; j++) if (skinWeights.getComponent(i, j) > weight) { weight = skinWeights.getComponent(i, j); joint = skinJoints.getComponent(i, j); }
    if (!/^(Waist|Spine0[12]|[LR]_(Thigh|Calf|Foot|ToeBase))$/.test(object.skeleton.bones[joint].name)) continue;
    clothedTop = Math.max(clothedTop, object.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(object.matrixWorld).y);
  }
  assert.ok(clothedTop < 1.07, "shirt, skirt and shoes stay beneath the shared quilt");
  actor.update(0.1, state());
  const arm = actor.root.getObjectByName("R_Upperarm"), restArm = arm.quaternion.clone();
  for (const kind of ["wave", "hug"]) {
    actor.playGesture(kind);
    for (let i = 0; i < 8; i++) actor.update(0.05, state());
    assert.ok(arm.quaternion.angleTo(restArm) > 0.15, `${kind} reaches the female arm aliases`);
    finiteSkin(actor);
    for (let i = 0; i < 30; i++) actor.update(0.1, state());
  }
  pool.dispose();
});

test("both models sit on every physical log by their pelvis surface and cache the contact pose", async () => {
  const benchSource = stripTypeScriptTypes(await readFile(new URL("../lib/beach/fire-benches.ts", import.meta.url), "utf8"))
    .replace(/^import\s+[^\n]+\n/gm, "").replace(/\bexport\s+(?=function\b|const\b)/g, "");
  const context = { THREE };
  vm.runInNewContext(`${benchSource}\nglobalThis.api={buildFireBenches,FIRE_BENCH_SEATS};`, context);
  const scene = new THREE.Scene();
  context.api.buildFireBenches(scene, []);
  scene.updateMatrixWorld(true);
  const logs = scene.getObjectByName("campfire-bench-logs");
  for (const kind of ["male", "female"]) {
    const gltf = await model(kind), api = runtime(() => Promise.resolve(gltf), kind), pool = new api.BeachAvatarModels(kind);
    await pool.load();
    const actor = pool.create(), measure = actor.seatedContact.bind(actor);
    let scans = 0;
    actor.seatedContact = () => { scans++; return measure(); };
    for (const seat of context.api.FIRE_BENCH_SEATS) {
      actor.update(0.1, state({ moving: true, seated: seat }));
      const support = pelvisSurfacePoint(actor);
      assert.ok(Math.abs(support.y - seat.avatarY) < 0.002, `${kind}/${seat.slot}: the body contacts the assigned surface`);
      const hit = new THREE.Raycaster(new THREE.Vector3(support.x, 2, support.z), new THREE.Vector3(0, -1, 0)).intersectObject(logs)[0];
      assert.ok(hit && Math.abs(hit.point.y - support.y) < 0.003, `${kind}/${seat.slot}: contact sits on the visible log, not an empty anchor`);
      const hips = actor.root.getObjectByName(kind === "male" ? "mixamorigHips" : "Hip").getWorldPosition(new THREE.Vector3());
      assert.ok(Math.hypot(hips.x - seat.x, hips.z - seat.z) < 0.001, "the pelvis is centered over its own half of the log");
      assert.ok(new THREE.Box3().setFromObject(actor.root, true).min.y >= -0.01, "hanging feet stay above the sand");
      actor.update(0.1, state({ seated: seat }));
    }
    assert.equal(scans, 1, "camera frames and seat changes reuse one contact measurement per actor");
    actor.update(0, state({ x: 2, z: 3, y: 0.18 }));
    assert.ok(Math.abs(new THREE.Box3().setFromObject(actor.root, true).min.y - 0.18) < 0.01, "standing restores normal ground placement");
    actor.update(0.1, state({ lying: { x: 7, z: 9.65, yaw: 0 } }));
    assert.ok(Math.abs(actor.bodyContactY() - 0.082) < 0.003, "seated contact never changes the lying support");
    pool.dispose();
  }
});

test("failed loading keeps the sprite fallback available, and late loads are disposed", async () => {
  const failed = runtime(() => Promise.reject(new Error("asset unavailable")));
  const fallback = new failed.BeachAvatarModels();
  await fallback.load();
  assert.equal(fallback.create(), null);
  fallback.dispose();
  const gltf = await model();
  let resolve, releases = 0;
  gltf.scene.traverse(object => { if (object.isMesh) object.geometry.addEventListener("dispose", () => releases++); });
  const late = runtime(() => new Promise(done => { resolve = done; })), pool = new late.BeachAvatarModels();
  const loading = pool.load();
  pool.dispose();
  resolve(gltf); await loading;
  assert.equal(pool.create(), null);
  assert.equal(releases, 1, "a model completing after navigation releases its buffers");
});

test("female onsen hair stays with the head during a hug instead of following hand and finger bones", async () => {
  const metadata = JSON.parse(await readFile(new URL("../public/beach/models/tripo-female-onsen-mobile-v1.json", import.meta.url), "utf8"));
  const repaired = metadata.hairRepair.vertexIndices;
  assert.equal(repaired.length, 4380);
  const gltf = await model("female-onsen"), api = runtime(() => Promise.resolve(gltf), "female-onsen"), pool = new api.BeachAvatarModels("female-onsen");
  await pool.load();
  const actor = pool.create(), object = mesh(actor), head = bone(actor, "Head");
  actor.update(0, state()); actor.root.updateMatrixWorld(true);
  const positions = object.geometry.attributes.position, joints = object.geometry.attributes.skinIndex, weights = object.geometry.attributes.skinWeight;
  const localPoint = index => object.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(head.matrixWorld.clone().invert());
  const before = new Map();
  for (const index of repaired) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < positions.count);
    for (let slot = 0; slot < 4; slot++) {
      const influence = object.skeleton.bones[joints.getComponent(index, slot)].name;
      if (/Arm|Hand|Shoulder/.test(influence)) assert.equal(weights.getComponent(index, slot), 0, "hair has no remaining arm/finger influence");
    }
    before.set(index, localPoint(index));
  }
  actor.playGesture("hug");
  for (let frame = 0; frame < 10; frame++) actor.update(0.05, state());
  actor.root.updateMatrixWorld(true);
  let maximumHairShift = 0;
  for (const [index, point] of before) maximumHairShift = Math.max(maximumHairShift, point.distanceTo(localPoint(index)));
  assert.ok(maximumHairShift < 0.025, `hair stays by the head while arms fold: ${maximumHairShift}`);
  finiteSkin(actor); pool.dispose();
});

for (const [kind, jointCount, triangleCount] of [["male-onsen", 44, 7969], ["female-onsen", 30, 6566]]) {
test(`${kind} loads independently and walks without changing its hand bind pose`, async () => {
  const gltf = await model(kind), api = runtime(() => Promise.resolve(gltf), kind), pool = new api.BeachAvatarModels(kind);
  assert.ok(gltf.animations.some(clip => /walk/i.test(clip.name)));
  assert.ok(gltf.animations.every(clip => clip.tracks.every(track => !/Hand/.test(track.name))), "retargeting never introduces hand or finger tracks");
  await Promise.all([pool.load(), pool.load()]);
  assert.equal(api.requests(), 1);
  const actor = pool.create(), second = pool.create();
  assert.equal(actor.kind, kind);
  assert.equal(mesh(actor).skeleton.bones.length, jointCount);
  assert.equal(mesh(actor).geometry.index.count / 3, triangleCount);
  assert.equal(mesh(actor).geometry.getAttribute("beachFacePosition"), undefined, "the different face retains its native texture without the everyday outfit's mask");
  assert.equal(mesh(actor).geometry, mesh(second).geometry);
  assert.notEqual(mesh(actor).skeleton, mesh(second).skeleton);
  actor.update(0, state({ y: 16.85 }));
  const bounds = new THREE.Box3().setFromObject(actor.root, true);
  assert.ok(Math.abs(bounds.min.y - 16.85) < 0.001);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - 1.8) < 0.001);
  const hands = [], hips = bone(actor, "Hips"), hipRest = hips.position.clone();
  actor.root.traverse(object => { if (/Hand/.test(object.name)) hands.push([object, object.position.clone(), object.quaternion.clone(), object.scale.clone()]); });
  assert.equal(hands.length, 42, "all articulated and unweighted hand helper nodes are retained");
  for (let frame = 0; frame < 36; frame++) {
    actor.update(0.1, state({ x: frame * 0.2, z: 45, y: 16.85, moving: true }));
    assert.ok(Math.abs(hips.position.x - hipRest.x) < 1e-7 && Math.abs(hips.position.z - hipRest.z) < 1e-7);
    for (const [hand, position, quaternion, scale] of hands) {
      assert.ok(hand.position.equals(position) && hand.quaternion.equals(quaternion) && hand.scale.equals(scale), hand.name);
    }
    finiteSkin(actor);
  }
  assert.notEqual(hips.position.y, hipRest.y);
  pool.dispose();
});

test(`${kind} reuses wave, hug, seat contact and lying poses with finite skinning`, async () => {
  const gltf = await model(kind), api = runtime(() => Promise.resolve(gltf), kind), pool = new api.BeachAvatarModels(kind);
  await pool.load();
  const actor = pool.create(), arm = bone(actor, "RightArm"), restArm = arm.quaternion.clone();
  for (const gesture of ["wave", "hug"]) {
    actor.playGesture(gesture);
    for (let step = 0; step < 8; step++) actor.update(0.05, state());
    assert.ok(arm.quaternion.angleTo(restArm) > 0.15, `${gesture} reaches the onsen skeleton`);
    finiteSkin(actor);
    for (let step = 0; step < 30; step++) actor.update(0.1, state());
  }
  actor.update(0.1, state({ seated: { x: 3, z: 8, yaw: 0, avatarY: 0.52 } }));
  assert.ok(Math.abs(pelvisSurfacePoint(actor).y - 0.52) < 0.003, "the garment follows the existing body-to-seat contact");
  finiteSkin(actor);
  actor.update(0.1, state({ lying: { x: 7, z: 9.65, yaw: 0, avatarY: 0.125 } }));
  assert.ok(Math.abs(actor.bodyContactY() - 0.125) < 0.003, "lying support follows the assigned surface height");
  finiteSkin(actor);
  actor.update(0, state({ x: 2, z: 45, y: 16.85 }));
  assert.ok(Math.abs(new THREE.Box3().setFromObject(actor.root, true).min.y - 16.85) < 0.01);
  pool.dispose();
});
}
