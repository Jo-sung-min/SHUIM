"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/components/ui";
import { BAMBOO_BOARD_CAPACITY, bambooNoteColor, bambooNoteDate, postBambooNote, type BambooNote } from "@/lib/beach/bamboo-notes";
import styles from "./BambooGuestbook.module.css";

type Props = { ticket: string; initialName?: string; entries: readonly BambooNote[]; loading: boolean; loadError: string;
  onRetry: () => void; onPosted: (entry: BambooNote) => void; onClose: () => void };

function paperStyle(id: string): CSSProperties { return { "--paper": bambooNoteColor(id) } as CSSProperties; }

export default function BambooGuestbook({ ticket, initialName = "", entries, loading, loadError, onRetry, onPosted, onClose }: Props) {
  const [writing, setWriting] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(""), [notice, setNotice] = useState("");
  const [name, setName] = useState(() => Array.from(initialName).slice(0, 24).join("")), [story, setStory] = useState("");
  const alive = useRef(true), pending = useRef(false);
  const request = useRef<{ name: string; story: string; id: string } | null>(null);
  const nameInput = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null), attach = useRef<HTMLButtonElement>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const notes = entries.slice(-BAMBOO_BOARD_CAPACITY);
  const selected = notes.find(note => note.id === selectedId);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (writing) nameInput.current?.focus(); }, [writing]);
  useEffect(() => { if (selected) heading.current?.focus({ preventScroll: true }); }, [selected?.id]);
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(null); setNotice("읽던 메모 자리에 새 메모가 붙었어요."); attach.current?.focus();
    }
  }, [selectedId, selected]);

  function board(focusId?: string) {
    setWriting(false); setSelectedId(null); setSaveError("");
    requestAnimationFrame(() => {
      const tile = focusId ? tileRefs.current.get(focusId) : undefined;
      (tile ?? attach.current)?.focus({ preventScroll: true });
      tile?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const signature = name.trim(), message = story.trim();
    if (pending.current || !signature || !message || Array.from(signature).length > 24 || Array.from(message).length > 500) return;
    pending.current = true; setSaving(true); setSaveError("");
    try {
      if (!request.current || request.current.name !== signature || request.current.story !== message)
        request.current = { name: signature, story: message, id: crypto.randomUUID() };
      const posted = await postBambooNote(ticket, request.current.id, signature, message);
      if (!alive.current) return;
      onPosted(posted); request.current = null; setStory(""); setNotice("게시판에 메모를 붙였어요."); board(posted.id);
    } catch (error) {
      if (alive.current) setSaveError(error instanceof Error ? error.message : "메모를 붙이지 못했어요. 다시 시도해 주세요.");
    } finally { pending.current = false; if (alive.current) setSaving(false); }
  }

  const chars = Array.from(story).length, nameLength = Array.from(name.trim()).length;
  const valid = Boolean(name.trim() && story.trim() && nameLength <= 24 && chars <= 500);
  return createPortal(<div className={`${styles.scope} ${!writing && !selected ? styles.boardScope : ""}`}><Sheet open title={writing ? "메모 붙이기" : selected ? "메모 읽기" : "축제 게시판"} onClose={onClose}>
    {writing ? <form className={styles.form} onSubmit={save}>
      <label>남길 이름<input ref={nameInput} value={name} onChange={e => setName(e.target.value)} maxLength={48}
        placeholder="이름 또는 별명" autoComplete="off" required /></label>
      <label>이야기<textarea value={story} onChange={e => setStory(e.target.value)} maxLength={1000}
        placeholder="오늘 이곳에서 나누고 싶은 이야기" rows={5} required /></label>
      <div className={styles.count}>{chars} / 500</div>
      {nameLength > 24 && <p className={styles.error}>이름은 24자까지 적을 수 있어요.</p>}
      {chars > 500 && <p className={styles.error}>이야기는 500자까지 적을 수 있어요.</p>}
      {saveError && <p role="alert" className={styles.error}>{saveError}</p>}
      <p className={styles.hint}>붙인 메모는 수정할 수 없어요. {BAMBOO_BOARD_CAPACITY}자리가 차면 가장 오래된 메모가 교체돼요.</p>
      <div className={styles.actions}><button type="button" onClick={() => board()} disabled={saving}>게시판으로</button>
        <button type="submit" className={styles.primary} disabled={!valid || saving}>{saving ? "붙이는 중…" : "메모 붙이기"}</button></div>
    </form> : selected ? <div className={styles.reader}>
      <article className={styles.letter} style={paperStyle(selected.id)}><h4 ref={heading} tabIndex={-1}>{selected.name}</h4>
        <p>{selected.story}</p><time dateTime={new Date(selected.createdAt).toISOString()}>{bambooNoteDate(selected.createdAt)}</time></article>
      <button type="button" onClick={() => board(selected.id)}>게시판으로</button>
    </div> : <section className={styles.content} aria-label="전망대 메모">
      <div className={styles.toolbar}><span>붙은 메모 <strong>{notes.length} / {BAMBOO_BOARD_CAPACITY}</strong></span>
        <button ref={attach} type="button" className={styles.primary} disabled={loading && !notes.length || !!loadError && !notes.length}
          onClick={() => { setNotice(""); setWriting(true); }}>메모 붙이기</button></div>
      <p role="status" className={styles.status}>{notice || (loading && !notes.length ? "게시판을 불러오는 중…" : "")}</p>
      {loadError && <div className={styles.retry}><p role="alert" className={styles.error}>{loadError}</p><button type="button" onClick={onRetry} disabled={loading}>다시 불러오기</button></div>}
      {(notes.length > 0 || !loading && !loadError) && <div className={styles.board} role="region" aria-label="붙은 메모 목록">
        {notes.map(note => <button key={note.id} ref={node => { if (node) tileRefs.current.set(note.id,node); else tileRefs.current.delete(note.id); }}
          type="button" className={styles.note} style={paperStyle(note.id)} aria-label={`${note.name}의 메모 전체 읽기, ${note.story.slice(0, 24)}`}
          onClick={() => { setNotice(""); setSelectedId(note.id); }}><strong>{note.name}</strong><span>{note.story}</span>
          <time dateTime={new Date(note.createdAt).toISOString()}>{bambooNoteDate(note.createdAt)}</time></button>)}
        {!notes.length && <p className={styles.empty}>첫 메모를 남겨보세요.</p>}
      </div>}
      {!loadError && !loading && notes.length > 0 && <p className={styles.hint}>메모를 눌러 이야기를 읽어보세요. 자리가 차면 가장 오래된 메모가 교체돼요.</p>}
    </section>}
  </Sheet></div>, document.body);
}
