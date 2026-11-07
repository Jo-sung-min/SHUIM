"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import styles from "./FieldSoundControl.module.css";

function Speaker({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9h4l5-4v14l-5-4H3z" />{muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
  </svg>;
}

type Props = { map: "beach" | "bamboo" | "garden"; volume: number; open: boolean; buttonClass: string; onOpenChange: (open: boolean) => void;
  onChange: (volume: number) => void; onToggleMute: () => void;
  /** 햄버거 메뉴 안: 패널을 띄우지 않고 버튼 아래에 바로 펼친다 */
  inline?: boolean };

export default function FieldSoundControl({ map, volume, open, buttonClass, onOpenChange, onChange, onToggleMute, inline = false }: Props) {
  const id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), slider = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const close = useRef(onOpenChange);
  useEffect(() => { close.current = onOpenChange; }, [onOpenChange]);
  useLayoutEffect(() => {
    setPortalRoot(open && !inline ? root.current?.closest<HTMLElement>("[data-map]") ?? null : null);
  }, [open, inline]);
  useLayoutEffect(() => {
    const popup = panel.current, button = trigger.current;
    if (!open || inline || !portalRoot || !popup || !button) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const position = () => {
      frame = 0;
      const anchor = button.getBoundingClientRect();
      const viewLeft = viewport?.offsetLeft ?? 0, viewTop = viewport?.offsetTop ?? 0;
      const viewWidth = viewport?.width ?? window.innerWidth, viewHeight = viewport?.height ?? window.innerHeight;
      const width = Math.min(240, Math.max(0, viewWidth - 32));
      const minTop = viewTop + 8;
      let bottom = Math.min(anchor.top - 12, viewTop + viewHeight - 16);
      const joystick = portalRoot.querySelector<HTMLElement>('[role="application"][aria-label^="걷기 조이스틱"]');
      const joystickBox = joystick?.getBoundingClientRect();
      if (joystickBox && joystickBox.width > 0 && joystickBox.height > 0) bottom = Math.min(bottom, joystickBox.top - 12);
      popup.style.width = `${width}px`;
      popup.style.maxHeight = `${Math.max(0, bottom - minTop)}px`;
      popup.style.left = `${Math.max(viewLeft + 16, Math.min(anchor.right - width, viewLeft + viewWidth - width - 16))}px`;
      popup.style.top = `${Math.max(minTop, bottom - popup.offsetHeight)}px`;
      popup.style.visibility = "visible";
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(position); };
    position();
    slider.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(button); observer.observe(popup); observer.observe(portalRoot);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
    };
  }, [open, inline, portalRoot]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !panel.current?.contains(event.target)) close.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); close.current(false); trigger.current?.focus({ preventScroll: true });
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
    {open && (inline || portalRoot) && createPortal(<section ref={panel} id={id} className={styles.panel} data-inline={inline || undefined} style={inline ? undefined : { visibility: "hidden" }} aria-label="현장음 조절">
      <div className={styles.heading}><div><label htmlFor={id + "-range"}>내 현장음</label><small>{map === "beach" ? "파도 · 장작불 · 폭죽" : map === "garden" ? "연못 · 창가의 빗소리 · 폭죽" : "풀벌레 · 폭죽"}</small></div>
        <output htmlFor={id + "-range"}>{valueText}</output></div>
      <div className={styles.row}><button type="button" className={styles.speaker} aria-label={muted ? "현장음 음소거 해제" : "현장음 음소거"}
        aria-pressed={muted} onClick={onToggleMute}><Speaker muted={muted} /></button>
        <input ref={slider} id={id + "-range"} aria-valuetext={valueText} type="range" min={0} max={100} step={1} value={volume}
          style={{ "--filled": volume + "%" } as CSSProperties} onChange={e => onChange(e.currentTarget.valueAsNumber)} />
      </div>
    </section>, inline ? root.current! : portalRoot!)}
  </div>;
}
