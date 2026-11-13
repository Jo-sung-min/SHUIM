import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

// 방 안의 작은 사건 (lib/moru-happenings.ts): 날아드는 것 · 물어 온 것 · 화분 · 먼저 묻는 한마디의 규칙
const load = async (name) => stripTypeScriptTypes(await readFile(new URL(`../lib/${name}`, import.meta.url), "utf8"), { mode: "transform" })
  .replace(/^import .*$/gm, "").replace(/\bexport\s+/g, "");
const context = { Intl, Date, Math, Number, Object, Array, Boolean };
vm.runInNewContext(`${await load("moru-rules.ts")}\n${await load("moru-happenings.ts")}\nglobalThis.h = { KEEP_ITEMS, keepItem, DRIFT_KEEP_MAX, driftKind, driftDelay, driftPath, giftOf, CLOVER_CHANCE,
  BLOOM_WATERS, plantStage, FLOWER_COLORS, flowerColor, emptyHappenings, normalizeHappenings, canDrift, catchDrift, takeGift, wateredToday, waterPlant, pressFlower,
  GROW_TOTAL, GROW_STEPS, GROWERS, growStage, growerOf, tendedToday, tendGrower, growStatus, TENDED_LINE, GROWN_LINE,
  ASKS, askSlot, pickAsk, markAsked, DRIFT_LINES, GIFT_LINES, CLOVER_LINE, FEATHER_LINE, GROW_LINES, WATER_LINES, WATERED_LINE, BLOOMED_LINE, PRESS_LINE, SCRATCH_LINES, plantStatus, shiftDate, touchSpot };`, context);
const h = context.h;
const plain = (value) => JSON.parse(JSON.stringify(value));
const DAY = "2026-11-13";

test("what drifts in follows today's sky", () => {
  assert.equal(h.driftKind({ weather: "snow", land: "city", night: false }), "snowflake");
  assert.equal(h.driftKind({ weather: "snow", land: "forest", night: true }), "snowflake");
  assert.equal(h.driftKind({ weather: "rain", land: "city", night: true }), "leaf");
  assert.equal(h.driftKind({ weather: "clear", land: "city", night: true }), "starlight");
  assert.equal(h.driftKind({ weather: "clear", land: "forest", night: false }), "leaf");
  assert.equal(h.driftKind({ weather: "clear", land: "city", night: false }), "petal");
  for (const weather of ["rain", "snow", "clear"]) for (const land of ["city", "forest"]) for (const night of [false, true])
    assert.equal(h.keepItem(h.driftKind({ weather, land, night }))?.kind, "drift");
});

test("drifts come slowly, start away from the edges, and stop once today's five are kept", () => {
  assert.ok(h.driftDelay(true, false, () => 0) >= 18_000 && h.driftDelay(true, false, () => 0.999) <= 32_000);
  assert.ok(h.driftDelay(false, false, () => 0) >= 70_000 && h.driftDelay(false, false, () => 0.999) <= 130_000);
  assert.equal(h.driftDelay(false, true), 3000);
  for (const r of [0, 0.3, 0.999]) { const path = h.driftPath(() => r); assert.ok(path.x >= 16 && path.x <= 84 && Math.abs(path.sway) >= 18 && Math.abs(path.sway) <= 40); }
  let state = h.emptyHappenings(DAY);
  for (let i = 0; i < h.DRIFT_KEEP_MAX + 3; i++) state = h.catchDrift(state, "leaf");
  assert.equal(state.caught, h.DRIFT_KEEP_MAX);
  assert.equal(state.shelf.leaf, h.DRIFT_KEEP_MAX);
  assert.equal(h.canDrift(state), false);
  assert.equal(h.catchDrift(h.emptyHappenings(DAY), "acorn").caught, 0, "a gift is not something that drifts in");
  assert.equal(h.catchDrift(h.emptyHappenings(DAY), "nothing").caught, 0);
});

test("the day's gift is the same all day, differs between days, and only Moring brings a feather", () => {
  const days = Array.from({ length: 400 }, (_, i) => h.shiftDate("2026-01-01", i));
  const moru = days.map((d) => h.giftOf("user-1", d, "moru")), moring = days.map((d) => h.giftOf("user-1", d, "moring"));
  assert.equal(h.giftOf("user-1", DAY, "moring"), h.giftOf("user-1", DAY, "moring"));
  assert.ok(new Set(moru).size >= 5);
  assert.equal(moru.includes("feather"), false);
  assert.equal(moring.includes("feather"), true);
  for (const id of [...moru, ...moring]) assert.equal(h.keepItem(id)?.kind, "gift");
  const clovers = moru.filter((id) => id === "clover").length;
  assert.ok(clovers > 0 && clovers < 400 * h.CLOVER_CHANCE * 3, `clover is rare (${clovers}/400)`);
});

