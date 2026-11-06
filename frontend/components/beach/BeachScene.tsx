"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { assetCssUrl } from "@/lib/assets";
import { MAPS, type MapId } from "@/lib/beach/maps";
import { BeachEngine, webglSupported, type RestState, type StargazingState, type BedState, type BenchState, type OnsenState, type PavilionState, type ViewMode, type BoatRideState } from "@/lib/beach/engine";
import { BeachGone, BeachUnavailable, BeachCooldown, enterBeach, leaveBeach, suspendBeach, tickBeach, addFirewood, addFirePowder, setBeachRest, setBeachLighting, launchBeachFireworks, type FireworkEvent, type FireworkVariant, type RoomLighting, type RoomLightingMode, type FireState, type PowderColor, type CareEvent, type CareKind, type RemotePlayer, type EnterResponse } from "@/lib/beach/net";
import { attachBeachLifecycle, beachTickDelay, forgetBeachVisit, readBeachVisit, sameBeachRoster, sameFireDisplay, saveBeachVisit, type SavedBeachVisit } from "@/lib/beach/continuity";
import { hourLabel, hourOverride, rainOverride } from "@/lib/beach/daylight";
import { BEACH_CHARACTERS, characterAfterEntry, characterSkin, savedCharacter, saveCharacter, type BeachCharacter } from "@/lib/beach/appearance";
import { createBeachPhoto, type BeachPhoto } from "@/lib/beach/photo";
import { showToast, toastSuccess, tick as haptic } from "@/lib/toast";
import { IconCheck, IconChevronL, IconClose, IconHeart, IconLeaf, IconLock, IconMoon, IconUser, IconUsers, IconSparkle, IconSmile } from "@/components/Icons";
import { route } from "@/lib/routes";
import CampfireControls, { type WoodPhase } from "./CampfireControls";
import Joystick from "./Joystick";
import PhotoPreview, { CameraIcon } from "./PhotoPreview";
import RoomLightingControls from "./RoomLightingControls";
import RoomFireworksControls from "./RoomFireworksControls";
import FireworkTicketSheet from "@/components/FireworkTicketSheet";
import UyuniMomentControls from "./UyuniMomentControls";
import BambooFestivalControls from "./BambooFestivalControls";
import BambooBulletin from "./BambooBulletin";
import type { BambooNote } from "@/lib/beach/bamboo-notes";
import FieldSoundControl from "./FieldSoundControl";
import RoomMusicControls from "./RoomMusicControls";
import { readRoomMusic, type RoomMusicState } from "@/lib/beach/room-music";
import { chooseBambooToy, type BambooFestivalState, type BambooToy } from "@/lib/beach/net";
import { launchUyuniMoment, type UyuniMoment, type UyuniMomentInput, type UyuniMomentCooldowns } from "@/lib/beach/net";
import { SPARKLER_DRAW_END } from "@/lib/beach/sparkler-timing";
import styles from "./beach.module.css";

const CARE_LABEL: Record<CareKind, string> = { comfort: "위로를 건넸어요", hug: "안아 줬어요", wave: "인사를 건넸어요" };
const VIEW_KEY = "beach-view";
const INTRO_VISIBLE_MS = 4000;
const INTRO_FADE_MS = 700;
const EMPTY_ONSEN: OnsenState = { inWater: false, canSit: false, canFloat: false, sitting: false, floating: false, occupiedSeats: [], occupiedFloats: [] };
const EMPTY_PAVILION: PavilionState = { near: false, seated: false, occupied: 0, capacity: 6, available: false, spotId: null, name: "", kind: "pavilion" };
type SkyPhase = "walking" | "joining" | "standing";

/** 마지막에 고른 시점 (기기별로 기억) */
function savedView(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === "third" ? "third" : "first"; } catch { return "first"; }
}

/**
 * 소로우 바닷가 화면. 엔진(lib/beach/engine)이 그리고, 여기서는 서버와 주고받기(enter → tick … → leave)와 HUD 를 맡는다.
 *  - 이동/주변 움직임에 맞춘 일정 주기의 snapshot. 앱 전환은 잠시 쉬고, 인증된 최근 방문으로 이어간다.
 *  - 사람을 탭하면 아래에 닉네임과 "위로해주기 · 안아주기". 보낸 건 다음 tick 에 실려 간다
 *  - 받으면 화면 가장자리 빛 + 눈앞 이펙트 + 토스트 + 햅틱
 *  - 터치 기기에선 왼쪽 아래 조이스틱으로 걷고 화면을 끌어 둘러본다. "장작 넣기"는 어디서 눌러도 불 앞까지 알아서 걸어가 넣는다
 */
