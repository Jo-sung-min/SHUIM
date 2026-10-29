"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBubble, IconPen, IconReels, IconSun, IconUser } from "./Icons";
import { loadNotifSeen } from "@/lib/storage";
import { fetchNotifications, unreadMessages } from "@/lib/social";
import { appPath } from "@/lib/routes";

/** 짧은 이름과 선택 표시를 함께 제공하는 앱 탐색. */
const TABS = [
  { href: "/", label: "홈", Icon: IconSun, match: (p: string) => p === "/" || p === "/summary" || p === "/flow" },
  { href: "/log", label: "기록", Icon: IconPen },
  { href: "/c/home", label: "외침", Icon: IconBubble, match: (p: string) => p === "/c" || ["/c/", "/shout", "/admin", "/ranking", "/fund"].some((x) => p.startsWith(x)) },
  { href: "/feed", label: "위로", Icon: IconReels },
  { href: "/me", label: "나", Icon: IconUser, match: (p: string) => ["/me", "/settings", "/memo", "/goals", "/schedule", "/auth", "/messages", "/u/", "/info", "/privacy", "/terms", "/account-deletion", "/blocks"].some((x) => p.startsWith(x)) },
];

export default function TabBar() {
  const path = appPath(usePathname());
  const [unread, setUnread] = useState(0);

  // 경로가 바뀔 때마다 읽지 않은 알림 수 갱신 (알림 전용 API: 커뮤니티 전체를 받지 않는다)
  useEffect(() => {
    let alive = true;
    if (["/auth", "/info", "/privacy", "/terms", "/account-deletion"].some((route) => path === route || path.startsWith(`${route}/`))) return;
    Promise.all([fetchNotifications(loadNotifSeen()).then((r) => r.unread).catch(() => 0), unreadMessages()])
      .then(([a, b]) => alive && setUnread(a + b))
      .catch(() => alive && setUnread(0));
    return () => {
      alive = false;
    };
  }, [path]);

  // 글쓰기·외침 글 화면은 아래에 자기 입력창(올리기·댓글)이 있어 탭바를 숨긴다
  if (path === "/write" || /^\/shout\/[^/]+$/.test(path) || /^\/c\/[^/]+\/(submit|admin)$/.test(path)) return null;

  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match ? match(path) : path.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
            <span className="tabbar-icon">
              <Icon strokeWidth={active ? 2.4 : 1.8} />
              {href === "/me" && unread > 0 && <span className="dot-badge" aria-label={`읽지 않은 알림 ${unread}개`} />}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
