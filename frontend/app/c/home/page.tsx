"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CommunityStore, Target, api, fetchCommunity } from "@/lib/community";
import { Circle, MyCircle, fetchMyCircles, fetchWarmCircles } from "@/lib/circles";
import ShoutTabs from "@/components/ShoutTabs";
import CirclePosts, { circlePostsOf } from "@/components/CirclePosts";
import { CircleRow } from "@/components/CircleRow";
import { LoadError, ReportSheet, TargetMenuSheet, run } from "@/components/CommunityUI";
import { Empty, SkeletonList } from "@/components/ui";
import { IconChevronR, IconInbox, IconLeaf, IconPlus, IconSearch } from "@/components/Icons";
import { useScrollMemory } from "@/lib/scroll-memory";
import styles from "../circle.module.css";
import { route } from "@/lib/routes";

/**
 * 내 소로우: 내가 속한 처지 소로우와 리스닝 중인 소로우의 사연을 한 줄로.
 * 아직 들어간 곳이 없으면 둘러보기·이번 주 따뜻한 소로우로 안내한다.
 */
export default function CircleHomePage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [mine, setMine] = useState<{ member: MyCircle[]; listening: Circle[] } | null>(null);
  const [warm, setWarm] = useState<Circle[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [store, my] = await Promise.all([fetchCommunity(true), fetchMyCircles()]);
      setS(store);
      setMine(my);
      fetchWarmCircles().then(setWarm).catch(() => setWarm([]));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useScrollMemory(s !== null);

  const ids = useMemo(() => new Set([...(mine?.member.filter((c) => c.status === "active") ?? []), ...(mine?.listening ?? [])].map((c) => c.id)), [mine]);
  const posts = useMemo(() => (s ? circlePostsOf(s, ids) : []), [s, ids]);

  if (loadError) return <div className="screen"><ShoutTabs /><LoadError message={loadError} onRetry={load} /></div>;
  if (!s || !mine) {
    return (
      <div className="screen" role="status" aria-label="소로우를 불러오고 있어요">
        <ShoutTabs />
        <SkeletonList count={4} lines={3} />
      </div>
    );
  }

  const chips = [...mine.member, ...mine.listening.filter((l) => !mine.member.some((m) => m.id === l.id))];
  return (
    <>
      <div className={`screen ${styles.list}`}>
        <ShoutTabs
          right={
            <Link href="/c" className="icon-btn" aria-label="소로우 둘러보기"><IconSearch /></Link>
          }
        />

        <div className={styles.mine} aria-label="내 소로우">
          {chips.map((c) => (
            <Link key={c.id} href={route(`/c/${c.slug}`)} className={styles.mineChip} data-primary={"primary" in c && c.primary ? "" : undefined}>
              {c.name}
              {"status" in c && c.status === "pending" && <small>승인 대기</small>}
              {"role" in c && c.role !== "member" && <small>소로우지기</small>}
              {!("role" in c) && <small>리스닝</small>}
            </Link>
          ))}
          <Link href="/c" className={`${styles.mineChip} ${styles.add}`}><IconPlus aria-hidden="true" />소로우 찾기</Link>
        </div>

        <div className={styles.head}>
          <h2>{chips.length ? "내 소로우 사연" : "커뮤니티 소로우"}</h2>
          <Link href="/c/submissions"><IconInbox aria-hidden="true" />내 사연함</Link>
        </div>

        {chips.length === 0 ? (
          <>
            <p className={styles.sub}>
              회사원, 자영업, 취준생, 쉬는 중… 비슷한 처지의 사람들끼리 힘든 점을 털어놓는 곳이에요. 회사나 학교 이름은 묻지 않아요.
              사연을 보내면 소로우지기가 이름을 가리고 다듬어 ‘#번호’로 올려 줘요. 누가 보냈는지는 아무도 몰라요.
            </p>
            <div className={styles.actions}>
              <Link href="/c" className="btn"><IconSearch />내 처지 소로우 찾기</Link>
            </div>
          </>
        ) : posts.length === 0 ? (
          <Empty icon={<IconLeaf />} title="아직 올라온 사연이 없어요">
            내 소로우에 첫 사연을 보내 보세요. 소로우지기가 검토한 뒤 올려 줘요.
          </Empty>
        ) : (
          <CirclePosts s={s} posts={posts} onChange={setS} onMenu={(id) => setMenu({ kind: "post", id })} />
        )}

        {warm.length > 0 && (
          <>
            <div className={styles.band} aria-hidden="true" />
            <div className={styles.head}>
              <h2>이번 주 가장 따뜻한 소로우</h2>
              <Link href="/c">전체<IconChevronR aria-hidden="true" /></Link>
            </div>
            <p className={styles.sub}>다른 소로우의 사연에 위로를 가장 많이 건넨 곳이에요.</p>
            <ul className={styles.circles}>
              {warm.slice(0, 5).map((c) => <li key={c.id}><CircleRow c={c} rank={c.rank} /></li>)}
            </ul>
          </>
        )}
      </div>

      <TargetMenuSheet s={s} target={menu} onClose={() => setMenu(null)} onChange={setS} onReport={(t) => setReporting(t)} />
      <ReportSheet
        key={reporting ? `report-${reporting.id}` : "report-closed"}
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
