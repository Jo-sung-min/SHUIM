import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const compile = async file => stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const source = await compile("../lib/beach/net.ts");
const layoutSource = await compile("../lib/beach/cloud-spa-layout.ts");
const layout = {};
vm.runInNewContext(`${layoutSource}\nglobalThis.seats = CLOUD_SPA_SEATS;`, layout);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const plain = value => JSON.parse(JSON.stringify(value));
const seat = value => ({ pose: "sitting", spotId: value.spotId, slot: value.slot, x: value.x, z: value.z, yaw: value.yaw });
const night = { mode: "night", hour: 20, version: 0 };
const standing = { pose: "standing", spotId: null, slot: null, x: 0, z: 91, yaw: 0 };
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, tickBeach, suspendBeach, setBeachRest, setBeachLighting,
    fetchBeachCount, BeachGone, BeachUnavailable };`, context);
  return context.api;
}

test("cloud-spa entry and counts stay map-scoped and expose only explicitly supported places", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ mapId: "cloudspa", communityId: "소로우 & 함께", count: 4, capacity: 100, selfRest: standing, lighting: night,
      pavilionEnabled: true, restEnabled: true, bedEnabled: true, bunkerEnabled: true, fireEnabled: true,
      benchEnabled: true, onsenEnabled: true, uyuniMomentsEnabled: true, gardenMomentsEnabled: true });
  });
  const entered = await api.enterBeach("소로우 & 함께", undefined, "cloudspa");
  assert.equal(entered.pavilionEnabled, true); assert.deepEqual(plain(entered.lighting), night);
  for (const capability of ["restEnabled", "bedEnabled", "bunkerEnabled", "fireEnabled", "benchEnabled", "onsenEnabled", "uyuniMomentsEnabled", "gardenMomentsEnabled"])
    assert.equal(entered[capability], false, capability);
  assert.deepEqual(JSON.parse(calls[0].options.body), { communityId: "소로우 & 함께", mapId: "cloudspa" });
  const count = await api.fetchBeachCount("소로우 & 함께", "cloudspa");
  assert.equal(count.count, 4); assert.equal(count.capacity, 100);
  assert.equal(calls[1].url, `/api/beach/count?communityId=${encodeURIComponent("소로우 & 함께")}&mapId=cloudspa`);
  for (const value of [undefined, null, false, "true", 1]) {
    const older = await setup(async () => response({ mapId: "cloudspa", pavilionEnabled: value })).enterBeach("room", undefined, "cloudspa");
    assert.equal(older.pavilionEnabled, false, "an older server cannot invent available shared seats");
  }
});

test("all thirty-six renderer seats accept authoritative seating and two-decimal remote snapshots", async () => {
  assert.equal(layout.seats.length, 36);
  for (const rendered of layout.seats) {
    const expected = seat(rendered);
    const confirmed = await setup(async () => response(expected)).setBeachRest("visit", "sit", expected.spotId);
    assert.deepEqual(plain(confirmed), expected);
    const remote = { pid: "friend", id: "member", nick: "친구", skin: 0, moving: false, ...expected,
      x: Math.round(expected.x * 100) / 100, z: Math.round(expected.z * 100) / 100, yaw: Math.round(expected.yaw * 100) / 100 };
    const tick = await setup(async () => response({ selfRest: expected, players: [remote], sequence: 12, lighting: night }))
      .tickBeach({ ticket: "visit", sequence: 12, bunkerId: null });
    assert.deepEqual(plain(tick.selfRest), expected); assert.deepEqual(plain(tick.players[0]), plain(remote));
    const resumed = await setup(async () => response({ mapId: "cloudspa", resumed: true, selfRest: expected, sequence: 13 }))
      .enterBeach("room", undefined, "cloudspa", { ticket: "visit", sequence: 13 });
    assert.deepEqual(plain(resumed.selfRest), expected);
  }
});

test("invalid poses, seats, floors and displaced confirmations cannot put a visitor outside the shared place", async () => {
  for (const rendered of layout.seats) {
    const expected = seat(rendered);
    for (const bad of [
      { ...expected, pose: "lying" }, { ...expected, slot: 6 }, { ...expected, slot: -1 }, { ...expected, slot: .5 },
      { ...expected, x: expected.x + .1 }, { ...expected, z: expected.z + .1 }, { ...expected, yaw: expected.yaw + .1 },
      { ...expected, bunkerId: "dawn" }, { ...expected, spotId: "cloud-pool-6" },
    ]) {
      await assert.rejects(setup(async () => response(bad)).setBeachRest("visit", "sit", expected.spotId), /쉴 자리/);
      await assert.rejects(setup(async () => response({ selfRest: bad })).tickBeach({ ticket: "visit" }), /쉴 자리/);
    }
  }
  const badRemote = { ...seat(layout.seats[0]), x: layout.seats[0].x + 1 };
  await assert.rejects(setup(async () => response({ players: [badRemote] })).tickBeach({ ticket: "visit" }), /함께 쉬는 자리/);
});

test("crossed-map entry and rest confirmations are rejected before the wrong world is resumed", async () => {
  const calls = [];
  const api = setup(async (url, options) => { calls.push({ url, options }); return response({ mapId: "garden", ticket: "wrong-map" }); });
  await assert.rejects(api.enterBeach("room", undefined, "cloudspa"), api.BeachUnavailable);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1].url, "/api/beach/leave"); assert.deepEqual(JSON.parse(calls[1].options.body), { ticket: "wrong-map" });
  for (const mapId of ["beach", "uyuni", "bamboo", "garden"])
    await assert.rejects(setup(async () => response({ mapId, selfRest: seat(layout.seats[0]) })).enterBeach("room", undefined, mapId), /머물던 자리/);
  for (const rest of [
    { pose: "sitting", spotId: "hall-tier-1", slot: 0, x: -10.8, z: 62.6, yaw: 0 },
    { pose: "lying", spotId: "starlight", slot: 0, x: 7, z: 7, yaw: 0 },
  ]) await assert.rejects(setup(async () => response({ mapId: "cloudspa", selfRest: rest })).enterBeach("room", undefined, "cloudspa"), /머물던 자리/);
  await assert.rejects(setup(async () => response({ mapId: "garden", communityId: "room", count: 0, capacity: 100 })).fetchBeachCount("room", "cloudspa"), /함께 쉬는 인원/);
});

test("backgrounding sends the current position and a renewed visit accepts the server approach after expiry", async () => {
  const calls = [], approach = { ...standing, x: 10.8, z: 106.3, yaw: .75 };
  const api = setup(async (url, options) => { calls.push({ url, options }); return response({ mapId: "cloudspa", resumed: true, sequence: 19, selfRest: approach }); });
  api.suspendBeach({ ticket: "visit", sequence: 18, x: 10.5, z: 106, yaw: Math.PI / 2, bunkerId: null });
  const resumed = await api.enterBeach("room", undefined, "cloudspa", { ticket: "visit", sequence: 19 });
  assert.equal(calls[0].url, "/api/beach/suspend"); assert.equal(calls[0].options.keepalive, true);
  assert.deepEqual(JSON.parse(calls[1].options.body), { communityId: "room", mapId: "cloudspa", resumeTicket: "visit", sequence: 19 });
  assert.deepEqual(plain(resumed.selfRest), approach);
  assert.deepEqual(plain(await setup(async () => response(approach)).setBeachRest("visit", "stand")), approach);
});

test("lighting changes need a matching confirmation and denied or expired rest visits remain recoverable errors", async () => {
  const changed = await setup(async () => response({ mode: "day", hour: 12, version: 1 })).setBeachLighting("visit", "day");
  assert.equal(changed.mode, "day");
  await assert.rejects(setup(async () => response(night)).setBeachLighting("visit", "day"), /방의 시간/);
  for (const status of [400, 401, 403, 409]) {
    const api = setup(async () => response({ error: "다시 확인" }, status));
    await assert.rejects(api.setBeachRest("visit", "sit", "cloud-pool-1"), error => error instanceof api.BeachUnavailable && error.status === status);
    await assert.rejects(api.setBeachLighting("visit", "day"), error => error instanceof api.BeachUnavailable && error.status === status);
  }
  const gone = setup(async () => response({}, 410));
  await assert.rejects(gone.setBeachRest("visit", "sit", "cloud-lounge"), gone.BeachGone);
});

test("cloud-spa saved visits and camera state remain isolated from every other map and community", async () => {
  const source = await compile("../lib/beach/continuity.ts"), storage = new Map();
  const context = { window: { sessionStorage: { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } } };
  vm.runInNewContext(`${source}\nglobalThis.api = { saveBeachVisit, readBeachVisit, forgetBeachVisit };`, context);
  const { api } = context, now = 1_800_000_000_000;
  const saved = { version: 1, userId: "member", ticket: "spa-visit", sequence: 19, savedAt: now,
    camera: { view: "third", yaw: .2, pitch: .1, orbitYaw: .3, restSpot: "cloud-pool-1" } };
  api.saveBeachVisit("room", "cloudspa", saved);
  assert.deepEqual(plain(api.readBeachVisit("room", "cloudspa", now + 1)), saved);
  for (const mapId of ["beach", "uyuni", "bamboo", "garden"]) assert.equal(api.readBeachVisit("room", mapId, now + 1), null);
  assert.equal(api.readBeachVisit("another", "cloudspa", now + 1), null);
  api.saveBeachVisit("room", "garden", { ...saved, ticket: "garden-visit" });
  api.forgetBeachVisit("room", "cloudspa");
  assert.equal(api.readBeachVisit("room", "cloudspa", now + 1), null); assert.equal(api.readBeachVisit("room", "garden", now + 1).ticket, "garden-visit");
});
