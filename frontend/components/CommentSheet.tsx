"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBackLayer } from "@/lib/use-back-layer";
import { IconClose } from "./Icons";
import styles from "./CommentSheet.module.css";

const HALF = 0.62;

/**
 * 카카오톡·인스타 릴스식 댓글 시트: 반 높이로 올라오고(위에는 작아진 콘텐츠), 위로 끌거나 목록을 올리면 꽉 차서 댓글만 보인다.
 * 아래로 끌면 반 → 닫기. 입력창은 시트 맨 아래 고정, 키보드가 올라오면 그 위로.
 */
export default function CommentSheet({ open, title, onClose, onHeight, footer, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 시트 높이(px)가 바뀔 때 — 위 콘텐츠를 그만큼 줄이는 데 쓴다 */
  onHeight?: (height: number) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ height: 0, keyboard: 0 });
  const start = useRef<{ y: number; height: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useBackLayer(open, () => { closeRef.current(); return false; });

  // 화면 높이와 소프트 키보드 높이
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const sync = () => setViewport({ height: window.innerHeight, keyboard: vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0 });
    sync();
    vv?.addEventListener("resize", sync); vv?.addEventListener("scroll", sync); window.addEventListener("resize", sync);
    return () => { vv?.removeEventListener("resize", sync); vv?.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, [open]);
  useEffect(() => { if (open) { setFull(false); setDrag(null); sheet.current?.focus({ preventScroll: true }); } }, [open]);

  const available = Math.max(0, viewport.height - viewport.keyboard);
  const fullHeight = Math.max(0, available - 44);
  const halfHeight = Math.min(fullHeight, Math.round(viewport.height * HALF));
  const height = drag ?? (full || viewport.keyboard > 0 ? fullHeight : halfHeight);

  useEffect(() => { if (open && viewport.height) onHeight?.(height); }, [open, height, viewport.height, onHeight]);

  if (!open) return null;

  const down = (event: React.PointerEvent) => {
    start.current = { y: event.clientY, height };
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* 이미 끝난 포인터 */ }
  };
  const move = (event: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(80, Math.min(fullHeight, start.current.height - (event.clientY - start.current.y))));
  };
  const up = () => {
    if (!start.current) return;
    const h = drag ?? start.current.height;
    start.current = null;
    setDrag(null);
    if (h > (halfHeight + fullHeight) / 2) setFull(true);
    else if (h < halfHeight * 0.7) onClose();
    else setFull(false);
  };

  return <>
    <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
    <div ref={sheet} className={`${styles.sheet} ${drag !== null ? styles.dragging : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      style={{ height, bottom: viewport.keyboard }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
      <header className={styles.head} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className={styles.handle} aria-hidden="true" />
        <b>{title}</b>
        <button type="button" className={styles.close} aria-label="닫기" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}><IconClose /></button>
      </header>
      <div className={styles.body} onScroll={(event) => { if (!full && event.currentTarget.scrollTop > 12) setFull(true); }}>
        {children}
      </div>
      <div className={styles.foot}>{footer}</div>
    </div>
  </>;
}
