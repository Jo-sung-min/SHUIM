"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./Joystick.module.css";

const RADIUS = 40;

/**
 * 터치 기기용 화면 조이스틱. 왼쪽 아래에 늘 보이고, 손가락을 대고 끄는 만큼 걷는다 (-1~1, y 는 앞으로가 양수).
 * 캔버스가 아니라 이 요소가 포인터를 잡으므로 둘러보기(캔버스 드래그)와 섞이지 않는다. 마우스로 끌어도 똑같이 움직인다
 */
export default function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  useEffect(() => () => moveRef.current(0, 0), []);

  const update = (e: ReactPointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    setKnob({ x: dx, y: dy });
    onMove(dx / RADIUS, -dy / RADIUS);
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className={`${styles.base} ${active ? styles.active : ""}`}
      role="application"
      aria-label="걷기 조이스틱: 끌어서 걸어요"
      onPointerDown={(e) => {
        if (pointerRef.current !== null) return;
        pointerRef.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
        setActive(true);
        update(e);
      }}
      onPointerMove={(e) => { if (pointerRef.current === e.pointerId) update(e); }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={styles.arrow} data-dir="up" aria-hidden="true" />
      <span className={styles.arrow} data-dir="down" aria-hidden="true" />
      <span className={styles.arrow} data-dir="left" aria-hidden="true" />
      <span className={styles.arrow} data-dir="right" aria-hidden="true" />
      <div className={styles.knob} style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
