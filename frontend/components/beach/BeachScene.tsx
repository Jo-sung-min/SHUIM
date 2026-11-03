"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BeachEngine, webglSupported, type JoystickState, type RestState } from "@/lib/beach/engine";
import { BeachGone, BeachUnavailable, enterBeach, leaveBeach, tickBeach, type CareEvent, type CareKind, type RemotePlayer, type EnterResponse } from "@/lib/beach/net";
import { hourLabel, hourOverride } from "@/lib/beach/daylight";
import { showToast, toastSuccess, tick as haptic } from "@/lib/toast";
import { IconChevronL, IconClose, IconHeart, IconLeaf, IconLock, IconUsers } from "@/components/Icons";
import { route } from "@/lib/routes";
import styles from "./beach.module.css";

const CARE_LABEL: Record<CareKind, string> = { comfort: "위로를 건넸어요", hug: "안아 줬어요" };
const TICK_MOVING = 500;
const TICK_IDLE = 1500;

/**
 * 소로우 바닷가 화면. 엔진(lib/beach/engine)이 그리고, 여기서는 서버와 주고받기(enter → tick … → leave)와 HUD 를 맡는다.
 *  - 움직일 땐 0.5초, 서 있으면 1.5초마다 tick. 탭을 숨기면 멈추고, 돌아오면 이어간다 (티켓이 만료됐으면 다시 들어간다)
 *  - 사람을 탭하면 아래에 닉네임과 "위로해주기 · 안아주기". 보낸 건 다음 tick 에 실려 간다
 *  - 받으면 화면 가장자리 빛 + 눈앞 이펙트 + 토스트 + 햅틱
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
  const tickRunnerRef = useRef<() => Promise<void>>(async () => {});
  const selectedRef = useRef<RemotePlayer | null>(null);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [count, setCount] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(100);
  const [community, setCommunity] = useState<EnterResponse["community"] | null>(null);
  const [selected, setSelected] = useState<RemotePlayer | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [received, setReceived] = useState({ comfort: 0, hug: 0 });
  const [joy, setJoy] = useState<JoystickState | null>(null);
  const [flash, setFlash] = useState<{ kind: CareKind; id: number } | null>(null);
  const [hint, setHint] = useState(false);
  const [timeLabel, setTimeLabel] = useState("");
  const [lost, setLost] = useState(false);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, bump] = useState(0);

  selectedRef.current = selected;

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
    setError(cause.message);
    setPhase("error");
  }, []);

  const reenter = useCallback(async () => {
    const entered = await enterBeach(communityId);
    if (!aliveRef.current) { leaveBeach(entered.ticket); return; }
    ticketRef.current = entered.ticket;
    meRef.current = entered.me;
    setCount(entered.count);
    setCapacity(entered.capacity);
    setCommunity(entered.community);
  }, [communityId]);

  const runTick = useCallback(async () => {
    const engine = engineRef.current;
    const ticket = ticketRef.current;
    if (!aliveRef.current || blockedRef.current || !engine || inFlightRef.current || document.hidden) return;
    inFlightRef.current = true;
    if (!ticket) {
      try {
        await reenter();
      } catch (e) {
        inFlightRef.current = false;
        if (!aliveRef.current) return;
        if (e instanceof BeachUnavailable) { stopWithError(e); return; }
        failRef.current++;
        setLost(failRef.current >= 2);
        scheduleTick();
        return;
      }
    }
    if (!aliveRef.current || !ticketRef.current) { inFlightRef.current = false; return; }
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
        care: care ? { to: care.to, kind: care.kind } : undefined,
      });
      if (!aliveRef.current) return;
      engine.setPlayers(res.players);
      setCount(res.count);
      setReceived(res.received);
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
    } catch (e) {
      if (!aliveRef.current) return;
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
    } finally {
      inFlightRef.current = false;
      scheduleTick();
    }
  }, [handleEvent, reenter, scheduleTick, stopWithError]);
  tickRunnerRef.current = runTick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    aliveRef.current = true;
    blockedRef.current = false;
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
        meRef.current = entered.me;
        setCount(entered.count);
        setCapacity(entered.capacity);
        setCommunity(entered.community);
        engine = new BeachEngine(canvas, {
          bounds: entered.bounds,
          spawn: entered.spawn,
          hourOverride: hourOverride(window.location.search),
          handlers: {
            onSelect: (p) => setSelected(p),
            onJoystick: (s) => setJoy(s),
            onRestChange: (state) => setRest(state),
          },
        });
        engineRef.current = engine;
        if (process.env.NODE_ENV !== "production") (window as unknown as { __beach?: BeachEngine }).__beach = engine; // 개발 콘솔에서 들여다보기
        setTimeLabel(hourLabel(engine.daylightNow.hour));
        await engine.whenReady();
        if (cancelled || !aliveRef.current) { engine.dispose(); return; }
        engine.start();
        setPhase("ready");
        setHint(true);
        window.setTimeout(() => setHint(false), 6000);
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
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [communityId, scheduleTick, stopWithError]);

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
  const returnHref = community ? route(`/c/${community.slug}`) : "/c/home";

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`${community?.name ?? "소로우"}의 프라이빗 바닷가 (1인칭)`} />
      {flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.kind]}`} aria-hidden="true" onAnimationEnd={() => setFlash(null)} />}

      <div className={styles.top}>
        <Link href={returnHref} className={styles.glass} aria-label="바닷가 나가기"><IconChevronL />나가기</Link>
        <div className={styles.chips}>
          {timeLabel && <span className={`${styles.glass} ${styles.chip}`}>{timeLabel}</span>}
          {count !== null && <span className={`${styles.glass} ${styles.chip}`} aria-label={`정원 ${capacity}명 중 지금 ${count}명`}><IconUsers />{count}<span className={styles.capacity}>/ {capacity}</span></span>}
        </div>
      </div>

      {community && phase === "ready" && <div className={styles.place}>
        <span><IconLock />우리만의 프라이빗 해변</span>
        <h1>{community.name} 바닷가</h1>
        <p>큰 절벽 아래, 모닥불과 바다를 향한 오두막.</p>
      </div>}

      {joy && (
        <div className={styles.joyRing} style={{ left: joy.originX, top: joy.originY }} aria-hidden="true">
          <div className={styles.joyKnob} style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }} />
        </div>
      )}

      <div className={styles.bottomHud}>
      {lost && phase === "ready" && <div className={styles.lost} role="status">연결이 불안정해요. 다시 이어 보는 중…</div>}
      {hint && !lost && !selected && !gotAny && !rest && phase === "ready" && (
        <p className={styles.hint} role="status">
          <span className={styles.touchHint}>왼쪽을 끌어 걷고, 오른쪽을 끌어 둘러봐요.</span><span className={styles.keyboardHint}>WASD·방향키로 걷고, 화면을 끌어 둘러봐요.</span><br />오두막에 앉아 쉬거나 사람을 눌러 위로를 건네요.
        </p>
      )}

      {phase === "ready" && rest && (
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
