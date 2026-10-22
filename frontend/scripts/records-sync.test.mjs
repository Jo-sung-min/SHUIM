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

const storageTyped = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
const storageSource = stripTypeScriptTypes(storageTyped)
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export \{.*\} from .*;\r?\n/gm, "")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");

function setupGuestMigration() {
  const stored = new Map();
  const imports = [];
  const localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => { stored.set(key, value); },
    removeItem: (key) => { stored.delete(key); },
  };
  const context = {
    window: { localStorage }, installSyncHooks: () => {},
    pushRecords: (_sections, key, method, path, body) => imports.push({ userId: JSON.parse(stored.get("maeum-accel:session:v1")).userId, key, method, path, body: JSON.parse(JSON.stringify(body)) }),
    stageGuestImport: (userId, body) => { stored.set(`maeum-accel:guest-import:v1:${userId}`, JSON.stringify(body)); return true; },
    startGuestImport: (userId) => imports.push({ userId, key: "import", method: "POST", path: "/api/records/import", body: JSON.parse(stored.get(`maeum-accel:guest-import:v1:${userId}`)) }),
    clearGuestImport: (userId) => stored.delete(`maeum-accel:guest-import:v1:${userId}`),
  };
  vm.runInNewContext(`${storageSource}\nglobalThis.api = { adoptGuestData };`, context);
  const login = (userId) => userId ? stored.set("maeum-accel:session:v1", JSON.stringify({ userId })) : stored.delete("maeum-accel:session:v1");
  return { stored, imports, localStorage, login, adopt: context.api.adoptGuestData };
}

test("guest records adopted by Alice cannot be imported again when Bob logs in", () => {
  const { stored, imports, login, adopt } = setupGuestMigration();
  const privateMemo = JSON.stringify([{ id: "alice-guest", text: "Alice's private draft" }]);
  stored.set("maeum-accel:memos:v1", privateMemo);
  stored.set("maeum-accel:profile:v1", JSON.stringify({ name: "Alice", phone: "010-0000-0000" }));
  login("alice"); adopt("alice");
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), privateMemo);
  assert.equal(stored.has("maeum-accel:memos:v1"), false);
  assert.equal(stored.has("maeum-accel:profile:v1"), false);
  assert.equal(imports.length, 1);
  assert.equal(imports[0].userId, "alice");
  assert.deepEqual(imports[0].body.memos, JSON.parse(privateMemo));
  login(null); login("bob"); adopt("bob");
  assert.equal(imports.length, 1, "the consumed guest snapshot must never reach Bob's server request");
  assert.equal(stored.has("maeum-accel:memos:v1:bob"), false);
  assert.equal(stored.has("maeum-accel:profile:v1:bob"), false);
  login(null);
  const newDraft = JSON.stringify([{ id: "bob-new-guest", text: "A new guest draft" }]);
  stored.set("maeum-accel:memos:v1", newDraft);
  login("bob"); adopt("bob");
  assert.equal(stored.get("maeum-accel:memos:v1:bob"), newDraft);
  assert.equal(imports.length, 2);
  assert.equal(imports[1].userId, "bob");
  assert.deepEqual(imports[1].body.memos, JSON.parse(newDraft));
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), privateMemo);
});

test("a failed account-local write preserves the guest source and does not upload it", () => {
  const { stored, imports, localStorage, login, adopt } = setupGuestMigration();
  const guest = JSON.stringify([{ id: "keep", text: "Preserve this draft" }]);
  stored.set("maeum-accel:memos:v1", guest);
  login("alice");
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === "maeum-accel:memos:v1:alice") throw new Error("storage full"); setItem(key, value); };
  adopt("alice");
  assert.equal(stored.get("maeum-accel:memos:v1"), guest);
  assert.equal(stored.has("maeum-accel:memos:v1:alice"), false);
  assert.equal(imports.length, 0);
  localStorage.setItem = setItem;
  adopt("alice");
  assert.equal(stored.has("maeum-accel:memos:v1"), false);
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), guest);
  assert.equal(imports.length, 1);
});

test("existing account content and an unrelated guest source are not overwritten or uploaded", () => {
  const { stored, imports, login, adopt } = setupGuestMigration();
  const account = JSON.stringify([{ id: "account", text: "Existing account memo" }]);
  const guest = JSON.stringify([{ id: "guest", text: "Unadopted guest memo" }]);
  stored.set("maeum-accel:memos:v1:alice", account);
  stored.set("maeum-accel:memos:v1", guest);
  login("alice"); adopt("alice");
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), account);
  assert.equal(stored.get("maeum-accel:memos:v1"), guest);
  assert.equal(imports.length, 0);
});

test("migration only consumes records for the currently active session", () => {
  const { stored, imports, login, adopt } = setupGuestMigration();
  const guest = JSON.stringify([{ id: "draft" }]);
  stored.set("maeum-accel:memos:v1", guest);
  login("bob"); adopt("alice");
  assert.equal(stored.get("maeum-accel:memos:v1"), guest);
  assert.equal(stored.has("maeum-accel:memos:v1:alice"), false);
  assert.equal(imports.length, 0);
});

test("a session switch during local migration never uploads Alice's data as Bob", () => {
  const { stored, imports, localStorage, login, adopt } = setupGuestMigration();
  const guest = JSON.stringify([{ id: "alice-private" }]);
  stored.set("maeum-accel:memos:v1", guest);
  login("alice");
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    setItem(key, value);
    if (key === "maeum-accel:memos:v1:alice") login("bob");
  };
  adopt("alice");
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), guest);
  assert.equal(stored.get("maeum-accel:memos:v1"), guest, "a changed session must not consume a source before staging it");
  assert.equal(imports.length, 0);
});

