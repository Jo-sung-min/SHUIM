"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import HelpBanner from "./HelpBanner";
import MoruCompanion from "./MoruCompanion";
import { BreathSheet } from "./CareSheets";
import { IconCheck } from "./Icons";
import { SkeletonCard } from "./ui";
import { markCareDone } from "@/lib/care";
import { hasCrisisSignal } from "@/lib/crisis";
import { addDays } from "@/lib/dates";
import { haptic } from "@/lib/haptics";
import { DEFAULT_COMPANION, loadCompanion, type Companion } from "@/lib/moru";
import { petRequest } from "@/lib/pet";
import { route } from "@/lib/routes";
import { sessionUserId, syncRecords } from "@/lib/storage";
import { useCurrentDay } from "@/lib/use-current-day";
import {
  AFTER_OPTIONS, EMPTY_STEPS, ENERGY_OPTIONS, KIND_LABEL, STEP_LINES, STEP_TEXT_MAX, WHEN_OPTIONS,
  afterLabel, customStep, easedEnergy, elapsedLabel, entriesOn, finishStep, lastAfterOn, loadSteps, pickSteps, planLine, recordStepDid, refOf, saveSteps, sayStep,
  type StepAfter, type StepEnergy, type StepEntry, type StepRef, type StepState,
} from "@/lib/steps";
import moruStyles from "./MoruPet.module.css";
import styles from "./StepCare.module.css";

/** 기운 고르기 → 카드 고르기 → (나중에: 언제 고르기) → 하는 중 → 하기 전보다 어때 → 끝 */
type Phase = "energy" | "pick" | "when" | "doing" | "after" | "done";

/**
 * 기록 탭 › 나 돌보기: 작은 한 걸음.
 * 지금 기운을 고르면 그 기운에 맞는 아주 작은 행동 세 장이 나오고, 하나를 해 본 뒤 "하기 전보다 어때?"를 한 번 누른다.
 * 끝낸 행동은 "오늘 한 일"에 더해진다. 그 밖의 것(기운·응답·정해 둔 한 걸음)은 이 기기에만 남는다 (lib/steps.ts).
 * 못 해도 잃는 것이 없다: 그만두기·내일로·지우기뿐이고 탓하는 말은 없다. AI 는 쓰지 않는다.
 */
