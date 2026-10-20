"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CommunityStore,
  Post,
  REPORT_THRESHOLD,
  SHOUT_CATEGORIES,
  ShoutCat,
  Target,
  commentsOf,
  createPost,
  isBlocked,
  isFlagged,
  isVisible,
  listFlagged,
  loadCommunity,
  report,
  shoutCatById,
  toggleCheer,
  userById,
} from "@/lib/community";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { Empty, Hero, Sheet, TopBar, fmtRelative } from "@/components/ui";
import ShoutTabs from "@/components/ShoutTabs";
import { CheerButton, CommentThread, ReportSheet, TargetMenuSheet } from "@/components/CommunityUI";
import { IconMessage, IconMore, IconPlus, IconShield } from "@/components/Icons";

type Filter = ShoutCat | "all";

export default function ShoutPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [writing, setWriting] = useState(false);
  const [openPost, setOpenPost] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => setS(loadCommunity()), []);

  const posts = useMemo(() => {
    if (!s) return [];
    return s.posts.filter((p) => isVisible(s, p) && (filter === "all" || p.cat === filter)).sort((a, b) => b.createdAt - a.createdAt);
  }, [s, filter]);

  if (!s) return <TopBar title="외침" />;

  const blocked = isBlocked(s.me);
  const flaggedCount = listFlagged(s).length;
  const totalCheers = s.posts.reduce((n, p) => n + p.cheers.length, 0) + s.comments.reduce((n, c) => n + c.cheers.length, 0);
  const current = openPost ? s.posts.find((p) => p.id === openPost) ?? null : null;

  return (
    <>
      <TopBar
        title="외침"
        eyebrow="익명"
        right={
          <Link href="/admin" className="icon-btn" aria-label="관리자 검토" style={{ position: "relative" }}>
            <IconShield />
            {flaggedCount > 0 && <span className="count-badge">{flaggedCount}</span>}
          </Link>
        }
      />
      <div className="screen">
        <ShoutTabs />
        <div style={{ height: 12 }} />
        <Hero
          label={`나는 ${s.me.nick}`}
          title="오늘의 불행을 털어내요"
          stats={[`외침 ${s.posts.filter((p) => isVisible(s, p)).length}개`, `힘내요 ${totalCheers}개`]}
        />

        {blocked && <div className="notice warn">이 계정은 신고 누적으로 차단되어 글과 댓글을 쓸 수 없어요. 읽는 건 가능해요.</div>}

        <div className="chips" style={{ marginTop: 12 }} role="radiogroup">
          <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>전체</button>
          {SHOUT_CATEGORIES.map((c) => (
            <button key={c.id} className={`chip ${filter === c.id ? "on" : ""}`} onClick={() => setFilter(c.id)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        {filter !== "all" && <p className="tiny muted" style={{ margin: "2px 4px 10px" }}>{shoutCatById(filter).desc}</p>}

        {posts.length === 0 ? (
          <Empty icon="📣" title="아직 외침이 없어요">첫 외침을 남기면 누군가 힘내요를 보낼 거예요.</Empty>
        ) : (
          <div className="stack">
            {posts.map((p) =>
              isFlagged(p) && !revealed.has(p.id) ? (
                <button key={p.id} className="flagged-box" onClick={() => setRevealed((r) => new Set(r).add(p.id))}>
                  <b>신고가 누적되어 검토 중인 글이에요</b>
                  위로가 아니라는 신고가 {REPORT_THRESHOLD}번 이상 들어왔어요. 눌러서 볼 수 있어요.
                </button>
              ) : (
                <PostCard
                  key={p.id}
                  s={s}
                  post={p}
                  commentCount={commentsOf(s, p.id).length}
                  onCheer={() => setS(toggleCheer(s, { kind: "post", id: p.id }))}
                  onOpen={() => setOpenPost(p.id)}
                  onMenu={() => setMenu({ kind: "post", id: p.id })}
                />
              )
            )}
          </div>
        )}

        <HelpBanner />
      </div>

      {!blocked && (
        <button className="fab" aria-label="외치기" onClick={() => setWriting(true)}>
          <IconPlus />
        </button>
      )}

      <WriteSheet
        key={writing ? "write-open" : "write-closed"}
        open={writing}
        defaultCat={filter === "all" ? "misfortune" : filter}
        onClose={() => setWriting(false)}
        onSubmit={(cat, text) => {
          setS(createPost(s, cat, text));
          setWriting(false);
          setFilter("all");
        }}
      />

      <Sheet open={Boolean(current)} onClose={() => setOpenPost(null)} title={current ? `${shoutCatById(current.cat).emoji} ${shoutCatById(current.cat).label}` : ""}>
        {current && (
          <>
            <div className="post-head" style={{ marginBottom: 2 }}>
              <span className="nick">{current.authorId === s.me.id ? "나" : userById(s, current.authorId).nick}</span>
              <span>·</span>
              <span>{fmtRelative(current.createdAt)}</span>
            </div>
            <p className="post-text" style={{ fontSize: 16 }}>{current.text}</p>
            <div className="post-foot" style={{ marginBottom: 6 }}>
              <CheerButton count={current.cheers.length} on={current.cheers.includes(s.me.id)} onClick={() => setS(toggleCheer(s, { kind: "post", id: current.id }))} />
              <span className="tiny muted">위로 {commentsOf(s, current.id).length}개</span>
            </div>
            <CommentThread s={s} postId={current.id} onChange={setS} onMenu={(t) => setMenu(t)} />
            {hasCrisisSignal(current.text) && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}
          </>
        )}
      </Sheet>

      <TargetMenuSheet
        s={s}
        target={menu}
        onClose={() => setMenu(null)}
        onChange={setS}
        onReport={(t) => setReporting(t)}
        onDeleted={(t) => t.kind === "post" && openPost === t.id && setOpenPost(null)}
      />
      <ReportSheet
        key={reporting ? `report-${reporting.kind}-${reporting.id}` : "report-closed"}
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        onSubmit={(reason) => {
          if (reporting) setS(report(s, reporting, reason));
          setReporting(null);
        }}
      />
    </>
  );
}

function PostCard({ s, post, commentCount, onCheer, onOpen, onMenu }: { s: CommunityStore; post: Post; commentCount: number; onCheer: () => void; onOpen: () => void; onMenu: () => void }) {
  const c = shoutCatById(post.cat);
  const author = userById(s, post.authorId);
  const mine = post.authorId === s.me.id;
  return (
    <article className="card post">
      <div className="post-head">
        <span className="cat">{c.emoji} {c.label}</span>
        <span>·</span>
        <span className="nick">{mine ? "나" : author.nick}</span>
        <span>·</span>
        <span>{fmtRelative(post.createdAt)}</span>
        <button className="icon-btn more" aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 16, height: 16 }} /></button>
      </div>
      <p className="post-text" onClick={onOpen} role="button" tabIndex={0}>{post.text}</p>
      <div className="post-foot">
        <CheerButton count={post.cheers.length} on={post.cheers.includes(s.me.id)} onClick={onCheer} />
        <button className="pillbtn" onClick={onOpen}>
          <IconMessage style={{ width: 15, height: 15 }} /> 위로 <span className="n">{commentCount}</span>
        </button>
      </div>
    </article>
  );
}

function WriteSheet({ open, defaultCat, onClose, onSubmit }: { open: boolean; defaultCat: ShoutCat; onClose: () => void; onSubmit: (cat: ShoutCat, text: string) => void }) {
  const [cat, setCat] = useState<ShoutCat>(defaultCat);
  const [text, setText] = useState("");
  const c = shoutCatById(cat);
  return (
    <Sheet open={open} onClose={onClose} title="외치기">
      <div className="stack">
        <div className="field">
          <label>어디에 외칠까요</label>
          <div className="chips wrap">
            {SHOUT_CATEGORIES.map((x) => (
              <button key={x.id} type="button" className={`chip ${cat === x.id ? "on" : ""}`} onClick={() => setCat(x.id)}>
                {x.emoji} {x.label}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ margin: "2px 2px 0" }}>{c.desc}</p>
        </div>
        <div className="field">
          <label>내용</label>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={c.placeholder} maxLength={600} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{text.length}/600 · 익명으로 올라가요</span>
        </div>
        {hasCrisisSignal(text) && <HelpBanner alert />}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={() => onSubmit(cat, text)} disabled={!text.trim()}>외치기</button>
      </div>
    </Sheet>
  );
}