export default function BeachScene({ communityId, mapId = "beach" }: { communityId: string; mapId?: MapId }) {
  const map = MAPS[mapId];
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
  const requestEpochRef = useRef(0);
  const tickAbortRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);
  const lastTickStartedRef = useRef(0);
  const remoteMovingRef = useRef(false);
  const resumeRecordRef = useRef<SavedBeachVisit | null>(null);
  const savedAtRef = useRef(0);
  const pageHiddenRef = useRef(false);
  const failRef = useRef(0);
  const aliveRef = useRef(true);
  const blockedRef = useRef(false);
  const tickRunnerRef = useRef<() => Promise<unknown>>(async () => {});
  const selectedRef = useRef<RemotePlayer | null>(null);
  const fireTimeRef = useRef(0);
  const fireLogsRef = useRef<number | null>(null);
  const fireEnabledRef = useRef(false);
  const characterRef = useRef<BeachCharacter | null>(null);
  const characterPickerRef = useRef<HTMLDivElement>(null);
  const characterTriggerRef = useRef<HTMLButtonElement>(null);
  const characterPickerId = useId();
  const restEnabledRef = useRef(false);
  const bedEnabledRef = useRef(false);
  const benchEnabledRef = useRef(false);
  const onsenEnabledRef = useRef(false);
  const pavilionEnabledRef = useRef(false);
  const pavilionRef = useRef<PavilionState>(EMPTY_PAVILION);
  const benchActionRef = useRef<() => void>(() => {});
  const pavilionActionRef = useRef<() => void>(() => {});
  const boatActionRef = useRef<() => void>(() => {});
  const rainRef = useRef(0);
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
  const lightingRef = useRef<RoomLighting | null>(null);
  const lightingBusyRef = useRef(false);
  const previewHourRef = useRef<number | null>(null);
  const fireworksBusyRef = useRef(false);
  const toyRequestRef = useRef<{ id: string; choice: BambooToy | "put-away"; busy: boolean } | null>(null);
  const fireworksRequestRef = useRef<{ id: string; variant: FireworkVariant } | null>(null);
  const fireworksClockRef = useRef({ time: -1, cooldown: 0 });
  const momentBusyRef = useRef(false);
  const momentOperationRef = useRef(0);
  const momentRequestRef = useRef<{ id: string; input: UyuniMomentInput } | null>(null);
  const momentClockRef = useRef<{ time: number; events: UyuniMoment[]; cooldowns: UyuniMomentCooldowns }>({ time: -1, events: [], cooldowns: { sparkler: 0, lantern: 0 } });

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
  const [lighting, setLighting] = useState<RoomLighting | null>(null);
  const [lightingControl, setLightingControl] = useState(false);
  const [lightingOpen, setLightingOpen] = useState(false);
  const [lightingBusy, setLightingBusy] = useState<RoomLightingMode | null>(null);
  const [fireworksControl, setFireworksControl] = useState(false);
  // Administrators launch for free (tickets null); members hold a ticket count and unlock through the ticket sheet.
  const [fireworksFree, setFireworksFree] = useState(false);
  const [fireworkTickets, setFireworkTickets] = useState<number | null>(null);
  const [ticketSheetOpen, setTicketSheetOpen] = useState(false);
  const [fireworksBusy, setFireworksBusy] = useState(false);
  const [fireworksMuted, setFireworksMuted] = useState(false);
  const [fieldVolume, setFieldVolume] = useState(50);
  const [uyuniMusicVolume, setUyuniMusicVolume] = useState(25);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [musicControl, setMusicControl] = useState(false);
  const [musicSnapshot, setMusicSnapshot] = useState<{ music: RoomMusicState; serverTime: number } | null>(null);
  const musicSnapshotRef = useRef<typeof musicSnapshot>(null);
  const [fireworksDeadline, setFireworksDeadline] = useState(0);
  const [momentsEnabled, setMomentsEnabled] = useState(false);
  const [festival, setFestival] = useState<BambooFestivalState>();
  const [toyBusy, setToyBusy] = useState(false);
  const [flightUntil, setFlightUntil] = useState(0);
  useEffect(() => {
    if (!flightUntil) return;
    const timer = window.setTimeout(() => setFlightUntil(0), Math.max(0, flightUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [flightUntil]);
  const [nearGuestbook, setNearGuestbook] = useState(false);
  const [guestbookInSight, setGuestbookInSight] = useState(false);
  const displayNotes = useCallback((notes: readonly BambooNote[]) => engineRef.current?.setGuestbookEntries(notes), []);
  const [guestbookOpen, setGuestbookOpen] = useState(false);
  const [momentBusy, setMomentBusy] = useState(false);
  const [momentOpen, setMomentOpen] = useState(false);
  const [momentDeadlines, setMomentDeadlines] = useState<UyuniMomentCooldowns>({ sparkler: 0, lantern: 0 });
  const [lost, setLost] = useState(false);
  const [fire, setFire] = useState<FireState | null>(null);
  const [fireEnabled, setFireEnabled] = useState(false);
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
  const [onsenEnabled, setOnsenEnabled] = useState(false);
  const [onsen, setOnsen] = useState<OnsenState>(EMPTY_ONSEN);
  const [pavilionEnabled, setPavilionEnabled] = useState(false);
  const [pavilion, setPavilion] = useState<PavilionState>(EMPTY_PAVILION);
  const [boat, setBoat] = useState<BoatRideState | null>(null);
  const [rain, setRain] = useState(0);
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
  pavilionRef.current = pavilion;
  const lying = stargazing.lying || Boolean(bed?.lying) || onsen.floating;

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
  }, [phase, communityId, mapId]);

  const adoptCharacter = useCallback((me: EnterResponse["me"]): BeachCharacter => {
    // Retain an in-memory choice across ticket expiry even if local storage is blocked.
    const previous = meRef.current && characterRef.current ? { id: meRef.current.id, character: characterRef.current } : null;
    const next = characterAfterEntry(me, previous, savedCharacter(me.id));
    characterRef.current = next;
    setCharacter(next);
    engineRef.current?.setSkin(characterSkin(next));
    return next;
  }, []);

  const applyLighting = useCallback((next: RoomLighting | null | undefined, force = false) => {
    if (!next) return;
    const previous = lightingRef.current;
    if (previous && (next.version < previous.version || (!force && next.version === previous.version))) return;
    lightingRef.current = next;
    setLighting(next);
    const engine = engineRef.current;
    if (!engine) return;
    engine.setHourOverride(next.mode === "auto" ? next.version === 0 ? previewHourRef.current : null : next.hour);
    setTimeLabel(hourLabel(engine.daylightNow.hour));
    setNightControls(engine.daylightNow.deepNight > 0.5);
  }, []);

  const resetFireworks = useCallback(() => {
    fireworksBusyRef.current = false;
    fireworksRequestRef.current = null;
    fireworksClockRef.current = { time: -1, cooldown: 0 };
    setFireworksBusy(false); setFireworksDeadline(0); setFireworksControl(false);
    setFireworksFree(false); setFireworkTickets(null); setTicketSheetOpen(false);
  }, []);

  const applyFireworks = useCallback((events: FireworkEvent[] | undefined, serverTime: number | undefined, cooldownUntil: number | undefined) => {
    if (!Number.isSafeInteger(serverTime) || !Number.isSafeInteger(cooldownUntil)) return;
    const time = serverTime!, cooldown = cooldownUntil!, previous = fireworksClockRef.current;
    if (time < previous.time || (time === previous.time && cooldown < previous.cooldown)) return;
    engineRef.current?.applyFireworks(events ?? [], time);
    if (time === previous.time && cooldown === previous.cooldown) return;
    fireworksClockRef.current = { time, cooldown };
    const remaining = Math.max(0, Math.min(21_000, cooldown - time));
    // An expired cooldown is zero, so an idle tick cannot briefly disable and close the picker.
    setFireworksDeadline(remaining > 0 ? Date.now() + remaining : 0);
  }, []);

  const openLighting = useCallback((open: boolean) => {
    setLightingOpen(open);
    if (open) {
      setActionsOpen(false); setCharacterPickerOpen(false); setPowderOpen(false); setCarePrompt(null);
      engineRef.current?.select(null);
    }
    haptic();
  }, []);

  const resetMoments = useCallback((preserveRequest = false) => {
    momentOperationRef.current++;
    momentBusyRef.current = false;
    if (!preserveRequest) momentRequestRef.current = null;
    momentClockRef.current = { time: -1, events: [], cooldowns: { sparkler: 0, lantern: 0 } };
    setMomentsEnabled(false); setMomentBusy(false);
    if (!preserveRequest) setMomentOpen(false);
    setMomentDeadlines({ sparkler: 0, lantern: 0 });
  }, []);

  const applyMoments = useCallback((events: UyuniMoment[] | undefined, serverTime: number | undefined, cooldowns: UyuniMomentCooldowns | undefined, append = false, ownPid = meRef.current?.pid) => {
    if (!Number.isSafeInteger(serverTime) || !cooldowns) return;
    const time = serverTime!, previous = momentClockRef.current;
    if (time < previous.time) return;
    const live = new Map((append ? previous.events : []).map(event => [event.id, event]));
    for (const event of events ?? []) live.set(event.id, event);
    const current = [...live.values()].filter(event => event.startedAt + event.durationMs > time);
    engineRef.current?.applyUyuniMoments(current, time, ownPid);
    momentClockRef.current = { time, events: current, cooldowns };
    if (previous.cooldowns.sparkler !== cooldowns.sparkler || previous.cooldowns.lantern !== cooldowns.lantern || previous.time < 0) {
      const deadline = (until: number) => until > time ? Date.now() + until - time : 0;
      setMomentDeadlines({ sparkler: deadline(cooldowns.sparkler), lantern: deadline(cooldowns.lantern) });
    }
  }, []);

  useEffect(() => {
    if (!lightingControl || hudHidden || photo || phase !== "ready" || actionsOpen || characterPickerOpen || powderOpen) setLightingOpen(false);
  }, [lightingControl, hudHidden, photo, phase, actionsOpen, characterPickerOpen, powderOpen]);

  useEffect(() => { if (hudHidden || photo || phase !== "ready" || lost || mapId === "uyuni") setFieldOpen(false); }, [hudHidden, photo, phase, lost, mapId]);
  const controlsPaused = Boolean(photo) || fieldOpen || guestbookOpen || characterPickerOpen || lightingOpen || momentOpen || momentBusy || (!hudHidden && selected !== null) || powderOpen || powderPhase === "adding" || skyPhase === "joining" || skyPhase === "standing";
  useEffect(() => {
    engineRef.current?.setInputPaused(controlsPaused);
    controlsPausedRef.current = controlsPaused;
  }, [controlsPaused, phase]);

  useEffect(() => { if (lying || !nearFire) setPowderOpen(false); }, [lying, nearFire]);

  useEffect(() => {
    if (!actionsOpen || photo || powderOpen || characterPickerOpen || momentOpen) return;
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
  }, [actionsOpen, photo, powderOpen, characterPickerOpen, momentOpen]);

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

  const rememberVisit = useCallback((force = false) => {
    const eng = engineRef.current, me = meRef.current, ticket = ticketRef.current;
    if (!eng || !me || !ticket || blockedRef.current) return;
    const now = Date.now();
    if (!force && now - savedAtRef.current < 2000) return;
    const value: SavedBeachVisit = { version: 1, userId: me.id, ticket, sequence: sequenceRef.current,
      savedAt: now, camera: eng.getContinuityView() };
    resumeRecordRef.current = value;
    savedAtRef.current = now;
    saveBeachVisit(communityId, mapId, value);
  }, [communityId, mapId]);

  const applyFire = useCallback((next: FireState) => {
    if (!aliveRef.current || !next || next.serverTime < fireTimeRef.current) return;
    fireTimeRef.current = next.serverTime;
    // 장작이 늘었으면(내가 넣었든 누가 넣었든) 불이 확 타올랐다가 잦아든다
    if (fireLogsRef.current !== null && next.logs > fireLogsRef.current) engineRef.current?.flareFire();
    fireLogsRef.current = next.logs;
    setFire(previous => sameFireDisplay(previous, next) ? previous : next);
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
    if (!aliveRef.current || blockedRef.current || document.hidden || navigator.onLine === false) return;
    const engine = engineRef.current;
    const elapsed = lastTickStartedRef.current ? performance.now() - lastTickStartedRef.current : 0;
    timerRef.current = window.setTimeout(() => void tickRunnerRef.current(), delay
      ?? beachTickDelay(engine?.getSelf().moving === true, remoteMovingRef.current, failRef.current, elapsed));
  }, []);

  const stopWithError = useCallback((cause: Error) => {
    blockedRef.current = true;
    requestEpochRef.current++;
    tickAbortRef.current?.abort();
    window.clearTimeout(timerRef.current);
    engineRef.current?.stop();
    const leavingTicket = ticketRef.current ?? resumeRecordRef.current?.ticket;
    if (leavingTicket) leaveBeach(leavingTicket);
    ticketRef.current = null;
    resumeRecordRef.current = null;
    forgetBeachVisit(communityId, mapId);
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
    resetFireworks();
    resetMoments();
    setError(cause.message);
    setPhase("error");
  }, [resetFireworks, resetMoments, communityId, mapId]);

  const applyMusic = useCallback((value: RoomMusicState | undefined, time?: number, reset = false) => {
    let next: typeof musicSnapshotRef.current = null;
    if (value && typeof time === "number" && Number.isSafeInteger(time)) {
      const music = readRoomMusic(value);
      if (music && (music.startedAt === null || music.startedAt <= time)) next = { music, serverTime: time };
    }
    if (!next && !reset) return;
    const previous = musicSnapshotRef.current;
    if (!reset && previous && next && (next.music.version < previous.music.version ||
      (next.music.version === previous.music.version && next.serverTime < previous.serverTime + 8000))) return;
    musicSnapshotRef.current = next;
    if (mapId === "uyuni") engineRef.current?.setRoomMusicPlaying(next?.music.playing === true);
    setMusicSnapshot(next);
  }, [mapId]);

  const applyFestival = useCallback((engine: BeachEngine, state: BambooFestivalState | undefined, serverTime: number) => {
    engine.setOwnFestival(state, serverTime, meRef.current?.pid);
    setFestival(state);
    const remaining = state?.flight ? state.flight.startedAt + state.flight.durationMs - serverTime : 0;
    setFlightUntil(remaining > 0 ? Date.now() + remaining : 0);
  }, []);

  const reenter = useCallback(async (engine: BeachEngine, visit: number, epoch: number, signal: AbortSignal): Promise<boolean> => {
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && requestEpochRef.current === epoch;
    if (!belongsToVisit() || blockedRef.current) return false;
    // Confirm the session identity before sending any account's saved choice.
    const saved = resumeRecordRef.current;
    const entered = await enterBeach(communityId, undefined, mapId,
      saved ? { ticket: saved.ticket, sequence: Math.max(saved.sequence, sequenceRef.current) } : undefined, signal);
    if (!belongsToVisit() || blockedRef.current) { if (!saved) leaveBeach(entered.ticket); return false; }
    const sameAccount = meRef.current?.id === entered.me.id;
    const camera = sameAccount ? engine.getContinuityView() : undefined;
    if (!sameAccount) {
      pendingCareRef.current = null;
      careBusyRef.current = false;
      setCareBusy(false);
      engine.select(null);
    }
    ticketRef.current = entered.ticket;
    setMusicControl(entered.musicControl === true);
    applyMusic(entered.music, entered.serverTime, true);
    if (mapId === "bamboo") {
      toyRequestRef.current = null; setToyBusy(false); setGuestbookOpen(false);
      applyFestival(engine, entered.festival, entered.serverTime ?? Date.now());
    }
    sequenceRef.current = Math.max(sameAccount ? sequenceRef.current : 0, entered.sequence ?? 0);
    resetFireworks();
    setFireworksControl(entered.fireworksControl === true); setFireworksFree(entered.fireworksFree === true); setFireworkTickets(entered.fireworksFree === true ? null : entered.fireworkTickets ?? 0);
    applyFireworks(entered.fireworks, entered.serverTime, entered.fireworksCooldownUntil);
    resetMoments(sameAccount);
    setMomentsEnabled(entered.uyuniMomentsEnabled === true);
    applyMoments(entered.uyuniMoments, entered.serverTime, entered.uyuniMomentCooldowns, false, entered.me.pid);
    lightingRef.current = null;
    lightingBusyRef.current = false;
    setLightingBusy(null); setLightingOpen(false);
    setLightingControl(entered.lightingControl === true);
    setLighting(null);
    applyLighting(entered.lighting, true);
    adoptCharacter(entered.me);
    meRef.current = entered.me;
    setCareCapabilities({ wave: entered.careCapabilities?.wave === true, hug: entered.careCapabilities?.hug === true });
    setCount(entered.count);
    setCapacity(entered.capacity);
    setCommunity(entered.community);
    fireEnabledRef.current = entered.fireEnabled === true;
    setFireEnabled(fireEnabledRef.current);
    restEnabledRef.current = entered.restEnabled === true;
    setRestEnabled(restEnabledRef.current);
    bedEnabledRef.current = entered.bedEnabled === true;
    setBedEnabled(bedEnabledRef.current);
    benchEnabledRef.current = entered.benchEnabled === true;
    setBenchEnabled(benchEnabledRef.current);
    onsenEnabledRef.current = entered.onsenEnabled === true;
    setOnsenEnabled(onsenEnabledRef.current);
    pavilionEnabledRef.current = entered.pavilionEnabled === true;
    setPavilionEnabled(pavilionEnabledRef.current);
    // Only the server may preserve a rest slot; a live local walk keeps its most recent position.
    engine.restoreVisit(entered.spawn, entered.selfRest, camera,
      sameAccount && !engine.isLying && !engine.isBenchSeated && !engine.isPavilionSeated && !engine.onsenState.sitting, entered.bounds);
    rememberVisit(true);
    applyFire(entered.fire);
    return true;
  }, [communityId, mapId, applyFire, adoptCharacter, applyLighting, applyFireworks, resetFireworks, applyMoments, resetMoments, rememberVisit, applyFestival, applyMusic]);

  const runTick = useCallback(async (allowRestSync = false): Promise<boolean> => {
    const engine = engineRef.current;
    const ticket = ticketRef.current;
    if (!aliveRef.current || blockedRef.current || !engine || inFlightRef.current || document.hidden || navigator.onLine === false || (restMutationRef.current && !allowRestSync)) return false;
    const visit = visitGenerationRef.current;
    const epoch = requestEpochRef.current;
    const belongsToVisit = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && requestEpochRef.current === epoch;
    inFlightRef.current = true;
    lastTickStartedRef.current = performance.now();
    const controller = new AbortController(); tickAbortRef.current = controller;
    if (!ticket) {
      try {
        if (!(await reenter(engine, visit, epoch, controller.signal))) {
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
    const sentAt = performance.now(), requestSequence = ++sequenceRef.current;
    try {
      const res = await tickBeach({
        ticket: ticketRef.current as string,
        sequence: requestSequence,
        x: Math.round(self.x * 100) / 100,
        z: Math.round(self.z * 100) / 100,
        yaw: Math.round(self.yaw * 1000) / 1000,
        moving: self.moving,
        character: characterRef.current ?? undefined,
        care: care ? { to: care.to, kind: care.kind } : undefined,
      }, controller.signal);
      if (!belongsToVisit() || blockedRef.current) return false;
      if (res.sequence !== undefined && res.sequence < requestSequence) return false;
      sequenceRef.current = Math.max(sequenceRef.current, res.sequence ?? requestSequence);
      engine.setPlayers(res.players, { serverTime: res.serverTime, sentAt, receivedAt: performance.now() });
      remoteMovingRef.current = res.players.some(player => player.moving);
      setPeople(previous => sameBeachRoster(previous, res.players) ? previous : res.players);
      if (res.careCapabilities) setCareCapabilities(previous => previous.wave === (res.careCapabilities!.wave === true)
        && previous.hug === (res.careCapabilities!.hug === true) ? previous : { wave: res.careCapabilities!.wave === true, hug: res.careCapabilities!.hug === true });
      if (res.selfRest) engine.applyRest(res.selfRest);
      setCount(res.count);
      setReceived(previous => previous.comfort === res.received.comfort && previous.hug === res.received.hug
        && (previous.wave ?? 0) === (res.received.wave ?? 0) ? previous : res.received);
      applyFire(res.fire);
      applyLighting(res.lighting);
      if (res.music) applyMusic(res.music, res.serverTime);
      applyFireworks(res.fireworks, res.serverTime, res.fireworksCooldownUntil);
      applyMoments(res.uyuniMoments, res.serverTime, res.uyuniMomentCooldowns);
      for (const ev of res.events) handleEvent(ev);
      if (care) {
        careBusyRef.current = false;
        setCareBusy(false);
        if (res.care === "sent") toastSuccess(`${care.nick}님에게 ${CARE_LABEL[care.kind]}`);
        else if (res.care === "cooldown") showToast("잠시 뒤에 다시 건넬 수 있어요", { kind: "info" });
        else if (res.care === "gone") {
          showToast(`${care.nick}님은 지금 이곳에 없어요`, { kind: "info" });
          engine.select(null);
        } else if (res.care === "forbidden") {
          setCoolUntil(0);
          if (care.kind === "hug") setCareCapabilities((caps) => ({ ...caps, hug: false }));
          showToast(care.kind === "hug" ? "포옹은 관리자만 건넬 수 있어요. 인사나 위로를 건네 보세요." : "현재 입장 정보를 확인하지 못했어요. 소로우에서 다시 들어와 주세요.", { kind: "info" });
        }
      }
      failRef.current = 0;
      setLost(false);
      rememberVisit();
      return true;
    } catch (e) {
      if (!belongsToVisit() || blockedRef.current) return false;
      if (e instanceof BeachUnavailable) {
        stopWithError(e);
      } else if (e instanceof BeachGone) {
        rememberVisit(true);
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
        tickAbortRef.current = null;
        scheduleTick();
      }
    }
  }, [handleEvent, reenter, scheduleTick, stopWithError, applyFire, applyLighting, applyFireworks, applyMoments, applyMusic, rememberVisit]);
  tickRunnerRef.current = runTick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    visitGenerationRef.current++;
    requestEpochRef.current++;
    tickAbortRef.current?.abort();
    tickAbortRef.current = null;
    aliveRef.current = true;
    blockedRef.current = false;
    pageHiddenRef.current = false;
    resumeRecordRef.current = readBeachVisit(communityId, mapId);
    sequenceRef.current = resumeRecordRef.current?.sequence ?? 0;
    savedAtRef.current = 0;
    lastTickStartedRef.current = 0;
    remoteMovingRef.current = false;
    setPhase("loading"); setError(""); setCount(null); setCommunity(null);
    musicSnapshotRef.current = null; setMusicSnapshot(null); setMusicControl(false);
    toyRequestRef.current = null; setToyBusy(false); setFestival(undefined); setGuestbookOpen(false); setNearGuestbook(false); setFlightUntil(0);
    setGuestbookInSight(false);
    setSelected(null); setRest(null); setActionsOpen(false); setCarePrompt(null);
    setHudHidden(false); setCharacterPickerOpen(false); setSkyPhase(null);
    setReceived({ comfort: 0, hug: 0, wave: 0 });
    setStargazing({ near: false, lying: false, occupied: 0, capacity: 8 });
    restEnabledRef.current = false; setRestEnabled(false);
    bedEnabledRef.current = false; setBedEnabled(false);
    benchEnabledRef.current = false; setBenchEnabled(false);
    fireEnabledRef.current = false; setFireEnabled(false); setFire(null); setNearFire(false);
    inFlightRef.current = false;
    failRef.current = 0;
    pendingCareRef.current = null;
    careBusyRef.current = false;
    setCareBusy(false);
    setPeople([]);
    setCareCapabilities({ wave: false, hug: false });
    lightingRef.current = null;
    lightingBusyRef.current = false;
    previewHourRef.current = hourOverride(window.location.search);
    setLighting(null); setLightingControl(false); setLightingOpen(false); setLightingBusy(null);
    resetFireworks();
    setLost(false);
    resetMoments();
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
    onsenEnabledRef.current = false; setOnsenEnabled(false); setOnsen(EMPTY_ONSEN);
    pavilionEnabledRef.current = false; setPavilionEnabled(false); setPavilion(EMPTY_PAVILION);
    setRestActionSpot(null);
    fireTimeRef.current = 0;
    fireLogsRef.current = null;
    if (!communityId) {
      setPhase("error");
      setError("내 소로우에서 함께 쉴 곳을 골라 주세요.");
      return;
    }
    if (!webglSupported()) {
      setPhase("error");
      setError("이 기기에서는 풍경을 그릴 수 없어요. 다른 브라우저로 열어 보세요.");
      return;
    }
    document.body.style.overflow = "hidden";
    let engine: BeachEngine | null = null;
    let cancelled = false; // 개발 모드 StrictMode 가 효과를 두 번 돌려도 첫 입장은 바로 나간다
    (async () => {
      try {
        const saved = resumeRecordRef.current;
        const entered = await enterBeach(communityId, undefined, mapId,
          saved ? { ticket: saved.ticket, sequence: saved.sequence } : undefined);
        // StrictMode and BFCache can overlap resume responses for the SAME server visit.
        if (cancelled || !aliveRef.current) { if (!saved) leaveBeach(entered.ticket); return; }
        ticketRef.current = entered.ticket;
        sequenceRef.current = Math.max(entered.sequence ?? 0, entered.me.id === saved?.userId ? saved.sequence : 0);
        const initialCharacter = adoptCharacter(entered.me);
        meRef.current = entered.me;
        setCareCapabilities({ wave: entered.careCapabilities?.wave === true, hug: entered.careCapabilities?.hug === true });
        setCount(entered.count);
        setCapacity(entered.capacity);
        setCommunity(entered.community);
        fireEnabledRef.current = entered.fireEnabled === true;
        setFireEnabled(fireEnabledRef.current);
        restEnabledRef.current = entered.restEnabled === true;
        setRestEnabled(restEnabledRef.current);
        bedEnabledRef.current = entered.bedEnabled === true;
        setBedEnabled(bedEnabledRef.current);
        benchEnabledRef.current = entered.benchEnabled === true;
        setBenchEnabled(benchEnabledRef.current);
        onsenEnabledRef.current = entered.onsenEnabled === true;
        setOnsenEnabled(onsenEnabledRef.current);
        pavilionEnabledRef.current = entered.pavilionEnabled === true;
        setPavilionEnabled(pavilionEnabledRef.current);
        const initialView = savedView();
        setView(initialView);
        engine = new BeachEngine(canvas, {
          mapId,
          bounds: entered.bounds,
          spawn: entered.spawn,
          skin: characterSkin(initialCharacter),
          view: initialView,
          hourOverride: hourOverride(window.location.search),
          rainOverride: rainOverride(window.location.search),
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
            onOnsenChange: (state) => setOnsen(state),
            onBenchAction: () => benchActionRef.current(),
            onPavilionChange: (state) => setPavilion(state),
            onGuestbookRangeChange: setNearGuestbook,
            onGuestbookInSight: setGuestbookInSight,
            onPavilionAction: () => pavilionActionRef.current(),
            onBoatChange: (state) => setBoat(state),
            onBoatAction: () => boatActionRef.current(),
            onRainChange: (amount) => {
              if (rainRef.current === 0 && amount > 0.05) showToast("봄비가 내리기 시작해요. 청우헌 통창 아래에서 바라봐요.", { kind: "info" });
              rainRef.current = amount;
              setRain(amount);
            },
          },
        });
        engineRef.current = engine;
        setMusicControl(entered.musicControl === true);
        applyMusic(entered.music, entered.serverTime, true);
        if (mapId === "bamboo") applyFestival(engine, entered.festival, entered.serverTime ?? Date.now());
        setFireworksMuted(engine.fireworksMuted);
        setFieldVolume(engine.fieldVolume);
        if (mapId === "uyuni") setUyuniMusicVolume(engine.uyuniMusicVolume);
        engine.restoreVisit(entered.spawn, entered.selfRest,
          entered.resumed === true && saved?.userId === entered.me.id ? saved.camera : undefined);
        rememberVisit(true);
        setLightingControl(entered.lightingControl === true);
        applyLighting(entered.lighting, true);
        applyFire(entered.fire);
        setFireworksControl(entered.fireworksControl === true); setFireworksFree(entered.fireworksFree === true); setFireworkTickets(entered.fireworksFree === true ? null : entered.fireworkTickets ?? 0);
        applyFireworks(entered.fireworks, entered.serverTime, entered.fireworksCooldownUntil);
        setMomentsEnabled(entered.uyuniMomentsEnabled === true);
        applyMoments(entered.uyuniMoments, entered.serverTime, entered.uyuniMomentCooldowns);
        if (process.env.NODE_ENV !== "production") (window as unknown as { __beach?: BeachEngine }).__beach = engine; // 개발 콘솔에서 들여다보기
        setTimeLabel(hourLabel(engine.daylightNow.hour));
        setNightControls(engine.daylightNow.deepNight > 0.5);
        await engine.whenReady();
        if (cancelled || !aliveRef.current) { engine.dispose(); return; }
        if (document.hidden) suspend(); else engine.start();
        setPhase("ready");
        scheduleTick(0);
      } catch (e) {
        if (cancelled || !aliveRef.current) return;
        stopWithError(e instanceof Error ? e : new Error("함께 쉴 곳에 들어가지 못했어요."));
      }
    })();

    const cancelPendingPoll = () => {
      requestEpochRef.current++;
      tickAbortRef.current?.abort(); tickAbortRef.current = null;
      inFlightRef.current = false;
      window.clearTimeout(timerRef.current);
      // An interrupted social request may already have arrived. Never send it a second time.
      pendingCareRef.current = null;
      careBusyRef.current = false; setCareBusy(false);
      // A hidden/offline page keeps the uncertain UUID, but no old completion owns the controls.
      momentOperationRef.current++;
      momentBusyRef.current = false; setMomentBusy(false);
    };
    function suspend() {
      const eng = engineRef.current;
      if (!eng || blockedRef.current) return;
      cancelPendingPoll();
      eng.stop();
      const ticket = ticketRef.current;
      if (ticket) {
        const position = eng.getSelf();
        const sequence = ++sequenceRef.current;
        rememberVisit(true);
        suspendBeach({ ticket, sequence, x: position.x, z: position.z, yaw: position.yaw });
        // Resuming must pass the session/membership check even while the 10-second rest grace is alive.
        ticketRef.current = null;
      }
    };
    const detachLifecycle = attachBeachLifecycle({
      suspend,
      pageHidden: () => { pageHiddenRef.current = true; },
      resume: () => {
        pageHiddenRef.current = false;
        if (!engineRef.current || blockedRef.current) return;
        engineRef.current.start();
        failRef.current = 0;
        scheduleTick(0);
      },
      offline: () => {
        if (blockedRef.current) return;
        cancelPendingPoll(); rememberVisit(true); setLost(true);
      },
    });
    const onResize = () => engineRef.current?.resize();
    const clockTimer = window.setInterval(() => {
      if (engineRef.current) {
        setTimeLabel(hourLabel(engineRef.current.daylightNow.hour));
        setNightControls(engineRef.current.daylightNow.deepNight > 0.5);
      }
      bump((n) => n + 1);
    }, 15_000);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelled = true;
      if (pageHiddenRef.current) suspend();
      visitGenerationRef.current++;
      requestEpochRef.current++;
      tickAbortRef.current?.abort(); tickAbortRef.current = null;
      aliveRef.current = false;
      window.clearTimeout(timerRef.current);
      window.clearInterval(clockTimer);
      detachLifecycle();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.body.style.overflow = "";
      if (!pageHiddenRef.current) {
        // A setup cancelled before entry owns no saved visit (including StrictMode's probe).
        const leavingTicket = ticketRef.current ?? (engineRef.current ? resumeRecordRef.current?.ticket : undefined);
        if (leavingTicket) leaveBeach(leavingTicket);
        // Explicit navigation ends this visit, whereas mobile suspension keeps the tab bookmark.
        if (engineRef.current) forgetBeachVisit(communityId, mapId);
      }
      ticketRef.current = null;
      meRef.current = null;
      characterRef.current = null;
      skyOperationRef.current++;
      skyBusyRef.current = null;
      restMutationRef.current = false;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [communityId, mapId, scheduleTick, stopWithError, applyFire, adoptCharacter, applyLighting, applyFireworks, resetFireworks, applyMoments, resetMoments, rememberVisit, applyFestival, applyMusic]);

  const launchMoment = async (input: UyuniMomentInput): Promise<boolean> => {
    const ticket = ticketRef.current, engine = engineRef.current, visit = visitGenerationRef.current;
    if (!ticket || !engine || !momentsEnabled || momentBusyRef.current || blockedRef.current || lost || lying || rest?.seated || bench.seated || skyPhase
      || (!momentRequestRef.current && Date.now() < momentDeadlines[input.kind])) return false;
    const epoch = requestEpochRef.current, operation = ++momentOperationRef.current;
    const currentOperation = () => requestEpochRef.current === epoch && momentOperationRef.current === operation;
    const belongsToVisit = () => currentOperation() && aliveRef.current && !blockedRef.current && engineRef.current === engine && ticketRef.current === ticket && visitGenerationRef.current === visit;
    momentBusyRef.current = true; setMomentBusy(true);
    const request = momentRequestRef.current ?? { id: crypto.randomUUID(), input };
    const sameChoice = JSON.stringify(request.input) === JSON.stringify(input);
    momentRequestRef.current = request;
    if (!sameChoice) showToast("앞서 보낸 빛을 먼저 확인할게요. 적은 소원은 그대로 남아 있어요.", { kind: "info" });
    haptic();
    try {
      // Stop at the chosen place and let the usual ordered tick publish that pose.
      engine.setInputPaused(true);
      const poseDeadline = performance.now() + 9000;
      while (inFlightRef.current && belongsToVisit() && performance.now() < poseDeadline)
        await new Promise<void>(resolve => window.setTimeout(resolve, 40));
      if (!belongsToVisit()) return false;
      const positionConfirmed = await tickRunnerRef.current();
      if (!belongsToVisit()) return false;
      if (positionConfirmed !== true) throw new Error("지금 서 있는 자리를 확인하지 못했어요. 연결 후 다시 눌러 주세요.");
      const result = await launchUyuniMoment(ticket, request.id, request.input);
      if (!belongsToVisit()) return false;
      momentRequestRef.current = null;
      const previous = momentClockRef.current;
      const actionDuration = result.event.kind === "sparkler" ? SPARKLER_DRAW_END * 1000 : result.event.durationMs;
      const live = result.event.startedAt + actionDuration > Math.max(result.serverTime, previous.time);
      const newlyConfirmed = result.serverTime >= previous.time && !previous.events.some(event => event.id === result.event.id);
      applyMoments([result.event], result.serverTime, result.cooldowns, true);
      if (!live)
        showToast("앞서 보낸 빛을 확인했어요. 다시 고르면 새로 시작해요.", { kind: "info" });
      else if (result.event.kind === "sparkler") {
        if (sameChoice && newlyConfirmed && result.event.fromPid === meRef.current?.pid) engine.showSparklerDrawing();
        const label = result.event.letter === "heart" ? "하트" : result.event.letter === "star" ? "별" : result.event.letter;
        toastSuccess(`손끝의 불꽃으로 ${label} 그리기를 시작해요`);
      } else toastSuccess("소원을 담은 등이 떠올라요");
      if (sameChoice) { setActionsOpen(false); setCarePrompt(null); engine.select(null); }
      return sameChoice;
    } catch (cause) {
      if (!belongsToVisit()) return false;
      // Keep the same UUID after an uncertain response; no automatic replay.
      if (cause instanceof BeachUnavailable || cause instanceof BeachCooldown || cause instanceof BeachGone) momentRequestRef.current = null;
      if (cause instanceof BeachUnavailable && [401, 403].includes(cause.status)) setMomentsEnabled(false);
      if (cause instanceof BeachGone) { ticketRef.current = null; setMomentsEnabled(false); scheduleTick(0); }
      if (cause instanceof BeachCooldown) scheduleTick(0);
      showToast(cause instanceof Error ? cause.message : "빛을 확인하지 못했어요. 같은 선택으로 다시 눌러 주세요.", { kind: "info" });
      return false;
    } finally {
      if (currentOperation() && aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && (ticketRef.current === ticket || ticketRef.current === null)) {
        momentBusyRef.current = false; setMomentBusy(false);
      }
    }
  };

  const useFestivalToy = async (choice: BambooToy | "put-away") => {
    const ticket = ticketRef.current, engine = engineRef.current;
    if (!ticket || !engine || !festival || lost || blockedRef.current || toyRequestRef.current?.busy) return;
    const pending = toyRequestRef.current;
    const request = pending?.choice === choice ? pending : { id: crypto.randomUUID(), choice, busy: false };
    const current = () => aliveRef.current && engineRef.current === engine && ticketRef.current === ticket && toyRequestRef.current === request;
    request.busy = true; toyRequestRef.current = request; setToyBusy(true);
    try {
      if (choice === "propeller" && pending?.choice !== choice) {
        // Launch from the last position acknowledged by the room, including the front of the deck.
        const deadline = performance.now() + 8200;
        while (inFlightRef.current && current() && performance.now() < deadline)
          await new Promise(resolve => window.setTimeout(resolve, 35));
        if (!current()) return;
        if (!(await runTick(true))) {
          toyRequestRef.current = null; setToyBusy(false);
          showToast("서 있는 위치를 확인한 뒤 다시 날려 주세요.", { kind: "info" }); return;
        }
      }
      if (!current()) return;
      const result = await chooseBambooToy(ticket, request.id, choice);
      if (!current()) return;
      applyFestival(engine, result.festival, result.serverTime);
      toyRequestRef.current = null; setToyBusy(false);
      setActionsOpen(false); haptic(); actionsTriggerRef.current?.focus();
    } catch (cause) {
      if (!current()) return;
      request.busy = false; setToyBusy(false);
      if (cause instanceof BeachGone || cause instanceof BeachCooldown || cause instanceof BeachUnavailable) toyRequestRef.current = null;
      if (cause instanceof BeachGone) { ticketRef.current = null; setGuestbookOpen(false); scheduleTick(0); }
      showToast(cause instanceof Error ? cause.message : "축제 소품을 다시 골라 주세요.", { kind: "info" });
    }
  };

  const launchFireworks = async (variant: FireworkVariant) => {
    const ticket = ticketRef.current, engine = engineRef.current, visit = visitGenerationRef.current;
    if (!ticket || !engine || !fireworksControl || fireworksBusyRef.current || blockedRef.current || lost || Date.now() < fireworksDeadline) return;
    if (!fireworksFree && (fireworkTickets ?? 0) <= 0) { setTicketSheetOpen(true); return; }
    const belongsToVisit = () => aliveRef.current && !blockedRef.current && engineRef.current === engine && ticketRef.current === ticket && visitGenerationRef.current === visit;
    fireworksBusyRef.current = true; setFireworksBusy(true);
    const request = fireworksRequestRef.current ?? { id: crypto.randomUUID(), variant };
    fireworksRequestRef.current = request;
    if (request.variant !== variant) showToast("이전 요청을 먼저 확인할게요. 완료된 뒤 새 불꽃놀이를 골라 주세요.", { kind: "info" });
    haptic();
    try {
      const result = await launchBeachFireworks(ticket, request.id, request.variant);
      if (!belongsToVisit()) return;
      fireworksRequestRef.current = null;
      applyFireworks([result.event], result.serverTime, result.cooldownUntil);
      if (typeof result.tickets === "number") setFireworkTickets(result.tickets);
      if (result.event.startedAt + result.event.durationMs <= result.serverTime) showToast("이전 요청을 확인했어요. 다시 누르면 새 불꽃놀이를 시작해요.", { kind: "info" });
    } catch (cause) {
      if (!belongsToVisit()) return;
      // Reuse the request on an uncertain transport failure; a retry must not launch twice.
      if (cause instanceof BeachUnavailable || cause instanceof BeachCooldown || cause instanceof BeachGone) fireworksRequestRef.current = null;
      // 402: another tab spent the last ticket. Show the ticket sheet instead of a toast.
      if (cause instanceof BeachUnavailable && cause.status === 402) { setFireworkTickets(0); setTicketSheetOpen(true); return; }
      if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) setFireworksControl(false);
      if (cause instanceof BeachGone) { ticketRef.current = null; setFireworksControl(false); scheduleTick(0); }
      if (cause instanceof BeachCooldown) scheduleTick(0);
      showToast(cause instanceof Error ? cause.message : "불꽃놀이를 확인하지 못했어요. 다시 눌러 주세요.", { kind: "info" });
    } finally {
      if (aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && (ticketRef.current === ticket || ticketRef.current === null)) {
        fireworksBusyRef.current = false; setFireworksBusy(false);
      }
    }
  };

  const changeLighting = async (mode: RoomLightingMode) => {
    const ticket = ticketRef.current, engine = engineRef.current, visit = visitGenerationRef.current;
    if (!ticket || !engine || !lightingControl || lightingBusyRef.current || blockedRef.current || lost) return;
    const belongsToVisit = () => aliveRef.current && !blockedRef.current && engineRef.current === engine && ticketRef.current === ticket && visitGenerationRef.current === visit;
    lightingBusyRef.current = true; setLightingBusy(mode); haptic();
    try {
      const next = await setBeachLighting(ticket, mode);
      if (!belongsToVisit()) return;
      if (mode === "auto") previewHourRef.current = null;
      applyLighting(next, true);
    } catch (cause) {
      if (!belongsToVisit()) return;
      if (cause instanceof BeachGone) { ticketRef.current = null; setLightingControl(false); scheduleTick(0); }
      if (cause instanceof BeachUnavailable && [401, 403].includes(cause.status)) setLightingControl(false);
      showToast(cause instanceof Error ? cause.message : "방의 시간을 바꾸지 못했어요. 다시 시도해 주세요.", { kind: "info" });
    } finally {
      if (aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && (ticketRef.current === ticket || ticketRef.current === null)) {
        lightingBusyRef.current = false; setLightingBusy(null);
      }
    }
  };

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
    const isPavilion = spotId.startsWith("pavilion-") || spotId.startsWith("hall-tier-");
    const isOnsenSeat = spotId === "onsen-benches", isOnsenFloat = spotId === "onsen-float";
    const isOnsen = isOnsenSeat || isOnsenFloat;
    const isBed = !isBench && !isOnsen && !isPavilion && spotId !== "starlight";
    const enabled = () => isOnsen ? onsenEnabledRef.current : isBench ? benchEnabledRef.current : isPavilion ? pavilionEnabledRef.current : isBed ? bedEnabledRef.current : restEnabledRef.current;
    if (!engine || !enabled() || skyBusyRef.current || woodBusyRef.current || powderBusyRef.current || blockedRef.current) return;
    const currentOnsen = engine.onsenState;
    const pavilionSeated = engine.isPavilionSeated === true;
    if ((engine.isBenchSeated && !isBench) || (pavilionSeated && !isPavilion) || (engine.isLying && (isBench || isOnsenSeat || isPavilion))
      || (currentOnsen.sitting && !isOnsenSeat) || (currentOnsen.floating && !isOnsenFloat)) {
      showToast("다른 자리로 가려면 먼저 일어나 주세요.", { kind: "info" });
      return;
    }
    if (isPavilion && !pavilionSeated) {
      const nearby = engine.getPavilionState();
      if (!nearby.near || !nearby.available) {
        showToast(nearby.near ? (nearby.kind === "hall" ? "가까운 자리가 찼어요. 벤치의 다른 자리로 가 주세요." : "가까운 자리가 찼어요. 마루의 다른 쪽으로 가 주세요.") : spotId.startsWith("hall-tier-") ? "벤치 가까이에서 앉을 수 있어요." : "정자 마루 끝 가까이에서 앉을 수 있어요.", { kind: "info" });
        return;
      }
    }
    if (isOnsen && !currentOnsen.sitting && !currentOnsen.floating
      && !(isOnsenSeat ? currentOnsen.canSit : currentOnsen.canFloat)) {
      showToast(isOnsenSeat ? "온천 안 낮은 돌단 가까이에서 앉을 수 있어요." : "온천 안의 빈 수면 자리 가까이에서 쉴 수 있어요.", { kind: "info" });
      return;
    }
    if (isBench && !engine.isBenchSeated) {
      const nearby = engine.getBenchState();
      if (!nearby.near || !nearby.available) {
        showToast(nearby.near ? "가까운 자리가 찼어요. 다른 벤치 쪽으로 가 주세요." : "모닥불 벤치 가까이에서 앉을 수 있어요.", { kind: "info" });
        return;
      }
    }
    const destination = isBench ? engine.getBenchState() : isPavilion ? engine.getPavilionState() : isBed ? engine.getBedState() : stargazing;
    if (!isOnsen && !engine.isLying && !engine.isBenchSeated && !pavilionSeated && (!destination || destination.occupied >= destination.capacity)) return;
    const operation = ++skyOperationRef.current;
    const visit = visitGenerationRef.current;
    const actor = meRef.current?.id;
    const current = () => aliveRef.current && !blockedRef.current && skyOperationRef.current === operation && engineRef.current === engine && visitGenerationRef.current === visit;
    const action = engine.isLying || engine.isBenchSeated || pavilionSeated || currentOnsen.sitting ? "stand" : isBench || isOnsenSeat || isPavilion ? "sit" : "lie";
    setRestActionSpot(spotId);
    engine.select(null);
    setCarePrompt(null);
    const changePhase = (next: SkyPhase) => {
      skyBusyRef.current = next;
      setSkyPhase(next);
    };
    haptic();
    try {
      if (action === "lie" && !isOnsen) {
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
      if (!ticketRef.current) throw new Error("다시 연결하고 있어요. 잠시 후 다시 눌러 주세요.");
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
        showToast("다시 연결하고 있어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
      } else if (cause instanceof BeachUnavailable && (cause.status === 401 || cause.status === 403)) {
        stopWithError(cause);
      } else {
        if (cause instanceof BeachUnavailable && cause.status === 404) {
          if (isOnsen) { onsenEnabledRef.current = false; setOnsenEnabled(false); }
          else if (isBench) { benchEnabledRef.current = false; setBenchEnabled(false); }
          else if (isPavilion) { pavilionEnabledRef.current = false; setPavilionEnabled(false); }
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
  pavilionActionRef.current = () => { const spot = pavilionRef.current.spotId; if (spot) void toggleStargazing(spot); };
  boatActionRef.current = () => {
    const engine = engineRef.current;
    if (!engine || mapId !== "garden" || skyBusyRef.current || blockedRef.current) return;
    const result = engine.toggleBoat();
    if (!result) return;
    haptic();
    if (result === "boarded") showToast("나룻배가 곧 떠나요. 둘러보며 천천히 쉬어 가세요.", { kind: "info" });
    else if (result === "alighted") showToast("잔교에 내렸어요.", { kind: "info" });
  };

  /** 모닥불 앞까지 걸어간 뒤, 새 위치를 서버에 올리고(서버가 거리를 확인한다) 장작을 넣는다 */
  const onAddWood = useCallback(async (requestId: string, phase: (p: WoodPhase) => void) => {
    if (!fireEnabledRef.current) throw new Error("이곳에는 모닥불이 없어요.");
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
    if (!fireEnabledRef.current) throw new Error("이곳에는 모닥불이 없어요.");
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
  const activeBed = stargazing.lying || onsen.floating ? null : bed;
  const restArea = activeBed ?? stargazing;
  const areaEnabled = activeBed ? bedEnabled : restEnabled;
  const areaSpot = activeBed?.spotId ?? "starlight";
  const skyFull = !lying && restArea.occupied >= restArea.capacity;
  const returnHref = community ? route(`/c/${community.slug}`) : "/c/home";
  const hideHud = () => { setHudHidden(true); setCharacterPickerOpen(false); setPowderOpen(false); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); haptic(); window.requestAnimationFrame(() => restoreTriggerRef.current?.focus()); };
  const restoreHud = () => { setHudHidden(false); haptic(); window.requestAnimationFrame(() => actionsTriggerRef.current?.focus()); };
  const viewLabel = lying ? view === "third" ? activeBed ? "바다 보기" : "하늘 보기" : activeBed || onsen.floating ? "함께 보기" : "모여 보기" : view === "third" ? "내 눈으로" : "캐릭터 보기";
  const benchPhase = restActionSpot === "fire-benches" ? skyPhase : null;
  const benchContextVisible = mapId === "beach" && (bench.near || bench.seated || Boolean(benchPhase));
  const onsenPhase = restActionSpot?.startsWith("onsen-") ? skyPhase : null;
  const onsenResting = onsen.sitting || onsen.floating;
  const onsenContextVisible = mapId === "beach" && (onsenEnabled || onsenResting) && (onsen.inWater || onsenResting || Boolean(onsenPhase));
  const pavilionPhase = restActionSpot?.startsWith("pavilion-") || restActionSpot?.startsWith("hall-tier-") ? skyPhase : null;
  const pavilionContextVisible = (mapId === "bamboo" || mapId === "garden") && (pavilion.near || pavilion.seated || Boolean(pavilionPhase)) && !boat?.riding;
  const boatContextVisible = mapId === "garden" && Boolean(boat && (boat.near || boat.riding)) && !pavilion.seated;
  const seatNoun = pavilion.kind === "deck" ? "전망대" : pavilion.kind === "hall" ? "자리" : "정자";
  const pavilionTitle = pavilionPhase === "standing" ? "일어나는 중…" : pavilion.seated ? `${seatNoun}에서 일어나기` : pavilionPhase === "joining" ? "자리 잡는 중…" : !pavilion.available ? "가까운 자리가 찼어요" : `${seatNoun}에 앉기`;
  const pavilionDetail = pavilion.seated
    ? (pavilion.kind === "deck" ? `${pavilion.name}에서 도시 불빛을 바라보는 중` : pavilion.kind === "hall" ? (rain > 0.05 ? `${pavilion.name} · 비 내리는 호수를 바라보며 머무는 중` : `${pavilion.name} · 통창 너머 호수를 바라보는 중`) : `${pavilion.name}에 걸터앉아 숲을 바라보는 중`)
    : !pavilionEnabled ? "앉을 자리를 준비하고 있어요"
    : !pavilion.available ? (pavilion.kind === "deck" ? "의자의 다른 자리로 가 주세요" : pavilion.kind === "hall" ? "벤치의 다른 자리로 가 주세요" : "마루의 다른 쪽으로 가 주세요")
    : pavilion.kind === "deck" ? `${pavilion.name} · 난간 앞 의자에 앉아 야경을 봐요` : pavilion.kind === "hall" ? `${pavilion.name} · 벤치에 앉아 통창 너머 호수를 봐요` : `${pavilion.name} · 마루 끝에 걸터앉아 쉬어요`;
  const boatTitle = !boat ? "" : !boat.riding ? "나룻배 타기" : boat.docked ? "내리기" : boat.alightArmed ? "내리기 취소" : "다음 정류장에서 내리기";
  const boatDetail = !boat ? "" : !boat.riding ? `${boat.near?.name ?? "잔교"} · 호수를 한 바퀴 천천히 떠가요` : boat.docked ? `${boat.stop?.name ?? "정류장"}에 서 있어요 · 잠시 뒤 출발` : boat.alightArmed ? `${boat.nextStop?.name ?? "다음 정류장"}에서 내려요` : `다음은 ${boat.nextStop?.name ?? "정류장"} · ${rain > 0.05 ? "빗속을 떠가는 중" : "호수를 떠가는 중"}`;
  const restContextVisible = !bench.seated && !pavilion.seated && !onsenResting && !onsenPhase && (lying || (Boolean(skyPhase) && !benchPhase && !pavilionPhase) || Boolean(activeBed?.near) || stargazing.near);
  const walking = skyPhase === "walking" || (!bench.seated && (woodBusy || powderPhase === "walking"));
  const guestbookVisible = mapId === "bamboo" && nearGuestbook && Boolean(ticketRef.current);
  const contextVisible = restContextVisible || benchContextVisible || onsenContextVisible || pavilionContextVisible || boatContextVisible || guestbookVisible || Boolean(rest) || walking;
  const fireContextVisible = mapId === "beach" && fireEnabled && nearFire && !lying && !characterPickerOpen && Boolean(fire && meRef.current);

  return (
    <div className={styles.root} data-map={mapId} data-night={nightControls} inert={Boolean(photo)}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`${community?.name ?? "소로우"}의 프라이빗 ${map.name} (${view === "first" ? "1인칭" : "3인칭"})`} />
      {flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.kind]}`} aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}

      <div className={styles.top} hidden={hudHidden}>
        <Link href={returnHref} className={styles.glass + " " + styles.exitButton} aria-label={`${map.name} 나가기`}><IconChevronL />나가기</Link>
        {phase === "ready" && <div className={styles.adminTools}>
          {(musicSnapshot || mapId === "uyuni") && ticketRef.current && <RoomMusicControls key={ticketRef.current} ticket={ticketRef.current}
            communityId={community?.id ?? communityId} mapId={mapId} music={musicSnapshot?.music} serverTime={musicSnapshot?.serverTime ?? 0}
            canControl={musicSnapshot !== null && musicControl} disabled={lost} onSnapshot={applyMusic}
            ambient={mapId === "uyuni" ? { volume: uyuniMusicVolume, onChange: volume => {
              const engine = engineRef.current;
              if (engine) { engine.setUyuniMusicVolume(volume); setUyuniMusicVolume(engine.uyuniMusicVolume); }
            } } : undefined} />}
          {fireworksControl && <RoomFireworksControls mapId={mapId} deadline={fireworksDeadline} busy={fireworksBusy} disabled={lost}
            tickets={fireworksFree ? null : fireworkTickets ?? 0} onUnlock={() => setTicketSheetOpen(true)}
            onLaunch={(variant) => void launchFireworks(variant)} />}
          {lightingControl && lighting && <RoomLightingControls mode={lighting.mode} open={lightingOpen}
            busy={lightingBusy} disabled={lost} onOpenChange={openLighting} onSelect={mode => void changeLighting(mode)} />}
        </div>}
      </div>
      <div className={styles.statusBar} hidden={hudHidden || lightingOpen}>
        {timeLabel && <span className={styles.glass + " " + styles.chip}>{timeLabel}</span>}
        {count !== null && <span className={styles.glass + " " + styles.chip} aria-label={`정원 ${capacity}명 중 지금 ${count}명`}><IconUsers />{count}<span className={styles.capacity}>/ {capacity}</span></span>}
      </div>

      {community && !hudHidden && !lightingOpen && phase === "ready" && intro !== "hidden" && <div className={`${styles.place} ${intro === "leaving" ? styles.placeLeaving : ""}`} aria-hidden={intro === "leaving"}>
        <span><IconLock />{map.eyebrow}</span>
        <h1>{community.name} {map.name}</h1>
        <p>{map.welcome}</p>
      </div>}

      {phase === "ready" && !photo && (!actionsOpen || hudHidden) && (!selected || hudHidden) && !characterPickerOpen && !lightingOpen && !powderOpen && powderPhase !== "adding" && !lying && !bench.seated && !pavilion.seated && !onsen.sitting && !boat?.riding && skyPhase !== "joining" && skyPhase !== "standing" && <Joystick onMove={(x, y) => engineRef.current?.setMove(x, y)} />}

      <div className={styles.bottomHud} hidden={hudHidden || phase !== "ready" || Boolean(photo)}>
        {lost && <p className={styles.dockNotice} role="status">연결을 다시 이어 보는 중…</p>}
        {!actionsOpen && (skyPhase || woodBusy || powderPhase) && <p className={styles.dockNotice} role="status">잠깐만요, 행동을 마치고 있어요.</p>}
        {hint && !actionsOpen && !selected && !lost && !lying && !bench.seated && !pavilion.seated && !onsen.sitting && <p className={styles.dockHint}>{mapId === "bamboo" ? "둘레길을 걷다 정자에 앉아 함께 쉬어요." : mapId === "garden" ? "호수를 걷고, 청우헌에 앉아 비 내리는 물을 바라봐요." : "걷고, 둘러보고, 행동을 골라 함께 쉬어요."}</p>}
        <section id={actionTrayId} className={styles.actionTray} hidden={!actionsOpen} aria-label={`${map.name} 행동`}>
          <div className={styles.trayHeader}>
            <div className={styles.trayHeading}>
              <strong>{carePrompt ? "마음을 건넬 사람을 골라요" : selected ? selected.nick + "님에게" : "무엇을 해볼까요?"}</strong>
              <small>{careBusy ? "마음을 전하는 중…" : carePrompt ? "직접 고르거나 화면 속 사람을 눌러요" : selected ? "인사와 작은 마음을 건네요" : lying ? "편안히 누워 쉬는 중" : bench.seated ? "모닥불 곁에 앉아 쉬는 중" : pavilion.seated ? (pavilion.kind === "hall" ? (rain > 0.05 ? "비 내리는 호수를 바라보는 중" : "통창 너머 호수를 바라보는 중") : "정자에 걸터앉아 쉬는 중") : boat?.riding ? "나룻배를 타고 호수를 떠가는 중" : "옆으로 넘겨 더 골라요"}</small>
            </div>
            {selected && !carePrompt && <button type="button" className={styles.traySmallButton} onClick={() => { engineRef.current?.select(null); setCarePrompt("wave"); }} aria-label="다른 사람 고르기"><IconUsers /></button>}
            <button type="button" className={styles.traySmallButton} aria-label={carePrompt ? "사람 고르기 닫기" : "행동 접기"} onClick={() => { if (carePrompt) setCarePrompt(null); else { setActionsOpen(false); engineRef.current?.select(null); actionsTriggerRef.current?.focus(); } }}><IconClose /></button>
          </div>
          {carePrompt && <div className={styles.peopleRow} role="group" aria-label="마음을 건넬 사람">
            {people.length ? people.map((person) => <button type="button" key={person.pid} className={styles.personChoice} onClick={() => engineRef.current?.select(person.pid)}><IconUser /><span>{person.nick}</span><small>선택하기</small></button>) : <p className={styles.emptyPeople}>아직 함께 쉬는 사람이 없어요.<br />누군가 오면 인사를 건네 보세요.</p>}
          </div>}
          <div className={styles.actionScroll} hidden={Boolean(carePrompt)} role="group" aria-label="할 수 있는 행동" tabIndex={0}>
            {mapId === "bamboo" && festival && !selected && <BambooFestivalControls held={festival.held} inFlight={Date.now() < flightUntil}
              disabled={lost || toyBusy} onChoose={choice => void useFestivalToy(choice)} />}
            {mapId === "uyuni" && momentsEnabled && <UyuniMomentControls
              key={communityId + ":" + meRef.current?.id}
              active={actionsOpen && !carePrompt && !photo && !hudHidden && !characterPickerOpen && phase === "ready"}
              disabled={lost || lying || Boolean(rest?.seated) || bench.seated || Boolean(skyPhase)}
              busy={momentBusy} cooldowns={momentDeadlines} onOpenChange={setMomentOpen}
              onSparkler={letter => launchMoment({ kind: "sparkler", letter })}
              onLantern={(color, wish) => launchMoment({ kind: "lantern", color, wish })} />}
            <button type="button" className={styles.actionTile + " " + styles.waveTile} disabled={cooling || lost || !careCapabilities.wave} onClick={() => sendCare("wave")}><span className={styles.actionIcon} aria-hidden="true">👋</span><strong>인사하기</strong><small>{careCapabilities.wave ? "반가운 마음" : "준비 중"}</small></button>
            <button type="button" className={styles.actionTile + " " + styles.comfortTile} disabled={cooling || lost} onClick={() => sendCare("comfort")}><span className={styles.actionIcon}><IconLeaf /></span><strong>위로 건네기</strong><small>따뜻한 마음</small></button>
            {careCapabilities.hug && <button type="button" className={styles.actionTile + " " + styles.hugTile} disabled={cooling || lost} onClick={() => sendCare("hug")}><span className={styles.actionIcon}><IconHeart /></span><strong>안아주기</strong><small>관리자 포옹</small></button>}
          </div>
          {gotAny && !carePrompt && <p className={styles.receivedMini}>받은 인사 {received.wave ?? 0} · 위로 {received.comfort} · 포옹 {received.hug}</p>}
        </section>
        {contextVisible && !characterPickerOpen && !powderOpen && <div className={styles.contextActions} aria-label="가까운 자리에서 쉬기">
          {guestbookVisible && <button type="button" className={styles.contextButton} disabled={lost} aria-haspopup="dialog"
            onClick={() => { setActionsOpen(false); setGuestbookOpen(true); haptic(); }}>
            <span className={styles.contextIcon} aria-hidden="true">✎</span>
            <span className={styles.contextCopy}><strong>축제 게시판</strong><small>메모 읽기 · 포스트잇 붙이기</small></span>
          </button>}
          {lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "first"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}>
            <span className={styles.contextIcon}>{view === "third" ? <IconMoon /> : <IconUsers />}</span>
            <span className={styles.contextCopy}><strong>{viewLabel}</strong><small>{view === "third" ? activeBed ? "누운 채 바다를 바라봐요" : "편안히 누워 하늘을 바라봐요" : "함께 쉬는 모습을 바라봐요"}</small></span>
          </button>}
          {benchContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!bench.seated && (!benchEnabled || !bench.available))} aria-pressed={bench.seated} aria-keyshortcuts="E" onClick={() => void toggleStargazing("fire-benches")}>
            <span className={styles.contextIcon}><IconSmile /></span>
            <span className={styles.contextCopy}><strong>{benchPhase === "standing" ? "일어나는 중…" : bench.seated ? "통나무에서 일어나기" : benchPhase === "joining" ? "자리 잡는 중…" : !bench.available ? "가까운 자리가 찼어요" : "통나무에 앉기"}</strong><small>{bench.seated ? "모닥불을 바라보며 쉬는 중" : !benchEnabled ? "앉을 자리를 준비하고 있어요" : !bench.available ? "다른 통나무 쪽으로 가 주세요" : "따뜻한 불 곁에서 함께 쉬어요"}</small></span>
            <span className={styles.contextCount} aria-label={`벤치 12석 중 ${bench.occupied}석 사용 중`}>{bench.occupied}/{bench.capacity}</span>
          </button>}
          {pavilionContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost || (!pavilion.seated && (!pavilionEnabled || !pavilion.available))} aria-pressed={pavilion.seated} aria-keyshortcuts="E" onClick={() => { const spot = pavilion.spotId; if (spot) void toggleStargazing(spot); }}>
            <span className={styles.contextIcon}><IconSmile /></span>
            <span className={styles.contextCopy}><strong>{pavilionTitle}</strong><small>{pavilionDetail}</small></span>
            <span className={styles.contextCount} aria-label={`${seatNoun} ${pavilion.capacity}석 중 ${pavilion.occupied}석 사용 중`}>{pavilion.occupied}/{pavilion.capacity}</span>
          </button>}
          {boatContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost} aria-pressed={boat?.riding === true} aria-keyshortcuts="E" onClick={() => boatActionRef.current()}>
            <span className={styles.contextIcon}><IconLeaf /></span>
            <span className={styles.contextCopy}><strong>{boatTitle}</strong><small>{boatDetail}</small></span>
          </button>}
          {restContextVisible && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!lying && (!areaEnabled || skyFull))} onClick={() => void toggleStargazing(areaSpot)}>
            <span className={styles.contextIcon}><IconMoon /></span>
            <span className={styles.contextCopy}><strong>{skyPhase === "standing" ? "일어나는 중…" : lying ? "일어나기" : skyPhase === "walking" ? "자리로 가는 중…" : skyPhase === "joining" ? "자리 잡는 중…" : activeBed ? "이불 덮고 눕기" : skyFull ? "모든 자리가 찼어요" : "같이 눕기"}</strong><small>{lying ? activeBed ? "포근한 이불 속에서 쉬는 중" : "함께 하늘을 보는 중" : !areaEnabled ? "쉬어갈 자리를 준비하고 있어요" : activeBed ? activeBed.shelterName : "별빛 자리에서 쉬어가요"}</small></span>
            <span className={styles.contextCount}>{restArea.occupied}/{restArea.capacity}</span>
          </button>}
          {onsenContextVisible && (onsenResting ? <button type="button" className={styles.contextButton}
            disabled={Boolean(skyPhase) || lost} onClick={() => void toggleStargazing(onsen.sitting ? "onsen-benches" : "onsen-float")}>
            <span className={styles.contextIcon}><IconLeaf /></span><span className={styles.contextCopy}><strong>{onsenPhase === "standing" ? "일어나는 중…" : "일어나기"}</strong><small>{onsen.sitting ? "따뜻한 물에 앉아 쉬는 중" : "수면에 기대어 편안히 쉬는 중"}</small></span>
          </button> : <>
            <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost || !onsen.canSit}
              onClick={() => void toggleStargazing("onsen-benches")}>
              <span className={styles.contextIcon}><IconSmile /></span><span className={styles.contextCopy}><strong>{restActionSpot === "onsen-benches" && onsenPhase ? "자리 잡는 중…" : "앉아있기"}</strong><small>{onsen.canSit ? "낮은 돌단에 앉아 바다를 바라봐요" : onsen.occupiedSeats.length >= 6 ? "앉을 자리가 모두 사용 중이에요" : "낮은 돌단 가까이 다가가 주세요"}</small></span>
              <span className={styles.contextCount} aria-label={`온천 돌단 6석 중 ${onsen.occupiedSeats.length}석 사용 중`}>{onsen.occupiedSeats.length}/6</span>
            </button>
            <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost || !onsen.canFloat}
              onClick={() => void toggleStargazing("onsen-float")}>
              <span className={styles.contextIcon}><IconMoon /></span><span className={styles.contextCopy}><strong>{restActionSpot === "onsen-float" && onsenPhase ? "자리 잡는 중…" : "온천에 떠있기"}</strong><small>{onsen.canFloat ? "물에 몸을 맡기고 하늘을 바라봐요" : onsen.occupiedFloats.length >= 3 ? "수면 자리가 모두 사용 중이에요" : "온천 앞쪽의 빈자리로 다가가 주세요"}</small></span>
              <span className={styles.contextCount} aria-label={`온천 수면 3자리 중 ${onsen.occupiedFloats.length}자리 사용 중`}>{onsen.occupiedFloats.length}/3</span>
            </button>
          </>)}
          {rest && !lying && !bench.seated && !onsenResting && !skyPhase && <button type="button" className={styles.contextButton} disabled={woodBusy || Boolean(powderPhase)} onClick={() => { engineRef.current?.select(null); engineRef.current?.toggleRest(); }}><span className={styles.contextIcon}><IconSmile /></span><span className={styles.contextCopy}><strong>{rest.seated ? "앉은 자리에서 일어나기" : "앉아서 쉬기"}</strong><small>{rest.shelterName} · 바다를 바라봐요</small></span></button>}
          {walking && <button type="button" className={styles.contextButton + " " + styles.contextCancel} onClick={() => engineRef.current?.cancelAutoWalk()}><span className={styles.contextIcon}><IconClose /></span><span className={styles.contextCopy}><strong>걸음 멈추기</strong><small>천천히 가도 돼요</small></span></button>}
        </div>}
        {characterPickerOpen && <div ref={characterPickerRef} id={characterPickerId} className={styles.characterPanel + " " + styles.dockCharacterPanel}>
          <div className={styles.characterPanelHead}><strong>내 캐릭터</strong><button type="button" aria-label="캐릭터 선택 닫기" onClick={() => { setCharacterPickerOpen(false); characterTriggerRef.current?.focus(); }}><IconClose /></button></div>
          <div className={styles.characterChoices} role="group" aria-label="캐릭터 선택">
            {BEACH_CHARACTERS.map((option) => <button key={option.id} type="button" className={styles.characterChoice} aria-pressed={character === option.id} onClick={() => chooseCharacter(option.id)}>
              <span className={styles.characterModel} style={{ backgroundImage: assetCssUrl(option.preview) }} aria-hidden="true" />
              <span className={styles.characterLabel}>{option.label}</span>
              {character === option.id && <span className={styles.characterSelected} aria-hidden="true"><IconCheck /></span>}
            </button>)}
          </div><p>고르면 내 모습이 바로 보여요.</p>
        </div>}
        {mapId === "beach" && fireEnabled && <div className={styles.fireContext} role="group" aria-label="모닥불 돌보기" hidden={!fireContextVisible}>
          {fire && meRef.current && <CampfireControls key={communityId + ":" + meRef.current.id}
            fire={fire} near={nearFire} disconnected={lost || Boolean(skyPhase) || characterPickerOpen || lying || Boolean(photo)}
            onAddWood={onAddWood} onAddPowder={onAddPowder} onFireChange={applyFire}
            powderOpen={powderOpen} onPowderOpenChange={setPowderOpen}
          />}
        </div>}
        <nav className={styles.dock} aria-label={`${map.name} 조작`} data-lying={lying}>
          <button ref={actionsTriggerRef} type="button" className={styles.dockButton} aria-expanded={actionsOpen} aria-controls={actionTrayId} onClick={() => { haptic(); setActionsOpen((open) => !open); setCarePrompt(null); setCharacterPickerOpen(false); if (actionsOpen) engineRef.current?.select(null); }}><IconSparkle /><span>행동</span></button>
          <button ref={cameraTriggerRef} type="button" className={styles.dockButton} aria-label={capturing ? "사진을 담는 중" : "풍경 사진 찍기"} disabled={capturing || Boolean(skyPhase) || woodBusy || Boolean(powderPhase)} onClick={() => void takePhoto()}><CameraIcon /><span>{capturing ? "담는 중" : "사진"}</span></button>
          {!lying && <button type="button" className={styles.dockButton} disabled={Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "third"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}><IconUsers /><span>시점</span></button>}
          <button ref={characterTriggerRef} type="button" className={styles.dockButton} aria-label="내 캐릭터 고르기" aria-expanded={characterPickerOpen} aria-controls={characterPickerId} onClick={() => { haptic(); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); setCharacterPickerOpen((open) => !open); }}><IconUser /><span>내 캐릭터</span></button>
          {mapId !== "uyuni" ? <FieldSoundControl map={mapId} buttonClass={styles.dockButton} volume={fieldVolume} open={fieldOpen}
            onOpenChange={open => {
              if (open) { setActionsOpen(false); setCharacterPickerOpen(false); setCarePrompt(null); engineRef.current?.select(null); }
              setFieldOpen(open);
            }} onChange={volume => { const eng = engineRef.current; if (eng) { eng.setFieldVolume(volume); setFieldVolume(eng.fieldVolume); } }}
            onToggleMute={() => { const eng = engineRef.current; if (eng) { eng.setFireworksMuted(eng.fieldVolume > 0); setFieldVolume(eng.fieldVolume); } }} />
          : <button type="button" className={styles.dockButton} aria-label="폭죽 소리" aria-pressed={!fireworksMuted}
            title={"폭죽 소리" + (fireworksMuted ? " 켜기" : " 끄기")} onClick={() => {
              engineRef.current?.setFireworksMuted(!fireworksMuted);
              setFireworksMuted(!fireworksMuted);
            }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9h4l5-4v14l-5-4H3z" />
              {fireworksMuted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
            </svg>
            <span>폭죽음</span>
          </button>}
        </nav>
      </div>
      {!hudHidden && phase === "ready" && <button type="button" className={styles.hideHud} aria-label="화면 버튼 숨기기" disabled={capturing} onClick={hideHud}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M9.5 5.7A11 11 0 0 1 12 5.4c6 0 9.5 6.6 9.5 6.6a17 17 0 0 1-3.3 4M14.2 18.4a11 11 0 0 1-2.2.2C6 18.6 2.5 12 2.5 12a17 17 0 0 1 3.2-4M10 10a3 3 0 0 0 4 4" /></svg><span>숨김</span></button>}
      {hudHidden && phase === "ready" && <button ref={restoreTriggerRef} type="button" className={styles.restoreHud} onClick={restoreHud} aria-label="화면 버튼 다시 보기"><IconSparkle /><span>버튼 보기</span></button>}

      {phase === "loading" && (
        <div className={styles.center} role="status" aria-live="polite">
          <p className={styles.loadingDots}>{map.loading}</p>
          <small>{map.loadingDetail}</small>
        </div>
      )}
      {phase === "error" && (
        <div className={styles.center} role="alert">
          <p>{error}</p>
          <Link href={returnHref} className={styles.glass}><IconChevronL />소로우로 돌아가기</Link>
        </div>
      )}
      {!fireworksFree && <FireworkTicketSheet portal open={ticketSheetOpen} loginNext={mapId} onClose={() => setTicketSheetOpen(false)}
        onTickets={(next) => setFireworkTickets(next)} />}
      {photo && <PhotoPreview key={photo.url} photo={photo} onClose={closePhoto} />}
      {guestbookInSight && phase === "ready" && mapId === "bamboo" && ticketRef.current &&
        <BambooBulletin key={ticketRef.current} ticket={ticketRef.current} initialName={meRef.current?.nick}
          open={guestbookOpen} onEntries={displayNotes} onClose={() => setGuestbookOpen(false)} />}
    </div>
  );
}
