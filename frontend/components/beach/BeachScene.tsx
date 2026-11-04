"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BeachEngine, webglSupported, type RestState, type StargazingState, type BedState, type BenchState, type ViewMode } from "@/lib/beach/engine";
import { BeachGone, BeachUnavailable, enterBeach, leaveBeach, tickBeach, addFirewood, addFirePowder, setBeachRest, type FireState, type PowderColor, type CareEvent, type CareKind, type RemotePlayer, type EnterResponse } from "@/lib/beach/net";
import { hourLabel, hourOverride } from "@/lib/beach/daylight";
import { BEACH_CHARACTERS, characterAfterEntry, characterSkin, savedCharacter, saveCharacter, type BeachCharacter } from "@/lib/beach/appearance";
import { createBeachPhoto, type BeachPhoto } from "@/lib/beach/photo";
import { showToast, toastSuccess, tick as haptic } from "@/lib/toast";
import { IconCheck, IconChevronL, IconClose, IconHeart, IconLeaf, IconLock, IconMoon, IconUser, IconUsers, IconSparkle, IconSmile } from "@/components/Icons";
import { route } from "@/lib/routes";
import CampfireControls, { type WoodPhase } from "./CampfireControls";
import Joystick from "./Joystick";
import PhotoPreview, { CameraIcon } from "./PhotoPreview";
import styles from "./beach.module.css";

