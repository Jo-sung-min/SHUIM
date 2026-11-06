"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hero, LoadError, Segmented, Sheet, SkeletonScreen } from "@/components/ui";
import { IconImage, IconPlus, IconSparkle } from "@/components/Icons";
import { toastSuccess } from "@/lib/toast";
import { bannerImageHref, fmtSponsorWon, sponsorInquiryMailto, sponsorLogoHref, type SponsorContact, WON_PER_FIREWORK } from "@/lib/sponsors";
import {
  AMOUNT_MAX_WON, AdminBanner, AdminBannerInput, AdminSponsor, AdminSponsorInput, BANNER_STATUS_LABELS, DAY_MS, NOTE_MAX, TAGLINE_MAX, TITLE_MAX,
  addAdminContribution, createAdminBanner, createAdminSponsor, deleteAdminBanner, deleteAdminSponsor, fetchAdminBanners, fetchAdminSponsors,
  fetchSponsorSettings, fireworksFor, fmtAdminDate, fromLocalInput, prepareSponsorImage, saveSponsorSettings, toLocalInput,
  updateAdminBanner, updateAdminSponsor, validateAmount, validateBanner, validateSponsor,
} from "@/lib/admin-sponsors";
import styles from "./SponsorAdmin.module.css";

type View = "banners" | "sponsors" | "settings";
type ImageDraft = { dataUrl: string; name: string } | null | undefined; // undefined = 유지, null = 삭제

const initial = (name: string) => (name.trim().charAt(0) || "·").toUpperCase();
const message = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

/** 관리자 › 후원: PC 양옆 배너, 후원 기업(멋져요 → 폭죽 이용권), "+" 카드 안내 설정 */
export default function SponsorAdmin() {
  const [view, setView] = useState<View>("banners");
  return <section aria-label="기업 후원 관리">
    <div className={styles.inner}><Segmented value={view} onChange={setView} options={[{ value: "banners", label: "배너" }, { value: "sponsors", label: "후원 기업" }, { value: "settings", label: "안내 설정" }]} /></div>
    {view === "banners" && <BannerAdmin />}
    {view === "sponsors" && <SponsorsAdmin />}
    {view === "settings" && <SettingsAdmin />}
  </section>;
}

/* ================= 공용: 이미지 선택 ================= */

