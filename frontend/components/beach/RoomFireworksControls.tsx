"use client";

import { useEffect, useState } from "react";
import { IconSparkle } from "@/components/Icons";
import styles from "./beach.module.css";

export default function RoomFireworksControls({ deadline, busy, disabled, onLaunch }: {
  deadline: number; busy: boolean; disabled: boolean; onLaunch: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now(); setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <button type="button" className={styles.glass + " " + styles.fireworksTrigger} data-action="fireworks"
    disabled={disabled || busy || remaining > 0} aria-busy={busy}
    aria-label={busy ? "불꽃놀이 준비 중" : remaining ? `불꽃놀이 ${remaining}초 후 가능` : "불꽃놀이 시작"}
    onClick={onLaunch}>
    <IconSparkle /><span>{busy ? "준비 중…" : remaining ? `${remaining}초 후` : "불꽃놀이"}</span>
  </button>;
}
