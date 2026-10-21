import type { MetadataRoute } from "next";
import { SITE, loadSiteSettings, siteDescription, siteTitle } from "@/lib/site";

/** /manifest.webmanifest — 홈 화면에 추가(PWA) 정보 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await loadSiteSettings();
  return {
    name: siteTitle(s),
    short_name: SITE.name,
    description: siteDescription(s),
    lang: "ko",
    id: "/",
    scope: "/",
    start_url: "/",
    categories: ["lifestyle", "productivity"],
    display: "standalone",
    background_color: SITE.themeLight,
    theme_color: SITE.themeLight,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
