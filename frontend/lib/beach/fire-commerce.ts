"use client";

import { IS_AIT } from "../ait";
import type { FireState, PopColor } from "./net";

export interface FireCatalog {
  price: 1000;
  currency: "KRW";
  durationHours: 24;
  available: boolean;
  reason?: string;
  products: Array<{ color: PopColor; name: string; price: number; sku?: string }>;
  fire: FireState;
}

export interface PurchaseReceipt {
  orderId: string;
  provider: "web" | "ait";
  color: PopColor;
  status: "CREATED" | "PAID" | "REFUNDED" | "FAILED";
  amount: number;
  startsAt?: number;
  expiresAt?: number;
  sku?: string;
  providerOrderId?: string;
  createdAt: number;
  communityId?: string;
}

export interface PurchaseResult {
  verified: true;
  orderId: string;
  color: PopColor;
  startsAt: number;
  expiresAt: number;
  fire: FireState;
}

interface OrderIntent {
  orderId: string;
  provider: "web" | "ait";
  color: PopColor;
  amount: number;
  orderName: string;
  customerKey?: string;
  clientKey?: string;
  sku?: string;
  expectedStartAt: number;
  status: PurchaseReceipt["status"];
  providerOrderId?: string;
  result?: PurchaseResult;
  recoveryRequired?: boolean;
  intentExpiresAt: number;
  paymentKey?: string;
}

interface LocalIntent {
  orderId: string;
  communityId: string;
  color: PopColor;
  sku?: string;
  createdAt: number;
  providerOrderId?: string;
  checkoutStarted?: boolean;
}

export class FirePurchaseError extends Error {
  constructor(message: string, readonly retryWithNewRequest = false) {
    super(message);
    this.name = "FirePurchaseError";
  }
}

type Iap = typeof import("@apps-in-toss/web-framework")["IAP"];
type TossFactory = (key: string) => {
  payment: (options: { customerKey: string }) => {
    requestPayment: (options: {
      method: "CARD"; amount: { currency: "KRW"; value: number }; orderId: string;
      orderName: string; successUrl: string; failUrl: string;
    }) => Promise<void>;
  };
};

const ROOT = "/api/beach/fire";
const COLORS = new Set<PopColor>(["rose", "aurora", "ocean", "violet"]);
const PRICE = 1000;
const VERIFY_TIMEOUT = 25_000;
const RECOVERY_MESSAGE = "결제 확인이 남아 있어요. 다시 구매하지 말고 ‘구매 내역 다시 확인’을 눌러 주세요.";
let checkoutActive = false;
let webSdkPromise: Promise<TossFactory> | null = null;
const webConfirmations = new Map<string, Promise<PurchaseResult>>();

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const validColor = (value: unknown): value is PopColor => typeof value === "string" && COLORS.has(value as PopColor);
const validFire = (value: unknown): value is FireState => record(value) && Number.isFinite(value.logs) && Number.isFinite(value.serverTime) && typeof value.color === "string";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(record(data) && text(data.error) ? data.error : "결제 서비스에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.");
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(RECOVERY_MESSAGE);
    throw error instanceof Error ? error : new Error("결제 상태를 확인하지 못했어요.");
  } finally {
    clearTimeout(timeout);
  }
}

function verifiedResult(value: unknown, orderId: string, color?: PopColor): PurchaseResult {
  if (!record(value) || value.verified !== true || value.orderId !== orderId || !validColor(value.color)
    || (color !== undefined && value.color !== color) || !Number.isFinite(value.startsAt)
    || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) <= Number(value.startsAt) || !validFire(value.fire)) {
    throw new Error(RECOVERY_MESSAGE);
  }
  return value as unknown as PurchaseResult;
}

export async function getFireCatalog(communityId: string): Promise<FireCatalog> {
  const data = await request<unknown>(`${ROOT}/catalog?communityId=${encodeURIComponent(communityId)}&platform=${IS_AIT ? "ait" : "web"}`);
  if (!record(data) || data.price !== PRICE || data.currency !== "KRW" || data.durationHours !== 24
    || typeof data.available !== "boolean" || !validFire(data.fire) || !Array.isArray(data.products)
    || !data.products.every((product) => record(product) && validColor(product.color) && text(product.name) && product.price === PRICE)) {
    throw new Error("불씨팝 상품 정보를 확인하지 못했어요.");
  }
  return data as unknown as FireCatalog;
}

