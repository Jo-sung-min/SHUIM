// 빛: 지갑 클라이언트(lib/light.ts)와 화면이 쓰는 순위 계산(lib/community-core.ts)
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const load = async (path) => stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace(/^export \* from .*;\r?\n/gm, "").replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b)/g, "");
const lightSource = await load("../lib/light.ts");
const coreSource = `${await load("../lib/dates.ts")}\n${await load("../lib/highlight.ts")}\n${await load("../lib/community-core.ts")}`;

const valid = () => ({
  balance: 7, totalReceived: 3, totalGiven: 6, dailyClaimed: true, dailyLight: 10, maxGift: 10, perPersonDaily: 10,
  history: [
    { id: "a", reason: "gift_sent", amount: -3, balanceAfter: 7, createdAt: 1793660400000, nick: "받는 이" },
    { id: "b", reason: "daily", amount: 10, balanceAfter: 10, createdAt: 1793660300000, nick: null },
  ],
});
function light(fetch, sessionUserId = () => "alice", crypto = { randomUUID: () => "generated" }) {
  const context = { fetch, sessionUserId, crypto };
  vm.runInNewContext(`${lightSource}\nglobalThis.api = { fetchLight, claimDailyLight, parseLightWallet, lightReason, giftRequests };`, context);
  return context.api;
}
function core() {
  const context = {};
  vm.runInNewContext(`${coreSource}\nglobalThis.api = { computeWeekly, weekKeyOf, canGiveLight, fmtLight, lightOf, LIGHT_CHOICES };`, context);
  return context.api;
}

test("the wallet is read and the daily light claimed with authenticated, uncached requests", async () => {
  const wallet = valid();
  const calls = [];
  const api = light(async (url, options) => {
    calls.push([url, options.method]);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.body, undefined); // 금액도 계정도 보내지 않는다: 서버가 정한다
    return { ok: true, json: async () => wallet };
  });
  assert.equal(await api.fetchLight("alice"), wallet);
  assert.equal(await api.claimDailyLight("alice"), wallet);
  assert.deepEqual(calls, [["/api/light/me", "GET"], ["/api/light/daily", "POST"]]);
});

test("malformed balances, bad history and HTML outages never become a wallet", () => {
  const api = light();
  const broken = [null, {}, "<html>", { ...valid(), balance: -1 }, { ...valid(), balance: 1.5 }, { ...valid(), dailyClaimed: "yes" }, { ...valid(), dailyLight: 0 },
    { ...valid(), history: [{ ...valid().history[0], amount: 0 }] }, { ...valid(), history: [{ ...valid().history[0], balanceAfter: -1 }] },
    { ...valid(), history: [{ ...valid().history[0], nick: { html: "<b>" } }] }, { ...valid(), history: "none" }];
  for (const value of broken) assert.throws(() => api.parseLightWallet(value), /빛 정보를 확인/);
  const empty = { ...valid(), balance: 0, history: [] };
  assert.equal(api.parseLightWallet(empty), empty);
});

test("errors and account switches are reported instead of showing a zero balance", async () => {
  await assert.rejects(light(async () => ({ ok: false, json: async () => ({ error: "로그인하면 빛을 모을 수 있어요." }) })).fetchLight("alice"), /로그인/);
  await assert.rejects(light(async () => ({ ok: false, json: async () => { throw new Error("html"); } })).fetchLight("alice"), /불러오지 못했어요/);
  let id = "alice", resolve;
  const api = light(() => new Promise((done) => { resolve = done; }), () => id);
  const pending = api.fetchLight("alice");
  id = "bob";
  resolve({ ok: true, json: async () => valid() });
  await assert.rejects(pending, /계정이 변경/);
  await assert.rejects(api.claimDailyLight("alice"), /계정이 변경/);
});

test("history lines name the other person when known and stay plain text otherwise", () => {
  const { lightReason } = light();
  assert.equal(lightReason({ reason: "daily" }), "오늘의 빛");
  assert.equal(lightReason({ reason: "gift_sent", nick: "받는 이" }), "받는 이 님에게 건넸어요");
  assert.equal(lightReason({ reason: "gift_received", nick: "주는 이" }), "주는 이 님이 건넸어요");
  assert.equal(lightReason({ reason: "gift_sent", nick: null }), "빛을 건넸어요");
  assert.equal(lightReason({ reason: "gift_received", nick: "  " }), "빛을 받았어요");
  for (const reason of ["__proto__", "constructor", "future_reason"]) assert.equal(lightReason({ reason }), "빛");
});

test("a retried gift reuses its request id and a new gift gets a new one", () => {
  let n = 0;
  const requests = light(undefined, undefined, { randomUUID: () => `id-${++n}` }).giftRequests();
  assert.equal(requests.idFor("post", 3), "id-1");
  assert.equal(requests.idFor("post", 3), "id-1"); // 연결이 끊겨 다시 눌러도 같은 번호 → 서버가 한 번만 반영
  assert.equal(requests.idFor("post", 5), "id-2"); // 양을 바꾸면 다른 요청
  assert.equal(requests.idFor("other", 5), "id-3");
  requests.done();
  assert.equal(requests.idFor("other", 5), "id-4"); // 성공한 뒤 같은 글에 또 주면 새 요청
});

