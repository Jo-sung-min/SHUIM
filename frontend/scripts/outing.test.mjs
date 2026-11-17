import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const typed = await readFile(new URL("../lib/outing.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" }).replace(/\bexport\s+/g, "");
function setup(fetch = async () => { throw new Error("offline"); }) {
  const context = { fetch, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(`${source}\nglobalThis.api = { OUTING_ACTIVITIES, OUTING_MILESTONES, EMPTY_OUTING, outingLevel, activityUnlocked, chooseOutingMap, isOutingPlace, outingRequest, OutingError };`, context);
  return context.api;
}
const api = setup();

test("first-time visitors can enjoy all three destinations without unlocking anything", () => {
  for (const place of ["park", "sea", "mountain"]) {
    assert.equal(api.isOutingPlace(place), true);
    assert.equal(api.OUTING_ACTIVITIES.filter(a => a.place === place && api.activityUnlocked(a, 0, 0)).length, 2);
  }
  assert.equal(api.isOutingPlace(null), false);
  assert.equal(api.isOutingPlace("__proto__"), false);
});
test("locked content opens precisely on 7, 14, 30, 50, 75, and 100 completed days", () => {
  for (const milestone of api.OUTING_MILESTONES.slice(1)) {
    const activities = api.OUTING_ACTIVITIES.filter(a => a.day === milestone.day);
    assert.ok(activities.length > 0);
    for (const a of activities) {
      assert.equal(api.activityUnlocked(a, (a.day - 1) * 10, (a.day - 1) * 20), false);
      assert.equal(api.activityUnlocked(a, a.day * 10, a.day * 20 - 1), false);
      assert.equal(api.activityUnlocked(a, a.day * 10, a.day * 20), true);
    }
    assert.equal(api.outingLevel(milestone.day), milestone.level);
  }
});
test("empty public maps are preferred, full maps excluded, and no private room is invented", () => {
  assert.equal(api.chooseOutingMap([{ id: "full", count: 20, capacity: 20 }, { id: "busy", count: 4, capacity: 20 }, { id: "empty", count: 0, capacity: 20 }]).id, "empty");
  assert.equal(api.chooseOutingMap([{ id: "a", count: 3, capacity: 20 }, { id: "b", count: 1, capacity: 20 }]).id, "b");
  assert.equal(api.chooseOutingMap([{ count: 20, capacity: 20 }, { count: -1, capacity: 20 }]), null);
  assert.equal(api.chooseOutingMap([]), null);
});
test("the frontend catalog and authoritative server agree on every action and duration", async () => {
  const java = await readFile(new URL("../../backend/src/main/java/kr/co/shuim/outing/OutingRules.java", import.meta.url), "utf8");
  const server = [...java.matchAll(/new Activity\("([^"]+)", "([^"]+)", (\d+), (\d+)\)/g)].map(m => ({ id: m[1], place: m[2], day: Number(m[3]), seconds: Number(m[4]) }));
  const client = JSON.parse(JSON.stringify(api.OUTING_ACTIVITIES.map(({ id, place, day, seconds }) => ({ id, place, day, seconds }))));
  assert.equal(new Set(client.map(a => a.id)).size, 18);
  assert.deepEqual(client, server);
});
test("a reward is accepted only from a successful server response with private no-store requests", async () => {
  const a = setup(async (url, options) => {
    assert.equal(url, "/api/outings/complete"); assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store"); assert.equal(options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(options.body), { token: "server-token", note: "my memory" });
    return { ok: true, json: async () => ({ days: 1, unlocked: ["park-bench"], memories: [] }) };
  });
  assert.equal((await a.outingRequest("/complete", { token: "server-token", note: "my memory" })).days, 1);
});
test("unauthorized, offline, and malformed responses never invent local progress", async () => {
  await assert.rejects(() => setup(async () => ({ ok: false, status: 401, json: async () => ({ error: "login" }) })).outingRequest(), e => e.status === 401);
  await assert.rejects(() => setup().outingRequest(), e => e.status === 0);
  await assert.rejects(() => setup(async () => ({ ok: true, json: async () => ({ days: 1 }) })).outingRequest(), e => e.status === 502);
  await assert.rejects(() => setup(async () => ({ ok: true, json: async () => ({ token: "x", readyAt: null }) })).outingRequest("/start", {}), e => e.status === 502);
});
test("navigation aborts in-flight requests instead of keeping private responses alive", async () => {
  const abort = new AbortController(); abort.abort();
  const a = setup(async (_, options) => {
    assert.equal(options.signal.aborted, true);
    throw new Error("aborted");
  });
  await assert.rejects(() => a.outingRequest("", undefined, abort.signal), e => e.status === 0);
});

test("companion sprites are sized through the outer svg only, so Moring's one-frame window is not stretched", async () => {
  // 모링은 그림 띠(네 칸)를 안쪽 svg 창으로 한 칸만 보여 준다. `.동행 svg { width: 100% }` 처럼 안쪽까지 잡으면 여러 마리가 한꺼번에 보인다
  const css = await readFile(new URL("../components/outing/Outing.module.css", import.meta.url), "utf8");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((rule) => rule.split("{")[0].trim());
  const companions = rules.flatMap((selector) => selector.split(",")).map((s) => s.trim()).filter((s) => /introCompanion|walkingCompanion|companionSays/.test(s) && /\bsvg$/.test(s));
  assert.equal(companions.length >= 4, true, companions.join(" | "));
  for (const selector of companions) assert.match(selector, />\s*svg$/, `${selector} must size the outer svg only`);
});
