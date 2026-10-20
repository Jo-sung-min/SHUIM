"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/shout", label: "외침" },
  { href: "/ranking", label: "불행 랭킹" },
  { href: "/fund", label: "불행 모금" },
];

/** 외침 영역 상단 탭 (외침 / 불행 랭킹 / 불행 모금) */
export default function ShoutTabs() {
  const path = usePathname();
  return (
    <div className="segmented shout-tabs" role="tablist">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={path === t.href} className={path === t.href ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
