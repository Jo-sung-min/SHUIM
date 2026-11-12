import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

// 모링의 표정 띠 고르기 (lib/moring.ts): 기분 다섯 단계와 말 걸기 기분마다 어느 띠가 보이는지
const typed = await readFile(new URL("../lib/moring.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
const context = { Object };
vm.runInNewContext(`${source}\nglobalThis.moring = { MORING_LOOPS, MORING_REST, MORING_TALK, moringLoop };`, context);
const { MORING_LOOPS, MORING_REST, MORING_TALK, moringLoop } = context.moring;

test("each mood stage has its own resting face, and 2~3 keep the original half-closed eyes", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((stage) => moringLoop("idle", stage)), ["gloomy", "idle", "idle", "light", "joy"]);
  assert.equal(moringLoop("idle"), "idle");
  assert.equal(moringLoop("idle", 9), "idle");
});

test("every talk topic gets a face, and the face only shows while the talk reaction lasts", async () => {
  const moru = await readFile(new URL("../lib/moru.ts", import.meta.url), "utf8");
  const block = moru.slice(moru.indexOf("export const TALK_TOPICS"), moru.indexOf("];", moru.indexOf("export const TALK_TOPICS")));
  const ids = [...block.matchAll(/\{ id: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["tired", "happy", "sad", "anxious", "bored", "just"]);
  for (const id of ids) assert.ok(MORING_LOOPS.includes(MORING_TALK[id]), id);
  assert.deepEqual(ids.map((id) => moringLoop("pet", 3, id)), ["cozy", "happy", "worry", "cozy", "curious", "light"]);
  // 반응이 끝나 평소로 돌아오면 그날의 기분, 손길 반응은 웃음
  assert.equal(moringLoop("idle", 1, "sad"), "gloomy");
  assert.equal(moringLoop("pet", 1, null), "happy");
  assert.equal(moringLoop("pet", 3, "unknown"), "happy");
  assert.equal(moringLoop("pet", 3, "constructor"), "happy");
});

test("sleeping and eating win over any mood or talk", () => {
  for (const stage of [1, 3, 5]) {
    assert.equal(moringLoop("sleep", stage, "bored"), "sleep");
    assert.equal(moringLoop("eat", stage, "sad"), "eat");
  }
  assert.equal(moringLoop("happy", 1, "sad"), "happy");
});

test("no crying face, and every face is a published CDN strip", async () => {
  for (const name of MORING_LOOPS) assert.doesNotMatch(name, /cry|tear|sob/);
  assert.equal(new Set([...Object.values(MORING_REST), ...Object.values(MORING_TALK)]).size <= MORING_LOOPS.length, true);
  const manifest = JSON.parse(await readFile(new URL("../public-assets.manifest.json", import.meta.url), "utf8"));
  const keys = new Set(manifest.files.map((f) => f.key));
  // Array.from: the list comes from the vm realm, and strict deepEqual compares prototypes
  const missing = Array.from(MORING_LOOPS, (name) => `moru/moring/moring-${name}-v1.webp`).filter((key) => !keys.has(key));
  assert.deepEqual(missing, [], "upload with: python scripts/sync-public-assets.py --apply --only moru/moring/");
});
