import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/continuity.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=function|const)/g, "");
function fixture(storageDenied = false) {
  const records = new Map(), window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  window.sessionStorage = {
    getItem(k) { if (storageDenied) throw Error("storage denied"); return records.get(k) ?? null; },
    setItem(k, v) { if (storageDenied) throw Error("storage denied"); records.set(k, v); },
    removeItem(k) { if (storageDenied) throw Error("storage denied"); records.delete(k); },
  };
  const navigator = { onLine: true }, context = { window, document, navigator };
  vm.runInNewContext(`${source}\nglobalThis.api={readBeachVisit,saveBeachVisit,forgetBeachVisit,beachTickDelay,sameBeachRoster,sameFireDisplay,attachBeachLifecycle};`, context);
  return { ...context, records, ...context.api };
}
const saved = { version: 1, userId: "member-a", ticket: "opaque-resume-token", sequence: 27, savedAt: 1000,
  camera: { view: "first", yaw: 0.7, pitch: 0.12, orbitYaw: 0.7, restSpot: null } };

test("a tab bookmark keeps the view and sequence isolated by community and landscape", () => {
  const f = fixture(); f.saveBeachVisit("circle / one", "uyuni", saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.readBeachVisit("circle / one", "uyuni", 2000))), saved);
  assert.equal(f.readBeachVisit("circle-two", "uyuni", 2000), null);
  assert.equal(f.readBeachVisit("circle / one", "beach", 2000), null);
  assert.equal(f.readBeachVisit("circle / one", "uyuni", 1000 + 30 * 60 * 1000)?.ticket, saved.ticket);
});

test("expired, future-dated, malformed and denied storage never invent a resumed position", () => {
  const f = fixture();
  for (const value of [null, {}, { ...saved, version: 2 }, { ...saved, sequence: -1 }, { ...saved, sequence: 1.5 },
    { ...saved, ticket: "" }, { ...saved, savedAt: 3000 }, { ...saved, camera: { ...saved.camera, pitch: "bad" } }]) {
    f.records.set("sorow:space-visit:v1:uyuni:circle", JSON.stringify(value));
    assert.equal(f.readBeachVisit("circle", "uyuni", 2000), null);
  }
  f.saveBeachVisit("circle", "uyuni", saved);
  assert.equal(f.readBeachVisit("circle", "uyuni", 1001 + 30 * 60 * 1000), null);
  f.forgetBeachVisit("circle", "uyuni"); assert.equal(f.records.size, 0);
  const blocked = fixture(true);
  assert.doesNotThrow(() => blocked.saveBeachVisit("circle", "uyuni", saved));
  assert.equal(blocked.readBeachVisit("circle", "uyuni", 2000), null);
  assert.doesNotThrow(() => blocked.forgetBeachVisit("circle", "uyuni"));
});

test("poll cadence includes RTT, observes moving peers while standing and backs off without a busy loop", () => {
  const f = fixture();
  assert.equal(f.beachTickDelay(true, true, 0, 70), 180);
  assert.equal(f.beachTickDelay(false, true, 0, 70), 280);
  assert.equal(f.beachTickDelay(false, false, 0, 70), 930);
  assert.equal(f.beachTickDelay(true, false, 0, 1100), 40);
  assert.equal(f.beachTickDelay(true, true, 2, 70), 3930);
  assert.equal(f.beachTickDelay(true, true, 999, 0), 6000);
});

test("100 walking visitors do not rebuild the identity list, but membership and name changes do", () => {
  const f = fixture();
  const people = Array.from({ length: 100 }, (_, i) => ({ pid: `p${i}`, id: `u${i}`, nick: `friend${i}`, skin: i % 2, x: i, z: 4, yaw: 0 }));
  const moved = people.map(p => ({ ...p, x: p.x + 1, z: 5, yaw: 0.2, moving: true })).reverse();
  assert.equal(f.sameBeachRoster(people, moved), true);
  assert.equal(f.sameBeachRoster(people, moved.slice(1)), false);
  assert.equal(f.sameBeachRoster(people, moved.map((p, i) => i ? p : { ...p, nick: "changed" })), false);
});

test("HUD fire clocks resync periodically while changes to logs, powder or deadlines appear immediately", () => {
  const f = fixture(), fire = { logs: 3, maxLogs: 12, intensity: 0.5, color: "amber", serverTime: 1000, queuedPops: 0,
    nextLogBurnAt: 61000, powderEnabled: true, powder: null };
  assert.equal(f.sameFireDisplay(fire, { ...fire, serverTime: 1500 }), true);
  assert.equal(f.sameFireDisplay(fire, { ...fire, serverTime: 11000 }), false);
  for (const change of [{ logs: 4 }, { nextLogBurnAt: 62000 }, { powder: { id: "new", color: "rainbow", startedAt: 1500, expiresAt: 31500 } }]) {
    assert.equal(f.sameFireDisplay(fire, { ...fire, ...change }), false);
  }
});

test("mobile hide/pagehide coalesce once, BFCache and online wake up, and hidden/offline pages never resume", () => {
  const f = fixture(), calls = [];
  const detach = f.attachBeachLifecycle({ suspend: () => calls.push("suspend"), resume: () => calls.push("resume"),
    offline: () => calls.push("offline"), pageHidden: () => calls.push("pagehide") });
  f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange"));
  f.window.dispatchEvent(new Event("pagehide")); f.window.dispatchEvent(new Event("pageshow"));
  assert.deepEqual(calls, ["suspend", "pagehide"]);
  f.document.hidden = false; f.window.dispatchEvent(new Event("pageshow"));
  assert.equal(calls.at(-1), "resume");
  f.navigator.onLine = false; f.window.dispatchEvent(new Event("offline"));
  f.window.dispatchEvent(new Event("pageshow")); assert.equal(calls.at(-1), "offline");
  f.navigator.onLine = true; f.window.dispatchEvent(new Event("online")); assert.equal(calls.at(-1), "resume");
  detach(); const count = calls.length;
  f.window.dispatchEvent(new Event("pageshow")); f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.length, count);
});
