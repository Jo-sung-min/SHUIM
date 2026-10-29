"use client";

import TitleChip from "@/components/TitleChip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommunityStore,
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
import { Sheet, fmtRelative } from "@/components/ui";
import { CheerButton, CommentThread, LineAction, LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import FeedComposer from "@/components/FeedComposer";
import Link from "next/link";
import { IconBookmark, IconBubble, IconFist, IconMore, IconPen } from "@/components/Icons";
import { showToast, toastSuccess } from "@/lib/toast";
import { readScrollMemory, useElementScrollMemory } from "@/lib/scroll-memory";
import styles from "./feed-media.module.css";
import Highlighted from "@/components/Highlighted";
import { route } from "@/lib/routes";

type Filter = "all" | "following" | "saved";
const FILTERS: [Filter, string][] = [["all", "전체"], ["following", "리스닝"], ["saved", "저장함"]];
const PAGE = 5;

export default function FeedPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 다른 화면에 갔다가 돌아오면 보던 필터·위치·불러온 개수를 그대로 이어 본다
  const [remembered] = useState(() => readScrollMemory<{ limit: number; filter: Filter }>("/feed")?.extra ?? null);
  const [filter, setFilter] = useState<Filter>(remembered?.filter ?? "all");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [writing, setWriting] = useState(false);
  const [topMenu, setTopMenu] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(Math.max(PAGE, remembered?.limit ?? PAGE));
  const firstFilter = useRef(true);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollToNewPost = useRef(false);
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
  useEffect(() => {
    if (firstFilter.current) { firstFilter.current = false; return; }
    setLimit(PAGE);
  }, [filter]);
  useEffect(() => {
    if (!writing && scrollToNewPost.current && s) {
      scrollToNewPost.current = false;
      feedRef.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [s, writing]);

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
  useElementScrollMemory(feedRef, s !== null && items.length > 0, "/feed", { limit, filter });

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
  if (!s) {
    return (
      <div className="sk-reel" role="status" aria-label="위로글을 불러오고 있어요">
        <div style={{ width: "100%", display: "grid", gap: 12 }}>
          <div className="sk w40" />
          <div className="sk sk-line lg" />
          <div className="sk sk-line lg w80" />
          <div className="sk w60" />
        </div>
      </div>
    );
  }

  const me = s.me.id;
  const blocked = isBlocked(s.me);
  const currentComments = openComments ? s.feed.find((f) => f.id === openComments) : null;

  return (
    <>
      <div className="feed-top">
        <span className="feed-title">{FILTERS.find(([v]) => v === filter)?.[1]}</span>
        <button className="feed-more" onClick={() => setTopMenu(true)} aria-label="피드 메뉴" aria-haspopup="dialog">
          <IconMore />
        </button>
      </div>

      <div className={`ptr ${refreshing ? "spin" : ""}`} style={{ opacity: refreshing ? 1 : Math.min(1, pull / 64), transform: `translate(-50%, ${refreshing ? 0 : Math.min(0, pull - 64)}px)` }} aria-hidden={!refreshing && pull === 0}>
        {refreshing ? "새로고침 중…" : pull >= 64 ? "놓으면 새로고침" : "당겨서 새로고침"}
      </div>
      <div className="feed" role="feed" ref={feedRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onWheel={onWheel} style={{ transform: pull ? `translateY(${pull * 0.4}px)` : undefined, transition: pull ? "none" : "transform 0.25s" }}>
        {items.length === 0 ? (
          <section className="reel bg-1">
            <div className="reel-body">
              <div className="reel-title">{filter === "saved" ? "저장함" : filter === "following" ? "리스닝" : "위로 피드"}</div>
              <p className="reel-text">
                {filter === "saved" ? "저장한 위로글이 아직 없어요.\n마음에 닿는 글에서 저장을 눌러요." : filter === "following" ? "리스닝 중인 크리에이터가 없어요.\n전체에서 마음에 드는 글쓴이를 리스닝해요." : "아직 위로글이 없어요.\n첫 크리에이터가 되어볼까요."}
              </p>
              {filter === "following" ? (
                <button type="button" className="btn ghost" style={{ marginTop: 16 }} onClick={() => setFilter("all")}>전체 피드 보기</button>
              ) : filter === "all" && !blocked ? (
                <button type="button" className="btn ghost" style={{ marginTop: 16 }} onClick={() => setWriting(true)}>첫 위로글 쓰기</button>
              ) : null}
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
            <button type="button" className="btn sm ghost" onClick={refresh}>새로고침</button>
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

      <Sheet open={topMenu} onClose={() => setTopMenu(false)} title="위로 피드">
        <div className="stack" style={{ gap: 6 }}>
          {FILTERS.map(([v, l]) => (
            <button key={v} type="button" className={`reason glass ${filter === v ? "on" : ""}`} onClick={() => { setFilter(v); setTopMenu(false); feedRef.current?.scrollTo({ top: 0 }); }}>
              <span className="radio" />
              <span><b>{l}</b><small>{v === "all" ? "모든 크리에이터의 위로글" : v === "following" ? "리스닝 중인 크리에이터만" : "내가 저장한 글"}</small></span>
            </button>
          ))}
          {!blocked && (
            <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={() => { setTopMenu(false); setWriting(true); }}>
              <IconPen style={{ width: 16, height: 16 }} /> {isCreator(s, me) ? "위로글 쓰기" : "크리에이터 되기"}
            </button>
          )}
        </div>
      </Sheet>

      <FeedComposer
        open={writing}
        firstTime={!isCreator(s, me)}
        onClose={() => setWriting(false)}
        onSubmit={async (pages, bg, bio, clientRequestId) => {
          // Let publishing errors reach the composer so its photo/text draft survives.
          const next = await api.createFeedPost(pages, bg, clientRequestId);
          setS(next);
          if (bio !== undefined && bio.trim()) {
            try { setS(await api.updateBio(bio)); }
            catch { showToast("게시물은 올라갔어요. 소개는 프로필에서 다시 저장해 주세요."); }
          }
          setWriting(false);
          scrollToNewPost.current = true;
          setFilter("all");
          toastSuccess("위로글을 올렸어요");
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
  onComments: () => void; onMenu: () => void; onFollow: () => Promise<boolean>; onProfile: () => void;
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
  const [followingBusy, setFollowingBusy] = useState(false);
  const followLock = useRef(false);
  const slides = useRef<HTMLDivElement | null>(null);
  const handleFollow = async () => {
    if (followLock.current) return;
    followLock.current = true;
    setFollowingBusy(true);
    try { await onFollow(); }
    catch { showToast("리스닝을 변경하지 못했어요. 다시 시도해 주세요."); }
    finally { followLock.current = false; setFollowingBusy(false); }
  };
  const onSlidesScroll = () => {
    const el = slides.current;
    if (el) setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const anyImage = pages.some((p) => p.image);

  return (
    <section id={`reel-${post.id}`} className={`reel bg-${post.bg} ${anyImage ? "has-img " + styles.photoPost : ""}`}>
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
            <article key={i} className={`slide ${p.image ? "has-img " + styles.photoSlide : ""}`} aria-label={`${i + 1}번째 콘텐츠`}>
              {p.image && <div className={styles.photoFrame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={p.title || `${author.nick}님의 ${i + 1}번째 사진`} loading="lazy" />
              </div>}
              <div className="slide-body">
                {(p.title || (p.image && post.title)) && <div className="reel-title">{p.title || post.title}</div>}
                {(p.text || (p.image && post.text)) && <p className="reel-text"><Highlighted text={p.text || post.text} /></p>}
              </div>
            </article>
          ))}
        </div>
      )}
      {!flagged && pages.length > 1 && (
        <>
          <div className={`reel-dots ${styles.pageDots}`} aria-label="사진 넘기기">{pages.map((_, i) => <button type="button" key={i} aria-label={`${i + 1}번째 콘텐츠 보기`} aria-pressed={i === idx} onClick={() => slides.current?.scrollTo({ left: slides.current.clientWidth * i, behavior: "smooth" })}><i className={i === idx ? "on" : ""} /></button>)}</div>
          <div className="reel-count">{idx + 1}/{pages.length}</div>
        </>
      )}
      <div className="reel-meta">
        <button className="reel-author" onClick={onProfile}>
          <span className="avatar">{author.nick.slice(0, 1)}</span>
          <span>
            <b>{mine ? `${author.nick} (나)` : author.nick} <TitleChip title={author.title} small /></b>
            <small>크리에이터 · 리스너 {creator.followers.length} · {fmtRelative(post.createdAt)}</small>
          </span>
        </button>
        {!mine && (
          <button type="button" className={`pillbtn follow ${following ? "on" : ""}`} onClick={handleFollow} aria-pressed={following} aria-busy={followingBusy} disabled={followingBusy}>
            {followingBusy ? "변경 중…" : following ? "리스닝 중" : "리스닝"}
          </button>
        )}
      </div>
      <div className="reel-actions">
        <CheerButton vertical count={post.cheers.length} on={cheered} onClick={onCheer} />
        <LineAction vertical icon={<IconBubble />} label={comments} onClick={onComments} ariaLabel="위로 댓글" />
        <LineAction vertical on={saved} icon={<IconBookmark style={saved ? { fill: "currentColor" } : undefined} />} label="저장" onClick={onSave} ariaLabel={saved ? "저장 취소" : "저장"} />
        <LineAction vertical icon={<IconMore />} onClick={onMenu} ariaLabel="더보기" />
      </div>
    </section>
  );
}

/* ================= 크리에이터 프로필 ================= */

function CreatorProfile({ s, userId, onFollow, onBio }: { s: CommunityStore; userId: string; onFollow: () => Promise<boolean>; onBio: (b: string) => Promise<boolean> }) {
  const u = userById(s, userId);
  const c = creatorOf(s, userId);
  const mine = userId === s.me.id;
  const posts = s.feed.filter((f) => f.authorId === userId && !f.hidden);
  const cheers = posts.reduce((n, f) => n + f.cheers.length, 0);
  const [bio, setBio] = useState(c.bio);
  const [editing, setEditing] = useState(false);
  const [followingBusy, setFollowingBusy] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const followLock = useRef(false);
  const bioLock = useRef(false);
  const handleFollow = async () => {
    if (followLock.current) return;
    followLock.current = true;
    setFollowingBusy(true);
    try { await onFollow(); }
    catch { showToast("리스닝을 변경하지 못했어요. 다시 시도해 주세요."); }
    finally { followLock.current = false; setFollowingBusy(false); }
  };
  const saveBio = async () => {
    if (bioLock.current) return;
    bioLock.current = true;
    setSavingBio(true);
    try {
      if (await onBio(bio)) setEditing(false);
    } catch { showToast("소개를 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { bioLock.current = false; setSavingBio(false); }
  };
  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <span className="avatar lg">{u.nick.slice(0, 1)}</span>
        <div className="grow">
          <b style={{ fontSize: 17 }}>{u.nick}{mine ? " (나)" : ""} <TitleChip title={u.title} small /></b>
          <div className="tiny muted">리스너 {c.followers.length} · 위로글 {posts.length} · 받은 힘내요 {cheers}</div>
        </div>
        {!mine && (
          <button type="button" className={`pillbtn follow ${s.following.includes(userId) ? "on" : ""}`} onClick={handleFollow} aria-pressed={s.following.includes(userId)} aria-busy={followingBusy} disabled={followingBusy}>
            {followingBusy ? "변경 중…" : s.following.includes(userId) ? "리스닝 중" : "리스닝"}
          </button>
        )}
      </div>
      {mine && editing ? (
        <div className="field" aria-busy={savingBio}>
          <label htmlFor="creator-bio">소개</label>
          <input id="creator-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={80} placeholder="어떤 사람에게 어떤 글을 쓰는지 한 줄" disabled={savingBio} autoFocus />
          <div className="sheet-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={savingBio}>취소</button>
            <button type="button" className="btn" onClick={saveBio} disabled={savingBio}>{savingBio ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      ) : (
        <p className="brief-text muted" style={{ margin: 0 }}>
          {c.bio || (mine ? "소개가 아직 없어요." : "소개가 없어요.")}
          {mine && <button className="text-btn" style={{ marginLeft: 6 }} onClick={() => setEditing(true)}>수정</button>}
        </p>
      )}
      <Link href={route(`/u/${userId}`)} className="btn ghost block sm">프로필 전체 보기 · 메시지 보내기</Link>
      {posts.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {posts.slice(0, 5).map((f) => (
            <div key={f.id} className="card flat" style={{ padding: "10px 12px", fontSize: 13.5 }}>
              {f.title && <b style={{ display: "block", fontSize: 12, color: "var(--text-2)" }}>{f.title}</b>}
              <span style={{ whiteSpace: "pre-wrap" }}>{f.text.slice(0, 60)}{f.text.length > 60 ? "…" : ""}</span>
              <div className="tiny muted" style={{ marginTop: 4 }}><span className="inline-fist"><IconFist /> {f.cheers.length}</span> · {fmtRelative(f.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