function bootAccountRecords(stored, network, failPendingWrite = false) {
  const calls = [];
  const context = {
    window: { localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        if (failPendingWrite && key.startsWith("maeum-accel:guest-import:v1:")) throw new Error("storage full");
        stored.set(key, value);
      },
      removeItem: (key) => stored.delete(key),
    } },
    fetch: async (path, options) => { calls.push({ path, ...options }); return network(path, options); },
  };
  vm.runInNewContext(`${source}\n${storageSource}\nglobalThis.api = { adoptGuestData, syncRecords, flushRecords, resetRecordsSync, clearAccountCache, stageGuestImport };`, context);
  return { api: context.api, calls };
}

const sessionKey = "maeum-accel:session:v1";
const pendingKey = (id) => `maeum-accel:guest-import:v1:${id}`;

test("failed guest import survives refresh and replays POST before any account pull", async () => {
  const stored = new Map([[sessionKey, JSON.stringify({ userId: "alice" })]]);
  const memos = [{ id: "keep-through-refresh", text: "Private draft" }];
  stored.set("maeum-accel:memos:v1", JSON.stringify(memos));
  const first = bootAccountRecords(stored, async () => ({ ok: false, status: 503 }));
  first.api.adoptGuestData("alice");
  assert.equal(await first.api.flushRecords(), false);
  assert.equal(stored.has("maeum-accel:memos:v1"), false);
  assert.ok(stored.has(pendingKey("alice")));
  assert.deepEqual(JSON.parse(stored.get("maeum-accel:memos:v1:alice")), memos);

  const offlineReload = bootAccountRecords(stored, async () => ({ ok: false, status: 503 }));
  assert.equal(await offlineReload.api.syncRecords(), false);
  assert.deepEqual(offlineReload.calls.map(({ method }) => method), ["POST"]);
  assert.ok(stored.has(pendingKey("alice")));
  assert.deepEqual(JSON.parse(stored.get("maeum-accel:memos:v1:alice")), memos);

  let serverMemos = [];
  const recoveredReload = bootAccountRecords(stored, async (_path, options) => {
    if (options.method === "POST") {
      serverMemos = JSON.parse(options.body).memos;
      return { ok: true, status: 200 };
    }
    return { ok: true, status: 200, json: async () => ({ memos: serverMemos }) };
  });
  assert.equal(await recoveredReload.api.syncRecords(), true);
  assert.deepEqual(recoveredReload.calls.map(({ path, method }) => [path, method ?? "GET"]), [["/api/records/import", "POST"], ["/api/records", "GET"]]);
  assert.equal(stored.has(pendingKey("alice")), false);
  assert.deepEqual(JSON.parse(stored.get("maeum-accel:memos:v1:alice")), memos);
});

test("Bob never replays Alice's durable import, and deleting Alice only removes her pending snapshot", async () => {
  const aliceMemos = [{ id: "alice-only" }];
  const stored = new Map([
    [sessionKey, JSON.stringify({ userId: "bob" })],
    [pendingKey("alice"), JSON.stringify({ memos: aliceMemos })],
    ["maeum-accel:memos:v1:alice", JSON.stringify(aliceMemos)],
  ]);
  const bob = bootAccountRecords(stored, async () => ({ ok: true, status: 200, json: async () => ({ memos: [] }) }));
  assert.equal(await bob.api.syncRecords(), true);
  assert.deepEqual(bob.calls.map(({ method }) => method ?? "GET"), ["GET"]);
  assert.ok(stored.has(pendingKey("alice")));
  assert.deepEqual(JSON.parse(stored.get("maeum-accel:memos:v1:bob")), []);
  assert.deepEqual(JSON.parse(stored.get("maeum-accel:memos:v1:alice")), aliceMemos);
  stored.set(pendingKey("bob"), JSON.stringify({ memos: [{ id: "bob-only" }] }));
  bob.api.clearAccountCache("alice");
  assert.equal(stored.has(pendingKey("alice")), false);
  assert.equal(stored.has("maeum-accel:memos:v1:alice"), false);
  assert.ok(stored.has(pendingKey("bob")));
});

test("a pending snapshot write failure leaves the guest source intact and sends nothing", () => {
  const guest = JSON.stringify([{ id: "retain-original" }]);
  const stored = new Map([[sessionKey, JSON.stringify({ userId: "alice" })], ["maeum-accel:memos:v1", guest]]);
  const instance = bootAccountRecords(stored, async () => { throw new Error("must not send"); }, true);
  instance.api.adoptGuestData("alice");
  assert.equal(stored.get("maeum-accel:memos:v1"), guest);
  assert.equal(stored.get("maeum-accel:memos:v1:alice"), guest);
  assert.equal(stored.has(pendingKey("alice")), false);
  assert.equal(instance.calls.length, 0);
});

test("an old session's completed import cannot clear its pending record after switching accounts", async () => {
  const stored = new Map([[sessionKey, JSON.stringify({ userId: "alice" })], [pendingKey("alice"), JSON.stringify({ memos: [{ id: "private" }] })]]);
  let finish;
  const instance = bootAccountRecords(stored, () => new Promise((resolve) => { finish = resolve; }));
  const syncing = instance.api.syncRecords();
  stored.set(sessionKey, JSON.stringify({ userId: "bob" }));
  instance.api.resetRecordsSync();
  finish({ ok: true, status: 200 });
  assert.equal(await syncing, false);
  assert.ok(stored.has(pendingKey("alice")), "Alice can safely retry this idempotent import on her next login");
  assert.equal(instance.calls.length, 1, "the old operation must never pull Bob's data or send another request");
});