export async function getFireOrders(communityId: string): Promise<PurchaseReceipt[]> {
  const data = await request<unknown>(`${ROOT}/orders?communityId=${encodeURIComponent(communityId)}`);
  if (!record(data) || !Array.isArray(data.orders) || !data.orders.every((order) => record(order)
    && text(order.orderId) && ["web", "ait"].includes(String(order.provider)) && validColor(order.color)
    && ["CREATED", "PAID", "REFUNDED", "FAILED"].includes(String(order.status))
    && order.amount === PRICE && Number.isFinite(order.createdAt))) {
    throw new Error("구매 내역을 확인하지 못했어요.");
  }
  return data.orders as unknown as PurchaseReceipt[];
}

function storageKey(userId: string) { return `sorow:beach-purchases:${encodeURIComponent(userId)}`; }

function readIntents(userId: string): LocalIntent[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "[]");
    return Array.isArray(value) ? value.filter((item): item is LocalIntent => record(item) && text(item.orderId)
      && text(item.communityId) && validColor(item.color) && Number.isFinite(item.createdAt)) : [];
  } catch { return []; }
}

function saveIntent(userId: string, intent: LocalIntent) {
  const all = readIntents(userId);
  if (intent.providerOrderId && all.some((item) => item.providerOrderId === intent.providerOrderId && item.orderId !== intent.orderId)) {
    throw new Error("이 결제에 연결된 구매 내역을 확인해야 해요. 구매 내역 다시 확인을 눌러 주세요.");
  }
  const saved = all.find((item) => item.orderId === intent.orderId);
  if (saved?.providerOrderId && intent.providerOrderId && saved.providerOrderId !== intent.providerOrderId) {
    throw new Error("구매 정보가 달라 결제를 확인하지 못했어요.");
  }
  const next = [{ ...saved, ...intent }, ...all.filter((item) => item.orderId !== intent.orderId)].slice(0, 100);
  try { window.localStorage.setItem(storageKey(userId), JSON.stringify(next)); }
  catch { throw new Error("구매 확인 정보를 저장할 수 없어요. 브라우저 저장소를 허용한 뒤 다시 시도해 주세요."); }
}

function providerError(error: unknown): Error {
  const code = record(error) && typeof error.code === "string" ? error.code : "";
  if (["USER_CANCELED", "USER_CANCEL", "PAY_PROCESS_CANCELED"].includes(code)) return new FirePurchaseError("결제를 취소했어요.", true);
  if (code === "UNSUPPORTED_APP_VERSION") return new Error("토스 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.");
  if (["PAYMENT_PENDING", "PRODUCT_NOT_GRANTED_BY_PARTNER", "TOSS_SERVER_VERIFICATION_FAILED", "APP_MARKET_VERIFICATION_FAILED"].includes(code)) return new Error(RECOVERY_MESSAGE);
  return error instanceof Error ? error : new Error("결제를 마치지 못했어요. 결제 내역을 확인한 뒤 다시 시도해 주세요.");
}

async function loadIap(): Promise<Iap> {
  if (!IS_AIT) throw new Error("토스 앱 안에서만 사용할 수 있는 결제예요.");
  try { return (await import("@apps-in-toss/web-framework")).IAP; }
  catch { throw new Error("토스 결제 기능을 불러오지 못했어요. 앱을 다시 열어 주세요."); }
}

function requireSupported(...methods: Array<{ isSupported: () => boolean }>) {
  if (methods.some((method) => !method.isSupported())) throw new Error("토스 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.");
}

function isKrw1000(amount: string) {
  const normalized = amount.normalize("NFKC").replace(/\s/g, "").toUpperCase();
  return /^(?:(?:₩|KRW)(?:1,000|1000)(?:\.00)?|(?:1,000|1000)(?:\.00)?원)$/.test(normalized);
}

async function loadWebSdk(): Promise<TossFactory> {
  const browser = window as Window & { TossPayments?: TossFactory };
  if (typeof browser.TossPayments === "function") return browser.TossPayments;
  if (webSdkPromise) return webSdkPromise;
  webSdkPromise = new Promise<TossFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error("결제창을 불러오지 못했어요. 연결 상태나 콘텐츠 차단 설정을 확인해 주세요.")); };
    const timer = setTimeout(fail, 15_000);
    script.onload = () => { clearTimeout(timer); if (typeof browser.TossPayments === "function") resolve(browser.TossPayments); else fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => { webSdkPromise = null; throw error; });
  return webSdkPromise;
}

