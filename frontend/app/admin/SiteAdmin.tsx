"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hero, LoadError, SkeletonScreen } from "@/components/ui";
import { toastSuccess } from "@/lib/toast";
import { SITE, SiteSettings, faviconHref, normalizeSite, ogHref } from "@/lib/site";
import { imageToDataUrl } from "@/lib/siteImage";

const TITLE_MAX = 60;
const DESC_MAX = 160;
type ImageKind = "favicon" | "og";
type ImageDraft = { dataUrl: string; name: string };

async function getSite(): Promise<SiteSettings> {
  const r = await fetch("/api/site", { cache: "no-store" });
  if (!r.ok) throw new Error("서비스 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  return normalizeSite((await r.json()) as Partial<SiteSettings>);
}

async function putSite(body: Record<string, unknown>): Promise<SiteSettings> {
  const r = await fetch("/api/site", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as Partial<SiteSettings> & { error?: string };
  if (!r.ok) throw new Error("변경 사항을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return normalizeSite(j);
}

/** 관리자 › 사이트: 제목·설명·파비콘·공유 이미지. 검색 결과·링크 미리보기·홈 화면 아이콘에 쓰인다 */
export default function SiteAdmin() {
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<Partial<Record<ImageKind, ImageDraft>>>({});
  const busyRef = useRef(false);
  const faviconInput = useRef<HTMLInputElement>(null);
  const ogInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await getSite();
      setSite(current);
      setTitle(current.title ?? "");
      setDesc(current.description ?? "");
    } catch {
      setError("서비스 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!site) return error ? <LoadError message={error} onRetry={() => void load()} /> : <SkeletonScreen count={2} lines={3} label="서비스 정보를 확인하고 있어요" />;

  const apply = async (label: string, body: Record<string, unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError(null);
    try {
      const s = await putSite(body);
      setSite(s);
      if (label === "text") { setTitle(s.title ?? ""); setDesc(s.description ?? ""); }
      else setImages((current) => { const next = { ...current }; delete next[label as ImageKind]; return next; });
      toastSuccess(label === "favicon" ? "소로우 아이콘을 저장했어요." : label === "og" ? "공유 사진을 저장했어요." : "제목과 소개를 저장했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const pickImage = async (kind: ImageKind, file: File | undefined) => {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    try {
      // 파비콘은 256×256 PNG(투명 유지), 공유 이미지는 1200×630 JPEG 로 줄여서 보낸다
      const dataUrl = kind === "favicon" ? await imageToDataUrl(file, 256, 256, "image/png") : await imageToDataUrl(file, 1200, 630, "image/jpeg", 0.86);
      setImages((current) => ({ ...current, [kind]: { dataUrl, name: file.name } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지를 올리지 못했어요");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const textDirty = title !== (site.title ?? "") || desc !== (site.description ?? "");
  const customized = [site.title, site.description, site.faviconAt, site.ogAt].filter(Boolean).length;

  return (
    <>
      <Hero
        label="서비스 소개"
        title={customized ? "소로우의 모습을 다듬어요" : "소로우를 소개해 주세요"}
        sub="제목과 사진은 검색 결과, 공유한 링크와 홈 화면에 표시돼요. 저장한 내용은 잠시 후 반영돼요."
        stats={[`주소 ${SITE.url.replace(/^https?:\/\//, "")}`]}
      />

      <div className="section-title"><span>이름과 소개</span></div>
      <section className="card stack" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="site-title">서비스 이름 <span className="tiny muted" style={{ fontWeight: 500 }}>{title.length}/{TITLE_MAX}</span></label>
          <input id="site-title" value={title} disabled={busy !== null} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} placeholder={SITE.fullName} />
        </div>
        <div className="field">
          <label htmlFor="site-description">한 줄 소개 <span className="tiny muted" style={{ fontWeight: 500 }}>{desc.length}/{DESC_MAX}</span></label>
          <textarea id="site-description" value={desc} disabled={busy !== null} onChange={(e) => setDesc(e.target.value.slice(0, DESC_MAX))} placeholder={SITE.description} rows={3} />
          <span className="tiny muted">검색 결과 아래 줄과 링크 미리보기에 보여요. 비우면 기본 문구 “{SITE.description}”</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`btn sm ${textDirty ? "" : "ghost"}`} disabled={!textDirty || busy !== null} aria-busy={busy === "text"} onClick={() => apply("text", { title, description: desc })}>{busy === "text" ? "저장 중…" : "저장"}</button>
          <button type="button" className="text-btn muted" disabled={busy !== null || (!site.title && !site.description && !textDirty)} onClick={() => apply("text", { title: null, description: null })}>기본 소개로</button>
        </div>
      </section>

      <div className="section-title"><span>소로우 아이콘</span><span className="tiny muted">탭과 홈 화면에 표시해요</span></div>
      <section className="card">
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.favicon?.dataUrl ?? faviconHref(site)} alt="소로우 아이콘 미리보기" width={40} height={40} style={{ width: 40, height: 40, objectFit: "contain" }} />
          </span>
          <span className="grow">
            <b style={{ fontSize: 14.5 }}>{images.favicon ? "새 아이콘 미리보기" : site.faviconAt ? "직접 선택한 아이콘" : "기본 소로우 아이콘"}</b>
            <div className="tiny muted">정사각형 사진을 추천해요. 가운데에 맞춰 표시돼요.</div>
          </span>
        </div>
        <input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { pickImage("favicon", e.target.files?.[0]); e.target.value = ""; }} />
        {images.favicon && <p className="tiny muted" style={{ overflowWrap: "anywhere", marginTop: 10 }}>선택한 사진 · {images.favicon.name}</p>}
        <div className="row" style={{ marginTop: 12, gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn sm ghost" disabled={busy !== null} onClick={() => faviconInput.current?.click()}>{busy === "favicon" ? "준비하는 중…" : images.favicon || site.faviconAt ? "사진 바꾸기" : "기기에서 사진 선택"}</button>
          {images.favicon && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => apply("favicon", { favicon: images.favicon!.dataUrl })}>이 아이콘 저장</button>}
          {images.favicon ? <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => setImages((current) => ({ ...current, favicon: undefined }))}>선택 취소</button> : <button type="button" className="btn ghost sm" disabled={busy !== null || !site.faviconAt} onClick={() => apply("favicon", { favicon: null })}>삭제하고 기본 아이콘 사용</button>}
        </div>
      </section>

      <div className="section-title"><span>공유 사진</span><span className="tiny muted">링크를 공유하면 함께 보여요</span></div>
      <section className="card">
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "1200 / 630", background: "var(--surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images.og?.dataUrl ?? ogHref(site)} alt="공유 사진 미리보기" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>{images.og ? "선택한 사진을 저장하기 전에 확인해 주세요." : site.ogAt ? "직접 선택한 사진이에요." : "기본 사진에는 서비스 이름과 소개가 표시돼요."} 가로로 긴 사진을 추천해요.</div>
        <input ref={ogInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickImage("og", e.target.files?.[0]); e.target.value = ""; }} />
        {images.og && <p className="tiny muted" style={{ overflowWrap: "anywhere", marginTop: 10 }}>선택한 사진 · {images.og.name}</p>}
        <div className="row" style={{ marginTop: 12, gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="btn sm ghost" disabled={busy !== null} onClick={() => ogInput.current?.click()}>{busy === "og" ? "준비하는 중…" : images.og || site.ogAt ? "사진 바꾸기" : "기기에서 사진 선택"}</button>
          {images.og && <button type="button" className="btn sm" disabled={busy !== null} onClick={() => apply("og", { og: images.og!.dataUrl })}>이 사진 저장</button>}
          {images.og ? <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => setImages((current) => ({ ...current, og: undefined }))}>선택 취소</button> : <button type="button" className="btn ghost sm" disabled={busy !== null || !site.ogAt} onClick={() => apply("og", { og: null })}>삭제하고 기본 사진 사용</button>}
        </div>
      </section>

      {error && <p className="notice warn" role="alert">{error}</p>}
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>저장한 소개와 사진은 소로우를 방문하는 모든 분께 보여요.</p>
    </>
  );
}
