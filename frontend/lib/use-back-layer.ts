"use client";

import { useEffect, useRef } from "react";

/**
 * 안드로이드 뒤로 가기(= history.back)를 화면 안 단계 이동으로 쓴다.
 *
 * 열려 있는 레이어(시트·대화상자·꽉 찬 편집기)가 하나라도 있으면 같은 주소의 기록을 "하나만" 쌓아 둔다.
 * 뒤로 가기가 그 기록을 걷어 내면 가장 나중에 열린 레이어의 onBack 을 부른다.
 * - onBack 이 true 를 돌려주면(아직 열려 있음) 기록을 다시 쌓는다.
 * - false 면 그 레이어는 닫히는 중으로 보고, 아래에 남은 레이어가 있을 때만 다시 쌓는다.
 * UI 로 모두 닫히면 쌓아 둔 기록을 history.back() 으로 걷어 낸다 (그 popstate 는 무시한다).
 *
 * 레이어마다 기록을 따로 쌓지 않으므로, 한 시트를 닫으며 곧바로 다른 시트를 열거나(같은 렌더)
 * 바깥 화면과 안쪽 시트가 같은 렌더에서 함께 열려도 기록이 꼬이거나 두 번 뒤로 가지 않는다.
 * Next.js 는 pushState 를 감싸 라우터 상태를 복사하므로 같은 주소 기록은 안전하게 오간다.
 */
interface Layer { onBack: () => boolean; closing: boolean }

const layers: Layer[] = [];
let entryToken: string | null = null; // 지금 쌓아 둔 기록의 표시 (없으면 null)
let ignorePops = 0; // 우리가 부른 history.back() 이 만들 popstate 수
let ignoreSince = 0; // 그 history.back() 을 부른 때 (오래 오지 않은 popstate 는 더 기다리지 않는다)
let scheduled = false;
let listening = false;

function currentToken(): string | undefined {
  return (window.history.state as { sorowLayer?: string } | null)?.sorowLayer;
}

function liveLayers() {
  return layers.filter((l) => !l.closing);
}

function reconcile() {
  scheduled = false;
  if (typeof window === "undefined") return;
  const wanted = liveLayers().length > 0;
  if (wanted && entryToken === null) {
    entryToken = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ...(window.history.state ?? {}), sorowLayer: entryToken }, "");
  } else if (!wanted && entryToken !== null) {
    const token = entryToken;
    entryToken = null;
    // 다른 화면으로 이동해 기록이 바뀌었으면(링크·replace) 걷어 낼 것이 없다
    if (currentToken() === token) {
      ignorePops++;
      ignoreSince = Date.now();
      window.history.back();
    }
  }
}

function schedule(delay = 0) {
  if (scheduled) return;
  scheduled = true;
  if (delay > 0) window.setTimeout(reconcile, delay);
  else queueMicrotask(reconcile);
}

function onPop() {
  if (ignorePops > 0) {
    ignorePops--;
    if (Date.now() - ignoreSince < 1500) return;
    ignorePops = 0; // 걷어 낸 뒤로 가기의 popstate 가 오지 않았다: 이번 것은 사용자의 뒤로 가기다
  }
  if (entryToken === null) return;
  // 앞 화면에서 돌아와 우리 기록 위에 다시 선 경우: 레이어를 닫을 뒤로 가기가 아니다
  if (currentToken() === entryToken) return;
  entryToken = null; // 쌓아 둔 기록은 방금 걷혔다
  const top = liveLayers().at(-1);
  if (top && !top.onBack()) top.closing = true;
  // 닫히는 렌더가 끝난 뒤에 다시 맞춘다 (남은 레이어가 있으면 기록을 다시 쌓는다)
  schedule(60);
}

export function useBackLayer(open: boolean, onBack: () => boolean) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!listening) {
      listening = true;
      window.addEventListener("popstate", onPop);
    }
    const layer: Layer = { onBack: () => onBackRef.current(), closing: false };
    layers.push(layer);
    schedule();
    return () => {
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      schedule();
    };
  }, [open]);
}

/**
 * 레이어 안의 링크로 다른 화면에 갈 때 부른다: 쌓아 둔 기록을 history.back() 으로 걷어 내지 않는다.
 * (걷어 내는 뒤로 가기가 링크 이동과 겹치면 이동이 되돌려질 수 있어서. 대신 같은 주소 기록이 하나 남는다)
 */
export function keepBackEntryForNavigation() {
  entryToken = null;
}

/** 클릭이 같은 출처의 다른 화면으로 가는 링크 클릭인지 */
export function isNavigatingLinkClick(event: { target: EventTarget | null; defaultPrevented?: boolean; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number }): boolean {
  if (typeof window === "undefined" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.button ?? 0) !== 0) return false;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin && (url.pathname !== window.location.pathname || url.search !== window.location.search);
  } catch {
    return false;
  }
}

/** 레이어를 닫은 직후 화면을 떠날 때: 걷어 내는 뒤로 가기가 끝난 다음에 go 를 부른다 (이동과 겹치지 않게) */
export function whenBackLayersReleased(go: () => void) {
  const started = Date.now();
  const tick = () => {
    if (!currentToken() || Date.now() - started > 800) go();
    else window.setTimeout(tick, 30);
  };
  window.setTimeout(tick, 30);
}
