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
import { useScrollMemory } from "@/lib/scroll-memory";
import ShoutTabs from "@/components/ShoutTabs";
import { LoadError } from "@/components/CommunityUI";
import { IconBubble, IconClose, IconImage, IconPlus, IconSearch, IconShield } from "@/components/Icons";
import styles from "./shout.module.css";
import { splitShout } from "./split";
import { circleTag } from "@/lib/circles";
import { route } from "@/lib/routes";

type Filter = ShoutCat | "all";
/** 전체글 / 개념글 (힘내요·댓글을 많이 받은 글) */
type Board = "all" | "best";

const DAY = 86_400_000;
/** 힘내요 + 댓글(×2) 점수가 이만큼이면 개념글 (샘플 글 기준 위쪽 열에 하나쯤) */
const BEST_SCORE = 10;
const score = (s: CommunityStore, p: Post) => p.cheers.length + commentsOf(s, p.id).length * 2;

/**
 * 광장: 게시판처럼 빽빽한 글 목록. 위에서 광장(불행광장·불안광장…)을 고르고, 전체글/개념글을 나눠 본다.
 * 한 줄은 [말머리] 제목 [댓글 수] N, 아래 회색 줄에 닉네임 | 시간 | 힘내요. 힘내요·신고는 글 화면에서
 */
