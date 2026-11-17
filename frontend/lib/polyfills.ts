/**
 * 오래된 안드로이드 WebView·Chrome 에 없는 API 를 채운다. 앱 전체에서 한 번, 첫 화면에서 부른다 (components/EarlyClient.tsx).
 * 이미 있으면 아무것도 바꾸지 않는다.
 */
export function installPolyfills(): void {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.any === "function") return;
  // Chrome 116 미만: 여러 신호 중 하나라도 멈추면 같이 멈추는 신호 (사유는 처음 멈춘 신호의 reason)
  const any = (signals: Iterable<AbortSignal>): AbortSignal => {
    const controller = new AbortController();
    const list = Array.from(signals);
    const cleanup = () => { for (const signal of list) signal.removeEventListener("abort", onAbort); };
    function onAbort(this: AbortSignal) {
      cleanup();
      controller.abort(this.reason);
    }
    for (const signal of list) {
      if (signal.aborted) {
        cleanup();
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    return controller.signal;
  };
  try {
    Object.defineProperty(AbortSignal, "any", { value: any, configurable: true, writable: true });
  } catch {}
}
