import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/net.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
function setup(fetch) {
  const context = { fetch, Error, AbortSignal };
  vm.runInNewContext(`${source}\nglobalThis.api = { enterBeach, tickBeach, launchUyuniMoment, readUyuniMoment };`, context);
  return context.api;
}
const reply = body => new Response(JSON.stringify(body));
const plain = value => JSON.parse(JSON.stringify(value));
const uuid = "c5b26760-2e99-4c83-94d6-5a25794c2f17";
const sparkler = { id: uuid, kind: "sparkler", fromPid: "person", fromNick: "송이", x: 0, z: -10, yaw: 0,
  startedAt: 1_000_000, durationMs: 12_000, letter: "L" };
const lantern = { ...sparkler, kind: "lantern", letter: undefined, durationMs: 40_000, color: "rose", wish: "우리 모두 행복하길 <3" };
const cooldowns = { sparkler: 1_004_000, lantern: 1_008_000 };
const snapshot = { mapId: "uyuni", uyuniMomentsEnabled: true, uyuniMoments: [sparkler], uyuniMomentCooldowns: cooldowns, serverTime: 1_001_000 };

test("Uyuni actions require explicit capability and a supported server snapshot, never grant on another map", async () => {
  for (const capability of [undefined, null, false, "true", 1]) {
    const entered = await setup(async () => reply({ ...snapshot, uyuniMomentsEnabled: capability })).enterBeach("room", undefined, "uyuni");
    assert.equal(entered.uyuniMomentsEnabled, false);
  }
  const legacy = await setup(async () => reply({ mapId: "uyuni", uyuniMomentsEnabled: true })).enterBeach("room", undefined, "uyuni");
  assert.equal(legacy.uyuniMomentsEnabled, false);
  const beach = await setup(async () => reply({ ...snapshot, mapId: "beach" })).enterBeach("room");
  assert.equal(beach.uyuniMomentsEnabled, false); assert.equal(beach.uyuniMoments.length, 0);
  const entered = await setup(async () => reply(snapshot)).enterBeach("room", undefined, "uyuni");
  assert.equal(entered.uyuniMomentsEnabled, true); assert.equal(entered.uyuniMoments.length, 1);
});

test("all letters, heart, star and five wish colors round-trip with stable retry IDs and escaped plain-text wishes", async () => {
  const inputs = [...["L", "O", "V", "E", "heart", "star"].map(letter => ({ kind: "sparkler", letter })),
    ...["amber", "rose", "mint", "sky", "violet"].map(color => ({ kind: "lantern", color, wish: lantern.wish }))];
  for (const input of inputs) {
    const calls = [], event = { ...(input.kind === "sparkler" ? sparkler : lantern), ...input };
    const api = setup(async (url, options) => { calls.push({ url, options }); return reply({ event, cooldowns, serverTime: 1_001_000 }); });
    const first = await api.launchUyuniMoment("owned-ticket", uuid, input);
    const retry = await api.launchUyuniMoment("owned-ticket", uuid, input);
    assert.equal(first.event.id, retry.event.id);
    assert.deepEqual(plain(first.event), plain(event));
    for (const call of calls) {
      assert.equal(call.url, "/api/beach/moments");
      assert.equal(call.options.credentials, "same-origin");
      assert.deepEqual(JSON.parse(call.options.body), { ticket: "owned-ticket", requestId: uuid, ...input });
    }
  }
});

test("heart and star survive enter and live snapshots without changing their lifetime or retry payload", async () => {
  for (const letter of ["heart", "star"]) {
    const event = { ...sparkler, letter };
    const api = setup(async () => reply({ ...snapshot, uyuniMoments: [event] }));
    const entered = await api.enterBeach("room", undefined, "uyuni");
    const live = await api.tickBeach({ ticket: "observer" });
    assert.deepEqual(plain(entered.uyuniMoments), [event]);
    assert.deepEqual(plain(live.uyuniMoments), [event]);
    assert.equal(live.uyuniMoments[0].durationMs, 12_000);
    await assert.rejects(setup(async () => reply({ event: { ...event, letter: letter === "heart" ? "star" : "heart" }, serverTime: 1_001_000, cooldowns }))
      .launchUyuniMoment("mine", uuid, { kind: "sparkler", letter }), /시작을 확인/);
  }
});

