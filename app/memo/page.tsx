"use client";

import { useEffect, useMemo, useState } from "react";
import { MemoCat } from "@/lib/categories";
import { Memo, loadMemos, saveMemos, uid } from "@/lib/storage";
import { CatChips, CatTag, Empty, Sheet, TopBar, fmtRelative } from "@/components/ui";
import { IconPin, IconPlus } from "@/components/Icons";

type Filter = MemoCat | "all";

export default function MemoPage() {
  const [memos, setMemos] = useState<Memo[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Memo | "new" | null>(null);

  useEffect(() => setMemos(loadMemos()), []);

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
  };
  const remove = (id: string) => {
    if (!memos) return;
    commit(memos.filter((x) => x.id !== id));
    setEditing(null);
  };

  if (!memos) return <TopBar title="메모" />;

  return (
    <>
      <TopBar title="메모" eyebrow={`${memos.length}개`} />
      <div className="screen">
        <CatChips value={filter} onChange={setFilter} />

        {list.length === 0 ? (
          <Empty icon="📝" title={filter === "all" ? "첫 메모를 남겨볼까요" : "이 카테고리엔 아직 메모가 없어요"}>
            생각, 깨달음, 다짐… 카테고리별로 모아두면
            <br />
            오늘의 나가 읽고 방향을 잡아줘요.
          </Empty>
        ) : (
          <div className="stack" style={{ marginTop: 6 }}>
            {list.map((m) => (
              <article key={m.id} className="card memo" onClick={() => setEditing(m)} role="button" tabIndex={0}>
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
              </article>
            ))}
          </div>
        )}
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
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="오늘 든 생각, 깨달은 것, 다짐…" />
        </div>
        <label className="row" style={{ fontSize: 14, gap: 10 }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          상단에 고정 (오늘의 나에서 우선 반영)
        </label>
      </div>
      <div className="sheet-actions">
        {memo && (
          <button className="btn ghost" style={{ flex: "0 0 auto", color: "var(--down)" }} onClick={() => onDelete(memo.id)}>
            삭제
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={save} disabled={!text.trim()}>저장</button>
      </div>
    </Sheet>
  );
}
