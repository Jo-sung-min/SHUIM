import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

/**
 * GET /og — 기본 공유(OG) 이미지 1200×630. 관리자가 /admin › 사이트 에서 이미지를 올리면 /api/site/og 가 대신 쓰인다.
 * (app/opengraph-image 규약 파일을 쓰면 관리자 이미지보다 우선해 버려서 일반 라우트로 둔다)
 */
export const dynamic = "force-static";
export const revalidate = 86400;

const FONT_URL = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff/Pretendard-Bold.woff";

/** 한글을 그리려면 폰트가 필요하다. 못 받으면 영문만 그린다 */
async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(FONT_URL, { next: { revalidate: 86400 } });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const font = await loadFont();
  const korean = font !== null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "88px 96px",
          background: "linear-gradient(135deg, #4b5fe0 0%, #8a5cd6 100%)",
          color: "#ffffff",
          fontFamily: korean ? "Pretendard" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ display: "flex", width: 64, height: 64, borderRadius: 18, background: "rgba(255,255,255,0.18)", position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: 16, width: 32, height: 32, borderRadius: 32, background: "rgba(255,255,255,0.95)" }} />
            <div style={{ position: "absolute", left: 24, top: 16, width: 32, height: 32, borderRadius: 32, background: "rgba(255,255,255,0.55)" }} />
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1, opacity: 0.95 }}>{korean ? SITE.fullName : "SOROW"}</div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.3, letterSpacing: -2, marginTop: 40 }}>
          {korean ? SITE.tagline : "Beautiful, cruel paradoxes."}
        </div>
        <div style={{ display: "flex", fontSize: 30, marginTop: 26, opacity: 0.82 }}>{korean ? "모순된 마음을 기록하는 공간" : "sorow.co.kr"}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: font ? [{ name: "Pretendard", data: font, weight: 700, style: "normal" }] : undefined,
    }
  );
}
