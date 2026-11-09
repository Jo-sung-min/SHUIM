import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/net.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { readBoardGame, playBoardGame, enterBeach, fetchBeachCount, tickBeach, suspendBeach, setBeachRest, setBeachLighting, launchBeachFireworks, readFireworkEvent, addFirewood, addFirePowder, BeachGone, BeachUnavailable, BeachCooldown };`, context);
  return context.api;
}

const fireworksEvent = { id: "c5b26760-2e99-4c83-94d6-5a25794c2f17", seed: 9157, startedAt: 1_000_000, durationMs: 12_000 };
const fireworksState = { fireworks: [fireworksEvent], serverTime: 1_001_000, fireworksCooldownUntil: 1_015_000 };

test("a board between games arrives without its empty fields and still opens", async () => {
  // Exactly what the server sends for an empty table: its JSON settings drop every null field.
  const sent = { id: "bunker-dawn-othello", game: "othello", size: 8, cells: `${".".repeat(27)}WB${".".repeat(6)}BW${".".repeat(27)}`, legal: [], blackCount: 2, whiteCount: 2, turnMsLeft: 0, version: 0 };
  const api = setup(async () => response({ players: [], events: [], count: 1, received: { comfort: 0, hug: 0 }, fire: {}, boardGames: [sent, { ...sent, id: "broken", size: 9 }] }));
  const board = api.readBoardGame(sent);
  for (const field of ["black", "white", "turn", "result", "reason", "lastCell", "passed"]) assert.equal(board[field], null, field);
  for (const bad of [{ ...sent, size: 9 }, { ...sent, cells: "x" }, { ...sent, game: "go" }, { ...sent, turn: "red" }, { ...sent, lastCell: 64 }, { ...sent, black: { pid: 1, nick: "a" } }, { ...sent, version: -.5 }, null]) assert.equal(api.readBoardGame(bad), null);
  const ticked = await api.tickBeach({ ticket: "t", sequence: 1, x: 0, z: 0, yaw: 0, moving: false });
  assert.deepEqual(Array.from(ticked.boardGames, item => item.id), ["bunker-dawn-othello"], "a malformed board is dropped, a sparse one is kept");
});

test("resume entry carries scoped ticket and ordering fence and accepts the server rest state", async () => {
  let sent;
  const rest = { pose: "lying", spotId: "hotel-dawn", slot: 1, x: -12, z: 23, yaw: 0 };
  const api = setup(async (url, options) => { sent = { url, options }; return response({ mapId: "uyuni", resumed: true, sequence: 51, selfRest: rest }); });
  const entered = await api.enterBeach("ours", "male", "uyuni", { ticket: "previous-visit", sequence: 50 });
  assert.deepEqual(JSON.parse(sent.options.body), { communityId: "ours", character: "male", mapId: "uyuni", resumeTicket: "previous-visit", sequence: 50 });
  assert.equal(entered.resumed, true); assert.equal(entered.sequence, 51);
  assert.deepEqual(JSON.parse(JSON.stringify(entered.selfRest)), rest);
});

test("invalid ordering acknowledgements and unconfirmed rest data are rejected", async () => {
  for (const sequence of [null, -1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
    const api = setup(async () => response({ sequence }));
    await assert.rejects(api.enterBeach("ours"), /방문 순서/);
    await assert.rejects(api.tickBeach({ ticket: "visit", sequence: 1 }), /방문 순서/);
  }
  await assert.rejects(setup(async () => response({ selfRest: { pose: "lying", slot: 99 } })).enterBeach("ours"), /머물던 자리/);
});

test("map entry preserves server walking bounds and resumed positions without sharing the beach limit", async () => {
  for (const [mapId, minZ, z] of [["uyuni", -50, -45], ["beach", -1, 3]]) {
    const bounds = { minX: -22, maxX: 22, minZ, maxZ: 55 };
    const spawn = { x: 0, z, yaw: 0.2 };
    const api = setup(async () => response({ mapId, resumed: true, sequence: 51, bounds, spawn }));
    const entered = await api.enterBeach("ours", "male", mapId, { ticket: "previous-visit", sequence: 50 });
    assert.deepEqual(JSON.parse(JSON.stringify(entered.bounds)), bounds);
    assert.deepEqual(JSON.parse(JSON.stringify(entered.spawn)), spawn);
  }
});

test("a cancelled lifecycle request aborts both entry and tick transport", async () => {
  for (const method of ["enter", "tick"]) {
    const controller = new AbortController(); let transport;
    const api = setup(async (_url, options) => { transport = options.signal; return response({ sequence: 4 }); });
    if (method === "enter") await api.enterBeach("ours", undefined, "beach", undefined, controller.signal);
    else await api.tickBeach({ ticket: "visit", sequence: 4 }, controller.signal);
    assert.equal(transport.aborted, false); controller.abort(); assert.equal(transport.aborted, true);
  }
});

test("suspending keeps the last position and sequence without replaying a social action", async () => {
  const calls = [];
  const api = setup(async (url, options) => { calls.push({ url, options }); throw new Error("connection went away"); });
  api.suspendBeach({ ticket: "visit", sequence: 8, x: 12, z: 19, yaw: 1.2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/beach/suspend");
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[0].options.body), { ticket: "visit", sequence: 8, x: 12, z: 19, yaw: 1.2 });
});

test("fireworks and onsen controls require their own explicit server capabilities", async () => {
  for (const grant of [undefined, null, false, "true", 1]) {
    const entered = await setup(async () => response({ ...fireworksState, fireworksControl: grant, onsenEnabled: grant,
      lightingControl: true, careCapabilities: { hug: true } })).enterBeach("room");
    assert.equal(entered.fireworksControl, false);
    assert.equal(entered.onsenEnabled, false);
    assert.equal(entered.fireworks.length, 1, "regular visitors still watch a shared event");
  }
  const unsupported = await setup(async () => response({ fireworksControl: true })).enterBeach("old-room");
  assert.equal(unsupported.fireworksControl, false, "a legacy response cannot grant an unsupported action");
  assert.equal(unsupported.fireworks.length, 0);
  const entered = await setup(async () => response({ ...fireworksState, fireworksControl: true, onsenEnabled: true })).enterBeach("room");
  assert.equal(entered.fireworksControl, true); assert.equal(entered.onsenEnabled, true);
});

test("fireworks launch sends the owned ticket, stable retry UUID and default style and accepts the confirmed event", async () => {
  const calls = [], result = { event: fireworksEvent, serverTime: 1_001_000, cooldownUntil: 1_015_000 };
  const api = setup(async (url, options) => { calls.push({ url, options }); return response(result); });
  const requestId = "fcf05151-67de-4974-bdb1-67e64d8549db";
  const first = await api.launchBeachFireworks("admin-visit", requestId);
  const retried = await api.launchBeachFireworks("admin-visit", requestId);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), { ...result, event: { ...fireworksEvent, variant: "festival" } });
  assert.equal(first.event.id, retried.event.id);
  for (const call of calls) {
    assert.equal(call.url, "/api/beach/fireworks");
    assert.deepEqual(JSON.parse(call.options.body), { ticket: "admin-visit", requestId, variant: "festival" });
    assert.equal(call.options.credentials, "same-origin");
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  const oldRetry = await setup(async () => response({ ...result, serverTime: 1_030_000 })).launchBeachFireworks("admin-visit", requestId);
  assert.equal(oldRetry.event.startedAt, fireworksEvent.startedAt, "an expired retry is acknowledged without inventing a fresh start time");
});

test("all fireworks styles round-trip and retry responses retain the server's original style", async () => {
  for (const variant of ["festival", "songi", "love", "bloom", "saturn", "willow", "stardust", "offbeat", "aurora", "jewels"]) {
    let body;
    const event = { ...fireworksEvent, variant };
    const api = setup(async (_url, options) => { body = JSON.parse(options.body); return response({ event, serverTime: 1_001_000, cooldownUntil: 1_015_000 }); });
    const launched = await api.launchBeachFireworks("admin", "stable-retry-id", variant);
    assert.equal(body.variant, variant);
    assert.equal(launched.event.variant, variant);
    const changedRetry = await api.launchBeachFireworks("admin", "stable-retry-id", variant === "love" ? "songi" : "love");
    assert.equal(changedRetry.event.variant, variant, "a retry acknowledges the existing event rather than inventing a new style");
    const tick = await setup(async () => response({ ...fireworksState, fireworks: [event] })).tickBeach({ ticket: "observer" });
    assert.equal(tick.fireworks[0].variant, variant);
    const entered = await setup(async () => response({ ...fireworksState, fireworks: [event], mapId: "uyuni", communityId: "room" })).enterBeach("room", undefined, "uyuni");
    assert.equal(entered.fireworks[0].variant, variant, "a late Uyuni visitor sees the same style");
  }
});

test("legacy fireworks default to festival and malformed styles never reach the server or renderer", async () => {
  const api = setup(async () => { throw new Error("must not send malformed styles"); });
  assert.equal(api.readFireworkEvent(fireworksEvent).variant, "festival");
  for (const variant of [null, "", "Festival", "love ", "songi-cheer", "custom", 1, true, {}, []]) {
    assert.equal(api.readFireworkEvent({ ...fireworksEvent, variant }), null);
    await assert.rejects(api.launchBeachFireworks("admin", "retry", variant), /불꽃놀이 종류/);
    await assert.rejects(setup(async () => response({ ...fireworksState, fireworks: [{ ...fireworksEvent, variant }] })).enterBeach("room"));
  }
  assert.equal(api.readFireworkEvent({ ...fireworksEvent, variant: undefined }), null);
  await assert.rejects(setup(async () => response({ ...fireworksState, fireworks: [fireworksEvent, { ...fireworksEvent, variant: "love" }] })).tickBeach({ ticket: "observer" }));
  const compatible = await setup(async () => response({ ...fireworksState, fireworks: [fireworksEvent, { ...fireworksEvent, variant: "festival" }] })).tickBeach({ ticket: "observer" });
  assert.equal(compatible.fireworks.length, 1);
});

test("songi's extended finale survives late entry and tick until eighteen seconds on every map", async () => {
  const event = { ...fireworksEvent, variant: "songi", durationMs: 18_000 };
  const state = { fireworks: [event], serverTime: event.startedAt + 17_999, fireworksCooldownUntil: event.startedAt + 21_000 };
  for (const mapId of ["beach", "uyuni", "bamboo", "garden"]) {
    const entered = await setup(async () => response({ ...state, mapId })).enterBeach("room", undefined, mapId);
    assert.equal(entered.fireworks[0].durationMs, 18_000);
    assert.equal(entered.fireworksCooldownUntil, state.fireworksCooldownUntil);
    const tick = await setup(async () => response(state)).tickBeach({ ticket: "observer" });
    assert.equal(tick.fireworks[0].id, event.id);
  }
  const expired = await setup(async () => response({ ...state, serverTime: event.startedAt + 18_000 })).tickBeach({ ticket: "observer" });
  assert.equal(expired.fireworks.length, 0); assert.equal(expired.fireworksCooldownUntil, state.fireworksCooldownUntil);
  const launch = { event, serverTime: event.startedAt, cooldownUntil: event.startedAt + 21_000 };
  const api = setup(async () => response(launch));
  assert.equal((await api.launchBeachFireworks("admin", "retry", "songi")).event.durationMs, 18_000);
  const oldRetry = await setup(async () => response({ ...launch, serverTime: event.startedAt + 30_000, cooldownUntil: event.startedAt + 45_000 }))
    .launchBeachFireworks("admin", "retry", "love");
  assert.equal(oldRetry.event.startedAt, event.startedAt, "old request identities do not restart the finale");
  assert.equal(oldRetry.event.variant, "songi");
});

test("only songi accepts the bounded eighteen-second contract; legacy twelve-second songi still works", async () => {
  const api = setup(async () => response({}));
  assert.equal(api.readFireworkEvent({ ...fireworksEvent, variant: "songi" }).durationMs, 12_000);
  for (const variant of [undefined, "festival", "love", "bloom", "saturn", "willow", "stardust", "offbeat", "aurora", "jewels"])
    assert.equal(api.readFireworkEvent({ ...fireworksEvent, ...(variant ? { variant } : {}), durationMs: 18_000 }), null);
  for (const durationMs of [0, 12_001, 17_999, 18_001, 21_000])
    assert.equal(api.readFireworkEvent({ ...fireworksEvent, variant: "songi", durationMs }), null);
  const event = { ...fireworksEvent, variant: "songi", durationMs: 18_000 };
  for (const cooldownUntil of [event.startedAt + 15_000, event.startedAt + 20_999, event.startedAt + 21_001]) {
    const launch = { event, serverTime: event.startedAt, cooldownUntil };
    await assert.rejects(setup(async () => response(launch)).launchBeachFireworks("admin", "retry", "songi"));
    await assert.rejects(setup(async () => response({ fireworks: [event], serverTime: launch.serverTime, fireworksCooldownUntil: cooldownUntil })).tickBeach({ ticket: "observer" }));
  }
  assert.equal(api.readFireworkEvent({ ...event, startedAt: Number.MAX_SAFE_INTEGER - 20_999 }), null);
});

test("fireworks snapshots deduplicate repeated IDs, order events and discard expired animations", async () => {
  const api = setup(async () => response({ ...fireworksState, fireworks: [fireworksEvent, fireworksEvent] }));
  const tick = await api.tickBeach({ ticket: "observer" });
  assert.equal(tick.fireworks.length, 1);
  const expired = await setup(async () => response({ ...fireworksState, serverTime: 1_012_000 })).tickBeach({ ticket: "observer" });
  assert.equal(expired.fireworks.length, 0);
  assert.equal(expired.fireworksCooldownUntil, 1_015_000);
  const earlier = { ...fireworksEvent, id: "3684c17d-35de-437d-a728-6324d996d09e", startedAt: 999_500 };
  const ordered = await setup(async () => response({ ...fireworksState, fireworks: [fireworksEvent, earlier] })).tickBeach({ ticket: "observer" });
  assert.equal(ordered.fireworks[0].id, earlier.id);
});

test("malformed fireworks cannot allocate unbounded effects or introduce untrusted event fields", async () => {
  for (const invalid of [null, {}, { ...fireworksEvent, id: "not-an-id" }, { ...fireworksEvent, seed: 0 },
    { ...fireworksEvent, seed: 1.5 }, { ...fireworksEvent, seed: 2147483647 }, { ...fireworksEvent, durationMs: 999999 },
    { ...fireworksEvent, startedAt: -1 }, { ...fireworksEvent, startedAt: 1_010_000 }, { ...fireworksEvent, admin: true }]) {
    await assert.rejects(setup(async () => response({ ...fireworksState, fireworks: [invalid] })).tickBeach({ ticket: "observer" }));
    await assert.rejects(setup(async () => response({ event: invalid, serverTime: 1_001_000, cooldownUntil: 1_015_000 })).launchBeachFireworks("admin", "retry"));
  }
  for (const value of [{ ...fireworksState, fireworks: [fireworksEvent, fireworksEvent, fireworksEvent] },
    { ...fireworksState, serverTime: null }, { ...fireworksState, fireworksCooldownUntil: 1_000_000 },
    { ...fireworksState, fireworksCooldownUntil: 1_100_000 }, { ...fireworksState, fireworks: [fireworksEvent, { ...fireworksEvent, seed: 2 }] }]) {
    await assert.rejects(setup(async () => response(value)).enterBeach("room"));
  }
  await assert.rejects(setup(async () => response({ event: fireworksEvent, serverTime: 1_001_000, cooldownUntil: 1_015_000, fireworksControl: true }))
    .launchBeachFireworks("admin", "retry"));
});

test("fireworks authorization, expired visits and cooldown errors never fabricate a launch", async () => {
  for (const status of [401, 403]) {
    const api = setup(async () => response({ error: "관리자만 시작할 수 있어요." }, status));
    await assert.rejects(api.launchBeachFireworks("member", "retry"), error => error instanceof api.BeachUnavailable && error.status === status);
  }
  const gone = setup(async () => response({}, 410));
  await assert.rejects(gone.launchBeachFireworks("expired", "retry"), error => error instanceof gone.BeachGone);
  const cooldown = setup(async () => response({ error: "잠시 기다려 주세요." }, 429));
  await assert.rejects(cooldown.launchBeachFireworks("admin", "retry"), error => error instanceof cooldown.BeachCooldown);
});

test("onsen claims accept each bath's nine seats at their real coordinates and three floats anywhere in that bath", async () => {
  const centers = [[0, 45], [-7.6, 55], [7.6, 55]];
  for (const spotId of ["onsen-benches", "onsen-float"]) {
    const sitting = spotId === "onsen-benches";
    const perBath = sitting ? 9 : 3;
    for (let slot = 0; slot < perBath * centers.length; slot++) {
      const [bathX, bathZ] = centers[Math.floor(slot / perBath)], place = slot % perBath, angle = (-30 + place * 30) * Math.PI / 180;
      const state = { spotId, slot, pose: sitting ? "sitting" : "lying", x: bathX + (sitting ? Math.cos(angle) * 3.55 : (place - 1) * 2.4),
        z: bathZ + (sitting ? Math.sin(angle) * 3.55 : -1.7), yaw: sitting ? Math.atan2(Math.cos(angle), Math.sin(angle)) : 0 };
      const api = setup(async () => response(state));
      assert.equal((await api.setBeachRest("member", sitting ? "sit" : "lie", spotId)).slot, slot);
      assert.equal((await setup(async () => response({ selfRest: state })).tickBeach({ ticket: "member" })).selfRest.slot, slot);
      if (!sitting) assert.equal((await setup(async () => response({ ...state, x: bathX + 3.4, z: bathZ, yaw: 2 })).setBeachRest("member", "lie", spotId)).yaw, 2, "a float may have drifted and turned");
      for (const bad of [{ ...state, x: 20 }, { ...state, z: 12 }, ...(sitting ? [{ ...state, yaw: state.yaw + 1 }] : [{ ...state, x: bathX + 3.6, z: bathZ }]),
        { ...state, slot: perBath * centers.length }, { ...state, pose: sitting ? "lying" : "sitting" }]) {
        await assert.rejects(setup(async () => response(bad)).setBeachRest("member", sitting ? "sit" : "lie", spotId));
      }
    }
  }
});

test("entry and occupancy requests carry the selected community", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ communityId: "circle / one", count: 7, capacity: 100 });
  });
  await api.enterBeach("circle / one");
  const occupancy = await api.fetchBeachCount("circle / one");
  assert.deepEqual(JSON.parse(calls[0].options.body), { communityId: "circle / one" });
  assert.ok(calls[0].options.signal instanceof AbortSignal, "initial entry and ticket refresh have a bounded network wait");
  assert.equal(calls[1].url, "/api/beach/count?communityId=circle%20%2F%20one");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(calls[1].options.cache, "no-store");
  assert.equal(occupancy.count, 7);
  assert.equal(occupancy.capacity, 100);
  assert.equal(occupancy.mapId, "beach");
});

test("Uyuni entry and occupancy stay in the selected map while shared social features remain available", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, options });
    return response({ communityId: "circle / one", mapId: "uyuni", count: 7, capacity: 100,
      restEnabled: true, fireEnabled: true, bedEnabled: true, benchEnabled: true, onsenEnabled: true,
      careCapabilities: { wave: true, hug: true }, ...fireworksState, fireworksControl: true });
  });
  const entered = await api.enterBeach("circle / one", "female-3d", "uyuni");
  const count = await api.fetchBeachCount("circle / one", "uyuni");
  assert.deepEqual(JSON.parse(calls[0].options.body), { communityId: "circle / one", character: "female-3d", mapId: "uyuni" });
  assert.equal(calls[1].url, "/api/beach/count?communityId=circle%20%2F%20one&mapId=uyuni");
  assert.equal(count.mapId, "uyuni");
  assert.equal(entered.mapId, "uyuni");
  for (const capability of ["fireEnabled", "benchEnabled", "onsenEnabled"]) assert.equal(entered[capability], false, capability);
  assert.equal(entered.bedEnabled, true, "the hotel bed capability is granted explicitly by the server");
  assert.equal(entered.restEnabled, true);
  assert.equal(entered.careCapabilities.wave, true);
  assert.equal(entered.fireworksControl, true);
});

test("missing or crossed map confirmations never enter the wrong room and release stray tickets", async () => {
  for (const [requested, actual] of [["uyuni", undefined], ["uyuni", "beach"], ["uyuni", null], ["beach", "uyuni"], ["beach", "unknown"]]) {
    const calls = [];
    const api = setup(async (url, options) => {
      calls.push({ url, options });
      return response({ mapId: actual, ticket: "stray-ticket", communityId: "ours", count: 1, capacity: 100 });
    });
    await assert.rejects(api.enterBeach("ours", undefined, requested), error => error instanceof api.BeachUnavailable && error.status === 409);
    assert.equal(calls[1].url, "/api/beach/leave");
    assert.deepEqual(JSON.parse(calls[1].options.body), { ticket: "stray-ticket" });
    await assert.rejects(api.fetchBeachCount("ours", requested));
  }
});

test("unsupported map requests fail before networking and old beach fire compatibility is narrowly scoped", async () => {
  const api = setup(async () => { throw new Error("unexpected request"); });
  for (const mapId of [null, "", "UYUNI", "other", 1]) {
    await assert.rejects(api.enterBeach("ours", undefined, mapId), error => error instanceof api.BeachUnavailable);
    await assert.rejects(api.fetchBeachCount("ours", mapId), error => error instanceof api.BeachUnavailable);
  }
  assert.equal((await setup(async () => response({})).enterBeach("ours")).fireEnabled, true);
  for (const fireEnabled of [false, null, "true", 1]) {
    assert.equal((await setup(async () => response({ fireEnabled })).enterBeach("ours")).fireEnabled, false);
  }
});

test("unavailable or mismatched room counts never become a false empty beach", async () => {
  for (const result of [
    response({ error: "멤버만 입장할 수 있어요." }, 403),
    response({ communityId: "other", count: 0, capacity: 100 }),
    response({ communityId: "ours", count: -1, capacity: 100 }),
    response({ communityId: "ours", count: 0, capacity: 0 }),
  ]) {
    await assert.rejects(setup(async () => result).fetchBeachCount("ours"));
  }
  await assert.rejects(setup(async () => { throw new TypeError("offline"); }).fetchBeachCount("ours"));
});

test("membership and full-room failures are terminal and preserve server explanation", async () => {
  for (const status of [400, 401, 403, 404, 409]) {
    const api = setup(async () => response({ error: "입장할 수 없어요." }, status));
    await assert.rejects(api.enterBeach("ours"), (error) => error instanceof api.BeachUnavailable && error.status === status && error.message === "입장할 수 없어요.");
  }
});

test("an expired ticket remains recoverable in the same community", async () => {
  const api = setup(async () => response({}, 410));
  await assert.rejects(api.tickBeach({ ticket: "expired", x: 0, z: 9, yaw: 0, moving: false }), (error) => error instanceof api.BeachGone && !(error instanceof api.BeachUnavailable));
});

test("entry capabilities fail closed for legacy or malformed permissions and change across accounts", async () => {
  for (const careCapabilities of [undefined, null, "admin", { wave: "true", hug: 1 }]) {
    const entered = await setup(async () => response({ careCapabilities })).enterBeach("ours");
    assert.equal(entered.careCapabilities.wave, false);
    assert.equal(entered.careCapabilities.hug, false);
  }
  const grants = [{ wave: true, hug: true }, { wave: true, hug: false }];
  const api = setup(async () => response({ careCapabilities: grants.shift() }));
  assert.equal((await api.enterBeach("ours")).careCapabilities.hug, true);
  assert.equal((await api.enterBeach("ours")).careCapabilities.hug, false, "a new member entry cannot retain the previous admin's capability");
});

test("room time controls require both an explicit server grant and a valid shared clock", async () => {
  const lighting = { mode: "night", hour: 20, version: 4 };
  for (const grant of [undefined, null, "admin", 1, false]) {
    const entered = await setup(async () => response({ lighting, lightingControl: grant, careCapabilities: { hug: true } })).enterBeach("ours");
    assert.equal(entered.lightingControl, false, "another permission cannot grant clock control");
  }
  for (const invalid of [undefined, null, { mode: "night", hour: 23, version: 4 }, { mode: "auto", hour: 12, version: 0 },
    { mode: "__proto__", hour: null, version: 0 }, { mode: "day", hour: 12, version: -1 }]) {
    const entered = await setup(async () => response({ lighting: invalid, lightingControl: true })).enterBeach("ours");
    assert.equal(entered.lightingControl, false);
    assert.equal(entered.lighting, null);
  }
  const entered = await setup(async () => response({ lighting, lightingControl: true })).enterBeach("ours");
  assert.equal(entered.lightingControl, true);
  assert.deepEqual(JSON.parse(JSON.stringify(entered.lighting)), lighting);
});

test("clock changes send the owned visit ticket and accept only confirmed matching presets", async () => {
  const calls = [];
  const hours = { auto: null, day: 12, sunset: 18, night: 20, "rainy-night": 21 };
  const api = setup(async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, options, body });
    return response({ mode: body.mode, hour: hours[body.mode], version: calls.length });
  });
  for (const [mode, hour] of Object.entries(hours)) {
    const value = await api.setBeachLighting("admin-visit", mode);
    assert.equal(value.mode, mode); assert.equal(value.hour, hour);
  }
  for (const call of calls) {
    assert.equal(call.url, "/api/beach/lighting");
    assert.equal(call.body.ticket, "admin-visit");
    assert.equal(call.options.credentials, "same-origin");
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(call.body).sort(), ["mode", "ticket"], "no client role or room claim is trusted");
  }
  for (const value of [{ mode: "day", hour: 12, version: 1 }, { mode: "night", hour: 20, version: 1.5 }, { mode: "night", hour: 7, version: 1 }, {}]) {
    await assert.rejects(setup(async () => response(value)).setBeachLighting("admin-visit", "night"));
  }
});

test("everyone receives a valid shared clock while denied clock actions remain ordinary errors", async () => {
  const value = { mode: "sunset", hour: 18, version: 8 };
  const tick = await setup(async () => response({ lighting: value })).tickBeach({ ticket: "member-visit", x: 0, z: 8, yaw: 0, moving: false });
  assert.deepEqual(JSON.parse(JSON.stringify(tick.lighting)), value);
  await assert.rejects(setup(async () => response({ lighting: { ...value, hour: 17 } })).tickBeach({ ticket: "member-visit" }));
  const denied = setup(async () => response({ error: "관리자만 바닷가 시간을 바꿀 수 있어요." }, 403));
  await assert.rejects(denied.setBeachLighting("member-visit", "night"), error => error instanceof denied.BeachUnavailable && error.status === 403);
  const gone = setup(async () => response({}, 410));
  await assert.rejects(gone.setBeachLighting("expired", "day"), error => error instanceof gone.BeachGone);
});

test("wave targets the selected person and revoked hug stays a non-terminal tick result", async () => {
  const calls = [];
  const api = setup(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    return response({ care: body.care.kind === "wave" ? "sent" : "forbidden", careCapabilities: { wave: true, hug: false }, received: { comfort: 0, hug: 0, wave: 1 }, players: [], events: [], count: 2 });
  });
  const tick = { ticket: "my-ticket", x: 0, z: 9, yaw: 0, moving: false };
  assert.equal((await api.tickBeach({ ...tick, care: { to: "chosen-person", kind: "wave" } })).care, "sent");
  const rejected = await api.tickBeach({ ...tick, care: { to: "chosen-person", kind: "hug" } });
  assert.equal(rejected.care, "forbidden");
  assert.equal(rejected.careCapabilities.hug, false);
  assert.equal(rejected.count, 2, "permission denial does not discard the live room snapshot");
  assert.equal(rejected.received.wave, 1);
  assert.deepEqual(calls.map(call => call.care), [{ to: "chosen-person", kind: "wave" }, { to: "chosen-person", kind: "hug" }]);
});

test("movement-only ticks leave capabilities absent while malformed refreshed grants fail closed", async () => {
  const tick = { ticket: "ticket", x: 0, z: 9, yaw: 0, moving: false };
  const movement = await setup(async () => response({})).tickBeach(tick);
  assert.equal(movement.careCapabilities, undefined);
  const refreshed = await setup(async () => response({ careCapabilities: { wave: true, hug: "admin" } })).tickBeach(tick);
  assert.equal(refreshed.careCapabilities.wave, true);
  assert.equal(refreshed.careCapabilities.hug, false);
});

test("a timed-out reentry rejects so the polling loop can release its in-flight guard and retry", async () => {
  const timeout = new Error("entry timeout");
  timeout.name = "TimeoutError";
  const api = setup(async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw timeout;
  });
  await assert.rejects(api.enterBeach("ours"), (error) => error === timeout && !(error instanceof api.BeachUnavailable));
});

test("shared lying claims are server-assigned and standing explicitly releases the slot", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, options });
    return response(body.action === "lie"
      ? { pose: "lying", spotId: "starlight", slot: 3, x: 8.87, z: 5.13, yaw: 3 * Math.PI / 4 }
      : { pose: "standing", spotId: null, slot: null, x: 9.3, z: 4.7, yaw: 3 * Math.PI / 4 });
  });
  const lying = await api.setBeachRest("my-ticket", "lie");
  const standing = await api.setBeachRest("my-ticket", "stand");
  assert.deepEqual(calls[0].body, { ticket: "my-ticket", action: "lie", spotId: "starlight" });
  assert.deepEqual(calls[1].body, { ticket: "my-ticket", action: "stand" });
  assert.equal(calls[0].url, "/api/beach/rest");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.cache, "no-store");
  assert.ok(calls[0].options.signal instanceof AbortSignal, "rest calls have a bounded network wait");
  assert.equal(lying.slot, 3, "use the server's assigned slot rather than a local guess");
  assert.equal(lying.x, 8.87);
  assert.equal(standing.pose, "standing");
  assert.equal(standing.slot, null);
});

test("full or expired shared-rest claims remain errors, never fabricated lying success", async () => {
  const full = setup(async () => response({ error: "별빛 자리가 모두 찼어요." }, 409));
  await assert.rejects(full.setBeachRest("ticket", "lie"), (error) => error instanceof full.BeachUnavailable && error.status === 409 && error.message.includes("모두 찼어요"));
  const expired = setup(async () => response({}, 410));
  await assert.rejects(expired.setBeachRest("ticket", "stand"), (error) => error instanceof expired.BeachGone);
});

test("malformed shared-rest confirmations cannot move or pose the avatar", async () => {
  const valid = { pose: "lying", spotId: "starlight", slot: 0, x: 7, z: 9.65, yaw: 0 };
  for (const invalid of [null, { ...valid, slot: 8 }, { ...valid, slot: -1 }, { ...valid, spotId: "other" }, { ...valid, x: "7" }, { ...valid, yaw: null }, { ...valid, pose: "standing" }]) {
    await assert.rejects(setup(async () => response(invalid)).setBeachRest("ticket", "lie"), /쉴 자리의 상태/);
  }
});

test("hut claims send the selected hut, accept only its three slots, and preserve starlight defaults", async () => {
  for (const spotId of ["hut-pine", "hut-wave", "hut-sunset"]) {
    let sent;
    const state = { pose: "lying", spotId, slot: 2, x: 1.9, z: 24.9, yaw: Math.PI };
    const api = setup(async (_url, options) => { sent = JSON.parse(options.body); return response(state); });
    assert.equal((await api.setBeachRest("ticket", "lie", spotId)).slot, 2);
    assert.equal(sent.spotId, spotId);
    await assert.rejects(setup(async () => response({ ...state, slot: 3 })).setBeachRest("ticket", "lie", spotId), /쉴 자리의 상태/);
  }
});

test("garden rainy night survives entry and polling while invalid rain clocks and denied changes are rejected", async () => {
  const value = { mode: "rainy-night", hour: 21, version: 9 };
  const visitor = setup(async () => response({ mapId: "garden", lighting: value, lightingControl: false }));
  const entered = await visitor.enterBeach("ours", "male", "garden");
  assert.deepEqual(JSON.parse(JSON.stringify(entered.lighting)), value);
  assert.equal(entered.lightingControl, false, "a shared weather preset never grants administration");
  const tick = await visitor.tickBeach({ ticket: "garden-visit", x: 0, z: 8, yaw: 0, moving: false });
  assert.deepEqual(JSON.parse(JSON.stringify(tick.lighting)), value);
  for (const invalid of [{ ...value, hour: 20 }, { ...value, hour: null }, { ...value, version: -1 }]) {
    await assert.rejects(setup(async () => response(invalid)).setBeachLighting("admin-visit", "rainy-night"));
    await assert.rejects(setup(async () => response({ lighting: invalid })).tickBeach({ ticket: "garden-visit" }));
  }
  const denied = setup(async () => response({ error: "관리자만 방의 시간을 바꿀 수 있어요." }, 403));
  await assert.rejects(denied.setBeachLighting("member-visit", "rainy-night"), error => error instanceof denied.BeachUnavailable && error.status === 403);
});

test("hotel beds require an explicit server grant on either map", async () => {
  for (const mapId of ["beach", "uyuni"]) {
    for (const bedEnabled of [undefined, null, false, "true", 1, true]) {
      const entered = await setup(async () => response({ mapId, bedEnabled })).enterBeach("ours", undefined, mapId);
      assert.equal(entered.bedEnabled, bedEnabled === true);
    }
  }
});

test("hotel claims use their two assigned bed slots and recover confirmed lying from ticks", async () => {
  for (const spotId of ["hotel-dawn", "hotel-dusk"]) {
    for (const slot of [0, 1]) {
      const calls = [];
      const state = { pose: "lying", spotId, slot, x: 8, z: 28, yaw: Math.PI };
      const api = setup(async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return response(url.endsWith("/tick") ? { selfRest: state } : state);
      });
      const confirmed = await api.setBeachRest("uyuni-visit", "lie", spotId);
      const recovered = await api.tickBeach({ ticket: "uyuni-visit" });
      assert.equal(confirmed.slot, slot); assert.equal(recovered.selfRest.spotId, spotId);
      assert.deepEqual(calls[0], { url: "/api/beach/rest", body: { ticket: "uyuni-visit", action: "lie", spotId } });
      const standing = { pose: "standing", spotId: null, slot: null, x: 8, z: 25, yaw: 0 };
      const standApi = setup(async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body), { ticket: "uyuni-visit", action: "stand" });
        return response(standing);
      });
      assert.equal((await standApi.setBeachRest("uyuni-visit", "stand", spotId)).pose, "standing");
    }
  }
});

test("invalid hotel slots, poses and a different room confirmation cannot move a visitor", async () => {
  const valid = { pose: "lying", spotId: "hotel-dawn", slot: 0, x: 8, z: 28, yaw: 0 };
  for (const invalid of [{ ...valid, slot: 2 }, { ...valid, slot: -1 }, { ...valid, slot: 0.5 },
    { ...valid, slot: "0" }, { ...valid, pose: "sitting" }, { ...valid, spotId: "hotel-other" }, { ...valid, x: null }]) {
    await assert.rejects(setup(async () => response(invalid)).setBeachRest("visit", "lie", "hotel-dawn"), /쉴 자리의 상태/);
    await assert.rejects(setup(async () => response({ selfRest: invalid })).tickBeach({ ticket: "visit" }), /쉴 자리의 상태/);
  }
  await assert.rejects(setup(async () => response({ ...valid, spotId: "hotel-dusk" })).setBeachRest("visit", "lie", "hotel-dawn"), /쉴 자리의 상태/);
});

test("bench seating asks the server for a slot and standing releases it without claiming another", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, signal: options.signal });
    return response(body.action === "sit"
      ? { pose: "sitting", spotId: "fire-benches", slot: 11, x: -1.1, z: 15.1, yaw: 0.3 }
      : { pose: "standing", spotId: null, slot: null, x: -1.1, z: 16.1, yaw: 0.3 });
  });
  const seated = await api.setBeachRest("my-ticket", "sit", "fire-benches");
  const standing = await api.setBeachRest("my-ticket", "stand", "fire-benches");
  assert.deepEqual(calls.map(call => call.body), [
    { ticket: "my-ticket", action: "sit", spotId: "fire-benches" },
    { ticket: "my-ticket", action: "stand" },
  ]);
  assert.ok(calls.every(call => call.url === "/api/beach/rest" && call.signal instanceof AbortSignal));
  assert.equal(seated.pose, "sitting");
  assert.equal(seated.slot, 11, "seat assignment comes from the authoritative server response");
  assert.equal(standing.pose, "standing");
});

test("bench confirmations reject invalid slots, mismatched spots and incompatible poses", async () => {
  const valid = { pose: "sitting", spotId: "fire-benches", slot: 0, x: 0, z: 15.1, yaw: Math.PI };
  for (const invalid of [
    null, { ...valid, slot: -1 }, { ...valid, slot: 12 }, { ...valid, slot: 1.5 },
    { ...valid, spotId: "starlight" }, { ...valid, spotId: "hut-pine" },
    { ...valid, pose: "lying" }, { ...valid, pose: "standing", spotId: null, slot: null },
    { ...valid, x: "0" }, { ...valid, yaw: null },
  ]) {
    await assert.rejects(setup(async () => response(invalid)).setBeachRest("ticket", "sit", "fire-benches"), /쉴 자리의 상태/);
  }
  await assert.rejects(setup(async () => response(valid)).setBeachRest("ticket", "lie", "starlight"), /쉴 자리의 상태/);
  await assert.rejects(setup(async () => response(valid)).setBeachRest("ticket", "stand"), /쉴 자리의 상태/);
});

test("a lost bench response recovers the confirmed seat from the next tick without replaying sit", async () => {
  const calls = [];
  const seat = { pose: "sitting", spotId: "fire-benches", slot: 4, x: 2.6, z: 13.2, yaw: 1.1 };
  const api = setup(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url === "/api/beach/rest") throw new TypeError("response lost after seat assignment");
    return response({ selfRest: seat, players: [], events: [], count: 1 });
  });
  await assert.rejects(api.setBeachRest("ticket", "sit", "fire-benches"));
  const recovered = await api.tickBeach({ ticket: "ticket", x: 2.7, z: 14, yaw: 0, moving: false });
  assert.equal(recovered.selfRest.pose, "sitting");
  assert.equal(recovered.selfRest.slot, 4);
  assert.equal(calls.filter(call => call.url === "/api/beach/rest").length, 1);
  await assert.rejects(setup(async () => response({ selfRest: { ...seat, slot: 12 } })).tickBeach({ ticket: "ticket", x: 0, z: 0, yaw: 0, moving: false }), /쉴 자리의 상태/);
});

test("occupied benches and expired tickets remain recoverable errors rather than local sitting", async () => {
  const full = setup(async () => response({ error: "가까운 벤치 자리가 찼어요." }, 409));
  await assert.rejects(full.setBeachRest("ticket", "sit", "fire-benches"), error => error instanceof full.BeachUnavailable && error.status === 409);
  const expired = setup(async () => response({}, 410));
  await assert.rejects(expired.setBeachRest("ticket", "sit", "fire-benches"), error => error instanceof expired.BeachGone);
});

test("timed-out rest requests give retryable guidance and ticks also carry a timeout signal", async () => {
  const timeout = new Error("network timeout");
  timeout.name = "TimeoutError";
  await assert.rejects(setup(async () => { throw timeout; }).setBeachRest("ticket", "lie"), /잠시 후 다시 눌러/);
  let signal;
  await setup(async (_url, options) => { signal = options.signal; return response({}); }).tickBeach({ ticket: "ticket", x: 0, z: 0, yaw: 0, moving: false });
  assert.ok(signal instanceof AbortSignal);
});

const powderFire = (color = "rainbow") => ({ logs: 2, maxLogs: 12, intensity: .3, color: "amber", queuedPops: 0, serverTime: 1_800_000_000_000, powderEnabled: true, powder: { id: "public-event", color, startedAt: 1_800_000_000_000, expiresAt: 1_800_000_090_000 } });

test("powder sends only the free action fields and preserves UUID/color when retrying with a refreshed ticket", async () => {
  const calls = [];
  const api = setup(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), signal: options.signal });
    if (calls.length === 1) throw new TypeError("response lost after sending");
    return response(powderFire());
  });
  const id = "f0d6bec3-0218-43c4-925d-974a2ddc82ae";
  await assert.rejects(api.addFirePowder("old-ticket", id, "rainbow"));
  const confirmed = await api.addFirePowder("new-ticket", id, "rainbow");
  assert.deepEqual(calls.map((call) => call.body), [{ ticket: "old-ticket", requestId: id, color: "rainbow" }, { ticket: "new-ticket", requestId: id, color: "rainbow" }]);
  assert.ok(calls.every((call) => call.url === "/api/beach/fire/powder" && call.signal instanceof AbortSignal));
  assert.equal(confirmed.powder.id, "public-event");
  assert.equal(confirmed.color, "amber", "powder does not replace the base/paid fire color");
});

test("powder cooldown and definite rejection do not fabricate a color effect or close the room", async () => {
  const cooling = setup(async () => response({ error: "색가루는 10초에 한 번씩 넣을 수 있어요." }, 429));
  await assert.rejects(cooling.addFirePowder("ticket", "uuid", "rose"), (error) => error instanceof cooling.BeachCooldown && !(error instanceof cooling.BeachUnavailable));
  const noWood = setup(async () => response({ error: "장작을 먼저 넣어 주세요." }, 409));
  await assert.rejects(noWood.addFirePowder("ticket", "uuid", "rose"), (error) => error instanceof noWood.BeachUnavailable && error.status === 409);
  const expired = setup(async () => response({}, 410));
  await assert.rejects(expired.addFirePowder("ticket", "uuid", "rose"), (error) => error instanceof expired.BeachGone);
});

test("powder requires a confirmed event snapshot while idempotent retries may return a newer or expired overlay", async () => {
  for (const invalid of [null, {}, { ...powderFire(), powderEnabled: false }, { ...powderFire(), powder: { ...powderFire().powder, color: "invalid" } }, { ...powderFire(), powder: { ...powderFire().powder, expiresAt: 0 } }]) {
    await assert.rejects(setup(async () => response(invalid)).addFirePowder("ticket", "uuid", "rainbow"), /모닥불의 색을 확인하지 못했어요/);
  }
  assert.equal((await setup(async () => response(powderFire("ocean"))).addFirePowder("ticket", "uuid", "rose")).powder.color, "ocean", "a retry reflects current authoritative room state");
  assert.equal((await setup(async () => response({ ...powderFire(), powder: null })).addFirePowder("ticket", "uuid", "rose")).powder, null);
});

test("wood requests also have a bounded wait so they cannot permanently lock other fire actions", async () => {
  let signal;
  await setup(async (_url, options) => { signal = options.signal; return response(powderFire()); }).addFirewood("ticket", "uuid");
  assert.ok(signal instanceof AbortSignal);
});
