import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

const typed = await readFile(new URL("../lib/beach/fire-commerce.ts", import.meta.url), "utf8");
const source = stripTypeScriptTypes(typed, { mode: "transform" })
  .replace(/^import\s+[^\n]+\n/gm, "")
  .replaceAll('import("@apps-in-toss/web-framework")', "__loadAitSdk()")
  .replace(/\bexport\s+(?=(?:async\s+)?function\b|const\b|class\b)/g, "");
const NOW = Date.now();
const fire = { logs: 3, maxLogs: 12, intensity: 0.25, color: "rose", serverTime: NOW, queuedPops: 0 };
const catalog = { price: 1000, currency: "KRW", durationHours: 24, available: true, products: [{ color: "rose", name: "로즈", price: 1000, sku: "rose-sku" }], fire };
const receipt = { orderId: "local-one", provider: "ait", color: "rose", status: "CREATED", amount: 1000, createdAt: NOW - 1000, sku: "rose-sku" };
const result = { verified: true, orderId: "local-one", color: "rose", startsAt: NOW, expiresAt: NOW + 86_400_000, fire };
const purchase = { communityId: "beach-a", userId: "buyer", color: "rose", requestId: "12345678-1234-4234-8234-123456789012" };
const pending = { orderId: "store-one", sku: "rose-sku", paymentCompletedDate: new Date(NOW).toISOString() };
const mapping = { orderId: "local-one", communityId: "beach-a", color: "rose", sku: "rose-sku", createdAt: NOW - 1000, providerOrderId: "store-one" };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const supported = (fn) => Object.assign(fn, { isSupported: () => true });

function setup(options = {}) {
  const calls = [], storage = new Map(options.storage ?? []);
  const state = { sdkLoads: 0, checkouts: 0, cleanups: 0, acknowledged: [], params: null };
  const iap = {
    getProductItemList: supported(async () => ({ products: [{ sku: "rose-sku", type: "CONSUMABLE", displayAmount: options.displayAmount ?? "1,000원" }] })),
    getPendingOrders: supported(async () => ({ orders: options.pending ?? [] })),
    completeProductGrant: supported(async (value) => { state.acknowledged.push(value.params.orderId); options.onAck?.(); return options.ack ?? true; }),
    createOneTimePurchaseOrder: supported((params) => {
      state.checkouts++;
      state.params = params;
      options.onCheckout?.(params);
      return () => { state.cleanups++; };
    }),
  };
  const intent = { orderId: "local-one", provider: options.ait ? "ait" : "web", color: "rose", amount: 1000, orderName: "로즈 불씨팝",
    customerKey: "sorow_testbuyer", clientKey: "test_ck_publickey", sku: "rose-sku", expectedStartAt: NOW,
    status: "CREATED", intentExpiresAt: NOW + 1_800_000, ...options.intent };
  const context = {
    IS_AIT: options.ait ?? false, Error, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    window: {
      location: { origin: "https://sorow.example" },
      localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
      TossPayments: (key) => ({ payment: ({ customerKey }) => ({ requestPayment: async (value) => {
        state.checkouts++; state.params = { ...value, key, customerKey };
        return options.webCheckout?.(value);
      } }) }),
    },
    document: { createElement() { throw new Error("Tests must never load an external provider script"); } },
    __loadAitSdk: async () => { state.sdkLoads++; return { IAP: iap }; },
    fetch: async (url, init) => {
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, init, body });
      if (url.includes("/catalog?")) return response(options.catalog ?? catalog);
      if (url.includes("/orders?")) return response({ orders: options.orders ?? [receipt] });
      if (url.endsWith("/orders")) return response(typeof options.intentFactory === "function" ? options.intentFactory() : intent);
      if (url.includes("/payments/")) return options.verify ? options.verify(url, body, storage) : response(result);
      throw new Error(`Unexpected API: ${url}`);
    },
  };
  vm.runInNewContext(`${source}\nglobalThis.api = { getFireCatalog, getFireOrders, buyFirePop, restoreFirePops, confirmWebFirePop, FirePurchaseError };`, context);
  return { ...context.api, calls, state, storage, iap };
}

function restore(api, userId = "buyer") {
  return api.restoreFirePops({ communityId: "beach-a", userId, catalog, orders: [receipt] });
}

test("catalog and history read authenticated server data without loading a checkout SDK", async () => {
  const api = setup({ catalog: { ...catalog, available: false, reason: "판매 준비 중" } });
  assert.equal((await api.getFireCatalog("a / b")).available, false);
  await api.getFireOrders("a / b");
  assert.equal(api.state.sdkLoads, 0);
  assert.equal(api.state.checkouts, 0);
  assert.match(api.calls[0].url, /communityId=a%20%2F%20b&platform=web/);
  assert.equal(api.calls[0].init.credentials, "same-origin");
  assert.equal(api.calls[0].init.cache, "no-store");
});