function ImageField({ id, label, hint, current, draft, busy, onDraft }: {
  id: string; label: string; hint: string; current: string | null; draft: ImageDraft; busy: boolean; onDraft: (next: ImageDraft) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = draft === undefined ? current : draft ? draft.dataUrl : null;
  const pick = async (file: File | undefined) => {
    if (!file || preparing) return;
    setPreparing(true); setError(null);
    try { onDraft({ dataUrl: await prepareSponsorImage(file), name: file.name }); }
    catch (cause) { setError(message(cause, "이미지를 준비하지 못했어요. 다른 사진을 선택해 주세요.")); }
    finally { setPreparing(false); }
  };
  const disabled = busy || preparing;
  return <div className={styles.imageField}>
    <span className="tiny" style={{ fontWeight: 700, color: "var(--text-2)" }}>{label}</span>
    <div className={styles.imageRow}>
      <span className={`${styles.thumb} ${styles.thumbLg}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown ? <img src={shown} alt="" /> : <IconImage />}
      </span>
      <span className={styles.grow}>
        <b style={{ fontSize: 14 }}>{draft ? "새 이미지 미리보기" : draft === null ? "이미지를 지워요" : current ? "지금 쓰는 이미지" : "이미지 없음"}</b>
        <p className={styles.hint}>{draft ? draft.name : hint}</p>
      </span>
    </div>
    <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
    <div className={styles.imageButtons}>
      <button type="button" className="btn ghost sm" disabled={disabled} aria-busy={preparing} onClick={() => input.current?.click()}>{preparing ? "준비하는 중…" : shown ? "다른 사진 선택" : "기기에서 사진 선택"}</button>
      {draft !== undefined && <button type="button" className="text-btn muted" disabled={disabled} onClick={() => onDraft(undefined)}>되돌리기</button>}
      {draft === undefined && current && <button type="button" className="text-btn muted" disabled={disabled} onClick={() => onDraft(null)}>이미지 지우기</button>}
    </div>
    {error && <p className="notice warn" role="alert">{error}</p>}
  </div>;
}

/* ================= 배너 ================= */

function BannerAdmin() {
  const [banners, setBanners] = useState<AdminBanner[] | null>(null);
  const [sponsors, setSponsors] = useState<AdminSponsor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBanner | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, companies] = await Promise.all([fetchAdminBanners(), fetchAdminSponsors().catch(() => [] as AdminSponsor[])]);
      if (!mounted.current) return;
      setBanners(list); setSponsors(companies);
    } catch (cause) { if (mounted.current) setError(message(cause, "배너를 불러오지 못했어요.")); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const act = async (label: string, operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await operation(); if (mounted.current) toastSuccess(label); }
    catch (cause) { if (mounted.current) setError(message(cause, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.")); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (input: AdminBannerInput) => act(editing === "new" ? "배너를 등록했어요." : "배너를 저장했어요.", async () => {
    const saved = editing === "new" ? await createAdminBanner(input) : await updateAdminBanner((editing as AdminBanner).id, input);
    if (!mounted.current) return;
    setBanners((current) => {
      const list = current ?? [];
      const next = list.some((item) => item.id === saved.id) ? list.map((item) => item.id === saved.id ? saved : item) : [...list, saved];
      return next.sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
    });
    setEditing(null);
  });
  const remove = (banner: AdminBanner) => act("배너를 삭제했어요.", async () => {
    await deleteAdminBanner(banner.id);
    if (!mounted.current) return;
    setBanners((current) => (current ?? []).filter((item) => item.id !== banner.id));
    setDeleting(null);
  });

  if (!banners) return error ? <LoadError message={error} onRetry={() => void load()} /> : <SkeletonScreen count={2} lines={3} label="배너를 확인하고 있어요" />;
  const live = banners.filter((banner) => banner.status === "live").length;
  return <>
    <Hero label="홍보 배너" title={live ? `지금 ${live}개의 배너가 보여요` : "아직 보이는 배너가 없어요"} sub="PC 화면에서 메인 양옆에 글라스 카드로 보여요. 한쪽에 4칸씩, 노출 순서가 작을수록 위에 와요. 빈 칸에는 '+' 안내 카드가 보여요." stats={[`전체 ${banners.length}개`, `게시 중 ${live}개`]} />
    <div className={styles.toolbar}>
      <span className="tiny muted">홀수 순서는 왼쪽, 짝수 순서는 오른쪽 열이에요.</span>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="text-btn muted" disabled={busy} onClick={() => void load()}>새로고침</button>
        <button type="button" className="btn sm" disabled={busy || editing !== null} onClick={() => setEditing("new")}><IconPlus />새 배너</button>
      </div>
    </div>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {editing === "new" && <BannerForm key="new" sponsors={sponsors} nextPosition={banners.length + 1} busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => void submit(input)} />}
    {banners.length === 0 && editing !== "new" ? <p className={`card ${styles.empty}`}>등록한 배너가 없어요. 새 배너로 기업 홍보 카드를 만들어 보세요.</p> : <div className="stack" style={{ marginTop: 8 }}>
      {banners.map((banner) => editing !== "new" && editing?.id === banner.id
        ? <BannerForm key={banner.id} banner={banner} sponsors={sponsors} nextPosition={banner.position} busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => void submit(input)} />
        : <BannerCard key={banner.id} banner={banner} sponsorName={sponsors.find((sponsor) => sponsor.id === banner.sponsorId)?.name ?? null} busy={busy || editing !== null}
          onEdit={() => setEditing(banner)} onDelete={() => setDeleting(banner)} />)}
    </div>}
    <Sheet open={deleting !== null} onClose={() => { if (!lock.current) setDeleting(null); }} title={deleting ? `'${deleting.title}' 배너를 삭제할까요?` : "배너 삭제"}>
      <p className="sheet-text">메인 양옆에서 바로 사라지고 되돌릴 수 없어요. 잠시 숨기려면 삭제 대신 게시를 꺼 주세요.</p>
      <div className="sheet-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => setDeleting(null)}>취소</button>
        <button type="button" className="btn danger" disabled={busy} aria-busy={busy} onClick={() => { if (deleting) void remove(deleting); }}>{busy ? "삭제 중…" : "삭제하기"}</button>
      </div>
    </Sheet>
  </>;
}

function BannerCard({ banner, sponsorName, busy, onEdit, onDelete }: { banner: AdminBanner; sponsorName: string | null; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  const image = bannerImageHref(banner);
  return <article className={`card ${styles.item}`} aria-label={`${banner.title} 배너`}>
    <div className={styles.head}>
      <span className={styles.thumb} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="" /> : initial(banner.title)}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <h3 className={styles.title}>{banner.title}</h3>
        {banner.tagline && <p className={styles.tagline}>{banner.tagline}</p>}
        <a className={styles.link} href={banner.linkUrl} target="_blank" rel="noopener noreferrer">{banner.linkUrl}</a>
      </span>
      <span className={styles.badges}><span className={`badge ${styles[banner.status]}`}>{BANNER_STATUS_LABELS[banner.status]}</span></span>
    </div>
    <dl className={styles.details}>
      <dt>게시 기간</dt><dd>{fmtAdminDate(banner.startsAt)} ~ {fmtAdminDate(banner.endsAt)}</dd>
      <dt>노출 순서</dt><dd>{banner.position} · {banner.position % 2 === 1 ? "왼쪽" : "오른쪽"} 열</dd>
      <dt>클릭</dt><dd>{banner.clicks.toLocaleString("ko-KR")}회 <span className="tiny muted">(참고용)</span></dd>
      {sponsorName && <><dt>연결 기업</dt><dd>{sponsorName}</dd></>}
    </dl>
    <div className={styles.actions}>
      <span className="tiny muted">{banner.published ? "게시 켬" : "게시 끔"}</span>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={onEdit}>수정</button>
      <button type="button" className="btn ghost danger sm" disabled={busy} onClick={onDelete}>삭제</button>
    </div>
  </article>;
}

function BannerForm({ banner, sponsors, nextPosition, busy, onCancel, onSubmit }: {
  banner?: AdminBanner; sponsors: AdminSponsor[]; nextPosition: number; busy: boolean; onCancel: () => void; onSubmit: (input: AdminBannerInput) => void;
}) {
  const now = Date.now();
  const [title, setTitle] = useState(banner?.title ?? "");
  const [tagline, setTagline] = useState(banner?.tagline ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
  const [position, setPosition] = useState(String(banner?.position ?? nextPosition));
  const [startsAt, setStartsAt] = useState(toLocalInput(banner?.startsAt ?? now));
  const [endsAt, setEndsAt] = useState(toLocalInput(banner?.endsAt ?? now + 30 * DAY_MS));
  const [published, setPublished] = useState(banner?.published ?? true);
  const [sponsorId, setSponsorId] = useState(banner?.sponsorId ?? "");
  const [image, setImage] = useState<ImageDraft>(undefined);
  const [error, setError] = useState<string | null>(null);
  const prefix = banner ? `banner-${banner.id}` : "banner-new";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const starts = fromLocalInput(startsAt), ends = fromLocalInput(endsAt);
    const input: AdminBannerInput = {
      title: title.trim(), tagline: tagline.trim(), linkUrl: linkUrl.trim(), position: Number(position),
      startsAt: starts ?? -1, endsAt: ends ?? -1, published, sponsorId: sponsorId || null,
      ...(image === undefined ? {} : { image: image ? image.dataUrl : null }),
    };
    const problem = validateBanner(input);
    if (problem) { setError(problem); return; }
    setError(null);
    onSubmit(input);
  };
  return <form className={`card ${styles.form}`} onSubmit={submit} aria-label={banner ? `${banner.title} 배너 수정` : "새 배너"}>
    <fieldset disabled={busy}>
      <legend>{banner ? "배너 수정" : "새 배너"}</legend>
      <div className="field"><label htmlFor={`${prefix}-title`}>제목 (기업명) <span className="tiny muted" style={{ fontWeight: 500 }}>{title.length}/{TITLE_MAX}</span></label>
        <input id={`${prefix}-title`} value={title} maxLength={TITLE_MAX} placeholder="예: 소로우 커피" onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${prefix}-tagline`}>한 줄 소개 <span className="tiny muted" style={{ fontWeight: 500 }}>{tagline.length}/{TAGLINE_MAX}</span></label>
        <input id={`${prefix}-tagline`} value={tagline} maxLength={TAGLINE_MAX} placeholder="카드에 두 줄까지 보여요" onChange={(event) => setTagline(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${prefix}-link`}>링크</label>
        <input id={`${prefix}-link`} type="url" inputMode="url" value={linkUrl} placeholder="https://" onChange={(event) => setLinkUrl(event.target.value)} /></div>
      <ImageField id={`${prefix}-image`} label="이미지 · 로고" hint="정사각형 사진을 추천해요. 384×384 로 줄여 저장해요." current={banner ? bannerImageHref(banner) : null} draft={image} busy={busy} onDraft={setImage} />
      <div className={styles.row}>
        <div className="field"><label htmlFor={`${prefix}-starts`}>게시 시작</label><input id={`${prefix}-starts`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
        <div className="field"><label htmlFor={`${prefix}-ends`}>게시 종료</label><input id={`${prefix}-ends`} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div>
      </div>
      <div className={styles.row}>
        <div className="field"><label htmlFor={`${prefix}-position`}>노출 순서</label><input id={`${prefix}-position`} type="number" inputMode="numeric" step={1} value={position} onChange={(event) => setPosition(event.target.value)} /></div>
        <div className="field"><label htmlFor={`${prefix}-sponsor`}>연결 기업</label><select id={`${prefix}-sponsor`} value={sponsorId} onChange={(event) => setSponsorId(event.target.value)}>
          <option value="">없음</option>
          {sponsors.map((sponsor) => <option key={sponsor.id} value={sponsor.id}>{sponsor.name}</option>)}
        </select></div>
      </div>
      <label className={styles.check}><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />게시 (끄면 기간 안이어도 보이지 않아요)</label>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <div className={styles.actions}>
        <span className="tiny muted">30일 기준 한 칸이에요.</span>
        <button type="button" className="btn ghost sm" onClick={onCancel}>취소</button>
        <button type="submit" className="btn sm" aria-busy={busy}>{busy ? "저장 중…" : banner ? "저장" : "등록"}</button>
      </div>
    </fieldset>
  </form>;
}

/* ================= 후원 기업 ================= */

function SponsorsAdmin() {
  const [sponsors, setSponsors] = useState<AdminSponsor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminSponsor | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminSponsor | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try { const list = await fetchAdminSponsors(); if (mounted.current) setSponsors(list); }
    catch (cause) { if (mounted.current) setError(message(cause, "후원 기업을 불러오지 못했어요.")); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const replace = (saved: AdminSponsor) => setSponsors((current) => {
    const list = current ?? [];
    const next = list.some((item) => item.id === saved.id) ? list.map((item) => item.id === saved.id ? saved : item) : [...list, saved];
    return next.sort((a, b) => a.position - b.position || b.amountWon - a.amountWon || a.createdAt - b.createdAt);
  });
  const act = async (label: string, operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await operation(); if (mounted.current) toastSuccess(label); }
    catch (cause) { if (mounted.current) setError(message(cause, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.")); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (input: AdminSponsorInput & { amountWon?: number; note?: string }) => act(editing === "new" ? "후원 기업을 등록했어요." : "후원 기업을 저장했어요.", async () => {
    const saved = editing === "new" ? await createAdminSponsor(input) : await updateAdminSponsor((editing as AdminSponsor).id, input);
    if (!mounted.current) return;
    replace(saved); setEditing(null);
  });
  const contribute = (sponsor: AdminSponsor, amountWon: number, note: string) => act(`${sponsor.name}에 ${fmtSponsorWon(amountWon)} · 폭죽 ${fireworksFor(amountWon).toLocaleString("ko-KR")}개를 충전했어요.`, async () => {
    const saved = await addAdminContribution(sponsor.id, amountWon, note);
    if (mounted.current) replace(saved);
  });
  const remove = (sponsor: AdminSponsor) => act("후원 기업을 삭제했어요.", async () => {
    await deleteAdminSponsor(sponsor.id);
    if (!mounted.current) return;
    setSponsors((current) => (current ?? []).filter((item) => item.id !== sponsor.id));
    setDeleting(null);
  });

  if (!sponsors) return error ? <LoadError message={error} onRetry={() => void load()} /> : <SkeletonScreen count={2} lines={3} label="후원 기업을 확인하고 있어요" />;
  const total = sponsors.reduce((sum, sponsor) => sum + sponsor.amountWon, 0);
  const remaining = sponsors.reduce((sum, sponsor) => sum + sponsor.remaining, 0);
  return <>
    <Hero label="후원 기업" title={sponsors.length ? `${sponsors.length}곳이 폭죽을 나눠요` : "후원 기업을 등록해 주세요"} sub={`후원액 ${WON_PER_FIREWORK.toLocaleString("ko-KR")}원마다 폭죽 1개가 충전돼요. 회원이 멋져요를 누르면 그 기업의 폭죽 1개가 무료 이용권 1장이 돼요.`} stats={[`누적 후원 ${fmtSponsorWon(total)}`, `남은 폭죽 ${remaining.toLocaleString("ko-KR")}개`]} />
    <div className={styles.toolbar}>
      <span className="tiny muted">공개 순위는 누적 후원액, 같으면 멋져요 수로 정해져요.</span>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="text-btn muted" disabled={busy} onClick={() => void load()}>새로고침</button>
        <button type="button" className="btn sm" disabled={busy || editing !== null} onClick={() => setEditing("new")}><IconPlus />새 기업</button>
      </div>
    </div>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {editing === "new" && <SponsorForm key="new" nextPosition={sponsors.length + 1} busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => void submit(input)} />}
    {sponsors.length === 0 && editing !== "new" ? <p className={`card ${styles.empty}`}>등록한 후원 기업이 없어요. 새 기업으로 첫 후원을 기록해 보세요.</p> : <div className="stack" style={{ marginTop: 8 }}>
      {sponsors.map((sponsor) => editing !== "new" && editing?.id === sponsor.id
        ? <SponsorForm key={sponsor.id} sponsor={sponsor} nextPosition={sponsor.position} busy={busy} onCancel={() => setEditing(null)} onSubmit={(input) => void submit(input)} />
        : <SponsorCard key={sponsor.id} sponsor={sponsor} busy={busy || editing !== null} onEdit={() => setEditing(sponsor)} onDelete={() => setDeleting(sponsor)}
          onContribute={(amountWon, note) => void contribute(sponsor, amountWon, note)} />)}
    </div>}
    <Sheet open={deleting !== null} onClose={() => { if (!lock.current) setDeleting(null); }} title={deleting ? `'${deleting.name}'을 삭제할까요?` : "후원 기업 삭제"}>
      <p className="sheet-text">후원 내역과 멋져요 기록이 함께 사라지고 되돌릴 수 없어요. 이미 받은 이용권은 그대로 남아요. 잠시 가리려면 삭제 대신 공개를 꺼 주세요.</p>
      <div className="sheet-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => setDeleting(null)}>취소</button>
        <button type="button" className="btn danger" disabled={busy} aria-busy={busy} onClick={() => { if (deleting) void remove(deleting); }}>{busy ? "삭제 중…" : "삭제하기"}</button>
      </div>
    </Sheet>
  </>;
}

function SponsorCard({ sponsor, busy, onEdit, onDelete, onContribute }: {
  sponsor: AdminSponsor; busy: boolean; onEdit: () => void; onDelete: () => void; onContribute: (amountWon: number, note: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logo = sponsorLogoHref(sponsor);
  const won = Number(amount.replace(/[^0-9]/g, ""));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateAmount(won);
    if (problem) { setError(problem); return; }
    setError(null);
    onContribute(won, note);
    setAmount(""); setNote("");
  };
  return <article className={`card ${styles.item}`} aria-label={`${sponsor.name} 후원 기업`}>
    <div className={styles.head}>
      <span className={styles.thumb} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" /> : initial(sponsor.name)}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <h3 className={styles.title}>{sponsor.name}</h3>
        {sponsor.tagline && <p className={styles.tagline}>{sponsor.tagline}</p>}
        {sponsor.linkUrl && <a className={styles.link} href={sponsor.linkUrl} target="_blank" rel="noopener noreferrer">{sponsor.linkUrl}</a>}
      </span>
      <span className={styles.badges}><span className={`badge ${sponsor.published ? styles.live : styles.hidden}`}>{sponsor.published ? "공개" : "비공개"}</span></span>
    </div>
    <div className={styles.stats}>
      <div className={styles.stat}><b>{fmtSponsorWon(sponsor.amountWon)}</b><small>누적 후원</small></div>
      <div className={styles.stat}><b>{sponsor.remaining.toLocaleString("ko-KR")}<span className="tiny muted"> / {sponsor.fireworksTotal.toLocaleString("ko-KR")}</span></b><small>남은 폭죽 / 충전</small></div>
      <div className={styles.stat}><b>{sponsor.cheers.toLocaleString("ko-KR")}</b><small>멋져요</small></div>
    </div>
    <p className={styles.hint}>노출 순서 {sponsor.position} · 등록 {fmtAdminDate(sponsor.createdAt)}</p>
    <form className={styles.contribute} onSubmit={submit} aria-label={`${sponsor.name} 후원액 추가`}>
      <div className={styles.row}>
        <div className="field"><label htmlFor={`contribute-${sponsor.id}`}>후원액 추가 (원)</label>
          <input id={`contribute-${sponsor.id}`} inputMode="numeric" value={amount} placeholder="1000000" disabled={busy} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="field"><label htmlFor={`contribute-note-${sponsor.id}`}>메모</label>
          <input id={`contribute-note-${sponsor.id}`} value={note} maxLength={NOTE_MAX} placeholder="입금일·담당자 등" disabled={busy} onChange={(event) => setNote(event.target.value)} /></div>
      </div>
      <p className={styles.hint}>{won > 0 ? <>{fmtSponsorWon(won)} → <b>폭죽 {fireworksFor(won).toLocaleString("ko-KR")}개</b> 충전 (최대 {fmtSponsorWon(AMOUNT_MAX_WON)})</> : `${WON_PER_FIREWORK.toLocaleString("ko-KR")}원 = 폭죽 1개 · 100만원 = 1,000개`}</p>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className="btn sm" disabled={busy || won <= 0}><IconSparkle />충전하기</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={onEdit}>수정</button>
        <button type="button" className="btn ghost danger sm" disabled={busy} onClick={onDelete}>삭제</button>
      </div>
    </form>
    {sponsor.contributions.length > 0 && <details>
      <summary className={styles.summary}>입금 내역 {sponsor.contributions.length}건</summary>
      <ul className={styles.history}>
        {sponsor.contributions.map((item) => <li key={item.id}><span>{fmtAdminDate(item.createdAt)}</span><span><b>{fmtSponsorWon(item.amountWon)}</b> · 폭죽 {item.fireworks.toLocaleString("ko-KR")}개{item.note ? ` · ${item.note}` : ""}</span></li>)}
      </ul>
    </details>}
  </article>;
}

function SponsorForm({ sponsor, nextPosition, busy, onCancel, onSubmit }: {
  sponsor?: AdminSponsor; nextPosition: number; busy: boolean; onCancel: () => void; onSubmit: (input: AdminSponsorInput & { amountWon?: number; note?: string }) => void;
}) {
  const [name, setName] = useState(sponsor?.name ?? "");
  const [tagline, setTagline] = useState(sponsor?.tagline ?? "");
  const [linkUrl, setLinkUrl] = useState(sponsor?.linkUrl ?? "");
  const [position, setPosition] = useState(String(sponsor?.position ?? nextPosition));
  const [published, setPublished] = useState(sponsor?.published ?? true);
  const [logo, setLogo] = useState<ImageDraft>(undefined);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const prefix = sponsor ? `sponsor-${sponsor.id}` : "sponsor-new";
  const won = Number(amount.replace(/[^0-9]/g, ""));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: AdminSponsorInput = { name: name.trim(), tagline: tagline.trim(), linkUrl: linkUrl.trim() || null, published, position: Number(position),
      ...(logo === undefined ? {} : { logo: logo ? logo.dataUrl : null }) };
    const problem = validateSponsor(input) ?? (!sponsor && amount ? validateAmount(won) : null);
    if (problem) { setError(problem); return; }
    setError(null);
    onSubmit(sponsor || !amount ? input : { ...input, amountWon: won, note: note.trim() || undefined });
  };
  return <form className={`card ${styles.form}`} onSubmit={submit} aria-label={sponsor ? `${sponsor.name} 수정` : "새 후원 기업"}>
    <fieldset disabled={busy}>
      <legend>{sponsor ? "후원 기업 수정" : "새 후원 기업"}</legend>
      <div className="field"><label htmlFor={`${prefix}-name`}>기업명 <span className="tiny muted" style={{ fontWeight: 500 }}>{name.length}/{TITLE_MAX}</span></label>
        <input id={`${prefix}-name`} value={name} maxLength={TITLE_MAX} placeholder="예: 소로우 커피" onChange={(event) => setName(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${prefix}-tagline`}>한 줄 소개 <span className="tiny muted" style={{ fontWeight: 500 }}>{tagline.length}/{TAGLINE_MAX}</span></label>
        <input id={`${prefix}-tagline`} value={tagline} maxLength={TAGLINE_MAX} placeholder="후원 기업 목록에 보여요" onChange={(event) => setTagline(event.target.value)} /></div>
      <div className="field"><label htmlFor={`${prefix}-link`}>링크 <span className="tiny muted" style={{ fontWeight: 500 }}>선택</span></label>
        <input id={`${prefix}-link`} type="url" inputMode="url" value={linkUrl} placeholder="https://" onChange={(event) => setLinkUrl(event.target.value)} /></div>
      <ImageField id={`${prefix}-logo`} label="로고" hint="정사각형 로고를 추천해요. 384×384 로 줄여 저장해요." current={sponsor ? sponsorLogoHref(sponsor) : null} draft={logo} busy={busy} onDraft={setLogo} />
      <div className={styles.row}>
        <div className="field"><label htmlFor={`${prefix}-position`}>노출 순서</label><input id={`${prefix}-position`} type="number" inputMode="numeric" step={1} value={position} onChange={(event) => setPosition(event.target.value)} /></div>
        <label className={styles.check} style={{ alignSelf: "end" }}><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />공개</label>
      </div>
      {!sponsor && <>
        <div className={styles.row}>
          <div className="field"><label htmlFor={`${prefix}-amount`}>첫 후원액 (원) <span className="tiny muted" style={{ fontWeight: 500 }}>선택</span></label>
            <input id={`${prefix}-amount`} inputMode="numeric" value={amount} placeholder="1000000" onChange={(event) => setAmount(event.target.value)} /></div>
          <div className="field"><label htmlFor={`${prefix}-note`}>메모</label>
            <input id={`${prefix}-note`} value={note} maxLength={NOTE_MAX} placeholder="입금일·담당자 등" onChange={(event) => setNote(event.target.value)} /></div>
        </div>
        <p className={styles.hint}>{won > 0 ? <>{fmtSponsorWon(won)} → <b>폭죽 {fireworksFor(won).toLocaleString("ko-KR")}개</b> 충전</> : "후원액은 등록 뒤에도 카드에서 더할 수 있어요."}</p>
      </>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      <div className={styles.actions}>
        <span />
        <button type="button" className="btn ghost sm" onClick={onCancel}>취소</button>
        <button type="submit" className="btn sm" aria-busy={busy}>{busy ? "저장 중…" : sponsor ? "저장" : "등록"}</button>
      </div>
    </fieldset>
  </form>;
}

/* ================= 안내 설정 ================= */

function SettingsAdmin() {
  const [saved, setSaved] = useState<SponsorContact | null>(null);
  const [email, setEmail] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const contact = await fetchSponsorSettings();
      if (!mounted.current) return;
      setSaved(contact); setEmail(contact.email); setPrice(contact.priceLabel);
    } catch (cause) { if (mounted.current) setError(message(cause, "안내 설정을 불러오지 못했어요.")); }
  }, []);
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  if (!saved) return error ? <LoadError message={error} onRetry={() => void load()} /> : <SkeletonScreen count={1} lines={3} label="안내 설정을 확인하고 있어요" />;
  const dirty = email.trim() !== saved.email || price.trim() !== saved.priceLabel;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (!validEmail) { setError("문의 메일 주소 형식을 확인해 주세요."); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      const contact = await saveSponsorSettings(email, price);
      if (!mounted.current) return;
      setSaved(contact); setEmail(contact.email); setPrice(contact.priceLabel);
      toastSuccess("안내 설정을 저장했어요.");
    } catch (cause) { if (mounted.current) setError(message(cause, "저장하지 못했어요. 잠시 후 다시 시도해 주세요.")); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const preview: SponsorContact = { email: validEmail ? email.trim() : saved.email, priceLabel: price.trim() || "30일 30만원" };
  return <>
    <Hero label="안내 설정" title="빈 배너 칸의 '+' 안내를 다듬어요" sub="PC 메인 양옆의 빈 칸을 누르면 보이는 안내 문구와 문의 메일이에요. 후원 기업 페이지의 문의 버튼에도 같은 주소를 써요." />
    <form className={`card ${styles.form}`} onSubmit={save}>
      <fieldset disabled={busy}>
        <div className="field"><label htmlFor="sponsor-contact-email">문의 메일 주소</label>
          <input id="sponsor-contact-email" type="email" inputMode="email" value={email} placeholder="hello@sorow.co.kr" onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="field"><label htmlFor="sponsor-price-label">가격 문구</label>
          <input id="sponsor-price-label" value={price} maxLength={40} placeholder="30일 30만원" onChange={(event) => setPrice(event.target.value)} />
          <span className="tiny muted">비우면 기본 문구 “30일 30만원”을 써요.</span></div>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className={styles.actions}>
          <span />
          <button type="button" className="text-btn muted" disabled={!dirty} onClick={() => { setEmail(saved.email); setPrice(saved.priceLabel); setError(null); }}>되돌리기</button>
          <button type="submit" className={`btn sm ${dirty ? "" : "ghost"}`} disabled={!dirty} aria-busy={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </fieldset>
    </form>
    <div className="section-title" style={{ marginTop: 16 }}><span>‘+’ 카드 안내에 이렇게 보여요</span></div>
    <div className={styles.previewCard} aria-label="안내 미리보기">
      <b>기업 홍보 자리 안내</b>
      <span>메인 양옆 글라스 카드 한 칸, PC 화면 방문자에게 30일 동안 보여요.</span>
      <span><b>{preview.priceLabel}</b> · 로고·기업명·한 줄 소개·링크가 들어가요.</span>
      <a className={styles.link} href={sponsorInquiryMailto(preview)}>메일로 문의하기 → {preview.email}</a>
    </div>
  </>;
}
