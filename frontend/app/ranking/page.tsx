"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CommunityStore, RankRow, WeeklyBatch, api, currentWeekKey, fetchCommunity, fmtWon, pastWeeks, weekLabel, weeklyOf } from "@/lib/community";
import ShoutTabs from "@/components/ShoutTabs";
import { Empty, Hero, Segmented, TopBar, fmtRelative } from "@/components/ui";
import { LoadError, run } from "@/components/CommunityUI";
import { IconRefresh } from "@/components/Icons";

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

  if (loadError) return <><TopBar title="불행 랭킹" /><div className="screen"><LoadError message={loadError} onRetry={load} /></div></>;
  if (!s) return <TopBar title="불행 랭킹" />;

  const cur = currentWeekKey();
  const batch: WeeklyBatch | undefined = view === "current" ? weeklyOf(s, cur) : pastWeek ? weeklyOf(s, pastWeek) : undefined;
  const past = pastWeeks(s);
  const myRow = batch?.rows.find((r) => r.userId === s.me.id);

  return (
    <>
      <TopBar
        title="불행 랭킹"
        right={view === "current" ? <button className="icon-btn" aria-label="지금 집계" title="지금 집계" onClick={() => run(setS, () => api.refreshCurrentWeek())}><IconRefresh /></button> : undefined}
      />
      <div className="screen">
        <ShoutTabs />
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
          <Empty icon="🏔️" title={view === "past" ? "확정된 지난 주 집계가 없어요" : "이번 주엔 아직 순위가 없어요"}>
            <Link href="/shout" style={{ textDecoration: "underline" }}>외침</Link>의 불행 털어내기에 글을 쓰면 여기 올라와요.
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
      <div className="rank-no">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : row.rank}</div>
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
