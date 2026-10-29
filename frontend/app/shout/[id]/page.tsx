"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CommunityStore, Target, api, commentsOf, fetchCommunity, isFlagged, isVisible, repliesOf, shoutCatById, topCommentsOf, userById } from "@/lib/community";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { Empty, SkeletonCard, fmtRelative } from "@/components/ui";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { CheerButton, CommentComposer, CommentRow, LineAction, LoadError, ReplyTarget, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { IconBubble, IconChevronL, IconChevronR, IconClock, IconMore, IconSort } from "@/components/Icons";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import styles from "../shout.module.css";
import { splitShout } from "../split";
import TitleChip from "@/components/TitleChip";

type Sort = "top" | "new";

/**
 * 외침 글 화면 (블라인드 글 화면처럼). 경로 → 제목(첫 문장) → 닉네임·시간·댓글 수 → 본문·사진 → 힘내요/댓글,
 * 회색 띠 아래 "댓글 N"과 정렬, 평평한 댓글 목록. 댓글마다 "답글 달기"로 대댓글(한 단계), 댓글 입력은 화면 아래 고정.
 */
export default function ShoutPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("top");
  const [revealed, setRevealed] = useState(false);
  const [slide, setSlide] = useState(0);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
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
  const total = s && post ? commentsOf(s, post.id).length : 0; // 답글 포함
  const comments = useMemo(() => {
    if (!s || !post) return [];
    const list = topCommentsOf(s, post.id);
    return sort === "new"
      ? [...list].sort((a, b) => b.createdAt - a.createdAt)
      : [...list].sort((a, b) => b.cheers.length - a.cheers.length || a.createdAt - b.createdAt);
  }, [s, post, sort]);

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.replace("/shout");
  };
  const scrollToComments = () => document.getElementById("comments-title")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });

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
  const { title, rest } = splitShout(post.text);

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
          <article aria-label="외침 글" className={styles.detail}>
            <nav className={styles.crumb} aria-label="위치">
              <Link href="/shout">외침</Link>
              <IconChevronR aria-hidden="true" />
              <span className={styles.chan}><ShoutCatIcon id={cat.id} />{cat.label}</span>
            </nav>
            <h2 className={styles.detailTitle}>{title}</h2>
            <p className={styles.byline}>
              <Link href={`/u/${post.authorId}`} className={styles.author}>{author}</Link>
              <TitleChip title={userById(s, post.authorId).title} small />
            </p>
            <div className={styles.metaRow}>
              <span className={styles.metaItem}><IconClock aria-hidden="true" />{fmtRelative(post.createdAt)}</span>
              <button type="button" className={styles.metaItem} onClick={scrollToComments} aria-label={`댓글 ${total}개로 이동`}><IconBubble aria-hidden="true" />{total}</button>
            </div>

            {rest && <p className={`post-text ${styles.detailText}`}>{rest}</p>}
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
            {hasCrisisSignal(post.text) && <div className={styles.detailHelp}><HelpBanner alert /></div>}
            <div className={`post-foot ${styles.detailFoot}`}>
              <CheerButton count={post.cheers.length} on={post.cheers.includes(s.me.id)} onClick={() => run(setS, () => api.toggleCheer({ kind: "post", id: post.id }))} />
              <LineAction icon={<IconBubble style={{ width: 22, height: 22 }} />} label={total} onClick={scrollToComments} ariaLabel="위로 댓글로 이동" />
            </div>
          </article>

          <div className={styles.band} aria-hidden="true" />

          {/* 댓글: 회색 띠 아래 "댓글 N"과 정렬, 평평한 목록 */}
          <section className={styles.panel} aria-labelledby="comments-title">
            <div className={styles.panelHead}>
              <h2 id="comments-title">댓글<span>{total}</span></h2>
              {comments.length > 1 && (
                <button type="button" className={styles.sort} onClick={() => setSort((v) => (v === "top" ? "new" : "top"))} aria-label={`댓글 정렬 바꾸기, 지금 ${sort === "top" ? "힘내요순" : "최신순"}`}>
                  <IconSort />
                  {sort === "top" ? "힘내요순" : "최신순"}
                </button>
              )}
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
                    replies={repliesOf(s, cm.id)}
                    onCheer={() => run(setS, () => api.toggleCheer({ kind: "comment", id: cm.id }))}
                    onMenu={() => setMenu({ kind: "comment", id: cm.id })}
                    onReply={setReplyTo}
                    onReplyCheer={(r) => run(setS, () => api.toggleCheer({ kind: "comment", id: r.id }))}
                    onReplyMenu={(r) => setMenu({ kind: "comment", id: r.id })}
                  />
                ))}
              </div>
            )}
          </section>

          <div className={styles.dock}>
            <CommentComposer
              s={s}
              postId={post.id}
              onChange={setS}
              placeholder="댓글 올리기… 조언보다 '그랬구나'가 먼저예요."
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
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
