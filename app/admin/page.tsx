"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CommunityStore,
  FlaggedItem,
  REPORT_REASONS,
  REPORT_THRESHOLD,
  adminBlockUser,
  adminDismiss,
  adminHide,
  adminUnblockUser,
  blockedUsers,
  listFlagged,
  loadCommunity,
  resetCommunity,
  shoutCatById,
} from "@/lib/community";
import { Empty, Hero, Segmented, TopBar, fmtRelative } from "@/components/ui";
import { IconChevronL } from "@/components/Icons";
import { currentUser, hasAnyAccount, isAdmin } from "@/lib/auth";
import { DEFAULT_MODEL, DEFAULT_PROMPTS, MODEL_OPTIONS, PROMPT_MAX_LEN, PROMPT_META, PromptKey } from "@/lib/prompts";
import { PromptOverrides, loadPrompts, savePrompts } from "@/lib/storage";

type View = "reports" | "prompts";

export default function AdminPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [view, setView] = useState<View>("reports");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setS(loadCommunity());
    setAllowed(isAdmin());
    setDemo(!hasAnyAccount());
  }, []);

  if (!s || allowed === null) return <TopBar title="관리자" />;

  if (!allowed) {
    const me = currentUser();
    return (
      <>
        <TopBar title="관리자" right={<Link href="/shout" className="icon-btn" aria-label="외침으로"><IconChevronL /></Link>} />
        <div className="screen">
          <Empty icon="🔒" title="관리자만 들어올 수 있어요">
            {me ? `${me.nick} 님은 일반 회원이에요. 첫 번째로 가입한 계정이 관리자예요.` : "관리자 계정으로 로그인해요."}
            <div style={{ marginTop: 14 }}>
              <Link href="/auth" className="btn sm soft">{me ? "내 계정" : "로그인"}</Link>
            </div>
          </Empty>
        </div>
      </>
    );
  }

  const flagged = listFlagged(s);
  const blocked = blockedUsers(s);

  return (
    <>
      <TopBar
        title="관리자"
        eyebrow={view === "reports" ? "외침 · 신고 누적 글" : "AI 프롬프트"}
        right={
          <Link href="/shout" className="icon-btn" aria-label="외침으로">
            <IconChevronL />
          </Link>
        }
      />
      <div className="screen">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "reports", label: `신고 검토${flagged.length ? ` ${flagged.length}` : ""}` },
            { value: "prompts", label: "프롬프트" },
          ]}
        />
        <div style={{ height: 12 }} />

        {view === "prompts" && <PromptAdmin />}

        {view === "reports" && (
          <>
        <Hero
          label={demo ? "프로토타입 · 아직 계정이 없어 누구나 열람" : "관리자"}
          title={flagged.length ? `검토할 글 ${flagged.length}개` : "검토할 글이 없어요"}
          stats={[`대기 ${flagged.length}`, `차단 유저 ${blocked.length}`]}
        />

        <div className="section-title"><span>검토 대기</span></div>
        {flagged.length === 0 ? (
          <Empty icon="🛡️" title="깨끗해요">지금은 신고가 쌓인 글이 없어요.</Empty>
        ) : (
          <div className="stack">
            {flagged.map((f) => (
              <FlaggedCard key={`${f.target.kind}-${f.target.id}`} f={f} s={s} onChange={setS} />
            ))}
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
                <button className="btn ghost sm" onClick={() => setS(adminUnblockUser(s, u.id))}>차단 해제</button>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
          <button
            className="text-btn muted"
            onClick={() => {
              if (window.confirm("외침 데이터를 샘플로 초기화할까요?")) setS(resetCommunity());
            }}
          >
            외침 샘플 데이터로 초기화
          </button>
        </div>
          </>
        )}
      </div>
    </>
  );
}

/* ================= AI 프롬프트 관리 ================= */

