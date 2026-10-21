"use client";

import { useEffect, useRef, useState } from "react";
import { Hero } from "@/components/ui";
import { EMPTY_SITE, SITE, SiteSettings, faviconHref, normalizeSite, ogHref } from "@/lib/site";
import { imageToDataUrl } from "@/lib/siteImage";

const TITLE_MAX = 60;
const DESC_MAX = 160;

async function getSite(): Promise<SiteSettings> {
  const r = await fetch("/api/site", { cache: "no-store" });
  return normalizeSite((await r.json()) as Partial<SiteSettings>);
}

async function putSite(body: Record<string, unknown>): Promise<SiteSettings> {
  const r = await fetch("/api/site", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as Partial<SiteSettings> & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `저장하지 못했어요 (${r.status})`);
  return normalizeSite(j);
}

/** 관리자 › 사이트: 제목·설명·파비콘·공유 이미지. 검색 결과·링크 미리보기·홈 화면 아이콘에 쓰인다 */
export default function SiteAdmin() {
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const faviconInput = useRef<HTMLInputElement>(null);
  const ogInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSite()
      .then((s) => { setSite(s); setTitle(s.title ?? ""); setDesc(s.description ?? ""); })
      .catch(() => setSite(EMPTY_SITE));
  }, []);

  if (!site) return null;

  const apply = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    try {
      const s = await putSite(body);
      setSite(s);
      setTitle(s.title ?? "");
      setDesc(s.description ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(null);
    }
  };

  const pickImage = async (kind: "favicon" | "og", file: File | undefined) => {
    if (!file) return;
    setBusy(kind);
    setError(null);
    try {
      // 파비콘은 256×256 PNG(투명 유지), 공유 이미지는 1200×630 JPEG 로 줄여서 보낸다
      const dataUrl = kind === "favicon" ? await imageToDataUrl(file, 256, 256, "image/png") : await imageToDataUrl(file, 1200, 630, "image/jpeg", 0.86);
      await apply(kind, { [kind]: dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지를 올리지 못했어요");
      setBusy(null);
    }
  };

  const textDirty = title !== (site.title ?? "") || desc !== (site.description ?? "");
  const customized = [site.title, site.description, site.faviconAt, site.ogAt].filter(Boolean).length;

  return (
    <>
      <Hero
        label="사이트 설정"
        title={customized ? `${customized}개를 직접 정했어요` : "기본 설정을 쓰고 있어요"}
        sub="검색 결과·카카오톡 링크 미리보기·홈 화면 아이콘에 쓰여요. 바꾼 뒤 1분 안에 반영돼요."
        stats={[`주소 ${SITE.url.replace(/^https?:\/\//, "")}`]}
      />

      <div className="section-title"><span>제목 · 설명</span>{saved && <span className="tiny muted">저장됨</span>}</div>
      <section className="card stack" style={{ gap: 12 }}>
        <div className="field">
          <label>사이트 제목 <span className="tiny muted" style={{ fontWeight: 500 }}>{title.length}/{TITLE_MAX}</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} placeholder={SITE.fullName} />
        </div>
        <div className="field">
          <label>사이트 설명 <span className="tiny muted" style={{ fontWeight: 500 }}>{desc.length}/{DESC_MAX}</span></label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, DESC_MAX))} placeholder={SITE.description} rows={3} />
          <span className="tiny muted">검색 결과 아래 줄과 링크 미리보기에 보여요. 비우면 기본 문구 “{SITE.description}”</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" disabled={!textDirty || busy !== null} onClick={() => apply("text", { title, description: desc })}>{busy === "text" ? "저장 중…" : "저장"}</button>
          <button className="btn ghost sm" disabled={busy !== null || (!site.title && !site.description && !textDirty)} onClick={() => apply("text", { title: null, description: null })}>기본값으로</button>
        </div>
      </section>

      <div className="section-title"><span>파비콘</span><span className="tiny muted">브라우저 탭 · 홈 화면 아이콘</span></div>
      <section className="card">
        <div className="row" style={{ gap: 14, alignItems: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={faviconHref(site)} alt="현재 파비콘" width={40} height={40} style={{ width: 40, height: 40, objectFit: "contain" }} />
          </span>
          <span className="grow">
            <b style={{ fontSize: 14.5 }}>{site.faviconAt ? "직접 올린 파비콘" : "기본 파비콘"}</b>
            <div className="tiny muted">정사각형 이미지를 올리면 256×256 PNG 로 맞춰요. PNG·JPEG·WebP·SVG, 가운데를 기준으로 잘라요.</div>
          </span>
        </div>
        <input ref={faviconInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { pickImage("favicon", e.target.files?.[0]); e.target.value = ""; }} />
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <button className="btn sm" disabled={busy !== null} onClick={() => faviconInput.current?.click()}>{busy === "favicon" ? "올리는 중…" : "이미지 선택"}</button>
          <button className="btn ghost sm" disabled={busy !== null || !site.faviconAt} onClick={() => apply("favicon", { favicon: null })}>기본으로</button>
        </div>
      </section>

      <div className="section-title"><span>공유 이미지</span><span className="tiny muted">링크 미리보기 (1200×630)</span></div>
      <section className="card">
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", aspectRatio: "1200 / 630", background: "var(--surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ogHref(site)} alt="현재 공유 이미지" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>{site.ogAt ? "직접 올린 이미지예요." : "기본 이미지는 제목과 한 줄 소개를 그려서 보여줘요."} 가로로 긴 사진을 올리면 1200×630 으로 잘라요.</div>
        <input ref={ogInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickImage("og", e.target.files?.[0]); e.target.value = ""; }} />
        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <button className="btn sm" disabled={busy !== null} onClick={() => ogInput.current?.click()}>{busy === "og" ? "올리는 중…" : "이미지 선택"}</button>
          <button className="btn ghost sm" disabled={busy !== null || !site.ogAt} onClick={() => apply("og", { og: null })}>기본으로</button>
        </div>
      </section>

      {error && <p className="tiny" style={{ color: "var(--down)", margin: "10px 4px 0" }}>{error}</p>}
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>설정은 서버 DB(site_settings)에 저장돼 모든 방문자에게 적용돼요. robots.txt·sitemap.xml·manifest 는 자동으로 만들어져요.</p>
    </>
  );
}
