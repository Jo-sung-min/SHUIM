import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
function setup(network) {
  const handlers = {}, added = [], deleted = [];
  const context = {
    self: { location: { origin: "https://sorow.co.kr" }, clients: { claim: async () => {} }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open: async () => ({ add: async (url) => added.push(url) }), match: async () => new Response("offline"), keys: async () => ["sorow-offline-v0", "unrelated-cache"], delete: async (key) => deleted.push(key) },
    fetch: network, URL, Response,
  };
  vm.runInNewContext(source, context);
  return { handlers, added, deleted };
}
test("only the public offline page is cached; unrelated caches survive", async () => {
  const { handlers, added, deleted } = setup(async () => new Response("online"));
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } }); await pending;
  handlers.activate({ waitUntil: (promise) => { pending = promise; } }); await pending;
  assert.deepEqual(added, ["/offline.html"]); assert.deepEqual(deleted, ["sorow-offline-v0"]);
});
test("API, non-GET and external requests are never intercepted", () => {
  const { handlers } = setup(() => { throw new Error("must not fetch"); });
  for (const request of [
    { method: "GET", mode: "navigate", url: "https://sorow.co.kr/api/auth/kakao" },
    { method: "DELETE", mode: "cors", url: "https://sorow.co.kr/api/auth/account" },
    { method: "GET", mode: "cors", url: "https://sorow.co.kr/api/records" },
    { method: "GET", mode: "navigate", url: "https://other.example/" },
  ]) handlers.fetch({ request, respondWith: () => assert.fail("private or external request was intercepted") });
});
test("successful personal HTML is passed through without caching; offline navigation gets the public fallback", async () => {
  for (const offline of [false, true]) {
    const { handlers, added } = setup(async () => { if (offline) throw new Error("offline"); return new Response("private-page"); });
    let pending;
    handlers.fetch({ request: { method: "GET", mode: "navigate", url: "https://sorow.co.kr/me" }, respondWith: (promise) => { pending = promise; } });
    assert.equal(await (await pending).text(), offline ? "offline" : "private-page"); assert.deepEqual(added, []);
  }
});
