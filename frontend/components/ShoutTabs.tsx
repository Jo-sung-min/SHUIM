"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/shout", label: "외침" },
  { href: "/ranking", label: "불행 랭킹" },
  { href: "/fund", label: "불행 모금" },
];

/**
 * 외침 영역 맨 위 (외침 / 불행 랭킹 / 불행 모금). 따로 제목 줄 없이 이 탭 줄이 화면 머리 역할을 한다.
 * 블라인드처럼 글자 탭 + 선택된 탭 아래 밑줄, 오른쪽에 화면별 버튼(right). 세 화면 모두 같은 높이에 있다.
 */
export default function ShoutTabs({ right }: { right?: ReactNode }) {
  const path = usePathname();
  const current = TABS.find((t) => t.href === path);
  return (
    <div className="ul-tabs">
      {current && <h1 className="sr-only">{current.label}</h1>}
      <nav aria-label="외침 메뉴">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} className={path === t.href ? "on" : ""}>
            {t.label}
          </Link>
        ))}
      </nav>
      {right && <div className="right">{right}</div>}
    </div>
  );
}
