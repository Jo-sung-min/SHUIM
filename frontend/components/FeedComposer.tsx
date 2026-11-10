"use client";

import { useEffect, useRef, useState } from "react";
import { FEED_BG_COUNT, FEED_BG_LABELS, FEED_MAX_PAGES, type FeedPage } from "@/lib/community-core";
import { hasCrisisSignal } from "@/lib/crisis";
import { MAX_OVERLAYS, VIDEO_MAX_SECONDS, type TextOverlay } from "@/lib/feed-media";
import { uploadImage, uploadVideo } from "@/lib/upload";
import { inspectPhotoHeader } from "@/lib/photo-edit";
import { grabFrame, prepareVideo, probeVideo, type PreparedVideo, type VideoInfo } from "@/lib/video-prep";
import { useBackLayer } from "@/lib/use-back-layer";
import HelpBanner from "./HelpBanner";
import PhotoEditor from "./PhotoEditor";
import { MediaFrame, Overlays, SoundOffIcon, SoundOnIcon } from "./FeedMedia";
import OverlayEditor from "./composer/OverlayEditor";
import TextEntry from "./composer/TextEntry";
import VideoTrimmer from "./composer/VideoTrimmer";
import CoverPicker from "./composer/CoverPicker";
import { IconChevronL, IconChevronR, IconClose, IconPlus, IconTrash } from "./Icons";
import styles from "./composer/Composer.module.css";

type Photo = { id: string; file: File; preview: string; ratio: number; overlays: TextOverlay[]; uploaded?: string };
type Cover = { time: number; blob: Blob; url: string; uploaded?: string };
type Reel = { file: File; url: string; info: VideoInfo; start: number; end: number; muted: boolean; overlays: TextOverlay[]; cover?: Cover; uploaded?: { key: string; url: string } };
type Step = "pick" | "edit" | "share";
type Prep = { key: string; controller: AbortController; progress: number; promise: Promise<PreparedVideo>; error?: string };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const STEPS: { id: Step; label: string }[] = [{ id: "pick", label: "고르기" }, { id: "edit", label: "꾸미기" }, { id: "share", label: "올리기" }];
const prepKey = (r: Reel) => `${r.start}-${r.end}-${r.muted}`;

async function imageRatio(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4 / 5;
}

/**
 * 새 게시물: 고르기(사진 10장 또는 영상 1개) → 꾸미기(편집·구간·글 얹기) → 올리기(표지·이야기).
 * 안드로이드 뒤로 가기는 한 단계씩 돌아가고, 닫아도 작성 내용은 남는다.
 */
