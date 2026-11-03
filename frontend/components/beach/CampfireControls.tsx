"use client";

import { useEffect, useRef, useState } from "react";
import type { FireState } from "@/lib/beach/net";
import styles from "./CampfireControls.module.css";

interface Props {
  fire: FireState;
  near: boolean;
  disconnected: boolean;
  onAddWood: (requestId: string) => Promise<FireState>;
  onFireChange: (fire: FireState) => void;
}

export default function CampfireControls({ fire, near, disconnected, onAddWood, onFireChange }: Props) {
  const [woodBusy, setWoodBusy] = useState(false);
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

  const addWood = async () => {
    if (woodInFlight.current || cooling || !near || disconnected || fire.logs >= fire.maxLogs) return;
    woodInFlight.current = true; setWoodBusy(true); setWoodNotice("");
    woodAttempt.current ??= crypto.randomUUID();
    try {
      const next = await onAddWood(woodAttempt.current);
      if (!alive.current) return;
      onFireChange(next); woodAttempt.current = null;
      setWoodNotice("장작 한 개를 넣었어요."); setCooling(true);
      cooldownTimer.current = setTimeout(() => { if (alive.current) { setCooling(false); setWoodNotice(""); } }, 3100);
    } catch (cause) {
      if (alive.current) setWoodNotice(cause instanceof Error ? cause.message : "장작을 넣지 못했어요. 다시 시도해 주세요.");
      // Reuse the request ID if the response was lost, so one action adds one log.
    } finally { woodInFlight.current = false; if (alive.current) setWoodBusy(false); }
  };

  return <>
    <div className={styles.controls}>
      <div className={styles.fireStatus}>
        <span className={styles.fireIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M13.2 2.8c.6 4.4-4 5.3-3.6 8.5-1.2-.6-1.9-1.7-2.1-3C3.5 12.3 4 20.6 11.9 21c7.5.4 10-7.4 5.4-12.2.2 2-1 3-1.9 3.3.8-3.8-.3-7.2-2.2-9.3Z" fill="currentColor"/></svg></span>
        <span><strong>모닥불</strong><small>장작 {fire.logs} / {fire.maxLogs}</small></span>
      </div>
      {near && <button type="button" className={styles.woodButton} onClick={() => void addWood()} disabled={woodBusy || cooling || disconnected || fire.logs >= fire.maxLogs}>
        <span aria-hidden="true">🪵</span>{woodBusy ? "넣는 중…" : cooling ? "따뜻해지고 있어요" : fire.logs >= fire.maxLogs ? "장작이 충분해요" : "장작 넣기"}<small>무료</small>
      </button>}
    </div>
    {woodNotice && <p className={styles.woodNotice} role="status">{woodNotice}</p>}
  </>;
}
