"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Hero, LoadError, Sheet, SkeletonScreen } from "@/components/ui";
import { IconPlus } from "@/components/Icons";
import { AdminQuoteError, QUOTE_KIND_LABELS, QUOTE_LIMITS, QUOTE_STATUS_LABELS, fetchAdminQuotes, filterQuotes, quoteDraft, quoteSourceLink, quoteStatus, saveAdminQuote, setAdminQuoteUsage, type AdminQuote, type QuoteDraft, type QuoteStatus } from "@/lib/admin-quotes";
import styles from "./admin.module.css";

function reviewDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
}

export function QuoteCard({ quote, busy, saving, onEdit, onUsage }: {
  quote: AdminQuote; busy: boolean; saving: boolean; onEdit: () => void; onUsage: (enabled: boolean) => void;
}) {
  const status = quoteStatus(quote);
  const link = quoteSourceLink(quote.sourceUrl);
  return <article className={`card ${styles.quoteCard}`} aria-busy={saving} aria-label={`${quote.author}의 명언`}>
    <div className={styles.badges}>
      <span className={`badge ${status === "pending" ? styles.pending : status === "disabled" ? "gray" : ""}`}>{QUOTE_STATUS_LABELS[status]}</span>
      <span className="badge gray">{quote.theme}</span>
      <span className="tiny muted">{QUOTE_KIND_LABELS[quote.kind]}</span>
    </div>
    <p className={styles.quotation}>{quote.text}</p>
    <dl className={styles.attribution}>
      <dt>저자</dt><dd>{quote.author}</dd>
      <dt>문헌</dt><dd>{quote.source}</dd>
      <dt>출처</dt><dd>{link ? <a className={styles.sourceLink} href={link} target="_blank" rel="noopener noreferrer">출처 원문 확인 ↗</a> : "출처 링크를 확인해 주세요"}</dd>
    </dl>
    <p className="tiny muted" style={{ margin: 0 }}>{quote.kind === "paraphrase" ? "저자의 생각을 풀어 쓴 의역이에요. 실제 발언을 그대로 인용한 문장이 아니에요." : "원문을 한국어로 옮긴 문장이에요. 문구와 번역 출처를 확인해 주세요."}</p>
    <div className={styles.review}>
      <label className={styles.usage}>
        <input type="checkbox" checked={quote.enabled} disabled={busy} onChange={(event) => onUsage(event.target.checked)} />
        <span>검수 후 AI 답변에 사용<small className="tiny muted" style={{ display: "block" }}>{saving ? "사용 상태를 저장하고 있어요…" : status === "pending" ? "문구와 출처를 확인한 뒤 체크해 주세요." : quote.enabled ? "검수한 이 명언을 AI 답변에서 사용할 수 있어요." : "AI 답변에 사용하지 않아요."}</small></span>
      </label>
      <div className={styles.cardFooter}>
        <span className="tiny muted">{quote.reviewedAt === null ? "아직 검수하지 않았어요" : `검수 ${reviewDate(quote.reviewedAt)}`}</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {status === "pending" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => onUsage(false)}>미사용으로 검수</button>}
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onEdit}>수정</button>
        </div>
      </div>
    </div>
  </article>;
}

