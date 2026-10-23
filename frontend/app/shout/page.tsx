"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CommunityStore,
  Post,
  REPORT_THRESHOLD,
  SHOUT_CATEGORIES,
  ShoutCat,
  Target,
  api,
  commentsOf,
  fetchCommunity,
  isBlocked,
  isFlagged,
  isVisible,
  listFlagged,
  shoutCatById,
  userById,
} from "@/lib/community";
import HelpBanner from "@/components/HelpBanner";
import { Empty, Hero, SkeletonHero, SkeletonList, TopBar, fmtRelative } from "@/components/ui";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { useScrollMemory } from "@/lib/scroll-memory";
import ShoutTabs from "@/components/ShoutTabs";
import { CheerButton, LineAction, LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { IconBubble, IconMore, IconPlus, IconShield } from "@/components/Icons";
import styles from "./shout.module.css";

type Filter = ShoutCat | "all";

export default function ShoutPage() {
  const router = useRouter();
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [reporting, setReporting] = useState<Target | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // 예전 주소(/shout?post=아이디)는 글 화면(/shout/아이디)으로
      const legacy = new URLSearchParams(window.location.search).get("post");
      if (legacy) {
        router.replace(`/shout/${encodeURIComponent(legacy)}`);
        return;
      }
      setS(await fetchCommunity(true));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, [router]);
  useEffect(() => {
    load();
  }, [load]);

  const posts = useMemo(() => {
    if (!s) return [];
    return s.posts.filter((p) => isVisible(s, p) && (filter === "all" || p.cat === filter)).sort((a, b) => b.createdAt - a.createdAt);
  }, [s, filter]);
  useScrollMemory(s !== null);

  if (loadError) {
    return (
      <>
        <TopBar title="외침" />
        <div className="screen"><LoadError message={loadError} onRetry={load} /></div>
      </>
    );
  }
  if (!s) {
    return (
      <>
        <TopBar title="외침" />
        <div className="screen" role="status" aria-label="외침을 불러오고 있어요">
          <ShoutTabs />
          <SkeletonHero />
          <div style={{ height: 16 }} />
          <SkeletonList count={3} lines={3} />
        </div>
      </>
    );
  }

  const blocked = isBlocked(s.me);
  const flaggedCount = listFlagged(s).length;
  const totalCheers = s.posts.reduce((n, p) => n + p.cheers.length, 0) + s.comments.reduce((n, c) => n + c.cheers.length, 0);
  const write = () => router.push(`/write?cat=${filter === "all" ? "misfortune" : filter}`);

  return (
    <>
      <TopBar
        title="외침"
        eyebrow="익명"
        right={
          // 관리자 검토 아이콘은 관리자에게만 (일반 회원·익명에겐 없음)
          s.me.role === "admin" ? (
            <Link href="/admin" className="icon-btn" aria-label="관리자 검토" style={{ position: "relative" }}>
              <IconShield />
              {flaggedCount > 0 && <span className="count-badge">{flaggedCount}</span>}
            </Link>
          ) : undefined
        }
      />
      <div className="screen">
        <ShoutTabs />
        <div style={{ height: 12 }} />
        <Hero label={`나는 ${s.me.nick}`} title="오늘의 불행을 털어내요" stats={[`외침 ${s.posts.filter((p) => isVisible(s, p)).length}개`, `힘내요 ${totalCheers}개`]} />

        {blocked && <div className="notice warn">이 계정은 신고 누적으로 차단되어 글과 댓글을 쓸 수 없어요. 읽는 건 가능해요.</div>}

        <div className="chips" style={{ marginTop: 12 }} role="radiogroup">
          <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>전체</button>
          {SHOUT_CATEGORIES.map((c) => (
            <button key={c.id} className={`chip ${filter === c.id ? "on" : ""}`} onClick={() => setFilter(c.id)}>
              <ShoutCatIcon id={c.id} />
              {c.label}
            </button>
          ))}
        </div>
        {filter !== "all" && <p className="tiny muted" style={{ margin: "2px 4px 10px" }}>{shoutCatById(filter).desc}</p>}

        {posts.length === 0 ? (
          <Empty icon={<IconBubble />} title="아직 외침이 없어요" action={!blocked && <button type="button" className="btn ghost" onClick={write}>첫 외침 남기기</button>}>
            첫 외침을 남기면 누군가 힘내요를 보낼 거예요.
          </Empty>
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
                  onCheer={() => run(setS, () => api.toggleCheer({ kind: "post", id: p.id }))}
                  onOpen={() => router.push(`/shout/${p.id}`)}
                  onMenu={() => setMenu({ kind: "post", id: p.id })}
                />
              )
            )}
          </div>
        )}

        <HelpBanner />
      </div>

      {!blocked && (
        <button className="fab" aria-label="외치기" onClick={write}>
          <IconPlus />
        </button>
      )}

      <TargetMenuSheet s={s} target={menu} onClose={() => setMenu(null)} onChange={setS} onReport={(t) => setReporting(t)} />
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

function PostCard({ s, post, commentCount, onCheer, onOpen, onMenu }: { s: CommunityStore; post: Post; commentCount: number; onCheer: () => void; onOpen: () => void; onMenu: () => void }) {
  const c = shoutCatById(post.cat);
  const author = userById(s, post.authorId);
  const mine = post.authorId === s.me.id;
  const images = post.images ?? [];
  return (
    <article className="card post">
      <div className="post-head">
        <span className="cat"><ShoutCatIcon id={c.id} /> {c.label}</span>
        <span>·</span>
        <Link href={`/u/${post.authorId}`} className="nick" style={{ textDecoration: "underline", textDecorationColor: "var(--border)" }}>{mine ? "나" : author.nick}</Link>
        <span>·</span>
        <span>{fmtRelative(post.createdAt)}</span>
        <button className="icon-btn more" aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 16, height: 16 }} /></button>
      </div>
      <p className="post-text" onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }} role="button" tabIndex={0}>{post.text}</p>
      {images.length > 0 && (
        <button type="button" className={styles.thumbs} onClick={onOpen} aria-label={`사진 ${images.length}장 보기`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 사진(S3/CDN) */}
          <img src={images[0]} alt="" loading="lazy" decoding="async" />
          {images.length > 1 && <span className={styles.thumbsMore}>+{images.length - 1}</span>}
        </button>
      )}
      <div className="post-foot">
        <CheerButton count={post.cheers.length} on={post.cheers.includes(s.me.id)} onClick={onCheer} />
        <LineAction icon={<IconBubble style={{ width: 22, height: 22 }} />} label={commentCount} onClick={onOpen} ariaLabel="위로 댓글" />
      </div>
    </article>
  );
}
