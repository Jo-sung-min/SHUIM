import { notFound } from "next/navigation";
import { ScreenPhoto } from "@/components/FeedMedia";
import { assetUrl } from "@/lib/assets";
import type { TextOverlay } from "@/lib/feed-media";
import entries from "@/lib/curation-nov11.json";

export default function CurationPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px 100px" }}>
    <h1 style={{ fontSize: 24 }}>명화와 마음의 문장 · 10장</h1>
    <p style={{ margin: "8px 0 24px", opacity: .65 }}>로컬 미리보기 · DB에 저장하지 않습니다.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
      {entries.map(e => {
        const overlays: TextOverlay[] = [
          { text: e.quote, x: .5, y: e.y, size: e.size, color: e.color as TextOverlay["color"], font: e.font as TextOverlay["font"], align: "center", style: "plain" },
          { text: `— ${e.author}`, x: .5, y: e.y + (e.quote.split("\n").length * e.size * 1.42 * .5625 / 2) + .03, size: .03, color: e.color as TextOverlay["color"], font: e.font as TextOverlay["font"], align: "center", style: "plain" },
        ];
        return <article key={e.id}>
          <div style={{ position: "relative", aspectRatio: "9/16", overflow: "hidden", borderRadius: 12 }}>
            <ScreenPhoto src={assetUrl(e.cdnImage)} ratio={.5625} alt={e.art} overlays={overlays} />
            <div style={{ position: "absolute", zIndex: 2, bottom: 24, left: 20, right: 20, color: "white", textShadow: "0 1px 4px #000" }}>
              <b>소로우</b><p style={{ fontSize: 13, marginTop: 8 }}>{e.title}</p>
              <p style={{ fontSize: 11 }}>{e.art} ({e.date})</p>
            </div>
          </div>
          <p style={{ fontSize: 12, marginTop: 8 }}>{e.id} · {e.work} · 소로우 옮김</p>
        </article>;
      })}
    </div>
  </main>;
}
