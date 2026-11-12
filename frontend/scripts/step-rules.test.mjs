import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/step-rules.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
const context = { Math, Array, String, Object };
vm.runInNewContext(`${source}\nglobalThis.rules = { STEPS, STEP_TEXT_MAX, STEP_LOG_MAX, BREATH_STEP_ID, ENERGY_OPTIONS, AFTER_OPTIONS, WHEN_OPTIONS, KIND_LABEL, STEP_LINES, EMPTY_STEPS,
  stepById, customStep, stepHash, easedEnergy, pickSteps, refOf, planLine, normalizeSteps, entriesOn, lastAfterOn, finishStep, mergeDid, elapsedLabel, afterLabel };`, context);
const r = context.rules;
const json = (value) => JSON.parse(JSON.stringify(value));
const PRESETS = ["산책", "운동", "일찍 잠", "계좌 안 봄", "사람 만남", "책 읽음", "집 정리", "밥 챙겨 먹음", "할 일 하나 끝냄", "폰 멀리 둠"];
const DAY = "2026-11-12";

test("the list covers every energy level with several kinds and fits the 'did' chip limit", () => {
  assert.equal(new Set(r.STEPS.map((s) => s.id)).size, r.STEPS.length);
  for (const energy of [1, 2, 3]) {
    const steps = r.STEPS.filter((s) => s.energy === energy);
    assert.ok(steps.length >= 12, `energy ${energy} has ${steps.length}`);
    assert.ok(new Set(steps.map((s) => s.kind)).size >= 4);
  }
  for (const s of r.STEPS) {
    assert.ok(s.text.length > 0 && s.text.length <= r.STEP_TEXT_MAX, s.id);
    assert.ok(s.did.length > 0 && s.did.length <= 12, `${s.id} did`);
    assert.ok(r.KIND_LABEL[s.kind], s.id);
    assert.ok(s.min >= 1);
  }
  // The lowest level never asks someone to leave the room or take long.
  assert.equal(r.STEPS.filter((s) => s.energy === 1).every((s) => s.min <= 3 && !s.href), true);
  // Walks and tidying land on the existing preset chips so later counts group together.
  assert.equal(PRESETS.includes(r.stepById("walk-5").did), true);
  assert.equal(PRESETS.includes(r.stepById("desk-three").did), true);
  assert.equal(r.stepById("comfort").href, "/c/home");
});

test("the words never promise a cure, diagnose, or blame", () => {
  const words = JSON.stringify([r.STEPS.map((s) => [s.text, s.did]), r.STEP_LINES, r.ENERGY_OPTIONS, r.AFTER_OPTIONS, r.WHEN_OPTIONS]);
  for (const banned of ["치료", "우울증", "진단", "처방", "완화", "개선", "왜 안", "해야 해", "실패"]) assert.equal(words.includes(banned), false, banned);
});

test("three cards per page, distinct kinds, the same all day, and 'more' moves on", () => {
  for (const energy of [1, 2, 3]) {
    const first = r.pickSteps(energy, DAY, 0);
    assert.equal(first.length, 3);
    assert.equal(first.every((s) => s.energy === energy), true);
    assert.equal(new Set(first.map((s) => s.kind)).size, 3);
    assert.deepEqual(json(r.pickSteps(energy, DAY, 0)), json(first));
    const second = r.pickSteps(energy, DAY, 1);
    assert.equal(second.length, 3);
    assert.equal(second.some((s) => first.some((f) => f.id === s.id)), false);
  }
  // Paging wraps around instead of running out.
  const pages = Array.from({ length: 12 }, (_, round) => r.pickSteps(2, DAY, round));
  assert.equal(pages.every((p) => p.length === 3 && new Set(p.map((s) => s.id)).size === 3), true);
  const firstIds = pages[0].map((s) => s.id).join();
  const pageCount = pages.findIndex((p, i) => i > 0 && p.map((s) => s.id).join() === firstIds);
  assert.ok(pageCount >= 4, `pages ${pageCount}`);
  assert.deepEqual(json(r.pickSteps(2, DAY, -1)), json(pages[pageCount - 1]));
});

test("breathing is the first card on the lowest level until it is done today", () => {
  for (const day of [DAY, "2026-11-13", "2027-01-01"]) assert.equal(r.pickSteps(1, day, 0)[0].id, r.BREATH_STEP_ID);
  assert.equal(r.pickSteps(1, DAY, 0, [r.BREATH_STEP_ID]).some((s) => s.id === r.BREATH_STEP_ID), false);
});

test("steps already done today are left out while enough remain, then come back", () => {
  const level = r.STEPS.filter((s) => s.energy === 3).map((s) => s.id);
  const done = level.slice(0, 5);
  for (let round = 0; round < 4; round++) assert.equal(r.pickSteps(3, DAY, round, done).some((s) => done.includes(s.id)), false);
  assert.equal(r.pickSteps(3, DAY, 0, level.slice(0, level.length - 2)).length, 3);
  assert.equal(r.pickSteps(3, DAY, 0, level).length, 3);
});

test("after 'worse', the next cards are one level easier, never below the lowest", () => {
  assert.equal(r.easedEnergy(3, -1), 2);
  assert.equal(r.easedEnergy(2, -1), 1);
  assert.equal(r.easedEnergy(1, -1), 1);
  assert.equal(r.easedEnergy(3, 0), 3);
  assert.equal(r.easedEnergy(3, 1), 3);
  assert.equal(r.easedEnergy(2, null), 2);
});

