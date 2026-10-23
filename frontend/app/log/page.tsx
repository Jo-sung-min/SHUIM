"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTION_PRESETS, CUSTOM_COLORS, CUSTOM_EMOJIS, CUSTOM_MAX, Category, CategoryId, SCORE_MAX, SCORE_MIN, allCategories, isCustomCategory, newCategoryId, orderCategories } from "@/lib/categories";
import { DayRecord, loadCategoryOrder, loadCustomCategories, loadJournal, loadLog, saveCategoryOrder, saveCustomCategories, saveDay, saveDayLog, syncRecords, todayKey } from "@/lib/storage";
import { useLongPressReorder } from "@/components/useLongPressReorder";
import { hasCrisisSignal } from "@/lib/crisis";
import HelpBanner from "@/components/HelpBanner";
import { ConfirmSheet, Segmented, SkeletonCard, TopBar, fmtDate } from "@/components/ui";
import { IconClose, IconPlus } from "@/components/Icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useScrollMemory } from "@/lib/scroll-memory";
import MemoPad from "@/components/MemoPad";

/** 어제 대비 변화 선택지: -DELTA_MAX(많이 내려감) ~ +DELTA_MAX(많이 올라옴) */
const DELTA_MAX = 5;
const DELTAS = Array.from({ length: DELTA_MAX * 2 + 1 }, (_, i) => i - DELTA_MAX);
const clamp = (v: number) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, v));
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
/** 오늘 쓰기 = 오늘 한 일 + 카테고리별 어제 대비 점수, 기록하기 = 메모장. 흐름 보기는 홈의 "나를 위한 시간" 타일로 옮겼다 */
type View = "today" | "memo";

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
              { value: "memo", label: "기록하기" },
            ]}
          />
        </div>
        {view === "today" ? <TodayWrite /> : <MemoPad scrollKey="/log:memo" />}
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
  const [removing, setRemoving] = useState<CategoryId | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useScrollMemory(ready);
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
    let alive = true;
    syncRecords().then(() => {
      if (!alive) return;
      const j = loadJournal();
      setDay(j[date] ?? {});
      setDid(loadLog()[date]?.did ?? []);
      setCustomCats(loadCustomCategories());
      setOrder(loadCategoryOrder());
      const prevKeys = Object.keys(j).filter((k) => k < date).sort();
      setPrev(prevKeys.length ? j[prevKeys[prevKeys.length - 1]] : null);
      setReady(true);
    });
    return () => { alive = false; };
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

  if (!ready) {
    return (
      <div className="stack" role="status" aria-label="오늘 기록을 불러오고 있어요" style={{ marginTop: 16 }}>
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

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
                  <CategoryIcon id={c.id} emoji={c.emoji} size={18} />
                  {c.label}
                  {isCustomCategory(c.id) && (
                    <button type="button" className="cat-del" aria-label={`${c.label} 카테고리 삭제`} onClick={() => setRemoving(c.id)}>
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
              <div className="chips wrap icon-pick" role="radiogroup" aria-label="아이콘">
                {CUSTOM_EMOJIS.map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={newEmoji === e} aria-label={e} className={`chip ${newEmoji === e ? "on" : ""}`} onClick={() => setNewEmoji(e)}>
                    <CategoryIcon emoji={e} size={20} />
                  </button>
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

      <ConfirmSheet
        open={removing !== null}
        title="이 카테고리를 지울까요?"
        message="지난 기록은 남고 카드만 사라져요."
        confirmLabel="지우기"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={() => { if (removing) removeCategory(removing); setRemoving(null); }}
      />
    </>
  );
}
