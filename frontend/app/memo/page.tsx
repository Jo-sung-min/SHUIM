"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MEMO_CATEGORIES, MemoCat, memoCatById } from "@/lib/categories";
import { Memo, loadMemos, saveMemos, syncRecords, todayKey, uid } from "@/lib/storage";
import { CatChips, CatTag, Empty, Hero, Segmented, Sheet, SkeletonScreen, TopBar, fmtDate, fmtRelative } from "@/components/ui";
import { IconClock, IconNote, IconPin, IconPlus } from "@/components/Icons";
import { CategoryIcon } from "@/components/CategoryIcon";
import { useScrollMemory } from "@/lib/scroll-memory";
import { toastSuccess } from "@/lib/toast";

type Filter = MemoCat | "all";
type View = "list" | "lookback";

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<Memo | "new" | null>(null);

  useEffect(() => { syncRecords().then(() => setMemos(loadMemos())); }, []);

  const commit = (next: Memo[]) => {
    setMemos(next);
    saveMemos(next);
  };

  const list = useMemo(() => {
    if (!memos) return [];
    return memos
      .filter((m) => filter === "all" || m.cat === filter)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [memos, filter]);

  const upsert = (m: Memo) => {
    if (!memos) return;
    const exists = memos.some((x) => x.id === m.id);
    commit(exists ? memos.map((x) => (x.id === m.id ? m : x)) : [m, ...memos]);
    setEditing(null);
    toastSuccess(exists ? "메모를 고쳤어요" : "메모를 저장했어요");
  };
  const remove = (id: string) => {
    if (!memos) return;
    commit(memos.filter((x) => x.id !== id));
    setEditing(null);
    toastSuccess("메모를 지웠어요");
  };
  useScrollMemory(memos !== null);

  if (!memos) return <><TopBar title="메모" /><div className="screen"><SkeletonScreen count={3} lines={2} label="메모를 불러오고 있어요" /></div></>;

  const pinnedCount = memos.filter((m) => m.pinned).length;
  const latest = memos.length ? Math.max(...memos.map((m) => m.updatedAt)) : null;

  return (
    <>
      <TopBar title="메모" eyebrow={`${memos.length}개`} />
      <div className="screen">
        <Hero
          label={latest ? `마지막 메모 ${fmtRelative(latest)}` : "노트"}
          title={memos.length ? "생각을 흘려보내지 말고 적어둬요" : "첫 장을 열어볼까요"}
          stats={[`메모 ${memos.length}개`, `고정 ${pinnedCount}개`]}
        />
        <div style={{ marginTop: 12 }}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "메모" },
              { value: "lookback", label: "되돌아보기" },
            ]}
          />
        </div>

        {view === "lookback" && <Lookback memos={memos} />}

        {view === "list" && (
          <div style={{ marginTop: 10 }}>
            <CatChips value={filter} onChange={setFilter} />
          </div>
        )}

        {view === "list" && list.length === 0 ? (
          <Empty icon={<IconNote />} title={filter === "all" ? "아직 메모가 없어요" : "이 카테고리엔 아직 메모가 없어요"} action={<button type="button" className="btn ghost" onClick={() => setEditing("new")}>첫 메모 쓰기</button>}>
            생각, 깨달음, 다짐… 카테고리별로 모아두면
            <br />
            오늘의 나가 읽고 방향을 잡아줘요.
          </Empty>
        ) : view === "list" ? (
          <div className="notepad">
            <div className="notepad-binding" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i />
            </div>
            {list.map((m) => (
              <button key={m.id} type="button" className="memo" onClick={() => setEditing(m)}>
                <div className="paper">
                  <div className="memo-meta">
                    <CatTag cat={m.cat} />
                    <span>·</span>
                    <span>{fmtRelative(m.updatedAt)}</span>
                    {m.pinned && (
                      <span className="pin" aria-label="고정됨">
                        <IconPin />
                      </span>
                    )}
                  </div>
                  <p className="memo-text">{m.text}</p>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button className="fab" aria-label="메모 추가" onClick={() => setEditing("new")}>
        <IconPlus />
      </button>

      <MemoSheet
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        memo={editing === "new" ? null : editing}
        open={editing !== null}
        defaultCat={filter === "all" ? "mind" : filter}
        onClose={() => setEditing(null)}
        onSave={upsert}
        onDelete={remove}
      />
    </>
  );
}

/* ================= 되돌아보기: 그때의 나 vs 지금의 나 ================= */

const DAY = 86400000;

function Lookback({ memos }: { memos: Memo[] }) {
  const pairs = useMemo(() => {
    return MEMO_CATEGORIES.map((c) => {
      const list = memos.filter((m) => m.cat === c.id).sort((a, b) => a.createdAt - b.createdAt);
      if (list.length < 2) return null;
      const first = list[0];
      const last = list[list.length - 1];
      return { cat: c, first, last, count: list.length, gapDays: Math.max(1, Math.round((last.createdAt - first.createdAt) / DAY)) };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [memos]);

  const timeline = useMemo(() => {
    const sorted = [...memos].sort((a, b) => b.createdAt - a.createdAt);
    const groups: { month: string; items: Memo[] }[] = [];
    for (const m of sorted) {
      const d = new Date(m.createdAt);
      const month = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
      const g = groups[groups.length - 1];
      if (g && g.month === month) g.items.push(m);
      else groups.push({ month, items: [m] });
    }
    return groups;
  }, [memos]);

  if (memos.length === 0) {
    return (
      <Empty icon={<IconClock />} title="되돌아볼 메모가 아직 없어요">
        다짐이나 원칙을 적어두면, 나중의 내가 그때의 나와 비교할 수 있어요.
      </Empty>
    );
  }

  const span = memos.length >= 2 ? Math.round((Math.max(...memos.map((m) => m.createdAt)) - Math.min(...memos.map((m) => m.createdAt))) / DAY) : 0;

  return (
    <>
      <div className="section-title">
        <span>그때의 나 → 지금의 나</span>
        <span className="tiny muted">{span > 0 ? `${span}일 사이` : "하루 안"}</span>
      </div>
      {pairs.length === 0 ? (
        <p className="tiny muted" style={{ margin: "0 4px 8px" }}>같은 카테고리에 메모가 2개 이상 쌓이면 처음과 지금을 나란히 보여줘요.</p>
      ) : (
        <div className="stack">
          {pairs.map(({ cat, first, last, count, gapDays }) => (
            <section key={cat.id} className="card lookback">
              <div className="cat-head">
                <span><CategoryIcon id={cat.id} emoji={cat.emoji} /> {cat.label}</span>
                <small>메모 {count}개</small>
              </div>
              <div className="pair">
                <div className="side">
                  <div className="when">{fmtDate(todayKey(new Date(first.createdAt)), false)} · 그때</div>
                  <p>{first.text}</p>
                </div>
                <div className="side now">
                  <div className="when">{fmtDate(todayKey(new Date(last.createdAt)), false)} · 지금</div>
                  <p>{last.text}</p>
                </div>
              </div>
              <div className="gap">{gapDays}일 동안 {count}번 적었어요</div>
            </section>
          ))}
        </div>
      )}

      <Link href="/" className="card row" style={{ padding: "12px 16px", marginTop: 10 }}>
        <span className="grow">
          <b style={{ fontSize: 14.5 }}>메모로 나를 점검하기</b>
          <div className="tiny muted">오늘의 나에서 메모 전체를 읽고 예전 다짐과 오늘을 대조해요</div>
        </span>
      </Link>

      <div className="section-title"><span>시간순</span></div>
      <section className="card">
        <div className="timeline">
          {timeline.map((g) => (
            <div key={g.month}>
              <div className="month">{g.month}</div>
              {g.items.map((m) => (
                <div key={m.id} className="item">
                  <span className="d">{fmtDate(todayKey(new Date(m.createdAt)), false).replace("월 ", "/").replace("일", "")}</span>
                  <p>
                    <CategoryIcon id={memoCatById(m.cat).id} emoji={memoCatById(m.cat).emoji} size={14} />{" "}
                    {m.text}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MemoSheet({
  memo,
  open,
  defaultCat,
  onClose,
  onSave,
  onDelete,
}: {
  memo: Memo | null;
  open: boolean;
  defaultCat: MemoCat;
  onClose: () => void;
  onSave: (m: Memo) => void;
  onDelete: (id: string) => void;
}) {
  const [cat, setCat] = useState<MemoCat | "all">(memo?.cat ?? defaultCat);
  const [text, setText] = useState(memo?.text ?? "");
  const [pinned, setPinned] = useState(memo?.pinned ?? false);

  const save = () => {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    onSave({
      id: memo?.id ?? uid(),
      cat: cat === "all" ? "etc" : cat,
      text: t,
      pinned,
      createdAt: memo?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={memo ? "메모 수정" : "새 메모"}>
      <div className="stack">
        <div className="field">
          <label>카테고리</label>
          <CatChips value={cat} onChange={setCat} all={false} wrap />
        </div>
        <div className="field">
          <label>내용</label>
          <textarea className="lined" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="오늘 든 생각, 깨달은 것, 다짐…" />
        </div>
        <label className="row" style={{ fontSize: 14, gap: 10 }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          상단에 고정 (오늘의 나에서 우선 반영)
        </label>
      </div>
      <div className="sheet-actions">
        {memo && (
          <button className="btn ghost danger" onClick={() => onDelete(memo.id)}>
            삭제
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={save} disabled={!text.trim()}>저장</button>
      </div>
    </Sheet>
  );
}