async function buyInToss(iap: Iap, intent: OrderIntent, local: LocalIntent, userId: string): Promise<PurchaseResult> {
  return new Promise<PurchaseResult>((resolve, reject) => {
    let cleanup: (() => void) | undefined;
    let settled = false;
    let receiptId: string | null = null;
    let grant: Promise<PurchaseResult> | null = null;
    let grantError: Error | null = null;
    const finish = (value: PurchaseResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { cleanup?.(); } catch { /* SDK cleanup must not replace a verified result. */ }
      if (value instanceof Error) reject(value); else resolve(value);
    };
    const timeout = setTimeout(() => finish(new Error(RECOVERY_MESSAGE)), 10 * 60_000);
    try {
      saveIntent(userId, { ...local, checkoutStarted: true });
      cleanup = iap.createOneTimePurchaseOrder({
        options: {
          sku: intent.sku!,
          processProductGrant: async ({ orderId }) => {
            if (settled || !text(orderId) || (receiptId !== null && receiptId !== orderId)) return false;
            receiptId = orderId;
            try {
              saveIntent(userId, { ...local, checkoutStarted: true, providerOrderId: orderId });
              grant ??= request<unknown>(`${ROOT}/payments/ait`, { orderId: intent.orderId, providerOrderId: orderId })
                .then((data) => verifiedResult(data, intent.orderId, intent.color));
              await grant;
              return true;
            } catch (error) {
              grantError = providerError(error);
              return false;
            }
          },
        },
        onEvent: async (event) => {
          if (event.type !== "success") return;
          try {
            const value = grant ? await grant : null;
            if (!value || event.data.orderId !== receiptId) throw new Error(RECOVERY_MESSAGE);
            finish(value);
          } catch (error) { finish(providerError(error)); }
        },
        onError: (error) => {
          if (record(error) && error.code === "USER_CANCELED" && receiptId === null) {
            try { saveIntent(userId, { ...local, checkoutStarted: false }); }
            catch (storageError) { finish(providerError(storageError)); return; }
          }
          finish(receiptId !== null ? new Error(RECOVERY_MESSAGE) : grantError ?? providerError(error));
        },
      });
      if (settled) cleanup();
    } catch (error) { finish(receiptId !== null ? new Error(RECOVERY_MESSAGE) : providerError(error)); }
  });
}

