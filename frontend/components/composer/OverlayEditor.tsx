"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { OverlayText } from "../FeedMedia";
import { clampOverlay, OVERLAY_SIZE_MAX, OVERLAY_SIZE_MIN, type TextOverlay } from "@/lib/feed-media";
import { IconTrash } from "../Icons";
import styles from "./Composer.module.css";

type Gesture = {
  index: number;
  pointers: Map<number, { x: number; y: number }>;
  start: { x: number; y: number; size: number };
  origin: { x: number; y: number };
  pinch?: { distance: number; size: number };
  moved: boolean;
  at: number;
};

const SNAP = 0.02;
const distance = (points: { x: number; y: number }[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

/**
 * 콘텐츠 상자 위의 글: 끌어서 이동(가운데 스냅), 두 손가락으로 크기, 아래 휴지통으로 끌면 삭제, 탭하면 다시 편집.
 * 키보드: 방향키 이동, +/- 크기, Enter 편집, Delete 삭제.
 */
export default function OverlayEditor({ overlays, box, onChange, onEdit }: {
  overlays: TextOverlay[];
  box: React.RefObject<HTMLDivElement | null>;
  onChange: (next: TextOverlay[]) => void;
  onEdit: (index: number) => void;
}) {
  const gesture = useRef<Gesture | null>(null);
  const trash = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const update = (index: number, patch: Partial<TextOverlay>) => onChange(overlays.map((o, i) => i === index ? clampOverlay({ ...o, ...patch }) : o));
  const remove = (index: number) => onChange(overlays.filter((_, i) => i !== index));
  const isOverTrash = (x: number, y: number) => {
    const rect = trash.current?.getBoundingClientRect();
    if (!rect) return false;
    return Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2)) < 44;
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-ovl]");
    const g = gesture.current;
    if (g) {
      // 두 번째 손가락: 어디를 짚어도 잡은 글의 크기 조절
      if (g.pointers.size >= 2) return;
      g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 포인터가 이미 끝남 */ }
      g.pinch = { distance: distance([...g.pointers.values()]), size: overlays[g.index].size };
      return;
    }
    if (!target || event.button > 0) return;
    const index = Number(target.dataset.ovl);
    const o = overlays[index];
    if (!o) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 포인터가 이미 끝남 */ }
    gesture.current = { index, pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]), start: { x: o.x, y: o.y, size: o.size }, origin: { x: event.clientX, y: event.clientY }, moved: false, at: Date.now() };
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const rect = box.current?.getBoundingClientRect();
    if (!g || !rect || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pinch && g.pointers.size === 2) {
      const d = distance([...g.pointers.values()]);
      if (g.pinch.distance > 0) update(g.index, { size: Math.max(OVERLAY_SIZE_MIN, Math.min(OVERLAY_SIZE_MAX, g.pinch.size * d / g.pinch.distance)) });
      g.moved = true;
      return;
    }
    const dx = event.clientX - g.origin.x, dy = event.clientY - g.origin.y;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    if (!g.moved) { g.moved = true; setDragging(true); }
    let x = g.start.x + dx / rect.width, y = g.start.y + dy / rect.height;
    const snapX = Math.abs(x - 0.5) < SNAP, snapY = Math.abs(y - 0.5) < SNAP;
    if (snapX) x = 0.5;
    if (snapY) y = 0.5;
    setGuides((cur) => cur.x === snapX && cur.y === snapY ? cur : { x: snapX, y: snapY });
    setOverTrash(isOverTrash(event.clientX, event.clientY));
    update(g.index, { x, y });
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    g.pointers.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (g.pointers.size > 0) { g.pinch = undefined; const [rest] = g.pointers.values(); g.origin = rest; const o = overlays[g.index]; g.start = { x: o.x, y: o.y, size: o.size }; return; }
    gesture.current = null;
    const dropOnTrash = g.moved && event.type === "pointerup" && isOverTrash(event.clientX, event.clientY);
    setDragging(false); setOverTrash(false); setGuides({ x: false, y: false });
    if (dropOnTrash) remove(g.index);
    else if (!g.moved && Date.now() - g.at < 400 && event.type === "pointerup") onEdit(g.index);
  };

  return <div className={styles.overlayLayer} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    {guides.x && <i className={styles.guideX} aria-hidden="true" />}
    {guides.y && <i className={styles.guideY} aria-hidden="true" />}
    {overlays.map((o, i) => <OverlayText
      key={i} overlay={o} data-ovl={i} className={styles.editableOverlay}
      role="button" tabIndex={0} aria-label={`얹은 글: ${o.text}`}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.08 : 0.02;
        const keys: Record<string, Partial<TextOverlay>> = {
          ArrowLeft: { x: o.x - step }, ArrowRight: { x: o.x + step }, ArrowUp: { y: o.y - step }, ArrowDown: { y: o.y + step },
          "+": { size: o.size + 0.005 }, "=": { size: o.size + 0.005 }, "-": { size: o.size - 0.005 },
        };
        if (keys[event.key]) { event.preventDefault(); update(i, keys[event.key]); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(i); }
        else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(i); }
      }}
    />)}
    <div ref={trash} className={`${styles.trash} ${dragging ? styles.trashShown : ""} ${overTrash ? styles.trashHot : ""}`} aria-hidden="true"><IconTrash /></div>
  </div>;
}
