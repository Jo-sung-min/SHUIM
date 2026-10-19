"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CommunityStore,
  FEED_BG_COUNT,
  FEED_BG_LABELS,
  FeedPost,
  REPORT_THRESHOLD,
  Target,
  commentsOf,
  createFeedPost,
  creatorOf,
  isBlocked,
  isCreator,
  isFlagged,
  listFeed,
  loadCommunity,
  report,
  toggleCheer,
  toggleFollow,
  toggleSave,
  updateCreatorBio,
  userById,
} from "@/lib/community";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { Sheet, fmtRelative } from "@/components/ui";
import { CommentThread, ReportSheet, TargetMenuSheet } from "@/components/CommunityUI";
import { IconMessage, IconMore, IconPen } from "@/components/Icons";

type Filter = "all" | "following" | "saved";

export default function FeedPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [writing, setWriting] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => setS(loadCommunity()), []);

  const items = useMemo(() => {
    if (!s) return [];
    const all = listFeed(s);
    if (filter === "following") return all.filter((f) => s.following.includes(f.authorId) || f.authorId === s.me.id);
    if (filter === "saved") return all.filter((f) => f.saves.includes(s.me.id));
    return all;
  }, [s, filter]);

  if (!s) return null;

  const me = s.me.id;
  const blocked = isBlocked(s.me);
  const currentComments = openComments ? s.feed.find((f) => f.id === openComments) : null;

  return (
    <>
      <div className="feed-top">
        <div className="segmented feed-seg" role="tablist">
          {(
            [
              ["all", "전체"],
              ["following", "팔로잉"],
              ["saved", "저장함"],
            ] as [Filter, string][]
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? "on" : ""} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
        {!blocked && (
          <button className="btn sm feed-write" onClick={() => setWriting(true)}>
            <IconPen style={{ width: 15, height: 15 }} /> {isCreator(s, me) ? "위로글 쓰기" : "크리에이터 되기"}
          </button>
        )}
      </div>

      <div className="feed" role="feed">
        {items.length === 0 ? (
          <section className="reel bg-1">
            <div className="reel-body">
              <div className="reel-title">{filter === "saved" ? "저장함" : filter === "following" ? "팔로잉" : "위로 피드"}</div>
              <p className="reel-text">
                {filter === "saved" ? "저장한 위로글이 아직 없어요.\n마음에 닿는 글의 🔖를 눌러요." : filter === "following" ? "팔로우한 크리에이터가 없어요.\n전체에서 마음에 드는 글쓴이를 팔로우해요." : "아직 위로글이 없어요.\n첫 크리에이터가 되어볼까요."}
              </p>
            </div>
          </section>
        ) : (
          items.map((f) => (
            <Reel
              key={f.id}
              s={s}
              post={f}
              revealed={revealed.has(f.id)}
              onReveal={() => setRevealed((r) => new Set(r).add(f.id))}
              onCheer={() => setS(toggleCheer(s, { kind: "feed", id: f.id }))}
              onSave={() => setS(toggleSave(s, f.id))}
              onComments={() => setOpenComments(f.id)}
              onMenu={() => setMenu({ kind: "feed", id: f.id })}
              onFollow={() => setS(toggleFollow(s, f.authorId))}
              onProfile={() => setProfile(f.authorId)}
            />
          ))
        )}
      </div>

      {/* 댓글 */}
      <Sheet open={Boolean(currentComments)} onClose={() => setOpenComments(null)} title={`위로 ${currentComments ? commentsOf(s, currentComments.id).length : 0}개`}>
        {currentComments && (
          <>
            <p className="tiny muted" style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
              {currentComments.text.slice(0, 80)}{currentComments.text.length > 80 ? "…" : ""}
            </p>
            <CommentThread s={s} postId={currentComments.id} onChange={setS} onMenu={(t) => setMenu(t)} placeholder="이 글이 닿았다면 한마디." />
          </>
        )}
      </Sheet>

      {/* 크리에이터 프로필 */}
      <Sheet open={Boolean(profile)} onClose={() => setProfile(null)} title="크리에이터">
        {profile && <CreatorProfile s={s} userId={profile} onFollow={() => setS(toggleFollow(s, profile))} onBio={(b) => setS(updateCreatorBio(s, b))} />}
      </Sheet>

      {/* 글쓰기 */}
      <WriteSheet
        key={writing ? "write-open" : "write-closed"}
        open={writing}
        firstTime={!isCreator(s, me)}
        onClose={() => setWriting(false)}
        onSubmit={(text, bg, title, bio) => {
          let next = createFeedPost(s, text, bg, title);
          if (bio !== undefined && bio.trim()) next = updateCreatorBio(next, bio);
          setS(next);
          setWriting(false);
          setFilter("all");
          document.querySelector(".feed")?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <TargetMenuSheet s={s} target={menu} onClose={() => setMenu(null)} onChange={setS} onReport={(t) => setReporting(t)} onDeleted={(t) => t.kind === "feed" && setOpenComments(null)} />
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

/* ================= 한 장 ================= */

function Reel({
  s,
  post,
  revealed,
  onReveal,
  onCheer,
  onSave,
  onComments,
  onMenu,
  onFollow,
  onProfile,
}: {
  s: CommunityStore;
  post: FeedPost;
  revealed: boolean;
  onReveal: () => void;
  onCheer: () => void;
  onSave: () => void;
  onComments: () => void;
  onMenu: () => void;
  onFollow: () => void;
  onProfile: () => void;
}) {
  const me = s.me.id;
  const author = userById(s, post.authorId);
  const creator = creatorOf(s, post.authorId);
  const mine = post.authorId === me;
  const following = s.following.includes(post.authorId);
  const cheered = post.cheers.includes(me);
  const saved = post.saves.includes(me);
  const comments = commentsOf(s, post.id).length;
  const flagged = isFlagged(post) && !revealed;

  return (
    <section className={`reel bg-${post.bg}`}>
      <div className="reel-body">
        {flagged ? (
          <button className="flagged-box reel-flagged" onClick={onReveal}>
            <b>신고가 누적되어 검토 중인 글이에요</b>
            위로가 아니라는 신고가 {REPORT_THRESHOLD}번 이상 · 눌러서 보기
          </button>
        ) : (
          <>
            {post.title && <div className="reel-title">{post.title}</div>}
            <p className="reel-text">{post.text}</p>
          </>
        )}
      </div>

      <div className="reel-meta">
        <button className="reel-author" onClick={onProfile}>
          <span className="avatar">{author.nick.slice(0, 1)}</span>
          <span>
            <b>{mine ? `${author.nick} (나)` : author.nick}</b>
            <small>크리에이터 · 팔로워 {creator.followers.length} · {fmtRelative(post.createdAt)}</small>
          </span>
        </button>
        {!mine && (
          <button className={`pillbtn follow ${following ? "on" : ""}`} onClick={onFollow} aria-pressed={following}>
            {following ? "팔로잉" : "팔로우"}
          </button>
        )}
      </div>

      <div className="reel-actions">
        <button className={`ract ${cheered ? "on" : ""}`} onClick={onCheer} aria-pressed={cheered} aria-label="힘내요">
          <span className="ico">💪</span>
          <span className="lbl">{post.cheers.length}</span>
        </button>
        <button className="ract" onClick={onComments} aria-label="위로 댓글">
          <span className="ico"><IconMessage /></span>
          <span className="lbl">{comments}</span>
        </button>
        <button className={`ract ${saved ? "on" : ""}`} onClick={onSave} aria-pressed={saved} aria-label="저장">
          <span className="ico">{saved ? "🔖" : "🏷️"}</span>
          <span className="lbl">{saved ? "저장됨" : "저장"}</span>
        </button>
        <button className="ract" onClick={onMenu} aria-label="더보기">
          <span className="ico"><IconMore /></span>
        </button>
      </div>
    </section>
  );
}

/* ================= 크리에이터 프로필 ================= */

function CreatorProfile({ s, userId, onFollow, onBio }: { s: CommunityStore; userId: string; onFollow: () => void; onBio: (b: string) => void }) {
  const u = userById(s, userId);
  const c = creatorOf(s, userId);
  const mine = userId === s.me.id;
  const posts = s.feed.filter((f) => f.authorId === userId && !f.hidden);
  const cheers = posts.reduce((n, f) => n + f.cheers.length, 0);
  const [bio, setBio] = useState(c.bio);
  const [editing, setEditing] = useState(false);
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <span className="avatar lg">{u.nick.slice(0, 1)}</span>
        <div className="grow">
          <b style={{ fontSize: 17 }}>{u.nick}{mine ? " (나)" : ""}</b>
          <div className="tiny muted">팔로워 {c.followers.length} · 위로글 {posts.length} · 받은 힘내요 {cheers}</div>
        </div>
        {!mine && (
          <button className={`pillbtn follow ${s.following.includes(userId) ? "on" : ""}`} onClick={onFollow}>
            {s.following.includes(userId) ? "팔로잉" : "팔로우"}
          </button>
        )}
      </div>
      {mine && editing ? (
        <div className="field">
          <label>소개</label>
          <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={80} placeholder="어떤 사람에게 어떤 글을 쓰는지 한 줄" autoFocus />
          <div className="sheet-actions" style={{ marginTop: 8 }}>
            <button className="btn ghost" onClick={() => setEditing(false)}>취소</button>
            <button className="btn" onClick={() => { onBio(bio); setEditing(false); }}>저장</button>
          </div>
        </div>
      ) : (
        <p className="brief-text muted" style={{ margin: 0 }}>
          {c.bio || (mine ? "소개가 아직 없어요." : "소개가 없어요.")}
          {mine && <button className="text-btn" style={{ marginLeft: 6 }} onClick={() => setEditing(true)}>수정</button>}
        </p>
      )}
      {posts.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {posts.slice(0, 5).map((f) => (
            <div key={f.id} className="card flat" style={{ padding: "10px 12px", fontSize: 13.5 }}>
              {f.title && <b style={{ display: "block", fontSize: 12, color: "var(--text-2)" }}>{f.title}</b>}
              <span style={{ whiteSpace: "pre-wrap" }}>{f.text.slice(0, 60)}{f.text.length > 60 ? "…" : ""}</span>
              <div className="tiny muted" style={{ marginTop: 4 }}>💪 {f.cheers.length} · {fmtRelative(f.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= 글쓰기 ================= */

function WriteSheet({
  open,
  firstTime,
  onClose,
  onSubmit,
}: {
  open: boolean;
  firstTime: boolean;
  onClose: () => void;
  onSubmit: (text: string, bg: number, title: string, bio?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(0);
  const [bio, setBio] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={firstTime ? "크리에이터 되기" : "위로글 쓰기"}>
      <div className="stack">
        {firstTime && (
          <div className="notice">
            위로글을 하나 올리면 크리에이터가 돼요. 짧게, 한 사람에게 말하듯 써요. 조언보다 알아주는 말이 먼저예요.
          </div>
        )}
        <div className="field">
          <label>제목 (선택)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={24} placeholder="예: 떨어진 날에게" />
        </div>
        <div className="field">
          <label>위로글</label>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder={"줄바꿈으로 호흡을 나눠요.\n\n예)\n떨어진 날은\n내가 모자란 날이 아니라\n거기까지 걸어간 날이에요."} style={{ minHeight: 140 }} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{text.length}/280</span>
        </div>
        <div className="field">
          <label>배경</label>
          <div className="swatches">
            {Array.from({ length: FEED_BG_COUNT }, (_, i) => (
              <button key={i} type="button" className={`swatch bg-${i} ${bg === i ? "on" : ""}`} onClick={() => setBg(i)} aria-label={FEED_BG_LABELS[i]} title={FEED_BG_LABELS[i]}>
                <span>{FEED_BG_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </div>
        {firstTime && (
          <div className="field">
            <label>크리에이터 소개 (선택)</label>
            <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={80} placeholder="어떤 사람에게 어떤 글을 쓰는지 한 줄" />
          </div>
        )}
        <div className={`reel preview bg-${bg}`}>
          <div className="reel-body">
            {title && <div className="reel-title">{title}</div>}
            <p className="reel-text">{text || "미리보기"}</p>
          </div>
        </div>
        {hasCrisisSignal(text) && <HelpBanner alert />}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={() => onSubmit(text, bg, title, firstTime ? bio : undefined)} disabled={!text.trim()}>올리기</button>
      </div>
    </Sheet>
  );
}
