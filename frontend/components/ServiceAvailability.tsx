"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconRefresh } from "./Icons";
import { resetCommunityCache } from "@/lib/community";
import { resetAuthCache } from "@/lib/auth";
import { appPath } from "@/lib/routes";
import {
  isServicePublicPath, observeApiFailures, probeServiceHealth,
  SERVICE_CHECK_INTERVAL_MS, SERVICE_RETRY_INTERVAL_MS,
} from "@/lib/service-availability";

type Status = "checking" | "ready" | "unavailable";

/** Gate the first connection, then preserve drafts while an outage hides the application. */
export default function ServiceAvailability({ children }: { children: ReactNode }) {
  const pathname = appPath(usePathname());
  const [status, setStatus] = useState<Status>("checking");
  const [hasConnected, setHasConnected] = useState(false);
  const [pending, setPending] = useState(true);
  const [offline, setOffline] = useState(false);
  const retry = useRef<() => void>(() => {});
  const application = useRef<HTMLDivElement>(null);
  const preparing = useRef<HTMLElement>(null);
  const lastAppFocus = useRef<HTMLElement | null>(null);
  const publicPage = isServicePublicPath(pathname);
  const blocked = !publicPage && status !== "ready";

  useEffect(() => {
    if (!blocked) return;
    preparing.current?.focus({ preventScroll: true });
    return () => {
      const previous = lastAppFocus.current;
      if (previous?.isConnected && application.current?.contains(previous) && !previous.closest("[inert]")) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [blocked]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let checkAgain = false;
    let previous: Status = "checking";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const originalFetch = window.fetch;
    const request = originalFetch.bind(window);

    const schedule = (healthy: boolean) => {
      if (timer !== undefined) clearTimeout(timer);
      if (!disposed && !document.hidden) {
        timer = setTimeout(() => { void check(); }, healthy ? SERVICE_CHECK_INTERVAL_MS : SERVICE_RETRY_INTERVAL_MS);
      }
    };

    const check = async () => {
      if (disposed) return;
      if (inFlight) { checkAgain = true; return; }
      if (timer !== undefined) clearTimeout(timer);
      const disconnected = navigator.onLine === false;
      setOffline(disconnected);
      if (disconnected) {
        previous = "unavailable";
        setStatus("unavailable");
        setPending(false);
        schedule(false);
        return;
      }
      inFlight = true;
      setPending(true);
      controller = new AbortController();
      const healthy = await probeServiceHealth(request, controller.signal);
      inFlight = false;
      if (disposed) return;
      // Re-enter with fresh account/community data after a confirmed outage.
      if (healthy && previous === "unavailable") {
        resetCommunityCache();
        resetAuthCache();
      }
      previous = healthy ? "ready" : "unavailable";
      if (healthy) setHasConnected(true);
      setStatus(previous);
      setPending(false);
      if (checkAgain) {
        checkAgain = false;
        void check();
      } else {
        schedule(healthy);
      }
    };

    const monitoredFetch = observeApiFailures(request, window.location.origin, () => { void check(); });
    window.fetch = monitoredFetch;
    const onOnline = () => { void check(); };
    const onOffline = () => {
      previous = "unavailable";
      setOffline(true);
      setStatus("unavailable");
      setPending(false);
      controller?.abort();
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== undefined) clearTimeout(timer);
      } else {
        void check();
      }
    };
    retry.current = () => { void check(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => {
      disposed = true;
      controller?.abort();
      if (timer !== undefined) clearTimeout(timer);
      if (window.fetch === monitoredFetch) window.fetch = originalFetch;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      retry.current = () => {};
    };
  }, []);

  return (
    <>
      <div
        ref={application}
        hidden={blocked}
        inert={blocked}
        aria-hidden={blocked}
        style={{ display: blocked ? "none" : "contents" }}
        onFocusCapture={(event) => { lastAppFocus.current = event.target; }}
      >
        {(publicPage || hasConnected) ? children : null}
      </div>
      {blocked && <main ref={preparing} tabIndex={-1} className="service-state" style={{ height: "100dvh", overflowY: "auto" }}>
      <Link href="/info" className="service-state__brand" aria-label="소로우 서비스 안내">SOROW<span>소로우</span></Link>
      <div className="service-state__body">
        <div className="service-state__mark" aria-hidden="true">
          <svg viewBox="0 0 96 72" fill="none"><circle cx="35" cy="36" r="27" fill="currentColor" opacity=".3" /><circle cx="61" cy="36" r="27" fill="currentColor" opacity=".65" /></svg>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="service-state__eyebrow">조금만 기다려 주세요</p>
          <h1 className="service-state__title">잠시 준비 중이에요</h1>
          <p className="service-state__description">{offline ? "인터넷 연결을 확인해 주세요." : "소로우에 연결하고 있어요."}<br />연결되면 자동으로 열어드릴게요.</p>
        </div>
        <div className="service-state__actions">
          <button type="button" className="btn service-state__retry" disabled={pending} aria-busy={pending} onClick={() => retry.current()}>
            <IconRefresh />{pending ? "연결 확인 중" : "다시 연결하기"}
          </button>
          <Link href="/info" className="service-state__info">서비스 안내</Link>
        </div>
      </div>
      <p className="service-state__footnote">슬픔을 나누면, 우리는 가까워진다.</p>
      </main>}
    </>
  );
}
