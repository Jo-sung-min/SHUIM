"use client";

import { useEffect, type ReactNode } from "react";
import { MEMO_CATEGORIES, MemoCat, memoCatById } from "@/lib/categories";

/* ---------- 상단 바 ---------- */
export function TopBar({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      <h1>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title}
      </h1>
      {right && <div className="right">{right}</div>}
    </header>
  );
}

/* ---------- 세그먼트 ---------- */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 카테고리 칩 ---------- */
export function CatChips({
  value,
  onChange,
  all = true,
  wrap = false,
}: {
  value: MemoCat | "all";
  onChange: (v: MemoCat | "all") => void;
  all?: boolean;
  wrap?: boolean;
}) {
  return (
    <div className={`chips ${wrap ? "wrap" : ""}`} role="radiogroup">
      {all && (
        <button type="button" role="radio" aria-checked={value === "all"} className={`chip ${value === "all" ? "on" : ""}`} onClick={() => onChange("all")}>
          전체
        </button>
      )}
      {MEMO_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          className={`chip cat ${value === c.id ? "on" : ""}`}
          style={{ ["--chip" as string]: c.color }}
          onClick={() => onChange(c.id)}
        >
          {c.emoji} {c.label}
        </button>
      ))}
    </div>
  );
}

export function CatTag({ cat }: { cat: MemoCat }) {
  const c = memoCatById(cat);
  return (
    <span className="cat" style={{ color: c.color }}>
      <span className="dot" style={{ background: c.color }} />
      {c.label}
    </span>
  );
}

/* ---------- 바텀시트 ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="handle" />
        <h3>{title}</h3>
        {children}
      </div>
    </>
  );
}

/* ---------- 빈 상태 ---------- */
export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <b>{title}</b>
      {children}
    </div>
  );
}

/* ---------- 날짜 표기 ---------- */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function fmtDate(key: string, withDow = true): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}월 ${d}일${withDow ? ` (${DOW[dt.getDay()]})` : ""}`;
}
export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const dt = new Date(ts);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
export const DOW_LABELS = DOW;
