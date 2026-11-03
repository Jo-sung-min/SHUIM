"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/components/ui";
import { IconCheck, IconSparkle } from "@/components/Icons";
import { tick as haptic } from "@/lib/toast";
import { BeachCooldown, BeachUnavailable, type FireState, type PowderColor } from "@/lib/beach/net";
import type { ViewMode } from "@/lib/beach/engine";
import styles from "./CampfireControls.module.css";

/** 불 곁으로 걸어가는 중 → 장작/가루를 넣는 중 */
export type WoodPhase = "walking" | "adding";
const POWDERS: { color: PowderColor; name: string; fill: string }[] = [
  { color: "rose", name: "로즈", fill: "linear-gradient(135deg,#ffd2c4,#ed83a0 70%)" },
  { color: "aurora", name: "민트", fill: "linear-gradient(135deg,#e8f8b2,#60cba8 70%)" },
  { color: "ocean", name: "블루", fill: "linear-gradient(135deg,#c8efff,#729fe8 70%)" },
  { color: "violet", name: "라벤더", fill: "linear-gradient(135deg,#f8d4f5,#ae91e8 70%)" },
  { color: "rainbow", name: "무지개", fill: "conic-gradient(from 35deg,#e9a3c2,#c7b8ed,#8ebfe7,#94d9b7,#f6db98,#e9a3c2)" },
];
interface Props {
  fire: FireState; near: boolean; disconnected: boolean;
  onAddWood: (requestId: string, phase: (p: WoodPhase) => void) => Promise<FireState>;
  onAddPowder: (requestId: string, color: PowderColor, phase: (p: WoodPhase) => void) => Promise<FireState>;
  onFireChange: (fire: FireState) => void;
  powderOpen: boolean; onPowderOpenChange: (open: boolean) => void;
  view: ViewMode; onToggleView: () => void;
}
function noticeFor(cause: unknown, fallback: string) {
  if (cause instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(cause.name)) return "응답을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  return cause instanceof Error ? cause.message : fallback;
}

