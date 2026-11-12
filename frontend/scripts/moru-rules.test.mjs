import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/moru-rules.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
const context = { Intl, Date, Math, Number };
vm.runInNewContext(`${source}\nglobalThis.rules = { koreaHour, dueMeals, mealStatus, dayPhase, isNightOutside, nightKey, lightsOff, isAsleep,
  rubStats, isTickle, isStartle, touchSpot, pickLine, hasBatchim, callName, subject, nickSubject, HUG_MS, STARTLE_TAPS, fullness, dustCount, dailySky, unitHash };`, context);
const r = context.rules;

test("the clock is Korea time regardless of the device zone", () => {
  assert.equal(r.koreaHour(new Date("2026-11-12T00:30:00Z")), 9);
  assert.equal(r.koreaHour(new Date("2026-11-12T15:10:00Z")), 0);
  assert.equal(r.koreaHour(new Date("2026-11-12T14:59:00Z")), 23);
});

test("the day follows wake, day, nap, evening, sleepy and sleep", () => {
  const phases = Array.from({ length: 24 }, (_, hour) => r.dayPhase(hour));
  assert.equal(phases.slice(0, 7).every((p) => p === "sleep"), true);
  assert.equal(phases[7], "wake");
  assert.equal(phases.slice(8, 15).every((p) => p === "day"), true);
  assert.equal(phases[15], "nap");
  assert.equal(phases.slice(16, 19).every((p) => p === "day"), true);
  assert.equal(phases.slice(19, 22).every((p) => p === "evening"), true);
  assert.equal(phases.slice(22).every((p) => p === "sleepy"), true);
  assert.equal(r.isNightOutside("day"), false);
  assert.equal(["evening", "sleepy", "sleep"].every((p) => r.isNightOutside(p)), true);
});

test("one night keeps one key across midnight", () => {
  assert.equal(r.nightKey("2026-11-12", 23), "2026-11-12");
  assert.equal(r.nightKey("2026-11-13", 2), "2026-11-12");
  assert.equal(r.nightKey("2026-03-01", 3), "2026-02-28");
  assert.equal(r.nightKey("2026-01-01", 0), "2025-12-31");
  assert.equal(r.nightKey("2026-11-13", 7), "2026-11-13");
});

test("lights go off only when asked while sleepy, by themselves at night, never in the day", () => {
  assert.equal(r.lightsOff("sleepy", null), false);
  assert.equal(r.lightsOff("sleepy", true), true);
  assert.equal(r.lightsOff("sleep", null), true);
  assert.equal(r.lightsOff("sleep", false), false);
  assert.equal(r.lightsOff("day", true), false);
  assert.equal(r.isAsleep("sleepy", false), false);
  assert.equal(r.isAsleep("sleepy", true), true);
  assert.equal(r.isAsleep("sleep", false), true, "turning the light on at night does not wake Moru");
  assert.equal(r.isAsleep("nap", false), false);
});

test("the status line names the next meal and never invents a debt", () => {
  assert.equal(r.mealStatus(0, 5, 7), "다음 아침 8시");
  assert.equal(r.mealStatus(1, 5, 9), "다음 점심 13시");
  assert.equal(r.mealStatus(0, 0, 9), "밥 기다리는 중");
  assert.equal(r.mealStatus(2, 0, 14), "다음 저녁 19시");
  assert.equal(r.mealStatus(3, 0, 20), "오늘 식사 끝");
});

test("fullness empties two hearts per skipped meal and dust never exceeds three", () => {
  assert.equal(r.fullness(0, 7), 4, "nothing is due before breakfast");
  assert.equal(r.fullness(1, 9), 4);
  assert.equal(r.fullness(0, 9), 2);
  assert.equal(r.fullness(0, 14), 0);
  assert.equal(r.fullness(3, 23), 4);
  assert.equal(r.dustCount(4), 0);
  assert.equal(r.dustCount(3), 1);
  assert.equal(r.dustCount(0), 3);
});

test("rubbing back and forth tickles, a straight drag or a tremble does not", () => {
  assert.equal(r.isTickle(r.rubStats([0, 40, 80, 120, 160])), false);
  assert.equal(r.isTickle(r.rubStats([0, 40, 0, 40, 0])), true);
  assert.equal(r.rubStats([0, 1, 2, 1, 0]).travel, 0);
  assert.equal(r.isTickle(r.rubStats([0, 20, 0, 20])), false, "too short");
  assert.equal(r.rubStats([]).turns, 0);
});

test("only a fast burst of taps startles", () => {
  const burst = [0, 300, 600, 900, 1200, 1500];
  assert.equal(r.isStartle(burst, 1500), true);
  assert.equal(r.isStartle(burst.slice(1), 1500), false);
  assert.equal(r.isStartle(burst, 5000), false, "old taps do not count");
  assert.equal(r.STARTLE_TAPS, 6);
  assert.equal(r.HUG_MS >= 400, true);
});

test("the sprout is only the top of a sprouted companion", () => {
  assert.equal(r.touchSpot(0.1, true), "sprout");
  assert.equal(r.touchSpot(0.1, false), "body");
  assert.equal(r.touchSpot(0.5, true), "body");
});

test("lines do not repeat back to back", () => {
  assert.equal(r.pickLine(["a", "b"], "a", () => 0), "b");
  assert.equal(r.pickLine(["a", "b"], "b", () => 0.99), "a");
  assert.equal(r.pickLine(["a"], "a", () => 0.5), "a");
  assert.equal(r.pickLine(["a", "b", "c"], null, () => 0.99), "c");
});

test("names are called with the right particle", () => {
  assert.equal(r.callName("민수"), "민수야, ");
  assert.equal(r.callName(" 지민 "), "지민아, ");
  assert.equal(r.callName(""), "");
  assert.equal(r.subject("모루"), "모루가");
  assert.equal(r.subject("별님"), "별님이");
  assert.equal(r.nickSubject("먕먕"), "먕먕이가");
  assert.equal(r.nickSubject("모루"), "모루가");
  assert.equal(r.hasBatchim("Moru"), false);
});

test("today's sky is random per account and day, but fixed within a day", () => {
  assert.deepEqual(r.dailySky("user-a", "2026-11-12"), r.dailySky("user-a", "2026-11-12"));
  const seen = { rain: 0, clear: 0, snow: 0, city: 0, forest: 0 };
  for (let d = 1; d <= 400; d++) {
    const sky = r.dailySky("user-a", `2026-day-${d}`);
    seen[sky.weather]++; seen[sky.land]++;
  }
  for (const key of Object.keys(seen)) assert.ok(seen[key] > 30, `${key} appears ${seen[key]} times`);
  const people = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(r.dailySky(`user-${i}`, "2026-11-12"))));
  assert.ok(people.size > 1, "different accounts can get different skies on the same day");
});
