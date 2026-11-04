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
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, fetchBeachCount, tickBeach, setBeachRest, addFirewood, addFirePowder, BeachGone, BeachUnavailable, BeachCooldown };`, context);
  return context.api;
}

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
