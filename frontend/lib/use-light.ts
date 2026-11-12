"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMe } from "./auth";
import { claimDailyLight, fetchLight, type LightWallet } from "./light";
import { toastSuccess } from "./toast";

/** idle = 아직 안 읽음(시트가 열릴 때 읽는 화면), guest = 로그인 전 */
export type LightState =
  | { kind: "idle" | "loading" | "guest" }
  | { kind: "error"; message: string }
  | { kind: "ready"; userId: string; wallet: LightWallet };

/**
 * 내 별 지갑. auto 가 false 면 refresh() 를 부를 때까지 읽지 않는다 (글 화면처럼 별 주기 시트를 열 때만 필요한 곳).
 * 계정이 바뀌거나 화면을 떠난 뒤 도착한 응답은 버린다.
 */
export function useLight(auto = true) {
  const [state, setState] = useState<LightState>({ kind: auto ? "loading" : "idle" });
  const [claiming, setClaiming] = useState(false);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const claimLock = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    const current = ++request.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (!quiet) setState({ kind: "loading" });
    try {
      const me = await fetchMe(true);
      if (current !== request.current) return;
      if (!me.configured) throw new Error("연결을 확인한 뒤 다시 시도해 주세요.");
      if (!me.user) { setState({ kind: "guest" }); return; }
      const wallet = await fetchLight(me.user.id, abort.signal);
      if (current === request.current) setState({ kind: "ready", userId: me.user.id, wallet });
    } catch (cause) {
      if (current === request.current) setState({ kind: "error", message: cause instanceof Error ? cause.message : "연결을 확인한 뒤 다시 시도해 주세요." });
    }
  }, []);

  useEffect(() => {
    if (auto) void refresh();
    return () => {
      ++request.current;
      controller.current?.abort();
    };
  }, [auto, refresh]);

  /** 오늘의 별 받기. 성공하면 받은 지갑 상태로 바꾸고 true */
  const claim = useCallback(async (): Promise<boolean> => {
    if (state.kind !== "ready" || claimLock.current) return false;
    claimLock.current = true;
    setClaiming(true);
    const current = ++request.current;
    try {
      const wallet = await claimDailyLight(state.userId);
      if (current !== request.current) return false;
      setState({ kind: "ready", userId: state.userId, wallet });
      toastSuccess(`오늘의 별을 받았어요 (+${wallet.dailyLight})`);
      return true;
    } catch (cause) {
      if (current === request.current) setState({ kind: "error", message: cause instanceof Error ? cause.message : "연결을 확인한 뒤 다시 시도해 주세요." });
      return false;
    } finally {
      claimLock.current = false;
      setClaiming(false);
    }
  }, [state]);

  return { state, refresh, claim, claiming };
}

export type Light = ReturnType<typeof useLight>;
