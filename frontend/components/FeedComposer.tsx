"use client";

import { useEffect, useRef, useState } from "react";
import { FEED_BG_COUNT, FEED_BG_LABELS, FEED_MAX_PAGES, type FeedPage } from "@/lib/community-core";
import { hasCrisisSignal } from "@/lib/crisis";
import { uploadImage } from "@/lib/upload";
import { inspectPhotoHeader } from "@/lib/photo-edit";
import HelpBanner from "./HelpBanner";
import PhotoEditor from "./PhotoEditor";
import { IconChevronL, IconClose, IconPlus } from "./Icons";
import styles from "./FeedComposer.module.css";

type Photo = { id: string; file: File; preview: string; uploaded?: string };
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export default function FeedComposer({ open, firstTime, onClose, onSubmit }: {
  open: boolean; firstTime: boolean; onClose: () => void;
  onSubmit: (pages: FeedPage[], bg: number, bio: string | undefined, clientRequestId: string) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [textOnly, setTextOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [bio, setBio] = useState("");
  const [bg, setBg] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ index: number; percent: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pickingRef = useRef(false);
  const mountedRef = useRef(true);
  const [picking, setPicking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submission = useRef<{ payload: string; id: string } | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function replacePhotos(next: Photo[]) { photosRef.current = next; setPhotos(next); }
  useEffect(() => { mountedRef.current = true; return () => {
    mountedRef.current = false;
    abortRef.current?.abort();
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
  }; }, []);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (element.closest("[inert]") || element.inert || document.querySelector(".community-consent [role=dialog]")) return;
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== "Tab") return;
      const targets = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]')].filter((target) => target.getClientRects().length);
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
  }, [open]);

  async function pick(files: FileList | null) {
    if (!files?.length || busyRef.current || pickingRef.current) return;
    pickingRef.current = true; setPicking(true);
    const accepted: Photo[] = [], issues: string[] = [];
    const room = FEED_MAX_PAGES - photosRef.current.length;
    for (const file of Array.from(files)) {
      if (accepted.length >= room) { issues.push("사진은 최대 " + FEED_MAX_PAGES + "장까지 골라 주세요."); break; }
      if (file.type && !ACCEPT.split(",").includes(file.type)) { issues.push("읽을 수 없는 사진이 있어요. JPG, PNG, WebP 또는 GIF 사진을 골라 주세요."); continue; }
      if (file.size === 0 || file.size > 20 * 1024 * 1024) { issues.push("사진 한 장은 20MB 이하로 골라 주세요."); continue; }
      try { inspectPhotoHeader(await file.slice(0, 512 * 1024).arrayBuffer()); }
      catch (cause) { issues.push(cause instanceof Error ? cause.message : "이 사진을 읽지 못했어요. 다른 사진을 선택해 주세요."); continue; }
      if (!mountedRef.current) break;
      accepted.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    pickingRef.current = false;
    if (!mountedRef.current) { accepted.forEach((photo) => URL.revokeObjectURL(photo.preview)); return; }
    setPicking(false);
    if (accepted.length) {
      const index = photosRef.current.length;
      replacePhotos([...photosRef.current, ...accepted]);
      setActive(index); setTextOnly(false);
    }
    setError(issues.length ? [...new Set(issues)].join(" ") : null);
  }
  function remove(index: number) {
    const previous = photosRef.current;
    URL.revokeObjectURL(previous[index].preview);
    replacePhotos(previous.filter((_, i) => i !== index));
    setActive(Math.max(0, Math.min(index, previous.length - 2))); setError(null);
  }
  function move(direction: -1 | 1) {
    const next = [...photosRef.current], target = active + direction;
    if (target < 0 || target >= next.length) return;
    [next[active], next[target]] = [next[target], next[active]];
    replacePhotos(next); setActive(target);
  }
  function saveEdit(file: File) {
    replacePhotos(photosRef.current.map((photo) => {
      if (photo.id !== editing) return photo;
      URL.revokeObjectURL(photo.preview);
      return { ...photo, file, preview: URL.createObjectURL(file), uploaded: undefined };
    }));
    setEditing(null); setError(null);
  }
  async function share() {
    if (busyRef.current || pickingRef.current || (textOnly ? !caption.trim() : photosRef.current.length === 0)) return;
    busyRef.current = true; setBusy(true); setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const pages: FeedPage[] = [];
      if (textOnly) pages.push({ title: title.trim() || undefined, text: caption.trim() });
      else {
        for (let index = 0; index < photosRef.current.length; index++) {
          const photo = photosRef.current[index];
          let url = photo.uploaded;
          if (!url) {
            setProgress({ index, percent: 0 });
            const result = await uploadImage(photo.file, {
              signal: controller.signal, onProgress: (percent) => setProgress({ index, percent }),
            });
            url = result.url;
            replacePhotos(photosRef.current.map((item) => item.id === photo.id ? { ...item, uploaded: url } : item));
          }
          if (controller.signal.aborted) throw new DOMException("취소", "AbortError");
          pages.push({ image: url, title: index === 0 ? title.trim() || undefined : undefined, text: index === 0 ? caption.trim() : "" });
        }
      }
      // A post may already be accepted after this point; only uploads can be canceled.
      abortRef.current = null; setProgress(null);
      const payload = JSON.stringify({ pages, bg });
      if (submission.current?.payload !== payload) submission.current = { payload, id: crypto.randomUUID() };
      await onSubmit(pages, bg, firstTime ? bio : undefined, submission.current.id);
      submission.current = null;
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
      replacePhotos([]);
      setCaption(""); setTitle(""); setBio(""); setStep(1); setActive(0); setTextOnly(false);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "AbortError" ? "전송을 멈췄어요. 고른 사진과 작성한 내용은 그대로 있어요." : abortRef.current && cause instanceof Error ? cause.message + " 고른 사진과 작성한 내용은 그대로 있어요." : "게시하지 못했어요. 사진과 내용은 그대로 있으니 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      abortRef.current = null; busyRef.current = false; setBusy(false); setProgress(null);
    }
  }

  if (!open) return null;
  const current = photos[active], editPhoto = photos.find((photo) => photo.id === editing);
  const canShare = textOnly ? Boolean(caption.trim()) : photos.length > 0;
  return <>
    <div ref={dialog} className={styles.screen} role="dialog" aria-modal="true" aria-label="새 게시물" tabIndex={-1} inert={Boolean(editPhoto)}>
      <header className={styles.header}>
        <button type="button" className="icon-btn" disabled={busy} aria-label={step === 1 ? "작성 내용 유지하고 닫기" : "사진 선택으로 돌아가기"} onClick={() => step === 1 ? onClose() : (setStep(1), setError(null))}>{step === 1 ? <IconClose /> : <IconChevronL />}</button>
        <div><b>새 게시물</b><small>{step === 1 ? "사진 선택" : "내용 작성"}</small></div>
        <button type="button" className={styles.next} disabled={busy || picking || (step === 1 ? !photos.length : !canShare)} onClick={() => step === 1 ? (setTextOnly(false), setStep(2), setError(null)) : void share()}>{busy ? "게시 중…" : step === 1 ? "다음" : "게시"}</button>
      </header>
      <div className={styles.steps} aria-hidden="true"><i /><i className={step === 2 ? styles.done : undefined} /></div>
      <div className={styles.body} aria-busy={busy || picking}>
        {picking && <p className={styles.hint} role="status">사진을 준비하고 있어요…</p>}
        <input ref={gallery} type="file" multiple accept={ACCEPT} hidden onChange={(event) => { pick(event.target.files); event.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { pick(event.target.files); event.target.value = ""; }} />
        {step === 1 ? <>
          <div className={styles.preview}>
            {current ? <>
              {/* Local previews must not be sent to an image proxy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.preview} alt={(active + 1) + "번째 사진 미리보기"} onError={() => setError("이 사진을 읽지 못했어요. 다른 사진으로 바꿔 주세요.")} />
              <span className={styles.count}>{active + 1} / {photos.length}</span>
              {active === 0 && <span className={styles.cover}>대표 사진</span>}
              <button type="button" className={styles.edit} onClick={() => setEditing(current.id)}>편집 · 필터</button>
            </> : <div className={styles.empty}>
              <span className={styles.photoSymbol}><PhotoIcon /></span><h2>나누고 싶은 순간</h2><p>사진 한 장에 오늘의 마음을 담아 보세요.</p>
              <button type="button" className="btn" onClick={() => gallery.current?.click()}>사진 선택</button>
              <small>최대 {FEED_MAX_PAGES}장 · 기기에서 직접 선택해요</small>
            </div>}
          </div>
          <div className={styles.libraryHead}><b>선택한 사진 <span>{photos.length}/{FEED_MAX_PAGES}</span></b><button type="button" className="text-btn" disabled={picking} onClick={() => { setTextOnly(true); setStep(2); setError(null); }}>글만 쓰기</button></div>
          <div className={styles.pickers}>
            <button type="button" disabled={picking || photos.length >= FEED_MAX_PAGES} onClick={() => gallery.current?.click()}><PhotoIcon />{photos.length ? "사진 추가" : "앨범에서 선택"}</button>
            <button type="button" disabled={picking || photos.length >= FEED_MAX_PAGES} onClick={() => camera.current?.click()}><CameraIcon />촬영</button>
          </div>
          {photos.length > 0 && <>
            <div className={styles.thumbnails} aria-label="선택한 사진 순서">{photos.map((photo, index) => <button key={photo.id} type="button" aria-label={(index + 1) + "번째 사진" + (index === 0 ? ", 대표 사진" : "")} aria-pressed={index === active} className={index === active ? styles.selected : undefined} onClick={() => setActive(index)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.preview} alt="" /><span>{index + 1}</span>
            </button>)}{photos.length < FEED_MAX_PAGES && <button type="button" className={styles.add} onClick={() => gallery.current?.click()} aria-label="사진 더 고르기"><IconPlus /></button>}</div>
            <div className={styles.order}><div><button type="button" disabled={active === 0} aria-label="사진을 앞으로 이동" onClick={() => move(-1)}>← 앞으로</button><button type="button" disabled={active === photos.length - 1} aria-label="사진을 뒤로 이동" onClick={() => move(1)}>뒤로 →</button></div><button type="button" className={styles.remove} onClick={() => remove(active)}>삭제</button></div>
            <p className={styles.hint}>첫 사진이 대표 사진이 돼요. 사진을 골라 순서를 바꿀 수 있어요.</p>
          </>}
        </> : <div className={styles.form}>
          {!textOnly && <>
            <div className={styles.review} aria-label="게시할 사진 미리보기">{photos.map((photo, index) => <figure key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.preview} alt={(index + 1) + "번째 게시 사진"} /><figcaption>{index + 1} / {photos.length}{index === 0 ? " · 대표 사진" : ""}</figcaption>
            </figure>)}</div>
            {photos.length > 1 && <p className={styles.hint}>옆으로 넘겨 사진을 확인해 보세요.</p>}
          </>}
          <div className="field"><label htmlFor="post-title">제목 <span className="muted">(선택)</span></label><input id="post-title" value={title} disabled={busy} maxLength={24} placeholder="오늘의 순간에 이름을 붙인다면" onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="field"><label htmlFor="post-caption">함께 나눌 이야기 {!textOnly && <span className="muted">(선택)</span>}</label><textarea id="post-caption" disabled={busy} value={caption} maxLength={280} placeholder="사진에 담긴 마음이나 누군가에게 건네고 싶은 위로를 적어 주세요." onChange={(event) => setCaption(event.target.value)} /><span className={styles.counter}>{caption.length}/280</span></div>
          {hasCrisisSignal(caption) && <HelpBanner alert />}
          {textOnly && <div className="field"><label>글 배경</label><div className="swatches">{Array.from({ length: FEED_BG_COUNT }, (_, index) => <button type="button" key={index} disabled={busy} className={"swatch bg-" + index + (bg === index ? " on" : "")} aria-label={FEED_BG_LABELS[index]} aria-pressed={bg === index} onClick={() => setBg(index)}><span>{FEED_BG_LABELS[index]}</span></button>)}</div></div>}
          {firstTime && <div className="field"><label htmlFor="post-bio">내 소개 <span className="muted">(선택)</span></label><input id="post-bio" value={bio} maxLength={80} disabled={busy} placeholder="어떤 마음을 나누고 싶나요?" onChange={(event) => setBio(event.target.value)} /></div>}
          <p className={styles.visibility}>위로 피드에 공개돼요. 모두가 편안하게 볼 수 있는 사진과 이야기를 나눠 주세요.</p>
        </div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {busy && <div className={styles.progress} role="status"><b>{progress ? "사진 " + (progress.index + 1) + "/" + photos.length + "장 전송 중 · " + progress.percent + "%" : "게시물을 올리고 있어요…"}</b>{progress && <><progress value={progress.index * 100 + progress.percent} max={photos.length * 100} aria-label="사진 전송 진행률" /><button type="button" className="text-btn" onClick={() => abortRef.current?.abort()}>전송 멈추기</button></>}</div>}
        {step === 2 && <div className={styles.footer}><button type="button" className="btn block" disabled={busy || !canShare} onClick={() => void share()}>{busy ? "게시 중…" : error ? "다시 게시하기" : "게시하기"}</button></div>}
      </div>
    </div>
    {editPhoto && <PhotoEditor file={editPhoto.file} onSave={saveEdit} onClose={() => setEditing(null)} />}
  </>;
}

function PhotoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" strokeLinejoin="round" /></svg>; }
function CameraIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 6 9.5 3h5L16 6h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" /></svg>; }
