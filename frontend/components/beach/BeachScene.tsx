"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BeachEngine, webglSupported, type RestState, type StargazingState, type ViewMode } from "@/lib/beach/engine";
import { BeachGone, BeachUnavailable, enterBeach, leaveBeach, tickBeach, addFirewood, setBeachRest, type FireState, type CareEvent, type CareKind, type RemotePlayer, type EnterResponse } from "@/lib/beach/net";
import { hourLabel, hourOverride } from "@/lib/beach/daylight";
import { BEACH_CHARACTERS, characterAfterEntry, characterSkin, savedCharacter, saveCharacter, type BeachCharacter } from "@/lib/beach/appearance";
import { showToast, toastSuccess, tick as haptic } from "@/lib/toast";
import { IconCheck, IconChevronL, IconClose, IconHeart, IconLeaf, IconLock, IconMoon, IconUser, IconUsers } from "@/components/Icons";
import { route } from "@/lib/routes";
import CampfireControls, { type WoodPhase } from "./CampfireControls";
import Joystick from "./Joystick";
import styles from "./beach.module.css";

const CARE_LABEL: Record<CareKind, string> = { comfort: "위로를 건넸어요", hug: "안아 줬어요" };
const TICK_MOVING = 500;
const TICK_IDLE = 1500;
const VIEW_KEY = "beach-view";
const INTRO_VISIBLE_MS = 4000;
const INTRO_FADE_MS = 700;
type SkyPhase = "walking" | "joining" | "standing";

/** 마지막에 고른 시점 (기기별로 기억) */
function savedView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === "third" ? "third" : "first"; } catch { return "first"; }
}

/**
 * 소로우 바닷가 화면. 엔진(lib/beach/engine)이 그리고, 여기서는 서버와 주고받기(enter → tick … → leave)와 HUD 를 맡는다.
 *  - 움직일 땐 0.5초, 서 있으면 1.5초마다 tick. 탭을 숨기면 멈추고, 돌아오면 이어간다 (티켓이 만료됐으면 다시 들어간다)
 *  - 사람을 탭하면 아래에 닉네임과 "위로해주기 · 안아주기". 보낸 건 다음 tick 에 실려 간다
 *  - 받으면 화면 가장자리 빛 + 눈앞 이펙트 + 토스트 + 햅틱
 *  - 터치 기기에선 왼쪽 아래 조이스틱으로 걷고 화면을 끌어 둘러본다. "장작 넣기"는 어디서 눌러도 불 앞까지 알아서 걸어가 넣는다
 */