test("live snapshots deduplicate, preserve server starts, and expire both kinds on their original clock", async () => {
  const second = { ...lantern, id: "3684c17d-35de-437d-a728-6324d996d09e" };
  for (const [time, count] of [[1_001_000, 2], [1_012_000, 1], [1_040_000, 0]]) {
    const result = await setup(async () => reply({ ...snapshot, serverTime: time, uyuniMoments: [sparkler, sparkler, second] })).tickBeach({ ticket: "observer" });
    assert.equal(result.uyuniMoments.length, count);
    for (const event of result.uyuniMoments) assert.equal(event.startedAt, 1_000_000);
  }
  const expiredRetry = await setup(async () => reply({ event: sparkler, serverTime: 1_080_000, cooldowns })).launchUyuniMoment("mine", uuid, { kind: "sparkler", letter: "L" });
  assert.equal(expiredRetry.event.startedAt, 1_000_000);
});

test("invalid and oversized events cannot allocate effects or text textures", async () => {
  const bad = [null, {}, { ...sparkler, x: Infinity }, { ...sparkler, z: -51 }, { ...sparkler, yaw: 4 },
    { ...sparkler, durationMs: 999999 }, { ...sparkler, letter: "LOVE" }, { ...sparkler, letter: "Heart" },
    { ...sparkler, letter: "★" }, { ...sparkler, letter: "heart " }, { ...sparkler, color: "rose" },
    { ...lantern, wish: "" }, { ...lantern, wish: "a".repeat(81) }, { ...lantern, wish: "a\nb" },
    { ...lantern, color: "red" }, { ...lantern, fromNick: "a".repeat(101) },
    { ...sparkler, startedAt: 1_002_000 }, { ...sparkler, unexpected: true }];
  for (const event of bad) {
    await assert.rejects(setup(async () => reply({ ...snapshot, uyuniMoments: [event] })).tickBeach({ ticket: "mine" }));
  }
  for (const events of [Array(65).fill(sparkler), [sparkler, { ...sparkler, letter: "E" }],
    Array.from({ length: 33 }, (_, i) => ({ ...sparkler, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }))]) {
    await assert.rejects(setup(async () => reply({ ...snapshot, uyuniMoments: events })).enterBeach("room", undefined, "uyuni"));
  }
});

test("invalid choices are rejected before transport and mismatched acknowledgements remain unconfirmed", async () => {
  const api = setup(async () => { throw new Error("unexpected transport"); });
  for (const input of [{ kind: "sparkler", letter: "A" }, { kind: "sparkler", letter: "Star" },
    { kind: "sparkler", letter: "♡" }, { kind: "lantern", color: "rose", wish: " " },
    { kind: "lantern", color: "rose", wish: "💫".repeat(81) }]) {
    await assert.rejects(api.launchUyuniMoment("mine", uuid, input), /다시 골라/);
  }
  const accepted = await setup(async () => reply({ event: { ...lantern, wish: "💫".repeat(80) }, serverTime: 1_001_000, cooldowns }))
    .launchUyuniMoment("mine", uuid, { kind: "lantern", color: "rose", wish: "💫".repeat(80) });
  assert.equal(Array.from(accepted.event.wish).length, 80);
  await assert.rejects(setup(async () => reply({ event: { ...sparkler, letter: "E" }, serverTime: 1_001_000, cooldowns }))
    .launchUyuniMoment("mine", uuid, { kind: "sparkler", letter: "L" }), /시작을 확인/);
});