export default function ShoutPage() {
  const router = useRouter();
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [board, setBoard] = useState<Board>("all");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      // 예전 주소(/shout?post=아이디)는 글 화면(/shout/아이디)으로
      const legacy = new URLSearchParams(window.location.search).get("post");
      if (legacy) {
        router.replace(route(`/shout/${encodeURIComponent(legacy)}`));
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
  /** 지금 광장의 글 (검색 반영). 개념글 탭은 그중 점수가 넘는 글만, 둘 다 최신순 */
  const inGallery = useMemo(() => {
    if (!s) return [];
    // 검색: 글 내용·닉네임·광장 이름에 검색어가 들어간 글
    const matches = (p: Post) =>
      !q || p.text.toLowerCase().includes(q) || (p.communityId ? circleTag(p) : userById(s, p.authorId).nick).toLowerCase().includes(q) || shoutCatById(p.cat).label.toLowerCase().includes(q);
    return s.posts.filter((p) => isVisible(s, p) && (filter === "all" || p.cat === filter) && matches(p)).sort((a, b) => b.createdAt - a.createdAt);
  }, [s, filter, q]);
  const best = useMemo(() => (s ? inGallery.filter((p) => score(s, p) >= BEST_SCORE) : []), [s, inGallery]);
  const posts = board === "best" ? best : inGallery;
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
  const gallery = filter === "all" ? null : shoutCatById(filter);
  const renderRow = (p: Post) => (
    <li key={p.id} className={styles.row}>
      {isFlagged(p) && !revealed.has(p.id) ? (
        <button className={styles.flagged} onClick={() => setRevealed((r) => new Set(r).add(p.id))}>
          신고 {REPORT_THRESHOLD}번 이상 들어와 검토 중인 글이에요. 눌러서 볼 수 있어요.
        </button>
      ) : (
        <PostRow s={s} post={p} showHead={filter === "all"} commentCount={commentsOf(s, p.id).length} />
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

        {/* 광장 고르기: 게시판 목록처럼 글자 칩 한 줄 */}
        <div className={styles.filterBar}>
          <div className={styles.cats} role="radiogroup" aria-label="광장">
            <button type="button" role="radio" aria-checked={filter === "all"} className={styles.cat} onClick={() => setFilter("all")}>전체</button>
            {SHOUT_CATEGORIES.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={filter === c.id} className={styles.cat} onClick={() => setFilter(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 광장 머리: 이름 · 설명 · 글 수 */}
        <div className={styles.galHead}>
          <div className={styles.galTitle}>
            <h2>{gallery ? gallery.label : "전체 광장"}</h2>
            <span>글 {inGallery.length}</span>
          </div>
          <p>{gallery ? gallery.desc : "모든 광장의 새 글을 한곳에서 봐요"}</p>
        </div>

        {/* 전체글 / 개념글 */}
        <div className={styles.boardBar}>
          <div className={styles.boardTabs} role="tablist" aria-label="글 모아 보기">
            <button type="button" role="tab" aria-selected={board === "all"} onClick={() => setBoard("all")}>전체글</button>
            <button type="button" role="tab" aria-selected={board === "best"} onClick={() => setBoard("best")}>개념글 <small>{best.length}</small></button>
          </div>
          {q && <span className={styles.resultCount} role="status">‘{query.trim()}’ {posts.length}개</span>}
        </div>

        {posts.length === 0 ? (
          q ? (
            <Empty icon={<IconSearch />} title="검색 결과가 없어요" action={<button type="button" className="btn ghost" onClick={() => setQuery("")}>검색어 지우기</button>}>
              다른 말로 찾아보거나 광장을 바꿔 보세요.
            </Empty>
          ) : board === "best" ? (
            <Empty icon={<IconBubble />} title="아직 개념글이 없어요">
              힘내요와 위로 댓글을 많이 받은 글이 여기 모여요.
            </Empty>
          ) : (
            <Empty icon={<IconBubble />} title="아직 글이 없어요" action={!blocked && <button type="button" className="btn ghost" onClick={write}>첫 글 남기기</button>}>
              오른쪽 아래 + 를 눌러 첫 글을 남겨 보세요.
            </Empty>
          )
        ) : (
          <ul className={styles.rows}>{posts.map(renderRow)}</ul>
        )}

        <div className={styles.help}><HelpBanner /></div>
      </div>

      {!blocked && (
        <button className="fab" aria-label={`${gallery ? gallery.label : "광장"}에 글쓰기`} onClick={write}>
          <IconPlus />
        </button>
      )}
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
        <input type="search" enterKeyHint="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="광장 글을 검색해 보세요" aria-label="광장 글 검색" maxLength={50} />
        {value && (
          <button type="button" className={styles.clear} aria-label="검색어 지우기" onClick={() => onChange("")}>
            <IconClose />
          </button>
        )}
      </form>
    </div>
  );
}

/** 게시판 한 줄: [말머리] 제목(첫 문장) 사진표시 [댓글 수] N, 아래 닉네임 | 시간 | 힘내요 */
function PostRow({ s, post, showHead, commentCount }: { s: CommunityStore; post: Post; showHead: boolean; commentCount: number }) {
  const c = shoutCatById(post.cat);
  const mine = post.authorId === s.me.id;
  const hasImages = (post.images ?? []).length > 0;
  const fresh = Date.now() - post.createdAt < DAY;
  const { title } = splitShout(post.text);
  // 소로우 사연: 보낸 사람 대신 소로우 이름과 #번호
  const who = post.communityId ? `${circleTag(post)}${mine ? " · 내 사연" : ""}` : mine ? "나" : userById(s, post.authorId).nick;
  return (
    <Link href={route(`/shout/${post.id}`)} className={styles.bItem}>
      <h3 className={styles.bTitle}>
        {showHead && <span className={styles.head}>[{c.head}]</span>}
        {title}
        {hasImages && <IconImage className={styles.imgMark} aria-label="사진 있음" />}
        {commentCount > 0 && <span className={styles.reply} aria-label={`댓글 ${commentCount}개`}>[{commentCount}]</span>}
        {fresh && <span className={styles.fresh} aria-label="새 글">N</span>}
      </h3>
      <p className={styles.bMeta}>
        <span className={post.communityId ? styles.circleTag : undefined}>{who}</span>
        <span>{fmtRelative(post.createdAt)}</span>
        <span>힘내요 {post.cheers.length}</span>
      </p>
    </Link>
  );
}