test("a gift is taken once a day", () => {
  let state = h.takeGift(h.emptyHappenings(DAY), "acorn");
  assert.equal(state.gift, true);
  assert.equal(state.shelf.acorn, 1);
  state = h.takeGift(state, "pebble");
  assert.deepEqual(plain(state.shelf), { acorn: 1 });
  assert.equal(h.takeGift(h.emptyHappenings(DAY), "leaf").gift, false, "a drift is not a gift");
});

test("the plant grows with one watering a day and blooms on the seventh", () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, n) => h.plantStage(n)), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  let state = h.emptyHappenings(DAY), day = DAY;
  const stages = [];
  for (let i = 0; i < h.BLOOM_WATERS; i++) {
    const first = h.waterPlant(state, day);
    assert.equal(first.done, true);
    const again = h.waterPlant(first.state, day);
    assert.equal(again.done, false, "only once a day");
    assert.equal(again.state, first.state);
    stages.push([first.stage, first.grew]);
    state = first.state;
    day = h.shiftDate(day, 1);
  }
  assert.deepEqual(stages, [[1, true], [1, false], [2, true], [2, false], [3, true], [3, false], [4, true]]);
  const bloomed = h.waterPlant(state, day);
  assert.equal(bloomed.done, false, "a flower needs no more water");
  assert.equal(bloomed.stage, 4);
});

test("skipped days cost nothing: the plant waits where it was", () => {
  const watered = h.waterPlant(h.waterPlant(h.emptyHappenings(DAY), DAY).state, h.shiftDate(DAY, 1)).state;
  const later = h.normalizeHappenings(plain(watered), h.shiftDate(DAY, 40));
  assert.equal(later.waters, 2);
  assert.equal(h.plantStage(later.waters), 1);
  assert.equal(h.waterPlant(later, h.shiftDate(DAY, 40)).state.waters, 3);
});

test("pressing a flower keeps it and starts a new seed in a different colour", () => {
  let state = { ...h.emptyHappenings(DAY), waters: 3 };
  assert.equal(h.pressFlower(state, "user-1", DAY), state, "only a flower can be pressed");
  state = { ...h.emptyHappenings(DAY), waters: h.BLOOM_WATERS, watered: DAY };
  const pressed = h.pressFlower(state, "user-1", DAY);
  assert.equal(pressed.waters, 0);
  assert.equal(pressed.seed, 1);
  assert.deepEqual(plain(pressed.flowers), [{ color: h.flowerColor("user-1", 0), day: DAY }]);
  assert.equal(h.waterPlant(pressed, DAY).done, false, "the new seed is watered from the next day");
  for (const who of ["user-1", "user-2", "abc", "zz"]) {
    const colours = Array.from({ length: 10 }, (_, seed) => h.flowerColor(who, seed));
    for (let i = 1; i < colours.length; i++) assert.notEqual(colours[i], colours[i - 1]);
    assert.equal(new Set(colours.slice(0, 5)).size, 5, "five pots show all five colours");
  }
});

test("stored state is repaired, and a new day clears only today's part", () => {
  assert.deepEqual(plain(h.normalizeHappenings(null, DAY)), plain(h.emptyHappenings(DAY)));
  assert.deepEqual(plain(h.normalizeHappenings("broken", DAY)), plain(h.emptyHappenings(DAY)));
  const messy = { day: DAY, caught: 99, gift: "yes", asked: ["day", "night", 3], watered: "soon", waters: 40, seed: -2,
    shelf: { leaf: 3.9, acorn: -1, hacked: 5, petal: "many" }, flowers: [{ color: "pink", day: DAY }, { color: "black", day: DAY }, null, { color: "sky", day: "x" }] };
  const fixed = h.normalizeHappenings(messy, DAY);
  assert.equal(fixed.caught, h.DRIFT_KEEP_MAX);
  assert.equal(fixed.gift, false);
  assert.deepEqual(plain(fixed.asked), ["day"]);
  assert.equal(fixed.watered, null);
  assert.equal(fixed.waters, h.BLOOM_WATERS);
  assert.equal(fixed.seed, 0);
  assert.deepEqual(plain(fixed.shelf), { leaf: 3 });
  assert.deepEqual(plain(fixed.flowers), [{ color: "pink", day: DAY }]);
  const yesterday = { day: DAY, caught: 4, gift: true, asked: ["day", "eve"], watered: DAY, waters: 5, seed: 2, shelf: { leaf: 4, acorn: 1 }, flowers: [{ color: "white", day: DAY }] };
  const next = h.normalizeHappenings(yesterday, h.shiftDate(DAY, 1));
  assert.deepEqual(plain(next), { day: h.shiftDate(DAY, 1), caught: 0, gift: false, asked: [], watered: DAY, waters: 5, seed: 2, shelf: { leaf: 4, acorn: 1 }, flowers: [{ color: "white", day: DAY }],
    grow: { tree: { n: 0, last: null }, moss: { n: 0, last: null } } });
});

