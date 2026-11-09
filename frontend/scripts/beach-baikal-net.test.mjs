import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const compile = async file => stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), "utf8"))
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const source = await compile("../lib/beach/net.ts");
const layoutSource = await compile("../lib/beach/baikal-layout.ts");
const layout = {};
vm.runInNewContext(`${layoutSource}\nglobalThis.seats = BAIKAL_SEATS; globalThis.spawn = BAIKAL_SPAWN; globalThis.bounds = BAIKAL_BOUNDS;`, layout);
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const plain = value => JSON.parse(JSON.stringify(value));
const seat = value => ({ pose: "sitting", spotId: value.spotId, slot: value.slot, x: value.x, z: value.z, yaw: value.yaw });
const auto = { mode: "auto", hour: null, version: 0 };
const standing = { pose: "standing", spotId: null, slot: null, x: 0, z: 40, yaw: .17 };
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, tickBeach, setBeachRest, fetchBeachCount, BeachUnavailable };`, context);
  return context.api;
}

test("Baikal entry exposes only the cabin seats and keeps its own storm clock: no beds, starlight, fire or bunkers", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ mapId: "baikal", communityId: "소로우 & 함께", count: 2, capacity: 20, selfRest: standing, lighting: auto,
      pavilionEnabled: true, restEnabled: true, bedEnabled: true, bunkerEnabled: true, fireEnabled: true, benchEnabled: true, onsenEnabled: true });
  });
  const entered = await api.enterBeach("소로우 & 함께", undefined, "baikal");
  assert.equal(entered.pavilionEnabled, true); assert.deepEqual(plain(entered.lighting), auto);
  for (const capability of ["restEnabled", "bedEnabled", "bunkerEnabled", "fireEnabled", "benchEnabled", "onsenEnabled"]) assert.equal(entered[capability], false, capability);
  assert.deepEqual(JSON.parse(calls[0].options.body), { communityId: "소로우 & 함께", mapId: "baikal" });
  const count = await api.fetchBeachCount("소로우 & 함께", "baikal");
  assert.equal(count.count, 2);
  assert.equal(calls[1].url, `/api/beach/count?communityId=${encodeURIComponent("소로우 & 함께")}&mapId=baikal`);
});

test("all thirty-six canonical seats across the three cabins are accepted and anything else is refused", async () => {
  assert.equal(layout.seats.length, 36);
  for (const canonical of layout.seats) {
    const api = setup(async () => response({ mapId: "baikal", communityId: "c", count: 1, capacity: 20, selfRest: seat(canonical), lighting: auto, pavilionEnabled: true }));
    const entered = await api.enterBeach("c", undefined, "baikal");
    assert.equal(entered.selfRest.spotId, canonical.spotId); assert.equal(entered.selfRest.slot, canonical.slot);
  }
  const sofa = layout.seats.find(s => s.spotId === "baikal-sofa" && s.slot === 2);
  for (const [label, bad] of [
    ["a shifted seat", { ...seat(sofa), x: sofa.x + .05 }],
    ["a turned seat", { ...seat(sofa), yaw: sofa.yaw + .1 }],
    ["a slot past the sofa's end", { ...seat(sofa), slot: 4 }],
    ["a seat on the chair's second slot", { ...seat(layout.seats.find(s => s.spotId === "baikal-chair")), slot: 1 }],
    ["lying on a sofa", { ...seat(sofa), pose: "lying" }],
    ["a bunker layer in the cabin", { ...seat(sofa), bunkerId: "dawn" }],
    ["an unknown cabin piece", { ...seat(sofa), spotId: "baikal-bed" }],
  ]) {
    const api = setup(async () => response({ mapId: "baikal", communityId: "c", count: 1, capacity: 20, selfRest: bad, lighting: auto, pavilionEnabled: true }));
    await assert.rejects(api.enterBeach("c", undefined, "baikal"), /머물던 자리/, label);
  }
});

test("new cabin identities cannot be combined with another house's seat coordinates", async () => {
  const first = layout.seats.find(s => s.spotId === "baikal-sofa" && s.slot === 0);
  for (const prefix of ["baikal-refuge", "baikal-aurora"]) {
    const sofa = layout.seats.find(s => s.spotId === `${prefix}-sofa` && s.slot === 0);
    for (const bad of [
      { ...seat(first), spotId: sofa.spotId },
      { ...seat(sofa), spotId: first.spotId },
      { ...seat(sofa), z: sofa.z + .05 },
      { ...seat(sofa), yaw: sofa.yaw + .1 },
      { ...seat(sofa), slot: 4 },
      { ...seat(sofa), pose: "lying" },
    ]) {
      const api = setup(async () => response(bad));
      await assert.rejects(api.setBeachRest("ticket", "sit", bad.spotId), /쉴 자리/);
    }
  }
});

test("rounded remote visitors retain every cabin seat and malformed remote seats are rejected", async () => {
  for (const canonical of layout.seats) {
    const remote = { ...seat(canonical), pid: "peer", id: "member", nick: "함께", skin: 0, moving: false };
    for (const key of ["x", "z", "yaw"]) remote[key] = Math.round(remote[key] * 100) / 100;
    const api = setup(async () => response({ players: [remote], selfRest: standing, sequence: 2 }));
    const result = await api.tickBeach({ ticket: "ticket", x: 0, z: 40, yaw: .17, sequence: 2 });
    assert.equal(result.players[0].spotId, canonical.spotId);
    assert.equal(result.players[0].slot, canonical.slot);
  }
  const aurora = seat(layout.seats.find(s => s.spotId === "baikal-aurora-chair"));
  for (const bad of [{ ...aurora, z: 12.2 }, { ...aurora, slot: 1 }, { ...aurora, spotId: "baikal-aurora-bed" }]) {
    const api = setup(async () => response({ players: [bad], selfRest: standing, sequence: 2 }));
    await assert.rejects(api.tickBeach({ ticket: "ticket", x: 0, z: 40, yaw: .17, sequence: 2 }), /함께 쉬는 자리/);
  }
});

test("a resumed walk beyond the old south boundary keeps its location and the expanded room bounds", async () => {
  const calls = [], returning = { ...standing, x: 74, z: -220, yaw: .3 };
  assert.deepEqual(plain(layout.bounds), { minX: -120, maxX: 120, minZ: -240, maxZ: 70 });
  const api = setup(async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return response({ mapId: "baikal", communityId: "c", count: 1, capacity: 20, selfRest: returning, spawn: returning,
      bounds: layout.bounds, resumed: true, sequence: 8, lighting: auto, pavilionEnabled: true });
  });
  const result = await api.enterBeach("c", undefined, "baikal", { ticket: "old-ticket", sequence: 8 });
  assert.equal(result.resumed, true); assert.equal(result.selfRest.z, -220); assert.equal(result.spawn.x, 74);
  assert.equal(result.bounds.minZ, -240); assert.equal(result.capacity, 20);
  assert.deepEqual(calls[0], { communityId: "c", mapId: "baikal", resumeTicket: "old-ticket", sequence: 8 });
});

test("seats never cross maps: a cloud-spa seat on Baikal and a Baikal seat elsewhere are both rejected", async () => {
  const sofa = seat(layout.seats[0]);
  const cloud = { pose: "sitting", spotId: "cloud-lounge", slot: 0, x: -10.5, z: 102, yaw: -Math.PI / 2 };
  let api = setup(async () => response({ mapId: "baikal", communityId: "c", count: 1, capacity: 20, selfRest: cloud, lighting: auto, pavilionEnabled: true }));
  await assert.rejects(api.enterBeach("c", undefined, "baikal"), /머물던 자리/);
  api = setup(async () => response({ mapId: "garden", communityId: "c", count: 1, capacity: 20, selfRest: sofa, lighting: auto, pavilionEnabled: true }));
  await assert.rejects(api.enterBeach("c", undefined, "garden"), /머물던 자리/);
  api = setup(async () => response({ mapId: "cloudspa", communityId: "c", count: 1, capacity: 20, selfRest: sofa, lighting: auto, pavilionEnabled: true }));
  await assert.rejects(api.enterBeach("c", undefined, "cloudspa"), /머물던 자리/);
  api = setup(async () => response({ mapId: "cloudspa", communityId: "c", count: 1, capacity: 20, selfRest: standing, lighting: auto, pavilionEnabled: true }));
  await assert.rejects(api.enterBeach("c", undefined, "baikal"), /입장을 확인하지/);
});

test("the tick accepts a confirmed cabin seat and a rest claim names the seat", async () => {
  const chair = layout.seats.find(s => s.spotId === "baikal-chair");
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url === "/api/beach/rest") return response(seat(chair));
    return response({ players: [], selfRest: seat(chair), sequence: 3 });
  });
  const rest = await api.setBeachRest("ticket", "sit", "baikal-chair");
  assert.equal(rest.spotId, "baikal-chair"); assert.deepEqual(calls[0].body, { ticket: "ticket", action: "sit", spotId: "baikal-chair" });
  const tick = await api.tickBeach({ ticket: "ticket", x: chair.x, z: chair.z, yaw: chair.yaw, sequence: 3 });
  assert.equal(tick.selfRest.slot, 0);
});
