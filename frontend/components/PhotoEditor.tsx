"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { IconChevronL, IconRefresh } from "./Icons";
import { calculatePhotoCrop, clamp, drawPhotoCrop, exportPhotoCrop, loadEditablePhoto, normalizeRotation, type PhotoPosition } from "@/lib/photo-edit";
import { ADJUST_FIELDS, DEFAULT_ADJUST, DEFAULT_LOOK, LOOK_PRESETS, type LookAdjust, type LookRenderer, type PhotoLook, createLookRenderer, isIdentityLook, layerStyle } from "@/lib/photo-look";
import styles from "./PhotoEditor.module.css";

export interface PhotoEditorProps {
  file: File;
  aspectRatio?: number;
  allowAspectChange?: boolean;
  onSave: (file: File) => void;
  onClose: () => void;
}

type Tab = "crop" | "filter" | "adjust";
const TABS: { id: Tab; label: string }[] = [{ id: "crop", label: "자르기" }, { id: "filter", label: "필터" }, { id: "adjust", label: "조정" }];
const THUMB_EDGE = 112;

/**
 * 사진 편집기: 자르기(위치·확대·회전·비율) + 필터(인스타그램식 프리셋, CSSgram 레시피) + 조정(밝기·대비·채도·따뜻함·선명도·페이드·비네트).
 * 미리보기와 저장 모두 같은 WebGL 셰이더(lib/photo-look.ts)를 거쳐 보이는 대로 저장된다.
 * Render beside the calling sheet, with that sheet inert while this editor is open.
 */