export default function BeachScene({ communityId }: { communityId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BeachEngine | null>(null);
  const ticketRef = useRef<string | null>(null);
  const meRef = useRef<{ pid: string; id: string; nick: string } | null>(null);
  const pendingCareRef = useRef<{ to: string; nick: string; kind: CareKind } | null>(null);
  const timerRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const failRef = useRef(0);
  const aliveRef = useRef(true);
  const blockedRef = useRef(false);
  const tickRunnerRef = useRef<() => Promise<unknown>>(async () => {});
  const selectedRef = useRef<RemotePlayer | null>(null);
  const fireTimeRef = useRef(0);
  const fireLogsRef = useRef<number | null>(null);
  const characterRef = useRef<BeachCharacter | null>(null);
  const characterPickerRef = useRef<HTMLDivElement>(null);
  const characterTriggerRef = useRef<HTMLButtonElement>(null);
  const characterPickerId = useId();
  const restEnabledRef = useRef(false);
  const restMutationRef = useRef(false);
  const skyBusyRef = useRef<SkyPhase | null>(null);
  const skyOperationRef = useRef(0);
  const woodBusyRef = useRef(false);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(100);
  const [community, setCommunity] = useState<EnterResponse["community"] | null>(null);
  const [selected, setSelected] = useState<RemotePlayer | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [received, setReceived] = useState({ comfort: 0, hug: 0 });
  const [flash, setFlash] = useState<{ kind: CareKind; id: number } | null>(null);
  const [hint, setHint] = useState(false);
  const [intro, setIntro] = useState<"visible" | "leaving" | "hidden">("hidden");
  const [timeLabel, setTimeLabel] = useState("");
  const [lost, setLost] = useState(false);
  const [fire, setFire] = useState<FireState | null>(null);
  const [nearFire, setNearFire] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [view, setView] = useState<ViewMode>("first");
  const [character, setCharacter] = useState<BeachCharacter>("male");
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [restEnabled, setRestEnabled] = useState(false);
  const [stargazing, setStargazing] = useState<StargazingState>({ near: false, lying: false, occupied: 0, capacity: 8 });
  const [skyPhase, setSkyPhase] = useState<SkyPhase | null>(null);
  const [woodBusy, setWoodBusy] = useState(false);
  const [, bump] = useState(0);

  selectedRef.current = selected;

  // Start once the scene is ready; ticket refreshes do not replay the entry copy.
  useEffect(() => {
    if (phase !== "ready") {
      setIntro("hidden");
      setHint(false);
      return;
    }
    setIntro("visible");
    setHint(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeTimer = window.setTimeout(() => setIntro(reducedMotion ? "hidden" : "leaving"), INTRO_VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setIntro("hidden"), INTRO_VISIBLE_MS + INTRO_FADE_MS);
    const hintTimer = window.setTimeout(() => setHint(false), 6000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
      window.clearTimeout(hintTimer);
    };
  }, [phase, communityId]);

  const adoptCharacter = useCallback((me: EnterResponse["me"]): BeachCharacter => {
    // Retain an in-memory choice across ticket expiry even if local storage is blocked.
    const previous = meRef.current && characterRef.current ? { id: meRef.current.id, character: characterRef.current } : null;
    const next = characterAfterEntry(me, previous, savedCharacter(me.id));
    characterRef.current = next;
    setCharacter(next);
    engineRef.current?.setSkin(characterSkin(next));
    return next;
  }, []);

  const controlsPaused = characterPickerOpen || selected !== null || skyPhase === "joining" || skyPhase === "standing";
  useEffect(() => {
    engineRef.current?.setInputPaused(controlsPaused);
  }, [controlsPaused, phase]);

  useEffect(() => {
    if (!selected || characterPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      engineRef.current?.select(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected, characterPickerOpen]);

  useEffect(() => {
    if (!characterPickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !characterPickerRef.current?.contains(event.target)) setCharacterPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setCharacterPickerOpen(false);
      characterTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [characterPickerOpen]);

  const applyFire = useCallback((next: FireState) => {
    if (!aliveRef.current || !next || next.serverTime < fireTimeRef.current) return;
    fireTimeRef.current = next.serverTime;
    // 장작이 늘었으면(내가 넣었든 누가 넣었든) 불이 확 타올랐다가 잦아든다
    if (fireLogsRef.current !== null && next.logs > fireLogsRef.current) engineRef.current?.flareFire();
    fireLogsRef.current = next.logs;
    setFire(next);
    engineRef.current?.setFireState(next);
  }, []);

  const handleEvent = useCallback((ev: CareEvent) => {
    const engine = engineRef.current;
    const me = meRef.current;
    if (!engine || !me) return;
    if (ev.toPid === me.pid) {
      setFlash({ kind: ev.kind, id: ev.at + Math.random() });
      engine.playCare(ev.kind, null);
      haptic(ev.kind === "hug" ? 24 : 12);
      toastSuccess(`${ev.fromNick}님이 ${CARE_LABEL[ev.kind]}`);
    } else if (ev.fromPid !== me.pid) {
      engine.playCare(ev.kind, ev.toPid); // 내가 보낸 건 누를 때 이미 띄웠다
    }
  }, []);

  const scheduleTick = useCallback((delay?: number) => {
    window.clearTimeout(timerRef.current);
    if (!aliveRef.current || blockedRef.current) return;
    const engine = engineRef.current;
    const base = engine?.getSelf().moving ? TICK_MOVING : TICK_IDLE;
    const backoff = failRef.current ? Math.min(6000, 1000 * 2 ** failRef.current) : 0;
    timerRef.current = window.setTimeout(() => void tickRunnerRef.current(), delay ?? Math.max(base, backoff));
  }, []);

  const stopWithError = useCallback((cause: Error) => {
    blockedRef.current = true;
    window.clearTimeout(timerRef.current);
    engineRef.current?.stop();
    if (ticketRef.current) leaveBeach(ticketRef.current);
    ticketRef.current = null;
    setSelected(null);
    setRest(null);
    setCharacterPickerOpen(false);
    skyOperationRef.current++;
    skyBusyRef.current = null;
    restMutationRef.current = false;
    setSkyPhase(null);
    setError(cause.message);
    setPhase("error");
  }, []);

  const reenter = useCallback(async () => {
    // Confirm the session identity before sending any account's saved choice.
    const entered = await enterBeach(communityId);
    if (!aliveRef.current) { leaveBeach(entered.ticket); return; }
    ticketRef.current = entered.ticket;
    adoptCharacter(entered.me);
    meRef.current = entered.me;
    setCount(entered.count);
    setCapacity(entered.capacity);
    setCommunity(entered.community);
    restEnabledRef.current = entered.restEnabled === true;
    setRestEnabled(restEnabledRef.current);
    // A new ticket owns no slot from the previous visit.
    engineRef.current?.applyRest({ pose: "standing", spotId: null, slot: null, ...entered.spawn });
    applyFire(entered.fire);
  }, [communityId, applyFire, adoptCharacter]);

  const runTick = useCallback(async (allowRestSync = false): Promise<boolean> => {
    const engine = engineRef.current;
    const ticket = ticketRef.current;
    if (!aliveRef.current || blockedRef.current || !engine || inFlightRef.current || document.hidden || (restMutationRef.current && !allowRestSync)) return false;
    inFlightRef.current = true;
    if (!ticket) {
      try {
        await reenter();
      } catch (e) {
        inFlightRef.current = false;
        if (!aliveRef.current) return false;
        if (e instanceof BeachUnavailable) { stopWithError(e); return false; }
        failRef.current++;
        setLost(failRef.current >= 2);
        scheduleTick();
        return false;
      }
    }
    if (!aliveRef.current || !ticketRef.current) { inFlightRef.current = false; return false; }
    const self = engine.getSelf();
    const care = pendingCareRef.current;
    pendingCareRef.current = null;
    try {
      const res = await tickBeach({
        ticket: ticketRef.current as string,
        x: Math.round(self.x * 100) / 100,
        z: Math.round(self.z * 100) / 100,
        yaw: Math.round(self.yaw * 1000) / 1000,
        moving: self.moving,
        character: characterRef.current ?? undefined,
        care: care ? { to: care.to, kind: care.kind } : undefined,
      });
      if (!aliveRef.current) return false;
      engine.setPlayers(res.players);
      if (res.selfRest) engine.applyRest(res.selfRest);
      setCount(res.count);
      setReceived(res.received);
      applyFire(res.fire);
      for (const ev of res.events) handleEvent(ev);
      if (care) {
        if (res.care === "sent") toastSuccess(`${care.nick}님에게 ${CARE_LABEL[care.kind]}`);
        else if (res.care === "cooldown") showToast("잠시 뒤에 다시 건넬 수 있어요", { kind: "info" });
        else if (res.care === "gone") {
          showToast(`${care.nick}님은 지금 바닷가에 없어요`, { kind: "info" });
          engine.select(null);
        }
      }
      failRef.current = 0;
      setLost(false);
      return true;
    } catch (e) {
      if (!aliveRef.current) return false;
      if (e instanceof BeachUnavailable) {
        stopWithError(e);
      } else if (e instanceof BeachGone) {
        ticketRef.current = null; // 다음 tick 에서 다시 들어간다
        if (care) pendingCareRef.current = care;
      } else {
        failRef.current++;
        setLost(failRef.current >= 2);
        if (care) pendingCareRef.current = care;
      }
      return false;
    } finally {
      inFlightRef.current = false;
      scheduleTick();
    }
  }, [handleEvent, reenter, scheduleTick, stopWithError, applyFire]);
  tickRunnerRef.current = runTick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    aliveRef.current = true;
    blockedRef.current = false;
    fireTimeRef.current = 0;
    fireLogsRef.current = null;
    if (!communityId) {
      setPhase("error");
      setError("내 소로우에서 함께 쉴 바닷가를 골라 주세요.");
      return;
    }
    if (!webglSupported()) {
      setPhase("error");
      setError("이 기기에서는 바닷가를 그릴 수 없어요. 다른 브라우저로 열어 보세요.");
      return;
    }
    document.body.style.overflow = "hidden";
    let engine: BeachEngine | null = null;
    let cancelled = false; // 개발 모드 StrictMode 가 효과를 두 번 돌려도 첫 입장은 바로 나간다
    (async () => {
      try {
        const entered = await enterBeach(communityId);
        if (cancelled || !aliveRef.current) { leaveBeach(entered.ticket); return; }
        ticketRef.current = entered.ticket;
        const initialCharacter = adoptCharacter(entered.me);
        meRef.current = entered.me;
        setCount(entered.count);
        setCapacity(entered.capacity);
        setCommunity(entered.community);
        restEnabledRef.current = entered.restEnabled === true;
        setRestEnabled(restEnabledRef.current);
        const initialView = savedView();
        setView(initialView);
        engine = new BeachEngine(canvas, {
          bounds: entered.bounds,
          spawn: entered.spawn,
          skin: characterSkin(initialCharacter),
          view: initialView,
          hourOverride: hourOverride(window.location.search),
          handlers: {
            onSelect: (p) => setSelected(p),
            onRestChange: (state) => setRest(state),
            onViewChange: (next) => {
              setView(next);
              try { localStorage.setItem(VIEW_KEY, next); } catch { /* 저장 못 해도 이번 방문엔 적용된다 */ }
            },
            onFireRangeChange: (near) => setNearFire(near),
            onStargazingChange: (state) => setStargazing(state),
          },
        });
        engineRef.current = engine;
        applyFire(entered.fire);
        if (process.env.NODE_ENV !== "production") (window as unknown as { __beach?: BeachEngine }).__beach = engine; // 개발 콘솔에서 들여다보기
        setTimeLabel(hourLabel(engine.daylightNow.hour));
        await engine.whenReady();
        if (cancelled || !aliveRef.current) { engine.dispose(); return; }
        engine.start();
        setPhase("ready");
        scheduleTick(0);
      } catch (e) {
        if (cancelled || !aliveRef.current) return;
        stopWithError(e instanceof Error ? e : new Error("바닷가에 들어가지 못했어요."));
      }
    })();

    const onVisibility = () => {
      const eng = engineRef.current;
      if (!eng || blockedRef.current) return;
      if (document.hidden) {
        eng.stop();
        window.clearTimeout(timerRef.current);
      } else {
        eng.start();
        scheduleTick(0);
      }
    };
    const onResize = () => engineRef.current?.resize();
    const onPageHide = () => { if (ticketRef.current) leaveBeach(ticketRef.current); };
    const clockTimer = window.setInterval(() => { if (engineRef.current) setTimeLabel(hourLabel(engineRef.current.daylightNow.hour)); bump((n) => n + 1); }, 15_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      aliveRef.current = false;
      window.clearTimeout(timerRef.current);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("pagehide", onPageHide);
      document.body.style.overflow = "";
      if (ticketRef.current) leaveBeach(ticketRef.current);
      ticketRef.current = null;
      meRef.current = null;
      characterRef.current = null;
      skyOperationRef.current++;
      skyBusyRef.current = null;
      restMutationRef.current = false;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [communityId, scheduleTick, stopWithError, applyFire, adoptCharacter]);

  const chooseCharacter = (next: BeachCharacter) => {
    const me = meRef.current;
    if (!me || !engineRef.current || blockedRef.current) return;
    characterRef.current = next;
    setCharacter(next);
    saveCharacter(me.id, next);
    engineRef.current.setSkin(characterSkin(next));
    engineRef.current.setView("third");
    setCharacterPickerOpen(false);
    characterTriggerRef.current?.focus();
    haptic();
    scheduleTick(0);
  };

  const toggleStargazing = async () => {
    const engine = engineRef.current;
    if (!engine || !restEnabledRef.current || skyBusyRef.current || woodBusyRef.current || blockedRef.current) return;
    if (!engine.isLying && stargazing.occupied >= stargazing.capacity) return;
    const operation = ++skyOperationRef.current;
    const current = () => aliveRef.current && !blockedRef.current && skyOperationRef.current === operation && engineRef.current === engine;
    const action = engine.isLying ? "stand" : "lie";
    const changePhase = (next: SkyPhase) => {
      skyBusyRef.current = next;
      setSkyPhase(next);
    };
    haptic();
    try {
      if (action === "lie") {
        changePhase("walking");
        const walk = await engine.walkToStargazing();
        if (!current() || walk === "cancelled") return;
        if (walk === "blocked") throw new Error("별빛 자리로 가는 길이 막혔어요. 조금 가까이에서 다시 눌러 주세요.");
      }
      changePhase(action === "lie" ? "joining" : "standing");
      // Regular ticks continue during the walk. Reserve the network lane only now,
      // then drain any older tick before syncing position and claiming/releasing a slot.
      restMutationRef.current = true;
      const waitUntil = performance.now() + 8500;
      while (inFlightRef.current && current()) {
        if (performance.now() >= waitUntil) throw new Error("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.");
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      if (!current()) return;
      if (!ticketRef.current) throw new Error("바닷가에 다시 연결하고 있어요. 잠시 후 다시 눌러 주세요.");
      if (!(await runTick(true))) throw new Error("연결을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.");
      if (!current()) return;
      const ticket = ticketRef.current;
      if (!ticket || !restEnabledRef.current) throw new Error("별빛 자리를 준비하고 있어요. 잠시 후 다시 와 주세요.");
      const confirmed = await setBeachRest(ticket, action);
      if (!current()) return;
      engine.applyRest(confirmed);
      if (confirmed.pose === "lying") engine.setView("first");
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof BeachGone) {
        ticketRef.current = null;
        showToast("바닷가에 다시 연결하고 있어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
      } else if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) {
        stopWithError(cause);
      } else {
        if (cause instanceof BeachUnavailable && cause.status === 404) {
          restEnabledRef.current = false;
          setRestEnabled(false);
        }
        showToast(cause instanceof Error ? cause.message : "자리를 확인하지 못했어요. 다시 시도해 주세요.", { kind: "info" });
      }
    } finally {
      if (skyOperationRef.current === operation) {
        skyBusyRef.current = null;
        restMutationRef.current = false;
        if (aliveRef.current) { setSkyPhase(null); scheduleTick(0); }
      }
    }
  };

  /** 모닥불 앞까지 걸어간 뒤, 새 위치를 서버에 올리고(서버가 거리를 확인한다) 장작을 넣는다 */
  const onAddWood = useCallback(async (requestId: string, phase: (p: WoodPhase) => void) => {
    const engine = engineRef.current;
    if (!engine || blockedRef.current) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
    if (engine.isLying) throw new Error("먼저 일어난 뒤 장작을 넣을 수 있어요.");
    if (skyBusyRef.current || woodBusyRef.current) throw new Error("이동을 마친 뒤 다시 눌러 주세요.");
    woodBusyRef.current = true;
    setWoodBusy(true);
    try {
      phase("walking");
      const walk = await engine.walkToFire();
      if (walk === "cancelled") throw new Error("걸음을 멈춰서 장작을 넣지 못했어요. 다시 눌러 주세요.");
      if (walk === "blocked") throw new Error("모닥불까지 가는 길이 막혔어요. 조금 더 가까이 가서 눌러 주세요.");
      phase("adding");
      while (inFlightRef.current && aliveRef.current) await new Promise((r) => window.setTimeout(r, 40));
      if (!(await runTick())) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      const ticket = ticketRef.current;
      if (!ticket || blockedRef.current) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      return await addFirewood(ticket, requestId);
    } finally {
      woodBusyRef.current = false;
      if (aliveRef.current) setWoodBusy(false);
    }
  }, [runTick]);

  const sendCare = (kind: CareKind) => {
    const target = selectedRef.current;
    if (!target || Date.now() < coolUntil) return;
    pendingCareRef.current = { to: target.id, nick: target.nick, kind };
    setCoolUntil(Date.now() + 3000);
    window.setTimeout(() => bump((n) => n + 1), 3050);
    haptic();
    engineRef.current?.playCare(kind, target.pid); // 내 화면엔 바로, 다른 사람에겐 서버를 거쳐
    scheduleTick(0);
  };

  const cooling = Date.now() < coolUntil;
  const gotAny = received.comfort + received.hug > 0;
  const skyFull = !stargazing.lying && stargazing.occupied >= stargazing.capacity;
  const skyActionLabel = !restEnabled ? "별빛 자리 준비 중" : skyPhase === "walking" ? "별빛 자리로 가는 중…" : skyPhase === "joining" ? "자리 잡는 중…" : skyFull ? "모든 자리가 찼어요" : stargazing.occupied > 0 ? "같이 눕기" : "하늘 보기";
  const returnHref = community ? route(`/c/${community.slug}`) : "/c/home";

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`${community?.name ?? "소로우"}의 프라이빗 바닷가 (${view === "first" ? "1인칭" : "3인칭"})`} />
      {flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.kind]}`} aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}

      <div className={styles.top}>
        <Link href={returnHref} className={styles.glass} aria-label="바닷가 나가기"><IconChevronL />나가기</Link>
        <div className={styles.chips}>
          {timeLabel && <span className={`${styles.glass} ${styles.chip} ${styles.timeChip}`}>{timeLabel}</span>}
          {count !== null && <span className={`${styles.glass} ${styles.chip}`} aria-label={`정원 ${capacity}명 중 지금 ${count}명`}><IconUsers />{count}<span className={styles.capacity}>/ {capacity}</span></span>}
          {phase === "ready" && <div ref={characterPickerRef} className={styles.characterPicker}>
            <button ref={characterTriggerRef} type="button" className={`${styles.glass} ${styles.characterTrigger}`}
              aria-expanded={characterPickerOpen} aria-controls={characterPickerId}
              onClick={() => { haptic(); setCharacterPickerOpen((open) => !open); }}>
              <IconUser />캐릭터
            </button>
            {characterPickerOpen && <div id={characterPickerId} className={styles.characterPanel}>
              <div className={styles.characterPanelHead}>
                <strong>내 캐릭터</strong>
                <button type="button" aria-label="캐릭터 선택 닫기" onClick={() => { setCharacterPickerOpen(false); characterTriggerRef.current?.focus(); }}><IconClose /></button>
              </div>
              <div className={styles.characterChoices} role="group" aria-label="기본 캐릭터 선택">
                {BEACH_CHARACTERS.map((option) => <button key={option.id} type="button" className={styles.characterChoice}
                  aria-pressed={character === option.id} onClick={() => chooseCharacter(option.id)}>
                  <span className={styles.characterSprite} style={{ backgroundPosition: `0 ${-option.skin * 104}px` }} aria-hidden="true" />
                  <span>{option.label}{character === option.id && <IconCheck aria-hidden="true" />}</span>
                </button>)}
              </div>
              <p>고르면 내 모습이 바로 보여요.</p>
            </div>}
          </div>}
        </div>
      </div>

      {community && phase === "ready" && intro !== "hidden" && <div className={`${styles.place} ${intro === "leaving" ? styles.placeLeaving : ""}`} aria-hidden={intro === "leaving"}>
        <span><IconLock />우리만의 프라이빗 해변</span>
        <h1>{community.name} 바닷가</h1>
        <p>웅장한 절벽 아래, 바다를 향한 프라이빗 라운지.</p>
      </div>}

      {phase === "ready" && !selected && !characterPickerOpen && !stargazing.lying && skyPhase !== "joining" && skyPhase !== "standing" && <Joystick onMove={(x, y) => engineRef.current?.setMove(x, y)} />}

      <div className={styles.bottomHud}>
      {lost && phase === "ready" && <div className={styles.lost} role="status">연결이 불안정해요. 다시 이어 보는 중…</div>}
      {phase === "ready" && !stargazing.lying && fire && meRef.current && <CampfireControls
        fire={fire} near={nearFire} disconnected={lost || Boolean(skyPhase) || controlsPaused}
        onAddWood={onAddWood} onFireChange={applyFire}
        view={view} onToggleView={() => engineRef.current?.toggleView()}
      />}
      {phase === "ready" && !selected && !characterPickerOpen && <div className={styles.skyControl} aria-label="별빛 자리" aria-busy={Boolean(skyPhase)}>
        {stargazing.lying ? <>
          <p className={styles.skyTogether}><IconMoon />함께 하늘을 보는 중<span>{stargazing.occupied} / {stargazing.capacity}</span></p>
          <div className={styles.skyActions}>
            <button type="button" className={styles.skyStand} disabled={Boolean(skyPhase) || lost} onClick={() => void toggleStargazing()}>
              {skyPhase === "standing" ? "일어나는 중…" : "일어나기"}
            </button>
            <button type="button" className={styles.skyView} aria-pressed={view === "third"} disabled={Boolean(skyPhase)} onClick={() => engineRef.current?.toggleView()}>
              {view === "third" ? <IconMoon /> : <IconUsers />}{view === "third" ? "하늘 보기" : "모여 보기"}
            </button>
          </div>
        </> : <div className={styles.skyEntry}>
          <button type="button" className={styles.skyGo} disabled={!restEnabled || Boolean(skyPhase) || woodBusy || lost || skyFull} onClick={() => void toggleStargazing()}>
            <span className={styles.skyIcon} aria-hidden="true"><IconMoon /></span>
            <span className={styles.skyCopy}><strong>{skyActionLabel}</strong><small>{!restEnabled ? "잠시 후 함께 쉬어가요" : skyPhase ? "조금만 기다려 주세요" : skyFull ? "자리가 나면 함께 누울 수 있어요" : stargazing.near ? "머리를 맞대고 잠깐 쉬어가요" : "별빛 자리로 걸어가요"}</small></span>
            {restEnabled && <span className={styles.skyCount} aria-label={`${stargazing.capacity}자리 중 ${stargazing.occupied}명`}>{stargazing.occupied}<small>/ {stargazing.capacity}</small></span>}
          </button>
          {skyPhase === "walking" && <button type="button" className={styles.skyCancel} onClick={() => engineRef.current?.cancelAutoWalk()}>멈추기</button>}
        </div>}
      </div>}
      {hint && !lost && !selected && !gotAny && !rest && !stargazing.lying && !skyPhase && phase === "ready" && (
        <p className={styles.hint} role="status">
          <span className={styles.touchHint}>왼쪽 조이스틱으로 걷고, 화면을 끌어 둘러봐요.</span><span className={styles.keyboardHint}>WASD·방향키로 걷고, 화면을 끌어 둘러봐요.</span><br />오두막에 앉아 쉬거나 사람을 눌러 위로를 건네요.
        </p>
      )}

      {phase === "ready" && rest && !stargazing.lying && !skyPhase && (
        <button type="button" className={styles.restButton} onClick={() => engineRef.current?.toggleRest()} aria-keyshortcuts="E">
          <span className={styles.restCopy}>
            <strong>{rest.seated ? "일어나기" : "앉아서 바다 보기"}</strong>
            <small>{rest.seated ? "바다를 바라보며 쉬는 중" : rest.shelterName}</small>
          </span>
          <kbd className={styles.restKey} aria-hidden="true">E</kbd>
        </button>
      )}

      {gotAny && <div className={`${styles.glass} ${styles.received}`} role="status">이번에 받은 위로 {received.comfort} · 포옹 {received.hug}</div>}

      {selected && (
        <div className={styles.panel} role="dialog" aria-label={`${selected.nick}님에게`}>
          <div className={styles.panelHead}>
            <div>
              <strong>{selected.nick}</strong>
              <small>말 대신 마음만 건네요</small>
            </div>
            <button type="button" onClick={() => engineRef.current?.select(null)} aria-label="닫기"><IconClose /></button>
          </div>
          <div className={styles.panelBtns}>
            <button type="button" className={`${styles.careBtn} ${styles.comfort}`} disabled={cooling} onClick={() => sendCare("comfort")}><IconLeaf />위로해주기</button>
            <button type="button" className={`${styles.careBtn} ${styles.hug}`} disabled={cooling} onClick={() => sendCare("hug")}><IconHeart />안아주기</button>
          </div>
        </div>
      )}
      </div>

      {phase === "loading" && (
        <div className={styles.center} role="status" aria-live="polite">
          <p className={styles.loadingDots}>바닷가로 가는 중</p>
          <small>절벽 아래 우리만의 모닥불 곁으로</small>
        </div>
      )}
      {phase === "error" && (
        <div className={styles.center} role="alert">
          <p>{error}</p>
          <Link href={returnHref} className={styles.glass}><IconChevronL />소로우로 돌아가기</Link>
        </div>
      )}
    </div>
  );
}
