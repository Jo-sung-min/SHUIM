"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Account, currentUser, isAdmin, signOut } from "@/lib/auth";
import { clearAll, loadGoals, loadJournal, loadMemos, loadSchedule, seedSampleData, streak, todayKey } from "@/lib/storage";
import { HELP_LINES } from "@/lib/crisis";
import { TopBar } from "@/components/ui";
import { IconCalendar, IconCoin, IconFlag, IconNote, IconSettings, IconShield, IconTrophy, IconUser } from "@/components/Icons";

/** 나: 프로필 + 나머지 기능 아이콘 그리드 (인스타그램 프로필 탭처럼) */
export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [stats, setStats] = useState({ streak: 0, memos: 0, goals: 0, today: 0 });

  const reload = () => {
    setMe(currentUser());
    setAdmin(isAdmin());
    const j = loadJournal();
    const t = todayKey();
    setStats({
      streak: streak(j),
      memos: loadMemos().length,
      goals: loadGoals().filter((g) => !g.doneAt).length,
      today: loadSchedule().filter((s) => s.date === t && !s.done).length,
    });
  };
  useEffect(reload, []);

  if (me === undefined) return <TopBar title="나" />;

  const tiles = [
    { href: "/memo", label: "메모", Icon: IconNote, n: stats.memos },
    { href: "/goals", label: "목표", Icon: IconFlag, n: stats.goals },
    { href: "/schedule", label: "일정", Icon: IconCalendar, n: stats.today },
    { href: "/ranking", label: "랭킹", Icon: IconTrophy },
    { href: "/fund", label: "모금", Icon: IconCoin },
    { href: "/auth", label: me ? "계정" : "로그인", Icon: IconUser },
    ...(admin ? [{ href: "/admin", label: "관리자", Icon: IconShield }] : []),
  ];

  return (
    <>
      <TopBar
        title={me ? me.nick : "나"}
        right={
          <Link href="/auth" className="icon-btn" aria-label="계정 설정">
            <IconSettings />
          </Link>
        }
      />
      <div className="screen">
        <div className="profile">
          <Link href="/auth" className="avatar xl" aria-label={me ? "내 계정" : "로그인"}>
            {me ? me.nick.slice(0, 1) : <IconUser />}
          </Link>
          <div className="profile-stats">
            <div><b>{stats.streak}</b><small>연속</small></div>
            <div><b>{stats.memos}</b><small>메모</small></div>
            <div><b>{stats.goals}</b><small>목표</small></div>
          </div>
        </div>
        {!me && (
          <Link href="/auth" className="btn block sm" style={{ marginTop: 10 }}>로그인 · 회원가입</Link>
        )}

        <div className="me-grid">
          {tiles.map(({ href, label, Icon, n }) => (
            <Link key={href} href={href} className="me-tile">
              <span className="ico"><Icon /></span>
              <span className="lbl">{label}</span>
              {typeof n === "number" && n > 0 && <span className="n">{n}</span>}
            </Link>
          ))}
        </div>

        <div className="help-mini">
          {HELP_LINES.map((h) => (
            <a key={h.tel} href={`tel:${h.tel}`}>{h.name} <b>{h.tel}</b></a>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "center", gap: 14, marginTop: 24 }}>
          <button className="text-btn muted" onClick={() => { seedSampleData(); reload(); }}>샘플 채우기</button>
          <span className="tiny" style={{ color: "var(--border)" }}>|</span>
          <button
            className="text-btn muted"
            onClick={() => {
              if (!window.confirm("모든 기록·메모·목표·일정을 지울까요? 되돌릴 수 없어요.")) return;
              clearAll();
              reload();
            }}
          >
            전체 삭제
          </button>
          {me && (
            <>
              <span className="tiny" style={{ color: "var(--border)" }}>|</span>
              <button className="text-btn muted" onClick={() => { signOut(); router.refresh(); reload(); }}>로그아웃</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