export default function QuoteAdmin() {
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [editor, setEditor] = useState<AdminQuote | "new" | null>(null);
  const [draft, setDraft] = useState<QuoteDraft>(quoteDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const loadingRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (locked.current) return;
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminQuotes(controller.signal);
      if (!controller.signal.aborted && mounted.current) setQuotes(data);
    } catch (e) {
      if (!controller.signal.aborted && mounted.current) setError(e instanceof Error ? e.message : "명언 목록을 불러오지 못했어요.");
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadingRequest.current?.abort(); };
  }, [load]);

  const openEditor = (quote?: AdminQuote) => {
    setEditor(quote ?? "new");
    setDraft(quoteDraft(quote));
    setFormError(null);
    setSuccess(null);
  };
  const update = (quote: AdminQuote) => setQuotes((current) => current.some((item) => item.id === quote.id)
    ? current.map((item) => item.id === quote.id ? quote : item) : [quote, ...current]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current || !editor) return;
    locked.current = true;
    setBusy("save");
    setFormError(null);
    setSuccess(null);
    try {
      const quote = await saveAdminQuote(draft, editor === "new" ? undefined : editor.id);
      if (!mounted.current) return;
      update(quote);
      setEditor(null);
      setSearch(""); setTheme(""); setStatus(quoteStatus(quote));
      setSuccess(quoteStatus(quote) === "pending"
        ? editor === "new" ? "명언을 추가했어요. 내용을 검수한 뒤 사용을 켜 주세요." : "명언을 수정했어요. 내용을 다시 검수한 뒤 사용을 켜 주세요."
        : "내용을 저장했어요. 기존 검수 상태를 유지해요.");
    } catch (e) {
      if (mounted.current) setFormError(e instanceof Error ? e.message : "명언을 저장하지 못했어요.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const usage = async (quote: AdminQuote, enabled: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(quote.id);
    setError(null);
    setSuccess(null);
    try {
      const saved = await setAdminQuoteUsage(quote.id, enabled, quote.updatedAt);
      if (!mounted.current) return;
      update(saved);
      setSuccess(saved.enabled ? "검수를 마쳤어요. 이제 AI 답변에 사용할 수 있어요." : "미사용으로 저장했어요. AI 답변에 사용하지 않아요.");
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "사용 상태를 저장하지 못했어요.");
      if (e instanceof AdminQuoteError && e.status === 409 && mounted.current) {
        try {
          const current = await fetchAdminQuotes();
          if (mounted.current) setQuotes(current);
        } catch { /* Keep the original conflict visible and allow a manual refresh. */ }
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const themes = [...new Set(quotes.map((quote) => quote.theme))].sort((a, b) => a.localeCompare(b, "ko"));
  const visible = filterQuotes(quotes, search, theme, status);
  const pending = quotes.filter((quote) => quoteStatus(quote) === "pending").length;
  const enabled = quotes.filter((quote) => quoteStatus(quote) === "enabled").length;
  const disabled = loading || busy !== null;
  const dirty = editor === "new" || (editor !== null && Object.keys(draft).some((key) => draft[key as keyof QuoteDraft].trim() !== editor[key as keyof QuoteDraft]));
  return <section aria-label="명언 검수 관리">
    <Hero label="명언 관리" title="확인한 문장만 마음에 전해요" sub="저자와 문헌, 문구를 검수하고 사용을 켜 주세요. 사용 중인 명언만 AI 답변의 참고 문장으로 쓰여요." stats={[`전체 ${quotes.length}`, `검수 대기 ${pending}`, `사용 ${enabled}`]} />
    <div className={styles.toolbar}>
      <button type="button" className="text-btn" disabled={disabled} onClick={() => void load()}>새로고침</button>
      <button type="button" className="btn sm" disabled={disabled} onClick={() => openEditor()}><IconPlus /> 명언 추가</button>
    </div>
    <div className={`card ${styles.filters}`}>
      <div className="field"><label htmlFor="quote-search">명언 검색</label><input id="quote-search" type="search" value={search} placeholder="문장, 저자, 문헌으로 검색" onChange={(event) => setSearch(event.target.value)} /></div>
      <div className={styles.filterRow}>
        <div className="field"><label htmlFor="quote-theme-filter">테마</label><select id="quote-theme-filter" value={theme} onChange={(event) => setTheme(event.target.value)}><option value="">모든 테마</option>{themes.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="field"><label htmlFor="quote-status-filter">검수 · 사용 상태</label><select id="quote-status-filter" value={status} onChange={(event) => setStatus(event.target.value as QuoteStatus | "all")}><option value="all">전체 상태</option><option value="pending">검수 대기</option><option value="enabled">사용 중</option><option value="disabled">미사용</option></select></div>
      </div>
    </div>
    {success && <p className={`notice ${styles.success}`} role="status">{success}</p>}
    {error && <LoadError message={error} onRetry={() => void load()} />}
    {loading ? <SkeletonScreen count={2} lines={3} label="명언을 불러오고 있어요" /> : <>
      <div className="section-title"><span>명언 {visible.length}개</span><span className="tiny muted">출처 확인 후 사용해 주세요</span></div>
      {visible.length === 0 && !error ? <p className={`card ${styles.empty}`}>{quotes.length ? "조건에 맞는 명언이 없어요. 검색어나 필터를 바꿔 보세요." : "등록된 명언이 없어요. 출처를 확인한 문장을 추가해 주세요."}</p> : <div className="stack">
        {visible.map((quote) => <QuoteCard key={quote.id} quote={quote} busy={disabled} saving={busy === quote.id} onEdit={() => openEditor(quote)} onUsage={(value) => void usage(quote, value)} />)}
      </div>}
    </>}
    {editor !== null && createPortal(<Sheet open onClose={() => { if (!locked.current) setEditor(null); }} title={editor === "new" ? "명언 추가" : "명언 수정"}>
      <form className={styles.form} onSubmit={(event) => void save(event)}>
        <p className={styles.notice}>{editor === "new" ? "추가한 명언은 검수 대기로 저장돼요. 목록에서 내용을 확인하고 사용을 체크해 주세요." : "내용을 바꾸면 사용이 꺼지고 다시 검수 대기가 돼요. 수정 후 목록에서 다시 확인해 주세요."}</p>
        <fieldset disabled={busy !== null}>
          <div className="field"><label htmlFor="quote-text">명언 <small>{draft.text.length}/{QUOTE_LIMITS.text}</small></label><textarea id="quote-text" required maxLength={QUOTE_LIMITS.text} rows={4} value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></div>
          <div className="field"><label htmlFor="quote-author">저자</label><input id="quote-author" required maxLength={QUOTE_LIMITS.author} value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></div>
          <div className="field"><label htmlFor="quote-source">출처 문헌</label><input id="quote-source" required maxLength={QUOTE_LIMITS.source} placeholder="책, 편지, 강연 등 확인한 문헌" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} /></div>
          <div className="field"><label htmlFor="quote-url">출처 링크</label><input id="quote-url" required type="url" inputMode="url" maxLength={QUOTE_LIMITS.sourceUrl} placeholder="https://" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} /><small>문구와 저자를 직접 확인할 수 있는 원문 주소를 남겨 주세요.</small></div>
          <div className={styles.filterRow}>
            <div className="field"><label htmlFor="quote-theme">테마</label><input id="quote-theme" required list="quote-themes" maxLength={QUOTE_LIMITS.theme} placeholder="예: 위로" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value })} /><datalist id="quote-themes">{themes.map((item) => <option key={item} value={item} />)}</datalist></div>
            <div className="field"><label htmlFor="quote-kind">문장 구분</label><select id="quote-kind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as QuoteDraft["kind"] })}><option value="paraphrase">의역</option><option value="translation">번역</option></select></div>
          </div>
        </fieldset>
        {formError && <p className="notice warn" role="alert">{formError}</p>}
        <div className="sheet-actions"><button type="button" className="btn ghost" disabled={busy !== null} onClick={() => setEditor(null)}>취소</button><button type="submit" className="btn" disabled={busy !== null || !dirty} aria-busy={busy === "save"}>{busy === "save" ? "저장 중…" : "검수 대기로 저장"}</button></div>
      </form>
    </Sheet>, document.body)}
  </section>;
}
