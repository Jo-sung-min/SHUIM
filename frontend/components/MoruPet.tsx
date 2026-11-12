"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Sheet } from "./ui";
import MoruSprite, { type MoruMood } from "./MoruSprite";
import MoruCompanion, { companionChoices } from "./MoruCompanion";
import MoruHomeScene, { HOME_NAMES } from "./MoruHomeScene";
import type { Sky } from "./MoruScene";
import { DECOR_MAX, DecorBox, DecorLayer, FURNITURE, firstSpot, placedOf, type Placed } from "./MoruDecor";
import MoruMindSheet from "./MoruMindSheet";
import { IconBook, IconBubble, IconMoon, IconSmile, IconSun } from "./Icons";
import MoruWeatherBook, { weatherName } from "./MoruWeatherBook";
import MoruMoodSheet, { MoodFace } from "./MoruMoodSheet";
import { fetchMe } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { useBackLayer } from "@/lib/use-back-layer";
import { PetError, petRequest, type PetView } from "@/lib/pet";
import {
  BATH_LINES, DAILY_FOOD_MAX, DECOR_LINES, DUST_LINES, GLOW_LINE, HUG_LINES, HUG_MS, HUNGRY_LINE, IDLE_LINE, LIGHTS_OFF_LINE, LIGHTS_ON_LINE, MEAL_LINES, MOVE_SLOP, NAP_WAKE_LINES, PEEK_LINE, PHASE_GREETING,
  RESTED_GREETING, RESULT_LINE, SLEEP_TALK, SNACK_LINES, SPROUT_LINES, STARTLE_LINE, STARTLE_MS, TALK_TOPICS, talkReplies, TICKLE_LINES,
  CHORE_NAMES, currentHour, dailySky, dayPhase, devHome, devLook, devSky, dueMeals, koreaDate, dustCount, fullness, isAsleep, isNightOutside, isStartle, isTickle, lightsOff, loadRainPref, mealStatus, murmurDelay, murmurPool,
  petLine, pickLine, recordLine, rubStats, saveCompanion, saveRainPref, takeNewMeal, touchSpot, type Companion,
  LOW_GLOW_LINE, LOW_HUG_LINES, MOOD_BESIDE_LINE, MOOD_INTRO_LINE, MOOD_NAMES, MOOD_OFF_LINE, MOOD_ON_LINE, MOOD_SETTLE_LINES, devMood, loadMoodSync, moodOf, saveMoodSync, takeMoodIntro, type MoodStage,
} from "@/lib/moru";
import { startRain, stopRain } from "@/lib/rain-sound";
import { sessionUserId, syncRecords, loadProfile, loadJournal, todayKey, type Journal } from "@/lib/storage";
import { hasCrisisSignal } from "@/lib/crisis";
import styles from "./MoruPet.module.css";

interface Props {
  userId: string | null;
  /** 칭찬·사랑·정리를 기다리는 동안 모루가 돌려 말할 문장 (버튼은 홈의 "나를 위한 시간") */
  thinking?: string[] | null;
  /** 새 결과가 나온 시각: 바뀌면 모루가 "다 적었어" */
  answeredAt?: number | null;
  onCompanion?: (companion: Companion) => void;
  /** 마음 기록으로 오늘의 기록이 바뀌었을 때 (홈이 다시 읽는다) */
  onRecordsChange?: () => void;
  /** 마음 닮기: 오늘의 기분을 정하는 기록과 오늘 날짜 (홈이 가진 것을 받는다. 없으면 늘 고요해) */
  journal?: Journal | null;
  today?: string;
  /** 기분 쪽지의 "숨 고르기" (홈의 숨 고르기 시트를 연다) */
  onBreathe?: () => void;
}

/**
 * 마지막으로 받은 방 (메모리에만, 사용자별). 다른 화면에 다녀와 방이 다시 그려질 때 내 친구·내 공간이 바로 보이고, 곧 서버 값으로 바뀐다.
 * 처음 받기 전에는 아무것도 모르므로 방을 비워 둔다 (기본 모습인 모루가 먼저 보였다가 바뀌지 않게).
 */
const lastPet = new Map<string, PetView>();

export default function MoruPet(props: Props) {
  return <PetRoom key={props.userId || "guest"} {...props} />;
}