test("a custom step is trimmed and capped; an empty one is nothing", () => {
  assert.equal(r.customStep("   ", 2), null);
  const step = r.customStep(`  ${"가".repeat(60)}  `, 1);
  assert.equal(step.text.length, r.STEP_TEXT_MAX);
  assert.equal(step.did, step.text);
  assert.equal(step.id, "custom");
});

test("finishing adds one entry, clears 'doing', and clears only the matching plan", () => {
  const water = r.refOf(r.stepById("water"));
  const walk = r.refOf(r.stepById("walk-5"));
  const plan = { step: walk, energy: 3, when: "밥 먹고 나서", due: DAY };
  const start = { log: [], plan, doing: { step: water, energy: 1, date: DAY, startedAt: 1 } };
  const afterWater = r.finishStep(start, water, 1, 0, DAY, 10);
  assert.deepEqual(json(afterWater.log), [{ date: DAY, stepId: "water", text: "물 한 잔 마시기", did: "물 한 잔", energy: 1, after: 0, at: 10 }]);
  assert.equal(afterWater.doing, null);
  assert.deepEqual(json(afterWater.plan), json(plan));
  const afterWalk = r.finishStep(afterWater, walk, 3, 1, DAY, 20);
  assert.equal(afterWalk.plan, null);
  assert.equal(afterWalk.log.length, 2);
  assert.equal(r.lastAfterOn(afterWalk, DAY), 1);
  assert.equal(r.lastAfterOn(afterWalk, "2026-11-13"), null);
  assert.equal(r.entriesOn(afterWalk, DAY).length, 2);
  assert.equal(r.planLine(plan), "밥 먹고 나서 → 집 앞까지 5분 걷기");
  // The input is not mutated.
  assert.equal(start.log.length, 0);
});

test("the log keeps only the most recent entries", () => {
  let state = r.EMPTY_STEPS;
  const water = r.refOf(r.stepById("water"));
  for (let i = 0; i < r.STEP_LOG_MAX + 15; i++) state = r.finishStep(state, water, 1, 1, DAY, i);
  assert.equal(state.log.length, r.STEP_LOG_MAX);
  assert.equal(state.log[0].at, 15);
});

test("stored values are repaired: bad rows dropped, yesterday's 'doing' cleared, links trusted only from the list", () => {
  assert.deepEqual(json(r.normalizeSteps(null, DAY)), { log: [], plan: null, doing: null });
  assert.deepEqual(json(r.normalizeSteps("oops", DAY)), { log: [], plan: null, doing: null });
  const raw = {
    log: [
      { date: DAY, stepId: "water", text: "물 한 잔 마시기", did: "물 한 잔", energy: 1, after: 1, at: 5 },
      { date: "today", stepId: "water", text: "x", did: "x", energy: 1, after: 1, at: 5 },
      { date: DAY, stepId: "water", text: "x", did: "x", energy: 4, after: 1, at: 5 },
      { date: DAY, stepId: "water", text: "x", did: "x", energy: 1, after: 2, at: 5 },
      null,
    ],
    plan: { step: { id: "custom", text: "화분에 물 주기", did: "화분에 물 주기", href: "https://example.com" }, energy: 2, when: "자기 전에", due: DAY },
    doing: { step: { id: "comfort", text: "외침에 위로 한마디 남기기", did: "위로 한마디", href: "/elsewhere" }, energy: 3, date: "2026-11-11", startedAt: 1 },
  };
  const fixed = r.normalizeSteps(raw, DAY);
  assert.equal(fixed.log.length, 1);
  assert.equal(fixed.plan.step.href, undefined);
  assert.equal(fixed.plan.when, "자기 전에");
  assert.equal(fixed.doing, null);
  const sameDay = r.normalizeSteps({ ...raw, doing: { ...raw.doing, date: DAY } }, DAY);
  assert.equal(sameDay.doing.step.href, "/c/home");
  assert.equal(r.normalizeSteps({ plan: { step: { id: "water", text: "", did: "물" }, energy: 1, when: "자기 전에", due: DAY } }, DAY).plan, null);
  assert.equal(r.normalizeSteps({ doing: { step: { id: "breath", text: "1분 숨 고르기", did: "숨 고르기" }, energy: 1, date: DAY, startedAt: 3 } }, DAY).doing.step.breath, true);
});

test("'did' gains the name once and returns the same array when nothing changes", () => {
  const did = ["산책"];
  assert.equal(r.mergeDid(did, "산책"), did);
  assert.equal(r.mergeDid(did, "  "), did);
  assert.deepEqual(json(r.mergeDid(did, " 물 한 잔 ")), ["산책", "물 한 잔"]);
  assert.equal(r.mergeDid([], "가".repeat(80))[0].length, r.STEP_TEXT_MAX);
});

test("elapsed time stays quiet: minutes only", () => {
  assert.equal(r.elapsedLabel(0, 59_000), "방금 시작했어요");
  assert.equal(r.elapsedLabel(0, 60_000), "1분째");
  assert.equal(r.elapsedLabel(0, 12 * 60_000 + 30_000), "12분째");
  assert.equal(r.elapsedLabel(100, 0), "방금 시작했어요");
  assert.equal(r.afterLabel(-1), "더 가라앉았어");
  assert.equal(r.afterLabel(1), "조금 나아");
});

test("the hash is stable and spread over [0, 1)", () => {
  assert.equal(r.stepHash("2026-11-12|water"), r.stepHash("2026-11-12|water"));
  const values = r.STEPS.map((s) => r.stepHash(`${DAY}|${s.id}`));
  assert.equal(values.every((v) => v >= 0 && v < 1), true);
  assert.ok(new Set(values).size === values.length);
});
