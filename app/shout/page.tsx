"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Comment,
  CommunityStore,
  Post,
  REPORT_REASONS,
  REPORT_THRESHOLD,
  ReportReason,
  SHOUT_CATEGORIES,
  ShoutCat,
  Target,
  addComment,
  commentsOf,
  createPost,
  deleteComment,
  deletePost,
  hasReported,
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
import { IconFlag, IconMessage, IconMore, IconPlus, IconSend, IconShield, IconTrash } from "@/components/Icons";

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
  const menuItem = menu ? (menu.kind === "post" ? s.posts.find((p) => p.id === menu.id) : s.comments.find((c) => c.id === menu.id)) : null;

  return (
    <>
      <TopBar
        title="외침"
        eyebrow="익명 · 서로를 위로하는 곳"
        right={
          <Link href="/admin" className="icon-btn" aria-label="관리자 검토" style={{ position: "relative" }}>
            <IconShield />
            {flaggedCount > 0 && <span className="count-badge">{flaggedCount}</span>}
          </Link>
        }
      />
      <div className="screen">
        <Hero
          label={`나는 ${s.me.nick}`}
          title="오늘의 불행을 털어내요"
          sub="좋아요 대신 힘내요만 있어요. 위로가 아닌 글은 신고할 수 있고, 5번 쌓이면 관리자가 봐요."
          stats={[`외침 ${s.posts.filter((p) => isVisible(s, p)).length}개`, `힘내요 ${totalCheers}개`]}
        />

        {blocked && (
          <div className="notice warn">
            이 계정은 신고 누적으로 차단되어 글과 댓글을 쓸 수 없어요. 읽는 건 가능해요.
          </div>
        )}

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
          <Empty icon="📣" title="아직 외침이 없어요">
            첫 외침을 남기면 누군가 힘내요를 보낼 거예요.
          </Empty>
        ) : (
          <div className="stack">
            {posts.map((p) => {
              const flagged = isFlagged(p);
              const cmts = commentsOf(s, p.id);
              if (flagged && !revealed.has(p.id)) {
                return (
                  <button key={p.id} className="flagged-box" onClick={() => setRevealed((r) => new Set(r).add(p.id))}>
                    <b>신고가 누적되어 검토 중인 글이에요</b>
                    위로가 아니라는 신고가 {REPORT_THRESHOLD}번 이상 들어왔어요. 눌러서 볼 수 있어요.
                  </button>
                );
              }
              return (
                <PostCard
                  key={p.id}
                  s={s}
                  post={p}
                  commentCount={cmts.length}
                  onCheer={() => setS(toggleCheer(s, { kind: "post", id: p.id }))}
                  onOpen={() => setOpenPost(p.id)}
                  onMenu={() => setMenu({ kind: "post", id: p.id })}
                />
              );
            })}
          </div>
        )}

        <HelpBanner />
      </div>

      {!blocked && (
        <button className="fab" aria-label="외치기" onClick={() => setWriting(true)}>
          <IconPlus />
        </button>
      )}

      {/* 글쓰기 */}
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

      {/* 글 상세 + 댓글 */}
      <Sheet open={Boolean(current)} onClose={() => setOpenPost(null)} title={current ? `${shoutCatById(current.cat).emoji} ${shoutCatById(current.cat).label}` : ""}>
        {current && (
          <PostDetail
            s={s}
            post={current}
            onChange={setS}
            onMenu={(t) => setMenu(t)}
          />
        )}
      </Sheet>

      {/* ⋯ 메뉴 */}
      <Sheet open={Boolean(menu && menuItem)} onClose={() => setMenu(null)} title={menu?.kind === "post" ? "이 외침" : "이 댓글"}>
        {menu && menuItem && (
          <div className="stack">
            {menuItem.authorId === s.me.id ? (
              <button
                className="btn ghost"
                onClick={() => {
                  setS(menu.kind === "post" ? deletePost(s, menu.id) : deleteComment(s, menu.id));
                  if (menu.kind === "post" && openPost === menu.id) setOpenPost(null);
                  setMenu(null);
                }}
              >
                <IconTrash style={{ width: 18, height: 18 }} /> 내 글 삭제
              </button>
            ) : hasReported(s, menuItem) ? (
              <div className="notice">이미 신고한 {menu.kind === "post" ? "글" : "댓글"}이에요. 검토 결과는 관리자가 확인해요.</div>
            ) : (
              <button
                className="btn ghost"
                onClick={() => {
                  setReporting(menu);
                  setMenu(null);
                }}
              >
                <IconFlag style={{ width: 18, height: 18 }} /> 위로가 아니에요 · 신고하기
              </button>
            )}
            <button className="btn ghost" onClick={() => setMenu(null)}>닫기</button>
          </div>
        )}
      </Sheet>

      {/* 신고 */}
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

/* ================= 글 카드 ================= */

