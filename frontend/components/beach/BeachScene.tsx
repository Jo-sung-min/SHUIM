"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assetCssUrl } from "@/lib/assets";
import { MAPS, PUBLIC_SPACE_ID, mapEyebrow, type MapId } from "@/lib/beach/maps";
import { BeachEngine, webglSupported, type RestState, type StargazingState, type BedState, type BenchState, type OnsenState, type PavilionState, type ViewMode, type BoatRideState, type BunkerState } from "@/lib/beach/engine";
import { BeachGone, BeachUnavailable, BeachCooldown, enterBeach, leaveBeach, suspendBeach, tickBeach, playBoardGame, type BoardGame, addFirewood, addFirePowder, setBeachRest, setBeachLighting, launchBeachFireworks, enterBeachBunker, type FireworkEvent, type FireworkVariant, type RoomLighting, type RoomLightingMode, type FireState, type PowderColor, type CareEvent, type CareKind, type RemotePlayer, type EnterResponse } from "@/lib/beach/net";
import { attachBeachLifecycle, beachTickDelay, forgetBeachVisit, readBeachVisit, sameBeachRoster, sameFireDisplay, saveBeachVisit, type SavedBeachVisit } from "@/lib/beach/continuity";
import { hourLabel, hourOverride, rainOverride } from "@/lib/beach/daylight";
import { ONSEN_SEATS_PER_BATH } from "@/lib/beach/onsen-rest";
import { BEACH_CHARACTERS, characterAfterEntry, characterSkin, savedCharacter, saveCharacter, savedChibi, saveChibi, type BeachCharacter } from "@/lib/beach/appearance";
import { fetchMe } from "@/lib/auth";
import type { ChibiPreview } from "@/lib/chibi/beach-preview";
import { createBeachPhoto, type BeachPhoto } from "@/lib/beach/photo";
import { showToast, toastSuccess, tick as haptic } from "@/lib/toast";
import { IconBoat, IconCheck, IconChevronL, IconChevronR, IconClose, IconFloat, IconHeart, IconLeaf, IconLie, IconLock, IconMoon, IconPen, IconSeat, IconSorowSmile, IconStand, IconSun, IconUser, IconUsers, IconSparkle, IconWave } from "@/components/Icons";
import { route } from "@/lib/routes";
import CampfireControls, { type WoodPhase } from "./CampfireControls";
import Joystick from "./Joystick";
import PhotoPreview, { CameraIcon } from "./PhotoPreview";
import RoomLightingControls from "./RoomLightingControls";
import RoomFireworksControls from "./RoomFireworksControls";
import FireworkTicketSheet from "@/components/FireworkTicketSheet";
import UyuniMomentControls from "./UyuniMomentControls";
import UyuniBunkerControls, { type BunkerAction } from "./UyuniBunkerControls";
import UyuniBookReader from "./UyuniBookReader";
import BunkerBoardGame, { type BoardAction } from "./BunkerBoardGame";
import { BUNKER_GAME_TABLES } from "@/lib/beach/uyuni-bunker-layout";
import GardenPondControls from "./GardenPondControls";
import BaikalJourney from "./BaikalJourney";
import BambooFestivalControls from "./BambooFestivalControls";
import BambooBulletin from "./BambooBulletin";
import type { BambooNote } from "@/lib/beach/bamboo-notes";
import FieldSoundControl from "./FieldSoundControl";
import RoomMusicControls from "./RoomMusicControls";
import BeachMenu from "./BeachMenu";
import menuStyles from "./BeachMenu.module.css";
import { readRoomMusic, type RoomMusicState } from "@/lib/beach/room-music";
import { readBeachReturn } from "@/lib/beach/return";
import { chooseBambooToy, type BambooFestivalState, type BambooToy } from "@/lib/beach/net";
import { launchUyuniMoment, type UyuniMoment, type UyuniMomentInput, type UyuniMomentCooldowns } from "@/lib/beach/net";
import { beachGardenMoment, type GardenMoment, type GardenMomentKind, type GardenMomentCooldowns } from "@/lib/beach/net";
import { SPARKLER_DRAW_END } from "@/lib/beach/sparkler-timing";
import styles from "./beach.module.css";

