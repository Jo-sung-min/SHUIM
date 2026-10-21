"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ACTION_PRESETS, CUSTOM_COLORS, CUSTOM_EMOJIS, CUSTOM_MAX, Category, CategoryId, SCORE_MAX, SCORE_MIN, allCategories, isCustomCategory, newCategoryId, orderCategories } from "@/lib/categories";
import { DayRecord, Journal, loadCategoryOrder, loadCustomCategories, loadJournal, loadLog, saveCategoryOrder, saveCustomCategories, saveDay, saveDayLog, todayKey } from "@/lib/storage";
import { useLongPressReorder } from "@/components/useLongPressReorder";
import { hasCrisisSignal } from "@/lib/crisis";
import { biggestShifts, lastNDays, series, volatility } from "@/lib/accel";
import AccelChart from "@/components/AccelChart";
import HelpBanner from "@/components/HelpBanner";
import { Empty, Segmented, TopBar, fmtDate } from "@/components/ui";
import { IconClose, IconPlus, IconSparkle } from "@/components/Icons";

/** 어제 대비 변화 선택지: -DELTA_MAX(많이 내려감) ~ +DELTA_MAX(많이 올라옴) */
const DELTA_MAX = 5;
const DELTAS = Array.from({ length: DELTA_MAX * 2 + 1 }, (_, i) => i - DELTA_MAX);
const clamp = (v: number) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, v));
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
type View = "today" | "flow";

