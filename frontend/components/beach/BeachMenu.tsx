"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose, IconMenu } from "@/components/Icons";
import styles from "./BeachMenu.module.css";

/**
 * 모바일 상단의 햄버거 메뉴. 현장음·내 캐릭터·음악·불꽃놀이·시간 조절을 한 패널에 모은다.
 *  - 패널은 닫혀도 떼어내지 않고 숨기기만 한다 (방 음악 플레이어가 안에 살아 있다)
 *  - 한 줄이 펼쳐지면(aria-expanded) 나머지 줄은 CSS :has 로 숨겨 그 항목만 남는다. 펼친 줄을 다시 누르면 목록으로 돌아온다
 *  - 바깥을 누르거나 Esc 를 누르면 닫힌다. 펼친 항목이 있을 땐 Esc 가 그 항목을 먼저 접는다
 */
export default function BeachMenu({ open, onOpenChange, label, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; label: string; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const change = useRef(onOpenChange);
  useEffect(() => { change.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) change.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || panel.current?.querySelector('[aria-expanded="true"]')) return;
      event.preventDefault(); change.current(false); trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className={styles.menu}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={open ? "메뉴 닫기" : label} aria-expanded={open}
      aria-controls={panelId} onClick={() => onOpenChange(!open)}>
      {open ? <IconClose /> : <IconMenu />}
    </button>
    <div ref={panel} id={panelId} className={styles.panel} role="group" aria-label={label} hidden={!open}>{children}</div>
  </div>;
}
