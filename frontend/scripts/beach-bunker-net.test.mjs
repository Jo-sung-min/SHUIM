import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/net.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const plain = value => JSON.parse(JSON.stringify(value));
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, tickBeach, suspendBeach, setBeachRest, enterBeachBunker, BeachGone, BeachUnavailable };`, context);
  return context.api;
}
const standing = (bunkerId = "dawn") => ({ pose: "standing", spotId: null, slot: null,
  x: bunkerId === "dawn" ? -12 : 12, z: bunkerId === "dawn" ? 17.6 : 23.6, yaw: Math.PI, bunkerId });
const surface = { pose: "standing", spotId: null, slot: null, x: -12, z: 16.2, yaw: .75 };
const seat = (id, slot) => ({ pose: "sitting", spotId: `bunker-${id}-sofa`, slot, bunkerId: id,
  x: (id === "dawn" ? -12 : 12) + (slot < 3 ? -5.3 : 5.3), z: (id === "dawn" ? 23 : 29) + (slot % 3 - 1) * 1.8,
  yaw: slot < 3 ? -Math.PI / 2 : Math.PI / 2 });

test("only explicit Uyuni bunker capability enables entry, while resumed indoor state is retained", async () => {
  for (const value of [undefined, null, false, "true", 1]) {
    const entered = await setup(async () => response({ mapId: "uyuni", bunkerEnabled: value })).enterBeach("room", undefined, "uyuni");
    assert.equal(entered.bunkerEnabled, false);
  }
  for (const mapId of ["beach", "garden", "bamboo"]) {
    const entered = await setup(async () => response({ mapId, bunkerEnabled: true })).enterBeach("room", undefined, mapId);
    assert.equal(entered.bunkerEnabled, false);
    await assert.rejects(setup(async () => response({ mapId, selfRest: standing() })).enterBeach("room", undefined, mapId), /머물던 자리/);
  }
  const resumed = await setup(async () => response({ mapId: "uyuni", bunkerEnabled: true, resumed: true, sequence: 40, selfRest: seat("dusk", 5) }))
    .enterBeach("room", undefined, "uyuni", { ticket: "previous", sequence: 39 });
  assert.equal(resumed.bunkerEnabled, true); assert.deepEqual(plain(resumed.selfRest), seat("dusk", 5));
});

test("transitions send only the ticket, requested action, bunker and stable sequence", async () => {
  const calls = [];
  const api = setup(async (url, options) => { calls.push({ url, options }); return response(standing()); });
  for (let retry = 0; retry < 2; retry++) assert.deepEqual(plain(await api.enterBeachBunker("visit", "enter", "dawn", 12)), standing());
  for (const call of calls) {
    assert.equal(call.url, "/api/beach/bunker");
    assert.deepEqual(JSON.parse(call.options.body), { ticket: "visit", action: "enter", bunkerId: "dawn", sequence: 12 });
    assert.equal(call.options.credentials, "same-origin"); assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.deepEqual(plain(await setup(async () => response(surface)).enterBeachBunker("visit", "exit", "dawn", 13)), surface);
  let sent = 0;
  const invalid = setup(async () => { sent++; return response(surface); });
  for (const sequence of [undefined, null, -1, .5, "12", Infinity, Number.MAX_SAFE_INTEGER])
    await assert.rejects(invalid.enterBeachBunker("visit", "enter", "dawn", sequence), invalid.BeachUnavailable);
  await assert.rejects(invalid.enterBeachBunker("visit", "enter", "other", 1), invalid.BeachUnavailable);
  await assert.rejects(invalid.enterBeachBunker("visit", "jump", "dawn", 1), invalid.BeachUnavailable);
  assert.equal(sent, 0);
});

test("all twelve shared sofa seats require their canonical layer, slot, position and facing", async () => {
  for (const id of ["dawn", "dusk"]) for (let slot = 0; slot < 6; slot++) {
    const expected = seat(id, slot);
    const api = setup(async () => response(expected));
    assert.deepEqual(plain(await api.setBeachRest("visit", "sit", expected.spotId)), expected);
    for (const bad of [
      { ...expected, bunkerId: undefined }, { ...expected, bunkerId: id === "dawn" ? "dusk" : "dawn" },
      { ...expected, slot: 6 }, { ...expected, slot: -1 }, { ...expected, pose: "lying" },
      { ...expected, x: expected.x + .1 }, { ...expected, z: expected.z + .1 }, { ...expected, yaw: expected.yaw + .1 },
    ]) await assert.rejects(setup(async () => response(bad)).setBeachRest("visit", "sit", expected.spotId), /쉴 자리/);
    const rounded = { ...expected, x: Math.round(expected.x * 100) / 100, z: Math.round(expected.z * 100) / 100, yaw: Math.round(expected.yaw * 100) / 100 };
    const player = { pid: "p", id: "u", nick: "친구", skin: 0, moving: false, ...rounded };
    const poll = await setup(async () => response({ players: [player], selfRest: expected })).tickBeach({ ticket: "visit", bunkerId: id });
    assert.deepEqual(plain(poll.players[0]), player);
  }
});

test("layer and indoor bounds validation rejects malformed confirmations without inventing a floor", async () => {
  for (const bad of [
    { ...standing(), bunkerId: "other" }, { ...standing(), bunkerId: true }, { ...standing(), bunkerId: {} },
    { ...standing(), x: 12 }, { ...standing(), z: 40 }, { ...standing(), x: null },
    { ...standing(), pose: "lying", spotId: "hotel-dawn", slot: 0 },
    { ...standing(), spotId: "bunker-dawn-sofa", slot: 0 },
  ]) {
    await assert.rejects(setup(async () => response({ mapId: "uyuni", selfRest: bad })).enterBeach("room", undefined, "uyuni"), /머물던 자리/);
    await assert.rejects(setup(async () => response({ selfRest: bad })).tickBeach({ ticket: "visit", bunkerId: "dawn" }), /쉴 자리/);
    await assert.rejects(setup(async () => response({ players: [{ pid: "p", ...bad }] })).tickBeach({ ticket: "visit" }), /함께 머무는 층/);
  }
  await assert.rejects(setup(async () => response({ players: [{ ...seat("dawn", 0), bunkerId: undefined }] })).tickBeach({ ticket: "visit" }), /함께 머무는 층/);
  const legacy = await setup(async () => response({ selfRest: surface, players: [{ pid: "old", x: 0, z: 3, yaw: 0 }] })).tickBeach({ ticket: "visit" });
  assert.equal(legacy.selfRest.bunkerId, undefined); assert.equal(legacy.players[0].bunkerId, undefined);
});

test("movement and backgrounding carry the current layer without replaying transitions", async () => {
  const calls = [];
  const api = setup(async (url, options) => { calls.push({ url, options }); return response({ selfRest: standing(), sequence: 10 }); });
  const position = { ticket: "visit", sequence: 10, x: -11, z: 22, yaw: .4, bunkerId: "dawn" };
  await api.tickBeach({ ...position, moving: false }); api.suspendBeach(position);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2); assert.equal(calls[0].url, "/api/beach/tick"); assert.equal(calls[1].url, "/api/beach/suspend");
  assert.deepEqual(JSON.parse(calls[0].options.body), { ...position, moving: false });
  assert.deepEqual(JSON.parse(calls[1].options.body), position); assert.equal(calls[1].options.keepalive, true);
  await assert.rejects(api.tickBeach({ ...position, bunkerId: "wrong" }), api.BeachUnavailable);
  api.suspendBeach({ ...position, bunkerId: "wrong" }); assert.equal(calls.length, 2);
});

test("the next acknowledged poll repairs a lost entry or exit reply using the server floor", async () => {
  for (const [requestedLayer, confirmed] of [[null, standing()], ["dawn", surface]]) {
    const poll = await setup(async () => response({ sequence: 23, selfRest: confirmed }))
      .tickBeach({ ticket: "visit", sequence: 23, bunkerId: requestedLayer, x: 0, z: 0, yaw: 0, moving: false });
    assert.equal(poll.sequence, 23);
    assert.deepEqual(plain(poll.selfRest), confirmed, "the client accepts the current floor without fabricating a transition");
  }
});

test("mismatched transition replies and denied or expired tickets remain recoverable failures", async () => {
  await assert.rejects(setup(async () => response(surface)).enterBeachBunker("visit", "enter", "dawn", 1), /머무는 층/);
  await assert.rejects(setup(async () => response(standing("dusk"))).enterBeachBunker("visit", "enter", "dawn", 1), /머무는 층/);
  await assert.rejects(setup(async () => response(standing())).enterBeachBunker("visit", "exit", "dawn", 1), /머무는 층/);
  for (const status of [400, 401, 403, 409]) {
    const api = setup(async () => response({ error: "다시 확인" }, status));
    await assert.rejects(api.enterBeachBunker("visit", "enter", "dawn", 1), error => error instanceof api.BeachUnavailable && error.status === status);
  }
  const gone = setup(async () => response({}, 410));
  await assert.rejects(gone.enterBeachBunker("visit", "enter", "dawn", 1), gone.BeachGone);
});
