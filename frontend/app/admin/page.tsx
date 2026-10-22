"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CommunityStore, FlaggedItem, REPORT_REASONS, REPORT_THRESHOLD, api, blockedUsers, fetchCommunity, listFlagged, shoutCatById } from "@/lib/community";
import { Empty, Hero, LoadError, Segmented, Sheet, SkeletonScreen, TopBar, fmtRelative } from "@/components/ui";
import { IconBubble, IconChevronL, IconFilm, IconLock, IconShield } from "@/components/Icons";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { Me, fetchMe } from "@/lib/auth";
import { DEFAULT_MODEL, DEFAULT_PROMPTS, MODEL_OPTIONS, PROMPT_MAX_LEN, PROMPT_META, PromptKey } from "@/lib/prompts";
import { PromptOverrides, loadPrompts, savePrompts } from "@/lib/storage";
import { run } from "@/components/CommunityUI";
import SiteAdmin from "./SiteAdmin";
import SafetyAdmin from "@/components/SafetyAdmin";

type View = "reports" | "prompts" | "site";
const VIEW_EYEBROW: Record<View, string> = { reports: "외침 · 신고된 글", prompts: "AI 답변 설정", site: "서비스 소개" };

export default function AdminPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("reports");
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const unblockLock = useRef(false);
  const unblock = async (id: string) => {
    if (unblockLock.current) return;
    unblockLock.current = true;
    setUnblocking(id);
    try { await run(setS, () => api.adminUnblock(id)); }
    finally { unblockLock.current = false; setUnblocking(null); }
  };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [st, m] = await Promise.all([fetchCommunity(true), fetchMe(true)]);
      setS(st);
      setMe(m);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (loadError) return <><TopBar title="관리자" /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!s || !me) return <><TopBar title="관리자" /><div className="screen"><SkeletonScreen count={2} lines={3} label="관리자 화면을 불러오고 있어요" /></div></>;

  if (!me.admin) {
    return (
      <>
        <TopBar title="관리자" right={<Link href="/shout" className="icon-btn" aria-label="외침으로"><IconChevronL /></Link>} />
        <div className="screen">
          <Empty icon={<IconLock />} title="관리자만 들어올 수 있어요" action={<Link href="/auth" className="btn ghost">{me.user ? "내 계정" : "로그인"}</Link>}>
            {me.user ? `${me.user.nick} 님은 일반 회원이에요.` : "관리자 계정으로 로그인해요."}
          </Empty>
        </div>
      </>
    );
  }

  const flagged = listFlagged(s);
  const blocked = blockedUsers(s);

  return (
    <>
      <TopBar title="관리자" eyebrow={VIEW_EYEBROW[view]} right={<Link href="/shout" className="icon-btn" aria-label="외침으로"><IconChevronL /></Link>} />
      <div className="screen">
        <Segmented value={view} onChange={setView} options={[{ value: "reports", label: `신고 검토${flagged.length ? ` ${flagged.length}` : ""}` }, { value: "prompts", label: "AI 답변" }, { value: "site", label: "서비스 소개" }]} />
        <div style={{ height: 12 }} />

        {view === "prompts" && <PromptAdmin />}
        {view === "site" && <SiteAdmin />}

        {view === "reports" && (
          <>
            <SafetyAdmin />
            <Hero label="관리자" title={flagged.length ? `검토할 글 ${flagged.length}개` : "검토할 글이 없어요"} stats={[`대기 ${flagged.length}`, `차단 유저 ${blocked.length}`]} />
            <div className="section-title"><span>검토 대기</span></div>
            {flagged.length === 0 ? (
              <Empty icon={<IconShield />} title="검토할 글이 없어요">지금은 신고가 쌓인 글이 없어요.</Empty>
            ) : (
              <div className="stack">
                {flagged.map((f) => <FlaggedCard key={`${f.target.kind}-${f.target.id}`} f={f} s={s} onChange={setS} />)}
              </div>
            )}
            <div className="section-title"><span>차단된 유저 {blocked.length}</span></div>
            {blocked.length === 0 ? (
              <p className="tiny muted" style={{ margin: "0 4px" }}>차단된 유저가 없어요.</p>
            ) : (
              <div className="stack">
                {blocked.map((u) => (
                  <div key={u.id} className="card row" style={{ padding: "12px 16px" }}>
                    <span className="grow">
                      <b style={{ fontSize: 14.5 }}>{u.nick}{u.id === s.me.id ? " (나)" : ""}</b>
                      <div className="tiny muted">{u.blockedAt ? `${fmtRelative(u.blockedAt)} 차단` : ""}{u.blockedReason ? ` · ${u.blockedReason}` : ""}</div>
                    </span>
                    <button type="button" className="btn ghost sm" disabled={unblocking !== null} onClick={() => void unblock(u.id)}>{unblocking === u.id ? "해제 중…" : "차단 해제"}</button>
                  </div>
                ))}
              </div>
            )}
            <p className="tiny muted" style={{ textAlign: "center", marginTop: 24 }}>{`신고가 ${REPORT_THRESHOLD}번 이상 접수된 글·댓글·피드를 모아 보여드려요.`}</p>
          </>
        )}
      </div>
    </>
  );
}

