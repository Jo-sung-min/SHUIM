import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/community.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed)
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export \* from .*;\r?\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
function setup(fetch) {
  const context = { fetch, requireCommunityConsent: async () => {}, listNotifications: () => [], loadNotifSeen: () => 0 };
  vm.runInNewContext(`${source}\nglobalThis.testApi = { fetchCommunity, resetCommunityCache, cachedCommunity };`, context);
  return context.testApi;
}
const response = (id) => ({ ok: true, json: async () => ({ me: { id }, posts: [] }) });

test("account change clears cached personal community state", async () => {
  let id = "alice", calls = 0;
  const api = setup(async () => { calls++; return response(id); });
  assert.equal((await api.fetchCommunity()).me.id, "alice");
  id = "bob";
  api.resetCommunityCache();
  assert.equal(api.cachedCommunity(), null);
  assert.equal((await api.fetchCommunity()).me.id, "bob");
  assert.equal(calls, 2);
});
test("an old session's delayed response cannot overwrite the new session cache", async () => {
  const pending = [];
  const api = setup(() => new Promise((resolve) => pending.push(resolve)));
  const old = api.fetchCommunity();
  const rejected = assert.rejects(old, /계정이 변경/);
  api.resetCommunityCache();
  const current = api.fetchCommunity();
  pending[1](response("bob"));
  assert.equal((await current).me.id, "bob");
  pending[0](response("alice"));
  await rejected;
  assert.equal(api.cachedCommunity().me.id, "bob");
  assert.equal((await api.fetchCommunity()).me.id, "bob");
});
