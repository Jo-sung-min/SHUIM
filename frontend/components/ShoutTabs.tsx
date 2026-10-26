"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/shout", label: "외침" },
  { href: "/ranking", label: "불행 랭킹" },
  { href: "/fund", label: "불행 모금" },
];

/** 외침 영역 상단 탭 (외침 / 불행 랭킹 / 불행 모금). 블라인드처럼 글자 탭 + 선택된 탭 아래 밑줄 */
export default function ShoutTabs() {
  const path = usePathname();
  return (
    <nav className="ul-tabs" aria-label="외침 메뉴">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} className={path === t.href ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
