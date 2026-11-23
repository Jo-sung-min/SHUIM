import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const typed = await readFile(new URL("../lib/kkomi-lines.ts", import.meta.url), "utf8");
const js = stripTypeScriptTypes(typed, { mode: "transform" });
const { kkomiLine, kkomiStage } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const stages = [0, 3, 8, 16];
const actions = ["idle", "greet", "touch", "hug", "tickle", "talk", "snack", "sleep", "praise", "love"];

test("affinity boundaries include old or missing state", () => {
  for (const value of [undefined, NaN, -5, 0, 2]) assert.equal(kkomiStage(value), "guarded");
  for (const value of [3, 7]) assert.equal(kkomiStage(value), "warming");
  for (const value of [8, 15]) assert.equal(kkomiStage(value), "trusting");
  for (const value of [16, 100]) assert.equal(kkomiStage(value), "close");
});

test("each interaction has stage-specific replies and reproducible variants", () => {
  for (const action of actions) {
    const replies = stages.flatMap(affinity => [0, 1].map(seed => kkomiLine(action, affinity, seed)));
    assert.equal(replies.every(reply => typeof reply === "string" && reply.trim()), true);
    assert.equal(new Set(replies).size, replies.length, action);
    assert.equal(kkomiLine(action, 0, 0), kkomiLine(action, 0, 2));
  }
  for (const score of stages) assert.equal(kkomiLine("feed", score), kkomiLine("snack", score));
});

test("first touch hisses, close touch welcomes, and praise differs from love", () => {
  for (const seed of [0, 1]) {
    assert.match(kkomiLine("touch", 0, seed), /카앜!/);
    assert.doesNotMatch(kkomiLine("touch", 16, seed), /카앜/);
    for (const score of stages) assert.notEqual(kkomiLine("praise", score, seed), kkomiLine("love", score, seed));
  }
});

test("talk responds to a named mood through every stage", () => {
  for (const mood of ["tired", "happy", "sad", "anxious", "bored"]) {
    const replies = stages.map(score => kkomiLine("talk", score, 0, mood));
    assert.equal(new Set(replies).size, stages.length);
    stages.forEach((score, i) => assert.notEqual(replies[i], kkomiLine("talk", score)));
  }
  for (const unknown of ["just", "toString", null]) assert.equal(kkomiLine("talk", 0, 1, unknown), kkomiLine("talk", 0, 1));
});
