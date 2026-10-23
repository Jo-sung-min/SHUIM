"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose, IconCloudOff, IconInbox } from "./Icons";
import { CategoryIcon } from "./CategoryIcon";
import { MEMO_CATEGORIES, MemoCat, memoCatById } from "@/lib/categories";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";

/* ---------- 상단 바 (인스타그램처럼 내리면 숨고 올리면 다시 나온다) ---------- */
export function TopBar({ title, eyebrow, right }: { title: string; eyebrow?: ReactNode; right?: ReactNode }) {
  const hidden = useHideOnScroll();
  return (
    <header className="topbar" data-hidden={hidden || undefined}>
      <h1>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title}
      </h1>
      {right && <div className="right">{right}</div>}
    </header>
  );
}

/* ---------- 요약 카드 (각 탭 상단) ---------- */
export function Hero({
  label,
  title,
  sub,
  stats,
  children,
}: {
  label?: ReactNode;
  title: string;
  sub?: string;
  stats?: string[];
  children?: ReactNode;
}) {
  return (
    <section className="hero">
      {label && <div className="label">{label}</div>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      {stats && stats.length > 0 && (
        <div className="stats">
          {stats.map((s) => (
            <span key={s} className="pill">{s}</span>
          ))}
        </div>
      )}
      {children}
    </section>
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
    <div className="segmented" role="tablist" aria-label="보기 선택" onKeyDown={(event) => {
      const index = options.findIndex((option) => option.value === value);
      const next = event.key === "ArrowRight" ? (index + 1) % options.length : event.key === "ArrowLeft" ? (index + options.length - 1) % options.length : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      onChange(options[next].value);
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    }}>
      {options.map((o) => (
        <button type="button" key={o.value} role="tab" tabIndex={value === o.value ? 0 : -1} aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 카테고리 칩 (선 아이콘 + 이름) ---------- */
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
          <CategoryIcon id={c.id} emoji={c.emoji} />
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function CatTag({ cat }: { cat: MemoCat }) {
  const c = memoCatById(cat);
  return (
    <span className="cat">
      <CategoryIcon id={c.id} emoji={c.emoji} />
      {c.label}
    </span>
  );
}

/* ---------- 바텀시트 (작은 작업용. 긴 읽기는 별도 화면) ---------- */
const openSheets: HTMLElement[] = [];
let previousOverflow = "";
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  useEffect(() => {
    if (!open || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!openSheets.length) previousOverflow = document.body.style.overflow;
    openSheets.push(sheet);
    const onKey = (e: KeyboardEvent) => {
      if (openSheets.at(-1) !== sheet || sheet.closest("[inert]")) return;
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const targets = Array.from(sheet.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets.at(-1);
      if (!first) { e.preventDefault(); sheet.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    sheet.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      const index = openSheets.indexOf(sheet);
      if (index !== -1) openSheets.splice(index, 1);
      if (!openSheets.length) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && (!openSheets.length || openSheets.at(-1)?.contains(previousFocus))) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" aria-hidden="true" onClick={() => { if (openSheets.at(-1) === sheetRef.current) onClose(); }} />
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="handle" aria-hidden="true" />
        <div className="sheet-title"><h3 id={titleId}>{title}</h3><button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label={`${title} 닫기`}><IconClose /></button></div>
        {children}
      </div>
    </>
  );
}

/* ---------- 확인 시트 (브라우저 confirm 대신) ---------- */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={() => { if (!busy) onClose(); }} title={title}>
      {message && <p className="sheet-text">{message}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>{cancelLabel}</button>
        <button type="button" className={`btn ${danger ? "danger" : ""}`} disabled={busy} aria-busy={busy} onClick={onConfirm}>{busy ? "처리 중…" : confirmLabel}</button>
      </div>
    </Sheet>
  );
}

/* ---------- 빈 화면: "아직 …이 없어요" + 첫 행동 ---------- */
export function Empty({ icon, title, action, children }: { icon?: ReactNode; title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden="true">{icon ?? <IconInbox />}</div>
      <b>{title}</b>
      {children}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/* ---------- 오류 화면: "불러오지 못했어요" + 다시 시도 (빈 화면과 구분) ---------- */
export function LoadError({ message, onRetry, title = "불러오지 못했어요" }: { message?: string; onRetry: () => void; title?: string }) {
  const technical = message ? /서버|\b(?:db|sql|api|s3|http)\b|failed to fetch|fetch failed|networkerror|unexpected token|json|50[234]|<html/i.test(message) : true;
  const detail = technical ? "연결을 확인한 뒤 다시 시도해 주세요." : message;
  return (
    <div className="empty error" role="alert">
      <div className="ico" aria-hidden="true"><IconCloudOff /></div>
      <b>{title}</b>
      <p>{detail}</p>
      <div className="empty-action">
        <button type="button" className="btn ghost" onClick={onRetry}>다시 시도</button>
      </div>
    </div>
  );
}

/* ---------- 로딩: 실제 카드와 같은 모양의 자리표시자 ---------- */
export function SkeletonHero() {
  return (
    <div className="sk-card hero" aria-hidden="true">
      <div className="sk w40" />
      <div className="sk sk-line lg w80" />
      <div className="sk w60" />
    </div>
  );
}

export function SkeletonCard({ lines = 3, head = false, className = "" }: { lines?: number; head?: boolean; className?: string }) {
  const widths = ["w80", "", "w60", "w40"];
  return (
    <div className={`sk-card ${className}`.trim()} aria-hidden="true">
      {head && (
        <div className="sk-row">
          <div className="sk sk-circle" />
          <div className="sk-col"><div className="sk w40" /><div className="sk sk-line sm w30" /></div>
        </div>
      )}
      {Array.from({ length: lines }, (_, i) => <div key={i} className={`sk ${widths[i % widths.length]}`.trim()} />)}
    </div>
  );
}

export function SkeletonList({ count = 3, lines = 2, head = true }: { count?: number; lines?: number; head?: boolean }) {
  return (
    <div className="stack">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} lines={lines} head={head} />)}
    </div>
  );
}

/** 요약 카드 + 목록 모양의 화면 전체 자리표시자 */
export function SkeletonScreen({ hero = true, count = 3, lines = 2, label = "불러오고 있어요" }: { hero?: boolean; count?: number; lines?: number; label?: string }) {
  return (
    <div className="stack" role="status" aria-label={label} style={{ gap: 16 }}>
      {hero && <SkeletonHero />}
      <SkeletonList count={count} lines={lines} />
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
