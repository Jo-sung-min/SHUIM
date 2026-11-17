"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMe } from "./auth";
import { loadCompanion, type Companion } from "./moru";
import { EMPTY_OUTING, OutingError, outingRequest, type OutingView } from "./outing";

export function useOuting() {
  const [view, setView] = useState<OutingView>(EMPTY_OUTING);
  const [companion, setCompanion] = useState<Companion>({ name: "모루", appearance: "moru" });
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const owner = useRef<string | null>(null);
  const epoch = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    const ticket = ++epoch.current;
    const current = () => !abort.signal.aborted && ticket === epoch.current;
    setError("");
    try {
      const me = await fetchMe(true);
      if (!current()) return;
      if (!me.configured) throw new Error("서버 연결을 확인하지 못했어요. 풍경은 먼저 둘러볼 수 있어요.");
      if (owner.current !== (me.user?.id ?? null)) { owner.current = me.user?.id ?? null; setView(EMPTY_OUTING); }
      setCompanion(loadCompanion());
      if (!me.user) { setStatus("guest"); return; }
      const next = await outingRequest<OutingView>("", undefined, abort.signal);
      if (current()) { setView(next); if (next.companion) setCompanion(next.companion); setStatus("ready"); }
    } catch (e) {
      if (!current()) return;
      if (e instanceof OutingError && e.status === 401) { setView(EMPTY_OUTING); setStatus("guest"); }
      else { setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); setStatus("error"); }
    }
  }, []);
  useEffect(() => {
    void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { epoch.current++; request.current?.abort(); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  return { view, setView, companion, status, error, refresh, owner };
}
