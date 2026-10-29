"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CIRCLE_KINDS, Circle, CircleKind, browseCircles, fetchWarmCircles } from "@/lib/circles";
import ShoutTabs from "@/components/ShoutTabs";
import { CircleRow } from "@/components/CircleRow";
import { LoadError } from "@/components/CommunityUI";
import { Empty, SkeletonList } from "@/components/ui";
import { IconClose, IconLeaf, IconPlus, IconSearch } from "@/components/Icons";
import shout from "../shout/shout.module.css";
import styles from "./circle.module.css";

/** 소로우 둘러보기: 종류·이름으로 찾기, 이번 주 가장 따뜻한 소로우. 멤버 10명이 넘어야 목록에 나온다 */
export default function CircleBrowsePage() {
  const [kind, setKind] = useState<CircleKind | "">("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Circle[] | null>(null);
  const [warm, setWarm] = useState<Circle[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      browseCircles(kind, query.trim())
        .then((c) => alive && (setList(c), setLoadError(null)))
        .catch((e) => alive && setLoadError(e instanceof Error ? e.message : "연결 실패"));
    }, query ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [kind, query, reload]);
  useEffect(() => {
    fetchWarmCircles().then(setWarm).catch(() => setWarm([]));
  }, []);

  return (
    <>
      <div className={`screen ${styles.list}`}>
        <ShoutTabs />
        <div className={shout.searchBar}>
          <form role="search" className={shout.searchBox} onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
            <IconSearch aria-hidden="true" />
            <input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학교·회사·동네 이름으로 찾아보세요" aria-label="소로우 검색" maxLength={30} />
            {query && <button type="button" className={shout.clear} aria-label="검색어 지우기" onClick={() => setQuery("")}><IconClose /></button>}
          </form>
        </div>

        <div className={styles.kinds} role="radiogroup" aria-label="소로우 종류">
          <button type="button" role="radio" aria-checked={kind === ""} className={styles.kind} onClick={() => setKind("")}>전체</button>
          {CIRCLE_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={styles.kind} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>

        {!query && !kind && warm.length > 0 && (
          <>
            <div className={styles.head}><h2>이번 주 가장 따뜻한 소로우</h2></div>
            <p className={styles.sub}>다른 소로우의 사연에 위로를 가장 많이 건넨 곳이에요.</p>
            <ul className={styles.circles}>{warm.map((c) => <li key={c.id}><CircleRow c={c} rank={c.rank} /></li>)}</ul>
            <div className={styles.band} aria-hidden="true" />
          </>
        )}

        <div className={styles.head}><h2>{query ? `‘${query.trim()}’ 소로우` : "소로우 둘러보기"}</h2></div>
        {loadError ? (
          <LoadError message={loadError} onRetry={() => setReload((n) => n + 1)} />
        ) : list === null ? (
          <div role="status" aria-label="소로우를 불러오고 있어요"><SkeletonList count={4} lines={1} /></div>
        ) : list.length === 0 ? (
          <Empty icon={<IconLeaf />} title={query ? "찾는 소로우가 없어요" : "아직 둘러볼 소로우가 없어요"} action={<Link href="/c/new" className="btn ghost"><IconPlus />소로우 열기</Link>}>
            멤버가 10명이 넘은 소로우만 여기에 보여요. 작은 소로우는 주소(링크)로 들어갈 수 있어요.
          </Empty>
        ) : (
          <ul className={styles.circles}>{list.map((c) => <li key={c.id}><CircleRow c={c} /></li>)}</ul>
        )}
      </div>
      <Link href="/c/new" className="fab" aria-label="소로우 열기"><IconPlus /></Link>
    </>
  );
}
