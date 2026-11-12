import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import ts from "typescript";

const datesSource = await readFile(new URL("../lib/dates.ts", import.meta.url), "utf8");
const contextSource = await readFile(new URL("../lib/today-context.ts", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../lib/use-current-day.ts", import.meta.url), "utf8");
function plain(source) {
  return stripTypeScriptTypes(source).replace(/^import .*;\r?\n/gm, "").replace(/\bexport\s+(?=function\b|const\b)/g, "");
}
const context = { Date, Math };
vm.runInNewContext(`${plain(datesSource)}\n${plain(contextSource)}\nglobalThis.api = { buildTodayContext, currentAiResult, summaryEntries, AI_CONTEXT_VERSION };`, context);
const { buildTodayContext, currentAiResult, summaryEntries, AI_CONTEXT_VERSION } = context.api;
const json = (value) => JSON.parse(JSON.stringify(value));
const timestamp = (day, hour = 12) => new Date(2026, 10, day, hour).getTime();
const records = () => ({ journal: {}, log: {}, memos: [], goals: [], schedule: [] });
const memo = (id, day, extra = {}) => ({ id, cat: "work", text: id, pinned: false, createdAt: timestamp(day), updatedAt: timestamp(day), ...extra });

test("today and historical actions stay separated, including days with actions but no journal", () => {
  const data = records();
  data.journal = {
    "2026-10-27": { work: { score: 1, note: "too old" } },
    "2026-10-31": { work: { score: 1, note: "last week" } },
    "2026-11-04": { work: { score: 2, note: "today's note" } },
    "2026-11-05": { work: { score: 3, note: "future" } },
    "2026-11-00": { work: { score: 0, note: "invalid date" } },
  };
  data.log = { "2026-11-03": { did: ["yesterday's walk"] }, "2026-11-04": { did: ["today's rest"] }, "2026-11-05": { did: ["future"] } };
  const result = buildTodayContext(data, "2026-11-04");
  assert.deepEqual(json(result.today), data.journal["2026-11-04"]);
  assert.deepEqual(json(result.todayDid), ["today's rest"]);
  assert.deepEqual(json(result.recent.map((entry) => entry.date)), ["2026-10-31", "2026-11-03"]);
  assert.deepEqual(json(result.recent[1]), { date: "2026-11-03", record: {}, did: ["yesterday's walk"] });
});

test("editing or pinning a historical memo preserves its original date in every AI mode", () => {
  const data = records();
  data.memos = [memo("old edited today", 1, { pinned: true, updatedAt: timestamp(4) }), memo("today", 4),
    memo("undated", 1, { createdAt: NaN }), memo("future", 5)];
  const before = json(data);
  const result = buildTodayContext(data, "2026-11-04", true);
  assert.deepEqual(json(result.memos.map(({ text, date }) => ({ text, date }))), [
    { text: "today", date: "2026-11-04" }, { text: "old edited today", date: "2026-11-01" }, { text: "undated", date: null },
  ]);
  assert.equal(result.allMemos.find((entry) => entry.text === "old edited today").date, "2026-11-01");
  assert.equal(result.allMemos.find((entry) => entry.text === "undated").date, null);
  assert.equal(result.allMemos.some((entry) => entry.text === "future"), false);
  assert.deepEqual(json(data), before, "building context must not rewrite source records");
});

test("today's memo remains available when more than twenty historical memos are pinned", () => {
  const data = records();
  data.memos = [...Array.from({ length: 25 }, (_, i) => memo(`old-${i}`, 1, { pinned: true })), memo("today", 4)];
  const result = buildTodayContext(data, "2026-11-04", true);
  assert.equal(result.memos.length, 20);
  assert.equal(result.memos[0].text, "today");
  assert.equal(result.allMemos.length, 26, "review keeps the complete dated history");
});

test("moving to the next day moves yesterday's record into history without copying it into today", () => {
  const data = records();
  data.journal["2026-11-04"] = { work: { score: 2, note: "finished yesterday" } };
  data.log["2026-11-04"] = { did: ["finished yesterday"] };
  data.memos = [memo("written yesterday", 4)];
  const result = buildTodayContext(data, "2026-11-05");
  assert.deepEqual(json(result.today), {});
  assert.deepEqual(json(result.todayDid), []);
  assert.equal(result.recent[0].date, "2026-11-04");
  assert.equal(result.memos[0].date, "2026-11-04");
});

test("a same-day answer generated before the temporal fix is not reused", () => {
  const old = { date: "2026-11-04", data: { lines: ["old answer"] } };
  const current = { ...old, contextVersion: AI_CONTEXT_VERSION };
  assert.equal(currentAiResult(old, "2026-11-04"), null);
  assert.equal(currentAiResult({ ...old, contextVersion: AI_CONTEXT_VERSION - 1 }, "2026-11-04"), null);
  assert.equal(currentAiResult(current, "2026-11-05"), null);
  assert.equal(currentAiResult(current, "2026-11-04"), current);
  assert.equal(currentAiResult(null, "2026-11-04"), null);
  assert.equal(old.data.lines[0], "old answer");
});

test("summary dates use the explicit reference day, exclude future records, and keep calendar boundaries", () => {
  const journal = Object.fromEntries(["2026-10-28", "2026-10-29", "2026-10-32", "2026-11-03", "2026-11-04", "2026-11-05"].map((date) => [date, {}]));
  assert.deepEqual(json(summaryEntries(journal, "2026-11-04", 7).map((entry) => entry.date)), ["2026-10-29", "2026-11-03", "2026-11-04"]);
  assert.deepEqual(json(summaryEntries(journal, "2026-11-05", 7).map((entry) => entry.date)), ["2026-11-03", "2026-11-04", "2026-11-05"]);
});

function clockHarness(initialTime) {
  let now = initialTime;
  let state;
  let cleanup;
  let nextId = 0;
  const timers = new Map();
  const events = new Map();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const document = { hidden: false, addEventListener: (name, cb) => events.set(name, cb), removeEventListener: (name) => events.delete(name) };
  const ctx = {
    Date: ClockDate, Math, document,
    window: { addEventListener: (name, cb) => events.set(name, cb), removeEventListener: (name) => events.delete(name) },
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    useState: (initial) => { state = initial(); return [state, (value) => { state = value; }]; },
    useCallback: (callback) => callback,
    useEffect: (effect) => { cleanup = effect(); },
  };
  vm.runInNewContext(`${plain(datesSource)}\n${plain(hookSource)}\nglobalThis.api = useCurrentDay();`, ctx);
  return { get state() { return state; }, timers, events, document, advance: (time) => { now = time; }, refresh: ctx.api[1], cleanup: () => cleanup() };
}

test("an open page advances its record date at local midnight and releases listeners on unmount", () => {
  const harness = clockHarness(new Date(2026, 10, 4, 23, 59, 59, 999).getTime());
  assert.equal(harness.state, "2026-11-04");
  const timer = [...harness.timers.values()][0];
  assert.equal(timer.delay, 51);
  harness.advance(new Date(2026, 10, 5, 0, 0, 0, 50).getTime());
  timer.callback();
  assert.equal(harness.state, "2026-11-05");
  assert.equal(harness.timers.size, 1);
  harness.cleanup();
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.events.size, 0);
});

test("a resumed tab and a request after consent both recheck the actual calendar day", () => {
  const harness = clockHarness(timestamp(4));
  harness.advance(timestamp(5));
  harness.events.get("focus")();
  assert.equal(harness.state, "2026-11-05");
  harness.advance(timestamp(6));
  harness.document.hidden = true;
  harness.events.get("visibilitychange")();
  assert.equal(harness.state, "2026-11-05");
  harness.document.hidden = false;
  harness.events.get("visibilitychange")();
  assert.equal(harness.state, "2026-11-06");
  harness.advance(timestamp(7));
  assert.equal(harness.refresh(), "2026-11-07");
  assert.equal(harness.state, "2026-11-07");
  harness.cleanup();
});

// Execute the page's actual request/effect bodies so these tests cover the
// ordering of consent, fresh storage reads, and response guards, not a copy.
const homeText = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const summaryText = await readFile(new URL("../app/summary/page.tsx", import.meta.url), "utf8");
function pageFunction(source, predicate) {
  const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (predicate(node)) found = ts.isVariableDeclaration(node) ? node.initializer : node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, "the page function under test must exist");
  return ts.transpileModule(`globalThis.run = ${found.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const named = (name) => (node) => ts.isVariableDeclaration(node) && node.name.getText() === name;
const homeCall = pageFunction(homeText, named("call"));
const summaryRun = pageFunction(summaryText, named("run"));
const homeReload = pageFunction(homeText, (node) => ts.isCallExpression(node) && node.expression.getText() === "useEffect"
  && node.arguments[0]?.getText().includes("syncRecords()"));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const answer = () => ({ ok: true, json: async () => ({ source: "ai", crisis: false, moment: { lines: ["response"] }, summary: "response" }) });
function requestHarness(source, { consent = async () => true, network = async () => answer() } = {}) {
  let day = "2026-11-04";
  let user = "test-user";
  let latest = records();
  const saved = [];
  const requests = [];
  const state = {};
  const ctx = {
    Date, data: records(), companion: { name: "콩이", appearance: "moru" }, inFlight: { current: false }, running: { current: false }, lifecycle: { current: 0 },
    selection: { current: { sel: "all", range: 7 } }, sel: "all", range: 7,
    todayKey: () => day, refreshToday: () => day, sessionUserId: () => user,
    readTodayRecords: () => latest, loadJournal: () => latest.journal,
    loadCustomCategories: () => [], loadCategoryOrder: () => [], loadPrompts: () => ({}), allCategories: (items) => items, orderCategories: (items) => items,
    requestAiProcessing: consent, buildTodayContext, summaryEntries, AI_CONTEXT_VERSION,
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return network(); },
    saveMoment: (value) => saved.push(value), saveBriefing: (value) => saved.push(value), saveReview: (value) => saved.push(value),
  };
  for (const name of ["Loading", "Error", "Data", "Journal", "Briefing", "Moments", "Review", "ReviewOpen", "Open", "Result", "AnsweredAt"]) {
    ctx[`set${name}`] = (value) => { state[name] = typeof value === "function" ? value(state[name] ?? {}) : value; };
  }
  vm.runInNewContext(source, ctx);
  return { ctx, saved, requests, state, run: ctx.run, setDay: (value) => { day = value; }, setUser: (value) => { user = value; }, setRecords: (value) => { latest = value; } };
}

test("each newly generated moment stores the server-selected reference with its answer", async () => {
  let counter = 0;
  const harness = requestHarness(homeCall, { network: async () => ({ ok: true, json: async () => ({
    source: "ai", crisis: false, moment: { title: "오늘", lines: ["공감", "위로", "사랑"], closing: "한마디" },
    quote: { id: `reviewed-${++counter}`, text: "문장", author: "저자", source: "출처", sourceUrl: "https://example.org", kind: "paraphrase" },
  }) }) });
  await harness.run("love");
  await harness.run("love");
  assert.equal(harness.requests[0].body.companion, "콩이"); // 칭찬·사랑·정리는 사용자가 지어 준 이름의 모루가 건넨다
  assert.equal(harness.saved[0].quote.id, "reviewed-1");
  assert.equal(harness.saved[1].quote.id, "reviewed-2");
  assert.equal(harness.saved[1].contextVersion, AI_CONTEXT_VERSION);
});

test("the home request reads the new day and fresh records after consent crosses midnight", async () => {
  const consent = deferred();
  const harness = requestHarness(homeCall, { consent: () => consent.promise });
  const pending = harness.run("love");
  const fresh = records();
  fresh.log["2026-11-04"] = { did: ["yesterday"] };
  fresh.log["2026-11-05"] = { did: ["newly saved today"] };
  harness.setRecords(fresh);
  harness.setDay("2026-11-05");
  consent.resolve(true);
  await pending;
  assert.equal(harness.requests[0].body.date, "2026-11-05");
  assert.deepEqual(harness.requests[0].body.todayDid, ["newly saved today"]);
  assert.equal(harness.requests[0].body.recent[0].date, "2026-11-04");
  assert.equal(harness.saved[0].date, "2026-11-05");
  assert.equal(harness.saved[0].contextVersion, AI_CONTEXT_VERSION);
});

for (const change of ["day", "account", "unmount"]) {
  test(`a home response after ${change} changes cannot be saved as the current answer`, async () => {
    const network = deferred();
    const harness = requestHarness(homeCall, { network: () => network.promise });
    const pending = harness.run("love");
    await nextTurn();
    assert.equal(harness.requests.length, 1);
    if (change === "day") harness.setDay("2026-11-05");
    if (change === "account") harness.setUser("different-user");
    if (change === "unmount") harness.ctx.lifecycle.current++;
    network.resolve(answer());
    await pending;
    assert.equal(harness.saved.length, 0);
    assert.equal(harness.state.Open, undefined);
  });
}

test("an earlier day's record sync finishing last cannot replace the new day's home state", async () => {
  const oldSync = deferred();
  const newSync = deferred();
  const applied = [];
  let day = "2026-11-04";
  let load = 0;
  const ctx = {
    today: day, todayKey: () => day, sessionUserId: () => "test-user", currentAiResult,
    fetchMe: async () => null, syncRecords: () => (++load === 1 ? oldSync.promise : newSync.promise),
    readTodayRecords: () => ({ day }), loadBriefing: () => null, loadMoments: () => ({}), loadReview: () => null,
    setData: (value) => applied.push(value.day), setError: () => {}, setBriefing: () => {}, setMoments: () => {},
    setReview: () => {}, setReviewOpen: () => {}, setOpen: () => {}, refreshCare: () => {}, URLSearchParams,
    window: { location: { search: "" }, history: { replaceState: () => {} } },
  };
  vm.runInNewContext(homeReload, ctx);
  const cleanupOld = ctx.run();
  await nextTurn();
  cleanupOld();
  day = "2026-11-05";
  ctx.today = day;
  const cleanupNew = ctx.run();
  await nextTurn();
  newSync.resolve(true);
  await nextTurn();
  oldSync.resolve(true);
  await nextTurn();
  assert.deepEqual(applied, ["2026-11-05"]);
  cleanupNew();
});

test("summary sends its post-consent date and current records rather than the earlier render", async () => {
  const consent = deferred();
  const harness = requestHarness(summaryRun, { consent: () => consent.promise });
  const pending = harness.run();
  const fresh = records();
  fresh.journal["2026-11-05"] = { work: { score: 1, note: "newly saved" } };
  harness.setRecords(fresh);
  harness.setDay("2026-11-05");
  consent.resolve(true);
  await pending;
  assert.equal(harness.requests[0].body.date, "2026-11-05");
  assert.equal(harness.requests[0].body.entries[0].date, "2026-11-05");
  assert.equal(harness.state.Result.date, "2026-11-05");
});

test("summary completion cannot replace a different period selected while it was loading", async () => {
  const network = deferred();
  const harness = requestHarness(summaryRun, { network: () => network.promise });
  const data = records();
  data.journal["2026-11-04"] = {};
  harness.setRecords(data);
  const pending = harness.run();
  await nextTurn();
  harness.ctx.selection.current.range = 30;
  network.resolve(answer());
  await pending;
  assert.equal(harness.state.Result, null);
});