export default function FeedComposer({ open, firstTime, onClose, onSubmit }: {
  open: boolean; firstTime: boolean; onClose: () => void;
  onSubmit: (pages: FeedPage[], bg: number, bio: string | undefined, clientRequestId: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const [reel, setReelState] = useState<Reel | null>(null);
  const reelRef = useRef<Reel | null>(null);
  const [active, setActive] = useState(0);
  const [textOnly, setTextOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [bio, setBio] = useState("");
  const [bg, setBg] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [textEdit, setTextEdit] = useState<{ index: number | null } | null>(null);
  const [trimOpen, setTrimOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [captureMenu, setCaptureMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [prepView, setPrepView] = useState<{ progress: number; error?: string; done: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [boxWidth, setBoxWidth] = useState(320);
  const [playhead, setPlayhead] = useState(0);
  const busyRef = useRef(false);
  const pickingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const prepRef = useRef<Prep | null>(null);
  const submission = useRef<{ payload: string; id: string } | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const photoCamera = useRef<HTMLInputElement>(null);
  const videoCamera = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function replacePhotos(next: Photo[]) { photosRef.current = next; setPhotos(next); }
  function setReel(next: Reel | null) { reelRef.current = next; setReelState(next); }
  function patchReel(patch: Partial<Reel>) { if (reelRef.current) setReel({ ...reelRef.current, ...patch }); }

  useEffect(() => { mountedRef.current = true; return () => {
    mountedRef.current = false;
    abortRef.current?.abort();
    prepRef.current?.controller.abort();
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    if (reelRef.current) { URL.revokeObjectURL(reelRef.current.url); if (reelRef.current.cover) URL.revokeObjectURL(reelRef.current.cover.url); }
  }; }, []);

  // 화면 고정 + 포커스 가두기 (편집기·글 입력이 열리면 그쪽이 맡는다)
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (element.closest("[inert]") || element.inert || document.querySelector(".community-consent [role=dialog]")) return;
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) back(); }
      if (event.key !== "Tab") return;
      const targets = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter((target) => target.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 뒤로 가기 한 번 = 가장 안쪽 한 겹. 닫히면 false */
  function back(): boolean {
    if (busyRef.current) return true;
    if (textEdit) { setTextEdit(null); return true; }
    if (coverOpen) { setCoverOpen(false); return true; }
    if (editing) { setEditing(null); return true; }
    if (captureMenu) { setCaptureMenu(false); return true; }
    if (step === "share") { setStep(textOnly ? "pick" : "edit"); setError(null); return true; }
    closeRef.current();
    return false;
  }
  useBackLayer(open, back);

  // 콘텐츠 상자 너비 (글 입력 중 글자 크기 기준)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBoxWidth(el.clientWidth || 320));
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, reel?.url, photos[active]?.id, open]);

  // 꾸미기 미리보기: 고른 구간만 반복
  useEffect(() => {
    const v = preview.current;
    if (!v || !reel) return;
    v.muted = reel.muted;
    if (v.currentTime < reel.start || v.currentTime > reel.end) v.currentTime = reel.start;
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }, [reel?.start, reel?.end, reel?.muted, reel, step]);

  /* ---------- 고르기 ---------- */
  async function pick(files: FileList | null) {
    if (!files?.length || busyRef.current || pickingRef.current) return;
    const list = Array.from(files);
    const videos = list.filter((file) => file.type.startsWith("video/"));
    const images = list.filter((file) => !file.type.startsWith("video/"));
    setError(null);
    if (videos.length && (images.length || photosRef.current.length)) { setError("영상은 사진과 따로 올려 주세요."); return; }
    if (images.length && reelRef.current) { setError("영상과 사진은 함께 올릴 수 없어요."); return; }
    pickingRef.current = true; setPicking(true);
    try {
      if (videos.length) {
        const file = videos[0];
        const info = await probeVideo(file);
        if (!mountedRef.current) return;
        const url = URL.createObjectURL(file);
        setReel({ file, url, info, start: 0, end: Math.min(info.duration, VIDEO_MAX_SECONDS), muted: !info.hasAudio, overlays: [] });
        setTrimOpen(info.duration > VIDEO_MAX_SECONDS + 0.5);
        setTextOnly(false); setStep("edit");
        if (videos.length > 1) setError("영상은 하나만 올릴 수 있어요.");
        return;
      }
      const accepted: Photo[] = [], issues: string[] = [];
      const room = FEED_MAX_PAGES - photosRef.current.length;
      for (const file of images) {
        if (accepted.length >= room) { issues.push(`사진은 ${FEED_MAX_PAGES}장까지 올릴 수 있어요.`); break; }
        if (file.type && !IMAGE_TYPES.includes(file.type)) { issues.push("JPG, PNG, WebP, GIF 사진만 올릴 수 있어요."); continue; }
        if (file.size === 0 || file.size > 20 * 1024 * 1024) { issues.push("사진 한 장은 20MB 이하로 골라 주세요."); continue; }
        try { inspectPhotoHeader(await file.slice(0, 512 * 1024).arrayBuffer()); }
        catch (cause) { issues.push(cause instanceof Error ? cause.message : "이 사진을 읽지 못했어요."); continue; }
        const url = URL.createObjectURL(file);
        let ratio = 4 / 5;
        try { ratio = await imageRatio(url); } catch { URL.revokeObjectURL(url); issues.push("이 사진을 읽지 못했어요."); continue; }
        if (!mountedRef.current) { URL.revokeObjectURL(url); return; }
        accepted.push({ id: crypto.randomUUID(), file, preview: url, ratio, overlays: [] });
      }
      if (accepted.length) {
        setActive(photosRef.current.length);
        replacePhotos([...photosRef.current, ...accepted]);
        setTextOnly(false); setStep("edit");
      }
      if (issues.length) setError([...new Set(issues)].join(" "));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "고른 파일을 읽지 못했어요.");
    } finally {
      pickingRef.current = false;
      if (mountedRef.current) setPicking(false);
    }
  }

  function removePhoto(index: number) {
    const previous = photosRef.current;
    URL.revokeObjectURL(previous[index].preview);
    const next = previous.filter((_, i) => i !== index);
    replacePhotos(next);
    setActive(Math.max(0, Math.min(index, next.length - 1))); setError(null);
    if (!next.length) setStep("pick");
  }
  function movePhoto(direction: -1 | 1) {
    const next = [...photosRef.current], target = active + direction;
    if (target < 0 || target >= next.length) return;
    [next[active], next[target]] = [next[target], next[active]];
    replacePhotos(next); setActive(target);
  }
  async function saveEdit(file: File) {
    const id = editing;
    setEditing(null); setError(null);
    const url = URL.createObjectURL(file);
    let ratio = 4 / 5;
    try { ratio = await imageRatio(url); } catch { /* keep default */ }
    replacePhotos(photosRef.current.map((photo) => {
      if (photo.id !== id) return photo;
      URL.revokeObjectURL(photo.preview);
      return { ...photo, file, preview: url, ratio, uploaded: undefined };
    }));
  }
  function removeReel() {
    prepRef.current?.controller.abort(); prepRef.current = null; setPrepView(null);
    const r = reelRef.current;
    if (r) { URL.revokeObjectURL(r.url); if (r.cover) URL.revokeObjectURL(r.cover.url); }
    setReel(null); setTrimOpen(false); setStep("pick"); setError(null);
  }

  /* ---------- 글 얹기 ---------- */
  const current = photos[active];
  const overlays = reel ? reel.overlays : current?.overlays ?? [];
  function setOverlays(next: TextOverlay[]) {
    if (reelRef.current) patchReel({ overlays: next });
    else if (current) replacePhotos(photosRef.current.map((p) => p.id === current.id ? { ...p, overlays: next } : p));
  }
  function finishText(overlay: TextOverlay | null) {
    const target = textEdit;
    setTextEdit(null);
    if (!target) return;
    if (target.index === null) { if (overlay) setOverlays([...overlays, overlay]); return; }
    setOverlays(overlay ? overlays.map((o, i) => i === target.index ? overlay : o) : overlays.filter((_, i) => i !== target.index));
  }

  /* ---------- 영상 준비 (올리기 단계에 들어오면 뒤에서 시작) ---------- */
  function startPrep(r: Reel): Prep {
    const key = prepKey(r);
    if (prepRef.current?.key === key && !prepRef.current.error) return prepRef.current;
    prepRef.current?.controller.abort();
    const controller = new AbortController();
    const entry = { key, controller, progress: 0 } as Prep;
    entry.promise = prepareVideo(r.file, { start: r.start, end: r.end, muted: r.muted }, {
      signal: controller.signal,
      onProgress: (p) => { entry.progress = p; if (prepRef.current === entry && mountedRef.current) setPrepView({ progress: p, done: false }); },
    }).then((result) => {
      if (prepRef.current === entry && mountedRef.current) setPrepView({ progress: 1, done: true });
      return result;
    }, (cause: unknown) => {
      entry.error = cause instanceof Error ? cause.message : "영상을 준비하지 못했어요.";
      if (prepRef.current === entry && mountedRef.current && !(cause instanceof Error && cause.name === "AbortError")) setPrepView({ progress: entry.progress, error: entry.error, done: false });
      throw cause;
    });
    entry.promise.catch(() => {});
    prepRef.current = entry;
    setPrepView({ progress: 0, done: false });
    return entry;
  }
  async function ensureCover(r: Reel): Promise<Cover> {
    if (r.cover && r.cover.time >= r.start && r.cover.time <= r.end) return r.cover;
    const time = Math.min(r.end, r.start + 0.1);
    const blob = await grabFrame(r.url, time, 1080) as Blob;
    const cover = { time, blob, url: URL.createObjectURL(blob) };
    if (r.cover) URL.revokeObjectURL(r.cover.url);
    if (reelRef.current === r || reelRef.current?.url === r.url) patchReel({ cover });
    return cover;
  }
  function goShare() {
    setError(null); setStep("share"); setTrimOpen(false);
    const r = reelRef.current;
    if (r) { startPrep(r); void ensureCover(r).catch(() => setError("표지를 만들지 못했어요. 표지를 다시 골라 주세요.")); }
  }

  /* ---------- 올리기 ---------- */
  async function share() {
    if (busyRef.current || pickingRef.current) return;
    const r = reelRef.current;
    if (textOnly ? !caption.trim() : !(r || photosRef.current.length)) return;
    busyRef.current = true; setBusy(true); setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new DOMException("멈춤", "AbortError")), { once: true }));
    stopped.catch(() => {});
    try {
      const pages: FeedPage[] = [];
      const text = caption.trim();
      if (textOnly) pages.push({ title: title.trim() || undefined, text });
      else if (r) {
        const prep = startPrep(r);
        setProgress({ label: "영상 준비 중", percent: Math.round(prep.progress * 100) });
        const timer = window.setInterval(() => setProgress((p) => p?.label === "영상 준비 중" ? { ...p, percent: Math.round(prep.progress * 100) } : p), 250);
        let prepared: PreparedVideo;
        try { prepared = await Promise.race([prep.promise, stopped]); } finally { window.clearInterval(timer); }
        let cover = await Promise.race([ensureCover(reelRef.current ?? r), stopped]);
        if (!cover.uploaded) {
          setProgress({ label: "표지 올리는 중", percent: 0 });
          const result = await uploadImage(new File([cover.blob], "cover.webp", { type: cover.blob.type || "image/webp" }), { signal: controller.signal });
          cover = { ...cover, uploaded: result.url };
          patchReel({ cover });
        }
        let video = reelRef.current?.uploaded?.key === prep.key ? reelRef.current.uploaded.url : null;
        if (!video) {
          setProgress({ label: "영상 올리는 중", percent: 0 });
          const result = await uploadVideo(prepared.blob, { signal: controller.signal, onProgress: (percent) => setProgress({ label: "영상 올리는 중", percent }) });
          video = result.url;
          patchReel({ uploaded: { key: prep.key, url: video } });
        }
        const latest = reelRef.current ?? r;
        pages.push({ video, image: cover.uploaded, duration: prepared.duration, ratio: prepared.ratio, muted: prepared.muted || undefined, overlays: latest.overlays.length ? latest.overlays : undefined, text });
      } else {
        const list = photosRef.current;
        for (let index = 0; index < list.length; index++) {
          const photo = photosRef.current.find((p) => p.id === list[index].id) ?? list[index];
          let url = photo.uploaded;
          if (!url) {
            setProgress({ label: `사진 ${index + 1}/${list.length} 올리는 중`, percent: 0 });
            const result = await uploadImage(photo.file, { signal: controller.signal, onProgress: (percent) => setProgress({ label: `사진 ${index + 1}/${list.length} 올리는 중`, percent }) });
            url = result.url;
            replacePhotos(photosRef.current.map((item) => item.id === photo.id ? { ...item, uploaded: url } : item));
          }
          if (controller.signal.aborted) throw new DOMException("멈춤", "AbortError");
          pages.push({ image: url, ratio: photo.ratio, overlays: photo.overlays.length ? photo.overlays : undefined, text: index === 0 ? text : "" });
        }
      }
      // 여기부터는 게시가 받아들여졌을 수 있어 멈출 수 없다
      abortRef.current = null; setProgress({ label: "올리는 중", percent: 100 });
      const payload = JSON.stringify({ pages, bg });
      if (submission.current?.payload !== payload) submission.current = { payload, id: crypto.randomUUID() };
      await onSubmit(pages, bg, firstTime ? bio : undefined, submission.current.id);
      submission.current = null;
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
      replacePhotos([]);
      prepRef.current = null; setPrepView(null);
      const done = reelRef.current;
      if (done) { URL.revokeObjectURL(done.url); if (done.cover) URL.revokeObjectURL(done.cover.url); }
      setReel(null);
      setCaption(""); setTitle(""); setBio(""); setStep("pick"); setActive(0); setTextOnly(false);
    } catch (cause) {
      const name = cause instanceof Error || cause instanceof DOMException ? cause.name : "";
      setError(name === "AbortError" ? "올리기를 멈췄어요. 작성한 내용은 그대로 있어요." : abortRef.current && cause instanceof Error ? cause.message : "올리지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.");
    } finally {
      abortRef.current = null; busyRef.current = false;
      if (mountedRef.current) { setBusy(false); setProgress(null); }
    }
  }

  /** 형광펜: 선택한 글(없으면 커서가 있는 줄)을 ==…== 로 감싼다. 이미 감싸져 있으면 푼다 */
  const highlightSelection = () => {
    const el = captionRef.current;
    if (!el) return;
    const v = caption;
    let s = el.selectionStart, e = el.selectionEnd;
    if (s === e) { s = v.lastIndexOf("\n", s - 1) + 1; e = v.indexOf("\n", e); if (e < 0) e = v.length; }
    const sel = v.slice(s, e);
    if (!sel.trim()) return;
    const wrapped = sel.startsWith("==") && sel.endsWith("==") && sel.length > 4;
    const next = wrapped ? v.slice(0, s) + sel.slice(2, -2) + v.slice(e) : `${v.slice(0, s)}==${sel}==${v.slice(e)}`;
    if (next.length > 280) return;
    setCaption(next);
    const len = wrapped ? sel.length - 4 : sel.length + 4;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s, s + len); });
  };

  if (!open) return null;
  const editPhoto = photos.find((photo) => photo.id === editing);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const dark = step === "edit";
  const canShare = textOnly ? Boolean(caption.trim()) : Boolean(reel || photos.length);
  const firstMedia = reel ? { ratio: reel.info.ratio, src: reel.cover?.url, overlays: reel.overlays } : photos[0] ? { ratio: photos[0].ratio, src: photos[0].preview, overlays: photos[0].overlays } : null;

  return <>
    <div ref={dialog} className={`${styles.screen} ${dark ? styles.dark : ""}`} role="dialog" aria-modal="true" aria-label="새 게시물" tabIndex={-1}
      inert={Boolean(editPhoto || textEdit || coverOpen)}>
      <header className={styles.header}>
        <button type="button" className={styles.iconBtn} disabled={busy} aria-label={step === "share" ? "이전 단계" : "닫기 (작성 내용은 남아요)"} onClick={() => back()}>
          {step === "share" ? <IconChevronL /> : <IconClose />}
        </button>
        <div className={styles.headerCenter}>
          <b>{STEPS[stepIndex].label}</b>
          <span className={styles.dots} aria-label={`${stepIndex + 1}/3단계`}>{STEPS.map((s, i) => <i key={s.id} className={i <= stepIndex ? styles.dotOn : undefined} />)}</span>
        </div>
        {step === "edit" ? <button type="button" className={styles.next} disabled={picking || busy} onClick={goShare}>다음</button> : <span className={styles.headerSpacer} />}
      </header>

      <input ref={gallery} type="file" multiple accept={`${IMAGE_TYPES.join(",")},video/*`} hidden onChange={(event) => { void pick(event.target.files); event.target.value = ""; }} />
      <input ref={photoCamera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void pick(event.target.files); event.target.value = ""; }} />
      <input ref={videoCamera} type="file" accept="video/*" capture="environment" hidden onChange={(event) => { void pick(event.target.files); event.target.value = ""; }} />

      {step === "pick" && <div className={styles.pick} aria-busy={picking}>
        <button type="button" className="btn block" disabled={picking} onClick={() => gallery.current?.click()}>{picking ? "불러오는 중…" : "사진·영상 고르기"}</button>
        <div className={styles.captureWrap}>
          <button type="button" className="btn ghost block" disabled={picking} aria-expanded={captureMenu} onClick={() => setCaptureMenu((v) => !v)}>촬영</button>
          {captureMenu && <div className={styles.captureMenu} role="menu">
            <button type="button" role="menuitem" onClick={() => { setCaptureMenu(false); photoCamera.current?.click(); }}>사진 찍기</button>
            <button type="button" role="menuitem" onClick={() => { setCaptureMenu(false); videoCamera.current?.click(); }}>영상 찍기</button>
          </div>}
        </div>
        <button type="button" className="text-btn" disabled={picking} onClick={() => { setTextOnly(true); setStep("share"); setError(null); }}>글만 쓰기</button>
        <small className={styles.limits}>사진 {FEED_MAX_PAGES}장 · 영상 {VIDEO_MAX_SECONDS}초</small>
        {error && <div className={styles.error} role="alert">{error}</div>}
      </div>}

      {step === "edit" && <div className={styles.edit}>
        <div className={styles.stage}>
          {(reel || current) && <MediaFrame ref={box} ratio={reel ? reel.info.ratio : current?.ratio}>
            {reel
              ? <video ref={preview} src={reel.url} playsInline muted={reel.muted} preload="auto" aria-label="고른 영상 미리보기"
                  onTimeUpdate={(event) => { const v = event.currentTarget; setPlayhead(v.currentTime); if (v.currentTime >= reel.end - 0.04 || v.currentTime < reel.start - 0.3) { v.currentTime = reel.start; void v.play().catch(() => {}); } }}
                  onEnded={(event) => { event.currentTarget.currentTime = reel.start; void event.currentTarget.play().catch(() => {}); }} />
              // eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기는 이미지 프록시로 보내지 않는다
              : <img src={current?.preview} alt={`${active + 1}번째 사진`} onError={() => setError("이 사진을 읽지 못했어요. 다른 사진으로 바꿔 주세요.")} />}
            <OverlayEditor overlays={overlays} box={box} onChange={setOverlays} onEdit={(index) => setTextEdit({ index })} />
          </MediaFrame>}
          {photos.length > 1 && <span className={styles.count}>{active + 1}/{photos.length}</span>}
        </div>
        {reel && trimOpen && <VideoTrimmer src={reel.url} duration={reel.info.duration} start={reel.start} end={reel.end} playhead={playhead}
          onChange={(start, end) => patchReel({ start, end })} />}
        {error && <div className={styles.darkError} role="alert">{error}</div>}
        <div className={styles.toolbar} role="toolbar" aria-label="꾸미기 도구">
          {reel ? <>
            <button type="button" className={trimOpen ? styles.toolOn : undefined} aria-pressed={trimOpen} onClick={() => setTrimOpen((v) => !v)}><ScissorsIcon /><span>구간</span></button>
            <button type="button" disabled={overlays.length >= MAX_OVERLAYS} onClick={() => setTextEdit({ index: null })}><b className={styles.aa}>Aa</b><span>글</span></button>
            <button type="button" aria-pressed={!reel.muted} disabled={!reel.info.hasAudio} onClick={() => patchReel({ muted: !reel.muted })}>{reel.muted ? <SoundOffIcon /> : <SoundOnIcon />}<span>{reel.muted ? "소리 꺼짐" : "소리"}</span></button>
            <button type="button" onClick={removeReel}><IconTrash /><span>빼기</span></button>
          </> : current ? <>
            <button type="button" onClick={() => setEditing(current.id)}><CropIcon /><span>편집</span></button>
            <button type="button" disabled={overlays.length >= MAX_OVERLAYS} onClick={() => setTextEdit({ index: null })}><b className={styles.aa}>Aa</b><span>글</span></button>
            {photos.length > 1 && <>
              <button type="button" disabled={active === 0} aria-label="앞으로 옮기기" onClick={() => movePhoto(-1)}><IconChevronL /><span>앞으로</span></button>
              <button type="button" disabled={active === photos.length - 1} aria-label="뒤로 옮기기" onClick={() => movePhoto(1)}><IconChevronR /><span>뒤로</span></button>
            </>}
            <button type="button" onClick={() => removePhoto(active)}><IconTrash /><span>빼기</span></button>
          </> : null}
        </div>
        {!reel && photos.length > 0 && <div className={styles.thumbs} aria-label="고른 사진">
          {photos.map((photo, index) => <button key={photo.id} type="button" aria-label={`${index + 1}번째 사진`} aria-pressed={index === active}
            className={index === active ? styles.thumbOn : undefined} onClick={() => setActive(index)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.preview} alt="" />
          </button>)}
          {photos.length < FEED_MAX_PAGES && <button type="button" className={styles.thumbAdd} disabled={picking} onClick={() => gallery.current?.click()} aria-label="사진 더 고르기"><IconPlus /></button>}
        </div>}
      </div>}

      {step === "share" && <div className={styles.share} aria-busy={busy}>
        {firstMedia && <div className={styles.summary}>
          <button type="button" className={styles.summaryMedia} disabled={!reel || busy} style={{ aspectRatio: String(Math.max(0.5, Math.min(1, firstMedia.ratio))) }} onClick={() => setCoverOpen(true)} aria-label={reel ? "표지 고르기" : "첫 사진"}>
            <MediaFrame ratio={firstMedia.ratio}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {firstMedia.src && <img src={firstMedia.src} alt="" />}
              <Overlays overlays={firstMedia.overlays} />
            </MediaFrame>
            {reel && <span className={styles.coverTag}>표지</span>}
            {photos.length > 1 && <span className={styles.coverTag}>{photos.length}장</span>}
          </button>
          <div className={styles.summaryText}>
            <textarea ref={captionRef} aria-label="이야기" disabled={busy} value={caption} maxLength={280} placeholder="이야기를 나눠 주세요" onChange={(event) => setCaption(event.target.value)} />
          </div>
        </div>}
        {textOnly && <>
          <div className="field"><label htmlFor="post-title">제목 <span className="muted">(선택)</span></label><input id="post-title" value={title} disabled={busy} maxLength={24} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="field"><label htmlFor="post-caption">이야기</label><textarea id="post-caption" ref={captionRef} disabled={busy} value={caption} maxLength={280} onChange={(event) => setCaption(event.target.value)} /></div>
        </>}
        <div className={styles.captionTools}>
          <button type="button" className={styles.hlBtn} disabled={busy || !caption.trim()} onClick={highlightSelection} aria-label="선택한 글 형광펜"><mark className="hl">형광펜</mark></button>
          <span className={styles.counter}>{caption.length}/280</span>
        </div>
        {hasCrisisSignal(caption) && <HelpBanner alert />}
        {textOnly && <div className="field"><label>배경</label><div className="swatches">{Array.from({ length: FEED_BG_COUNT }, (_, index) => <button type="button" key={index} disabled={busy} className={"swatch bg-" + index + (bg === index ? " on" : "")} aria-label={FEED_BG_LABELS[index]} aria-pressed={bg === index} onClick={() => setBg(index)}><span>{FEED_BG_LABELS[index]}</span></button>)}</div></div>}
        {firstTime && <div className="field"><label htmlFor="post-bio">내 소개 <span className="muted">(선택)</span></label><input id="post-bio" value={bio} maxLength={80} disabled={busy} onChange={(event) => setBio(event.target.value)} /></div>}
        {reel && !busy && prepView && !prepView.done && <p className={styles.prep} role="status">{prepView.error ? prepView.error : `영상 준비 중 ${Math.round(prepView.progress * 100)}%`}</p>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {busy && progress && <div className={styles.progress} role="status">
          <b>{progress.label} · {progress.percent}%</b>
          <progress value={progress.percent} max={100} aria-label="올리기 진행률" />
          {abortRef.current && <button type="button" className="text-btn" onClick={() => abortRef.current?.abort()}>멈추기</button>}
        </div>}
        <p className={styles.visibility}>위로 피드에 공개돼요</p>
        <button type="button" className="btn block" disabled={busy || !canShare} onClick={() => void share()}>{busy ? "올리는 중…" : error ? "다시 올리기" : "올리기"}</button>
      </div>}
    </div>

    {editPhoto && <PhotoEditor file={editPhoto.file} onSave={(file) => void saveEdit(file)} onClose={() => setEditing(null)} />}
    {textEdit && <TextEntry initial={textEdit.index === null ? undefined : overlays[textEdit.index]} boxWidth={boxWidth} onDone={finishText} onCancel={() => setTextEdit(null)} />}
    {coverOpen && reel && <CoverPicker src={reel.url} ratio={reel.info.ratio} start={reel.start} end={reel.end} value={reel.cover?.time ?? reel.start} overlays={reel.overlays}
      onCancel={() => setCoverOpen(false)}
      onDone={(time, blob) => {
        const old = reelRef.current?.cover;
        if (old) URL.revokeObjectURL(old.url);
        patchReel({ cover: { time, blob, url: URL.createObjectURL(blob) } });
        setCoverOpen(false);
      }} />}
  </>;
}

function ScissorsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="6" cy="7" r="2.6" /><circle cx="6" cy="17" r="2.6" /><path d="M8.2 8.4 20 17M8.2 15.6 20 7" /></svg>; }
function CropIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></svg>; }
