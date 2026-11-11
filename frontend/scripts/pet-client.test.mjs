import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/pet.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
function setup(fetch) {
  let expire;
  let cleared = false;
  const context = { fetch, AbortController, setTimeout: (fn) => { expire = fn; return 1; }, clearTimeout: () => { cleared = true; } };
  vm.runInNewContext(`${source}\nglobalThis.request = petRequest;`, context);
  return { request: context.request, expire: () => expire(), cleared: () => cleared };
}
test("omitted null answers become a complete editable form without caching private data", async () => {
  const client = setup(async (path, options) => {
    assert.equal(path, "/api/pet");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return { ok: true, json: async () => ({ food: 9, answers: {} }) };
  });
  const result = await client.request();
  assert.equal(Object.keys(result.answers).length, 5);
  assert.equal(result.answers.note, null);
  assert.equal(client.cleared(), true);
});
test("timeout releases a stalled request and allows an explicit retry", async () => {
  let attempt = 0;
  const client = setup(async (_, options) => {
    if (++attempt > 1) return { ok: true, json: async () => ({ food: 9, answers: {} }) };
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  const pending = client.request();
  client.expire();
  await assert.rejects(pending, (error) => error.status === 408);
  assert.equal(client.cleared(), true);
  assert.equal((await client.request()).food, 9);
});
test("expired session remains distinguishable from connectivity failures", async () => {
  const client = setup(async () => ({ ok: false, status: 401, json: async () => ({ error: "sign in" }) }));
  await assert.rejects(client.request(), (error) => error.status === 401);
  assert.equal(client.cleared(), true);
});
test("failed writes are never retried automatically", async () => {
  let count = 0;
  const client = setup(async (_, options) => {
    count++;
    assert.equal(options.method, "PUT");
    assert.equal(JSON.parse(options.body).date, "2026-11-11");
    throw new Error("offline");
  });
  await assert.rejects(client.request("/journal", { date: "2026-11-11", answers: {} }), (error) => error.status === 0);
  assert.equal(count, 1);
  assert.equal(client.cleared(), true);
});
