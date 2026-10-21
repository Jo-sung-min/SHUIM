/**
 * 사이트 정보와 SEO 기본값. 서버(generateMetadata·manifest·sitemap)와 클라이언트(관리자 화면)가 같이 쓴다.
 * 관리자가 /admin › 사이트 에서 바꾼 제목·설명·파비콘·공유 이미지는 /api/site 에서 오고, 없으면 여기 기본값.
 */

export const SITE = {
  name: "소로우",
  fullName: "소로우 (SOROW)",
  tagline: "슬픔을 나누면, 우리는 가까워진다.",
  description: "소로우 · 슬픔을 나누면, 우리는 가까워진다.",
  /** 운영 주소. 미리보기·로컬은 NEXT_PUBLIC_SITE_URL 로 바꿀 수 있다 */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://sorow.co.kr").replace(/\/+$/, ""),
  keywords: ["소로우", "SOROW", "슬픔", "위로", "마음 기록", "감정 일기", "익명 커뮤니티", "멘탈 케어", "마음 가속도"],
  themeLight: "#f4f3ee",
  themeDark: "#121419",
} as const;

/** GET /api/site 응답 (없는 값은 null = 기본값) */
export interface SiteSettings {
  title: string | null;
  description: string | null;
  /** 관리자가 올린 파비콘·공유 이미지가 있으면 바뀐 시각(ms). 주소의 ?v= 로 써서 캐시를 깬다 */
  faviconAt: number | null;
  ogAt: number | null;
}

export const EMPTY_SITE: SiteSettings = { title: null, description: null, faviconAt: null, ogAt: null };

export function normalizeSite(j: Partial<Record<keyof SiteSettings, unknown>> | null | undefined): SiteSettings {
  return {
    title: typeof j?.title === "string" && j.title.trim() ? j.title : null,
    description: typeof j?.description === "string" && j.description.trim() ? j.description : null,
    faviconAt: typeof j?.faviconAt === "number" ? j.faviconAt : null,
    ogAt: typeof j?.ogAt === "number" ? j.ogAt : null,
  };
}

export const siteTitle = (s: SiteSettings) => s.title?.trim() || SITE.fullName;
export const siteDescription = (s: SiteSettings) => s.description?.trim() || SITE.description;
/** 파비콘 주소: 올린 게 있으면 API, 없으면 기본 SVG */
export const faviconHref = (s: SiteSettings) => (s.faviconAt ? `/api/site/favicon?v=${s.faviconAt}` : "/favicon.svg");
/** 공유(OG) 이미지 주소: 올린 게 있으면 API, 없으면 /og 에서 그려 주는 기본 이미지 */
export const ogHref = (s: SiteSettings) => (s.ogAt ? `/api/site/og?v=${s.ogAt}` : "/og");

/**
 * 서버 컴포넌트용: 백엔드에서 직접 설정을 읽는다 (브라우저 프록시를 거치지 않으므로 BACKEND_ORIGIN).
 * 1분 캐시. 백엔드가 꺼져 있거나 빌드 중이면 기본값으로 동작한다.
 */
export async function loadSiteSettings(): Promise<SiteSettings> {
  const origin = (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/+$/, "");
  try {
    const res = await fetch(`${origin}/api/site`, { next: { revalidate: 60 } });
    if (!res.ok) return EMPTY_SITE;
    return normalizeSite((await res.json()) as Partial<SiteSettings>);
  } catch {
    return EMPTY_SITE;
  }
}