function PetRoom({ userId, thinking = null, answeredAt = null, onCompanion, onRecordsChange, journal = null, today: recordDay, onBreathe }: Props) {
  const [pet, setPet] = useState<PetView | null>(() => (userId ? lastPet.get(userId) ?? null : null));
  const [loading, setLoading] = useState(() => Boolean(userId) && !lastPet.has(userId as string));
  useEffect(() => { if (userId && pet) lastPet.set(userId, pet); }, [userId, pet]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [message, setMessage] = useState(IDLE_LINE);
  const [mood, setMood] = useState<MoruMood>("idle");
  const [talkFeel, setTalkFeel] = useState<string | null>(null); // 말 걸기에서 고른 기분: 감정마다 얼굴이 있는 친구(모링)가 그 얼굴로 답한다
  const [sheet, setSheet] = useState<"mind" | "guide" | "homes" | "companions" | "book" | "decor" | "mood" | null>(null);
  // 꾸미기: 꾸미는 중이면 방의 자리마다 동그라미가 뜨고, 자리를 누르면 가구 고르기 시트가 열린다
  const [decorating, setDecorating] = useState(false);
  const [decorPick, setDecorPick] = useState<string | null>(null); // 꾸미는 중에 고른 가구 (넣어 두기 판이 뜬다)
  const [moves, setMoves] = useState<Record<string, Placed & { token: number }>>({}); // 저장 중인 옮김: 서버가 답하기 전에도 놓은 자리에 보이게
  const moveToken = useRef(0);
  const [chosenAppearance, setChosenAppearance] = useState("moru");
  const [ownerName, setOwnerName] = useState("");
  const [name, setName] = useState("");
  const [thinkIndex, setThinkIndex] = useState(0);
  // 하루 리듬·손길·말 걸기·빗소리 (docs/MORU_TAMAGOTCHI.md 1단계)
  const [hour, setHour] = useState(currentHour);
  const [napWoken, setNapWoken] = useState(false);
  const [touch, setTouch] = useState<"hug" | "tickle" | "sprout" | "hide" | "bath" | null>(null);
  const [poof, setPoof] = useState<number | null>(null);
  const [spots, setSpots] = useState([0, 1, 2]); // 먼지가 놓이는 자리의 순서: 치운 자리는 맨 뒤로 보내 남은 먼지가 제자리에 있게
  const [murmur, setMurmur] = useState<string | null>(null);
  const [panel, setPanel] = useState<"menu" | "care" | "talk" | null>(null);
  const talking = panel === "talk";
  const menuId = useId();
  const [rainOn, setRainOn] = useState(false);
  const rainWanted = useRef(false);
  const lastLine = useRef<string | null>(null);
  const press = useRef<{ id: number; x: number; y: number; xs: number[]; fired: boolean; spot: "sprout" | "body" } | null>(null);
  const hugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef<number[]>([]);
  const [celebration, setCelebration] = useState<{ id: number; food: number; level: number | null; text?: string } | null>(null);
  const [full, setFull] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greeted = useRef(false);
  const canUse = Boolean(userId && !needsLogin);
  // ---------- 마음 닮기 (docs/MORU_MOOD_SYNC.md): 오늘의 기분은 내 기록을 닮는다. 저장하지 않고 기록에서 그때그때 계산한다 ----------
  const [moodOn, setMoodOn] = useState<boolean>(() => loadMoodSync() !== false);
  const dayKey = recordDay || ""; // 기록이 쓰는 날짜 키 (기기의 날짜). 아래의 today 는 모루의 한국 날짜다
  const reading = useMemo(() => (dayKey ? moodOf(journal, dayKey) : null), [journal, dayKey]);
  /** 오늘 기록에 많이 힘든 신호가 있는 날은 닮지 않고 곁에 있는다 (연락처는 기록 시트와 기분 쪽지가 먼저 보여 준다) */
  const crisisDay = useMemo(() => Boolean(hasCrisisSignal(Object.values(journal?.[dayKey] ?? {}).map((e) => e?.note ?? "").join(" "))), [journal, dayKey]);
  /** 1 울적해 · 2 가라앉아 · 3 고요해 · 4 가벼워 · 5 행복해. 닮기를 껐으면 늘 고요해 */
  const stage: MoodStage = devMood() ?? (moodOn && !crisisDay && reading ? reading.stage : 3);
  const low = stage <= 2;
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 4000);
    return () => clearTimeout(timer);
  }, [celebration]);
  const react = useCallback((next: MoruMood, text: string) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setMood(next); setMessage(text); setTalkFeel(null);
    setMurmur(null);
    reactionTimer.current = setTimeout(() => { setMood("idle"); setMessage(IDLE_LINE); }, 4200);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (userId) void fetchMe().then((me) => {
      if (alive.current && me.user?.id === userId) setOwnerName(loadProfile().name.trim() || me.user.nick.trim());
    }).catch(() => {});
    return () => {
      alive.current = false;
      for (const timer of [reactionTimer, hugTimer, touchTimer]) if (timer.current) clearTimeout(timer.current);
    };
  }, [userId]);
  /** 서버에서 방을 받는다. 끼니를 새로 먹었으면 처음 보는 순간 한마디, 밥이 없어 끼니를 거르고 있으면 한 번 말한다 */
  const load = useCallback(async (): Promise<PetView | null> => {
    if (!userId || lock.current) return null;
    lock.current = true;
    try {
      const data = await petRequest();
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data); setError(""); setNeedsLogin(false);
      const meal = takeNewMeal(data.date, data.meals);
      // 처음 본 순간의 한마디: 방금 먹은 끼니 > 그 시간대의 인사(자는 중이면 없음) > 배고픔
      const now = currentHour(), phaseNow = dayPhase(now);
      const sleeping = isAsleep(phaseNow, lightsOff(phaseNow, data.lightsOff ?? null)) || phaseNow === "nap";
      const hello = phaseNow === "wake" && (data.energy ?? 0) >= 4 ? RESTED_GREETING : PHASE_GREETING[phaseNow];
      if (meal !== null && !sleeping) react("eat", MEAL_LINES[meal]);
      else if (!greeted.current && hello && !sleeping) react("pet", hello);
      else if (!greeted.current && !sleeping && data.food === 0 && dueMeals(now) > data.meals) react("sleep", HUNGRY_LINE);
      greeted.current = true;
      return data;
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "방을 불러오지 못했어요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
      return null;
    } finally { lock.current = false; if (alive.current) setLoading(false); }
  }, [userId, react]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); clearInterval(interval); };
  }, [load]);
  const mutate = async (path: string, body: unknown, method = "PUT") => {
    if (!canUse || lock.current || sessionUserId() !== userId) return null;
    lock.current = true; setBusy(true); setError("");
    try {
      const data = await petRequest(path, body, method);
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data);
      return data;
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요."); if (e instanceof PetError && e.status === 401) setNeedsLogin(true); }
      return null;
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };

  const petName = pet?.name || "모루";
  const appearance = devLook() ?? pet?.appearance ?? "moru";
  /** 처음 받는 중: 어떤 친구·어떤 공간인지 아직 모른다. 방 안과 이름표를 비워 둔다 */
  const waiting = loading && !pet;
  useEffect(() => {
    if (!pet) return;
    const companion = { name: petName, appearance };
    saveCompanion(companion);
    onCompanion?.(companion);
  }, [pet, petName, appearance, onCompanion]);

  // 칭찬·사랑·정리를 기다리는 동안 말풍선이 천천히 바뀐다. 결과가 오면 "다 적었어"
  useEffect(() => {
    if (!thinking) return;
    setThinkIndex(0);
    const timer = setInterval(() => setThinkIndex((i) => i + 1), 2600);
    return () => clearInterval(timer);
  }, [thinking]);
  const lastAnswer = useRef(answeredAt);
  useEffect(() => {
    if (answeredAt && answeredAt !== lastAnswer.current) react("happy", RESULT_LINE);
    lastAnswer.current = answeredAt;
  }, [answeredAt, react]);

  /** 마음 기록을 닫으면: 보낼 기록을 먼저 보내고(서버가 그때 마음밥을 준다) 방을 다시 받아 늘어난 밥만큼 축하 */
  const closeMind = async (changed: boolean) => {
    setSheet(null);
    if (!changed) return;
    const before = pet, heard = reading;
    await syncRecords();
    onRecordsChange?.();
    for (let i = 0; i < 20 && lock.current; i++) await new Promise((r) => setTimeout(r, 100));
    const data = await load();
    if (!data || !alive.current) return;
    const gained = Math.max(0, data.earned - (before?.earned ?? 0));
    const level = before && data.level > before.level ? data.level : null;
    if (gained > 0 || level) setCelebration({ id: Date.now(), food: gained, level });
    // 오늘 마음을 다 들은 순간, 기분이 그날의 것으로 자리 잡는다. 가라앉은 날은 뛰지 않고 조용히 받는다 (마음밥은 똑같이 준다)
    const key = todayKey(), fresh = loadJournal();
    const after = moodOn ? moodOf(fresh, key) : null;
    if (!after?.recorded) { react("happy", recordLine(gained, data.earned)); return; }
    if (hasCrisisSignal(Object.values(fresh[key] ?? {}).map((e) => e?.note ?? "").join(" "))) { react("pet", MOOD_BESIDE_LINE); return; }
    const settled = !heard?.recorded || heard.stage !== after.stage;
    react(after.stage <= 2 ? "pet" : "happy", takeMoodIntro() ? MOOD_INTRO_LINE : settled ? MOOD_SETTLE_LINES[after.stage] : recordLine(gained, data.earned));
  };

  const progress = pet ? pet.level === 10 ? 100 : (pet.xp - pet.levelStart) / (pet.levelEnd - pet.levelStart) * 100 : 0;
  const homeId = devHome() ?? pet?.homeId ?? 0;
  const ownedHomes = pet?.ownedHomes ?? [0];
  const ready = Boolean(pet) && !busy;

  // ---------- 하루 리듬: 한국 시간에 따라 깨고, 낮잠 자고, 졸리고, 잔다 ----------
  const phase = dayPhase(hour);
  const off = lightsOff(phase, pet?.lightsOff ?? null); // 이번 밤에 고른 불 상태는 서버가 기억한다
  const asleep = isAsleep(phase, off);
  const napping = phase === "nap" && !napWoken;
  const nightly = phase === "sleepy" || phase === "sleep"; // 불을 끄고 켤 수 있는 시간
  // 오늘의 하늘: 날씨·풍경은 계정과 날짜로 무작위(하루 동안 같다), 밤낮은 시계를 따른다. 사용자가 고르지 않는다
  const today = pet?.date ?? koreaDate();
  const night = isNightOutside(phase);
  // 새 서버(V46)는 오늘의 하늘과 드문 하늘을 정해 준다. 옛 서버면 같은 계산을 화면이 한다
  const serverSky = pet?.sky;
  const sky = useMemo<Sky>(() => ({
    ...dailySky(userId ?? "guest", today),
    ...(serverSky ? { land: serverSky.land, weather: serverSky.weather, rare: serverSky.rare } : {}),
    ...devSky(), night,
  }), [userId, today, night, serverSky?.land, serverSky?.weather, serverSky?.rare]);

  // ---------- 오늘의 돌봄과 날씨 도감 (V46 서버): 다 했을 때, 처음 본 하늘이 있을 때 한 번씩 축하 ----------
  const tasks = pet?.tasks ?? [];
  const tasksDone = tasks.filter((t) => t.done).length;
  const lastRewarded = useRef<boolean | null>(null);
  const lastFresh = useRef("");
  useEffect(() => {
    if (!pet) return;
    const rewarded = Boolean(pet.tasksRewarded);
    if (lastRewarded.current === false && rewarded) setCelebration({ id: Date.now(), food: 0, level: null, text: "오늘의 돌봄 다 했어요 +10 P" });
    lastRewarded.current = rewarded;
    const fresh = pet.newWeather ?? [];
    const key = `${pet.date}:${fresh.join(",")}`;
    if (fresh.length && key !== lastFresh.current) {
      lastFresh.current = key;
      const shown = fresh.find((id) => !id.includes("-")) ?? fresh[0]; // 드문 하늘을 먼저
      setCelebration({ id: Date.now(), food: 0, level: null, text: `날씨 도감 · ${weatherName(shown)} +${fresh.length * 5} P` });
    }
  }, [pet]);
  const restMood: MoruMood = asleep || napping || pet?.food === 0 ? "sleep" : "idle";
  useEffect(() => {
    const tick = () => { if (!document.hidden) setHour(currentHour()); };
    const interval = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);
  useEffect(() => { if (phase !== "nap") setNapWoken(false); }, [phase]);

  // ---------- 조용한 방의 혼잣말: 깨어 있고 아무 일도 없을 때 가끔 한 줄 ----------
  const quiet = Boolean(pet) && !asleep && !napping && mood === "idle" && !thinking && !sheet && !talking && touch === null;
  const level = pet?.level ?? 1;
  const energy = pet?.energy ?? 4;
  useEffect(() => {
    if (!quiet) return;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      if (document.hidden) return;
      const line = pickLine(murmurPool(level, energy, stage), lastLine.current);
      lastLine.current = line;
      setMurmur(line);
      clear = setTimeout(() => setMurmur(null), 4600);
    }, murmurDelay());
    return () => { clearTimeout(timer); if (clear) clearTimeout(clear); };
  }, [quiet, level, energy, stage, murmur]);

  // ---------- 창밖 소리: 켜 두면 오늘 날씨에 맞춰 (비는 그대로, 눈은 작게, 맑은 날은 아주 작게). 화면을 떠나면 멈춘다 ----------
  useEffect(() => { rainWanted.current = loadRainPref(); return () => stopRain(); }, []);
  const rainVolume = sky.weather === "rain" ? 1 : sky.weather === "snow" ? 0.35 : 0.15;
  useEffect(() => {
    if (!rainOn) return;
    startRain(rainVolume);
    const onVisibility = () => { if (document.hidden) stopRain(); else startRain(rainVolume); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); stopRain(); };
    // 크기는 아래 효과가 따로 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainOn]);
  useEffect(() => { if (rainOn) startRain(rainVolume); }, [rainOn, rainVolume]);
  const toggleRain = () => { const next = !rainOn; haptic(6); saveRainPref(next); rainWanted.current = false; setRainOn(next); };
  /** 마음 닮기 켜기·끄기 (이 기기). 끄면 늘 고요해 */
  const toggleMood = () => { const next = !moodOn; haptic(6); saveMoodSync(next); setMoodOn(next); if (!asleep && !napping) react("pet", next ? MOOD_ON_LINE : MOOD_OFF_LINE); };

  // ---------- 손길: 톡 · 새싹 톡 · 길게 눌러 안아 주기 · 문질러 간질이기 · 너무 빨리 두드리면 움찔 ----------
  const say = (pool: readonly string[]) => { const line = pickLine(pool, lastLine.current); lastLine.current = line; return line; };
  const flash = (kind: NonNullable<typeof touch>, ms: number, then?: () => void) => {
    setTouch(kind);
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => { setTouch(null); then?.(); }, ms);
  };
  /** 자고 있으면 깨우지 않고 잠꼬대만, 낮잠이면 깨어난다. 처리했으면 true */
  const whileSleeping = (): boolean => {
    if (asleep) { haptic(4); react("sleep", say(SLEEP_TALK)); return true; }
    if (napping) { haptic(8); setNapWoken(true); react("pet", say(NAP_WAKE_LINES)); return true; }
    return false;
  };
  /** 돌봄 한 번을 서버에 알린다: 온기·말끔함·기운은 서버가 지킨다. 화면 반응을 막지 않게 조용히 보내고, 조용한 돌봄의 실패는 넘어간다 */
  const care = async (action: string, loud = false): Promise<PetView | null> => {
    if (!canUse || !pet || lock.current || sessionUserId() !== userId) return null;
    lock.current = true;
    try {
      const data = await petRequest("/care", { action }, "POST");
      if (!alive.current || sessionUserId() !== userId) return null;
      setPet(data);
      return data;
    } catch (e) {
      if (loud && alive.current) setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
      return null;
    } finally { lock.current = false; }
  };
  const gesture = (kind: "tap" | "sprout" | "hug" | "tickle") => {
    if (touch === "hide" || touch === "bath" || whileSleeping()) return;
    if (kind === "hug") { haptic([12, 60, 12]); flash("hug", 1800); react("happy", say(low ? LOW_HUG_LINES : HUG_LINES)); void care("hug"); return; }
    if (kind === "tickle") { haptic([6, 40, 6, 40, 6]); flash("tickle", 1400); react("happy", say(TICKLE_LINES)); void care("tickle"); return; }
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t <= STARTLE_MS), now];
    if (isStartle(taps.current, now)) {
      taps.current = [];
      haptic([8, 30, 8]);
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
      setMood("idle"); setMurmur(STARTLE_LINE);
      flash("hide", 2200, () => react("pet", PEEK_LINE));
      return;
    }
    if (kind === "sprout") { haptic(6); flash("sprout", 700); react("pet", say(SPROUT_LINES)); return; }
    haptic(8); react("pet", petLine(ownerName));
  };
  const endPress = () => { press.current = null; if (hugTimer.current) clearTimeout(hugTimer.current); };

  /** 말 걸기: 기분을 고르면 모루가 한 줄 답한다 */
  const talk = (replies: string[], feel: string) => { setPanel(null); if (whileSleeping()) return; haptic(8); react("pet", say(replies)); setTalkFeel(feel); void care("talk"); };
  /** 먼지 뭉치를 톡 눌러 치운다 (말끔함 한 칸). 화면에서 먼저 사라지고 서버가 뒤따른다 */
  const sweep = (spot: number) => {
    haptic(6);
    setPoof(spot);
    setSpots((order) => [...order.filter((id) => id !== spot), spot]);
    setTimeout(() => { if (alive.current) setPoof(null); }, 420);
    setPet((p) => (p ? { ...p, clean: Math.min(4, (p.clean ?? 4) + 1) } : p));
    if (!asleep && !napping) react("pet", say(DUST_LINES));
    void care("dust");
  };
  /** 목욕: 하루 한 번, 말끔함이 가득 찬다 */
  const bathe = async () => {
    if (!pet || asleep || touch === "bath") return;
    haptic(10);
    if (napping) setNapWoken(true);
    flash("bath", 2400);
    const data = await care("bath", true);
    if (data) react("happy", say(BATH_LINES));
  };
  /** 간식: 마음밥 하나를 직접 준다, 하루 한 번 (서버가 지킨다) */
  const giveSnack = async () => {
    if (!pet || asleep) return;
    haptic(10);
    if (napping) setNapWoken(true);
    const data = await mutate("/snack", {}, "POST");
    if (data) react("eat", say(SNACK_LINES));
  };
  /** 불 끄기·켜기 (밤에만). 졸린 시간에 꺼 주면 잠든다 */
  const toggleLight = async () => {
    const next = !off;
    haptic(8);
    const data = await care(next ? "lightsOff" : "lightsOn", true);
    if (data && phase === "sleepy") react(next ? "sleep" : "pet", next ? LIGHTS_OFF_LINE : LIGHTS_ON_LINE);
  };
  // 온기·말끔함·기운이 모두 가득 차는 순간 한마디 (처음 불러올 때 이미 가득이면 말하지 않는다)
  const glow = Boolean(pet?.glow);
  const lastGlow = useRef<boolean | null>(null);
  useEffect(() => {
    if (!pet) return;
    if (lastGlow.current === false && glow) react("happy", low ? LOW_GLOW_LINE : GLOW_LINE);
    lastGlow.current = glow;
  }, [pet, glow, react, low]);
  const dust = pet ? dustCount(pet.clean ?? 4) : 0;
  const dustSpots = [...spots.slice(0, dust), ...(poof !== null && !spots.slice(0, dust).includes(poof) ? [poof] : [])]; // 사라지는 중인 먼지도 잠깐 그린다
  const bathHint = !pet ? "" : pet.bathed ? "오늘은 씻었어요" : asleep ? "자는 중이에요" : "목욕 (하루 한 번)";
  const meters: [string, number][] = pet ? [["밥", fullness(pet.meals, hour)], ["온기", pet.warmth ?? 0], ["말끔", pet.clean ?? 0], ["기운", pet.energy ?? 0]] : [];
  const snackHint = !pet ? "" : pet.snacked ? "오늘 간식은 줬어요" : pet.food === 0 ? "마음밥이 없어요" : asleep ? "자는 중이에요" : "간식 주기 (마음밥 1개, 하루 한 번)";
  // 꽉 찬 화면: 방이 화면 전체(탭바 위까지)를 덮는다. 풍경·모루는 카드에서의 비율 그대로 화면을 채울 만큼 키운다 (가로가 넘치면 양옆이 잘린다)
  useEffect(() => {
    if (!full) return;
    const room = roomRef.current, world = worldRef.current;
    if (!room || !world) return;
    const fit = () => {
      const bottom = parseFloat(getComputedStyle(world).bottom) || 0;
      room.style.setProperty("--world-scale", Math.max(room.clientWidth / WORLD_W, (room.clientHeight - bottom) / WORLD_H).toFixed(4));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(room);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 뒤의 홈이 같이 스크롤되지 않게
    return () => { observer.disconnect(); document.body.style.overflow = previous; room.style.removeProperty("--world-scale"); };
  }, [full]);
  // 안드로이드 뒤로 가기는 열린 시트만 닫는다 (저장 중이면 그대로). 마음 기록은 남은 입력을 저장하고 닫는다
  const closeMindRef = useRef<(() => void) | null>(null);
  // 시트·판(메뉴·돌보기·말 걸기)·꽉 찬 화면은 뒤로 가기 기록 하나를 함께 쓴다: 메뉴에서 시트나 꽉 찬 화면을 열 때
  // 판이 기록을 걷어 내며 보낸 뒤로 가기가 방금 연 것을 닫아 버리지 않게. 뒤로 가기는 시트 → 판 → 꽉 찬 화면 순서로 하나씩 닫는다
  // (닫은 뒤에도 남은 것이 있으면 true 를 돌려 기록을 다시 쌓는다)
  useBackLayer(sheet !== null || panel !== null || decorating || full, () => {
    if (sheet !== null) {
      if (busy) return true;
      if (sheet === "mind" && closeMindRef.current) closeMindRef.current();
      else setSheet(null);
      return panel !== null || decorating || full;
    }
    if (panel !== null) { setPanel(null); return decorating || full; }
    if (decorating) { setDecorating(false); setDecorPick(null); return full; }
    setFull(false);
    return false;
  });
  const openSheet = (next: NonNullable<typeof sheet>) => { haptic(8); setError(""); setPanel(null); setSheet(next); };
  const openCompanions = () => { setName(petName); setChosenAppearance(appearance); openSheet("companions"); };
  /** 메뉴·돌보기·말 걸기 판은 한 번에 하나만 열린다. 같은 버튼을 다시 누르면 닫힌다 */
  const togglePanel = (next: NonNullable<typeof panel>) => { haptic(8); setPanel((v) => (v === next ? null : next)); };
  const snackShort = !pet ? "" : pet.snacked ? "오늘 줬어요" : pet.food === 0 ? "마음밥 없음" : asleep ? "자는 중" : "마음밥 1개";
  const bathShort = !pet ? "" : pet.bathed ? "오늘 했어요" : asleep ? "자는 중" : "하루 한 번";
  // 꾸미기 (V49 서버): 방 안 원하는 곳에 끌어다 놓는다. 옛 서버면 버튼이 없다(V47 의 자리 배치는 보여 주기만).
  // 개발용 공간 보기(?moruHome)로 다른 공간을 볼 때는 놓인 가구를 그리지 않는다
  const canDecorate = Boolean(pet?.placed && pet.furniture);
  const placed = canUse ? placedOf(pet, homeId).map((p) => moves[p.item] ?? p) : []; // 손님 방(닫힌 창)에는 가구가 없다
  /** 꾸미기 저장: 앞선 저장이 끝나기를 잠깐 기다렸다가 보낸다 (끌어 놓기를 빨리 이어 해도 마지막 자리가 남게) */
  const saveDecor = async (body: { item: string; x?: number; y?: number; remove?: boolean }) => {
    for (let i = 0; i < 30 && lock.current; i++) await new Promise((r) => setTimeout(r, 100));
    return mutate("/decor", body);
  };
  /** 끌어 놓은 곳을 저장한다. 실패하면 원래 자리로 돌아가고 방에 이유가 뜬다 */
  const dropDecor = async (item: string, x: number, y: number) => {
    haptic(6);
    const token = ++moveToken.current;
    setMoves((m) => ({ ...m, [item]: { item, x, y, token } }));
    await saveDecor({ item, x, y });
    if (alive.current) setMoves((m) => {
      if (m[item]?.token !== token) return m;
      const next = { ...m };
      delete next[item];
      return next;
    });
  };
  /** 가구 상자에서 고르면: (없으면 사서) 방의 첫 자리에 놓고 골라 둔다. 그다음 끌어서 옮긴다 */
  const pickDecor = async (item: string, kind: string) => {
    haptic(10);
    const bought = !(pet?.ownedFurniture ?? []).includes(item);
    const data = await saveDecor({ item, ...firstSpot(kind, placed.length) });
    if (!data) return;
    setSheet(null); setDecorPick(item);
    react("happy", say(DECOR_LINES));
    if (bought) setCelebration({ id: Date.now(), food: 0, level: null, text: `새 가구 · ${FURNITURE[item]?.name ?? "가구"}` });
  };
  /** 넣어 두기: 이 방에서만 빼고, 산 가구는 남는다 */
  const putAway = async (item: string) => {
    haptic(8);
    const data = await saveDecor({ item, remove: true });
    if (data) setDecorPick(null);
  };
  const stopDecorating = () => { haptic(8); setDecorating(false); setDecorPick(null); };
  const speech = thinking ? thinking[thinkIndex % thinking.length] : mood !== "idle" ? message : murmur;

  if (!canUse) return <section className={styles.card} aria-label="모루를 만나기">
    <div className={styles.closedRoom}>
      <SketchFilter />
      <Link href="/auth" className={styles.closedLink} aria-label="나를 찾아줘 — 로그인하고 모루 만나기">
        <span className={styles.closedRain} aria-hidden="true" />
        <span className={styles.closedWindow} aria-hidden="true"><i /><i /><b /><em>✦</em></span>
        <span className={styles.findMe}>나를 찾아줘<span>창문을 두드려 주세요</span></span>
      </Link>
      <div className={styles.pad} role="group" aria-label="오늘의 마음">
        <div className={styles.keys}>
          <Link href="/log" className={`${styles.key} ${styles.keyMain}`} onClick={() => haptic(8)}><PenIcon /><span>마음 기록</span></Link>
        </div>
      </div>
    </div>
  </section>;
  // 모루의 방 한 장 = 게임 화면: 위에는 상태 HUD, 가운데는 모루, 아래에는 조작 패드. 버튼이 모두 이 안에 있다
  return <section className={styles.card} aria-label="나의 소로우 모루 키우기" data-full={full ? "" : undefined}>
    <div className={styles.room} ref={roomRef} onPointerDownCapture={() => { if (rainWanted.current) { rainWanted.current = false; setRainOn(true); } }}>
      <SketchFilter />
      <div className={styles.world} ref={worldRef}>
        {!waiting && <>
        <MoruHomeScene homeId={homeId} sky={sky} />
        <DecorLayer placed={placed} editing={decorating} selected={decorPick} onSelect={setDecorPick}
          onDrop={(item, x, y) => void dropDecor(item, x, y)} onPutAway={(item) => void putAway(item)} />
        {dustSpots.map((spot) => <button key={spot} type="button" className={styles.dust} data-spot={spot} data-poof={poof === spot ? "" : undefined}
          disabled={poof !== null} aria-label="먼지 치우기" onClick={() => sweep(spot)}><DustIcon /></button>)}
        <button type="button" className={styles.petButton} data-touch={touch ?? undefined} data-glow={glow && !asleep ? "" : undefined}
          aria-label={`${petName} 쓰다듬기. 길게 누르면 안아 주기, 문지르면 간질이기`}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            const box = e.currentTarget.getBoundingClientRect();
            press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, xs: [e.clientX], fired: false, spot: touchSpot((e.clientY - box.top) / box.height, appearance === "moru") };
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
            if (hugTimer.current) clearTimeout(hugTimer.current);
            hugTimer.current = setTimeout(() => { const p = press.current; if (p && !p.fired) { p.fired = true; gesture("hug"); } }, HUG_MS);
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (!p || p.id !== e.pointerId || p.fired) return;
            p.xs.push(e.clientX);
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_SLOP && hugTimer.current) clearTimeout(hugTimer.current);
            if (isTickle(rubStats(p.xs))) { p.fired = true; gesture("tickle"); }
          }}
          onPointerUp={(e) => {
            const p = press.current;
            endPress();
            if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= MOVE_SLOP) gesture(p.spot === "sprout" ? "sprout" : "tap");
          }}
          onPointerCancel={endPress}
          onClick={(e) => { if (e.detail === 0) gesture("tap"); /* 키보드·보조 기기 */ }}
          onContextMenu={(e) => e.preventDefault()}>
          <MoruCompanion appearance={appearance} mood={thinking ? "pet" : mood === "idle" ? restMood : mood} level={pet?.level} stage={stage} talk={thinking ? null : talkFeel} />
          {touch === "bath" && <span className={styles.bubbles} aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>}
        </button>
        <span className={styles.dusk} data-phase={phase} data-off={nightly && off ? "" : undefined} aria-hidden="true" />
        {speech && <div className={styles.speech} aria-live="polite" data-thinking={thinking ? "" : undefined} data-murmur={!thinking && mood === "idle" ? "" : undefined}><i aria-hidden="true" />{speech}</div>}
        </>}
      </div>
      <div className={styles.hud}>
        <div className={styles.nameplate} style={waiting ? { visibility: "hidden" } : undefined}>
          <button type="button" disabled={!pet} onClick={openCompanions} aria-label={`${petName}, 이름과 모습 바꾸기`}><b>{petName}</b><span>Lv.{pet?.level ?? 1}</span></button>
          <span className={styles.xp} role="progressbar" aria-label={`${petName} 성장`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></span>
        </div>
        <span className={styles.food} title="마음밥" style={waiting ? { visibility: "hidden" } : undefined}><RiceIcon /><b aria-hidden="true">{pet?.food ?? 0}</b><span className="sr-only">마음밥 {pet?.food ?? 0}개</span></span>
        {pet && <button type="button" className={styles.points} onClick={() => openSheet("homes")} aria-label={`방문포인트 ${pet.points ?? 0} 포인트, 이사하기`}>{pet.points ?? 0} P</button>}
        <button type="button" className={styles.hudIcon} aria-label="메뉴" aria-expanded={panel === "menu"} aria-controls={menuId} onClick={() => togglePanel("menu")}><MenuIcon /></button>
      </div>
      {/* ☰ 메뉴: 설정과 드물게 쓰는 것들. 바깥을 누르거나 뒤로 가기로 닫힌다 */}
      {panel !== null && <button type="button" className={styles.panelScrim} aria-label="닫기" tabIndex={-1} onClick={() => setPanel(null)} />}
      {panel === "menu" && <div className={styles.menu} id={menuId} role="menu" aria-label="메뉴">
        <button type="button" role="menuitem" disabled={!pet} onClick={() => { setPanel(null); openCompanions(); }}><IconSmile /><span>이름·모습</span></button>
        <button type="button" role="menuitem" disabled={!pet} onClick={() => { setPanel(null); openSheet("homes"); }}><HouseIcon /><span>공간 이사</span></button>
        <button type="button" role="menuitemcheckbox" aria-checked={full} onClick={() => { setPanel(null); haptic(8); setFull((v) => !v); }}><ExpandIcon shrink={full} /><span>{full ? "작게 보기" : "꽉 찬 화면"}</span></button>
        <button type="button" role="menuitemcheckbox" aria-checked={rainOn} onClick={() => { setPanel(null); toggleRain(); }}><SoundIcon on={rainOn} /><span>{rainOn ? "창밖 소리 끄기" : "창밖 소리 켜기"}</span></button>
        <button type="button" role="menuitemcheckbox" aria-checked={moodOn} onClick={() => { setPanel(null); toggleMood(); }}><MirrorIcon /><span>{moodOn ? "마음 닮기 끄기" : "마음 닮기 켜기"}</span></button>
        {pet?.weatherSeen && <button type="button" role="menuitem" onClick={() => { setPanel(null); openSheet("book"); }}><IconBook /><span>날씨 도감</span></button>}
        <button type="button" role="menuitem" onClick={() => { setPanel(null); openSheet("guide"); }}><GuideIcon /><span>돌봄 안내</span></button>
      </div>}
      {meters.length > 0 && <div className={styles.meters} role="group" aria-label={`${petName}의 상태`}>
        {meters.map(([label, value]) => <span key={label} role="img" aria-label={`${label} ${value}/4`}><b>{label}</b>{[0, 1, 2, 3].map((i) => <HeartIcon key={i} on={i < value} />)}</span>)}
      </div>}
      {panel === "talk" && <div className={styles.talk} role="group" aria-label={`${petName}에게 말 걸기`}>
        {TALK_TOPICS.map((topic) => <button key={topic.id} type="button" onClick={() => talk(talkReplies(appearance, topic), topic.id)}>{topic.label}</button>)}
      </div>}
      {/* 돌보기: 간식·목욕·안아 주기·불. 할 수 없는 것은 이유를 한 줄로 */}
      {panel === "care" && pet && <div className={styles.care} role="group" aria-label={`${petName} 돌보기`}>
        {tasks.length > 0 && <div className={styles.chores}>
          <b>오늘의 돌봄<small>{tasksDone}/{tasks.length}{pet.tasksRewarded ? " · 다 했어요" : " · 다 하면 +10 P"}</small></b>
          <ul>{tasks.map((t) => <li key={t.id} data-done={t.done ? "" : undefined}><i aria-hidden="true">{t.done ? "✓" : ""}</i>{CHORE_NAMES[t.id] ?? t.id}<span className="sr-only">{t.done ? " 했어요" : " 아직"}</span></li>)}</ul>
        </div>}
        <button type="button" disabled={!ready || pet.food === 0 || Boolean(pet.snacked) || asleep} onClick={() => { setPanel(null); void giveSnack(); }}><SnackIcon /><span>간식 주기<small>{snackShort}</small></span></button>
        <button type="button" disabled={Boolean(pet.bathed) || asleep} onClick={() => { setPanel(null); void bathe(); }}><BathIcon /><span>목욕<small>{bathShort}</small></span></button>
        <button type="button" disabled={asleep} onClick={() => { setPanel(null); gesture("hug"); }}><HugIcon /><span>안아 주기<small>{asleep ? "자는 중" : "온기 +1"}</small></span></button>
        {nightly ? <button type="button" aria-pressed={off} onClick={() => { setPanel(null); void toggleLight(); }}>{off ? <IconSun /> : <IconMoon />}<span>{off ? "불 켜기" : "불 끄기"}<small>{off ? "깨우기" : "재우기"}</small></span></button>
          : <button type="button" disabled><DustIcon /><span>먼지<small>{dust ? `${dust}개, 방에서 톡` : "깨끗해요"}</small></span></button>}
      </div>}
      {celebration && <div key={celebration.id} className={styles.celebration} onAnimationEnd={(event) => { if (event.target === event.currentTarget) setCelebration(null); }}>
        {Array.from({ length: celebration.food }, (_, i) => <i key={i} style={{ left: `${28 + i * 11}%`, animationDelay: `${i * 100}ms` }} aria-hidden="true" />)}
        <span role="status">{celebration.text ? celebration.text : celebration.level ? `Lv.${celebration.level} ↑` : <><RiceIcon /><span className="sr-only">마음밥</span>+{celebration.food}</>}</span>
      </div>}
      {error && !sheet && <div className={styles.alert} role="alert"><span>{error}</span>{!needsLogin && <button type="button" onClick={() => void load()}>다시 연결</button>}</div>}
      {decorating ? <div className={styles.pad} role="group" aria-label="방 꾸미기">
        <p className={styles.status}><span>꾸미기 · {placed.length ? "가구를 끌어서 옮겨요" : "가구 상자에서 골라요"}</span><span>{placed.length}/{DECOR_MAX} · {pet?.points ?? 0} P</span></p>
        <div className={styles.keys}>
          <button type="button" className={styles.key} disabled={!pet} onClick={() => { setDecorPick(null); openSheet("decor"); }}><BoxIcon /><span>가구 상자</span></button>
          <button type="button" className={`${styles.key} ${styles.keyMain}`} onClick={stopDecorating}><DoneIcon /><span>다 꾸몄어요</span></button>
        </div>
      </div> : <div className={styles.pad} role="group" aria-label={`${petName}와 오늘`}>
        <p className={styles.status}>{loading ? <span role="status">방을 정리하는 중…</span> : pet ? <><span>마음 {pet.earned}/{DAILY_FOOD_MAX} · 식사 {pet.meals}/3</span>{moodOn && <button type="button" className={styles.moodTag} data-stage={stage} onClick={() => openSheet("mood")} aria-label={`오늘 ${petName}의 기분: ${MOOD_NAMES[stage]}. 눌러서 자세히 보기`}><MoodFace stage={stage} /><span>{MOOD_NAMES[stage]}</span></button>}<span>{asleep ? "자는 중" : napping ? "낮잠 중" : phase === "sleepy" ? "졸려 해요" : mealStatus(pet.meals, pet.food, hour)}</span></> : <span>잠시 후 다시 만나요</span>}</p>
        <div className={styles.keys}>
          <button type="button" className={`${styles.key} ${styles.keyMain}`} disabled={!ready} onClick={() => { haptic(12); setPanel(null); setError(""); setSheet("mind"); }} aria-label={`${petName}에게 오늘 마음 들려주기`}><PenIcon /><span>마음 기록</span></button>
          <button type="button" className={styles.key} disabled={!pet} aria-expanded={panel === "care"} onClick={() => togglePanel("care")} aria-label={tasks.length ? `${petName} 돌보기, 오늘의 돌봄 ${tasksDone}/${tasks.length}` : `${petName} 돌보기`}><CareIcon /><span>돌보기</span>{tasks.length > 0 && <span className={styles.keyBadge} data-done={pet?.tasksRewarded ? "" : undefined} aria-hidden="true">{tasksDone}/{tasks.length}</span>}</button>
          <button type="button" className={styles.key} disabled={!pet} aria-expanded={panel === "talk"} onClick={() => togglePanel("talk")} aria-label={`${petName}에게 말 걸기`}><IconBubble /><span>말 걸기</span></button>
          {canDecorate && <button type="button" className={styles.key} disabled={!pet} onClick={() => { haptic(8); setPanel(null); setError(""); setDecorating(true); }} aria-label="방 꾸미기"><DecorIcon /><span>꾸미기</span></button>}
        </div>
      </div>}
    </div>
    <DecorBox open={sheet === "decor"} pet={pet} placed={placed} busy={busy} error={error} onPick={(item, kind) => void pickDecor(item, kind)} onClose={() => { if (!busy) setSheet(null); }} />
    <MoruWeatherBook open={sheet === "book"} onClose={() => setSheet(null)} seen={pet?.weatherSeen ?? []} />
    <MoruMindSheet open={sheet === "mind"} name={petName} closeRef={closeMindRef} onClose={(changed) => void closeMind(changed)} />
    <MoruMoodSheet open={sheet === "mood"} onClose={() => setSheet(null)} name={petName} appearance={appearance} level={pet?.level} stage={stage} reading={reading} crisis={crisisDay} journal={journal}
      onBreathe={onBreathe} onWrite={ready ? () => { haptic(12); setSheet("mind"); } : undefined} />
    <Sheet open={sheet === "companions"} title="우리 친구" onClose={() => { if (!busy) setSheet(null); }} className={styles.handSheet}>
      <div className={styles.companionGallery}>
        <form className={styles.nameForm} onSubmit={async (e) => { e.preventDefault(); const data = await mutate("/name", { name }); if (data) { setSheet(null); react("happy", `${data.name}, 그게 내 이름이구나.`); } }}>
          <label className={styles.noteLabel}>부르고 싶은 이름<input maxLength={20} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} required /></label>
          <button type="submit" className={styles.secondary} disabled={busy || !name.trim() || name.trim() === petName}>이름 바꾸기</button>
        </form>
        <div className={styles.companionHero}><MoruCompanion appearance={chosenAppearance} mood="idle" level={pet?.level} /></div>
        <div className={styles.companionChoices} role="group" aria-label="캐릭터 선택">
          {companionChoices(pet?.appearances).map((friend) => <button key={friend.id} type="button" disabled={busy} aria-pressed={chosenAppearance === friend.id} onClick={() => setChosenAppearance(friend.id)}>
            <MoruCompanion appearance={friend.id} mood={chosenAppearance === friend.id ? "happy" : "idle"} />
            <strong>{friend.name}</strong><small>{friend.detail}</small>
          </button>)}
        </div>
        <p className={styles.footnote}>모습만 바뀌어요. 이름과 함께 쌓은 기록은 그대로예요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={styles.primary} disabled={busy || !pet || chosenAppearance === appearance} onClick={async () => {
          const data = await mutate("/appearance", { appearance: chosenAppearance });
          if (data) { setSheet(null); setMood("idle"); if (reactionTimer.current) clearTimeout(reactionTimer.current); }
        }}>{busy ? "저장 중…" : !pet ? "연결 후 선택할 수 있어요" : chosenAppearance === appearance ? "함께하는 중" : "이 모습으로 함께하기"}</button>
      </div>
    </Sheet>
    <Sheet open={sheet === "homes"} title={`${petName}의 공간`} onClose={() => { if (!busy) setSheet(null); }} className={styles.handSheet}>
      <div className={styles.shop}>
        <p className={styles.shopBalance}>방문포인트 <b>{pet?.points ?? 0} P</b><small>첫 방문 +10 · 마음밥 하나에 +4 (하루 +20까지)</small></p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {pet?.homes?.map((home) => {
          const owned = ownedHomes.includes(home.id);
          const current = home.id === homeId;
          const previousNeeded = home.id > 0 && !owned && !ownedHomes.includes(home.id - 1);
          const lowLevel = pet.level < home.level;
          const missing = Math.max(0, home.cost - pet.points);
          const disabled = busy || current || !home.available || (!owned && (previousNeeded || lowLevel || missing > 0));
          const label = current ? "머무는 중" : !home.available ? "준비 중" : owned ? "머물기" : previousNeeded ? "이전 공간 필요" : lowLevel ? `Lv.${home.level} 필요` : missing ? `${missing} P 부족` : "구매하고 이사";
          return <article key={home.id} className={styles.homeCard}>
            <div className={styles.homePreview}>{home.available ? <MoruHomeScene homeId={home.id} sky={sky} /> : <span aria-hidden="true">⌂</span>}</div>
            <div className={styles.homeInfo}><strong>{HOME_NAMES[home.id] ?? home.name}</strong><small>Lv.{home.level} · {owned ? "보유" : `${home.cost} P`}</small>
              <button type="button" disabled={disabled} onClick={async () => { const data = await mutate("/home", { homeId: home.id }); if (data) { setSheet(null); setMood("idle"); if (reactionTimer.current) clearTimeout(reactionTimer.current); } }}>{label}</button>
            </div>
          </article>;
        })}
      </div>
    </Sheet>
    <Sheet open={sheet === "guide"} title={`${petName}와 천천히, 함께`} onClose={() => setSheet(null)} className={styles.handSheet}>
      <div className={styles.guide}>
        <MoruSprite mood="happy" />
        <p>오늘의 기록 하나 = 마음밥 1개 (하루 {DAILY_FOOD_MAX}개)<br />아침 8시 · 점심 13시 · 저녁 19시에 스스로 먹어요<br />간식·목욕은 하루 한 번 · 길게 누르면 안아 주기, 문지르면 간질이기<br />먼지는 톡 눌러 치우고, 밤에는 불을 꺼서 재워 주세요.<br />온기·말끔함·기운이 낮아도 잃는 건 없어요. 쉬어 가도 괜찮아요.<br />{petName}의 기분은 내 기록을 닮아요 (메뉴에서 끌 수 있어요). 하트는 {petName}의 것이에요.</p>
        <Link href="/memo">기록장 ↗</Link>
      </div>
    </Sheet>
  </section>;
}

function HouseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 11.5 12 4.5l8.5 7" /><path d="M6 10v9.5h12V10" /><path d="M10 19.5V15h4v4.5" /></svg>;
}
/** 꽉 찬 화면에서 풍경·모루를 키울 때의 기준 크기: 360px 폭 휴대폰의 카드 속 월드 */
const WORLD_W = 320;
const WORLD_H = 440;
/** 네 모서리가 벌어지는(키우기) / 모이는(줄이기) 화살표 */
function ExpandIcon({ shrink }: { shrink: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {shrink ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
  </svg>;
}
const INK = "#4a3528";
/** 손그림 외곽선의 떨림: UI의 면(::before)에 거는 SVG 필터. MoruPet.module.css 가 url(#moru-sketch) 로 쓴다 */
function SketchFilter() {
  return <svg className={styles.sketchDefs} width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter id="moru-sketch" x="-6%" y="-14%" width="112%" height="128%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>;
}
/** 마음밥: 손으로 그린 밥그릇 (방 안 UI에는 이모지 대신 손그림 아이콘) */
function RiceIcon() {
  return <svg className={styles.handIcon} viewBox="0 0 22 20" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path fill="#fffaf0" d="M4.500 9.500C5 4.800 8 2.500 11 2.500S17 4.800 17.500 9.500Z" />
    <path fill="#cfbdf2" d="M2.500 9.500H19.500C19.500 14.500 16 17.500 11 17.500S2.500 14.500 2.500 9.500Z" />
  </svg>;
}
/** 상태 한 칸: 손으로 그린 하트 (빈 칸은 흰 면) */
function HeartIcon({ on }: { on: boolean }) {
  return <svg className={styles.handIcon} viewBox="0 0 14 13" aria-hidden="true">
    <path fill={on ? "#f29aab" : "#fff"} stroke={on ? INK : "#b9a08b"} strokeWidth="1.5" strokeLinejoin="round"
      d="M7 11.500C3 8.600 1.500 6.400 1.500 4.400C1.500 2.800 2.700 1.600 4.200 1.600C5.400 1.600 6.400 2.300 7 3.300C7.600 2.300 8.600 1.600 9.800 1.600C11.300 1.600 12.500 2.800 12.500 4.400C12.500 6.400 11 8.600 7 11.500Z" />
  </svg>;
}
/** 먼지 뭉치: 눈이 달린 작은 회색 솜 */
function DustIcon() {
  return <svg className={styles.handIcon} viewBox="0 0 30 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path fill="#a99ca3" d="M6 16C2 15 2 10 6 9C5 5 10 3 13 6C15 2 21 3 21 7C25 6 28 10 25 13C28 16 25 20 21 19C19 22 13 22 12 19C9 21 5 20 6 16Z" />
    <path stroke="#2e2222" strokeWidth="2.2" d="M12 11.500V13.500M18 11.500V13.500" />
  </svg>;
}
/** ☰ 메뉴 */
function MenuIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}
/** 마음 닮기: 나란히 닮은 두 얼굴 */
function MirrorIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7.500" cy="12" r="4.500" /><circle cx="16.500" cy="12" r="4.500" /><path d="M5.800 13.200c.900 1 2.500 1 3.400 0M14.800 13.200c.900 1 2.500 1 3.400 0" /></svg>;
}
/** 돌봄 안내: 펼친 쪽지 */
function GuideIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4.500h10l4 4V19.500H5Z" /><path d="M15 4.500v4h4M8.500 12h7M8.500 15.500h5" /></svg>;
}
/** 돌보기: 손 위의 하트 */
function CareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 11.500c-2.300-1.700-3.600-3-3.600-4.400 0-1.100.9-2 2-2 .7 0 1.300.3 1.600.9.3-.6.900-.9 1.600-.9 1.100 0 2 .9 2 2 0 1.400-1.300 2.700-3.600 4.400Z" /><path d="M3.500 15.500l3.500-1.500c1-.4 2.100-.4 3 .1l3.500 1.900h3.500a1.500 1.500 0 0 1 0 3h-5M3.500 19.500h4l2.500.800" />
  </svg>;
}
/** 안아 주기: 두 팔로 감싼 동그라미 */
function HugIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="11" r="5" /><path d="M4 13c1 4 4 6.500 8 6.500s7-2.500 8-6.500" /></svg>;
}
/** 목욕: 물방울 */
function BathIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4c3 3.600 5 6.200 5 9a5 5 0 0 1-10 0c0-2.800 2-5.400 5-9Z" /><path d="M9.500 13.500c0 1.400 1 2.500 2.500 2.500" />
  </svg>;
}
/** 빗소리: 스피커와 물결 (꺼져 있으면 물결 없이) */
function SoundIcon({ on }: { on: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10v4h3l5 4V6L7 10H4Z" />{on ? <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" /> : <path d="m16 10 4 4M20 10l-4 4" />}
  </svg>;
}
/** 간식: 김을 두른 주먹밥 */
function SnackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4.5c1.6 0 2.4 1 3.4 2.8l3.4 6c1.4 2.6.2 5.2-2.8 5.2H8c-3 0-4.2-2.6-2.8-5.2l3.4-6C9.600 5.500 10.400 4.500 12 4.500Z" /><path d="M9.500 18.500v-4h5v4" />
  </svg>;
}
/** 꾸미기: 작은 액자와 화분 */
function DecorIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.500h9v7H4Z" /><path d="m4.500 11 2.800-2.800 2 2 1.400-1.400 2.300 2.300" /><path d="M15 15.500h5l-.8 4h-3.400Z" /><path d="M17.500 15.500c0-2 .5-3.300 2-4.300M17.500 15.500c-.3-1.600-1.300-2.500-2.700-2.800" /></svg>;
}
/** 가구 상자: 뚜껑이 열린 상자 */
function BoxIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.500 10h15v9.500h-15Z" /><path d="M4.500 10 7 5.500h10L19.500 10" /><path d="M10 13.500h4" /></svg>;
}
/** 다 꾸몄어요: 체크 */
function DoneIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500" /></svg>;
}
function PenIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
}