function PostCard({
  s,
  post,
  commentCount,
  onCheer,
  onOpen,
  onMenu,
}: {
  s: CommunityStore;
  post: Post;
  commentCount: number;
  onCheer: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const c = shoutCatById(post.cat);
  const author = userById(s, post.authorId);
  const mine = post.authorId === s.me.id;
  const cheered = post.cheers.includes(s.me.id);
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
        <button className={`pillbtn cheer ${cheered ? "on" : ""}`} onClick={onCheer} aria-pressed={cheered}>
          <span className="emoji">💪</span> 힘내요 <span className="n">{post.cheers.length}</span>
        </button>
        <button className="pillbtn" onClick={onOpen}>
          <IconMessage style={{ width: 15, height: 15 }} /> 위로 <span className="n">{commentCount}</span>
        </button>
      </div>
    </article>
  );
}

/* ================= 글 상세 ================= */

function PostDetail({
  s,
  post,
  onChange,
  onMenu,
}: {
  s: CommunityStore;
  post: Post;
  onChange: (s: CommunityStore) => void;
  onMenu: (t: Target) => void;
}) {
  const [text, setText] = useState("");
  const comments = commentsOf(s, post.id);
  const author = userById(s, post.authorId);
  const cheered = post.cheers.includes(s.me.id);
  const blocked = isBlocked(s.me);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onChange(addComment(s, post.id, t));
    setText("");
  };

  return (
    <>
      <div className="post-head" style={{ marginBottom: 2 }}>
        <span className="nick">{post.authorId === s.me.id ? "나" : author.nick}</span>
        <span>·</span>
        <span>{fmtRelative(post.createdAt)}</span>
      </div>
      <p className="post-text" style={{ fontSize: 16 }}>{post.text}</p>
      <div className="post-foot" style={{ marginBottom: 6 }}>
        <button className={`pillbtn cheer ${cheered ? "on" : ""}`} onClick={() => onChange(toggleCheer(s, { kind: "post", id: post.id }))} aria-pressed={cheered}>
          <span className="emoji">💪</span> 힘내요 <span className="n">{post.cheers.length}</span>
        </button>
        <span className="tiny muted">위로 {comments.length}개</span>
      </div>

      <div className="comment-list">
        {comments.map((cm) => (
          <CommentRow key={cm.id} s={s} comment={cm} me={s.me.id} onCheer={() => onChange(toggleCheer(s, { kind: "comment", id: cm.id }))} onMenu={() => onMenu({ kind: "comment", id: cm.id })} />
        ))}
      </div>

      {blocked ? (
        <div className="notice warn">차단된 계정은 댓글을 쓸 수 없어요.</div>
      ) : (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="위로 한마디. 조언보다 '그랬구나'가 먼저예요."
            rows={1}
            maxLength={300}
            onInput={(ev) => {
              const t = ev.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
            }}
          />
          <button type="submit" className="btn" disabled={!text.trim()} aria-label="보내기">
            <IconSend style={{ width: 18, height: 18 }} />
          </button>
        </form>
      )}
      {hasCrisisSignal(post.text) && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}
    </>
  );
}

function CommentRow({ s, comment, me, onCheer, onMenu }: { s: CommunityStore; comment: Comment; me: string; onCheer: () => void; onMenu: () => void }) {
  const author = userById(s, comment.authorId);
  const cheered = comment.cheers.includes(me);
  const flagged = isFlagged(comment);
  const [show, setShow] = useState(false);
  if (flagged && !show) {
    return (
      <div className="comment">
        <button className="flagged-box" style={{ padding: "10px 12px" }} onClick={() => setShow(true)}>
          <b>검토 중인 댓글이에요</b>
          신고 {REPORT_THRESHOLD}번 이상 · 눌러서 보기
        </button>
      </div>
    );
  }
  return (
    <div className="comment">
      <div className="meta">
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{comment.authorId === me ? "나" : author.nick}</span>
        <span>·</span>
        <span>{fmtRelative(comment.createdAt)}</span>
        <button className="icon-btn more" aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 15, height: 15 }} /></button>
      </div>
      <p className="text">{comment.text}</p>
      <button className={`pillbtn cheer ${cheered ? "on" : ""}`} onClick={onCheer} aria-pressed={cheered}>
        <span className="emoji">💪</span> 힘내요 <span className="n">{comment.cheers.length}</span>
      </button>
    </div>
  );
}

/* ================= 글쓰기 ================= */

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

/* ================= 신고 ================= */

function ReportSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (reason: ReportReason) => void }) {
  const [reason, setReason] = useState<ReportReason>("not_comfort");
  return (
    <Sheet open={open} onClose={onClose} title="신고하기">
      <p className="tiny muted" style={{ margin: "0 0 12px" }}>
        신고가 {REPORT_THRESHOLD}번 쌓이면 글이 가려지고 관리자가 검토해요. 관리자는 작성자를 차단할 수 있어요.
      </p>
      <div className="stack" style={{ gap: 8 }}>
        {REPORT_REASONS.map((r) => (
          <button key={r.id} type="button" className={`reason glass ${reason === r.id ? "on" : ""}`} onClick={() => setReason(r.id)}>
            <span className="radio" />
            <span>
              <b>{r.label}</b>
              <small>{r.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={() => onSubmit(reason)}>신고하기</button>
      </div>
    </Sheet>
  );
}
