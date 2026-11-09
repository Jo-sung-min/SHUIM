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
vm.runInNewContext(`${layoutSource}\nglobalThis.seats = BAIKAL_SEATS; globalThis.spawn = BAIKAL_SPAWN;`, layout);
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

test("every one of the twelve canonical cabin seats is accepted and anything else is refused", async () => {
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
