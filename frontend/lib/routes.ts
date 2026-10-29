"use client";

import { useParams, useSearchParams } from "next/navigation";
import { IS_AIT } from "./ait";
import { PLACEHOLDER_PARAM } from "./route-placeholder";

/**
 * 동적 경로(/c/[slug], /u/[id], /shout/[id], /messages/[id] 와 그 하위)를 미니앱 정적 번들에서도 열리게 한다.
 * 정적 번들에는 주소별 파일이 없어, 자리표시 페이지 하나(`_`)만 만들고 값은 쿼리로 넘긴다.
 *   웹:     /c/korea-univ/submit
 *   미니앱: /c/_/submit/?slug=korea-univ
 * 링크는 route() 를 거치고, 페이지는 useRouteParam() 으로 값을 읽는다. 웹에서는 둘 다 지금 주소 그대로다.
 */
export const PLACEHOLDER = PLACEHOLDER_PARAM;

const PATTERNS: { re: RegExp; name: string; skip?: string[] }[] = [
  { re: /^\/c\/([^/]+)(\/(?:admin|submit))?\/?$/, name: "slug", skip: ["home", "new", "submissions"] },
  { re: /^\/u\/([^/]+)(\/(?:listeners|listening))?\/?$/, name: "id" },
  { re: /^\/shout\/([^/]+)()\/?$/, name: "id" },
  { re: /^\/messages\/([^/]+)()\/?$/, name: "id" },
];

/** 앱 안 경로를 이 빌드에서 열리는 주소로 */
export function route(href: string): string {
  if (!IS_AIT) return href;
  const [, path = href, query = "", hash = ""] = /^([^?#]*)(?:\?([^#]*))?(#.*)?$/.exec(href) ?? [];
  for (const p of PATTERNS) {
    const m = p.re.exec(path);
    if (!m || m[1] === PLACEHOLDER || p.skip?.includes(m[1])) continue;
    const head = path.split("/")[1];
    const params = new URLSearchParams(query);
    params.set(p.name, decodeURIComponent(m[1]));
    return `/${head}/${PLACEHOLDER}${m[2] ?? ""}/?${params}${hash}`;
  }
  return href;
}

/** usePathname() 값을 웹과 같은 모양으로: 미니앱 빌드(trailingSlash)의 끝 슬래시를 뗀다 */
export function appPath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** [slug]·[id] 값. 미니앱의 자리표시 페이지에서는 쿼리에서 읽는다 */
export function useRouteParam(name: string): string {
  const params = useParams<Record<string, string | string[]>>();
  const search = useSearchParams();
  const value = params?.[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (IS_AIT && raw === PLACEHOLDER) return search.get(name) ?? "";
  return raw ?? "";
}
