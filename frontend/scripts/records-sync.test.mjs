import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";

const typed = await readFile(new URL("../lib/records-sync.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=function\b)/g, "");

function setup(network) {
  const stored = new Map();
  const calls = [];
  const context = {
    window: { localStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) } },
    fetch: async (path, options) => { calls.push({ path, ...options }); return network(path, options, calls.length); },
  };
  vm.runInNewContext(`${source}\nglobalThis.api = { installSyncHooks, pushRecords, flushRecords, resetRecordsSync };`, context);
  context.api.installSyncHooks({ userId: () => "test-user", sectionBody: () => ({}), apply: () => {} });
  return { api: context.api, calls, stored };
}

for (const failure of ["network", "server"]) {
  test(`${failure} failure pauses the queue and preserves it for an explicit retry`, async () => {
    let restored = false;
    const { api, calls, stored } = setup(async (_path, _options, count) => {
      if (restored) return { ok: true, status: 200 };
      // A bad implementation must fail the assertion, rather than hot-looping
      // in microtasks and hanging the entire test process.
      if (count > 1) return new Promise(() => {});
      if (failure === "network") throw new Error("offline");
      return { ok: false, status: 503 };
    });
    api.pushRecords(["memos"], "memos", "PUT", "/api/records/memos", { memos: ["keep me"] });
    assert.equal(await api.flushRecords(), false);
    await nextTurn();
    assert.equal(calls.length, 1, "failure must not immediately issue another request");
    assert.ok(stored.has("maeum-accel:dirty:v1:test-user"), "unsent edits must remain dirty");
    restored = true;
    assert.equal(await api.flushRecords(), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body, calls[0].body, "the unsent edit must be retried intact");
    assert.equal(stored.has("maeum-accel:dirty:v1:test-user"), false);
  });
}

test("successful writes stay sequential and queued edits use their latest value", async () => {
  let active = 0;
  let maxActive = 0;
  const { api, calls, stored } = setup(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await nextTurn();
    active--;
    return { ok: true, status: 200 };
  });
  api.pushRecords(["memos"], "memos", "PUT", "/api/records/memos", { memos: ["first"] });
  api.pushRecords(["goals"], "goals", "PUT", "/api/records/goals", { goals: ["old"] });
  api.pushRecords(["goals"], "goals", "PUT", "/api/records/goals", { goals: ["latest"] });
  assert.equal(await api.flushRecords(), true);
  assert.equal(maxActive, 1);
  assert.deepEqual(calls.map((call) => call.path), ["/api/records/memos", "/api/records/goals"]);
  assert.deepEqual(JSON.parse(calls[1].body), { goals: ["latest"] });
  assert.equal(stored.has("maeum-accel:dirty:v1:test-user"), false);
});

test("expired sessions discard queued requests without repeated sends", async () => {
  const { api, calls } = setup(async () => { await nextTurn(); return { ok: false, status: 401 }; });
  api.pushRecords(["memos"], "memos", "PUT", "/api/records/memos", { memos: [] });
  api.pushRecords(["goals"], "goals", "PUT", "/api/records/goals", { goals: [] });
  assert.equal(await api.flushRecords(), false);
  await nextTurn();
  assert.equal(calls.length, 1);
  assert.equal(await api.flushRecords(), true);
  assert.equal(calls.length, 1);
});