export default function CampfireControls({ fire, near, disconnected, onAddWood, onAddPowder, onFireChange, powderOpen, onPowderOpenChange, view, onToggleView }: Props) {
  const [phase, setPhase] = useState<WoodPhase | null>(null);
  const [powderPhase, setPowderPhase] = useState<WoodPhase | null>(null);
  const [cooling, setCooling] = useState(false);
  const [notice, setNotice] = useState("");
  const [chosen, setChosen] = useState<PowderColor>("rainbow");
  const [pending, setPending] = useState<{ id: string; color: PowderColor } | null>(null);
  const [retryPauseUntil, setRetryPauseUntil] = useState(0);
  const [serverNow, setServerNow] = useState(fire.serverTime);
  const clockSample = useRef({ server: fire.serverTime, received: performance.now() });
  const alive = useRef(true);
  const woodAttempt = useRef<string | null>(null);
  const woodInFlight = useRef(false);
  const powderAttempt = useRef<{ id: string; color: PowderColor } | null>(null);
  const powderInFlight = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishNotice = (message: string, transient = false) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    if (transient) noticeTimer.current = setTimeout(() => { if (alive.current) setNotice(""); }, 4000);
  };
  useEffect(() => {
    alive.current = true;
    const clock = window.setInterval(() => setServerNow(clockSample.current.server + Math.max(0, performance.now() - clockSample.current.received)), 1000);
    return () => { alive.current = false; window.clearInterval(clock); if (cooldownTimer.current) clearTimeout(cooldownTimer.current); if (noticeTimer.current) clearTimeout(noticeTimer.current); };
  }, []);
  useEffect(() => {
    clockSample.current = { server: fire.serverTime, received: performance.now() };
    setServerNow(fire.serverTime);
  }, [fire.serverTime]);
  const full = fire.logs >= fire.maxLogs;
  const activePowder = fire.logs > 0 && fire.powder && fire.powder.expiresAt > serverNow ? fire.powder : null;
  const activeName = POWDERS.find((item) => item.color === activePowder?.color)?.name;
  const remaining = activePowder ? Math.max(0, Math.ceil((activePowder.expiresAt - serverNow) / 1000)) : 0;
  const cooldown = Math.max(0, Math.ceil(((fire.powder?.startedAt ?? 0) + 10_000 - serverNow) / 1000), Math.ceil((retryPauseUntil - serverNow) / 1000));
  const busy = Boolean(phase || powderPhase);
  const selected = POWDERS.find((item) => item.color === (pending?.color ?? chosen)) ?? POWDERS[4];
  const powderAvailable = fire.powderEnabled === true;
  const addWood = async () => {
    if (woodInFlight.current || powderInFlight.current || cooling || disconnected || full) return;
    woodInFlight.current = true; setPhase("walking"); publishNotice("");
    woodAttempt.current ??= crypto.randomUUID();
    try {
      const next = await onAddWood(woodAttempt.current, (p) => { if (alive.current) setPhase(p); });
      if (!alive.current) return;
      onFireChange(next); woodAttempt.current = null;
      publishNotice("장작 한 개를 넣었어요. 불이 크게 타올라요.", true); setCooling(true);
      cooldownTimer.current = setTimeout(() => { if (alive.current) setCooling(false); }, 3100);
    } catch (cause) { if (alive.current) publishNotice(noticeFor(cause, "장작을 넣지 못했어요. 다시 시도해 주세요.")); }
    finally { woodInFlight.current = false; if (alive.current) setPhase(null); }
  };
  const openPowder = () => {
    if (busy || disconnected || !powderAvailable || (cooldown > 0 && !pending)) return;
    if (pending) setChosen(pending.color);
    onPowderOpenChange(true); haptic(8);
  };
  const putPowder = async () => {
    if (powderInFlight.current || woodInFlight.current || disconnected || !powderAvailable || (fire.logs <= 0 && !powderAttempt.current) || (cooldown > 0 && !powderAttempt.current)) return;
    const retrying = Boolean(powderAttempt.current);
    const attempt = powderAttempt.current ?? { id: crypto.randomUUID(), color: chosen };
    powderAttempt.current = attempt; setPending(attempt); powderInFlight.current = true;
    let submitted = false;
    setPowderPhase("walking"); publishNotice(""); onPowderOpenChange(false); haptic(10);
    try {
      const next = await onAddPowder(attempt.id, attempt.color, (nextPhase) => {
        submitted ||= nextPhase === "adding";
        if (alive.current) setPowderPhase(nextPhase);
      });
      if (!alive.current) return;
      onFireChange(next); powderAttempt.current = null; setPending(null); setRetryPauseUntil(0);
      publishNotice(retrying ? "가루를 넣은 결과를 확인했어요." : "불꽃에 색이 천천히 번져요.", true); haptic(14);
    } catch (cause) {
      if (!alive.current) return;
      // Definite rejection can choose anew. Uncertain response retains BOTH request ID and color.
      if ((!retrying && !submitted) || (submitted && (cause instanceof BeachUnavailable || cause instanceof BeachCooldown))) { powderAttempt.current = null; setPending(null); }
      if (cause instanceof BeachCooldown) setRetryPauseUntil(clockSample.current.server + Math.max(0, performance.now() - clockSample.current.received) + 2000);
      publishNotice(noticeFor(cause, "가루를 확인하지 못했어요. 같은 색으로 다시 확인해 주세요."));
    } finally { powderInFlight.current = false; if (alive.current) setPowderPhase(null); }
  };
  const label = phase === "walking" ? "걸어가는 중…" : phase === "adding" ? "넣는 중…" : cooling ? "따뜻해져요" : full ? "장작 충분" : "장작 넣기";
  const sub = phase || cooling || full ? null : near ? "무료" : "걸어가서 넣어요";
  const powderLabel = powderPhase === "walking" ? "걸어가는 중…" : powderPhase === "adding" ? "넣는 중…" : "가루 넣기";
  return <>
    <div className={`${styles.bar} ${styles.withPowder}`} role="group" aria-label="모닥불">
      <div className={styles.fireStatus}>
        <span className={styles.fireIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M13.2 2.8c.6 4.4-4 5.3-3.6 8.5-1.2-.6-1.9-1.7-2.1-3C3.5 12.3 4 20.6 11.9 21c7.5.4 10-7.4 5.4-12.2.2 2-1 3-1.9 3.3.8-3.8-.3-7.2-2.2-9.3Z" fill="currentColor"/></svg></span>
        <span className={styles.fireCopy}>
          <strong>모닥불</strong>
          <small>{activePowder ? `${activeName} · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : fire.logs === 0 ? "불씨만 남았어요" : `장작 ${fire.logs} / ${fire.maxLogs}`}</small>
          <span className={styles.meter} role="img" aria-label={`장작 ${fire.logs}개, 최대 ${fire.maxLogs}개`}>{Array.from({ length: fire.maxLogs }, (_, i) => <i key={i} data-lit={i < fire.logs} />)}</span>
        </span>
      </div>
      <button type="button" className={styles.woodButton} onClick={() => void addWood()} disabled={busy || cooling || disconnected || full} data-busy={Boolean(phase)}>
        <span className={styles.woodLabel}><span aria-hidden="true">🪵</span>{label}</span>{sub && <small>{sub}</small>}
      </button>
      <button type="button" className={styles.powderButton} onClick={openPowder} disabled={busy || disconnected || !powderAvailable || (cooldown > 0 && !pending)} data-busy={Boolean(powderPhase)} aria-haspopup="dialog">
        <span><IconSparkle />{powderLabel}</span><small>{!powderAvailable ? "준비 중" : powderPhase ? "잠깐만요" : pending ? "결과 확인" : cooldown > 0 ? `${cooldown}초 뒤` : fire.logs <= 0 ? "장작 먼저" : "색 고르기"}</small>
      </button>
      <button type="button" className={styles.viewButton} onClick={onToggleView} aria-pressed={view === "third"} aria-label={view === "third" ? "1인칭으로 보기" : "3인칭으로 보기 (내 캐릭터가 보여요)"} aria-keyshortcuts="V">
        {view === "third" ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20.5c.6-4 3.3-6.5 7-6.5s6.4 2.5 7 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
        <small>{view === "third" ? "1인칭" : "3인칭"}</small>
      </button>
    </div>
    {notice && <p className={styles.woodNotice} role="status">{notice}</p>}
    {powderOpen && createPortal(<Sheet open={powderOpen} onClose={() => onPowderOpenChange(false)} title="불꽃에 색을 더해요">
      <div className={styles.powderSheet}>
        <p className={styles.powderIntro}>작은 가루를 넣으면 불꽃이 물들어요.<br /><span>무료 · 약 90초 동안 함께 보여요</span></p>
        <div className={styles.powderChoices} role="group" aria-label="가루 색상">
          {POWDERS.map((item) => <button type="button" key={item.color} className={styles.powderChoice} aria-pressed={selected.color === item.color} disabled={Boolean(pending)} onClick={() => { setChosen(item.color); haptic(6); }}>
            <span className={styles.powderSwatch} style={{ "--powder-fill": item.fill } as CSSProperties} aria-hidden="true"><IconSparkle />{selected.color === item.color && <i><IconCheck /></i>}</span><span>{item.name}</span>
          </button>)}
        </div>
        {pending ? <p className={styles.powderHint} role="status">이전 응답을 확인하지 못했어요. 같은 색으로 다시 확인하면 돼요.</p> : <p className={styles.powderHint}>{fire.logs <= 0 ? "먼저 장작을 넣어 불꽃을 피워 주세요." : cooldown > 0 ? `다음 가루까지 ${cooldown}초만 기다려 주세요.` : near ? "모닥불 곁에서 천천히 넣어볼까요?" : "불 곁으로 걸어가서 가루를 넣을게요."}</p>}
        <button type="button" className={styles.powderConfirm} disabled={busy || disconnected || !powderAvailable || (fire.logs <= 0 && !pending) || (cooldown > 0 && !pending)} onClick={() => void putPowder()}>{pending ? "같은 색으로 다시 확인" : cooldown > 0 ? `${cooldown}초 뒤 넣기` : `${selected.name} 가루 넣기`}</button>
      </div>
    </Sheet>, document.body)}
  </>;
}