/* ================= AI 프롬프트 관리 (이 기기에 저장, 요청마다 서버로 전달) ================= */

function PromptAdmin() {
  const [overrides, setOverrides] = useState<PromptOverrides>({});
  const [drafts, setDrafts] = useState<Record<PromptKey, string>>({ ...DEFAULT_PROMPTS });
  const [savedKey, setSavedKey] = useState<PromptKey | null>(null);

  useEffect(() => {
    const o = loadPrompts();
    setOverrides(o);
    setDrafts({ briefing: o.briefing ?? DEFAULT_PROMPTS.briefing, praise: o.praise ?? DEFAULT_PROMPTS.praise, love: o.love ?? DEFAULT_PROMPTS.love, review: o.review ?? DEFAULT_PROMPTS.review });
  }, []);

  const save = (key: PromptKey) => {
    const text = drafts[key].trim().slice(0, PROMPT_MAX_LEN);
    const next: PromptOverrides = { ...overrides };
    if (!text || text === DEFAULT_PROMPTS[key]) delete next[key];
    else next[key] = text;
    savePrompts(next);
    setOverrides(next);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  };
  const reset = (key: PromptKey) => {
    setDrafts((d) => ({ ...d, [key]: DEFAULT_PROMPTS[key] }));
    const next: PromptOverrides = { ...overrides };
    delete next[key];
    savePrompts(next);
    setOverrides(next);
  };
  const customized = Object.keys(overrides).filter((k) => k !== "model").length;
  const model = overrides.model ?? DEFAULT_MODEL;
  const pickModel = (id: string) => {
    const next: PromptOverrides = { ...overrides };
    if (id === DEFAULT_MODEL) delete next.model;
    else next.model = id;
    savePrompts(next);
    setOverrides(next);
  };

  return (
    <>
      <Hero label="AI 답변 설정" title={customized ? `${customized}개의 작성 지침을 바꿨어요` : "기본 작성 지침을 사용해요"} sub="답변의 말투와 내용을 조정해요. 안내된 답변 형식은 그대로 유지해 주세요." stats={[`${PROMPT_META.length}개 작성 지침`, `최대 ${PROMPT_MAX_LEN.toLocaleString()}자`]} />
      <div className="section-title"><span>사용할 AI</span><span className="tiny muted">{MODEL_OPTIONS.find((o) => o.id === model)?.label}</span></div>
      <div className="stack" style={{ gap: 8 }}>
        {MODEL_OPTIONS.map((o) => (
          <button key={o.id} type="button" className={`reason glass ${model === o.id ? "on" : ""}`} onClick={() => pickModel(o.id)}>
            <span className="radio" />
            <span><b>{o.label}</b><small>{o.desc}</small></span>
          </button>
        ))}
      </div>
      <div className="section-title"><span>작성 지침</span></div>
      <div className="stack">
        {PROMPT_META.map((p) => {
          const dirty = drafts[p.key] !== (overrides[p.key] ?? DEFAULT_PROMPTS[p.key]);
          const isCustom = Boolean(overrides[p.key]);
          return (
            <section key={p.key} className="card prompt-card">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
                <b style={{ fontSize: 15 }}>{p.label}</b>
                {isCustom ? <span className="badge">수정됨</span> : <span className="badge gray">기본값</span>}
              </div>
              <div className="meta"><span>{p.desc}</span><span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{drafts[p.key].length.toLocaleString()}자</span></div>
              <textarea aria-label={`${p.label} 작성 지침`} value={drafts[p.key]} onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))} spellCheck={false} />
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <button type="button" className={`btn sm ${dirty ? "" : "ghost"}`} disabled={!dirty} onClick={() => save(p.key)}>{savedKey === p.key ? "저장됨" : "저장"}</button>
                <button type="button" className="text-btn muted" disabled={!isCustom && !dirty} onClick={() => reset(p.key)}>기본값으로</button>
              </div>
            </section>
          );
        })}
      </div>
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>변경한 작성 지침과 AI 선택은 현재 기기에서 만드는 답변에 적용돼요.</p>
    </>
  );
}