test("duplicate clicks cannot open two web checkouts; a definite cancel releases the guard", async () => {
  let cancel;
  const changes = [];
  const api = setup({ webCheckout: () => new Promise((_, reject) => { cancel = reject; }) });
  const first = api.buyFirePop({ ...purchase, onCheckoutChange: (active) => changes.push(active) });
  await flush();
  await assert.rejects(api.buyFirePop(purchase), /진행 중인 결제/);
  assert.equal(api.state.checkouts, 1);
  cancel({ code: "USER_CANCEL" });
  await assert.rejects(first, (error) => error.retryWithNewRequest === true && /취소/.test(error.message));
  assert.deepEqual(changes, [true, false]);
});

test("web checkout uses the exact amount and same-origin callback and never grants locally", async () => {
  const api = setup();
  assert.equal(await api.buyFirePop(purchase), null);
  assert.deepEqual(JSON.parse(JSON.stringify(api.state.params.amount)), { currency: "KRW", value: 1000 });
  assert.equal(new URL(api.state.params.successUrl).origin, "https://sorow.example");
  assert.equal(new URL(api.state.params.failUrl).searchParams.get("result"), "failed");
  assert.equal(api.calls.filter((call) => call.url.includes("/payments/")).length, 0);
  await assert.rejects(api.buyFirePop(purchase), /진행 중인 결제/);
});

test("secret keys and unconfigured providers never reach the checkout SDK", async () => {
  const secret = setup({ intent: { clientKey: "live_sk_never_in_browser" } });
  await assert.rejects(secret.buyFirePop(purchase), /설정/);
  assert.equal(secret.state.checkouts, 0);
  const unavailable = setup({ catalog: { ...catalog, available: false, reason: "결제 준비 중" } });
  await assert.rejects(unavailable.buyFirePop(purchase), /결제 준비 중/);
  assert.equal(unavailable.calls.filter((call) => call.body).length, 0);
});

test("AIT grant waits for server verification and persists receipt binding first", async () => {
  let finishVerification;
  const api = setup({ ait: true, verify: async (_url, body, storage) => {
    assert.equal(body.providerOrderId, "store-one");
    const saved = JSON.parse(storage.get("sorow:beach-purchases:buyer"));
    assert.equal(saved[0].providerOrderId, "store-one");
    return new Promise((resolve) => { finishVerification = () => resolve(response(result)); });
  } });
  const payment = api.buyFirePop(purchase);
  await flush();
  let returned = false;
  const grant = api.state.params.options.processProductGrant({ orderId: "store-one" }).then((value) => { returned = true; return value; });
  await flush();
  assert.equal(returned, false);
  finishVerification();
  assert.equal(await grant, true);
  await api.state.params.onEvent({ type: "success", data: { orderId: "store-one" } });
  assert.equal((await payment).verified, true);
  assert.equal(api.state.cleanups, 1);
});

test("AIT verification failure returns false and never reports a successful purchase", async () => {
  const api = setup({ ait: true, verify: async () => response({ verified: false }) });
  const payment = api.buyFirePop(purchase);
  await flush();
  assert.equal(await api.state.params.options.processProductGrant({ orderId: "store-one" }), false);
  api.state.params.onError({ code: "PRODUCT_NOT_GRANTED_BY_PARTNER" });
  await assert.rejects(payment, /구매 내역 다시 확인/);
  assert.equal(api.state.acknowledged.length, 0);
  assert.equal(api.state.cleanups, 1);
});

test("a verified grant followed by a store acknowledgement error stays recoverable without reporting success", async () => {
  const api = setup({ ait: true });
  const payment = api.buyFirePop(purchase);
  await flush();
  assert.equal(await api.state.params.options.processProductGrant({ orderId: "store-one" }), true);
  api.state.params.onError({ code: "PRODUCT_NOT_GRANTED_BY_PARTNER" });
  await assert.rejects(payment, (error) => !error.retryWithNewRequest && /구매 내역 다시 확인/.test(error.message));
  const saved = JSON.parse(api.storage.get("sorow:beach-purchases:buyer"));
  assert.equal(saved[0].providerOrderId, "store-one");
  assert.equal(saved[0].checkoutStarted, true);
  assert.equal(api.state.cleanups, 1);
});

