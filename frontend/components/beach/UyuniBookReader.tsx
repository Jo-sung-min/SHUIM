"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { IconChevronL, IconChevronR, IconClose } from "@/components/Icons";
import { PHILOSOPHY_QUOTES, quoteSourceLabel } from "@/lib/daily-quote";
import styles from "./UyuniBookReader.module.css";

export interface UyuniBookReaderProps {
  open: boolean;
  onClose: () => void;
}

/** The reader is local to each visitor; opening a book never changes the room. */
export default function UyuniBookReader({ open, onClose }: UyuniBookReaderProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(<BookDialog onClose={onClose} />, document.body);
}

function BookDialog({ onClose }: Pick<UyuniBookReaderProps, "onClose">) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const invitation = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLElement>(null);
  const [reading, setReading] = useState(false);
  const [index, setIndex] = useState(0);
  const [viewport, setViewport] = useState<{ top: number; height: number }>();
  const quote = PHILOSOPHY_QUOTES[index];

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const view = window.visualViewport;
    const resize = () => setViewport({ top: view?.offsetTop ?? 0, height: view?.height ?? window.innerHeight });
    resize();
    view?.addEventListener("resize", resize);
    view?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    invitation.current?.focus({ preventScroll: true });
    return () => {
      view?.removeEventListener("resize", resize);
      view?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (reading) page.current?.focus({ preventScroll: true });
  }, [reading]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (reading && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      setIndex(current => Math.max(0, Math.min(PHILOSOPHY_QUOTES.length - 1, current + (event.key === "ArrowRight" ? 1 : -1))));
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const first = buttons[0], last = buttons.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement as HTMLButtonElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  return <div className={styles.backdrop} style={viewport}
    onPointerDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    onPointerUp={event => event.stopPropagation()}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      onKeyDown={onKeyDown} onKeyUp={event => event.stopPropagation()}>
      <h2 id={`${id}-title`} className={styles.srOnly}>소로우 책보기</h2>
      <button type="button" className={styles.close} onClick={onClose} aria-label="책 닫기"><IconClose /></button>
      {!reading ? <div className={styles.invitation}>
        <div className={styles.cover} aria-hidden="true">
          <span className={styles.coverRule} />
          <strong>소로우</strong>
          <span className={styles.coverOrbit}><span /></span>
          <span className={styles.coverMark}>sorow</span>
        </div>
        <button ref={invitation} type="button" className={styles.takeBook} onClick={() => setReading(true)}>꺼내보기</button>
      </div> : <>
        <div className={styles.openBook}>
          <div className={styles.endpaper} aria-hidden="true"><span>소로우</span><i /><small>sorow</small></div>
          <article ref={page} className={styles.paper} tabIndex={-1} aria-label={`${index + 1}번째 문장`}>
            <span className={styles.ribbon} aria-hidden="true" />
            <div key={quote.id} className={styles.pageText} aria-live="polite" aria-atomic="true">
              <p className={styles.quote}>{quote.text}</p>
              <p className={styles.source}>{quoteSourceLabel(quote)}</p>
            </div>
            <span className={styles.pageNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          </article>
        </div>
        <nav className={styles.navigation} aria-label="책장 넘기기">
          <button type="button" disabled={index === 0} onClick={() => setIndex(current => current - 1)} aria-label="이전 문장"><IconChevronL /></button>
          <span aria-label={`${PHILOSOPHY_QUOTES.length}개 중 ${index + 1}번째 문장`}>{index + 1}<span aria-hidden="true"> / </span>{PHILOSOPHY_QUOTES.length}</span>
          <button type="button" disabled={index === PHILOSOPHY_QUOTES.length - 1} onClick={() => setIndex(current => current + 1)} aria-label="다음 문장"><IconChevronR /></button>
        </nav>
      </>}
    </div>
  </div>;
}
