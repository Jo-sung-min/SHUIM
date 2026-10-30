"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { IS_AIT } from "@/lib/ait";
import { appPath } from "@/lib/routes";

/** 소로우 = 미식·자취·싱글처럼 즐기는 일·살아가는 일로 모인 곳, 광장 = 누구나 바로 외치는 곳 */
const TABS = [
  { href: "/c/home", label: "소로우", match: (p: string) => p === "/c" || p.startsWith("/c/") },
  { href: "/shout", label: "광장", match: (p: string) => p === "/shout" },
  { href: "/ranking", label: "불행 랭킹", match: (p: string) => p === "/ranking" },
  { href: "/fund", label: "불행 모금", match: (p: string) => p === "/fund" },
].filter((t) => !IS_AIT || t.href !== "/fund"); // 미니앱: 결제처럼 보이는 모금 체험은 검수 오해를 피하려 뺀다

/**
 * 외침 영역 맨 위 (소로우 / 광장 / 불행 랭킹 / 불행 모금). 따로 제목 줄 없이 이 탭 줄이 화면 머리 역할을 한다.
 * 블라인드처럼 글자 탭 + 선택된 탭 아래 밑줄, 오른쪽에 화면별 버튼(right). 세 화면 모두 같은 높이에 있다.
 */
export default function ShoutTabs({ right }: { right?: ReactNode }) {
  const path = appPath(usePathname());
  const current = TABS.find((t) => t.match(path));
  return (
    <div className="ul-tabs">
      {current && <h1 className="sr-only">{current.label}</h1>}
      <nav aria-label="외침 메뉴">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined} className={t.match(path) ? "on" : ""}>
            {t.label}
          </Link>
        ))}
      </nav>
      {right && <div className="right">{right}</div>}
    </div>
  );
}
