"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BeachEngine } from "@/lib/beach/engine";
import type { MapId } from "@/lib/beach/maps";
import { ORB_GROUNDS } from "@/lib/beach/emotion-orb-spots";
import { ORB_BEAT_MS, ORB_KINDS, orbBeatDelay, orbMood, orbNeedMs, orbReady, pickOrbPlace, type Orb, type OrbPlace } from "@/lib/emotion-orbs";
import { beatOrbStay, claimOrb } from "@/lib/keepsakes";
import { hasCrisisSignal } from "@/lib/crisis";
import { devMood, loadMoodSync } from "@/lib/moru";
import { moodOf } from "@/lib/moru-rules";
import { loadJournal, read, syncRecords, todayKey, write } from "@/lib/storage";
import { showToast, tick as haptic } from "@/lib/toast";

/** 개발 확인용 주소 파라미터 (운영 빌드에서는 무시): ?orbAfter=초, ?orbSpot=자리 id */
function devParam(name: string): string | null {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** 구슬을 처음 주웠을 때만 한 줄 설명을 붙인다 (이 기기, 계정별) */
const INTRO_KEY = "orb:intro:v1";

export interface FoundOrb { orb: Orb; first: boolean }

/**
 * 맵의 감정구슬 (docs/EMOTION_ORBS.md 2장). 맵이 준비되면 30초마다 서버에 머무는 중임을 알리고,
 * 오늘 머문 시간이 차면 그날의 자리에 구슬을 조용히 놓는다. 알리는 문구는 없다: 가까이 가면 near 가 켜질 뿐이다.
 * 서버가 구슬을 모르거나(옛 서버) 이 계정에 구슬이 없으면 첫 신호에서 조용히 그만둔다.
 * 엔진·티켓·계정은 화면이 쥔 ref 를 그때그때 읽는다 (다시 들어가 티켓이 바뀌어도 이어진다).
 */
export function useEmotionOrb(opts: {
  mapId: MapId;
  spaceId: string;
  ready: boolean;
  engine: () => BeachEngine | null;
  ticket: () => string | null;
  userId: () => string | null;
}) {
  const { mapId, spaceId, ready } = opts;
  const access = useRef(opts);
  access.current = opts;
  const [near, setNear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<FoundOrb | null>(null);
  const placeRef = useRef<(OrbPlace & { day: string }) | null>(null);
  const busyRef = useRef(false);
  const pickRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!ready) return;
    let alive = true, stopped = false, timer = 0;
    placeRef.current = null;
    setNear(false);
    const devAfter = devParam("orbAfter"), devSpot = devParam("orbSpot");
    const production = process.env.NODE_ENV === "production";

    const place = (engine: BeachEngine, userId: string, day: string) => {
      if (placeRef.current?.day === day && engine.hasOrb) return;
      // 지하 쉼터 안에서는 놓지 않는다. 지상으로 올라온 뒤의 신호에서 놓인다
      if (engine.bunkerId) return;
      const ground = ORB_GROUNDS[mapId], self = engine.getSelf();
      const spot = pickOrbPlace(ground.spots, `${userId}|${day}|${mapId}`, (x, z) => engine.settleOrb(x, z),
        { x: self.x, z: self.z }, { avoid: ground.avoid, only: devSpot });
      placeRef.current = { ...spot, day };
      engine.setOrb({ x: spot.x, z: spot.z });
      // 맵으로 바로 들어온 기기는 오늘 기록을 아직 못 받았을 수 있다: 줍기 전에 미리 받아 둔다 (그날의 기분은 이 기록에서 나온다)
      void syncRecords().catch(() => false);
    };

    const beat = async () => {
      if (!alive || stopped) return;
      const { engine, ticket, userId } = access.current;
      const eng = engine(), pass = ticket(), me = userId();
      let delay = ORB_BEAT_MS;
      if (eng && pass && me && !document.hidden && navigator.onLine !== false) {
        try {
          const today = await beatOrbStay(pass);
          if (!alive) return;
          if (today === null) { stopped = true; return; }
          if (today !== "gone") {
            const need = orbNeedMs(today.needMs, devAfter, production);
            delay = orbBeatDelay(need);
            // 자정을 넘겼다: 어제의 구슬은 조용히 사라지고 오늘의 시간은 0부터 다시 쌓인다
            if (placeRef.current && placeRef.current.day !== today.day && !busyRef.current) { eng.setOrb(null); placeRef.current = null; }
            if (today.found) {
              // 오늘은 이미 주웠다 (다른 기기에서 주웠을 수도 있다): 이번 방문에서는 더 묻지 않는다
              if (!busyRef.current) { eng.setOrb(null); placeRef.current = null; }
              stopped = true;
              return;
            }
            if (orbReady(today, need) && access.current.engine() === eng) place(eng, me, today.day);
          }
        } catch { /* 잠깐 끊겼다: 다음 신호에서 다시 */ }
      }
      if (alive && !stopped) timer = window.setTimeout(() => void beat(), delay);
    };
    timer = window.setTimeout(() => void beat(), 1500);
    const onVisible = () => {
      if (document.hidden || stopped) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void beat(), 1000);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      access.current.engine()?.setOrb(null);
      placeRef.current = null;
    };
  }, [ready, mapId, spaceId]);

  const pick = useCallback(async () => {
    const { engine, ticket } = access.current;
    const eng = engine(), pass = ticket(), spot = placeRef.current;
    if (!eng || !pass || !spot || busyRef.current || !eng.hasOrb) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // 그날의 기분: 홈의 캐릭터가 띠는 기분과 같다. 닮기를 껐거나 오늘 기록에 위험 신호가 있으면 고요
      const journal = loadJournal(), key = todayKey();
      const crisis = hasCrisisSignal(Object.values(journal[key] ?? {}).map((entry) => entry?.note ?? "").join(" "));
      const mood = devMood() ?? orbMood(moodOf(journal, key).stage, { syncOn: loadMoodSync(), crisis });
      const result = await claimOrb(pass, mood, spot);
      if (access.current.engine() !== eng) return;
      if ("orb" in result) {
        const first = read<boolean>(INTRO_KEY, false) !== true;
        if (first) write(INTRO_KEY, true);
        haptic(18);
        placeRef.current = null;
        void eng.collectOrb(ORB_KINDS[result.orb.mood].glow);
        setFound({ orb: result.orb, first });
      } else if (result.refused === "taken" || result.refused === "missing") {
        eng.setOrb(null);
        placeRef.current = null;
        if (result.refused === "taken") showToast("오늘의 구슬은 이미 보관함에 있어요.", { kind: "info" });
      } else {
        showToast(result.refused === "gone" ? "연결을 다시 확인한 뒤 주워 주세요." : result.message, { kind: "info" });
      }
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "구슬을 줍지 못했어요. 다시 눌러 주세요.", { kind: "info" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  pickRef.current = () => void pick();

  /** 엔진의 손잡이에 그대로 꽂는다 (늘 같은 함수) */
  const onRange = useCallback((next: boolean) => setNear(next), []);
  const onTap = useCallback(() => pickRef.current(), []);
  const dismiss = useCallback(() => setFound(null), []);

  return { near, busy, found, pick, dismiss, onRange, onTap };
}