test("giving sends only the post, amount and request id after the community consent check", async () => {
  const community = await load("../lib/community.ts");
  const store = { me: { id: "alice" }, posts: [{ id: "post-1", light: 3 }] };
  let consentChecked = false;
  const context = { requireCommunityConsent: async () => { consentChecked = true; }, listNotifications: () => [], loadNotifSeen: () => 0, fetch: async (url, options) => {
    assert.equal(consentChecked, true);
    assert.equal(url, "/api/community/light.give");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.deepEqual(JSON.parse(options.body), { postId: "post-1", amount: 3, requestId: "request-1" }); // 받는 사람·잔액은 보내지 않는다
    return { ok: true, json: async () => store };
  } };
  vm.runInNewContext(`${community}\nglobalThis.result = api;`, context);
  assert.equal(await context.result.giveLight("post-1", 3, "request-1"), store);
  assert.equal("donate" in context.result, false); // 원화 모의 모금 호출은 없어졌다
});

test("the weekly ranking follows received light, then cheers, then the earliest post", () => {
  const api = core();
  const now = Date.now() - 60_000;
  const week = api.weekKeyOf(now);
  const post = (id, authorId, light, cheers, extra = {}) => ({ id, authorId, cat: "misfortune", text: `text ${id}`, createdAt: now, cheers: Array.from({ length: cheers }, (_, i) => `v${i}`), reports: [], light, ...extra });
  const s = {
    me: { id: "me", nick: "나", registered: true },
    users: ["cheered", "late", "early", "two"].map((id) => ({ id, nick: id, registered: true })),
    posts: [
      post("p-cheered", "cheered", 0, 9), post("p-late", "late", 3, 1), post("p-early", "early", 3, 1, { createdAt: now - 1000 }),
      post("p-two-a", "two", 2, 0), post("p-two-b", "two", 6, 4),
      post("p-circle", "sender", 10, 0, { communityId: "c1" }), post("p-free", "cheered", 10, 0, { cat: "free" }), post("p-hidden", "late", 10, 0, { hidden: true }),
    ],
    gifts: [{ id: "g1", by: "x", to: "late", postId: "p-late", amount: 3, at: now }, { id: "g2", by: "y", to: "two", postId: "p-two-b", amount: 6, at: now }, { id: "g3", by: "x", to: "sender", postId: "p-circle", amount: 10, at: now }],
    comments: [], feed: [], creators: {}, following: [], weekly: {},
  };
  const batch = api.computeWeekly(s, week, false);
  // vm 안에서 만든 배열이라 JSON 으로 옮겨 비교한다
  assert.deepEqual(JSON.parse(JSON.stringify(batch.rows.map((r) => [r.userId, r.light, r.cheers, r.topPostId]))), [["two", 8, 4, "p-two-b"], ["early", 3, 1, "p-early"], ["late", 3, 1, "p-late"], ["cheered", 0, 9, "p-cheered"]]);
  assert.deepEqual({ ...batch.light }, { total: 9, count: 2, givers: 2 });
  assert.equal("fund" in batch, false);
  assert.equal(batch.rows.some((r) => "payout" in r || "share" in r), false); // 순위대로 나누는 돈은 없다
});

test("light can be offered only on visible plaza posts by other registered members", () => {
  const api = core();
  const s = { me: { id: "me", nick: "나", registered: true }, users: [{ id: "member", nick: "회원", registered: true }, { id: "guest", nick: "손님", registered: false }, { id: "blocked", nick: "정지", registered: true, blockedAt: 1 }] };
  const post = (extra) => ({ id: "p", authorId: "member", cat: "misfortune", text: "t", createdAt: 0, cheers: [], reports: [], ...extra });
  const flagged = Array.from({ length: 5 }, (_, i) => ({ by: `r${i}`, reason: "abuse", at: 1 }));
  assert.equal(api.canGiveLight(s, post({})), true);
  assert.equal(api.canGiveLight(s, post({ cat: "free" })), true); // 순위는 불행광장만 세지만 빛은 광장 글이면 건넬 수 있다
  for (const extra of [{ authorId: "me" }, { authorId: "guest" }, { authorId: "blocked" }, { authorId: "unknown" }, { communityId: "c1" }, { hidden: true }, { reports: flagged }]) {
    assert.equal(api.canGiveLight(s, post(extra)), false, JSON.stringify(extra));
  }
  assert.equal(api.canGiveLight(s, undefined), false);
  assert.equal(api.fmtLight(1234), "1,234빛");
  assert.equal(api.lightOf({}), 0);
  assert.deepEqual([...api.LIGHT_CHOICES], [1, 3, 5, 10]);
});
