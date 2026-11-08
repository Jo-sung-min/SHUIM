import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const source = stripTypeScriptTypes(await readFile(new URL("../lib/beach/net.ts", import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const plain = value => JSON.parse(JSON.stringify(value));
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, tickBeach, setBeachRest, beachGardenMoment, readGardenMoment, BeachGone, BeachUnavailable };`, context);
  return context.api;
}
const uuid = n => `6a569890-b3b7-4d5c-bfd7-${String(n).padStart(12, "0")}`;
const event = (kind = "coin", id = 1) => ({ id: uuid(id), pid: "seated-author", kind,
  x: -20.861231898606682, z: 8.73994167589625, yaw: -2.4329663813958953,
  startedAt: 1_000_000, durationMs: kind === "coin" ? 6_000 : 90_000 });
const snapshot = (events = [event()]) => ({ gardenMoments: events, gardenMomentCooldowns: { coin: 1_003_000, duck: 0 }, serverTime: 1_001_000 });

test("garden capability requires a confirmed shared snapshot and explicit grant, while legacy servers safely disable it", async () => {
  const legacy = await setup(async () => response({ mapId: "garden", gardenMomentsEnabled: true })).enterBeach("room", "male", "garden");
  assert.equal(legacy.gardenMomentsEnabled, false); assert.deepEqual(plain(legacy.gardenMoments), []);
  assert.deepEqual(plain(legacy.gardenMomentCooldowns), { coin: 0, duck: 0 });
  for (const grant of [undefined, false, "true", 1, true]) {
    const entered = await setup(async () => response({ ...snapshot(), mapId: "garden", gardenMomentsEnabled: grant })).enterBeach("room", "male", "garden");
    assert.equal(entered.gardenMomentsEnabled, grant === true); assert.deepEqual(plain(entered.gardenMoments), [event()]);
  }
  for (const mapId of ["beach", "uyuni", "bamboo"]) {
    const entered = await setup(async () => response({ ...snapshot(), mapId, gardenMomentsEnabled: true })).enterBeach("room", "male", mapId);
    assert.equal(entered.gardenMomentsEnabled, false); assert.deepEqual(plain(entered.gardenMoments), []);
  }
});

test("all six two-person pond benches accept only their canonical two seat confirmations", async () => {
  const benches = { "pond-bench-sw": [-21.31678586, 9.13041650], "pond-bench-se": [27.05566953, 15.49022060],
    "pond-bench-w": [-34.83661939, 34], "pond-bench-e": [39.92414302, 34],
    "pond-bench-nw": [-30.53993522, 53.43450423], "pond-bench-ne": [27.90771696, 51.75945625] };
  for (const [spotId, [cx, cz]] of Object.entries(benches)) for (const slot of [0, 1]) {
    const distance = Math.hypot(-cx, 34 - cz), fx = -cx / distance, fz = (34 - cz) / distance;
    const offset = slot === 0 ? -.6 : .6;
    const state = { pose: "sitting", spotId, slot, x: cx - offset * fz, z: cz + offset * fx, yaw: Math.atan2(0 - fx, 0 - fz) };
    const got = await setup(async () => response(state)).setBeachRest("visit", "sit", spotId);
    assert.deepEqual(plain(got), state);
    const towardLake = (-Math.sin(got.yaw) * -cx - Math.cos(got.yaw) * (34 - cz)) / distance;
    assert.ok(Math.abs(towardLake - 1) < 1e-12, `${spotId} seat ${slot} faces the pond centre`);
    const entered = await setup(async () => response({ mapId: "garden", selfRest: state })).enterBeach("room", "male", "garden");
    assert.deepEqual(plain(entered.selfRest), state);
    const tick = await setup(async () => response({ selfRest: state })).tickBeach({ ticket: "visit" });
    assert.deepEqual(plain(tick.selfRest), state);
    for (const invalid of [{ ...state, slot: 2 }, { ...state, pose: "lying" }, { ...state, x: 0 }, { ...state, yaw: state.yaw + .5 }])
      await assert.rejects(setup(async () => response(invalid)).setBeachRest("visit", "sit", spotId));
    assert.ok(setup().readGardenMoment({ ...event(), x: state.x, z: state.z, yaw: state.yaw }));
  }
  assert.equal(setup().readGardenMoment({ ...event(), x: -23.4, z: 6, yaw: Math.PI }), null,
    "old inland seat confirmations cannot move the character away from the new shoreline bench");
});

test("pond actions send only the owned ticket, stable retry identity and chosen kind", async () => {
  for (const kind of ["coin", "duck"]) {
    const calls = [], result = { event: event(kind), events: [event(kind)], cooldowns: { coin: 0, duck: 0 }, serverTime: 1_001_000 };
    const api = setup(async (url, options) => { calls.push({ url, options }); return response(result); });
    const requestId = uuid(20);
    assert.deepEqual(plain(await api.beachGardenMoment("visit", requestId, kind)), result);
    assert.deepEqual(plain(await api.beachGardenMoment("fresh-visit", requestId, kind)), result);
    for (const [index, call] of calls.entries()) {
      assert.equal(call.url, "/api/beach/garden-moments"); assert.equal(call.options.credentials, "same-origin");
      assert.ok(call.options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(call.options.body), { ticket: index ? "fresh-visit" : "visit", requestId, kind });
    }
  }
});

test("polls deduplicate and expire effects by server time and expired retries do not recreate an event", async () => {
  const coin = event(), duck = event("duck", 2);
  const tick = await setup(async () => response({ ...snapshot([duck, coin, duck]), serverTime: 1_006_000 })).tickBeach({ ticket: "visit" });
  assert.deepEqual(plain(tick.gardenMoments), [duck]);
  const api = setup(async () => response({ event: coin, events: [duck], cooldowns: { coin: 0, duck: 0 }, serverTime: 1_006_001 }));
  const retry = await api.beachGardenMoment("visit", uuid(10), "coin");
  assert.deepEqual(plain(retry.event), coin); assert.deepEqual(plain(retry.events), [duck]);
});

test("malformed, unbounded or conflicting snapshots cannot allocate pond effects", async () => {
  const badEvents = [{ ...event(), kind: "lantern" }, { ...event(), durationMs: 999999 }, { ...event(), x: 0 },
    { ...event(), z: -999 }, { ...event(), yaw: 999 }, { ...event(), startedAt: -1 }, { ...event(), pid: "" },
    { ...event(), id: "oops" }, { ...event(), wish: "unexpected" }];
  for (const bad of badEvents) {
    assert.equal(setup().readGardenMoment(bad), null);
    await assert.rejects(setup(async () => response(snapshot([bad]))).tickBeach({ ticket: "visit" }));
  }
  for (const bad of [
    { ...snapshot(), gardenMoments: [event(), { ...event(), pid: "changed" }] },
    { ...snapshot(), gardenMoments: Array.from({ length: 13 }, (_, i) => event("coin", i + 1)) },
    { ...snapshot(), gardenMoments: Array.from({ length: 25 }, (_, i) => event("duck", i + 1)) },
    { ...snapshot(), gardenMoments: Array.from({ length: 37 }, () => event()) },
    { ...snapshot(), gardenMomentCooldowns: { coin: 1_004_001, duck: 0 } },
    { ...snapshot(), gardenMomentCooldowns: { coin: 0, duck: 1_016_001 } },
    { ...snapshot(), gardenMomentCooldowns: null }, { ...snapshot(), serverTime: 999_999 },
  ]) await assert.rejects(setup(async () => response(bad)).tickBeach({ ticket: "visit" }));
});

test("missing or mismatched confirmations never invent a launch; standing and expired visits remain recoverable errors", async () => {
  const result = { event: event(), events: [event()], cooldowns: { coin: 0, duck: 0 }, serverTime: 1_001_000 };
  for (const bad of [{ ...result, event: event("duck") }, { ...result, events: [] }, { ...result, events: undefined }, { ...result, cooldowns: null }, {}])
    await assert.rejects(setup(async () => response(bad)).beachGardenMoment("visit", uuid(30), "coin"));
  let sent = false;
  const invalid = setup(async () => { sent = true; return response(result); });
  await assert.rejects(invalid.beachGardenMoment("visit", "invalid", "coin"));
  await assert.rejects(invalid.beachGardenMoment("visit", uuid(20), "lantern")); assert.equal(sent, false);
  for (const status of [400, 401, 403, 409, 429]) {
    const api = setup(async () => response({ error: "연못가 벤치에 앉은 뒤에 함께 띄워 주세요." }, status));
    await assert.rejects(api.beachGardenMoment("visit", uuid(20), "coin"), error => error instanceof Error && !(error instanceof api.BeachGone));
  }
  const gone = setup(async () => response({}, 410));
  await assert.rejects(gone.beachGardenMoment("visit", uuid(20), "coin"), error => error instanceof gone.BeachGone);
});
