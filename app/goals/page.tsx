"use client";

import { useEffect, useMemo, useState } from "react";
import { MemoCat, memoCatById } from "@/lib/categories";
import { Goal, GoalStep, goalProgress, loadGoals, saveGoals, todayKey, uid } from "@/lib/storage";
import { CatChips, CatTag, Empty, Sheet, TopBar, fmtDate } from "@/components/ui";
import { IconCheck, IconPlus } from "@/components/Icons";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => setGoals(loadGoals()), []);

  const commit = (next: Goal[]) => {
    setGoals(next);
    saveGoals(next);
  };

  const active = useMemo(() => (goals ?? []).filter((g) => !g.doneAt), [goals]);
  const done = useMemo(() => (goals ?? []).filter((g) => g.doneAt).sort((a, b) => b.doneAt! - a.doneAt!), [goals]);

  const toggleStep = (goalId: string, stepId: string) => {
    if (!goals) return;
    commit(
      goals.map((g) =>
        g.id !== goalId ? g : { ...g, steps: g.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)) }
      )
    );
  };
  const toggleDone = (goalId: string) => {
    if (!goals) return;
    commit(goals.map((g) => (g.id !== goalId ? g : { ...g, doneAt: g.doneAt ? undefined : Date.now() })));
  };
  const upsert = (g: Goal) => {
    if (!goals) return;
    const exists = goals.some((x) => x.id === g.id);
    commit(exists ? goals.map((x) => (x.id === g.id ? g : x)) : [g, ...goals]);
    setEditing(null);
  };
  const remove = (id: string) => {
    if (!goals) return;
    commit(goals.filter((x) => x.id !== id));
    setEditing(null);
  };

  if (!goals) return <TopBar title="목표" />;

  return (
    <>
      <TopBar title="목표" eyebrow={active.length ? `진행 중 ${active.length}개` : "작게 쪼갤수록 속도가 붙어요"} />
      <div className="screen">
        {active.length === 0 && done.length === 0 ? (
          <Empty icon="🚩" title="목표를 하나 세워볼까요">
            크게 잡지 않아도 돼요.
            <br />
            단계를 쪼개두면 하나씩 체크하면서 가속이 붙어요.
          </Empty>
        ) : (
          <div className="stack">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} onStep={toggleStep} onDone={toggleDone} onEdit={() => setEditing(g)} />
            ))}
          </div>
        )}

        {done.length > 0 && (
          <>
            <div className="section-title">
              <span>달성한 목표 {done.length}</span>
              <button className="text-btn" onClick={() => setShowDone((v) => !v)}>{showDone ? "접기" : "펼치기"}</button>
            </div>
            {showDone && (
              <div className="stack">
                {done.map((g) => (
                  <GoalCard key={g.id} goal={g} onStep={toggleStep} onDone={toggleDone} onEdit={() => setEditing(g)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <button className="fab" aria-label="목표 추가" onClick={() => setEditing("new")}>
        <IconPlus />
      </button>

      <GoalSheet
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        goal={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={upsert}
        onDelete={remove}
      />
    </>
  );
}

function GoalCard({
  goal: g,
  onStep,
  onDone,
  onEdit,
}: {
  goal: Goal;
  onStep: (g: string, s: string) => void;
  onDone: (g: string) => void;
  onEdit: () => void;
}) {
  const c = memoCatById(g.cat);
  const p = goalProgress(g);
  const doneSteps = g.steps.filter((s) => s.done).length;
  const dday = g.due ? Math.ceil((new Date(g.due).getTime() - new Date(todayKey()).getTime()) / 86400000) : null;
  return (
    <section className={`card goal ${g.doneAt ? "done-goal" : ""}`}>
      <div className="goal-head">
        <div className="grow">
          <div className="memo-meta" style={{ marginBottom: 4 }}>
            <CatTag cat={g.cat} />
            {dday !== null && !g.doneAt && (
              <>
                <span>·</span>
                <span style={{ color: dday < 0 ? "var(--down)" : undefined }}>{dday === 0 ? "오늘까지" : dday > 0 ? `D-${dday}` : `${-dday}일 지남`}</span>
              </>
            )}
          </div>
          <div className="goal-title">{g.title}</div>
          {g.why && <p className="goal-why">{g.why}</p>}
        </div>
        <button className="text-btn muted" onClick={onEdit}>편집</button>
      </div>
      <div className="progress" style={{ ["--bar" as string]: c.color }}>
        <i style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
      {g.steps.length > 0 && (
        <div className="steps">
          {g.steps.map((s) => (
            <button key={s.id} className={`step ${s.done ? "done" : ""}`} onClick={() => onStep(g.id, s.id)}>
              <span className="box">{s.done && <IconCheck />}</span>
              <span>{s.text}</span>
            </button>
          ))}
        </div>
      )}
      <div className="goal-foot">
        <span>
          {g.steps.length ? `${doneSteps}/${g.steps.length} 단계` : "단계 없음"}
          {g.due && ` · ${fmtDate(g.due, false)}까지`}
        </span>
        <button className={`text-btn ${g.doneAt ? "muted" : ""}`} onClick={() => onDone(g.id)}>
          {g.doneAt ? "다시 진행" : "달성 완료"}
        </button>
      </div>
    </section>
  );
}

function GoalSheet({
  goal,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  goal: Goal | null;
  open: boolean;
  onClose: () => void;
  onSave: (g: Goal) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [cat, setCat] = useState<MemoCat | "all">(goal?.cat ?? "work");
  const [why, setWhy] = useState(goal?.why ?? "");
  const [due, setDue] = useState(goal?.due ?? "");
  const [steps, setSteps] = useState<GoalStep[]>(goal?.steps ?? []);
  const [newStep, setNewStep] = useState("");

  const addStep = () => {
    const t = newStep.trim();
    if (!t) return;
    setSteps((s) => [...s, { id: uid(), text: t, done: false }]);
    setNewStep("");
  };

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onSave({
      id: goal?.id ?? uid(),
      title: t,
      cat: cat === "all" ? "etc" : cat,
      why: why.trim(),
      due: due || undefined,
      steps,
      createdAt: goal?.createdAt ?? Date.now(),
      doneAt: goal?.doneAt,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={goal ? "목표 편집" : "새 목표"}>
      <div className="stack">
        <div className="field">
          <label>목표</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 이직 준비" maxLength={60} />
        </div>
        <div className="field">
          <label>카테고리</label>
          <CatChips value={cat} onChange={setCat} all={false} wrap />
        </div>
        <div className="field">
          <label>왜 이 목표인가요? (선택)</label>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="흔들릴 때 다시 읽을 한 줄" maxLength={100} />
        </div>
        <div className="field">
          <label>기한 (선택)</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field">
          <label>단계</label>
          {steps.length > 0 && (
            <div className="steps" style={{ marginBottom: 4 }}>
              {steps.map((s) => (
                <div key={s.id} className="step" style={{ cursor: "default" }}>
                  <span className="box" style={{ opacity: 0.5 }} />
                  <span className="grow">{s.text}</span>
                  <button className="text-btn danger" onClick={() => setSteps((x) => x.filter((y) => y.id !== s.id))}>삭제</button>
                </div>
              ))}
            </div>
          )}
          <div className="inline-input">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addStep();
                }
              }}
              placeholder="작은 단계 하나 (예: 이력서 최신화)"
              maxLength={60}
            />
            <button type="button" className="btn sm soft" onClick={addStep} disabled={!newStep.trim()}>추가</button>
          </div>
        </div>
      </div>
      <div className="sheet-actions">
        {goal && (
          <button className="btn ghost" style={{ flex: "0 0 auto", color: "var(--down)" }} onClick={() => onDelete(goal.id)}>삭제</button>
        )}
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={save} disabled={!title.trim()}>저장</button>
      </div>
    </Sheet>
  );
}