export default function PhotoEditor({ file, aspectRatio = 4 / 5, allowAspectChange = true, onSave, onClose }: PhotoEditorProps) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [aspect, setAspect] = useState<number | "original">(aspectRatio);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<PhotoPosition>({ x: 0, y: 0 });
  const [tab, setTab] = useState<Tab>("crop");
  const [look, setLook] = useState<PhotoLook>(DEFAULT_LOOK);
  const [thumb, setThumb] = useState<string | null>(null);
  const [glReady, setGlReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<LookRenderer | null>(null);
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
  const lookActive = !isIdentityLook(look);

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
    // 색보정 렌더러는 편집기당 하나 (WebGL 컨텍스트 수 제한)
    renderer.current = createLookRenderer();
    setGlReady(Boolean(renderer.current));
    return () => {
      alive.current = false;
      window.removeEventListener("keydown", onKey, true);
      if (ownsScrollLock) document.body.style.overflow = previousOverflow;
      renderer.current?.dispose(); renderer.current = null;
      if (scratch.current) { scratch.current.width = 0; scratch.current.height = 0; }
      requestAnimationFrame(() => { if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true }); });
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let decoded: HTMLCanvasElement | null = null;
    setLoading(true); setError(""); setSource(null);
    setAspect(aspectRatio); setRotation(0); setZoom(1); setPosition({ x: 0, y: 0 }); setLook(DEFAULT_LOOK); setTab("crop");
    void loadEditablePhoto(file).then((image) => {
      decoded = image;
      if (disposed) { image.width = 0; image.height = 0; return; }
      setSource(image);
    }).catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : "사진을 읽지 못했어요. 다른 사진을 선택해 주세요.");
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; if (decoded) { decoded.width = 0; decoded.height = 0; } };
  }, [file, aspectRatio]);

  // 미리보기: 자르기(2D) → 색보정(WebGL) → 화면 캔버스
  useEffect(() => {
    const element = viewport.current;
    const output = canvas.current;
    if (!source || !crop || !element || !output) return;
    const draw = () => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(bounds.width * scale);
      const height = Math.round(bounds.height * scale);
      output.width = width; output.height = height;
      const context = output.getContext("2d");
      if (!context) return;
      const gl = renderer.current;
      if (!lookActive || !gl?.usable) { drawPhotoCrop(context, source, crop, width, height); return; }
      const pad = scratch.current ?? (scratch.current = document.createElement("canvas"));
      if (pad.width !== width || pad.height !== height) { pad.width = width; pad.height = height; }
      const padContext = pad.getContext("2d");
      if (!padContext) return;
      drawPhotoCrop(padContext, source, crop, width, height);
      try {
        context.drawImage(gl.render(pad, look, width, height), 0, 0);
      } catch {
        drawPhotoCrop(context, source, crop, width, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [source, crop, look, lookActive]);

  // 필터 썸네일: 지금 자른 모습을 작게 떠 두고 CSS 로 프리셋을 입힌다 (CSSgram 방식)
  useEffect(() => {
    if (tab !== "filter" || !source || !crop) return;
    const edge = THUMB_EDGE;
    const w = crop.width >= crop.height ? edge : Math.round(edge * crop.width / crop.height);
    const h = crop.width >= crop.height ? Math.round(edge * crop.height / crop.width) : edge;
    const small = document.createElement("canvas");
    small.width = Math.max(1, w); small.height = Math.max(1, h);
    const context = small.getContext("2d");
    if (!context) return;
    drawPhotoCrop(context, source, crop, small.width, small.height);
    setThumb(small.toDataURL("image/jpeg", 0.8));
    small.width = 0; small.height = 0;
  }, [tab, source, crop]);

  const resetPosition = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };
  const setAdjust = (key: keyof LookAdjust, value: number) => setLook((cur) => ({ ...cur, adjust: { ...cur.adjust, [key]: value } }));
  const distance = () => {
    const points = [...pointers.current.values()];
    return points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || busy || tab !== "crop" || event.button > 0 || pointers.current.size >= 2) return;
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
      const edited = await exportPhotoCrop(source, crop, file.name, look);
      if (alive.current) onSave(edited);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했어요. 다시 시도해 주세요.");
    } finally { saveLock.current = false; if (alive.current) setBusy(false); }
  };

  const adjustCount = ADJUST_FIELDS.filter((f) => Math.abs(look.adjust[f.key]) > 0.001).length;

  return <div ref={dialog} className={styles.editor} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
    <header className={styles.header}>
      <button type="button" className={styles.back} aria-label="사진 편집 취소" disabled={busy} onClick={onClose}><IconChevronL /></button>
      <h2 id={titleId}>사진 편집</h2>
      <button type="button" className={styles.done} disabled={loading || !source || busy} onClick={() => void save()} aria-busy={busy}>{busy ? "준비 중…" : "완료"}</button>
    </header>
    <div className={styles.content}>
      <div className={styles.stage}>
        {loading ? <p className={styles.loading} role="status">사진을 불러오고 있어요.</p> : source ? <div
          ref={viewport} className={`${styles.viewport} ${tab !== "crop" ? styles.viewportStill : ""}`} style={{ "--crop-ratio": ratio } as CSSProperties}
          tabIndex={0} role="group" aria-label={tab === "crop" ? "사진 위치 조절" : "사진 미리보기"} aria-describedby={helpId}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
          onKeyDown={(event) => {
            if (busy || tab !== "crop" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.15 : 0.04;
            setPosition((current) => ({ x: clamp(current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), -1, 1), y: clamp(current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), -1, 1) }));
          }}
        >
          <canvas ref={canvas} className={styles.preview} aria-label="편집한 사진 미리보기" />
          {tab === "crop" && <div className={styles.grid} aria-hidden="true" />}
        </div> : <span className={styles.emptyMark} aria-hidden="true">＋</span>}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="편집 도구">
        {TABS.map((t) => {
          const hidden = t.id !== "crop" && glReady === false;
          if (hidden) return null;
          const badge = t.id === "filter" && look.preset !== "none" ? 1 : t.id === "adjust" ? adjustCount : 0;
          return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? styles.tabOn : ""} disabled={!source || busy} onClick={() => setTab(t.id)}>{t.label}{badge > 0 && <i aria-hidden="true" />}</button>;
        })}
      </div>

      {tab === "crop" && <>
        <p className={styles.hint} id={helpId}>사진을 움직이거나 두 손가락으로 확대해 보세요.<br />키보드 방향키로도 위치를 조절할 수 있어요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.controls}>
          {allowAspectChange && <div className={styles.ratios} role="group" aria-label="사진 비율">
            {[{ label: "4:5", value: 4 / 5 }, { label: "1:1", value: 1 }, { label: "원본", value: "original" as const }].map((option) => <button key={option.label} type="button" disabled={!source || busy} aria-pressed={aspect === option.value} className={aspect === option.value ? styles.selected : ""} onClick={() => { setAspect(option.value); resetPosition(); }}>{option.label}</button>)}
          </div>}
          <div className={styles.slider}>
            <label htmlFor={`${titleId}-zoom`}>확대</label><input id={`${titleId}-zoom`} type="range" min={1} max={4} step={0.01} value={zoom} disabled={!source || busy} onChange={(event) => setZoom(Number(event.target.value))} aria-valuetext={`${zoom.toFixed(1)}배`} /><output>{zoom.toFixed(1)}×</output>
          </div>
          <div className={styles.tools}>
            <button type="button" disabled={!source || busy} onClick={() => { setRotation((angle) => normalizeRotation(angle + 90)); resetPosition(); }}><IconRefresh />90° 회전</button>
            <button type="button" disabled={!source || busy} onClick={() => { setRotation(0); setAspect(aspectRatio); resetPosition(); }}>원래대로</button>
          </div>
          {file.type === "image/gif" && <p className={styles.hint}>움직이는 사진은 한 장의 사진으로 저장돼요.</p>}
        </div>
      </>}

      {tab === "filter" && <>
        <p className={styles.hint} id={helpId}>필터를 고르고 아래 슬라이더로 세기를 조절해요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.filters} role="radiogroup" aria-label="필터">
          {LOOK_PRESETS.map((preset) => {
            const on = look.preset === preset.id;
            return <button key={preset.id} type="button" role="radio" aria-checked={on} className={`${styles.filter} ${on ? styles.filterOn : ""}`} disabled={!source || busy} onClick={() => setLook((cur) => ({ ...cur, preset: preset.id, presetMix: cur.preset === preset.id ? cur.presetMix : 1 }))}>
              <span className={styles.filterThumb} style={{ filter: preset.filter || undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 방금 자른 사진의 작은 미리보기(data URL) */}
                {thumb && <img src={thumb} alt="" draggable={false} />}
                {preset.layers.map((layer, i) => <span key={i} style={layerStyle(layer)} aria-hidden="true" />)}
              </span>
              <small>{preset.label}</small>
            </button>;
          })}
        </div>
        <div className={styles.controls}>
          <div className={styles.slider}>
            <label htmlFor={`${titleId}-mix`}>세기</label>
            <input id={`${titleId}-mix`} type="range" min={0} max={100} step={1} value={Math.round(look.presetMix * 100)} disabled={!source || busy || look.preset === "none"} onChange={(event) => setLook((cur) => ({ ...cur, presetMix: Number(event.target.value) / 100 }))} aria-valuetext={`${Math.round(look.presetMix * 100)}`} />
            <output>{look.preset === "none" ? "–" : Math.round(look.presetMix * 100)}</output>
          </div>
          <p className={styles.credit}>필터 레시피: CSSgram (MIT)</p>
        </div>
      </>}

      {tab === "adjust" && <>
        <p className={styles.hint} id={helpId}>카메라 앱처럼 밝기·대비·채도·색온도를 손봐요.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.controls}>
          {ADJUST_FIELDS.map((field) => {
            const value = Math.round(look.adjust[field.key] * 100);
            return <div key={field.key} className={styles.slider}>
              <label htmlFor={`${titleId}-${field.key}`}>{field.label}</label>
              <input id={`${titleId}-${field.key}`} type="range" min={field.min} max={field.max} step={1} value={value} disabled={!source || busy} onChange={(event) => setAdjust(field.key, Number(event.target.value) / 100)} onDoubleClick={() => setAdjust(field.key, 0)} aria-valuetext={`${value}`} />
              <output>{value > 0 && field.min < 0 ? `+${value}` : value}</output>
            </div>;
          })}
          <div className={styles.tools}>
            <button type="button" disabled={!source || busy || adjustCount === 0} onClick={() => setLook((cur) => ({ ...cur, adjust: DEFAULT_ADJUST }))}>조정 원래대로</button>
          </div>
        </div>
      </>}

      <p className={styles.privacy}>편집을 마친 사진은 게시하거나 저장할 때 전송돼요.</p>
    </div>
  </div>;
}
