"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CommunityStore,
  DONATION_PRESETS,
  RANK_SHARES,
  currentWeekKey,
  donate,
  fmtWon,
  loadCommunity,
  myPayouts,
  pastWeeks,
  userById,
  weekLabel,
  weeklyOf,
} from "@/lib/community";
import ShoutTabs from "@/components/ShoutTabs";
import { Empty, Hero, Sheet, TopBar, fmtRelative } from "@/components/ui";

export default function FundPage() {
  const [s, setS] = useState<CommunityStore | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setS(loadCommunity()), []);
  if (!s) return <TopBar title="불행 모금" />;

  const cur = currentWeekKey();
  const batch = weeklyOf(s, cur);
  const lastWeek = pastWeeks(s)[0];
  const last = lastWeek ? weeklyOf(s, lastWeek) : undefined;
  const mine = myPayouts(s);
  const myTotal = mine.reduce((n, p) => n + p.amount, 0);
  const myDonated = (s.donations ?? []).filter((d) => d.by === s.me.id).reduce((n, d) => n + d.amount, 0);
  const recent = (s.donations ?? []).filter((d) => d.at >= new Date(cur).getTime()).sort((a, b) => b.at - a.at).slice(0, 8);
  const top10 = batch?.rows.slice(0, 10) ?? [];

  return (
    <>
      <TopBar title="불행 모금" eyebrow="이번 주 불행 순위 1~10위에게 나눠요" />
      <div className="screen">
        <ShoutTabs />
        <div style={{ height: 12 }} />
        <Hero
          label={`${weekLabel(cur)} · 이번 주 모금`}
          title={fmtWon(batch?.fund.total ?? 0)}
          sub="월요일 0시에 지난주 불행 랭킹이 확정되면, 모인 금액을 1~10위에게 비율대로 나눠드려요."
          stats={[`후원 ${batch?.fund.count ?? 0}건`, `후원자 ${batch?.fund.donors ?? 0}명`, `분배 대상 ${top10.length}명`]}
        />

        <div className="notice" style={{ marginTop: 12 }}>
          프로토타입이라 실제 결제는 일어나지 않아요. 실서비스에선 결제사 연동과 기부금 모집 신고가 필요해요.
        </div>

        <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>모금하기</button>
        {toast && <p className="toast" style={{ textAlign: "center", margin: "8px 0 0" }}>{toast}</p>}

        {(myTotal > 0 || myDonated > 0) && (
          <div className="tiles" style={{ marginTop: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div className="tile"><b style={{ fontSize: 18 }}>{fmtWon(myDonated)}</b><small>내가 모금한 금액</small></div>
            <div className="tile"><b style={{ fontSize: 18 }}>{fmtWon(myTotal)}</b><small>내가 받은 분배</small></div>
          </div>
        )}

        <div className="section-title"><span>이번 주 분배 예상</span><Link href="/ranking" className="link">랭킹 보기</Link></div>
        {top10.length === 0 ? (
          <Empty icon="🪙" title="아직 분배 대상이 없어요">불행 털어내기에 글이 올라오면 순위가 생겨요.</Empty>
        ) : (
          <section className="card" style={{ padding: "6px 16px" }}>
            {top10.map((r) => (
              <div key={r.userId} className="share-row">
                <span className="rank-no sm">{r.rank}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <b>{r.nick}{r.userId === s.me.id ? " (나)" : ""}</b>
                  <small className="muted"> · 힘내요 {r.cheers}</small>
                </span>
                <span className="tiny muted">{r.share}%</span>
                <b className="share-amt">{fmtWon(r.payout)}</b>
              </div>
            ))}
            {top10.length < 10 && <p className="tiny muted" style={{ margin: "8px 0 6px" }}>10명이 안 되면 있는 사람끼리 비율을 다시 맞춰요.</p>}
          </section>
        )}

        <div className="section-title"><span>지난 주 분배 결과 {last ? `· ${weekLabel(last.week)}` : ""}</span></div>
        {!last || last.rows.length === 0 ? (
          <p className="tiny muted" style={{ margin: "0 4px" }}>확정된 지난 주 집계가 없어요.</p>
        ) : (
          <section className="card" style={{ padding: "6px 16px" }}>
            <div className="tiny muted" style={{ padding: "6px 0" }}>모금 {fmtWon(last.fund.total)} · 후원 {last.fund.count}건 · 확정 {fmtRelative(last.computedAt)}</div>
            {last.rows.slice(0, 10).map((r) => (
              <div key={r.userId} className="share-row">
                <span className="rank-no sm">{r.rank}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <b>{r.nick}{r.userId === s.me.id ? " (나)" : ""}</b>
                  <small className="muted"> · 힘내요 {r.cheers}</small>
                </span>
                <b className="share-amt">{fmtWon(r.payout)}</b>
              </div>
            ))}
          </section>
        )}

        <div className="section-title"><span>이번 주 후원</span></div>
        {recent.length === 0 ? (
          <p className="tiny muted" style={{ margin: "0 4px" }}>아직 후원이 없어요. 첫 후원을 남겨볼까요.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {recent.map((d) => (
              <div key={d.id} className="card flat" style={{ padding: "10px 14px" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b style={{ fontSize: 14 }}>{d.by === s.me.id ? "나" : userById(s, d.by).nick}</b>
                  <span style={{ fontWeight: 800 }}>{fmtWon(d.amount)}</span>
                </div>
                {d.message && <p className="tiny" style={{ margin: "4px 0 0", color: "var(--text-2)" }}>{d.message}</p>}
                <div className="tiny muted" style={{ marginTop: 2 }}>{fmtRelative(d.at)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="section-title"><span>분배 비율</span></div>
        <section className="card tint">
          <div className="share-grid">
            {RANK_SHARES.map((p, i) => (
              <span key={i}><b>{i + 1}위</b> {p}%</span>
            ))}
          </div>
        </section>
      </div>

      <DonateSheet
        key={open ? "open" : "closed"}
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(amount, message) => {
          setS(donate(s, amount, message));
          setOpen(false);
          setToast(`${fmtWon(amount)}을 이번 주 모금에 보탰어요 (모의)`);
          setTimeout(() => setToast(null), 3000);
        }}
      />
    </>
  );
}

function DonateSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (amount: number, message: string) => void }) {
  const [amount, setAmount] = useState<number>(3000);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const value = custom ? Number(custom.replace(/[^0-9]/g, "")) : amount;
  const valid = Number.isFinite(value) && value >= 100 && value <= 1_000_000;
  return (
    <Sheet open={open} onClose={onClose} title="불행 모금에 보태기">
      <div className="stack">
        <div className="field">
          <label>금액</label>
          <div className="chips wrap">
            {DONATION_PRESETS.map((p) => (
              <button key={p} type="button" className={`chip ${!custom && amount === p ? "on" : ""}`} onClick={() => { setAmount(p); setCustom(""); }}>
                {fmtWon(p)}
              </button>
            ))}
          </div>
          <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="직접 입력 (100원 ~ 1,000,000원)" />
        </div>
        <div className="field">
          <label>한마디 (선택)</label>
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={60} placeholder="누구에게, 왜" />
        </div>
        <div className="notice">모의 모금이에요. 실제 결제는 일어나지 않고, 이번 주 집계에만 더해져요.</div>
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" disabled={!valid} onClick={() => onSubmit(value, message)}>{valid ? `${fmtWon(value)} 보태기` : "금액을 확인해요"}</button>
      </div>
    </Sheet>
  );
}
