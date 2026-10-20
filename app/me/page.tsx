"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Account, currentUser, isAdmin, signOut } from "@/lib/auth";
import {
  Profile,
  clearAll,
  formatPhone,
  loadGoals,
  loadJournal,
  loadMemos,
  loadNotifSeen,
  loadProfile,
  loadSchedule,
  markNotifSeen,
  saveProfile,
  seedSampleData,
  streak,
  todayKey,
} from "@/lib/storage";
import { Notification, listNotifications, loadCommunity } from "@/lib/community";
import { HELP_LINES } from "@/lib/crisis";
import { Segmented, Sheet, TopBar, fmtRelative } from "@/components/ui";
import { IconCalendar, IconCoin, IconFlag, IconMessage, IconNote, IconSettings, IconShield, IconTrophy, IconUser } from "@/components/Icons";

type View = "profile" | "notif";

/** 나: 프로필 + 알림 + 나머지 기능 아이콘 그리드 */
export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState<View>("profile");
  const [profile, setProfile] = useState<Profile>({ name: "", phone: "" });
  const [editing, setEditing] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [stats, setStats] = useState({ streak: 0, memos: 0, goals: 0, today: 0 });

  const reload = () => {
    setMe(currentUser());
    setAdmin(isAdmin());
    setProfile(loadProfile());
    const j = loadJournal();
    const t = todayKey();
    setStats({
      streak: streak(j),
      memos: loadMemos().length,
      goals: loadGoals().filter((g) => !g.doneAt).length,
      today: loadSchedule().filter((s) => s.date === t && !s.done).length,
    });
    setNotifs(listNotifications(loadCommunity(), loadNotifSeen()));
  };
  useEffect(reload, []);

  // 알림 탭을 열면 읽음 처리 (목록은 그대로, 배지만 사라짐)
  const openNotif = () => {
    setView("notif");
    markNotifSeen();
  };

  if (me === undefined) return <TopBar title="나" />;

  const unread = notifs.filter((n) => !n.read).length;
  const displayName = profile.name || me?.nick || "나";
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
        title={displayName}
        right={
          <Link href="/auth" className="icon-btn" aria-label="계정 설정">
            <IconSettings />
          </Link>
        }
      />
      <div className="screen">
        <div className="profile">
          <button className="avatar xl" aria-label="내 정보 수정" onClick={() => setEditing(true)}>
            {displayName !== "나" ? displayName.slice(0, 1) : <IconUser />}
          </button>
          <div className="profile-stats">
            <div><b>{stats.streak}</b><small>연속</small></div>
            <div><b>{stats.memos}</b><small>메모</small></div>
            <div><b>{stats.goals}</b><small>목표</small></div>
          </div>
        </div>
        <div className="profile-info">
          <span>{profile.name || "이름 없음"}</span>
          <span>·</span>
          <span>{profile.phone ? formatPhone(profile.phone) : "전화번호 없음"}</span>
          <button className="text-btn" onClick={() => setEditing(true)}>수정</button>
        </div>
        {!me && <Link href="/auth" className="btn block sm" style={{ marginTop: 8 }}>로그인 · 회원가입</Link>}

        <div style={{ marginTop: 14 }}>
          <Segmented
            value={view}
            onChange={(v) => (v === "notif" ? openNotif() : setView("profile"))}
            options={[
              { value: "profile", label: "내 공간" },
              { value: "notif", label: unread ? `알림 ${unread}` : "알림" },
            ]}
          />
        </div>

        {view === "profile" && (
          <>
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
          </>
        )}

        {view === "notif" && (
          <div className="stack" style={{ marginTop: 12, gap: 6 }}>
            {notifs.length === 0 ? (
              <div className="empty">
                <div className="ico">🔔</div>
                <b>아직 알림이 없어요</b>
                외침에 글을 쓰거나 위로 댓글을 남기면 답이 왔을 때 여기 모여요.
              </div>
            ) : (
              notifs.map((n) => (
                <Link key={n.id} href={`${n.postKind === "post" ? "/shout" : "/feed"}?post=${n.postId}`} className={`notif ${n.read ? "" : "unread"}`}>
                  <span className="avatar sm">{n.actorNick.slice(0, 1)}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="who">
                      <b>{n.actorNick}</b>
                      {n.kind === "comment_on_post" ? " 님이 내 글에 위로를 남겼어요" : " 님이 내가 위로한 글에 답했어요"}
                      <small>{fmtRelative(n.at)}</small>
                    </span>
                    <span className="msg">{n.text}</span>
                    <span className="ctx"><IconMessage style={{ width: 12, height: 12 }} /> {n.postText.slice(0, 40)}{n.postText.length > 40 ? "…" : ""}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <ProfileSheet
        key={editing ? "open" : "closed"}
        open={editing}
        profile={profile}
        onClose={() => setEditing(false)}
        onSave={(p) => {
          saveProfile(p);
          setProfile(loadProfile());
          setEditing(false);
        }}
      />
    </>
  );
}

function ProfileSheet({ open, profile, onClose, onSave }: { open: boolean; profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
  const digits = phone.replace(/\D/g, "");
  const phoneOk = digits.length === 0 || (digits.length >= 10 && digits.length <= 11);
  return (
    <Sheet open={open} onClose={onClose} title="내 정보">
      <div className="stack">
        <div className="field">
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" maxLength={20} autoFocus autoComplete="name" />
        </div>
        <div className="field">
          <label>전화번호</label>
          <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" autoComplete="tel" />
          {!phoneOk && <span className="tiny" style={{ color: "var(--down)" }}>숫자 10~11자리로 입력해요.</span>}
        </div>
        <div className="notice">이름과 전화번호는 이 기기(로그인했다면 이 계정)에만 저장돼요. 다른 사람에게 보이지 않아요.</div>
      </div>
      <div className="sheet-actions">
        <button className="btn ghost" onClick={onClose}>취소</button>
        <button className="btn" disabled={!phoneOk} onClick={() => onSave({ name, phone: digits })}>저장</button>
      </div>
    </Sheet>
  );
}
