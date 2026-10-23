import { Fragment } from "react";
import { segmentHighlights } from "@/lib/highlight";

/** 위로글 본문: ==표시== 또는 마지막 줄을 형광펜(<mark class="hl">)으로 */
export default function Highlighted({ text }: { text: string }) {
  return (
    <>
      {segmentHighlights(text).map((s, i) => (s.mark ? <mark key={i} className="hl">{s.text}</mark> : <Fragment key={i}>{s.text}</Fragment>))}
    </>
  );
}
