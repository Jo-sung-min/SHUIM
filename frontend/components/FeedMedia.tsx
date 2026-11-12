"use client";

import { forwardRef, useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { overlayStyle, safeRatio, type TextOverlay } from "@/lib/feed-media";
import { loadOverlayFont } from "@/lib/overlay-fonts";
import styles from "./FeedMedia.module.css";

/** 칸 안에 비율 그대로 맞춘 상자. 상자 너비가 얹은 글 크기의 기준이 된다 */
export const MediaFrame = forwardRef<HTMLDivElement, { ratio?: number; children: ReactNode; className?: string; boxClassName?: string; onClick?: () => void; fit?: "contain" | "cover" }>(
  function MediaFrame({ ratio, children, className, boxClassName, onClick, fit = "contain" }, ref) {
    return <div className={`${styles.fit} ${className ?? ""}`} onClick={onClick}>
      <div ref={ref} className={`${styles.box} ${fit === "cover" ? styles.cover : ""} ${boxClassName ?? ""}`} style={{ "--ratio": safeRatio(ratio) } as CSSProperties}>{children}</div>
    </div>;
  });

/** 얹은 글 그리기 (피드·미리보기 공용) */
export function OverlayText({ overlay, className, style, ...rest }: { overlay: TextOverlay; className?: string; style?: CSSProperties } & React.HTMLAttributes<HTMLParagraphElement>) {
  // 무드 글꼴은 이 글이 처음 그려질 때만 불러온다
  useEffect(() => { void loadOverlayFont(overlay.font); }, [overlay.font]);
  return <p {...rest} className={`${styles.ovl} ${className ?? ""}`} data-style={overlay.style} data-color={overlay.color} style={{ ...overlayStyle(overlay), ...style }}>
    <span>{overlay.text}</span>
  </p>;
}

export function Overlays({ overlays }: { overlays?: TextOverlay[] }) {
  if (!overlays?.length) return null;
  return <>{overlays.map((o, i) => <OverlayText key={i} overlay={o} />)}</>;
}

/**
 * 피드 사진 한 장: 화면을 꽉 채우고(cover) 아래쪽을 어둡게 깔아 글이 읽히게.
 * priority = 처음 화면에 보이는 사진(첫 글의 첫 장). 지연 로딩 없이 먼저 받아 첫 화면이 비어 있지 않게 한다.
 */
export function ScreenPhoto({ src, ratio, alt, overlays, priority = false }: { src: string; ratio?: number; alt: string; overlays?: TextOverlay[]; priority?: boolean }) {
  return <div className={styles.player}>
    <MediaFrame ratio={ratio} fit="cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
      <Overlays overlays={overlays} />
    </MediaFrame>
    <div className={styles.shade} />
  </div>;
}

/* ---------- 소리 켜기는 릴스끼리 이어진다 (인스타처럼 한 번 켜면 다음 영상도) ---------- */
let soundOn = false;
const soundListeners = new Set<() => void>();
const setSound = (on: boolean) => { soundOn = on; soundListeners.forEach((l) => l()); };
const subscribeSound = (l: () => void) => { soundListeners.add(l); return () => { soundListeners.delete(l); }; };
const useSound = () => useSyncExternalStore(subscribeSound, () => soundOn, () => false);

/** 동작 줄이기·데이터 절약이면 자동 재생하지 않는다 */
function autoplayAllowed() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

/** 피드 릴스: 60% 이상 보이면 음소거 자동 재생, 벗어나면 멈춤. 탭 = 정지/재생 */
export function ReelVideo({ src, poster, ratio, silent, overlays, label }: { src: string; poster?: string; ratio?: number; silent?: boolean; overlays?: TextOverlay[]; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const sound = useSound();
  const audible = sound && !silent;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nearObserver = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setNear(true); }, { rootMargin: "100% 0px" });
    const activeObserver = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.6), { threshold: [0, 0.6, 1] });
    nearObserver.observe(el); activeObserver.observe(el);
    return () => { nearObserver.disconnect(); activeObserver.disconnect(); };
  }, []);

  const play = useCallback(async () => {
    const v = video.current;
    if (!v) return;
    try { await v.play(); setBlocked(false); }
    catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError" && !v.muted) {
        // 소리 켜기는 사용자 탭이 있어야 해서, 막히면 음소거로 다시
        v.muted = true; setSound(false);
        try { await v.play(); setBlocked(false); return; } catch { /* fall through */ }
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBlocked(true);
    }
  }, []);

  useEffect(() => { if (video.current) video.current.muted = !audible; }, [audible]);

  useEffect(() => {
    const v = video.current;
    if (!v || !near) return;
    if (!visible) { v.pause(); setUserPaused(false); return; }
    if (userPaused) return;
    if (autoplayAllowed()) void play(); else setBlocked(true);
  }, [visible, userPaused, near, play]);

  // 진행 막대: 재생 중에만 rAF
  useEffect(() => {
    if (paused) return;
    let frame = 0;
    const tick = () => {
      const v = video.current;
      if (v && bar.current && v.duration) bar.current.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { setUserPaused(false); void play(); }
    else { v.pause(); setUserPaused(true); }
  };

  return <div ref={root} className={styles.player}>
    <MediaFrame ratio={ratio} fit="cover" onClick={toggle}>
      <video
        ref={video} src={near ? src : undefined} poster={poster} playsInline loop muted preload={near ? "metadata" : "none"}
        aria-label={label} onPlay={() => setPaused(false)} onPause={() => setPaused(true)}
      />
      <Overlays overlays={overlays} />
    </MediaFrame>
    <div className={styles.shade} />
    {(blocked || (userPaused && paused)) && <span className={styles.state} aria-hidden="true"><PlayIcon /></span>}
    <button type="button" className={styles.sound} onClick={(event) => { event.stopPropagation(); if (silent) return; setSound(!sound); if (video.current) { video.current.muted = sound; if (video.current.paused && visible) void play(); } }}
      aria-label={silent ? "소리 없는 영상" : audible ? "소리 끄기" : "소리 켜기"} aria-pressed={audible} disabled={silent}>
      {audible ? <SoundOnIcon /> : <SoundOffIcon />}
    </button>
    <div className={styles.track} aria-hidden="true"><i ref={bar} /></div>
  </div>;
}

export function PlayIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>; }
export function SoundOnIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>; }
export function SoundOffIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5m0-5-5 5" /></svg>; }