export async function buyFirePop(options: {
  communityId: string; color: PopColor; userId: string; requestId: string;
  onCheckoutChange?: (active: boolean) => void;
}): Promise<PurchaseResult | null> {
  if (checkoutActive) throw new Error("진행 중인 결제를 먼저 마쳐 주세요.");
  if (!text(options.userId)) throw new Error("로그인한 뒤 구매해 주세요.");
  if (!validColor(options.color) || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(options.requestId)) throw new Error("구매 정보를 새로 확인해 주세요.");
  checkoutActive = true;
  let redirecting = false;
  options.onCheckoutChange?.(true);
  try {
    const catalog = await getFireCatalog(options.communityId);
    if (!catalog.available) throw new Error(catalog.reason || "아직 불씨팝을 구매할 수 없어요.");
    const product = catalog.products.find((item) => item.color === options.color);
    if (!product) throw new Error("선택한 불씨팝을 찾을 수 없어요.");
    const intent = await request<OrderIntent>(`${ROOT}/orders`, {
      communityId: options.communityId, color: options.color, platform: IS_AIT ? "ait" : "web", requestId: options.requestId,
    });
    if (!intent || !text(intent.orderId) || intent.provider !== (IS_AIT ? "ait" : "web") || intent.amount !== PRICE
      || intent.color !== options.color || !text(intent.orderName)
      || !["CREATED", "PAID", "REFUNDED", "FAILED"].includes(intent.status)) throw new Error("구매 주문을 확인하지 못했어요.");
    if (intent.status === "PAID") {
      const paid = verifiedResult(intent.result, intent.orderId, intent.color);
      if (IS_AIT) {
        if (!text(intent.providerOrderId)) throw new Error(RECOVERY_MESSAGE);
        const iap = await loadIap();
        requireSupported(iap.getPendingOrders, iap.completeProductGrant);
        const pending = await iap.getPendingOrders();
        const unacknowledged = pending.orders.find((item) => item.orderId === intent.providerOrderId);
        if (unacknowledged && (unacknowledged.sku !== intent.sku || await iap.completeProductGrant({ params: { orderId: intent.providerOrderId } }) !== true)) {
          throw new Error("구매는 확인했지만 토스의 완료 처리가 남아 있어요. 구매 내역 다시 확인을 눌러 주세요.");
        }
      }
      return paid;
    }
    if (intent.status !== "CREATED") throw new FirePurchaseError("이 주문은 종료됐어요. 다시 구매하려면 새 결제를 시작해 주세요.", true);
    const saved = readIntents(options.userId).find((item) => item.orderId === intent.orderId);
    const local: LocalIntent = { orderId: intent.orderId, communityId: options.communityId, color: intent.color, sku: intent.sku, createdAt: Date.now() };
    saveIntent(options.userId, local);
    if (IS_AIT) {
      if (!text(intent.sku) || intent.sku !== product.sku) throw new Error("상품 정보가 달라 구매를 시작하지 않았어요.");
      const iap = await loadIap();
      requireSupported(iap.createOneTimePurchaseOrder, iap.getProductItemList, iap.getPendingOrders, iap.completeProductGrant);
      const receipt = intent.providerOrderId ?? saved?.providerOrderId;
      if (receipt) {
        saveIntent(options.userId, { ...local, providerOrderId: receipt });
        const restored = verifiedResult(await request<unknown>(`${ROOT}/payments/restore`, {
          orderId: intent.orderId, providerOrderId: receipt,
        }), intent.orderId, intent.color);
        const pending = await iap.getPendingOrders();
        if (pending.orders.some((item) => item.orderId === receipt) && await iap.completeProductGrant({ params: { orderId: receipt } }) !== true) {
          throw new Error("구매는 확인했지만 토스의 완료 처리가 남아 있어요. 구매 내역 다시 확인을 눌러 주세요.");
        }
        return restored;
      }
      if (intent.recoveryRequired || saved?.checkoutStarted) throw new Error(RECOVERY_MESSAGE);
      const pending = await iap.getPendingOrders();
      if (pending.orders.some((item) => catalog.products.some((candidate) => candidate.sku === item.sku))) throw new Error(RECOVERY_MESSAGE);
      if (!Number.isFinite(intent.intentExpiresAt) || intent.intentExpiresAt <= Date.now()) {
        throw new FirePurchaseError("구매 정보가 만료됐어요. 결제 버튼을 다시 눌러 새 주문을 시작해 주세요.", true);
      }
      const available = await iap.getProductItemList();
      const item = available.products.find((candidate) => candidate.sku === product.sku);
      if (!item || item.type !== "CONSUMABLE" || !isKrw1000(item.displayAmount)) {
        throw new Error("토스에 등록된 상품과 1,000원 가격을 확인하지 못해 구매를 시작하지 않았어요.");
      }
      return await buyInToss(iap, intent, local, options.userId);
    }
    if (intent.recoveryRequired) {
      if (!text(intent.paymentKey)) throw new Error(RECOVERY_MESSAGE);
      return verifiedResult(await request<unknown>(`${ROOT}/payments/confirm`, {
        orderId: intent.orderId, paymentKey: intent.paymentKey, amount: PRICE,
      }), intent.orderId, intent.color);
    }
    if (!intent.clientKey || !/^(?:test|live)_ck_[A-Za-z0-9_-]+$/.test(intent.clientKey)
      || !intent.customerKey || !/^[A-Za-z0-9_-]{2,50}$/.test(intent.customerKey)) {
      throw new Error("웹 결제 설정이 준비되지 않았어요. 잠시 후 다시 확인해 주세요.");
    }
    const factory = await loadWebSdk();
    const callback = new URL("/beach/payment", window.location.origin);
    callback.searchParams.set("communityId", options.communityId);
    const failure = new URL(callback);
    failure.searchParams.set("result", "failed");
    await factory(intent.clientKey).payment({ customerKey: intent.customerKey }).requestPayment({
      method: "CARD", amount: { currency: "KRW", value: PRICE }, orderId: intent.orderId, orderName: intent.orderName,
      successUrl: callback.href, failUrl: failure.href,
    });
    redirecting = true;
    return null;
  } catch (error) { throw providerError(error); }
  finally {
    if (!redirecting) { checkoutActive = false; options.onCheckoutChange?.(false); }
  }
}

