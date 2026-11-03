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
const { FirePowderPlayback } = await load("../lib/beach/fire-powder.ts", {}, ["FirePowderPlayback"]);
const { CoastalFire } = await load("../lib/beach/fire.ts", { THREE }, ["CoastalFire"]);
const event = (id, startedAt = 100_000, color = "rainbow") => ({ id, color, startedAt, expiresAt: startedAt + 90_000 });
const state = (serverTime, powder = null) => ({ serverTime, powderEnabled: true, powder });

test("joining an active powder applies its color without replaying a toss; new events play once", () => {
  const playback = new FirePowderPlayback();
  assert.equal(playback.sync(state(105_000, event("existing")), 0).burst, null);
  assert.equal(playback.sample(0).color, "rainbow");
  assert.equal(playback.sync(state(106_000, event("new", 106_000, "ocean")), 1_000).burst, "ocean");
  assert.equal(playback.sync(state(106_500, event("new", 106_000, "ocean")), 1_500).burst, null);
  assert.equal(playback.sync(state(107_000, event("old", 90_000, "rose")), 2_000).burst, null, "a stale event is never thrown again");
});

test("older snapshots cannot roll back a powder or trigger stale effects", () => {
  const playback = new FirePowderPlayback();
  playback.sync(state(100_000), 0);
  playback.sync(state(102_000, event("current", 102_000, "violet")), 2_000);
  assert.equal(playback.sync(state(101_000, event("stale", 101_000, "rose")), 2_100).accepted, false);
  assert.equal(playback.sample(2_100).color, "violet");
});

test("cached equal server timestamps never rewind rainbow phase or extend expiry", () => {
  const playback = new FirePowderPlayback();
  playback.sync(state(100_000, event("cached")), 5_000);
  const before = playback.sample(5_500).hue;
  playback.sync(state(100_000, event("cached")), 5_500);
  assert.equal(playback.sample(5_500).hue, before);
  assert.ok(playback.sample(6_000).hue > before);
  playback.sync(state(100_000, event("cached")), 95_000);
  assert.equal(playback.sample(95_000).color, null);
});

test("server-time rainbow phase matches across clients and fades back before its90s expiry", () => {
  const first = new FirePowderPlayback(), second = new FirePowderPlayback();
  first.sync(state(110_000, event("shared")), 500);
  second.sync(state(115_000, event("shared")), 8_000);
  assert.equal(first.sample(5_500).hue, second.sample(8_000).hue);
  assert.equal(first.sample(78_000).weight, 1);
  assert.ok(first.sample(79_500).weight > 0 && first.sample(79_500).weight < 1);
  assert.equal(first.sample(80_500).color, null);
});

test("powder grains follow one finite burst, with flare delayed until they reach the fire", () => {
  const scene = new THREE.Scene(), fire = new CoastalFire(scene, 0, 12), camera = new THREE.PerspectiveCamera();
  const grains = scene.getObjectByName("campfire-powder-grains");
  fire.update(0, camera);
  assert.equal(grains.visible, false);
  fire.tossPowder("aurora", new THREE.Vector3(0, 1.55, 8));
  fire.update(0.2, camera);
  assert.equal(grains.visible, true);
  assert.equal(fire.flareAmount, 0);
  fire.update(0.8, camera);
  assert.ok(fire.flareAmount > 0);
  const firstFlare = fire.flareAmount;
  fire.setState(6, "amber"); fire.update(0.9, camera);
  assert.ok(fire.flareAmount < firstFlare, "polling a state cannot throw or flare a second time");
  fire.update(2.6, camera);
  assert.equal(grains.visible, false);
});

test("rainbow changes smoothly and expiry restores the underlying paid palette", () => {
  const fire = new CoastalFire(new THREE.Scene(), 0, 0), camera = new THREE.PerspectiveCamera();
  fire.setState(6, "rose");
  fire.setPowder({ color: "rainbow", weight: 1, hue: 0.1 });
  for (let i = 0; i < 120; i++) fire.update(i / 60, camera);
  const before = fire.lightColor.clone();
  fire.setPowder({ color: "rainbow", weight: 1, hue: 0.55 });
  fire.update(2, camera);
  const change = Math.max(Math.abs(fire.lightColor.r - before.r), Math.abs(fire.lightColor.g - before.g), Math.abs(fire.lightColor.b - before.b));
  assert.ok(change > 0 && change < 0.15, `color begins interpolating without an instant flash (${change})`);
  for (let i = 121; i < 240; i++) fire.update(i / 60, camera);
  assert.notEqual(fire.lightColor.getHex(), before.getHex());
  fire.setPowder({ color: null, weight: 0, hue: 0 });
  for (let i = 240; i < 480; i++) fire.update(i / 60, camera);
  assert.equal(fire.targetColors[1].getHex(), 0xff739f, "paid rose remains underneath the temporary overlay");
});

test("the fire keeps crossed logs, separate tongues and a bounded sparse particle budget", () => {
  const scene = new THREE.Scene(), fire = new CoastalFire(scene, 0, 12);
  fire.setState(12, "amber");
  const logs = scene.getObjectByName("campfire-charred-logs");
  assert.equal(logs.count, 12);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  logs.getMatrixAt(0, a); logs.getMatrixAt(1, b);
  const first = new THREE.Vector3(0, 1, 0).transformDirection(a), second = new THREE.Vector3(0, 1, 0).transformDirection(b);
  assert.ok(Math.abs(first.dot(second)) < 0.8, "wood is stacked across different axes instead of parallel cylinders");
  assert.equal(scene.getObjectByName("campfire-tongues").count, 17);
  assert.ok(scene.getObjectByName("campfire-embers").geometry.getAttribute("position").count <= 24);
  assert.ok(scene.getObjectByName("campfire-smoke").geometry.getAttribute("position").count <= 12);
});
