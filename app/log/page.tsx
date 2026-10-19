"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ACTION_PRESETS, CATEGORIES, CategoryId, SCORE_MAX, SCORE_MIN, categoryById } from "@/lib/categories";
import { DayRecord, Journal, loadJournal, loadLog, saveDay, saveDayLog, todayKey } from "@/lib/storage";
import { hasCrisisSignal } from "@/lib/crisis";
import { biggestShifts, lastNDays, series, volatility } from "@/lib/accel";
import AccelChart from "@/components/AccelChart";
import HelpBanner from "@/components/HelpBanner";
import { Empty, Segmented, TopBar, fmtDate } from "@/components/ui";
import { IconPlus, IconSparkle } from "@/components/Icons";

const SCORES = Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => SCORE_MIN + i);
type View = "today" | "flow";

export default function LogPage() {
  const [view, setView] = useState<View>("today");
  return (
    <>
      <TopBar title="기록" eyebrow={fmtDate(todayKey())} />
      <div className="screen">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: "오늘 쓰기" },
            { value: "flow", label: "흐름 보기" },
          ]}
        />
        {view === "today" ? <TodayWrite /> : <Flow />}
      </div>
    </>
  );
}

/* ================= 오늘 쓰기 ================= */

function TodayWrite() {
  const date = todayKey();
  const [day, setDay] = useState<DayRecord>({});
  const [did, setDid] = useState<string[]>([]);
  const [prev, setPrev] = useState<DayRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [custom, setCustom] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const j = loadJournal();
    setDay(j[date] ?? {});
    setDid(loadLog()[date]?.did ?? []);
    const prevKeys = Object.keys(j).filter((k) => k < date).sort();
    setPrev(prevKeys.length ? j[prevKeys[prevKeys.length - 1]] : null);
    setReady(true);
  }, [date]);

  // 자동 저장 (입력 후 500ms)
  const persist = useCallback(
    (nextDay: DayRecord, nextDid: string[]) => {
      setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        saveDay(date, nextDay);
        saveDayLog(date, { did: nextDid });
        setSaved(true);
      }, 500);
    },
    [date]
  );

  const update = (id: CategoryId, patch: Partial<{ score: number; note: string }>) => {
    setDay((d) => {
      const next = { ...d, [id]: { score: d[id]?.score ?? 0, note: d[id]?.note ?? "", ...patch } };
      persist(next, did);
      return next;
    });
  };

  const toggleDid = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setDid((cur) => {
      const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      persist(day, next);
      return next;
    });
  };

  const crisis = useMemo(() => hasCrisisSignal(Object.values(day).map((e) => e?.note ?? "").join(" ")), [day]);
  const filled = Object.keys(day).length;

  if (!ready) return null;

  return (
    <>
      <div className="section-title">
        <span>오늘 한 일</span>
        <span className="tiny muted">{did.length ? `${did.length}개` : "작은 것도 좋아요"}</span>
      </div>
      <section className="card">
        <div className="chips wrap">
          {did.filter((d) => !ACTION_PRESETS.includes(d)).map((d) => (
            <button key={d} type="button" className="chip on" onClick={() => toggleDid(d)}>
              {d} <span className="x">×</span>
            </button>
          ))}
          {ACTION_PRESETS.map((p) => (
            <button key={p} type="button" className={`chip ${did.includes(p) ? "on" : ""}`} onClick={() => toggleDid(p)}>
              {p}
            </button>
          ))}
        </div>
        <form
          className="inline-input"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            toggleDid(custom);
            setCustom("");
          }}
        >
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="직접 입력 (예: 공고 2개 지원)" maxLength={40} />
          <button type="submit" className="btn sm soft" disabled={!custom.trim()} aria-label="추가">
            <IconPlus style={{ width: 16, height: 16 }} />
          </button>
        </form>
      </section>

      <div className="section-title">
        <span>오늘의 기분</span>
        <span className={`saved-indicator ${saved ? "on" : ""}`}>{filled === 0 ? "" : saved ? "저장됨" : "저장 중…"}</span>
      </div>

      {crisis && <HelpBanner alert />}

      <div className="stack">
        {CATEGORIES.map((c) => {
          const e = day[c.id];
          const p = prev?.[c.id]?.score;
          const diff = e && typeof p === "number" ? e.score - p : null;
          return (
            <section key={c.id} className="card">
              <div className="entry-head">
                <div className="entry-title">
                  <span className="dot" style={{ background: c.color }} />
                  {c.emoji} {c.label}
                </div>
                <div className="score-val" aria-live="polite">
                  {e ? (e.score > 0 ? `+${e.score}` : e.score) : <span className="muted">–</span>}
                  {diff !== null && diff !== 0 && (
                    <span style={{ color: diff > 0 ? "var(--up)" : "var(--down)", fontSize: 12, marginLeft: 6 }}>
                      {diff > 0 ? "▲" : "▼"}
                      {Math.abs(diff)}
                    </span>
                  )}
                </div>
              </div>
              <div className="score-row" role="radiogroup" aria-label={`${c.label} 점수`}>
                {SCORES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={e?.score === s}
                    className={`score-btn ${s < 0 ? "neg" : s > 0 ? "pos" : ""} ${e?.score === s ? "on" : ""}`}
                    onClick={() => update(c.id, { score: s })}
                  >
                    {s > 0 ? `+${s}` : s}
                  </button>
                ))}
              </div>
              <textarea
                className="note"
                rows={1}
                placeholder={c.hint}
                value={e?.note ?? ""}
                onChange={(ev) => update(c.id, { note: ev.target.value })}
                onInput={(ev) => {
                  const t = ev.currentTarget;
                  t.style.height = "auto";
                  t.style.height = `${t.scrollHeight}px`;
                }}
              />
            </section>
          );
        })}
      </div>

      <p className="tiny muted" style={{ textAlign: "center", marginTop: 18 }}>
        점수의 높낮이보다 어제보다 얼마나 움직였는지가 핵심이에요.
      </p>
    </>
  );
}