test("an SDK success event without a verified grant cannot become an entitlement", async () => {
  const api = setup({ ait: true });
  const payment = api.buyFirePop(purchase);
  await flush();
  await api.state.params.onEvent({ type: "success", data: { orderId: "store-one" } });
  await assert.rejects(payment, /구매 내역 다시 확인/);
  assert.equal(api.calls.filter((call) => call.url.includes("/payments/")).length, 0);
});

test("AIT cancellation is definite, cleans up the SDK and records no receipt", async () => {
  const api = setup({ ait: true });
  const payment = api.buyFirePop(purchase);
  await flush();
  api.state.params.onError({ code: "USER_CANCELED" });
  await assert.rejects(payment, (error) => error.retryWithNewRequest === true);
  const saved = JSON.parse(api.storage.get("sorow:beach-purchases:buyer"));
  assert.equal(saved[0].checkoutStarted, false);
  assert.equal(saved[0].providerOrderId, undefined);
  assert.equal(api.state.cleanups, 1);
});

test("a different currency, amount or missing currency marker blocks IAP checkout", async () => {
  for (const displayAmount of ["$1.00", "1,100원", "1000"]) {
    const api = setup({ ait: true, displayAmount });
    await assert.rejects(api.buyFirePop(purchase), /1,000원 가격/);
    assert.equal(api.state.checkouts, 0);
  }
});

test("pending recovery verifies before acknowledging the store and uses its exact binding", async () => {
  const order = [];
  const api = setup({ ait: true, pending: [pending], storage: [["sorow:beach-purchases:buyer", JSON.stringify([mapping])]],
    verify: async () => { order.push("verify"); return response(result); }, onAck: () => order.push("ack") });
  assert.equal((await restore(api))[0].verified, true);
  assert.deepEqual(order, ["verify", "ack"]);
  assert.deepEqual(api.state.acknowledged, ["store-one"]);
  assert.equal(api.state.checkouts, 0);
});

test("same SKU/date without an exact account receipt binding fails closed", async () => {
  const api = setup({ ait: true, pending: [pending], storage: [["sorow:beach-purchases:other-user", JSON.stringify([mapping])]] });
  await assert.rejects(restore(api), /정확히 연결/);
  assert.equal(api.state.acknowledged.length, 0);
  assert.equal(api.calls.filter((call) => call.url.includes("/payments/")).length, 0);
});

test("a pending purchase bound to another community is not reassigned here", async () => {
  const api = setup({ ait: true, pending: [pending], storage: [["sorow:beach-purchases:buyer", JSON.stringify([{ ...mapping, communityId: "beach-b" }])]] });
  assert.equal((await restore(api)).length, 0);
  assert.equal(api.state.acknowledged.length, 0);
  assert.equal(api.calls.filter((call) => call.url.includes("/payments/")).length, 0);
});

test("a server-bound receipt can recover after local storage is lost", async () => {
  const api = setup({ ait: true, pending: [pending], orders: [{ ...receipt, providerOrderId: "store-one" }] });
  assert.equal((await restore(api))[0].verified, true);
  assert.deepEqual(api.state.acknowledged, ["store-one"]);
});

test("mismatched stored receipt and failed verification are never acknowledged", async () => {
  const mismatch = setup({ ait: true, pending: [pending], orders: [{ ...receipt, status: "PAID", providerOrderId: "different-store-order" }],
    storage: [["sorow:beach-purchases:buyer", JSON.stringify([mapping])]] });
  await assert.rejects(restore(mismatch), /정확히 연결/);
  assert.equal(mismatch.state.acknowledged.length, 0);
  const failed = setup({ ait: true, pending: [pending], orders: [{ ...receipt, providerOrderId: "store-one" }], verify: async () => response({ error: "확인되지 않은 결제예요." }, 409) });
  await assert.rejects(restore(failed), /확인되지 않은/);
  assert.equal(failed.state.acknowledged.length, 0);
});

test("a lost grant response retries its verified result and acknowledges pending payment without a second checkout", async () => {
  const api = setup({ ait: true, pending: [pending], intent: { status: "PAID", providerOrderId: "store-one", result } });
  assert.equal((await api.buyFirePop(purchase)).verified, true);
  assert.equal(api.state.sdkLoads, 1);
  assert.equal(api.state.checkouts, 0);
  assert.deepEqual(api.state.acknowledged, ["store-one"]);
});

test("retry with a known receipt restores that purchase without creating another store order", async () => {
  const api = setup({ ait: true, pending: [pending], intent: { recoveryRequired: true, providerOrderId: "store-one" } });
  assert.equal((await api.buyFirePop(purchase)).verified, true);
  assert.equal(api.state.checkouts, 0);
  assert.deepEqual(api.state.acknowledged, ["store-one"]);
  assert.equal(api.calls.find((call) => call.url.endsWith("/restore")).body.providerOrderId, "store-one");
});

