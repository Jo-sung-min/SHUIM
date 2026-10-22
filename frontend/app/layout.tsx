import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import AppRuntime from "@/components/AppRuntime";
import CommunityConsent from "@/components/CommunityConsent";
import ServiceAvailability from "@/components/ServiceAvailability";
import AppToast from "@/components/AppToast";
import { SITE, faviconHref, loadSiteSettings, ogHref, siteDescription, siteTitle } from "@/lib/site";

/**
 * 사이트 전체 메타 태그. 제목·설명·파비콘·공유 이미지는 관리자가 /admin › 사이트 에서 바꾼 값(/api/site)을 쓰고,
 * 없으면 lib/site.ts 기본값. 각 라우트의 layout.tsx 가 title(템플릿 "%s · 소로우")·canonical·noindex 를 덧붙인다.
 */
export async function generateMetadata(): Promise<Metadata> {
  const s = await loadSiteSettings();
  const title = siteTitle(s);
  const description = siteDescription(s);
  const favicon = faviconHref(s);
  const og = ogHref(s);
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const naver = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION;
  return {
    metadataBase: new URL(SITE.url),
    title: { default: title, template: `%s · ${SITE.name}` },
    description,
    applicationName: SITE.name,
    keywords: [...SITE.keywords],
    authors: [{ name: SITE.fullName, url: SITE.url }],
    creator: SITE.fullName,
    publisher: SITE.fullName,
    category: "lifestyle",
    alternates: { canonical: "/" }, // 각 라우트 layout 이 자기 경로로 덮어쓴다
    manifest: "/manifest.webmanifest",
    icons: s.faviconAt
      ? { icon: [{ url: favicon }], shortcut: [{ url: favicon }], apple: [{ url: favicon }] }
      : {
          icon: [
            { url: "/favicon.svg", type: "image/svg+xml" },
            { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
          ],
          shortcut: [{ url: "/favicon.svg" }],
          apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
        },
    // openGraph.title/description 은 비워 두면 각 페이지의 제목·설명이 들어간다
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE.fullName,
      images: [{ url: og, width: 1200, height: 630, alt: `${SITE.fullName} · ${SITE.tagline}` }],
    },
    twitter: { card: "summary_large_image", images: [og] },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    verification: {
      google: google || undefined,
      other: naver ? { "naver-site-verification": naver } : undefined,
    },
    formatDetection: { telephone: false, email: false, address: false },
    appleWebApp: { capable: true, statusBarStyle: "default", title: SITE.name },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: SITE.themeLight },
    { media: "(prefers-color-scheme: dark)", color: SITE.themeDark },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await loadSiteSettings(); // 메타데이터와 같은 60초 캐시 및 연결 제한을 사용한다
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteTitle(s),
    alternateName: [SITE.name, "SOROW"],
    url: SITE.url,
    description: siteDescription(s),
    inLanguage: "ko-KR",
    publisher: {
      "@type": "Organization",
      name: SITE.fullName,
      url: SITE.url,
      logo: new URL(faviconHref(s), SITE.url).toString(),
    },
  };
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <AppRuntime />
        <AppToast />
        <ServiceAvailability>
          <CommunityConsent />
          <div className="app">
            {children}
            <TabBar />
          </div>
        </ServiceAvailability>
      </body>
    </html>
  );
}
