import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import TabBar from "@/components/TabBar";
import SponsorRails from "@/components/SponsorRails";
import AppRuntime from "@/components/AppRuntime";
import CommunityConsent from "@/components/CommunityConsent";
import ServiceAvailability from "@/components/ServiceAvailability";
import AppToast from "@/components/AppToast";
import NavProgress from "@/components/NavProgress";
import Splash from "@/components/Splash";
import { THEME_SCRIPT } from "@/lib/theme";
import InlineScript from "@/components/InlineScript";
import AitRuntime from "@/components/AitRuntime";
import EarlyClient from "@/components/EarlyClient";
import { IS_AIT } from "@/lib/ait";
import { SITE, faviconHref, loadSiteSettings, ogHref, siteDescription, siteTitle } from "@/lib/site";
import { ASSET_ORIGIN, assetUrl, publicAssetStyles } from "@/lib/assets";

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
            { url: assetUrl("/favicon.svg"), type: "image/svg+xml" },
            { url: assetUrl("/icon-192.png"), type: "image/png", sizes: "192x192" },
          ],
          shortcut: [{ url: assetUrl("/favicon.svg") }],
          apple: [{ url: assetUrl("/apple-icon.png"), sizes: "180x180", type: "image/png" }],
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
  // 앱인토스 미니앱은 지도 같은 경우가 아니면 확대·축소 제스처를 끈다 (출시 체크리스트)
  ...(IS_AIT ? { maximumScale: 1, userScalable: false } : {}),
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: SITE.themeLight },
    { media: "(prefers-color-scheme: dark)", color: SITE.themeDark },
  ],
};

/**
 * <script type="application/ld+json"> 안에 넣을 문자열. 관리자가 바꾸는 제목·설명이 </script>·<!-- 로 태그를 닫지 못하게
 * <, >, & 와 줄 구분자(U+2028·U+2029)를 \u 이스케이프로 바꾼다. JSON 으로 읽으면 같은 값이다 (Next JSON-LD 가이드)
 */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

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
    // data-theme 은 아래 인라인 스크립트가 첫 페인트 전에 붙인다 (React 가 그대로 두도록 suppressHydrationWarning)
    // 미니앱(data-ait)은 라이트 모드로 고정하고, 토스 내비게이션 바와 겹치는 자체 뒤로가기를 CSS 로 숨긴다
    <html lang="ko" data-ait={IS_AIT ? "" : undefined} data-theme={IS_AIT ? "light" : undefined} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
        {/* 그림·3D 파일은 모두 CDN 에서 온다: <img> 용(자격 증명 연결)과 WebGL·fetch 용(anonymous CORS 연결)을 미리 열어 둔다 */}
        <link rel="preconnect" href={ASSET_ORIGIN} />
        <link rel="preconnect" href={ASSET_ORIGIN} crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          // 버전이 고정된 파일이라 해시로 묶어 둔다: CDN 에서 내용이 바뀌면 브라우저가 적용하지 않는다 (글꼴만 기본 글꼴로)
          integrity="sha384-GIdEBaqGN9mNkDkMkzMHW8EKUqtpPIe/sLj1X7DIrnc9uPtLROJgmuDlh+3rBw0j"
          crossOrigin="anonymous"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      </head>
      <body style={publicAssetStyles as CSSProperties}>
        <EarlyClient />
        <AitRuntime />
        <Splash />
        <AppRuntime />
        <AppToast />
        <NavProgress />
        <ServiceAvailability>
          <CommunityConsent />
          <div className="app">
            {children}
            <TabBar />
          </div>
          <SponsorRails />
        </ServiceAvailability>
      </body>
    </html>
  );
}
