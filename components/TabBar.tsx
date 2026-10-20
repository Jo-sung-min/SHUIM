"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMegaphone, IconPen, IconReels, IconSun, IconUser } from "./Icons";
import { loadCommunity, unreadCount } from "@/lib/community";

/** 하단 탭 5개, 아이콘만 (인스타그램처럼). 나머지 기능은 "나" 페이지에서 */
const TABS = [
  { href: "/", label: "홈", Icon: IconSun, match: (p: string) => p === "/" || p === "/summary" },
  { href: "/log", label: "기록", Icon: IconPen },
  { href: "/shout", label: "외침", Icon: IconMegaphone, match: (p: string) => ["/shout", "/admin", "/ranking", "/fund"].some((x) => p.startsWith(x)) },
  { href: "/feed", label: "위로", Icon: IconReels },
  { href: "/me", label: "나", Icon: IconUser, match: (p: string) => ["/me", "/memo", "/goals", "/schedule", "/auth"].some((x) => p.startsWith(x)) },
];

export default function TabBar() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  // 경로가 바뀔 때마다 읽지 않은 알림 수 갱신 (나 페이지의 알림 탭을 열면 0이 됨)
  useEffect(() => {
    try {
      setUnread(unreadCount(loadCommunity()));
    } catch {
      setUnread(0);
    }
  }, [path]);

  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match ? match(path) : path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
            <Icon strokeWidth={active ? 2.4 : 1.7} />
            {href === "/me" && unread > 0 && <span className="dot-badge" aria-label={`읽지 않은 알림 ${unread}개`} />}
          </Link>
        );
      })}
    </nav>
  );
}
