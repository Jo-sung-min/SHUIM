"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconFlag, IconMegaphone, IconNote, IconPen, IconSun } from "./Icons";

const TABS = [
  { href: "/", label: "오늘의 나", Icon: IconSun },
  { href: "/log", label: "기록", Icon: IconPen },
  { href: "/memo", label: "메모", Icon: IconNote },
  { href: "/goals", label: "목표", Icon: IconFlag },
  { href: "/schedule", label: "일정", Icon: IconCalendar },
  { href: "/shout", label: "외침", Icon: IconMegaphone },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === "/" ? path === "/" || path === "/summary" : href === "/shout" ? path.startsWith("/shout") || path.startsWith("/admin") : path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon strokeWidth={active ? 2.3 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
