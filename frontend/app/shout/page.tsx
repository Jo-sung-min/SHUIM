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
import { Empty, SkeletonList, fmtRelative } from "@/components/ui";
import { ShoutCatIcon } from "@/components/CategoryIcon";
import { useScrollMemory } from "@/lib/scroll-memory";
import ShoutTabs from "@/components/ShoutTabs";
import { CheerButton, LineAction, LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { IconBubble, IconChevronR, IconClose, IconMore, IconPlus, IconSearch, IconShield, IconSort } from "@/components/Icons";
import styles from "./shout.module.css";
import { splitShout } from "./split";

type Filter = ShoutCat | "all";
type Sort = "new" | "top";
type Badge = "hot" | "new" | null;

const DAY = 86_400_000;
/** 전체 화면에서 카테고리 구역마다 보여 줄 글 수 */
const SECTION_SIZE = 3;
/** 힘내요 + 댓글(×2) 점수. 목록의 "힘내요순" 정렬과 HOT 표시에 쓴다 */
const score = (s: CommunityStore, p: Post) => p.cheers.length + commentsOf(s, p.id).length * 2;

export default function ShoutPage() {
  const router = useRouter();
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [query, setQuery] = useState("");
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

  const q = query.trim().toLowerCase();
  const posts = useMemo(() => {
    if (!s) return [];
    // 검색: 글 내용·닉네임·카테고리 이름에 검색어가 들어간 글
    const matches = (p: Post) =>
      !q || p.text.toLowerCase().includes(q) || userById(s, p.authorId).nick.toLowerCase().includes(q) || shoutCatById(p.cat).label.toLowerCase().includes(q);
    const list = s.posts.filter((p) => isVisible(s, p) && (filter === "all" || p.cat === filter) && matches(p));
    return sort === "top"
      ? list.sort((a, b) => score(s, b) - score(s, a) || b.createdAt - a.createdAt)
      : list.sort((a, b) => b.createdAt - a.createdAt);
  }, [s, filter, sort, q]);
  /** HOT: 최근 7일 글 중 점수 6 이상인 상위 3개. NEW: 하루 안에 올라온 글 */
  const hot = useMemo(() => {
    if (!s) return new Set<string>();
    const since = Date.now() - 7 * DAY;
    return new Set(
      s.posts
        .filter((p) => isVisible(s, p) && p.createdAt >= since && score(s, p) >= 6)
        .sort((a, b) => score(s, b) - score(s, a))
        .slice(0, 3)
        .map((p) => p.id)
    );
  }, [s]);
  const badgeOf = (p: Post): Badge => (hot.has(p.id) ? "hot" : Date.now() - p.createdAt < DAY ? "new" : null);
  useScrollMemory(s !== null);

  if (loadError) {
    return (
      <>
        <div className="screen"><ShoutTabs /><SearchBar value={query} onChange={setQuery} /><LoadError message={loadError} onRetry={load} /></div>
      </>
    );
  }
  if (!s) {
    return (
      <>
        <div className="screen" role="status" aria-label="외침을 불러오고 있어요">
          <ShoutTabs />
          <SearchBar value={query} onChange={setQuery} />
          <SkeletonList count={4} lines={3} />
        </div>
      </>
    );
  }

  const blocked = isBlocked(s.me);
  const flaggedCount = listFlagged(s).length;
  const write = () => router.push(`/write?cat=${filter === "all" ? "misfortune" : filter}`);
  /** 구역의 "더보기": 그 카테고리 목록으로 바꾸고 맨 위로 */
  const openCategory = (id: ShoutCat) => {
    setFilter(id);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const renderRow = (p: Post) => (
    <li key={p.id} className={styles.row}>
      {isFlagged(p) && !revealed.has(p.id) ? (
        <button className="flagged-box" onClick={() => setRevealed((r) => new Set(r).add(p.id))}>
          <b>신고가 누적되어 검토 중인 글이에요</b>
          위로가 아니라는 신고가 {REPORT_THRESHOLD}번 이상 들어왔어요. 눌러서 볼 수 있어요.
        </button>
      ) : (
        <PostRow
          s={s}
          post={p}
          badge={badgeOf(p)}
          commentCount={commentsOf(s, p.id).length}
          onCheer={() => run(setS, () => api.toggleCheer({ kind: "post", id: p.id }))}
          onOpen={() => router.push(`/shout/${p.id}`)}
          onMenu={() => setMenu({ kind: "post", id: p.id })}
        />
      )}
    </li>
  );

  return (
    <>
      <div className={`screen ${styles.list}`}>
        <ShoutTabs
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
        <SearchBar value={query} onChange={setQuery} />

        {blocked && <div className="notice warn">이 계정은 신고 누적으로 차단되어 글과 댓글을 쓸 수 없어요. 읽는 건 가능해요.</div>}

        {/* 카테고리 + 정렬 (블라인드의 채널·정렬 줄) */}
        <div className={styles.filterBar}>
          <div className={styles.cats} role="radiogroup" aria-label="카테고리">
            <button type="button" role="radio" aria-checked={filter === "all"} className={styles.cat} onClick={() => setFilter("all")}>전체</button>
            {SHOUT_CATEGORIES.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={filter === c.id} className={styles.cat} onClick={() => setFilter(c.id)}>
                <ShoutCatIcon id={c.id} />
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.sort} onClick={() => setSort((v) => (v === "new" ? "top" : "new"))} aria-label={`정렬 바꾸기, 지금 ${sort === "new" ? "최신순" : "힘내요순"}`}>
            <IconSort />
            {sort === "new" ? "최신순" : "힘내요순"}
          </button>
        </div>
        {filter !== "all" && <p className={styles.catDesc}>{shoutCatById(filter).desc}</p>}

        {q && <p className={styles.resultCount} role="status">‘{query.trim()}’ 검색 결과 {posts.length}개</p>}
        <div className={styles.band} aria-hidden="true" />

        {posts.length === 0 ? (
          q ? (
            <Empty icon={<IconSearch />} title="검색 결과가 없어요" action={<button type="button" className="btn ghost" onClick={() => setQuery("")}>검색어 지우기</button>}>
              다른 말로 찾아보거나 카테고리를 바꿔 보세요.
            </Empty>
          ) : (
            <Empty icon={<IconBubble />} title="아직 외침이 없어요" action={!blocked && <button type="button" className="btn ghost" onClick={write}>첫 외침 남기기</button>}>
              오른쪽 아래 + 를 눌러 첫 외침을 남겨 보세요.
            </Empty>
          )
        ) : filter === "all" && !q ? (
          // 전체: 블라인드 홈처럼 카테고리별 구역. 구역마다 몇 개만 보여 주고 "더보기"로 그 카테고리 목록으로
          SHOUT_CATEGORIES.map((c) => {
            const list = posts.filter((p) => p.cat === c.id);
            if (list.length === 0) return null;
            return (
              <section key={c.id} className={styles.section} aria-labelledby={`sec-${c.id}`}>
                <div className={styles.sectionHead}>
                  <h2 id={`sec-${c.id}`}><ShoutCatIcon id={c.id} />{c.label}</h2>
                  <span>{list.length}개</span>
                </div>
                <ul className={styles.rows}>{list.slice(0, SECTION_SIZE).map(renderRow)}</ul>
                <button type="button" className={styles.moreBtn} onClick={() => openCategory(c.id)}>
                  {c.label} 더보기<IconChevronR aria-hidden="true" />
                </button>
                <div className={styles.band} aria-hidden="true" />
              </section>
            );
          })
        ) : (
          <ul className={styles.rows}>{posts.map(renderRow)}</ul>
        )}

        <div className={styles.help}><HelpBanner /></div>
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

/** 탭 바로 아래 검색창. 입력하는 대로 목록을 거른다. 글쓰기는 오른쪽 아래 + 버튼 */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.searchBar}>
      <form
        role="search"
        className={styles.searchBox}
        onSubmit={(e) => {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur(); // 모바일 키보드 닫기
        }}
      >
        <IconSearch aria-hidden="true" />
        <input type="search" enterKeyHint="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="관심 있는 외침을 검색해 보세요" aria-label="외침 검색" maxLength={50} />
        {value && (
          <button type="button" className={styles.clear} aria-label="검색어 지우기" onClick={() => onChange("")}>
            <IconClose />
          </button>
        )}
      </form>
    </div>
  );
}

/** 블라인드 목록 한 줄: 배지 · 제목(첫 문장) · 미리보기 · 카테고리와 닉네임 · 힘내요/댓글/시간 */
function PostRow({ s, post, badge, commentCount, onCheer, onOpen, onMenu }: { s: CommunityStore; post: Post; badge: Badge; commentCount: number; onCheer: () => void; onOpen: () => void; onMenu: () => void }) {
  const c = shoutCatById(post.cat);
  const author = userById(s, post.authorId);
  const mine = post.authorId === s.me.id;
  const images = post.images ?? [];
  const { title, rest } = splitShout(post.text);
  return (
    <article className={styles.item}>
      <Link href={`/shout/${post.id}`} className={styles.itemLink}>
        <div className={styles.itemText}>
          {badge && <span className={styles.badge} data-kind={badge}>{badge === "hot" ? "HOT" : "NEW"}</span>}
          <h3 className={styles.title}>{title}</h3>
          {rest && <p className={styles.preview}>{rest}</p>}
          <p className={styles.byline}>
            <span className={styles.chan}><ShoutCatIcon id={c.id} />{c.label}</span>
            <span aria-hidden="true">·</span>
            <span>{mine ? "나" : author.nick}</span>
          </p>
        </div>
        {images.length > 0 && (
          <span className={styles.thumb}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 사용자 사진(S3/CDN) */}
            <img src={images[0]} alt={`사진 ${images.length}장`} loading="lazy" decoding="async" />
            {images.length > 1 && <span className={styles.thumbsMore}>+{images.length - 1}</span>}
          </span>
        )}
      </Link>
      <div className={`post-foot ${styles.foot}`}>
        <CheerButton small count={post.cheers.length} on={post.cheers.includes(s.me.id)} onClick={onCheer} />
        <LineAction icon={<IconBubble style={{ width: 18, height: 18 }} />} label={commentCount} onClick={onOpen} ariaLabel={`위로 댓글 ${commentCount}개`} />
        <span className={styles.time}>{fmtRelative(post.createdAt)}</span>
        <button type="button" className={`icon-btn ${styles.more}`} aria-label="더보기" onClick={onMenu}><IconMore style={{ width: 16, height: 16 }} /></button>
      </div>
    </article>
  );
}
