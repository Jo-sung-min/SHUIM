"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CommunityStore, Target, api, commentsOf, fetchCommunity, isFlagged, isVisible, shoutCatById, userById } from "@/lib/community";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { Empty, SkeletonCard, fmtRelative } from "@/components/ui";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { CheerButton, CommentComposer, CommentRow, LineAction, LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { IconBubble, IconChevronL, IconClose, IconMore } from "@/components/Icons";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import styles from "../shout.module.css";

type Sort = "top" | "new";

/**
 * 외침 글 화면. 유튜브 댓글처럼 글(사진이 있으면 사진부터)이 맨 위에 있고,
 * 그 아래로 댓글 패널이 아래에서 올라와 붙는다. 댓글 입력은 화면 아래 고정.
 */
export default function ShoutPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sort, setSort] = useState<Sort>("top");
  const [revealed, setRevealed] = useState(false);
  const [slide, setSlide] = useState(0);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const barHidden = useHideOnScroll();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setS(await fetchCommunity(true));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const post = s?.posts.find((p) => p.id === id) ?? null;
  const comments = useMemo(() => {
    if (!s || !post) return [];
    const list = commentsOf(s, post.id);
    return sort === "new"
      ? [...list].sort((a, b) => b.createdAt - a.createdAt)
      : [...list].sort((a, b) => b.cheers.length - a.cheers.length || a.createdAt - b.createdAt);
  }, [s, post, sort]);

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace("/shout");
  };
  const openPanel = () => {
    setPanelOpen(true);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };

  const bar = (title: string, right?: React.ReactNode) => (
    <header className={styles.bar} data-hidden={barHidden || undefined}>
      <button type="button" className="icon-btn" aria-label="뒤로" onClick={back}><IconChevronL /></button>
      <h1>{title}</h1>
      {right ?? <span aria-hidden="true" />}
    </header>
  );

  if (loadError) return <>{bar("외침")}<div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!s) return <>{bar("외침")}<div className="screen" role="status" aria-label="글을 불러오고 있어요"><SkeletonCard lines={4} head /></div></>;

  const mine = post?.authorId === s.me.id;
  if (!post || (!isVisible(s, post) && !mine)) {
    return (
      <>
        {bar("외침")}
        <div className="screen">
          <Empty icon={<IconBubble />} title="글을 찾을 수 없어요" action={<Link href="/shout" className="btn ghost">외침으로</Link>}>
            지워졌거나 검토로 가려진 글이에요.
          </Empty>
        </div>
      </>
    );
  }

  const cat = shoutCatById(post.cat);
  const images = post.images ?? [];
  const author = mine ? "나" : userById(s, post.authorId).nick;
  const hiddenByReports = isFlagged(post) && !revealed && !mine;
  const preview = comments.find((cm) => !isFlagged(cm));

  return (
    <>
      {bar(cat.label, <button type="button" className="icon-btn" aria-label="더보기" onClick={() => setMenu({ kind: "post", id: post.id })}><IconMore /></button>)}

      {hiddenByReports ? (
        <div className="screen">
          <button type="button" className="flagged-box" onClick={() => setRevealed(true)}>
            <b>신고가 누적되어 검토 중인 글이에요</b>
            눌러서 볼 수 있어요.
          </button>
        </div>
      ) : (
        <>
          <article aria-label="외침 글">
            {images.length > 0 && (
              <div className={styles.media}>
                <div
                  className={styles.slides}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
                  }}
                >
                  {images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- 사용자 사진(S3/CDN) 주소를 그대로 쓴다
                    <img key={src} src={src} alt={`첨부 사진 ${i + 1}/${images.length}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
                  ))}
                </div>
                {images.length > 1 && (
                  <>
                    <span className={styles.counter}>{Math.min(slide, images.length - 1) + 1}/{images.length}</span>
                    <div className={styles.dots} aria-hidden="true">{images.map((src, i) => <span key={src} data-on={i === slide} />)}</div>
                  </>
                )}
              </div>
            )}
            <div className={styles.body}>
              <div className="post-head">
                <span className="cat"><ShoutCatIcon id={cat.id} /> {cat.label}</span>
                <span>·</span>
                <Link href={`/u/${post.authorId}`} className="nick">{author}</Link>
                <span>·</span>
                <span>{fmtRelative(post.createdAt)}</span>
              </div>
              <p className="post-text">{post.text}</p>
              <div className="post-foot">
                <CheerButton count={post.cheers.length} on={post.cheers.includes(s.me.id)} onClick={() => run(setS, () => api.toggleCheer({ kind: "post", id: post.id }))} />
                <LineAction icon={<IconBubble style={{ width: 22, height: 22 }} />} label={comments.length} onClick={openPanel} ariaLabel="위로 댓글 보기" />
              </div>
              {hasCrisisSignal(post.text) && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}
            </div>
          </article>

          {panelOpen ? (
            <section ref={panelRef} className={styles.panel} aria-labelledby="comments-title">
              <button type="button" className={styles.handle} aria-label="댓글 접기" onClick={() => setPanelOpen(false)} />
              <div className={styles.panelHead}>
                <h2 id="comments-title">댓글<span>{comments.length}</span></h2>
                <button type="button" className="icon-btn" aria-label="댓글 닫기" onClick={() => setPanelOpen(false)}><IconClose /></button>
              </div>
              <div className="chips" role="radiogroup" aria-label="댓글 정렬">
                <button type="button" role="radio" aria-checked={sort === "top"} className={`chip ${sort === "top" ? "on" : ""}`} onClick={() => setSort("top")}>힘내요순</button>
                <button type="button" role="radio" aria-checked={sort === "new"} className={`chip ${sort === "new" ? "on" : ""}`} onClick={() => setSort("new")}>최신순</button>
              </div>
              {comments.length === 0 ? (
                <p className={styles.empty}>아직 위로가 없어요.<br />첫 한마디를 남겨 주세요.</p>
              ) : (
                <div className="comment-list">
                  {comments.map((cm) => (
                    <CommentRow
                      key={cm.id}
                      s={s}
                      comment={cm}
                      onCheer={() => run(setS, () => api.toggleCheer({ kind: "comment", id: cm.id }))}
                      onMenu={() => setMenu({ kind: "comment", id: cm.id })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <button type="button" className={styles.peek} onClick={openPanel}>
              <b>댓글<span>{comments.length}</span></b>
              {/* 검토 중(신고 누적) 댓글은 목록에서도 가려 두므로 미리보기에 쓰지 않는다 */}
              <small>{preview ? preview.text : comments.length ? "눌러서 댓글 보기" : "첫 위로를 남겨 주세요"}</small>
            </button>
          )}

          <div className={styles.dock}>
            <CommentComposer s={s} postId={post.id} onChange={(next) => { setS(next); setPanelOpen(true); }} placeholder="댓글 올리기… 조언보다 '그랬구나'가 먼저예요." />
          </div>
        </>
      )}

      <TargetMenuSheet
        s={s}
        target={menu}
        onClose={() => setMenu(null)}
        onChange={setS}
        onReport={(t) => setReporting(t)}
        onDeleted={(t) => { if (t.kind === "post") router.replace("/shout"); }}
      />
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