const CARE_LABEL: Record<CareKind, string> = { comfort: "위로를 건넸어요", hug: "안아 줬어요", wave: "인사를 건넸어요" };
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
  const careBusyRef = useRef(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerRef = useRef<HTMLButtonElement>(null);
  const actionTrayId = useId();
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
  const bedEnabledRef = useRef(false);
  const benchEnabledRef = useRef(false);
  const benchActionRef = useRef<() => void>(() => {});
  const captureBusyRef = useRef(false);
  const cameraTriggerRef = useRef<HTMLButtonElement>(null);
  const photoFocusFrameRef = useRef(0);
  const restMutationRef = useRef(false);
  const skyBusyRef = useRef<SkyPhase | null>(null);
  const skyOperationRef = useRef(0);
  const woodBusyRef = useRef(false);
  const powderBusyRef = useRef(false);
  const controlsPausedRef = useRef(false);
  const visitGenerationRef = useRef(0);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(100);
  const [community, setCommunity] = useState<EnterResponse["community"] | null>(null);
  const [selected, setSelected] = useState<RemotePlayer | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [received, setReceived] = useState<{ comfort: number; hug: number; wave?: number }>({ comfort: 0, hug: 0, wave: 0 });
  const [careCapabilities, setCareCapabilities] = useState({ wave: false, hug: false });
  const [careBusy, setCareBusy] = useState(false);
  const [people, setPeople] = useState<RemotePlayer[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);
  const [carePrompt, setCarePrompt] = useState<CareKind | null>(null);
  const [flash, setFlash] = useState<{ kind: CareKind; id: number } | null>(null);
  const [hint, setHint] = useState(false);
  const [intro, setIntro] = useState<"visible" | "leaving" | "hidden">("hidden");
  const [timeLabel, setTimeLabel] = useState("");
  const [nightControls, setNightControls] = useState(false);
  const [lost, setLost] = useState(false);
  const [fire, setFire] = useState<FireState | null>(null);
  const [nearFire, setNearFire] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [view, setView] = useState<ViewMode>("first");
  const [character, setCharacter] = useState<BeachCharacter>("male");
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [restEnabled, setRestEnabled] = useState(false);
  const [bedEnabled, setBedEnabled] = useState(false);
  const [bed, setBed] = useState<BedState | null>(null);
  const [benchEnabled, setBenchEnabled] = useState(false);
  const [bench, setBench] = useState<BenchState>({ near: false, seated: false, occupied: 0, capacity: 12, available: false });
  const [photo, setPhoto] = useState<BeachPhoto | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [stargazing, setStargazing] = useState<StargazingState>({ near: false, lying: false, occupied: 0, capacity: 8 });
  const [skyPhase, setSkyPhase] = useState<SkyPhase | null>(null);
  const [restActionSpot, setRestActionSpot] = useState<string | null>(null);
  const [woodBusy, setWoodBusy] = useState(false);
  const [powderPhase, setPowderPhase] = useState<WoodPhase | null>(null);
  const [powderOpen, setPowderOpen] = useState(false);
  const [, bump] = useState(0);

  selectedRef.current = selected;
  const lying = stargazing.lying || Boolean(bed?.lying);

  useEffect(() => () => photo?.dispose(), [photo]);
  useEffect(() => () => window.cancelAnimationFrame(photoFocusFrameRef.current), []);

  const closePhoto = useCallback(() => {
    const visit = visitGenerationRef.current;
    setPhoto(null);
    window.cancelAnimationFrame(photoFocusFrameRef.current);
    // The preview makes the world inert; restore focus after that attribute is removed.
    photoFocusFrameRef.current = window.requestAnimationFrame(() => {
      if (aliveRef.current && !blockedRef.current && visitGenerationRef.current === visit && cameraTriggerRef.current?.isConnected) {
        cameraTriggerRef.current.focus({ preventScroll: true });
      }
    });
  }, []);

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

  const controlsPaused = Boolean(photo) || characterPickerOpen || (!hudHidden && selected !== null) || powderOpen || powderPhase === "adding" || skyPhase === "joining" || skyPhase === "standing";
  useEffect(() => {
    engineRef.current?.setInputPaused(controlsPaused);
    controlsPausedRef.current = controlsPaused;
  }, [controlsPaused, phase]);

  useEffect(() => { if (lying || !nearFire) setPowderOpen(false); }, [lying, nearFire]);

  useEffect(() => {
    if (!actionsOpen || photo || powderOpen || characterPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setActionsOpen(false);
      setCarePrompt(null);
      engineRef.current?.select(null);
      actionsTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionsOpen, photo, powderOpen, characterPickerOpen]);

  useEffect(() => {
    if (!selected || characterPickerOpen || photo || powderOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      engineRef.current?.select(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected, characterPickerOpen, photo, powderOpen]);

  useEffect(() => {
    if (!characterPickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !characterPickerRef.current?.contains(event.target) && !characterTriggerRef.current?.contains(event.target)) setCharacterPickerOpen(false);
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
    engine.playCare(ev.kind, ev.toPid === me.pid ? null : ev.toPid, ev.fromPid === me.pid ? null : ev.fromPid);
    if (ev.toPid === me.pid) {
      setFlash({ kind: ev.kind, id: ev.at + Math.random() });
      haptic(ev.kind === "hug" ? 24 : 12);
      toastSuccess(`${ev.fromNick}님이 ${CARE_LABEL[ev.kind]}`);
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
    setPowderOpen(false);
    setPhoto(null);
    pendingCareRef.current = null;
    careBusyRef.current = false;
    setCareBusy(false);
    skyOperationRef.current++;
    skyBusyRef.current = null;
    restMutationRef.current = false;
    setSkyPhase(null);
    setRestActionSpot(null);
    setError(cause.message);
    setPhase("error");
  }, []);

  const reenter = useCallback(async (engine: BeachEngine, visit: number): Promise<boolean> => {
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit;
    if (!belongsToVisit() || blockedRef.current) return false;
    // Confirm the session identity before sending any account's saved choice.
    const entered = await enterBeach(communityId);
    if (!belongsToVisit() || blockedRef.current) { leaveBeach(entered.ticket); return false; }
    if (meRef.current?.id !== entered.me.id) {
      pendingCareRef.current = null;
      careBusyRef.current = false;
      setCareBusy(false);
      engine.select(null);
    }
    ticketRef.current = entered.ticket;
    adoptCharacter(entered.me);
    meRef.current = entered.me;
    setCareCapabilities({ wave: entered.careCapabilities?.wave === true, hug: entered.careCapabilities?.hug === true });
    setCount(entered.count);
    setCapacity(entered.capacity);
    setCommunity(entered.community);
    restEnabledRef.current = entered.restEnabled === true;
    setRestEnabled(restEnabledRef.current);
    bedEnabledRef.current = entered.bedEnabled === true;
    setBedEnabled(bedEnabledRef.current);
    benchEnabledRef.current = entered.benchEnabled === true;
    setBenchEnabled(benchEnabledRef.current);
    // A new ticket owns no slot from the previous visit.
    engine.applyRest({ pose: "standing", spotId: null, slot: null, ...entered.spawn });
    applyFire(entered.fire);
    return true;
  }, [communityId, applyFire, adoptCharacter]);

  const runTick = useCallback(async (allowRestSync = false): Promise<boolean> => {
    const engine = engineRef.current;
    const ticket = ticketRef.current;
    if (!aliveRef.current || blockedRef.current || !engine || inFlightRef.current || document.hidden || (restMutationRef.current && !allowRestSync)) return false;
    const visit = visitGenerationRef.current;
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit;
    inFlightRef.current = true;
    if (!ticket) {
      try {
        if (!(await reenter(engine, visit))) {
          if (belongsToVisit()) inFlightRef.current = false;
          return false;
        }
      } catch (e) {
        if (!belongsToVisit()) return false;
        inFlightRef.current = false;
        if (blockedRef.current) return false;
        if (e instanceof BeachUnavailable) { stopWithError(e); return false; }
        failRef.current++;
        setLost(failRef.current >= 2);
        scheduleTick();
        return false;
      }
    }
    if (!belongsToVisit()) return false;
    if (blockedRef.current || !ticketRef.current) { inFlightRef.current = false; return false; }
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
      if (!belongsToVisit() || blockedRef.current) return false;
      engine.setPlayers(res.players);
      setPeople(res.players);
      if (res.careCapabilities) setCareCapabilities({ wave: res.careCapabilities.wave === true, hug: res.careCapabilities.hug === true });
      if (res.selfRest) engine.applyRest(res.selfRest);
      setCount(res.count);
      setReceived(res.received);
      applyFire(res.fire);
      for (const ev of res.events) handleEvent(ev);
      if (care) {
        careBusyRef.current = false;
        setCareBusy(false);
        if (res.care === "sent") toastSuccess(`${care.nick}님에게 ${CARE_LABEL[care.kind]}`);
        else if (res.care === "cooldown") showToast("잠시 뒤에 다시 건넬 수 있어요", { kind: "info" });
        else if (res.care === "gone") {
          showToast(`${care.nick}님은 지금 바닷가에 없어요`, { kind: "info" });
          engine.select(null);
        } else if (res.care === "forbidden") {
          setCoolUntil(0);
          if (care.kind === "hug") setCareCapabilities((caps) => ({ ...caps, hug: false }));
          showToast(care.kind === "hug" ? "포옹은 관리자만 건넬 수 있어요. 인사나 위로를 건네 보세요." : "현재 입장 정보를 확인하지 못했어요. 바닷가에 다시 들어와 주세요.", { kind: "info" });
        }
      }
      failRef.current = 0;
      setLost(false);
      return true;
    } catch (e) {
      if (!belongsToVisit() || blockedRef.current) return false;
      if (e instanceof BeachUnavailable) {
        stopWithError(e);
      } else if (e instanceof BeachGone) {
        ticketRef.current = null; // 다음 tick 에서 다시 들어간다
        if (care) pendingCareRef.current = care;
      } else {
        failRef.current++;
        setLost(failRef.current >= 2);
        if (care) {
          // A lost response may already have delivered this action. Never replay it automatically.
          pendingCareRef.current = null;
          careBusyRef.current = false;
          setCareBusy(false);
          showToast("전달 여부를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
        }
      }
      return false;
    } finally {
      if (belongsToVisit()) {
        inFlightRef.current = false;
        scheduleTick();
      }
    }
  }, [handleEvent, reenter, scheduleTick, stopWithError, applyFire]);
  tickRunnerRef.current = runTick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    visitGenerationRef.current++;
    aliveRef.current = true;
    blockedRef.current = false;
    inFlightRef.current = false;
    failRef.current = 0;
    pendingCareRef.current = null;
    careBusyRef.current = false;
    setCareBusy(false);
    setPeople([]);
    setCareCapabilities({ wave: false, hug: false });
    setLost(false);
    woodBusyRef.current = false;
    powderBusyRef.current = false;
    restMutationRef.current = false;
    setWoodBusy(false);
    setPowderPhase(null);
    setPowderOpen(false);
    captureBusyRef.current = false;
    setCapturing(false);
    setPhoto(null);
    setBed(null);
    setBench({ near: false, seated: false, occupied: 0, capacity: 12, available: false });
    setRestActionSpot(null);
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
        setCareCapabilities({ wave: entered.careCapabilities?.wave === true, hug: entered.careCapabilities?.hug === true });
        setCount(entered.count);
        setCapacity(entered.capacity);
        setCommunity(entered.community);
        restEnabledRef.current = entered.restEnabled === true;
        setRestEnabled(restEnabledRef.current);
        bedEnabledRef.current = entered.bedEnabled === true;
        setBedEnabled(bedEnabledRef.current);
        benchEnabledRef.current = entered.benchEnabled === true;
        setBenchEnabled(benchEnabledRef.current);
        const initialView = savedView();
        setView(initialView);
        engine = new BeachEngine(canvas, {
          bounds: entered.bounds,
          spawn: entered.spawn,
          skin: characterSkin(initialCharacter),
          view: initialView,
          hourOverride: hourOverride(window.location.search),
          handlers: {
            onSelect: (p) => { setSelected(p); if (p) { setActionsOpen(true); setCarePrompt(null); } },
            onRestChange: (state) => setRest(state),
            onViewChange: (next) => {
              setView(next);
              try { localStorage.setItem(VIEW_KEY, next); } catch { /* 저장 못 해도 이번 방문엔 적용된다 */ }
            },
            onFireRangeChange: (near) => setNearFire(near),
            onStargazingChange: (state) => setStargazing(state),
            onBedChange: (state) => setBed(state),
            onBenchChange: (state) => setBench(state),
            onBenchAction: () => benchActionRef.current(),
          },
        });
        engineRef.current = engine;
        applyFire(entered.fire);
        if (process.env.NODE_ENV !== "production") (window as unknown as { __beach?: BeachEngine }).__beach = engine; // 개발 콘솔에서 들여다보기
        setTimeLabel(hourLabel(engine.daylightNow.hour));
        setNightControls(engine.daylightNow.deepNight > 0.5);
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
    const clockTimer = window.setInterval(() => {
      if (engineRef.current) {
        setTimeLabel(hourLabel(engineRef.current.daylightNow.hour));
        setNightControls(engineRef.current.daylightNow.deepNight > 0.5);
      }
      bump((n) => n + 1);
    }, 15_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      visitGenerationRef.current++;
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

  const resumeForAction = async (engine: BeachEngine, current: () => boolean) => {
    engine.select(null);
    setCarePrompt(null);
    const waitUntil = performance.now() + 1000;
    while (controlsPausedRef.current && current()) {
      if (performance.now() >= waitUntil) throw new Error("열린 화면을 닫은 뒤 다시 눌러 주세요.");
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
  };

  const takePhoto = async () => {
    const engine = engineRef.current;
    if (!engine || phase !== "ready" || captureBusyRef.current || skyBusyRef.current || woodBusyRef.current || powderBusyRef.current || blockedRef.current) return;
    const visit = visitGenerationRef.current;
    const current = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && !blockedRef.current;
    captureBusyRef.current = true;
    setCapturing(true);
    setCharacterPickerOpen(false);
    try {
      const blob = await engine.capturePhoto();
      if (!current()) return;
      setPhoto(createBeachPhoto(blob));
      haptic();
    } catch (cause) {
      if (current()) showToast(cause instanceof Error ? cause.message : "사진을 담지 못했어요. 다시 찍어 주세요.", { kind: "info" });
    } finally {
      if (current()) { captureBusyRef.current = false; setCapturing(false); }
    }
  };

  const toggleStargazing = async (spotId = "starlight") => {
    const engine = engineRef.current;
    const isBench = spotId === "fire-benches";
    const isBed = !isBench && spotId !== "starlight";
    const enabled = () => isBench ? benchEnabledRef.current : isBed ? bedEnabledRef.current : restEnabledRef.current;
    if (!engine || !enabled() || skyBusyRef.current || woodBusyRef.current || powderBusyRef.current || blockedRef.current) return;
    if ((engine.isBenchSeated && !isBench) || (engine.isLying && isBench)) {
      showToast("다른 자리로 가려면 먼저 일어나 주세요.", { kind: "info" });
      return;
    }
    if (isBench && !engine.isBenchSeated) {
      const nearby = engine.getBenchState();
      if (!nearby.near || !nearby.available) {
        showToast(nearby.near ? "가까운 자리가 찼어요. 다른 벤치 쪽으로 가 주세요." : "모닥불 벤치 가까이에서 앉을 수 있어요.", { kind: "info" });
        return;
      }
    }
    const destination = isBench ? engine.getBenchState() : isBed ? engine.getBedState() : stargazing;
    if (!engine.isLying && !engine.isBenchSeated && (!destination || destination.occupied >= destination.capacity)) return;
    const operation = ++skyOperationRef.current;
    const visit = visitGenerationRef.current;
    const actor = meRef.current?.id;
    const current = () => aliveRef.current && !blockedRef.current && skyOperationRef.current === operation && engineRef.current === engine && visitGenerationRef.current === visit;
    const action = engine.isLying || engine.isBenchSeated ? "stand" : isBench ? "sit" : "lie";
    setRestActionSpot(spotId);
    engine.select(null);
    setCarePrompt(null);
    const changePhase = (next: SkyPhase) => {
      skyBusyRef.current = next;
      setSkyPhase(next);
    };
    haptic();
    try {
      if (action === "lie") {
        changePhase("walking");
        await resumeForAction(engine, current);
        if (!current()) return;
        const walk = await (isBed ? engine.walkToBed(spotId) : engine.walkToStargazing());
        if (!current() || walk === "cancelled") return;
        if (walk === "blocked") throw new Error("쉬어갈 자리로 가는 길이 막혔어요. 조금 가까이에서 다시 눌러 주세요.");
      }
      changePhase(action === "stand" ? "standing" : "joining");
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
      if (!ticket || !enabled() || meRef.current?.id !== actor) throw new Error("쉬어갈 자리를 준비하고 있어요. 잠시 후 다시 눌러 주세요.");
      const confirmed = await setBeachRest(ticket, action, spotId);
      if (!current() || meRef.current?.id !== actor) return;
      engine.applyRest(confirmed);
      if (confirmed.pose === "lying") engine.setView("third");
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof BeachGone) {
        ticketRef.current = null;
        showToast("바닷가에 다시 연결하고 있어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
      } else if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) {
        stopWithError(cause);
      } else {
        if (cause instanceof BeachUnavailable && cause.status === 404) {
          if (isBench) { benchEnabledRef.current = false; setBenchEnabled(false); }
          else if (isBed) { bedEnabledRef.current = false; setBedEnabled(false); }
          else { restEnabledRef.current = false; setRestEnabled(false); }
        }
        showToast(cause instanceof Error ? cause.message : "자리를 확인하지 못했어요. 다시 시도해 주세요.", { kind: "info" });
      }
    } finally {
      if (skyOperationRef.current === operation) {
        skyBusyRef.current = null;
        restMutationRef.current = false;
        if (aliveRef.current) { setSkyPhase(null); setRestActionSpot(null); scheduleTick(0); }
      }
    }
  };
  benchActionRef.current = () => { void toggleStargazing("fire-benches"); };

  /** 모닥불 앞까지 걸어간 뒤, 새 위치를 서버에 올리고(서버가 거리를 확인한다) 장작을 넣는다 */
  const onAddWood = useCallback(async (requestId: string, phase: (p: WoodPhase) => void) => {
    const engine = engineRef.current;
    if (!engine || blockedRef.current) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
    if (engine.isLying) throw new Error("먼저 일어난 뒤 장작을 넣을 수 있어요.");
    if (skyBusyRef.current || woodBusyRef.current || powderBusyRef.current) throw new Error("이동을 마친 뒤 다시 눌러 주세요.");
    const actorId = meRef.current?.id;
    const visit = visitGenerationRef.current;
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit;
    woodBusyRef.current = true;
    setWoodBusy(true);
    try {
      await resumeForAction(engine, () => belongsToVisit() && !blockedRef.current);
      if (!belongsToVisit() || blockedRef.current) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      if (!engine.isBenchSeated) phase("walking");
      const walk = engine.isBenchSeated ? "arrived" : await engine.walkToFire();
      if (!belongsToVisit() || blockedRef.current) throw new Error("바닷가를 옮겼어요. 다시 눌러 주세요.");
      if (walk === "cancelled") throw new Error("걸음을 멈춰서 장작을 넣지 못했어요. 다시 눌러 주세요.");
      if (walk === "blocked") throw new Error("모닥불까지 가는 길이 막혔어요. 조금 더 가까이 가서 눌러 주세요.");
      phase("adding");
      restMutationRef.current = true;
      const waitUntil = performance.now() + 8500;
      while (inFlightRef.current && belongsToVisit() && !blockedRef.current) {
        if (performance.now() >= waitUntil) throw new Error("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.");
        await new Promise((r) => window.setTimeout(r, 40));
      }
      if (!belongsToVisit() || blockedRef.current || !ticketRef.current || !(await runTick(true))) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      const ticket = ticketRef.current;
      if (!ticket || !belongsToVisit() || blockedRef.current || meRef.current?.id !== actorId) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      const confirmed = await addFirewood(ticket, requestId);
      if (!belongsToVisit() || blockedRef.current || meRef.current?.id !== actorId) throw new Error("바닷가를 옮겼어요. 다시 눌러 주세요.");
      return confirmed;
    } catch (cause) {
      if (belongsToVisit()) {
        if (cause instanceof BeachGone) ticketRef.current = null;
        if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) stopWithError(cause);
      }
      throw cause;
    } finally {
      if (belongsToVisit()) {
        restMutationRef.current = false;
        woodBusyRef.current = false;
        setWoodBusy(false); scheduleTick(0);
      }
    }
  }, [runTick, scheduleTick, stopWithError]);

  const onAddPowder = useCallback(async (requestId: string, color: PowderColor, phase: (p: WoodPhase) => void) => {
    const engine = engineRef.current;
    if (!engine || blockedRef.current || engine.isLying) throw new Error("먼저 일어난 뒤 가루를 넣을 수 있어요.");
    if (skyBusyRef.current || woodBusyRef.current || powderBusyRef.current) throw new Error("이동을 마친 뒤 다시 눌러 주세요.");
    const actorId = meRef.current?.id;
    const visit = visitGenerationRef.current;
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit;
    powderBusyRef.current = true;
    setPowderPhase("walking");
    setPowderOpen(false);
    try {
      engine.select(null);
      setCarePrompt(null);
      // Sheet cleanup and the single input-pause effect must finish before auto-walk.
      const resumeUntil = performance.now() + 1000;
      while (controlsPausedRef.current && belongsToVisit() && !blockedRef.current) {
        if (performance.now() >= resumeUntil) throw new Error("열린 화면을 닫은 뒤 다시 눌러 주세요.");
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
      if (!belongsToVisit() || blockedRef.current) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      if (!engine.isBenchSeated) phase("walking");
      const walk = engine.isBenchSeated ? "arrived" : await engine.walkToFire();
      if (!belongsToVisit() || blockedRef.current) throw new Error("바닷가를 옮겼어요. 다시 눌러 주세요.");
      if (walk === "cancelled") throw new Error("걸음을 멈췄어요. 준비되면 다시 넣어 주세요.");
      if (walk === "blocked") throw new Error("불 곁으로 가는 길이 막혔어요. 조금 가까이에서 다시 눌러 주세요.");
      restMutationRef.current = true;
      const waitUntil = performance.now() + 8500;
      while (inFlightRef.current && belongsToVisit() && !blockedRef.current) {
        if (performance.now() >= waitUntil) throw new Error("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.");
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      if (!belongsToVisit() || blockedRef.current || !ticketRef.current || !(await runTick(true))) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      const ticket = ticketRef.current;
      if (!ticket || !belongsToVisit() || blockedRef.current || engine.isLying || meRef.current?.id !== actorId) throw new Error("바닷가 연결을 확인한 뒤 다시 넣어 주세요.");
      setPowderPhase("adding");
      phase("adding");
      const confirmed = await addFirePowder(ticket, requestId, color);
      if (!belongsToVisit() || blockedRef.current || meRef.current?.id !== actorId) throw new Error("바닷가를 옮겼어요. 다시 눌러 주세요.");
      return confirmed;
    } catch (cause) {
      if (belongsToVisit()) {
        if (cause instanceof BeachGone) ticketRef.current = null;
        if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) stopWithError(cause);
      }
      throw cause;
    } finally {
      if (belongsToVisit()) {
        restMutationRef.current = false;
        powderBusyRef.current = false;
        setPowderPhase(null); scheduleTick(0);
      }
    }
  }, [runTick, scheduleTick, stopWithError]);

  const sendCare = (kind: CareKind) => {
    if (careBusyRef.current || (kind === "hug" && !careCapabilities.hug) || (kind === "wave" && !careCapabilities.wave)) return;
    const target = selectedRef.current;
    if (!target) { setCarePrompt(kind); setActionsOpen(true); haptic(); return; }
    if (Date.now() < coolUntil) return;
    careBusyRef.current = true;
    setCareBusy(true);
    pendingCareRef.current = { to: target.id, nick: target.nick, kind };
    setCoolUntil(Date.now() + 3000);
    window.setTimeout(() => bump((n) => n + 1), 3050);
    haptic();
    scheduleTick(0);
  };

  const cooling = Date.now() < coolUntil || careBusy;
  const gotAny = received.comfort + received.hug + (received.wave ?? 0) > 0;
  const activeBed = stargazing.lying ? null : bed;
  const restArea = activeBed ?? stargazing;
  const areaEnabled = activeBed ? bedEnabled : restEnabled;
  const areaSpot = activeBed?.spotId ?? "starlight";
  const skyFull = !lying && restArea.occupied >= restArea.capacity;
  const returnHref = community ? route(`/c/${community.slug}`) : "/c/home";
  const hideHud = () => { setHudHidden(true); setCharacterPickerOpen(false); setPowderOpen(false); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); haptic(); window.requestAnimationFrame(() => restoreTriggerRef.current?.focus()); };
  const restoreHud = () => { setHudHidden(false); haptic(); window.requestAnimationFrame(() => actionsTriggerRef.current?.focus()); };
  const viewLabel = lying ? view === "third" ? activeBed ? "바다 보기" : "하늘 보기" : activeBed ? "함께 보기" : "모여 보기" : view === "third" ? "내 눈으로" : "캐릭터 보기";
  const benchPhase = restActionSpot === "fire-benches" ? skyPhase : null;
  const benchContextVisible = bench.near || bench.seated || Boolean(benchPhase);
  const restContextVisible = !bench.seated && (lying || (Boolean(skyPhase) && !benchPhase) || Boolean(activeBed?.near) || stargazing.near);
  const walking = skyPhase === "walking" || (!bench.seated && (woodBusy || powderPhase === "walking"));
  const contextVisible = restContextVisible || benchContextVisible || Boolean(rest) || walking;
  const fireContextVisible = nearFire && !lying && !characterPickerOpen && Boolean(fire && meRef.current);

  return (
    <div className={styles.root} data-night={nightControls} inert={Boolean(photo)}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`${community?.name ?? "소로우"}의 프라이빗 바닷가 (${view === "first" ? "1인칭" : "3인칭"})`} />
      {flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.kind]}`} aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}

      <div className={styles.top} hidden={hudHidden}>
        <Link href={returnHref} className={styles.glass + " " + styles.exitButton} aria-label="바닷가 나가기"><IconChevronL />나가기</Link>
      </div>
      <div className={styles.statusBar} hidden={hudHidden}>
        {timeLabel && <span className={styles.glass + " " + styles.chip}>{timeLabel}</span>}
        {count !== null && <span className={styles.glass + " " + styles.chip} aria-label={`정원 ${capacity}명 중 지금 ${count}명`}><IconUsers />{count}<span className={styles.capacity}>/ {capacity}</span></span>}
      </div>

      {community && !hudHidden && phase === "ready" && intro !== "hidden" && <div className={`${styles.place} ${intro === "leaving" ? styles.placeLeaving : ""}`} aria-hidden={intro === "leaving"}>
        <span><IconLock />우리만의 프라이빗 해변</span>
        <h1>{community.name} 바닷가</h1>
        <p>하얀 모래와 파도 곁에서 쉬어가요.</p>
      </div>}

      {phase === "ready" && !photo && (!actionsOpen || hudHidden) && (!selected || hudHidden) && !characterPickerOpen && !powderOpen && powderPhase !== "adding" && !lying && !bench.seated && skyPhase !== "joining" && skyPhase !== "standing" && <Joystick onMove={(x, y) => engineRef.current?.setMove(x, y)} />}

      <div className={styles.bottomHud} hidden={hudHidden || phase !== "ready" || Boolean(photo)}>
        {lost && <p className={styles.dockNotice} role="status">연결을 다시 이어 보는 중…</p>}
        {!actionsOpen && (skyPhase || woodBusy || powderPhase) && <p className={styles.dockNotice} role="status">잠깐만요, 행동을 마치고 있어요.</p>}
        {hint && !actionsOpen && !selected && !lost && !lying && !bench.seated && <p className={styles.dockHint}>걷고, 둘러보고, 행동을 골라 함께 쉬어요.</p>}
        <section id={actionTrayId} className={styles.actionTray} hidden={!actionsOpen} aria-label="바닷가 행동">
          <div className={styles.trayHeader}>
            <div className={styles.trayHeading}>
              <strong>{carePrompt ? "마음을 건넬 사람을 골라요" : selected ? selected.nick + "님에게" : "무엇을 해볼까요?"}</strong>
              <small>{careBusy ? "마음을 전하는 중…" : carePrompt ? "직접 고르거나 화면 속 사람을 눌러요" : selected ? "인사와 작은 마음을 건네요" : lying ? "편안히 누워 쉬는 중" : bench.seated ? "모닥불 곁에 앉아 쉬는 중" : "옆으로 넘겨 더 골라요"}</small>
            </div>
            {selected && !carePrompt && <button type="button" className={styles.traySmallButton} onClick={() => { engineRef.current?.select(null); setCarePrompt("wave"); }} aria-label="다른 사람 고르기"><IconUsers /></button>}
            <button type="button" className={styles.traySmallButton} aria-label={carePrompt ? "사람 고르기 닫기" : "행동 접기"} onClick={() => { if (carePrompt) setCarePrompt(null); else { setActionsOpen(false); engineRef.current?.select(null); actionsTriggerRef.current?.focus(); } }}><IconClose /></button>
          </div>
          {carePrompt && <div className={styles.peopleRow} role="group" aria-label="마음을 건넬 사람">
            {people.length ? people.map((person) => <button type="button" key={person.pid} className={styles.personChoice} onClick={() => engineRef.current?.select(person.pid)}><IconUser /><span>{person.nick}</span><small>선택하기</small></button>) : <p className={styles.emptyPeople}>아직 함께 쉬는 사람이 없어요.<br />누군가 오면 인사를 건네 보세요.</p>}
          </div>}
          <div className={styles.actionScroll} hidden={Boolean(carePrompt)} role="group" aria-label="할 수 있는 행동" tabIndex={0}>
            <button type="button" className={styles.actionTile + " " + styles.waveTile} disabled={cooling || lost || !careCapabilities.wave} onClick={() => sendCare("wave")}><span className={styles.actionIcon} aria-hidden="true">👋</span><strong>인사하기</strong><small>{careCapabilities.wave ? "반가운 마음" : "준비 중"}</small></button>
            <button type="button" className={styles.actionTile + " " + styles.comfortTile} disabled={cooling || lost} onClick={() => sendCare("comfort")}><span className={styles.actionIcon}><IconLeaf /></span><strong>위로 건네기</strong><small>따뜻한 마음</small></button>
            {careCapabilities.hug && <button type="button" className={styles.actionTile + " " + styles.hugTile} disabled={cooling || lost} onClick={() => sendCare("hug")}><span className={styles.actionIcon}><IconHeart /></span><strong>안아주기</strong><small>관리자 포옹</small></button>}
          </div>
          {gotAny && !carePrompt && <p className={styles.receivedMini}>받은 인사 {received.wave ?? 0} · 위로 {received.comfort} · 포옹 {received.hug}</p>}
        </section>
        {contextVisible && !characterPickerOpen && !powderOpen && <div className={styles.contextActions} aria-label="가까운 자리에서 쉬기">
          {lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "first"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}>
            <span className={styles.contextIcon}>{view === "third" ? <IconMoon /> : <IconUsers />}</span>
            <span className={styles.contextCopy}><strong>{viewLabel}</strong><small>{view === "third" ? activeBed ? "누운 채 바다를 바라봐요" : "편안히 누워 하늘을 바라봐요" : "함께 쉬는 모습을 바라봐요"}</small></span>
          </button>}
          {benchContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!bench.seated && (!benchEnabled || !bench.available))} aria-pressed={bench.seated} aria-keyshortcuts="E" onClick={() => void toggleStargazing("fire-benches")}>
            <span className={styles.contextIcon}><IconSmile /></span>
            <span className={styles.contextCopy}><strong>{benchPhase === "standing" ? "일어나는 중…" : bench.seated ? "벤치에서 일어나기" : benchPhase === "joining" ? "자리 잡는 중…" : !bench.available ? "가까운 자리가 찼어요" : "모닥불 벤치에 앉기"}</strong><small>{bench.seated ? "모닥불을 바라보며 쉬는 중" : !benchEnabled ? "앉을 자리를 준비하고 있어요" : !bench.available ? "다른 벤치 쪽으로 가 주세요" : "따뜻한 불 곁에서 함께 쉬어요"}</small></span>
            <span className={styles.contextCount} aria-label={`벤치 12석 중 ${bench.occupied}석 사용 중`}>{bench.occupied}/{bench.capacity}</span>
          </button>}
          {restContextVisible && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!lying && (!areaEnabled || skyFull))} onClick={() => void toggleStargazing(areaSpot)}>
            <span className={styles.contextIcon}><IconMoon /></span>
            <span className={styles.contextCopy}><strong>{skyPhase === "standing" ? "일어나는 중…" : lying ? "일어나기" : skyPhase === "walking" ? "자리로 가는 중…" : skyPhase === "joining" ? "자리 잡는 중…" : activeBed ? "이불 덮고 눕기" : skyFull ? "모든 자리가 찼어요" : "같이 눕기"}</strong><small>{lying ? activeBed ? "포근한 이불 속에서 쉬는 중" : "함께 하늘을 보는 중" : !areaEnabled ? "쉬어갈 자리를 준비하고 있어요" : activeBed ? activeBed.shelterName : "별빛 자리에서 쉬어가요"}</small></span>
            <span className={styles.contextCount}>{restArea.occupied}/{restArea.capacity}</span>
          </button>}
          {rest && !lying && !bench.seated && !skyPhase && <button type="button" className={styles.contextButton} disabled={woodBusy || Boolean(powderPhase)} onClick={() => { engineRef.current?.select(null); engineRef.current?.toggleRest(); }}><span className={styles.contextIcon}><IconSmile /></span><span className={styles.contextCopy}><strong>{rest.seated ? "앉은 자리에서 일어나기" : "앉아서 쉬기"}</strong><small>{rest.shelterName} · 바다를 바라봐요</small></span></button>}
          {walking && <button type="button" className={styles.contextButton + " " + styles.contextCancel} onClick={() => engineRef.current?.cancelAutoWalk()}><span className={styles.contextIcon}><IconClose /></span><span className={styles.contextCopy}><strong>걸음 멈추기</strong><small>천천히 가도 돼요</small></span></button>}
        </div>}
        {characterPickerOpen && <div ref={characterPickerRef} id={characterPickerId} className={styles.characterPanel + " " + styles.dockCharacterPanel}>
          <div className={styles.characterPanelHead}><strong>내 캐릭터</strong><button type="button" aria-label="캐릭터 선택 닫기" onClick={() => { setCharacterPickerOpen(false); characterTriggerRef.current?.focus(); }}><IconClose /></button></div>
          <div className={styles.characterChoices} role="group" aria-label="기본 캐릭터 선택">
            {BEACH_CHARACTERS.map((option) => <button key={option.id} type="button" className={styles.characterChoice} aria-pressed={character === option.id} onClick={() => chooseCharacter(option.id)}><span className={styles.characterSprite} style={{ backgroundPosition: "0 " + (-option.skin * 104) + "px" }} aria-hidden="true" /><span>{option.label}{character === option.id && <IconCheck />}</span></button>)}
          </div><p>고르면 내 모습이 바로 보여요.</p>
        </div>}
        <div className={styles.fireContext} role="group" aria-label="모닥불 돌보기" hidden={!fireContextVisible}>
          {fire && meRef.current && <CampfireControls key={communityId + ":" + meRef.current.id}
            fire={fire} near={nearFire} disconnected={lost || Boolean(skyPhase) || characterPickerOpen || lying || Boolean(photo)}
            onAddWood={onAddWood} onAddPowder={onAddPowder} onFireChange={applyFire}
            powderOpen={powderOpen} onPowderOpenChange={setPowderOpen}
          />}
        </div>
        <nav className={styles.dock} aria-label="바닷가 조작" data-lying={lying}>
          <button ref={actionsTriggerRef} type="button" className={styles.dockButton} aria-expanded={actionsOpen} aria-controls={actionTrayId} onClick={() => { haptic(); setActionsOpen((open) => !open); setCarePrompt(null); setCharacterPickerOpen(false); if (actionsOpen) engineRef.current?.select(null); }}><IconSparkle /><span>행동</span></button>
          <button ref={cameraTriggerRef} type="button" className={styles.dockButton} aria-label={capturing ? "사진을 담는 중" : "풍경 사진 찍기"} disabled={capturing || Boolean(skyPhase) || woodBusy || Boolean(powderPhase)} onClick={() => void takePhoto()}><CameraIcon /><span>{capturing ? "담는 중" : "사진"}</span></button>
          {!lying && <button type="button" className={styles.dockButton} disabled={Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "third"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}><IconUsers /><span>시점</span></button>}
          <button ref={characterTriggerRef} type="button" className={styles.dockButton} aria-label="내 캐릭터 고르기" aria-expanded={characterPickerOpen} aria-controls={characterPickerId} onClick={() => { haptic(); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); setCharacterPickerOpen((open) => !open); }}><IconUser /><span>내 캐릭터</span></button>
        </nav>
      </div>
      {!hudHidden && phase === "ready" && <button type="button" className={styles.hideHud} aria-label="화면 버튼 숨기기" disabled={capturing} onClick={hideHud}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M9.5 5.7A11 11 0 0 1 12 5.4c6 0 9.5 6.6 9.5 6.6a17 17 0 0 1-3.3 4M14.2 18.4a11 11 0 0 1-2.2.2C6 18.6 2.5 12 2.5 12a17 17 0 0 1 3.2-4M10 10a3 3 0 0 0 4 4" /></svg><span>숨김</span></button>}
      {hudHidden && phase === "ready" && <button ref={restoreTriggerRef} type="button" className={styles.restoreHud} onClick={restoreHud} aria-label="화면 버튼 다시 보기"><IconSparkle /><span>버튼 보기</span></button>}

      {phase === "loading" && (
        <div className={styles.center} role="status" aria-live="polite">
          <p className={styles.loadingDots}>바닷가로 가는 중</p>
          <small>하얀 모래와 파도 소리 곁으로</small>
        </div>
      )}
      {phase === "error" && (
        <div className={styles.center} role="alert">
          <p>{error}</p>
          <Link href={returnHref} className={styles.glass}><IconChevronL />소로우로 돌아가기</Link>
        </div>
      )}
      {photo && <PhotoPreview key={photo.url} photo={photo} onClose={closePhoto} />}
    </div>
  );
}
