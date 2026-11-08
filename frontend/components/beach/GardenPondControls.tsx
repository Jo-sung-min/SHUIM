"use client";

import { useEffect, useState } from "react";
import type { GardenMomentKind, GardenMomentCooldowns } from "@/lib/beach/net";
import styles from "./beach.module.css";

export default function GardenPondControls({ disabled, busy, night, cooldowns, onChoose }: {
  disabled: boolean; busy: GardenMomentKind | null; night: boolean;
  cooldowns: GardenMomentCooldowns; onChoose: (kind: GardenMomentKind) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (Math.max(cooldowns.coin, cooldowns.duck) <= Date.now()) return;
    const timer = window.setInterval(() => {
      const next = Date.now(); setNow(next);
      if (next >= Math.max(cooldowns.coin, cooldowns.duck)) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldowns.coin, cooldowns.duck]);
  return <div className={styles.pondActions} role="group" aria-label="연못에 마음 띄우기">
    {(["coin", "duck"] as const).map(kind => {
      const seconds = Math.max(0, Math.ceil((cooldowns[kind] - now) / 1000));
      const label = kind === "coin" ? "소원동전 던지기" : "빛오리 띄우기";
      return <button key={kind} type="button" className={`${styles.contextButton} ${styles.pondButton}`}
        disabled={disabled || busy !== null || seconds > 0} onClick={() => onChoose(kind)}>
        <span className={styles.contextIcon} aria-hidden="true">{kind === "coin"
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="9" r="5"/><path d="m12 6 .8 2 2.2 1-2.2.8-.8 2.2-.8-2.2L9 9l2.2-1zM5 17c-3 2 0 4 7 4s10-2 7-4M8 16c-2 1 0 2 4 2s6-1 4-2"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M18 11c2-5-5-7-6-3-.4 1.4 0 2.7 1 3.5-2 2-5 1.5-7 .2L3 10c-1 7 4 10 10 9 4-.7 6-4 5-8Z"/><path d="m18 8 4 2-4 1M9 15c1.5 1.5 3.5 1.5 5 .2"/><circle cx="15.5" cy="8.5" r=".6" fill="currentColor" stroke="none"/></svg>}
        </span>
        <span className={styles.contextCopy}><strong>{busy === kind ? "마음 전하는 중…" : label}</strong>
          <small>{seconds ? `${seconds}초 뒤에 다시` : kind === "coin" ? "작은 소원, 잔잔한 파문" : night ? "물 위에 포근한 불빛" : "둥실둥실, 작은 오리"}</small></span>
      </button>;
    })}
  </div>;
}