export default function StepCare() {
  const [today] = useCurrentDay();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<StepState>(EMPTY_STEPS);
  const [phase, setPhase] = useState<Phase>("energy");
  const [energy, setEnergy] = useState<StepEnergy>(2);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<StepRef | null>(null);
  const [writing, setWriting] = useState(false);
  const [custom, setCustom] = useState("");
  const [when, setWhen] = useState(WHEN_OPTIONS[0].id);
  /** "하기 전보다 어때?"를 기다리는 걸음 */
  const [pending, setPending] = useState<{ step: StepRef; energy: StepEnergy } | null>(null);
  const [last, setLast] = useState<StepEntry | null>(null);
  const [line, setLine] = useState("");
  const [companion, setCompanion] = useState<Companion>(DEFAULT_COMPANION);
  const [breathing, setBreathing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const breathCounted = useRef(false);

  const commit = (next: StepState) => { setState(next); saveSteps(next); };

  useEffect(() => {
    let alive = true;
    setReady(false);
    // 끝낸 걸음을 "오늘 한 일"에 더하기 전에, 로그인 계정이면 서버의 오늘 기록을 먼저 받아 둔다 (기록 탭의 오늘 쓰기와 같다)
    void syncRecords().then(() => {
      if (!alive) return;
      const loaded = loadSteps(today);
      setState(loaded);
      setCompanion(loadCompanion());
      setPicked(null);
      setLast(null);
      if (loaded.doing) {
        setPending({ step: loaded.doing.step, energy: loaded.doing.energy });
        setEnergy(loaded.doing.energy);
        setNow(Date.now());
        setPhase("doing");
        setLine("다녀왔구나. 어땠는지는 천천히 알려 줘.");
      } else {
        setPending(null);
        setPhase("energy");
        setLine(sayStep(STEP_LINES.intro));
      }
      setReady(true);
    });
    return () => { alive = false; };
  }, [today]);

  // 하는 중: 시작한 지 몇 분째인지만 조용히 (20초마다)
  useEffect(() => {
    if (phase !== "doing") return;
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const doneToday = useMemo(() => entriesOn(state, today), [state, today]);
  const lastAfter = lastAfterOn(state, today);
  const shownEnergy = easedEnergy(energy, lastAfter);
  const cards = useMemo(() => pickSteps(shownEnergy, today, round, doneToday.map((e) => e.stepId)), [shownEnergy, today, round, doneToday]);
  const crisis = writing && hasCrisisSignal(custom);
  const written = writing ? customStep(custom, energy) : null;
  // 직접 쓴 글에서 많이 힘든 신호가 보이면 "해 보기"를 권하지 않고 도움 받을 곳을 먼저 보여 준다
  const chosen: StepRef | null = crisis ? null : writing ? (written ? refOf(written) : null) : picked;

  const chooseEnergy = (value: StepEnergy) => {
    haptic(8);
    setEnergy(value);
    setRound(0);
    setPicked(null);
    setWriting(false);
    setCustom("");
    setPhase("pick");
    setLine(sayStep(easedEnergy(value, lastAfter) !== value ? STEP_LINES.eased : STEP_LINES.pick[value]));
  };
  const start = () => {
    if (!chosen) return;
    haptic(10);
    const startedAt = Date.now();
    commit({ ...state, doing: { step: chosen, energy, date: today, startedAt } });
    setPending({ step: chosen, energy });
    setNow(startedAt);
    setPhase("doing");
    setLine(sayStep(STEP_LINES.go));
    if (chosen.breath) { breathCounted.current = false; setBreathing(true); }
  };
  const stop = () => {
    commit({ ...state, doing: null });
    setPending(null);
    setPicked(null);
    setPhase("energy");
    setLine(sayStep(STEP_LINES.stopped));
  };
  const answer = (after: StepAfter) => {
    if (!pending) return;
    haptic(after === 1 ? [10, 50, 10] : 8);
    const next = finishStep(state, pending.step, pending.energy, after, today, Date.now());
    commit(next);
    void recordStepDid(today, pending.step.did);
    setLast(next.log[next.log.length - 1]);
    setPending(null);
    setPicked(null);
    setWriting(false);
    setCustom("");
    setPhase("done");
    setLine(sayStep(STEP_LINES.after[String(after)]));
  };
  const savePlan = () => {
    const option = WHEN_OPTIONS.find((o) => o.id === when);
    if (!chosen || !option) return;
    haptic(8);
    commit({ ...state, doing: null, plan: { step: chosen, energy, when: option.label, due: option.tomorrow ? addDays(today, 1) : today } });
    setPicked(null);
    setWriting(false);
    setCustom("");
    setPhase("energy");
    setLine(sayStep(STEP_LINES.planned));
  };
  const planDone = () => {
    if (!state.plan) return;
    haptic(8);
    setPending({ step: state.plan.step, energy: state.plan.energy });
    setPhase("after");
    setLine("했구나. 하기 전이랑 견주면 어때?");
  };
  const planTomorrow = () => {
    if (!state.plan) return;
    commit({ ...state, plan: { ...state.plan, due: addDays(today, 1) } });
    setLine(sayStep(STEP_LINES.postponed));
  };
  const planDrop = () => {
    commit({ ...state, plan: null });
    setLine(sayStep(STEP_LINES.dropped));
  };

  /** 1분을 끝까지 숨 쉬었다: 홈의 숨 고르기 칸에도 표시하고, 로그인 계정이면 모루의 온기 한 칸 (서버의 breath 돌봄) */
  const onBreathDone = useCallback(() => {
    if (breathCounted.current) return;
    breathCounted.current = true;
    markCareDone("breath", today);
    if (sessionUserId()) void petRequest("/care", { action: "breath" }, "POST").catch(() => { /* 모루의 방에 닿지 못해도 숨 고르기는 끝난 것 */ });
  }, [today]);
  const closeBreath = () => {
    setBreathing(false);
    if (breathCounted.current) setPhase("after");
  };

  if (!ready) {
    return (
      <div className="stack" role="status" aria-label="한 걸음을 준비하고 있어요" style={{ marginTop: 16 }}>
        <SkeletonCard lines={1} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  const plan = state.plan;
  const planBusy = phase === "doing" || phase === "after";
  const doing = pending?.step ?? null;

  return (
    <div className={styles.wrap}>
      <p className={`${moruStyles.flowLine} ${styles.line}`} aria-live="polite">
        <span className={moruStyles.flowFace} aria-hidden="true"><MoruCompanion appearance={companion.appearance} mood={phase === "done" && last?.after === 1 ? "happy" : "idle"} /></span>
        <span><b>{companion.name}</b>{line}</span>
      </p>

      {plan && (
        <section className={`card ${styles.plan}`} aria-label="정해 둔 한 걸음">
          <span className="tiny muted">{plan.due > today ? "내일 하기로 한 한 걸음" : "정해 둔 한 걸음"}</span>
          <b className={styles.planLine}>{planLine(plan)}</b>
          {!planBusy && (
            <div className={styles.planActions}>
              <button type="button" className="btn sm" onClick={planDone}>했어</button>
              {plan.due <= today && <button type="button" className="btn sm ghost" onClick={planTomorrow}>내일로</button>}
              <button type="button" className="btn sm ghost" onClick={planDrop}>지우기</button>
            </div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="step-title">
        {phase === "energy" && (
          <>
            <h2 id="step-title" className={styles.title}>지금 기운은 어때요?</h2>
            <p className={styles.sub}>{doneToday.length ? "오늘은 이미 한 걸음 걸었어요. 더 안 해도 괜찮아요." : "기운에 맞는 아주 작은 것 세 가지를 보여 드릴게요."}</p>
            <div className={styles.options}>
              {ENERGY_OPTIONS.map((o) => (
                <button key={o.value} type="button" className={`reason glass ${styles.option}`} onClick={() => chooseEnergy(o.value)}>
                  <span><b>{o.label}</b><small>{o.hint}</small></span>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "pick" && (
          <>
            <div className={styles.head}>
              <h2 id="step-title" className={styles.title}>하나만 골라 볼까요</h2>
              <button type="button" className="text-btn" onClick={() => { setPhase("energy"); setLine(sayStep(STEP_LINES.intro)); }}>기운 다시 고르기</button>
            </div>
            <p className={styles.sub}>지금 바로 해도 되고, 언제 할지만 정해 둬도 돼요.</p>
            <div className={styles.options} role="radiogroup" aria-label="작은 한 걸음 고르기">
              {cards.map((s) => {
                const on = !writing && picked?.id === s.id;
                return (
                  <button key={s.id} type="button" role="radio" aria-checked={on} className={`reason glass ${styles.option} ${on ? `on ${styles.on}` : ""}`}
                    onClick={() => { haptic(6); setWriting(false); setPicked(refOf(s)); }}>
                    <span><b>{s.text}</b><small>{KIND_LABEL[s.kind]} · {s.min}분쯤</small></span>
                    {on && <span className={styles.check} aria-hidden="true"><IconCheck /></span>}
                  </button>
                );
              })}
            </div>
            <div className={styles.links}>
              <button type="button" className="text-btn" onClick={() => { setRound((r) => r + 1); setPicked(null); }}>다른 것 보기</button>
              <button type="button" className="text-btn" aria-expanded={writing} onClick={() => { setWriting((w) => !w); setPicked(null); }}>{writing ? "직접 쓰기 닫기" : "직접 쓰기"}</button>
            </div>
            {writing && (
              <div className="inline-input" style={{ marginTop: 4 }}>
                <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="내가 할 작은 것 (예: 화분에 물 주기)" maxLength={STEP_TEXT_MAX} aria-label="직접 쓰는 한 걸음" autoFocus />
              </div>
            )}
            {crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}
            <div className={styles.actions}>
              <button type="button" className="btn ghost" disabled={!chosen} onClick={() => { setWhen(WHEN_OPTIONS[0].id); setPhase("when"); }}>나중에 할게</button>
              <button type="button" className="btn" disabled={!chosen} onClick={start}>지금 해 볼게</button>
            </div>
          </>
        )}

        {phase === "when" && chosen && (
          <>
            <h2 id="step-title" className={styles.title}>언제 할까요?</h2>
            <p className={styles.sub}>때를 하나 정해 두면 다음에 기록 탭을 열 때 맨 위에 보여 드려요.</p>
            <div className="chips wrap" role="radiogroup" aria-label="언제 할지">
              {WHEN_OPTIONS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={when === o.id} className={`chip ${when === o.id ? "on" : ""}`} onClick={() => setWhen(o.id)}>{o.label}</button>
              ))}
            </div>
            <p className={styles.preview}>{WHEN_OPTIONS.find((o) => o.id === when)?.label} → {chosen.text}</p>
            <div className={styles.actions}>
              <button type="button" className="btn ghost" onClick={() => setPhase("pick")}>뒤로</button>
              <button type="button" className="btn" onClick={savePlan}>정해 둘게</button>
            </div>
          </>
        )}

        {phase === "doing" && doing && (
          <>
            <div className={styles.doing}>
              <span className="tiny muted">지금 하는 한 걸음</span>
              <h2 id="step-title" className={styles.big}>{doing.text}</h2>
              <small>{elapsedLabel(state.doing?.startedAt ?? now, now)} · 다 하고 돌아와서 눌러 주세요</small>
              {doing.breath && <button type="button" className="btn sm soft" onClick={() => { breathCounted.current = false; setBreathing(true); }}>숨 고르기 열기</button>}
              {doing.href && <Link href={route(doing.href)} className="btn sm soft">외침으로 가기</Link>}
            </div>
            <div className={styles.actions}>
              <button type="button" className="btn ghost" onClick={stop}>오늘은 그만둘래</button>
              <button type="button" className="btn" onClick={() => { setPhase("after"); setLine("했구나. 하기 전이랑 견주면 어때?"); }}>하고 왔어</button>
            </div>
          </>
        )}

        {phase === "after" && doing && (
          <>
            <h2 id="step-title" className={styles.title}>하기 전보다 어때요?</h2>
            <p className={styles.sub}>{doing.text} · 느낀 그대로 하나만 눌러 주세요. 맞는 답은 없어요.</p>
            <div className={styles.options}>
              {AFTER_OPTIONS.map((o) => (
                <button key={o.value} type="button" className={`reason glass ${styles.option}`} onClick={() => answer(o.value)}>
                  <span><b>{o.label}</b></span>
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "done" && (
          <div className={styles.doing}>
            <span className={styles.doneMark} aria-hidden="true"><IconCheck /></span>
            <h2 id="step-title" className={styles.big}>{last ? last.text : "한 걸음"}</h2>
            {last && <small>오늘 한 일에 남겼어요 · {last.did}<br />하기 전보다 · {afterLabel(last.after)}</small>}
            <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={() => { setPhase("energy"); setLine(sayStep(STEP_LINES.again)); }}>하나 더 해 볼래</button>
          </div>
        )}
      </section>

      {doneToday.length > 0 && (
        <section aria-labelledby="step-today">
          <div className="section-title" style={{ marginTop: 0 }}>
            <span id="step-today">오늘 걸은 걸음</span>
            <span className="tiny muted">{doneToday.length}개</span>
          </div>
          <ul className={`card ${styles.list}`}>
            {doneToday.map((e) => <li key={e.at}><span>{e.text}</span><span className="muted">{afterLabel(e.after)}</span></li>)}
          </ul>
        </section>
      )}

      <p className={styles.note}>소로우는 의료 서비스가 아니에요. 힘든 날이 오래 이어지면 전문가와 이야기해 보세요. 기운과 응답은 이 기기에만 남고, 끝낸 일의 이름만 오늘 한 일에 더해져요.</p>
      <HelpBanner />

      <BreathSheet open={breathing} onClose={closeBreath} onDone={onBreathDone} />
    </div>
  );
}
