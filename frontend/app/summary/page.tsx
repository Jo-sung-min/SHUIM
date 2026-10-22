"use client";
import { requestAiProcessing } from "@/lib/safety";
import SafetyReport from "@/components/SafetyReport";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, Category, CategoryId, allCategories, orderCategories } from "@/lib/categories";
import { Journal, loadCategoryOrder, loadCustomCategories, loadJournal, syncRecords } from "@/lib/storage";
import { lastNDays } from "@/lib/accel";
import HelpBanner from "@/components/HelpBanner";
import { TopBar } from "@/components/ui";
import { IconChevronL, IconSparkle } from "@/components/Icons";

type Sel = CategoryId | "all";

interface Result {
  summary: string;
  source: "ai" | "local";
  crisis: boolean;
}

export default function SummaryPage() {
  const [journal, setJournal] = useState<Journal>({});
  const [cats, setCats] = useState<Category[]>(CATEGORIES);
  const [sel, setSel] = useState<Sel>("all");
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    syncRecords().then(() => {
      setJournal(loadJournal());
      setCats(orderCategories(allCategories(loadCustomCategories()), loadCategoryOrder()));
    });
  }, []);

  const dates = lastNDays(range);
  const entries = dates.filter((d) => journal[d]).map((d) => ({ date: d, record: journal[d] }));

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (!(await requestAiProcessing())) return;
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, category: sel, days: range, categories: cats }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "정리하지 못했어요");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "정리하지 못했어요");
    } finally {
      running.current = false;
      setLoading(false);
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
                <button key={c.id} className={`chip cat ${sel === c.id ? "on" : ""}`} style={{ ["--chip" as string]: c.color }} onClick={() => setSel(c.id)}>
                  {c.emoji} {c.label}
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

        {error && <p className="tiny" style={{ color: "var(--down)" }}>{error}</p>}

        {result?.crisis && <div style={{ marginTop: 12 }}><HelpBanner alert /></div>}

        {result && (
          <section className="card" style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 10 }}>
              <span className={`badge ${result.source === "ai" ? "" : "gray"}`}>{result.source === "ai" ? "AI 정리" : "기록 정리"}</span>
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
