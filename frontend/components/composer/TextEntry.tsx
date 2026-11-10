"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_OVERLAY, OVERLAY_COLORS, OVERLAY_FONTS, OVERLAY_MAX_CHARS, OVERLAY_SIZE_MAX, OVERLAY_SIZE_MIN, overlayStyle, type OverlayAlign, type OverlayStyle, type TextOverlay } from "@/lib/feed-media";
import { loadAllOverlayFonts } from "@/lib/overlay-fonts";
import styles from "./Composer.module.css";

const ALIGNS: OverlayAlign[] = ["center", "left", "right"];
const STYLES: OverlayStyle[] = ["plain", "dim", "solid"];
const STYLE_LABEL: Record<OverlayStyle, string> = { plain: "배경 없음", dim: "반투명 배경", solid: "색 배경" };
const ALIGN_LABEL: Record<OverlayAlign, string> = { center: "가운데 정렬", left: "왼쪽 정렬", right: "오른쪽 정렬" };

/** Aa: 어둡게 깔고 바로 입력. 글꼴·정렬·배경·색·크기. 빈 글로 완료하면 지운다 */
export default function TextEntry({ initial, boxWidth, onDone, onCancel }: {
  initial?: TextOverlay;
  /** 콘텐츠 상자 너비(px) — 입력 중 글자 크기를 실제와 같게 */
  boxWidth: number;
  onDone: (overlay: TextOverlay | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<TextOverlay>(() => initial ?? { ...DEFAULT_OVERLAY, text: "" });
  const input = useRef<HTMLTextAreaElement>(null);
  const [viewport, setViewport] = useState<number | null>(null);

  // 소프트 키보드가 올라오면 보이는 높이에 맞춰 도구가 키보드 위에 있게
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setViewport(vv.height);
    sync();
    vv.addEventListener("resize", sync);
    return () => vv.removeEventListener("resize", sync);
  }, []);
  useEffect(() => { input.current?.focus({ preventScroll: true }); void loadAllOverlayFonts(); }, []);
  // 글 길이에 맞춰 높이를 늘린다
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.text, draft.size, draft.font]);

  const finish = () => {
    const text = draft.text.replace(/\r/g, "").trim();
    onDone(text ? { ...draft, text } : null);
  };
  const look = overlayStyle(draft);
  const cycle = <T,>(list: T[], value: T) => list[(list.indexOf(value) + 1) % list.length];

  return <div className={styles.textEntry} style={viewport ? { height: viewport } : undefined} role="dialog" aria-modal="true" aria-label="글 얹기"
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <div className={styles.textTools}>
      <button type="button" className={styles.textToolBtn} onClick={onCancel}>취소</button>
      <div className={styles.textToolGroup}>
        <button type="button" className={styles.textToolIcon} aria-label={ALIGN_LABEL[draft.align]} onClick={() => setDraft((d) => ({ ...d, align: cycle(ALIGNS, d.align) }))}><AlignIcon align={draft.align} /></button>
        <button type="button" className={styles.textToolIcon} aria-label={STYLE_LABEL[draft.style]} onClick={() => setDraft((d) => ({ ...d, style: cycle(STYLES, d.style) }))}><StyleIcon style={draft.style} /></button>
      </div>
      <button type="button" className={`${styles.textToolBtn} ${styles.textDone}`} onClick={finish}>완료</button>
    </div>
    <div className={styles.textStage}>
      <input
        type="range" className={styles.sizeSlider} min={OVERLAY_SIZE_MIN * 1000} max={OVERLAY_SIZE_MAX * 1000} step={1}
        value={Math.round(draft.size * 1000)} aria-label="글자 크기"
        onChange={(event) => setDraft((d) => ({ ...d, size: Number(event.target.value) / 1000 }))}
      />
      <div className={styles.textPreview} data-style={draft.style} style={{ "--ovl-bg": (look as Record<string, string>)["--ovl-bg"], textAlign: draft.align } as CSSProperties}>
        <textarea
          ref={input} value={draft.text} rows={1} maxLength={OVERLAY_MAX_CHARS} aria-label="얹을 글"
          style={{ fontFamily: look.fontFamily, fontWeight: look.fontWeight, fontSize: draft.size * boxWidth * (draft.font === "pen" ? 1.25 : 1), color: look.color, textAlign: draft.align }}
          onChange={(event) => setDraft((d) => ({ ...d, text: event.target.value }))}
        />
      </div>
    </div>
    <div className={styles.fontRow} role="radiogroup" aria-label="글꼴">
      {OVERLAY_FONTS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={draft.font === f.id}
        className={`${styles.fontChip} ${draft.font === f.id ? styles.fontOn : ""}`} style={{ fontFamily: f.family, fontWeight: f.weight }}
        onClick={() => setDraft((d) => ({ ...d, font: f.id }))}>{f.label}</button>)}
    </div>
    <div className={styles.colorRow} role="radiogroup" aria-label="글자 색">
      {OVERLAY_COLORS.map((c) => <button key={c.id} type="button" role="radio" aria-checked={draft.color === c.id} aria-label={c.label}
        className={`${styles.colorChip} ${draft.color === c.id ? styles.colorOn : ""}`} style={{ background: c.hex }}
        onClick={() => setDraft((d) => ({ ...d, color: c.id }))} />)}
    </div>
  </div>;
}

function AlignIcon({ align }: { align: OverlayAlign }) {
  const lines = align === "center" ? ["M5 7h14", "M8 12h8", "M6 17h12"] : align === "left" ? ["M4 7h14", "M4 12h9", "M4 17h12"] : ["M6 7h14", "M11 12h9", "M8 17h12"];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">{lines.map((d) => <path key={d} d={d} />)}</svg>;
}
function StyleIcon({ style }: { style: OverlayStyle }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="4" fill={style === "solid" ? "currentColor" : style === "dim" ? "rgba(255,255,255,.35)" : "none"} stroke="currentColor" strokeWidth="1.6" strokeDasharray={style === "plain" ? "3 3" : undefined} />
    <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill={style === "solid" ? "#15151a" : "currentColor"}>A</text>
  </svg>;
}
