"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatSeconds, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from "@/lib/feed-media";
import { filmstrip } from "@/lib/video-prep";
import styles from "./Composer.module.css";

type Drag = { mode: "start" | "end" | "move"; x: number; start: number; end: number };

/** 구간 고르기: 필름스트립 위 양끝 손잡이(최대 30초), 가운데를 끌면 구간째 이동 */
export default function VideoTrimmer({ src, duration, start, end, playhead, onChange }: {
  src: string; duration: number; start: number; end: number; playhead: number;
  onChange: (start: number, end: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    filmstrip(src, duration, 8, 56, controller.signal).then((f) => { if (!controller.signal.aborted) setFrames(f); }).catch(() => {});
    return () => controller.abort();
  }, [src, duration]);

  const pct = (t: number) => `${(t / duration) * 100}%`;
  const limit = Math.min(VIDEO_MAX_SECONDS, duration);

  const set = (s: number, e: number, mode: Drag["mode"]) => {
    if (mode === "move") {
      const len = e - s;
      s = Math.max(0, Math.min(duration - len, s));
      onChange(s, s + len);
      return;
    }
    if (mode === "start") s = Math.max(0, Math.min(s, e - VIDEO_MIN_SECONDS, e), e - limit);
    else e = Math.min(duration, Math.max(e, s + VIDEO_MIN_SECONDS), s + limit);
    if (mode === "start" && e - s > limit) s = e - limit;
    onChange(Math.round(s * 10) / 10, Math.round(e * 10) / 10);
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || event.button > 0) return;
    const t = ((event.clientX - rect.left) / rect.width) * duration;
    const px = (v: number) => rect.left + (v / duration) * rect.width;
    const nearStart = Math.abs(event.clientX - px(start)) < 22, nearEnd = Math.abs(event.clientX - px(end)) < 22;
    const mode: Drag["mode"] = nearStart && nearEnd ? (t < start ? "start" : "end") : nearStart ? "start" : nearEnd ? "end" : t > start && t < end ? "move" : t <= start ? "start" : "end";
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 포인터가 이미 끝남 */ }
    drag.current = { mode, x: event.clientX, start, end };
    if (mode !== "move") set(mode === "start" ? t : start, mode === "end" ? t : end, mode);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current, rect = track.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dt = ((event.clientX - d.x) / rect.width) * duration;
    if (d.mode === "move") set(d.start + dt, d.end + dt, "move");
    else if (d.mode === "start") set(d.start + dt, end, "start");
    else set(start, d.end + dt, "end");
  };
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const key = (which: "start" | "end") => (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 1 : 0.1;
    const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (!delta) return;
    event.preventDefault();
    if (which === "start") set(start + delta, end, "start"); else set(start, end + delta, "end");
  };

  return <div className={styles.trimmer}>
    <div ref={track} className={styles.trimTrack} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className={styles.frames} aria-hidden="true">{frames.map((f, i) => <span key={i} style={{ backgroundImage: `url(${f})` }} />)}</div>
      <div className={styles.trimShadeL} style={{ width: pct(start) }} />
      <div className={styles.trimShadeR} style={{ left: pct(end) }} />
      <div className={styles.trimWindow} style={{ left: pct(start), width: pct(end - start) }}>
        <span role="slider" tabIndex={0} aria-label="시작" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={start} aria-valuetext={formatSeconds(start)} onKeyDown={key("start")} className={styles.handleL} />
        <span role="slider" tabIndex={0} aria-label="끝" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={end} aria-valuetext={formatSeconds(end)} onKeyDown={key("end")} className={styles.handleR} />
      </div>
      {playhead >= start && playhead <= end && <i className={styles.playhead} style={{ left: pct(playhead) }} aria-hidden="true" />}
    </div>
    <p className={styles.trimInfo}>
      <span>{formatSeconds(start)} – {formatSeconds(end)}</span>
      <b>{Math.round((end - start) * 10) / 10}초</b>
    </p>
    {duration > VIDEO_MAX_SECONDS + 0.5 && <p className={styles.trimNote}>30초까지 올릴 수 있어요</p>}
  </div>;
}
