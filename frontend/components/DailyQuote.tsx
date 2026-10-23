"use client";

import { useEffect, useState } from "react";
import { dailyQuoteIndex, millisecondsUntilNextQuote, PHILOSOPHY_QUOTES, quoteSourceLabel } from "@/lib/daily-quote";

export default function DailyQuote() {
  // A neutral first render avoids serving yesterday's statically generated quotation.
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = new Date();
      setIndex(dailyQuoteIndex(now));
      clearTimeout(timer);
      timer = setTimeout(refresh, millisecondsUntilNextQuote(now) + 50);
    };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const quote = index === null ? null : PHILOSOPHY_QUOTES[index];
  return <figure className="daily-quote" aria-label="소로우의 문장">
      {quote ? <>
        <blockquote className="daily-quote__text"><p>{quote.text}</p></blockquote>
        <figcaption className="daily-quote__source">{quoteSourceLabel(quote)}</figcaption>
      </> : <div className="daily-quote__loading" role="status" aria-label="문장을 준비하고 있어요">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>}
    </figure>;
}
