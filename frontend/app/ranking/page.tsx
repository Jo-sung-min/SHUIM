"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunityStore, RankRow, WeeklyBatch, api, canGiveLight, currentWeekKey, fetchCommunity, fmtLight, lightOf, pastWeeks, weekLabel, weeklyOf } from "@/lib/community";
import ShoutTabs from "@/components/ShoutTabs";
import { Empty, Hero, LoadError, Segmented, SkeletonHero, SkeletonList, fmtRelative } from "@/components/ui";
import { run } from "@/components/CommunityUI";
import { IconLight, IconRefresh, IconTrophy } from "@/components/Icons";
import LightGiveSheet, { LightTarget } from "@/components/LightGiveSheet";
import { useLight } from "@/lib/use-light";
import { useScrollMemory } from "@/lib/scroll-memory";
import { IS_AIT } from "@/lib/ait";
import styles from "@/components/Light.module.css";

type View = "current" | "past";

/** 불행 랭킹: 그 주 불행광장 글이 받은 빛 순. 이번 주 카드에서 바로 빛을 건넬 수 있다. */
export default function RankingPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("current");
  const [pastWeek, setPastWeek] = useState<string | null>(null);
  const [target, setTarget] = useState<LightTarget | null>(null);
  const light = useLight(false); // 지갑은 빛 주기 시트를 열 때 읽는다

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const st = await fetchCommunity();
      setS(st);
      setPastWeek(pastWeeks(st)[0] ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "연결 실패");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useScrollMemory(s !== null);

  if (loadError) return <div className="screen"><ShoutTabs /><LoadError message={loadError} onRetry={load} /></div>;
  if (!s) return <div className="screen" role="status" aria-label="랭킹을 불러오고 있어요"><ShoutTabs /><SkeletonHero /><div style={{ height: 16 }} /><SkeletonList count={3} lines={2} /></div>;

  const cur = currentWeekKey();
  const batch: WeeklyBatch | undefined = view === "current" ? weeklyOf(s, cur) : pastWeek ? weeklyOf(s, pastWeek) : undefined;
  const past = pastWeeks(s);
  const myRow = batch?.rows.find((r) => r.userId === s.me.id);
  const first = batch?.rows[0];

  return (
    <>
      <div className="screen">
        <ShoutTabs right={view === "current" ? <button className="icon-btn" aria-label="지금 집계" title="지금 집계" onClick={() => run(setS, () => api.refreshCurrentWeek())}><IconRefresh /></button> : undefined} />
        <div style={{ height: 12 }} />
        <Hero
          label={batch ? `${weekLabel(batch.week)} · ${batch.finalized ? "확정" : `잠정 · ${fmtRelative(batch.computedAt)} 집계`}` : "집계 전"}
          title={first ? (lightOf(first) > 0 ? `1위 ${first.nick}, 빛 ${lightOf(first)}` : `1위 ${first.nick}, 힘내요 ${first.cheers}`) : "아직 불행광장 글이 없어요"}
          stats={batch ? [`순위 ${batch.rows.length}명`, `모인 빛 ${(batch.light?.total ?? 0).toLocaleString("ko-KR")}`, myRow ? `나 ${myRow.rank}위` : "나 순위 밖"] : []}
        />
        <div style={{ marginTop: 12 }}>
          <Segmented value={view} onChange={setView} options={[{ value: "current", label: "이번 주 (잠정)" }, { value: "past", label: "지난 주 (확정)" }]} />
        </div>
        {view === "past" && past.length > 1 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {past.map((w) => (
              <button key={w} className={`chip ${pastWeek === w ? "on" : ""}`} onClick={() => setPastWeek(w)}>{weekLabel(w)}</button>
            ))}
          </div>
        )}
        {!batch || batch.rows.length === 0 ? (
          <Empty icon={<IconTrophy />} title={view === "past" ? "확정된 지난 주 집계가 없어요" : "이번 주엔 아직 순위가 없어요"} action={<Link href="/shout" className="btn ghost">외침 보러 가기</Link>}>
            외침의 불행광장에 글을 쓰면 여기 올라와요.
          </Empty>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {batch.rows.map((r) => {
              // 지난 주 순위는 확정이라, 빛 주기는 이번 주 카드에서만
              const giving = view === "current" && canGiveLight(s, s.posts.find((p) => p.id === r.topPostId));
              return <RankCard key={r.userId} row={r} me={r.userId === s.me.id} onGive={giving ? () => setTarget({ postId: r.topPostId, nick: r.nick }) : undefined} />;
            })}
          </div>
        )}
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 20, wordBreak: "keep-all" }}>
          순위는 그 주 불행광장 글이 받은 빛으로 정해요.
          {!IS_AIT && <><br />빛은 <Link href="/fund" style={{ textDecoration: "underline" }}>불행 모금</Link>에서 모아요.</>}
        </p>
      </div>
      <LightGiveSheet target={target} light={light} onClose={() => setTarget(null)} onGiven={setS} />
    </>
  );
}

function RankCard({ row, me, onGive }: { row: RankRow; me: boolean; onGive?: () => void }) {
  return (
    <section className={`card rank ${row.rank <= 3 ? "top" : ""} ${me ? "me" : ""}`}>
      <div className="rank-no">{row.rank}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <b style={{ fontSize: 15 }}>{row.nick}{me ? " (나)" : ""}</b>
          <span className="tiny muted">글 {row.posts}개</span>
        </div>
        <p className="rank-quote">{row.topPostText}{row.topPostText.length >= 80 ? "…" : ""}</p>
        <div className={styles.rankFoot}>
          {onGive && <button type="button" className={`btn soft sm ${styles.give}`} aria-label={`${row.nick} 님에게 빛 주기`} onClick={onGive}><IconLight />빛 주기</button>}
          <span>힘내요 {row.cheers}</span>
        </div>
      </div>
      <div className="rank-cheers" aria-label={`받은 빛 ${fmtLight(lightOf(row))}`}><b>{lightOf(row)}</b><small>빛</small></div>
    </section>
  );
}
