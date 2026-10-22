/** Shared connection checks. Health responses are never saved or exposed in the UI. */
export const SERVICE_HEALTH_PATH = "/api/db";
export const SERVICE_CHECK_INTERVAL_MS = 30_000;
export const SERVICE_RETRY_INTERVAL_MS = 10_000;
export const SERVICE_TIMEOUT_MS = 7_000;

const PUBLIC_PATHS = ["/info", "/privacy", "/terms", "/account-deletion"];

/** Service information and account deletion instructions must remain readable during an outage. */
export function isServicePublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isServiceHealthy(value: unknown): boolean {
  return Boolean(value && typeof value === "object" &&
    "configured" in value && value.configured === true && "ok" in value && value.ok === true);
}

export async function probeServiceHealth(
  request: typeof fetch,
  signal: AbortSignal,
  timeoutMs = SERVICE_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) return false;
  signal.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const interrupted = new Promise<false>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve(false), { once: true });
    timer = setTimeout(abort, timeoutMs);
  });
  try {
    const health = request(SERVICE_HEALTH_PATH, {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => response.ok && isServiceHealthy(await response.json()));
    return await Promise.race([health, interrupted]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

function isObservedApiRequest(input: RequestInfo | URL, origin: string): boolean {
  try {
    const raw = typeof input === "string" || input instanceof URL ? input : input.url;
    const url = new URL(raw, origin);
    return url.origin === origin && url.pathname.startsWith("/api/") && url.pathname !== SERVICE_HEALTH_PATH;
  } catch {
    return false;
  }
}

/** Observe failures without reading bodies, changing requests, or treating validation errors as downtime. */
export function observeApiFailures(request: typeof fetch, origin: string, onFailure: () => void): typeof fetch {
  return async (input, init) => {
    const observed = isObservedApiRequest(input, origin);
    try {
      const response = await request(input, init);
      if (observed && response.status >= 500) onFailure();
      return response;
    } catch (error) {
      const cancelled = error instanceof Error && error.name === "AbortError";
      const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
      if (observed && !cancelled && !signal?.aborted) onFailure();
      throw error;
    }
  };
}
