"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SHOUT_CATEGORIES, SHOUT_MAX_IMAGES, ShoutCat, api, fetchCommunity, isBlocked, shoutCatById } from "@/lib/community";
import { hasCrisisSignal } from "@/lib/crisis";
import { uploadAvailable, uploadImage } from "@/lib/upload";
import { toastSuccess } from "@/lib/toast";
import HelpBanner from "@/components/HelpBanner";
import PhotoEditor from "@/components/PhotoEditor";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { IconClose, IconImage } from "@/components/Icons";
import styles from "./write.module.css";
import { route } from "@/lib/routes";

const MAX_TEXT = 600;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 업로드 전에 브라우저가 줄이므로 원본은 넉넉히

interface Photo { id: string; file: File; preview: string }

/**
 * 새 외침 쓰기 (홈 오른쪽 위 +). 글 + 사진 최대 4장 + 카테고리.
 * 올리기를 누르면 사진을 S3 에 올린 뒤(프리사인) 글을 만들고, 방금 쓴 글 화면으로 간다.
 */
export default function WritePage() {
  const router = useRouter();
  const [cat, setCat] = useState<ShoutCat>("misfortune");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [canUpload, setCanUpload] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [progress, setProgress] = useState<{ index: number; percent: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 편집 중인 사진 id (자르기·필터·조정)
  const fileInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("cat");
    if (q && SHOUT_CATEGORIES.some((c) => c.id === q)) setCat(q as ShoutCat);
    uploadAvailable().then(setCanUpload).catch(() => setCanUpload(false));
    fetchCommunity().then((s) => setBlocked(isBlocked(s.me))).catch(() => {});
    return () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
  }, []);

  const c = shoutCatById(cat);
  const dirty = text.trim().length > 0 || photos.length > 0;
  const canSubmit = text.trim().length > 0 && !busy && !blocked;

  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("쓰던 글을 버릴까요?")) return;
    if (window.history.length > 1) router.back();
    else router.replace("/");
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const room = SHOUT_MAX_IMAGES - photosRef.current.length;
    const picked: Photo[] = [];
    for (const file of Array.from(list)) {
      if (picked.length >= room) { setError(`사진은 최대 ${SHOUT_MAX_IMAGES}장까지 올릴 수 있어요.`); break; }
      if (!PHOTO_TYPES.includes(file.type)) { setError("JPG·PNG·WebP·GIF만 올릴 수 있어요."); continue; }
      if (file.size > MAX_PHOTO_BYTES) { setError("20MB 이하로 골라 주세요."); continue; }
      picked.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    if (picked.length) setPhotos((cur) => [...cur, ...picked]);
  };

  const saveEdited = (id: string, file: File) => {
    setPhotos((cur) => cur.map((p) => {
      if (p.id !== id) return p;
      URL.revokeObjectURL(p.preview);
      return { ...p, file, preview: URL.createObjectURL(file) };
    }));
    setEditing(null);
  };

  const removePhoto = (id: string) => {
    setPhotos((cur) => {
      const gone = cur.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return cur.filter((p) => p.id !== id);
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (let index = 0; index < photos.length; index++) {
        setProgress({ index, percent: 0 });
        const result = await uploadImage(photos[index].file, { onProgress: (percent) => setProgress({ index, percent }) });
        urls.push(result.url);
      }
      setProgress(null);
      const store = await api.createPost(cat, text.trim(), urls);
      const created = store.posts.filter((p) => p.authorId === store.me.id).sort((a, b) => b.createdAt - a.createdAt)[0];
      toastSuccess("외침을 올렸어요");
      router.replace(created ? route(`/shout/${created.id}`) : "/shout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      setProgress(null);
      setBusy(false);
    }
  };

  const editingPhoto = photos.find((p) => p.id === editing);

  return (
    <div className={styles.page} inert={Boolean(editingPhoto)}>
      <header className={styles.bar}>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={close}><IconClose /></button>
        <h1>새 외침</h1>
        <button type="button" className={styles.submit} disabled={!canSubmit} onClick={submit} aria-busy={busy}>
          {busy ? (progress ? `${progress.index + 1}/${photos.length}` : "올리는 중") : "올리기"}
        </button>
      </header>

      {/* 어디에: 한 줄로 넘겨 고른다 */}
      <div className={styles.boards} role="radiogroup" aria-label="광장">
        {SHOUT_CATEGORIES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={cat === x.id} className={`${styles.board} ${cat === x.id ? styles.boardOn : ""}`} onClick={() => setCat(x.id)} disabled={busy}>
            <ShoutCatIcon id={x.id} />
            {x.head}
          </button>
        ))}
      </div>

      <div className={styles.form}>
        {blocked && <div className="notice warn">차단된 계정은 글을 쓸 수 없어요.</div>}

        <textarea
          className={styles.text}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={c.placeholder}
          maxLength={MAX_TEXT}
          autoFocus
          aria-label={`${c.label}에 쓸 내용`}
          disabled={busy}
        />

        {photos.length > 0 && (
          <div className={styles.photos} aria-label="사진">
            {photos.map((p, i) => (
              <div key={p.id} className={styles.photo}>
                <button type="button" className={styles.photoEdit} disabled={busy} onClick={() => setEditing(p.id)} aria-label={`사진 ${i + 1} 편집`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 고른 사진 미리보기(blob:) */}
                  <img src={p.preview} alt="" />
                </button>
                {!busy && <button type="button" className={styles.remove} aria-label={`사진 ${i + 1} 빼기`} onClick={() => removePhoto(p.id)}><IconClose /></button>}
                {progress && progress.index === i && <div className={styles.progress}><span style={{ width: `${progress.percent}%` }} /></div>}
              </div>
            ))}
          </div>
        )}

        <div className={styles.tools}>
          <button type="button" className={styles.tool} disabled={busy || canUpload === false || photos.length >= SHOUT_MAX_IMAGES} onClick={() => fileInput.current?.click()}
            aria-label={canUpload === false ? "사진은 준비 중이에요" : `사진 추가 (${photos.length}/${SHOUT_MAX_IMAGES})`}>
            <IconImage />
            {photos.length > 0 && <span>{photos.length}/{SHOUT_MAX_IMAGES}</span>}
          </button>
          <span className={styles.meta}>익명 · {text.length}/{MAX_TEXT}</span>
        </div>
        <input ref={fileInput} type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

        {hasCrisisSignal(text) && <HelpBanner alert />}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      {editingPhoto && <PhotoEditor file={editingPhoto.file} onSave={(file) => saveEdited(editingPhoto.id, file)} onClose={() => setEditing(null)} />}
    </div>
  );
}
