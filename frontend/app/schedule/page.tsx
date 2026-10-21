"use client";

import { useEffect, useMemo, useState } from "react";
import { MemoCat, memoCatById } from "@/lib/categories";
import { ScheduleItem, addDays, loadSchedule, saveSchedule, todayKey, uid } from "@/lib/storage";
import { CatChips, DOW_LABELS, Empty, Hero, Sheet, TopBar, fmtDate } from "@/components/ui";
import { IconCheck, IconChevronL, IconChevronR, IconPlus } from "@/components/Icons";

function weekStart(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return addDays(key, -dow);
}

export default function SchedulePage() {
  const today = todayKey();
  const [items, setItems] = useState<ScheduleItem[] | null>(null);
  const [sel, setSel] = useState(today);
  const [editing, setEditing] = useState<ScheduleItem | "new" | null>(null);

  useEffect(() => setItems(loadSchedule()), []);

  const commit = (next: ScheduleItem[]) => {
    setItems(next);
    saveSchedule(next);
  };

  const ws = weekStart(sel);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws]);

  const byDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const it of items ?? []) (map[it.date] ??= []).push(it);
    for (const k in map) map[k].sort((a, b) => (a.time ?? "99") < (b.time ?? "99") ? -1 : 1);
    return map;
  }, [items]);

  const upcoming = useMemo(
    () =>
      (items ?? [])
        .filter((i) => i.date > sel && !i.done)
        .sort((a, b) => (a.date + (a.time ?? "99")).localeCompare(b.date + (b.time ?? "99")))
        .slice(0, 5),
    [items, sel]
  );

  const toggle = (id: string) => items && commit(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const upsert = (it: ScheduleItem) => {
    if (!items) return;
    const exists = items.some((x) => x.id === it.id);
    commit(exists ? items.map((x) => (x.id === it.id ? it : x)) : [...items, it]);
    setEditing(null);
    setSel(it.date);
  };
  const remove = (id: string) => {
    if (!items) return;
    commit(items.filter((x) => x.id !== id));
    setEditing(null);
  };

  if (!items) return <TopBar title="일정" />;

  const [wy, wm] = ws.split("-").map(Number);
  const dayItems = byDate[sel] ?? [];
  const todayItems = byDate[today] ?? [];
  const todayLeft = todayItems.filter((i) => !i.done);
  const nextItem = todayLeft[0];

  return (
    <>
      <TopBar
        title="일정"
        eyebrow={sel === today ? "오늘" : fmtDate(sel)}
        right={sel !== today ? <button className="text-btn" onClick={() => setSel(today)}>오늘로</button> : undefined}
      />
      <div className="screen">
        <Hero
          label={fmtDate(today)}
          title={todayItems.length === 0 ? "오늘은 비어 있어요" : todayLeft.length === 0 ? "오늘 일정을 다 끝냈어요" : `오늘 ${todayLeft.length}개 남았어요`}
          sub={nextItem ? `다음 · ${nextItem.time ? nextItem.time + " " : ""}${nextItem.title}` : undefined}
          stats={[`완료 ${todayItems.length - todayLeft.length}/${todayItems.length}`, `다가오는 ${upcoming.length}개`]}
        />
        <section className="card flat" style={{ padding: 12, marginTop: 12 }}>
          <div className="week-nav">
            <button className="icon-btn" aria-label="지난주" onClick={() => setSel(addDays(sel, -7))}><IconChevronL /></button>
            <b>{wy}년 {wm}월</b>
            <button className="icon-btn" aria-label="다음주" onClick={() => setSel(addDays(sel, 7))}><IconChevronR /></button>
          </div>
          <div className="week">
            {week.map((k, i) => {
              const marks = (byDate[k] ?? []).slice(0, 3);
              return (
                <button key={k} className={`day ${k === sel ? "on" : ""} ${k === today ? "today" : ""}`} onClick={() => setSel(k)}>
                  <small>{DOW_LABELS[i]}</small>
                  <b>{Number(k.slice(8))}</b>
                  <span className="marks">
                    {marks.map((m) => (
                      <i key={m.id} style={{ opacity: m.done ? 0.35 : 1 }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="section-title">
          <span>{sel === today ? "오늘 일정" : `${fmtDate(sel)} 일정`}</span>
          <span className="tiny muted">{dayItems.length ? `${dayItems.filter((i) => i.done).length}/${dayItems.length} 완료` : ""}</span>
        </div>

        {dayItems.length === 0 ? (
          <Empty icon="🗓️" title="일정이 비어 있어요">
            여유도 일정이에요. 필요하면 + 로 추가해요.
          </Empty>
        ) : (
          <div className="stack">
            {dayItems.map((it) => (
              <EventRow key={it.id} item={it} onToggle={() => toggle(it.id)} onEdit={() => setEditing(it)} />
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="section-title"><span>다가오는 일정</span></div>
            <div className="stack">
              {upcoming.map((it) => (
                <EventRow key={it.id} item={it} showDate onToggle={() => toggle(it.id)} onEdit={() => setEditing(it)} />
              ))}
            </div>
          </>
        )}
      </div>

      <button className="fab" aria-label="일정 추가" onClick={() => setEditing("new")}>
        <IconPlus />
      </button>

      <EventSheet
        key={editing === "new" ? `new-${sel}` : editing?.id ?? "closed"}
        item={editing === "new" ? null : editing}
        defaultDate={sel}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={upsert}
        onDelete={remove}
      />
    </>
  );
}

function EventRow({ item, showDate, onToggle, onEdit }: { item: ScheduleItem; showDate?: boolean; onToggle: () => void; onEdit: () => void }) {
  const c = memoCatById(item.cat);
  return (
    <div className={`event ${item.done ? "done" : ""}`}>
      <span className="time">{showDate ? fmtDate(item.date, false).replace("월 ", "/").replace("일", "") : item.time ?? "종일"}</span>
      <button className="grow" style={{ background: "none", border: "none", textAlign: "left", padding: 0 }} onClick={onEdit}>
        <div className="title">{item.title}</div>
        <div className="tiny muted">{showDate && item.time ? `${item.time} · ` : ""}{c.emoji} {c.label}</div>
      </button>
      <button className="check" aria-label={item.done ? "완료 취소" : "완료"} onClick={onToggle}>
        {item.done && <IconCheck />}
      </button>
    </div>
  );
}

function EventSheet({
  item,
  defaultDate,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  item: ScheduleItem | null;
  defaultDate: string;
  open: boolean;
  onClose: () => void;
  onSave: (i: ScheduleItem) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [time, setTime] = useState(item?.time ?? "");
  const [cat, setCat] = useState<MemoCat | "all">(item?.cat ?? "etc");

  const save = () => {
    const t = title.trim();
    if (!t || !date) return;
    onSave({
      id: item?.id ?? uid(),
      title: t,
      date,
      time: time || undefined,
      cat: cat === "all" ? "etc" : cat,
      done: item?.done ?? false,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={item ? "일정 수정" : "새 일정"}>
      <div className="stack">
        <div className="field">
          <label>할 일</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 저녁 산책 20분" maxLength={60} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>시간 (선택)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>카테고리</label>
          <CatChips value={cat} onChange={setCat} all={false} wrap />
        </div>
      </div>
      <div className="sheet-actions">
        {item && (
          <button className="btn ghost" style={{ flex: "0 0 auto", color: "var(--down)" }} onClick={() => onDelete(item.id)}>삭제</button>
        )}
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={save} disabled={!title.trim() || !date}>저장</button>
      </div>
    </Sheet>
  );
}
