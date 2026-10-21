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

      <WriteSheet
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

/* ================= 글쓰기: 콘텐츠(사진+제목+글) 1~FEED_MAX_PAGES개 ================= */

type Draft = { image: string; title: string; text: string };
const emptyDraft = (): Draft => ({ image: "", title: "", text: "" });

function WriteSheet({ open, firstTime, onClose, onSubmit }: {
  open: boolean; firstTime: boolean; onClose: () => void;
  onSubmit: (pages: FeedContent[], bg: number, bio: string | undefined) => Promise<void>;
}) {
  const [pages, setPages] = useState<Draft[]>([emptyDraft()]);
  const [cur, setCur] = useState(0);
  const [bg, setBg] = useState(0);
  const [bio, setBio] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  useEffect(() => {
    if (open) uploadAvailable().then(setCanUpload);
  }, [open]);

  const page = pages[cur];
  const update = (patch: Partial<Draft>, at = cur) => setPages((ps) => ps.map((p, i) => (i === at ? { ...p, ...patch } : p)));
  const addPage = () => {
    if (pages.length >= FEED_MAX_PAGES) return;
    setPages((ps) => [...ps, emptyDraft()]);
    setCur(pages.length);
  };
  const removePage = () => {
    if (pages.length <= 1) {
      setPages([emptyDraft()]);
      return;
    }
    setPages((ps) => ps.filter((_, i) => i !== cur));
    setCur((c) => Math.max(0, c - 1));
  };
  const move = (dir: -1 | 1) => {
    const to = cur + dir;
    if (to < 0 || to >= pages.length) return;
    setPages((ps) => {
      const next = [...ps];
      [next[cur], next[to]] = [next[to], next[cur]];
      return next;
    });
    setCur(to);
  };
  const okUrl = (u: string) => /^(\/|https?:\/\/)/.test(u.trim());

  // 사진 여러 장을 한 번에 고르면: 현재 콘텐츠부터 채우고, 남는 사진은 새 콘텐츠로 (글은 나중에 적음)
  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploadError(null);
    const list = Array.from(files);
    try {
      let at = cur;
      for (let i = 0; i < list.length; i++) {
        setUploading(`${i + 1}/${list.length} · 0%`);
        const r = await uploadImage(list[i], (pct) => setUploading(`${i + 1}/${list.length} · ${pct}%`));
        if (i === 0) update({ image: r.url }, at);
        else {
          at = Math.min(at + 1, FEED_MAX_PAGES - 1);
          setPages((ps) => {
            if (ps.length >= FEED_MAX_PAGES && at >= ps.length) return ps;
            const next = [...ps];
            if (at >= next.length) next.push({ ...emptyDraft(), image: r.url });
            else if (!next[at].image) next[at] = { ...next[at], image: r.url };
            else next.splice(at, 0, { ...emptyDraft(), image: r.url });
            return next.slice(0, FEED_MAX_PAGES);
          });
        }
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "업로드하지 못했어요");
    } finally {
      setUploading(null);
    }
  };

  const ready = pages.every((p) => p.text.trim()) && !busy && !uploading;
  const emptyCount = pages.filter((p) => !p.text.trim()).length;

  return (
    <Sheet open={open} onClose={onClose} title={firstTime ? "크리에이터 되기" : "위로글 쓰기"}>
      <div className="stack">
        {firstTime && <div className="notice">위로글을 하나 올리면 크리에이터가 돼요. 짧게, 한 사람에게 말하듯 써요. 조언보다 알아주는 말이 먼저예요.</div>}

        {/* 콘텐츠 탭 */}
        <div className="field">
          <label>콘텐츠 {pages.length}/{FEED_MAX_PAGES}{pages.length > 1 ? " · 가로로 넘기면 사진과 글이 함께 바뀌어요" : ""}</label>
          <div className="page-tabs">
            {pages.map((p, i) => (
              <button key={i} type="button" className={`page-tab ${i === cur ? "on" : ""} ${p.text.trim() ? "" : "empty"}`} style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} onClick={() => setCur(i)} aria-label={`${i + 1}번째 콘텐츠`}>
                <span>{i + 1}</span>
              </button>
            ))}
            {pages.length < FEED_MAX_PAGES && (
              <button type="button" className="page-tab add" onClick={addPage} aria-label="콘텐츠 추가">+</button>
            )}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="text-btn muted" onClick={() => move(-1)} disabled={cur === 0}>← 앞으로</button>
            <button type="button" className="text-btn muted" onClick={() => move(1)} disabled={cur >= pages.length - 1}>뒤로 →</button>
            <button type="button" className="text-btn danger" style={{ marginLeft: "auto" }} onClick={removePage}>이 콘텐츠 삭제</button>
          </div>
        </div>

        {/* 현재 콘텐츠 편집 */}
        <div className="field">
          <label>{cur + 1}번째 사진 (선택)</label>
          {page.image ? (
            <div className="thumbs">
              <div className="thumb" style={{ backgroundImage: `url(${page.image})` }}>
                <button type="button" className="x" aria-label="사진 빼기" onClick={() => update({ image: "" })}>×</button>
              </div>
            </div>
          ) : null}
          {canUpload && (
            <label className={`btn ghost sm upload-btn ${uploading ? "busy" : ""}`}>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={Boolean(uploading)} onChange={(e) => onPickFiles(e.target.files)} />
              {uploading ? `올리는 중… ${uploading}` : "📷 내 사진 올리기 (여러 장이면 콘텐츠가 늘어나요)"}
            </label>
          )}
          {uploadError && <span className="tiny" style={{ color: "var(--down)" }}>{uploadError}</span>}
          <div className="img-picks">
            <button type="button" className={`img-pick none ${!page.image ? "on" : ""}`} onClick={() => update({ image: "" })} aria-label="그림 없음">없음</button>
            {FEED_IMAGES.map((im) => (
              <button key={im.src} type="button" className={`img-pick ${page.image === im.src ? "on" : ""}`} style={{ backgroundImage: `url(${im.src})` }} onClick={() => update({ image: im.src })} aria-label={im.label} title={im.label} />
            ))}
          </div>
          <div className="inline-input">
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder={canUpload ? "또는 이미지 주소 (https://…)" : "이미지 주소 (https://…) · S3 설정 시 사진 업로드 가능"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (okUrl(imageUrl)) { update({ image: imageUrl.trim() }); setImageUrl(""); } } }} />
            <button type="button" className="btn sm soft" disabled={!okUrl(imageUrl)} onClick={() => { update({ image: imageUrl.trim() }); setImageUrl(""); }}>적용</button>
          </div>
        </div>
        <div className="field">
          <label>{cur + 1}번째 제목 (선택)</label>
          <input value={page.title} onChange={(e) => update({ title: e.target.value })} maxLength={24} placeholder="예: 떨어진 날에게" />
        </div>
        <div className="field">
          <label>{cur + 1}번째 글</label>
          <textarea value={page.text} onChange={(e) => update({ text: e.target.value })} maxLength={280} placeholder={"줄바꿈으로 호흡을 나눠요.\n\n예)\n떨어진 날은\n내가 모자란 날이 아니라\n거기까지 걸어간 날이에요."} style={{ minHeight: 120 }} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{page.text.length}/280</span>
        </div>

        <div className="field">
          <label>배경 (사진이 없는 콘텐츠에)</label>
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

        {/* 현재 콘텐츠 미리보기 */}
        <div className={`reel preview bg-${bg} ${page.image ? "has-img" : ""}`} style={page.image ? { backgroundImage: `url(${page.image})` } : undefined}>
          <div className="reel-body">
            {page.title && <div className="reel-title">{page.title}</div>}
            <p className="reel-text">{page.text || "미리보기"}</p>
          </div>
          {pages.length > 1 && <div className="reel-count" style={{ top: 10, right: 10 }}>{cur + 1}/{pages.length}</div>}
        </div>
        {pages.some((p) => hasCrisisSignal(p.text)) && <HelpBanner alert />}
        {emptyCount > 0 && pages.length > 1 && <p className="tiny muted" style={{ margin: 0 }}>글이 비어 있는 콘텐츠가 {emptyCount}개 있어요. 채우거나 삭제해야 올릴 수 있어요.</p>}
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button
          className="btn"
          disabled={!ready}
          onClick={async () => {
            setBusy(true);
            await onSubmit(
              pages.map((p) => ({ image: p.image.trim() || undefined, title: p.title.trim() || undefined, text: p.text.trim() })),
              bg,
              firstTime ? bio : undefined
            );
            setBusy(false);
          }}
        >
          {busy ? "올리는 중…" : pages.length > 1 ? `콘텐츠 ${pages.length}개 올리기` : "올리기"}
        </button>
      </div>
    </Sheet>
  );
}