/** 상단 현황(연속 일수·채운 수)은 메인 페이지에서 보여주고, 여기선 바로 쓰기부터 시작 */
export default function LogPage() {
  const [view, setView] = useState<View>("today");

  return (
    <>
      <TopBar title="기록" eyebrow={fmtDate(todayKey())} />
      <div className="screen">
        <div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "today", label: "오늘 쓰기" },
              { value: "flow", label: "흐름 보기" },
            ]}
          />
        </div>
        {view === "today" ? (
          <TodayWrite />
        ) : (
          <Flow />
        )}
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
  const [customCats, setCustomCats] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState(CUSTOM_EMOJIS[0]);
  const [order, setOrder] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cats = useMemo(() => orderCategories(allCategories(customCats), order), [customCats, order]);
  /** 카드를 꾹 눌렀다가 끌어서 순서 바꾸기 (사용자별 저장) */
  const reorder = useLongPressReorder(
    cats.map((c) => c.id),
    (ids) => {
      setOrder(ids);
      saveCategoryOrder(ids);
    }
  );

  useEffect(() => {
    const j = loadJournal();
    setDay(j[date] ?? {});
    setDid(loadLog()[date]?.did ?? []);
    setCustomCats(loadCustomCategories());
    setOrder(loadCategoryOrder());
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

  const update = (id: CategoryId, patch: Partial<{ score: number; delta: number; note: string }>) => {
    setDay((d) => {
      const next = { ...d, [id]: { score: d[id]?.score ?? 0, note: d[id]?.note ?? "", ...patch } };
      persist(next, did);
      return next;
    });
  };

  /** 어제 위치 (어제 기록이 없으면 보통 날 0을 기준으로) */
  const prevScoreOf = (id: CategoryId) => prev?.[id]?.score ?? 0;

  /** "어제보다 d만큼" 선택 → 오늘 위치 = 어제 위치 + d */
  const pickDelta = (id: CategoryId, d: number) => update(id, { delta: d, score: clamp(prevScoreOf(id) + d) });

  /** 사용자 카테고리 추가 (최대 CUSTOM_MAX개) */
  const addCategory = () => {
    const label = newLabel.trim().slice(0, 12);
    if (!label || customCats.length >= CUSTOM_MAX) return;
    const next = [...customCats, { id: newCategoryId(), label, emoji: newEmoji, hint: `오늘의 ${label}, 한 줄로`, color: CUSTOM_COLORS[customCats.length % CUSTOM_COLORS.length] }];
    setCustomCats(next);
    saveCustomCategories(next);
    setNewLabel("");
    setNewEmoji(CUSTOM_EMOJIS[(customCats.length + 1) % CUSTOM_EMOJIS.length]);
    setAdding(false);
  };
  /** 사용자 카테고리 삭제. 지난 기록은 그대로 두고 카드만 사라진다 */
  const removeCategory = (id: CategoryId) => {
    if (!window.confirm("이 카테고리를 지울까요? 지난 기록은 남고 카드만 사라져요.")) return;
    const next = customCats.filter((c) => c.id !== id);
    setCustomCats(next);
    saveCustomCategories(next);
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
      <div className="section-title" style={{ marginTop: 16 }}>
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
        <span>오늘의 기분 · 어제보다</span>
        <span className={`saved-indicator ${saved ? "on" : ""}`}>{filled === 0 ? "" : saved ? "저장됨" : "저장 중…"}</span>
      </div>

      {crisis && <HelpBanner alert />}

      <div className="stack" ref={reorder.listRef}>
        {cats.map((c) => {
          const e = day[c.id];
          const p = prevScoreOf(c.id);
          const delta = e ? e.delta ?? e.score - p : null;
          return (
            <section key={c.id} {...reorder.bind(c.id)} className={`card draggable ${reorder.draggingId === c.id ? "dragging" : ""}`}>
              <div className="entry-head">
                <div className="entry-title">
                  {c.emoji} {c.label}
                  {isCustomCategory(c.id) && (
                    <button type="button" className="cat-del" aria-label={`${c.label} 카테고리 삭제`} onClick={() => removeCategory(c.id)}>
                      <IconClose />
                    </button>
                  )}
                </div>
                <div className="score-val" aria-live="polite">
                  {delta === null ? (
                    <span className="muted">어제보다?</span>
                  ) : (
                    <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}>
                      {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "그대로"}
                    </span>
                  )}
                </div>
              </div>
              <div className="score-row" role="radiogroup" aria-label={`${c.label}, 어제보다 얼마나`}>
                {delta !== null && <span className="score-thumb" aria-hidden="true" style={{ transform: `translateX(${(delta + DELTA_MAX) * 100}%)` }} />}
                {DELTAS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={delta === d}
                    className={`score-btn ${d < 0 ? "neg" : d > 0 ? "pos" : ""} ${delta === d ? "on" : ""}`}
                    onClick={() => pickDelta(c.id, d)}
                  >
                    {d === 0 ? "=" : signed(d)}
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

        {customCats.length < CUSTOM_MAX && (
          adding ? (
            <section className="card cat-form">
              <div className="entry-title" style={{ marginBottom: 10 }}>새 카테고리</div>
              <div className="chips wrap emoji-pick" role="radiogroup" aria-label="이모지">
                {CUSTOM_EMOJIS.map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={newEmoji === e} className={`chip ${newEmoji === e ? "on" : ""}`} onClick={() => setNewEmoji(e)}>{e}</button>
                ))}
              </div>
              <form
                className="inline-input"
                style={{ marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  addCategory();
                }}
              >
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="이름 (예: 공부, 취미)" maxLength={12} autoFocus />
                <button type="submit" className="btn sm" disabled={!newLabel.trim()}>추가</button>
                <button type="button" className="btn sm ghost" onClick={() => setAdding(false)}>취소</button>
              </form>
            </section>
          ) : (
            <button type="button" className="add-cat" onClick={() => setAdding(true)}>
              <IconPlus /> 카테고리 추가
            </button>
          )
        )}
      </div>

    </>
  );
}

/* ================= 흐름 ================= */

/** 흐름은 항상 전체 평균(기본 + 내가 추가한 카테고리 점수를 모두 합산) */
function Flow() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [range, setRange] = useState<7 | 14 | 30>(14);

  useEffect(() => setJournal(loadJournal()), []);

  const dates = useMemo(() => lastNDays(range), [range]);
  const points = useMemo(() => (journal ? series(journal, dates, "all") : []), [journal, dates]);
  const recorded = points.filter((p) => p.level !== null).length;
  const { drops, rises } = biggestShifts(points);
  const vol = volatility(points);
  const color = "var(--text)";

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
      <section className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="tiny muted">전체 평균 · 위는 그날 위치, 아래는 직전 대비 변화</span>
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

      <Link className="btn block soft" href="/summary" style={{ marginTop: 12 }}>
        <IconSparkle style={{ width: 18, height: 18 }} /> 이 흐름 AI로 정리하기
      </Link>
    </>
  );
}