export async function restoreFirePops(options: {
  communityId: string; userId: string; catalog: FireCatalog; orders: PurchaseReceipt[];
}): Promise<PurchaseResult[]> {
  if (checkoutActive) throw new Error("진행 중인 결제를 먼저 마쳐 주세요.");
  if (!text(options.userId)) throw new Error("구매한 계정으로 로그인한 뒤 복구해 주세요.");
  if (!IS_AIT) throw new Error("웹 결제는 구매 내역에서 확인해요. 결제 확인 화면이 열려 있다면 그 화면에서 다시 확인해 주세요.");
  checkoutActive = true;
  try {
    const iap = await loadIap();
    requireSupported(iap.getPendingOrders, iap.completeProductGrant);
    // Always re-read the authenticated account's orders before matching a store receipt.
    const orders = await getFireOrders(options.communityId);
    const pending = await iap.getPendingOrders();
    const mappings = readIntents(options.userId);
    const products = new Map(options.catalog.products.filter((item) => item.sku).map((item) => [item.sku!, item]));
    const results: PurchaseResult[] = [];
    const plan: Array<{ purchase: typeof pending.orders[number]; intent: PurchaseReceipt }> = [];
    for (const purchase of pending.orders) {
      const product = products.get(purchase.sku);
      if (!product) continue;
      if (mappings.some((item) => item.providerOrderId === purchase.orderId && item.communityId !== options.communityId)) continue;
      const matching = mappings.filter((item) => item.communityId === options.communityId && item.providerOrderId === purchase.orderId && item.sku === purchase.sku);
      const candidates = orders.filter((order) => order.provider === "ait" && order.sku === purchase.sku && order.color === product.color
        && ["CREATED", "PAID"].includes(order.status) && (!order.providerOrderId || order.providerOrderId === purchase.orderId)
        && (order.providerOrderId === purchase.orderId || (order.status === "CREATED" && matching.some((item) => item.orderId === order.orderId))));
      // A matching SKU/date cannot prove the original beach across devices or communities.
      // Recover only an explicit receipt binding; the server independently verifies that binding.
      if (candidates.length !== 1 || plan.some((item) => item.intent.orderId === candidates[0].orderId)) {
        throw new Error("결제와 구매 내역을 정확히 연결하지 못했어요. 중복 구매하지 말고 주문 내역을 확인해 주세요.");
      }
      plan.push({ purchase, intent: candidates[0] });
    }
    // Resolve every receipt first; an ambiguous pair must not partially acknowledge purchases.
    for (const { purchase, intent } of plan) {
      saveIntent(options.userId, { orderId: intent.orderId, communityId: options.communityId, color: intent.color,
        sku: purchase.sku, createdAt: intent.createdAt, providerOrderId: purchase.orderId });
      const result = verifiedResult(await request<unknown>(`${ROOT}/payments/restore`, {
        orderId: intent.orderId, providerOrderId: purchase.orderId,
      }), intent.orderId, intent.color);
      const completed = await iap.completeProductGrant({ params: { orderId: purchase.orderId } });
      if (completed !== true) throw new Error("구매는 확인했지만 토스의 완료 처리가 남아 있어요. 구매 내역 다시 확인을 한 번 더 눌러 주세요.");
      results.push(result);
    }
    return results;
  } catch (error) { throw providerError(error); }
  finally { checkoutActive = false; }
}

/** A redirect query alone never proves payment: confirm against the account's server order. */
export function confirmWebFirePop(options: {
  communityId: string; userId: string; orderId: string; paymentKey: string; amount: string;
}): Promise<PurchaseResult> {
  if (IS_AIT || !text(options.communityId) || !text(options.userId) || !text(options.orderId) || !text(options.paymentKey) || options.amount !== "1000") {
    return Promise.reject(new Error("결제 정보가 올바르지 않아 승인하지 않았어요. 구매 내역을 확인해 주세요."));
  }
  const key = JSON.stringify([options.userId, options.communityId, options.orderId, options.paymentKey]);
  const existing = webConfirmations.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const orders = await getFireOrders(options.communityId);
    const order = orders.find((item) => item.orderId === options.orderId && item.provider === "web" && item.amount === PRICE);
    if (!order || ["REFUNDED", "FAILED"].includes(order.status)) throw new Error("이 계정의 구매 주문을 확인하지 못했어요. 구매한 계정으로 다시 확인해 주세요.");
    return verifiedResult(await request<unknown>(`${ROOT}/payments/confirm`, {
      orderId: options.orderId, paymentKey: options.paymentKey, amount: PRICE,
    }), options.orderId, order.color);
  })().finally(() => { webConfirmations.delete(key); });
  webConfirmations.set(key, pending);
  return pending;
}
