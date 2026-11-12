"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "./ui";
import { CategoryIcon } from "./CategoryIcon";
import HelpBanner from "./HelpBanner";
import { IconPlus } from "./Icons";
import { ACTION_PRESETS, SCORE_MAX, SCORE_MIN, allCategories, orderCategories, type Category, type CategoryId } from "@/lib/categories";
import { type DayRecord, loadCategoryOrder, loadCustomCategories, loadJournal, loadLog, saveDay, saveDayLog, syncRecords, todayKey } from "@/lib/storage";
import { hasCrisisSignal } from "@/lib/crisis";
import { DAILY_FOOD_MAX, MOOD_CHIPS } from "@/lib/moru";
import styles from "./MoruPet.module.css";

const DELTA_MAX = 5;
const DELTAS = Array.from({ length: DELTA_MAX * 2 + 1 }, (_, i) => i - DELTA_MAX);
const clamp = (v: number) => Math.max(SCORE_MIN, Math.min(SCORE_MAX, v));
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

/**
 * 모루에게 마음 들려주기 = 오늘의 기록. 기록 탭 "오늘 쓰기"와 같은 데이터(saveDay·saveDayLog)를 한 카테고리씩 단계로 쓴다.
 * 카테고리 하나를 기록하면(어제보다 변화를 고르면) 서버가 모루에게 마음밥 1개를 준다 (하루 5개까지).
 * 마지막 단계는 오늘 한 일 (밥은 없다). 닫을 때 바뀐 게 있었는지 알려 준다.
 */
