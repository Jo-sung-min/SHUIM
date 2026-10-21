import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** /sitemap.xml — 공개 화면만. 개인 기록 화면은 로그인 데이터라 넣지 않는다 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "daily" },
    { path: "/shout", priority: 0.9, changeFrequency: "hourly" },
    { path: "/feed", priority: 0.9, changeFrequency: "hourly" },
    { path: "/ranking", priority: 0.6, changeFrequency: "weekly" },
    { path: "/fund", priority: 0.5, changeFrequency: "weekly" },
    { path: "/auth", priority: 0.3, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
    { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
    { path: "/account-deletion", priority: 0.3, changeFrequency: "monthly" },
  ];
  return pages.map((p) => ({ url: `${SITE.url}${p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
}
