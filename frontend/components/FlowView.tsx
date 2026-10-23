"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Journal, loadJournal, syncRecords } from "@/lib/storage";
import { biggestShifts, lastNDays, series, volatility } from "@/lib/accel";
import AccelChart from "./AccelChart";
import { Empty, fmtDate } from "./ui";
import { IconChart, IconSparkle } from "./Icons";
import { useScrollMemory } from "@/lib/scroll-memory";

/**
 * 흐름 보기: 최근 7·14·30일의 전체 평균 위치와 직전 대비 변화, 크게 흔들린 날·다시 올라온 날.
 * 홈의 "나를 위한 시간 › 흐름 보기" 타일이 연다 (예전엔 기록 화면의 탭이었다).
 * 흐름은 항상 전체 평균(기본 + 내가 추가한 카테고리 점수를 모두 합산).
 */
export default function FlowView({ onWrite, scrollKey }: { onWrite: () => void; scrollKey?: string }) {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [range, setRange] = useState<7 | 14 | 30>(14);
  useScrollMemory(journal !== null && Boolean(scrollKey), scrollKey);

  useEffect(() => { syncRecords().then(() => setJournal(loadJournal())); }, []);

  const dates = useMemo(() => lastNDays(range), [range]);
  const points = useMemo(() => (journal ? series(journal, dates, "all") : []), [journal, dates]);
  const recorded = points.filter((p) => p.level !== null).length;
  const { drops, rises } = biggestShifts(points);
  const vol = volatility(points);
  const color = "var(--text)";

  if (!journal) {
    return (
      <div role="status" aria-label="흐름을 불러오고 있어요" style={{ marginTop: 16 }}>
        <div className="sk-card"><div className="sk w60" /><div className="sk" style={{ height: 240, borderRadius: 12 }} /></div>
        <div className="sk-tiles" style={{ marginTop: 8 }}><div className="sk" /><div className="sk" /><div className="sk" /></div>
      </div>
    );
  }

  if (Object.keys(journal).length === 0) {
    return (
      <Empty icon={<IconChart />} title="아직 기록이 없어요" action={<button type="button" className="btn ghost" onClick={onWrite}>기록하러 가기</button>}>
        기록에서 첫 기록을 남기면 흐름이 보이기 시작해요.
      </Empty>
    );
  }

  return (
    <>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="tiny muted">전체 평균 · 위는 그날 위치, 아래는 직전 대비 변화</span>
          <div className="segmented" style={{ padding: 3 }}>
            {[7, 14, 30].map((r) => (
              <button key={r} type="button" className={range === r ? "on" : ""} style={{ minHeight: 32, padding: "0 10px", fontSize: 13 }} onClick={() => setRange(r as 7 | 14 | 30)}>
                {r}일
              </button>
            ))}
          </div>
        </div>
        <AccelChart points={points} color={color} />
        <div className="legend">
          <span><i className="dot" style={{ background: color }} /> 전체 평균 위치</span>
          <span><i className="dot" style={{ background: "var(--up)" }} /> 올라간 날</span>
          <span><i className="dot" style={{ background: "var(--down)" }} /> 내려간 날</span>
        </div>
      </section>

      <div className="tiles" style={{ marginTop: 10 }}>
        <div className="tile"><b>{recorded}</b><small>기록한 날</small></div>
        <div className="tile"><b>{vol}</b><small>평균 변화폭</small></div>
        <div className="tile"><b style={{ color: "var(--up)" }}>{points.filter((p) => (p.accel ?? 0) > 0).length}</b><small>올라간 날</small></div>
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        <section className="card">
          <div className="entry-title" style={{ marginBottom: 8 }}>가장 크게 흔들린 날</div>
          {drops.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>큰 하락은 없었어요.</p>
          ) : (
            <ul className="shift-list">
              {drops.map((p) => (
                <li key={p.date}><span>{fmtDate(p.date)}</span><b style={{ color: "var(--down)" }}>{p.accel}</b></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="entry-title" style={{ marginBottom: 8 }}>다시 올라온 날</div>
          {rises.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직은 버티는 중이에요. 그것도 충분해요.</p>
          ) : (
            <ul className="shift-list">
              {rises.map((p) => (
                <li key={p.date}><span>{fmtDate(p.date)}</span><b style={{ color: "var(--up)" }}>+{p.accel}</b></li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link className="btn block ghost" href="/summary" style={{ marginTop: 16 }}>
        <IconSparkle style={{ width: 18, height: 18 }} /> 이 흐름 AI로 정리하기
      </Link>
    </>
  );
}
