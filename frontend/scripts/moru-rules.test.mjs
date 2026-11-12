import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/moru-rules.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
const context = { Intl, Date, Math, Number };
vm.runInNewContext(`${source}\nglobalThis.rules = { koreaHour, dueMeals, mealStatus, dayPhase, isNightOutside, nightKey, lightsOff, isAsleep,
  rubStats, isTickle, isStartle, touchSpot, pickLine, hasBatchim, callName, subject, nickSubject, HUG_MS, STARTLE_TAPS, fullness, dustCount, dailySky, unitHash,
  shiftDate, moodDayValue, moodChipShift, moodStageOf, moodOf };`, context);
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

/* ---------- 마음 닮기 (docs/MORU_MOOD_SYNC.md 3장) ---------- */

const TODAY = "2026-11-12";
const flat = (score) => ({ mind: { score, note: "" }, body: { score, note: "" }, relation: { score, note: "" }, money: { score, note: "" }, work: { score, note: "" } });
/** 오늘에서 n일 전의 날짜 키 */
const ago = (n) => r.shiftDate(TODAY, -n);

test("dates shift across months and years", () => {
  assert.equal(r.shiftDate("2026-11-12", -1), "2026-11-11");
  assert.equal(r.shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(r.shiftDate("2026-01-01", -7), "2025-12-25");
  assert.equal(r.shiftDate("2026-12-31", 1), "2027-01-01");
});

test("a day's value weighs the mind twice and ignores what was not recorded", () => {
  assert.equal(r.moodDayValue(undefined), null);
  assert.equal(r.moodDayValue({}), null);
  assert.equal(r.moodDayValue({ money: { score: -4, note: "" } }), -4);
  assert.equal(r.moodDayValue({ mind: { score: -2, note: "" }, body: { score: -1, note: "" } }), -5 / 3);
  assert.equal(r.moodDayValue({ mind: { score: 3, note: "" }, c_custom: { score: 0, note: "" } }), 2);
  assert.equal(r.moodDayValue({ mind: { score: 99, note: "" } }), 5, "positions stay within the scale");
  assert.equal(r.moodDayValue({ mind: undefined, body: { score: "x" } }), null);
});

test("mood chips move the value by one step at most", () => {
  assert.equal(r.moodChipShift("지쳤어"), -1);
  assert.equal(r.moodChipShift("슬퍼, 불안해"), -1);
  assert.equal(r.moodChipShift("기뻐"), 1);
  assert.equal(r.moodChipShift("편안해, 지쳤어"), 0);
  assert.equal(r.moodChipShift("그저 그래"), 0);
  assert.equal(r.moodChipShift(undefined), 0);
});

test("five stages split the scale at -3, -1, +1 and +3", () => {
  assert.deepEqual([-5, -3, -2.99, -1, -0.99, 0, 0.99, 1, 2.99, 3, 5].map(r.moodStageOf), [1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5]);
});

test("a first record of all 'same as yesterday' is calm", () => {
  const mood = r.moodOf({ [TODAY]: flat(0) }, TODAY);
  assert.equal(mood.stage, 3);
  assert.equal(mood.recorded, true);
  assert.equal(mood.trend, null);
});

test("a low day with a tired chip sinks one stage", () => {
  const mood = r.moodOf({ [ago(1)]: flat(0), [TODAY]: { mind: { score: -2, note: "지쳤어" }, body: { score: -1, note: "" } } }, TODAY);
  assert.equal(mood.value, -2.17);
  assert.equal(mood.stage, 2);
});

test("a slow slide of -1 a day on the mind alone is noticed on the fourth day", () => {
  const journal = {};
  const stages = [];
  for (let day = 1; day <= 4; day++) {
    const key = ago(4 - day);
    journal[key] = { ...flat(0), mind: { score: -day, note: "" } };
    stages.push(r.moodOf(journal, key).stage);
  }
  assert.deepEqual(stages, [3, 3, 3, 2], "never chose worse than -1, yet the fourth day is low");
  assert.equal(r.moodOf(journal, TODAY).value, -1.13);
});

test("a hard day at the end of a low week reaches the lowest stage", () => {
  const journal = { [TODAY]: { mind: { score: -4, note: "슬퍼" }, body: { score: -3, note: "" }, relation: { score: -2, note: "" } } };
  for (let back = 1; back <= 7; back++) journal[ago(back)] = flat(-2);
  const mood = r.moodOf(journal, TODAY);
  assert.equal(mood.value, -3.87); // −3.875
  assert.equal(mood.stage, 1);
});

test("a good day on a good week is light, and a great one is happy", () => {
  const journal = { [ago(1)]: flat(1), [TODAY]: { ...flat(1), mind: { score: 3, note: "기뻐" }, relation: { score: 3, note: "" } } };
  assert.equal(r.moodOf(journal, TODAY).value, 2.7);
  assert.equal(r.moodOf(journal, TODAY).stage, 4);
  assert.equal(r.moodOf({ [ago(1)]: flat(3), [TODAY]: { ...flat(4), mind: { score: 4, note: "편안해" } } }, TODAY).stage, 5);
});

test("before today's record only an echo of recent days remains, within stages 2 to 4", () => {
  const low = {};
  for (let back = 1; back <= 5; back++) low[ago(back)] = flat(-2.4);
  const echo = r.moodOf(low, TODAY);
  assert.equal(echo.recorded, false);
  assert.equal(echo.value, -1.2);
  assert.equal(echo.stage, 2);
  assert.equal(r.moodOf({ [ago(1)]: flat(-5) }, TODAY).stage, 2, "the echo never reaches the lowest stage");
  assert.equal(r.moodOf({ [ago(1)]: flat(5) }, TODAY).stage, 4, "nor the highest");
  assert.equal(r.moodOf({ [ago(1)]: flat(-1.5) }, TODAY).stage, 3);
});

test("staying away is never punished: after three days without a record the mood is calm", () => {
  assert.equal(r.moodOf({ [ago(3)]: flat(-5) }, TODAY).stage, 2);
  assert.equal(r.moodOf({ [ago(4)]: flat(-5) }, TODAY).stage, 3);
  assert.equal(r.moodOf({ [ago(30)]: flat(-5) }, TODAY).stage, 3);
  assert.equal(r.moodOf({}, TODAY).stage, 3);
  assert.equal(r.moodOf(null, TODAY).stage, 3);
});