test("a month-long grower takes thirty cares, one a day, and changes shape five times", () => {
  assert.equal(h.GROW_TOTAL, 30);
  assert.deepEqual(plain(h.GROW_STEPS), [1, 6, 14, 22, 30]);
  assert.deepEqual([0, 1, 5, 6, 13, 14, 21, 22, 29, 30, 99].map((n) => h.growStage(n)), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  for (const g of h.GROWERS) {
    assert.equal(g.stages.length, 6, g.id);
    assert.equal(g.grown.length, 6, g.id);
    let state = h.emptyHappenings(DAY), day = DAY;
    const changes = [];
    for (let i = 1; i <= h.GROW_TOTAL; i++) {
      const first = h.tendGrower(state, g.id, day);
      assert.equal(first.done, true, `${g.id} care ${i}`);
      assert.equal(h.tendedToday(first.state, g.id, day), true);
      const again = h.tendGrower(first.state, g.id, day);
      assert.equal(again.done, false, "only once a day");
      assert.equal(again.state, first.state);
      if (first.grew) changes.push([i, first.stage]);
      assert.equal(first.full, i === h.GROW_TOTAL);
      state = first.state;
      day = h.shiftDate(day, 1);
    }
    assert.deepEqual(changes, [[1, 1], [6, 2], [14, 3], [22, 4], [30, 5]]);
    const grown = h.tendGrower(state, g.id, day);
    assert.equal(grown.done, false);
    assert.equal(grown.full, true);
    assert.equal(state.grow[g.id].n, h.GROW_TOTAL);
    assert.equal(h.growStatus(state, g.id, day), "다 자랐어요");
  }
});

test("each grower keeps its own count, waits through skipped days, and survives a broken save", () => {
  let state = h.emptyHappenings(DAY);
  state = h.tendGrower(state, "tree", DAY).state;
  assert.equal(h.tendGrower(state, "moss", DAY).done, true, "caring for the tree does not use up the jar's day");
  state = h.tendGrower(state, "moss", DAY).state;
  assert.deepEqual(plain(state.grow), { tree: { n: 1, last: DAY }, moss: { n: 1, last: DAY } });
  assert.equal(h.growStatus(state, "tree", DAY), "오늘 돌봤어요 · 다 자라기까지 29번");
  const later = h.normalizeHappenings(plain(state), h.shiftDate(DAY, 50));
  assert.deepEqual(plain(later.grow), plain(state.grow), "nothing shrinks while away");
  assert.equal(h.growStatus(later, "moss", h.shiftDate(DAY, 50)), "기다려요 · 다 자라기까지 29번");
  assert.equal(h.tendGrower(later, "tree", h.shiftDate(DAY, 50)).state.grow.tree.n, 2);
  const messy = h.normalizeHappenings({ day: DAY, grow: { tree: { n: 999, last: "never" }, moss: "jar", rock: { n: 3, last: DAY } } }, DAY);
  assert.deepEqual(plain(messy.grow), { tree: { n: 30, last: null }, moss: { n: 0, last: null } });
  assert.deepEqual(plain(h.normalizeHappenings({ day: DAY }, DAY).grow), { tree: { n: 0, last: null }, moss: { n: 0, last: null } }, "saves from before the growers get empty ones");
  assert.equal(h.growerOf("tree").name, "작은 나무");
  assert.equal(h.growerOf("nothing"), undefined);
});

test("the friend asks only in the day and evening, never right after waking, at nap time or at night", () => {
  const slots = Array.from({ length: 24 }, (_, hour) => h.askSlot(hour));
  assert.equal(slots.slice(0, 8).every((s) => s === null), true);
  assert.equal(slots.slice(8, 15).every((s) => s === "day"), true);
  assert.equal(slots[15], null);
  assert.equal(slots[16], "day");
  assert.equal(slots.slice(17, 22).every((s) => s === "eve"), true);
  assert.equal(slots.slice(22).every((s) => s === null), true);
});

test("one question per slot, quieter ones on a low day, and none that cannot be answered", () => {
  const fresh = h.emptyHappenings(DAY);
  const ask = h.pickAsk("user-1", DAY, "day", fresh, { canBreathe: true });
  assert.ok(ask);
  assert.equal(h.pickAsk("user-1", DAY, "day", fresh, { canBreathe: true }).id, ask.id);
  assert.equal(h.pickAsk("user-1", DAY, "day", h.markAsked(fresh, "day"), { canBreathe: true }), null);
  assert.ok(h.pickAsk("user-1", DAY, "eve", h.markAsked(fresh, "day"), { canBreathe: true }), "the evening still has its own");
  assert.equal(h.pickAsk("user-1", DAY, null, fresh), null);
  assert.deepEqual(plain(h.markAsked(h.markAsked(fresh, "day"), "day").asked), ["day"]);
  const days = Array.from({ length: 200 }, (_, i) => h.shiftDate("2026-01-01", i));
  for (const slot of ["day", "eve"]) {
    const seen = new Set();
    for (const d of days) {
      const low = h.pickAsk("user-2", d, slot, h.emptyHappenings(d), { stage: 1, canBreathe: true });
      assert.equal(low.gentle, true, `${low.id} is asked on a low day`);
      const noBreath = h.pickAsk("user-2", d, slot, h.emptyHappenings(d), { canBreathe: false });
      assert.equal(noBreath.answers.some((a) => a.breathe), false);
      const any = h.pickAsk("user-2", d, slot, h.emptyHappenings(d), { canBreathe: true });
      assert.ok(!any.slot || any.slot === slot);
      seen.add(any.id);
    }
    assert.ok(seen.size >= 5, `${slot} rotates through its questions (${seen.size})`);
  }
});

test("every question has two short answers, and no line blames or hurries the user", () => {
  assert.equal(new Set(h.ASKS.map((a) => a.id)).size, h.ASKS.length);
  const lines = [...h.GIFT_LINES, h.CLOVER_LINE, h.FEATHER_LINE, ...h.WATER_LINES, h.WATERED_LINE, h.BLOOMED_LINE, h.PRESS_LINE, ...h.SCRATCH_LINES,
    ...Object.values(h.DRIFT_LINES).flat(), ...[1, 2, 3, 4].map((stage) => h.GROW_LINES[stage]),
    h.TENDED_LINE, h.GROWN_LINE, ...h.GROWERS.flatMap((g) => [...g.grown.slice(1), ...g.idle])];
  for (const ask of h.ASKS) {
    assert.equal(ask.answers.length, 2);
    assert.ok(ask.text.length <= 22, ask.text);
    for (const answer of ask.answers) { assert.ok(answer.label.length <= 10 && answer.reply.length <= 30, answer.reply); lines.push(answer.reply); }
    lines.push(ask.text);
  }
  for (const line of lines) {
    assert.ok(line && line.length <= 34, line);
    assert.doesNotMatch(line, /왜 |해야|빨리|안 왔|잊었|시들|죽/, line);
  }
  for (const kind of ["leaf", "petal", "snowflake", "starlight"]) assert.ok(h.DRIFT_LINES[kind].length >= 2);
});

test("the plant says where it is in one line", () => {
  const seed = h.emptyHappenings(DAY);
  assert.equal(h.plantStatus(seed, DAY), "물을 기다려요 · 꽃까지 7번");
  assert.equal(h.plantStatus(h.waterPlant(seed, DAY).state, DAY), "오늘 물을 줬어요 · 꽃까지 6번");
  assert.equal(h.plantStatus({ ...seed, waters: h.BLOOM_WATERS }, DAY), "꽃이 폈어요");
});

test("only Moring has a head to scratch; Moru keeps its sprout and the others their body", () => {
  assert.equal(h.touchSpot(0.2, true), "sprout");
  assert.equal(h.touchSpot(0.2, false), "body");
  assert.equal(h.touchSpot(0.2, false, true), "head");
  assert.equal(h.touchSpot(0.44, false, true), "head");
  assert.equal(h.touchSpot(0.5, false, true), "body");
  assert.equal(h.touchSpot(0.2, true, true), "sprout");
});
