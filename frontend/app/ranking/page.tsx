"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunityStore, RankRow, WeeklyBatch, api, currentWeekKey, fetchCommunity, fmtWon, pastWeeks, weekLabel, weeklyOf } from "@/lib/community";
import ShoutTabs from "@/components/ShoutTabs";
import { Empty, Hero, LoadError, Segmented, SkeletonHero, SkeletonList, fmtRelative } from "@/components/ui";
import { run } from "@/components/CommunityUI";
import { IconRefresh, IconTrophy } from "@/components/Icons";
import { useScrollMemory } from "@/lib/scroll-memory";

type View = "current" | "past";

export default function RankingPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("current");
  const [pastWeek, setPastWeek] = useState<string | null>(null);

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

  return (
    <>
      <div className="screen">
        <ShoutTabs right={view === "current" ? <button className="icon-btn" aria-label="지금 집계" title="지금 집계" onClick={() => run(setS, () => api.refreshCurrentWeek())}><IconRefresh /></button> : undefined} />
        <div style={{ height: 12 }} />
        <Hero
          label={batch ? `${weekLabel(batch.week)} · ${batch.finalized ? "확정" : `잠정 · ${fmtRelative(batch.computedAt)} 집계`}` : "집계 전"}
          title={batch?.rows.length ? `1위 ${batch.rows[0].nick}, 힘내요 ${batch.rows[0].cheers}` : "아직 불행 털어내기 글이 없어요"}
          stats={batch ? [`순위 ${batch.rows.length}명`, `모금 ${fmtWon(batch.fund.total)}`, myRow ? `나 ${myRow.rank}위` : "나 순위 밖"] : []}
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
            외침의 불행 털어내기에 글을 쓰면 여기 올라와요.
          </Empty>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {batch.rows.map((r) => (
              <RankCard key={r.userId} row={r} me={r.userId === s.me.id} hasFund={batch.fund.total > 0} finalized={batch.finalized} />
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 20 }}>
          1~10위는 그 주 <Link href="/fund" style={{ textDecoration: "underline" }}>불행 모금</Link>을 나눠 받아요.
        </p>
      </div>
    </>
  );
}

function RankCard({ row, me, hasFund, finalized }: { row: RankRow; me: boolean; hasFund: boolean; finalized: boolean }) {
  return (
    <section className={`card rank ${row.rank <= 3 ? "top" : ""} ${me ? "me" : ""}`}>
      <div className="rank-no">{row.rank}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <b style={{ fontSize: 15 }}>{row.nick}{me ? " (나)" : ""}</b>
          <span className="tiny muted">글 {row.posts}개</span>
        </div>
        <p className="rank-quote">{row.topPostText}{row.topPostText.length >= 80 ? "…" : ""}</p>
        {row.rank <= 10 && hasFund && (
          <div className="tiny" style={{ color: "var(--text-2)", marginTop: 4 }}>
            {finalized ? "받은 분배" : "예상 분배"} <b style={{ color: "var(--text)" }}>{fmtWon(row.payout)}</b> · {row.share}%
          </div>
        )}
      </div>
      <div className="rank-cheers"><b>{row.cheers}</b><small>힘내요</small></div>
    </section>
  );
}
