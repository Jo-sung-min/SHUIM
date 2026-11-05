"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import styles from "./FieldSoundControl.module.css";

function Speaker({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9h4l5-4v14l-5-4H3z" />{muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
  </svg>;
}

type Props = { map: "beach" | "bamboo"; volume: number; open: boolean; buttonClass: string; onOpenChange: (open: boolean) => void;
  onChange: (volume: number) => void; onToggleMute: () => void };

export default function FieldSoundControl({ map, volume, open, buttonClass, onOpenChange, onChange, onToggleMute }: Props) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), slider = useRef<HTMLInputElement>(null);
  const close = useRef(onOpenChange);
  useEffect(() => { close.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    slider.current?.focus({ preventScroll: true });
    const outside = (event: Event) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close.current(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); close.current(false); trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const muted = volume === 0, valueText = muted ? "0%, 음소거" : volume + "%";
  return <div ref={root} className={styles.control}>
    <button ref={trigger} type="button" className={buttonClass} aria-label={`현장음 조절, ${valueText}`} aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => onOpenChange(!open)}>
      <Speaker muted={muted} /><span>현장음</span>
    </button>
    {open && <section id={id} className={styles.panel} aria-label="현장음 조절">
      <div className={styles.heading}><div><label htmlFor={id + "-range"}>내 현장음</label><small>{map === "beach" ? "파도 · 장작불 · 폭죽" : "풀벌레 · 폭죽"}</small></div>
        <output htmlFor={id + "-range"}>{valueText}</output></div>
      <div className={styles.row}><button type="button" className={styles.speaker} aria-label={muted ? "현장음 음소거 해제" : "현장음 음소거"}
        aria-pressed={muted} onClick={onToggleMute}><Speaker muted={muted} /></button>
        <input ref={slider} id={id + "-range"} aria-valuetext={valueText} type="range" min={0} max={100} step={1} value={volume}
          style={{ "--filled": volume + "%" } as CSSProperties} onChange={e => onChange(e.currentTarget.valueAsNumber)} />
      </div>
    </section>}
  </div>;
}