function FlaggedCard({ f, s, onChange }: { f: FlaggedItem; s: CommunityStore; onChange: (s: CommunityStore) => void }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const act = async (operation: () => Promise<CommunityStore>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      if (await run(onChange, operation, setError)) setConfirm(false);
    } finally { locked.current = false; setBusy(false); }
  };
  const counts = REPORT_REASONS.map((r) => ({ ...r, n: f.reports.filter((x) => x.reason === r.id).length })).filter((r) => r.n > 0);
  const cat = "cat" in f.item ? shoutCatById(f.item.cat) : null;
  const kindLabel = f.target.kind === "post" ? <><ShoutCatIcon id={cat!.id} /> {cat!.label}</> : f.target.kind === "feed" ? <><IconFilm className="cat-ico" /> 위로 피드</> : <><IconBubble className="cat-ico" /> 댓글</>;
  return (
    <section className="card admin-item" aria-busy={busy}>
      <div className="post-head">
        <span className="cat">{kindLabel}</span><span>·</span>
        <span className="nick">{f.author.nick}{f.author.id === s.me.id ? " (나)" : ""}</span><span>·</span>
        <span>{fmtRelative(f.item.createdAt)}</span>
        <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--text)" }}>신고 {f.reports.length}</span>
      </div>
      {f.postText && <div className="quote sub">원글: {f.postText.slice(0, 80)}{f.postText.length > 80 ? "…" : ""}</div>}
      <div className="quote">{f.item.text}</div>
      <div className="reasons">{counts.map((r) => <span key={r.id}>{r.label} {r.n}</span>)}</div>
      <div className="admin-actions">
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void act(() => api.adminDismiss(f.target))}>문제 없음</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void act(() => api.adminHide(f.target))}>내용 숨기기</button>
        <button
          className="btn ghost danger sm"
          type="button"
          disabled={busy}
          onClick={() => { setError(null); setConfirm(true); }}
        >
          사용자 차단
        </button>
      </div>
      {error && !confirm && <p className="notice warn" role="alert">{error}</p>}
      <Sheet open={confirm} onClose={() => { if (!locked.current) setConfirm(false); }} title={`${f.author.nick} 님을 차단할까요?`}>
        <p className="sheet-text">이 사용자의 글과 댓글이 모두 가려지고, 새 글을 작성할 수 없게 돼요.</p>
        {error && <p className="notice warn" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>취소</button>
          <button type="button" className="btn danger" disabled={busy} aria-busy={busy} onClick={() => void act(async () => {
            await api.adminBlock(f.author.id, `신고 ${f.reports.length}회`);
            return api.adminHide(f.target);
          })}>{busy ? "처리 중…" : "차단하기"}</button>
        </div>
      </Sheet>
    </section>
  );
}
