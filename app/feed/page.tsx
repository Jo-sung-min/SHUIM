"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommunityStore,
  FEED_BG_COUNT,
  FEED_BG_LABELS,
  FEED_IMAGES,
  FEED_MAX_PAGES,
  FeedPost,
  REPORT_THRESHOLD,
  Target,
  api,
  commentsOf,
  creatorOf,
  fetchCommunity,
  isBlocked,
  isCreator,
  isFlagged,
  listFeed,
  pagesOf,
  userById,
} from "@/lib/community";
import type { FeedPage as FeedContent } from "@/lib/community-core";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { Sheet, fmtRelative } from "@/components/ui";
import { CommentThread, LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import FeedComposer from "@/components/FeedComposer";
import Link from "next/link";
import { IconMessage, IconMore, IconPen } from "@/components/Icons";
import { uploadAvailable, uploadImage } from "@/lib/upload";

type Filter = "all" | "following" | "saved";
const PAGE = 5;

export default function FeedPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [writing, setWriting] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchY = useRef<number | null>(null);
  const wheelAcc = useRef(0);
  const wheelTimer = useRef<number | null>(null);

  const load = useCallback(async (force = true) => {
    setLoadError(null);
    try {
      setS(await fetchCommunity(force));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load(true);
    setDeepLink(new URLSearchParams(window.location.search).get("post"));
  }, [load]);
  useEffect(() => setLimit(PAGE), [filter]);

  useEffect(() => {
    const el = sentinel.current;
    const root = feedRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { root, rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [s, filter]);

  const items = useMemo(() => {
    if (!s) return [];
    const all = listFeed(s);
    if (filter === "following") return all.filter((f) => s.following.includes(f.authorId) || f.authorId === s.me.id);
    if (filter === "saved") return all.filter((f) => f.saves.includes(s.me.id));
    return all;
  }, [s, filter]);

  // ?post=ID 로 들어오면 그 글까지 불러와 스크롤하고 댓글을 연다
  useEffect(() => {
    if (!deepLink || !s) return;
    const idx = items.findIndex((f) => f.id === deepLink);
    if (idx < 0) {
      setDeepLink(null);
      return;
    }
    if (limit < idx + 1) {
      setLimit(idx + 1);
      return;
    }
    const el = document.getElementById(`reel-${deepLink}`);
    if (el) {
      el.scrollIntoView({ block: "start" });
      setOpenComments(deepLink);
      setDeepLink(null);
    }
  }, [deepLink, s, items, limit]);

  const refresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setPull(0);
    load(true).finally(() => {
      setLimit(PAGE);
      setRefreshing(false);
      feedRef.current?.scrollTo({ top: 0 });
    });
  }, [refreshing, load]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = feedRef.current && feedRef.current.scrollTop <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchY.current === null) return;
    const dy = e.touches[0].clientY - touchY.current;
    setPull(dy > 0 ? Math.min(96, dy * 0.5) : 0);
  };
  const onTouchEnd = () => {
    if (pull >= 64) refresh();
    else setPull(0);
    touchY.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    const el = feedRef.current;
    if (!el) return;
    if (wheelTimer.current) window.clearTimeout(wheelTimer.current);
    if (el.scrollTop <= 0 && e.deltaY < 0 && !refreshing) {
      wheelAcc.current += -e.deltaY;
      setPull(Math.min(96, wheelAcc.current * 0.35));
      if (wheelAcc.current > 260) {
        wheelAcc.current = 0;
        refresh();
        return;
      }
      wheelTimer.current = window.setTimeout(() => {
        wheelAcc.current = 0;
        setPull(0);
      }, 450);
    } else {
      wheelAcc.current = 0;
      if (pull) setPull(0);
    }
  };

  if (loadError) return <div className="screen" style={{ paddingTop: 80 }}><LoadError message={loadError} onRetry={() => load(true)} /></div>;
  if (!s) return null;

  const me = s.me.id;
  const blocked = isBlocked(s.me);
  const currentComments = openComments ? s.feed.find((f) => f.id === openComments) : null;

  return (
    <>
      <div className="feed-top">
        <div className="segmented feed-seg" role="tablist">
          {([["all", "전체"], ["following", "팔로잉"], ["saved", "저장함"]] as [Filter, string][]).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={filter === v} className={filter === v ? "on" : ""} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        {!blocked && (
          <button className="btn sm feed-write" onClick={() => setWriting(true)}>
            <IconPen style={{ width: 15, height: 15 }} /> {isCreator(s, me) ? "위로글 쓰기" : "크리에이터 되기"}
          </button>
        )}
      </div>

      <div className={`ptr ${refreshing ? "spin" : ""}`} style={{ opacity: refreshing ? 1 : Math.min(1, pull / 64), transform: `translate(-50%, ${refreshing ? 0 : Math.min(0, pull - 64)}px)` }} aria-hidden={!refreshing && pull === 0}>
        {refreshing ? "새로고침 중…" : pull >= 64 ? "놓으면 새로고침" : "당겨서 새로고침"}
      </div>
      <div className="feed" role="feed" ref={feedRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onWheel={onWheel} style={{ transform: pull ? `translateY(${pull * 0.4}px)` : undefined, transition: pull ? "none" : "transform 0.25s" }}>
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
          items.slice(0, limit).map((f) => (
            <Reel
              key={f.id}
              s={s}
              post={f}
              revealed={revealed.has(f.id)}
              onReveal={() => setRevealed((r) => new Set(r).add(f.id))}
              onCheer={() => run(setS, () => api.toggleCheer({ kind: "feed", id: f.id }))}
              onSave={() => run(setS, () => api.toggleSave(f.id))}
              onComments={() => setOpenComments(f.id)}
              onMenu={() => setMenu({ kind: "feed", id: f.id })}
              onFollow={() => run(setS, () => api.toggleFollow(f.authorId))}
              onProfile={() => setProfile(f.authorId)}
            />
          ))
        )}
        <div ref={sentinel} style={{ height: 1 }} />
        {items.length > 0 && limit >= items.length && (
          <div className="feed-end">
            <span>다 봤어요</span>
            <button className="btn sm soft" onClick={refresh}>새로고침</button>
          </div>
        )}
      </div>

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

      <Sheet open={Boolean(profile)} onClose={() => setProfile(null)} title="크리에이터">
        {profile && <CreatorProfile s={s} userId={profile} onFollow={() => run(setS, () => api.toggleFollow(profile))} onBio={(b) => run(setS, () => api.updateBio(b))} />}
      </Sheet>

      <FeedComposer
        key={writing ? "write-open" : "write-closed"}
        open={writing}
        firstTime={!isCreator(s, me)}
        onClose={() => setWriting(false)}
        onSubmit={async (pages, bg, bio) => {
          await run(setS, async () => {
            let next = await api.createFeedPost(pages, bg);
            if (bio !== undefined && bio.trim()) next = await api.updateBio(bio);
            return next;
          });
          setWriting(false);
          setFilter("all");
          feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <TargetMenuSheet s={s} target={menu} onClose={() => setMenu(null)} onChange={setS} onReport={(t) => setReporting(t)} onDeleted={(t) => t.kind === "feed" && setOpenComments(null)} />
      <ReportSheet
        key={reporting ? `report-${reporting.kind}-${reporting.id}` : "report-closed"}
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        onSubmit={async (reason) => {
          const t = reporting;
          setReporting(null);
          if (t) await run(setS, () => api.report(t, reason));
        }}
      />
    </>
  );
}

/* ================= 한 장: 콘텐츠(사진+글) 여러 개면 가로로 넘겨 봄 ================= */

function Reel({ s, post, revealed, onReveal, onCheer, onSave, onComments, onMenu, onFollow, onProfile }: {
  s: CommunityStore; post: FeedPost; revealed: boolean; onReveal: () => void; onCheer: () => void; onSave: () => void;
  onComments: () => void; onMenu: () => void; onFollow: () => void; onProfile: () => void;
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
  const pages = pagesOf(post);
  const [idx, setIdx] = useState(0);
  const slides = useRef<HTMLDivElement | null>(null);
  const onSlidesScroll = () => {
    const el = slides.current;
    if (el) setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const anyImage = pages.some((p) => p.image);

  return (
    <section id={`reel-${post.id}`} className={`reel bg-${post.bg} ${anyImage ? "has-img" : ""}`}>
      {flagged ? (
        <div className="reel-body" style={{ pointerEvents: "auto" }}>
          <button className="flagged-box reel-flagged" onClick={onReveal}>
            <b>신고가 누적되어 검토 중인 글이에요</b>
            위로가 아니라는 신고가 {REPORT_THRESHOLD}번 이상 · 눌러서 보기
          </button>
        </div>
      ) : (
        <div className="reel-slides" ref={slides} onScroll={onSlidesScroll} aria-label={`콘텐츠 ${pages.length}개`}>
          {pages.map((p, i) => (
            <article key={i} className={`slide ${p.image ? "has-img" : ""}`} style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} aria-label={`${i + 1}번째 콘텐츠`}>
              <div className="slide-body">
                {p.title && <div className="reel-title">{p.title}</div>}
                <p className="reel-text">{p.text}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {!flagged && pages.length > 1 && (
        <>
          <div className="reel-dots" aria-hidden="true">{pages.map((_, i) => <i key={i} className={i === idx ? "on" : ""} />)}</div>
          <div className="reel-count">{idx + 1}/{pages.length}</div>
        </>
      )}
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
          <span className="ico">💪</span><span className="lbl">{post.cheers.length}</span>
        </button>
        <button className="ract" onClick={onComments} aria-label="위로 댓글">
          <span className="ico"><IconMessage /></span><span className="lbl">{comments}</span>
        </button>
        <button className={`ract ${saved ? "on" : ""}`} onClick={onSave} aria-pressed={saved} aria-label="저장">
          <span className="ico">{saved ? "🔖" : "🏷️"}</span><span className="lbl">{saved ? "저장됨" : "저장"}</span>
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
      <Link href={`/u/${userId}`} className="btn ghost block sm">프로필 전체 보기 · 메시지 보내기</Link>
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
