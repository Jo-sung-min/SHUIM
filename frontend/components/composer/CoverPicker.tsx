"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrame, Overlays } from "../FeedMedia";
import { formatSeconds, type TextOverlay } from "@/lib/feed-media";
import { grabFrame } from "@/lib/video-prep";
import styles from "./Composer.module.css";

/** 표지: 고른 구간 안에서 장면을 고른다 */
export default function CoverPicker({ src, ratio, start, end, value, overlays, onDone, onCancel }: {
  src: string; ratio: number; start: number; end: number; value: number; overlays: TextOverlay[];
  onDone: (time: number, cover: Blob) => void; onCancel: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(() => Math.min(end, Math.max(start, value)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const v = video.current;
    if (v && Math.abs(v.currentTime - time) > 0.03) v.currentTime = time;
  }, [time]);

  const done = async () => {
    setBusy(true); setError("");
    try { onDone(time, await grabFrame(src, time, 1080) as Blob); }
    catch { setError("이 장면을 표지로 만들지 못했어요. 다른 장면을 골라 주세요."); }
    finally { setBusy(false); }
  };

  return <div className={styles.coverPicker} role="dialog" aria-modal="true" aria-label="표지 고르기"
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <header className={styles.darkHeader}>
      <button type="button" className={styles.textToolBtn} onClick={onCancel} disabled={busy}>취소</button>
      <b>표지</b>
      <button type="button" className={`${styles.textToolBtn} ${styles.textDone}`} onClick={() => void done()} disabled={busy}>{busy ? "준비 중…" : "완료"}</button>
    </header>
    <div className={styles.coverStage}>
      <MediaFrame ratio={ratio}>
        <video ref={video} src={src} muted playsInline preload="auto" onLoadedData={(event) => { event.currentTarget.currentTime = time; }} />
        <Overlays overlays={overlays} />
      </MediaFrame>
    </div>
    {error && <p className={styles.darkError} role="alert">{error}</p>}
    <div className={styles.coverSlider}>
      <input type="range" min={start} max={end} step={0.05} value={time} aria-label="표지 장면" aria-valuetext={formatSeconds(time)} disabled={busy}
        onChange={(event) => setTime(Number(event.target.value))} />
      <output>{formatSeconds(time)}</output>
    </div>
  </div>;
}