function PromptAdmin() {
  const [overrides, setOverrides] = useState<PromptOverrides>({});
  const [drafts, setDrafts] = useState<Record<PromptKey, string>>({ ...DEFAULT_PROMPTS });
  const [savedKey, setSavedKey] = useState<PromptKey | null>(null);

  useEffect(() => {
    const o = loadPrompts();
    setOverrides(o);
    setDrafts({
      briefing: o.briefing ?? DEFAULT_PROMPTS.briefing,
      praise: o.praise ?? DEFAULT_PROMPTS.praise,
      love: o.love ?? DEFAULT_PROMPTS.love,
      review: o.review ?? DEFAULT_PROMPTS.review,
    });
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
      <Hero
        label="AI 프롬프트"
        title={customized ? `${customized}개를 직접 고쳤어요` : "기본 프롬프트를 쓰고 있어요"}
        sub="JSON 출력 형식 부분은 유지해요."
        stats={[`${PROMPT_META.length}개 프롬프트`, `최대 ${PROMPT_MAX_LEN.toLocaleString()}자`]}
      />
      <div className="section-title"><span>모델</span><span className="tiny muted">{MODEL_OPTIONS.find((o) => o.id === model)?.label}</span></div>
      <div className="stack" style={{ gap: 8 }}>
        {MODEL_OPTIONS.map((o) => (
          <button key={o.id} type="button" className={`reason glass ${model === o.id ? "on" : ""}`} onClick={() => pickModel(o.id)}>
            <span className="radio" />
            <span>
              <b>{o.label} <span className="tiny muted" style={{ fontWeight: 500 }}>{o.id}</span></b>
              <small>{o.desc}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="section-title"><span>프롬프트</span></div>
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
              <div className="meta">
                <span>{p.desc}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{drafts[p.key].length.toLocaleString()}자</span>
              </div>
              <textarea value={drafts[p.key]} onChange={(e) => setDrafts((d) => ({ ...d, [p.key]: e.target.value }))} spellCheck={false} />
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                <button className="btn sm" disabled={!dirty} onClick={() => save(p.key)}>
                  {savedKey === p.key ? "저장됨" : "저장"}
                </button>
                <button className="btn ghost sm" disabled={!isCustom && !dirty} onClick={() => reset(p.key)}>기본값으로</button>
              </div>
            </section>
          );
        })}
      </div>
      <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>
        프로토타입: 프롬프트는 이 기기에 저장되고 요청마다 서버로 함께 보내요. 서버에 DB가 생기면 거기로 옮기면 돼요.
      </p>
    </>
  );
}

function FlaggedCard({ f, s, onChange }: { f: FlaggedItem; s: CommunityStore; onChange: (s: CommunityStore) => void }) {
  const counts = REPORT_REASONS.map((r) => ({ ...r, n: f.reports.filter((x) => x.reason === r.id).length })).filter((r) => r.n > 0);
  const cat = "cat" in f.item ? shoutCatById(f.item.cat) : null;
  const kindLabel = f.target.kind === "post" ? `${cat!.emoji} ${cat!.label}` : f.target.kind === "feed" ? "🎞️ 위로 피드" : "💬 댓글";
  return (
    <section className="card admin-item">
      <div className="post-head">
        <span className="cat">{kindLabel}</span>
        <span>·</span>
        <span className="nick">{f.author.nick}{f.author.id === s.me.id ? " (나)" : ""}</span>
        <span>·</span>
        <span>{fmtRelative(f.item.createdAt)}</span>
        <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--text)" }}>신고 {f.reports.length}</span>
      </div>
      {f.postText && <div className="quote sub">원글: {f.postText.slice(0, 80)}{f.postText.length > 80 ? "…" : ""}</div>}
      <div className="quote">{f.item.text}</div>
      <div className="reasons">
        {counts.map((r) => (
          <span key={r.id}>{r.label} {r.n}</span>
        ))}
      </div>
      <div className="admin-actions">
        <button className="btn ghost sm" onClick={() => onChange(adminDismiss(s, f.target))}>문제 없음</button>
        <button className="btn ghost sm" onClick={() => onChange(adminHide(s, f.target))}>내용 숨기기</button>
        <button
          className="btn sm"
          onClick={() => {
            if (!window.confirm(`${f.author.nick} 님을 차단할까요? 이 유저의 글·댓글이 모두 가려지고 글을 쓸 수 없게 돼요.`)) return;
            onChange(adminHide(adminBlockUser(s, f.author.id, `신고 ${f.reports.length}회`), f.target));
          }}
        >
          유저 차단
        </button>
      </div>
    </section>
  );
}
