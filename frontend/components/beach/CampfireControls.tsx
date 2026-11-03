"use client";

import { useEffect, useRef, useState } from "react";
import type { FireState } from "@/lib/beach/net";
import type { ViewMode } from "@/lib/beach/engine";
import styles from "./CampfireControls.module.css";

/** 장작 넣기의 진행 단계: 모닥불까지 걸어가는 중 → 넣는 중 */
export type WoodPhase = "walking" | "adding";

interface Props {
  fire: FireState;
  near: boolean;
  disconnected: boolean;
  onAddWood: (requestId: string, phase: (p: WoodPhase) => void) => Promise<FireState>;
  onFireChange: (fire: FireState) => void;
  /** 지금 시점. 버튼을 누르면 1인칭 ↔ 3인칭 */
  view: ViewMode;
  onToggleView: () => void;
}

/**
 * 하단 글래스 바: 모닥불 상태(장작 수·게이지)와 "장작 넣기", 오른쪽 끝에 시점 전환. 멀리 있어도 누르면 캐릭터가 알아서 불 앞까지 걸어가 넣는다.
 * 장작이 0 이어도 불씨는 남으므로 "꺼졌다" 대신 "불씨만 남았어요" 로 알린다
 */
export default function CampfireControls({ fire, near, disconnected, onAddWood, onFireChange, view, onToggleView }: Props) {
  const [phase, setPhase] = useState<WoodPhase | null>(null);
  const [cooling, setCooling] = useState(false);
  const [woodNotice, setWoodNotice] = useState("");
  const alive = useRef(true);
  const woodAttempt = useRef<string | null>(null);
  const woodInFlight = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (cooldownTimer.current) clearTimeout(cooldownTimer.current); };
  }, []);

  const full = fire.logs >= fire.maxLogs;

  const addWood = async () => {
    if (woodInFlight.current || cooling || disconnected || full) return;
    woodInFlight.current = true; setPhase("walking"); setWoodNotice("");
    woodAttempt.current ??= crypto.randomUUID();
    try {
      const next = await onAddWood(woodAttempt.current, (p) => { if (alive.current) setPhase(p); });
      if (!alive.current) return;
      onFireChange(next); woodAttempt.current = null;
      setWoodNotice("장작 한 개를 넣었어요. 불이 크게 타올라요."); setCooling(true);
      cooldownTimer.current = setTimeout(() => { if (alive.current) { setCooling(false); setWoodNotice(""); } }, 3100);
    } catch (cause) {
      if (alive.current) setWoodNotice(cause instanceof Error ? cause.message : "장작을 넣지 못했어요. 다시 시도해 주세요.");
      // Reuse the request ID if the response was lost, so one action adds one log.
    } finally { woodInFlight.current = false; if (alive.current) setPhase(null); }
  };

  const label = phase === "walking" ? "불 곁으로 가는 중…" : phase === "adding" ? "넣는 중…" : cooling ? "따뜻해지고 있어요" : full ? "장작이 충분해요" : "장작 넣기";
  const sub = phase || cooling || full ? null : near ? "무료" : "걸어가서 넣어요";

  return <>
    <div className={styles.bar} role="group" aria-label="모닥불">
      <div className={styles.fireStatus}>
        <span className={styles.fireIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M13.2 2.8c.6 4.4-4 5.3-3.6 8.5-1.2-.6-1.9-1.7-2.1-3C3.5 12.3 4 20.6 11.9 21c7.5.4 10-7.4 5.4-12.2.2 2-1 3-1.9 3.3.8-3.8-.3-7.2-2.2-9.3Z" fill="currentColor"/></svg></span>
        <span className={styles.fireCopy}>
          <strong>모닥불</strong>
          <small>{fire.logs === 0 ? "불씨만 남았어요 · 장작 0" : `장작 ${fire.logs}`} / {fire.maxLogs}</small>
          <span className={styles.meter} aria-hidden="true">
            {Array.from({ length: fire.maxLogs }, (_, i) => <i key={i} data-lit={i < fire.logs} />)}
          </span>
        </span>
      </div>
      <button type="button" className={styles.woodButton} onClick={() => void addWood()} disabled={Boolean(phase) || cooling || disconnected || full} data-busy={Boolean(phase)}>
        <span className={styles.woodLabel}><span aria-hidden="true">🪵</span>{label}</span>
        {sub && <small>{sub}</small>}
      </button>
      <button type="button" className={styles.viewButton} onClick={onToggleView} aria-pressed={view === "third"} aria-label={view === "third" ? "1인칭으로 보기" : "3인칭으로 보기 (내 캐릭터가 보여요)"} aria-keyshortcuts="V">
        {view === "third"
          ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.8"/><path d="M5 20.5c.6-4 3.3-6.5 7-6.5s6.4 2.5 7 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
        <small>{view === "third" ? "1인칭" : "3인칭"}</small>
      </button>
    </div>
    {woodNotice && <p className={styles.woodNotice} role="status">{woodNotice}</p>}
  </>;
}
