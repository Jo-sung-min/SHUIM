import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/service-availability.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const context = { URL, Request, AbortController, Error, setTimeout, clearTimeout };
vm.runInNewContext(`${source}\nglobalThis.api = { isServicePublicPath, isServiceHealthy, probeServiceHealth, observeApiFailures };`, context);
const { isServicePublicPath, isServiceHealthy, probeServiceHealth, observeApiFailures } = context.api;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const healthy = () => response({ configured: true, ok: true });
const signal = () => new AbortController().signal;

test("only informational routes bypass the connection gate", () => {
  for (const path of ["/info", "/info/", "/privacy", "/terms", "/account-deletion"]) assert.equal(isServicePublicPath(path), true);
  for (const path of ["/", "/auth", "/me", "/info-other", "/privacy-settings", "/shout"]) assert.equal(isServicePublicPath(path), false);
});

test("health requires explicit server and database readiness", () => {
  assert.equal(isServiceHealthy({ configured: true, ok: true }), true);
  for (const body of [null, {}, { ok: true }, { configured: true }, { configured: "true", ok: true }, { configured: true, ok: false }]) {
    assert.equal(isServiceHealthy(body), false);
  }
});

test("health bypasses caches and rechecks readiness after recovery", async () => {
  let requests = 0;
  const request = async (path, options) => {
    requests++;
    assert.equal(path, "/api/db");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return requests === 1 ? response({ configured: true, ok: false }, 500) : healthy();
  };
  assert.equal(await probeServiceHealth(request, signal()), false);
  assert.equal(await probeServiceHealth(request, signal()), true);
  assert.equal(requests, 2);
});

test("a successful HTTP status alone never reveals application content", async () => {
  for (const request of [
    async () => new Response("proxy unavailable", { status: 200 }),
    async () => response({ configured: false, ok: true }),
    async () => response({ configured: true, ok: true }, 503),
    async () => { throw new TypeError("network unavailable"); },
  ]) assert.equal(await probeServiceHealth(request, signal()), false);
});

test("a hanging health request times out and is aborted", async () => {
  let requestSignal;
  const result = await probeServiceHealth(async (_path, options) => {
    requestSignal = options.signal;
    return new Promise(() => {});
  }, signal(), 10);
  assert.equal(result, false);
  assert.equal(requestSignal.aborted, true);
});

test("unmount cancellation aborts health without waiting for the timeout", async () => {
  const controller = new AbortController();
  let requestSignal;
  const result = probeServiceHealth(async (_path, options) => {
    requestSignal = options.signal;
    return new Promise(() => {});
  }, controller.signal);
  controller.abort();
  assert.equal(await result, false);
  assert.equal(requestSignal.aborted, true);
  let called = false;
  assert.equal(await probeServiceHealth(async () => { called = true; return healthy(); }, controller.signal), false);
  assert.equal(called, false);
});

test("API monitoring preserves the original response and its unread body", async () => {
  let failures = 0;
  const original = response({ error: "unavailable" }, 502);
  const monitored = observeApiFailures(async () => original, "https://www.sorow.co.kr", () => { failures++; });
  const received = await monitored("/api/community");
  assert.equal(received, original);
  assert.equal(received.bodyUsed, false);
  assert.equal(failures, 1);
  assert.deepEqual(await received.json(), { error: "unavailable" });
});

test("auth, validation, rate-limit and external errors are not service outages", async () => {
  let failures = 0;
  for (const status of [400, 401, 403, 404, 409, 429]) {
    await observeApiFailures(async () => response({}, status), "https://www.sorow.co.kr", () => { failures++; })("/api/auth/login");
  }
  const monitored = observeApiFailures(async () => response({}, 503), "https://www.sorow.co.kr", () => { failures++; });
  for (const path of ["/api/db", "/favicon.svg", "https://example.com/api/messages"]) await monitored(path);
  assert.equal(failures, 0);
});

test("same-origin network failures trigger one check while request cancellation does not", async () => {
  let failures = 0;
  const broken = observeApiFailures(async () => { throw new TypeError("network unavailable"); }, "https://www.sorow.co.kr", () => { failures++; });
  await assert.rejects(broken(new Request("https://www.sorow.co.kr/api/messages")), /network unavailable/);
  const cancelled = new Error("cancelled");
  cancelled.name = "AbortError";
  const aborted = observeApiFailures(async () => { throw cancelled; }, "https://www.sorow.co.kr", () => { failures++; });
  await assert.rejects(aborted("/api/community"), /cancelled/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(broken("/api/community", { signal: controller.signal }), /network unavailable/);
  assert.equal(failures, 1);
});

const authTyped = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
const authSource = stripTypeScriptTypes(authTyped)
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");

test("an unavailable account endpoint does not log out the device or cache a fake guest", async () => {
  const store = new Map([["session", JSON.stringify({ userId: "alice" })]]);
  let requests = 0;
  const authContext = {
    fetch: async () => ++requests === 1 ? response({ error: "unavailable" }, 503) : response({ configured: true, user: { id: "alice" }, admin: false, kakao: true }),
    SESSION_KEY: "session", sessionUserId: () => JSON.parse(store.get("session") ?? "null")?.userId ?? null,
    resetCommunityCache: () => { throw new Error("A network error must not switch the local account."); },
    window: { localStorage: {
      getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key),
    } },
  };
  vm.runInNewContext(`${authSource}\nglobalThis.api = { fetchMe };`, authContext);
  assert.equal((await authContext.api.fetchMe()).configured, false);
  assert.equal(JSON.parse(store.get("session")).userId, "alice");
  assert.equal((await authContext.api.fetchMe()).user.id, "alice");
  assert.equal(requests, 2, "recovery must retry instead of returning a cached failure");
});
