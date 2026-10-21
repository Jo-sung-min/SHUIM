import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** /robots.txt — 개인 화면·관리자·API 는 색인하지 않는다 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/me", "/messages", "/log", "/memo", "/goals", "/schedule", "/summary"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
