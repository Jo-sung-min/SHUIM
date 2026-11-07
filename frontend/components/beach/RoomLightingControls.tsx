"use client";

import { useEffect, useId, useRef } from "react";
import { IconMoon } from "@/components/Icons";
import type { RoomLightingMode } from "@/lib/beach/net";
import styles from "./beach.module.css";

const MODES: readonly { mode: RoomLightingMode; label: string }[] = [
  { mode: "auto", label: "자동" }, { mode: "day", label: "낮" },
  { mode: "sunset", label: "노을" }, { mode: "night", label: "밤" },
];

export default function RoomLightingControls({ mode, open, busy, disabled, onOpenChange, onSelect, buttonClass, inline = false }: {
  mode: RoomLightingMode; open: boolean; busy: RoomLightingMode | null; disabled: boolean;
  onOpenChange: (open: boolean) => void; onSelect: (mode: RoomLightingMode) => void;
  /** 햄버거 메뉴 안: 줄 모양 버튼과 바로 펼쳐지는 패널 */
  buttonClass?: string; inline?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); onOpenChange(false); trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, onOpenChange]);
  return <div className={styles.roomClock} ref={container}>
    <button ref={trigger} type="button" className={buttonClass ?? styles.glass + " " + styles.roomClockTrigger}
      aria-label="방의 시간 조절" aria-expanded={open} aria-controls={panelId} onClick={() => onOpenChange(!open)}>
      <IconMoon />시간 조절
    </button>
    {open && <div id={panelId} className={styles.roomClockPanel} data-inline={inline || undefined}>
      <strong>방의 시간</strong>
      <div className={styles.roomClockChoices} role="group" aria-label="방의 낮과 밤" aria-busy={busy !== null}>
        {MODES.map(option => <button key={option.mode} type="button" aria-pressed={mode === option.mode}
          disabled={disabled || busy !== null} onClick={() => onSelect(option.mode)}>
          {busy === option.mode ? "적용 중" : option.label}
        </button>)}
      </div>
      <small>{disabled ? "연결을 확인하고 있어요" : busy ? "같은 풍경으로 맞추고 있어요" : mode === "auto" ? "실제 시간에 맞춰 모두 함께 변해요" : "방 안의 모두에게 같은 풍경이 보여요"}</small>
    </div>}
  </div>;
}