/* ================= 흐름 ================= */

type Sel = CategoryId | "all";

function Flow() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [sel, setSel] = useState<Sel>("all");
  const [range, setRange] = useState<7 | 14 | 30>(14);

  useEffect(() => setJournal(loadJournal()), []);

  const dates = useMemo(() => lastNDays(range), [range]);
  const points = useMemo(() => (journal ? series(journal, dates, sel) : []), [journal, dates, sel]);
  const recorded = points.filter((p) => p.level !== null).length;
  const { drops, rises } = biggestShifts(points);
  const vol = volatility(points);
  const color = sel === "all" ? "var(--text)" : categoryById(sel).color;

  if (!journal) return null;

  if (Object.keys(journal).length === 0) {
    return (
      <Empty icon="〰️" title="아직 기록이 없어요">
        오늘 쓰기에서 첫 기록을 남기면 흐름이 보이기 시작해요.
      </Empty>
    );
  }

  return (
    <>
      <div className="chips" style={{ marginTop: 14 }} role="radiogroup">
        <button className={`chip ${sel === "all" ? "on" : ""}`} onClick={() => setSel("all")}>전체 평균</button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip cat ${sel === c.id ? "on" : ""}`}
            style={{ ["--chip" as string]: c.color }}
            onClick={() => setSel(c.id)}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ marginTop: 6 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="tiny muted">위는 그날 위치, 아래는 직전 대비 변화</span>
          <div className="segmented" style={{ padding: 3 }}>
            {[7, 14, 30].map((r) => (
              <button key={r} className={range === r ? "on" : ""} style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setRange(r as 7 | 14 | 30)}>
                {r}일
              </button>
            ))}
          </div>
        </div>
        <AccelChart points={points} color={color} />
        <div className="legend">
          <span><i className="dot" style={{ background: color }} /> 위치</span>
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

      <Link className="btn block soft" href="/summary" style={{ marginTop: 12 }}>
        <IconSparkle style={{ width: 18, height: 18 }} /> 이 흐름 AI로 정리하기
      </Link>
    </>
  );
}
