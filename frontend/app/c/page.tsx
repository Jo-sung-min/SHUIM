"use client";

import { useEffect, useState } from "react";
import { CIRCLE_KINDS, Circle, CircleKind, browseCircles, fetchWarmCircles } from "@/lib/circles";
import ShoutTabs from "@/components/ShoutTabs";
import { CircleRow } from "@/components/CircleRow";
import { LoadError } from "@/components/CommunityUI";
import { Empty, SkeletonList } from "@/components/ui";
import { IconClose, IconLeaf, IconSearch } from "@/components/Icons";
import shout from "../shout/shout.module.css";
import styles from "./circle.module.css";

/** 소로우 둘러보기: 처지 묶음(일하는 중·준비하는 중·쉬는 중·돌보는 중)·이름으로 찾기, 이번 주 가장 따뜻한 소로우 */
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
            <input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="회사원, 자영업, 쉬는 중처럼 처지로 찾아보세요" aria-label="소로우 검색" maxLength={30} />
            {query && <button type="button" className={shout.clear} aria-label="검색어 지우기" onClick={() => setQuery("")}><IconClose /></button>}
          </form>
        </div>

        <div className={styles.kinds} role="radiogroup" aria-label="처지 묶음">
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

        <div className={styles.head}><h2>{query ? `‘${query.trim()}’ 소로우` : kind ? CIRCLE_KINDS.find((k) => k.id === kind)?.label : "처지별 소로우"}</h2></div>
        {kind && <p className={styles.sub}>{CIRCLE_KINDS.find((k) => k.id === kind)?.hint}</p>}
        {loadError ? (
          <LoadError message={loadError} onRetry={() => setReload((n) => n + 1)} />
        ) : list === null ? (
          <div role="status" aria-label="소로우를 불러오고 있어요"><SkeletonList count={4} lines={1} /></div>
        ) : list.length === 0 ? (
          <Empty icon={<IconLeaf />} title={query ? "찾는 소로우가 없어요" : "아직 둘러볼 소로우가 없어요"}>
            회사·학교 이름 대신 처지로 모여요. 회사원, 자영업, 취준생, 쉬는 중처럼 찾아보세요.
          </Empty>
        ) : (
          <ul className={styles.circles}>{list.map((c) => <li key={c.id}><CircleRow c={c} /></li>)}</ul>
        )}
      </div>
    </>
  );
}
