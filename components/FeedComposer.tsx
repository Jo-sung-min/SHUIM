"use client";

/**
 * 피드 글 작성기 — 인스타그램 새 게시물 흐름을 참고한 3단계 풀스크린.
 *  1) 사진 선택: 그리드에서 여러 장을 순서대로 고름 (내 사진 올리기 / 기본 그림 / 주소), 또는 글만
 *  2) 편집: 고른 순서대로 넘기며 슬라이드마다 제목·글 입력
 *  3) 공유: 요약 확인, 배경·소개 선택, 공유
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FEED_BG_COUNT, FEED_BG_LABELS, FEED_IMAGES, FEED_MAX_PAGES } from "@/lib/community-core";
import type { FeedPage } from "@/lib/community-core";
import { hasCrisisSignal } from "@/lib/crisis";
import { uploadAvailable, uploadImage } from "@/lib/upload";
import HelpBanner from "./HelpBanner";
import { IconChevronL, IconClose, IconPlus } from "./Icons";

type Step = 1 | 2 | 3;
interface Draft {
  image?: string;
  title: string;
  text: string;
}

export default function FeedComposer({
  open,
  firstTime,
  onClose,
  onSubmit,
}: {
  open: boolean;
  firstTime: boolean;
  onClose: () => void;
  onSubmit: (pages: FeedPage[], bg: number, bio: string | undefined) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>(1);
  const [library, setLibrary] = useState<string[]>([]); // 이번에 올린 내 사진
  const [selected, setSelected] = useState<string[]>([]); // 고른 순서
  const [textOnly, setTextOnly] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [cur, setCur] = useState(0);
  const [bg, setBg] = useState(0);
  const [bio, setBio] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slidesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    uploadAvailable().then(setCanUpload);
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const tiles = useMemo(() => [...library, ...FEED_IMAGES.map((i) => i.src)], [library]);
  const toggle = (src: string) =>
    setSelected((cur) => (cur.includes(src) ? cur.filter((x) => x !== src) : cur.length >= FEED_MAX_PAGES ? cur : [...cur, src]));

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError(null);
    const list = Array.from(files);
    try {
      for (let i = 0; i < list.length; i++) {
        setUploading(`${i + 1}/${list.length} · 0%`);
        const r = await uploadImage(list[i], (pct) => setUploading(`${i + 1}/${list.length} · ${pct}%`));
        setLibrary((l) => (l.includes(r.url) ? l : [r.url, ...l]));
        setSelected((s) => (s.includes(r.url) || s.length >= FEED_MAX_PAGES ? s : [...s, r.url]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드하지 못했어요");
    } finally {
      setUploading(null);
    }
  };
  const addUrl = () => {
    const u = urlInput.trim();
    if (!/^(\/|https?:\/\/)/.test(u)) return;
    setLibrary((l) => (l.includes(u) ? l : [u, ...l]));
    setSelected((s) => (s.includes(u) || s.length >= FEED_MAX_PAGES ? s : [...s, u]));
    setUrlInput("");
  };

  // 1 → 2: 고른 사진 순서대로 슬라이드 초안 만들기 (이미 쓴 글은 유지)
  const goEdit = (onlyText = false) => {
    setTextOnly(onlyText);
    const images = onlyText ? [undefined] : selected;
    setDrafts((old) => images.map((img) => old.find((d) => d.image === img) ?? { image: img, title: "", text: "" }));
    setCur(0);
    setStep(2);
  };
  const update = (patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, i) => (i === cur ? { ...d, ...patch } : d)));
  const allFilled = drafts.length > 0 && drafts.every((d) => d.text.trim());
  const scrollTo = (i: number) => {
    const el = slidesRef.current;
    if (el) el.scrollTo({ left: el.clientWidth * i, behavior: "smooth" });
    setCur(i);
  };
  const onSlidesScroll = () => {
    const el = slidesRef.current;
    if (el) setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        drafts.map((d) => ({ image: d.image, title: d.title.trim() || undefined, text: d.text.trim() })),
        bg,
        firstTime ? bio : undefined
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const d = drafts[cur];
  const needsBg = drafts.some((x) => !x.image);

  return (
    <div className="composer-screen" role="dialog" aria-modal="true" aria-label="새 게시물">
      <header className="composer-head">
        {step === 1 ? (
          <button className="icon-btn" aria-label="닫기" onClick={onClose}><IconClose /></button>
        ) : (
          <button className="icon-btn" aria-label="이전" onClick={() => setStep((s) => (s === 3 ? 2 : 1))}><IconChevronL /></button>
        )}
        <b>{step === 1 ? "새 게시물" : step === 2 ? "편집" : "공유"}</b>
        {step === 1 && (
          <button className="text-btn accent" disabled={selected.length === 0 || Boolean(uploading)} onClick={() => goEdit(false)}>
            다음{selected.length ? ` (${selected.length})` : ""}
          </button>
        )}
        {step === 2 && <button className="text-btn accent" disabled={!allFilled} onClick={() => setStep(3)}>다음</button>}
        {step === 3 && <button className="text-btn accent" disabled={busy || !allFilled} onClick={share}>{busy ? "올리는 중…" : "공유"}</button>}
      </header>

      {/* ---------- 1. 사진 선택 ---------- */}
      {step === 1 && (
        <div className="composer-body">
          <div className="composer-preview">
            {selected.length ? (
              <div className="preview-img" style={{ backgroundImage: `url(${selected[selected.length - 1]})` }}>
                {selected.length > 1 && <span className="reel-count" style={{ top: 10, right: 10 }}>{selected.length}장</span>}
              </div>
            ) : (
              <div className="preview-empty">
                <span>아래에서 사진을 골라요</span>
                <small>여러 장 고르면 가로로 넘겨 보는 글이 돼요 (최대 {FEED_MAX_PAGES}장)</small>
              </div>
            )}
          </div>
          <div className="composer-tools">
            <span className="tiny muted">최근 · 기본 그림</span>
            <button className="text-btn" onClick={() => goEdit(true)}>사진 없이 글만</button>
          </div>
          <div className="pick-grid">
            {canUpload && (
              <label className={`pick-tile add ${uploading ? "busy" : ""}`}>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={Boolean(uploading)} onChange={(e) => onPickFiles(e.target.files)} />
                <IconPlus />
                <span>{uploading ?? "내 사진"}</span>
              </label>
            )}
            {tiles.map((src) => {
              const n = selected.indexOf(src);
              return (
                <button key={src} type="button" className={`pick-tile ${n >= 0 ? "on" : ""}`} style={{ backgroundImage: `url(${src})` }} onClick={() => toggle(src)} aria-pressed={n >= 0} aria-label={FEED_IMAGES.find((i) => i.src === src)?.label ?? "사진"}>
                  <span className="order">{n >= 0 ? n + 1 : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="inline-input" style={{ padding: "10px 14px 16px" }}>
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder={canUpload ? "이미지 주소로 추가 (https://…)" : "이미지 주소로 추가 · S3 설정 시 내 사진 업로드 가능"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} />
            <button type="button" className="btn sm soft" onClick={addUrl} disabled={!urlInput.trim() || selected.length >= FEED_MAX_PAGES}>추가</button>
          </div>
          {error && <p className="tiny" style={{ color: "var(--down)", margin: "0 14px 12px" }}>{error}</p>}
        </div>
      )}

      {/* ---------- 2. 편집: 슬라이드마다 글 ---------- */}
      {step === 2 && d && (
        <div className="composer-body">
          <div className="composer-slides-wrap">
            <div className="composer-slides" ref={slidesRef} onScroll={onSlidesScroll}>
              {drafts.map((x, i) => (
                <div key={i} className={`cslide bg-${bg} ${x.image ? "has-img" : ""}`} style={x.image ? { backgroundImage: `url(${x.image})` } : undefined}>
                  <div className="cslide-body">
                    {x.title && <div className="reel-title">{x.title}</div>}
                    <p className="reel-text">{x.text || (i === cur ? "아래에 글을 적어요" : "")}</p>
                  </div>
                </div>
              ))}
            </div>
            {drafts.length > 1 && (
              <>
                <div className="reel-dots" style={{ top: 10 }}>{drafts.map((_, i) => <i key={i} className={i === cur ? "on" : ""} />)}</div>
                <div className="reel-count" style={{ top: 10, right: 10 }}>{cur + 1}/{drafts.length}</div>
                <button type="button" className="cnav prev" aria-label="이전 슬라이드" onClick={() => scrollTo(Math.max(0, cur - 1))} disabled={cur === 0}>‹</button>
                <button type="button" className="cnav next" aria-label="다음 슬라이드" onClick={() => scrollTo(Math.min(drafts.length - 1, cur + 1))} disabled={cur >= drafts.length - 1}>›</button>
              </>
            )}
          </div>
          <div className="composer-form">
            {drafts.length > 1 && (
              <div className="page-tabs">
                {drafts.map((x, i) => (
                  <button key={i} type="button" className={`page-tab ${i === cur ? "on" : ""} ${x.text.trim() ? "" : "empty"}`} style={x.image ? { backgroundImage: `url(${x.image})` } : undefined} onClick={() => scrollTo(i)} aria-label={`${i + 1}번째`}>
                    <span>{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="field">
              <label>제목 (선택)</label>
              <input value={d.title} onChange={(e) => update({ title: e.target.value })} maxLength={24} placeholder="예: 떨어진 날에게" />
            </div>
            <div className="field">
              <label>{drafts.length > 1 ? `${cur + 1}번째 글` : "글"}</label>
              <textarea value={d.text} onChange={(e) => update({ text: e.target.value })} maxLength={280} placeholder={"줄바꿈으로 호흡을 나눠요.\n\n예)\n떨어진 날은\n내가 모자란 날이 아니라\n거기까지 걸어간 날이에요."} style={{ minHeight: 110 }} autoFocus />
              <span className="tiny muted" style={{ textAlign: "right" }}>{d.text.length}/280</span>
            </div>
            {hasCrisisSignal(d.text) && <HelpBanner alert />}
            {!allFilled && drafts.length > 1 && <p className="tiny muted" style={{ margin: 0 }}>모든 슬라이드에 글을 적어야 다음으로 갈 수 있어요.</p>}
          </div>
        </div>
      )}

      {/* ---------- 3. 공유 ---------- */}
      {step === 3 && (
        <div className="composer-body">
          <div className="composer-form" style={{ paddingTop: 16 }}>
            <div className="share-summary">
              <div className={`share-thumb bg-${bg} ${drafts[0]?.image ? "has-img" : ""}`} style={drafts[0]?.image ? { backgroundImage: `url(${drafts[0].image})` } : undefined}>
                {drafts.length > 1 && <span className="reel-count" style={{ top: 6, right: 6 }}>{drafts.length}</span>}
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                {drafts[0]?.title && <b style={{ display: "block", fontSize: 13 }}>{drafts[0].title}</b>}
                <p className="share-caption">{drafts[0]?.text}</p>
                <small className="muted">{textOnly ? "글만" : `사진 ${drafts.filter((x) => x.image).length}장`} · 콘텐츠 {drafts.length}개</small>
              </div>
            </div>
            {drafts.length > 1 && (
              <div className="thumbs">
                {drafts.map((x, i) => (
                  <div key={i} className={`thumb bg-${bg}`} style={x.image ? { backgroundImage: `url(${x.image})` } : undefined}>
                    <span className="no">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
            {needsBg && (
              <div className="field">
                <label>배경 (사진이 없는 슬라이드)</label>
                <div className="swatches">
                  {Array.from({ length: FEED_BG_COUNT }, (_, i) => (
                    <button key={i} type="button" className={`swatch bg-${i} ${bg === i ? "on" : ""}`} onClick={() => setBg(i)} aria-label={FEED_BG_LABELS[i]} title={FEED_BG_LABELS[i]}>
                      <span>{FEED_BG_LABELS[i]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {firstTime && (
              <div className="field">
                <label>크리에이터 소개 (선택)</label>
                <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={80} placeholder="어떤 사람에게 어떤 글을 쓰는지 한 줄" />
                <span className="tiny muted">첫 글을 올리면 크리에이터가 돼요.</span>
              </div>
            )}
            <div className="notice">위로 피드에 올라가요. 좋아요 대신 힘내요를 받고, 위로가 아닌 글은 신고될 수 있어요.</div>
            {error && <p className="tiny" style={{ color: "var(--down)", margin: 0 }}>{error}</p>}
            <button className="btn block" disabled={busy || !allFilled} onClick={share}>{busy ? "올리는 중…" : "공유"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
