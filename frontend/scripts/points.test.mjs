import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/points.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed).replace(/^import .*;\r?\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const valid = () => ({ balance: 70, totalEarned: 70, todayEarned: 60, dailyLimit: 200, writingEarnedToday: 1, writingDailyLimit: 3, rules: ["매일 한국 시간 0시 기준"], history: [{ id: "reward-1", reason: "comfort_write", amount: 10, balanceAfter: 10, createdAt: 1793660400000 }] });
function setup(fetch, sessionUserId = () => "alice") {
  const context = { fetch, sessionUserId };
  vm.runInNewContext(`${source}\nglobalThis.api = { fetchPoints, parsePointsWallet, pointReason, pointsSessionChanged };`, context);
  return context.api;
}

test("wallet uses authenticated uncached requests and preserves the server's ledger", async () => {
  const wallet = valid();
  const api = setup(async (url, options) => {
    assert.equal(url, "/api/points/me");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => wallet };
  });
  assert.equal(await api.fetchPoints("alice"), wallet);
});

test("malformed balances, invalid history and HTML outages cannot masquerade as a wallet", () => {
  const api = setup();
  for (const value of [null, {}, "<html>", { ...valid(), balance: -1 }, { ...valid(), todayEarned: 201 }, { ...valid(), balance: 1.5 }, { ...valid(), history: [{ ...valid().history[0], amount: -1 }] }, { ...valid(), writingEarnedToday: 4 }]) {
    assert.throws(() => api.parsePointsWallet(value), /포인트 정보를 확인/);
  }
});

test("a consumed activity at the daily limit remains valid as a zero-point history item", () => {
  const wallet = valid();
  wallet.history[0].amount = 0;
  assert.equal(setup().parsePointsWallet(wallet), wallet);
});

test("unrecognized reason keys always render as plain text", () => {
  const api = setup();
  for (const reason of ["__proto__", "constructor", "toString", "future_reward"]) assert.equal(api.pointReason(reason), "온기 포인트 적립");
  assert.equal(api.pointReason("comfort_write"), "위로 한마디를 남겼어요");
});

test("timestamp refreshes cannot trigger a two-tab request loop, but account changes do refresh", () => {
  const { pointsSessionChanged } = setup();
  const alice = JSON.stringify({ userId: "alice", at: 1 });
  assert.equal(pointsSessionChanged(alice, JSON.stringify({ userId: "alice", at: 2 })), false);
  assert.equal(pointsSessionChanged(alice, JSON.stringify({ userId: "bob", at: 2 })), true);
  assert.equal(pointsSessionChanged(alice, null), true);
  assert.equal(pointsSessionChanged(null, alice), true);
});

test("authorization errors do not become a zero balance", async () => {
  const api = setup(async () => ({ ok: false, json: async () => ({ error: "로그인 후 확인해 주세요" }) }));
  await assert.rejects(api.fetchPoints("alice"), /로그인/);
});

test("account changes reject an old user's delayed private ledger", async () => {
  let id = "alice", resolve;
  const api = setup(() => new Promise((done) => { resolve = done; }), () => id);
  const pending = api.fetchPoints("alice");
  id = "bob";
  resolve({ ok: true, json: async () => valid() });
  await assert.rejects(pending, /계정이 변경/);
  await assert.rejects(api.fetchPoints("alice"), /계정이 변경/);
});

test("adoption sends only the selected comment and post, never a client reward amount", async () => {
  const typedCommunity = await readFile(new URL("../lib/community.ts", import.meta.url), "utf8");
  const community = stripTypeScriptTypes(typedCommunity).replace(/^import .*;\r?\n/gm, "").replace(/^export \* from .*;\r?\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
  const store = { me: { id: "alice" }, posts: [{ id: "post-1", acceptedCommentId: "comment-2" }] };
  let consentChecked = false;
  const context = { requireCommunityConsent: async () => { consentChecked = true; }, listNotifications: () => [], loadNotifSeen: () => 0, fetch: async (url, options) => {
    assert.equal(consentChecked, true);
    assert.equal(url, "/api/community/comment.accept");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(options.body), { postId: "post-1", commentId: "comment-2" });
    return { ok: true, json: async () => store };
  } };
  vm.runInNewContext(`${community}\nglobalThis.result = api;`, context);
  assert.equal(await context.result.acceptComment("post-1", "comment-2"), store);
});