test("expired unused intents never open IAP; uncertain prior checkout must recover first", async () => {
  const expired = setup({ ait: true, intent: { intentExpiresAt: NOW - 1 } });
  await assert.rejects(expired.buyFirePop(purchase), (error) => error.retryWithNewRequest === true);
  assert.equal(expired.state.checkouts, 0);
  const uncertain = setup({ ait: true });
  const first = uncertain.buyFirePop(purchase);
  await flush();
  uncertain.state.params.onError({ code: "NETWORK_ERROR" });
  await assert.rejects(first);
  await assert.rejects(uncertain.buyFirePop(purchase), /구매 내역 다시 확인/);
  assert.equal(uncertain.state.checkouts, 1);
});

test("expired intents with a pending store receipt or uncertain local checkout cannot authorize a new purchase", async () => {
  const expiredPending = setup({ ait: true, pending: [pending], intent: { intentExpiresAt: NOW - 1 } });
  await assert.rejects(expiredPending.buyFirePop(purchase), (error) => !error.retryWithNewRequest && /구매 내역 다시 확인/.test(error.message));
  assert.equal(expiredPending.state.checkouts, 0);
  const expiredUncertain = setup({ ait: true, intent: { intentExpiresAt: NOW - 1 },
    storage: [["sorow:beach-purchases:buyer", JSON.stringify([{ ...mapping, providerOrderId: undefined, checkoutStarted: true }])]] });
  await assert.rejects(expiredUncertain.buyFirePop(purchase), (error) => !error.retryWithNewRequest && /구매 내역 다시 확인/.test(error.message));
  assert.equal(expiredUncertain.state.checkouts, 0);
});

test("an expired intent with a known receipt recovers that receipt instead of requesting a new purchase", async () => {
  const api = setup({ ait: true, pending: [pending], intent: { intentExpiresAt: NOW - 1, recoveryRequired: true, providerOrderId: "store-one" } });
  assert.equal((await api.buyFirePop(purchase)).verified, true);
  assert.equal(api.state.checkouts, 0);
  assert.deepEqual(api.state.acknowledged, ["store-one"]);
});

test("web callback rejects altered amounts and requires an owned verified server order", async () => {
  const invalid = setup({ orders: [{ ...receipt, provider: "web" }] });
  await assert.rejects(invalid.confirmWebFirePop({ communityId: "beach-a", userId: "buyer", orderId: "local-one", paymentKey: "key", amount: "1" }), /올바르지/);
  assert.equal(invalid.calls.length, 0);
  const failed = setup({ orders: [{ ...receipt, provider: "web" }], verify: async () => response({ ...result, verified: false }) });
  await assert.rejects(failed.confirmWebFirePop({ communityId: "beach-a", userId: "buyer", orderId: "local-one", paymentKey: "key", amount: "1000" }), /구매 내역 다시 확인/);
  const foreign = setup({ orders: [] });
  await assert.rejects(foreign.confirmWebFirePop({ communityId: "beach-a", userId: "buyer", orderId: "foreign", paymentKey: "key", amount: "1000" }), /이 계정/);
  assert.equal(foreign.calls.filter((call) => call.url.includes("/payments/")).length, 0);
});

test("duplicate callback renders share one idempotent server confirmation", async () => {
  const api = setup({ orders: [{ ...receipt, provider: "web" }] });
  const options = { communityId: "beach-a", userId: "buyer", orderId: "local-one", paymentKey: "key", amount: "1000" };
  const first = api.confirmWebFirePop(options);
  const second = api.confirmWebFirePop(options);
  assert.equal(first, second);
  assert.equal((await first).verified, true);
  assert.equal(api.calls.filter((call) => call.url.endsWith("/confirm")).length, 1);
});

test("a later callback visit rechecks ownership and refunds instead of caching prior success", async () => {
  const order = { ...receipt, provider: "web" };
  const api = setup({ orders: [order] });
  const options = { communityId: "beach-a", userId: "buyer", orderId: "local-one", paymentKey: "key", amount: "1000" };
  assert.equal((await api.confirmWebFirePop(options)).verified, true);
  order.status = "REFUNDED";
  await assert.rejects(api.confirmWebFirePop(options), /이 계정/);
  assert.equal(api.calls.filter((call) => call.url.includes("/orders?")).length, 2);
  assert.equal(api.calls.filter((call) => call.url.endsWith("/confirm")).length, 1);
});
