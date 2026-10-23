import { Fragment } from "react";
import { hasHighlights, segmentHighlights } from "@/lib/highlight";

/**
 * 형광펜 본문: ==표시== 부분을 <mark class="hl"> 로.
 * 표시가 없을 때(fallback):
 *   "last-line" — 두 줄 이상이면 마지막 줄을 강조 (위로글 기본)
 *   "all"       — 글 전체를 강조 (AI 결과의 마지막 한마디처럼 문장 자체가 위로일 때)
 *   "none"      — 그대로 (AI 결과 본문: AI 가 표시한 곳만)
 */
export default function Highlighted({ text, fallback = "last-line" }: { text: string; fallback?: "last-line" | "all" | "none" }) {
  if (!hasHighlights(text)) {
    if (fallback === "all") return <mark className="hl">{text}</mark>;
    if (fallback === "none") return <>{text}</>;
  }
  return (
    <>
      {segmentHighlights(text).map((s, i) => (s.mark ? <mark key={i} className="hl">{s.text}</mark> : <Fragment key={i}>{s.text}</Fragment>))}
    </>
  );
}
