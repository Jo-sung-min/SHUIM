"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconHeart, IconSmile, IconSparkle } from "@/components/Icons";
import type { FireworkVariant } from "@/lib/beach/net";
import styles from "./beach.module.css";

const STYLES = [
  { variant: "festival", label: "축제", description: "밤하늘 가득, 함께 터지는 불꽃", Icon: IconSparkle },
  { variant: "songi", label: "송이 안녕?", description: "송이에게 전하는 반가운 인사", Icon: IconSmile },
  { variant: "love", label: "사랑해", description: "마음을 하늘에 적어요", Icon: IconHeart },
] as const;

export default function RoomFireworksControls({ deadline, busy, disabled, onLaunch }: {
  deadline: number; busy: boolean; disabled: boolean; onLaunch: (variant: FireworkVariant) => void;
}) {
  const [now, setNow] = useState(Date.now);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
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
  const unavailable = disabled || busy || remaining > 0;
  useEffect(() => { if (unavailable) setOpen(false); }, [unavailable]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    };
    container.current?.querySelector<HTMLButtonElement>("[data-firework-variant]")?.focus();
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={container} className={styles.fireworksControl}>
    <button ref={trigger} type="button" className={styles.glass + " " + styles.fireworksTrigger} data-action="fireworks"
      disabled={unavailable} aria-busy={busy} aria-expanded={open} aria-controls={panelId}
      aria-label={busy ? "불꽃놀이 준비 중" : remaining ? `불꽃놀이 ${remaining}초 후 가능` : "불꽃놀이 고르기"}
      onClick={() => setOpen(!open)}>
      <IconSparkle /><span>{busy ? "준비 중…" : remaining ? `${remaining}초 후` : "불꽃놀이"}</span>
    </button>
    {open && <div id={panelId} className={styles.fireworksPanel} role="group" aria-label="불꽃놀이 종류">
      <strong>하늘에 띄우고 싶은 마음</strong>
      {STYLES.map(({ variant, label, description, Icon }) => <button key={variant} type="button"
        data-firework-variant={variant} disabled={unavailable}
        onClick={() => { setOpen(false); trigger.current?.focus(); onLaunch(variant); }}>
        <Icon /><span><strong>{label}</strong><small>{description}</small></span>
      </button>)}
      <small>고르면 바로 시작해요.</small>
    </div>}
  </div>;
}
