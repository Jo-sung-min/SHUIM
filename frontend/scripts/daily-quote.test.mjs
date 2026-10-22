import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/daily-quote.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const context = { Date, Math };
vm.runInNewContext(source + "\nglobalThis.quotes = { dailyQuote, millisecondsUntilNextQuote };", context);
const { dailyQuote, millisecondsUntilNextQuote } = context.quotes;

test("the first sentence stays the same throughout the launch day in Korea", () => {
  const beginning = new Date("2026-10-22T15:00:00.000Z");
  const end = new Date("2026-10-23T14:59:59.999Z");
  assert.equal(dailyQuote(beginning).id, "happy-sisyphus");
  assert.equal(dailyQuote(end).id, dailyQuote(beginning).id);
});

test("the sentence changes at Korean midnight, not UTC midnight", () => {
  const before = new Date("2026-10-23T14:59:59.999Z");
  const after = new Date("2026-10-23T15:00:00.000Z");
  assert.equal(dailyQuote(after).id, "the-ascent");
  assert.notEqual(dailyQuote(after).id, dailyQuote(before).id);
  assert.equal(millisecondsUntilNextQuote(before), 1);
  assert.equal(millisecondsUntilNextQuote(after), 86_400_000);
});

test("equivalent instants in different timezones choose the same sentence", () => {
  assert.equal(dailyQuote(new Date("2026-10-25T09:00:00+09:00")).id, dailyQuote(new Date("2026-10-24T17:00:00-07:00")).id);
});

test("a week includes all seven sentences then repeats, including days before the anchor", () => {
  const start = Date.parse("2026-10-22T15:00:00Z");
  const ids = Array.from({ length: 7 }, (_, i) => dailyQuote(new Date(start + i * 86_400_000)).id);
  assert.equal(new Set(ids).size, 7);
  assert.equal(dailyQuote(new Date(start + 7 * 86_400_000)).id, ids[0]);
  assert.equal(dailyQuote(new Date(start - 86_400_000)).id, ids[6]);
});
