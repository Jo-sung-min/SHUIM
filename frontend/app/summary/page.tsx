"use client";
import { requestAiProcessing } from "@/lib/safety";
import SafetyReport from "@/components/SafetyReport";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, Category, CategoryId, allCategories, orderCategories } from "@/lib/categories";
import { Journal, loadCategoryOrder, loadCustomCategories, loadJournal, sessionUserId, syncRecords, todayKey } from "@/lib/storage";
import { summaryEntries } from "@/lib/today-context";
import { useCurrentDay } from "@/lib/use-current-day";
import HelpBanner from "@/components/HelpBanner";
import { TopBar } from "@/components/ui";
import { IconChevronL, IconSparkle } from "@/components/Icons";
import { CategoryIcon } from "@/components/CategoryIcon";

type Sel = CategoryId | "all";

interface Result {
  date: string;
  category: Sel;
  days: number;
  summary: string;
  source: "ai" | "local";
  crisis: boolean;
}

export default function SummaryPage() {
  const [today, refreshToday] = useCurrentDay();
  const [journal, setJournal] = useState<Journal>({});
  const [cats, setCats] = useState<Category[]>(CATEGORIES);
  const [sel, setSel] = useState<Sel>("all");
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [loading, setLoading] = useState(false);
  const [storedResult, setResult] = useState<Result | null>(null);
  const result = storedResult?.date === today && storedResult.category === sel && storedResult.days === range ? storedResult : null;
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const lifecycle = useRef(0);
  const selection = useRef({ sel, range });
  selection.current = { sel, range };
  useEffect(() => () => { lifecycle.current++; }, []);

  useEffect(() => {
    let active = true;
    syncRecords().then(() => {
      if (!active || todayKey() !== today) return;
      setJournal(loadJournal());
      setCats(orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder()));
    });
    return () => { active = false; };
  }, [today]);

  const entries = summaryEntries(journal, today, range);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    const epoch = lifecycle.current;
    let requestDate = todayKey();
    let requestUser = sessionUserId();
    const isCurrent = () => lifecycle.current === epoch && todayKey() === requestDate && sessionUserId() === requestUser
      && selection.current.sel === sel && selection.current.range === range;
    try {
      if (!(await requestAiProcessing())) return;
      if (lifecycle.current !== epoch || selection.current.sel !== sel || selection.current.range !== range) return;
      requestDate = refreshToday();
      requestUser = sessionUserId();
      const currentJournal = loadJournal();
      const currentEntries = summaryEntries(currentJournal, requestDate, range);
      setJournal(currentJournal);
      if (currentEntries.length === 0) return;
      const res = await fetch("/api/summarize", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: requestDate, entries: currentEntries, category: sel, days: range,
          categories: orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder()) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "정리하지 못했어요");
      const json = await res.json();
      if (isCurrent()) setResult({ ...json, date: requestDate, category: sel, days: range });
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : "정리하지 못했어요");
    } finally {
      if (lifecycle.current === epoch) {
        running.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <>
      <TopBar
        title="흐름 정리"
        right={
          <Link href="/log" className="icon-btn" aria-label="기록으로">
            <IconChevronL />
          </Link>
        }
      />
      <div className="screen">
        <section className="card stack" style={{ gap: 12 }}>
          <div>
            <div className="tiny muted" style={{ fontWeight: 700, marginBottom: 6 }}>카테고리</div>
            <div className="chips">
              <button className={`chip ${sel === "all" ? "on" : ""}`} onClick={() => setSel("all")}>전체</button>
              {cats.map((c) => (
                <button key={c.id} type="button" className={`chip cat ${sel === c.id ? "on" : ""}`} style={{ ["--chip" as string]: c.color }} onClick={() => setSel(c.id)}>
                  <CategoryIcon id={c.id} emoji={c.emoji} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="tiny muted" style={{ fontWeight: 700, marginBottom: 6 }}>기간</div>
            <div className="segmented">
              {[7, 14, 30].map((r) => (
                <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r as 7 | 14 | 30)}>
                  최근 {r}일
                </button>
              ))}
            </div>
          </div>
          <button className="btn block" onClick={run} aria-busy={loading} disabled={loading || entries.length === 0}>
            <IconSparkle style={{ width: 18, height: 18 }} />
            {loading ? "정리하는 중…" : entries.length === 0 ? "이 기간엔 기록이 없어요" : `${entries.length}일치 기록 정리하기`}
          </button>
        </section>

        {error && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}

        {result?.crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}

        {result && (
          <section className="card" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <span className={`badge ${result.source === "ai" ? "" : "gray"}`}>{result.source === "ai" ? "AI 정리" : "기록 정리"}</span>
              <span className="tiny muted" style={{ marginLeft: 8 }}>{result.date} 기준</span>
            </div>
            <div className="summary-body">{result.summary}</div>
            <SafetyReport kind="ai" context={result.summary} />
          </section>
        )}

        <p className="tiny muted" style={{ textAlign: "center", marginTop: 20 }}>나를 돌아보는 참고로 읽어 주세요. <Link href="/info/ai" style={{ textDecoration: "underline" }}>AI 이용 안내</Link></p>
      </div>
    </>
  );
}
