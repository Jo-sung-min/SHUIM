"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { IconChevronL, IconRefresh } from "./Icons";
import { calculatePhotoCrop, clamp, drawPhotoCrop, exportPhotoCrop, loadEditablePhoto, normalizeRotation, type PhotoPosition } from "@/lib/photo-edit";
import styles from "./PhotoEditor.module.css";

export interface PhotoEditorProps {
  file: File;
  aspectRatio?: number;
  allowAspectChange?: boolean;
  onSave: (file: File) => void;
  onClose: () => void;
}

/** Render beside the calling sheet, with that sheet inert while this editor is open. */
export default function PhotoEditor({ file, aspectRatio = 4 / 5, allowAspectChange = true, onSave, onClose }: PhotoEditorProps) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [aspect, setAspect] = useState<number | "original">(aspectRatio);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<PhotoPosition>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const saveLock = useRef(false);
  const closeRef = useRef(onClose);
  const alive = useRef(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  closeRef.current = onClose;
  const titleId = useId();
  const helpId = useId();
  const rotated = normalizeRotation(rotation) % 180 !== 0;
  const requestedRatio = aspect === "original" && source ? (rotated ? source.height / source.width : source.width / source.height) : typeof aspect === "number" ? aspect : aspectRatio;
  const ratio = Number.isFinite(requestedRatio) && requestedRatio > 0 ? requestedRatio : 1;
  const crop = useMemo(() => source ? calculatePhotoCrop(source.width, source.height, rotation, ratio, zoom, position) : null, [source, rotation, ratio, zoom, position]);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // A sibling Sheet already owns the scroll lock. Do not restore its stale lock if both unmount.
    const ownsScrollLock = previousOverflow !== "hidden";
    if (ownsScrollLock) document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      const panel = dialog.current;
      if (!panel || panel.closest("[inert]")) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!saveLock.current) closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      alive.current = false;
      window.removeEventListener("keydown", onKey, true);
      if (ownsScrollLock) document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => { if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true }); });
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let decoded: HTMLCanvasElement | null = null;
    setLoading(true); setError(""); setSource(null);
    setAspect(aspectRatio); setRotation(0); setZoom(1); setPosition({ x: 0, y: 0 });
    void loadEditablePhoto(file).then((image) => {
      decoded = image;
      if (disposed) { image.width = 0; image.height = 0; return; }
      setSource(image);
    }).catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : "사진을 읽지 못했어요. 다른 사진을 선택해 주세요.");
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; if (decoded) { decoded.width = 0; decoded.height = 0; } };
  }, [file, aspectRatio]);

  useEffect(() => {
    const element = viewport.current;
    const output = canvas.current;
    if (!source || !crop || !element || !output) return;
    const draw = () => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      output.width = Math.round(bounds.width * scale);
      output.height = Math.round(bounds.height * scale);
      const context = output.getContext("2d");
      if (context) drawPhotoCrop(context, source, crop, output.width, output.height);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [source, crop]);

  const resetPosition = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };
  const distance = () => {
    const points = [...pointers.current.values()];
    return points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || busy || event.button > 0 || pointers.current.size >= 2) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: distance(), zoom };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !crop || busy) return;
    event.preventDefault();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      if (pinch.current.distance > 0) setZoom(clamp(pinch.current.zoom * distance() / pinch.current.distance, 1, 4));
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const maxX = bounds.width * (crop.rotatedWidth / crop.width - 1) / 2;
    const maxY = bounds.height * (crop.rotatedHeight / crop.height - 1) / 2;
    setPosition((current) => ({
      x: maxX > 0 ? clamp(current.x + (event.clientX - previous.x) / maxX, -1, 1) : 0,
      y: maxY > 0 ? clamp(current.y + (event.clientY - previous.y) / maxY, -1, 1) : 0,
    }));
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const save = async () => {
    if (!source || !crop || saveLock.current) return;
    saveLock.current = true; setBusy(true); setError("");
    try {
      const edited = await exportPhotoCrop(source, crop, file.name);
      if (alive.current) onSave(edited);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했어요. 다시 시도해 주세요.");
    } finally { saveLock.current = false; if (alive.current) setBusy(false); }
  };

  return <div ref={dialog} className={styles.editor} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header className={styles.header}>
      <button type="button" className={styles.back} aria-label="사진 편집 취소" disabled={busy} onClick={onClose}><IconChevronL /></button>
      <h2 id={titleId}>사진 편집</h2>
      <button type="button" className={styles.done} disabled={loading || !source || busy} onClick={() => void save()} aria-busy={busy}>{busy ? "준비 중…" : "완료"}</button>
    </header>
    <div className={styles.content}>
      <div className={styles.stage}>
        {loading ? <p className={styles.loading} role="status">사진을 불러오고 있어요.</p> : source ? <div
          ref={viewport} className={styles.viewport} style={{ "--crop-ratio": ratio } as CSSProperties}
          tabIndex={0} role="group" aria-label="사진 위치 조절" aria-describedby={helpId}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
          onKeyDown={(event) => {
            if (busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.15 : 0.04;
            setPosition((current) => ({ x: clamp(current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), -1, 1), y: clamp(current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), -1, 1) }));
          }}
        >
          <canvas ref={canvas} className={styles.preview} aria-label="자른 사진 미리보기" />
          <div className={styles.grid} aria-hidden="true" />
        </div> : <span className={styles.emptyMark} aria-hidden="true">＋</span>}
      </div>
      <p className={styles.hint} id={helpId}>사진을 움직이거나 두 손가락으로 확대해 보세요.<br />키보드 방향키로도 위치를 조절할 수 있어요.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.controls}>
        {allowAspectChange && <div className={styles.ratios} role="group" aria-label="사진 비율">
          {[{ label: "4:5", value: 4 / 5 }, { label: "1:1", value: 1 }, { label: "원본", value: "original" as const }].map((option) => <button key={option.label} type="button" disabled={!source || busy} aria-pressed={aspect === option.value} className={aspect === option.value ? styles.selected : ""} onClick={() => { setAspect(option.value); resetPosition(); }}>{option.label}</button>)}
        </div>}
        <div className={styles.zoom}>
          <label htmlFor={`${titleId}-zoom`}>확대</label><input id={`${titleId}-zoom`} type="range" min={1} max={4} step={0.01} value={zoom} disabled={!source || busy} onChange={(event) => setZoom(Number(event.target.value))} aria-valuetext={`${zoom.toFixed(1)}배`} /><output>{zoom.toFixed(1)}×</output>
        </div>
        <div className={styles.tools}>
          <button type="button" disabled={!source || busy} onClick={() => { setRotation((angle) => normalizeRotation(angle + 90)); resetPosition(); }}><IconRefresh />90° 회전</button>
          <button type="button" disabled={!source || busy} onClick={() => { setRotation(0); setAspect(aspectRatio); resetPosition(); }}>원래대로</button>
        </div>
        {file.type === "image/gif" && <p className={styles.hint}>움직이는 사진은 한 장의 사진으로 저장돼요.</p>}
        <p className={styles.privacy}>편집을 마친 사진은 게시하거나 저장할 때 전송돼요.</p>
      </div>
    </div>
  </div>;
}
