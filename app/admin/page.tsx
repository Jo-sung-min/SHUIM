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
import { Empty, Hero, TopBar, fmtRelative } from "@/components/ui";
import { IconChevronL } from "@/components/Icons";

export default function AdminPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  useEffect(() => setS(loadCommunity()), []);
  if (!s) return <TopBar title="관리자" />;

  const flagged = listFlagged(s);
  const blocked = blockedUsers(s);

  return (
    <>
      <TopBar
        title="관리자 검토"
        eyebrow="외침 · 신고 누적 글"
        right={
          <Link href="/shout" className="icon-btn" aria-label="외침으로">
            <IconChevronL />
          </Link>
        }
      />
      <div className="screen">
        <Hero
          label="프로토타입 · 로그인 없이 누구나 열람"
          title={flagged.length ? `검토할 글 ${flagged.length}개` : "검토할 글이 없어요"}
          sub={`외침·위로 피드·댓글 중 신고가 ${REPORT_THRESHOLD}번 이상 쌓인 것이 여기 모여요. 숨기거나, 작성자를 차단하거나, 문제 없음으로 돌려보낼 수 있어요.`}
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
      </div>
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