export default function MoruMindSheet({ open, name, onClose, closeRef }: { open: boolean; name: string; onClose: (changed: boolean) => void; closeRef?: { current: (() => void) | null } }) {
  const date = todayKey();
  const [cats, setCats] = useState<Category[]>([]);
  const [day, setDay] = useState<DayRecord>({});
  const [did, setDid] = useState<string[]>([]);
  const [prev, setPrev] = useState<DayRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [custom, setCustom] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ day: DayRecord; did: string[] } | null>(null);
  const changed = useRef(false);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setReady(false);
    changed.current = false;
    void syncRecords().then(() => {
      if (!alive) return;
      const j = loadJournal();
      const today = j[date] ?? {};
      const list = orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder());
      setCats(list);
      setDay(today);
      setDid(loadLog()[date]?.did ?? []);
      const prevKeys = Object.keys(j).filter((k) => k < date).sort();
      setPrev(prevKeys.length ? j[prevKeys[prevKeys.length - 1]] : null);
      // 아직 안 쓴 첫 카테고리부터 (다 썼으면 오늘 한 일)
      const first = list.findIndex((c) => !today[c.id]);
      setStep(first < 0 ? list.length : first);
      setReady(true);
    });
    return () => { alive = false; };
  }, [open, date]);

  // 지금 단계의 번호 칩이 보이게
  useEffect(() => {
    stepsRef.current?.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [step, ready]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    saveDay(date, p.day);
    saveDayLog(date, { did: p.did });
  };
  /** 기록 탭과 같은 자동 저장 (입력 후 500ms). 고르기는 바로 저장해 모루가 바로 먹을 수 있게 */
  const persist = (nextDay: DayRecord, nextDid: string[], now = false) => {
    changed.current = true;
    pending.current = { day: nextDay, did: nextDid };
    if (timer.current) clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(flush, 500);
  };
  const close = () => { flush(); onClose(changed.current); };
  if (closeRef) closeRef.current = open ? close : null; // 안드로이드 뒤로 가기도 저장하고 닫는다

  const prevScoreOf = (id: CategoryId) => prev?.[id]?.score ?? 0;
  const update = (id: CategoryId, patch: Partial<{ score: number; delta: number; note: string }>, now = false) => {
    const next = { ...day, [id]: { score: day[id]?.score ?? prevScoreOf(id), note: day[id]?.note ?? "", ...patch } };
    setDay(next);
    persist(next, did, now);
  };
  const pickDelta = (id: CategoryId, d: number) => update(id, { delta: d, score: clamp(prevScoreOf(id) + d) }, true);
  const pickMood = (id: CategoryId, mood: string) => {
    const note = day[id]?.note?.trim() ?? "";
    const next = !note || MOOD_CHIPS.includes(note) ? mood : note.includes(mood) ? note : `${note}, ${mood}`;
    update(id, { note: next }, true);
  };
  const toggleDid = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const next = did.includes(t) ? did.filter((x) => x !== t) : [...did, t];
    setDid(next);
    persist(day, next, true);
  };

  const recorded = cats.filter((c) => day[c.id]).length;
  const crisis = useMemo(() => hasCrisisSignal(Object.values(day).map((e) => e?.note ?? "").join(" ")), [day]);
  const last = cats.length; // 오늘 한 일 단계
  const c = cats[step];
  const e = c ? day[c.id] : undefined;
  const delta = c && e ? e.delta ?? e.score - prevScoreOf(c.id) : null;

  return (
    <Sheet open={open} title={`${name}에게 마음 들려주기`} onClose={close}>
      {!ready ? <div role="status" aria-label="오늘 기록을 불러오고 있어요" className={styles.mindLoading}><div className="skeleton" /><div className="skeleton" /></div> : <div className={styles.mind}>
        <p className={styles.mindIntro}>마음 {recorded}/{cats.length} · 하나에 마음밥 1개, 하루 {DAILY_FOOD_MAX}개까지</p>
        <div className={styles.mindSteps} ref={stepsRef} role="tablist" aria-label="기록 단계">
          {cats.map((cat, i) => <button key={cat.id} type="button" role="tab" aria-selected={step === i} aria-current={step === i ? "step" : undefined} data-done={day[cat.id] ? "" : undefined} onClick={() => setStep(i)}>
            <b>{day[cat.id] ? "✓" : i + 1}</b><span>{cat.label}</span>
          </button>)}
          <button type="button" role="tab" aria-selected={step === last} aria-current={step === last ? "step" : undefined} data-done={did.length ? "" : undefined} onClick={() => setStep(last)}>
            <b>{did.length ? "✓" : "+"}</b><span>한 일</span>
          </button>
        </div>
        {crisis && <HelpBanner alert />}
        {c ? <section className={styles.mindStep} aria-label={c.label}>
          <div className={styles.mindHead}>
            <h4><CategoryIcon id={c.id} emoji={c.emoji} size={20} />{c.label}</h4>
            <span className={`delta ${delta === null ? "" : delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`} aria-live="polite">
              {delta === null ? "어제보다?" : delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : "그대로"}
            </span>
          </div>
          <div className="score-row" role="radiogroup" aria-label={`${c.label}, 어제보다 얼마나`}>
            {delta !== null && <span className="score-thumb" aria-hidden="true" style={{ transform: `translateX(${(delta + DELTA_MAX) * 100}%)` }} />}
            {DELTAS.map((d) => <button key={d} type="button" role="radio" aria-checked={delta === d} className={`score-btn ${d < 0 ? "neg" : d > 0 ? "pos" : ""} ${delta === d ? "on" : ""}`} onClick={() => pickDelta(c.id, d)}>
              {d === 0 ? "=" : signed(d)}
            </button>)}
          </div>
          {c.id === "mind" && <div className={`chips wrap ${styles.mindChips}`} aria-label="지금 마음 고르기">
            {MOOD_CHIPS.map((m) => <button key={m} type="button" className={`chip ${e?.note?.includes(m) ? "on" : ""}`} onClick={() => pickMood(c.id, m)}>{m}</button>)}
          </div>}
          <textarea className={`note ${styles.mindNote}`} rows={2} maxLength={500} placeholder={c.hint || "한 줄도 충분해"} value={e?.note ?? ""} onChange={(ev) => update(c.id, { note: ev.target.value })} aria-label={`${c.label} 한 줄`} />
        </section> : <section className={styles.mindStep} aria-label="오늘 한 일">
          <div className={styles.mindHead}><h4>오늘 한 일</h4><span className="tiny muted">작은 것도 좋아</span></div>
          <div className="chips wrap">
            {did.filter((d) => !ACTION_PRESETS.includes(d)).map((d) => <button key={d} type="button" className="chip on" onClick={() => toggleDid(d)}>{d} <span className="x">×</span></button>)}
            {ACTION_PRESETS.map((p) => <button key={p} type="button" className={`chip ${did.includes(p) ? "on" : ""}`} onClick={() => toggleDid(p)}>{p}</button>)}
          </div>
          <form className="inline-input" style={{ marginTop: 10 }} onSubmit={(ev) => { ev.preventDefault(); toggleDid(custom); setCustom(""); }}>
            <input value={custom} onChange={(ev) => setCustom(ev.target.value)} placeholder="직접 입력 (예: 공고 2개 지원)" maxLength={40} aria-label="오늘 한 일 직접 입력" />
            <button type="submit" className="btn sm soft" disabled={!custom.trim()} aria-label="추가"><IconPlus style={{ width: 16, height: 16 }} /></button>
          </form>
        </section>}
        <div className="sheet-actions">
          {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep((s) => s - 1)}>이전</button>}
          {step < last ? <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>{delta === null ? "건너뛰기" : "다음 →"}</button>
            : <button type="button" className="btn" onClick={close}>다 들려줬어</button>}
        </div>
      </div>}
    </Sheet>
  );
}