const CARE_LABEL: Record<CareKind, string> = { comfort: "위로를 건넸어요", hug: "안아 줬어요", wave: "인사를 건넸어요" };
const VIEW_KEY = "beach-view";
const INTRO_VISIBLE_MS = 4000;
const INTRO_FADE_MS = 700;
const EMPTY_ONSEN: OnsenState = { inWater: false, canSit: false, canFloat: false, sitting: false, floating: false, occupiedSeats: [], occupiedFloats: [] };
const EMPTY_PAVILION: PavilionState = { near: false, seated: false, occupied: 0, capacity: 6, available: false, spotId: null, name: "", kind: "pavilion" };
const EMPTY_BUNKER: BunkerState = { bunkerId: null, nearId: null, name: "", inside: false, ladderNear: false, sofaNear: false, seated: false, spotId: null, gameNearId: null, bookNear: false, occupied: 0, capacity: 21, available: false };
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
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BeachEngine | null>(null);
  const ticketRef = useRef<string | null>(null);
  const meRef = useRef<{ pid: string; id: string; nick: string } | null>(null);
  const pendingCareRef = useRef<{ to: string; nick: string; kind: CareKind } | null>(null);
  const careBusyRef = useRef(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const actionScrollRef = useRef<HTMLDivElement>(null);
  const peopleRowRef = useRef<HTMLDivElement>(null);
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
  const bunkerActionRef = useRef<() => void>(() => {});
  const bunkerEnabledRef = useRef(false);
  const boardGamesRef = useRef<BoardGame[]>([]);
  const boardBusyRef = useRef(false);
  const bunkerBusyRef = useRef<BunkerAction | null>(null);
  const bunkerOperationRef = useRef(0);
  const bunkerInsideRef = useRef(false);
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
  const pondBusyRef = useRef(false);
  const pondOperationRef = useRef(0);
  const pondRequestRef = useRef<{ id: string; kind: GardenMomentKind } | null>(null);
  const pondClockRef = useRef<{ time: number; events: GardenMoment[]; cooldowns: GardenMomentCooldowns }>({ time: -1, events: [], cooldowns: { coin: 0, duck: 0 } });

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(20);
  const [community, setCommunity] = useState<EnterResponse["community"] | null>(null);
  const [selected, setSelected] = useState<RemotePlayer | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [received, setReceived] = useState<{ comfort: number; hug: number; wave?: number }>({ comfort: 0, hug: 0, wave: 0 });
  const [careCapabilities, setCareCapabilities] = useState({ wave: false, hug: false });
  const [careBusy, setCareBusy] = useState(false);
  const [people, setPeople] = useState<RemotePlayer[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionOverflow, setActionOverflow] = useState({ previous: false, next: false });
  const [hudHidden, setHudHidden] = useState(false);
  const [carePrompt, setCarePrompt] = useState<CareKind | null>(null);
  const [flash, setFlash] = useState<{ kind: CareKind; id: number } | null>(null);
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
  const [pondEnabled, setPondEnabled] = useState(false);
  const [pondBusy, setPondBusy] = useState<GardenMomentKind | null>(null);
  const [pondDeadlines, setPondDeadlines] = useState<GardenMomentCooldowns>({ coin: 0, duck: 0 });
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
  // 관리자 미리보기: 내 화면에서만 내 캐릭터를 치비로 그린다. 방 서버에는 원래 캐릭터(skin)를 그대로 보낸다.
  const [chibiAdmin, setChibiAdmin] = useState(false);
  const [chibiOn, setChibiOn] = useState(false);
  const [chibiBusy, setChibiBusy] = useState(false);
  const chibiRef = useRef<ChibiPreview | null>(null);
  const chibiWantedRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [bunker, setBunker] = useState<BunkerState>(EMPTY_BUNKER);
  const [bookOpen, setBookOpen] = useState(false);
  const [bunkerEnabled, setBunkerEnabled] = useState(false);
  const [boardGames, setBoardGames] = useState<BoardGame[]>([]);
  const [boardTableId, setBoardTableId] = useState<string | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [bunkerBusy, setBunkerBusy] = useState<BunkerAction | null>(null);
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

  // 들어온 방의 계정이 관리자일 때만 치비 선택지를 보이고, 지난번에 켜 둔 상태를 되살린다
  useEffect(() => {
    if (phase !== "ready") return;
    let alive = true;
    void fetchMe().then((account) => {
      const id = meRef.current?.id;
      if (!alive || !id) return;
      const admin = Boolean(account.admin && account.user?.id === id);
      setChibiAdmin(admin);
      setChibiOn(admin && savedChibi(id));
    });
    return () => { alive = false; };
  }, [phase]);

  // 켜면 치비를 (워커에서 한 번만) 빚어 엔진에 넘기고, 끄면 원래 아바타로 돌린다
  useEffect(() => {
    const wanted = chibiOn && chibiAdmin;
    chibiWantedRef.current = wanted;
    const engine = engineRef.current;
    if (!wanted) { if (chibiRef.current) engine?.setChibiSelf(null); return; }
    if (chibiRef.current) { engine?.setChibiSelf(chibiRef.current.character); return; }
    let alive = true;
    setChibiBusy(true);
    import("@/lib/chibi/beach-preview")
      .then((m) => m.createChibiPreview(1.35))
      .then((preview) => {
        if (!alive || chibiRef.current) { preview.dispose(); return; }
        chibiRef.current = preview;
        if (chibiWantedRef.current) engineRef.current?.setChibiSelf(preview.character);
      })
      .catch(() => {
        if (!alive) return;
        setChibiOn(false);
        showToast("치비를 불러오지 못했어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
      })
      .finally(() => setChibiBusy(false));
    return () => { alive = false; };
  }, [chibiOn, chibiAdmin]);

  useEffect(() => () => { chibiRef.current?.dispose(); chibiRef.current = null; }, []);

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
      return;
    }
    setIntro("visible");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeTimer = window.setTimeout(() => setIntro(reducedMotion ? "hidden" : "leaving"), INTRO_VISIBLE_MS);
    const removeTimer = window.setTimeout(() => setIntro("hidden"), INTRO_VISIBLE_MS + INTRO_FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
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
    // The Baikal storm follows its own schedule whatever the room clock says; only a dev override pins it.
    engine.setRainOverride(mapId === "baikal" ? (next.version === 0 ? rainOverride(window.location.search) : null)
      : next.mode === "rainy-night" ? .78 : next.mode === "auto"
      ? next.version === 0 ? rainOverride(window.location.search) : null : 0);
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

  const changeMenu = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) { setCharacterPickerOpen(false); setFieldOpen(false); setLightingOpen(false); }
    haptic();
  }, []);
  useEffect(() => { if (hudHidden || photo || phase !== "ready") setMenuOpen(false); }, [hudHidden, photo, phase]);

  const resetMoments = useCallback((preserveRequest = false) => {
    pondOperationRef.current++;
    pondBusyRef.current = false;
    if (!preserveRequest) pondRequestRef.current = null;
    pondClockRef.current = { time: -1, events: [], cooldowns: { coin: 0, duck: 0 } };
    setPondEnabled(false); setPondBusy(null); setPondDeadlines({ coin: 0, duck: 0 });
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

  const applyPondMoments = useCallback((events: GardenMoment[] | undefined, serverTime: number | undefined, cooldowns: GardenMomentCooldowns | undefined, append = false) => {
    if (!Number.isSafeInteger(serverTime) || !cooldowns) return;
    const time = serverTime!, previous = pondClockRef.current;
    if (time < previous.time) return;
    const live = new Map((append || time === previous.time ? previous.events : []).map(event => [event.id, event]));
    for (const event of events ?? []) live.set(event.id, event);
    const current = [...live.values()].filter(event => event.startedAt + event.durationMs > time);
    const nextCooldowns = time === previous.time
      ? { coin: Math.max(previous.cooldowns.coin, cooldowns.coin), duck: Math.max(previous.cooldowns.duck, cooldowns.duck) } : cooldowns;
    engineRef.current?.applyGardenMoments(current, time);
    pondClockRef.current = { time, events: current, cooldowns: nextCooldowns };
    if (previous.time < 0 || previous.cooldowns.coin !== nextCooldowns.coin || previous.cooldowns.duck !== nextCooldowns.duck) {
      const deadline = (until: number) => until > time ? Date.now() + until - time : 0;
      setPondDeadlines({ coin: deadline(nextCooldowns.coin), duck: deadline(nextCooldowns.duck) });
    }
  }, []);

  useEffect(() => {
    if (!lightingControl || hudHidden || photo || phase !== "ready" || actionsOpen || characterPickerOpen || powderOpen) setLightingOpen(false);
  }, [lightingControl, hudHidden, photo, phase, actionsOpen, characterPickerOpen, powderOpen]);

  useEffect(() => { if (hudHidden || photo || phase !== "ready" || lost || mapId === "uyuni") setFieldOpen(false); }, [hudHidden, photo, phase, lost, mapId]);
  // Only a board that is really on screen may take the controls away.
  const boardPanelOpen = boardTableId !== null && boardGames.some(board => board.id === boardTableId);
  const controlsPaused = bookOpen || boardPanelOpen || Boolean(photo) || fieldOpen || guestbookOpen || characterPickerOpen || lightingOpen || momentOpen || momentBusy || bunkerBusy !== null || (!hudHidden && selected !== null) || powderOpen || powderPhase === "adding" || skyPhase === "joining" || skyPhase === "standing";
  useEffect(() => {
    engineRef.current?.setInputPaused(controlsPaused);
    controlsPausedRef.current = controlsPaused;
  }, [controlsPaused, phase]);

  useEffect(() => { if (lying || !nearFire) setPowderOpen(false); }, [lying, nearFire]);

  useEffect(() => {
    if (!actionsOpen) return;
    const row = carePrompt ? peopleRowRef.current : actionScrollRef.current;
    if (!row) return;
    const measure = () => {
      const previous = row.scrollLeft > 1;
      const next = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setActionOverflow(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    for (const child of Array.from(row.children)) resize.observe(child);
    row.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { resize.disconnect(); row.removeEventListener("scroll", measure); };
  }, [actionsOpen, carePrompt, selected?.pid, people.length, festival?.held, careCapabilities.hug, momentsEnabled]);

  const scrollActions = (direction: -1 | 1) => {
    const row = carePrompt ? peopleRowRef.current : actionScrollRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * Math.max(72, row.clientWidth * .8),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

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
    bunkerOperationRef.current++;
    bunkerBusyRef.current = null;
    setBunkerBusy(null);
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

  /** A move's own reply can beat an older poll home, so a board only ever steps forward. */
  const applyBoardGames = useCallback((incoming: readonly BoardGame[] | undefined) => {
    const current = boardGamesRef.current, next = (incoming ?? []).map(board => {
      const seen = current.find(item => item.id === board.id);
      return seen && seen.version >= board.version ? seen : board;
    });
    if (next.length === current.length && next.every((board, index) => board === current[index])) return;
    boardGamesRef.current = next;
    setBoardGames(next);
    engineRef.current?.setBoardGames(next);
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
    setPondEnabled(entered.gardenMomentsEnabled === true);
    applyPondMoments(entered.gardenMoments, entered.serverTime, entered.gardenMomentCooldowns);
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
    bunkerEnabledRef.current = mapId === "uyuni" && entered.bunkerEnabled === true;
    setBunkerEnabled(bunkerEnabledRef.current);
    // Only the server may preserve a rest slot; a live local walk keeps its most recent position.
    engine.restoreVisit(entered.spawn, entered.selfRest, camera,
      sameAccount && !engine.isLying && !engine.isBenchSeated && !engine.isPavilionSeated && !engine.onsenState.sitting, entered.bounds);
    rememberVisit(true);
    applyFire(entered.fire);
    return true;
  }, [communityId, mapId, applyFire, adoptCharacter, applyLighting, applyFireworks, resetFireworks, applyMoments, resetMoments, applyPondMoments, rememberVisit, applyFestival, applyMusic]);

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
        bunkerId: self.bunkerId ?? null,
        character: characterRef.current ?? undefined,
        care: care ? { to: care.to, kind: care.kind } : undefined,
      }, controller.signal);
      if (!belongsToVisit() || blockedRef.current) return false;
      if (res.sequence !== undefined && res.sequence < requestSequence) return false;
      sequenceRef.current = Math.max(sequenceRef.current, res.sequence ?? requestSequence);
      engine.setPlayers(res.players, { serverTime: res.serverTime, sentAt, receivedAt: performance.now() });
      // Someone across the board should see a move almost at once.
      const myPid = meRef.current?.pid;
      remoteMovingRef.current = res.players.some(player => player.moving) || Boolean(res.boardGames?.some(board => board.turn !== null && (board.black?.pid === myPid || board.white?.pid === myPid)));
      applyBoardGames(res.boardGames);
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
      applyPondMoments(res.gardenMoments, res.serverTime, res.gardenMomentCooldowns);
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
  }, [applyBoardGames, handleEvent, reenter, scheduleTick, stopWithError, applyFire, applyLighting, applyFireworks, applyMoments, applyPondMoments, applyMusic, rememberVisit]);
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
    bunkerEnabledRef.current = false; bunkerInsideRef.current = false; setBunkerEnabled(false); setBunker(EMPTY_BUNKER);
    boardGamesRef.current = []; setBoardGames([]); setBoardTableId(null);
    bunkerOperationRef.current++; bunkerBusyRef.current = null; setBunkerBusy(null);
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
        bunkerEnabledRef.current = mapId === "uyuni" && entered.bunkerEnabled === true;
        setBunkerEnabled(bunkerEnabledRef.current);
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
            onBunkerChange: (state) => {
              setBunker(state);
              if (!state.inside || !state.bookNear) setBookOpen(false);
              if (state.inside && !bunkerInsideRef.current) { setMomentOpen(false); setActionsOpen(false); }
              if (!state.inside && bunkerInsideRef.current) { setBoardTableId(null); boardGamesRef.current = []; setBoardGames([]); }
              bunkerInsideRef.current = state.inside;
            },
            onBunkerAction: () => bunkerActionRef.current(),
            onRainChange: (amount) => {
              if (rainRef.current === 0 && amount > 0.05) showToast("봄비가 내리기 시작해요. 청우헌 통창 아래에서 바라봐요.", { kind: "info" });
              rainRef.current = amount;
              setRain(amount);
            },
          },
        });
        engineRef.current = engine;
        // 다시 들어와 엔진이 새로 생겨도 관리자 치비 미리보기를 이어 간다
        if (chibiWantedRef.current && chibiRef.current) engine.setChibiSelf(chibiRef.current.character);
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
        setPondEnabled(entered.gardenMomentsEnabled === true);
        applyPondMoments(entered.gardenMoments, entered.serverTime, entered.gardenMomentCooldowns);
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
      pondOperationRef.current++;
      pondBusyRef.current = false; setPondBusy(null);
      bunkerOperationRef.current++;
      if (bunkerBusyRef.current) restMutationRef.current = false;
      bunkerBusyRef.current = null; setBunkerBusy(null);
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
        suspendBeach({ ticket, sequence, x: position.x, z: position.z, yaw: position.yaw, bunkerId: position.bunkerId ?? null });
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
      bunkerOperationRef.current++;
      bunkerBusyRef.current = null;
      restMutationRef.current = false;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [communityId, mapId, scheduleTick, stopWithError, applyFire, adoptCharacter, applyLighting, applyFireworks, resetFireworks, applyMoments, resetMoments, applyPondMoments, rememberVisit, applyFestival, applyMusic]);

  const launchPondMoment = async (kind: GardenMomentKind) => {
    const ticket = ticketRef.current, engine = engineRef.current, visit = visitGenerationRef.current;
    if (!ticket || !engine || mapId !== "garden" || !pondEnabled || pondBusyRef.current || blockedRef.current || lost || skyBusyRef.current
      || !pavilionRef.current.seated || pavilionRef.current.kind !== "bench" || !engine.isPavilionSeated
      || (!pondRequestRef.current && Date.now() < pondDeadlines[kind])) return;
    const epoch = requestEpochRef.current, operation = ++pondOperationRef.current;
    const ownsOperation = () => requestEpochRef.current === epoch && pondOperationRef.current === operation;
    const current = () => ownsOperation() && aliveRef.current && !blockedRef.current && engineRef.current === engine && ticketRef.current === ticket && visitGenerationRef.current === visit;
    const request = pondRequestRef.current ?? { id: crypto.randomUUID(), kind };
    const sameChoice = request.kind === kind;
    pondRequestRef.current = request;
    pondBusyRef.current = true; setPondBusy(request.kind); haptic();
    if (!sameChoice) showToast(request.kind === "coin" ? "앞서 던진 동전을 먼저 확인할게요." : "앞서 띄운 오리를 먼저 확인할게요.", { kind: "info" });
    try {
      const result = await beachGardenMoment(ticket, request.id, request.kind);
      if (!current()) return;
      pondRequestRef.current = null;
      applyPondMoments(result.events, result.serverTime, result.cooldowns, true);
      const live = result.event.startedAt + result.event.durationMs > Math.max(result.serverTime, pondClockRef.current.time);
      toastSuccess(!sameChoice ? `앞서 전한 마음을 확인했어요. ${kind === "coin" ? "동전" : "오리"}는 다시 눌러 띄워요` : !live ? "앞서 전한 마음을 확인했어요. 다시 눌러 새로 띄워요" : result.event.kind === "coin" ? "작은 소원이 물결을 따라 번져요" : "작은 오리가 물 위에 둥실 떠올라요");
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof BeachUnavailable || cause instanceof BeachCooldown || cause instanceof BeachGone) pondRequestRef.current = null;
      if (cause instanceof BeachGone) { ticketRef.current = null; setPondEnabled(false); scheduleTick(0); }
      if (cause instanceof BeachUnavailable && [401, 403, 404].includes(cause.status)) setPondEnabled(false);
      if (cause instanceof BeachCooldown) scheduleTick(0);
      showToast(cause instanceof Error ? cause.message : "마음을 확인하지 못했어요. 다시 눌러 주세요.", { kind: "info" });
    } finally {
      if (ownsOperation() && aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit) {
        pondBusyRef.current = false; setPondBusy(null);
      }
    }
  };

  const launchMoment = async (input: UyuniMomentInput): Promise<boolean> => {
    const ticket = ticketRef.current, engine = engineRef.current, visit = visitGenerationRef.current;
    if (!ticket || !engine || engine.bunkerId || bunkerBusyRef.current || !momentsEnabled || momentBusyRef.current || blockedRef.current || lost || lying || rest?.seated || bench.seated || skyPhase
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
    if (!ticket || !engine || engine.bunkerId || bunkerBusyRef.current || !fireworksControl || fireworksBusyRef.current || blockedRef.current || lost || Date.now() < fireworksDeadline) return;
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
    if (!engine || phase !== "ready" || captureBusyRef.current || bunkerBusyRef.current || skyBusyRef.current || woodBusyRef.current || powderBusyRef.current || blockedRef.current) return;
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
    const isPavilion = spotId.startsWith("pavilion-") || spotId.startsWith("hall-tier-") || spotId.startsWith("pond-bench-") || spotId.startsWith("cloud-pool-") || spotId === "cloud-lounge" || spotId.startsWith("baikal-");
    const isOnsenSeat = spotId === "onsen-benches", isOnsenFloat = spotId === "onsen-float";
    const isOnsen = isOnsenSeat || isOnsenFloat;
    const isBed = !isBench && !isOnsen && !isPavilion && spotId !== "starlight";
    const enabled = () => isOnsen ? onsenEnabledRef.current : isBench ? benchEnabledRef.current : isPavilion ? pavilionEnabledRef.current : isBed ? bedEnabledRef.current : restEnabledRef.current;
    if (!engine || engine.bunkerId || bunkerBusyRef.current || !enabled() || skyBusyRef.current || woodBusyRef.current || powderBusyRef.current || pondBusyRef.current || blockedRef.current) return;
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
        const message = spotId.startsWith("cloud-pool-")
          ? nearby.near ? "가까운 자리가 찼어요. 온천의 다른 쪽에서 쉬어가요." : "온천 가장자리 가까이에서 몸을 담글 수 있어요."
          : spotId === "cloud-lounge" ? nearby.near ? "가까운 자리가 찼어요. 소파의 다른 자리로 가 주세요." : "리조트 소파 가까이에서 앉을 수 있어요."
          : spotId.startsWith("baikal-") ? nearby.near ? "가까운 자리가 찼어요. 산장의 다른 자리로 가 주세요." : "소파나 방석 가까이에서 앉을 수 있어요."
          : nearby.near ? (nearby.kind === "bench" ? "두 자리가 찼어요. 다른 벤치에서 쉬어가요." : nearby.kind === "hall" ? "가까운 자리가 찼어요. 벤치의 다른 자리로 가 주세요." : "가까운 자리가 찼어요. 마루의 다른 쪽으로 가 주세요.") : spotId.startsWith("hall-tier-") || spotId.startsWith("pond-bench-") ? "벤치 가까이에서 앉을 수 있어요." : "정자 마루 끝 가까이에서 앉을 수 있어요.";
        showToast(message, { kind: "info" });
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
  const changeBunker = async (action: BunkerAction) => {
    const engine = engineRef.current;
    if (!engine || mapId !== "uyuni" || !bunkerEnabledRef.current || bunkerBusyRef.current || restMutationRef.current
      || skyBusyRef.current || momentBusyRef.current || fireworksBusyRef.current || captureBusyRef.current || blockedRef.current || lost) return;
    const state = engine.bunkerState;
    const id = state.bunkerId ?? state.nearId;
    const valid = action === "enter" ? !state.inside && state.nearId !== null
      : action === "exit" ? state.inside && state.ladderNear && !state.seated
      : action === "sit" ? state.inside && state.sofaNear && !state.seated && state.available : state.inside && state.seated;
    if (!id || !valid) return;
    const visit = visitGenerationRef.current, epoch = requestEpochRef.current, actor = meRef.current?.id;
    const operation = ++bunkerOperationRef.current;
    const ownsOperation = () => aliveRef.current && engineRef.current === engine && visitGenerationRef.current === visit && bunkerOperationRef.current === operation;
    const current = () => ownsOperation() && !blockedRef.current && requestEpochRef.current === epoch && meRef.current?.id === actor;
    bunkerBusyRef.current = action; setBunkerBusy(action); restMutationRef.current = true;
    engine.setInputPaused(true); engine.cancelAutoWalk(); engine.select(null);
    setActionsOpen(false); setCarePrompt(null); setMomentOpen(false); setCharacterPickerOpen(false);
    haptic();
    try {
      const deadline = performance.now() + 8500;
      while (inFlightRef.current && current()) {
        if (performance.now() >= deadline) throw new Error("연결이 늦어지고 있어요. 잠시 후 다시 눌러 주세요.");
        await new Promise(resolve => window.setTimeout(resolve, 40));
      }
      if (!current()) return;
      if (!(await runTick(true))) throw new Error("지금 서 있는 자리를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.");
      if (!current()) return;
      const ticket = ticketRef.current;
      if (!ticket || !bunkerEnabledRef.current) throw new Error("쉬어갈 공간을 다시 확인하고 있어요.");
      if (action === "enter" || action === "exit") {
        const confirmed = await enterBeachBunker(ticket, action, id, ++sequenceRef.current);
        if (!current() || ticketRef.current !== ticket) return;
        await engine.transitionBunker(confirmed);
      } else {
        const confirmed = await setBeachRest(ticket, action, `bunker-${id}-sofa`);
        if (!current() || ticketRef.current !== ticket) return;
        engine.applyRest(confirmed);
      }
      if (current()) rememberVisit(true);
    } catch (cause) {
      if (!current()) return;
      if (cause instanceof BeachGone) ticketRef.current = null;
      if (cause instanceof BeachUnavailable && [401, 403].includes(cause.status)) { stopWithError(cause); return; }
      if (cause instanceof BeachUnavailable && cause.status === 404) { bunkerEnabledRef.current = false; setBunkerEnabled(false); }
      showToast(cause instanceof Error ? cause.message : "자리를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.", { kind: "info" });
    } finally {
      if (ownsOperation()) {
        bunkerBusyRef.current = null; setBunkerBusy(null); restMutationRef.current = false;
        scheduleTick(0);
      }
    }
  };
  bunkerActionRef.current = () => {
    const state = engineRef.current?.bunkerState;
    if (!state) return;
    if (state.seated) void changeBunker("stand");
    else if (state.inside && state.ladderNear) void changeBunker("exit");
    else if (state.inside && state.sofaNear) void changeBunker("sit");
    else if (state.inside && state.gameNearId) { setActionsOpen(false); setBoardTableId(state.gameNearId); }
    else if (!state.inside && state.nearId) void changeBunker("enter");
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
  // 공용 공간은 소로우 화면이 없으므로 소로우 홈으로 돌아간다.
  const shared = (community?.id ?? communityId) === PUBLIC_SPACE_ID;
  const returnHref = community && !shared ? route(`/c/${community.slug}`) : "/c/home";
  /** 나가기: 소로우 페이지에서 들어왔으면 history 를 되돌려 (뒤로가기가 다시 바닷가로 오지 않게), 아니면 바닷가 기록을 소로우 페이지로 바꾼다 */
  const exitRoom = (event: MouseEvent) => {
    event.preventDefault();
    if (readBeachReturn() === returnHref && window.history.length > 1) router.back();
    else router.replace(returnHref);
  };
  const hideHud = () => { setHudHidden(true); setCharacterPickerOpen(false); setPowderOpen(false); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); haptic(); window.requestAnimationFrame(() => restoreTriggerRef.current?.focus()); };
  const restoreHud = () => { setHudHidden(false); haptic(); window.requestAnimationFrame(() => actionsTriggerRef.current?.focus()); };
  const viewLabel = lying && !onsen.floating ? view === "third" ? activeBed ? "바다 보기" : "하늘 보기" : activeBed ? "함께 보기" : "모여 보기" : view === "third" ? "내 눈으로" : "캐릭터 보기";
  const benchPhase = restActionSpot === "fire-benches" ? skyPhase : null;
  const benchContextVisible = mapId === "beach" && (bench.near || bench.seated || Boolean(benchPhase));
  const onsenPhase = restActionSpot?.startsWith("onsen-") ? skyPhase : null;
  const onsenResting = onsen.sitting || onsen.floating;
  const onsenContextVisible = mapId === "beach" && (onsenEnabled || onsenResting) && (onsen.inWater || onsenResting || Boolean(onsenPhase));
  const pavilionPhase = restActionSpot?.startsWith("pavilion-") || restActionSpot?.startsWith("hall-tier-") || restActionSpot?.startsWith("pond-bench-") || restActionSpot?.startsWith("cloud-pool-") || restActionSpot === "cloud-lounge" || restActionSpot?.startsWith("baikal-") ? skyPhase : null;
  const pavilionContextVisible = (mapId === "bamboo" || mapId === "garden" || mapId === "cloudspa" || mapId === "baikal") && (pavilion.near || pavilion.seated || Boolean(pavilionPhase)) && !boat?.riding;
  const boatContextVisible = mapId === "garden" && Boolean(boat && (boat.near || boat.riding)) && !pavilion.seated;
  const baikalSeat = mapId === "baikal", cloudPool = pavilion.kind === "pool", cloudLounge = pavilion.kind === "lounge" && !baikalSeat;
  const seatNoun = cloudPool ? "온천" : pavilion.kind === "lounge" ? "소파" : pavilion.kind === "hearth" ? "방석" : pavilion.kind === "deck" ? "전망대" : pavilion.kind === "bench" ? "벤치" : pavilion.kind === "hall" ? "자리" : "정자";
  // The cabin's seats each look at something different: the glass wall, the stove, or the storm from under the eave.
  const baikalView = pavilion.spotId?.endsWith("-side") || pavilion.kind === "hearth" ? "fire" : pavilion.kind === "bench" ? "porch" : "window";
  const pavilionTitle = pavilionPhase === "standing" ? cloudPool ? "온천에서 나오는 중…" : "일어나는 중" : pavilion.seated ? cloudPool ? "온천에서 나오기" : cloudLounge || baikalSeat ? `${seatNoun}에서 일어나기` : "일어나기" : pavilionPhase === "joining" ? "준비 중…" : !pavilion.available ? "자리 없음" : cloudPool ? "온천에 몸 담그기" : cloudLounge ? "소파에 앉기" : baikalSeat ? pavilion.kind === "hearth" ? "난롯가에 앉기" : `${seatNoun}에 앉기` : "앉기";
  const pavilionDetail = pavilion.seated
    ? (cloudPool ? `${pavilion.name} · 따뜻한 물에 몸을 맡기는 중` : cloudLounge ? "먹구름 리조트의 포근한 소파에서 쉬는 중"
      : baikalSeat ? (baikalView === "fire" ? `${pavilion.name} · 벽난로 불빛을 쬐며 쉬는 중` : baikalView === "porch" ? `${pavilion.name} · 처마 밑에서 눈보라 치는 호수를 바라보는 중` : `${pavilion.name} · 창 너머 눈보라 치는 얼음 호수를 바라보는 중`)
      : pavilion.kind === "bench" ? "나란히 앉아 연못을 바라보는 중" : pavilion.kind === "deck" ? `${pavilion.name}에서 도시 불빛을 바라보는 중` : pavilion.kind === "hall" ? (rain > 0.05 ? `${pavilion.name} · 비 내리는 호수를 바라보며 머무는 중` : `${pavilion.name} · 통창 너머 호수를 바라보는 중`) : `${pavilion.name}에 걸터앉아 숲을 바라보는 중`)
    : !pavilionEnabled ? "앉을 자리를 준비하고 있어요"
    : !pavilion.available ? (cloudPool ? "온천의 다른 쪽으로 다가가 주세요" : cloudLounge ? "소파의 다른 자리로 가 주세요" : baikalSeat ? "다른 자리로 가 주세요" : pavilion.kind === "bench" ? "다른 벤치에서 쉬어가요" : pavilion.kind === "deck" ? "의자의 다른 자리로 가 주세요" : pavilion.kind === "hall" ? "벤치의 다른 자리로 가 주세요" : "마루의 다른 쪽으로 가 주세요")
    : cloudPool ? `${pavilion.name} · 구름 위에서 도시의 불빛을 바라봐요` : cloudLounge ? "먹구름 리조트에서 편안하게 쉬어가요"
    : baikalSeat ? (baikalView === "fire" ? `${pavilion.name} · 벽난로 앞에서 불을 쬐어요` : baikalView === "porch" ? `${pavilion.name} · 처마 밑에서 눈보라를 바라봐요` : `${pavilion.name} · 창 너머 얼음 호수와 눈보라를 바라봐요`)
    : pavilion.kind === "bench" ? "둘이 나란히 · 소원동전과 작은 오리" : pavilion.kind === "deck" ? `${pavilion.name} · 난간 앞 의자에 앉아 야경을 봐요` : pavilion.kind === "hall" ? `${pavilion.name} · 벤치에 앉아 통창 너머 호수를 봐요` : `${pavilion.name} · 마루 끝에 걸터앉아 쉬어요`;
  const boatTitle = !boat ? "" : !boat.riding ? "나룻배 타기" : boat.docked ? "내리기" : boat.alightArmed ? "내리기 취소" : "내리기 예약";
  const restContextVisible = !bunker.inside && !bench.seated && !pavilion.seated && !onsenResting && !onsenPhase && (lying || (Boolean(skyPhase) && !benchPhase && !pavilionPhase) || Boolean(activeBed?.near) || stargazing.near);
  const walking = skyPhase === "walking" || (!bench.seated && (woodBusy || powderPhase === "walking"));
  const guestbookVisible = mapId === "bamboo" && nearGuestbook && Boolean(ticketRef.current);
  const myBoardPid = meRef.current?.pid ?? null;
  const seatedBoard = myBoardPid ? boardGames.find(board => board.black?.pid === myBoardPid || board.white?.pid === myBoardPid) ?? null : null;
  const reachableBoardId = bunker.gameNearId ?? seatedBoard?.id ?? null;
  const reachableBoard = reachableBoardId ? BUNKER_GAME_TABLES.find(table => table.id === reachableBoardId) ?? null : null;
  const openBoard = boardTableId ? boardGames.find(board => board.id === boardTableId) ?? null : null;
  const boardTitle = boardTableId ? BUNKER_GAME_TABLES.find(table => table.id === boardTableId)?.name ?? "" : "";
  const playBoard = async (action: BoardAction, cell?: number) => {
    const ticket = ticketRef.current, tableId = boardTableId;
    if (!ticket || !tableId || boardBusyRef.current) return;
    boardBusyRef.current = true; setBoardBusy(true);
    try {
      const version = action === "move" || action === "rematch" ? boardGamesRef.current.find(board => board.id === tableId)?.version : undefined;
      const updated = await playBoardGame(ticket, action, tableId, cell, version);
      applyBoardGames(boardGamesRef.current.map(board => board.id === updated.id ? updated : board));
      haptic();
      scheduleTick(0);
    } catch (cause) {
      if (cause instanceof BeachGone) { ticketRef.current = null; scheduleTick(0); }
      showToast(cause instanceof Error ? cause.message : "잠시 후 다시 눌러 주세요.", { kind: "info" });
    } finally { boardBusyRef.current = false; setBoardBusy(false); }
  };
  const bunkerContextVisible = mapId === "uyuni" && (bunker.inside ? bunker.ladderNear || bunker.sofaNear || bunker.seated || bunker.bookNear || reachableBoard !== null : bunker.nearId !== null);
  const bunkerTravel = bunkerBusy === "enter" || bunkerBusy === "exit";
  const contextVisible = bunkerContextVisible || restContextVisible || benchContextVisible || onsenContextVisible || pavilionContextVisible || boatContextVisible || guestbookVisible || (!bunker.inside && Boolean(rest)) || walking;
  const fireContextVisible = mapId === "beach" && fireEnabled && nearFire && !lying && !characterPickerOpen && Boolean(fire && meRef.current);
  const joystickVisible = phase === "ready" && !photo && !bookOpen && (!actionsOpen || hudHidden) && (!selected || hudHidden)
    && !characterPickerOpen && !lightingOpen && !powderOpen && powderPhase !== "adding" && (!lying || onsen.floating)
    && !bench.seated && !pavilion.seated && !bunker.seated && bunkerBusy === null && !onsen.sitting && !boat?.riding && skyPhase !== "joining" && skyPhase !== "standing";

  // 상단 도구는 PC 도 모바일처럼 햄버거 메뉴 안의 줄로 그린다.
  const ticket = ticketRef.current;
  const musicTool = (musicSnapshot || mapId === "uyuni") && ticket && <RoomMusicControls key={ticket} ticket={ticket}
    communityId={community?.id ?? communityId} mapId={mapId} music={musicSnapshot?.music} serverTime={musicSnapshot?.serverTime ?? 0}
    canControl={musicSnapshot !== null && musicControl} disabled={lost} onSnapshot={applyMusic}
    inline buttonClass={menuStyles.row}
    ambient={mapId === "uyuni" ? { volume: uyuniMusicVolume, onChange: volume => {
      const engine = engineRef.current;
      if (engine) { engine.setUyuniMusicVolume(volume); setUyuniMusicVolume(engine.uyuniMusicVolume); }
    } } : undefined} />;
  const fireworksTool = fireworksControl && !bunker.inside && <RoomFireworksControls mapId={mapId} deadline={fireworksDeadline} busy={fireworksBusy} disabled={lost || bunkerBusy !== null}
    tickets={fireworksFree ? null : fireworkTickets ?? 0} onUnlock={() => setTicketSheetOpen(true)}
    inline buttonClass={menuStyles.row}
    onLaunch={(variant) => void launchFireworks(variant)} />;
  const lightingTool = lightingControl && lighting && <RoomLightingControls mapId={mapId} mode={lighting.mode} open={lightingOpen}
    busy={lightingBusy} disabled={lost} onOpenChange={openLighting} onSelect={mode => void changeLighting(mode)}
    inline buttonClass={menuStyles.row} />;
  const fieldSoundTool = (mapId === "beach" || mapId === "bamboo" || mapId === "garden")
    ? <FieldSoundControl map={mapId} buttonClass={menuStyles.row} inline volume={fieldVolume} open={fieldOpen}
      onOpenChange={open => {
        if (open) { setActionsOpen(false); setCharacterPickerOpen(false); setCarePrompt(null); engineRef.current?.select(null); }
        setFieldOpen(open);
      }} onChange={volume => { const eng = engineRef.current; if (eng) { eng.setFieldVolume(volume); setFieldVolume(eng.fieldVolume); } }}
      onToggleMute={() => { const eng = engineRef.current; if (eng) { eng.setFireworksMuted(eng.fieldVolume > 0); setFieldVolume(eng.fieldVolume); } }} />
    : mapId === "uyuni" && !bunker.inside && <button type="button" className={menuStyles.row} aria-label="폭죽 소리" aria-pressed={!fireworksMuted}
      title={"폭죽 소리" + (fireworksMuted ? " 켜기" : " 끄기")} onClick={() => {
        engineRef.current?.setFireworksMuted(!fireworksMuted);
        setFireworksMuted(!fireworksMuted);
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9h4l5-4v14l-5-4H3z" />
        {fireworksMuted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
      </svg>
      <span>폭죽음</span><small>{fireworksMuted ? "꺼짐" : "켜짐"}</small>
    </button>;
  /** 관리자 전용: 남자/여자 선택과 따로, 내 화면의 내 캐릭터만 치비로 바꾼다 */
  const toggleChibi = () => {
    const me = meRef.current;
    if (!me || !chibiAdmin || chibiBusy) return;
    const next = !chibiOn;
    setChibiOn(next);
    saveChibi(me.id, next);
    if (next) engineRef.current?.setView("third");
    setCharacterPickerOpen(false);
    characterTriggerRef.current?.focus();
    haptic();
  };
  const toggleCharacterPicker = () => { haptic(); setActionsOpen(false); setCarePrompt(null); engineRef.current?.select(null); setCharacterPickerOpen((open) => !open); };
  const characterChoices = <div className={styles.characterChoices} role="group" aria-label="캐릭터 선택">
    {BEACH_CHARACTERS.map((option) => <button key={option.id} type="button" className={styles.characterChoice} aria-pressed={character === option.id} onClick={() => chooseCharacter(option.id)}>
      <span className={styles.characterModel} style={{ backgroundImage: assetCssUrl(option.preview) }} aria-hidden="true" />
      <span className={styles.characterLabel}>{option.label}</span>
      {character === option.id && <span className={styles.characterSelected} aria-hidden="true"><IconCheck /></span>}
    </button>)}
    {chibiAdmin && <button type="button" className={styles.characterChoice} aria-pressed={chibiOn} aria-busy={chibiBusy} disabled={chibiBusy}
      aria-label="치비 미리보기 (관리자, 내 화면에서만 보여요)" onClick={toggleChibi}>
      <span className={styles.characterModel + " " + styles.chibiModel} aria-hidden="true" />
      <span className={styles.characterLabel}>{chibiBusy ? "빚는 중…" : "치비 (나만 보기)"}</span>
      {chibiOn && !chibiBusy && <span className={styles.characterSelected} aria-hidden="true"><IconCheck /></span>}
    </button>}
  </div>;
  /** 방의 시간과 인원. 좁은 화면은 상단 가운데, 넓은 화면은 오른쪽 도구 묶음 맨 앞에 선다 */
  const statusPill = phase === "ready" && (timeLabel || count !== null) && <div className={styles.glass + " " + styles.status}>
    {timeLabel && <span>{nightControls ? <IconMoon /> : <IconSun />}{timeLabel}</span>}
    {count !== null && <span aria-label={`정원 ${capacity}명 중 지금 ${count}명`}><IconUsers />{count}<small>/ {capacity}</small></span>}
  </div>;

  return (
    <div className={styles.root} data-map={mapId} data-night={nightControls} data-context-row={!hudHidden && phase === "ready" && (contextVisible || fireContextVisible) && !characterPickerOpen && !powderOpen} inert={Boolean(photo)}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`${shared ? `누구나 함께 쉬는 ${map.name}` : `${community?.name ?? "소로우"}의 프라이빗 ${map.name}`} (${view === "first" ? "1인칭" : "3인칭"})`} />
      {flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.kind]}`} aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}

      <div className={styles.top} hidden={hudHidden} inert={bunkerTravel}>
        <Link href={returnHref} onClick={exitRoom} className={styles.glass + " " + styles.exitButton} aria-label={`${map.name} 나가기`}><IconChevronL />나가기</Link>
        {statusPill}
        {phase === "ready" && <BeachMenu open={menuOpen} onOpenChange={changeMenu} label={`${map.name} 메뉴`}>
            {fieldSoundTool}
            <div>
              <button ref={characterTriggerRef} type="button" className={menuStyles.row} aria-expanded={characterPickerOpen} aria-controls={characterPickerId} onClick={toggleCharacterPicker}><IconUser /><span>내 캐릭터</span></button>
              {characterPickerOpen && <div ref={characterPickerRef} id={characterPickerId} className={styles.characterInline}>{characterChoices}<p>고르면 내 모습이 바로 보여요.</p></div>}
            </div>
            {musicTool}
            {fireworksTool}
            {lightingTool}
          </BeachMenu>}
      </div>

      {community && !hudHidden && !lightingOpen && phase === "ready" && intro !== "hidden" && <div className={`${styles.place} ${intro === "leaving" ? styles.placeLeaving : ""}`} aria-hidden={intro === "leaving"}>
        <span>{shared ? <IconUsers /> : <IconLock />}{mapEyebrow(mapId, shared)}</span>
        <h1>{community.name} {map.name}</h1>
        <p>{map.welcome}</p>
      </div>}

      {mapId === "baikal" && phase === "ready" && engineRef.current && meRef.current && <BaikalJourney
        key={communityId + ":" + meRef.current.id} engine={engineRef.current} userId={meRef.current.id} communityId={communityId}
        hidden={hudHidden || intro !== "hidden" || menuOpen || Boolean(photo)} paused={lost} night={nightControls} />}

      {joystickVisible && <Joystick onMove={(x, y) => engineRef.current?.setMove(x, y)} />}

      <div className={styles.bottomHud} data-lying={lying} data-movement={Boolean(joystickVisible)} hidden={hudHidden || phase !== "ready" || Boolean(photo)} inert={bunkerTravel}>
        {lost && <p className={styles.dockNotice} role="status">연결 중…</p>}
        <section id={actionTrayId} className={styles.actionTray} hidden={!actionsOpen} aria-label={`${map.name} 행동`}>
          <button type="button" className={styles.actionArrow} aria-label="이전 행동 보기" aria-controls={actionTrayId + "-list"} disabled={!actionOverflow.previous} onClick={() => scrollActions(-1)}><IconChevronL /></button>
          {carePrompt && <div ref={peopleRowRef} id={actionTrayId + "-list"} className={styles.peopleRow} role="group" aria-label="마음을 건넬 사람" tabIndex={0}>
            {people.length ? people.map((person) => <button type="button" key={person.pid} className={styles.personChoice} onClick={() => engineRef.current?.select(person.pid)}><IconUser /><span>{person.nick}</span></button>) : <p className={styles.emptyPeople}>아직 함께 쉬는 사람이 없어요.</p>}
          </div>}
          <div ref={actionScrollRef} id={carePrompt ? undefined : actionTrayId + "-list"} className={styles.actionScroll} hidden={Boolean(carePrompt)} role="group" aria-label={selected ? `${selected.nick}님에게 할 수 있는 행동` : "할 수 있는 행동"} tabIndex={0}>
            {selected && <button type="button" className={styles.actionTile + " " + styles.personTile} aria-label={`${selected.nick}님에게 · 다른 사람 고르기`} onClick={() => { engineRef.current?.select(null); setCarePrompt("wave"); }}><span className={styles.actionIcon}><IconUser /></span><strong>{selected.nick}</strong></button>}
            {mapId === "bamboo" && festival && !selected && <BambooFestivalControls held={festival.held} inFlight={Date.now() < flightUntil}
              disabled={lost || toyBusy} onChoose={choice => void useFestivalToy(choice)} />}
            {mapId === "uyuni" && momentsEnabled && !bunker.inside && <UyuniMomentControls
              key={communityId + ":" + meRef.current?.id}
              active={actionsOpen && !carePrompt && !photo && !hudHidden && !characterPickerOpen && phase === "ready"}
              disabled={lost || bunkerBusy !== null || lying || Boolean(rest?.seated) || bench.seated || Boolean(skyPhase)}
              busy={momentBusy} cooldowns={momentDeadlines} onOpenChange={setMomentOpen}
              onSparkler={letter => launchMoment({ kind: "sparkler", letter })}
              onLantern={(color, wish) => launchMoment({ kind: "lantern", color, wish })} />}
            <button type="button" className={styles.actionTile + " " + styles.waveTile} disabled={cooling || lost || !careCapabilities.wave} onClick={() => sendCare("wave")}><span className={styles.actionIcon}><IconWave /></span><strong>인사하기</strong></button>
            <button type="button" className={styles.actionTile + " " + styles.comfortTile} disabled={cooling || lost} onClick={() => sendCare("comfort")}><span className={styles.actionIcon}><IconLeaf /></span><strong>위로 건네기</strong></button>
            {careCapabilities.hug && <button type="button" className={styles.actionTile + " " + styles.hugTile} disabled={cooling || lost} onClick={() => sendCare("hug")}><span className={styles.actionIcon}><IconHeart /></span><strong>안아주기</strong></button>}
          </div>
          <button type="button" className={styles.actionArrow} aria-label="다음 행동 보기" aria-controls={actionTrayId + "-list"} disabled={!actionOverflow.next} onClick={() => scrollActions(1)}><IconChevronR /></button>
          <button type="button" className={styles.trayClose} aria-label={carePrompt ? "사람 고르기 닫기" : "행동 접기"} onClick={() => { if (carePrompt) setCarePrompt(null); else { setActionsOpen(false); engineRef.current?.select(null); actionsTriggerRef.current?.focus(); } }}><IconClose /></button>
        </section>
        <div className={styles.contextRow}>
        <button type="button" className={styles.hideHud} aria-label="화면 버튼 숨기기" disabled={capturing} onClick={hideHud}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M9.5 5.7A11 11 0 0 1 12 5.4c6 0 9.5 6.6 9.5 6.6a17 17 0 0 1-3.3 4M14.2 18.4a11 11 0 0 1-2.2.2C6 18.6 2.5 12 2.5 12a17 17 0 0 1 3.2-4M10 10a3 3 0 0 0 4 4" /></svg></button>
        <div className={styles.contextActions} role="group" aria-label="지금 할 수 있는 행동" tabIndex={0} hidden={!(contextVisible || fireContextVisible) || characterPickerOpen || powderOpen}>
          {bunkerContextVisible && <UyuniBunkerControls state={bunker} enabled={bunkerEnabled} busy={bunkerBusy}
            onRead={() => { setActionsOpen(false); setBookOpen(true); }}
            disabled={lost || Boolean(skyPhase) || momentBusy || fireworksBusy || capturing} onAction={action => void changeBunker(action)}
            gameLabel={reachableBoard ? `${reachableBoard.name} ${seatedBoard?.id === reachableBoard.id ? "이어 두기" : "두기"}` : null}
            onGame={() => { if (reachableBoard) { setActionsOpen(false); setBoardTableId(reachableBoard.id); } }} />}
          {guestbookVisible && <button type="button" className={styles.contextButton} disabled={lost} aria-haspopup="dialog"
            onClick={() => { setActionsOpen(false); setGuestbookOpen(true); haptic(); }}>
            <span className={styles.contextIcon}><IconPen /></span>
            <span className={styles.contextCopy}><strong>게시판</strong></span>
          </button>}
          {lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "first"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}>
            <span className={styles.contextIcon}>{view === "third" ? <IconMoon /> : <IconUsers />}</span>
            <span className={styles.contextCopy}><strong>{viewLabel}</strong></span>
          </button>}
          {benchContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!bench.seated && (!benchEnabled || !bench.available))} aria-pressed={bench.seated} aria-keyshortcuts="E" onClick={() => void toggleStargazing("fire-benches")}>
            <span className={styles.contextIcon}>{bench.seated ? <IconStand /> : <IconSeat />}</span>
            <span className={styles.contextCopy}><strong>{benchPhase === "standing" ? "일어나는 중" : bench.seated ? "일어나기" : benchPhase === "joining" ? "준비 중…" : !bench.available ? "자리 없음" : "앉기"}</strong></span>
            <span className={styles.contextCount} aria-label={`벤치 12석 중 ${bench.occupied}석 사용 중`}>{bench.occupied}/{bench.capacity}</span>
          </button>}
          {pavilionContextVisible && !lying && <button type="button" className={styles.contextButton} title={pavilionDetail} disabled={Boolean(skyPhase) || pondBusy !== null || lost || (!pavilion.seated && (!pavilionEnabled || !pavilion.available))} aria-pressed={pavilion.seated} aria-keyshortcuts="E" onClick={() => { const spot = pavilion.spotId; if (spot) void toggleStargazing(spot); }}>
            <span className={styles.contextIcon}>{pavilion.seated ? <IconStand /> : <IconSeat />}</span>
            <span className={styles.contextCopy}><strong>{pavilionTitle}</strong></span>
            <span className={styles.contextCount} aria-label={`${seatNoun} ${pavilion.capacity}석 중 ${pavilion.occupied}석 사용 중`}>{pavilion.occupied}/{pavilion.capacity}</span>
          </button>}
          {mapId === "garden" && pondEnabled && pavilion.seated && pavilion.kind === "bench" && <GardenPondControls
            disabled={lost || Boolean(skyPhase)} busy={pondBusy} night={nightControls} cooldowns={pondDeadlines} onChoose={kind => void launchPondMoment(kind)} />}
          {boatContextVisible && !lying && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost} aria-pressed={boat?.riding === true} aria-keyshortcuts="E" onClick={() => boatActionRef.current()}>
            <span className={styles.contextIcon}><IconBoat /></span>
            <span className={styles.contextCopy}><strong>{boatTitle}</strong></span>
          </button>}
          {restContextVisible && <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || woodBusy || Boolean(powderPhase) || lost || (!lying && (!areaEnabled || skyFull))} onClick={() => void toggleStargazing(areaSpot)}>
            <span className={styles.contextIcon}>{lying ? <IconStand /> : <IconLie />}</span>
            <span className={styles.contextCopy}><strong>{skyPhase === "standing" ? "일어나는 중" : lying ? "일어나기" : skyPhase === "walking" ? "이동 중…" : skyPhase === "joining" ? "준비 중…" : activeBed ? "눕기" : skyFull ? "자리 없음" : "같이 눕기"}</strong></span>
            <span className={styles.contextCount}>{restArea.occupied}/{restArea.capacity}</span>
          </button>}
          {onsenContextVisible && (onsenResting ? <button type="button" className={styles.contextButton}
            disabled={Boolean(skyPhase) || lost} onClick={() => void toggleStargazing(onsen.sitting ? "onsen-benches" : "onsen-float")}>
            <span className={styles.contextIcon}><IconStand /></span><span className={styles.contextCopy}><strong>{onsenPhase === "standing" ? "일어나는 중" : "일어나기"}</strong></span>
          </button> : <>
            <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost || !onsen.canSit}
              onClick={() => void toggleStargazing("onsen-benches")}>
              <span className={styles.contextIcon}><IconSeat /></span><span className={styles.contextCopy}><strong>{restActionSpot === "onsen-benches" && onsenPhase ? "준비 중…" : "앉아있기"}</strong></span>
              <span className={styles.contextCount} aria-label={`온천 벤치 ${ONSEN_SEATS_PER_BATH}석 중 ${onsen.occupiedSeats.length}석 사용 중`}>{onsen.occupiedSeats.length}/{ONSEN_SEATS_PER_BATH}</span>
            </button>
            <button type="button" className={styles.contextButton} disabled={Boolean(skyPhase) || lost || !onsen.canFloat}
              onClick={() => void toggleStargazing("onsen-float")}>
              <span className={styles.contextIcon}><IconFloat /></span><span className={styles.contextCopy}><strong>{restActionSpot === "onsen-float" && onsenPhase ? "준비 중…" : "떠있기"}</strong></span>
              <span className={styles.contextCount} aria-label={`온천 수면 3자리 중 ${onsen.occupiedFloats.length}자리 사용 중`}>{onsen.occupiedFloats.length}/3</span>
            </button>
          </>)}
          {rest && !bunker.inside && !lying && !bench.seated && !onsenResting && !skyPhase && <button type="button" className={styles.contextButton} disabled={bunkerBusy !== null || woodBusy || Boolean(powderPhase)} onClick={() => { engineRef.current?.select(null); engineRef.current?.toggleRest(); }}><span className={styles.contextIcon}>{rest.seated ? <IconStand /> : <IconSeat />}</span><span className={styles.contextCopy}><strong>{rest.seated ? "일어나기" : "앉기"}</strong></span></button>}
          {walking && <button type="button" className={styles.contextButton + " " + styles.contextCancel} onClick={() => engineRef.current?.cancelAutoWalk()}><span className={styles.contextIcon}><IconClose /></span><span className={styles.contextCopy}><strong>멈추기</strong></span></button>}
          {mapId === "beach" && fireEnabled && <div className={styles.fireContext} role="group" aria-label="모닥불 돌보기" hidden={!fireContextVisible}>
            {fire && meRef.current && <CampfireControls key={communityId + ":" + meRef.current.id}
              fire={fire} near={nearFire} disconnected={lost || Boolean(skyPhase) || characterPickerOpen || lying || Boolean(photo)}
              onAddWood={onAddWood} onAddPowder={onAddPowder} onFireChange={applyFire}
              powderOpen={powderOpen} onPowderOpenChange={setPowderOpen}
            />}
          </div>}
        </div>
        </div>
        <nav className={styles.dock} aria-label={`${map.name} 조작`} data-lying={lying}>
          <button ref={actionsTriggerRef} type="button" className={styles.dockButton} aria-expanded={actionsOpen} aria-controls={actionTrayId} onClick={() => { haptic(); setActionsOpen((open) => !open); setCarePrompt(null); setCharacterPickerOpen(false); if (actionsOpen) engineRef.current?.select(null); }}><IconSorowSmile /><span>행동</span></button>
          <button ref={cameraTriggerRef} type="button" className={styles.dockButton} aria-label={capturing ? "사진을 담는 중" : "풍경 사진 찍기"} disabled={capturing || bunkerBusy !== null || Boolean(skyPhase) || woodBusy || Boolean(powderPhase)} onClick={() => void takePhoto()}><CameraIcon /><span>{capturing ? "담는 중" : "사진"}</span></button>
          {!lying && <button type="button" className={styles.dockButton} disabled={bunkerBusy !== null || Boolean(skyPhase)} aria-label={viewLabel} aria-pressed={view === "third"} aria-keyshortcuts="V" onClick={() => { engineRef.current?.toggleView(); haptic(); }}><IconUsers /><span>시점</span></button>}
        </nav>
      </div>
      <div className={styles.bunkerTransition} data-active={bunkerTravel} aria-hidden={!bunkerTravel} role="status" aria-live="polite">
        {bunkerTravel && <span>{bunkerBusy === "enter" ? "아래층 쉼터로 내려가요" : "호텔 데크로 올라가요"}</span>}
      </div>
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
      <UyuniBookReader open={bookOpen && bunker.inside} onClose={() => setBookOpen(false)} />
      {openBoard && <BunkerBoardGame title={boardTitle} board={openBoard} myPid={myBoardPid} busy={boardBusy} onAction={(action, cell) => void playBoard(action, cell)} onClose={() => setBoardTableId(null)} />}
      {guestbookInSight && phase === "ready" && mapId === "bamboo" && ticketRef.current &&
        <BambooBulletin key={ticketRef.current} ticket={ticketRef.current} initialName={meRef.current?.nick}
          open={guestbookOpen} onEntries={displayNotes} onClose={() => setGuestbookOpen(false)} />}
    </div>
  );
}
