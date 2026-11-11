"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FLUENT_CATEGORIES, loadFluentCategory, matchFluent, type FluentCategoryId, type FluentIconRow } from "@/lib/fluent-icons";
import { useBackLayer } from "@/lib/use-back-layer";
import { FluentSvg } from "./FluentIcon";
import { IconChevronL, IconClose, IconSearch } from "./Icons";
import styles from "./IconSearchSheet.module.css";

/** 아이콘 찾기를 누르기 직전(손가락이 닿을 때) 미리 받기 시작한다 */
export const prefetchFluentIcons = () => { for (const c of FLUENT_CATEGORIES) void loadFluentCategory(c.id).catch(() => {}); };

/**
 * 아이콘 찾기: 전체 화면에서 검색·분류로 Fluent 아이콘을 고른다. 고르면 바로 닫힌다.
 * 안드로이드 뒤로 가기는 시트만 닫는다. 검색창은 자동으로 열지 않는다 (키보드가 격자를 가리지 않게).
 */
export default function IconSearchSheet({ open, selected, onPick, onClose }: {
  open: boolean; selected: string | null; onPick: (name: string) => void; onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<Partial<Record<FluentCategoryId, FluentIconRow[]>>>({});
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<FluentCategoryId | "">("");
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => setMounted(true), []);
  useBackLayer(open, () => { closeRef.current(); return false; });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFailed(false);
    for (const c of FLUENT_CATEGORIES) {
      loadFluentCategory(c.id)
        .then((list) => alive && setRows((prev) => (prev[c.id] ? prev : { ...prev, [c.id]: list })))
        .catch(() => alive && setFailed(true));
    }
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [open, retry]);

  // 열 때마다 검색어·분류를 비우고 처음부터
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCat("");
  }, [open]);

  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [cat, query]);

  const q = query.trim();
  const sections = useMemo(() => {
    const list = cat ? FLUENT_CATEGORIES.filter((c) => c.id === cat) : FLUENT_CATEGORIES;
    return list.map((c) => ({ ...c, rows: rows[c.id]?.filter((r) => matchFluent(r, q)) ?? null }));
  }, [rows, cat, q]);
  const loading = sections.some((s) => s.rows === null);
  const found = sections.reduce((n, s) => n + (s.rows?.length ?? 0), 0);

  if (!mounted || !open) return null;
  return createPortal(
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="아이콘 찾기" ref={panel} tabIndex={-1}>
      <header className={styles.top}>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기"><IconChevronL /></button>
        <form role="search" className={styles.search} onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }}>
          <IconSearch aria-hidden="true" />
          <input type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="커피, 강아지, 바다처럼 찾아보세요"
            aria-label="아이콘 검색" maxLength={20} autoComplete="off" />
          {query && <button type="button" className={styles.clear} aria-label="검색어 지우기" onClick={() => setQuery("")}><IconClose /></button>}
        </form>
      </header>
      <div className={styles.cats} role="radiogroup" aria-label="아이콘 분류">
        <button type="button" role="radio" aria-checked={cat === ""} className={styles.cat} onClick={() => setCat("")}>전체</button>
        {FLUENT_CATEGORIES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={cat === c.id} className={styles.cat} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className={styles.body} ref={body}>
        {failed && loading ? (
          <div className={styles.empty} role="alert">
            아이콘을 불러오지 못했어요
            <button type="button" className="btn soft sm" onClick={() => setRetry((n) => n + 1)}>다시 불러오기</button>
          </div>
        ) : !loading && found === 0 ? (
          <div className={styles.empty}>‘{q}’에 맞는 아이콘이 없어요<small>다른 낱말로 찾아보세요</small></div>
        ) : sections.map((s) => (s.rows === null ? (
          <section key={s.id} className={styles.section} aria-busy="true">
            {!cat && <h3>{s.label}</h3>}
            <div className={styles.grid}>{Array.from({ length: Math.min(s.count, 8) }, (_, i) => <span key={i} className={styles.skeleton} />)}</div>
          </section>
        ) : s.rows.length > 0 && (
          <section key={s.id} className={styles.section}>
            {!cat && <h3>{s.label}<small>{s.rows.length}</small></h3>}
            <div className={styles.grid} role="radiogroup" aria-label={s.label}>
              {s.rows.map((row) => (
                <button key={row[0]} type="button" role="radio" aria-checked={selected === row[0]} className={styles.cell} onClick={() => onPick(row[0])} title={row[1]}>
                  <FluentSvg row={row} />
                  <span>{row[1]}</span>
                </button>
              ))}
            </div>
          </section>
        )))}
        <p className={styles.credit}>아이콘: Microsoft Fluent UI System Icons (MIT)</p>
      </div>
    </div>,
    document.body,
  );
}
